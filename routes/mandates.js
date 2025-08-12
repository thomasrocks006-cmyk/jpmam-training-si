import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { getMandates, findMandateById, getBreaches } from "../lib/mandatesStore.js";

const router = Router();

// List all mandates
router.get("/", requireAuth, (_req, res) => {
  res.json(getMandates());
});

// Breaches (put BEFORE /:id so it isn't shadowed)
router.get("/breaches", requireAuth, (req, res) => {
  const status = req.query.status || null; // e.g., ?status=Open
  res.json(getBreaches({ status }));
});

router.get("/breaches/open", requireAuth, (_req, res) => {
  res.json(getBreaches({ status: "Open" }));
});

// Mandate detail
router.get("/:id", requireAuth, (req, res) => {
  const mandate = findMandateById(req.params.id);
  if (!mandate) return res.status(404).json({ error: "Mandate not found" });
  res.json(mandate);
});

export default router;