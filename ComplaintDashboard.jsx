import { useState, useEffect, useMemo } from "react";

/* ══════════════════════════════════════════
   STORE CONFIG — add up to 5 stores
   ══════════════════════════════════════════ */
var STORE_CSVS = [
  {
    name: "Clarendale",
    complaintsUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=27271439&single=true&output=csv",
    ordersUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=1091916976&single=true&output=csv",
    // Contribution margin sheet (published CSV). Cols: B = Product ID, N = refund rate, O = breakeven ROAS.
    contribUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2TwY2Xoy8VTCaLt_jNgXe_-VRMTdS_ahkoakiCwHcAqIGg3PFCIK4286TUpeRwVjRW5LGHE5lPGAp/pub?output=csv",
  },
  {
    name: "Lark & Clover",
    complaintsUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=113813265&single=true&output=csv",
    ordersUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTebDK0L1zu6vE8T7NGW6352-RzjHc4DHGfWH7YjADDGn0Z9J18K6GvlpmHCX6-EpjgZ8KjTD0J20Df/pub?gid=2078912011&single=true&output=csv",
    contribUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTqyqMMxRWMzCQf8ZMsIERubusembyKZiyoAW6vq4lIbUcd_HxQnA5BOe7QYE-c4U9CXQ9-lh-ZTBQr/pub?output=csv",
  },
  // { name: "Store 3", complaintsUrl: "...", ordersUrl: "...", contribUrl: "..." },
];
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
var APPS_SCRIPT_URL = "";

/* ── THEME ── */
var N = {
  bg: "#191919",
  bgS: "#2F3437",
  bgC: "#252525",
  text: "rgba(255,255,255,0.9)",
  textS: "rgba(255,255,255,0.5)",
  textT: "rgba(255,255,255,0.3)",
  border: "rgba(255,255,255,0.06)",
  green: "#34D399",
  red: "#FF7369",
  orange: "#FFA344",
  blue: "#529CCA",
  grey: "rgba(255,255,255,0.35)",
};
var FONT = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";

