import React, { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import RETAILROCKET from "./retailrocket-insights.json";
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3,
  Hourglass, LogIn, MousePointerClick, Info, CircleAlert,
  BookOpen, Bot, Check, ChevronDown, CircleHelp, Clock3, Database,
  Download, Eye, FileText, FileUp, Github, LayoutDashboard, Menu,
  MessageSquare, Plus, Search, Send, ShoppingBag, ShoppingCart,
  Sparkles, TrendingUp, Users, X, Zap
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie,
  PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

const COLORS = ["#c8f169", "#a995ff", "#62d5c8", "#f7b86b", "#f28b9d"];
const fmt = value => Number(value || 0).toLocaleString("en-IN");
const pct = value => Number.isFinite(value) ? value.toFixed(1) + "%" : "—";

function makeDemoData() {
  const products = Array.from({ length: 42 }, (_, i) => ({
    id: "SKU-" + String(i + 1).padStart(3, "0"),
    name: ["Cloud Runner", "Studio Headphones", "Everyday Backpack", "Ceramic Pour Over", "Essential Hoodie", "Desk Lamp", "Travel Bottle", "Minimal Wallet", "Wireless Mouse", "Linen Shirt"][i % 10],
    category: ["Footwear", "Electronics", "Accessories", "Home", "Apparel"][i % 5]
  }));
  const rows = [];
  const start = new Date("2026-01-01T00:00:00Z");
  for (let day = 0; day < 90; day++) {
    for (let k = 0; k < 95; k++) {
      const seed = day * 97 + k * 13;
      const visitor = 1000 + ((seed * 17 + k * 23) % 680);
      const productIndex = (seed * 7 + Math.floor(k / 3)) % products.length;
      const product = products[productIndex];
      const hour = (seed * 11 + 8) % 24;
      const date = new Date(start.getTime() + day * 86400000 + hour * 3600000);
      const roll = (seed * 31 + day * 19) % 100;
      const event = roll < 83 ? "view" : roll < 94 ? "addtocart" : "transaction";
      rows.push({
        timestamp: date.toISOString(),
        visitorid: visitor,
        event,
        itemid: product.id,
        product_name: product.name,
        category: product.category,
        transactionid: event === "transaction" ? "TX-" + day + "-" + k : ""
      });
    }
  }
  return rows;
}

const DEFAULT_DOCS = [
  {
    name: "Retailrocket dataset guide",
    text: "The Retailrocket events dataset records anonymous e-commerce interactions. Its common fields are timestamp, visitorid, event, itemid and transactionid. Event values include view, addtocart and transaction. timestamp is commonly expressed as Unix time in milliseconds. visitorid is an anonymous identifier, not a real customer identity. itemid identifies a product, not a descriptive product name."
  },
  {
    name: "Metric definitions and caveats",
    text: "A view event is a recorded product view. An add-to-cart event is a recorded cart interaction. A transaction event is a recorded transaction-related event. Event counts are not necessarily unique visitors, unique orders, or quantities sold. A transaction-event to view-event ratio is an event ratio, not a verified unique-customer conversion rate. Revenue requires price and transaction-value fields. Product profitability requires cost data."
  },
  {
    name: "Commerce Intelligence architecture",
    text: "The project combines a document retrieval pipeline and a structured analytics pipeline. The document pipeline uses document loading, chunking, embeddings, semantic retrieval, keyword retrieval, hybrid retrieval, reranking, evidence checking, context building and local Llama 3.2 generation through Ollama. The structured analytics prototype uses schema profiling, natural-language question planning, SQL generation, SQL validation and DuckDB execution against a DataFrame. The Streamlit prototype and the Vercel showcase frontend are separate deployment targets."
  }
];

function detectColumn(headers, patterns) {
  const normalized = headers.map(h => ({
    original: h,
    key: String(h).toLowerCase().replace(/[\s_-]+/g, "")
  }));
  for (const pattern of patterns) {
    const match = normalized.find(x => pattern.includes(x.key));
    if (match) return match.original;
  }
  return null;
}

function detectColumn(headers, patterns) {
  const normalized = headers.map(h => ({
    original: h,
    key: String(h).toLowerCase().replace(/[\s_-]+/g, "")
  }));
  for (const pattern of patterns) {
    const match = normalized.find(x => pattern.includes(x.key));
    if (match) return match.original;
  }
  return null;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseEventDate(value) {
  if (value === null || value === undefined || value === "") return null;
  let date;
  if (typeof value === "number" || /^\d{10,13}$/.test(String(value))) {
    const n = Number(value);
    date = new Date(n > 1e12 ? n : n > 1e9 ? n * 1000 : NaN);
  } else {
    date = new Date(value);
  }
  return Number.isFinite(date?.getTime?.()) ? date : null;
}

function classifyEvent(value) {
  const event = String(value ?? "").toLowerCase().trim();
  if (/impression|impress/.test(event)) return "impression";
  if (/click/.test(event)) return "click";
  if (/login|log_in|sign.?in|authenticate/.test(event)) return "login";
  if (/logout|log_out|sign.?out/.test(event)) return "logout";
  if (/cart|basket/.test(event)) return "cart";
  if (/transaction|purchase|order|checkout|complete|paid/.test(event)) return "transaction";
  if (/view|product.?page|page.?view/.test(event)) return "view";
  return "other";
}

function normalizeRows(rawRows) {
  if (!rawRows.length) return { rows: [], schema: {}, headers: [] };
  const headers = Object.keys(rawRows[0] || {});
  const schema = {
    event: detectColumn(headers, ["event", "eventtype", "action", "interaction", "eventname", "type"]),
    visitor: detectColumn(headers, ["visitorid", "visitor", "userid", "customerid", "customer", "user"]),
    product: detectColumn(headers, ["itemid", "productid", "sku", "product", "item"]),
    timestamp: detectColumn(headers, ["timestamp", "datetime", "date", "createdat", "eventtime", "time"]),
    transaction: detectColumn(headers, ["transactionid", "orderid", "order", "transaction"]),
    revenue: detectColumn(headers, ["revenue", "sales", "amount", "total", "ordervalue"]),
    impression: detectColumn(headers, ["impressions", "impression", "impressioncount", "impressionscount"]),
    click: detectColumn(headers, ["clicks", "click", "clickcount", "clickscount"]),
    loginFlag: detectColumn(headers, ["isloggedin", "loggedin", "loginstatus", "authenticated"]),
    session: detectColumn(headers, ["sessionid", "session", "sessionkey"]),
    duration: detectColumn(headers, ["sessionduration", "durationseconds", "durationminutes", "durationms", "duration", "sessiontime"])
  };

  const rows = rawRows.map(raw => {
    const eventRaw = schema.event ? String(raw[schema.event] ?? "").toLowerCase() : "";
    const event = classifyEvent(eventRaw);
    const timestamp = schema.timestamp ? parseEventDate(raw[schema.timestamp]) : null;
    const loginValue = schema.loginFlag ? String(raw[schema.loginFlag] ?? "").toLowerCase() : "";
    const isLoggedIn = ["true", "1", "yes", "y", "logged_in", "authenticated"].includes(loginValue);
    return {
      raw,
      event,
      eventRaw,
      visitor: schema.visitor ? String(raw[schema.visitor] ?? "") : "",
      product: schema.product ? String(raw[schema.product] ?? "") : "",
      timestamp,
      transaction: schema.transaction ? String(raw[schema.transaction] ?? "") : "",
      revenue: schema.revenue ? numericValue(raw[schema.revenue]) : null,
      impressionsValue: schema.impression ? numericValue(raw[schema.impression]) : 0,
      clicksValue: schema.click ? numericValue(raw[schema.click]) : 0,
      isLoggedIn,
      session: schema.session ? String(raw[schema.session] ?? "") : "",
      durationValue: schema.duration ? numericValue(raw[schema.duration]) : null
    };
  });

  return { rows, schema, headers };
}

function calculateSessionMetrics(rows, schema) {
  const durationName = String(schema.duration || "").toLowerCase();
  const durations = rows
    .map(row => row.durationValue)
    .filter(value => Number.isFinite(value) && value >= 0);

  if (schema.duration && durations.length) {
    let divisor = 60;
    if (/ms|milli/.test(durationName)) divisor = 60000;
    else if (/min/.test(durationName)) divisor = 1;
    else if (/hour|hr/.test(durationName)) divisor = 1 / 60;
    const minutes = durations.map(value => value / divisor).sort((a, b) => a - b);
    const mean = minutes.reduce((sum, value) => sum + value, 0) / minutes.length;
    return {
      available: true,
      method: "Explicit duration column: " + schema.duration,
      count: schema.session ? new Set(rows.map(r => r.session).filter(Boolean)).size : minutes.length,
      avg: mean,
      median: minutes[Math.floor(minutes.length / 2)],
      p90: minutes[Math.min(minutes.length - 1, Math.floor(minutes.length * 0.9))],
      multiEventCount: null
    };
  }

  if (schema.session && rows.some(row => row.session) && rows.some(row => row.timestamp)) {
    const groups = new Map();
    rows.forEach(row => {
      if (!row.session || !row.timestamp) return;
      const time = row.timestamp.getTime();
      const group = groups.get(row.session) || { start: time, end: time, count: 0 };
      group.start = Math.min(group.start, time);
      group.end = Math.max(group.end, time);
      group.count++;
      groups.set(row.session, group);
    });
    const values = [...groups.values()].filter(group => group.count > 1).map(group => (group.end - group.start) / 60000).sort((a, b) => a - b);
    if (!groups.size) return { available: false, method: "Session IDs found, but no usable timestamps", count: 0, avg: null, median: null, p90: null };
    return {
      available: true,
      method: "Computed from the uploaded session ID and timestamp columns",
      count: groups.size,
      avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      median: values.length ? values[Math.floor(values.length / 2)] : 0,
      p90: values.length ? values[Math.min(values.length - 1, Math.floor(values.length * 0.9))] : 0,
      multiEventCount: values.length
    };
  }

  if (schema.visitor && schema.timestamp) {
    if (rows.length > 500000) {
      return {
        available: false,
        method: "Session inference skipped for files above 500,000 rows; provide a session ID or precomputed duration column",
        count: null,
        avg: null,
        median: null,
        p90: null
      };
    }

    const ordered = rows
      .filter(row => row.visitor && row.timestamp)
      .map(row => ({ visitor: row.visitor, time: row.timestamp.getTime() }))
      .sort((a, b) => a.visitor.localeCompare(b.visitor) || a.time - b.time);

    let sessionCount = 0;
    let currentVisitor = null;
    let start = 0;
    let last = 0;
    let eventCount = 0;
    let singleEventSessions = 0;
    const durations = [];

    const finish = () => {
      if (eventCount === 0) return;
      sessionCount++;
      if (eventCount === 1) singleEventSessions++;
      else durations.push((last - start) / 60000);
    };

    ordered.forEach(row => {
      const newSession = currentVisitor !== row.visitor || row.time - last > 30 * 60 * 1000;
      if (newSession) {
        finish();
        currentVisitor = row.visitor;
        start = row.time;
        eventCount = 1;
      } else {
        eventCount++;
      }
      last = row.time;
    });
    finish();

    durations.sort((a, b) => a - b);
    const mean = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      available: true,
      method: "Estimated by visitor ID and a 30-minute inactivity gap; not source session IDs",
      count: sessionCount,
      avg: mean,
      median: durations.length ? durations[Math.floor(durations.length / 2)] : 0,
      p90: durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.9))] : 0,
      multiEventCount: durations.length,
      singleEventSessions
    };
  }

  return {
    available: false,
    method: "No usable session ID, duration, or visitor/timestamp pair was detected",
    count: null,
    avg: null,
    median: null,
    p90: null
  };
}

