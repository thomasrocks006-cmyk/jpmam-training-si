
// lib/audit.js
// Simple in-memory audit log with write-through option later if you want.
// Used by admin + rfps + (future) mandates, approvals, etc.

const AUDIT = [
  { id: "A-0001", ts: new Date().toISOString(), actor: "system", action: "boot", detail: "Server started" },
];

function nextId() {
  return "A-" + String(1000 + AUDIT.length);
}

export function auditLog(actor, action, detail) {
  AUDIT.unshift({
    id: nextId(),
    ts: new Date().toISOString(),
    actor: actor || "unknown",
    action,
    detail,
  });
  return AUDIT[0];
}

export function auditList(limit = 200) {
  return AUDIT.slice(0, limit);
}
