
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

/**
 * In-memory demo store (resets on restart).
 * Two mandates tied to SunSuper & QBE Insurance.
 */
const DB = {
  mandates: [
    {
      id: "M-AUS-EQ-SS-001",
      client: "SunSuper",
      strategy: "Australian Equity Core",
      objective: "Outperform S&P/ASX 200 (TR) by 100–150 bps p.a. over rolling 3 years.",
      benchmark: "S&P/ASX 200 (TR)",
      baseCurrency: "AUD",
      inception: "2022-02-01",
      aumAud: 4200000000,
      feeBps: 28,
      guidelines: [
        "Max single stock weight: 10%",
        "Tracking error: 1.5% – 3.0%",
        "Sector active weight: ±8%",
        "Cash range: 0% – 10%"
      ],
      sla: [
        { id: "SLA-SS-01", name: "Monthly SLA report", freq: "Monthly", nextDue: "2025-08-15" },
        { id: "SLA-SS-02", name: "Quarterly compliance", freq: "Quarterly", nextDue: "2025-09-30" }
      ],
      breaches: []
    },
    {
      id: "M-LDI-FI-QB-002",
      client: "QBE Insurance",
      strategy: "LDI / Liability-Aware Fixed Income",
      objective: "Match liability duration while achieving CPI+150 bps returns.",
      benchmark: "AusBond Composite + Liability proxy",
      baseCurrency: "AUD",
      inception: "2021-11-15",
      aumAud: 1800000000,
      feeBps: 35,
      guidelines: [
        "Duration match within ±0.5 years",
        "Credit quality: AAA–A minimum 80%",
        "Interest rate hedge ratio: 85%–95%",
        "Cash: 0% – 5%"
      ],
      sla: [
        { id: "SLA-QB-01", name: "Monthly performance", freq: "Monthly", nextDue: "2025-08-20" },
        { id: "SLA-QB-02", name: "Quarterly risk report", freq: "Quarterly", nextDue: "2025-10-15" }
      ],
      breaches: [
        { date: "2025-07-22", type: "Duration", details: "Duration drift +0.6 years (limit: ±0.5)", resolved: true }
      ]
    }
  ]
};

router.get("/", requireAuth, (req, res) => {
  res.json(DB.mandates);
});

router.get("/:id", requireAuth, (req, res) => {
  const mandate = DB.mandates.find(m => m.id === req.params.id);
  if (!mandate) return res.status(404).json({ error: "Mandate not found" });
  res.json(mandate);
});

export default router;
