// Vercel serverless function — pulls factory QC photos + size chart from the
// Notion backend database "1. USA - Back end" (5+ sales quality control page).
// Requires env var NOTION_API_KEY (Vercel → Settings → Environment Variables).
// The Notion integration must be connected to that page (••• → Connections).
const NOTION_DB_ID = "2ee2916b2461814f8a4fcc6830d96592";       // database block
const NOTION_DS_ID = "2ee2916b2461812abb65000b25e599ef";       // data source (preferred)
// Per-store product-ID property in Notion. NB: property names must match EXACTLY.
const ID_PROPS = {
  "Clarendale": "ID Clarendale",
  "Lark & Clover": "ID Lark & Clover",
  "Lume Haven": "ID Lume Haven",
};
// File property names ("图片 QC " has a TRAILING SPACE in Notion — keep it).
const QC_PROP = "图片 QC ";
const SIZE_PROP = "尺码表 Size";
const UPDATED_SIZE_PROP = "Updated sizechart";
const FEEDBACK_PROP = "反馈 Feedback";

function fileUrls(prop) {
  if (!prop || !Array.isArray(prop.files)) return [];
  return prop.files
    .map((f) => (f.type === "file" ? f.file?.url : f.type === "external" ? f.external?.url : null))
    .filter(Boolean);
}

export default async function handler(req, res) {
  const key = process.env.NOTION_API_KEY;
  if (!key) return res.status(500).json({ error: "NOTION_API_KEY not set in Vercel env" });
  const { pid, store } = req.query || {};
  const idProp = ID_PROPS[store];
  if (!pid || !idProp) return res.status(400).json({ error: "pid and valid store required" });

  const body = JSON.stringify({
    filter: { property: idProp, number: { equals: Number(pid) } },
    page_size: 1,
  });
  const call = (url, version) =>
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Notion-Version": version, "Content-Type": "application/json" },
      body,
    });
  try {
    // Modern API (data sources) first — required since Notion's 2025 multi-source update.
    let r = await call(`https://api.notion.com/v1/data_sources/${NOTION_DS_ID}/query`, "2025-09-03");
    let j = await r.json();
    if (!r.ok) {
      // Fallback: classic databases endpoint
      r = await call(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, "2022-06-28");
      j = await r.json();
    }
    if (!r.ok) return res.status(502).json({ error: j.message || "Notion API error" });
    const page = (j.results || [])[0];
    if (!page) return res.status(200).json({ found: false });
    const p = page.properties || {};
    // Notion-hosted file URLs expire after ~1 hour — cache briefly only.
    res.setHeader("Cache-Control", "s-maxage=1200");
    return res.status(200).json({
      found: true,
      notionUrl: page.url || null,
      qcImages: fileUrls(p[QC_PROP]).slice(0, 8),
      sizeChart: fileUrls(p[SIZE_PROP])[0] || null,
      updatedSizeChart: fileUrls(p[UPDATED_SIZE_PROP])[0] || null,
      feedback: (p[FEEDBACK_PROP]?.rich_text || []).map((t) => t.plain_text).join("") || null,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
