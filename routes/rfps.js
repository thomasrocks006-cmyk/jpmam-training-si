
// routes/rfps.js
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { readJson, writeJson } from "../lib/store.js";
import { auditLog } from "../lib/audit.js";

const router = Router();
const FILE = "rfps.json";

// --- helpers ---
function loadRfps() {
  try {
    const list = readJson(FILE);
    if (Array.isArray(list)) return list;
  } catch {}
  // seed if missing
  const seed = [
    {
      id: "RFP-SS-24Q3",
      client: "SunSuper",
      title: "Australian Equity Core – Renew",
      stage: "Draft",
      owner: "You",
      due: new Date(Date.now() + 4*24*60*60*1000).toISOString().slice(0,10),
      lastUpdated: new Date().toISOString(),
      notes: [{ ts: new Date().toISOString(), user: "You", text: "Initial outline complete." }],
      checklist: [
        { key: "Team bios updated", done: true },
        { key: "Track record appendix", done: true },
        { key: "Fee schedule review", done: false }
      ],
      attachments: [
        { name: "RFP-Questionnaire.docx", type: "DOCX", size: "312 KB", uploadedAt: new Date().toISOString() }
      ]
    },
    {
      id: "RFP-QBE-ALPHA",
      client: "QBE Insurance",
      title: "Alpha Overlay Proposal",
      stage: "Internal Review",
      owner: "Coverage",
      due: new Date(Date.now() + 10*24*60*60*1000).toISOString().slice(0,10),
      lastUpdated: new Date().toISOString(),
      notes: [],
      checklist: [
        { key: "Risk backtest section", done: false },
        { key: "Compliance statement", done: false }
      ],
      attachments: []
    }
  ];
  writeJson(FILE, seed);
  return seed;
}

function saveRfps(list) {
  writeJson(FILE, list);
}

function touch(r) {
  r.lastUpdated = new Date().toISOString();
}

// --- routes ---

// List with simple filters: ?stage=Draft&client=SunSuper&q=alpha
router.get("/", requireAuth, (req, res) => {
  const { stage, client, q } = req.query || {};
  const rfps = loadRfps();
  let out = [...rfps];
  if (stage)  out = out.filter(r => (r.stage || "").toLowerCase() === String(stage).toLowerCase());
  if (client) out = out.filter(r => (r.client || "").toLowerCase().includes(String(client).toLowerCase()));
  if (q)      out = out.filter(r => (r.id + " " + r.title).toLowerCase().includes(String(q).toLowerCase()));
  out.sort((a,b) => (a.due || "").localeCompare(b.due || ""));
  res.json({ rfps: out, total: out.length });
});

router.get("/:id", requireAuth, (req, res) => {
  const rfps = loadRfps();
  const r = rfps.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "RFP not found" });
  res.json(r);
});

router.post("/", requireAuth, (req, res) => {
  const rfps = loadRfps();
  const { id, client, title, owner = "You", due = null } = req.body || {};
  if (!id || !client || !title) return res.status(400).json({ error: "Missing id, client, or title" });
  if (rfps.find(x => x.id === id)) return res.status(409).json({ error: "RFP id exists" });
  const r = { id, client, title, stage: "Draft", owner, due, lastUpdated: new Date().toISOString(), notes: [], checklist: [], attachments: [] };
  rfps.unshift(r);
  saveRfps(rfps);
  auditLog(req.user?.sub || "user", "rfp.create", `${id} – ${client} – ${title}`);
  res.status(201).json(r);
});

router.put("/:id", requireAuth, (req, res) => {
  const rfps = loadRfps();
  const idx = rfps.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "RFP not found" });
  rfps[idx] = { ...rfps[idx], ...req.body };
  touch(rfps[idx]);
  saveRfps(rfps);
  auditLog(req.user?.sub || "user", "rfp.update", req.params.id);
  res.json(rfps[idx]);
});

router.put("/:id/stage", requireAuth, (req, res) => {
  const rfps = loadRfps();
  const r = rfps.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "RFP not found" });
  const stage = String(req.body?.stage || "");
  const allowed = ["Draft","Internal Review","Client Review","Submitted","Won","Lost"];
  if (!allowed.includes(stage)) return res.status(400).json({ error: "Invalid stage" });
  r.stage = stage;
  touch(r);
  saveRfps(rfps);
  auditLog(req.user?.sub || "user", "rfp.stage", `${r.id} -> ${stage}`);
  res.json(r);
});

router.post("/:id/notes", requireAuth, (req, res) => {
  const rfps = loadRfps();
  const r = rfps.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "RFP not found" });
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Missing note text" });
  const note = { ts: new Date().toISOString(), user: req.user?.sub || "user", text: text.slice(0, 2000) };
  r.notes.unshift(note);
  touch(r);
  saveRfps(rfps);
  auditLog(req.user?.sub || "user", "rfp.note", `${r.id} (${text.slice(0,60)}...)`);
  res.status(201).json(note);
});

// NEW: toggle checklist items
router.put("/:id/checklist", requireAuth, (req, res) => {
  const rfps = loadRfps();
  const r = rfps.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "RFP not found" });
  const { key, done } = req.body || {};
  if (!key || typeof done !== "boolean") return res.status(400).json({ error: "Missing key or done" });
  const idx = (r.checklist || []).findIndex(c => c.key === key);
  if (idx === -1) r.checklist.push({ key, done });
  else r.checklist[idx].done = done;
  touch(r);
  saveRfps(rfps);
  auditLog(req.user?.sub || "user", "rfp.checklist", `${r.id}: ${key}=${done}`);
  res.json({ ok: true, checklist: r.checklist });
});

// NEW: add attachment metadata (mock upload)
router.post("/:id/attachments", requireAuth, (req, res) => {
  const rfps = loadRfps();
  const r = rfps.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "RFP not found" });
  const { name, type = "PDF", size = "0 KB" } = req.body || {};
  if (!name) return res.status(400).json({ error: "Missing attachment name" });
  const a = { name, type, size, uploadedAt: new Date().toISOString() };
  r.attachments.push(a);
  touch(r);
  saveRfps(rfps);
  auditLog(req.user?.sub || "user", "rfp.attachment", `${r.id}: ${name}`);
  res.status(201).json(a);
});

export default router;
