// Vercel serverless function. No dependencies, no build step.
// Vercel's edge network stamps every request with the visitor's geo headers,
// so the country is resolved from the IP without any third party seeing it.
module.exports = (req, res) => {
  const h = req.headers || {};
  const country = (h['x-vercel-ip-country'] || '').toUpperCase();
  let city = '';
  try {
    city = decodeURIComponent(h['x-vercel-ip-city'] || '');
  } catch (e) {
    city = h['x-vercel-ip-city'] || '';
  }

  // Cached at the edge per-country, never in a shared public cache.
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify({ country: country, city: city }));
};
