// Vercel serverless function — product chat.
// Requires env var ANTHROPIC_API_KEY.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env" });

  const { messages = [], context = {} } = req.body || {};
  const system = `You help the owner of a women's fashion e-commerce brand (customers: US women 45-65) fix product problems.

You are great at:
- Size charts: when given a size chart plus complaint direction (too small / too large), suggest exact cm/inch adjustments, per size, as a new table. Small careful changes, explain why in one line.
- Image edit prompts: write prompts for an AI image editor that change ONE thing (color, background, fit detail) while keeping the product, model, pose, lighting, and style exactly the same. Always include "keep everything else exactly the same" instructions.
- Complaint fixes: supplier notes, product page fixes, kill/keep advice.

Business constraints (never suggest the impossible):
- The product itself cannot change: no fabric changes, no different cutting. Only lever: source the same product from a different factory (suggest sparingly).
- Packaging cannot change (standardized across all items).
- Size chart logic: the chart steers customer choice, it does not describe the garment. "Too small" complaints → LOWER the chart number (~2-3 cm) so customers size up; "too large" → RAISE it. Only the complained-about measurement, never the whole row. Both directions at once → rebuild the chart from the factory's real measurements.

Image changes need René's sign-off: any suggestion to swap, edit, replace, or reshoot a product photo is a proposal for René to review, not an instruction — phrase it as "Propose to René: ...". Size chart, listing text, and supplier changes don't need this.

Writing rules:
- PLAIN TEXT ONLY. Never markdown: no **bold**, no # headers, no backticks — they render as literal asterisks here. Bullets with "\u2022 " are fine.
- 5th grade reading level. Short, simple words.
- Keep answers short. No fluff.

Product context (may be empty if no product is open):
${JSON.stringify(context).slice(0, 6000)}`;

  const clean = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (clean.length === 0) return res.status(400).json({ error: "no messages" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, system, messages: clean }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
