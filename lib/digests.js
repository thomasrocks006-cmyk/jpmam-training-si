
// lib/digests.js
import { readJson, writeJson } from "./store.js";
import { getBreaches } from "./mandatesStore.js";

const FILE = "digests.json";

function load() {
  try { const x = readJson(FILE); return Array.isArray(x) ? x : []; }
  catch { writeJson(FILE, []); return []; }
}
function save(list){ writeJson(FILE, list); }
function nextId(list){ return "D-" + String(1000 + list.length); }

function h(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function section(title, rowsHtml){
  return `
    <tr><td style="font:600 16px system-ui,Arial;margin:0 0 6px;">${h(title)}</td></tr>
    <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;">
      ${rowsHtml || '<div style="color:#6b7280">No items</div>'}
    </td></tr>
    <tr><td style="height:12px;"></td></tr>
  `;
}

export function buildDigest({ user, rfps = [], approvals = [], breaches = [] }) {
  const dueSoon = rfps.filter(r => r.due)
                      .sort((a,b)=> String(a.due).localeCompare(String(b.due)))
                      .slice(0, 8);
  const pendingApprovals = approvals.filter(a => a.status === "Pending").slice(0, 8);
  const openBreaches = breaches.filter(b => b.status === "Open").slice(0, 8);

  const s1 = dueSoon.map(r =>
    `<div><b>${h(r.id)}</b> — ${h(r.title)} <span style="color:#6b7280">(${h(r.client)})</span> • Due ${h(r.due)}</div>`
  ).join("");

  const s2 = pendingApprovals.map(a =>
    `<div><b>${h(a.id || a.ref || "Approval")}</b> — ${h(a.summary || a.text || "Pending approval")}</div>`
  ).join("");

  const s3 = openBreaches.map(b =>
    `<div><b>${h(b.mandateId)}</b> — ${h(b.type)} • <span style="color:${b.severity==='Critical'?'#b91c1c':'#92400e'}">${h(b.severity)}</span></div>`
  ).join("");

  const bodyHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;">
      <tr><td style="font:600 18px system-ui,Arial">Daily Digest</td></tr>
      <tr><td style="color:#6b7280;font:14px system-ui,Arial">Hi ${h(user.name || user.email)}, here's your snapshot.</td></tr>
      <tr><td style="height:10px;"></td></tr>
      ${section("RFPs due soon (next 14 days)", s1)}
      ${section("Pending approvals", s2)}
      ${section("Open mandate breaches", s3)}
      <tr><td style="color:#9ca3af;font:12px system-ui,Arial">Generated ${(new Date()).toLocaleString()}</td></tr>
    </table>
  `;

  return { subject: "JPMAM Workspace — Daily Digest", bodyHtml };
}

export function writeDigest({ to, subject, bodyHtml, items = {} }) {
  const list = load();
  const id = nextId(list);
  const rec = {
    id,
    to: String(to).toLowerCase(),
    ts: new Date().toISOString(),
    subject, bodyHtml,
    items
  };
  list.unshift(rec);
  save(list);
  return rec;
}

export function listDigests({ to, limit = 20 }) {
  const list = load();
  const e = String(to || "").toLowerCase();
  return list.filter(d => !e || d.to === e).slice(0, limit);
}

export function getDigest(id) {
  return load().find(d => d.id === id) || null;
}
