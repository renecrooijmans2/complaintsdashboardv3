// Vercel serverless function — feedback chat on the analysis judgement rules.
// The owner pushes back in plain language; the AI turns settled feedback into ONE concise
// rule that gets appended to the custom rules injected into every analysis.
// Requires env var ANTHROPIC_API_KEY.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
  const { messages = [], rules = [] } = req.body || {};
  const system = `You maintain the judgement rules of an AI that analyzes product complaints for a fashion e-commerce dashboard (analyzes complaint rates vs thresholds, judges edits on before/after rates, recommends size-chart fixes, factory sourcing, or no action).

Current custom rules already active:
${rules.length ? rules.map((r, i) => `${i + 1}. ${r}`).join("\n") : "(none yet)"}

Your job in this chat:
- The owner (René) gives feedback or pushback on analyses in plain human language. Discuss briefly to make sure you understand the intent.
- Once the desired change is clear, propose EXACTLY ONE new rule: imperative voice, under 40 words, general enough to apply to future analyses, specific enough to change behavior. Don't restate existing rules.
- If the feedback is unclear or would conflict with an existing rule, ask one short question instead of proposing.

Plain text only, no markdown. Respond with ONLY valid JSON, no fences:
{"reply": "your short conversational reply", "proposedRule": "the rule text, or null if not ready to propose"}`;
  const clean = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (clean.length === 0) return res.status(400).json({ error: "no messages" });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 700, system, messages: clean }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return res.status(200).json({ reply: parsed.reply || "", proposedRule: parsed.proposedRule || null });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
