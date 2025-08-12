
// routes/mandates.js
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  getMandates,
  findMandateById,
  createMandate,
  updateMandate,
  deleteMandate,
  getBreaches,
  getBreachesForMandate,
  updateBreachStatus,
  addBreach
} from "../lib/mandatesStore.js";

const router = Router();

// LIST (lightweight rows)
router.get("/", requireAuth, (_req, res) => {
  res.json(getMandates());
});

// CREATE
router.post("/", requireAuth, (req, res) => {
  try {
    const m = createMandate(req.body || {});
    res.status(201).json(m);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DETAIL
router.get("/:id", requireAuth, (req, res) => {
  const m = findMandateById(req.params.id);
  if (!m) return res.status(404).json({ error: "Mandate not found" });
  res.json(m);
});

// UPDATE (full replace/patch hybrid)
router.put("/:id", requireAuth, (req, res) => {
  try {
    const m = updateMandate(req.params.id, req.body || {});
    res.json(m);
  } catch (e) {
    const code = e.message.includes("not found") ? 404 : 400;
    res.status(code).json({ error: e.message });
  }
});

// DELETE (optional)
router.delete("/:id", requireAuth, (req, res) => {
  const ok = deleteMandate(req.params.id);
  if (!ok) return res.status(404).json({ error: "Mandate not found" });
  res.json({ ok: true });
});

// FETCH-ONLY breaches for a mandate (bonus)
router.get("/:id/breaches", requireAuth, (req, res) => {
  try {
    const list = getBreachesForMandate(req.params.id);
    res.json({ breaches: list });
  } catch (e) {
    const code = e.message.includes("not found") ? 404 : 400;
    res.status(code).json({ error: e.message });
  }
});

// Add a breach to a mandate (optional)
router.post("/:id/breaches", requireAuth, (req, res) => {
  try {
    const b = addBreach(req.params.id, req.body || {});
    res.status(201).json(b);
  } catch (e) {
    const code = e.message.includes("not found") ? 404 : 400;
    res.status(code).json({ error: e.message });
  }
});

// PATCH breach (ack/resolve/note)
router.patch("/:id/breaches/:breachId", requireAuth, (req, res) => {
  try {
    const out = updateBreachStatus(req.params.id, req.params.breachId, req.body || {});
    res.json(out);
  } catch (e) {
    const code = e.message.includes("not found") ? 404 : 400;
    res.status(code).json({ error: e.message });
  }
});

// OPEN breaches (already used by dashboard)
router.get("/breaches/open", requireAuth, (_req, res) => {
  res.json(getBreaches({ status: "Open" }));
});

// All breaches (flat list)
router.get("/breaches", requireAuth, (req, res) => {
  const status = req.query.status || null;
  res.json(getBreaches({ status }));
});

export default router;
