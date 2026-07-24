// Vercel serverless function — updated size chart.
// TWO modes:
//   1. SCREENSHOT (preferred): body {imageBase64, mediaType, instructions} — AI reads the
//      current chart from the screenshot and outputs the corrected chart in our house HTML styling.
//   2. URL fallback: body {url, instructions} — pulls the size-chart table from the rendered
//      product page (the "Size chart" popup) and edits only the numbers.
// Requires env var ANTHROPIC_API_KEY.

const STYLE_RULES = `HTML STYLING RULES (non-negotiable, our store standard):
- <table style="border-collapse: collapse; width: 100%;"> (no font-family)
- EVERY header cell: <th style="background-color: #2C2C2C !important; color: #fff !important; padding: 10px; text-align: center;">...</th>
- Data rows alternate: row 1 plain cells <td style="padding: 10px; text-align: center;">, row 2 every cell <td style="background-color: #F8F8F8; padding: 10px; text-align: center;">, row 3 plain, row 4 #F8F8F8, etc. Style the TD cells, never the TR.
- No borders, outlines, or extra styling. Inches only, rounded to 0.5. Unit labels (in, lbs) ONLY in headers, never in data cells.
- After the table: one <br>, then any <p><strong>Fit:</strong>/<strong>Sizing Guide:</strong>/<strong>Materials:</strong> sections that were present, each followed by <br>. Low reading level, max 1 sentence each.
- No markdown, no emojis, raw HTML only.`;

const EDIT_LOGIC = `EDIT LOGIC — the chart steers customer choice; it does not describe the garment:
"too small" complaints → LOWER the complained-about measurement (~2-3 cm / ~1 inch, one size step) so customers size up; "too large" → RAISE it; ONLY the complained-about measurement, never the whole row. If the fit/sizing-guide sentence contradicts the change, update that one sentence too.`;

function canonicalProductUrl(raw) {
  const m = String(raw || "").match(/^(https?:\/\/[^/]+)[^?#]*\/products\/([^/?#]+)/i);
  if (!m) return null;
  return { url: m[1].replace(/^http:/, "https:") + "/products/" + m[2] };
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
  const idx = html.indexOf(best);
  const after = html.slice(idx + best.length, idx + best.length + 2500);
  const notes = (after.match(/<p[\s\S]*?<\/p>/gi) || []).slice(0, 4).join("\n");
  return best + (notes ? "\n" + notes : "");
}

async function askClaude(key, content) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 6000, messages: [{ role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "Anthropic API error");
  let out = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return out.replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env" });
  const { url, instructions, imageBase64, mediaType } = req.body || {};
  if (!instructions) return res.status(400).json({ error: "[api v3] instructions required" });
  try {
    // Mode 1: screenshot of the current chart
    if (imageBase64) {
      const html = await askClaude(key, [
        { type: "image", source: { type: "base64", media_type: mediaType || "image/png", data: imageBase64 } },
        { type: "text", text: `This screenshot shows the CURRENT size chart of a product (table + possibly Fit/Sizing Guide/Materials sentences).

Task:
1. Transcribe it faithfully — same sizes, same columns, same numbers, same sentences.
2. ${EDIT_LOGIC}
Changes to apply:
${String(instructions).slice(0, 2000)}
3. Output the complete result as raw HTML per these rules:
${STYLE_RULES}` },
      ]);
      return res.status(200).json({ html });
    }
    // Mode 2: pull from the product page
    const cp = canonicalProductUrl(url);
    if (!cp) return res.status(400).json({ error: "[api v3] no screenshot given and invalid product url: " + String(url).slice(0, 120) });
    const hr = await fetch(cp.url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36" } });
    let chartHtml = hr.ok ? extractSizeChart(await hr.text()) : null;
    if (!chartHtml) {
      const pr = await fetch(cp.url + ".js", { headers: { "User-Agent": "Mozilla/5.0 (dashboard)" } });
      if (pr.ok) chartHtml = extractSizeChart(String((await pr.json()).description || ""));
    }
    if (!chartHtml) return res.status(502).json({ error: "No size-chart table found on the product page — upload a screenshot instead" });
    const html = await askClaude(key, [
      { type: "text", text: `Below is the size-chart HTML from a product page.

Task:
1. ${EDIT_LOGIC}
Changes to apply:
${String(instructions).slice(0, 2000)}
2. Return the COMPLETE fragment restyled per these rules (keep sizes, columns, and all unchanged numbers identical):
${STYLE_RULES}

HTML:
${chartHtml.slice(0, 30000)}` },
    ]);
    return res.status(200).json({ html });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
