import React, { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3,
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

function normalizeRows(rawRows) {
  if (!rawRows.length) return { rows: [], schema: {}, headers: [] };
  const headers = Object.keys(rawRows[0] || {});
  const schema = {
    event: detectColumn(headers, ["event", "eventtype", "action", "interaction", "eventname", "type"]),
    visitor: detectColumn(headers, ["visitorid", "visitor", "userid", "customerid", "customer", "user"]),
    product: detectColumn(headers, ["itemid", "productid", "sku", "product", "item"]),
    timestamp: detectColumn(headers, ["timestamp", "datetime", "date", "createdat", "eventtime", "time"]),
    transaction: detectColumn(headers, ["transactionid", "orderid", "order", "transaction"]),
    revenue: detectColumn(headers, ["revenue", "sales", "amount", "total", "ordervalue"])
  };
  const rows = rawRows.map(raw => {
    const eventRaw = schema.event ? String(raw[schema.event] ?? "").toLowerCase() : "";
    let event = "other";
    if (/view|impression|product.?click/.test(eventRaw)) event = "view";
    else if (/cart|basket/.test(eventRaw)) event = "cart";
    else if (/transaction|purchase|order|checkout|complete|paid/.test(eventRaw)) event = "transaction";
    const ts = schema.timestamp ? raw[schema.timestamp] : null;
    let date = null;
    if (ts !== null && ts !== undefined && ts !== "") {
      if (typeof ts === "number" || (/^\d{10,13}$/.test(String(ts)))) {
        const n = Number(ts);
        date = new Date(n > 1e12 ? n : n > 1e9 ? n * 1000 : NaN);
      } else {
        date = new Date(ts);
      }
      if (!Number.isFinite(date?.getTime?.())) date = null;
    }
    return {
      raw,
      event,
      eventRaw,
      visitor: schema.visitor ? String(raw[schema.visitor] ?? "") : "",
      product: schema.product ? String(raw[schema.product] ?? "") : "",
      timestamp: date,
      transaction: schema.transaction ? String(raw[schema.transaction] ?? "") : "",
      revenue: schema.revenue ? Number(raw[schema.revenue]) : null
    };
  });
  return { rows, schema, headers };
}

function aggregate(data) {
  const rows = data.rows;
  const count = event => rows.filter(r => r.event === event).length;
  const views = count("view");
  const carts = count("cart");
  const transactions = count("transaction");
  const visitors = new Set(rows.map(r => r.visitor).filter(Boolean)).size;
  const products = new Set(rows.map(r => r.product).filter(Boolean)).size;
  const productMap = new Map();
  rows.forEach(r => {
    if (!r.product) return;
    const item = productMap.get(r.product) || { product: r.product, views: 0, carts: 0, transactions: 0 };
    if (r.event === "view") item.views++;
    if (r.event === "cart") item.carts++;
    if (r.event === "transaction") item.transactions++;
    productMap.set(r.product, item);
  });
  const topProducts = [...productMap.values()].sort((a, b) => b.views - a.views).slice(0, 8);
  const topCart = [...productMap.values()].sort((a, b) => b.carts - a.carts).slice(0, 8);
  const visitorMap = new Map();
  rows.forEach(r => {
    if (!r.visitor) return;
    const item = visitorMap.get(r.visitor) || { visitor: r.visitor, events: 0, views: 0, carts: 0, transactions: 0, products: new Set() };
    item.events++;
    if (r.event === "view") item.views++;
    if (r.event === "cart") item.carts++;
    if (r.event === "transaction") item.transactions++;
    if (r.product && r.event === "transaction") item.products.add(r.product);
    visitorMap.set(r.visitor, item);
  });
  const topVisitors = [...visitorMap.values()].map(v => ({ ...v, distinctProducts: v.products.size })).sort((a, b) => b.transactions - a.transactions || b.events - a.events).slice(0, 8);
  const days = new Map();
  rows.forEach(r => {
    if (!r.timestamp || !Number.isFinite(r.timestamp.getTime())) return;
    const key = r.timestamp.toISOString().slice(0, 10);
    const item = days.get(key) || { date: key, views: 0, carts: 0, transactions: 0 };
    if (r.event === "view") item.views++;
    if (r.event === "cart") item.carts++;
    if (r.event === "transaction") item.transactions++;
    days.set(key, item);
  });
  const trend = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const eventMix = [
    { name: "Views", value: views, color: COLORS[0] },
    { name: "Add to cart", value: carts, color: COLORS[1] },
    { name: "Transactions", value: transactions, color: COLORS[2] },
    { name: "Other", value: rows.length - views - carts - transactions, color: "#657086" }
  ].filter(x => x.value > 0);
  const revenue = data.schema.revenue ? rows.reduce((sum, r) => sum + (Number.isFinite(r.revenue) ? r.revenue : 0), 0) : null;
  return {
    total: rows.length, visitors, products, views, carts, transactions,
    cartRate: views ? carts / views * 100 : 0,
    transactionRate: views ? transactions / views * 100 : 0,
    topProducts, topCart, topVisitors, trend: trend.slice(-30), eventMix, revenue,
    productMap
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
  if (/overview|summary|summarize|how many rows|total events|dataset size|dataset contain/.test(compact)) {
    return {
      answer: "Your dataset contains " + fmt(metrics.total) + " records, " + fmt(metrics.visitors) + " distinct visitor identifiers and " + fmt(metrics.products) + " distinct product identifiers. I counted " + fmt(metrics.views) + " view events, " + fmt(metrics.carts) + " add-to-cart events and " + fmt(metrics.transactions) + " transaction events.",
      rows: [
        { metric: "Total records", value: metrics.total },
        { metric: "Unique visitor IDs", value: metrics.visitors },
        { metric: "Unique product IDs", value: metrics.products },
        { metric: "View events", value: metrics.views },
        { metric: "Add-to-cart events", value: metrics.carts },
        { metric: "Transaction events", value: metrics.transactions }
      ],
      explanation: "Counts are calculated from the currently loaded dataset."
    };
  }
  if (/most view|top view|popular product|product.*view|view.*product/.test(compact)) {
    return { answer: "These are the products with the highest recorded view-event counts in the loaded dataset.", rows: metrics.topProducts.map(x => ({ product: x.product, views: x.views, add_to_cart: x.carts, transactions: x.transactions })), explanation: "This ranking measures view events, not unique viewers, revenue or profit." };
  }
  if (/add.*cart|cart.*product|cart activity/.test(compact)) {
    return { answer: "These products have the highest recorded add-to-cart activity.", rows: metrics.topCart.map(x => ({ product: x.product, add_to_cart_events: x.carts, views: x.views, transactions: x.transactions })), explanation: "An add-to-cart event does not guarantee a completed purchase." };
  }
  if (/visitor|customer|user/.test(compact) && /transaction|purchase|buy|bought|order/.test(compact)) {
    return { answer: "These anonymous visitor IDs have the most recorded transaction events.", rows: metrics.topVisitors.map(x => ({ visitor_id: x.visitor, transaction_events: x.transactions, distinct_products_in_transactions: x.distinctProducts, total_events: x.events })), explanation: "Visitor IDs are anonymous. Transaction events are not guaranteed to equal unique orders." };
  }
  if (/funnel|conversion|cart to view|transaction to view/.test(compact)) {
    return { answer: "The recorded event funnel contains " + fmt(metrics.views) + " view events, " + fmt(metrics.carts) + " add-to-cart events and " + fmt(metrics.transactions) + " transaction events. The add-to-cart-to-view event ratio is " + pct(metrics.cartRate) + " and the transaction-to-view event ratio is " + pct(metrics.transactionRate) + ".", rows: [{ stage: "Views", events: metrics.views }, { stage: "Add to cart", events: metrics.carts }, { stage: "Transactions", events: metrics.transactions }], explanation: "These are event ratios, not verified unique-customer conversion rates." };
  }
  if (/trend|over time|daily|day by day|activity/.test(compact)) {
    return { answer: "Here is the recent daily event activity available from your dataset. The chart separates views, cart events and transaction events.", rows: metrics.trend, explanation: "Daily trends include only records with a valid timestamp." };
  }
  if (/revenue|sales value|total sales/.test(compact)) {
    if (metrics.revenue === null) return { answer: "I can't calculate revenue from this dataset because I couldn't identify a revenue, sales, amount or order-value column. Please upload a dataset containing a suitable monetary field.", rows: [], explanation: "No revenue field was detected." };
    return { answer: "The sum of the detected numeric revenue field is " + fmt(metrics.revenue) + ". Please confirm the field's currency and whether each row represents a transaction or an event.", rows: [{ metric: "Sum of detected revenue field", value: metrics.revenue }], explanation: "The detected field is heuristic and needs confirmation." };
  }
  if (/column|schema|field|missing|null|duplicate|profile/.test(compact)) {
    const p = profileDataset(data);
    return { answer: "I identified " + p.length + " columns. The table shows inferred data types, missing values, unique values and sample content.", rows: p, explanation: "Column roles are inferred heuristically from names and values." };
  }
  return null;
}

export default function App() {
  const [rawRows, setRawRows] = useState(makeDemoData);
  const [sourceName, setSourceName] = useState("Demo workspace · synthetic sample");
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
  const metrics = useMemo(() => aggregate(data), [data]);
  const profile = useMemo(() => profileDataset(data), [data]);

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
    { id: "overview", label: "Overview", icon: LayoutDashboard, group: "WORKSPACE" },
    { id: "products", label: "Product intelligence", icon: ShoppingBag },
    { id: "customers", label: "Customer behaviour", icon: Users },
    { id: "trends", label: "Trends & funnel", icon: Activity },
    { id: "assistant", label: "AI analyst", icon: MessageSquare, group: "INTELLIGENCE" },
    { id: "knowledge", label: "Knowledge retrieval", icon: BookOpen }
  ];

  const quickPrompts = [
    "Which products get the most views?",
    "Who has the most transaction events?",
    "Show me the event funnel",
    "How has activity changed over time?"
  ];

  const resetDemo = () => {
    setRawRows(makeDemoData());
    setSourceName("Demo workspace · synthetic sample");
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
          <div className="data-card-head"><span className="live-dot"/><span>{demoMode ? "DEMO DATA" : "UPLOADED DATA"}</span><span className="data-more">•••</span></div>
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
        <div className="status-pill"><span className="live-dot"/> {demoMode ? "Demo environment" : "Dataset loaded"}</div>
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
      <div className="page-intro">
        <div><div className="eyebrow"><span className="live-dot"/> COMMERCE PERFORMANCE / LIVE WORKSPACE</div><h1>See the story<br/><em>behind every signal.</em></h1><p>Explore customer interactions, uncover product patterns, and turn raw commerce events into decisions.</p></div>
        <div className="intro-actions"><button className="btn btn-secondary" onClick={downloadCSV}><Download size={15}/> Export sample</button><button className="btn btn-primary" onClick={() => setActive("assistant")}><Sparkles size={15}/> Ask the analyst</button></div>
      </div>
      <div className="dataset-banner"><div className="db-icon"><Database size={18}/></div><div className="db-copy"><b>{sourceName}</b><span>{demoMode ? "Synthetic sample for demonstration · upload your CSV to analyze your own data" : "Your uploaded CSV is being analyzed in this browser session"}</span></div><div className="db-right"><span className="tag tag-green">{demoMode ? "SAMPLE DATA" : "ACTIVE DATASET"}</span><button className="text-link" onClick={() => setActive("knowledge")}>Data profile <ArrowUpRight size={13}/></button></div></div>
      <div className="metric-grid">
        {metricCards.map((m, i) => <div className="metric-card" key={m.label}><div className="metric-top"><span>{m.label}</span><div className={"metric-icon " + m.color}><m.icon size={17}/></div></div><div className="metric-value">{m.value}</div><div className="metric-foot"><span>{m.sub}</span><span className="metric-note">{m.trend}</span></div></div>)}
      </div>
      <div className="content-grid main-charts">
        <section className="panel chart-panel wide-panel">
          <div className="panel-heading"><div><div className="eyebrow">ENGAGEMENT OVER TIME</div><h3>Interaction activity</h3><p>Daily views, cart actions and transactions</p></div><div className="legend"><span><i className="dot mint-dot"/> Views</span><span><i className="dot violet-dot"/> Cart</span><span><i className="dot teal-dot"/> Transactions</span></div></div>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={metrics.trend}><defs><linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8f169" stopOpacity={0.25}/><stop offset="95%" stopColor="#c8f169" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#252c39" vertical={false}/><XAxis dataKey="date" tickFormatter={v => v.slice(5)} stroke="#667085" tickLine={false} axisLine={false} fontSize={10}/><YAxis stroke="#667085" tickLine={false} axisLine={false} fontSize={10} width={38}/><Tooltip contentStyle={{background:"#151a23",border:"1px solid #303849",borderRadius:12,color:"#fff"}}/><Area type="monotone" dataKey="views" stroke="#c8f169" fill="url(#viewsGrad)" strokeWidth={2.2}/><Area type="monotone" dataKey="carts" stroke="#a995ff" fill="transparent" strokeWidth={2}/><Area type="monotone" dataKey="transactions" stroke="#62d5c8" fill="transparent" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>
          <div className="chart-caption"><span><Clock3 size={13}/> Last {metrics.trend.length} days with valid timestamps</span><span>Source: {demoMode ? "synthetic demo events" : sourceName}</span></div>
        </section>
        <section className="panel mix-panel">
          <div className="panel-heading"><div><div className="eyebrow">EVENT DISTRIBUTION</div><h3>Engagement mix</h3><p>Share of recorded interactions</p></div></div>
          <div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={metrics.eventMix} dataKey="value" nameKey="name" innerRadius={66} outerRadius={90} paddingAngle={3} stroke="none">{metrics.eventMix.map((entry, i) => <Cell key={entry.name} fill={entry.color}/>)}</Pie><Tooltip contentStyle={{background:"#151a23",border:"1px solid #303849",borderRadius:12}}/></PieChart></ResponsiveContainer><div className="donut-center"><b>{fmt(metrics.total)}</b><span>events</span></div></div>
          <div className="mix-legend">{metrics.eventMix.map((entry) => <div key={entry.name}><span><i style={{background:entry.color}}/>{entry.name}</span><b>{pct(metrics.total ? entry.value / metrics.total * 100 : 0)}</b></div>)}</div>
        </section>
      </div>
      <div className="content-grid lower-grid">
        <section className="panel">
          <div className="panel-heading"><div><div className="eyebrow">PRODUCT DISCOVERY</div><h3>Most viewed products</h3><p>Ranked by recorded view events</p></div><button className="text-link" onClick={() => setActive("products")}>View all <ArrowUpRight size={13}/></button></div>
          <div className="rank-list">{metrics.topProducts.slice(0,5).map((p,i) => <div className="rank-row" key={p.product}><span className="rank-num">0{i+1}</span><div className="rank-product"><b>{p.product}</b><span>{fmt(p.views)} views</span></div><div className="rank-bar"><i style={{width:(metrics.topProducts[0]?.views ? p.views/metrics.topProducts[0].views*100 : 0)+"%"}}/></div><strong>{fmt(p.views)}</strong></div>)}</div>
        </section>
        <section className="insight-card">
          <div className="insight-orb"><Sparkles size={20}/></div><div className="eyebrow">INTELLIGENCE NOTE</div><h3>Attention is only the beginning.</h3><p>Compare product views with cart and transaction activity to spot where customer interest may be dropping off.</p><button className="btn btn-light" onClick={() => {setActive("assistant");setQuery("Show me the event funnel");}}>Explore the funnel <ArrowUpRight size={14}/></button><div className="insight-decoration">✳</div>
        </section>
      </div>
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
      <div className="section-title"><div><div className="eyebrow">AUDIENCE INTELLIGENCE</div><h1>Customer <em>behaviour.</em></h1><p>Understand anonymous visitor activity across the recorded journey.</p></div></div>
      <div className="metric-grid three">
        <div className="metric-card"><div className="metric-top"><span>Unique visitor IDs</span><Users size={17}/></div><div className="metric-value">{fmt(metrics.visitors)}</div><div className="metric-foot">Distinct anonymous identifiers</div></div>
        <div className="metric-card"><div className="metric-top"><span>Average events / visitor</span><Activity size={17}/></div><div className="metric-value">{metrics.visitors? (metrics.total/metrics.visitors).toFixed(2):"—"}</div><div className="metric-foot">Across visitors in this dataset</div></div>
        <div className="metric-card"><div className="metric-top"><span>Transaction events</span><ShoppingCart size={17}/></div><div className="metric-value">{fmt(metrics.transactions)}</div><div className="metric-foot">Not unique orders</div></div>
      </div>
      <section className="panel table-panel"><div className="panel-heading"><div><div className="eyebrow">VISITOR RANKING</div><h3>Most transaction-active visitors</h3><p>Ranked by recorded transaction events</p></div><span className="tag tag-green">ANONYMIZED IDs</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Visitor ID</th><th>Total events</th><th>Views</th><th>Cart events</th><th>Transaction events</th><th>Distinct purchased products</th></tr></thead><tbody>{metrics.topVisitors.map((v,i)=><tr key={v.visitor}><td><b>{v.visitor}</b></td><td>{fmt(v.events)}</td><td>{fmt(v.views)}</td><td>{fmt(v.carts)}</td><td><span className="value-pill">{fmt(v.transactions)}</span></td><td>{fmt(v.distinctProducts)}</td></tr>)}</tbody></table></div><div className="table-note">Visitor IDs are anonymous identifiers, not identifiable people.</div></section>
      <section className="notice-box"><AlertCircle size={17}/><div><b>Interpretation note</b><p>This dataset does not directly provide personal identities, demographics, customer lifetime value or verified product quantities. The rankings describe recorded event activity only.</p></div></section>
    </>
  );

  const renderTrends = () => (
    <>
      <div className="section-title"><div><div className="eyebrow">JOURNEY & MOMENTUM</div><h1>Trends <em>& funnel.</em></h1><p>Follow recorded behaviour from product discovery to transaction events.</p></div></div>
      <div className="metric-grid three">
        <div className="metric-card"><div className="metric-top"><span>Views</span><Eye size={17}/></div><div className="metric-value">{fmt(metrics.views)}</div><div className="metric-foot">Event volume</div></div>
        <div className="metric-card"><div className="metric-top"><span>Cart-to-view ratio</span><ShoppingCart size={17}/></div><div className="metric-value">{pct(metrics.cartRate)}</div><div className="metric-foot">Cart events / view events</div></div>
        <div className="metric-card"><div className="metric-top"><span>Transaction-to-view ratio</span><TrendingUp size={17}/></div><div className="metric-value">{pct(metrics.transactionRate)}</div><div className="metric-foot">Transaction events / view events</div></div>
      </div>
      <section className="panel chart-panel"><div className="panel-heading"><div><div className="eyebrow">EVENT TIMELINE</div><h3>Daily interaction trend</h3><p>Last 30 observed dates with valid timestamps</p></div></div><div className="chart-wrap extra-tall"><ResponsiveContainer width="100%" height="100%"><AreaChart data={metrics.trend}><CartesianGrid stroke="#252c39" vertical={false}/><XAxis dataKey="date" tickFormatter={v=>v.slice(5)} stroke="#667085" tickLine={false} axisLine={false} fontSize={10}/><YAxis stroke="#667085" tickLine={false} axisLine={false} fontSize={10}/><Tooltip contentStyle={{background:"#151a23",border:"1px solid #303849",borderRadius:12}}/><Area dataKey="views" name="Views" stroke="#c8f169" fill="#c8f169" fillOpacity={0.13} strokeWidth={2}/><Area dataKey="carts" name="Cart" stroke="#a995ff" fill="#a995ff" fillOpacity={0.08} strokeWidth={2}/><Area dataKey="transactions" name="Transactions" stroke="#62d5c8" fill="#62d5c8" fillOpacity={0.06} strokeWidth={2}/></AreaChart></ResponsiveContainer></div></section>
      <section className="panel funnel-panel"><div className="panel-heading"><div><div className="eyebrow">RECORDED EVENT FUNNEL</div><h3>From discovery to transaction</h3><p>Event counts at each stage</p></div></div><div className="funnel-steps">{[{name:"Product views",value:metrics.views,color:"funnel-mint",width:100,desc:"Discovery signals"},{name:"Add to cart",value:metrics.carts,color:"funnel-violet",width:metrics.views?metrics.carts/metrics.views*100:0,desc:"Cart intent signals"},{name:"Transaction events",value:metrics.transactions,color:"funnel-teal",width:metrics.views?metrics.transactions/metrics.views*100:0,desc:"Transaction signals"}].map((s,i)=><div className="funnel-row" key={s.name}><div className="funnel-meta"><b>{s.name}</b><span>{fmt(s.value)} events</span></div><div className="funnel-track"><i className={s.color} style={{width:Math.max(s.width,2)+"%"}}/></div><div className="funnel-desc">{s.desc}</div></div>)}</div><div className="table-note">Stages are event totals and are not necessarily unique users progressing through a session-level funnel.</div></section>
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
