
// routes/digests.js
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { readJson } from "../lib/store.js";
import { getBreaches } from "../lib/mandatesStore.js";
import { buildDigest, writeDigest, listDigests, getDigest } from "../lib/digests.js";

const router = Router();

// Generate digests for users who opted in (emailDigest !== "none")
// Call manually from UI (no background cron in this mock).
router.post("/run", requireAuth, (req, res) => {
  const mode = String(req.body?.mode || "daily"); // "daily" or "weekly" (no restriction here)
  const users = (() => { try { const u = readJson("users.json"); return Array.isArray(u) ? u : []; } catch { return []; } })();

  // Source data
  const rfps = (() => { try { const x = readJson("rfps.json"); return Array.isArray(x) ? x : []; } catch { return []; } })();
  const approvals = (() => { try { const x = readJson("approvals.json"); return Array.isArray(x) ? x : []; } catch { return []; } })();
  const breaches = getBreaches({ status: "Open" });

  const out = [];
  for (const u of users) {
    const dig = (u.preferences?.emailDigest || "none");
    if (dig === "none") continue;
    if (mode === "daily" && dig !== "daily" && dig !== "weekly") continue;
    // (Optionally, only send weekly on Mondays; omitted for simplicity)

    const { subject, bodyHtml } = buildDigest({ user: u, rfps, approvals, breaches });
    out.push(writeDigest({ to: u.email, subject, bodyHtml, items: { rfpsCount: rfps.length, approvalsCount: approvals.length, breachesCount: breaches.length } }));
  }
  res.json({ ok: true, generated: out.length, digests: out.map(d => d.id) });
});

// List my digests
router.get("/", requireAuth, (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const mine = listDigests({ to: req.user?.sub, limit });
  res.json({ digests: mine });
});

// Get one by id (must belong to me)
router.get("/:id", requireAuth, (req, res) => {
  const d = getDigest(req.params.id);
  if (!d || d.to !== String(req.user?.sub).toLowerCase()) return res.status(404).json({ error: "Not found" });
  res.json(d);
});

export default router;
