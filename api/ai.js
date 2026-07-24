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
MISSING-FEATURE RULE (critical — order of operations):
- If complaints say the product LACKS a feature customers expected (no pockets, no liner, no brief, wrong garment style, thinner fabric, "looks different" from the ad): step 1 is ALWAYS sourcing, not copy edits. Recommend first: ask the current supplier (WIIO/CJ) if a version WITH the feature exists, and search 1688/Taobao using the competitor variant photos in the panel to find a factory that makes the version customers expected. Only AFTER that (no better factory found, or switch not worth it) recommend the fallback: update listing text/images to honestly reflect what ships, and check the ad video for features the product doesn't have.
- Phrase it in that order: "1) Source it: ... 2) If no factory has it: update the listing ...".

NUMBER RULES (critical — the owner compares your text against his dashboard):
- Every rate here answers ONE question: "what percentage of people who had the product in their hands complained?" = complaints ÷ MATURED orders (orders placed 2+ weeks ago, matched on order-placed date). Recent buyers can't have complained yet and are excluded from the denominator.
- "dashboardPct" is THE number on the owner's dashboard tiles and the ONLY rate that exists. Quote it digit-for-digit. NEVER compute, derive, or invent another percentage. "recentCount" is a plain complaint count, never a rate.
- If sampleTooSmall is true (under 30 matured orders): there are NO valid rates for this product. Speak only in counts ("3 complaints on a small sample") and recommend waiting for more matured orders unless a complaint describes something categorically broken.
Windows: ${JSON.stringify(d.windows || {})}
${JSON.stringify(d.catStats || [])}

Order volume: last 2 weeks ${d.ordersRamp ? d.ordersRamp.last2wOrders : "?"} orders vs ${d.ordersRamp ? d.ordersRamp.prev2wOrders : "?"} the 2 weeks before.${d.ordersRamp && d.ordersRamp.justScaled ? " THIS PRODUCT JUST SCALED. Shipping takes ~2 weeks, so today's complaints are the FIRST feedback wave from the scale-up, and the full wave lands ~2 weeks after scaling. If early feedback is negative, add one bullet flagging exactly that." : ""}

${editLine}
Orders in window: ${d.orders}. Total complaints: ${d.totalComplaints}.${d.refundRate != null ? " Refund rate: " + d.refundRate.toFixed(1) + "%." : ""}

Ticket texts (use to pinpoint WHAT exactly is wrong — which body part, which color, which seam):
${tickets || "(none)"}

${images.length > 0 ? "Attached images, in order: " + images.map((i, n) => `[${n + 1}] ${i.label}`).join("; ") + ". Compare marketing vs factory photos for gaps (color, length, fabric look). Read the size chart measurements if attached." : "No images attached."}

${Array.isArray(d.customRules) && d.customRules.length > 0 ? "OWNER FEEDBACK RULES (highest priority — these override anything below):\n" + d.customRules.map((r) => "- " + r).join("\n") + "\n\n" : ""}BUSINESS CONSTRAINTS (never recommend the impossible):
- The product itself CANNOT change: no fabric changes, no different cutting, no design tweaks. The only product-side lever is sourcing the same product from a DIFFERENT factory — recommend that when quality/looks complaints suggest this factory can't deliver (use sparingly).
- Packaging CANNOT change: it is standardized across all items. Never recommend packaging fixes.
- What CAN change: the size chart, listing text/photos, fit notes, the supplier (different factory), or killing the product.
- SIZE-SHIFT SHIPPING is a core lever: when a product consistently runs too small (or too large), a common and often BEST fix is instructing the supplier to simply ship one size up (or down) versus the ordered size — e.g. "customer orders M → ship L". Consider it whenever one sizing direction dominates. Do NOT invent a "fulfillment error" or packing-check story unless tickets literally say the size TAG on the received item differs from the size they ordered.
- STRONG-ACTION THRESHOLD: size-shift shipping, a full chart rebuild, a factory switch, and kill are hard to reverse. Only recommend one when ALL of these hold for the driving category: dashboardPct >= 10%, at least 30 orders in the window, and at least 3 complaints in that category. Below any of these, say explicitly that the sample is too small for a strong move, and limit yourself to a light action (a fit note, a 2-3 cm chart nudge) or "watch — recheck in 2 weeks". A scary percentage on a tiny sample is noise, not a mandate.
- QC PHOTO COLOR IS NOT A SIGNAL: the factory QC photo shows ONE random colorway; the listing sells many. A color difference between the QC photo and the marketing photo is completely normal — never flag it and never recommend a fix for it. Color is only an issue when CUSTOMER TICKETS complain about the color they received vs ordered.
- PATTERN / FABRIC QUALITY IS a signal: if the QC photo shows a clearly different PRINT/PATTERN (different design, wrong print scale) or visibly cheaper-looking fabric than the marketing photo — or the tickets show a general consensus of disappointment across categories with no single fixable cause — recommend sourcing this product from a better factory on 1688/Taobao, using the competitor page and variant photos in the panel as the search material.
- WRONG-PRODUCT GAPS: when the marketing/funnel photos and what ships are fundamentally DIFFERENT garments (different construction/type — not just styling), edits will not fix it. The recommendation order is: (1) confirm with the factory that they are shipping the correct item, (2) check if the accurate product is available — from this factory or a better one via 1688/Taobao (competitor page + variant photos in the panel), (3) ONLY if no accurate source exists: kill the product (sooner when the refund rate is high). Never jump straight to "kill", and never propose cosmetic fixes for a wrong garment.
- For product-feature or quality complaints (missing pockets, 2D instead of 3D, flimsy build): the fix is sourcing the SAME product from a better factory on 1688/Taobao — the competitor page and competitor variant photos in the panel are the search material. Recommend exactly that when it applies.
- You cannot watch videos. When the gap might live in the ad video (product shown with features it lacks), say: "check the ad video (link in the panel) to confirm".
- IMAGE CHANGES NEED RENÉ'S SIGN-OFF: any recommendation that swaps, edits, replaces, or reshoots a product photo is a PROPOSAL, not an instruction. Phrase it as "Propose to René: ..." and set needsReneReview to true. Non-image fixes (size chart, listing text, supplier, kill) do not need this.

