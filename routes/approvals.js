import { Router } from "express";
import { nanoid } from "nanoid";
import { readJson, writeJson } from "../lib/store.js";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, (_req, res) => {
  res.json(readJson("approvals.json"));
});

router.post("/:id/approve", requireAuth, (req, res) => {
  const id = req.params.id;
  const list = readJson("approvals.json");
  const item = list.find((x) => x.id === id);
  if (!item) return res.status(404).json({ error: "Not found" });

  item.status = "Approved";
  item.audit = item.audit || [];
  item.audit.push({
    ts: new Date().toISOString(),
    user: req.user.sub,
    action: "Approved",
    meta: "Approved via API",
  });

  writeJson("approvals.json", list);
  res.json(item);
});

router.post("/:id/audit", requireAuth, (req, res) => {
  const id = req.params.id;
  const { action = "Note", meta = "" } = req.body || {};
  const list = readJson("approvals.json");
  const item = list.find((x) => x.id === id);
  if (!item) return res.status(404).json({ error: "Not found" });
  item.audit = item.audit || [];
  item.audit.push({
    ts: new Date().toISOString(),
    user: req.user.sub,
    action,
    meta,
  });
  writeJson("approvals.json", list);
  res.json(item.audit[item.audit.length - 1]);
});

router.post("/", requireAuth, (req, res) => {
  const body = req.body || {};
  const list = readJson("approvals.json");
  const id = body.id || `AM-${nanoid(5).toUpperCase()}`;
  const item = {
    id,
    requester: body.requester || "Unknown",
    dept: body.dept || "Institutional",
    amount: Number(body.amount || 0),
    status: "Pending",
    submitted: new Date().toISOString().slice(0, 10),
    docs: body.docs || [],
    audit: [
      {
        ts: new Date().toISOString(),
        user: req.user.sub,
        action: "Created",
        meta: "Created via API",
      },
    ],
  };
  list.unshift(item);
  writeJson("approvals.json", list);
  res.status(201).json(item);
});

export default router;
