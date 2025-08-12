
// routes/admin.js
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { readJson, writeJson } from "../lib/store.js";

const router = Router();

// Require "Admin" role
function requireAdminRole(req, res, next) {
  try {
    // req.user.sub is set by requireAuth (email/username)
    const email = (req.user?.sub || "").toLowerCase();
    if (!email) return res.status(401).json({ error: "Unauthenticated" });

    // read from users.json to get current role
    const users = readJson("users.json");
    const me = users.find(u => (u.email || "").toLowerCase() === email);
    if (!me || String(me.role || "Analyst") !== "Admin") {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    next();
  } catch (e) {
    return res.status(500).json({ error: "Role check failed" });
  }
}

// Apply to all admin endpoints
router.use(requireAuth, requireAdminRole);

// --- simple "uptime since boot" ---
const BOOTED_AT = Date.now();

// --- in-memory feature flags & audit log (resets on restart) ---
const FLAGS = {
  liveActivity: true,
  demoData: true,
  autoRefresh: true,
};

const AUDIT = [
  { id: "A-0001", ts: new Date().toISOString(), actor: "system", action: "boot", detail: "Server started" },
];

// --- helpers ---
function redactUsers(list = []) {
  return list.map(u => {
    const { password, ...safe } = u;
    return safe;
  });
}
function log(actor, action, detail) {
  AUDIT.unshift({
    id: "A-" + String(1000 + AUDIT.length),
    ts: new Date().toISOString(),
    actor,
    action,
    detail,
  });
}

// --- health ---
router.get("/health", requireAuth, (_req, res) => {
  res.json({
    status: "ok",
    bootedAt: new Date(BOOTED_AT).toISOString(),
    uptimeSec: Math.floor((Date.now() - BOOTED_AT) / 1000),
    version: "1.0.0-admin",
    node: process.version,
    env: {
      NODE_ENV: process.env.NODE_ENV || "development",
      PORT: process.env.PORT || 4000,
    },
    lastUpdated: new Date().toISOString(),
  });
});

// --- users (read + simple role update) ---
router.get("/users", requireAuth, (_req, res) => {
  const users = readJson("users.json");
  res.json({ users: redactUsers(users), lastUpdated: new Date().toISOString() });
});

router.put("/users/:email/role", requireAuth, (req, res) => {
  const email = decodeURIComponent(req.params.email || "").toLowerCase();
  const { role } = req.body || {};
  if (!role) return res.status(400).json({ error: "Missing 'role' in body" });

  const users = readJson("users.json");
  const idx = users.findIndex(u => (u.email || "").toLowerCase() === email);
  if (idx === -1) return res.status(404).json({ error: "User not found" });

  users[idx].role = String(role);
  writeJson("users.json", users);

  log(req.user?.sub || "unknown", "user.role.update", `${email} -> ${role}`);
  const { password, ...safe } = users[idx];
  res.json({ user: safe, ok: true });
});

// --- feature flags ---
router.get("/flags", requireAuth, (_req, res) => {
  res.json({ flags: FLAGS, lastUpdated: new Date().toISOString() });
});

router.put("/flags", requireAuth, (req, res) => {
  const updates = req.body || {};
  Object.keys(updates).forEach(k => {
    if (Object.prototype.hasOwnProperty.call(FLAGS, k)) {
      FLAGS[k] = Boolean(updates[k]);
      log(req.user?.sub || "unknown", "flag.update", `${k}=${FLAGS[k]}`);
    }
  });
  res.json({ flags: FLAGS });
});

// --- audit log ---
router.get("/audit", requireAuth, (_req, res) => {
  res.json({ audit: AUDIT.slice(0, 200), lastUpdated: new Date().toISOString() });
});

export default router;