function aggregate(data) {
  const rows = data.rows;
  const counts = { view: 0, cart: 0, transaction: 0, click: 0, impression: 0, login: 0 };
  rows.forEach(row => { if (counts[row.event] !== undefined) counts[row.event]++; });

  const eventClicks = counts.click;
  const eventImpressions = counts.impression;
  const hasClickEvent = rows.some(row => row.event === "click");
  const hasImpressionEvent = rows.some(row => row.event === "impression");
  const hasLoginEvent = rows.some(row => row.event === "login");
  const clicks = hasClickEvent ? eventClicks : rows.reduce((sum, row) => sum + row.clicksValue, 0);
  const impressions = hasImpressionEvent ? eventImpressions : rows.reduce((sum, row) => sum + row.impressionsValue, 0);
  const clickAvailable = (hasClickEvent && hasImpressionEvent) || Boolean(data.schema.click && data.schema.impression);
  const loginAvailable = hasLoginEvent || Boolean(data.schema.loginFlag);
  const logins = hasLoginEvent ? counts.login : rows.filter(row => row.isLoggedIn).length;
  const loginVisitors = new Set(rows.filter(row => row.event === "login" || row.isLoggedIn).map(row => row.visitor).filter(Boolean)).size;

  const visitors = new Set(rows.map(row => row.visitor).filter(Boolean)).size;
  const products = new Set(rows.map(row => row.product).filter(Boolean)).size;

  const productMap = new Map();
  rows.forEach(row => {
    if (!row.product) return;
    const item = productMap.get(row.product) || {
      product: row.product, views: 0, carts: 0, transactions: 0, clicks: 0, impressions: 0
    };
    if (row.event === "view") item.views++;
    if (row.event === "cart") item.carts++;
    if (row.event === "transaction") item.transactions++;
    if (row.event === "click") item.clicks++;
    if (row.event === "impression") item.impressions++;
    if (!hasClickEvent && data.schema.click) item.clicks += row.clicksValue;
    if (!hasImpressionEvent && data.schema.impression) item.impressions += row.impressionsValue;
    productMap.set(row.product, item);
  });

  const topBy = field => [...productMap.values()]
    .sort((a, b) => b[field] - a[field])
    .slice(0, 15);

  const visitorMap = new Map();
  rows.forEach(row => {
    if (!row.visitor) return;
    const item = visitorMap.get(row.visitor) || {
      visitor: row.visitor, events: 0, views: 0, carts: 0, transactions: 0, logins: 0, products: new Set()
    };
    item.events++;
    if (row.event === "view") item.views++;
    if (row.event === "cart") item.carts++;
    if (row.event === "transaction") {
      item.transactions++;
      if (row.product) item.products.add(row.product);
    }
    if (row.event === "login" || row.isLoggedIn) item.logins++;
    visitorMap.set(row.visitor, item);
  });

  const session = calculateSessionMetrics(rows, data.schema);
  const dailyMap = new Map();
  const hourlyMap = new Map();
  rows.forEach(row => {
    if (!row.timestamp) return;
    const date = row.timestamp.toISOString().slice(0, 10);
    const hour = row.timestamp.getUTCHours();
    const daily = dailyMap.get(date) || { date, views: 0, carts: 0, transactions: 0 };
    const hourly = hourlyMap.get(hour) || { hour, views: 0, carts: 0, transactions: 0 };
    if (row.event === "view") { daily.views++; hourly.views++; }
    if (row.event === "cart") { daily.carts++; hourly.carts++; }
    if (row.event === "transaction") { daily.transactions++; hourly.transactions++; }
    dailyMap.set(date, daily);
    hourlyMap.set(hour, hourly);
  });

  const views = counts.view;
  const carts = counts.cart;
  const transactions = counts.transaction;
  const eventMix = [
    { name: "Views", value: views, color: COLORS[0] },
    { name: "Add to cart", value: carts, color: COLORS[1] },
    { name: "Transactions", value: transactions, color: COLORS[2] },
    { name: "Clicks", value: clicks, color: COLORS[3] },
    { name: "Logins", value: logins, color: COLORS[4] }
  ].filter(item => item.value > 0);

  const transactionRows = rows.filter(row => row.event === "transaction" && row.revenue !== null);
  const revenue = data.schema.revenue && transactionRows.length
    ? transactionRows.reduce((sum, row) => sum + (row.revenue || 0), 0)
    : null;

  return {
    total: rows.length,
    visitors,
    products,
    views,
    carts,
    transactions,
    clicks,
    impressions,
    clickRate: impressions > 0 ? clicks / impressions * 100 : null,
    clickRateAvailable: clickAvailable && impressions > 0,
    logins,
    loginVisitors,
    loginAvailable,
    cartRate: views ? carts / views * 100 : 0,
    transactionRate: views ? transactions / views * 100 : 0,
    cartToTransactionRate: carts ? transactions / carts * 100 : 0,
    topProducts: topBy("views"),
    topCart: topBy("carts"),
    topTransactionProducts: topBy("transactions"),
    topVisitors: [...visitorMap.values()]
      .map(visitor => ({ ...visitor, distinctProducts: visitor.products.size }))
      .sort((a, b) => b.transactions - a.transactions || b.events - a.events)
      .slice(0, 15),
    trend: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-45),
    hourly: [...hourlyMap.values()].sort((a, b) => a.hour - b.hour),
    eventMix,
    session,
    sessionAvailable: session.available,
    avgSessionDurationMin: session.avg,
    medianSessionDurationMin: session.median,
    revenue,
    productMap
  };
}

