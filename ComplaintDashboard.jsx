import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import confetti from "canvas-confetti";

/* ══════════════════════════════════════════
   STORE CONFIG — add up to 5 stores
   ══════════════════════════════════════════ */
var STORE_CSVS = [
  {
    name: "Clarendale",
    complaintsUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=27271439&single=true&output=csv",
    ordersUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=1091916976&single=true&output=csv",
    // Contribution margin sheet (published CSV). Cols: B = Product ID, N = refund rate, O = breakeven ROAS.
    contribUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2TwY2Xoy8VTCaLt_jNgXe_-VRMTdS_ahkoakiCwHcAqIGg3PFCIK4286TUpeRwVjRW5LGHE5lPGAp/pub?gid=702241342&single=true&output=csv",
    // Storefront domain — powers the auto product link + photo in the focus view.
    domain: "clarendale.co",
  },
  {
    name: "Lark & Clover",
    complaintsUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=113813265&single=true&output=csv",
    ordersUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=2078912011&single=true&output=csv",
    contribUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTqyqMMxRWMzCQf8ZMsIERubusembyKZiyoAW6vq4lIbUcd_HxQnA5BOe7QYE-c4U9CXQ9-lh-ZTBQr/pub?gid=702241342&single=true&output=csv",
    domain: "larkandclover.com",
  },
  // { name: "Store 3", complaintsUrl: "...", ordersUrl: "...", contribUrl: "...", domain: "..." },
];

// Products whose title matches any of these are hidden everywhere (not real products).
var EXCLUDE_TITLE_PATTERNS = [/shipping/i, /inspiration guide/i];

// Whole-dashboard zoom (1 = 100%). René wants it bigger.
var UI_ZOOM = 1.5;

// Vercel serverless endpoints (files in /api). Work only on the deployed site,
// not in local `vite dev` — the UI degrades gracefully when they're missing.
var AI_API_PATH = "/api/ai";
var CHAT_API_PATH = "/api/chat";
var REPORT_API_PATH = "/api/report";
var PRODUCT_LOOKUP_PATH = "/api/product-lookup";
var NOTION_QC_PATH = "/api/notion-qc";
var SIZECHART_API_PATH = "/api/sizechart";
var FEEDBACK_API_PATH = "/api/feedback";
var NOTION_ADS_PATH = "/api/notion-ads";
var IMAGE_PROMPTS_PATH = "/api/image-prompts";
var ACTIONS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=1657576006&single=true&output=csv";
var CONFIG_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=1331895582&single=true&output=csv";
var STOPPED_ADS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=419605787&single=true&output=csv";

// "Complaint Detail" tab — per-ticket summaries.
// TODO(René): open the Complaint Detail tab, copy the gid from the URL, paste below.
// Leave "" and the dashboard falls back to any summary column found in the per-store complaints tabs.
var COMPLAINT_DETAIL_CSV_URL = "";

// Google Apps Script Web App URL — enables logging Actions / Stopped Advertising
// straight into the Google Sheet from the dashboard (with undo).
// Setup: see apps-script/Code.gs + README. Leave "" to hide the buttons.
var APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyPf4MYQO4r4NB9yCAa1S7zrMGCcvMCrCuEJGwJfZScPfmGCgKfahIW2ugh9MqDhr0/exec";

/* True when the dashboard runs on a dev server that has no serverless functions
   (vite dev serves the SPA only, so every /api/* call 404s). */
function isLocalDev() {
  try {
    var h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h.indexOf("192.168.") === 0;
  } catch (e) { return false; }
}

/* Custom analysis rules (owner feedback) — stored locally, injected into every /api/ai call. */
function getCustomRules() {
  try { return JSON.parse(window.localStorage.getItem("ai-custom-rules") || "[]"); } catch (e) { return []; }
}
function saveCustomRules(rules) {
  try { window.localStorage.setItem("ai-custom-rules", JSON.stringify(rules)); } catch (e) { /* no-op */ }
}
function rulesHash(rules) { return rules.length + "x" + rules.join("|").length; }
function makeAIKey(storeName, rowKey, d) {
  return "ai16-" + storeName + "-" + rowKey + "-" + d.totalComplaints + "-" + (d.sinceWeek || 0) + "-" + rulesHash(getCustomRules());
}

