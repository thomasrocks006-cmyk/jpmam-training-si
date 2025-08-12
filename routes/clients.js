
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

/**
 * In-memory mock store (resets on server restart).
 * We keep richer, realistic client payloads here so the UI can feel real.
 */
const DB = {
  clients: {
    SunSuper: {
      name: "SunSuper",
      type: "Pension",
      domicile: "AU",
      owner: "You",
      sla: "Monthly",
      aumAud: 4200000000, // A$4.2bn
      feeBps: 28,
      lastReview: "2025-07-11",
      nextReview: "2025-10-15",
      benchmark: "S&P/ASX 200 (TR)",
      strategies: ["Australian Equity Core"],
      contacts: [
        { name: "Kara James", role: "Head of Equities", email: "kara.james@sunsuper.au", phone: "+61 7 3131 0001" },
        { name: "Michael Chen", role: "Investment Ops", email: "michael.chen@sunsuper.au", phone: "+61 7 3131 0002" }
      ],
      meetings: [
        { when: "2025-08-14T02:00:00Z", topic: "Q2 Performance Review", attendees: ["Thomas Francis", "Kara James"] }
      ],
      pipeline: [{ stage: "RFP Draft", due: "2025-08-14" }],
      holdingsTop10: [
        { name: "BHP Group", weight: 8.2 },
        { name: "Commonwealth Bank", weight: 7.5 },
        { name: "CSL Ltd", weight: 6.1 },
        { name: "Westpac", weight: 5.3 },
        { name: "National Australia Bank", weight: 4.8 },
        { name: "Wesfarmers", weight: 4.1 },
        { name: "Macquarie Group", weight: 3.9 },
        { name: "Transurban", weight: 3.2 },
        { name: "Telstra", weight: 2.9 },
        { name: "Woolworths", weight: 2.7 }
      ],
      perfSpark: [ -12, -8, -5, -2, 1, 3, 5, 6, 8, 11, 9, 12 ], // mock rel perf bps
      sectorWeights: [
        { sector: "Financials", weight: 31.2 },
        { sector: "Materials", weight: 23.9 },
        { sector: "Healthcare", weight: 9.1 },
        { sector: "Industrials", weight: 8.7 },
        { sector: "Consumer", weight: 10.4 },
        { sector: "Utilities/RE", weight: 7.6 },
        { sector: "Cash", weight: 9.1 }
      ],
      docs: [
        { id: "DOC-SS-001", name: "SLA-Monthly-Template.pdf", type: "PDF", size: "82 KB", uploadedAt: "2025-07-01T00:10:00Z" },
        { id: "DOC-SS-002", name: "Q2-Perf-Deck.pdf", type: "PDF", size: "1.2 MB", uploadedAt: "2025-07-12T05:12:00Z" }
      ],
      notes: [
        { id: "N-SS-1", ts: "2025-07-12T06:45:00Z", user: "thomas.francis@jpmorgan.com", text: "Client asked to add factor heatmap in next deck." }
      ]
    },
    "QBE Insurance": {
      name: "QBE Insurance",
      type: "Insurance",
      domicile: "AU",
      owner: "Coverage",
      sla: "Quarterly",
      aumAud: 2850000000, // A$2.85bn
      feeBps: 20,
      lastReview: "2025-06-23",
      nextReview: "2025-09-20",
      benchmark: "Custom LDI Composite",
      strategies: ["LDI / Liability-Aware Fixed Income"],
      contacts: [
        { name: "Priya Nair", role: "ALM Lead", email: "priya.nair@qbe.com", phone: "+61 2 9999 4401" },
        { name: "Gavin Wood", role: "Legal Counsel", email: "gavin.wood@qbe.com", phone: "+61 2 9999 4402" }
      ],
      meetings: [
        { when: "2025-08-18T01:00:00Z", topic: "LDI Constraint Review", attendees: ["Coverage", "Legal", "QBE"] }
      ],
      pipeline: [{ stage: "Legal Review", due: "2025-08-12" }],
      holdingsTop10: [
        { name: "AU Govt Bond 2033", weight: 7.9 },
        { name: "AU Govt Bond 2031", weight: 7.4 },
        { name: "NSW TCorp 2030", weight: 6.2 },
        { name: "QLD Treasury 2029", weight: 5.9 },
        { name: "Westpac 2028 FRN", weight: 4.7 },
        { name: "CBA 2029 FRN", weight: 4.5 },
        { name: "NAB 2030 FRN", weight: 4.1 },
        { name: "Telstra 2029", weight: 3.2 },
        { name: "Transurban 2031", weight: 3.0 },
        { name: "Cash", weight: 7.0 }
      ],
      perfSpark: [ -4, -3, -2, 0, 1, 2, 1, 2, 3, 4, 5, 6 ],
      sectorWeights: [
        { sector: "Sov/State", weight: 45.1 },
        { sector: "Financials", weight: 24.3 },
        { sector: "Corp (ex-Fin)", weight: 16.0 },
        { sector: "Infra", weight: 7.6 },
        { sector: "Cash", weight: 7.0 }
      ],
      docs: [
        { id: "DOC-QBE-001", name: "LDI-Spec-v3.pdf", type: "PDF", size: "540 KB", uploadedAt: "2025-07-02T03:00:00Z" }
      ],
      notes: [
        { id: "N-QBE-1", ts: "2025-07-22T02:30:00Z", user: "rfp.apac@jpmorgan.com", text: "Fee schedule awaiting final legal sign-off." }
      ]
    }
  }
};

// Helpers
const listSummary = () =>
  Object.values(DB.clients).map(c => ({
    name: c.name,
    type: c.type,
    owner: c.owner,
    sla: c.sla,
    aumAud: c.aumAud,
    feeBps: c.feeBps,
    lastReview: c.lastReview,
    nextReview: c.nextReview,
    strategies: c.strategies
  }));

// Routes
router.get("/", requireAuth, (_req, res) => res.json(listSummary()));

router.get("/:name", requireAuth, (req, res) => {
  const key = Object.keys(DB.clients).find(k => k.toLowerCase() === req.params.name.toLowerCase());
  if (!key) return res.status(404).json({ error: "Client not found" });
  res.json(DB.clients[key]);
});

router.post("/:name/notes", requireAuth, (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: "Missing note text" });
  const key = Object.keys(DB.clients).find(k => k.toLowerCase() === req.params.name.toLowerCase());
  if (!key) return res.status(404).json({ error: "Client not found" });
  const id = `N-${key.slice(0,3).toUpperCase()}-${Date.now()}`;
  const ev = { id, ts: new Date().toISOString(), user: req.user.sub, text: String(text).slice(0, 2000) };
  DB.clients[key].notes.unshift(ev);
  res.status(201).json(ev);
});

router.post("/:name/docs", requireAuth, (req, res) => {
  const { name, type = "PDF", size = "0 KB" } = req.body || {};
  if (!name) return res.status(400).json({ error: "Missing document name" });
  const key = Object.keys(DB.clients).find(k => k.toLowerCase() === req.params.name.toLowerCase());
  if (!key) return res.status(404).json({ error: "Client not found" });
  const doc = { id: `DOC-${key.slice(0,3).toUpperCase()}-${Date.now()}`, name, type, size, uploadedAt: new Date().toISOString() };
  DB.clients[key].docs.unshift(doc);
  res.status(201).json(doc);
});

export default router;
