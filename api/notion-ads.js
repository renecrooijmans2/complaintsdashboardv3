// Vercel serverless function — looks the product up in the two ad databases and
// returns: ad videos, competitor page, competitor ads, and variant photos
// (variant photos = your sourcing goldmine for finding a better factory on 1688/Taobao).
// Requires env var NOTION_API_KEY; integration must be connected to both databases.
const SOURCES = [
  { ds: "3822916b-2461-8134-990a-000b5ea8c09d", db: "3822916b24618069b7a3dfa9ba1e2861" },
  { ds: "2f72916b-2461-818a-a5aa-000bd163c39e", db: "2f72916b246180269db3d9fa26ab7a69" },
];
const STORE_URL_PROP = {
  "Clarendale": "🇺🇸 Clarendale",
  "Lark & Clover": "🇺🇸 Lark & clover", // lowercase c in Notion
};
const fileUrls = (p) =>
  (p && Array.isArray(p.files) ? p.files : [])
    .map((f) => (f.type === "file" ? f.file?.url : f.type === "external" ? f.external?.url : null))
    .filter(Boolean);

export default async function handler(req, res) {
  const key = process.env.NOTION_API_KEY;
  if (!key) return res.status(500).json({ error: "NOTION_API_KEY not set" });
  const { handle, store } = req.query || {};
  const prop = STORE_URL_PROP[store];
  if (!handle || !prop) return res.status(400).json({ error: "handle and valid store required" });

  const body = JSON.stringify({ filter: { property: prop, url: { contains: String(handle) } }, page_size: 25 });
  const call = (url, version) =>
    fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Notion-Version": version, "Content-Type": "application/json" }, body });

  try {
    for (const src of SOURCES) {
      let r = await call(`https://api.notion.com/v1/data_sources/${src.ds}/query`, "2025-09-03");
      let j = await r.json();
      if (!r.ok) { r = await call(`https://api.notion.com/v1/databases/${src.db}/query`, "2022-06-28"); j = await r.json(); }
      if (!r.ok) continue;
      // "contains" can match the wrong row (short handles are substrings of longer ones).
      // Prefer an EXACT /products/<handle> match; fall back to the first candidate, flagged as fuzzy.
      const want = ("/products/" + String(handle)).toLowerCase();
      const norm = (v) => { let x = String(v || "").toLowerCase().trim().split("#")[0].split("?")[0].replace(/\/+$/, ""); try { x = decodeURIComponent(x); } catch (e) { /* keep raw */ } return x; };
      const rowHandle = (pg) => (norm(pg.properties?.[prop]?.url).match(/\/products\/([^/]+)$/) || [])[1] || "";
      const results = j.results || [];
      let page = results.find((pg) => norm(pg.properties?.[prop]?.url).endsWith(want));
      let fuzzy = false;
      if (!page && results.length > 0) {
        // pick the candidate whose handle shares the most leading characters with ours — not just the first hit
        const target = String(handle).toLowerCase();
        let best = null, bestScore = -1;
        for (const pg of results) {
          const rh = rowHandle(pg);
          let score = 0;
          while (score < Math.min(rh.length, target.length) && rh[score] === target[score]) score++;
          if (score > bestScore) { bestScore = score; best = pg; }
        }
        page = best; fuzzy = true;
      }
      if (!page) continue;
      const titleProp = Object.values(page.properties || {}).find((p2) => p2.type === "title");
      const matchedTitle = titleProp?.title?.map((t) => t.plain_text).join("").slice(0, 60) || null;
      const p = page.properties || {};
      res.setHeader("Cache-Control", "s-maxage=1200");
      return res.status(200).json({
        found: true,
        fuzzy: fuzzy,
        matchedTitle: fuzzy ? matchedTitle : null,
        notionUrl: page.url || null,
        adVideos: fileUrls(p["🎞️ Ads"]).slice(0, 4),
        competitorUrl: p["🏢 Competitor"]?.url || null,
        competitorAds: fileUrls(p["🎞️ Competitor ads"]).slice(0, 2),
        variantPhotos: fileUrls(p["📷 Variant photos"]).slice(0, 8),
      });
    }
    return res.status(200).json({ found: false });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
