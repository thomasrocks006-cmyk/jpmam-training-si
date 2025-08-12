
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { readJson } from "../lib/store.js";
import { getBreaches } from "../lib/mandatesStore.js";

const router = Router();

// Simple in-memory "activity feed" that resets on restart
let ACTIVITY = [
  { id: "EV-001", ts: new Date(Date.now() - 1000*60*15).toISOString(), type: "approval", status: "Created",  ref: "AM-52731",     text: "Trade exception request created for AU EQ book." },
  { id: "EV-002", ts: new Date(Date.now() - 1000*60*12).toISOString(), type: "report",   status: "Generated", ref: "RISK-VaR-TE",   text: "Risk – VaR & Tracking Error by Fund generated for SunSuper." },
  { id: "EV-003", ts: new Date(Date.now() - 1000*60*6 ).toISOString(), type: "rfp",      status: "Status",    ref: "RFP-SS-24Q3",   text: "RFP moved to Draft for SunSuper." },
  { id: "EV-004", ts: new Date(Date.now() - 1000*60*3 ).toISOString(), type: "breach",   status: "Resolved",  ref: "BR-SS-0007",    text: "Tracking error outside band — acknowledged and resolved." }
];

// Metrics
router.get("/metrics", requireAuth, (_req, res) => {
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

// --- NEW: Upcoming deadlines & deliverables (mock) ---
router.get("/deadlines", requireAuth, (_req, res) => {
  const today = new Date();
  const addDays = d => new Date(today.getTime() + d*24*60*60*1000).toISOString().slice(0,10);

  const items = [
    { due: addDays(2),  title: "Q3 Client Pack",      client: "QBE Insurance", owner: "Coverage",   ref: "PK-QBE-Q3" },
    { due: addDays(4),  title: "RFP – SunSuper Draft",client: "SunSuper",      owner: "You",        ref: "RFP-SS-24Q3" },
    { due: addDays(7),  title: "Risk: VaR & TE Run",  client: "SunSuper",      owner: "Risk Ops",   ref: "RISK-VaR-TE" },
    { due: addDays(10), title: "Compliance Attest.",  client: "All Mandates",  owner: "Compliance", ref: "COMP-QTR" }
  ].sort((a,b)=> a.due.localeCompare(b.due));

  res.json({ items, lastUpdated: new Date().toISOString() });
});

export default router;
