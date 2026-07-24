// Vercel serverless function — AI complaint analysis.
// Requires env var ANTHROPIC_API_KEY (Vercel dashboard → Settings → Environment Variables).
// The key stays on the server; it is NEVER shipped to the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env" });

  const d = req.body || {};
  const counts = Object.entries(d.counts || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const tickets = (d.summaries || [])
    .map((t) => `- [${t.type}, W${t.week}] ${String(t.text).slice(0, 300)}`)
    .join("\n");

  const prompt = `You are analyzing customer complaints for an e-commerce fashion product so the owner can decide what to fix.

Product: ${d.product}
${d.sinceWeek ? `Only feedback SINCE the last edit (week ${d.sinceWeek}). Last edit: ${d.lastAction ? d.lastAction.action + " (" + d.lastAction.category + ")" : "unknown"}` : "All feedback (product never edited)."}
Orders in window: ${d.orders}. Total complaints: ${d.totalComplaints}.
Complaint counts by category: ${counts || "none"}

Ticket texts (may be empty):
${tickets || "(no ticket texts — use the category counts)"}

Respond with ONLY valid JSON, no markdown fences:
{"summary": "2-3 short sentences: the main problem(s), in plain simple language, with rough numbers", "recommendation": "1-2 sentences: the single most impactful concrete change to make (e.g. size chart adjustment, supplier swap, photo fix, kill product). If the last edit clearly worked or didn't, say so."}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    const text = (j.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json({ summary: parsed.summary, recommendation: parsed.recommendation });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