/* ── THEME ── */
// Nuance-style dark fintech palette: near-black canvas, ink cards, hairline borders, lavender accent
var N = {
  bg: "#0A0B0D",          // canvas — neutral near-black
  bgS: "#131519",         // elevated surface (table head, rail)
  bgC: "#101215",         // card
  card2: "#161A1F",       // inner card / hover
  text: "rgba(236,238,242,0.94)",
  textS: "rgba(236,238,242,0.56)",
  textT: "rgba(236,238,242,0.32)",
  border: "rgba(210,218,230,0.085)",
  borderS: "rgba(210,218,230,0.15)",
  green: "#34D399",
  red: "#FF6B6B",
  orange: "#FBBF24",
  blue: "#4C8DF6",
  blueSoft: "rgba(76,141,246,0.12)",
  blueText: "#8FB8F5",
  cyan: "#4CC9F0",
  violet: "#8AA2C8",
  grey: "rgba(236,238,242,0.38)",
  // Quiet accent used for pills / secondary buttons (same language as the Active tag)
  quiet: { bg: "rgba(76,141,246,0.11)", border: "rgba(76,141,246,0.28)", text: "#8FB8F5" },
  glow: "0 0 0 1px rgba(56,140,255,0.35), 0 8px 30px rgba(56,140,255,0.22)",
  cardShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px rgba(0,0,0,0.45)",
  grad: "linear-gradient(135deg,#4C8DF6 0%,#54C3E8 100%)",
};
var FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ── GLOBAL UI SHELL STYLES ──
   One injected stylesheet so every native control (select, input, checkbox,
   scrollbar, button) picks up the dark-blue look without touching 2.000 inline styles. */
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
      @keyframes riseIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @keyframes pulseDot{0%,100%{opacity:1}50%{opacity:.35}}
      * { box-sizing: border-box; }
      body { background: ${N.bg}; }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(210,218,230,0.14); border-radius: 99px; border: 2px solid transparent; background-clip: content-box; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(76,141,246,0.42); background-clip: content-box; }
      select, input, textarea { font-family: ${FONT}; color: ${N.text}; }
      select { appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 14px;
        background-image: linear-gradient(45deg, transparent 50%, ${N.textT} 50%), linear-gradient(135deg, ${N.textT} 50%, transparent 50%);
        background-position: right 4px center, right 0px center; background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; }
      select option { background: ${N.bgS}; color: ${N.text}; }
      input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      input[type="checkbox"] { appearance: none; -webkit-appearance: none; width: 15px; height: 15px; border-radius: 5px;
        border: 1.5px solid ${N.borderS}; background: rgba(255,255,255,0.03); cursor: pointer; position: relative; transition: all .15s ease; }
      input[type="checkbox"]:hover { border-color: ${N.blue}; box-shadow: 0 0 0 3px rgba(76,141,246,0.14); }
      input[type="checkbox"]:checked { background: ${N.grad}; border-color: transparent; }
      input[type="checkbox"]:checked::after { content: ""; position: absolute; left: 4.5px; top: 1.5px; width: 4px; height: 8px;
        border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(42deg); }
      button { transition: transform .12s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease, opacity .15s; }
      button:not(:disabled):hover { transform: translateY(-1px); }
      button:not(:disabled):active { transform: translateY(0); }
      button:focus-visible, select:focus-visible, input:focus-visible, [tabindex]:focus-visible {
        outline: 2px solid ${N.blue}; outline-offset: 2px; }
      .card { background: linear-gradient(180deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0) 42%), ${N.bgC};
        border: 1px solid ${N.border}; border-radius: 18px; box-shadow: ${N.cardShadow}; }
      .rowHover:hover { background: rgba(56,140,255,0.055) !important; }
      .navItem { position: relative; }
      .navItem:hover { background: rgba(255,255,255,0.05); }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; } }
    `}</style>
  );
}

/* ── ICONS (stroke, 1.6px — matches the rail + KPI tiles) ── */
function Ico(props) {
  var s = props.size || 16;
  var paths = {
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    bolt: "M13 3 5 14h6l-1 7 8-11h-6z",
    alert: "M12 4 3 20h18zM12 10v4M12 17.2v.1",
    sparkle: "M12 3v6M12 15v6M3 12h6M15 12h6",
    check: "M4 12.5 9 17.5 20 6.5",
    pause: "M9 5v14M15 5v14",
    box: "M12 3 3 7.5v9L12 21l9-4.5v-9zM3 7.5 12 12l9-4.5M12 12v9",
    cart: "M3 4h2l2.5 11h10L20 7H6.5M9 20a1 1 0 1 0 0-.1M17 20a1 1 0 1 0 0-.1",
    pct: "M6 18 18 6M8 8a1.5 1.5 0 1 0 .1 0M16 16a1.5 1.5 0 1 0 .1 0",
    flame: "M12 3c3 4 5 5.5 5 9a5 5 0 0 1-10 0c0-2 1-3 1.5-4.5C9 9.5 11 7 12 3z",
    refresh: "M20 11a8 8 0 1 0-1.5 5M20 5v6h-6",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 7.9 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 15H3.9a2 2 0 1 1 0-4H4a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4V3.9a2 2 0 1 1 4 0V4a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20 11h.1a2 2 0 1 1 0 4H20z",
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={props.color || "currentColor"}
      strokeWidth={props.weight || 1.7} strokeLinecap="round" strokeLinejoin="round" style={props.style}>
      <path d={paths[props.name] || paths.grid} />
    </svg>
  );
}

/* Soft tinted icon tile — the reference deck's signature KPI element */
function IconTile(props) {
  var c = props.color || N.blue;
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(150deg, " + c + "26 0%, " + c + "0D 100%)",
      border: "1px solid " + c + "33", color: c, flexShrink: 0,
      boxShadow: "0 4px 14px " + c + "1F",
    }}>
      <Ico name={props.icon} size={16} />
    </div>
  );
}

var CATEGORIES = [
  { key: "too_large", label: "Too Large", color: "#818CF8" },
  { key: "too_small", label: "Too Small", color: "#F472B6" },
  { key: "looks_different", label: "Looks Different", color: "#FBBF24" },
  { key: "quality", label: "Quality / Defective", color: "#8B5CF6" },
  { key: "other", label: "Other", color: "rgba(245,243,248,0.38)" },
];

var DEFAULT_ZONES = {
  too_large: { green: [0, 6], amber: [6, 8], red: [8, 100] },
  too_small: { green: [0, 6], amber: [6, 8], red: [8, 100] },
  looks_different: { green: [0, 6], amber: [6, 8], red: [8, 100] },
  quality: { green: [0, 6], amber: [6, 8], red: [8, 100] },
  other: { green: [0, 6], amber: [6, 8], red: [8, 100] },
};

// Confidence tiers for before/after effect measurement.
// NOTE: we now ALWAYS show the before→after numbers, even on thin data.
// These thresholds only control the confidence label, they never hide the delta.
var MIN_TRUSTWORTHY_ORDERS = 30;
var MIN_CONFIDENT_ORDERS = 100;

var LAG_WEEKS = 2; // fallback shipping lag, used ONLY when a complaint has no exact order-placed date
// The order week a complaint belongs to: exact (from the Shopify-enriched "order placed"
// column) when available, otherwise complaint week minus the 2-week shipping fallback.
function effOrderWeek(c) {
  if (c.orderWeek != null) return c.orderWeek;
  return c.week != null ? c.week - LAG_WEEKS : null;
}

var EARLY_WARNING_COUNT = 5;
var EARLY_WARNING_MIN_ORDERS = 30;

var KILL_DEBATE_THRESHOLD = 8;
var KILL_AUTO_THRESHOLD = 10;
var KILL_TOTAL_THRESHOLD = 23;

// Product status rules
var INACTIVE_SALES_7D = 5;   // < 5 sales in the last 2 data weeks -> Inactive
var EDITED_WINDOW_DAYS = 14; // action logged in last 14 days → Edited

/* ── CATEGORY MAPPER ── */
function mapCat(raw) {
  var r = (raw || "").toLowerCase();
  if (r.indexOf("large") !== -1 || r.indexOf("big") !== -1 || r.indexOf("loose") !== -1) return "too_large";
  if (r.indexOf("small") !== -1 || r.indexOf("tight") !== -1 || r.indexOf("sizing") !== -1) return "too_small";
  if (r.indexOf("look") !== -1 || r.indexOf("color") !== -1 || r.indexOf("colour") !== -1 || r.indexOf("different") !== -1 || r.indexOf("photo") !== -1 || r.indexOf("mismatch") !== -1 || r.indexOf("not_as_pictured") !== -1 || r.indexOf("not as pictured") !== -1) return "looks_different";
  if (r.indexOf("defect") !== -1 || r.indexOf("quality") !== -1 || r.indexOf("broke") !== -1 || r.indexOf("broken") !== -1 || r.indexOf("damage") !== -1 || r.indexOf("tear") !== -1 || r.indexOf("stitch") !== -1 || r.indexOf("poor_quality") !== -1) return "quality";
  return "other";
}

/* ── CSV PARSERS ── */
function parseCSVRow(line) {
  var result = [], cur = "", inQ = false;
  for (var i = 0; i < line.length; i++) {
    if (line[i] === '"') inQ = !inQ;
    else if (line[i] === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else cur += line[i];
  }
  result.push(cur.trim());
  return result;
}
function cleanNum(s) {
  if (!s) return null;
  var v = parseFloat(String(s).replace(/[€$,%\s]/g, ""));
  return isNaN(v) ? null : v;
}
function findHeader(rows, keywords) {
  for (var i = 0; i < Math.min(rows.length, 10); i++) {
    var lo = rows[i].map(function (c) { return c.toLowerCase(); });
    if (keywords.some(function (kw) { return lo.some(function (c) { return c.indexOf(kw) !== -1; }); })) return i;
  }
  return -1;
}

/* ── PRODUCT ID + TITLE NORMALIZATION ── */
function normId(s) {
  if (s == null) return "";
  var v = String(s).trim();
  if (v.charAt(0) === "=") v = v.slice(1);
  v = v.replace(/^["']+|["']+$/g, "").trim();
  if (/^\d+\.0$/.test(v)) v = v.slice(0, -2);
  return v;
}
function cleanTitle(t) {
  if (!t) return "";
  return String(t)
    .replace(/[\u2122\u00AE]/g, "")
    .replace(/\(R\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
function mergeKey(t) {
  return cleanTitle(t).toLowerCase();
}

var ID_REGISTRY = {};
function registerId(id, rawTitle) {
  var nid = normId(id);
  if (!nid) return;
  var title = cleanTitle(rawTitle);
  var existing = ID_REGISTRY[nid];
  if (!existing) {
    ID_REGISTRY[nid] = { title: title, key: mergeKey(rawTitle) };
  } else if (!existing.title && title) {
    ID_REGISTRY[nid] = { title: title, key: mergeKey(rawTitle) };
  }
}

function weekFromDateStr(ds) {
  if (!ds) return null;
  var d = new Date(ds);
  if (isNaN(d.getTime())) return null;
  return Math.ceil(Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) / 7);
}
function currentWeekNum() {
  var d = new Date();
  return Math.ceil(Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) / 7);
}

function parseComplaintsCSV(text, storeName) {
  var rows = text.split("\n").map(parseCSVRow);
  var hi = findHeader(rows, ["product", "complaint"]);
  if (hi === -1) return [];
  var h = rows[hi].map(function (c) { return c.toLowerCase().trim(); });
  var ci = {};
  h.forEach(function (c, i) {
    if (c.indexOf("date") !== -1) ci.date = i;
    if (c.indexOf("product") !== -1 && c.indexOf("name") !== -1) ci.product = i;
    if (c.indexOf("product") !== -1 && c.indexOf("id") !== -1) ci.pid = i;
    if (c.indexOf("complaint") !== -1 && c.indexOf("type") !== -1) ci.type = i;
    // Optional ticket summary column (also how "Complaint Detail" is parsed)
    if (ci.summary == null && (c.indexOf("summary") !== -1 || c.indexOf("detail") !== -1 || c.indexOf("quote") !== -1 || c.indexOf("description") !== -1 || c === "notes" || c === "note")) ci.summary = i;
    if (c.indexOf("order") !== -1 && c.indexOf("placed") !== -1) ci.placed = i;
  });
  if (ci.placed == null) ci.placed = 8; // column I by position, per the sheet layout
  var out = [];
  for (var i = hi + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.length < 3) continue;
    var rawTitle = (r[ci.product] || "").trim();
    var pid = normId(r[ci.pid]);
    if (!pid && !rawTitle) continue;
    registerId(pid, rawTitle);
    var ds = (r[ci.date] || "").trim();
    var placedStr = (r[ci.placed] || "").trim();
    var ow = placedStr && placedStr !== "not-found" ? weekFromDateStr(placedStr) : null;
    out.push({
      orderWeek: ow,
      productId: pid,
      key: pid || ("title:" + mergeKey(rawTitle)),
      title: cleanTitle(rawTitle),
      type: mapCat(r[ci.type]),
      week: weekFromDateStr(ds),
      dateStr: ds,
      summary: ci.summary != null ? (r[ci.summary] || "").trim() : "",
      store: storeName,
    });
  }
  return out;
}

function parseOrdersCSV(text) {
  var rows = text.split("\n").map(parseCSVRow);
  var hi = findHeader(rows, ["product"]);
  if (hi === -1) return [];
  var h = rows[hi].map(function (c) { return c.toLowerCase().trim(); });
  var ci = { product: -1, pid: -1, image: -1, weekCols: {} };
  h.forEach(function (c, i) {
    if (c.indexOf("product") !== -1 && c.indexOf("id") !== -1) ci.pid = i;
    if (c.indexOf("product") !== -1 && c.indexOf("name") !== -1) ci.product = i;
    if (c.indexOf("image") !== -1 || c.indexOf("photo") !== -1 || c === "img") ci.image = i;
    var wm = c.match(/^w(?:eek)?\s*(\d+)$/); // matches "w24", "W24", and "Week 24"
    if (wm) ci.weekCols[parseInt(wm[1])] = i;
  });
  if (ci.product === -1) {
    h.forEach(function (c, i) { if (c.indexOf("product") !== -1 && i !== ci.pid) ci.product = i; });
  }
  var out = [];
  for (var i = hi + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.length < 2) continue;
    var rawTitle = (r[ci.product] || "").trim();
    var pid = ci.pid !== -1 ? normId(r[ci.pid]) : "";
    if (!pid && !rawTitle) continue;
    registerId(pid, rawTitle);
    var wo = {};
    Object.keys(ci.weekCols).forEach(function (wk) {
      var v = cleanNum(r[ci.weekCols[wk]]);
      if (v != null && v > 0) wo[wk] = v;
    });
    out.push({
      productId: pid,
      key: pid || ("title:" + mergeKey(rawTitle)),
      title: cleanTitle(rawTitle),
      image: ci.image !== -1 ? (r[ci.image] || "").trim() : "",
      weekOrders: wo,
    });
  }
  return out;
}

function parseActionsCSV(text) {
  var rows = text.split("\n").map(parseCSVRow);
  var hi = findHeader(rows, ["action"]);
  if (hi === -1) return [];
  var h = rows[hi].map(function (c) { return c.toLowerCase().trim(); });
  var ci = {};
  var idCols = [];
  h.forEach(function (c, i) {
    if (c.indexOf("product") !== -1 && c.indexOf("name") !== -1) ci.product = i;
    if (c.indexOf("product") !== -1 && c.indexOf("id") !== -1) idCols.push(i);
    if (c.indexOf("category") !== -1) ci.cat = i;
    if (c.indexOf("action") !== -1 && c.indexOf("expect") === -1) ci.action = i;
    if (c.indexOf("effect") !== -1 || c.indexOf("expect") !== -1) ci.effect = i;
    if (c.indexOf("week") !== -1) ci.week = i;
    if (c.indexOf("status") !== -1) ci.status = i;
    if (c.indexOf("notes") !== -1 || c.indexOf("note") !== -1) ci.notes = i;
    if (c.indexOf("date") !== -1) ci.date = i;
    if (c.indexOf("uuid") !== -1 || c.indexOf("log id") !== -1) ci.uuid = i;
  });
  var out = [];
  for (var i = hi + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.length < 3) continue;
    var rawTitle = (r[ci.product] || "").trim();
    if (!rawTitle) continue;
    var base = {
      title: cleanTitle(rawTitle),
      category: mapCat(r[ci.cat]),
      action: (r[ci.action] || "").trim(),
      expectedEffect: (r[ci.effect] || "").trim(),
      week: parseInt((r[ci.week] || "").replace(/\D/g, "")) || null,
      status: (r[ci.status] || "").trim(),
      notes: ci.notes != null ? (r[ci.notes] || "").trim() : "",
      date: ci.date != null ? (r[ci.date] || "").trim() : "",
      uuid: ci.uuid != null ? (r[ci.uuid] || "").trim() : "",
    };
    var ids = idCols.map(function (col) { return normId(r[col]); }).filter(Boolean);
    ids.forEach(function (id) { registerId(id, rawTitle); });
    if (ids.length === 0) {
      out.push(Object.assign({ key: "title:" + mergeKey(rawTitle) }, base));
    } else {
      ids.forEach(function (id) { out.push(Object.assign({ key: id }, base)); });
    }
  }
  return out;
}

function parseStoppedAdsCSV(text) {
  var rows = text.split("\n").map(parseCSVRow);
  var hi = findHeader(rows, ["product", "stopped"]);
  if (hi === -1) return {};
  var h = rows[hi].map(function (c) { return c.toLowerCase().trim(); });
  var ci = {};
  var idCols = [];
  h.forEach(function (c, i) {
    if (c.indexOf("product") !== -1 && c.indexOf("id") !== -1) idCols.push(i);
    else if (c.indexOf("product") !== -1) ci.product = i;
    if (c.indexOf("stopped") !== -1 && c.indexOf("date") !== -1) ci.date = i;
    if (c.indexOf("date") !== -1 && ci.date == null) ci.date = i;
    if (c.indexOf("note") !== -1) ci.note = i;
    if (c.indexOf("uuid") !== -1 || c.indexOf("log id") !== -1) ci.uuid = i;
  });
  var out = {};
  for (var i = hi + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.length < 1) continue;
    var rawTitle = (r[ci.product] || "").trim();
    if (!rawTitle) continue;
    var info = {
      title: cleanTitle(rawTitle),
      stoppedDate: ci.date != null ? (r[ci.date] || "").trim() : "",
      note: ci.note != null ? (r[ci.note] || "").trim() : "",
      uuid: ci.uuid != null ? (r[ci.uuid] || "").trim() : "",
    };
    var ids = idCols.map(function (col) { return normId(r[col]); }).filter(Boolean);
    ids.forEach(function (id) { registerId(id, rawTitle); });
    if (ids.length === 0) {
      out["title:" + mergeKey(rawTitle)] = info;
    } else {
      ids.forEach(function (id) { out[id] = info; });
    }
  }
  return out;
}

/* Contribution margin CSV → map productId -> { refundRate }.
   Header-based first ("refund", "roas"/"breakeven"); falls back to fixed
   columns B (id), N (refund), O (breakeven ROAS) if headers don't match. */
function parseContribCSV(text) {
  var rows = text.split("\n").map(parseCSVRow);
  var hi = findHeader(rows, ["product", "refund", "margin"]);
  if (hi === -1) hi = 0;
  var h = rows[hi].map(function (c) { return c.toLowerCase().trim(); });
  var ci = { pid: -1, refund: -1 };
  h.forEach(function (c, i) {
    if (ci.pid === -1 && c.indexOf("id") !== -1 && c.indexOf("product") !== -1) ci.pid = i;
    // Refund RATE column only — "refund" alone can be a count/amount column.
    if (ci.refund === -1 && c.indexOf("refund") !== -1 && (c.indexOf("%") !== -1 || c.indexOf("rate") !== -1 || c.indexOf("percent") !== -1)) ci.refund = i;
  });
  // Fixed layout fallback: B = Product ID, O = refund rate.
  if (ci.pid === -1) ci.pid = 1;
  if (ci.refund === -1) ci.refund = 14;
  var out = {};
  for (var i = hi + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.length <= ci.pid) continue;
    var pid = normId(r[ci.pid]);
    if (!pid) continue;
    var refund = cleanNum(r[ci.refund]);
    if (refund == null) continue;
    // Stored as fraction (0.043) — normalize to %
    if (refund <= 1) refund = refund * 100;
    out[pid] = { refundRate: refund };
  }
  return out;
}

function parseConfigCSV(text, baseZones) {
  var z = JSON.parse(JSON.stringify(baseZones));
  var rows = text.split("\n").map(parseCSVRow);
  var out = { title: null, zones: z, minSales: null };
  rows.forEach(function (r) {
    var k = (r[0] || "").toLowerCase().trim();
    if (k.indexOf("title") !== -1) {
      var v = (r[1] || "").trim();
      if (v) out.title = v;
    }
    if (k.indexOf("min sales") !== -1 || k.indexOf("min_sales") !== -1 || k.indexOf("minimum sales") !== -1) {
      var ms = cleanNum(r[1]);
      if (ms != null) out.minSales = ms;
    }
    CATEGORIES.map(function (c) { return c.key; }).forEach(function (cat) {
      var cm = k.indexOf(cat.replace("_", " ")) !== -1 || k.indexOf(cat) !== -1;
      if (cm) {
        if (k.indexOf("green") !== -1 && k.indexOf("max") !== -1) {
          var gv = cleanNum(r[1]);
          if (gv != null) { z[cat].green[1] = gv; z[cat].amber[0] = gv; }
        }
        if (k.indexOf("amber") !== -1 && k.indexOf("max") !== -1) {
          var av = cleanNum(r[1]);
          if (av != null) { z[cat].amber[1] = av; z[cat].red[0] = av; }
        }
      }
    });
  });
  return out;
}

/* ── DEMO DATA (fallback) ── */
function genDemo() {
  var P = [
    "Stitchwell Embroidery Kit", "CloudStep Running Shoes", "AquaPure Water Bottle",
    "FlexFit Yoga Mat", "BreezeLite Jacket", "TrueGrip Phone Case",
    "SunShade Sunglasses", "PeakClimb Backpack", "IronPress Dress Shirt",
    "CozyKnit Sweater", "SwiftBlade Kitchen Knife", "TerraStep Hiking Boots"
  ];
  var stores = ["Clarendale US", "Clarendale EU", "Lume Haven US", "Store 4", "Store 5"];
  var sp = {
    "Clarendale US": P,
    "Clarendale EU": P.filter(function (_, i) { return i !== 6 && i !== 10; }),
    "Lume Haven US": P.filter(function (_, i) { return i !== 3 && i !== 8; }),
    "Store 4": P.slice(0, 8),
    "Store 5": P.slice(0, 6),
  };
  var pw = {
    "CloudStep Running Shoes": [.35, .25, .1, .15, .15],
    "BreezeLite Jacket": [.2, .3, .2, .1, .2],
    "CozyKnit Sweater": [.15, .15, .35, .15, .2],
    "TerraStep Hiking Boots": [.2, .3, .1, .25, .15],
  };
  var dw = [.1, .15, .2, .25, .3];
  var ck = ["too_large", "too_small", "looks_different", "quality", "other"];
  var actionEffect = {
    "CloudStep Running Shoes": { category: "too_small", fromWeek: 5, multiplier: 0.3 },
    "CozyKnit Sweater": { category: "looks_different", fromWeek: 6, multiplier: 0.35 },
    "BreezeLite Jacket": { category: "too_small", fromWeek: 6, multiplier: 0.6 },
  };
  var comps = [], ords = [], seed = 42;
  function rng() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var demoQuotes = [
    "Runs a full size small, had to return.",
    "Color is much darker than the photos.",
    "Stitching came loose after one wash.",
    "Loved it but arrived 3 weeks late.",
    "Fabric feels thinner than expected.",
  ];
  stores.forEach(function (st) {
    var prods = sp[st];
    for (var w = 1; w <= 8; w++) for (var d = 0; d < 7; d++) {
      if ((w - 1) * 7 + d + 1 > 56) break;
      prods.forEach(function (p) {
        var wts = pw[p] || dw;
        var n = Math.floor(rng() * 4);
        for (var c = 0; c < n; c++) {
          var roll = rng(), acc = 0, ch = "other";
          for (var j = 0; j < ck.length; j++) {
            acc += wts[j];
            if (roll <= acc) { ch = ck[j]; break; }
          }
          var fx = actionEffect[p];
          if (fx && fx.category === ch && w >= fx.fromWeek) {
            if (rng() > fx.multiplier) continue;
          }
          comps.push({ key: mergeKey(p), title: cleanTitle(p), productId: "", type: ch, week: w, store: st, summary: rng() > 0.7 ? demoQuotes[Math.floor(rng() * demoQuotes.length)] : "", dateStr: "" });
        }
      });
    }
    prods.forEach(function (p) {
      var wo = {};
      for (var w = 1; w <= 8; w++) wo[w] = 20 + Math.floor(rng() * (st.indexOf("4") !== -1 || st.indexOf("5") !== -1 ? 40 : 100));
      ords.push({ key: mergeKey(p), title: cleanTitle(p), productId: "", image: "", weekOrders: wo });
    });
  });
  return {
    complaints: comps,
    orders: ords,
    actions: [
      { key: mergeKey("CloudStep Running Shoes"), title: "CloudStep Running Shoes", category: "too_small", action: "Supplier shipping 1 size up", week: 4, status: "Active", expectedEffect: "Reduce too_small complaints by 50%", uuid: "" },
      { key: mergeKey("CozyKnit Sweater"), title: "CozyKnit Sweater", category: "looks_different", action: "Updated product photos with accurate color", week: 5, status: "Active", expectedEffect: "Reduce looks_different by 70%", uuid: "" },
      { key: mergeKey("BreezeLite Jacket"), title: "BreezeLite Jacket", category: "too_small", action: "Added detailed size guide to listings", week: 5, status: "Testing", expectedEffect: "Reduce sizing complaints by 30%", uuid: "" },
    ],
  };
}

/* ── HELPERS ── */
var fmtPct = function (v) { return v == null ? "\u2014" : v.toFixed(1) + "%"; };
var fmtSignedPct = function (v) {
  if (v == null || isNaN(v)) return "\u2014";
  var s = v > 0 ? "+" : "";
  return s + v.toFixed(1) + "pp";
};
function uid() {
  return "dash-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

function getCurrentMondayISO() {
  var now = new Date();
  var day = now.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  var monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

var CHECKBOX_STORAGE_KEY = "complaint-dashboard-checked";
function loadCheckedProducts() {
  try {
    var raw = window.localStorage.getItem(CHECKBOX_STORAGE_KEY);
    if (!raw) return { weekAnchor: getCurrentMondayISO(), products: {} };
    var parsed = JSON.parse(raw);
    var currentMonday = getCurrentMondayISO();
    // v4.1: checks persist across weeks — they reset only when "Run all recommendations" is pressed.
    parsed.weekAnchor = currentMonday;
    return parsed;
  } catch (e) {
    return { weekAnchor: getCurrentMondayISO(), products: {} };
  }
}
function saveCheckedProducts(state) {
  try { window.localStorage.setItem(CHECKBOX_STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* no-op */ }
}

function getZoneColor(v, z) {
  if (v == null) return N.textT;
  if (v >= z.red[0]) return N.red;
  if (v >= z.amber[0]) return N.orange;
  return N.green;
}
// Classic heat backgrounds (old dashboard styling) — used in the focus-panel category grid.
function getHeatBg(v, z) {
  if (v <= 0) return "rgba(255,255,255,0.02)";
  if (v < z.amber[0]) return "rgba(52,211,153,0.12)";
  if (v < z.red[0]) return "rgba(255,163,68,0.2)";
  return "rgba(255,107,107,0.25)";
}

/* POST to the Apps Script webhook. text/plain avoids the CORS preflight. */
// fetch with a hard 20s timeout — a hanging Google publish endpoint may never freeze the app
async function fetchT(url) {
  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
  try {
    var r = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    return r;
  } catch (e) {
    throw new Error("timeout/failure fetching " + String(url).slice(0, 80) + " \u2014 " + (e.message || e));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function postToSheet(payload) {
  if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL not configured");
  var res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  var json = await res.json();
  if (!json || json.ok !== true) throw new Error((json && json.error) || "Sheet write failed");
  return json;
}

/* Evershop mark */
function Logo(props) {
  var sz = props.size || 22;
  return (
    <svg width={sz} height={sz} viewBox="0 0 256 256" fill="none" aria-label="Evershop">
      <g transform="translate(0,256) scale(0.1,-0.1)" fill={props.color || "currentColor"} stroke="none">
        <path d="M350 1280 l0 -940 930 0 930 0 0 940 0 940 -930 0 -930 0 0 -940z m1780 818 c-1 -144 -109 -367 -210 -434 l-39 -26 -57 26 c-121 55 -153 32 -344 -244 -222 -320 -301 -407 -435 -481 -88 -48 -157 -112 -174 -160 l-11 -31 33 22 c17 12 82 45 142 75 190 92 224 127 453 467 185 274 216 297 304 227 59 -47 83 -52 133 -30 44 19 116 84 173 156 l32 40 0 -643 0 -642 -850 0 c-810 0 -850 1 -850 18 0 66 52 192 121 294 45 66 244 322 301 388 77 87 117 97 193 46 48 -33 89 -33 136 0 42 29 175 184 294 344 151 202 182 230 255 230 32 0 56 -7 84 -26 48 -33 37 -8 -21 49 -50 47 -92 61 -143 43 -58 -20 -111 -68 -266 -242 -158 -177 -203 -221 -238 -230 -22 -5 -48 6 -130 53 -31 19 -67 16 -108 -10 -20 -12 -128 -119 -239 -237 -110 -118 -210 -224 -220 -235 -19 -19 -19 -9 -19 608 l0 627 850 0 850 0 0 -42z" />
      </g>
    </svg>
  );
}

/* Status chip */
var STATUS_STYLES = {
  "New arrival": { color: "#eab308", bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.35)" },
  Active:   { color: N.green,  bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.3)" },
  Edited:   { color: N.blue,   bg: "rgba(56,140,255,0.14)",  border: "rgba(56,140,255,0.35)" },
  Inactive: { color: N.grey,   bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)" },
  Stopped:  { color: N.red,    bg: "rgba(255,107,107,0.1)",  border: "rgba(255,107,107,0.3)" },
};
function StatusChip(props) {
  var s = STATUS_STYLES[props.status] || STATUS_STYLES.Inactive;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 700, color: s.color, background: s.bg, border: "1px solid " + s.border, padding: "3px 8px", borderRadius: 99, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: s.color, boxShadow: "0 0 8px " + s.color, animation: props.status === "New arrival" ? "pulseDot 1.8s ease-in-out infinite" : "none" }} />
      {props.status}
    </span>
  );
}

/* ══════════════════════════════════════════
   ACTION HISTORY — shared by focus panel + hover panel.
   Always shows before→after numbers, even on thin data;
   confidence is a LABEL, never a reason to hide the delta.
   ══════════════════════════════════════════ */
function ActionHistory(props) {
  var items = props.items || [];
  var onUndo = props.onUndo; var onEdit = props.onEdit;
  if (items.length === 0) {
    return <div style={{ fontSize: 11, color: N.textT, padding: "4px 0" }}>No actions logged for this product.</div>;
  }
  return (
    <div>
      {items.map(function (a, i) {
        var cat = CATEGORIES.find(function (c) { return c.key === a.category; });
        var hasBoth = a.beforePct != null && a.afterPct != null;
        var confidence = a.afterOrders >= MIN_CONFIDENT_ORDERS ? "confident"
                       : a.afterOrders >= MIN_TRUSTWORTHY_ORDERS ? "preliminary"
                       : a.afterOrders > 0 ? "low"
                       : "none";
        var deltaColor = a.deltaPP == null ? N.textT : (a.deltaPP < -0.5 ? N.green : (a.deltaPP > 0.5 ? N.red : N.textS));
        if (confidence === "low" || confidence === "preliminary") {
          deltaColor = a.deltaPP == null ? N.textT : (a.deltaPP < -0.5 ? "rgba(52,211,153,0.65)" : (a.deltaPP > 0.5 ? "rgba(255,107,107,0.65)" : N.textS));
        }
        var confTag = null;
        if (confidence === "low") confTag = { text: "Low confidence \u00B7 " + a.afterOrders + " orders after", color: N.textS };
        else if (confidence === "preliminary") confTag = { text: "Preliminary \u00B7 " + a.afterOrders + "/" + MIN_CONFIDENT_ORDERS + " orders", color: N.textS };
        else if (confidence === "confident") confTag = { text: "Confident", color: N.textS };
        var canUndo = onUndo && a.uuid && a.uuid.indexOf("dash-") === 0;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid " + N.border, opacity: a.pending ? 0.6 : 1 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 11.5, flexWrap: "wrap" }}>
              <span style={{ color: N.textT, fontWeight: 700, fontSize: 11.5, minWidth: 32 }}>W{a.week}</span>
              <span style={{ fontSize: 11.5, color: N.textS, background: "rgba(255,255,255,0.05)", border: "1px solid " + N.border, padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>{cat ? cat.label : a.category}</span>
              <span style={{ color: N.text, fontWeight: 600, flex: 1, minWidth: 160, fontSize: 11.5 }}>{a.action}</span>
              {a.date && <span style={{ fontSize: 9, color: N.textT }}>{a.date}</span>}
              {a.status && <span style={{ fontSize: 9, color: a.status === "Active" || a.status === "Confirmed" ? N.green : N.orange, background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 10 }}>{a.status}</span>}
              {a.pending && <span style={{ fontSize: 9, color: N.orange }}>{"saving\u2026"}</span>}
              {canUndo && !a.pending && onEdit && (
                <button onClick={function () { onEdit(a); }} title="Edit this log entry"
                  style={{ background: "transparent", border: "1px solid rgba(56,140,255,0.35)", color: N.blue, fontSize: 9, padding: "1px 7px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>
                  Edit
                </button>
              )}
              {canUndo && !a.pending && (
                <button onClick={function () { onUndo(a); }} title="Remove this action from the sheet"
                  style={{ background: "transparent", border: "1px solid rgba(255,107,107,0.3)", color: N.red, fontSize: 9, padding: "1px 7px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>
                  {"\u21BA"} Undo
                </button>
              )}
            </div>
            {a.expectedEffect && (
              <div style={{ fontSize: 11.5, color: N.textS, paddingLeft: 42 }}>
                <span style={{ color: N.textT }}>Expected:</span> {a.expectedEffect}
              </div>
            )}
            {a.notes && (
              <div style={{ fontSize: 11.5, color: N.textS, paddingLeft: 42 }}>
                <span style={{ color: N.textT }}>Notes:</span> {a.notes}
              </div>
            )}
            <div style={{ display: "flex", gap: 16, alignItems: "center", paddingLeft: 42, fontSize: 11.5, fontVariantNumeric: "tabular-nums", marginTop: 4, flexWrap: "wrap", background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "7px 12px 7px 12px" }}>
              {a.beforeOrders > 0 ? (
                <div>
                  <span style={{ color: N.textS, fontSize: 11.5, marginRight: 6 }}>Before (W{a.beforeWindow[0]}{"\u2013"}{a.beforeWindow[1]}):</span>
                  <span style={{ color: N.text, fontWeight: 700, fontSize: 11.5 }}>{fmtPct(a.beforePct)}</span>
                  <span style={{ color: N.textT, marginLeft: 5, fontSize: 11.5 }}>{a.beforeComplaints} complaints / {a.beforeOrders} orders</span>
                </div>
              ) : (
                <span style={{ color: N.textT, fontStyle: "italic" }}>No baseline (0 orders before)</span>
              )}
              <span style={{ color: N.textS, fontSize: 14 }}>{"\u2192"}</span>
              {a.afterOrders > 0 ? (
                <div>
                  <span style={{ color: N.textS, fontSize: 11.5, marginRight: 6 }}>After (W{a.afterWindow[0]}{"\u2013"}{a.afterWindow[1]}):</span>
                  <span style={{ color: N.text, fontWeight: 700, fontSize: 11.5 }}>{fmtPct(a.afterPct)}</span>
                  <span style={{ color: N.textT, marginLeft: 5, fontSize: 11.5 }}>{a.afterComplaints} complaints / {a.afterOrders} orders</span>
                </div>
              ) : (
                <span style={{ color: N.textT, fontStyle: "italic" }}>No orders yet after the change</span>
              )}
              {hasBoth && (
                <span style={{ color: deltaColor, fontWeight: 700, fontSize: 11.5 }}>
                  {a.deltaPP < -0.5 ? "\u25BC better" : (a.deltaPP > 0.5 ? "\u25B2 worse" : "\u2248 same")} {fmtSignedPct(a.deltaPP)}
                </span>
              )}
              {confTag && (
                <span style={{ fontSize: 9, color: confTag.color, background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 10, border: "1px solid " + N.border }}>
                  {confTag.text}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════
   FOCUS PANEL — expanded product view (click a title to open)
   ══════════════════════════════════════════ */
function CategoryGrid(props) {
  var row = props.row;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(" + CATEGORIES.length + ", minmax(0, 1fr))", gap: 6 }}>
      {CATEGORIES.map(function (c) {
        var count = row[c.key + "_count"] || 0;
        var pct = row[c.key] || 0;
        var z = props.zones[c.key];
        return (
          <div key={c.key} style={{ background: getHeatBg(pct, z), border: "1px solid " + N.border, borderRadius: 9, padding: "7px 9px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: N.textS, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
            {props.sampleSmall ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: count > 0 ? N.textS : N.textT, fontVariantNumeric: "tabular-nums" }}>{count > 0 ? count + "\u00D7" : "\u2014"}</div>
                <div style={{ fontSize: 8, color: N.textT }}>sample {"<"}30</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, fontWeight: pct >= z.amber[0] ? 700 : 600, color: pct > 0 ? getZoneColor(pct, z) : N.textT, fontVariantNumeric: "tabular-nums" }}>
                  {pct > 0 ? pct.toFixed(1) + "%" : "\u2014"}
                </div>
                <div style={{ fontSize: 8, color: N.textT }}>{count > 0 ? count + "x" : ""}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* AI summary + recommendation of all feedback since the latest edit. */
function AIPanel(props) {
  var d = props.aiData;
  var st = useState({ loading: false, data: null, error: "" });
  var ai = st[0]; var setAi = st[1];
  var stCB = useState(false); var chartBusy = stCB[0]; var setChartBusy = stCB[1];
  var stCE = useState(""); var chartErr = stCE[0]; var setChartErr = stCE[1];
  var stPB = useState(false); var packBusy = stPB[0]; var setPackBusy = stPB[1];
  var stOR = useState(false); var openRec = stOR[0]; var setOpenRec = stOR[1];
  var stOF = useState(false); var openFix = stOF[0]; var setOpenFix = stOF[1];
  var stMU = useState(""); var manualUrl = stMU[0]; var setManualUrl = stMU[1];
  var effUrl = (manualUrl || props.productUrl || "").trim();

  function chartFromScreenshot(file) {
    if (!file || !ai.data) return;
    setChartBusy(true); setChartErr("");
    // Downscale client-side: retina screenshots easily exceed the serverless body limit.
    var img = new Image();
    var objUrl = URL.createObjectURL(file);
    img.onload = function () {
      var MAX = 1600;
      var scale = Math.min(1, MAX / Math.max(img.width, img.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objUrl);
      var dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      var b64 = dataUrl.split(",")[1];
      fetch(SIZECHART_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mediaType: "image/jpeg", instructions: (ai.data.deliverable || "") + "\n" + (ai.data.recommendation || "") }),
      }).then(function (r) {
        return r.json().catch(function () { throw new Error("Server sent no JSON (HTTP " + r.status + ") \u2014 likely the OLD api/sizechart.js is still deployed. Upload the new one from the zip."); });
      }).then(function (j) {
        setChartBusy(false);
        if (j.error) {
          setChartErr(j.error.indexOf("invalid product url") !== -1
            ? "Your Vercel is still running the OLD api/sizechart.js (it doesn't know the screenshot mode). Upload api/sizechart.js from the latest zip and redeploy."
            : j.error);
          return;
        }
        var blob = new Blob([j.html], { type: "text/html" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sizechart-updated.html";
        document.body.appendChild(a); a.click(); a.remove();
      }).catch(function (e) { setChartBusy(false); setChartErr(String(e.message || e)); });
    };
    img.onerror = function () { setChartBusy(false); setChartErr("Could not read that image file"); };
    img.src = objUrl;
  }
  var stPE = useState(""); var packErr = stPE[0]; var setPackErr = stPE[1];

  function makeImagePack() {
    if (!effUrl || !d) return;
    setPackBusy(true); setPackErr("");
    var complaintsTxt = (d.summaries || []).slice(0, 20).map(function (t) { return "[" + t.type + "] " + t.text; }).join("\n") || JSON.stringify(d.counts || {});
    fetch(IMAGE_PROMPTS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: effUrl, complaints: complaintsTxt }),
    }).then(function (r) { return r.json(); }).then(async function (j) {
      if (j.error) { setPackBusy(false); setPackErr(j.error); return; }
      var zip = new JSZip();
      zip.file("REVIEW-BY-RENE-FIRST.txt", "These image edits are PROPOSALS.\nSend this pack to Ren\u00E9 for review \u2014 do not run any prompt before his sign-off.");
      for (var i = 0; i < j.photos.length; i++) {
        var ph = j.photos[i];
        var folder = zip.folder("Foto " + ph.index);
        // original photo (fallback: url in txt when the image can't be fetched cross-origin)
        try {
          var ir = await fetch(ph.imageUrl);
          if (!ir.ok) throw new Error("img " + ir.status);
          var blob = await ir.blob();
          var ext = (ph.imageUrl.match(/\.(png|jpe?g|webp|gif)/i) || [null, "jpg"])[1];
          folder.file("original." + ext, blob);
        } catch (e) {
          folder.file("original-url.txt", ph.imageUrl);
        }
        if (ph.verdict === "small" && ph.prompt) {
          folder.file("prompt.txt", "[FOR REN\u00C9'S REVIEW \u2014 do not run before approval]\n\n" + ph.prompt);
        } else if (ph.verdict === "big") {
          folder.file("BIG-EDIT-check-ad-video.txt", "Image editing cannot fix this.\n" + ph.reason + "\nCheck the ad video (link in the focus panel) and consider sourcing from a different factory (competitor variant photos in the panel help on 1688/Taobao).");
        } else {
          folder.file("no-edit-needed.txt", ph.reason || "This photo is fine. No edit needed.");
        }
      }
      var blobZ = await zip.generateAsync({ type: "blob" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blobZ);
      a.download = "image-edit-pack.zip";
      document.body.appendChild(a); a.click(); a.remove();
      setPackBusy(false);
    }).catch(function (e) { setPackBusy(false); setPackErr(String(e.message || e)); });
  }

  function makeChartHtml() {
    if (!effUrl || !ai.data) return;
    setChartBusy(true); setChartErr("");
    fetch(SIZECHART_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: effUrl, instructions: (ai.data.deliverable || "") + "\n" + (ai.data.recommendation || "") }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      setChartBusy(false);
      if (j.error) { setChartErr(j.error); return; }
      var blob = new Blob([j.html], { type: "text/html" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sizechart-updated.html";
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { setChartBusy(false); setChartErr(String(e.message || e)); });
  }
  var cacheKey = d ? makeAIKey(props.storeName, props.rowKey, d) : null;

  function run(force) {
    if (!d || !props.ready) return;
    if (!force && cacheKey) {
      try {
        var c = window.localStorage.getItem(cacheKey);
        if (c) { setAi({ loading: false, data: JSON.parse(c), error: "" }); return; }
      } catch (e) { /* no-op */ }
    }
    setAi({ loading: true, data: null, error: "" });
    fetch(AI_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({}, d, { visuals: props.visuals || null, customRules: getCustomRules() })),
    }).then(function (r) {
      if (!r.ok) throw new Error("API " + r.status);
      return r.json();
    }).then(function (j) {
      if (j.error) throw new Error(j.error);
      setAi({ loading: false, data: j, error: "" });
      try { if (cacheKey) window.localStorage.setItem(cacheKey, JSON.stringify(j)); } catch (e) { /* no-op */ }
    }).catch(function (e) {
      setAi({ loading: false, data: null, error: String(e.message || e) });
    });
  }

  useEffect(function () { run(false); }, [props.rowKey, props.ready]);

  return (
    <div style={{ background: N.bg, border: "1px solid " + N.border, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: N.blue }}>
          AI analysis {d && d.sinceWeek ? "\u00B7 feedback since last edit (W" + d.sinceWeek + ")" : "\u00B7 all feedback"}
        </div>
      </div>
      {!d || d.totalComplaints === 0 ? (
        <div style={{ fontSize: 10.5, color: N.textT, fontStyle: "italic" }}>No complaints in this window {"\u2014"} nothing to analyze.</div>
      ) : ai.loading ? (
        <div style={{ fontSize: 10.5, color: N.textS }}>Analyzing {d.totalComplaints} complaints{"\u2026"}</div>
      ) : ai.error ? (
        <div style={{ fontSize: 10, color: N.orange, lineHeight: 1.5 }}>
          AI unavailable ({ai.error}).{" "}
          {isLocalDev()
            ? "You're on localhost \u2014 `vite dev` doesn't serve /api routes. Run `vercel dev` instead."
            : String(ai.error).indexOf("404") !== -1
              ? "The /api/ai function isn't deployed. Check that api/ai.js sits in the project root next to package.json, and that it's committed \u2014 then redeploy."
              : "Check ANTHROPIC_API_KEY in the Vercel project env vars (Production scope) and redeploy."}
        </div>
      ) : ai.data ? (
        <>
          <div style={{ fontSize: 11.5, color: N.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{ai.data.summary}</div>
          <div style={{ background: "rgba(56,140,255,0.08)", border: "1px solid rgba(56,140,255,0.3)", borderRadius: 9, padding: "8px 10px" }}>
            <div onClick={function () { setOpenRec(!openRec); }} style={{ fontSize: 10, fontWeight: 700, color: N.blue, cursor: "pointer", userSelect: "none" }}>
              <span style={{ display: "inline-block", width: 14 }}>{openRec ? "\u2212" : "+"}</span>Recommendation
            </div>
            {openRec && <div style={{ fontSize: 11.5, color: N.text, lineHeight: 1.55, whiteSpace: "pre-wrap", marginTop: 4 }}>{ai.data.recommendation}</div>}
          </div>
          {ai.data.needsReneReview && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: "rgba(255,163,68,0.08)", border: "1px solid rgba(255,163,68,0.3)", borderRadius: 9, padding: "6px 10px" }}>
              <span style={{ fontSize: 10, color: N.orange, fontWeight: 600 }}>Image change {"\u2014"} send to Ren{"\u00E9"} for review before executing.</span>
              <button onClick={function () {
                var msg = "REVIEW REQUEST \u2014 image change\n" +
                  "Product: " + (d ? d.product : "") + " (" + props.storeName + ")\n" +
                  (props.productUrl ? "Page: " + props.productUrl + "\n" : "") +
                  "\nRecommendation:\n" + (ai.data.recommendation || "") +
                  (ai.data.deliverable ? "\n\nProposed fix:\n" + ai.data.deliverable : "");
                try { navigator.clipboard.writeText(msg); } catch (e) { /* no-op */ }
              }}
                style={{ background: "transparent", border: "1px solid rgba(255,163,68,0.4)", color: N.orange, fontSize: 9, fontWeight: 600, padding: "2px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                Copy for Ren{"\u00E9"}
              </button>
            </div>
          )}
          {ai.data.deliverable && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid " + N.border, borderRadius: 9, padding: "8px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3, gap: 6 }}>
                <div onClick={function () { setOpenFix(!openFix); }} style={{ fontSize: 10, fontWeight: 700, color: N.textS, cursor: "pointer", userSelect: "none" }}>
                  <span style={{ display: "inline-block", width: 14 }}>{openFix ? "\u2212" : "+"}</span>Concrete fix
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <label style={{ background: "transparent", border: "1px solid " + N.border, color: N.textS, fontSize: 9, padding: "2px 8px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>
                    {chartBusy ? "Building\u2026" : "Chart from screenshot"}
                    <input type="file" accept="image/*" style={{ display: "none" }}
                      onChange={function (e) { if (e.target.files && e.target.files[0]) { chartFromScreenshot(e.target.files[0]); e.target.value = ""; } }} />
                  </label>
                  <button disabled={packBusy || !effUrl} onClick={makeImagePack} title={effUrl ? "" : "Paste the product URL below first"}
                    style={{ background: "transparent", border: "1px solid " + N.border, color: effUrl ? N.textS : N.textT, fontSize: 9, padding: "2px 8px", borderRadius: 10, cursor: effUrl ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                    {packBusy ? "Building\u2026" : "Image edit pack (zip)"}
                  </button>
                  <button onClick={function () { try { navigator.clipboard.writeText(ai.data.deliverable); } catch (e) { /* no-op */ } }}
                    style={{ background: "transparent", border: "1px solid " + N.border, color: N.textT, fontSize: 9, padding: "2px 8px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>Copy</button>
                </div>
              </div>
              <input value={manualUrl || props.productUrl || ""} placeholder="Product page URL (auto-filled when found \u2014 paste manually if empty)"
                onChange={function (e) { setManualUrl(e.target.value); }}
                style={{ width: "100%", background: N.bg, border: "1px solid " + N.border, borderRadius: 12, color: N.textS, fontSize: 9.5, fontFamily: "inherit", padding: "4px 8px", outline: "none", marginBottom: 6 }} />
              {chartErr && <div style={{ fontSize: 9, color: N.textT, marginBottom: 4 }}>Size chart: {chartErr}</div>}
              {packErr && <div style={{ fontSize: 9, color: N.textT, marginBottom: 4 }}>Image pack: {packErr}</div>}
              {openFix && <div style={{ fontSize: 11, color: N.text, lineHeight: 1.55, whiteSpace: "pre-wrap", fontVariantNumeric: "tabular-nums" }}>{ai.data.deliverable}</div>}
            </div>
          )}
          <div style={{ fontSize: 9, color: N.textT }}>
            Based on {d.totalComplaints} complaints ({d.withText} with ticket text) {"\u00B7"} {d.orders.toLocaleString()} orders in window
          </div>
        </>
      ) : null}
    </div>
  );
}

function FocusPanel(props) {
  var row = props.row;
  var stA = useState(false); var showForm = stA[0]; var setShowForm = stA[1];
  var stF = useState({ category: "too_small", action: "", expectedEffect: "", notes: "" });
  var form = stF[0]; var setForm = stF[1];
  var stEA = useState(null); var editingAction = stEA[0]; var setEditingAction = stEA[1];

  function startEditAction(a) {
    setForm({ category: a.category || "too_small", action: a.action || "", expectedEffect: a.expectedEffect || "", notes: a.notes || "" });
    setEditingAction(a);
    setShowForm(true);
  }
  var stB = useState(false); var busy = stB[0]; var setBusy = stB[1];
  var stE = useState(""); var err = stE[0]; var setErr = stE[1];
  var stSN = useState(""); var stopNote = stSN[0]; var setStopNote = stSN[1];
  var stSF = useState(false); var showStopForm = stSF[0]; var setShowStopForm = stSF[1];
  var stAll = useState(false); var showAll = stAll[0]; var setShowAll = stAll[1];
  var stSince = useState(false); var showSince = stSince[0]; var setShowSince = stSince[1];
  var stCatF = useState("all"); var catFilter = stCatF[0]; var setCatFilter = stCatF[1];

  var quotes = props.quotes || [];
  var contrib = props.contrib;
  var writeEnabled = !!APPS_SCRIPT_URL;

  // Auto-lookup product URL + first image via the storefront (serverless proxy).
  var stP = useState(null); var prod = stP[0]; var setProd = stP[1];
  var stPD = useState(false); var prodDone = stPD[0]; var setProdDone = stPD[1];
  useEffect(function () {
    setProd(null); setProdDone(!props.storeDomain);
    if (!props.storeDomain) return;
    var alive = true;
    var attempt = function (n) {
      fetch(PRODUCT_LOOKUP_PATH + "?domain=" + encodeURIComponent(props.storeDomain) + "&q=" + encodeURIComponent(row.product))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!alive) return;
          if (j && j.url) { setProd(j); setProdDone(true); }
          else if (n < 2) setTimeout(function () { if (alive) attempt(n + 1); }, 1200); // retry once
          else setProdDone(true);
        })
        .catch(function () {
          if (!alive) return;
          if (n < 2) setTimeout(function () { if (alive) attempt(n + 1); }, 1200);
          else setProdDone(true);
        });
    };
    attempt(1);
    return function () { alive = false; };
  }, [row.key, props.storeDomain]);

  useEffect(function () {
    setAds(null); setAdsErr("");
    if (!prod || !prod.url) return;
    var m = prod.url.match(/\/products\/([a-z0-9-]+)/i);
    if (!m) return;
    var alive = true;
    fetch(NOTION_ADS_PATH + "?handle=" + encodeURIComponent(m[1]) + "&store=" + encodeURIComponent(props.storeName || ""))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!alive) return;
        if (x.j && x.j.found) setAds(x.j);
        else if (x.j && x.j.error) setAdsErr(x.j.error);
        else setAdsErr("no matching row in the ad databases");
      })
      .catch(function (e) { if (alive) setAdsErr(String(e.message || e)); });
    return function () { alive = false; };
  }, [prod && prod.url, props.storeName]);
  var imgSrc = (prod && prod.image) || props.image || "";

  // Factory QC photos + size chart from the Notion backend DB.
  var stPrev = useState(null); var preview = stPrev[0]; var setPreview = stPrev[1];
  var stAds = useState(null); var ads = stAds[0]; var setAds = stAds[1];
  var stSV = useState(false); var showVariants = stSV[0]; var setShowVariants = stSV[1];
  var stAE = useState(""); var adsErr = stAE[0]; var setAdsErr = stAE[1];
  var stQC = useState(null); var qc = stQC[0]; var setQC = stQC[1];
  var stQCE = useState(""); var qcErr = stQCE[0]; var setQCErr = stQCE[1];
  var stQCD = useState(false); var qcDone = stQCD[0]; var setQCDone = stQCD[1];
  useEffect(function () {
    setQC(null); setQCErr(""); setQCDone(false);
    var alive = true;
    fetch(NOTION_QC_PATH + "?pid=" + encodeURIComponent(row.key) + "&store=" + encodeURIComponent(props.storeName || ""))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!alive) return;
        if (x.ok && x.j && x.j.found) setQC(x.j);
        else if (x.j && x.j.error) { setQCErr(x.j.error); console.warn("[notion-qc]", x.j.error); }
        else if (x.ok && x.j && x.j.found === false) { setQCErr("no Notion row matches ID " + row.key); console.warn("[notion-qc] no match for", row.key); }
      })
      .catch(function (e) { if (alive) console.warn("[notion-qc] unreachable (local dev?)", e); })
      .finally(function () { if (alive) setQCDone(true); });
    return function () { alive = false; };
  }, [row.key, props.storeName]);

  var stSaved = useState(false); var savedMsg = stSaved[0]; var setSavedMsg = stSaved[1];
  function submitAction() {
    if (!form.action.trim()) { setErr("Action description is required."); return; }
    setBusy(true); setErr("");
    var doLog = editingAction
      ? Promise.resolve(props.onUndoAction(editingAction)).then(function () { return props.onLogAction(Object.assign({}, form, { week: editingAction.week })); })
      : props.onLogAction(Object.assign({}, form));
    doLog
      .then(function () {
        setBusy(false); setShowForm(false); setEditingAction(null);
        setForm({ category: "too_small", action: "", expectedEffect: "", notes: "" });
        setSavedMsg(true);
        setTimeout(function () { setSavedMsg(false); if (props.onClose) props.onClose(); }, 1100);
      })
      .catch(function (e) { setBusy(false); setErr(String(e.message || e)); });
  }
  function submitStop() {
    setBusy(true); setErr("");
    props.onStopAds(stopNote)
      .then(function () { setBusy(false); setShowStopForm(false); setStopNote(""); })
      .catch(function (e) { setBusy(false); setErr(String(e.message || e)); });
  }

  var inputStyle = { background: N.bg, border: "1px solid " + N.border, borderRadius: 12, color: N.text, fontSize: 11, fontFamily: "inherit", padding: "6px 8px", outline: "none", width: "100%" };
  var btnStyle = function (color, bg, border) {
    return { background: bg, border: "1px solid " + border, color: color, fontSize: 10, fontWeight: 600, padding: "5px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" };
  };

  return (
    <div style={{ background: "radial-gradient(700px 300px at 0% 0%, rgba(56,140,255,0.10), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 30%), " + N.bgC, border: "1px solid " + N.borderS, borderRadius: 22, padding: 18, display: "flex", flexDirection: "column", gap: 14, position: "relative", zIndex: 40, boxShadow: "0 30px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(56,140,255,0.10)" }}>

      <div style={{ fontSize: 14, fontWeight: 700, color: N.text, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1 }}>{row.product}</span>
        {qc && qc.notionUrl && <a href={qc.notionUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, fontWeight: 500, color: N.textS, textDecoration: "none" }}>Notion {"\u2197"}</a>}
        {ads && ads.fuzzy && <span style={{ fontSize: 9, color: N.orange }}>(ad-DB match unverified{ads.matchedTitle ? ": \u201C" + ads.matchedTitle + "\u201D" : ""} {"\u2014"} links below may be another product)</span>}
        {props.onClose && (
          <button onClick={props.onClose} style={{ background: "transparent", border: "1px solid " + N.border, color: N.textS, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}>Exit (Esc)</button>
        )}
      </div>
      {qcErr && <div style={{ fontSize: 9, color: N.textT, marginTop: -8 }}>Notion QC: {qcErr}</div>}
      {adsErr && <div style={{ fontSize: 9, color: N.textT, marginTop: -8 }}>Notion ads/competitor: {adsErr} {"\u2014"} deploy the latest api/notion-ads.js if this persists</div>}
      {preview && createPortal(
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", animation: "lbFade 0.15s ease" }}>
          <style>{"@keyframes lbFade{from{opacity:0}to{opacity:1}}@keyframes lbPop{from{opacity:0;transform:scale(0.88)}to{opacity:1;transform:scale(1)}}"}</style>
          <img src={preview} alt="preview" style={{ maxWidth: "92vw", maxHeight: "92vh", width: "auto", height: "auto", objectFit: "contain", borderRadius: 12, boxShadow: "0 16px 64px rgba(0,0,0,0.9)", animation: "lbPop 0.18s cubic-bezier(0.2, 0.8, 0.3, 1)" }} />
        </div>,
        document.body
      )}
      {/* Top row: photo + key stats + AI analysis */}
      <div style={{ display: "grid", gridTemplateColumns: (imgSrc || (qc && qc.qcImages && qc.qcImages.length > 0)) ? "175px 1fr 1fr" : "1fr 1fr", gap: 16, alignItems: "start" }}>
        {(imgSrc || (qc && qc.qcImages && qc.qcImages.length > 0)) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {imgSrc && <img src={imgSrc} alt={row.product} onMouseEnter={function () { setPreview(imgSrc); }} onMouseLeave={function () { setPreview(null); }} style={{ width: 170, height: 170, objectFit: "cover", borderRadius: 10, border: "1px solid " + N.border, background: N.bg, cursor: "zoom-in" }} />}
            {prod && prod.url && (
              <a href={prod.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: N.textS, textDecoration: "none", textAlign: "center" }}>View on site {"\u2197"}</a>
            )}
            {qc && qc.qcImages && qc.qcImages.length > 0 && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, color: N.textT, marginBottom: 4 }}>Factory QC photos</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: 170 }}>
                  {qc.qcImages.slice(0, 4).map(function (u, i) {
                    return (
                      <a key={i} href={u} target="_blank" rel="noreferrer">
                        <img src={u} alt={"QC " + (i + 1)} onMouseEnter={function () { setPreview(u); }} onMouseLeave={function () { setPreview(null); }} style={{ width: 82, height: 82, objectFit: "cover", borderRadius: 12, border: "1px solid " + N.border, background: N.bg, display: "block", cursor: "zoom-in" }} />
                      </a>
                    );
                  })}
                </div>
                {qc.qcImages.length > 4 && <div style={{ fontSize: 8, color: N.textT, marginTop: 2 }}>+{qc.qcImages.length - 4} more in Notion</div>}
              </div>
            )}
            {qc && (qc.sizeChart || qc.updatedSizeChart) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {qc.sizeChart && <a href={qc.sizeChart} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: N.textS, textDecoration: "none" }}>Factory size chart {"\u2197"}</a>}
                {qc.updatedSizeChart && <a href={qc.updatedSizeChart} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: N.textS, textDecoration: "none" }}>Updated size chart {"\u2197"}</a>}
              </div>
            )}
            {ads && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {(ads.adVideos || []).slice(0, 2).map(function (u, i) {
                  return <a key={i} href={u} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: N.textS, textDecoration: "none" }}>Ad video {i + 1} {"\u2197"}</a>;
                })}
                {ads.competitorUrl && <a href={ads.competitorUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: N.textS, textDecoration: "none" }}>Competitor page {"\u2197"}</a>}
                {ads.variantPhotos && ads.variantPhotos.length > 0 && (
                  <div>
                    <div onClick={function () { setShowVariants(!showVariants); }} style={{ fontSize: 9, fontWeight: 600, color: N.textT, margin: "4px 0", cursor: "pointer", userSelect: "none" }}>
                      <span style={{ display: "inline-block", width: 12 }}>{showVariants ? "\u2212" : "+"}</span>Competitor variants (for 1688/Taobao sourcing)
                    </div>
                    {showVariants && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: 170 }}>
                      {ads.variantPhotos.slice(0, 4).map(function (u, i) {
                        return (
                          <a key={i} href={u} target="_blank" rel="noreferrer">
                            <img src={u} alt={"variant " + (i + 1)} onMouseEnter={function () { setPreview(u); }} onMouseLeave={function () { setPreview(null); }}
                              style={{ width: 82, height: 82, objectFit: "cover", borderRadius: 12, border: "1px solid " + N.border, background: N.bg, display: "block", cursor: "zoom-in" }} />
                          </a>
                        );
                      })}
                    </div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {row.scaleRisk && (
              <span title={"Orders just ramped (" + row.scaleRisk.recent2 + " last 2 wks vs " + row.scaleRisk.prev2 + " before). " + row.scaleRisk.recentComplaints + " complaints (" + row.scaleRisk.recentSerious + " serious) in the last 2 wks. With ~2-week shipping, the full complaint wave lands ~2 weeks after scaling."}
                style={{ fontSize: 9, fontWeight: 700, color: N.red, background: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.4)", padding: "2px 8px", borderRadius: 10, letterSpacing: "0.02em" }}>
                SCALE RISK {"\u00B7"} just scaled ({row.scaleRisk.prev2} {"\u2192"} {row.scaleRisk.recent2} orders), early feedback negative
              </span>
            )}
            {row.firstScaleWeek != null && row.freshlyScaled && (
              <span title={"First week with real ad volume"}
                style={{ fontSize: 9, fontWeight: 600, color: N.textS, background: "rgba(255,255,255,0.06)", border: "1px solid " + N.border, padding: "2px 8px", borderRadius: 10 }}>
                First scaled W{row.firstScaleWeek}
              </span>
            )}
            {props.stoppedInfo && (
              <span style={{ fontSize: 9, color: N.red }}>
                stopped {props.stoppedInfo.stoppedDate ? "since " + props.stoppedInfo.stoppedDate : ""}
                {props.stoppedInfo.note ? " \u00B7 " + props.stoppedInfo.note : ""}
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(" + CATEGORIES.length + ", minmax(0, 1fr))", gap: 6 }}>
            {[
              { label: "Orders 14d", value: row.orders7d != null ? row.orders7d.toLocaleString() : "\u2014" },
              { label: "In hands (2wk+)", value: row.orders.toLocaleString() },
              { label: "Complaints", value: row.complaints },
              { label: "Total %", value: row.sampleSmall ? row.complaints + "\u00D7" : fmtPct(row.pct), color: row.pct >= KILL_TOTAL_THRESHOLD && !row.sampleSmall ? N.red : N.text },
              { label: "Refund rate", value: contrib && contrib.refundRate != null ? fmtPct(contrib.refundRate) : "\u2014", color: contrib && contrib.refundRate != null && contrib.refundRate >= 10 ? N.red : N.text },
            ].map(function (s) {
              return (
                <div key={s.label} style={{ background: N.bg, border: "1px solid " + N.border, borderRadius: 9, padding: "7px 9px", textAlign: "center" }}>
                  <div style={{ fontSize: 8.5, color: N.textT, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color || N.text, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                </div>
              );
            })}
          </div>
          <div>
            <CategoryGrid row={row} zones={props.zones} sampleSmall={row.sampleSmall} />
            <div style={{ fontSize: 9, color: N.textT, marginTop: 4, lineHeight: 1.5 }}>
              What percentage of people who had the product in their hands complained?
            </div>
            {props.aiData && props.aiData.sinceEdit && (
              <div style={{ marginTop: 6 }}>
                <button onClick={function () { setShowSince(!showSince); }}
                  style={{ background: "transparent", border: "1px solid " + N.border, color: N.textS, fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {showSince ? "\u2212" : "+"} since last edit (W{props.aiData.sinceEdit.week})
                </button>
                {showSince && (
                  <div style={{ marginTop: 6 }}>
                    <CategoryGrid zones={props.zones} row={CATEGORIES.reduce(function (m, c) {
                      var pc = props.aiData.sinceEdit.perCat[c.key] || { count: 0, pct: 0 };
                      m[c.key] = pc.pct; m[c.key + "_count"] = pc.count; return m;
                    }, {})} />
                    {props.aiData.sinceEdit.tooEarly ? (
                      <div style={{ fontSize: 9, color: N.orange, marginTop: 3 }}>Too early {"\u2014"} no post-edit orders with feedback yet.</div>
                    ) : (
                      <div style={{ fontSize: 9, color: N.textT, marginTop: 3 }}>
                        Complaints matched to orders placed since the W{props.aiData.sinceEdit.week} edit ({props.aiData.sinceEdit.orders} orders)
                        {props.aiData.sinceEdit.inFlight > 0 ? " \u00B7 " + props.aiData.sinceEdit.inFlight + " newer complaint(s) excluded \u2014 their orders predate the edit" : ""}
                        {" \u00B7 " + props.aiData.sinceEdit.exactDatePct + "% exact order dates, rest week\u22122 fallback"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <AIPanel aiData={props.aiData} rowKey={row.key} storeName={props.storeName}
            productUrl={prod && prod.url ? prod.url : ""}
            ready={qcDone && prodDone}
            visuals={{
              marketing: imgSrc || null,
              qcImages: qc && qc.qcImages ? qc.qcImages.slice(0, 2) : [],
              sizeChart: qc ? (qc.updatedSizeChart || qc.sizeChart) : null,
              variantPhotos: ads && ads.variantPhotos ? ads.variantPhotos.slice(0, 2) : [],
              hasAdVideo: !!(ads && ads.adVideos && ads.adVideos.length > 0),
              hasCompetitor: !!(ads && ads.competitorUrl),
            }} />
          {!imgSrc && prod && prod.url && (
            <a href={prod.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: N.textS, textDecoration: "none" }}>View on site {"\u2197"}</a>
          )}
        </div>
      </div>

      {/* Action history + log buttons */}
      <div style={{ borderTop: "1px solid " + N.border, paddingTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: N.textS }}>Edit history</div>
          <div style={{ display: "flex", gap: 8 }}>
            {writeEnabled ? (
              <>
                <button onClick={function () { setShowForm(!showForm); setShowStopForm(false); }} style={btnStyle(N.blue, "rgba(56,140,255,0.12)", "rgba(56,140,255,0.35)")}>+ Log action</button>
                {!props.stoppedInfo && (
                  <button onClick={function () { setShowStopForm(!showStopForm); setShowForm(false); }} style={btnStyle(N.textS, "transparent", N.border)}>Stop advertising</button>
                )}
                {props.stoppedInfo && props.stoppedInfo.uuid && props.stoppedInfo.uuid.indexOf("dash-") === 0 && (
                  <button onClick={function () { props.onUndoStop(props.stoppedInfo); }} style={btnStyle(N.textS, "transparent", N.border)}>{"\u21BA"} Undo stop</button>
                )}
              </>
            ) : (
              <span style={{ fontSize: 9, color: N.textT, fontStyle: "italic" }}>Set APPS_SCRIPT_URL to log actions from here</span>
            )}
          </div>
        </div>
        {err && <div style={{ fontSize: 10, color: N.red, marginBottom: 6 }}>{err}</div>}
        {savedMsg && <div style={{ fontSize: 11, color: N.green, fontWeight: 600, marginBottom: 6 }}>Saved {"\u2713"} {"\u2014"} logged to the sheet, status set to Edited. Closing{"\u2026"}</div>}
        {showForm && (
          <div style={{ background: N.bg, border: "1px solid " + N.border, borderRadius: 10, padding: 12, marginBottom: 10, display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 8, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 9, color: N.textT, marginBottom: 4 }}>Category</div>
              <select value={form.category} onChange={function (e) { setForm(Object.assign({}, form, { category: e.target.value })); }} style={inputStyle}>
                {CATEGORIES.map(function (c) { return <option key={c.key} value={c.key}>{c.label}</option>; })}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, color: N.textT, marginBottom: 4 }}>Action *</div>
              <input value={form.action} placeholder="e.g. Supplier ships 1 size up" onChange={function (e) { setForm(Object.assign({}, form, { action: e.target.value })); }} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: N.textT, marginBottom: 4 }}>Expected effect</div>
              <input value={form.expectedEffect} placeholder="e.g. -50% too_small" onChange={function (e) { setForm(Object.assign({}, form, { expectedEffect: e.target.value })); }} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / span 2" }}>
              <div style={{ fontSize: 9, color: N.textT, marginBottom: 4 }}>Notes</div>
              <input value={form.notes} onChange={function (e) { setForm(Object.assign({}, form, { notes: e.target.value })); }} style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy} onClick={submitAction} style={btnStyle(N.quiet.text, N.quiet.bg, N.quiet.border)}>{busy ? "Saving\u2026" : (editingAction ? "Update log entry" : "Save to sheet")}</button>
              <button disabled={busy} onClick={function () { setShowForm(false); }} style={btnStyle(N.textS, "transparent", N.border)}>Cancel</button>
            </div>
          </div>
        )}
        {showStopForm && (
          <div style={{ background: N.bg, border: "1px solid rgba(255,107,107,0.25)", borderRadius: 10, padding: 12, marginBottom: 10, display: "flex", gap: 8, alignItems: "end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: N.textT, marginBottom: 4 }}>Reason / note</div>
              <input value={stopNote} placeholder="e.g. Quality complaints 12% - killing" onChange={function (e) { setStopNote(e.target.value); }} style={inputStyle} />
            </div>
            <button disabled={busy} onClick={submitStop} style={btnStyle("#fff", N.red, N.red)}>{busy ? "Saving\u2026" : "Confirm stop"}</button>
            <button disabled={busy} onClick={function () { setShowStopForm(false); }} style={btnStyle(N.textS, "transparent", N.border)}>Cancel</button>
          </div>
        )}
        <ActionHistory items={props.actionItems} onUndo={props.onUndoAction} onEdit={startEditAction} />
      </div>

      {/* All complaints, 1 row each */}
      <div style={{ borderTop: "1px solid " + N.border, paddingTop: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={function () { setShowAll(!showAll); }}
            style={{ background: "transparent", border: "1px solid " + N.border, color: N.textS, fontSize: 10, fontWeight: 600, padding: "4px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {showAll ? "Hide" : "Show"} all complaints ({(props.allRows || []).length}) {showAll ? "\u25B4" : "\u25BE"}
          </button>
          {showAll && (
            <select value={catFilter} onChange={function (e) { setCatFilter(e.target.value); }}
              style={{ background: N.bg, border: "1px solid " + N.border, borderRadius: 12, color: N.textS, fontSize: 10, fontFamily: "inherit", padding: "4px 8px", outline: "none" }}>
              <option value="all">All categories</option>
              {CATEGORIES.map(function (c) { return <option key={c.key} value={c.key}>{c.label}</option>; })}
            </select>
          )}
        </div>
        {showAll && (
          <div style={{ marginTop: 8, maxHeight: 260, overflowY: "auto", border: "1px solid " + N.border, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr>
                  {["Week", "Category", "Ticket text"].map(function (h) {
                    return <th key={h} style={{ background: N.bgS, color: N.textS, fontWeight: 600, fontSize: 9, textAlign: "left", padding: "6px 10px", position: "sticky", top: 0 }}>{h}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {(props.allRows || []).filter(function (c) { return catFilter === "all" || c.type === catFilter; }).map(function (c, i) {
                  var cat = CATEGORIES.find(function (x) { return x.key === c.type; });
                  return (
                    <tr key={i}>
                      <td style={{ padding: "5px 10px", color: N.textS, borderBottom: "1px solid " + N.border, whiteSpace: "nowrap" }}>W{c.week != null ? c.week : "?"}</td>
                      <td style={{ padding: "5px 10px", color: N.textS, borderBottom: "1px solid " + N.border, whiteSpace: "nowrap" }}>{cat ? cat.label : c.type}</td>
                      <td style={{ padding: "5px 10px", color: N.textS, borderBottom: "1px solid " + N.border }}>{c.summary || "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   FLOATING WIDGETS — AI chat + report generator
   ══════════════════════════════════════════ */
function FloatingWidgets(props) {
  var stOpen = useState(null); var open = stOpen[0]; var setOpen = stOpen[1]; // null | "chat" | "reports"
  var stMsgs = useState([]); var msgs = stMsgs[0]; var setMsgs = stMsgs[1];
  var stIn = useState(""); var input = stIn[0]; var setInput = stIn[1];
  var stBusy = useState(false); var busy = stBusy[0]; var setBusy = stBusy[1];
  var stRep = useState({ loading: false, text: "", error: "" }); var rep = stRep[0]; var setRep = stRep[1];
  var stFb = useState([]); var fbMsgs = stFb[0]; var setFbMsgs = stFb[1];
  var stFbIn = useState(""); var fbInput = stFbIn[0]; var setFbInput = stFbIn[1];
  var stFbBusy = useState(false); var fbBusy = stFbBusy[0]; var setFbBusy = stFbBusy[1];
  var stFbRule = useState(null); var proposedRule = stFbRule[0]; var setProposedRule = stFbRule[1];
  var stRules = useState(getCustomRules); var rules = stRules[0]; var setRules = stRules[1];

  function sendFeedback() {
    var q = fbInput.trim();
    if (!q || fbBusy) return;
    var next = fbMsgs.concat([{ role: "user", content: q }]);
    setFbMsgs(next); setFbInput(""); setFbBusy(true); setProposedRule(null);
    fetch(FEEDBACK_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next.slice(-16), rules: rules }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      setFbBusy(false);
      setFbMsgs(next.concat([{ role: "assistant", content: j.reply || j.error || "No response" }]));
      if (j.proposedRule) setProposedRule(j.proposedRule);
    }).catch(function (e) {
      setFbBusy(false);
      setFbMsgs(next.concat([{ role: "assistant", content: "Unavailable (" + String(e.message || e) + "). Works on the deployed Vercel site." }]));
    });
  }
  function addRule(r) {
    var next = rules.concat([r]);
    setRules(next); saveCustomRules(next); setProposedRule(null);
  }
  function removeRule(i) {
    var next = rules.slice(); next.splice(i, 1);
    setRules(next); saveCustomRules(next);
  }

  var stNotes = useState(function () {
    try { return window.localStorage.getItem("rene-report-notes") || ""; } catch (e) { return ""; }
  });
  var notes = stNotes[0]; var setNotes = stNotes[1];
  function saveNotes(v) {
    setNotes(v);
    try { window.localStorage.setItem("rene-report-notes", v); } catch (e) { /* no-op */ }
  }

  function send() {
    var q = input.trim();
    if (!q || busy) return;
    var next = msgs.concat([{ role: "user", content: q }]);
    setMsgs(next); setInput(""); setBusy(true);
    fetch(CHAT_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next.slice(-20), context: props.chatContext }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      setBusy(false);
      setMsgs(next.concat([{ role: "assistant", content: j.text || j.error || "No response" }]));
    }).catch(function (e) {
      setBusy(false);
      setMsgs(next.concat([{ role: "assistant", content: "Chat unavailable (" + String(e.message || e) + "). Works on the deployed Vercel site." }]));
    });
  }

  function makeReport(type) {
    setRep({ loading: true, text: "", error: "" });
    fetch(REPORT_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: type, data: props.reportData }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) setRep({ loading: false, text: "", error: j.error });
      else setRep({ loading: false, text: j.text || "", error: "" });
    }).catch(function (e) {
      setRep({ loading: false, text: "", error: "Unavailable (" + String(e.message || e) + "). Works on the deployed Vercel site." });
    });
  }

  var panelBase = { position: "fixed", right: 14, bottom: 60, width: 400, maxWidth: "90vw", maxHeight: "72vh", background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0) 30%), " + N.bgC, border: "1px solid " + N.borderS, borderRadius: 20, display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.65)", zIndex: 50 };
  var fabStyle = function (active) {
    return { background: active ? "rgba(255,255,255,0.12)" : N.bgC, border: "1px solid " + N.border, color: N.textS, fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" };
  };

  return (
    <>
      <div style={{ position: "fixed", right: 14, bottom: 14, display: "flex", gap: 8, zIndex: 51 }}>
        <button onClick={function () { setOpen(open === "chat" ? null : "chat"); }} style={fabStyle(open === "chat")}>AI chat</button>
        <button onClick={function () { setOpen(open === "reports" ? null : "reports"); }} style={fabStyle(open === "reports")}>Reports</button>
        <button onClick={function () { setOpen(open === "notes" ? null : "notes"); }} style={fabStyle(open === "notes")}>
          Notes{notes.trim() ? " \u2022" : ""}
        </button>
        <button onClick={function () { setOpen(open === "feedback" ? null : "feedback"); }} style={fabStyle(open === "feedback")}>Analysis feedback</button>
      </div>

      {open === "chat" && (
        <div style={panelBase}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid " + N.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: N.text }}>
              AI chat {props.chatContext && props.chatContext.product ? "\u00B7 " + props.chatContext.product : "\u00B7 " + (props.storeName || "")}
            </div>
            <button onClick={function () { setMsgs([]); }} style={{ background: "transparent", border: "1px solid " + N.border, color: N.textT, fontSize: 9, padding: "2px 8px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, minHeight: 180 }}>
            {msgs.length === 0 && (
              <div style={{ fontSize: 10.5, color: N.textT, lineHeight: 1.5 }}>
                {props.chatContext && props.chatContext.product
                  ? "Ask about this product. Paste a size chart to adjust it, or ask for an image-edit prompt."
                  : "Open a product (click its title) to chat about it, or ask a general question about this store."}
              </div>
            )}
            {msgs.map(function (m, i) {
              return (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", background: m.role === "user" ? "rgba(56,140,255,0.15)" : N.bg, border: "1px solid " + N.border, borderRadius: 10, padding: "5px 7px", fontSize: 11, color: N.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {m.content}
                </div>
              );
            })}
            {busy && <div style={{ fontSize: 10, color: N.textT }}>Thinking{"\u2026"}</div>}
          </div>
          <div style={{ padding: 10, borderTop: "1px solid " + N.border, display: "flex", gap: 8 }}>
            <textarea value={input} rows={2} placeholder="Type here (Enter to send, Shift+Enter for a new line)"
              onChange={function (e) { setInput(e.target.value); }}
              onKeyDown={function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              style={{ flex: 1, background: N.bg, border: "1px solid " + N.border, borderRadius: 9, color: N.text, fontSize: 11, fontFamily: "inherit", padding: "7px 9px", outline: "none", resize: "none" }} />
            <button onClick={send} disabled={busy} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid " + N.border, color: N.text, fontSize: 11, fontWeight: 600, padding: "0 14px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>Send</button>
          </div>
        </div>
      )}

      {open === "feedback" && (
        <div style={panelBase}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid " + N.border }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: N.text }}>Provide feedback on the analysis</div>
            <div style={{ fontSize: 9, color: N.textT, marginTop: 2 }}>Push back in plain language. Settled feedback becomes a rule that steers every future analysis.</div>
          </div>
          {rules.length > 0 && (
            <div style={{ padding: "8px 14px", borderBottom: "1px solid " + N.border, maxHeight: 120, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: N.textT }}>Active rules ({rules.length})</span>
                <button onClick={function () { try { navigator.clipboard.writeText(rules.map(function (r) { return "- " + r; }).join("\n")); } catch (e) { /* no-op */ } }}
                  title="Copy all rules \u2014 paste them into api/ai.js in GitHub to make them permanent defaults"
                  style={{ background: "transparent", border: "1px solid " + N.border, color: N.textT, fontSize: 8.5, padding: "1px 7px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>Copy all (for GitHub)</button>
              </div>
              {rules.map(function (r, i) {
                return (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 10, color: N.textS, padding: "2px 0" }}>
                    <span style={{ flex: 1 }}>{r}</span>
                    <button onClick={function () { removeRule(i); }} title="Remove rule"
                      style={{ background: "transparent", border: "none", color: N.textT, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{"\u00D7"}</button>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, minHeight: 140 }}>
            {fbMsgs.length === 0 && (
              <div style={{ fontSize: 10.5, color: N.textT, lineHeight: 1.5 }}>
                Example: {"\u201C"}When both sizing directions are low, stop suggesting chart changes at all.{"\u201D"}
              </div>
            )}
            {fbMsgs.map(function (m, i) {
              return (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", background: m.role === "user" ? "rgba(56,140,255,0.15)" : N.bg, border: "1px solid " + N.border, borderRadius: 10, padding: "7px 10px", fontSize: 11, color: N.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {m.content}
                </div>
              );
            })}
            {fbBusy && <div style={{ fontSize: 10, color: N.textT }}>Thinking{"\u2026"}</div>}
            {proposedRule && (
              <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: 10, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: N.green, marginBottom: 3 }}>Proposed rule</div>
                <div style={{ fontSize: 11, color: N.text, lineHeight: 1.5, marginBottom: 6 }}>{proposedRule}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={function () { addRule(proposedRule); }}
                    style={{ background: "rgba(52,211,153,0.16)", border: "1px solid rgba(52,211,153,0.45)", color: N.green, fontSize: 10, fontWeight: 700, padding: "3px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}>Add rule</button>
                  <button onClick={function () { setProposedRule(null); }}
                    style={{ background: "transparent", border: "1px solid " + N.border, color: N.textS, fontSize: 10, padding: "3px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: 10, borderTop: "1px solid " + N.border, display: "flex", gap: 8 }}>
            <textarea value={fbInput} rows={2} placeholder="Your pushback on an analysis (Enter to send)"
              onChange={function (e) { setFbInput(e.target.value); }}
              onKeyDown={function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFeedback(); } }}
              style={{ flex: 1, background: N.bg, border: "1px solid " + N.border, borderRadius: 9, color: N.text, fontSize: 11, fontFamily: "inherit", padding: "7px 9px", outline: "none", resize: "none" }} />
            <button onClick={sendFeedback} disabled={fbBusy} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid " + N.border, color: N.text, fontSize: 11, fontWeight: 600, padding: "0 14px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>Send</button>
          </div>
        </div>
      )}

      {open === "notes" && (
        <div style={panelBase}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid " + N.border, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: N.text }}>Notes for Ren{"\u00E9"}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {props.chatContext && props.chatContext.product && (
                <button onClick={function () {
                  var line = "\u2022 " + props.chatContext.product + " (" + (props.storeName || "") + "): ";
                  saveNotes(notes ? notes.replace(/\s*$/, "") + "\n" + line : line);
                }} style={{ background: "transparent", border: "1px solid " + N.border, color: N.textT, fontSize: 9, padding: "2px 8px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>+ product line</button>
              )}
              <button onClick={function () { try { navigator.clipboard.writeText(notes); } catch (e) { /* no-op */ } }}
                style={{ background: "transparent", border: "1px solid " + N.border, color: N.textT, fontSize: 9, padding: "2px 8px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>Copy</button>
              <button onClick={function () { if (window.confirm("Clear all notes? This cannot be undone.")) saveNotes(""); }}
                style={{ background: "transparent", border: "1px solid " + N.border, color: N.textT, fontSize: 9, padding: "2px 8px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
            </div>
          </div>
          <textarea value={notes} placeholder={"Notes for the weekly report to Ren\u00E9 \u2014 autosaved, survives store switches and refreshes.\n\n\u2022 Marivela bikini: sourcing different factory, waiting on WIIO\n\u2022 ..."}
            onChange={function (e) { saveNotes(e.target.value); }}
            style={{ flex: 1, minHeight: 260, background: N.bg, border: "none", color: N.text, fontSize: 11.5, lineHeight: 1.6, fontFamily: "inherit", padding: 12, outline: "none", resize: "none" }} />
          <div style={{ padding: "6px 14px", borderTop: "1px solid " + N.border, fontSize: 9, color: N.textT }}>Autosaved {"\u00B7"} shared across both stores {"\u00B7"} never cleared automatically</div>
        </div>
      )}

      {open === "reports" && (
        <div style={panelBase}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid " + N.border, fontSize: 11, fontWeight: 700, color: N.text }}>Reports {"\u00B7"} {props.storeName || ""}</div>
          <div style={{ padding: 12, display: "flex", gap: 8, borderBottom: "1px solid " + N.border }}>
            <button onClick={function () { makeReport("ceo"); }} style={fabStyle(false)}>CEO report</button>
            <button onClick={function () { makeReport("risk"); }} style={fabStyle(false)}>High-risk new products</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 14, minHeight: 160 }}>
            {rep.loading ? (
              <div style={{ fontSize: 11, color: N.textS }}>Writing report{"\u2026"}</div>
            ) : rep.error ? (
              <div style={{ fontSize: 10.5, color: N.textS }}>{rep.error}</div>
            ) : rep.text ? (
              <div style={{ fontSize: 11.5, color: N.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{rep.text}</div>
            ) : (
              <div style={{ fontSize: 10.5, color: N.textT, lineHeight: 1.6 }}>
                CEO report: the most important actions, go / no-go calls to make, and products where complaints are rising fast.{"\n\n"}High-risk: products live only 1{"\u2013"}2 weeks that already get sizing complaints.
              </div>
            )}
          </div>
          {rep.text && (
            <div style={{ padding: 10, borderTop: "1px solid " + N.border }}>
              <button onClick={function () { try { navigator.clipboard.writeText(rep.text); } catch (e) { /* no-op */ } }} style={fabStyle(false)}>Copy</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════ */
export default function ComplaintDashboard() {
  var stC = useState([]); var allComplaints = stC[0]; var setAllComplaints = stC[1];
  var stO = useState([]); var allOrders = stO[0]; var setAllOrders = stO[1];
  var stA = useState([]); var sheetActions = stA[0]; var setSheetActions = stA[1];
  var stL = useState(true); var loading = stL[0]; var setLoading = stL[1];
  var stLE = useState(""); var loadErr = stLE[0]; var setLoadErr = stLE[1];
  var stT = useState("USA General Stores"); var title = stT[0]; var setTitle = stT[1];
  var stW = useState([1, 8]); var weekRange = stW[0]; var setWeekRange = stW[1];
  var stMinSales = useState(15); var minSales = stMinSales[0]; var setMinSales = stMinSales[1];
  var stHover = useState(null); var hoveredProduct = stHover[0]; var setHoveredProduct = stHover[1];
  var stZ = useState(DEFAULT_ZONES); var zones = stZ[0]; var setZones = stZ[1];
  var stSrc = useState("loading"); var dataSrc = stSrc[0]; var setDataSrc = stSrc[1];
  var stStore = useState(0); var selectedStore = stStore[0]; var setSelectedStore = stStore[1];
  var stChecked = useState(function () { return loadCheckedProducts(); });
  var checkedState = stChecked[0]; var setCheckedState = stChecked[1];
  var stStopped = useState({}); var sheetStopped = stStopped[0]; var setSheetStopped = stStopped[1];

  // NEW state
  var stFocus = useState(null); var focusedProduct = stFocus[0]; var setFocusedProduct = stFocus[1];
  var stSort = useState("orders7d"); var sortBy = stSort[0]; var setSortBy = stSort[1];
  var stDir = useState("desc"); var sortDir = stDir[0]; var setSortDir = stDir[1];
  var stSf = useState("active"); var statusFilter = stSf[0]; var setStatusFilter = stSf[1];
  var stClosing = useState(false); var closing = stClosing[0]; var setClosing = stClosing[1];
  var lastRowRef = useRef(null);
  var closeRef = useRef(null);
  var stToast = useState(null); var toast = stToast[0]; var setToast = stToast[1];
  var stRun = useState({ running: false, done: 0, total: 0 }); var runState = stRun[0]; var setRunState = stRun[1];
  var stContrib = useState({}); var contribData = stContrib[0]; var setContribData = stContrib[1];
  // Optimistic writes (appear instantly, survive until CSV reload confirms them)
  var stLA = useState([]); var localActions = stLA[0]; var setLocalActions = stLA[1];
  var stLS = useState({}); var localStopped = stLS[0]; var setLocalStopped = stLS[1];

  function toggleChecked(product) {
    setCheckedState(function (prev) {
      var nextProducts = Object.assign({}, prev.products);
      var checking = !nextProducts[product];
      if (checking) nextProducts[product] = true;
      else delete nextProducts[product];
      var next = { weekAnchor: prev.weekAnchor, products: nextProducts };
      saveCheckedProducts(next);
      if (checking) {
        var allDone = heatmapData.length > 0 && heatmapData.every(function (r) { return !!nextProducts[r.key]; });
        var checkedCount = heatmapData.filter(function (r) { return !!nextProducts[r.key]; }).length;
        setTimeout(function () {
          if (!allDone && checkedCount > 0 && checkedCount % 10 === 0) {
            confetti({ particleCount: 90, spread: 90, origin: { y: 0.7 } });
            confetti({ particleCount: 30, angle: 60, spread: 55, origin: { x: 0, y: 0.8 } });
            confetti({ particleCount: 30, angle: 120, spread: 55, origin: { x: 1, y: 0.8 } });
            showToast(checkedCount + " reviewed! Keep going \u2014 future customers thank you.", 3200);
            return;
          }
          if (allDone) {
            // Confetti cannon — the whole list is reviewed
            var end = Date.now() + 1200;
            (function frame() {
              confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } });
              confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } });
              if (Date.now() < end) requestAnimationFrame(frame);
            })();
            confetti({ particleCount: 140, spread: 100, origin: { y: 0.6 } });
            showToast("Killing it! Fewer refunds, fewer complaints \u2014 all because of you.", 4200);
          } else {
            confetti({ particleCount: 35, spread: 55, startVelocity: 28, origin: { y: 0.85 }, scalar: 0.8 });
            showToast("Great job! Our future customers for this product will thank you.");
          }
        }, 0);
      }
      return next;
    });
  }
  function resetChecked() {
    var next = { weekAnchor: getCurrentMondayISO(), products: {} };
    setCheckedState(next);
    saveCheckedProducts(next);
  }

  useEffect(function () {
    setLoading(true);
    setFocusedProduct(null);
    async function loadData() {
      var t0 = Date.now();
      var comps = [], ords = [], acts = [], fetched = false;
      var store = STORE_CSVS[selectedStore];
      var grab = async function (url) {
        if (!url) return null;
        for (var att = 1; att <= 3; att++) {
          try {
            var r = await fetchT(url);
            var txt = await r.text();
            if (txt && txt.length > 0) return txt;
          } catch (e) {
            console.warn("[load] attempt " + att + "/3 failed:", String(url).slice(0, 60), e.message || e);
          }
          if (att < 3) await new Promise(function (res) { setTimeout(res, 1500 * att); });
        }
        return null;
      };
      // ALL CSVs in parallel — one round trip instead of seven sequential ones
      var res = await Promise.all([
        grab(store && store.complaintsUrl),
        grab(store && store.ordersUrl),
        grab(store && store.contribUrl),
        grab(COMPLAINT_DETAIL_CSV_URL),
        grab(ACTIONS_CSV_URL),
        grab(STOPPED_ADS_CSV_URL),
        grab(CONFIG_CSV_URL),
      ]);
      console.log("[load] all CSVs fetched in " + (Date.now() - t0) + "ms");
      var cT = res[0], oT = res[1], mT = res[2], dT = res[3], aT = res[4], stoppedT = res[5], cfgT = res[6];
      try {
        if (cT) {
          var cD = parseComplaintsCSV(cT, store.name);
          console.log("[load] complaints parsed: " + cD.length + " rows, with order date: " + cD.filter(function (x) { return x.orderWeek != null; }).length);
          if (cD.length > 0) { comps = comps.concat(cD); fetched = true; }
        }
        if (oT) {
          var oD = parseOrdersCSV(oT);
          console.log("[load] orders parsed: " + oD.length + " products");
          if (oD.length > 0) { ords = ords.concat(oD); fetched = true; }
        }
      } catch (e) { console.error("Store load fail:", store && store.name, e); }
      try {
        if (mT) {
          var cm = parseContribCSV(mT);
          console.log("[contrib] parsed " + Object.keys(cm).length + " rows from margin CSV");
          setContribData(cm);
        } else setContribData({});
      } catch (e) { setContribData({}); }
      try {
        if (dT) {
          var dD = parseComplaintsCSV(dT, store ? store.name : "");
          comps = comps.concat(dD.filter(function (c) { return c.summary; }).map(function (c) { return Object.assign({}, c, { detailOnly: true }); }));
        }
      } catch (e) { /* no-op */ }
      try { if (aT) acts = parseActionsCSV(aT); } catch (e) { /* no-op */ }
      try { if (stoppedT) setSheetStopped(parseStoppedAdsCSV(stoppedT)); } catch (e) { /* no-op */ }
      try {
        if (cfgT) {
          var cfg = parseConfigCSV(cfgT, DEFAULT_ZONES);
          setZones(cfg.zones);
          if (cfg.minSales != null) setMinSales(cfg.minSales);
        }
      } catch (e) { /* no-op */ }
      if (store) setTitle(store.name);
      var missing = [];
      if (store && store.complaintsUrl && !cT) missing.push("complaints");
      if (store && store.ordersUrl && !oT) missing.push("orders");
      setLoadErr(missing.length > 0 ? "The " + missing.join(" + ") + " CSV failed to load after 3 attempts \u2014 Google's publish endpoint is briefly unavailable (common right after big sheet edits). Refresh in a minute; numbers shown may be incomplete until then." : "");

      if (!fetched || comps.length === 0) {
        var demo = genDemo();
        comps = demo.complaints;
        ords = demo.orders;
        if (acts.length === 0) acts = demo.actions;
        setDataSrc("demo");
      } else {
        setDataSrc("live");
      }

      setAllComplaints(comps);
      setAllOrders(ords);
      setSheetActions(acts);
      // Drop optimistic entries the sheet now knows about
      setLocalActions(function (prev) { return prev.filter(function (la) { return !acts.some(function (a) { return a.uuid && a.uuid === la.uuid; }); }); });
      var weeks = comps.filter(function (c) { return !c.detailOnly; }).map(function (c) { return c.week; }).filter(function (w) { return w != null; });
      if (weeks.length > 0) {
        var wmin = Infinity, wmax = -Infinity;
        for (var wi = 0; wi < weeks.length; wi++) { if (weeks[wi] < wmin) wmin = weeks[wi]; if (weeks[wi] > wmax) wmax = weeks[wi]; }
        setWeekRange([wmin, wmax]);
      }
      setLoading(false);
    }
    loadData().catch(function (e) {
      console.error("[load] fatal:", e);
      setLoadErr(String((e && e.message) || e));
      setLoading(false); // never leave the spinner hanging — fall through to demo/empty state
    });
  }, [selectedStore]);

  // Merge sheet + optimistic local state
  var actions = useMemo(function () { return sheetActions.concat(localActions); }, [sheetActions, localActions]);
  var stoppedAds = useMemo(function () {
    var m = Object.assign({}, sheetStopped);
    Object.keys(localStopped).forEach(function (k) { if (localStopped[k] === null) delete m[k]; else m[k] = localStopped[k]; });
    return m;
  }, [sheetStopped, localStopped]);

  var availableWeeks = useMemo(function () {
    var ws = new Set();
    allComplaints.forEach(function (c) { if (c.week && !c.detailOnly) ws.add(c.week); });
    allOrders.forEach(function (o) { Object.keys(o.weekOrders).forEach(function (w) { ws.add(parseInt(w)); }); });
    return Array.from(ws).sort(function (a, b) { return a - b; });
  }, [allComplaints, allOrders]);

  // Merged per-key week orders + image + latest data week
  var ordersByKey = useMemo(function () {
    var map = {};
    allOrders.forEach(function (o) {
      if (!map[o.key]) map[o.key] = { weekOrders: {}, image: "" };
      Object.keys(o.weekOrders).forEach(function (w) {
        map[o.key].weekOrders[w] = (map[o.key].weekOrders[w] || 0) + o.weekOrders[w];
      });
      if (o.image && !map[o.key].image) map[o.key].image = o.image;
    });
    return map;
  }, [allOrders]);

  var latestDataWeek = useMemo(function () {
    var mx = 0;
    Object.keys(ordersByKey).forEach(function (k) {
      Object.keys(ordersByKey[k].weekOrders).forEach(function (w) { mx = Math.max(mx, parseInt(w)); });
    });
    return mx;
  }, [ordersByKey]);


  var complaints = useMemo(function () {
    // Numerator matches the denominator's order window exactly: a complaint counts in the
    // window its ORDER was placed in (exact date when enriched, week-2 fallback otherwise).
    // MATURED window: only orders placed >= 2 weeks ago count — those customers HAVE the
    // product in hand and could have complained. Rate = "what % of people holding it complained?"
    var lo = Math.max(1, weekRange[0] - LAG_WEEKS);
    var hi = Math.max(1, (latestDataWeek || weekRange[1]) - LAG_WEEKS);
    return allComplaints.filter(function (c) {
      if (c.detailOnly) return false;
      var ow = effOrderWeek(c);
      return ow != null && ow >= lo && ow <= hi;
    });
  }, [allComplaints, weekRange, latestDataWeek]);

  // Denominator = MATURED orders only (placed through latestDataWeek - 2): the customers who
  // actually hold the product. Recent buyers can't have complained yet and must not dilute the rate.
  var ordersWR = [Math.max(1, weekRange[0] - LAG_WEEKS), Math.max(1, (latestDataWeek || weekRange[1]) - LAG_WEEKS)];

  var orderTotals = useMemo(function () {
    var map = {};
    Object.keys(ordersByKey).forEach(function (k) {
      var t = 0;
      for (var w = ordersWR[0]; w <= ordersWR[1]; w++) t += ordersByKey[k].weekOrders[w] || 0;
      map[k] = t;
    });
    return map;
  }, [ordersByKey, ordersWR[0], ordersWR[1]]);

  var titleByKey = useMemo(function () {
    var map = {};
    allOrders.forEach(function (o) { if (o.key && o.title) map[o.key] = o.title; });
    function fill(key, t) { if (key && t && !map[key]) map[key] = t; }
    allComplaints.forEach(function (c) { fill(c.key, c.title); });
    actions.forEach(function (a) { fill(a.key, a.title); });
    Object.keys(stoppedAds).forEach(function (k) { fill(k, stoppedAds[k].title); });
    return map;
  }, [allOrders, allComplaints, actions, stoppedAds]);

  // Recently-edited lookup (last EDITED_WINDOW_DAYS)
  var editedRecently = useMemo(function () {
    var map = {};
    var now = Date.now();
    var curW = currentWeekNum();
    actions.forEach(function (a) {
      var recent = false;
      if (a.date) {
        var d = new Date(a.date);
        if (!isNaN(d.getTime())) recent = (now - d.getTime()) <= EDITED_WINDOW_DAYS * 86400000;
      }
      if (!recent && a.week != null) recent = a.week >= curW - 1;
      if (recent) map[a.key] = true;
    });
    return map;
  }, [actions]);

  var productData = useMemo(function () {
    var cMap = {};
    complaints.forEach(function (c) {
      if (!cMap[c.key]) cMap[c.key] = { total: 0, byType: {} };
      cMap[c.key].total++;
      cMap[c.key].byType[c.type] = (cMap[c.key].byType[c.type] || 0) + 1;
    });
    return Array.from(new Set(Object.keys(orderTotals).concat(Object.keys(cMap)))).map(function (k) {
      var ord = orderTotals[k] || 0;
      var comp = cMap[k] ? cMap[k].total : 0;
      var pct = ord > 0 ? (comp / ord) * 100 : 0;
      var wk = ordersByKey[k] ? ordersByKey[k].weekOrders : {};
      var weekNums = Object.keys(wk).map(Number).filter(function (w) { return (wk[w] || 0) > 0; }); // only weeks with real sales
      var firstWeek = weekNums.length > 0 ? Math.min.apply(null, weekNums) : null;
      // Current week is always partial → count latest data week + the week before it.
      var orders7d = latestDataWeek > 0 ? ((wk[latestDataWeek] || 0) + (wk[latestDataWeek - 1] || 0)) : null;
      var isStopped = !!stoppedAds[k];
      // New arrival = FIRST SALE ever within the last ~4 data weeks (firstWeek = earliest week with any orders)
      var isNewArrival = firstWeek != null && firstWeek >= latestDataWeek - 3;
      var status = isStopped ? "Stopped"
                 : (orders7d != null && orders7d < INACTIVE_SALES_7D) ? "Inactive" // < 5 sales / 14d = Inactive, ALWAYS, no matter what
                 : editedRecently[k] ? "Edited"
                 : isNewArrival ? "New arrival"
                 : "Active";
      return Object.assign({
        key: k,
        product: titleByKey[k] || k,
        orders: ord,
        complaints: comp,
        pct: pct,
        orders7d: orders7d,
        firstWeek: firstWeek,
        status: status,
        image: ordersByKey[k] ? ordersByKey[k].image : "",
      }, cMap[k] ? cMap[k].byType : {});
    });
  }, [complaints, orderTotals, titleByKey, ordersByKey, latestDataWeek, stoppedAds, editedRecently]);

  var filteredProductData = useMemo(function () {
    return productData.filter(function (p) {
      var t = p.product || "";
      for (var i = 0; i < EXCLUDE_TITLE_PATTERNS.length; i++) {
        if (EXCLUDE_TITLE_PATTERNS[i].test(t)) return false;
      }
      if (p.orders < minSales && p.status !== "New arrival") return false; // fresh products' sales fall outside the lagged window — never hide them
      if (statusFilter !== "all" && p.status.toLowerCase() !== statusFilter) return false;
      return true;
    });
  }, [productData, minSales, statusFilter]);

  var totals = useMemo(function () {
    var o = 0, c = 0, worst = null;
    filteredProductData.forEach(function (p) {
      o += p.orders; c += p.complaints;
      if (!worst || p.pct > worst.pct) worst = p;
    });
    return { orders: o, complaints: c, pct: o > 0 ? (c / o) * 100 : 0, worst: worst };
  }, [filteredProductData]);

  var heatmapData = useMemo(function () {
    var rows = filteredProductData.map(function (p) {
      var row = Object.assign({}, p);
      row.maturedOrders = p.orders;
      row.sampleSmall = p.orders < 30; // under 30 matured orders a percentage is noise, not a rate
      CATEGORIES.forEach(function (cat) {
        var count = p[cat.key] || 0;
        row[cat.key] = p.orders > 0 ? parseFloat(((count / p.orders) * 100).toFixed(2)) : 0;
        row[cat.key + "_count"] = count;
      });
      var tsCount = p.too_small || 0;
      var tlCount = p.too_large || 0;
      var hasActivity = p.orders >= EARLY_WARNING_MIN_ORDERS;
      row.earlyWarning = null;
      if (hasActivity) {
        if (tsCount >= EARLY_WARNING_COUNT && tlCount < EARLY_WARNING_COUNT) {
          row.earlyWarning = { direction: "too_small", count: tsCount, label: "TS" };
        } else if (tlCount >= EARLY_WARNING_COUNT && tsCount < EARLY_WARNING_COUNT) {
          row.earlyWarning = { direction: "too_large", count: tlCount, label: "TL" };
        } else if (tsCount >= EARLY_WARNING_COUNT && tlCount >= EARLY_WARNING_COUNT) {
          row.earlyWarning = { direction: "both", count: tsCount + tlCount, label: "SIZE CHART" };
        }
      }
      row.killSignal = null;
      if (hasActivity) {
        var qualityPct = row.quality || 0;
        var looksPct = row.looks_different || 0;
        var totalPct = row.pct || 0;
        var autoReasons = [];
        var debateReasons = [];
        if (totalPct >= KILL_TOTAL_THRESHOLD) autoReasons.push("Total " + totalPct.toFixed(1) + "%");
        if (qualityPct >= KILL_AUTO_THRESHOLD) autoReasons.push("Quality " + qualityPct.toFixed(1) + "%");
        if (looksPct >= KILL_AUTO_THRESHOLD) autoReasons.push("Looks Different " + looksPct.toFixed(1) + "%");
        if (qualityPct >= KILL_DEBATE_THRESHOLD && qualityPct < KILL_AUTO_THRESHOLD) debateReasons.push("Quality " + qualityPct.toFixed(1) + "%");
        if (looksPct >= KILL_DEBATE_THRESHOLD && looksPct < KILL_AUTO_THRESHOLD) debateReasons.push("Looks Different " + looksPct.toFixed(1) + "%");
        if (autoReasons.length > 0) row.killSignal = { tier: "auto", reasons: autoReasons };
        else if (debateReasons.length > 0) row.killSignal = { tier: "debate", reasons: debateReasons };
      }
      // First week this product started scaling (first week with real volume / a clear jump)
      var wkO = ordersByKey[p.key] ? ordersByKey[p.key].weekOrders : {};
      row.firstScaleWeek = null;
      var wNums = Object.keys(wkO).map(Number).sort(function (a, b) { return a - b; });
      for (var wi = 0; wi < wNums.length; wi++) {
        var w = wNums[wi];
        var vol = wkO[w] || 0;
        var prevVol = wkO[w - 1] || 0;
        if (vol >= 20 || (vol >= 10 && vol >= 3 * Math.max(prevVol, 1))) { row.firstScaleWeek = w; break; }
      }
      // Scale risk: FRESHLY scaled (first real volume within the last 4 data weeks, i.e. the
      // first feedback wave is arriving right now given ~2-wk shipping) — or a hard 2-week ramp —
      // combined with negative early feedback: 2 complaints of any kind OR even 1 serious
      // discrepancy (Looks Different / Quality — missing pockets, 2D instead of 3D, wrong item).
      row.scaleRisk = null;
      var recent2 = (wkO[latestDataWeek] || 0) + (wkO[latestDataWeek - 1] || 0);
      var prev2 = (wkO[latestDataWeek - 2] || 0) + (wkO[latestDataWeek - 3] || 0);
      var recentComplaints = 0, recentSerious = 0;
      allComplaints.forEach(function (c) {
        if (c.key === p.key && !c.detailOnly && c.week != null && c.week >= weekRange[1] - 1) {
          recentComplaints++;
          if (c.type === "looks_different" || c.type === "quality") recentSerious++;
        }
      });
      var freshlyScaled = row.firstScaleWeek != null && row.firstScaleWeek >= latestDataWeek - 3;
      row.freshlyScaled = freshlyScaled;
      var hardRamp = recent2 >= 1.8 * Math.max(prev2, 1);
      if (!row.killSignal && recent2 >= 10 && (freshlyScaled || hardRamp) && (recentComplaints >= 2 || recentSerious >= 1)) {
        row.scaleRisk = { recent2: recent2, prev2: prev2, recentComplaints: recentComplaints, recentSerious: recentSerious, firstScaleWeek: row.firstScaleWeek };
      }
      return row;
    });
    // Sorting — click a header to select, click again to flip direction.
    var dir = sortDir === "asc" ? -1 : 1;
    rows.sort(function (a, b) {
      var d;
      if (sortBy === "orders7d") d = (b.orders7d || 0) - (a.orders7d || 0);
      else if (sortBy === "newest") {
        var fa = a.firstWeek == null ? -Infinity : a.firstWeek;
        var fb = b.firstWeek == null ? -Infinity : b.firstWeek;
        d = fb - fa; // desc = newest first, asc = longest running first
      } else if (sortBy === "refund") {
        var ra = contribData[a.key] && contribData[a.key].refundRate != null ? contribData[a.key].refundRate : -1;
        var rb = contribData[b.key] && contribData[b.key].refundRate != null ? contribData[b.key].refundRate : -1;
        d = rb - ra;
      } else d = b.pct - a.pct; // default: complaint %
      return d * dir;
    });
    return rows;
  }, [filteredProductData, sortBy, sortDir, ordersByKey, latestDataWeek, allComplaints, weekRange, contribData]);

  // Actions per product with before/after
  var actionsByProduct = useMemo(function () {
    var map = {};
    actions.forEach(function (a) {
      if (!a.week) return;
      if (!map[a.key]) map[a.key] = [];
      // All windows below are ORDER weeks: a complaint belongs to the week its order was
      // placed (exact Shopify date when enriched, week-2 fallback otherwise). An edit in
      // W30 is judged purely on complaints from orders placed W30+ — no lag guessing.
      var aw = a.week;
      var beforeStart = Math.max(1, aw - 4);
      var beforeEnd = aw - 1;
      var afterStart = aw;
      var afterEnd = Math.max(1, weekRange[1] - LAG_WEEKS);
      var ordersFor = function (start, end) {
        var t = 0;
        var wk = ordersByKey[a.key] ? ordersByKey[a.key].weekOrders : {};
        for (var w = start; w <= end; w++) {
          if (w >= 1) t += wk[w] || 0;
        }
        return t;
      };
      var complaintsFor = function (start, end) {
        return allComplaints.filter(function (c) {
          if (c.detailOnly || c.key !== a.key || c.type !== a.category) return false;
          var ow = effOrderWeek(c);
          return ow != null && ow >= start && ow <= end;
        }).length;
      };
      var bo = ordersFor(beforeStart, beforeEnd);
      var bc = complaintsFor(beforeStart, beforeEnd);
      var ao = ordersFor(afterStart, afterEnd);
      var ac = complaintsFor(afterStart, afterEnd);
      var bp = bo > 0 ? (bc / bo) * 100 : null;
      var ap = ao > 0 ? (ac / ao) * 100 : null;
      var delta = (bp != null && ap != null) ? (ap - bp) : null;
      map[a.key].push(Object.assign({}, a, {
        beforeWindow: [beforeStart, beforeEnd],
        afterWindow: [afterStart, afterEnd],
        beforePct: bp, afterPct: ap,
        beforeOrders: bo, beforeComplaints: bc,
        afterOrders: ao, afterComplaints: ac,
        deltaPP: delta,
      }));
    });
    return map;
  }, [actions, allComplaints, ordersByKey, weekRange[1]]);

  // Ticket quotes per focused product (max 5, insight not drowning)
  var focusQuotes = useMemo(function () {
    if (!focusedProduct) return { items: [], total: 0 };
    var rows = allComplaints.filter(function (c) { return c.key === focusedProduct && c.summary; });
    rows.sort(function (a, b) { return (b.week || 0) - (a.week || 0); });
    return { items: rows.slice(0, 5), total: rows.length };
  }, [allComplaints, focusedProduct]);

  // Payload for the AI analysis: ALL feedback since the latest edit (or all data if never edited).
  function buildAIPayload(aiKey) {
    var frow = heatmapData.find(function (r) { return r.key === aiKey; });
    if (!frow) frow = productData.find(function (r) { return r.key === aiKey; }); // row outside the current status filter (run-all)
    if (!frow) return null;
    var acts = actionsByProduct[aiKey] || [];
    var sinceWeek = null;
    var lastAction = null;
    acts.forEach(function (a) {
      if (a.week != null && (sinceWeek == null || a.week > sinceWeek)) { sinceWeek = a.week; lastAction = a; }
    });
    // Post-edit = complaints whose ORDER was placed in/after the edit week (exact Shopify
    // date when enriched, week-2 fallback otherwise). No shipping-lag guessing needed.
    var rows = allComplaints.filter(function (c) {
      if (c.key !== aiKey || c.detailOnly) return false;
      if (sinceWeek == null) return true;
      var ow = effOrderWeek(c);
      return ow != null && ow >= sinceWeek;
    });
    var inFlight = sinceWeek == null ? 0 : allComplaints.filter(function (c) {
      if (c.key !== aiKey || c.detailOnly || c.week == null) return false;
      var ow = effOrderWeek(c);
      return c.week >= sinceWeek && ow != null && ow < sinceWeek; // arrived after the edit, but about a pre-edit order
    }).length;
    var prodAll = allComplaints.filter(function (c) { return c.key === aiKey && !c.detailOnly; });
    var exactDates = prodAll.filter(function (c) { return c.orderWeek != null; }).length;
    var counts = {};
    rows.forEach(function (c) { counts[c.type] = (counts[c.type] || 0) + 1; });
    var texts = rows.filter(function (c) { return c.summary; });
    texts.sort(function (a, b) { return (b.week || 0) - (a.week || 0); });
    var wk = ordersByKey[aiKey] ? ordersByKey[aiKey].weekOrders : {};
    var cOWs = prodAll.map(effOrderWeek).filter(function (w) { return w != null; });
    var latestCW = cOWs.length > 0 ? Math.max.apply(null, cOWs) : null;
    var ordersIn = function (startW, endW) {
      var t = 0;
      for (var w = startW; w <= endW; w++) { if (w >= 1) t += wk[w] || 0; }
      return t;
    };
    var winStart = cOWs.length > 0 ? Math.min.apply(null, cOWs) : 1;
    var recO = latestCW != null ? ordersIn(latestCW - 1, latestCW) : 0;
    var priO = latestCW != null ? ordersIn(winStart, latestCW - 2) : 0;
    // dashboardPct = EXACTLY the number on the category tiles (same denominator, same window).
    var catStats = CATEGORIES.map(function (cat) {
      var recC = 0, priC = 0;
      prodAll.forEach(function (c) {
        if (c.type !== cat.key) return;
        var ow = effOrderWeek(c);
        if (ow == null) return;
        if (latestCW != null && ow >= latestCW - 1) recC++; else priC++;
      });
      var z = zones[cat.key] || { amber: [6], red: [8] };
      return {
        category: cat.label,
        dashboardPct: frow[cat.key] || 0,
        count: frow[cat.key + "_count"] || 0,
        recentCount: recC,
        warningAt: z.amber[0], problemAt: z.red[0],
      };
    });
    var recent2O = (wk[latestDataWeek] || 0) + (wk[latestDataWeek - 1] || 0);
    var prev2O = (wk[latestDataWeek - 2] || 0) + (wk[latestDataWeek - 3] || 0);
    // Per-category stats since the last edit (lag-corrected orders) — powers the +/- toggle grid
    var sinceEdit = null;
    if (sinceWeek != null) {
      var sinceO = ordersIn(sinceWeek, latestDataWeek); // orders actually placed since the edit
      var perCat = {};
      CATEGORIES.forEach(function (cat) {
        var cnt = counts[cat.key] || 0;
        perCat[cat.key] = { count: cnt, pct: sinceO > 0 ? +(cnt / sinceO * 100).toFixed(1) : 0 };
      });
      sinceEdit = {
        week: sinceWeek,
        firstFeedbackWeek: sinceWeek,
        tooEarly: sinceO === 0 || (latestCW != null && latestCW < sinceWeek && rows.length === 0),
        inFlight: inFlight,
        orders: sinceO,
        exactDatePct: prodAll.length > 0 ? Math.round(exactDates / prodAll.length * 100) : 0,
        perCat: perCat,
      };
    }
    return {
      sinceEdit: sinceEdit,
      catStats: catStats,
      windows: {
        dashboard: "complaints \u00F7 MATURED orders (placed W" + ordersWR[0] + "\u2013W" + ordersWR[1] + ", i.e. 2+ weeks ago \u2014 customers who HAVE the product; " + frow.orders + " orders). Same numbers as the dashboard tiles.",
        recentTrend: "removed \u2014 dashboardPct is the only rate",
      },
      ordersRamp: { last2wOrders: recent2O, prev2wOrders: prev2O, justScaled: !!frow.scaleRisk || (recent2O >= 10 && recent2O >= 1.8 * Math.max(prev2O, 1)), firstScaleWeek: frow.firstScaleWeek },
      product: titleByKey[aiKey] || aiKey,
      sinceWeek: sinceWeek,
      lastAction: lastAction ? {
        week: lastAction.week, category: lastAction.category, action: lastAction.action,
        beforePct: lastAction.beforePct, afterPct: lastAction.afterPct, deltaPP: lastAction.deltaPP,
        beforeOrders: lastAction.beforeOrders, afterOrders: lastAction.afterOrders,
      } : null,
      refundRate: contribData[aiKey] && contribData[aiKey].refundRate != null ? contribData[aiKey].refundRate : null,
      counts: counts,
      totalComplaints: rows.length,
      withText: texts.length,
      orders: frow.orders,
      maturedOrders: frow.maturedOrders != null ? frow.maturedOrders : frow.orders,
      sampleTooSmall: !!frow.sampleSmall,
      summaries: texts.slice(0, 40).map(function (c) { return { type: c.type, week: c.week, text: c.summary }; }),
    };
  }
  var focusAI = useMemo(function () {
    return focusedProduct ? buildAIPayload(focusedProduct) : null;
  }, [focusedProduct, heatmapData, productData, allComplaints, actionsByProduct, ordersByKey, titleByKey, zones, latestDataWeek, ordersWR, contribData]);

  // One-line issue summary per product for the table column (cached AI bullet first, heuristic fallback)
  var issueByKey = useMemo(function () {
    var out = {};
    heatmapData.forEach(function (row) {
      try {
        var d = buildAIPayload(row.key);
        if (d) {
          var cached = window.localStorage.getItem(makeAIKey(STORE_CSVS[selectedStore].name, row.key, d));
          if (cached) {
            var j = JSON.parse(cached);
            var first = String(j.summary || "").split("\n")[0].replace(/^\u2022\s*/, "").trim();
            if (first) { out[row.key] = first; return; }
          }
        }
      } catch (e) { /* fall through to heuristic */ }
      if (row.killSignal) { out[row.key] = "KILL signal \u2014 " + (row.killSignal.reasons ? row.killSignal.reasons.join(", ") : "thresholds crossed"); return; }
      if (row.scaleRisk) { out[row.key] = "SCALE RISK \u2014 " + row.scaleRisk.recentComplaints + " complaint(s) on a fresh scale"; return; }
      if (row.earlyWarning) { out[row.key] = "Early warning: " + row.earlyWarning.label + " \u00D7" + row.earlyWarning.count; return; }
      var worst = null;
      CATEGORIES.forEach(function (cat) {
        var z = zones[cat.key] || { amber: [6] };
        var v = row[cat.key] || 0;
        if (v >= z.amber[0] && (!worst || v > worst.v)) worst = { label: cat.label, v: v };
      });
      out[row.key] = worst ? worst.label + " " + worst.v.toFixed(1) + "% \u2014 warning" : null;
    });
    return out;
  }, [heatmapData, productData, allComplaints, actionsByProduct, ordersByKey, zones, latestDataWeek, ordersWR, contribData, selectedStore, runState.running]);
  // Data payloads for the floating widgets
  var reportData = useMemo(function () {
    var recentActions = [];
    actions.forEach(function (a) {
      if (a.week != null && a.week >= currentWeekNum() - 2) {
        var enriched = (actionsByProduct[a.key] || []).find(function (x) { return x.uuid === a.uuid || (x.week === a.week && x.action === a.action); });
        recentActions.push({
          product: titleByKey[a.key] || a.key, week: a.week, category: a.category, action: a.action,
          beforePct: enriched ? enriched.beforePct : null, afterPct: enriched ? enriched.afterPct : null, deltaPP: enriched ? enriched.deltaPP : null,
        });
      }
    });
    var kills = [], risers = [], newRisk = [];
    heatmapData.forEach(function (r) {
      if (r.killSignal) kills.push({ product: r.product, pct: r.pct, tier: r.killSignal.tier, reasons: r.killSignal.reasons });
      // rising: complaints in last 2 weeks vs the 4 weeks before
      var recent = 0, prior = 0;
      allComplaints.forEach(function (c) {
        if (c.key !== r.key || c.detailOnly || c.week == null) return;
        if (c.week >= weekRange[1] - 1) recent++;
        else if (c.week >= weekRange[1] - 5) prior++;
      });
      if (recent >= 3 && recent > prior) risers.push({ product: r.product, last2w: recent, prior4w: prior, totalPct: r.pct });
      var sizing = (r.too_small_count || 0) + (r.too_large_count || 0);
      if (r.firstWeek != null && r.firstWeek >= latestDataWeek - 1 && sizing >= 2) {
        newRisk.push({ product: r.product, liveWeeks: latestDataWeek - r.firstWeek + 1, orders: r.orders, tooSmall: r.too_small_count || 0, tooLarge: r.too_large_count || 0, totalPct: r.pct });
      }
    });
    return { store: STORE_CSVS[selectedStore].name, week: currentWeekNum(), recentActions: recentActions.slice(0, 20), killSignals: kills.slice(0, 15), risingComplaints: risers.slice(0, 15), newProductsWithSizingRisk: newRisk.slice(0, 15) };
  }, [actions, actionsByProduct, heatmapData, allComplaints, titleByKey, weekRange, latestDataWeek, selectedStore]);

  var chatContext = useMemo(function () {
    if (!focusedProduct) return { store: STORE_CSVS[selectedStore].name };
    var r = heatmapData.find(function (x) { return x.key === focusedProduct; }) || {};
    return {
      store: STORE_CSVS[selectedStore].name,
      product: r.product || (titleByKey[focusedProduct] || focusedProduct),
      totalPct: r.pct, orders: r.orders, orders14d: r.orders7d,
      counts: CATEGORIES.reduce(function (m, c) { m[c.label] = r[c.key + "_count"] || 0; return m; }, {}),
      contrib: contribData[focusedProduct] || null,
      lastAction: focusAI && focusAI.lastAction ? focusAI.lastAction : null,
      recentTickets: focusAI ? focusAI.summaries.slice(0, 15) : [],
    };
  }, [focusedProduct, heatmapData, selectedStore, contribData, focusAI, titleByKey]);


  /* ── WRITE-BACK HANDLERS ── */
  function makeLogAction(row) {
    return async function (form) {
      var u = uid();
      var store = STORE_CSVS[selectedStore];
      var entry = {
        key: row.key,
        title: row.product,
        category: form.category,
        action: form.action,
        expectedEffect: form.expectedEffect,
        notes: form.notes,
        week: form.week || currentWeekNum(),
        status: "Active",
        date: todayISO(),
        uuid: u,
        pending: true,
      };
      setLocalActions(function (prev) { return prev.concat([entry]); });
      try {
        await postToSheet({
          type: "action",
          uuid: u,
          store: store ? store.name : "",
          productId: row.key.indexOf("title:") === 0 ? "" : row.key,
          productName: row.product,
          category: form.category,
          action: form.action,
          expectedEffect: form.expectedEffect,
          notes: form.notes,
          week: form.week || currentWeekNum(),
          status: "Active",
          date: todayISO(),
        });
        setLocalActions(function (prev) { return prev.map(function (a) { return a.uuid === u ? Object.assign({}, a, { pending: false }) : a; }); });
      } catch (e) {
        setLocalActions(function (prev) { return prev.filter(function (a) { return a.uuid !== u; }); });
        throw e;
      }
    };
  }
  async function undoAction(a) {
    try {
      await postToSheet({ type: "delete", sheet: "actions", uuid: a.uuid });
      setLocalActions(function (prev) { return prev.filter(function (x) { return x.uuid !== a.uuid; }); });
      setSheetActions(function (prev) { return prev.filter(function (x) { return x.uuid !== a.uuid; }); });
    } catch (e) { alert("Undo failed: " + (e.message || e)); }
  }
  function makeStopAds(row) {
    return async function (note) {
      var u = uid();
      var store = STORE_CSVS[selectedStore];
      var info = { title: row.product, stoppedDate: todayISO(), note: note || "", uuid: u };
      setLocalStopped(function (prev) { var n = Object.assign({}, prev); n[row.key] = info; return n; });
      try {
        await postToSheet({
          type: "stopped",
          uuid: u,
          store: store ? store.name : "",
          productId: row.key.indexOf("title:") === 0 ? "" : row.key,
          productName: row.product,
          date: todayISO(),
          note: note || "",
        });
      } catch (e) {
        setLocalStopped(function (prev) { var n = Object.assign({}, prev); delete n[row.key]; return n; });
        throw e;
      }
    };
  }
  function makeUndoStop(row) {
    return async function (info) {
      try {
        await postToSheet({ type: "delete", sheet: "stopped", uuid: info.uuid });
        setLocalStopped(function (prev) { var n = Object.assign({}, prev); n[row.key] = null; return n; });
        setSheetStopped(function (prev) {
          var n = Object.assign({}, prev);
          if (n[row.key] && n[row.key].uuid === info.uuid) delete n[row.key];
          return n;
        });
      } catch (e) { alert("Undo failed: " + (e.message || e)); }
    };
  }


  var toastTimer = useRef(null);
  function showToast(text, ms) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(function () { setToast(null); }, ms || 2600);
  }

  useEffect(function () {
    function onKey(e) { if (e.key === "Escape" && closeRef.current) closeRef.current(); }
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "radial-gradient(900px 500px at 50% -10%, rgba(120,150,190,0.05), transparent 70%), " + N.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18, fontFamily: FONT }}>
        <GlobalStyles />
        <div style={{ position: "relative", width: 48, height: 48 }}>
          <div style={{ position: "absolute", inset: 0, border: "2px solid " + N.border, borderTopColor: N.blue, borderRightColor: N.cyan, borderRadius: "50%", animation: "spin 0.9s cubic-bezier(.5,.1,.5,.9) infinite" }} />
          <div style={{ position: "absolute", inset: 12, borderRadius: "50%", background: N.grad, opacity: 0.5, filter: "blur(6px)" }} />
        </div>
        <div style={{ color: N.textS, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Loading complaint data</div>
        {loadErr && <div style={{ color: N.red, fontSize: 11, maxWidth: 480, textAlign: "center", lineHeight: 1.5 }}>Load error: {loadErr}<br />Open the browser console (Cmd+Option+J) for details, or check that the complaint tabs still have their normal columns.</div>}
      </div>
    );
  }

  var totalProducts = productData.length;
  var visibleProducts = filteredProductData.length;

  var sortableHeader = function (label, key) {
    var active = sortBy === key;
    return (
      <span style={{ cursor: "pointer", color: active ? N.text : "inherit", userSelect: "none" }}
        onClick={function () {
          if (active) setSortDir(sortDir === "desc" ? "asc" : "desc");
          else { setSortBy(key); setSortDir("desc"); }
        }}
        title={"Sort by " + label + " (click again to flip)"}>
        {label}{active ? (sortDir === "desc" ? " \u25BE" : " \u25B4") : ""}
      </span>
    );
  };

  var visibleColCount = statusFilter === "active" ? 8 : 9;
  var focusedRow = focusedProduct ? heatmapData.find(function (r) { return r.key === focusedProduct; }) : null;
  // Cache the last seen row: after "Log action" the status flips to Edited and the row can drop
  // out of the filtered view instantly — without this cache the panel vanished into a black screen.
  if (focusedRow) lastRowRef.current = focusedRow;
  var shownRow = focusedRow || (focusedProduct ? lastRowRef.current : null);
  function closeFocus() {
    if (!focusedProduct || closing) return;
    setClosing(true);
    setTimeout(function () { setFocusedProduct(null); setClosing(false); }, 320);
  }
  closeRef.current = closeFocus;

  async function runAllRecommendations() {
    if (runState.running) return;
    // Always Active + New arrivals + Edited (all the reviewable statuses), regardless of the current filter
    var rows = productData.filter(function (p) {
      var t = p.product || "";
      for (var xi = 0; xi < EXCLUDE_TITLE_PATTERNS.length; xi++) { if (EXCLUDE_TITLE_PATTERNS[xi].test(t)) return false; }
      if (p.orders < minSales && p.status !== "New arrival") return false;
      return p.status === "Active" || p.status === "New arrival" || p.status === "Edited";
    });
    if (rows.length === 0) return;
    if (!window.confirm("Run the AI analysis for all " + rows.length + " Active, New arrival, and Edited products in the background?\n\nThis calls the Claude API once per product (a few cents each) and can take a couple of minutes. Already-analyzed products are skipped.")) return;
    setRunState({ running: true, done: 0, total: rows.length });
    // Phase 0: fill missing "order placed" dates via Shopify (Apps Script does the lookups).
    if (APPS_SCRIPT_URL) {
      try {
        var guard = 0;
        while (guard < 40) {
          guard++;
          setRunState({ running: true, done: 0, total: rows.length, phase: "enrich" });
          showToast("Enriching order dates from Shopify\u2026", 2500);
          var er = await postToSheet({ type: "enrich" });
          if (er.errors && er.errors.length) console.warn("[enrich]", er.errors);
          if (!er.remaining || er.remaining <= 0) {
            if (er.filled > 0) showToast("Order dates filled: " + er.filled + ". New dates reach the dashboard after the next data refresh (~5 min).", 4200);
            break;
          }
          showToast("Enriching order dates\u2026 " + er.remaining + " to go (backlog)", 2500);
        }
      } catch (e) { console.warn("[enrich] skipped:", e.message || e); }
    }
    // Fresh review round: clear all checkmarks; no-action products get auto-checked below.
    var freshChecked = { weekAnchor: getCurrentMondayISO(), products: {} };
    setCheckedState(freshChecked); saveCheckedProducts(freshChecked);
    var noActionKeys = [];
    var NO_ACTION_RE = /no action needed|no real problem|all rates in the safe zone|leave it alone|no edit needed|only shipping/i;
    var rules = getCustomRules();
    var done = 0;
    var chunk = 10; // 10 parallel calls per batch
    for (var i = 0; i < rows.length; i += chunk) {
      var batch = rows.slice(i, i + chunk).map(function (r) {
        return (async function () {
          try {
            var d = buildAIPayload(r.key);
            if (!d || d.totalComplaints === 0) { if (r.status !== "New arrival") noActionKeys.push(r.key); return; } // zero complaints = nothing to review (but ALWAYS eyeball new arrivals)
            var k = makeAIKey(STORE_CSVS[selectedStore].name, r.key, d);
            var cached = window.localStorage.getItem(k);
            var j = null;
            if (cached) { j = JSON.parse(cached); }
            else {
              var resp = await fetch(AI_API_PATH, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(Object.assign({}, d, { customRules: rules })),
              });
              j = await resp.json();
              if (resp.ok && !j.error) window.localStorage.setItem(k, JSON.stringify(j));
              else j = null;
            }
            var allSafe = d.catStats.every(function (c2) { return (c2.dashboardPct || 0) < c2.warningAt; });
            if (r.status !== "New arrival" && j && (allSafe || j.noActionNeeded === true || NO_ACTION_RE.test(String(j.summary || "") + " " + String(j.recommendation || "")))) {
              noActionKeys.push(r.key); // Active + Edited only — New arrivals are NEVER auto-checked, always review them by hand
            }
          } catch (e) { /* keep going */ }
        })();
      });
      await Promise.all(batch);
      done = Math.min(rows.length, i + chunk);
      setRunState({ running: true, done: done, total: rows.length });
    }
    setRunState({ running: false, done: rows.length, total: rows.length });
    if (noActionKeys.length > 0) {
      setCheckedState(function (prev) {
        var nextProducts = Object.assign({}, prev.products);
        noActionKeys.forEach(function (k2) { nextProducts[k2] = true; });
        var next = { weekAnchor: prev.weekAnchor, products: nextProducts };
        saveCheckedProducts(next);
        return next;
      });
    }
    showToast("Done \u2014 " + noActionKeys.length + " product(s) auto-checked (no action needed). " + (rows.length - noActionKeys.length) + " left to review.", 5200);
  }
  var dimUI = focusedProduct
    ? { filter: "blur(2.5px) brightness(0.45)", opacity: 0.55, pointerEvents: "none", userSelect: "none", transition: "filter 0.2s, opacity 0.2s" }
    : { transition: "filter 0.2s, opacity 0.2s" };

  var reviewedCount = Object.keys(checkedState.products).filter(function (p) { return heatmapData.some(function (r) { return r.key === p; }); }).length;
  var reviewPct = heatmapData.length > 0 ? reviewedCount / heatmapData.length : 0;

  var NAV = [
    { key: "active", label: "Active", icon: "bolt" },
    { key: "new arrival", label: "New", icon: "sparkle" },
    { key: "edited", label: "Edited", icon: "check" },
    { key: "inactive", label: "Idle", icon: "pause" },
    { key: "stopped", label: "Stopped", icon: "alert" },
    { key: "all", label: "All", icon: "grid" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(1400px 620px at 20% -10%, rgba(120,150,190,0.045), transparent 65%), " + N.bg, color: N.text, fontFamily: FONT, display: "flex", alignItems: "flex-start", zoom: UI_ZOOM }}>
      <GlobalStyles />

      {/* ── LEFT RAIL ── */}
      <aside style={Object.assign({
        width: 78, flexShrink: 0, position: "sticky", top: 0,
        height: "calc(100vh / " + UI_ZOOM + ")", overflowY: "auto", overflowX: "hidden",
        background: N.bgS,
        borderRight: "1px solid " + N.border, display: "flex", flexDirection: "column", alignItems: "center",
        padding: "14px 0 16px", gap: 6, zIndex: 5,
      }, dimUI)}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(255,255,255,0.05)", border: "1px solid " + N.border, display: "flex", alignItems: "center", justifyContent: "center", color: N.text, marginBottom: 12, flexShrink: 0 }}>
          <Logo size={21} />
        </div>

        {NAV.map(function (n) {
          var active = statusFilter === n.key;
          return (
            <button key={n.key} className="navItem" onClick={function () { setStatusFilter(n.key); }} title={n.label + " products"}
              style={{
                width: 58, padding: "9px 0 7px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                background: active ? N.quiet.bg : "transparent",
                border: "1px solid " + (active ? N.quiet.border : "transparent"),
                color: active ? N.quiet.text : N.textT,
              }}>
              <Ico name={n.icon} size={17} weight={active ? 2 : 1.6} />
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{n.label}</span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Review progress ring — the weekly job, always in view */}
        <div style={{ position: "relative", width: 48, height: 48 }} title={reviewedCount + " of " + heatmapData.length + " reviewed this week"}>
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(210,218,230,0.10)" strokeWidth="4" />
            <circle cx="24" cy="24" r="20" fill="none" stroke="url(#railGrad)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={(2 * Math.PI * 20).toFixed(1)}
              strokeDashoffset={(2 * Math.PI * 20 * (1 - reviewPct)).toFixed(1)}
              transform="rotate(-90 24 24)" style={{ transition: "stroke-dashoffset .4s ease" }} />
            <defs>
              <linearGradient id="railGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={N.blue} /><stop offset="100%" stopColor={N.cyan} />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: N.text, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(reviewPct * 100)}%
          </div>
        </div>
        <div style={{ fontSize: 8, color: N.textT, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>Reviewed</div>
      </aside>

      {/* ── MAIN COLUMN ── */}
      <main style={{ flex: 1, minWidth: 0, padding: "16px 20px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header */}
      <div style={Object.assign({ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }, dimUI)}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Complaint Tracker</h1>
            <div style={{ fontSize: 10, color: N.textT, marginTop: 2, letterSpacing: "0.02em" }}>
              {title} {"\u00B7"} W{weekRange[0]}{"\u2013"}W{weekRange[1]}
            </div>
          </div>
          {/* Store picker */}
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", borderRadius: 99, padding: 4, border: "1px solid " + N.border }}>
            {STORE_CSVS.map(function (s, i) {
              var active = selectedStore === i;
              return (
                <button key={i} onClick={function () { setSelectedStore(i); }}
                  style={{
                    background: active ? N.quiet.bg : "transparent",
                    color: active ? N.quiet.text : N.textT,
                    border: "1px solid " + (active ? N.quiet.border : "transparent"), borderRadius: 99,
                    fontSize: 11.5, fontWeight: 700, fontFamily: "inherit",
                    padding: "6px 16px", cursor: "pointer",
                  }}>
                  {s.name}
                </button>
              );
            })}
          </div>
          {dataSrc === "demo" && <span style={{ fontSize: 8, color: N.orange, textTransform: "uppercase", letterSpacing: "0.05em", border: "1px solid rgba(251,191,36,0.35)", padding: "3px 8px", borderRadius: 99 }}>demo data</span>}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Week range */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.03)", borderRadius: 99, padding: "7px 12px", border: "1px solid " + N.border }}>
            <span style={{ fontSize: 9, color: N.textT, fontWeight: 700, letterSpacing: "0.05em" }}>WEEK</span>
            <select value={weekRange[0]} onChange={function (e) { setWeekRange([Number(e.target.value), Math.max(Number(e.target.value), weekRange[1])]); }} style={{ background: "transparent", border: "none", color: N.text, fontSize: 11, fontWeight: 600, fontFamily: "inherit", outline: "none" }}>
              {availableWeeks.map(function (w) { return <option key={w} value={w}>{w}</option>; })}
            </select>
            <span style={{ color: N.textT, fontSize: 9 }}>{"\u2192"}</span>
            <select value={weekRange[1]} onChange={function (e) { setWeekRange([Math.min(weekRange[0], Number(e.target.value)), Number(e.target.value)]); }} style={{ background: "transparent", border: "none", color: N.text, fontSize: 11, fontWeight: 600, fontFamily: "inherit", outline: "none" }}>
              {availableWeeks.map(function (w) { return <option key={w} value={w}>{w}</option>; })}
            </select>
          </div>
          {/* Min sales */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.03)", borderRadius: 99, padding: "7px 12px", border: "1px solid " + N.border }}>
            <span style={{ fontSize: 9, color: N.textT, fontWeight: 700, letterSpacing: "0.05em" }}>MIN SALES</span>
            <input type="number" min={0} step={10} value={minSales}
              onChange={function (e) { setMinSales(Math.max(0, Number(e.target.value) || 0)); }}
              style={{ background: "transparent", border: "none", color: N.text, fontSize: 11, fontWeight: 600, fontFamily: "inherit", outline: "none", width: 40 }} />
          </div>
          <button onClick={runAllRecommendations} disabled={runState.running}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              background: N.quiet.bg,
              border: "1px solid " + N.quiet.border,
              color: N.quiet.text, fontSize: 11, fontWeight: 700, padding: "8px 15px",
              borderRadius: 99, cursor: runState.running ? "default" : "pointer", fontFamily: "inherit",
              opacity: runState.running ? 0.75 : 1,
            }}>
            <Ico name={runState.running ? "refresh" : "sparkle"} size={14} weight={2}
              style={runState.running ? { animation: "spin 1s linear infinite" } : null} />
            {runState.running ? "Running " + runState.done + "/" + runState.total + "\u2026" : "Run all recommendations"}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={Object.assign({ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.6fr", gap: 10 }, dimUI)}>
        {[
          { label: "Total orders", value: totals.orders.toLocaleString(), icon: "cart", color: N.blue },
          { label: "Total complaints", value: totals.complaints.toLocaleString(), icon: "alert", color: N.violet },
          { label: "Complaint rate", value: fmtPct(totals.pct), icon: "pct", color: totals.pct >= 8 ? N.red : N.green },
          { label: "Worst product", value: totals.worst ? totals.worst.product : "\u2014", sub: totals.worst ? fmtPct(totals.worst.pct) + " complaint rate" : "", icon: "flame", color: N.red },
        ].map(function (k) {
          return (
            <div key={k.label} className="card" style={{ padding: "13px 15px", display: "flex", gap: 12, alignItems: "flex-start", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 15, right: 15, height: 1, background: "linear-gradient(90deg, transparent, " + k.color + "55, transparent)" }} />
              <IconTile icon={k.icon} color={k.color} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 8.5, color: N.textT, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: N.text, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: 10, color: k.color, marginTop: 2, fontWeight: 600 }}>{k.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {loadErr && !loading && (
        <div style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 14, padding: "10px 16px", fontSize: 11, color: N.red }}>
          {loadErr}
        </div>
      )}

      {/* Amber's weekly workflow */}
      <div className="card" style={Object.assign({ padding: "13px 16px", display: "flex", flexDirection: "column", gap: 7 }, dimUI)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 3, height: 13, borderRadius: 99, background: N.grad }} />
          <div style={{ fontSize: 11, fontWeight: 800, color: N.text, letterSpacing: "-0.01em" }}>Weekly review {"\u2014"} every product, once a week</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
          {[
            { n: "01", t: "Active", d: "Top to bottom, most complaints first. Open each product, read the AI analysis, act." },
            { n: "02", t: "New arrivals", d: "Fix fresh products before they scale \u2014 1\u20132 early complaints is already a signal. Red tags first." },
            { n: "03", t: "Edited", d: "Check in on the edits you made and the follow-ups you still owe (see Last edit)." },
            { n: "04", t: "All stores", d: "Switch store top left and repeat the whole run." },
          ].map(function (s) {
            return (
              <div key={s.n} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid " + N.border, borderRadius: 13, padding: "9px 11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: N.textT, fontVariantNumeric: "tabular-nums" }}>{s.n}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: N.text }}>{s.t}</span>
                </div>
                <div style={{ fontSize: 9.5, color: N.textS, lineHeight: 1.45 }}>{s.d}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 14, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IconTile icon="box" color={N.cyan} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: N.text, letterSpacing: "-0.01em" }}>Products</div>
                <div style={{ fontSize: 9, color: N.textT }}>{heatmapData.length} shown {"\u00B7"} {NAV.filter(function (n) { return n.key === statusFilter; }).map(function (n) { return n.label; })[0] || "All"}</div>
              </div>
            </div>
            {heatmapData.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,0.03)", border: "1px solid " + N.border, borderRadius: 99, padding: "5px 6px 5px 12px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: N.text, fontVariantNumeric: "tabular-nums" }}>
                  {reviewedCount}/{heatmapData.length}
                </span>
                <div style={{ width: 70, height: 5, borderRadius: 99, background: "rgba(210,218,230,0.12)", overflow: "hidden" }}>
                  <div style={{ width: (reviewPct * 100) + "%", height: "100%", background: N.grad, borderRadius: 99, transition: "width .3s ease" }} />
                </div>
                <span style={{ color: N.textT, fontSize: 9 }}>resets Monday</span>
                <button onClick={resetChecked} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid " + N.border, color: N.textS, fontSize: 9, fontWeight: 700, padding: "4px 10px", borderRadius: 99, cursor: "pointer", fontFamily: "inherit" }}>
                  Reset
                </button>
              </div>
            )}
            {focusedProduct && (
              <button onClick={closeFocus} style={{ background: "rgba(255,107,107,0.10)", border: "1px solid rgba(255,107,107,0.32)", color: N.red, fontSize: 10, fontWeight: 700, padding: "5px 12px", borderRadius: 99, cursor: "pointer", fontFamily: "inherit" }}>
                {"\u2715"} Exit focus
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                <th style={{ background: N.bgS, padding: "9px 4px", position: "sticky", top: 0, width: 30, borderRadius: "10px 0 0 10px" }}></th>
                {[
                  { label: sortableHeader("Week Started", "newest"), align: "left", w: 96 },
                  { label: "Status", align: "left", w: 86 },
                  { label: sortableHeader("Orders 14d", "orders7d"), align: "left", w: 86 },
                  { label: sortableHeader("Complaint %", "pct"), align: "left", w: 78 },
                  { label: sortableHeader("Refund %", "refund"), align: "left", w: 70 },
                  { label: "Signal", align: "left", w: 118 },
                  { label: "Product", align: "left" },
                ].concat(statusFilter === "active" ? [] : [{ label: statusFilter === "edited" ? "Last edit" : "Last edit / issue", align: "left", w: 240 }]).map(function (h, i) {
                  return (
                    <th key={i} style={{ background: N.bgS, color: N.textT, fontWeight: 700, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.08em", padding: "9px 8px", textAlign: h.align, whiteSpace: "nowrap", position: "sticky", top: 0, width: h.w || "auto", borderBottom: "1px solid " + N.border }}>
                      {h.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {heatmapData.length === 0 && (
                <tr>
                  <td colSpan={visibleColCount} style={{ padding: "24px", textAlign: "center", color: N.textT, fontSize: 11 }}>
                    No products match the current filters. Lower the min sales threshold or reset the status filter.
                  </td>
                </tr>
              )}
              {heatmapData.map(function (row, ri) {
                var rA = actionsByProduct[row.key] || [];
                var hasAction = rA.length > 0;
                var isHovered = hoveredProduct === row.key;
                var isChecked = !!checkedState.products[row.key];
                var stoppedInfo = stoppedAds[row.key];
                var isStopped = !!stoppedInfo;
                var isFocused = focusedProduct === row.key;
                var dimmed = !!focusedProduct; // blur ALL rows when focused — the panel row below stays sharp
                var rowEls = [
                  <tr
                    key={row.key}
                    onMouseEnter={function () { if (!focusedProduct) setHoveredProduct(row.key); }}
                    onMouseLeave={function () { if (!focusedProduct) setHoveredProduct(null); }}
                    style={{
                      background: isFocused ? "rgba(56,140,255,0.12)" : (isHovered ? "rgba(56,140,255,0.055)" : "transparent"),
                      boxShadow: isFocused ? "inset 3px 0 0 " + N.blue : "none",
                      opacity: dimmed ? 0.1 : (isChecked ? 0.22 : 1),
                      filter: dimmed ? "blur(2.5px) brightness(0.45)" : "none",
                      transition: "opacity 0.2s, filter 0.2s",
                    }}
                  >
                    <td style={{ padding: "0", textAlign: "center", borderBottom: "1px solid " + N.border, width: 28 }}>
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "8px 0", cursor: "pointer" }} onClick={function (e) { e.stopPropagation(); }}>
                        <input type="checkbox" checked={isChecked} onChange={function () { toggleChecked(row.key); }}
                          style={{ width: 14, height: 14, accentColor: N.green, cursor: "pointer" }} />
                      </label>
                    </td>
                    <td style={{ padding: "5px 7px", textAlign: "left", color: N.textS, borderBottom: "1px solid " + N.border, whiteSpace: "nowrap" }}>
                      {row.firstWeek != null ? "W" + row.firstWeek : "\u2014"}
                    </td>
                    <td style={{ padding: "5px 7px", textAlign: "left", borderBottom: "1px solid " + N.border }}>
                      <StatusChip status={row.status} />
                    </td>
                    <td style={{ padding: "5px 7px", textAlign: "left", color: row.orders7d != null && row.orders7d < INACTIVE_SALES_7D ? N.textT : N.textS, borderBottom: "1px solid " + N.border }}>
                      {row.orders7d != null ? row.orders7d.toLocaleString() : "\u2014"}
                    </td>
                    <td style={{ padding: "5px 7px", textAlign: "left", fontWeight: 700, fontSize: 12, borderBottom: "1px solid " + N.border, color: row.pct >= KILL_TOTAL_THRESHOLD ? N.red : N.text, background: row.pct >= KILL_TOTAL_THRESHOLD ? "rgba(255,107,107,0.12)" : "transparent" }}>
                      {row.sampleSmall ? row.complaints + "\u00D7" : fmtPct(row.pct)}
                    </td>
                    <td style={{ padding: "5px 7px", textAlign: "left", color: N.textS, borderBottom: "1px solid " + N.border, fontVariantNumeric: "tabular-nums" }}>
                      {(function () {
                        var rr = contribData[row.key] && contribData[row.key].refundRate != null ? contribData[row.key].refundRate : null;
                        return rr != null ? rr.toFixed(1) + "%" : "\u2014";
                      })()}
                    </td>
                    <td style={{ padding: "5px 7px", textAlign: "left", borderBottom: "1px solid " + N.border, whiteSpace: "nowrap" }}>
                      {row.killSignal ? (
                        <span title={(row.killSignal.tier === "auto" ? "AUTO KILL \u2014 " : "DEBATE \u2014 ") + row.killSignal.reasons.join(", ")}
                          style={row.killSignal.tier === "auto"
                            ? { fontSize: 9, fontWeight: 700, color: N.red, background: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.4)", padding: "2px 7px", borderRadius: 10, letterSpacing: "0.02em" }
                            : { fontSize: 9, fontWeight: 700, color: N.textS, background: "rgba(255,255,255,0.06)", border: "1px solid " + N.border, padding: "2px 7px", borderRadius: 10, letterSpacing: "0.02em" }}>
                          {row.killSignal.tier === "auto" ? "KILL" : "DEBATE"}
                        </span>
                      ) : row.scaleRisk ? (
                        <span title={"Orders just ramped (" + row.scaleRisk.recent2 + " last 2 wks vs " + row.scaleRisk.prev2 + " before) and early feedback is negative (" + row.scaleRisk.recentComplaints + " complaints, " + row.scaleRisk.recentSerious + " serious, in the last 2 wks). With ~2-week shipping, the full complaint wave lands ~2 weeks after scaling \u2014 watch closely."}
                          style={{ fontSize: 9, fontWeight: 700, color: N.red, background: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.4)", padding: "2px 7px", borderRadius: 10, letterSpacing: "0.02em" }}>
                          SCALE RISK
                        </span>
                      ) : row.earlyWarning ? (
                        <span title={row.earlyWarning.direction === "both"
                          ? row.earlyWarning.count + " sizing complaints in both directions \u2014 check size chart, not supplier"
                          : row.earlyWarning.count + " " + (row.earlyWarning.direction === "too_small" ? "Too Small" : "Too Large") + " complaints (\u2265 " + EARLY_WARNING_COUNT + " trigger)"}
                          style={{ fontSize: 9, fontWeight: 700, color: N.textS, background: "rgba(255,255,255,0.06)", border: "1px solid " + N.border, padding: "2px 7px", borderRadius: 10, letterSpacing: "0.02em" }}>
                          {row.earlyWarning.count}{" "}{row.earlyWarning.label}
                        </span>
                      ) : (
                        <span style={{ color: N.textT, fontSize: 10 }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td
                      onClick={function () { if (isFocused) { closeFocus(); } else { setFocusedProduct(row.key); } setHoveredProduct(null); }}
                      title={isFocused ? "Click to exit focus" : "Click to focus this product"}
                      style={{ padding: "5px 7px", textAlign: "left", color: N.text, fontWeight: 500, borderBottom: "1px solid " + N.border, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isChecked ? "line-through" : "none", cursor: "pointer" }}>
                      <span style={{ color: isStopped ? N.textS : N.text, borderBottom: "1px dotted rgba(255,255,255,0.2)" }}>{row.product}</span>
                                          </td>
                    {statusFilter !== "active" && <td style={{ padding: "5px 7px", textAlign: "left", color: N.textS, borderBottom: "1px solid " + N.border, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10.5, maxWidth: 240 }}
                      title={(function () {
                        var la = (rA || []).slice().sort(function (a, b) { return (b.week || 0) - (a.week || 0); })[0];
                        if (la) return "W" + la.week + " \u00B7 " + la.action + (la.notes ? " \u2014 " + la.notes : "");
                        return issueByKey[row.key] || "";
                      })()}>
                      {(function () {
                        var la = (rA || []).slice().sort(function (a, b) { return (b.week || 0) - (a.week || 0); })[0];
                        if (la) return <span><span style={{ color: N.textT, fontWeight: 700 }}>W{la.week}</span> {la.action}{la.notes ? " \u2014 " + la.notes : ""}</span>;
                        var iss = issueByKey[row.key];
                        if (!iss) return <span style={{ color: N.textT }}>{"\u2014"}</span>;
                        return <span>{iss}</span>;
                      })()}
                    </td>}
                  </tr>
                ];
                return rowEls;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "9px 2px 0", borderTop: "1px solid " + N.border, display: "flex", justifyContent: "space-between", gap: 16, fontSize: 9, color: N.textT, marginBottom: 0 }}>
        <span>Complaint Tracker {"\u2014"} {title}</span>
        <span>{visibleProducts}/{totalProducts} products {"\u00B7"} {Object.keys(stoppedAds).length} stopped {"\u00B7"} Complaints W{weekRange[0]}{"\u2013"}W{weekRange[1]} vs Orders W{ordersWR[0]}{"\u2013"}W{ordersWR[1]} {"\u00B7"} 14d lag {"\u00B7"} Orders 14d = W{latestDataWeek - 1}{"\u2013"}W{latestDataWeek} {"\u00B7"} Min {minSales} sales {"\u00B7"} Margin data: {Object.keys(contribData).length} products{Object.keys(contribData).length === 0 ? " \u2014 check contribUrl gid (README)" : ""}</span>
      </div>

      {toast && createPortal(
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(180deg, rgba(24,32,48,0.98), rgba(14,19,29,0.98))", border: "1px solid rgba(56,140,255,0.35)", color: "#EAF2FF", fontSize: 15, fontWeight: 700, padding: "14px 26px", borderRadius: 99, zIndex: 10000, boxShadow: "0 16px 50px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset", animation: "toastIn 0.25s ease", fontFamily: FONT, whiteSpace: "nowrap", maxWidth: "90vw", overflow: "hidden", textOverflow: "ellipsis" }}>
          <style>{"@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}"}</style>
          {toast}
        </div>,
        document.body
      )}
      {focusedProduct && (
        <div onClick={closeFocus}
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(4,6,12,0.86)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 30, opacity: closing ? 0 : 1, transition: "opacity 0.3s ease" }} />
      )}
      {focusedProduct && shownRow && (
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: closing ? "translate(-50%, -46%)" : "translate(-50%, -50%)", width: "min(1100px, 95vw)", maxHeight: "90vh", overflowY: "auto", zIndex: 40, opacity: closing ? 0 : 1, transition: "opacity 0.3s ease, transform 0.3s ease" }}>
          <FocusPanel
            row={shownRow}
            image={shownRow.image}
            zones={zones}
            quotes={focusQuotes}
            aiData={focusAI}
            allRows={allComplaints.filter(function (c) { return c.key === shownRow.key; }).sort(function (a, b) { return (b.week || 0) - (a.week || 0); })}
            onClose={closeFocus}
            storeDomain={STORE_CSVS[selectedStore].domain || ""}
            storeName={STORE_CSVS[selectedStore].name}
            contrib={contribData[shownRow.key]}
            stoppedInfo={stoppedAds[shownRow.key]}
            actionItems={actionsByProduct[shownRow.key] || []}
            onLogAction={makeLogAction(shownRow)}
            onStopAds={makeStopAds(shownRow)}
            onUndoAction={undoAction}
            onUndoStop={makeUndoStop(shownRow)}
          />
        </div>
      )}

      <FloatingWidgets storeName={STORE_CSVS[selectedStore].name} chatContext={chatContext} reportData={reportData} />
      </main>
    </div>
  );
}
