import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const reports = [
  { label: "Performance – Aus Core Bond (1Y/3Y/5Y)", code: "PERF-ACB" },
  { label: "Attribution – Australian Equity Core", code: "ATTR-AEC" },
  { label: "Risk – VaR & Tracking Error by Fund", code: "RISK-VaR-TE" },
  { label: "Client SLA – Monthly", code: "SLA-MONTHLY" },
  { label: "Compliance – Attestations Due", code: "COMP-QTR" },
  { label: "Portfolio Risk – Australian Equity Core", code: "RISK-PORTFOLIO" }
];

router.get("/", requireAuth, (_req, res) => res.json(reports));

router.get("/:code", requireAuth, (req, res) => {
  const r = reports.find((x) => x.code.toLowerCase() === req.params.code.toLowerCase());
  if (!r) return res.status(404).json({ error: "Report not found" });

  // NEW: Portfolio Risk detailed payload
  if (r.code === "RISK-PORTFOLIO") {
    return res.json({
      code: r.code,
      label: r.label,
      asOf: new Date().toISOString(),
      portfolio: {
        name: "Australian Equity Core",
        benchmark: "S&P/ASX 200 (TR)",
        aumAud: 3250000000
      },
      metrics: {
        trackingErrorPct: 2.1,
        beta: 1.02,
        var95_oneDayPct: 1.8,
        var95_tenDayPct: 5.7,
        infoRatio: 0.45,
        activeSharePct: 62
      },
      sectorExposures: [
        { sector: "Financials", portWtPct: 28.3, benchWtPct: 25.2, activePct: 3.1 },
        { sector: "Materials",  portWtPct: 23.7, benchWtPct: 24.5, activePct: -0.8 },
        { sector: "Health Care", portWtPct: 10.9, benchWtPct: 11.2, activePct: -0.3 },
        { sector: "Industrials", portWtPct: 9.4, benchWtPct: 8.1, activePct: 1.3 },
        { sector: "Consumer Discretionary", portWtPct: 7.5, benchWtPct: 6.3, activePct: 1.2 },
        { sector: "Communication Services", portWtPct: 6.1, benchWtPct: 6.8, activePct: -0.7 },
        { sector: "Energy", portWtPct: 5.2, benchWtPct: 5.0, activePct: 0.2 },
        { sector: "Real Estate", portWtPct: 4.1, benchWtPct: 4.8, activePct: -0.7 },
        { sector: "Utilities", portWtPct: 2.8, benchWtPct: 2.6, activePct: 0.2 },
        { sector: "Consumer Staples", portWtPct: 2.0, benchWtPct: 3.5, activePct: -1.5 }
      ],
      factorExposures: [
        { factor: "Value",     exposure: 0.15 },
        { factor: "Size",      exposure: -0.20 },
        { factor: "Momentum",  exposure: 0.10 },
        { factor: "Quality",   exposure: 0.05 },
        { factor: "Low Vol",   exposure: -0.12 }
      ],
      topContributorsBps: [
        { name: "BHP Group Ltd", contribBps: 18 },
        { name: "CSL Ltd",       contribBps: 12 },
        { name: "NAB",           contribBps: 9 },
        { name: "Afterpay Ltd",  contribBps: -7 },
        { name: "Qantas Airways",contribBps: -5 }
      ],
      scenarios: [
        { name: "ASX -5%",           shock: "Benchmark -5%", pnlBps: -180 },
        { name: "AUD -10% vs USD",   shock: "FX shock",       pnlBps: 35 },
        { name: "Rates +100 bps",    shock: "Parallel shift", pnlBps: -22 }
      ]
    });
  }

  res.json({
    ...r,
    generatedAt: new Date().toISOString(),
    summary: "Mock report payload for demo purposes.",
    dataPoints: [
      { key: "1Y Excess Return (bps)", value: 62 },
      { key: "3Y Excess (ann., bps)", value: 48 },
      { key: "Tracking Error (%)", value: 2.1 }
    ]
  });
});

export default router;

