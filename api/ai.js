// Vercel serverless function — AI complaint analysis with vision.
// Looks at the size chart, marketing image, and factory QC photos when available,
// and produces a concrete deliverable (adjusted size chart / image-edit prompt / supplier instruction).
// Requires env var ANTHROPIC_API_KEY.
const IMG_RE = /\.(png|jpe?g|webp|gif)(\?|$)/i;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel env" });

  const d = req.body || {};
  const la = d.lastAction;
  const editLine = la
    ? `Last edit (week ${la.week}, target category: ${la.category}): "${la.action}".
AUTHORITATIVE effect numbers — quote these EXACTLY, never recompute or replace them:
- rate before the edit: ${la.beforePct != null ? la.beforePct.toFixed(1) + "%" : "unknown"} (${la.beforeOrders || 0} orders)
- rate after the edit: ${la.afterPct != null ? la.afterPct.toFixed(1) + "%" : "unknown"} (${la.afterOrders || 0} orders)`
    : "Never edited.";
  const tickets = (d.summaries || []).slice(0, 25)
    .map((t) => `- [${t.type}] ${String(t.text).slice(0, 200)}`)
    .join("\n");

  // Attach images: marketing, up to 2 QC photos, size chart (only if it's an image file).
  const v = d.visuals || {};
  const images = [];
  const push = (url, label) => {
    if (url && IMG_RE.test(url) && images.length < 4) images.push({ url, label });
  };
  push(v.marketing, "MARKETING image (what the customer sees on the site)");
  (v.qcImages || []).forEach((u, i) => push(u, `FACTORY QC photo ${i + 1} (what actually ships)`));
  push(v.sizeChart, "SIZE CHART currently in use");
  const hasSizeChartImg = images.some((i) => i.label.startsWith("SIZE CHART"));

  const textPrompt = `You analyze one fashion e-commerce product (customers: US women 45-65). The owner reads raw numbers himself — your job: find the real gap and hand him a ready-to-use fix.

Category complaint rates with trend and thresholds. Below warningAt = fine; warningAt-problemAt = warning; >= problemAt = problem.
NUMBER SOURCE RULES (critical — the owner compares your text against his dashboard):
- "dashboardPct" is THE number shown on the owner's dashboard tiles. When you name a category's rate, use dashboardPct EXACTLY — it must match his screen digit-for-digit.
- recentPct/priorPct are trend extras over a DIFFERENT window; when you use one, always name the window in brackets, e.g. "9.7% recent (${d.windows ? d.windows.recentTrend : "recent window"})".
- recentPct/priorPct are null when that window had under 30 orders — the sample is too small to be a rate. When null, NEVER state a recent rate or claim a spike; at most say "a few early complaints came in (small sample)".
Windows: ${JSON.stringify(d.windows || {})}
${JSON.stringify(d.catStats || [])}

Order volume: last 2 weeks ${d.ordersRamp ? d.ordersRamp.last2wOrders : "?"} orders vs ${d.ordersRamp ? d.ordersRamp.prev2wOrders : "?"} the 2 weeks before.${d.ordersRamp && d.ordersRamp.justScaled ? " THIS PRODUCT JUST SCALED. Shipping takes ~2 weeks, so today's complaints are the FIRST feedback wave from the scale-up, and the full wave lands ~2 weeks after scaling. If early feedback is negative, add one bullet flagging exactly that." : ""}

${editLine}
Orders in window: ${d.orders}. Total complaints: ${d.totalComplaints}.

Ticket texts (use to pinpoint WHAT exactly is wrong — which body part, which color, which seam):
${tickets || "(none)"}

${images.length > 0 ? "Attached images, in order: " + images.map((i, n) => `[${n + 1}] ${i.label}`).join("; ") + ". Compare marketing vs factory photos for gaps (color, length, fabric look). Read the size chart measurements if attached." : "No images attached."}

NUMBER RULES (critical):
- Every number you write MUST be copied character-for-character from the data above. NEVER compute, average, or estimate a number yourself. Category rates = dashboardPct unless you explicitly name a different window.
- When judging the last edit, use ONLY the authoritative before/after rates given above.
- If a value is null or a sample is under 30 orders, say "too early to tell" instead of citing it.

OUTPUT RULES:
- summary: max 3 bullets ("\u2022 "), each under 15 words, 5th grade language. ONLY categories in warning/problem or clearly rising. Rates and direction, never counts. If an edit exists: one bullet on whether its target rate dropped. If nothing is wrong: exactly one bullet "No real problem \u2014 all rates in the safe zone."
- recommendation: exactly 1 bullet: the single most impactful fix, named super specifically (which measurement, which photo, which supplier instruction).
- deliverable: the ready-to-use artifact for that fix. Pick ONE:
  * Sizing issue${hasSizeChartImg ? " (size chart attached — transcribe it)" : ""}: the FULL adjusted size chart as a plain-text table, changing ONLY what needs changing, marking changes like "71 cm (+2)". If no chart is readable, write the exact per-size adjustment instruction instead.
  * Looks-different issue with images attached: an exact image-edit prompt: name the ONE thing to change and command "keep the model, pose, lighting, background, and everything else exactly identical."
  * Quality/defect issue: the exact supplier QC instruction (what to check, what to change, acceptance criterion).
  * Nothing wrong: empty string "".

Respond with ONLY valid JSON, no markdown fences:
{"summary": "...", "recommendation": "...", "deliverable": "..."}`;

  const content = images.map((i) => ({ type: "image", source: { type: "url", url: i.url } }));
  content.push({ type: "text", text: textPrompt });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1400, messages: [{ role: "user", content }] }),
    });
    let j = await r.json();
    // If an image failed to load (expired/blocked URL), retry text-only.
    if (!r.ok && images.length > 0) {
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1400, messages: [{ role: "user", content: [{ type: "text", text: textPrompt }] }] }),
      });
      j = await r2.json();
      if (!r2.ok) return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    } else if (!r.ok) {
      return res.status(502).json({ error: j.error?.message || "Anthropic API error" });
    }
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return res.status(200).json({ summary: parsed.summary, recommendation: parsed.recommendation, deliverable: parsed.deliverable || "" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
