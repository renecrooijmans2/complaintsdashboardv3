# Complaint Tracker Dashboard

## v3 features (July 2026)
- **Statuses**: "Stopped" is retired — stopped-ads products are simply **Inactive**. New **Check in** status (orange): tick the "Check in" box when logging an action that is outside our control; the product stays in Check in until the row's Status cell in the Actions sheet is changed away from "Check in".
- **Daily Check-in Slack follow-up for Amber**: `node slack/checkin-remind.cjs --send` (preview without `--send`). Schedule daily via `slack/com.evershop.complaints-checkin.plist` → `~/Library/LaunchAgents/`. Env: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, optional `SLACK_AMBER_MENTION` (`<@U…>`), in `slack/.env`.
- **Sticky panels** (right edge, QC-dashboard style): notepad (autosaves to the old Notes key, "send to Slack" via `/api/note`) + AI chat about the focused product. The focus card slides left while one is open. The old 4 floating buttons (AI chat / Reports / Notes / Analysis feedback) are gone.
- **‹ › navigation** in the focus view (buttons + arrow keys) steps through the filtered table.
- **Focus view extras**: WIIO/CJ fulfiller tag next to the title (`/api/cj-fulfilment` ← Notion "Products switched to CJ" DB), "All Slack messages" dropdown (`/api/slack-search`, needs `SLACK_USER_TOKEN` with `search:read` — user token, not bot), "Order graph" dropdown (weekly orders + decline warning), Customer photos (Notion "Customer photos" property) below the QC photos, "since last edit" open by default, lightbox stretches small photos to full screen.
- **QC photo replace/delete**: hover a QC thumbnail → Replace → replace with a file from your PC or delete; writes to Notion via `/api/qc-photo` (Notion File Upload API).
- **Complaints table**: numbered rows + a grey ↗ per complaint linking to the Re:amaze ticket. Needs a ticket URL/slug column in the complaints sheet (any header containing ticket/link/url/conversation); bare slugs use the `REAMAZE_CONVO_BASE` constant in ComplaintDashboard.jsx.

### Vercel env vars (Settings → Environment Variables)
| Var | Used by | Notes |
|---|---|---|
| `NOTION_API_KEY` | notion-qc, notion-ads, cj-fulfilment, qc-photo | integration must be connected to the backend DB **and** the "Products switched to CJ" DB |
| `ANTHROPIC_API_KEY` | ai, chat, feedback, report, sizechart, image-prompts | existing |
| `SLACK_USER_TOKEN` | slack-search | **user** token `xoxp-…` with `search:read` |
| `SLACK_WEBHOOK_URL` *or* `SLACK_BOT_TOKEN` + `SLACK_NOTES_CHANNEL` | note | notepad → Slack relay |

## Sheets needed (publish as CSV):
1. **Complaints** - auto-populated by N8N from Gorgias (optional: a "Summary" column → ticket quotes in focus view)
2. **Orders** - daily order counts per product per store (optional: an "Image URL" column → product photo in focus view)
3. **Config** - target % and alert threshold %
4. **Contribution margin** (per store) - Product ID (col B), refund rate (col N), breakeven ROAS (col O)

## Complaint types tracked:
too_small, too_large, defective, wrong_item, missing_parts, late_delivery, damaged_packaging, color_mismatch

## v2 features
- **Status column**: Active (green) / Edited (blue, action in last 14 days) / Inactive (grey, <5 sales in latest week) / Stopped. Filterable via the Status dropdown.
- **Focus view**: click a product title → other rows blur, panel opens with photo, key stats (incl. refund rate + BE ROAS from Contribution margin), complaints by category, up to 5 recent ticket quotes, and full edit history.
- **Simplified table**: category breakdown is hidden by default ("Show breakdown" to reveal). Green heat backgrounds removed — only amber/red draw attention.
- **Sorting**: click Week Started / Orders 7d / Comp. / Total % headers.
- **Orders 7d** column = orders in the latest data week (shown in the footer as "Orders 7d = W##").
- **Effect measurement**: before→after is ALWAYS shown, even on thin data, with a confidence label (Low / Preliminary / Confident) instead of "Insufficient data".
- **Write-back**: log Actions and Stop Advertising straight into the Google Sheet, with Undo. Requires the Apps Script webhook (see below).

## Config placeholders in ComplaintDashboard.jsx
- `COMPLAINT_DETAIL_CSV_URL` — published-CSV URL of the "Complaint Detail" tab (open the tab, copy the `gid` from the URL, use the same `pub?gid=...&single=true&output=csv` pattern). Leave "" to fall back to any Summary column in the complaints tabs.
- `APPS_SCRIPT_URL` — Web App URL from `apps-script/Code.gs`. Leave "" to hide the log buttons.
- `contribUrl` per store — already filled for Clarendale + Lark & Clover.

## Apps Script setup (enables write-back)
1. Open the Google Sheet → Extensions → Apps Script → paste `apps-script/Code.gs`.
2. Set `ACTION_SHEET` / `STOPPED_SHEET` to the exact tab names.
3. Add a **UUID** column to the header row of both tabs (this powers Undo).
4. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone**.
5. Paste the Web App URL into `APPS_SCRIPT_URL`.

Note: published CSVs cache ~5 minutes, so a freshly logged action shows instantly in the dashboard (optimistic) but appears in a hard-refresh only after the cache updates.
