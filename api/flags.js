// Vercel serverless function — the "Flagged" workflow: flag/unflag a product and
// keep a note thread between Amber and René. Backed by the Notion database
// "🚩 Complaints dashboard flags" (child of the Customer service page); one row
// per message, a row with an empty Message is the flag marker, unflagging
// archives every row for the product.
//
// GET  ?store=<name>                                        → { flags: { [key]: { product, messages: [{who,text,ts}] } } }
// POST { action: "flag",    key, product, store }           → { ok }
// POST { action: "message", key, product, store, who, text }→ { ok, ts }
// POST { action: "unflag",  key, store }                    → { ok, archived }
const FLAGS_DB_ID = "b490e07089a5435d81805393408990f1";

export const config = { maxDuration: 30 };

const headers = (key) => ({ Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" });
// rich_text chunks — Notion caps one text item at 2000 chars
const rt = (s) => {
  const out = [], str = String(s || "");
  if (!str) return [];
  for (let i = 0; i < str.length && out.length < 20; i += 1900) out.push({ text: { content: str.slice(i, i + 1900) } });
  return out;
};
const plain = (p) => ((p && (p.rich_text || p.title)) || []).map((t) => t.plain_text).join("");

async function queryAll(key, filter) {
  const rows = [];
  let cursor;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://api.notion.com/v1/databases/${FLAGS_DB_ID}/query`, {
      method: "POST", headers: headers(key),
      body: JSON.stringify({ filter, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || "Notion query failed");
    rows.push(...(j.results || []));
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return rows;
}

export default async function handler(req, res) {
  const key = process.env.NOTION_API_KEY;
  if (!key) return res.status(500).json({ error: "NOTION_API_KEY not set in Vercel env" });
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const store = String((req.query || {}).store || "").trim();
      if (!store) return res.status(400).json({ error: "store required" });
      const rows = await queryAll(key, { property: "Store", rich_text: { equals: store } });
      rows.sort((a, b) => String(a.created_time).localeCompare(String(b.created_time)));
      const flags = {};
      for (const pg of rows) {
        const p = pg.properties || {};
        const k = plain(p.Key);
        if (!k) continue;
        if (!flags[k]) flags[k] = { product: plain(p.Product), messages: [] };
        const text = plain(p.Message);
        if (text) flags[k].messages.push({ who: plain(p.Who) || "?", text, ts: pg.created_time });
      }
      return res.status(200).json({ flags });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });
    const { action, key: pkey, product, store, who, text } = req.body || {};
    if (!pkey || !store) return res.status(400).json({ error: "key and store required" });

    if (action === "flag" || action === "message") {
      if (action === "message" && !String(text || "").trim()) return res.status(400).json({ error: "text required" });
      const r = await fetch("https://api.notion.com/v1/pages", {
        method: "POST", headers: headers(key),
        body: JSON.stringify({
          parent: { database_id: FLAGS_DB_ID },
          properties: {
            Product: { title: rt(product || pkey) },
            Key: { rich_text: rt(pkey) },
            Store: { rich_text: rt(store) },
            Who: { rich_text: rt(action === "message" ? who || "?" : "") },
            Message: { rich_text: rt(action === "message" ? String(text).slice(0, 6000) : "") },
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) return res.status(502).json({ error: j.message || "Notion create failed" });
      return res.status(200).json({ ok: true, ts: j.created_time });
    }

    if (action === "unflag") {
      const rows = await queryAll(key, {
        and: [
          { property: "Key", rich_text: { equals: String(pkey) } },
          { property: "Store", rich_text: { equals: String(store) } },
        ],
      });
      for (const pg of rows) {
        await fetch(`https://api.notion.com/v1/pages/${pg.id}`, {
          method: "PATCH", headers: headers(key),
          body: JSON.stringify({ archived: true }),
        });
      }
      return res.status(200).json({ ok: true, archived: rows.length });
    }

    return res.status(400).json({ error: "action must be flag, message, or unflag" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
