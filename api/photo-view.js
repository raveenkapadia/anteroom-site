// GET /api/photo-view?id=123 — the bytes of one submitted photograph.
//
// The blob store is private, so there is no URL that opens a guest's
// photograph. This is the only way to see one, and it needs the admin token.
// The id is looked up in the database rather than taking a path from the
// query string, so a caller cannot ask for an arbitrary object in the store.
const { get } = require('@vercel/blob');
const L = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return L.json(res, 405, { error: 'Use GET' });

  if (!L.authorised(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return L.json(res, 401, { error: 'Not authorised.' });
  }

  // Vercel populates req.query, but parse the URL too so this does not depend
  // on that being true.
  let raw = req.query && req.query.id;
  if (raw == null) {
    try { raw = new URL(req.url, 'http://x').searchParams.get('id'); } catch (e) { raw = null; }
  }
  const id = parseInt(raw || '', 10);
  if (!id) return L.json(res, 400, { error: 'Which photograph?' });

  let path;
  try {
    const rows = await L.sql()`select photo_path from leads where id = ${id}`;
    if (!rows.length || !rows[0].photo_path) return L.json(res, 404, { error: 'No photograph on that lead.' });
    path = rows[0].photo_path;
  } catch (e) {
    console.error('photo lookup failed', e && e.message);
    return L.json(res, 500, { error: 'Could not look that up.' });
  }

  try {
    const found = await get(path, { access: 'private' });
    if (!found || !found.stream) return L.json(res, 404, { error: 'That photograph is no longer in the store.' });

    const chunks = [];
    for await (const chunk of found.stream) chunks.push(Buffer.from(chunk));
    const buf = Buffer.concat(chunks);

    res.setHeader('Content-Type', found.blob.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    // Private, and never stored by a shared cache or written to disk.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(buf);
  } catch (e) {
    console.error('photo read failed', e && e.message);
    return L.json(res, 500, { error: 'Could not read that photograph.' });
  }
};