function makeRetailrocketMetrics(summary) {
  const event = summary.event_counts;
  const sessions = summary.sessions;
  const mapProducts = items => items.map(item => ({
    product: item.product_id,
    views: item.views,
    carts: item.cart_events,
    transactions: item.transaction_events,
    cart_to_view_pct: item.cart_to_view_pct,
    transaction_to_view_pct: item.transaction_to_view_pct
  }));
  return {
    total: summary.rows,
    visitors: summary.unique_visitors,
    products: summary.unique_products,
    views: event.views,
    carts: event.cart_events,
    transactions: event.transaction_events,
    clicks: 0,
    impressions: 0,
    clickRate: null,
    clickRateAvailable: false,
    logins: 0,
    loginVisitors: 0,
    loginAvailable: false,
    cartRate: summary.ratios.cart_events_per_view_pct,
    transactionRate: summary.ratios.transaction_events_per_view_pct,
    cartToTransactionRate: summary.ratios.transaction_events_per_cart_event_pct,
    topProducts: mapProducts(summary.top_view_products),
    topCart: mapProducts(summary.top_cart_products),
    topTransactionProducts: mapProducts(summary.top_transaction_products),
    topVisitors: summary.top_visitors_by_transactions.map(item => ({
      visitor: item.visitor_id,
      events: null,
      views: null,
      carts: null,
      transactions: item.transaction_events,
      logins: null,
      distinctProducts: item.distinct_products,
      uniqueTransactionIds: item.unique_transaction_ids
    })),
    trend: [],
    hourly: summary.hourly_activity.map(item => ({ hour: item.hour, views: item.views, carts: item.cart_events, transactions: item.transaction_events })),
    eventMix: [
      { name: "Views", value: event.views, color: COLORS[0] },
      { name: "Add to cart", value: event.cart_events, color: COLORS[1] },
      { name: "Transactions", value: event.transaction_events, color: COLORS[2] }
    ],
    session: {
      available: true,
      method: sessions.sessionization,
      count: sessions.estimated_sessions,
      avg: sessions.avg_duration_min_multi_event,
      median: sessions.median_duration_min_multi_event,
      p90: sessions.p90_duration_min_multi_event,
      multiEventCount: sessions.sessions_with_multiple_events,
      singleEventSessions: sessions.single_event_sessions
    },
    sessionAvailable: true,
    avgSessionDurationMin: sessions.avg_duration_min_multi_event,
    medianSessionDurationMin: sessions.median_duration_min_multi_event,
    revenue: null,
    productMap: new Map(),
    dateRange: summary.date_start + " to " + summary.date_end,
    coverage: summary.coverage
  };
}

function profileDataset(data) {
  const rows = data.rows;
  return data.headers.map(name => {
    const values = rows.map(r => r.raw[name]);
    const nonempty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "");
    const unique = new Set(nonempty.map(v => String(v))).size;
    const numeric = nonempty.length > 0 && nonempty.every(v => v !== "" && Number.isFinite(Number(v)));
    return { name, type: numeric ? "Numeric" : (name.toLowerCase().match(/date|time/) ? "Date candidate" : "Text / category"), missing: rows.length - nonempty.length, unique, sample: nonempty.slice(0, 2).map(String).join(", ") };
  });
}

function chunkText(text, source) {
  const paragraphs = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const chunks = [];
  paragraphs.forEach((paragraph, index) => {
    const sentences = paragraph.match(/[^.!?]+[.!?]*/g) || [paragraph];
    let current = "";
    sentences.forEach(sentence => {
      if ((current + " " + sentence).length > 700 && current) {
        chunks.push({ source, text: current.trim(), id: source + "-" + index + "-" + chunks.length });
        current = sentence;
      } else {
        current += " " + sentence;
      }
    });
    if (current.trim()) chunks.push({ source, text: current.trim(), id: source + "-" + index + "-" + chunks.length });
  });
  return chunks;
}

