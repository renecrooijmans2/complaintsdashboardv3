# Complaint Tracker Dashboard

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
