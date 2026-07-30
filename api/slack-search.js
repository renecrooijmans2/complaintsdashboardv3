// Vercel serverless function — "All Slack messages" tab in the focus view.
// GET /api/slack-search?q=<term> → every Slack message mentioning the product.
//
// Uses Slack's search.messages API, which ONLY works with a USER token
// (xoxp-…) carrying the `search:read` scope — bot tokens cannot search.
// Setup: Slack app → OAuth & Permissions → User Token Scopes → add search:read,
// reinstall the app, copy the "User OAuth Token" into the SLACK_USER_TOKEN
// Vercel env var. Unconfigured → { configured: false, hint } so the UI degrades.
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  const token = process.env.SLACK_USER_TOKEN;
  const q = String((req.query || {}).q || "").trim();
  if (!q) return res.status(400).json({ error: "q required" });
  if (!token) {
    return res.status(200).json({
      configured: false,
      messages: [],
      hint: "Slack search is not configured — set SLACK_USER_TOKEN (a user xoxp token with the search:read scope) in the Vercel env.",
    });
  }
  try {
    const params = new URLSearchParams({ query: `"${q}"`, count: "40", sort: "timestamp", sort_dir: "desc" });
    let r = await fetch(`https://slack.com/api/search.messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let j = await r.json();
    // Quoted phrase found nothing? Retry unquoted for looser matching.
    if (j.ok && (j.messages?.matches || []).length === 0) {
      params.set("query", q);
      r = await fetch(`https://slack.com/api/search.messages?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      j = await r.json();
    }
    if (!j.ok) {
      const hint = j.error === "not_allowed_token_type"
        ? "SLACK_USER_TOKEN must be a USER token (xoxp-…), not a bot token — search.messages does not accept bot tokens."
        : `Slack error: ${j.error}`;
      return res.status(200).json({ configured: true, messages: [], hint });
    }
    const messages = (j.messages?.matches || []).map((m) => ({
      who: m.username || m.user || "?",
      channel: (m.channel && (m.channel.name || m.channel.id)) || "?",
      text: String(m.text || "").slice(0, 1500),
      ts: m.ts,
      date: m.ts ? new Date(parseFloat(m.ts) * 1000).toISOString().slice(0, 10) : "",
      permalink: m.permalink || "",
    }));
    res.setHeader("Cache-Control", "s-maxage=120");
    return res.status(200).json({ configured: true, messages });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
