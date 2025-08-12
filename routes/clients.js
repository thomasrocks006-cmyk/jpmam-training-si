import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const clients = [
  { name: "SunSuper", type: "Pension", strategies: ["Australian Equity Core"], owner: "You", sla: "Monthly" },
  { name: "QBE Insurance", type: "Insurance", strategies: ["LDI / Liability-Aware Fixed Income"], owner: "Coverage", sla: "Quarterly" }
];

router.get("/", requireAuth, (_req, res) => res.json(clients));

router.get("/:name", requireAuth, (req, res) => {
  const c = clients.find((x) => x.name.toLowerCase() === req.params.name.toLowerCase());
  if (!c) return res.status(404).json({ error: "Client not found" });
  res.json({
    ...c,
    meetings: [
      { when: "2025-08-14T02:00:00Z", topic: "Q2 Performance Review", attendees: ["Thomas Francis", c.name] }
    ],
    pipeline: [
      { stage: c.name === "SunSuper" ? "RFP Draft" : "Legal Review", due: c.name === "SunSuper" ? "2025-08-14" : "2025-08-12" }
    ]
  });
});

export default router;
