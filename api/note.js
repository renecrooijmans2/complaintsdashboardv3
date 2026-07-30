// Vercel serverless function — the notepad's "send to Slack" relay (same
// contract as the 5+ sales QC dashboard). Two transports, webhook first:
//   SLACK_WEBHOOK_URL                     → posts to the webhook's channel
//   SLACK_BOT_TOKEN + SLACK_NOTES_CHANNEL → chat.postMessage (channel ID, not #name)
// (SLACK_CHANNEL is accepted as a fallback channel var.)
export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const text = String((req.body || {}).text || "").trim().slice(0, 2800);
  if (!text) return res.status(400).json({ error: "text required" });

  const message = `📝 *Note from the complaints dashboard:*\n${text}`;
  try {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (webhook) {
      const r = await fetch(webhook, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });
      if (!r.ok) throw new Error(`webhook HTTP ${r.status}`);
      return res.status(200).json({ ok: true });
    }
    const token = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_NOTES_CHANNEL || process.env.SLACK_CHANNEL;
    if (!token || !channel) {
      return res.status(500).json({ error: "Slack is not configured — set SLACK_WEBHOOK_URL (or SLACK_BOT_TOKEN + SLACK_NOTES_CHANNEL) on Vercel." });
    }
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel, text: message, unfurl_links: false, unfurl_media: false }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`chat.postMessage: ${j.error}`);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
