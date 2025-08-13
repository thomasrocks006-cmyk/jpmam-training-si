
import { Router } from "express";
import { readJson } from "../lib/store.js";
import { signToken, requireAuth } from "../lib/auth.js";

const router = Router();

function normalizeSid(s) {
  return String(s || "").trim().toLowerCase();
}

function maskEmail(email = "") {
  const [user, domain] = String(email).split("@");
  if (!domain) return email;
  const u = user.length <= 2 ? user[0] + "*" : user[0] + "*".repeat(Math.max(1, user.length - 2)) + user.slice(-1);
  return `${u}@${domain}`;
}

function matchUserBySid(users, sidInput) {
  const sid = normalizeSid(sidInput);
  return users.find((u) => {
    const sidField = normalizeSid(u.sid || "");
    const email = normalizeSid(u.email || "");
    const username = normalizeSid(u.username || "");
    const emailLocal = email.split("@")[0];
    return (
      sidField === sid ||
      email === sid ||
      emailLocal === sid ||
      username === sid
    );
  });
}

// POST /api/auth/identify  { sid }
router.post("/identify", (req, res) => {
  const { sid } = req.body || {};
  if (!sid) return res.status(400).json({ error: "SID is required." });

  const users = readJson("users.json");
  const user = matchUserBySid(users, sid);
  if (!user) return res.status(404).json({ error: "SID not found." });

  return res.json({
    ok: true,
    sid: user.sid || user.username || (user.email ? user.email.split("@")[0] : sid),
    displayName: user.name || user.fullName || null,
    hint: user.email ? maskEmail(user.email) : null,
  });
});

// POST /api/auth/login  { sid, password } or legacy { email, password }
router.post("/login", (req, res) => {
  const { sid, email, password } = req.body || {};
  
  // Support both new SID flow and legacy email flow
  const identifier = sid || email;
  if (!identifier || !password) {
    return res.status(400).json({ error: "SID/email and password are required." });
  }

  const users = readJson("users.json");
  let found;
  
  if (sid) {
    // New SID-based lookup
    found = matchUserBySid(users, sid);
  } else {
    // Legacy email-based lookup
    found = users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase(),
    );
  }
  
  if (!found || found.password !== password) {
    return res.status(401).json({ error: "Invalid credentials." });
  }
  
  const token = signToken({
    sub: found.email,
    name: found.name,
    role: found.role,
  });
  
  res.json({
    token,
    user: {
      email: found.email,
      name: found.name,
      role: found.role,
      department: found.department,
    },
  });
});

router.get("/me", requireAuth, (req, res) => {
  const users = readJson("users.json");
  const me = users.find(
    (u) => u.email.toLowerCase() === req.user.sub.toLowerCase(),
  );
  if (!me) return res.status(404).json({ error: "User not found" });
  const { password, ...safe } = me;
  res.json(safe);
});

export default router;
