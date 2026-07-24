// Vercel serverless function — AI complaint analysis (rates + trends, not counts).
// Requires env var ANTHROPIC_API_KEY.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env" });

  const d = req.body || {};
  const la = d.lastAction;
  const editLine = la
    ? `Last edit (week ${la.week}, target: ${la.category}): "${la.action}". Rate before: ${la.beforePct != null ? la.beforePct.toFixed(1) + "%" : "?"} → after: ${la.afterPct != null ? la.afterPct.toFixed(1) + "%" : "?"} (${la.afterOrders || 0} orders after).`
    : "Never edited.";
  const tickets = (d.summaries || []).slice(0, 25)
    .map((t) => `- [${t.type}] ${String(t.text).slice(0, 200)}`)
    .join("\n");

  const prompt = `You analyze complaint data for one fashion product. The owner can read raw numbers himself — your ONLY job is to find the real gap.

Category rates (complaints as % of orders), with trend and thresholds. Below warningAt = fine. warningAt-problemAt = warning. At/above problemAt = problem:
${JSON.stringify(d.catStats || [])}

${editLine}
Orders in window: ${d.orders}. Total complaints: ${d.totalComplaints}.

Ticket texts (use ONLY to explain WHY a problematic category is problematic, e.g. "runs large at the waist" — not to repeat counts):
${tickets || "(none)"}

Hard rules:
- Summary: max 3 bullets ("\u2022 "), each under 15 words, 5th grade language.
- ONLY mention categories in the warning/problem zone, or with recentPct clearly rising toward warning. SKIP everything fine. Do not mention safe categories at all.
- Talk in rates and direction (rising/falling/flat) — NEVER raw counts.
- If there was an edit: one bullet — did the target category's rate drop after it? (working / not working / too early: under 30 orders after).
- If nothing is in warning/problem and nothing is rising: exactly one bullet: "No real problem \u2014 all rates in the safe zone."
- Recommendation: exactly 1 bullet, the single most impactful fix. If nothing is wrong: "\u2022 Nothing \u2014 leave this product alone."

Respond with ONLY valid JSON, no markdown fences:
{"summary": "...", "recommendation": "..."}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return res.status(200).json({ summary: parsed.summary, recommendation: parsed.recommendation });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
