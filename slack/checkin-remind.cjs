#!/usr/bin/env node
// Daily Slack follow-up for Amber: every product whose latest log entry has
// Status "Check in" (an edit outside her control — supplier, factory, WIIO…)
// gets a bullet so she can chase progress. Runs until the sheet row's Status
// cell is changed away from "Check in" (or the log entry is removed).
//
//   node slack/checkin-remind.cjs            → preview in the terminal
//   node slack/checkin-remind.cjs --send     → post to Slack
//   node slack/checkin-remind.cjs --send --quiet-if-empty
//
// Env (put them in slack/.env or export before running):
//   SLACK_BOT_TOKEN       xoxb-… with chat:write, invited to the channel
//   SLACK_CHANNEL_ID      channel ID (C0…), not #name
//   SLACK_AMBER_MENTION   optional, "<@U…>" for a real ping (default "Amber")
//
// Schedule (daily 09:30): cp slack/com.evershop.complaints-checkin.plist \
//   ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.evershop.complaints-checkin.plist
"use strict";

const fs = require("fs");
const path = require("path");

// Same published Actions tab the dashboard reads (ACTIONS_CSV_URL in ComplaintDashboard.jsx).
const ACTIONS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=1657576006&single=true&output=csv";

// Minimal .env loader so launchd runs work without a shell profile.
(function loadEnv() {
  for (const p of [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")]) {
    try {
      for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch (e) { /* file optional */ }
  }
})();

function parseCSVRow(line) {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function escapeSlack(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function fetchCheckins() {
  const res = await fetch(ACTIONS_CSV_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`actions CSV HTTP ${res.status}`);
  const rows = (await res.text()).split("\n").map(parseCSVRow);
  const hi = rows.findIndex((r) => r.some((c) => /action/i.test(c)));
  if (hi === -1) throw new Error("no header row with an Action column found");
  const h = rows[hi].map((c) => c.toLowerCase().trim());
  const col = (pred) => h.findIndex(pred);
  const ci = {
    product: col((c) => c.includes("product") && c.includes("name")),
    action: col((c) => c.includes("action") && !c.includes("expect")),
    status: col((c) => c.includes("status")),
    week: col((c) => c.includes("week")),
    date: col((c) => c.includes("date")),
    store: col((c) => c.includes("store")),
    notes: col((c) => c.includes("note")),
  };
  const items = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 3) continue;
    const status = ((ci.status >= 0 && r[ci.status]) || "").trim().toLowerCase();
    if (status !== "check in") continue;
    const date = ci.date >= 0 ? (r[ci.date] || "").trim() : "";
    let days = null;
    const d = new Date(date);
    if (date && !isNaN(d.getTime())) days = Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
    items.push({
      product: ci.product >= 0 ? (r[ci.product] || "").trim() : "?",
      action: ci.action >= 0 ? (r[ci.action] || "").trim() : "",
      week: ci.week >= 0 ? (r[ci.week] || "").trim() : "",
      store: ci.store >= 0 ? (r[ci.store] || "").trim() : "",
      notes: ci.notes >= 0 ? (r[ci.notes] || "").trim() : "",
      date, days,
    });
  }
  // Oldest first — the longest-waiting products lead the list.
  items.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  return items;
}

function buildMessage(items) {
  const amber = process.env.SLACK_AMBER_MENTION || "Amber";
  const lines = [`:mag: *Daily check-in follow-up for ${amber}* — ${items.length} product${items.length === 1 ? "" : "s"} waiting on an external edit:`];
  for (const it of items) {
    const bits = [];
    if (it.week) bits.push(`W${String(it.week).replace(/\D/g, "") || it.week}`);
    if (it.action) bits.push(escapeSlack(it.action));
    if (it.notes) bits.push(escapeSlack(it.notes));
    const age = it.days != null ? ` — open ${it.days} day${it.days === 1 ? "" : "s"}` : "";
    const store = it.store ? ` (${escapeSlack(it.store)})` : "";
    lines.push(`• *${escapeSlack(it.product)}*${store} — ${bits.join(" · ") || "check in"}${age}`);
    if (it.days != null && it.days >= 7) lines[lines.length - 1] += "  :hourglass:";
  }
  lines.push("_Done? Change the row's Status away from “Check in” in the Actions sheet and this reminder stops._");
  return lines.join("\n");
}

async function post(text) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token) throw new Error("SLACK_BOT_TOKEN not set");
  if (!channel) throw new Error("SLACK_CHANNEL_ID not set");
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`Slack chat.postMessage failed: ${j.error}`);
  return j;
}

(async () => {
  const send = process.argv.includes("--send");
  const quiet = process.argv.includes("--quiet-if-empty");
  const items = await fetchCheckins();
  if (items.length === 0) {
    if (quiet) { console.log("no check-ins, staying quiet"); return; }
    const msg = ":white_check_mark: No products in *Check in* — nothing to chase today.";
    if (send) { await post(msg); console.log("posted (empty notice)"); } else console.log(msg);
    return;
  }
  const msg = buildMessage(items);
  if (send) { await post(msg); console.log(`posted ${items.length} check-in(s)`); }
  else { console.log("--- preview (use --send to post) ---\n" + msg); }
})().catch((e) => { console.error("checkin-remind failed:", e.message || e); process.exit(1); });
