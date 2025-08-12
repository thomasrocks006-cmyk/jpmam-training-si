import { Router } from "express";
import { readJson } from "../lib/store.js";
import { signToken, requireAuth } from "../lib/auth.js";

const router = Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const users = readJson("users.json");
  const found = users.find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase(),
  );
  if (!found || found.password !== password) {
    return res.status(401).json({ error: "Invalid username or password" });
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
