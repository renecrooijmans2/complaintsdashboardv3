// Vercel serverless function — replace or delete a factory QC photo straight
// from the complaints dashboard. Writes to the same Notion row api/notion-qc.js
// reads from ("1. USA - Back end", property "图片 QC " — trailing space intended).
//
// POST { pid, store, action: "delete" | "replace", index, filename?, dataUrl? }
//  - delete : removes the photo at `index` from the files property
//  - replace: uploads dataUrl via Notion's File Upload API and swaps it in at `index`
//
// Notes: existing Notion-hosted files are preserved by re-sending their file
// objects untouched. Client downscales big images; Vercel caps bodies at ~4.5 MB.
const NOTION_DB_ID = "2ee2916b2461814f8a4fcc6830d96592";
const NOTION_DS_ID = "2ee2916b2461812abb65000b25e599ef";
const ID_PROPS = {
  "Clarendale": "ID Clarendale",
  "Lark & Clover": "ID Lark & Clover",
  "Lume Haven": "ID Lume Haven",
};
const QC_PROP = "图片 QC ";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.NOTION_API_KEY;
  if (!key) return res.status(500).json({ error: "NOTION_API_KEY not set in Vercel env" });

  const { pid, store, action, index, filename, dataUrl } = req.body || {};
  const idProp = ID_PROPS[store];
  if (!pid || !idProp) return res.status(400).json({ error: "pid and valid store required" });
  if (action !== "delete" && action !== "replace") return res.status(400).json({ error: "action must be delete or replace" });
  if (typeof index !== "number" || index < 0) return res.status(400).json({ error: "index required" });
  if (action === "replace" && !dataUrl) return res.status(400).json({ error: "dataUrl required for replace" });

  const headers = (version) => ({
    Authorization: `Bearer ${key}`,
    "Notion-Version": version,
    "Content-Type": "application/json",
  });

  try {
    // 1. Find the Notion page for this product (same lookup as notion-qc.js).
    const qBody = JSON.stringify({ filter: { property: idProp, number: { equals: Number(pid) } }, page_size: 1 });
    let r = await fetch(`https://api.notion.com/v1/data_sources/${NOTION_DS_ID}/query`, { method: "POST", headers: headers("2025-09-03"), body: qBody });
    let j = await r.json();
    if (!r.ok) {
      r = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, { method: "POST", headers: headers("2022-06-28"), body: qBody });
      j = await r.json();
    }
    if (!r.ok) return res.status(502).json({ error: j.message || "Notion query failed" });
    const page = (j.results || [])[0];
    if (!page) return res.status(404).json({ error: `no Notion row matches ID ${pid}` });

    // 2. Current files, rebuilt as writable objects (Notion-hosted files must be
    //    re-sent with their url + expiry_time to be preserved).
    const current = (page.properties?.[QC_PROP]?.files || []).map((f) => {
      if (f.type === "external") return { name: f.name, type: "external", external: { url: f.external?.url } };
      if (f.type === "file") return { name: f.name, type: "file", file: { url: f.file?.url, expiry_time: f.file?.expiry_time } };
      return null;
    }).filter(Boolean);
    if (index >= current.length) return res.status(400).json({ error: `index ${index} out of range (${current.length} photos)` });

    let files;
    if (action === "delete") {
      files = current.filter((_, i) => i !== index);
    } else {
      // 3. Upload the replacement through Notion's File Upload API.
      const m = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/s);
      if (!m) return res.status(400).json({ error: "dataUrl must be a base64 data-URL" });
      const contentType = m[1];
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > 19 * 1024 * 1024) return res.status(400).json({ error: "file too large (max ~19 MB)" });
      const safeName = String(filename || "qc-photo.jpg").replace(/[^\w.\- ()]/g, "_").slice(0, 90) || "qc-photo.jpg";

      const cr = await fetch("https://api.notion.com/v1/file_uploads", {
        method: "POST", headers: headers("2022-06-28"),
        body: JSON.stringify({ filename: safeName, content_type: contentType }),
      });
      const cj = await cr.json();
      if (!cr.ok) return res.status(502).json({ error: cj.message || "Notion file-upload create failed" });

      const fd = new FormData();
      fd.append("file", new Blob([buf], { type: contentType }), safeName);
      const sr = await fetch(`https://api.notion.com/v1/file_uploads/${cj.id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Notion-Version": "2022-06-28" },
        body: fd,
      });
      const sj = await sr.json();
      if (!sr.ok) return res.status(502).json({ error: sj.message || "Notion file-upload send failed" });

      files = current.slice();
      files[index] = { name: safeName, type: "file_upload", file_upload: { id: cj.id } };
    }

    // 4. Write the new files array back to the page.
    const pr = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: "PATCH", headers: headers("2022-06-28"),
      body: JSON.stringify({ properties: { [QC_PROP]: { files } } }),
    });
    const pj = await pr.json();
    if (!pr.ok) return res.status(502).json({ error: pj.message || "Notion page update failed" });

    return res.status(200).json({ ok: true, count: files.length });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
