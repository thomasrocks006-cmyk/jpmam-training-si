
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { readJson } from "../lib/store.js";
import { getBreaches } from "../lib/mandatesStore.js";
import { bus } from "../lib/events.js";

const router = Router();

function getUserRole(req){
  try {
    const email = (req.user?.sub || "").toLowerCase();
    const users = readJson("users.json");
    const me = users.find(u => (u.email || "").toLowerCase() === email);
    return String(me?.role || "Analyst");
  } catch { return "Analyst"; }
}

// Server decides which tiles are visible per role
function visibleTilesFor(role){
  // You can tune this map anytime
  if (role === "Admin") return ["approvals","alerts","rfps","market","risk"];
  if (role === "Risk")  return ["alerts","risk","approvals","market"];
  if (role === "Coverage") return ["rfps","approvals","market"];
  return ["approvals","market"]; // Analyst default
}

// Simple in-memory "activity feed" that resets on restart
let ACTIVITY = [
  { id: "EV-001", ts: new Date(Date.now() - 1000*60*15).toISOString(), type: "approval", status: "Created",  ref: "AM-52731",     text: "Trade exception request created for AU EQ book." },
  { id: "EV-002", ts: new Date(Date.now() - 1000*60*12).toISOString(), type: "report",   status: "Generated", ref: "RISK-VaR-TE",   text: "Risk – VaR & Tracking Error by Fund generated for SunSuper." },
  { id: "EV-003", ts: new Date(Date.now() - 1000*60*6 ).toISOString(), type: "rfp",      status: "Status",    ref: "RFP-SS-24Q3",   text: "RFP moved to Draft for SunSuper." },
  { id: "EV-004", ts: new Date(Date.now() - 1000*60*3 ).toISOString(), type: "breach",   status: "Resolved",  ref: "BR-SS-0007",    text: "Tracking error outside band — acknowledged and resolved." }
];

// Metrics
router.get("/metrics", requireAuth, (req, res) => {
  const role = getUserRole(req);
  const tiles = visibleTilesFor(role);

  const approvals = readJson("approvals.json");
  const pending = approvals.filter(a => a.status === "Pending").length;
  const approved = approvals.filter(a => a.status === "Approved").length;

  // Keep in sync with routes/clients.js (SunSuper + QBE aumAud)
  const aums = [4200000000, 2850000000];
  const totalAumAud = aums.reduce((a,b)=>a+b, 0);
  const mtdChangePct = 1.9; // mock MTD%

  // REAL breaches last 30 days (Open)
  const now = Date.now();
  const d30 = now - 30*24*60*60*1000;
  const openBreaches = getBreaches({ status: "Open" });
  const breachesLast30 = openBreaches.filter(b => {
    const t = new Date(b.opened).getTime();
    return t >= d30 && t <= now;
  }).length;

  const today = new Date();
  const in7   = new Date(today.getTime() + 7*24*60*60*1000);
  const meetings = [
    { client: "SunSuper",      when: "2025-08-14T02:00:00Z", topic: "Q2 Performance Review" },
    { client: "QBE Insurance", when: "2025-08-18T01:00:00Z", topic: "LDI Constraint Review" },
  ].filter(m => {
    const d = new Date(m.when);
    return d >= today && d <= in7;
  });

  res.json({
    role,
    visibleTiles: tiles,
    totalAumAud,
    mtdChangePct,
    approvals: { pending, approved },
    breachesLast30,
    meetings,
    lastUpdated: new Date().toISOString()
  });
});

// Recent activity
router.get("/activity", requireAuth, (_req, res) => {
  const feed = [...ACTIVITY]
    .sort((a,b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 20);
  res.json({ feed, lastUpdated: new Date().toISOString() });
});

// Alerts derived from real mandate breaches
router.get("/alerts", requireAuth, (_req, res) => {
  const open = getBreaches({ status: "Open" });
  const alerts = open.map(b => {
    const daysOpen = Math.max(1, Math.ceil((Date.now() - new Date(b.opened).getTime()) / (24*60*60*1000)));
    return {
      id: b.id,
      mandateId: b.mandateId,
      client: b.client,
      type: b.type,
      severity: b.severity,
      daysOpen,
      note: b.note || ""
    };
  });
  res.json({ alerts, lastUpdated: new Date().toISOString() });
});

// --- Real deadlines from RFPs + meetings ---
router.get("/deadlines", requireAuth, (_req, res) => {
  const today = new Date();
  const in14  = new Date(today.getTime() + 14*24*60*60*1000);

  // From persisted RFPs
  let items = [];
  try {
    const rfpsData = (() => {
      try {
        const rfpsArr = readJson("rfps.json");
        return Array.isArray(rfpsArr) ? rfpsArr : [];
      } catch { return []; }
    })();
    items.push(...rfpsData
      .filter(r => r.due)
      .map(r => ({ due: r.due, title: r.title, client: r.client, owner: r.owner || "Coverage", ref: r.id })));
  } catch {}

  // Upcoming client meetings (dup of clients.js mock for now)
  const clientMeetings = [
    { due: "2025-08-14", title: "Q2 Performance Review (Meeting)", client: "SunSuper", owner: "You", ref: "MEET-SS-Q2" },
    { due: "2025-08-18", title: "LDI Constraint Review (Meeting)", client: "QBE Insurance", owner: "Coverage", ref: "MEET-QBE-LDI" }
  ];

  items.push(...clientMeetings);

  // Window filter & sort
  const inWindow = items.filter(x => {
    const d = new Date(x.due);
    return d >= today && d <= in14;
  }).sort((a,b) => a.due.localeCompare(b.due));

  res.json({ items: inWindow, lastUpdated: new Date().toISOString() });
});

// Server-Sent Events: live dashboard updates
router.get("/stream", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const ping = setInterval(() => {
    res.write(`event: ping\ndata: {"ts":"${new Date().toISOString()}"}\n\n`);
  }, 15000);

  const onEvent = (evt) => {
    // push minimal payload; client can decide what to refetch
    res.write(`event: dash\ndata: ${JSON.stringify(evt)}\n\n`);
  };

  bus.on("dashboard:event", onEvent);

  req.on("close", () => {
    clearInterval(ping);
    bus.off("dashboard:event", onEvent);
  });
});

router.get("/approvals/first-pending", requireAuth, (_req, res) => {
  const approvals = readJson("approvals.json");
  const first = approvals.find(a => a.status === "Pending") || null;
  res.json({ first });
});

export default router;
