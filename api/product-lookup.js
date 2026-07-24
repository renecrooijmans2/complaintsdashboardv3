// Vercel serverless function — finds the product URL + first image on the storefront.
// Uses Shopify's public search suggest endpoint (deterministic, free, no AI needed).
// Proxied server-side because storefronts don't send CORS headers.
const ALLOWED_TLDS = /\.(com|co|nl|shop|store|net)$/i;

export default async function handler(req, res) {
  const { domain, q } = req.query || {};
  if (!domain || !q) return res.status(400).json({ error: "domain and q required" });
  const clean = String(domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+$/i.test(clean) || !ALLOWED_TLDS.test(clean)) {
    return res.status(400).json({ error: "invalid domain" });
  }
  try {
    const url =
      `https://${clean}/search/suggest.json?q=${encodeURIComponent(q)}` +
      `&resources[type]=product&resources[limit]=1&resources[options][unavailable_products]=show`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (dashboard)" } });
    if (!r.ok) return res.status(200).json({});
    const j = await r.json();
    const p = j?.resources?.results?.products?.[0];
    if (!p) return res.status(200).json({});
    res.setHeader("Cache-Control", "s-maxage=86400");
    return res.status(200).json({
      url: p.url ? `https://${clean}${p.url}` : null,
      image: p.image || p.featured_image?.url || null,
      title: p.title || null,
    });
  } catch (e) {
    return res.status(200).json({});
  }
}