var CATEGORIES = [
  { key: "too_large", label: "Too Large", color: "#529CCA" },
  { key: "too_small", label: "Too Small", color: "#E255A1" },
  { key: "looks_different", label: "Looks Different", color: "#FFA344" },
  { key: "quality", label: "Quality / Defective", color: "#9A6DD7" },
  { key: "other", label: "Other", color: "rgba(255,255,255,0.35)" },
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

var LAG_WEEKS = 2; // fixed 14-day shipping lag

var EARLY_WARNING_COUNT = 5;
var EARLY_WARNING_MIN_ORDERS = 30;

var KILL_DEBATE_THRESHOLD = 8;
var KILL_AUTO_THRESHOLD = 10;
var KILL_TOTAL_THRESHOLD = 23;

// Product status rules
var INACTIVE_SALES_7D = 5;   // < 5 sales in latest data week → Inactive
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
  });
  var out = [];
  for (var i = hi + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.length < 3) continue;
    var rawTitle = (r[ci.product] || "").trim();
    var pid = normId(r[ci.pid]);
    if (!pid && !rawTitle) continue;
    registerId(pid, rawTitle);
    var ds = (r[ci.date] || "").trim();
    out.push({
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
    var wm = c.match(/^w(\d+)$/);
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

/* Contribution margin CSV → map productId -> { refundRate, beRoas }.
   Header-based first ("refund", "roas"/"breakeven"); falls back to fixed
   columns B (id), N (refund), O (breakeven ROAS) if headers don't match. */
function parseContribCSV(text) {
  var rows = text.split("\n").map(parseCSVRow);
  var hi = findHeader(rows, ["product", "refund", "roas", "margin"]);
  if (hi === -1) hi = 0;
  var h = rows[hi].map(function (c) { return c.toLowerCase().trim(); });
  var ci = { pid: -1, refund: -1, roas: -1 };
  h.forEach(function (c, i) {
    if (ci.pid === -1 && c.indexOf("id") !== -1 && c.indexOf("product") !== -1) ci.pid = i;
    if (ci.refund === -1 && c.indexOf("refund") !== -1) ci.refund = i;
    if (ci.roas === -1 && (c.indexOf("roas") !== -1 || c.indexOf("breakeven") !== -1 || c.indexOf("break-even") !== -1 || c.indexOf("break even") !== -1)) ci.roas = i;
  });
  // Fallback to fixed layout: B=1, N=13, O=14
  if (ci.pid === -1) ci.pid = 1;
  if (ci.refund === -1) ci.refund = 13;
  if (ci.roas === -1) ci.roas = 14;
  var out = {};
  for (var i = hi + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.length <= ci.pid) continue;
    var pid = normId(r[ci.pid]);
    if (!pid) continue;
    var refund = cleanNum(r[ci.refund]);
    var roas = cleanNum(r[ci.roas]);
    if (refund == null && roas == null) continue;
    // Refund often stored as fraction (0.043) — normalize to %
    if (refund != null && refund <= 1) refund = refund * 100;
    out[pid] = { refundRate: refund, beRoas: roas };
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
    if (parsed.weekAnchor !== currentMonday) {
      return { weekAnchor: currentMonday, products: {} };
    }
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
  return N.textS; // green zone: no green color — dim, so problems stand out
}
// Green zone gets NO background anymore — only amber/red draw attention.
function getHeatBg(v, z) {
  if (v <= 0) return "transparent";
  if (v < z.amber[0]) return "transparent";
  if (v < z.red[0]) return "rgba(255,163,68,0.2)";
  return "rgba(255,115,105,0.25)";
}

/* POST to the Apps Script webhook. text/plain avoids the CORS preflight. */
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

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
      <rect x="5" y="5" width="90" height="90" rx="4" stroke="rgba(255,255,255,0.8)" strokeWidth="5" fill="none" />
      <path d="M 10 75 Q 20 70 30 60 Q 40 45 50 50 Q 60 55 70 35 Q 80 20 90 25" stroke="rgba(255,255,255,0.85)" strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* Status chip */
var STATUS_STYLES = {
  Active:   { color: N.green,  bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.3)" },
  Edited:   { color: N.blue,   bg: "rgba(82,156,202,0.14)",  border: "rgba(82,156,202,0.35)" },
  Inactive: { color: N.grey,   bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)" },
  Stopped:  { color: N.red,    bg: "rgba(255,115,105,0.1)",  border: "rgba(255,115,105,0.3)" },
};
function StatusChip(props) {
  var s = STATUS_STYLES[props.status] || STATUS_STYLES.Inactive;
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: s.color, background: s.bg, border: "1px solid " + s.border, padding: "2px 7px", borderRadius: 3, letterSpacing: "0.03em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
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
  var onUndo = props.onUndo;
  if (items.length === 0) {
    return <div style={{ fontSize: 10, color: N.textT, fontStyle: "italic", padding: "4px 0" }}>No actions logged for this product.</div>;
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
          deltaColor = a.deltaPP == null ? N.textT : (a.deltaPP < -0.5 ? "rgba(52,211,153,0.65)" : (a.deltaPP > 0.5 ? "rgba(255,115,105,0.65)" : N.textS));
        }
        var confTag = null;
        if (confidence === "low") confTag = { text: "Low confidence \u00B7 " + a.afterOrders + " orders after", color: N.orange };
        else if (confidence === "preliminary") confTag = { text: "Preliminary \u00B7 " + a.afterOrders + "/" + MIN_CONFIDENT_ORDERS + " orders", color: N.orange };
        else if (confidence === "confident") confTag = { text: "Confident", color: N.green };
        var canUndo = onUndo && a.uuid && a.uuid.indexOf("dash-") === 0;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid " + N.border, opacity: a.pending ? 0.6 : 1 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 11, flexWrap: "wrap" }}>
              <span style={{ color: N.blue, fontWeight: 700, fontSize: 10, minWidth: 32 }}>W{a.week}</span>
              <span style={{ fontSize: 9, color: N.textS, background: "rgba(82,156,202,0.12)", padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>{cat ? cat.label : a.category}</span>
              <span style={{ color: N.text, fontWeight: 500, flex: 1, minWidth: 160 }}>{a.action}</span>
              {a.date && <span style={{ fontSize: 9, color: N.textT }}>{a.date}</span>}
              {a.status && <span style={{ fontSize: 9, color: a.status === "Active" || a.status === "Confirmed" ? N.green : N.orange, background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 3 }}>{a.status}</span>}
              {a.pending && <span style={{ fontSize: 9, color: N.orange }}>{"saving\u2026"}</span>}
              {canUndo && !a.pending && (
                <button onClick={function () { onUndo(a); }} title="Remove this action from the sheet"
                  style={{ background: "transparent", border: "1px solid rgba(255,115,105,0.3)", color: N.red, fontSize: 9, padding: "1px 7px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit" }}>
                  {"\u21BA"} Undo
                </button>
              )}
            </div>
            {a.expectedEffect && (
              <div style={{ fontSize: 10, color: N.textS, paddingLeft: 42 }}>
                <span style={{ color: N.textT }}>Expected:</span> {a.expectedEffect}
              </div>
            )}
            {a.notes && (
              <div style={{ fontSize: 10, color: N.textS, paddingLeft: 42 }}>
                <span style={{ color: N.textT }}>Notes:</span> {a.notes}
              </div>
            )}
            <div style={{ display: "flex", gap: 14, alignItems: "center", paddingLeft: 42, fontSize: 10, fontVariantNumeric: "tabular-nums", marginTop: 2, flexWrap: "wrap" }}>
              {a.beforeOrders > 0 ? (
                <div>
                  <span style={{ color: N.textT, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 6 }}>Before W{a.beforeWindow[0]}{"\u2013"}{a.beforeWindow[1]}</span>
                  <span style={{ color: N.text, fontWeight: 700 }}>{fmtPct(a.beforePct)}</span>
                  <span style={{ color: N.textT, marginLeft: 4 }}>({a.beforeComplaints}/{a.beforeOrders})</span>
                </div>
              ) : (
                <span style={{ color: N.textT, fontStyle: "italic" }}>No baseline (0 orders before)</span>
              )}
              <span style={{ color: N.textT }}>{"\u2192"}</span>
              {a.afterOrders > 0 ? (
                <div>
                  <span style={{ color: N.textT, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 6 }}>After W{a.afterWindow[0]}{"\u2013"}{a.afterWindow[1]}</span>
                  <span style={{ color: N.text, fontWeight: 700 }}>{fmtPct(a.afterPct)}</span>
                  <span style={{ color: N.textT, marginLeft: 4 }}>({a.afterComplaints}/{a.afterOrders})</span>
                </div>
              ) : (
                <span style={{ color: N.textT, fontStyle: "italic" }}>No orders yet after the change</span>
              )}
              {hasBoth && (
                <span style={{ color: deltaColor, fontWeight: 700, fontSize: 11 }}>
                  {a.deltaPP < -0.5 ? "\u25BC" : (a.deltaPP > 0.5 ? "\u25B2" : "\u2014")} {fmtSignedPct(a.deltaPP)}
                </span>
              )}
              {confTag && (
                <span style={{ fontSize: 9, color: confTag.color, background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 3, border: "1px solid " + N.border }}>
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
function CategoryBars(props) {
  var row = props.row;
  var max = Math.max.apply(null, CATEGORIES.map(function (c) { return row[c.key + "_count"] || 0; }).concat([1]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {CATEGORIES.map(function (c) {
        var count = row[c.key + "_count"] || 0;
        var pct = row[c.key] || 0;
        var z = props.zones[c.key];
        return (
          <div key={c.key} style={{ display: "grid", gridTemplateColumns: "110px 1fr 70px", gap: 8, alignItems: "center", fontSize: 10 }}>
            <span style={{ color: N.textS }}>{c.label}</span>
            <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: (count / max * 100) + "%", background: pct >= z.red[0] ? N.red : (pct >= z.amber[0] ? N.orange : "rgba(255,255,255,0.25)"), borderRadius: 4, transition: "width 0.3s" }} />
            </div>
            <span style={{ color: pct >= z.amber[0] ? getZoneColor(pct, z) : N.textS, fontWeight: pct >= z.amber[0] ? 700 : 400, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
              {count} {"\u00B7"} {fmtPct(pct)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FocusPanel(props) {
  var row = props.row;
  var stA = useState(false); var showForm = stA[0]; var setShowForm = stA[1];
  var stF = useState({ category: "too_small", action: "", expectedEffect: "", notes: "" });
  var form = stF[0]; var setForm = stF[1];
  var stB = useState(false); var busy = stB[0]; var setBusy = stB[1];
  var stE = useState(""); var err = stE[0]; var setErr = stE[1];
  var stSN = useState(""); var stopNote = stSN[0]; var setStopNote = stSN[1];
  var stSF = useState(false); var showStopForm = stSF[0]; var setShowStopForm = stSF[1];

  var quotes = props.quotes || [];
  var contrib = props.contrib;
  var writeEnabled = !!APPS_SCRIPT_URL;

  function submitAction() {
    if (!form.action.trim()) { setErr("Action description is required."); return; }
    setBusy(true); setErr("");
    props.onLogAction(Object.assign({}, form))
      .then(function () { setBusy(false); setShowForm(false); setForm({ category: "too_small", action: "", expectedEffect: "", notes: "" }); })
      .catch(function (e) { setBusy(false); setErr(String(e.message || e)); });
  }
  function submitStop() {
    setBusy(true); setErr("");
    props.onStopAds(stopNote)
      .then(function () { setBusy(false); setShowStopForm(false); setStopNote(""); })
      .catch(function (e) { setBusy(false); setErr(String(e.message || e)); });
  }

  var inputStyle = { background: N.bg, border: "1px solid " + N.border, borderRadius: 4, color: N.text, fontSize: 11, fontFamily: "inherit", padding: "6px 8px", outline: "none", width: "100%" };
  var btnStyle = function (color, bg, border) {
    return { background: bg, border: "1px solid " + border, color: color, fontSize: 10, fontWeight: 600, padding: "5px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit" };
  };

  return (
    <div style={{ background: "rgba(82,156,202,0.04)", border: "1px solid rgba(82,156,202,0.25)", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Top row: photo + key stats + quotes */}
      <div style={{ display: "grid", gridTemplateColumns: props.image ? "140px 1fr 1fr" : "1fr 1fr", gap: 16, alignItems: "start" }}>
        {props.image && (
          <img src={props.image} alt={row.product} style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 6, border: "1px solid " + N.border, background: N.bg }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <StatusChip status={row.status} />
            {props.stoppedInfo && (
              <span style={{ fontSize: 9, color: N.red }}>
                {"\u{1F6AB}"} stopped {props.stoppedInfo.stoppedDate ? "since " + props.stoppedInfo.stoppedDate : ""}
                {props.stoppedInfo.note ? " \u00B7 " + props.stoppedInfo.note : ""}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Orders 7d", value: row.orders7d != null ? row.orders7d.toLocaleString() : "\u2014" },
              { label: "Orders (range)", value: row.orders.toLocaleString() },
              { label: "Complaints", value: row.complaints },
              { label: "Total %", value: fmtPct(row.pct), color: row.pct >= KILL_TOTAL_THRESHOLD ? N.red : N.text },
              contrib && contrib.refundRate != null ? { label: "Refund rate", value: fmtPct(contrib.refundRate), color: contrib.refundRate >= 10 ? N.red : N.text } : null,
              contrib && contrib.beRoas != null ? { label: "BE ROAS", value: contrib.beRoas.toFixed(2) } : null,
            ].filter(Boolean).map(function (s) {
              return (
                <div key={s.label} style={{ background: N.bg, border: "1px solid " + N.border, borderRadius: 5, padding: "6px 12px", minWidth: 76 }}>
                  <div style={{ fontSize: 8, color: N.textT, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.color || N.text, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                </div>
              );
            })}
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: N.textT, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Complaints by category</div>
            <CategoryBars row={row} zones={props.zones} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: N.textT, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Recent complaint tickets {quotes.total > 0 ? "(" + quotes.total + " with detail)" : ""}
          </div>
          {quotes.items.length === 0 ? (
            <div style={{ fontSize: 10, color: N.textT, fontStyle: "italic" }}>
              No ticket summaries found. {COMPLAINT_DETAIL_CSV_URL ? "" : "Set COMPLAINT_DETAIL_CSV_URL (or add a Summary column to the complaints tab)."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {quotes.items.map(function (q, i) {
                var cat = CATEGORIES.find(function (c) { return c.key === q.type; });
                return (
                  <div key={i} style={{ background: N.bg, border: "1px solid " + N.border, borderRadius: 5, padding: "7px 10px", fontSize: 10.5, color: N.textS, lineHeight: 1.4 }}>
                    <span style={{ color: cat ? cat.color : N.textT, fontWeight: 600, fontSize: 9, marginRight: 6 }}>{cat ? cat.label : q.type}</span>
                    {q.dateStr && <span style={{ color: N.textT, fontSize: 9, marginRight: 6 }}>{q.dateStr}</span>}
                    <span style={{ fontStyle: "italic" }}>{"\u201C"}{q.summary}{"\u201D"}</span>
                  </div>
                );
              })}
              {quotes.total > quotes.items.length && (
                <div style={{ fontSize: 9, color: N.textT }}>+ {quotes.total - quotes.items.length} more tickets not shown</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action history + log buttons */}
      <div style={{ borderTop: "1px solid " + N.border, paddingTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: N.blue, textTransform: "uppercase", letterSpacing: "0.05em" }}>{"\u26A1"} Edit history</div>
          <div style={{ display: "flex", gap: 8 }}>
            {writeEnabled ? (
              <>
                <button onClick={function () { setShowForm(!showForm); setShowStopForm(false); }} style={btnStyle(N.blue, "rgba(82,156,202,0.12)", "rgba(82,156,202,0.35)")}>+ Log action</button>
                {!props.stoppedInfo && (
                  <button onClick={function () { setShowStopForm(!showStopForm); setShowForm(false); }} style={btnStyle(N.red, "rgba(255,115,105,0.1)", "rgba(255,115,105,0.3)")}>{"\u{1F6AB}"} Stop advertising</button>
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
        {showForm && (
          <div style={{ background: N.bg, border: "1px solid " + N.border, borderRadius: 6, padding: 12, marginBottom: 10, display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 8, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 8, color: N.textT, textTransform: "uppercase", marginBottom: 4 }}>Category</div>
              <select value={form.category} onChange={function (e) { setForm(Object.assign({}, form, { category: e.target.value })); }} style={inputStyle}>
                {CATEGORIES.map(function (c) { return <option key={c.key} value={c.key}>{c.label}</option>; })}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 8, color: N.textT, textTransform: "uppercase", marginBottom: 4 }}>Action *</div>
              <input value={form.action} placeholder="e.g. Supplier ships 1 size up" onChange={function (e) { setForm(Object.assign({}, form, { action: e.target.value })); }} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: N.textT, textTransform: "uppercase", marginBottom: 4 }}>Expected effect</div>
              <input value={form.expectedEffect} placeholder="e.g. -50% too_small" onChange={function (e) { setForm(Object.assign({}, form, { expectedEffect: e.target.value })); }} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / span 2" }}>
              <div style={{ fontSize: 8, color: N.textT, textTransform: "uppercase", marginBottom: 4 }}>Notes</div>
              <input value={form.notes} onChange={function (e) { setForm(Object.assign({}, form, { notes: e.target.value })); }} style={inputStyle} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy} onClick={submitAction} style={btnStyle("#fff", N.blue, N.blue)}>{busy ? "Saving\u2026" : "Save to sheet"}</button>
              <button disabled={busy} onClick={function () { setShowForm(false); }} style={btnStyle(N.textS, "transparent", N.border)}>Cancel</button>
            </div>
          </div>
        )}
        {showStopForm && (
          <div style={{ background: N.bg, border: "1px solid rgba(255,115,105,0.25)", borderRadius: 6, padding: 12, marginBottom: 10, display: "flex", gap: 8, alignItems: "end" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: N.textT, textTransform: "uppercase", marginBottom: 4 }}>Reason / note</div>
              <input value={stopNote} placeholder="e.g. Quality complaints 12% - killing" onChange={function (e) { setStopNote(e.target.value); }} style={inputStyle} />
            </div>
            <button disabled={busy} onClick={submitStop} style={btnStyle("#fff", N.red, N.red)}>{busy ? "Saving\u2026" : "Confirm stop"}</button>
            <button disabled={busy} onClick={function () { setShowStopForm(false); }} style={btnStyle(N.textS, "transparent", N.border)}>Cancel</button>
          </div>
        )}
        <ActionHistory items={props.actionItems} onUndo={props.onUndoAction} />
      </div>
    </div>
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
  var stT = useState("USA General Stores"); var title = stT[0]; var setTitle = stT[1];
  var stW = useState([1, 8]); var weekRange = stW[0]; var setWeekRange = stW[1];
  var stMinSales = useState(50); var minSales = stMinSales[0]; var setMinSales = stMinSales[1];
  var stHover = useState(null); var hoveredProduct = stHover[0]; var setHoveredProduct = stHover[1];
  var stZ = useState(DEFAULT_ZONES); var zones = stZ[0]; var setZones = stZ[1];
  var stSrc = useState("loading"); var dataSrc = stSrc[0]; var setDataSrc = stSrc[1];
  var stStore = useState(0); var selectedStore = stStore[0]; var setSelectedStore = stStore[1];
  var stChecked = useState(function () { return loadCheckedProducts(); });
  var checkedState = stChecked[0]; var setCheckedState = stChecked[1];
  var stStopped = useState({}); var sheetStopped = stStopped[0]; var setSheetStopped = stStopped[1];
  var stAdFilter = useState("advertising"); var adFilter = stAdFilter[0]; var setAdFilter = stAdFilter[1];

  // NEW state
  var stFocus = useState(null); var focusedProduct = stFocus[0]; var setFocusedProduct = stFocus[1];
  var stSort = useState("pct"); var sortBy = stSort[0]; var setSortBy = stSort[1];
  var stBd = useState(false); var showBreakdown = stBd[0]; var setShowBreakdown = stBd[1];
  var stSf = useState("all"); var statusFilter = stSf[0]; var setStatusFilter = stSf[1];
  var stContrib = useState({}); var contribData = stContrib[0]; var setContribData = stContrib[1];
  // Optimistic writes (appear instantly, survive until CSV reload confirms them)
  var stLA = useState([]); var localActions = stLA[0]; var setLocalActions = stLA[1];
  var stLS = useState({}); var localStopped = stLS[0]; var setLocalStopped = stLS[1];

  function toggleChecked(product) {
    setCheckedState(function (prev) {
      var nextProducts = Object.assign({}, prev.products);
      if (nextProducts[product]) delete nextProducts[product];
      else nextProducts[product] = true;
      var next = { weekAnchor: prev.weekAnchor, products: nextProducts };
      saveCheckedProducts(next);
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
      var comps = [], ords = [], acts = [], fetched = false;
      var store = STORE_CSVS[selectedStore];
      if (store) {
        try {
          if (store.complaintsUrl) {
            var cT = await (await fetch(store.complaintsUrl)).text();
            var cD = parseComplaintsCSV(cT, store.name);
            if (cD.length > 0) { comps = comps.concat(cD); fetched = true; }
          }
          if (store.ordersUrl) {
            var oT = await (await fetch(store.ordersUrl)).text();
            var oD = parseOrdersCSV(oT);
            if (oD.length > 0) { ords = ords.concat(oD); fetched = true; }
          }
        } catch (e) { console.error("Store load fail:", store.name, e); }
        // Contribution margin (refund rate + BE ROAS)
        try {
          if (store.contribUrl) {
            var mT = await (await fetch(store.contribUrl)).text();
            setContribData(parseContribCSV(mT));
          } else setContribData({});
        } catch (e) { setContribData({}); }
      }
      // Complaint Detail (optional, global)
      try {
        if (COMPLAINT_DETAIL_CSV_URL) {
          var dT = await (await fetch(COMPLAINT_DETAIL_CSV_URL)).text();
          var dD = parseComplaintsCSV(dT, store ? store.name : "");
          // Only keep detail rows that actually carry a summary; merge in.
          comps = comps.concat(dD.filter(function (c) { return c.summary; }).map(function (c) { return Object.assign({}, c, { detailOnly: true }); }));
        }
      } catch (e) { /* no-op */ }
      try {
        var aT = await (await fetch(ACTIONS_CSV_URL)).text();
        acts = parseActionsCSV(aT);
      } catch (e) { /* no-op */ }
      try {
        var stoppedT = await (await fetch(STOPPED_ADS_CSV_URL)).text();
        setSheetStopped(parseStoppedAdsCSV(stoppedT));
      } catch (e) { /* no-op */ }
      try {
        var cfgT = await (await fetch(CONFIG_CSV_URL)).text();
        var cfg = parseConfigCSV(cfgT, DEFAULT_ZONES);
        setZones(cfg.zones);
        if (cfg.minSales != null) setMinSales(cfg.minSales);
      } catch (e) { /* no-op */ }
      if (store) setTitle(store.name);

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
      if (weeks.length > 0) setWeekRange([Math.min.apply(null, weeks), Math.max.apply(null, weeks)]);
      setLoading(false);
    }
    loadData();
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

  var complaints = useMemo(function () {
    return allComplaints.filter(function (c) { return !c.detailOnly && c.week != null && c.week >= weekRange[0] && c.week <= weekRange[1]; });
  }, [allComplaints, weekRange]);

  var ordersWR = [Math.max(1, weekRange[0] - LAG_WEEKS), Math.max(1, weekRange[1] - LAG_WEEKS)];

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
      var weekNums = Object.keys(wk).map(Number);
      var firstWeek = weekNums.length > 0 ? Math.min.apply(null, weekNums) : null;
      var orders7d = latestDataWeek > 0 ? (wk[latestDataWeek] || 0) : null;
      var isStopped = !!stoppedAds[k];
      var status = isStopped ? "Stopped"
                 : (orders7d != null && orders7d < INACTIVE_SALES_7D) ? "Inactive"
                 : editedRecently[k] ? "Edited"
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
      if (p.orders < minSales) return false;
      var isStopped = !!stoppedAds[p.key];
      if (adFilter === "advertising" && isStopped) return false;
      if (adFilter === "stopped" && !isStopped) return false;
      if (statusFilter !== "all" && p.status.toLowerCase() !== statusFilter) return false;
      return true;
    });
  }, [productData, minSales, stoppedAds, adFilter, statusFilter]);

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
      return row;
    });
    // Sorting — click the column headers to switch
    rows.sort(function (a, b) {
      if (sortBy === "complaints") return b.complaints - a.complaints;
      if (sortBy === "orders7d") return (b.orders7d || 0) - (a.orders7d || 0);
      if (sortBy === "newest") {
        var fa = a.firstWeek == null ? -Infinity : a.firstWeek;
        var fb = b.firstWeek == null ? -Infinity : b.firstWeek;
        return fb - fa;
      }
      return b.pct - a.pct; // default: total %
    });
    return rows;
  }, [filteredProductData, sortBy]);

  // Actions per product with before/after
  var actionsByProduct = useMemo(function () {
    var map = {};
    actions.forEach(function (a) {
      if (!a.week) return;
      if (!map[a.key]) map[a.key] = [];
      var aw = a.week;
      var beforeStart = Math.max(1, aw - 4);
      var beforeEnd = aw - 1;
      var afterStart = aw;
      var afterEnd = weekRange[1];
      var ordersFor = function (start, end) {
        var t = 0;
        var wk = ordersByKey[a.key] ? ordersByKey[a.key].weekOrders : {};
        for (var w = start - LAG_WEEKS; w <= end - LAG_WEEKS; w++) {
          if (w >= 1) t += wk[w] || 0;
        }
        return t;
      };
      var complaintsFor = function (start, end) {
        return allComplaints.filter(function (c) {
          return !c.detailOnly && c.key === a.key && c.type === a.category && c.week >= start && c.week <= end;
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
        week: currentWeekNum(),
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
          week: currentWeekNum(),
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

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: N.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, fontFamily: FONT }}>
        <div style={{ width: 40, height: 40, border: "2px solid " + N.border, borderTopColor: N.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        <div style={{ color: N.textT, fontSize: 11, fontWeight: 500, letterSpacing: "0.03em" }}>Loading data...</div>
      </div>
    );
  }

  var totalProducts = productData.length;
  var visibleProducts = filteredProductData.length;
  var hoveredActions = hoveredProduct ? (actionsByProduct[hoveredProduct] || []) : [];
  var hoveredTitle = hoveredProduct ? (titleByKey[hoveredProduct] || (stoppedAds[hoveredProduct] && stoppedAds[hoveredProduct].title) || hoveredProduct) : "";
  var showHoverPanel = hoveredProduct && !focusedProduct;

  var sortableHeader = function (label, key) {
    var active = sortBy === key;
    return (
      <span style={{ cursor: "pointer", color: active ? N.text : "inherit", userSelect: "none" }}
        onClick={function () { setSortBy(key); }}
        title={"Sort by " + label}>
        {label}{active ? " \u25BE" : ""}
      </span>
    );
  };

  var visibleColCount = 8 + (showBreakdown ? CATEGORIES.length : 0);

  return (
    <div style={{ minHeight: "100vh", background: N.bg, color: N.text, fontFamily: FONT, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo />
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Complaint Tracker</h1>
          </div>
          {/* Store picker — big segmented control, impossible to miss */}
          <div style={{ display: "flex", gap: 4, background: N.bgC, borderRadius: 6, padding: 4, border: "1px solid " + N.border }}>
            {STORE_CSVS.map(function (s, i) {
              var active = selectedStore === i;
              return (
                <button key={i} onClick={function () { setSelectedStore(i); }}
                  style={{
                    background: active ? N.blue : "transparent",
                    color: active ? "#fff" : N.textS,
                    border: "none", borderRadius: 4,
                    fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                    padding: "8px 18px", cursor: "pointer",
                    transition: "background 0.15s, color 0.15s",
                  }}>
                  {s.name}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 8, color: dataSrc === "live" ? N.green : N.orange, textTransform: "uppercase", letterSpacing: "0.05em" }}>{dataSrc === "live" ? "\u25CF live" : "\u25CF demo"}</span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Week range */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: N.bgC, borderRadius: 4, padding: "4px 10px", border: "1px solid " + N.border }}>
            <span style={{ fontSize: 9, color: N.textT }}>W</span>
            <select value={weekRange[0]} onChange={function (e) { setWeekRange([Number(e.target.value), Math.max(Number(e.target.value), weekRange[1])]); }} style={{ background: "transparent", border: "none", color: N.text, fontSize: 11, fontFamily: "inherit", outline: "none" }}>
              {availableWeeks.map(function (w) { return <option key={w} value={w}>{w}</option>; })}
            </select>
            <span style={{ color: N.textT, fontSize: 9 }}>{"\u2192"}</span>
            <select value={weekRange[1]} onChange={function (e) { setWeekRange([Math.min(weekRange[0], Number(e.target.value)), Number(e.target.value)]); }} style={{ background: "transparent", border: "none", color: N.text, fontSize: 11, fontFamily: "inherit", outline: "none" }}>
              {availableWeeks.map(function (w) { return <option key={w} value={w}>{w}</option>; })}
            </select>
          </div>
          {/* Min sales */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: N.bgC, borderRadius: 4, padding: "4px 10px", border: "1px solid " + N.border }}>
            <span style={{ fontSize: 9, color: N.textT }}>Min sales</span>
            <input type="number" min={0} step={10} value={minSales}
              onChange={function (e) { setMinSales(Math.max(0, Number(e.target.value) || 0)); }}
              style={{ background: "transparent", border: "none", color: N.text, fontSize: 11, fontFamily: "inherit", outline: "none", width: 50 }} />
            <span style={{ fontSize: 9, color: N.textT }}>orders</span>
          </div>
          {/* Ad filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: N.bgC, borderRadius: 4, padding: "4px 10px", border: "1px solid " + N.border }}>
            <span style={{ fontSize: 9, color: N.textT }}>Show</span>
            <select value={adFilter} onChange={function (e) { setAdFilter(e.target.value); }} style={{ background: "transparent", border: "none", color: N.text, fontSize: 11, fontFamily: "inherit", outline: "none" }}>
              <option value="advertising">Advertising</option>
              <option value="all">All</option>
              <option value="stopped">Stopped</option>
            </select>
          </div>
          {/* Status filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: N.bgC, borderRadius: 4, padding: "4px 10px", border: "1px solid " + N.border }}>
            <span style={{ fontSize: 9, color: N.textT }}>Status</span>
            <select value={statusFilter} onChange={function (e) { setStatusFilter(e.target.value); }} style={{ background: "transparent", border: "none", color: N.text, fontSize: 11, fontFamily: "inherit", outline: "none" }}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="edited">Edited</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.5fr", gap: 8 }}>
        {[
          { label: "Total Orders", value: totals.orders.toLocaleString() },
          { label: "Total Complaints", value: totals.complaints.toLocaleString() },
          { label: "Complaint %", value: fmtPct(totals.pct) },
          { label: "Worst Product", value: totals.worst ? totals.worst.product : "\u2014", sub: totals.worst ? fmtPct(totals.worst.pct) : "" },
        ].map(function (k) {
          return (
            <div key={k.label} style={{ background: N.bgC, border: "1px solid " + N.border, borderRadius: 6, padding: "10px 14px" }}>
              <div style={{ fontSize: 8, color: N.textT, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: N.text, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.value}</div>
              {k.sub && <div style={{ fontSize: 10, color: N.textS, marginTop: 2 }}>{k.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ background: N.bgC, border: "1px solid " + N.border, borderRadius: 8, padding: 12, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: N.textS, textTransform: "uppercase", letterSpacing: "0.04em" }}>Products</div>
            {heatmapData.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: N.textS }}>
                <span style={{ color: N.green, fontWeight: 600 }}>
                  {Object.keys(checkedState.products).filter(function (p) { return heatmapData.some(function (r) { return r.key === p; }); }).length}/{heatmapData.length} reviewed
                </span>
                <span style={{ color: N.textT, fontSize: 9 }}>{"\u00B7"} resets Monday</span>
                <button onClick={resetChecked} style={{ background: "transparent", border: "1px solid " + N.border, color: N.textT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit" }}>
                  Reset
                </button>
              </div>
            )}
            {focusedProduct && (
              <button onClick={function () { setFocusedProduct(null); }} style={{ background: "rgba(82,156,202,0.12)", border: "1px solid rgba(82,156,202,0.35)", color: N.blue, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }}>
                {"\u2715"} Exit focus
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 9, color: N.textT, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={function () { setShowBreakdown(!showBreakdown); }}
              style={{ background: showBreakdown ? "rgba(82,156,202,0.15)" : "transparent", border: "1px solid " + (showBreakdown ? "rgba(82,156,202,0.4)" : N.border), color: showBreakdown ? N.blue : N.textS, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }}>
              {showBreakdown ? "Hide breakdown" : "Show breakdown"}
            </button>
            {showBreakdown && (
              <>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(255,163,68,0.35)" }} />
                  6{"\u2013"}8%
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(255,115,105,0.4)" }} />
                  {"\u2265"} 8%
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                <th style={{ background: N.bgS, padding: "8px 6px", position: "sticky", top: 0, width: 36 }}></th>
                {[
                  { label: sortableHeader("Week Started", "newest"), align: "center" },
                  { label: "Status", align: "center" },
                  { label: "Product", align: "left" },
                  { label: sortableHeader("Orders 7d", "orders7d"), align: "center" },
                  { label: sortableHeader("Comp.", "complaints"), align: "center" },
                  { label: sortableHeader("Total %", "pct"), align: "center" },
                  { label: "Signal", align: "center" },
                ].concat(showBreakdown ? CATEGORIES.map(function (c) { return { label: c.label, align: "center" }; }) : []).map(function (h, i) {
                  return (
                    <th key={i} style={{ background: N.bgS, color: N.textS, fontWeight: 600, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.03em", padding: "8px 10px", textAlign: h.align, whiteSpace: "nowrap", position: "sticky", top: 0 }}>
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
                var dimmed = focusedProduct && !isFocused;
                var rowEls = [
                  <tr
                    key={row.key}
                    onMouseEnter={function () { if (!focusedProduct) setHoveredProduct(row.key); }}
                    onMouseLeave={function () { if (!focusedProduct) setHoveredProduct(null); }}
                    style={{
                      background: isFocused ? "rgba(82,156,202,0.08)" : (isHovered ? "rgba(255,255,255,0.03)" : "transparent"),
                      opacity: dimmed ? 0.18 : (isChecked ? 0.4 : 1),
                      filter: dimmed ? "blur(1.2px)" : "none",
                      transition: "opacity 0.2s, filter 0.2s",
                    }}
                  >
                    <td style={{ padding: "0", textAlign: "center", borderBottom: "1px solid " + N.border, width: 36 }}>
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "8px 0", cursor: "pointer" }} onClick={function (e) { e.stopPropagation(); }}>
                        <input type="checkbox" checked={isChecked} onChange={function () { toggleChecked(row.key); }}
                          style={{ width: 14, height: 14, accentColor: N.green, cursor: "pointer" }} />
                      </label>
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "center", color: N.textS, borderBottom: "1px solid " + N.border, whiteSpace: "nowrap" }}>
                      {row.firstWeek != null ? "W" + row.firstWeek : "\u2014"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "center", borderBottom: "1px solid " + N.border }}>
                      <StatusChip status={row.status} />
                    </td>
                    <td
                      onClick={function () { setFocusedProduct(isFocused ? null : row.key); setHoveredProduct(null); }}
                      title={isFocused ? "Click to exit focus" : "Click to focus this product"}
                      style={{ padding: "7px 10px", textAlign: "left", color: N.text, fontWeight: 500, borderBottom: "1px solid " + N.border, borderLeft: hasAction ? "3px solid " + N.blue : "3px solid transparent", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isChecked ? "line-through" : "none", cursor: "pointer" }}>
                      {isStopped && <span title={"Stopped advertising" + (stoppedInfo.stoppedDate ? " on " + stoppedInfo.stoppedDate : "") + (stoppedInfo.note ? " \u00B7 " + stoppedInfo.note : "")} style={{ marginRight: 6, color: N.red, fontSize: 11 }}>{"\u{1F6AB}"}</span>}
                      <span style={{ color: isStopped ? N.textS : N.text, borderBottom: "1px dotted rgba(255,255,255,0.2)" }}>{row.product}</span>
                      {hasAction && <span style={{ marginLeft: 6, color: N.blue, fontSize: 10 }}>{"\u26A1"}</span>}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: row.orders7d != null && row.orders7d < INACTIVE_SALES_7D ? N.textT : N.textS, borderBottom: "1px solid " + N.border }}>
                      {row.orders7d != null ? row.orders7d.toLocaleString() : "\u2014"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: N.text, borderBottom: "1px solid " + N.border }}>{row.complaints}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, borderLeft: "2px solid rgba(255,255,255,0.08)", borderBottom: "1px solid " + N.border, color: row.pct >= KILL_TOTAL_THRESHOLD ? N.red : N.text, background: row.pct >= KILL_TOTAL_THRESHOLD ? "rgba(255,115,105,0.12)" : "transparent" }}>
                      {fmtPct(row.pct)}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "center", borderBottom: "1px solid " + N.border, borderLeft: "2px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" }}>
                      {row.killSignal ? (
                        <span title={(row.killSignal.tier === "auto" ? "AUTO KILL \u2014 " : "DEBATE \u2014 ") + row.killSignal.reasons.join(", ")}
                          style={{ fontSize: 9, fontWeight: 700, color: row.killSignal.tier === "auto" ? N.red : N.orange, background: row.killSignal.tier === "auto" ? "rgba(255,115,105,0.18)" : "rgba(255,163,68,0.12)", border: "1px solid " + (row.killSignal.tier === "auto" ? "rgba(255,115,105,0.4)" : "rgba(255,163,68,0.3)"), padding: "2px 6px", borderRadius: 3, letterSpacing: "0.02em" }}>
                          {row.killSignal.tier === "auto" ? "\u{1F480} KILL" : "\u26A0 DEBATE"}
                        </span>
                      ) : row.earlyWarning ? (
                        <span title={row.earlyWarning.direction === "both"
                          ? row.earlyWarning.count + " sizing complaints in both directions \u2014 check size chart, not supplier"
                          : row.earlyWarning.count + " " + (row.earlyWarning.direction === "too_small" ? "Too Small" : "Too Large") + " complaints (\u2265 " + EARLY_WARNING_COUNT + " trigger)"}
                          style={{ fontSize: 9, fontWeight: 700, color: row.earlyWarning.direction === "both" ? N.orange : N.red, background: row.earlyWarning.direction === "both" ? "rgba(255,163,68,0.12)" : "rgba(255,115,105,0.15)", border: "1px solid " + (row.earlyWarning.direction === "both" ? "rgba(255,163,68,0.3)" : "rgba(255,115,105,0.3)"), padding: "2px 6px", borderRadius: 3, letterSpacing: "0.02em" }}>
                          {"\u{1F514}"} {row.earlyWarning.count}{" "}{row.earlyWarning.label}
                        </span>
                      ) : (
                        <span style={{ color: N.textT, fontSize: 10 }}>{"\u2014"}</span>
                      )}
                    </td>
                    {showBreakdown && CATEGORIES.map(function (cat) {
                      var v = row[cat.key] || 0;
                      var z = zones[cat.key];
                      var hasCatAction = rA.some(function (a) { return a.category === cat.key; });
                      return (
                        <td key={cat.key} style={{ padding: "7px 10px", textAlign: "center", borderBottom: "1px solid " + N.border, background: getHeatBg(v, z), color: v > 0 ? getZoneColor(v, z) : N.textT, fontWeight: v >= z.amber[0] ? 700 : 500, position: "relative" }}>
                          {v > 0 ? v.toFixed(1) + "%" : "\u2014"}
                          {hasCatAction && <span style={{ position: "absolute", top: 2, right: 4, fontSize: 8, color: N.blue }}>{"\u26A1"}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ];
                if (isFocused) {
                  rowEls.push(
                    <tr key={row.key + "-focus"}>
                      <td colSpan={visibleColCount} style={{ padding: "8px 4px 16px 4px", borderBottom: "1px solid " + N.border }}>
                        <FocusPanel
                          row={row}
                          image={row.image}
                          zones={zones}
                          quotes={focusQuotes}
                          contrib={contribData[row.key]}
                          stoppedInfo={stoppedInfo}
                          actionItems={rA}
                          onLogAction={makeLogAction(row)}
                          onStopAds={makeStopAds(row)}
                          onUndoAction={undoAction}
                          onUndoStop={makeUndoStop(row)}
                        />
                      </td>
                    </tr>
                  );
                }
                return rowEls;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "4px 0", borderTop: "1px solid " + N.border, display: "flex", justifyContent: "space-between", fontSize: 9, color: N.textT, marginBottom: showHoverPanel ? 180 : 0, transition: "margin-bottom 0.2s" }}>
        <span>Complaint Tracker {"\u2014"} {title}</span>
        <span>{visibleProducts}/{totalProducts} products {"\u00B7"} {Object.keys(stoppedAds).length} stopped {"\u00B7"} Complaints W{weekRange[0]}{"\u2013"}W{weekRange[1]} vs Orders W{ordersWR[0]}{"\u2013"}W{ordersWR[1]} {"\u00B7"} 14d lag {"\u00B7"} Orders 7d = W{latestDataWeek} {"\u00B7"} Min {minSales} sales</span>
      </div>

      {/* Sticky hover panel — quick glance only; disabled while in focus mode */}
      {showHoverPanel && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(37, 37, 37, 0.98)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderTop: "1px solid rgba(82,156,202,0.3)", boxShadow: "0 -8px 24px rgba(0,0,0,0.4)", padding: "12px 18px", zIndex: 1000, maxHeight: "40vh", overflowY: "auto", fontFamily: FONT, color: N.text }}>
          {stoppedAds[hoveredProduct] && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,115,105,0.08)", border: "1px solid rgba(255,115,105,0.25)", borderRadius: 4, marginBottom: hoveredActions.length > 0 ? 10 : 0, fontSize: 11 }}>
              <span style={{ fontSize: 14 }}>{"\u{1F6AB}"}</span>
              <span style={{ color: N.red, fontWeight: 700, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em" }}>Advertising Stopped</span>
              {stoppedAds[hoveredProduct].stoppedDate && (
                <span style={{ color: N.textS, fontSize: 10 }}>
                  <span style={{ color: N.textT }}>since</span> {stoppedAds[hoveredProduct].stoppedDate}
                </span>
              )}
              {stoppedAds[hoveredProduct].note && (
                <span style={{ color: N.textS, fontSize: 10, fontStyle: "italic" }}>
                  {"\u00B7"} {stoppedAds[hoveredProduct].note}
                </span>
              )}
            </div>
          )}
          {hoveredActions.length > 0 ? (
            <>
              <div style={{ fontSize: 9, fontWeight: 600, color: N.blue, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{"\u26A1"}</span>
                Action history {"\u2014"} <span style={{ color: N.text }}>{hoveredTitle}</span>
              </div>
              <ActionHistory items={hoveredActions} />
            </>
          ) : !stoppedAds[hoveredProduct] && (
            <div style={{ fontSize: 11, color: N.textS, padding: "4px 0", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: N.textT, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>{hoveredTitle}</span>
              <span style={{ color: N.textT }}>{"\u00B7"}</span>
              <span style={{ color: N.textT, fontStyle: "italic" }}>No actions logged for this product. Click the title to open the focus view.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
