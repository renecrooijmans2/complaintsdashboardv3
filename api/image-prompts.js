// Vercel serverless function — per-photo image-edit prompts.
// Pulls ALL product photos from the live page, has the AI judge each one:
//   small  = fixable in the image (length, flowiness, color shade) → exact edit prompt
//   big    = physical product mismatch (2D vs 3D, missing pockets/features) → no prompt; check ad video / different factory
//   none   = photo is fine, no edit needed (a perfectly valid outcome)
// Requires env var ANTHROPIC_API_KEY.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
  const { url, complaints } = req.body || {};
  // Accept any URL containing /products/<handle> (suggest.json appends ?_pos=... tracking params)
  const m = String(url || "").match(/^(https?:\/\/[^/]+)[^?#]*\/products\/([^/?#]+)/i);
  if (!m) return res.status(400).json({ error: "invalid product url: " + String(url).slice(0, 120) });
  const clean = m[1].replace(/^http:/, "https:") + "/products/" + m[2];
  try {
    const pr = await fetch(clean + ".js", { headers: { "User-Agent": "Mozilla/5.0 (dashboard)" } });
    if (!pr.ok) return res.status(502).json({ error: "Could not fetch product (" + pr.status + ")" });
    const pj = await pr.json();
    const imgs = (pj.images || []).slice(0, 6).map((u) => (String(u).startsWith("//") ? "https:" + u : String(u)));
    if (imgs.length === 0) return res.status(502).json({ error: "Product has no images" });

    const content = imgs.map((u) => ({ type: "image", source: { type: "url", url: u } }));
    content.push({
      type: "text",
      text: `These are the ${imgs.length} photos of one fashion product, in order. Customer complaints:
${String(complaints || "").slice(0, 2500)}

For EACH photo, decide:
- "small": the complaint can be fixed by editing the image itself (dress shorter/longer, more/less flowy, color shade, sleeve length). Write an exact image-edit prompt: name the ONE change, then command: "Keep the model, face, pose, lighting, background, colors, fabric texture, and everything else 100% identical to the reference image." The original photo will be given as reference.
- "big": the gap is physical — the real product differs from the photo (2D print shown as 3D, missing pockets or features, different construction). Image editing cannot fix this. No prompt; reason instead: check the ad video and consider sourcing this product from a different factory.
- "none": this photo has no problem related to the complaints. No edit needed. Do NOT invent an edit — "none" is a perfectly good answer.

Plain text only, no markdown. Respond with ONLY valid JSON, no fences:
{"photos":[{"index":1,"verdict":"small|big|none","reason":"one short line","prompt":"the full edit prompt, or empty string"}]}`,
    });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const photos = (parsed.photos || []).map((p, i) => ({
      index: p.index || i + 1,
      imageUrl: imgs[(p.index || i + 1) - 1] || imgs[i],
      verdict: p.verdict || "none",
      reason: p.reason || "",
      prompt: p.prompt || "",
    }));
    return res.status(200).json({ photos });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