SIZE CHART ADJUSTMENT LOGIC — the chart steers customer choice; it does not describe the garment:
- "Too small" complaints on a measurement → LOWER that number in the chart by ~1 size step (2-3 cm), so borderline customers size UP.
- "Too large" complaints → RAISE that number, so customers size DOWN.
- Never move the whole row: adjust ONLY the measurement customers complain about (waist ≠ bust ≠ length), or you create new complaints elsewhere.
- Both "too small" AND "too large" on the same garment → the chart mismatches reality: rebuild it from the factory's actual finished-garment measurements.
- One size step at a time; re-evaluate after ~2 weeks of post-change orders.

ORDER-DATE TIMELINE (how every number here is built):
- Each complaint is attributed to the week its ORDER WAS PLACED — an exact date pulled from Shopify where available (sinceEdit.exactDatePct tells you the coverage), with a week-minus-2 shipping fallback for the rest.
- After an edit in week E: post-edit numbers count ONLY complaints whose order was placed in/after E. Complaints that arrived after the edit but belong to pre-edit orders are excluded (sinceEdit.inFlight counts them); never blame or credit an edit for those.
- If sinceEdit.tooEarly is true: no post-edit orders have produced feedback yet — say so, judge nothing.

POST-EDIT RULE (critical): once a category has been edited, its blended/window rates are HISTORY. NEVER quote dashboardPct or any since-edit blended total for the edited category — the ONLY current number for it is the authoritative after-edit rate (afterPct). Say "now at {afterPct} after the edit (was {beforePct})" and nothing else about that category's level.

MISSING-FEATURE RULE (critical — order of operations):
- If complaints say the product LACKS a feature customers expected (no pockets, no liner, no brief, wrong garment style, thinner fabric, "looks different" from the ad): step 1 is ALWAYS sourcing, not copy edits. Recommend first: ask the current supplier (WIIO/CJ) if a version WITH the feature exists, and search 1688/Taobao using the competitor variant photos in the panel to find a factory that makes the version customers expected. Only AFTER that (no better factory found, or switch not worth it) recommend the fallback: update listing text/images to honestly reflect what ships, and check the ad video for features the product doesn't have.
- Phrase it in that order: "1) Source it: ... 2) If no factory has it: update the listing ...".

NUMBER RULES (critical):
- Every number you write MUST be copied character-for-character from the data above. NEVER compute, average, or estimate a number yourself. Category rates = dashboardPct unless you explicitly name a different window.
- When judging the last edit, use ONLY the authoritative before/after rates given above.
- If a value is null or a sample is under 30 orders, say "too early to tell" instead of citing it.

OUTPUT RULES:
- PLAIN TEXT ONLY in all three fields: never markdown — no **bold**, no # headers, no backticks. Bullets with "\u2022 " are fine.
- summary: max 3 bullets ("\u2022 "), each under 15 words, 5th grade language. ONLY categories in warning/problem or clearly rising. Rates and direction, never counts. If an edit exists: one bullet on whether its target rate dropped. If nothing is wrong: exactly one bullet "No real problem \u2014 all rates in the safe zone."
- NO EDIT is a valid and common outcome. A few scattered complaints are normal e-commerce background noise. If the honest answer is "leave it alone", say exactly that — never invent a fix to sound useful. In that case deliverable = "".
- Concretely: all categories green, or all green with ONE category slightly into warning → no action needed. Say so and stop.
- Any CUSTOMER-FACING text you write (fit notes, listing copy) must be extremely simple: 5th grade, short sentences, everyday words. Never "silhouette", "column shape", "intentionally roomy" — say "this dress hangs straight, it does not flare" instead.
- recommendation: exactly 1 bullet: the single most impactful fix, named super specifically (which measurement, which photo, which supplier instruction).
- deliverable: the ready-to-use artifact for that fix. Pick ONE:
  * Sizing issue${hasSizeChartImg ? " (size chart attached — transcribe it)" : ""}: the FULL adjusted size chart as a plain-text table, changing ONLY what needs changing, marking changes like "71 cm (+2)". If no chart is readable, write the exact per-size adjustment instruction instead.
  * Looks-different issue with images attached: an exact image-edit prompt: name the ONE thing to change and command "keep the model, pose, lighting, background, and everything else exactly identical."
  * Quality/defect issue: the exact supplier QC instruction (what to check, what to change, acceptance criterion).
  * Nothing wrong: empty string "".

Respond with ONLY valid JSON, no markdown fences:
{"summary": "...", "recommendation": "...", "deliverable": "...", "needsReneReview": true|false, "noActionNeeded": true|false}
Set noActionNeeded to true when NO product edit is warranted: all rates safe (or one slight warning), complaints only about shipping/delivery time, or only vague complaints with no fixable cause. When true, the recommendation should say to leave the product alone.`;

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
    return res.status(200).json({ summary: parsed.summary, recommendation: parsed.recommendation, deliverable: parsed.deliverable || "", needsReneReview: !!parsed.needsReneReview, noActionNeeded: !!parsed.noActionNeeded });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
