
// routes/notifications.js
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { listForUser, markRead, markAllRead, unreadCount } from "../lib/notifications.js";

const router = Router();

// List + unread count
router.get("/", requireAuth, (req, res) => {
  const me = req.user?.sub;
  const list = listForUser(me, { limit: 100 });
  const unread = unreadCount(me);
  res.json({ notifications: list, unread });
});

// Mark one as read
router.post("/:id/read", requireAuth, (req, res) => {
  const ok = markRead(req.user?.sub, req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// Mark all as read
router.post("/read-all", requireAuth, (req, res) => {
  const changed = markAllRead(req.user?.sub);
  res.json({ ok: true, changed });
});

export default router;
