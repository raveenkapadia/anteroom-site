// Shared helpers for the ANTEROOM lead functions.
// Files prefixed with _ are not routed by Vercel, so this is never reachable.
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

let _sql = null;
function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

function json(res, code, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).send(JSON.stringify(body));
}

// Read the request body as a Buffer. Vercel hands us a Buffer for binary
// content types and a parsed object for JSON, so handle both.
function rawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === 'string') return resolve(Buffer.from(req.body));
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 6 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const buf = await rawBody(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

// --- validation -------------------------------------------------------------

// Deliberately permissive. The job is to reject obvious rubbish, not to
// adjudicate the email RFC — a real address that fails a clever regex is a
// lost lead, which costs far more than a bad row.
function cleanEmail(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (s.length < 5 || s.length > 254) return null;
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s)) return null;
  return s;
}

function text(v, max) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, max || 500);
}

// --- request context --------------------------------------------------------

function clientIp(req) {
  const f = req.headers['x-forwarded-for'];
  if (f) return String(f).split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
}

// We never store a raw IP. The hash is only ever compared to other hashes,
// for rate limiting, and is salted so it cannot be reversed by guessing.
function hashIp(req) {
  const salt = process.env.IP_SALT || 'anteroom';
  return crypto.createHash('sha256').update(salt + '|' + clientIp(req)).digest('hex').slice(0, 32);
}

function country(req) {
  return String(req.headers['x-vercel-ip-country'] || '').toUpperCase() || null;
}

// --- abuse control ----------------------------------------------------------

// Postgres is the rate limiter. At this volume that is entirely adequate and
// it saves standing up a Redis instance for the sake of a counter.
async function tooMany(ipHash, perHour) {
  try {
    const rows = await sql()`
      select count(*)::int as n from leads
      where ip_hash = ${ipHash} and created_at > now() - interval '1 hour'`;
    return rows[0].n >= (perHour || 5);
  } catch (e) {
    return false; // never block a real lead because the counter failed
  }
}

// A hidden field no human ever sees. Bots fill everything in.
function isBot(body) {
  return !!(body && typeof body.company === 'string' && body.company.trim());
}

// --- notification -----------------------------------------------------------

// Best effort. A lead is already safely in the database by the time this runs,
// so a failure here is logged and swallowed rather than surfaced to the user.
async function notify(subject, lines) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  const from = process.env.NOTIFY_FROM;
  if (!key || !to || !from) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from,
        to: [to],
        subject: subject,
        text: lines.filter(Boolean).join('\n')
      })
    });
  } catch (e) {
    console.error('notify failed', e && e.message);
  }
}

// --- admin auth -------------------------------------------------------------

function authorised(req) {
  const want = process.env.ADMIN_TOKEN;
  if (!want || want.length < 16) return false;
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (got.length !== want.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  } catch (e) {
    return false;
  }
}

module.exports = {
  sql, json, rawBody, readJson,
  cleanEmail, text,
  hashIp, country, tooMany, isBot,
  notify, authorised
};
