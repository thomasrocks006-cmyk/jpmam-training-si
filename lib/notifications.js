
// lib/notifications.js
// Persisted notifications per user (in data/notifications.json)
// Shape: [{ id, to, type, title, body, ref, ts, read: false }]

import { readJson, writeJson } from "./store.js";

const FILE = "notifications.json";

function load() {
  try {
    const arr = readJson(FILE);
    return Array.isArray(arr) ? arr : [];
  } catch {
    writeJson(FILE, []);
    return [];
  }
}
function save(list) { writeJson(FILE, list); }

function nextId(list) {
  const n = (list[0]?.idNum || 1000) + 1;
  return { id: `N-${n}`, idNum: n };
}

export function addNotification({ to, type, title, body, ref }) {
  const list = load();
  const { id, idNum } = nextId(list);
  const rec = {
    id, idNum,
    to: String(to).toLowerCase(),
    type, title: String(title || "").slice(0, 160),
    body: String(body || "").slice(0, 2000),
    ref: ref || null,
    ts: new Date().toISOString(),
    read: false
  };
  list.unshift(rec);
  save(list);
  return rec;
}

export function listForUser(email, { limit = 50 } = {}) {
  const e = String(email || "").toLowerCase();
  return load().filter(n => n.to === e).slice(0, limit);
}

export function markRead(email, id) {
  const e = String(email || "").toLowerCase();
  const list = load();
  const idx = list.findIndex(n => n.to === e && n.id === id);
  if (idx === -1) return false;
  list[idx].read = true;
  save(list);
  return true;
}

export function markAllRead(email) {
  const e = String(email || "").toLowerCase();
  const list = load();
  let changed = 0;
  for (const n of list) {
    if (n.to === e && !n.read) { n.read = true; changed++; }
  }
  save(list);
  return changed;
}

export function unreadCount(email) {
  const e = String(email || "").toLowerCase();
  return load().filter(n => n.to === e && !n.read).length;
}