function retrieveDocs(question, docs) {
  const tokens = question.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 2);
  const chunks = docs.flatMap(doc => chunkText(doc.text, doc.name));
  return chunks.map(chunk => {
    const body = chunk.text.toLowerCase();
    const score = tokens.reduce((sum, token) => sum + (body.includes(token) ? (token.length > 6 ? 2 : 1) : 0), 0);
    return { ...chunk, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
}

function answerQuestion(question, data, metrics) {
  const q = question.toLowerCase();
  const compact = q.replace(/[^a-z0-9\s]/g, " ");

  if (/click.?through|click rate|ctr|impression/.test(compact)) {
    if (!metrics.clickRateAvailable) {
      return {
        answer: "Click-through rate cannot be calculated from the active dataset. CTR requires both impression counts and click counts. This dataset has no explicit impression or click records.",
        rows: [],
        explanation: "Product views are not interchangeable with ad or search impressions."
      };
    }
    return {
      answer: "The calculated click-through rate is " + pct(metrics.clickRate) + ", using " + fmt(metrics.clicks) + " clicks divided by " + fmt(metrics.impressions) + " impressions.",
      rows: [{ impressions: metrics.impressions, clicks: metrics.clicks, click_through_rate: pct(metrics.clickRate) }],
      explanation: "CTR = clicks / impressions × 100."
    };
  }

  if (/login|logins|signed in|sign in|logged in/.test(compact)) {
    if (!metrics.loginAvailable) {
      return {
        answer: "Login activity is not captured in this dataset. I cannot identify login events or count authenticated visitors from the available columns.",
        rows: [],
        explanation: "A visitor ID is not proof that the visitor logged in."
      };
    }
    return {
      answer: "The dataset contains " + fmt(metrics.logins) + " recorded login signals from " + fmt(metrics.loginVisitors) + " distinct visitor IDs.",
      rows: [{ login_events: metrics.logins, unique_logged_in_visitors: metrics.loginVisitors }],
      explanation: "Login counts are based on the detected login event or login-status field."
    };
  }

  if (/session|session time|session duration|time spent|time on site|visit duration/.test(compact)) {
    if (!metrics.sessionAvailable) {
      return {
        answer: "Session duration could not be calculated because the dataset has no usable session ID or visitor/timestamp combination, and no explicit session-duration field.",
        rows: [],
        explanation: "Upload a session ID, session duration, or visitor ID plus timestamp to support this analysis."
      };
    }
    const session = metrics.session;
    return {
      answer: "The dataset contains approximately " + fmt(session.count) + " sessions. The average observed duration for sessions with multiple events is " + Number(session.avg || 0).toFixed(2) + " minutes, and the median is " + Number(session.median || 0).toFixed(2) + " minutes.",
      rows: [
        { metric: "Sessions", value: session.count },
        { metric: "Average multi-event session duration (min)", value: Number(session.avg || 0).toFixed(2) },
        { metric: "Median multi-event session duration (min)", value: Number(session.median || 0).toFixed(2) },
        { metric: "90th percentile duration (min)", value: Number(session.p90 || 0).toFixed(2) }
      ],
      explanation: session.method + ". Single-event sessions are excluded from average-duration calculations."
    };
  }

  if (/overview|summary|summarize|how many rows|total events|dataset size|dataset contain/.test(compact)) {
    return {
      answer: "The active dataset contains " + fmt(metrics.total) + " records, " + fmt(metrics.visitors) + " distinct visitor IDs and " + fmt(metrics.products) + " distinct product IDs. I counted " + fmt(metrics.views) + " views, " + fmt(metrics.carts) + " add-to-cart events and " + fmt(metrics.transactions) + " transaction events.",
      rows: [
        { metric: "Total records", value: metrics.total },
        { metric: "Unique visitor IDs", value: metrics.visitors },
        { metric: "Unique product IDs", value: metrics.products },
        { metric: "View events", value: metrics.views },
        { metric: "Add-to-cart events", value: metrics.carts },
        { metric: "Transaction events", value: metrics.transactions }
      ],
      explanation: "Counts are calculated from the currently selected dataset."
    };
  }

  if (/funnel|journey|conversion|cart to view|transaction to view/.test(compact)) {
    return {
      answer: "The recorded event journey contains " + fmt(metrics.views) + " views, " + fmt(metrics.carts) + " add-to-cart events and " + fmt(metrics.transactions) + " transaction events. Cart-to-view event ratio: " + pct(metrics.cartRate) + ". Transaction-to-view event ratio: " + pct(metrics.transactionRate) + ".",
      rows: [
        { stage: "Product views", events: metrics.views },
        { stage: "Add to cart", events: metrics.carts },
        { stage: "Transaction events", events: metrics.transactions }
      ],
      explanation: "These are event ratios, not deduplicated user-level conversion rates or a session-level funnel."
    };
  }

  if (/visitor|customer|user/.test(compact) && /transaction|purchase|buy|bought|order/.test(compact)) {
    return {
      answer: "These anonymous visitor IDs have the highest recorded transaction-event counts.",
      rows: metrics.topVisitors.map(item => ({
        visitor_id: item.visitor,
        transaction_events: item.transactions,
        distinct_products_in_transactions: item.distinctProducts
      })),
      explanation: "Visitor IDs are anonymous. Transaction events are not guaranteed to equal unique completed orders."
    };
  }

  if (/product|item/.test(compact) && /view|cart|transaction|purchase|buy/.test(compact)) {
    const source = /transaction|purchase|buy/.test(compact) ? metrics.topTransactionProducts
      : /cart/.test(compact) ? metrics.topCart
      : metrics.topProducts;
    return {
      answer: "Here is the product-level journey breakdown, showing recorded views, cart events and transaction events for the leading products.",
      rows: source.map(item => ({
        product_id: item.product,
        views: item.views,
        add_to_cart_events: item.carts,
        transaction_events: item.transactions,
        cart_to_view_event_pct: pct(item.views ? item.carts / item.views * 100 : 0),
        transaction_to_view_event_pct: pct(item.views ? item.transactions / item.views * 100 : 0)
      })),
      explanation: "Aggregated product event counts; records are not linked into unique user journeys."
    };
  }

  if (/trend|over time|daily|day by day|activity|hour|peak/.test(compact)) {
    return {
      answer: "The hourly activity table shows when views, cart events and transaction events were recorded.",
      rows: metrics.hourly.map(item => ({
        hour_utc: String(item.hour).padStart(2, "0") + ":00",
        views: item.views,
        cart_events: item.carts ?? item.cart_events,
        transaction_events: item.transactions ?? item.transaction_events
      })),
      explanation: "Times are shown in UTC when timestamps are available."
    };
  }

  if (/revenue|sales value|total sales/.test(compact)) {
    if (metrics.revenue === null) {
      return {
        answer: "Revenue cannot be calculated from this dataset because no suitable monetary field was detected.",
        rows: [],
        explanation: "The Retailrocket events file does not contain product price or transaction value."
      };
    }
    return {
      answer: "The sum of the detected revenue field is " + fmt(metrics.revenue) + ". Confirm the currency and row-level meaning before interpreting it.",
      rows: [{ metric: "Revenue field sum", value: metrics.revenue }],
      explanation: "The revenue field was detected heuristically."
    };
  }

  if (/column|schema|field|missing|null|duplicate|profile/.test(compact)) {
    const p = profileDataset(data);
    return {
      answer: "I identified " + p.length + " columns. The table shows inferred data types, missing values, unique values and sample content.",
      rows: p,
      explanation: "Column roles are inferred heuristically from names and values."
    };
  }

  return null;
}

export default function App() {
  const [rawRows, setRawRows] = useState([]);
  const [sourceName, setSourceName] = useState("Retailrocket events.csv · historical reference");
  const [demoMode, setDemoMode] = useState(true);
  const [active, setActive] = useState("overview");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [docs, setDocs] = useState(DEFAULT_DOCS);
  const [uploadedDocNames, setUploadedDocNames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const fileRef = useRef(null);
  const docRef = useRef(null);
  const chatEndRef = useRef(null);

  const data = useMemo(() => normalizeRows(rawRows), [rawRows]);
  const metrics = useMemo(() => demoMode ? makeRetailrocketMetrics(RETAILROCKET) : aggregate(data), [demoMode, data]);
  const profile = useMemo(() => demoMode ? RETAILROCKET.columns.map(name => ({ name, type: name === "timestamp" ? "Unix timestamp (ms)" : name === "visitorid" || name === "itemid" || name === "transactionid" ? "Identifier" : "Category", missing: name === "transactionid" ? 2738429 : 0, unique: null, sample: name === "event" ? "view, addtocart, transaction" : "Retailrocket field" })) : profileDataset(data), [demoMode, data]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const loadCSV = file => {
    if (!file) return;
    setNotice("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: result => {
        if (!result.data?.length || !result.meta?.fields?.length) {
          setNotice("No usable rows or headers were found in that CSV.");
          return;
        }
        if (result.errors?.length) {
          setNotice("CSV loaded with " + result.errors.length + " parsing warning(s). Review the detected columns before using metrics.");
        }
        setRawRows(result.data);
        setSourceName(file.name);
        setDemoMode(false);
        setMessages([]);
      },
      error: error => setNotice("Could not read the CSV: " + error.message)
    });
  };

  const loadDocs = async files => {
    const selected = Array.from(files || []);
    const accepted = selected.filter(f => /\.(txt|md)$/i.test(f.name));
    if (!accepted.length) {
      setNotice("Upload .txt or .md knowledge files for this demo retrieval workspace.");
      return;
    }
    const loaded = await Promise.all(accepted.map(async f => ({ name: f.name, text: await f.text() })));
    setDocs(prev => [...prev, ...loaded]);
    setUploadedDocNames(prev => [...prev, ...accepted.map(f => f.name)]);
    setNotice(loaded.length + " knowledge file(s) added to the retrieval workspace.");
  };

  const downloadCSV = () => {
    if (!rawRows.length) { setNotice("The reference view contains verified aggregates, not raw export rows. Upload the CSV to export source records."); return; }
    const fields = data.headers.length ? data.headers : Object.keys(rawRows[0] || {});
    const csv = Papa.unparse(rawRows.slice(0, 5000));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (sourceName || "commerce-data").replace(/\.[^.]+$/, "") + "-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const ask = async text => {
    const question = (text ?? query).trim();
    if (!question || busy) return;
    setQuery("");
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setBusy(true);

    const analysis = answerQuestion(question, data, metrics);
    const retrieved = retrieveDocs(question, docs);
    const analysisSummary = analysis
      ? analysis.answer + "\n" + JSON.stringify(analysis.rows.slice(0, 12))
      : "";

    let answer = analysis?.answer || (retrieved.length
      ? "I found relevant knowledge-base passages. Review the retrieved evidence below. For a generated synthesis, configure the optional server-side model key."
      : "I couldn't find a supported analysis intent or matching knowledge passages. Try asking about views, add-to-cart events, transaction activity, visitors, trends, dataset columns, or upload a knowledge document.");

    let modelUsed = false;
    if (analysis || retrieved.length) {
      try {
        const response = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            contexts: retrieved.map(r => ({ source: r.source, text: r.text })),
            analysisSummary
          })
        });
        if (response.ok) {
          const payload = await response.json();
          if (payload.answer) {
            answer = payload.answer;
            modelUsed = true;
          }
        }
      } catch {
        // Static hosting or missing API deployment: use deterministic result and sources.
      }
    }

    setMessages(prev => [...prev, {
      role: "assistant",
      content: answer,
      rows: analysis?.rows || [],
      explanation: analysis?.explanation || "",
      retrieved,
      modelUsed,
      kind: analysis ? "analysis" : retrieved.length ? "retrieval" : "guidance"
    }]);
    setBusy(false);
  };

  const navItems = [
    { id: "overview", label: "Customer journey", icon: LayoutDashboard, group: "WORKSPACE" },
    { id: "products", label: "Product intelligence", icon: ShoppingBag },
    { id: "customers", label: "Customer behaviour", icon: Users },
    { id: "trends", label: "Journey & timing", icon: Activity },
    { id: "assistant", label: "AI analyst", icon: MessageSquare, group: "INTELLIGENCE" },
    { id: "knowledge", label: "Knowledge retrieval", icon: BookOpen }
  ];

  const quickPrompts = [
    "Which product got the most views and what happened next?",
    "Which products reached cart and transaction events?",
    "What is the average estimated session duration?",
    "Is click-through rate available in this dataset?"
  ];

  const resetDemo = () => {
    setRawRows([]);
    setSourceName("Retailrocket events.csv · historical reference");
    setDemoMode(true);
    setMessages([]);
    setNotice("Demo dataset restored.");
  };

  const sidebar = (
    <aside className={"sidebar " + (mobileNav ? "sidebar-open" : "")}>
      <div className="brand">
        <div className="brand-mark"><Activity size={19} strokeWidth={2.4} /></div>
        <div><strong>commerce<span>.</span></strong><small>INTELLIGENCE STUDIO</small></div>
        <button className="icon-btn sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button>
      </div>
      <div className="workspace-switch">
        <div className="workspace-avatar">CI</div>
        <div className="workspace-name"><b>Commerce workspace</b><small>Personal environment</small></div>
        <ChevronDown size={15} className="muted"/>
      </div>
      <div className="nav-list">
        {navItems.map(item => (
          <React.Fragment key={item.id}>
            {item.group && <div className="nav-label">{item.group}</div>}
            <button className={"nav-item " + (active === item.id ? "active" : "")} onClick={() => { setActive(item.id); setMobileNav(false); }}>
              <item.icon size={17}/><span>{item.label}</span>
              {item.id === "assistant" && <span className="nav-pip"/>}
            </button>
          </React.Fragment>
        ))}
      </div>
      <div className="sidebar-bottom">
        <div className="data-card">
          <div className="data-card-head"><span className="live-dot"/><span>{demoMode ? "RETAILROCKET REFERENCE" : "UPLOADED DATA"}</span><span className="data-more">•••</span></div>
          <b className="data-name">{sourceName}</b>
          <div className="data-stats"><span>{fmt(metrics.total)} rows</span><span>{data.headers.length || Object.keys(rawRows[0] || {}).length} columns</span></div>
          <button className="upload-btn" onClick={() => fileRef.current?.click()}><FileUp size={15}/> Replace dataset</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => loadCSV(e.target.files?.[0])}/>
        </div>
        <div className="profile-row">
          <div className="profile-avatar">GG</div>
          <div><b>Analyst workspace</b><small>Local demo session</small></div>
          <span className="profile-dots">•••</span>
        </div>
      </div>
    </aside>
  );

  const header = (
    <header className="topbar">
      <div className="top-left">
        <button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={19}/></button>
        <div className="crumb">Workspace <span>/</span> <b>{navItems.find(x => x.id === active)?.label || "Overview"}</b></div>
      </div>
      <div className="top-actions">
        <div className="search-pill"><Search size={15}/><span>Search workspace</span><kbd>⌘ K</kbd></div>
        <div className="status-pill"><span className="live-dot"/> {demoMode ? "Historical case study" : "Dataset loaded"}</div>
        <button className="avatar-btn">GG</button>
      </div>
    </header>
  );

  const metricCards = [
    { label: "Total interactions", value: fmt(metrics.total), sub: "Events in active dataset", icon: Activity, color: "mint", trend: "Dataset volume" },
    { label: "Unique visitors", value: fmt(metrics.visitors), sub: "Anonymous visitor IDs", icon: Users, color: "violet", trend: "Distinct visitors" },
    { label: "Products tracked", value: fmt(metrics.products), sub: "Distinct product IDs", icon: ShoppingBag, color: "blue", trend: "Catalogue coverage" },
    { label: "Transaction events", value: fmt(metrics.transactions), sub: "Recorded transaction events", icon: ShoppingCart, color: "amber", trend: "Event count" }
  ];

  const renderOverview = () => (
    <>
      <div className="page-intro journey-hero">
        <div>
          <div className="eyebrow"><span className="live-dot"/> CUSTOMER JOURNEY INTELLIGENCE / HISTORICAL CASE STUDY</div>
          <h1>From first view<br/><em>to transaction.</em></h1>
          <p>Trace product discovery, cart intent and transaction activity. See where attention turns into action—and where the available event trail stops.</p>
        </div>
        <div className="intro-actions">
          <button className="btn btn-secondary" onClick={downloadCSV}><Download size={15}/> Export source rows</button>
          <button className="btn btn-primary" onClick={() => setActive("assistant")}><Sparkles size={15}/> Ask about the journey</button>
        </div>
      </div>

      <div className="dataset-banner journey-banner">
        <div className="db-icon"><Database size={18}/></div>
        <div className="db-copy">
          <b>{sourceName}</b>
          <span>{demoMode ? "Verified event aggregates · 03 May–18 Sep 2015 · UTC" : "Uploaded dataset · metrics calculated from detected columns"}</span>
        </div>
        <div className="db-right">
          <span className="tag tag-green">{demoMode ? "REFERENCE DATA" : "ACTIVE DATASET"}</span>
          <button className="text-link" onClick={() => setActive("knowledge")}>Inspect schema <ArrowUpRight size={13}/></button>
        </div>
      </div>

      <div className="journey-metrics-grid">
        <div className="journey-metric-card">
          <div className="journey-metric-top"><span>PRODUCT VIEWS</span><Eye size={16}/></div>
          <b>{fmt(metrics.views)}</b>
          <small>Recorded product-view events</small>
          <div className="metric-accent mint-accent"/>
        </div>
        <div className="journey-metric-card">
          <div className="journey-metric-top"><span>ADD TO CART</span><ShoppingCart size={16}/></div>
          <b>{fmt(metrics.carts)}</b>
          <small>{pct(metrics.cartRate)} cart events per view event</small>
          <div className="metric-accent violet-accent"/>
        </div>
        <div className="journey-metric-card">
          <div className="journey-metric-top"><span>TRANSACTION EVENTS</span><ShoppingBag size={16}/></div>
          <b>{fmt(metrics.transactions)}</b>
          <small>{pct(metrics.transactionRate)} transaction events per view event</small>
          <div className="metric-accent teal-accent"/>
        </div>
        <div className="journey-metric-card unavailable-metric">
          <div className="journey-metric-top"><span>CLICK-THROUGH RATE</span><MousePointerClick size={16}/></div>
          <b>{metrics.clickRateAvailable ? pct(metrics.clickRate) : "Not captured"}</b>
          <small>{metrics.clickRateAvailable ? fmt(metrics.clicks) + " clicks / " + fmt(metrics.impressions) + " impressions" : "Needs click + impression records"}</small>
          <div className="metric-accent amber-accent"/>
        </div>
        <div className="journey-metric-card">
          <div className="journey-metric-top"><span>AVG. SESSION WINDOW</span><Hourglass size={16}/></div>
          <b>{metrics.sessionAvailable && metrics.avgSessionDurationMin !== null ? metrics.avgSessionDurationMin.toFixed(2) + " min" : "Unavailable"}</b>
          <small>{metrics.sessionAvailable ? "Estimated / observed, see method below" : "Needs session or visitor-time fields"}</small>
          <div className="metric-accent blue-accent"/>
        </div>
        <div className="journey-metric-card unavailable-metric">
          <div className="journey-metric-top"><span>LOGIN ACTIVITY</span><LogIn size={16}/></div>
          <b>{metrics.loginAvailable ? fmt(metrics.logins) : "Not captured"}</b>
          <small>{metrics.loginAvailable ? fmt(metrics.loginVisitors) + " distinct signed-in visitor IDs" : "No login event or login-status field"}</small>
          <div className="metric-accent rose-accent"/>
        </div>
      </div>

      <div className="section-kicker-row">
        <div><div className="eyebrow">THE BEHAVIOURAL PATH</div><h2>Where does the journey move forward?</h2><p>Recorded event volume at each measurable stage.</p></div>
        <span className="tag tag-green">EVENT-LEVEL FUNNEL</span>
      </div>
      <section className="journey-flow">
        <div className="journey-stage-card">
          <div className="stage-index">01 / DISCOVERY</div>
          <div className="stage-icon mint-stage"><Eye size={18}/></div>
          <b>{fmt(metrics.views)}</b>
          <span>Product views</span>
          <small>100% baseline</small>
          <div className="stage-track"><i style={{width:"100%"}}/></div>
        </div>
        <div className="journey-connector"><ArrowDownRight size={18}/><span>{pct(metrics.cartRate)} of view events</span></div>
        <div className="journey-stage-card">
          <div className="stage-index">02 / INTENT</div>
          <div className="stage-icon violet-stage"><ShoppingCart size={18}/></div>
          <b>{fmt(metrics.carts)}</b>
          <span>Add-to-cart events</span>
          <small>{pct(metrics.cartRate)} of view events</small>
          <div className="stage-track"><i className="violet-track" style={{width:Math.max(metrics.cartRate,1)+"%"}}/></div>
        </div>
        <div className="journey-connector"><ArrowDownRight size={18}/><span>{pct(metrics.cartToTransactionRate)} of cart events</span></div>
        <div className="journey-stage-card">
          <div className="stage-index">03 / OUTCOME</div>
          <div className="stage-icon teal-stage"><Check size={18}/></div>
          <b>{fmt(metrics.transactions)}</b>
          <span>Transaction events</span>
          <small>{pct(metrics.transactionRate)} of view events</small>
          <div className="stage-track"><i className="teal-track" style={{width:Math.max(metrics.transactionRate,1)+"%"}}/></div>
        </div>
      </section>

      <div className="content-grid lower-grid journey-product-grid">
        <section className="panel table-panel journey-table-panel">
          <div className="panel-heading">
            <div><div className="eyebrow">PRODUCT-LEVEL JOURNEY</div><h3>Views → cart → transaction</h3><p>Which products attracted attention, cart intent and transaction activity?</p></div>
            <button className="text-link" onClick={() => setActive("products")}>Product detail <ArrowUpRight size={13}/></button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Product ID</th><th>Views</th><th>Cart events</th><th>Transaction events</th><th>Cart / view</th><th>Transaction / view</th></tr></thead>
              <tbody>{metrics.topProducts.slice(0,8).map(product => (
                <tr key={product.product}>
                  <td><b>{product.product}</b></td>
                  <td>{fmt(product.views)}</td>
                  <td>{fmt(product.carts)}</td>
                  <td><span className="value-pill">{fmt(product.transactions)}</span></td>
                  <td>{pct(product.views ? product.carts / product.views * 100 : 0)}</td>
                  <td>{pct(product.views ? product.transactions / product.views * 100 : 0)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="table-note">Ratios compare event counts for the same product; they are not person-level conversion rates.</div>
        </section>

        <section className="journey-insight-panel">
          <div className="eyebrow">SIGNAL SPOTLIGHT</div>
          <h3>High attention does not always become purchase activity.</h3>
          <div className="spotlight-product">
            <span>HIGHEST VIEW VOLUME</span>
            <b>Product 187946</b>
            <div><strong>3,410</strong><small>views</small></div>
            <p>2 add-to-cart events · 0 transaction events</p>
          </div>
          <div className="spotlight-product spotlight-strong">
            <span>STRONGEST CART + TRANSACTION VOLUME</span>
            <b>Product 461686</b>
            <div><strong>306</strong><small>cart events</small><strong>133</strong><small>transaction events</small></div>
            <p>2,539 views · 12.05% cart/view event ratio</p>
          </div>
          <div className="spotlight-foot">These are aggregated event records, not linked individual customer paths.</div>
        </section>
      </div>

      <div className="content-grid main-charts journey-lower-grid">
        <section className="panel chart-panel">
          <div className="panel-heading"><div><div className="eyebrow">SESSION TIMING</div><h3>How long do multi-event visits last?</h3><p>Session windows derived from visitor activity</p></div><span className="tag tag-green">30-MINUTE RULE</span></div>
          {metrics.sessionAvailable ? (
            <>
              <div className="session-stat-grid">
                <div><span>AVERAGE</span><b>{Number(metrics.session.avg || 0).toFixed(2)} min</b></div>
                <div><span>MEDIAN</span><b>{Number(metrics.session.median || 0).toFixed(2)} min</b></div>
                <div><span>90TH PERCENTILE</span><b>{Number(metrics.session.p90 || 0).toFixed(2)} min</b></div>
              </div>
              <div className="session-count-line"><Hourglass size={15}/><b>{fmt(metrics.session.count)}</b><span>estimated / detected sessions</span></div>
              <div className="session-method">{metrics.session.method}. Single-event sessions are excluded from average duration.</div>
            </>
          ) : (
            <div className="missing-state"><Info size={18}/><b>Session timing unavailable</b><p>Upload a session ID, duration field, or visitor ID with a timestamp. Large files should ideally provide an explicit session ID or duration column.</p></div>
          )}
        </section>

        <section className="panel chart-panel">
          <div className="panel-heading"><div><div className="eyebrow">WHEN ACTIVITY HAPPENS</div><h3>Hourly behaviour profile</h3><p>Views, cart actions and transactions by UTC hour</p></div></div>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={metrics.hourly}><CartesianGrid stroke="#252c39" vertical={false}/><XAxis dataKey="hour" tickFormatter={v => String(v).padStart(2,"0")} stroke="#667085" tickLine={false} axisLine={false} fontSize={10}/><YAxis stroke="#667085" tickLine={false} axisLine={false} fontSize={10} width={38}/><Tooltip contentStyle={{background:"#151a23",border:"1px solid #303849",borderRadius:12,color:"#fff"}}/><Area type="monotone" dataKey="views" stroke="#c8f169" fill="#c8f169" fillOpacity={0.12} strokeWidth={2}/><Area type="monotone" dataKey="carts" stroke="#a995ff" fill="transparent" strokeWidth={2}/><Area type="monotone" dataKey="transactions" stroke="#62d5c8" fill="transparent" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>
        </section>
      </div>

      <div className="coverage-grid">
        <div className="coverage-card">
          <div className="coverage-icon amber-coverage"><MousePointerClick size={17}/></div>
          <div><span>CLICK-THROUGH RATE</span><b>{metrics.clickRateAvailable ? pct(metrics.clickRate) : "Not measurable from this file"}</b><p>{metrics.clickRateAvailable ? "Calculated from detected click and impression fields." : "No impression and click fields/events were present. Product views cannot be substituted for impressions."}</p></div>
        </div>
        <div className="coverage-card">
          <div className="coverage-icon rose-coverage"><LogIn size={17}/></div>
          <div><span>LOGIN / AUTHENTICATION</span><b>{metrics.loginAvailable ? fmt(metrics.logins) + " login signals" : "Not captured in this file"}</b><p>{metrics.loginAvailable ? fmt(metrics.loginVisitors) + " distinct visitor IDs with login signals." : "No login event or login-status field was found. Anonymous visitor IDs do not prove a login."}</p></div>
        </div>
      </div>

      <div className="notice-box journey-caveat"><AlertCircle size={17}/><div><b>How to interpret this analysis</b><p>The Retailrocket file covers 03 May–18 September 2015 and contains event logs for views, add-to-cart and transactions. Session durations are inferred by grouping each visitor's events with a 30-minute inactivity threshold; they are estimates, not source-provided session records. Event ratios are not unique-customer conversion rates. The file has no impressions, click events, login events, revenue or explicit session IDs.</p></div></div>
    </>
  );

  const renderProducts = () => (
    <>
      <div className="section-title"><div><div className="eyebrow">CATALOGUE INTELLIGENCE</div><h1>Product <em>performance.</em></h1><p>See which products attract attention and which generate meaningful actions.</p></div><button className="btn btn-secondary" onClick={downloadCSV}><Download size={15}/> Export data</button></div>
      <div className="metric-grid three">
        <div className="metric-card"><div className="metric-top"><span>Product IDs</span><ShoppingBag size={17}/></div><div className="metric-value">{fmt(metrics.products)}</div><div className="metric-foot">Distinct products detected</div></div>
        <div className="metric-card"><div className="metric-top"><span>Total views</span><Eye size={17}/></div><div className="metric-value">{fmt(metrics.views)}</div><div className="metric-foot">Recorded view events</div></div>
        <div className="metric-card"><div className="metric-top"><span>Cart actions</span><ShoppingCart size={17}/></div><div className="metric-value">{fmt(metrics.carts)}</div><div className="metric-foot">Recorded add-to-cart events</div></div>
      </div>
      <div className="content-grid lower-grid">
        <section className="panel"><div className="panel-heading"><div><div className="eyebrow">TOP OF CATALOGUE</div><h3>Products by views</h3><p>Highest recorded product interest</p></div></div><div className="chart-wrap tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={metrics.topProducts.slice(0,7)} layout="vertical" margin={{left:10,right:15}}><CartesianGrid stroke="#252c39" horizontal={false}/><XAxis type="number" stroke="#667085" tickLine={false} axisLine={false} fontSize={10}/><YAxis dataKey="product" type="category" width={95} stroke="#98a2b3" tickLine={false} axisLine={false} fontSize={10}/><Tooltip contentStyle={{background:"#151a23",border:"1px solid #303849",borderRadius:12}}/><Bar dataKey="views" fill="#c8f169" radius={[0,5,5,0]} barSize={18}/></BarChart></ResponsiveContainer></div></section>
        <section className="panel"><div className="panel-heading"><div><div className="eyebrow">CART INTENT</div><h3>Most added to cart</h3><p>Products with highest cart-event volume</p></div></div><div className="rank-list">{metrics.topCart.slice(0,7).map((p,i)=><div className="rank-row" key={p.product}><span className="rank-num">0{i+1}</span><div className="rank-product"><b>{p.product}</b><span>{fmt(p.views)} views</span></div><div className="rank-bar"><i className="violet-bar" style={{width:(metrics.topCart[0]?.carts?p.carts/metrics.topCart[0].carts*100:0)+"%"}}/></div><strong>{fmt(p.carts)}</strong></div>)}</div></section>
      </div>
      <section className="panel table-panel"><div className="panel-heading"><div><div className="eyebrow">PRODUCT LEDGER</div><h3>Product event breakdown</h3><p>Event counts for the leading products</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Product ID</th><th>Views</th><th>Add to cart</th><th>Transactions</th><th>Cart / view</th></tr></thead><tbody>{metrics.topProducts.map(p=><tr key={p.product}><td><b>{p.product}</b></td><td>{fmt(p.views)}</td><td>{fmt(p.carts)}</td><td>{fmt(p.transactions)}</td><td>{pct(p.views?p.carts/p.views*100:0)}</td></tr>)}</tbody></table></div><div className="table-note">Event ratios are not unique-customer conversion rates.</div></section>
    </>
  );

  const renderCustomers = () => (
    <>
      <div className="section-title"><div><div className="eyebrow">AUDIENCE INTELLIGENCE</div><h1>Customer <em>behaviour.</em></h1><p>Understand anonymous visitor activity, transaction frequency and session timing from the recorded event trail.</p></div></div>
      <div className="metric-grid three">
        <div className="metric-card"><div className="metric-top"><span>Unique visitor IDs</span><Users size={17}/></div><div className="metric-value">{fmt(metrics.visitors)}</div><div className="metric-foot">Distinct anonymous identifiers</div></div>
        <div className="metric-card"><div className="metric-top"><span>Estimated sessions</span><Hourglass size={17}/></div><div className="metric-value">{metrics.sessionAvailable ? fmt(metrics.session.count) : "Unavailable"}</div><div className="metric-foot">{metrics.sessionAvailable ? "30-minute inactivity grouping or explicit session field" : "No session data detected"}</div></div>
        <div className="metric-card"><div className="metric-top"><span>Login signals</span><LogIn size={17}/></div><div className="metric-value">{metrics.loginAvailable ? fmt(metrics.logins) : "Not captured"}</div><div className="metric-foot">{metrics.loginAvailable ? fmt(metrics.loginVisitors) + " distinct logged-in visitor IDs" : "No login fields/events in source"}</div></div>
      </div>
      <section className="panel table-panel"><div className="panel-heading"><div><div className="eyebrow">VISITOR RANKING</div><h3>Most transaction-active visitors</h3><p>Ranked by recorded transaction events</p></div><span className="tag tag-green">ANONYMIZED IDs</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Visitor ID</th><th>Transaction events</th><th>Distinct purchased products</th><th>Unique transaction IDs</th></tr></thead><tbody>{metrics.topVisitors.map(visitor=><tr key={visitor.visitor}><td><b>{visitor.visitor}</b></td><td><span className="value-pill">{fmt(visitor.transactions)}</span></td><td>{fmt(visitor.distinctProducts)}</td><td>{visitor.uniqueTransactionIds === undefined ? "—" : fmt(visitor.uniqueTransactionIds)}</td></tr>)}</tbody></table></div><div className="table-note">Visitor IDs are anonymous. These rankings do not identify real people.</div></section>
      <div className="coverage-grid">
        <div className="coverage-card"><div className="coverage-icon blue-coverage"><Hourglass size={17}/></div><div><span>SESSION DURATION</span><b>{metrics.sessionAvailable ? Number(metrics.session.avg || 0).toFixed(2) + " min average" : "Unavailable"}</b><p>{metrics.sessionAvailable ? metrics.session.method + ". Average uses multi-event sessions." : "Provide a session ID, session duration, or visitor ID plus timestamp."}</p></div></div>
        <div className="coverage-card"><div className="coverage-icon rose-coverage"><LogIn size={17}/></div><div><span>LOGIN COVERAGE</span><b>{metrics.loginAvailable ? "Available" : "No login records"}</b><p>Login analysis requires a login/sign-in event or explicit authentication-status column.</p></div></div>
      </div>
      <section className="notice-box"><AlertCircle size={17}/><div><b>Privacy and interpretation</b><p>The Retailrocket visitor IDs are anonymous identifiers. The dataset does not include names, email addresses, or demographic identities. Session windows are inferred and should not be presented as exact tracked sessions.</p></div></section>
    </>
  );

  const renderTrends = () => (
    <>
      <div className="section-title"><div><div className="eyebrow">JOURNEY & MOMENTUM</div><h1>Trends <em>& funnel.</em></h1><p>Follow recorded behaviour from product discovery to transaction events, and understand when activity occurs.</p></div></div>
      <div className="metric-grid three">
        <div className="metric-card"><div className="metric-top"><span>Cart / view event ratio</span><ShoppingCart size={17}/></div><div className="metric-value">{pct(metrics.cartRate)}</div><div className="metric-foot">Cart events / view events</div></div>
        <div className="metric-card"><div className="metric-top"><span>Transaction / view event ratio</span><TrendingUp size={17}/></div><div className="metric-value">{pct(metrics.transactionRate)}</div><div className="metric-foot">Transaction events / view events</div></div>
        <div className="metric-card"><div className="metric-top"><span>Transaction / cart event ratio</span><ShoppingBag size={17}/></div><div className="metric-value">{pct(metrics.cartToTransactionRate)}</div><div className="metric-foot">Transaction events / cart events</div></div>
      </div>
      <section className="panel chart-panel"><div className="panel-heading"><div><div className="eyebrow">HOURLY EVENT TIMELINE</div><h3>When does customer activity peak?</h3><p>All timestamps displayed in UTC</p></div></div><div className="chart-wrap extra-tall"><ResponsiveContainer width="100%" height="100%"><AreaChart data={metrics.hourly}><CartesianGrid stroke="#252c39" vertical={false}/><XAxis dataKey="hour" tickFormatter={v=>String(v).padStart(2,"0")} stroke="#667085" tickLine={false} axisLine={false} fontSize={10}/><YAxis stroke="#667085" tickLine={false} axisLine={false} fontSize={10}/><Tooltip contentStyle={{background:"#151a23",border:"1px solid #303849",borderRadius:12}}/><Area dataKey="views" name="Views" stroke="#c8f169" fill="#c8f169" fillOpacity={0.13} strokeWidth={2}/><Area dataKey="carts" name="Cart" stroke="#a995ff" fill="#a995ff" fillOpacity={0.08} strokeWidth={2}/><Area dataKey="transactions" name="Transactions" stroke="#62d5c8" fill="#62d5c8" fillOpacity={0.06} strokeWidth={2}/></AreaChart></ResponsiveContainer></div></section>
      <section className="panel funnel-panel"><div className="panel-heading"><div><div className="eyebrow">RECORDED EVENT FUNNEL</div><h3>Discovery → cart intent → transaction</h3><p>Event counts, not unique visitors passing through each stage</p></div></div><div className="funnel-steps">{[{name:"Product views",value:metrics.views,color:"funnel-mint",width:100,desc:"Discovery signals"},{name:"Add to cart",value:metrics.carts,color:"funnel-violet",width:metrics.views?metrics.carts/metrics.views*100:0,desc:"Cart intent signals"},{name:"Transaction events",value:metrics.transactions,color:"funnel-teal",width:metrics.views?metrics.transactions/metrics.views*100:0,desc:"Transaction signals"}].map((stage,i)=><div className="funnel-row" key={stage.name}><div className="funnel-meta"><b>{stage.name}</b><span>{fmt(stage.value)} events</span></div><div className="funnel-track"><i className={stage.color} style={{width:Math.max(stage.width,2)+"%"}}/></div><div className="funnel-desc">{stage.desc}</div></div>)}</div><div className="table-note">The stages are aggregate event totals and are not necessarily unique users progressing through one session.</div></section>
    </>
  );

  const renderAssistant = () => (
    <>
      <div className="section-title assistant-title"><div><div className="eyebrow"><span className="live-dot"/> INTELLIGENCE WORKSPACE</div><h1>Ask the <em>signals.</em></h1><p>Explore your commerce dataset with questions in plain language.</p></div><span className="tag tag-green"><Zap size={12}/> COMPUTED ANALYTICS</span></div>
      <div className="assistant-shell">
        <div className="assistant-top"><div className="assistant-avatar"><Bot size={19}/></div><div><b>Commerce Analyst</b><small><span className="live-dot"/> Dataset-aware analysis · Evidence-led</small></div><span className="model-chip">ANALYST MODE</span></div>
        <div className="chat-messages">
          {messages.length === 0 && <div className="assistant-welcome"><div className="welcome-orb"><Sparkles size={23}/></div><h2>What would you like to<br/><em>understand today?</em></h2><p>Ask about product performance, visitor activity, event trends or the structure of your data.</p><div className="prompt-grid">{quickPrompts.map(p=><button onClick={()=>ask(p)} key={p}>{p}<ArrowUpRight size={13}/></button>)}</div></div>}
          {messages.map((m,i)=><div className={"message-row "+(m.role==="user"?"user-message":"assistant-message")} key={i}><div className="message-icon">{m.role==="user"?<span>GG</span>:<Bot size={16}/>}</div><div className="message-body"><div className="message-label">{m.role==="user"?"YOU":"COMMERCE ANALYST"}</div><div className="message-text">{m.content}</div>{m.rows?.length>0&&<div className="result-table-wrap"><table className="data-table compact-table"><thead><tr>{Object.keys(m.rows[0]).map(k=><th key={k}>{k.replace(/_/g," ")}</th>)}</tr></thead><tbody>{m.rows.slice(0,10).map((row,j)=><tr key={j}>{Object.values(row).map((v,k)=><td key={k}>{typeof v==="number"?fmt(v):String(v)}</td>)}</tr>)}</tbody></table></div>}{m.explanation&&<div className="answer-caveat"><AlertCircle size={13}/>{m.explanation}</div>}{m.retrieved?.length>0&&<div className="retrieved-box"><b><BookOpen size={13}/> Retrieved evidence</b>{m.retrieved.map((r,j)=><div className="retrieved-item" key={r.id}><span>[Source {j+1}] {r.source}</span><p>{r.text}</p></div>)}</div>}<span className="answer-source">{m.kind==="analysis"?"Calculated from active dataset":m.kind==="retrieval"?"Keyword retrieval · Sources shown":"Guidance" }{m.modelUsed?" · AI synthesis enabled":" · deterministic / retrieval mode"}</span></div></div>)}
          {busy&&<div className="message-row assistant-message"><div className="message-icon"><Bot size={16}/></div><div className="message-body"><div className="message-label">COMMERCE ANALYST</div><div className="typing"><i/><i/><i/></div></div></div>}
          <div ref={chatEndRef}/>
        </div>
        <form className="chat-composer" onSubmit={e=>{e.preventDefault();ask();}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ask a question about your commerce data..." disabled={busy}/><button disabled={!query.trim()||busy} aria-label="Send question"><Send size={17}/></button></form>
        <div className="composer-foot"><span><Sparkles size={12}/> Answers are grounded in calculated dataset results and retrieved excerpts.</span><span>Enter to send</span></div>
      </div>
    </>
  );

  const renderKnowledge = () => (
    <>
      <div className="section-title"><div><div className="eyebrow">DOCUMENT INTELLIGENCE</div><h1>Knowledge <em>retrieval.</em></h1><p>Bring business definitions and project documentation into the analysis workflow.</p></div><button className="btn btn-primary" onClick={()=>docRef.current?.click()}><Plus size={15}/> Add knowledge files</button><input ref={docRef} type="file" accept=".txt,.md,text/plain,text/markdown" multiple hidden onChange={e=>loadDocs(e.target.files)}/></div>
      <div className="knowledge-stats"><div className="metric-card"><div className="metric-top">Knowledge sources <BookOpen size={16}/></div><div className="metric-value">{docs.length}</div><div className="metric-foot">Built-in guides and uploaded notes</div></div><div className="metric-card"><div className="metric-top">Uploaded files <FileText size={16}/></div><div className="metric-value">{uploadedDocNames.length}</div><div className="metric-foot">TXT and Markdown sources</div></div><div className="metric-card"><div className="metric-top">Retrieval mode <Search size={16}/></div><div className="metric-value text-metric">Keyword</div><div className="metric-foot">Lightweight browser-side retrieval</div></div></div>
      <section className="panel knowledge-panel"><div className="panel-heading"><div><div className="eyebrow">KNOWLEDGE BASE</div><h3>Available sources</h3><p>Sources are split into passages and ranked against each question.</p></div></div>{docs.map((d,i)=><div className="source-row" key={d.name+i}><div className="source-icon"><FileText size={17}/></div><div className="source-info"><b>{d.name}</b><span>{d.text.length.toLocaleString()} characters · {chunkText(d.text,d.name).length} chunks</span></div><span className="source-status"><span className="live-dot"/> Indexed in session</span></div>)}</section>
      <div className="notice-box"><CircleHelp size={17}/><div><b>About this showcase retrieval</b><p>This Vercel frontend uses lightweight keyword-based chunk retrieval. It does not connect to the local Qdrant vector index or the original Python hybrid retriever yet. The original Streamlit project retains that fuller Hybrid RAG pipeline.</p></div></div>
    </>
  );

  const content = active === "products" ? renderProducts()
    : active === "customers" ? renderCustomers()
    : active === "trends" ? renderTrends()
    : active === "assistant" ? renderAssistant()
    : active === "knowledge" ? renderKnowledge()
    : renderOverview();

  return (
    <div className="app-shell">
      {sidebar}
      {mobileNav&&<button className="mobile-backdrop" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
      <main className="main-area">
        {header}
        <div className="page-content">
          {notice&&<div className="notice-toast"><AlertCircle size={15}/>{notice}<button onClick={()=>setNotice("")}><X size={14}/></button></div>}
          {content}
          <footer className="app-footer"><span>COMMERCE INTELLIGENCE <i>·</i> BUILT FOR SIGNAL-DRIVEN DECISIONS</span><span><span className="live-dot"/> {demoMode?"Synthetic demonstration data":"Browser-loaded dataset"}</span></footer>
        </div>
      </main>
    </div>
  );
}
