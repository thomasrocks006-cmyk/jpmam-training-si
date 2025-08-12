
// lib/notifier.js
// Listens to dashboard events and writes notifications for users who opted in.

import { bus } from "./events.js";
import { readJson } from "./store.js";
import { addNotification } from "./notifications.js";

function getUsers() {
  try {
    const u = readJson("users.json");
    return Array.isArray(u) ? u : [];
  } catch { return []; }
}

function shouldNotify(user, key) {
  // key in ["approvals","breaches","rfpStages"]
  const prefs = user?.preferences || {};
  const e = prefs.emailAlerts || {};
  return Boolean(e[key]);
}

// Map events -> notification template
function handleEvent(evt) {
  const { type, payload = {} } = evt || {};
  const users = getUsers();

  if (type === "rfp.stage") {
    for (const u of users) {
      if (!shouldNotify(u, "rfpStages")) continue;
      addNotification({
        to: u.email,
        type: "RFP",
        title: `RFP stage → ${payload.stage}`,
        body: `RFP ${payload.id} moved to ${payload.stage}.`,
        ref: payload.id
      });
    }
  }

  if (type === "breach.update" || type === "breach.create") {
    for (const u of users) {
      if (!shouldNotify(u, "breaches")) continue;
      const title = type === "breach.create" ? "New Mandate Breach" : "Breach Updated";
      addNotification({
        to: u.email,
        type: "Breach",
        title,
        body: `Mandate ${payload.mandateId} – ${payload.breachId} ${payload.status ? "→ "+payload.status : ""}`,
        ref: payload.mandateId
      });
    }
  }

  // (Optional) approvals events—wire these once you emit them from approvals routes:
  if (type === "approval.created" || type === "approval.assigned") {
    for (const u of users) {
      if (!shouldNotify(u, "approvals")) continue;
      addNotification({
        to: u.email,
        type: "Approval",
        title: type === "approval.created" ? "New Approval" : "Approval Assigned",
        body: `Approval ${payload.id || ""} ${payload.summary || ""}`,
        ref: payload.id
      });
    }
  }
}

export function initNotifier() {
  bus.on("dashboard:event", handleEvent);
}
