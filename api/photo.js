// POST /api/photo — the free demo from /send-one-photograph.
//
// The image arrives as a raw binary body with the details in headers, not as
// multipart and not as base64. Multipart would need a parser dependency;
// base64 would inflate the payload by a third against a hard 4.5 MB platform
// limit. The browser downscales before sending, so what lands here is already
// web-sized. See send-one-photograph.html.
const { put } = require('@vercel/blob');
const L = require('./_lib');

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX = 4 * 1024 * 1024;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.json(res, 405, { error: 'Use POST' });

  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = ALLOWED[type];
  if (!ext) return L.json(res, 415, { error: 'Send a JPEG, PNG or WebP.' });

  // Honeypot travels in a header here, since there is no JSON body to hide it in.
  if (String(req.headers['x-company'] || '').trim()) return L.json(res, 200, { ok: true });

  const email = L.cleanEmail(req.headers['x-email']);
  if (!email) return L.json(res, 400, { error: 'That email address does not look right.' });

  const property = L.text(decodeURIComponent(String(req.headers['x-property'] || '')), 200);

  const ipHash = L.hashIp(req);
  if (await L.tooMany(ipHash, 3)) {
    return L.json(res, 429, { error: 'That is a few photographs already. Email us and we will take a look.' });
  }

  let buf;
  try {
    buf = await L.rawBody(req);
  } catch (e) {
    return L.json(res, 413, { error: 'That file is too big. Try one under 4 MB.' });
  }
  if (!buf || buf.length < 1024) return L.json(res, 400, { error: 'That file did not arrive. Try again.' });
  if (buf.length > MAX) return L.json(res, 413, { error: 'That file is too big. Try one under 4 MB.' });

  // Trust the bytes, not the header. A file claiming to be a JPEG while
  // starting with something else does not get written to storage.
  const sig = buf.slice(0, 12);
  const looksJpeg = sig[0] === 0xFF && sig[1] === 0xD8;
  const looksPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4E && sig[3] === 0x47;
  const looksWebp = sig.slice(0, 4).toString('ascii') === 'RIFF' && sig.slice(8, 12).toString('ascii') === 'WEBP';
  if (!(looksJpeg || looksPng || looksWebp)) {
    return L.json(res, 415, { error: 'That does not look like an image file.' });
  }

  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const rand = Math.random().toString(36).slice(2, 10);
    // Private store. The returned url is not openable without credentials, so
    // what goes in the database is the pathname; /api/photo-view serves it.
    const blob = await put('submissions/' + stamp + '/' + rand + '.' + ext, buf, {
      access: 'private',
      contentType: type,
      addRandomSuffix: true
    });

    const rows = await L.sql()`
      insert into leads (kind, property, email, photo_path, photo_bytes,
                         source_country, user_agent, ip_hash)
      values ('photo', ${property}, ${email}, ${blob.pathname}, ${buf.length},
              ${L.country(req)}, ${L.text(req.headers['user-agent'], 300)}, ${ipHash})
      returning id`;

    const id = rows[0].id;

    // No photo link in the email. The store is private, and an email is the
    // last place to put a credential that would open it.
    await L.notify('Free demo photo — ' + (property || email), [
      'Property: ' + (property || '—'),
      'Email:    ' + email,
      'Size:     ' + Math.round(buf.length / 1024) + ' KB',
      '',
      'The photograph is on /admin, lead #' + id + '. Two working days to reply.'
    ]);

    return L.json(res, 200, { ok: true, id: id });
  } catch (e) {
    console.error('photo submit failed', e && e.message);
    return L.json(res, 500, { error: 'We could not save that. Please email the photograph instead.' });
  }
};
