// POST /api/lead — a completed brief from /start-a-brief.
const L = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.json(res, 405, { error: 'Use POST' });

  let body;
  try {
    body = await L.readJson(req);
  } catch (e) {
    return L.json(res, 400, { error: 'Could not read that.' });
  }

  // Accept silently so the bot believes it succeeded and does not retry.
  if (L.isBot(body)) return L.json(res, 200, { ok: true });

  const email = L.cleanEmail(body.email);
  if (!email) return L.json(res, 400, { error: 'That email address does not look right.' });

  const ipHash = L.hashIp(req);
  if (await L.tooMany(ipHash, 5)) {
    return L.json(res, 429, { error: 'That is a lot of briefs at once. Email us instead and we will pick it up.' });
  }

  try {
    const rows = await L.sql()`
      insert into leads (kind, property, contact_name, email, phone, audience, plan, languages, message,
                         source_country, currency, user_agent, ip_hash)
      values ('brief',
              ${L.text(body.property, 200)},
              ${L.text(body.name, 120)},
              ${email},
              ${L.text(body.phone, 40)},
              ${L.text(body.audience, 120)},
              ${L.text(body.plan, 120)},
              ${L.text(Array.isArray(body.languages) ? body.languages.join(', ') : body.languages, 400)},
              ${L.text(body.message, 4000)},
              ${L.country(req)},
              ${L.text(body.currency, 8)},
              ${L.text(req.headers['user-agent'], 300)},
              ${ipHash})
      returning id`;

    const id = rows[0].id;

    await L.notify('New brief — ' + (L.text(body.property, 200) || email), [
      'Property:  ' + (L.text(body.property, 200) || '—'),
      'Name:      ' + (L.text(body.name, 120) || '—'),
      'Email:     ' + email,
      'Phone:     ' + (L.text(body.phone, 40) || '—'),
      'Audience:  ' + (L.text(body.audience, 120) || '—'),
      'Plan:      ' + (L.text(body.plan, 120) || '—'),
      'Languages: ' + (L.text(Array.isArray(body.languages) ? body.languages.join(', ') : body.languages, 400) || 'English only'),
      '',
      L.text(body.message, 4000) || '',
      '',
      'Lead #' + id
    ]);

    return L.json(res, 200, { ok: true, id: id });
  } catch (e) {
    console.error('lead insert failed', e && e.message);
    return L.json(res, 500, { error: 'We could not save that. Please email us and we will pick it up.' });
  }
};
