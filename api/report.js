// Vercel serverless function — report generator (CEO / high-risk).
// Requires env var ANTHROPIC_API_KEY.
const PROMPTS = {
  ceo: (d) => `Write a short CEO report for the store "${d.store}" (week ${d.week}).

Goal: in under 1 minute of reading, the CEO knows:
1. The most important actions taken recently, and whether they are working (use the before/after PERCENTAGES, not raw counts).
2. Go / no-go calls the CEO must make now (kill-signal products).
3. Products where complaints are rising fast.

Data:
Recent actions: ${JSON.stringify(d.recentActions)}
Kill signals: ${JSON.stringify(d.killSignals)}
Rising complaints: ${JSON.stringify(d.risingComplaints)}

Format:
- Plain text. Three short sections: "Actions taken", "Your calls to make", "Watch list".
- Bullet points only ("\u2022 "), one line each, product name first.
- 5th grade reading level. Simple words. Numbers kept simple.
- If a section has no data, write one line saying so.
- No intro, no outro, no emojis.`,
  risk: (d) => `Write a short high-risk report for the store "${d.store}" (week ${d.week}).

These products have been live only 1-2 weeks but already get sizing complaints. Catching them early saves money on returns and ad spend.

Data: ${JSON.stringify(d.newProductsWithSizingRisk)}

Format:
- Plain text, bullet points only ("\u2022 "), one product per bullet: name, weeks live, orders, sizing complaints (too small vs too large), and the one action to take now (fix size chart / warn supplier / stop ads).
- If too small AND too large both appear, say the size chart itself is probably wrong.
- 5th grade reading level. Simple words.
- If there are no risky products, say that in one line.
- No intro, no outro, no emojis.`,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env" });
  const { type, data } = req.body || {};
  const make = PROMPTS[type];
  if (!make || !data) return res.status(400).json({ error: "type must be ceo|risk, with data" });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, messages: [{ role: "user", content: make(data) }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
