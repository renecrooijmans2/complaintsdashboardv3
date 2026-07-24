// Vercel serverless function — 1-click updated size chart.
// The size chart on these themes lives in the "Size chart" popup (a modal on the
// product page), NOT in the product description. So: fetch the rendered product
// page HTML, find the size-chart <table> inside it, let the AI edit ONLY the
// numbers, return the complete updated fragment.
// Requires env var ANTHROPIC_API_KEY.

function canonicalProductUrl(raw) {
  const m = String(raw || "").match(/^(https?:\/\/[^/]+)[^?#]*\/products\/([^/?#]+)/i);
  if (!m) return null;
  return { base: m[1].replace(/^http:/, "https:"), handle: m[2], url: m[1].replace(/^http:/, "https:") + "/products/" + m[2] };
}

function extractSizeChart(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  let best = null, bestScore = 0;
  for (const t of tables) {
    const txt = t.replace(/<[^>]+>/g, " ");
    let score = 0;
    if (/\b(XS|S|M|L|XL|2XL|3XL)\b/.test(txt)) score += 2;
    if (/bust|waist|hip|length|shoulder|sleeve/i.test(txt)) score += 3;
    if (/\b(cm|in|inch)\b/i.test(txt)) score += 1;
    if (/\d{2,3}([.,]\d)?/.test(txt)) score += 1;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (!best || bestScore < 4) return null;
  // Include the fit notes that follow the table in the same modal (Fit / Sizing Guide / Materials)
  const idx = html.indexOf(best);
  const after = html.slice(idx + best.length, idx + best.length + 2500);
  const notes = (after.match(/<p[\s\S]*?<\/p>/gi) || []).slice(0, 4).join("\n");
  return best + (notes ? "\n" + notes : "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env" });
  const { url, instructions } = req.body || {};
  const cp = canonicalProductUrl(url);
  if (!cp || !instructions) return res.status(400).json({ error: "invalid product url: " + String(url).slice(0, 120) });
  try {
    // 1) Rendered product page (where the Size chart popup markup lives)
    const hr = await fetch(cp.url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36" } });
    let chartHtml = hr.ok ? extractSizeChart(await hr.text()) : null;
    // 2) Fallback: description HTML from /products/handle.js
    if (!chartHtml) {
      const pr = await fetch(cp.url + ".js", { headers: { "User-Agent": "Mozilla/5.0 (dashboard)" } });
      if (pr.ok) {
        const pj = await pr.json();
        chartHtml = extractSizeChart(String(pj.description || ""));
      }
    }
    if (!chartHtml) return res.status(502).json({ error: "No size-chart table found on the product page" });

    const prompt = `Below is the size-chart HTML from a product page (the table from the "Size chart" popup, plus its fit notes).

Task:
1. Apply ONLY these measurement changes, following this logic — the chart steers customer choice, it does not describe the garment: "too small" complaints → LOWER the number (~2-3 cm / ~1 inch, one size step) so customers size up; "too large" → RAISE it; only the complained-about measurement, never the whole row:
${String(instructions).slice(0, 2000)}
2. Return the COMPLETE fragment, byte-identical to the input EXCEPT the edited numbers. Do not reformat, reorder, translate, or "clean up" anything. If a fit note contradicts the change (e.g. "size up one"), you may update that one sentence too. No markdown, no commentary, no code fences — raw HTML only.

HTML:
${chartHtml.slice(0, 30000)}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    let out = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    out = out.replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
    return res.status(200).json({ html: out });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
