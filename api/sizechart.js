// Vercel serverless function — 1-click updated size chart.
// Pulls the product's real HTML (Shopify /products/{handle}.js), lets the AI apply
// ONLY the proposed measurement edits, returns the complete updated HTML fragment.
// Requires env var ANTHROPIC_API_KEY.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env" });
  const { url, instructions } = req.body || {};
  if (!url || !instructions) return res.status(400).json({ error: "url and instructions required" });
  const clean = String(url).split("?")[0].replace(/\/$/, "");
  if (!/^https:\/\/[a-z0-9.-]+\/products\/[a-z0-9-]+$/i.test(clean)) {
    return res.status(400).json({ error: "url must be a product page URL" });
  }
  try {
    const pr = await fetch(clean + ".js", { headers: { "User-Agent": "Mozilla/5.0 (dashboard)" } });
    if (!pr.ok) return res.status(502).json({ error: "Could not fetch product page (" + pr.status + ")" });
    const pj = await pr.json();
    const bodyHtml = String(pj.description || pj.body_html || "");
    if (!bodyHtml) return res.status(502).json({ error: "Product page has no description HTML" });

    const prompt = `Below is the FULL description HTML of a Shopify product page. It contains a size chart (usually a <table>).

Task:
1. Find the size chart in the HTML.
2. Apply ONLY these measurement changes, following this logic — the chart steers customer choice, it does not describe the garment: "too small" complaints → LOWER the number (~2-3 cm, one size step) so customers size up; "too large" → RAISE it; only the complained-about measurement, never the whole row:
${String(instructions).slice(0, 2000)}
3. Return the COMPLETE description HTML, byte-identical to the input EXCEPT the edited numbers. Do not reformat, reorder, translate, or "clean up" anything. No markdown, no commentary, no code fences — output raw HTML only.

HTML:
${bodyHtml.slice(0, 60000)}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    let html = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
    return res.status(200).json({ html });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
