import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const reports = [
  { label: "Performance – Aus Core Bond (1Y/3Y/5Y)", code: "PERF-ACB" },
  { label: "Attribution – Australian Equity Core", code: "ATTR-AEC" },
  { label: "Risk – VaR & Tracking Error by Fund", code: "RISK-VaR-TE" },
  { label: "Client SLA – Monthly", code: "SLA-MONTHLY" },
  { label: "Compliance – Attestations Due", code: "COMP-QTR" }
];

router.get("/", requireAuth, (_req, res) => res.json(reports));

router.get("/:code", requireAuth, (req, res) => {
  const r = reports.find((x) => x.code.toLowerCase() === req.params.code.toLowerCase());
  if (!r) return res.status(404).json({ error: "Report not found" });
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

