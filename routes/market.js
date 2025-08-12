
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/snapshot", requireAuth, (_req, res) => {
  const snapshot = {
    asx200: { label: "ASX 200", chgPct: -0.34 },
    audusd: { label: "AUD/USD", level: 0.67, chgPct: 0.12 },
    spx:    { label: "S&P 500", chgPct: 0.28 },
    lastUpdated: new Date().toISOString()
  };
  res.json(snapshot);
});

export default router;
