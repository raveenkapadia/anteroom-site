// GET  /api/leads      — the list, for /admin
// PATCH /api/leads      — update one lead's status or notes
// Both require the ADMIN_TOKEN bearer header.
const L = require('./_lib');

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

module.exports = async (req, res) => {
  if (!L.authorised(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return L.json(res, 401, { error: 'Not authorised.' });
  }

  if (req.method === 'GET') {
    try {
      const rows = await L.sql()`
        select id, created_at, updated_at, kind, property, contact_name, email, phone,
               audience, plan, languages, message, photo_bytes,
               (photo_path is not null) as has_photo,
               source_country, currency, status, notes
        from leads
        order by created_at desc
        limit 500`;
      return L.json(res, 200, { leads: rows });
    } catch (e) {
      console.error('leads read failed', e && e.message);
      return L.json(res, 500, { error: 'Could not read the leads.' });
    }
  }

  if (req.method === 'PATCH') {
    let body;
    try {
      body = await L.readJson(req);
    } catch (e) {
      return L.json(res, 400, { error: 'Could not read that.' });
    }

    const id = parseInt(body.id, 10);
    if (!id) return L.json(res, 400, { error: 'Which lead?' });

    const status = body.status == null ? null : String(body.status);
    if (status !== null && STATUSES.indexOf(status) === -1) {
      return L.json(res, 400, { error: 'Unknown status.' });
    }
    const notes = body.notes == null ? null : String(body.notes).slice(0, 4000);

    try {
      const rows = await L.sql()`
        update leads
        set status = coalesce(${status}, status),
            notes  = coalesce(${notes}, notes)
        where id = ${id}
        returning id, status, notes, updated_at`;
      if (!rows.length) return L.json(res, 404, { error: 'No such lead.' });
      return L.json(res, 200, { ok: true, lead: rows[0] });
    } catch (e) {
      console.error('lead update failed', e && e.message);
      return L.json(res, 500, { error: 'Could not save that.' });
    }
  }

  return L.json(res, 405, { error: 'Use GET or PATCH' });
};
