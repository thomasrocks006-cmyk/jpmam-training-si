
// routes/users.js
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { readJson, writeJson } from "../lib/store.js";
import { auditLog } from "../lib/audit.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const FILE = "users.json";

// resolve /public/uploads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadUsers(){
  const users = readJson(FILE);
  return Array.isArray(users) ? users : [];
}
function saveUsers(list){ writeJson(FILE, list); }
function findByEmail(list, email){
  const e = String(email || "").toLowerCase();
  return list.find(u => String(u.email || "").toLowerCase() === e);
}
function safeUser(u){
  if (!u) return null;
  const { password, ...safe } = u;
  return safe;
}

// GET /api/users/me
router.get("/me", requireAuth, (req, res) => {
  const users = loadUsers();
  const me = findByEmail(users, req.user?.sub);
  if (!me) return res.status(404).json({ error: "User not found" });
  return res.json(safeUser(me));
});

// PUT /api/users/me  (update profile fields: name, phone, photo)
router.put("/me", requireAuth, (req, res) => {
  const users = loadUsers();
  const me = findByEmail(users, req.user?.sub);
  if (!me) return res.status(404).json({ error: "User not found" });

  const { name, phone, photo } = req.body || {};
  if (name != null) me.name = String(name).slice(0, 120);
  if (phone != null) me.phone = String(phone).slice(0, 40);
  if (photo != null) me.photo = String(photo); // path to uploaded file

  saveUsers(users);
  auditLog(req.user?.sub || "user", "profile.update", `${me.email}`);
  return res.json(safeUser(me));
});

// PUT /api/users/me/password
router.put("/me/password", requireAuth, (req, res) => {
  const users = loadUsers();
  const me = findByEmail(users, req.user?.sub);
  if (!me) return res.status(404).json({ error: "User not found" });

  const { current, next } = req.body || {};
  if (!current || !next) return res.status(400).json({ error: "Missing current or new password" });
  // NOTE: demo only. In production, verify hash & re-hash. Here we compare plain text to keep mock simple.
  if (String(me.password || "") !== String(current)) return res.status(400).json({ error: "Current password incorrect" });
  if (String(next).length < 8) return res.status(400).json({ error: "Password too short (min 8 chars)" });

  me.password = String(next);
  saveUsers(users);
  auditLog(req.user?.sub || "user", "profile.password", me.email);
  return res.json({ ok: true });
});

// PUT /api/users/me/preferences
router.put("/me/preferences", requireAuth, (req, res) => {
  const users = loadUsers();
  const me = findByEmail(users, req.user?.sub);
  if (!me) return res.status(404).json({ error: "User not found" });

  const prefs = me.preferences || {};
  const incoming = req.body || {}; // { emailAlerts: {...}, liveUpdates: true/false }
  me.preferences = {
    ...prefs,
    ...incoming,
    emailAlerts: { ...(prefs.emailAlerts || {}), ...(incoming.emailAlerts || {}) }
  };

  saveUsers(users);
  auditLog(req.user?.sub || "user", "profile.preferences", me.email);
  return res.json({ ok: true, preferences: me.preferences });
});

// POST /api/users/me/photo  (accepts { dataUrl } base64 PNG/JPEG)
router.post("/me/photo", requireAuth, (req, res) => {
  const users = loadUsers();
  const me = findByEmail(users, req.user?.sub);
  if (!me) return res.status(404).json({ error: "User not found" });

  const dataUrl = String(req.body?.dataUrl || "");
  const m = dataUrl.match(/^data:(image\/png|image\/jpeg);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: "Invalid dataUrl image" });

  const ext = m[1] === "image/png" ? "png" : "jpg";
  const file = `avatar_${(me.email || "user").replace(/[^a-z0-9]/gi, "_")}.${ext}`;
  const dest = path.join(UPLOADS_DIR, file);
  fs.writeFileSync(dest, Buffer.from(m[2], "base64"));
  const publicPath = `/uploads/${file}`;

  me.photo = publicPath;
  saveUsers(users);
  auditLog(req.user?.sub || "user", "profile.photo", me.email);

  return res.json({ ok: true, photo: publicPath });
});

export default router;
