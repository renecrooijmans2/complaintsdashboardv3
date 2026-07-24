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
    if (url && IMG_RE.test(url) && images.length < 5) images.push({ url, label });
  };
  push(v.marketing, "MARKETING image (what the customer sees on the site)");
  (v.qcImages || []).forEach((u, i) => push(u, `FACTORY QC photo ${i + 1} (what actually ships)`));
  push(v.sizeChart, "SIZE CHART currently in use");
  (v.variantPhotos || []).forEach((u, i) => push(u, `COMPETITOR VARIANT photo ${i + 1} (sourcing reference for a better factory)`));
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

BUSINESS CONSTRAINTS (never recommend the impossible):
- The product itself CANNOT change: no fabric changes, no different cutting, no design tweaks. The only product-side lever is sourcing the same product from a DIFFERENT factory — recommend that when quality/looks complaints suggest this factory can't deliver (use sparingly).
- Packaging CANNOT change: it is standardized across all items. Never recommend packaging fixes.
- What CAN change: the size chart, listing text/photos, fit notes, the supplier (different factory), or killing the product.
- For product-feature or quality complaints (missing pockets, 2D instead of 3D, flimsy build): the fix is sourcing the SAME product from a better factory on 1688/Taobao — the competitor page and competitor variant photos in the panel are the search material. Recommend exactly that when it applies.
- You cannot watch videos. When the gap might live in the ad video (product shown with features it lacks), say: "check the ad video (link in the panel) to confirm".

SIZE CHART ADJUSTMENT LOGIC — the chart steers customer choice; it does not describe the garment:
- "Too small" complaints on a measurement → LOWER that number in the chart by ~1 size step (2-3 cm), so borderline customers size UP.
- "Too large" complaints → RAISE that number, so customers size DOWN.
- Never move the whole row: adjust ONLY the measurement customers complain about (waist ≠ bust ≠ length), or you create new complaints elsewhere.
- Both "too small" AND "too large" on the same garment → the chart mismatches reality: rebuild it from the factory's actual finished-garment measurements.
- One size step at a time; re-evaluate after ~2 weeks of post-change orders.

POST-EDIT RULE (critical): once a category has been edited, its blended/window rates are HISTORY. NEVER quote dashboardPct or any since-edit blended total for the edited category — the ONLY current number for it is the authoritative after-edit rate (afterPct). Say "now at {afterPct} after the edit (was {beforePct})" and nothing else about that category's level.

NUMBER RULES (critical):
- Every number you write MUST be copied character-for-character from the data above. NEVER compute, average, or estimate a number yourself. Category rates = dashboardPct unless you explicitly name a different window.
- When judging the last edit, use ONLY the authoritative before/after rates given above.
- If a value is null or a sample is under 30 orders, say "too early to tell" instead of citing it.

OUTPUT RULES:
- PLAIN TEXT ONLY in all three fields: never markdown — no **bold**, no # headers, no backticks. Bullets with "\u2022 " are fine.
- summary: max 3 bullets ("\u2022 "), each under 15 words, 5th grade language. ONLY categories in warning/problem or clearly rising. Rates and direction, never counts. If an edit exists: one bullet on whether its target rate dropped. If nothing is wrong: exactly one bullet "No real problem \u2014 all rates in the safe zone."
- NO EDIT is a valid and common outcome. A few scattered complaints are normal e-commerce background noise. If the honest answer is "leave it alone", say exactly that — never invent a fix to sound useful. In that case deliverable = "".
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
