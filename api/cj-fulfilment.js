// Vercel serverless function — lists every product title in the Notion database
// "🟠 Products switched to CJ". A product whose title appears here is fulfilled
// by CJ; everything else defaults to WIIO (grey tag in the focus view).
// Requires env var NOTION_API_KEY, and the Notion integration must be connected
// to the "Products switched to CJ" database (••• → Connections).
const CJ_DB_ID = "3a62916b24618033ab30f8c5f26451a4";
const CJ_DS_ID = "9712916b-2461-8350-9d62-8746ff3f9918";

export default async function handler(req, res) {
  const key = process.env.NOTION_API_KEY;
  if (!key) return res.status(500).json({ error: "NOTION_API_KEY not set in Vercel env" });

  const call = (url, version, body) =>
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Notion-Version": version, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  try {
    const products = [];
    let cursor = undefined;
    for (let page = 0; page < 10; page++) {
      const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
      // Modern API (data sources) first — required since Notion's 2025 multi-source update.
      let r = await call(`https://api.notion.com/v1/data_sources/${CJ_DS_ID}/query`, "2025-09-03", body);
      let j = await r.json();
      if (!r.ok) {
        r = await call(`https://api.notion.com/v1/databases/${CJ_DB_ID}/query`, "2022-06-28", body);
        j = await r.json();
      }
      if (!r.ok) return res.status(502).json({ error: j.message || "Notion API error" });
      for (const pg of j.results || []) {
        const props = pg.properties || {};
        const titleProp = props.Product || Object.values(props).find((p) => p.type === "title");
        const title = (titleProp?.title || []).map((t) => t.plain_text).join("").trim();
        if (title) products.push(title);
      }
      if (!j.has_more) break;
      cursor = j.next_cursor;
    }
    res.setHeader("Cache-Control", "s-maxage=1800");
    return res.status(200).json({ products });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
