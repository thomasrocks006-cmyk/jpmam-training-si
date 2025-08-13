// Minimal front-end using vanilla JS + fetch to the API in this project.
// Branding is mock: "JPMorgan (Training)" / "JPMorgan Asset Management (Training)".
// Added default user EMP-2025-1847 and fixed API client definition
// public/app.js
(() => {
  const API_BASE = window.API_BASE || `${location.origin}/api`;

  function setToken(token) { if (token) localStorage.setItem("token", token); }
  function clearToken() { localStorage.removeItem("token"); }
  function getToken() { return localStorage.getItem("token"); }

  async function apiFetch(path, options = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");

    // Only set JSON content-type when not sending FormData
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const tok = getToken();
    if (tok) headers.set("Authorization", `Bearer ${tok}`);

    const res = await fetch(url, { ...options, headers });
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : await res.text();

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) clearToken();
      const message = (data && (data.message || data.error)) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  const api = {
    base: API_BASE,
    setToken,
    clearToken,
    get: (p, opts) => apiFetch(p, { method: "GET", ...(opts || {}) }),
    post: (p, body, opts) =>
      apiFetch(p, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body || {}), ...(opts || {}) }),
    put: (p, body, opts) =>
      apiFetch(p, { method: "PUT", body: body instanceof FormData ? body : JSON.stringify(body || {}), ...(opts || {}) }),
    patch: (p, body, opts) =>
      apiFetch(p, { method: "PATCH", body: body instanceof FormData ? body : JSON.stringify(body || {}), ...(opts || {}) }),
    del: (p, opts) => apiFetch(p, { method: "DELETE", ...(opts || {}) }),
  };

  // Expose
  window.api = api;
  window.API_BASE = API_BASE;
  window.apiReady = Promise.resolve(api);
})();


// Helper formatting functions
function fmtAUD(n) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(n);
}

// --- Current user helper (cached) ---
let CURRENT_USER = null;
async function fetchMe(){
  if (CURRENT_USER) return CURRENT_USER;
  try {
    // Use the new api object to fetch user data
    CURRENT_USER = await api.get("/auth/me");
  } catch { CURRENT_USER = null; }
  return CURRENT_USER;
}

// === Admin API helpers ===
async function adminGetHealth(){ return await api.get("/admin/health"); }
async function adminGetUsers(){ return await api.get("/admin/users"); }
async function adminSetUserRole(email, role){
  return await api.put(`/admin/users/${encodeURIComponent(email)}/role`, { role });
}
async function adminGetFlags(){ return await api.get("/admin/flags"); }
async function adminSetFlags(partial){
  return await api.put("/admin/flags", partial || {});
}
async function adminGetAudit(){ return await api.get("/admin/audit"); }

// === Notifications API ===
async function notifList(){ return await api.get("/notifications"); }
async function notifRead(id){
  return await api.post(`/notifications/${encodeURIComponent(id)}/read`);
}
async function notifReadAll(){
  return await api.post("/notifications/read-all");
}

// === Digests API ===
async function digestRun(mode="daily"){
  return await api.post("/digests/run", { mode });
}
async function digestList(limit=5){ return await api.get(`/digests?limit=${limit}`); }
async function digestGet(id){ return await api.get(`/digests/${encodeURIComponent(id)}`); }

// === Profile & Settings API ===
async function meGet(){ return await api.get("/users/me"); }
async function meUpdate(payload){
  return await api.put("/users/me", payload);
}
async function meSetPassword(current, next){
  return await api.put("/users/me/password", { current, next });
}
async function meSetPrefs(prefs){
  return await api.put("/users/me/preferences", prefs);
}
async function meUploadPhoto(dataUrl){
  return await api.post("/users/me/photo", { dataUrl });
}

// === RFPs API ===
async function rfpList(params = {}){
  const qs = new URLSearchParams(params).toString();
  return await api.get(`/rfps${qs ? `?${qs}` : ""}`);
}
async function rfpGet(id){ return await api.get(`/rfps/${encodeURIComponent(id)}`); }
async function rfpCreate(payload){
  return await api.post("/rfps", payload);
}
async function rfpSetStage(id, stage){
  return await api.put(`/rfps/${encodeURIComponent(id)}/stage`, { stage });
}
async function rfpAddNote(id, text){
  return await api.post(`/rfps/${encodeURIComponent(id)}/notes`, { text });
}
async function rfpToggleChecklist(id, key, done){
  return await api.put(`/rfps/${encodeURIComponent(id)}/checklist`, { key, done });
}
async function rfpAddAttachment(id, payload){
  return await api.post(`/rfps/${encodeURIComponent(id)}/attachments`, payload);
}

function fmtPct(n) {
  return `${Number(n).toFixed(2)}%`;
}

function fmtBps(n) {
  return `${Number(n).toFixed(0)} bps`;
}

// Toasts
function ensureToastHost() {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  return host;
}
function toast(msg) {
  const host = ensureToastHost();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  // animate in
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 200);
  }, 2600);
}

const state = {
  token: null,
  user: null,
  // search UI
  query: "",
  suggestions: [],
  activeIndex: -1,
  // approvals
  approvals: [],
  // dashboard filter state
  pendingOnly: false,
  highlightApprovalId: null,
  // view routing
  view: "auth", // auth -> mfa -> dashboard | client | report | profile | mandates | mandate
  selectedClient: null,
  selectedReport: null,
  // drawer
  drawerOpen: false,
  drawerItem: null,
  drawerTab: "details"
};

function setState(next) {
  Object.assign(state, next);
  render().catch(console.error);
}

// The api function is now part of the window.api object exposed above.
// async function api(path, opts = {}) {
//   const headers = opts.headers || {};
//   if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
//   const res = await fetch(API + path, { ...opts, headers });
//   const data = await res.json().catch(() => ({}));
//   if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
//   return data;
// }

const FILTER_KEY = "approvalsFilter";
function saveApprovalsFilter(v){ try{ localStorage.setItem(FILTER_KEY, v);}catch{} }
function loadApprovalsFilter(){ try{ return localStorage.getItem(FILTER_KEY) || "All"; }catch{ return "All"; } }

// ---------- Views ----------
function ViewAuth() {
  const root = document.createElement("div");
  root.className = "container";

  root.innerHTML = `
    <div class="grid" style="grid-template-columns: 1fr; gap:16px;">
      <!-- Sign in card -->
      <div class="card"><div class="p">
        <h2 style="margin-bottom:6px;">J.P.Morgan</h2>
        <small class="muted">Employee Access Portal — Asset Management</small>
        <div style="height:12px;"></div>
        <div>
          <label>Username or Email</label>
          <input id="email" class="input" placeholder="firstname.lastname@company"/>
        </div>
        <div style="height:10px;"></div>
        <div>
          <div class="flex-between">
            <label>Password</label>
            <a class="link" id="forgot" style="font-size: 12px;">Forgot password?</a>
          </div>
          <input id="password" class="input" type="password" placeholder="••••••••"/>
        </div>
        <div style="height:12px;"></div>
        <div class="flex-between">
          <label><input id="remember" type="checkbox" checked> Remember this device</label>
          <a class="link" id="help">Need help?</a>
        </div>
        <div style="height:12px;"></div>
        <button id="loginBtn" class="btn primary" style="width:100%;">Sign in</button>
        <div style="height:8px;"></div>
        <small class="muted">By signing in you agree to J.P.Morgan's acceptable use & security policy.</small>
      </div></div>

      <!-- Security reminders -->
      <div class="card"><div class="p">
        <h3 style="margin-bottom:10px;">Security reminders</h3>
        <ul style="padding-left:18px; line-height:1.7;">
          <li>Only sign in on trusted domains.</li>
          <li>Use a password manager and enable MFA.</li>
          <li>Report suspicious messages to Security.</li>
        </ul>
      </div></div>

      <!-- Single Sign-On -->
      <div class="card"><div class="p">
        <h3 style="margin-bottom:6px;">Single Sign-On</h3>
        <small class="muted">Use your organization's identity provider.</small>
        <div style="height:12px;"></div>
        <div class="grid" style="grid-template-columns: 1fr; gap:10px; max-width:420px;">
          <button class="btn" id="ssoSaml">🔑 SSO (SAML)</button>
          <button class="btn" id="ssoOidc">🔑 SSO (OIDC)</button>
        </div>
        <div style="height:8px;"></div>
        <small class="muted">Wire these to your auth backend (OAuth/OIDC, SAML).</small>
      </div></div>

      <div style="text-align:center;">
        <small class="muted">© 2025 J.P.Morgan. All rights reserved.</small>
      </div>
    </div>
  `;

  // Buttons
  root.querySelector("#loginBtn").onclick = async () => {
    const email = root.querySelector("#email").value.trim();
    const password = root.querySelector("#password").value;
    try {
      // Use the new api object for login
      const { token, user } = await api.post("/auth/login", { email, password });
      window.api.setToken(token); // Use api.setToken
      setState({ token, user, view: "mfa" });
    } catch (e) {
      alert(e.message);
    }
  };
  root.querySelector("#ssoSaml").onclick = () => alert("SSO (SAML) is mocked in this training build.");
  root.querySelector("#ssoOidc").onclick = () => alert("SSO (OIDC) is mocked in this training build.");
  root.querySelector("#forgot").onclick = () => alert("Password reset is disabled in this training build.");
  root.querySelector("#help").onclick = () => alert("Contact your internal IT helpdesk (mock).");

  return root;
}

function ViewMfa() {
  const root = document.createElement("div");
  root.className = "container";
  root.innerHTML = `
    <div class="card"><div class="p">
      <h3>Multi-Factor Authentication</h3>
      <small class="muted">Enter any 6 digits to simulate MFA.</small>
      <div style="height:12px;"></div>
      <input id="code" class="input" placeholder="123456" maxlength="6" />
      <div style="height:12px;"></div>
      <button id="verify" class="btn primary">Verify & Continue</button>
    </div></div>
  `;
  root.querySelector("#verify").onclick = () => {
    const code = root.querySelector("#code").value.trim();
    if (code.length !== 6) return alert("Enter the 6-digit code");
    setState({ view: "dashboard" });
    // initial load
    loadDashboard();
  };
  return root;
}

async function loadDashboard(openId, pendingOnly = false, openFirstPending = false) {
  try {
    // Use the new api object to fetch approvals
    const approvals = await api.get("/approvals");
    setState({ approvals, pendingOnly });

    setTimeout(() => {
      // Priority 1: explicit ID
      if (openId) {
        const item = state.approvals.find(a => a.id === openId);
        if (item) {
          setState({ view: "dashboard", drawerOpen: true, drawerItem: item, drawerTab: "details", highlightApprovalId: item.id });
          toast(`Opened approval ${item.id}`);
          return;
        }
      }
      // Priority 2: first pending if requested
      if (openFirstPending) {
        const firstPending = (state.approvals || []).find(a => a.status === "Pending");
        if (firstPending) {
          setState({ view: "dashboard", drawerOpen: true, drawerItem: firstPending, drawerTab: "details", highlightApprovalId: firstPending.id });
          toast(`Opened pending approval ${firstPending.id}`);
        } else {
          setState({ view: "dashboard" });
          toast("No pending approvals");
        }
      }
    }, 50);
  } catch (e) {
    console.warn(e);
  }
}

function topNav() {
  const el = document.createElement("div");
  el.className = "nav";
  el.innerHTML = `
    <div class="container inner">
      <div class="brand">J.P.Morgan</div>
      <div class="searchbox">
        <input id="search" placeholder="Search mandates, clients, reports… (press / to focus)" />
        <ul id="suggest" class="suggest" style="display:none"></ul>
      </div>
      <div class="toolbar">
        <button id="newBtn" class="btn">New</button>

        <!-- Approvals icon with badge -->
        <div class="icon-wrap" title="Approvals (Pending)">
          <button id="approvalsBtn" class="btn icon-btn">📥</button>
          <span id="approvalsBadge" class="badge-dot" style="display:none;"></span>
        </div>

        <!-- Notifications bell -->
        <div class="notif-wrap">
          <button class="icon-btn" id="btnBell" aria-label="Notifications">
            <span class="bell">🔔</span>
            <span class="badge" id="notifCount" style="display:none;">0</span>
          </button>
          <div class="notif-panel card" id="notifPanel" style="display:none;">
            <div class="p">
              <div class="flex-between">
                <b>Notifications</b>
                <button class="btn-ghost" id="markAll">Mark all read</button>
              </div>
              <div id="notifList" class="notif-list"></div>
            </div>
          </div>
        </div>

        <div class="menu-wrap">
          <button id="youBtn" class="btn">You ▾</button>
          <div id="youMenu" class="menu">
            <button class="menu-item" data-action="profile">👤 Profile & Settings</button>
            <button class="menu-item" data-action="security">🔐 Security</button>
            <div class="menu-divider"></div>
            <button class="menu-item" data-action="logout">🚪 Sign out</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- search suggest logic (unchanged) ---
  const input = el.querySelector("#search");
  const suggest = el.querySelector("#suggest");

  const allItems = [
    { kind: "Client", label: "SunSuper", hint: "Pension – Australian Equity Core" },
    { kind: "Client", label: "QBE Insurance", hint: "LDI / Liability-Aware Fixed Income" },
    { kind: "Report", label: "Performance – Aus Core Bond (1Y/3Y/5Y)", hint: "PERF-ACB" },
    { kind: "Report", label: "Attribution – Australian Equity Core", hint: "ATTR-AEC" },
    { kind: "Report", label: "Risk – VaR & Tracking Error by Fund", hint: "RISK-VaR-TE" },
    { kind: "Report", label: "Client SLA – Monthly", hint: "SLA-MONTHLY" },
    { kind: "Report", label: "Compliance – Attestations Due", hint: "COMP-QTR" }
  ];

  function updateSuggest() {
    const q = input.value.trim().toLowerCase();
    const items = q ? allItems.filter((x)=>x.label.toLowerCase().includes(q)).slice(0,8) : [];
    state.suggestions = items;
    state.activeIndex = -1;
    suggest.innerHTML = items.map((s, idx) => `
      <li data-idx="${idx}" class="${idx===state.activeIndex?'active':''}">
        <span class="row"><span class="badge">${s.kind}</span> ${s.label}</span>
        <small class="muted">${s.hint || ""}</small>
      </li>
    `).join("");
    suggest.style.display = items.length ? "block" : "none";
    for (const li of suggest.querySelectorAll("li")) {
      li.onmouseenter = () => { state.activeIndex = Number(li.dataset.idx); paintActive(); };
      li.onmousedown = () => goToSuggestion(items[Number(li.dataset.idx)]);
    }
  }
  function paintActive() {
    for (const li of suggest.querySelectorAll("li")) li.classList.remove("active");
    const active = suggest.querySelector(`li[data-idx="${state.activeIndex}"]`);
    if (active) active.classList.add("active");
  }
  input.oninput = updateSuggest;
  input.onkeydown = (e) => {
    if (!state.suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); state.activeIndex = (state.activeIndex + 1) % state.suggestions.length; paintActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); state.activeIndex = (state.activeIndex - 1 + state.suggestions.length) % state.suggestions.length; paintActive(); }
    else if (e.key === "Enter" && state.activeIndex >= 0) {
      e.preventDefault();
      goToSuggestion(state.suggestions[state.activeIndex]);
      suggest.style.display = "none";
    }
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });

  // Global keyboard shortcut: g+a for Pending Approvals
  let _lastKey = null, _lastTs = 0;
  window.addEventListener("keydown", (e) => {
    const now = Date.now();
    if (_lastKey === "g" && e.key.toLowerCase() === "a" && (now - _lastTs) < 1000) {
      e.preventDefault();
      openApprovalsPending();
      _lastKey = null; _lastTs = 0;
      return;
    }
    _lastKey = e.key.toLowerCase();
    _lastTs = now;
  });

  // --- YOU menu dropdown ---
  const youBtn = el.querySelector("#youBtn");
  const youMenu = el.querySelector("#youMenu");
  let menuOpen = false;

  function setMenu(open) {
    menuOpen = open;
    youMenu.classList.toggle("open", open);
  }

  youBtn.onclick = (e) => {
    e.stopPropagation();
    setMenu(!menuOpen);
  };

  youMenu.onclick = (e) => {
    const action = e.target.closest(".menu-item")?.dataset?.action;
    if (!action) return;
    if (action === "profile") setState({ view: "profile" });
    else if (action === "security") alert("Security center is mocked in this training build.");
    else if (action === "logout") {
      window.api.clearToken(); // Use api.clearToken
      setState({ token: null, user: null, view: "auth" });
    }
    setMenu(false);
  };

  // Close on outside click
  document.addEventListener("click", (ev) => {
    const within = ev.target === youBtn || youMenu.contains(ev.target);
    if (!within) setMenu(false);
  });

  // --- Approvals button & badge ---
  const approvalsBtn = el.querySelector("#approvalsBtn");
  const approvalsBadge = el.querySelector("#approvalsBadge");

  // Compute pending count from current state (if not yet loaded, badge stays hidden)
  function updateApprovalsBadge() {
    const count = (state.approvals || []).filter(a => a.status === "Pending").length;
    if (count > 0) {
      approvalsBadge.textContent = count > 9 ? "9+" : String(count);
      approvalsBadge.style.display = "inline-block";
    } else {
      approvalsBadge.style.display = "none";
    }
  }
  updateApprovalsBadge();

  // Recompute whenever we re-render topNav (render() recreates DOM) — nothing else needed.

  // Click → jump to Dashboard pending
  approvalsBtn.onclick = () => {
    openApprovalsPending();
  };

  // --- Notification bell setup ---
  const bellWrap = el.querySelector(".notif-wrap");

  async function refreshBell(){
    try {
      // Use the new api object to fetch notifications
      const { notifications = [], unread = 0 } = await api.get("/notifications");
      const badge = bellWrap.querySelector("#notifCount");
      badge.textContent = String(unread);
      badge.style.display = unread > 0 ? "" : "none";

      const list = bellWrap.querySelector("#notifList");
      list.innerHTML = notifications.slice(0, 20).map(n => `
        <div class="notif-row ${n.read ? "read" : "unread"}" data-id="${n.id}" data-ref="${n.ref || ""}" data-type="${n.type}">
          <div class="notif-title">
            <b>${n.title}</b> <span class="muted small">• ${new Date(n.ts).toLocaleString()}</span>
          </div>
          <div class="muted">${n.body || ""}</div>
        </div>
      `).join("") || `<div class="muted">No notifications.</div>`;
    } catch (e) {
      // ignore
    }
  }

  // Initialize bell
  (async function initBell(){
    await refreshBell();
    // live via SSE (if enabled in profile)
    try {
      const me = await fetchMe();
      if (me?.preferences?.liveUpdates !== false) {
        const es = new EventSource("/api/dashboard/stream");
        es.addEventListener("dash", async () => { await refreshBell(); });
        es.addEventListener("ping", () => {});
        es.onerror = () => { es.close?.(); };
      }
    } catch {}
  })();

  // Toggle panel
  const btn = bellWrap.querySelector("#btnBell");
  const panel = bellWrap.querySelector("#notifPanel");
  btn.onclick = () => {
    panel.style.display = panel.style.display === "none" ? "" : "none";
  };
  document.addEventListener("click", (e) => {
    if (!bellWrap.contains(e.target)) panel.style.display = "none";
  });

  // Click notifications to deep-link
  bellWrap.querySelector("#notifList").addEventListener("click", async (e) => {
    const row = e.target.closest(".notif-row");
    if (!row) return;
    const id = row.dataset.id;
    const ref = row.dataset.ref || "";
    const type = (row.dataset.type || "").toLowerCase();
    try { await notifRead(id); } catch {}

    // Navigate by type/ref
    if (type === "rfp") {
      state.view = "rfp";
      state.rfpId = ref || state.rfpId;
    } else if (type === "breach") {
      state.view = "mandate";
      state.selectedMandate = { id: ref };
    } else if (type === "approval") {
      state.view = "dashboard";
    } else {
      state.view = "dashboard";
    }
    render();
    panel.style.display = "none";
  });

  // Mark all read
  bellWrap.querySelector("#markAll").onclick = async () => {
    try { await notifReadAll(); await refreshBell(); } catch {}
  };

  // --- NEW: Brand/Title as Back to Dashboard link ---
  const brand = el.querySelector(".brand");
  brand.style.cursor = "pointer";
  brand.onclick = () => { state.view = "dashboard"; render(); };

  return el;
}

function goToSuggestion(item) {
  if (item.kind === "Client") {
    setState({ view: "client", selectedClient: item.label, selectedReport: null });
  } else {
    setState({ view: "report", selectedClient: null, selectedReport: item });
  }
}

function sidebar() {
  const el = document.createElement("div");
  el.className = "sidebar";

  const side = document.createElement("div");
  side.className = "card";
  side.innerHTML = `<div class="p"></div>`;
  const p = side.querySelector(".p");

  // Dashboard link
  const dashboardLink = document.createElement("div");
  dashboardLink.className = "navlink";
  dashboardLink.innerHTML = `<span>🏠</span> Dashboard`;
  dashboardLink.onclick = () => setState({ view: "dashboard" });
  p.appendChild(dashboardLink);

  // Clients link
  const clientsLink = document.createElement("div");
  clientsLink.className = "navlink";
  clientsLink.style.marginTop = "8px";
  clientsLink.innerHTML = `<span>👥</span> Clients`;
  clientsLink.onclick = () => setState({ view: "clients" });
  p.appendChild(clientsLink);

  // Mandates link
  const mandatesLink = document.createElement("div");
  mandatesLink.className = "navlink";
  mandatesLink.style.marginTop = "8px";
  mandatesLink.innerHTML = `<span>📈</span> Mandates`;
  mandatesLink.onclick = () => setState({ view: "mandates" });
  p.appendChild(mandatesLink);

  // RFPs link
  const rfpsLink = document.createElement("div");
  rfpsLink.className = "navlink";
  rfpsLink.style.marginTop = "8px";
  rfpsLink.innerHTML = `<span>💼</span> RFPs`;
  rfpsLink.onclick = () => { state.view = "rfps"; render(); };
  p.appendChild(rfpsLink);

  // Profile link
  const profileLink = document.createElement("div");
  profileLink.className = "navlink";
  profileLink.style.marginTop = "8px";
  profileLink.innerHTML = `<span>👤</span> Profile & Settings`;
  profileLink.onclick = () => { state.view = "profile"; render(); };
  p.appendChild(profileLink);

  // Portfolio Risk link
  const riskLink = document.createElement("div");
  riskLink.className = "navlink";
  riskLink.style.marginTop = "8px";
  riskLink.innerHTML = `<span>🛡️</span> Portfolio Risk`;
  riskLink.onclick = () => setState({ view: "portfolio-risk" });
  p.appendChild(riskLink);

  // Admin link (only show for Admins)
  (async () => {
    const me = await fetchMe();
    if (me?.role === "Admin") {
      const adminLink = document.createElement("div");
      adminLink.className = "navlink";
      adminLink.style.marginTop = "8px";
      adminLink.innerHTML = `<span>⚙️</span> Admin`;
      adminLink.onclick = () => { state.view = "admin"; render(); };
      p.appendChild(adminLink);
    }
  })();

  el.appendChild(side);
  return el;
}

function kpiCard(title, value, sub, ok=false) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `<div class="p">
    <small class="muted">${title}</small>
    <h2>${value}</h2>
    ${sub ? `<small class="${ok?'':'muted'}">${sub}</small>` : ""}
  </div>`;
  return el;
}

function ApprovalRow(a) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><strong>${a.id}</strong></td>
    <td>${a.requester}</td>
    <td>${a.dept}</td>
    <td>${formatAUD(a.amount)}</td>
    <td>${statusPill(a.status)}</td>
    <td>${a.submitted}</td>
    <td style="text-align:right;">
      <button class="btn" data-action="qa">Quick Approve</button>
      <button class="btn" data-action="open">Open</button>
    </td>
  `;
  tr.querySelector('[data-action="qa"]').onclick = async () => {
    try {
      // Use api.post for the POST request
      const updated = await api.post(`/approvals/${a.id}/approve`);
      const idx = state.approvals.findIndex(x => x.id === a.id);
      state.approvals[idx] = updated;
      render();
      alert(`Approved: ${a.id}`);
    } catch (e) {
      alert(e.message);
    }
  };
  tr.querySelector('[data-action="open"]').onclick = () => {
    setState({ drawerOpen: true, drawerItem: a, drawerTab: "details" });
  };
  return tr;
}

function statusPill(s) {
  const cls = s === "Approved" ? "approved" : s === "Escalated" ? "escalated" : "pending";
  return `<span class="pill ${cls}">${s}</span>`;
}

function formatAUD(n) {
  try {
    return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
  } catch {
    return `A$${n}`;
  }
}

function approvalsDrawer() {
  const d = document.createElement("div");
  d.className = "drawer" + (state.drawerOpen ? " open" : "");
  if (!state.drawerItem) return d;

  const a = state.drawerItem;
  d.innerHTML = `
    <div class="head">
      <div><strong>${a.id}</strong></div>
      <div class="row"><button class="btn" id="close">Close</button></div>
    </div>
    <div class="tabs">
      <div class="tab ${state.drawerTab==='details'?'active':''}" data-tab="details">Details</div>
      <div class="tab ${state.drawerTab==='docs'?'active':''}" data-tab="docs">Documents</div>
      <div class="tab ${state.drawerTab==='audit'?'active':''}" data-tab="audit">Audit Trail</div>
    </div>
    <div class="section" id="content"></div>
    <div class="section">
      <div class="row">
        <button class="btn primary" id="approve">Approve</button>
        <button class="btn" id="changes">Request changes</button>
      </div>
    </div>
  `;

  d.querySelector("#close").onclick = () => setState({ drawerOpen: false });

  d.querySelectorAll(".tab").forEach(t => {
    t.onclick = () => setState({ drawerTab: t.dataset.tab });
  });

  d.querySelector("#approve").onclick = async () => {
    try {
      // Use api.post for the POST request
      const updated = await api.post(`/approvals/${a.id}/approve`);
      const idx = state.approvals.findIndex(x => x.id === a.id);
      state.approvals[idx] = updated;
      setState({ drawerItem: updated, drawerTab: "audit" });
    } catch (e) { alert(e.message); }
  };

  d.querySelector("#changes").onclick = async () => {
    try {
      // Use api.post for the POST request
      const ev = await api.post(`/approvals/${a.id}/audit`, {
        action: "Requested changes", meta: "Assigned to Legal QA"
      });
      alert(`Added audit: ${ev.action}`);
      const idx = state.approvals.findIndex(x => x.id === a.id);
      state.approvals[idx].audit = state.approvals[idx].audit || [];
      state.approvals[idx].audit.push(ev);
      render();
    } catch (e) { alert(e.message); }
  };

  const content = d.querySelector("#content");
  if (state.drawerTab === "details") {
    content.innerHTML = `
      <dl class="kv">
        <dt>Requester</dt><dd>${a.requester}</dd>
        <dt>Department</dt><dd>${a.dept}</dd>
        <dt>Amount</dt><dd>${formatAUD(a.amount)}</dd>
        <dt>Status</dt><dd>${a.status}</dd>
        <dt>Submitted</dt><dd>${a.submitted}</dd>
      </dl>
    `;
  } else if (state.drawerTab === "docs") {
    content.innerHTML = (a.docs||[]).map(d=>`
      <div class="row" style="justify-content:space-between; border:1px solid #e5e7eb; border-radius:10px; padding:8px 10px; margin-bottom:8px;">
        <div>
          <div><strong>${d.name}</strong></div>
          <small class="muted">${d.type} · ${d.size}</small>
        </div>
        <button class="btn">Mock Download</button>
      </div>
    `).join("") || `<small class="muted">No documents attached.</small>`;
  } else if (state.drawerTab === "audit") {
    content.innerHTML = (a.audit||[]).map(ev=>`
      <div style="margin-bottom:10px;">
        <div><strong>${ev.action}</strong></div>
        <div class="muted">${ev.ts} — ${ev.user}</div>
        ${ev.meta ? `<div><small class="muted">${ev.meta}</small></div>` : ""}
      </div>
    `).join("") || `<small class="muted">No audit events.</small>`;
  }

  return d;
}

function DashboardMain() {
  const root = document.createElement("div");
  root.className = "container";

  // Top bar
  root.appendChild(topNav());

  // Layout
  const wrap = document.createElement("div");
  wrap.className = "layout";
  root.appendChild(wrap);

  // Sidebar
  wrap.appendChild(sidebar());

  // Main content area
  const main = document.createElement("div");
  main.className = "grid"; // Changed from "main" to "grid" as per new structure
  wrap.appendChild(main);

  // KPIs
  const kpis = document.createElement("div");
  kpis.className = "grid kpi";
  kpis.append(
    kpiCard("AUM (Australia)", "A$128.4bn", "+ A$320m net flows today"),
    kpiCard("Active Mandates", "84", "12 in transition"),
    kpiCard("Trade Exceptions", "5", "2 require action"),
    kpiCard("Compliance Attestations", "2 due", "Quarterly certifications", true),
  );
  main.appendChild(kpis);

  // Approvals card
  const approvalsCard = document.createElement("div");
  approvalsCard.className = "card";
  approvalsCard.innerHTML = `
    <div class="p">
      <div class="flex-between">
        <h3>Approvals</h3>
        <div class="row">
          <select id="filt" class="input" style="width:auto;">
            <option>All</option><option>Pending</option><option>Approved</option><option>Escalated</option>
          </select>
          <button class="btn">View All →</button>
        </div>
      </div>
      <div style="overflow:auto;">
        <table class="table" id="approvalsTable">
          <thead><tr>
            <th>ID</th><th>Requester</th><th>Dept</th><th>Amount</th><th>Status</th><th>Submitted</th><th></th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  main.appendChild(approvalsCard);

  const tbody = approvalsCard.querySelector("tbody");
  const drawRows = () => {
    const select = approvalsCard.querySelector("#filt");
    if (state.pendingOnly && select.value !== "Pending") select.value = "Pending";
    const filt = select.value;
    saveApprovalsFilter(filt);

    tbody.innerHTML = "";
    state.approvals
      .filter(a => (filt === "All" ? true : a.status === filt))
      .filter(a => [a.id, a.requester, a.dept].some(s => s.toLowerCase().includes(state.query.toLowerCase())))
      .forEach(a => {
        const row = ApprovalRow(a);
        row.setAttribute("data-approval-id", a.id);
        tbody.appendChild(row);
      });

    // Briefly highlight the targeted row (if any)
    if (state.highlightApprovalId) {
      const target = tbody.querySelector(`[data-approval-id="${state.highlightApprovalId}"]`);
      if (target) {
        target.classList.add("row-blink");
        setTimeout(() => target && target.classList.remove("row-blink"), 1200);
      }
      state.highlightApprovalId = null;
    }
  };
  const select = approvalsCard.querySelector("#filt");
  if (state.pendingOnly) {
    select.value = "Pending";
  } else {
    select.value = loadApprovalsFilter();
  }

  select.onchange = drawRows;
  drawRows();
  state.pendingOnly = false;


  // === Dashboard SSE (with fallback) ===
  let dashES = null;
  function connectDashStream({ onEvent }){
    try {
      if (dashES) dashES.close();
      dashES = new EventSource("/api/dashboard/stream");
      dashES.addEventListener("dash", (e) => {
        try { const evt = JSON.parse(e.data); onEvent?.(evt); } catch {}
      });
      dashES.addEventListener("ping", () => {/* keepalive */});
      dashES.onerror = () => { /* fallback reconnect after delay */ setTimeout(()=>connectDashStream({ onEvent }), 5000); };
    } catch {
      // no SSE support: ignore; UI will rely on polling/refresh buttons
    }
  }

  // === Enhanced Dashboard Layout ===
  (async () => {
    try {
      // Check user's live updates preference
      const me = await fetchMe();
      const allowLive = me?.preferences?.liveUpdates !== false; // default ON
      if (allowLive) {
        connectDashStream({
          onEvent: (evt) => {
            // Refresh the dashboard when events occur
            console.log("Dashboard event:", evt);
            render();
          }
        });
      }

      // Use the new compact builders
      const perfCard = await buildPerformanceCard({ limit: 3 });
      const riskCard = buildRiskOverviewCompact({
        trackingErrorBps: 120,
        var95_oneDayPct: 1.2,
        var95_tenDayPct: 3.8,
        beta: 1.05,
        infoRatio: 0.42,
        activeSharePct: 35,
        factors: [
          { factor: "Value", exposure: 0.15 },
          { factor: "Growth", exposure: -0.08 },
          { factor: "Quality", exposure: 0.22 },
          { factor: "Momentum", exposure: 0.05 }
        ]
      });

      const pipelineCard = buildPipelineBox([
        { stage: "SunSuper RFP Draft", due: "2025-08-14", owner: "Legal", note: "Performance Review" },
        { stage: "QBE Insurance LDI Review", due: "2025-08-18", owner: "Portfolio", note: "Constraint updates" },
        { stage: "Pacific Rail Pension Discovery", due: "2025-08-20", owner: "Sales", note: "Real Assets mandate" }
      ]);

      // Simple grid layout
      const enhancedGrid = document.createElement("div");
      enhancedGrid.className = "grid";
      enhancedGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(320px, 1fr))";
      enhancedGrid.style.gap = "16px";
      enhancedGrid.style.marginBottom = "16px";

      enhancedGrid.appendChild(pipelineCard);
      enhancedGrid.appendChild(perfCard);
      enhancedGrid.appendChild(riskCard);

      main.appendChild(enhancedGrid);
    } catch (e) {
      console.error("Dashboard enhancements failed", e);
    }
  })();

  // Original content below, appended after the new grid structure is added

  // --- Original content starts here ---

  // Client & Portfolio Activity (simple) - Moved inside the async IIFE for structure
  // const activity = document.createElement("div");
  // activity.className = "card";
  // activity.innerHTML = `
  //   <div class="p">
  //     <h3>Client & Portfolio Activity</h3>
  //     <ul>
  //       <li>Client meeting set: SunSuper (Performance Review) · MEET-SUSU</li>
  //       <li>RFP draft uploaded for QBE Insurance LDI · RFP-QBE</li>
  //       <li>Quarterly factsheet generated: Aus Core Bond · FS-ACB</li>
  //       <li>Mandate change request: Real Assets tilt · MCR-RA</li>
  //     </ul>
  //   </div>
  // `;
  // main.appendChild(activity);

  // Alerts
  const alerts = document.createElement("div");
  alerts.className = "card";
  alerts.innerHTML = `
    <div class="p">
      <h3>Alerts</h3>
      <p class="muted">No critical alerts. 3 informational notices from Security Center.</p>
    </div>
  `;
  main.appendChild(alerts);

  // Pipeline / Performance / Risk
  const ppr = document.createElement("div");
  ppr.className = "grid";
  ppr.style.gridTemplateColumns = "repeat(3,minmax(0,1fr))";
  ppr.innerHTML = `
    <div class="card"><div class="p">
      <h3>Mandate Pipeline</h3>
      <ul>
        <li><strong>SunSuper</strong> · Australian Equity Core — <span class="muted">RFP Draft · Due 14 Aug</span></li>
        <li><strong>QBE Insurance</strong> · LDI / FI — <span class="muted">Legal Review · Due 12 Aug</span></li>
        <li><strong>Pacific Rail Pension</strong> · Real Assets — <span class="muted">Discovery · Due 20 Aug</span></li>
      </ul>
    </div></div>
    <div class="card"><div class="p">
      <h3>Performance Snapshot</h3>
      <ul>
        <li>Aus Core Bond vs AusBond Composite — <strong>+62 bps (1Y)</strong></li>
        <li>Australian Equity Core vs S&P/ASX 200 — <strong>+48 bps (3Y ann.)</strong></li>
        <li>Real Assets Income — <strong>+5.1% (YTD)</strong></li>
      </ul>
    </div></div>
    <div class="card"><div class="p">
      <h3>Risk Overview</h3>
      <ul>
        <li>Tracking Error (Australian Equity Core): <strong>2.1%</strong></li>
        <li>Ex-ante VaR (Aus Core Bond): <strong>0.9%</strong></li>
        <li>Top Factor: <strong>Duration (FI)</strong></li>
      </ul>
    </div></div>
  `;
  main.appendChild(ppr);

  // Client Tasks
  const tasks = document.createElement("div");
  tasks.className = "card";
  tasks.innerHTML = `
    <div class="p">
      <h3>Client Tasks</h3>
      <ul>
        <li>SunSuper — Upload Q2 performance deck <span class="muted">(owner: You · due Fri)</span></li>
        <li>QBE Insurance — Confirm fee schedule redlines <span class="muted">(owner: Legal · due Wed)</span></li>
        <li>SunSuper — SLA report sign-off <span class="muted">(owner: Reporting · due Mon)</span></li>
      </ul>
    </div>
  `;
  main.appendChild(tasks);

  // Drawer
  root.appendChild(approvalsDrawer());

  return root;
}

function ViewReportDetail() {
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const main = document.createElement("div");
  main.className = "card";
  main.innerHTML = `<div class="p"><h2>Report: ${state.selectedReport?.label}</h2><div id="body"><small class="muted">Loading…</small></div></div>`;
  root.appendChild(main);

  (async()=>{
    try{
      // Use api.get for fetching report details
      const data = await api.get(`/reports/${encodeURIComponent(state.selectedReport.label)}`);
      const body = main.querySelector("#body");
      body.innerHTML = `
        <div class="row">
          <div><small class="muted">Code</small><div><strong>${data.code}</strong></div></div>
          <div style="margin-left:20px;"><small class="muted">Generated</small><div>${new Date(data.generatedAt).toLocaleString()}</div></div>
        </div>
        <div style="height:12px;"></div>
        <p>${data.summary}</p>
        <ul>
          ${data.dataPoints.map(d=>`<li>${d.key}: <strong>${d.value}</strong></li>`).join("")}
        </ul>
      `;
    } catch(e){
      main.querySelector("#body").innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
    }
  })();

  return root;
}

function ViewProfile() {
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const wrap = document.createElement("div");
  wrap.className = "layout";
  root.appendChild(wrap);

  wrap.appendChild(sidebar());

  const main = document.createElement("div");
  main.className = "main";
  wrap.appendChild(main);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <header class="page-head">
        <div>
          <h2 class="page-title">Profile & Settings</h2>
          <p class="page-sub">Your corporate profile, access, and preferences</p>
        </div>
      </header>

      <!-- Identity & Employment -->
      <section class="panel">
        <div class="panel-head"><h3>Identity & Employment</h3></div>
        <div class="panel-body">
          <div class="grid-2-tight">
            <div class="id-left">
              <div class="avatar-row">
                <img id="avatar" class="avatar" alt="Avatar" src="/avatar-placeholder.png"/>
                <div class="avatar-actions">
                  <label class="label">Profile photo</label>
                  <input type="file" id="photo" accept="image/png,image/jpeg"/>
                  <button class="btn-ghost" id="uploadPhoto">Upload</button>
                </div>
              </div>
            </div>
            <div class="id-right">
              <div class="form-row">
                <div class="field">
                  <label class="label" for="name">Full Name</label>
                  <input id="name" class="input" placeholder="Your full name"/>
                </div>
                <div class="field">
                  <label class="label" for="employeeId">Employee ID</label>
                  <input id="employeeId" class="input" placeholder="EMP-12345"/>
                </div>
              </div>
              <div class="form-row">
                <div class="field">
                  <label class="label" for="email">Email</label>
                  <input id="email" class="input" disabled/>
                </div>
                <div class="field">
                  <label class="label" for="dob">Date of Birth</label>
                  <input id="dob" type="date" class="input"/>
                </div>
              </div>
              <div class="form-row">
                <div class="field">
                  <label class="label" for="team">Team/Department</label>
                  <input id="team" class="input" placeholder="Asset Management" disabled/>
                </div>
                <div class="field">
                  <label class="label" for="manager">Manager</label>
                  <input id="manager" class="input" placeholder="Manager name" disabled/>
                </div>
              </div>
              <div class="form-row">
                <div class="field">
                  <label class="label" for="costCenter">Cost Center</label>
                  <input id="costCenter" class="input" value="CC-037" disabled/>
                </div>
                <div class="field">
                  <label class="label" for="office">Office Location</label>
                  <input id="office" class="input" placeholder="Sydney" disabled/>
                </div>
              </div></div>
              <div class="form-row">
                <div class="field">
                  <label class="label" for="phone">Phone</label>
                  <input id="phone" class="input" placeholder="+61 ..."/>
                </div>
                <div class="field">
                  <label class="label" for="role">Role</label>
                  <input id="role" class="input" disabled/>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Systems Access -->
      <section class="panel">
        <div class="panel-head"><h3>Market Data & Systems Access</h3></div>
        <div class="panel-body">
          <div class="form-row">
            <label class="check"><input type="checkbox" id="bloomberg"/> Bloomberg Terminal</label>
            <label class="check"><input type="checkbox" id="factset"/> FactSet</label>
            <label class="check"><input type="checkbox" id="jpmProp"/> JPM Proprietary Systems</label>
          </div>
          <div class="form-row">
            <label class="check"><input type="checkbox" id="aladdin"/> Aladdin (BlackRock)</label>
            <label class="check"><input type="checkbox" id="morningstar"/> Morningstar Direct</label>
          </div>
        </div>
      </section>

      <!-- Security & Preferences -->
      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h3>Security</h3></div>
          <div class="panel-body">
            <div class="field">
              <label class="label" for="pwCur">Current Password</label>
              <input id="pwCur" type="password" class="input" placeholder="Current password"/>
            </div>
            <div class="field">
              <label class="label" for="pwNew">New Password</label>
              <input id="pwNew" type="password" class="input" placeholder="At least 8 chars"/>
            </div>
            <div class="field">
              <label class="label" for="pwConf">Confirm Password</label>
              <input id="pwConf" type="password" class="input" placeholder="Repeat new password"/>
            </div>
            <div class="actions">
              <button class="btn" id="savePw">Update Password</button>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>Preferences</h3></div>
          <div class="panel-body">
            <div class="field">
              <label class="label" for="prefTheme">Theme</label>
              <select id="prefTheme" class="input">
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div class="field">
              <label class="label" for="prefTz">Timezone</label>
              <select id="prefTz" class="input">
                <option value="Australia/Melbourne">Australia/Melbourne</option>
                <option value="Australia/Sydney">Australia/Sydney</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div class="field">
              <label class="label">Notifications</label>
              <div class="check-group">
                <label class="check"><input type="checkbox" id="alrApprovals"/> Approvals</label>
                <label class="check"><input type="checkbox" id="alrBreaches"/> Breaches</label>
                <label class="check"><input type="checkbox" id="liveUpdates"/> Live updates</label>
              </div>
            </div>
            <div class="actions">
              <button class="btn" id="savePrefs">Save Preferences</button>
            </div>
          </div>
        </section>
      </div>

      <!-- Actions -->
      <div class="actions" style="margin-top: 16px; justify-content: space-between;">
        <button class="btn" id="saveProfile">Save Profile</button>
        <div class="actions">
          <button class="btn-ghost" id="genDigest">Generate Digest</button>
          <button class="btn-ghost" id="goAdmin" style="display:none;">Admin Panel</button>
        </div>
      </div>

    </div>
  `;
  main.appendChild(card);

  let user = null;

  (async function init(){
    try { user = await meGet(); } catch { user = await fetchMe(); }

    // Profile fields
    card.querySelector("#avatar").src = user?.photo || "/avatar-placeholder.png";
    card.querySelector("#name").value = user?.name || "";
    card.querySelector("#employeeId").value = user?.employeeId || "";
    card.querySelector("#email").value = user?.email || "";
    card.querySelector("#dob").value = user?.dob || "";
    card.querySelector("#team").value = user?.team || "Asset Management";
    card.querySelector("#manager").value = user?.manager || "Thomas Smith";
    card.querySelector("#costCenter").value = "CC-037";
    card.querySelector("#office").value = user?.office || "Sydney";
    card.querySelector("#phone").value = user?.phone || "";
    card.querySelector("#role").value = user?.role || "";

    // Systems access
    const sys = user?.systemsAccess || {};
    card.querySelector("#bloomberg").checked = !!sys.bloomberg;
    card.querySelector("#factset").checked = !!sys.factset;
    card.querySelector("#jpmProp").checked = !!sys.jpmProp;
    card.querySelector("#aladdin").checked = !!sys.aladdin;
    card.querySelector("#morningstar").checked = !!sys.morningstar;

    // Preferences
    const prefs = user?.preferences || {};
    card.querySelector("#prefTheme").value = prefs.theme || "auto";
    card.querySelector("#prefTz").value = prefs.timezone || "Australia/Melbourne";
    const e = (prefs.emailAlerts || {});
    card.querySelector("#alrApprovals").checked = !!e.approvals;
    card.querySelector("#alrBreaches").checked = !!e.breaches;
    card.querySelector("#liveUpdates").checked = (prefs.liveUpdates !== false);

    // Admin show/hide
    if ((user?.role || "") === "Admin") {
      card.querySelector("#goAdmin").style.display = "";
      card.querySelector("#goAdmin").onclick = () => { state.view = "admin"; render(); };
    }

    // Apply theme immediately (force light theme for profile page)
    applyTheme("light");
    card.querySelector("#prefTheme").onchange = (e)=> applyTheme(e.target.value);

    // Wire buttons
    card.querySelector("#saveProfile").onclick = onSaveProfile;
    card.querySelector("#uploadPhoto").onclick = onUploadPhoto;
    card.querySelector("#savePw").onclick = onSavePassword;
    card.querySelector("#savePrefs").onclick = onSavePrefs;
    card.querySelector("#genDigest").onclick = onRunDigest;
  })();

  function applyTheme(val){
    const rootEl = document.documentElement;
    if (val === "auto") {
      rootEl.dataset.theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? "dark" : "light";
    } else {
      rootEl.dataset.theme = val;
    }
  }

  async function onSaveProfile(){
    const payload = {
      name: card.querySelector("#name").value.trim(),
      employeeId: card.querySelector("#employeeId").value.trim(),
      dob: card.querySelector("#dob").value,
      team: card.querySelector("#team").value.trim(),
      manager: card.querySelector("#manager").value.trim(),
      costCenter: card.querySelector("#costCenter").value.trim(),
      office: card.querySelector("#office").value.trim(),
      phone: card.querySelector("#phone").value.trim(),
      systemsAccess: {
        bloomberg: card.querySelector("#bloomberg").checked,
        factset: card.querySelector("#factset").checked,
        jpmProp: card.querySelector("#jpmProp").checked,
        aladdin: card.querySelector("#aladdin").checked,
        morningstar: card.querySelector("#morningstar").checked
      }
    };
    try {
      const res = await meUpdate(payload);
      user = res;
      CURRENT_USER = res;
      toast("Profile saved");
    } catch (err) {
      alert(err.message || "Failed to save profile");
    }
  }

  async function onUploadPhoto(){
    const file = card.querySelector("#photo").files?.[0];
    if (!file) return alert("Choose an image first");
    if (!["image/png","image/jpeg"].includes(file.type)) return alert("Use PNG or JPEG");
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    try {
      const r = await meUploadPhoto(String(dataUrl));
      card.querySelector("#avatar").src = r.photo;
      await meUpdate({ photo: r.photo });
      user = await meGet();
      CURRENT_USER = user;
      toast("Photo updated");
    } catch (err) {
      alert(err.message || "Upload failed");
    }
  }

  async function onSavePassword(){
    const cur = card.querySelector("#pwCur").value;
    const n1 = card.querySelector("#pwNew").value;
    const n2 = card.querySelector("#pwConf").value;
    if (n1 !== n2) return alert("New passwords do not match");
    if ((n1 || "").length < 8) return alert("New password must be at least 8 characters");
    try {
      await meSetPassword(cur, n1);
      ["#pwCur","#pwNew","#pwConf"].forEach(s => card.querySelector(s).value = "");
      toast("Password updated");
    } catch (err) {
      alert(err.message || "Failed to update password");
    }
  }

  async function onSavePrefs(){
    const prefs = {
      theme: card.querySelector("#prefTheme").value,
      timezone: card.querySelector("#prefTz").value,
      emailAlerts: {
        approvals: card.querySelector("#alrApprovals").checked,
        breaches: card.querySelector("#alrBreaches").checked,
      },
      liveUpdates: card.querySelector("#liveUpdates").checked
    };
    try {
      await meSetPrefs(prefs);
      CURRENT_USER = await meGet();
      toast("Preferences saved");
    } catch (err) {
      alert(err.message || "Failed to save preferences");
    }
  }

  async function onRunDigest(){
    try {
      const r = await digestRun("daily");
      toast(`Generated ${r.generated} digest${r.generated===1?"":"s"}`);
    } catch (e) {
      alert(e.message || "Failed to generate digest");
    }
  }

  return root;
}

function ViewClients() {
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <div class="flex-between">
        <h2>Clients</h2>
        <div class="row">
          <input id="q" class="input" placeholder="Filter clients…" style="width:240px;">
          <button id="refresh" class="btn">Refresh</button>
        </div>
      </div>
      <div style="height:12px;"></div>
      <div style="overflow:auto;">
        <table class="table" id="tbl">
          <thead><tr>
            <th>Name</th><th>Type</th><th>Strategies</th><th>AUM (AUD)</th><th>Fee (bps)</th><th>Last Review</th><th>Next Review</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  root.appendChild(card);

  const tbody = card.querySelector("tbody");
  const q = card.querySelector("#q");

  async function load() {
    // Use api.get to fetch clients
    const list = await api.get("/clients");
    state._clientsList = list;
    draw(list);
  }
  function draw(list) {
    tbody.innerHTML = "";
    list.forEach(c => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><a class="link" href="#" data-client="${c.name}">${c.name}</a></td>
        <td>${c.type}</td>
        <td>${(c.strategies||[]).join(", ")}</td>
        <td>${formatAUD(c.aumAud)}</td>
        <td>${c.feeBps}</td>
        <td>${c.lastReview}</td>
        <td>${c.nextReview}</td>
      `;
      tr.querySelector("a").onclick = (e) => { e.preventDefault(); setState({ view: "client", selectedClient: c.name }); };
      tbody.appendChild(tr);
    });
  }

  q.oninput = () => {
    const term = q.value.trim().toLowerCase();
    const list = (state._clientsList || []).filter(c =>
      [c.name, c.type, (c.strategies||[]).join(" ")].some(s => s.toLowerCase().includes(term))
    );
    draw(list);
  };

  card.querySelector("#refresh").onclick = load;
  load().catch(e => alert(e.message));
  return root;
}

function ViewClientDetail() {
  const name = state.selectedClient;
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const wrap = document.createElement("div");
  wrap.className = "grid";
  wrap.style.gridTemplateColumns = "1fr";
  root.appendChild(wrap);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <div class="flex-between">
        <h2>Client: ${name}</h2>
        <button id="back" class="btn">← All Clients</button>
      </div>
      <div style="height:10px;"></div>
      <div class="tabs">
        <div class="tab active" data-tab="overview">Overview</div>
        <div class="tab" data-tab="holdings">Holdings</div>
        <div class="tab" data-tab="documents">Documents</div>
        <div class="tab" data-tab="notes">Notes</div>
      </div>
      <div class="section" id="content"><small class="muted">Loading…</small></div>
    </div>
  `;
  wrap.appendChild(card);

  card.querySelector("#back").onclick = () => setState({ view: "clients" });

  let data = null;
  let tab = "overview";
  const content = card.querySelector("#content");

  (async()=>{
    try {
      // Use api.get to fetch client details
      data = await api.get(`/clients/${encodeURIComponent(name)}`);
      drawOverview();
    } catch(e) {
      content.innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
    }
  })();

  function setTab(next) {
    tab = next;
    for (const t of card.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === tab);
    if (tab === "overview") drawOverview();
    if (tab === "holdings") drawHoldings();
    if (tab === "documents") drawDocuments();
    if (tab === "notes") drawNotes();
  }
  card.querySelectorAll(".tab").forEach(t => t.onclick = () => setTab(t.dataset.tab));

  function drawOverview() {
    content.innerHTML = `
      <div class="grid" style="grid-template-columns: repeat(4,minmax(0,1fr));">
        ${kpiHtml("AUM (AUD)", formatAUD(data.aumAud))}
        ${kpiHtml("Fee (bps)", data.feeBps)}
        ${kpiHtml("Benchmark", data.benchmark)}
        ${kpiHtml("SLA", data.sla)}
      </div>
      <div style="height:14px;"></div>
      <div class="grid" style="grid-template-columns: 1fr 1fr; align-items:start;">
        <div class="card"><div class="p">
          <h3>Contacts</h3>
          <ul>${data.contacts.map(c=>`<li><strong>${c.name}</strong> — ${c.role}<br><small class="muted">${c.email} · ${c.phone}</small></li>`).join("")}</ul>
        </div></div>
        <div class="card"><div class="p">
          <h3>Key Dates</h3>
          <ul>
            <li>Last Review: <strong>${data.lastReview}</strong></li>
            <li>Next Review: <strong>${data.nextReview}</strong></li>
            <li>Upcoming meeting: <strong>${(data.meetings[0] && new Date(data.meetings[0].when).toLocaleString()) || "—"}</strong></li>
          </ul>
        </div></div>
      </div>
      <div style="height:14px;"></div>
      <div class="card"><div class="p">
        <h3>Performance (relative, mock)</h3>
        ${sparkline(data.perfSpark)}
        <small class="muted">12-point series; illustrative only.</small>
      </div></div>
    `;
  }

  function drawHoldings() {
    content.innerHTML = `
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap:16px;">
        <div>
          <h3>Top 10 Positions</h3>
          <table class="table"><thead><tr><th>Name</th><th>Weight %</th></tr></thead>
            <tbody>${data.holdingsTop10.map(h=>`<tr><td>${h.name}</td><td>${h.weight.toFixed(1)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
        <div>
          <h3>Sector Weights</h3>
          <table class="table"><thead><tr><th>Sector</th><th>Weight %</th></tr></thead>
            <tbody>${data.sectorWeights.map(s=>`<tr><td>${s.sector}</td><td>${s.weight.toFixed(1)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function drawDocuments() {
    content.innerHTML = `
      <div class="row">
        <input id="docName" class="input" placeholder="Document name (e.g., Q3-Perf-Deck.pdf)" style="max-width:360px;">
        <select id="docType" class="input" style="max-width:120px;"><option>PDF</option><option>XLSX</option><option>CSV</option><option>ZIP</option></select>
        <button id="addDoc" class="btn">Add</button>
      </div>
      <div style="height:10px;"></div>
      <table class="table"><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Size</th><th>Uploaded</th></tr></thead>
        <tbody id="docsBody">${data.docs.map(rowDoc).join("")}</tbody>
      </table>
    `;
    content.querySelector("#addDoc").onclick = async () => {
      const name = content.querySelector("#docName").value.trim();
      const type = content.querySelector("#docType").value;
      if (!name) return alert("Enter a document name");
      try {
        // Use api.post for adding document
        const d = await api.post(`/clients/${encodeURIComponent(state.selectedClient)}/docs`, { name, type, size: "—" });
        data.docs.unshift(d);
        content.querySelector("#docsBody").insertAdjacentHTML("afterbegin", rowDoc(d));
        content.querySelector("#docName").value = "";
      } catch(e) { alert(e.message); }
    };
  }

  function drawNotes() {
    content.innerHTML = `
      <div class="row">
        <input id="note" class="input" placeholder="Add a note… (saved to audit trail)" />
        <button id="addNote" class="btn">Add note</button>
      </div>
      <div style="height:10px;"></div>
      <div id="notesList">
        ${data.notes.map(noteHtml).join("")}
      </div>
    `;
    content.querySelector("#addNote").onclick = async () => {
      const text = content.querySelector("#note").value.trim();
      if (!text) return;
      try {
        // Use api.post for adding a note
        const n = await api.post(`/clients/${encodeURIComponent(state.selectedClient)}/notes`, { text });
        data.notes.unshift(n);
        content.querySelector("#notesList").insertAdjacentHTML("afterbegin", noteHtml(n));
        content.querySelector("#note").value = "";
      } catch(e) { alert(e.message); }
    };
  }

  // helpers
  function kpiHtml(label, val) {
    return `<div class="card"><div class="p"><strong>${val}</strong><small class="muted">${label}</small></div></div>`;
  }
  function rowDoc(d) {
    return `<tr><td>${d.id}</td><td>${d.name}</td><td>${d.type}</td><td>${d.size}</td><td>${new Date(d.uploadedAt).toLocaleString()}</td></tr>`;
  }
  function noteHtml(n) {
    return `<div style="border:1px solid #e5e7eb; border-radius:10px; padding:8px 10px; margin-bottom:8px;">
      <div><strong>${new Date(n.ts).toLocaleString()}</strong> — <span class="muted">${n.user}</span></div>
      <div>${escapeHtml(n.text)}</div>
    </div>`;
  }
  function sparkline(arr) {
    // inline SVG sparkline
    const w = 160, h = 40, pad = 4;
    const min = Math.min(...arr), max = Math.max(...arr);
    const nx = (i) => pad + (i * (w - 2*pad)) / (arr.length - 1 || 1);
    const ny = (v) => h - pad - ((v - min) * (h - 2*pad)) / ((max - min) || 1);
    const d = arr.map((v, i) => `${i===0?"M":"L"} ${nx(i).toFixed(1)} ${ny(v).toFixed(1)}`).join(" ");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="sparkline"><path d="${d}" fill="none" stroke="#111827" stroke-width="1.5"/></svg>`;
  }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// === Mandates API ===
async function mandatesList(){ return await api.get("/mandates"); }
async function mandateGet(id){ return await api.get(`/mandates/${encodeURIComponent(id)}`); }
async function mandateCreate(payload){
  return await api.post("/mandates", payload);
}
async function mandateUpdate(id, payload){
  return await api.put(`/mandates/${encodeURIComponent(id)}`, payload);
}
async function mandateDelete(id){
  return await api.del(`/mandates/${encodeURIComponent(id)}`);
}
async function mandateBreaches(id){
  return await api.get(`/mandates/${encodeURIComponent(id)}/breaches`);
}
async function mandatePatchBreach(id, breachId, payload){
  return await api.patch(`/mandates/${encodeURIComponent(id)}/breaches/${encodeURIComponent(breachId)}`, payload);
}

// === Mandate Breaches helpers ===
async function fetchMandateDetail(id){
  return await mandateGet(id);
}

function buildBreachesPanel(mandate){
  const breaches = mandate.breaches || [];
  const el = document.createElement("div");
  el.innerHTML = breaches.length ? `
    <table class="table">
      <thead>
        <tr>
          <th style="width:140px;">Breach ID</th>
          <th>Type</th>
          <th style="width:110px;">Severity</th>
          <th style="width:100px;">Status</th>
          <th style="width:120px;">Opened</th>
          <th style="width:120px;">Resolved</th>
          <th>Note</th>
          <th style="width:150px;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${breaches.map(b => `
          <tr>
            <td>${b.id}</td>
            <td>${b.type}</td>
            <td><span class="badge ${String(b.severity||'').toLowerCase()}">${b.severity || '-'}</span></td>
            <td><span class="pill ${String(b.status||'').toLowerCase()}">${b.status || '-'}</span></td>
            <td>${b.opened ? new Date(b.opened).toLocaleDateString() : '-'}</td>
            <td>${b.resolved ? new Date(b.resolved).toLocaleDateString() : '-'}</td>
            <td>${b.note || ''}</td>
            <td>
              ${b.status === "Open" ? `<button class="btn-small" data-ack="${b.id}">Acknowledge</button>` : ""}
              ${b.status === "Acknowledged" ? `<button class="btn-small" data-resolve="${b.id}">Resolve</button>` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `<div class="muted">✅ No breaches for this mandate.</div>`;
  return el;
}

function buildMandateOverview(mandateData) {
  const el = document.createElement("div");
  el.innerHTML = `
    <div class="kv">
      <dl>
        <dt>Client</dt><dd>${mandateData.client || "-"}</dd>
        <dt>Strategy</dt><dd>${mandateData.strategy || "-"}</dd>
        <dt>AUM (AUD)</dt><dd>${mandateData.aumAud != null ? formatAUD(mandateData.aumAud) : "-"}</dd>
        <dt>Status</dt><dd>${statusPill(mandateData.status || "Active")}</dd>
        <dt>Last Update</dt><dd>${mandateData.lastUpdate || "-"}</dd>
      </dl>
    </div>
  `;
  return el;
}

  return root;
}

// --- Mandate Pipeline (compact) ---
function buildPipelineBox(pipeline = []) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <div class="section-title">Mandate Pipeline</div>
      <div class="pipeline-box"></div>
    </div>
  `;
  const box = card.querySelector(".pipeline-box");
  if (!pipeline.length){
    box.innerHTML = `<div class="subtle">No pipeline items.</div>`;
    return card;
  }
  pipeline.forEach((step, i) => {
    const { stage, due, owner, note } = step;
    const el = document.createElement("div");
    el.className = "pipeline-step" + (i === 0 ? " active" : "");
    el.innerHTML = `
      <div class="pipeline-dot" aria-hidden="true"></div>
      <div>
        <div><b>${stage || "Stage"}</b></div>
        <div class="pipeline-meta">
          ${due ? `<span class="badge">${new Date(due).toLocaleDateString()}</span>` : ""}
          ${owner ? `<span class="badge">${owner}</span>` : ""}
        </div>
        ${note ? `<div class="pipeline-note">${note}</div>` : ""}
      </div>
      <div><button class="btn-ghost" data-stage="${stage || ""}">Open</button></div>
    `;
    box.appendChild(el);
  });
  box.addEventListener("click", (e) => {
    const st = e.target?.dataset?.stage;
    if (!st) return;
    // Simple routing: RFP -> Clients; Packs/Reports -> Reports page, etc.
    if (/RFP/i.test(st)) { state.view = "clients"; render(); }
    else { state.view = "report"; state.reportCode = "PERF-ACB"; render(); }
  });
  return card;
}

async function buildPerformanceCard({ limit = 3 } = {}){
  try {
    const data = await api.get("/clients");
    const rows = (data || [])
      .map(c => ({
        name: c.name,
        perf: c.perfSpark || [1, 2, 1.5, 3, 2.5, 4, 3.5, 5, 4.5, 6, 5.5, 7],
        ytd: c.returns?.ytdPct ?? Math.random() * 10 - 5
      }))
      .slice(0, limit);

    const card = document.createElement("div");
    card.className = "card perf-compact";
    card.innerHTML = `
      <div class="p">
        <div class="flex-between">
          <div class="section-title">Performance Snapshot</div>
          <div class="perf-actions">
            <button class="btn-ghost" id="perf-all">View all</button>
          </div>
        </div>
        <table class="table">
          <thead><tr><th>Client</th><th style="width:170px;">Last 12m</th><th style="width:90px;">YTD</th><th style="width:90px;"></th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.name}</td>
                <td class="spark-cell">${sparkline(r.perf)}</td>
                <td>${r.ytd != null ? fmtPct(r.ytd) : "-"}</td>
                <td><button class="btn-ghost" data-name="${r.name}">Open</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div class="subtle sep"></div>
        <small class="subtle">Compact view shows top ${limit}. Use "View all" for the full list.</small>
      </div>
    `;

    const tb = card.querySelector("tbody");
    if (tb) {
      tb.addEventListener("click", (e) => {
        const name = e.target?.dataset?.name;
        if (!name) return;
        state.view = "report";
        state.reportCode = "PERF-ACB";
        render().catch(console.error);
      });
    }

    const perfAllBtn = card.querySelector("#perf-all");
    if (perfAllBtn) {
      perfAllBtn.onclick = () => {
        state.view = "clients";
        render().catch(console.error);
      };
    }
    return card;
  } catch (e) {
    console.error("Performance card error:", e);
    // Return fallback mock data card
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="p">
        <div class="section-title">Performance Snapshot</div>
        <table class="table">
          <thead><tr><th>Client</th><th style="width:170px;">Last 12m</th><th style="width:90px;">YTD</th></tr></thead>
          <tbody>
            <tr><td>SunSuper</td><td>Mock Data</td><td>+2.4%</td></tr>
            <tr><td>QBE Insurance</td><td>Mock Data</td><td>+1.8%</td></tr>
            <tr><td>Pacific Rail</td><td>Mock Data</td><td>+3.1%</td></tr>
          </tbody>
        </table>
        <div class="subtle">Training mode - API unavailable</div>
      </div>
    `;
    return card;
  }
}

function buildRiskOverviewCompact(risk){
  const card = document.createElement("div");
  card.className = "card";
  const te = Number(risk?.trackingErrorBps ?? 0);
  const tePct = Math.min(1, Math.abs(te) / 400);
  const var1 = Number(risk?.var95_oneDayPct ?? 0);
  const var10 = Number(risk?.var95_tenDayPct ?? 0);
  const beta = Number(risk?.beta ?? 1);
  const ir = Number(risk?.infoRatio ?? 0);
  const act = Number(risk?.activeSharePct ?? 0);

  card.innerHTML = `
    <div class="p">
      <div class="section-title">Risk Overview</div>
      <div class="risk-compact">
        <div class="risk-stat">
          <div class="risk-label">Tracking Error</div>
          <div class="risk-value">${fmtBps(te)}</div>
          <div class="risk-mini">Budget: 0–250 bps</div>
          <div class="risk-bar" style="margin-top:8px;"><span style="right:${(100 - tePct*100).toFixed(1)}%"></span></div>
        </div>
        <div class="risk-stat">
          <div class="risk-label">VaR (95%)</div>
          <div class="risk-value">${var1.toFixed(1)}% (1-day)</div>
          <div class="risk-mini">${var10.toFixed(1)}% (10-day)</div>
        </div>
        <div class="risk-stat">
          <div class="risk-label">Beta</div>
          <div class="risk-value">${beta.toFixed(2)}</div>
          <div class="risk-mini">Info Ratio ${ir.toFixed(2)}</div>
        </div>
        <div class="risk-stat">
          <div class="risk-label">Active Share</div>
          <div class="risk-value">${act.toFixed(0)}%</div>
          <div class="risk-mini">vs benchmark</div>
        </div>
      </div>

      <details class="risk-collapsible">
        <summary class="subtle">Factor Exposures (compact)</summary>
        <div style="margin-top:8px;">
          <table class="table">
            <thead><tr><th>Factor</th><th style="width:80px;">Exposure</th></tr></thead>
            <tbody>
              ${(risk?.factors || []).slice(0,8).map(f => `
                <tr>
                  <td>${f.factor}</td>
                  <td style="color:${f.exposure >= 0 ? '#065f46' : '#ef4444'}">${f.exposure.toFixed(2)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  `;
  return card;
}

// New Mandates Views
function ViewMandates() {
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <div class="flex-between">
        <h2>Mandates</h2>
        <div class="row">
          <input id="q" class="input" placeholder="Filter mandates…" style="width:240px;">
          <button id="refresh" class="btn">Refresh</button>
          <button id="newMandateBtn" class="btn primary">New Mandate</button>
        </div>
      </div>
      <div style="height:12px;"></div>
      <div style="overflow:auto;">
        <table class="table" id="tbl">
          <thead><tr>
            <th>ID</th><th>Client</th><th>Strategy</th><th>AUM (AUD)</th><th>Status</th><th>Last Update</th><th>Actions</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  root.appendChild(card);

  const tbody = card.querySelector("tbody");
  const q = card.querySelector("#q");

  function renderMandatesTable(rows){
    return rows.map(r => {
      const id = r.id || "-";
      const client = r.client || "-";
      const strategy = r.strategy || "-";
      const aum = r.aumAud != null ? formatAUD(r.aumAud) : "—";
      const status = r.status || "—";
      const updated = r.lastUpdate ? new Date(r.lastUpdate).toLocaleDateString() : "—";
      return `
        <tr>
          <td><strong>${id}</strong></td>
          <td><a class="link" href="#" data-client="${client}">${client}</a></td>
          <td>${strategy}</td>
          <td>${aum}</td>
          <td><span class="pill">${status}</span></td>
          <td>${updated}</td>
          <td style="text-align:right;">
            <button class="btn btn-small" data-open="${id}">Open</button>
          </td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="7" class="muted">No mandates.</td></tr>`;
  }

  async function load() {
    const list = await mandatesList();
    state._mandatesList = list;
    draw(list);
  }

  function draw(list) {
    tbody.innerHTML = renderMandatesTable(list);
  }

  q.oninput = () => {
    const term = q.value.trim().toLowerCase();
    const list = (state._mandatesList || []).filter(m =>
      [m.id.toString(), m.client, m.strategy].some(s => s.toLowerCase().includes(term))
    );
    draw(list);
  };

  // Event delegation for table clicks
  tbody.addEventListener("click", (e) => {
    const mandateId = e.target?.dataset?.open;
    const client = e.target?.dataset?.client;

    if (mandateId) {
      setState({ view: "mandate", selectedMandate: mandateId });
      return;
    }

    if (client) {
      e.preventDefault();
      setState({ view: "client", selectedClient: client });
      return;
    }
  });

  card.querySelector("#refresh").onclick = load;
  card.querySelector("#newMandateBtn").onclick = async () => {
    const id = prompt("Mandate ID (e.g., M-AUS-EQ-SS-002):");
    const client = id ? prompt("Client:") : null;
    const strategy = client ? prompt("Strategy:") : null;
    if (!id || !client || !strategy) return;
    try {
      await mandateCreate({ id, client, strategy, status: "Active", aumAud: 0 });
      await load();
      alert("Mandate created");
    } catch (e) {
      alert(e.message || "Failed to create mandate");
    }
  };

  load().catch(e => alert(e.message));
  return root;
}

function ViewMandateDetail() {
  const mandate = state.selectedMandate;
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const wrap = document.createElement("div");
  wrap.className = "grid";
  wrap.style.gridTemplateColumns = "1fr";
  root.appendChild(wrap);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <div class="flex-between">
        <h2>Mandate: ${mandate?.id || "New"} ${mandate?.editMode ? "(Edit)" : ""}</h2>
        <button class="btn" id="back">← All Mandates</button>
      </div>
      <div class="sep" style="margin:10px 0;"></div>
      <div id="meta" class="grid" style="grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px;"></div>

      <div id="tabs" style="margin-top:10px;">
        <div class="tab active" data-tab="overview">Overview</div>
        <div class="tab" data-tab="breaches">Breaches</div>
      </div>
      <div id="body" style="margin-top:10px;"></div>
      <div class="section">
          <div class="row">
            <button id="save" class="btn primary">Save Mandate</button>
            <button id="cancel" class="btn">Cancel</button>
          </div>
        </div>
    </div>
  `;
  wrap.appendChild(card);

  card.querySelector("#back").onclick = () => setState({ view: "mandates" });

  const content = card.querySelector("#content");
  let formData = mandate ? { ...mandate } : {};
  let currentTab = "overview";
  let mandateData = null;

  async function renderTab(tabName) {
    content.innerHTML = `<div class="muted">Loading…</div>`;
    currentTab = tabName;

    if (tabName === "breaches") {
      try {
        // Use api.get to fetch breaches
        const { breaches } = await api.get(`/mandates/${mandate.id}/breaches`);
        content.innerHTML = "";
        content.appendChild(buildBreachesPanel({ breaches }));

        // Add event handlers for breach actions
        content.addEventListener("click", async (e) => {
          const breachId = e.target?.dataset?.ack || e.target?.dataset?.resolve;
          if (!breachId) return;
          try {
            const status = e.target.dataset.ack ? "Acknowledged" : "Resolved";
            // Use api.patch for the PATCH request
            await api.patch(`/mandates/${mandate.id}/breaches/${breachId}`, { status });
            alert(`Breach ${status}`);
            // Refresh the breaches view
            const { breaches: updatedBreaches } = await api.get(`/mandates/${mandate.id}/breaches`);
            content.innerHTML = "";
            content.appendChild(buildBreachesPanel({ breaches: updatedBreaches }));
          } catch (err) {
            alert(err.message || "Update failed");
          }
        });
      } catch (e) {
        content.innerHTML = `<span style="color:#b91c1c">Error loading breaches: ${e.message}</span>`;
      }
    } else if (tabName === "overview") {
      try {
        if (!mandateData) {
          mandateData = await fetchMandateDetail(mandate.id);
        }
        content.innerHTML = "";
        content.appendChild(buildMandateOverview(mandateData));
      } catch (e) {
        content.innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
      }
      return;
    }

    if (tabName === "overview") {
      updateForm();
      return;
    }
  }

  function updateForm() {
    content.innerHTML = `
      <div class="kv">
        <dl>
          <dt>Client</dt>
          <dd>${mandate?.editMode ? `<input class="input" id="client" value="${escapeHtml(formData.client || '')}"/>` : mandate.client}</dd>
          <dt>Strategy</dt>
          <dd>${mandate?.editMode ? `<input class="input" id="strategy" value="${escapeHtml(formData.strategy || '')}"/>` : mandate.strategy}</dd>
          <dt>AUM (AUD)</dt>
          <dd>${mandate?.editMode ? `<input class="input" id="aumAud" value="${formData.aumAud || 0}"/>` : formatAUD(mandate.aumAud)}</dd>
          <dt>Status</dt>
          <dd>${mandate?.editMode ? `
            <select class="input" id="status">
              <option ${formData.status === 'Active' ? 'selected' : ''}>Active</option>
              <option ${formData.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option ${formData.status === 'Terminated' ? 'selected' : ''}>Terminated</option>
            </select>` : statusPill(mandate.status)}</dd>
          <dt>Last Update</dt>
          <dd>${mandate?.editMode ? `<input class="input" id="lastUpdate" value="${formData.lastUpdate || ''}"/>` : mandate.lastUpdate}</dd>
        </dl>
      </div>
    `;
    if (mandate?.editMode) {
      content.querySelectorAll("input, select").forEach(el => {
        el.oninput = () => { formData[el.id] = el.value; };
      });
    }
  }

  // Tab click handler
  if (!mandate?.editMode) {
    card.addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (!t) return;
      card.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      renderTab(t.dataset.tab);
    });
  }

  if (!mandate) {
    // Mock data for new mandate
    formData = { id: Date.now(), client: "", strategy: "", aumAud: 0, status: "Pending", lastUpdate: new Date().toISOString().split('T')[0] };
    updateForm();
  } else if (!mandate.editMode) {
    // Fetch actual data and render overview tab
    (async()=>{
      try {
        mandateData = await api.get(`/mandates/${mandate.id}`);
        Object.assign(formData, mandateData);
        renderTab("overview");
      } catch(e) {
        content.innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
      }
    })();
  } else {
    // Edit mode
    (async()=>{
      try {
        const data = await api.get(`/mandates/${mandate.id}`);
        Object.assign(formData, data);
        updateForm();
      } catch(e) {
        content.innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
      }
    })();
  }

  if (mandate?.editMode) {
    card.querySelector("#save").onclick = async () => {
      const method = mandate.id ? "PUT" : "POST";
      const path = mandate.id ? `/mandates/${mandate.id}` : "/mandates";
      try {
        const updated = await api[method.toLowerCase()](path, formData);
        alert("Mandate saved successfully!");
        setState({ view: "mandates", selectedMandate: null, editMode: false });
      } catch (e) {
        alert(`Error saving mandate: ${e.message}`);
      }
    };
    card.querySelector("#cancel").onclick = () => {
      setState({ view: "mandates", selectedMandate: null, editMode: false });
    };
  }

  return root;
}


function openApprovalById(id) {
  setState({ view: "dashboard", drawerOpen: false, drawerItem: null, highlightApprovalId: id });
  loadDashboard(id, false, false);
}

function openApprovalsPending() {
  setState({ view: "dashboard", drawerOpen: false, drawerItem: null });
  loadDashboard(undefined, true, true);
}

// Global function for mandate links
window.viewMandate = (id) => setState({ view: "mandate", selectedMandate: id });

async function ViewAdmin(){
  // Role gate
  const me = await fetchMe();
  if (!me || me.role !== "Admin") {
    const root = document.createElement("div");
    root.className = "container";
    root.appendChild(topNav());
    const wrap = document.createElement("div"); wrap.className = "layout"; root.appendChild(wrap);
    wrap.appendChild(sidebar());
    const main = document.createElement("div"); main.className = "main"; wrap.appendChild(main);
    const card = document.createElement("div"); card.className = "card";
    card.innerHTML = `<div class="p"><h2>Forbidden</h2><div class="muted">You don't have permission to access Admin.</div></div>`;
    main.appendChild(card);
    return root;
  }
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const wrap = document.createElement("div");
  wrap.className = "layout";
  root.appendChild(wrap);

  // Sidebar
  wrap.appendChild(sidebar());

  // Main
  const main = document.createElement("div");
  main.className = "main";
  wrap.appendChild(main);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <div class="flex-between">
        <h2>Admin</h2>
        <small class="muted">Manage users, flags, logs & health</small>
      </div>
      <div class="tabs" id="tabs">
        <div class="tab active" data-tab="users">Users</div>
        <div class="tab" data-tab="flags">Feature Flags</div>
        <div class="tab" data-tab="audit">Audit Log</div>
        <div class="tab" data-tab="health">System Health</div>
      </div>
      <div id="body" style="margin-top:10px;"></div>
    </div>
  `;
  main.appendChild(card);

  const tabs = card.querySelector("#tabs");
  const body = card.querySelector("#body");

  async function showUsers(){
    body.innerHTML = `<div class="muted">Loading users…</div>`;
    try {
      const { users=[] } = await adminGetUsers();
      body.innerHTML = `
        <table class="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th style="width:160px;"></th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${u.name || "-"}</td>
                <td>${u.email || "-"}</td>
                <td>${u.role || "Analyst"}</td>
                <td>
                  <div class="inline">
                    <select data-email="${u.email}">
                      ${["Analyst","Coverage","Risk","Admin"].map(r => `<option ${r===(u.role||"Analyst")?"selected":""}>${r}</option>`).join("")}
                    </select>
                    <button class="btn" data-action="set-role" data-email="${u.email}">Save</button>
                  </div>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      `;
      body.querySelector("tbody").addEventListener("click", async (e) => {
        if (e.target?.dataset?.action === "set-role"){
          const email = e.target.dataset.email;
          const sel = body.querySelector(`select[data-email="${CSS.escape(email)}"]`);
          const role = sel?.value;
          e.target.disabled = true;
          try {
            await adminSetUserRole(email, role);
            toast("Saved");
          } catch(err){
            alert(err.message || "Failed to update role");
          } finally {
            e.target.disabled = false;
          }
        }
      });
    } catch(e){
      body.innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
    }
  }

  async function showFlags(){
    body.innerHTML = `<div class="muted">Loading flags…</div>`;
    try {
      const { flags={} } = await adminGetFlags();
      body.innerHTML = `
        <div class="grid" style="grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px;">
          ${Object.keys(flags).map(k => `
            <div class="card" style="border:1px solid var(--line);">
              <div class="p">
                <div class="flex-between">
                  <b>${k}</b>
                  <label class="switch">
                    <input type="checkbox" data-flag="${k}" ${flags[k] ? "checked": ""}/>
                    <span class="slider"></span>
                  </label>
                </div>
                <small class="muted">Toggle ${k}</small>
              </div>
            </div>`).join("")}
        </div>
        <div style="margin-top:10px;">
          <button class="btn" id="saveFlags">Save Changes</button>
        </div>
      `;
      body.querySelector("#saveFlags").onclick = async () => {
        const inputs = body.querySelectorAll("input[data-flag]");
        const payload = {};
        inputs.forEach(i => payload[i.dataset.flag] = i.checked);
        try {
          await adminSetFlags(payload);
          toast("Flags updated");
        } catch(e){ alert(e.message || "Failed to update flags"); }
      };
    } catch(e){
      body.innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
    }
  }

  async function showAudit(){
    body.innerHTML = `<div class="muted">Loading audit…</div>`;
    try {
      const { audit=[] } = await adminGetAudit();
      body.innerHTML = `
        <table class="table">
          <thead><tr><th style="width:110px;">ID</th><th style="width:160px;">Time</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            ${audit.map(a => `
              <tr>
                <td>${a.id}</td>
                <td>${new Date(a.ts).toLocaleString()}</td>
                <td>${a.actor}</td>
                <td>${a.action}</td>
                <td>${a.detail || ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      `;
    } catch(e){
      body.innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
    }
  }

  async function showHealth(){
    body.innerHTML = `<div class="muted">Loading health…</div>`;
    try {
      const h = await adminGetHealth();
      body.innerHTML = `
        <div class="grid" style="grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px;">
          <div class="card"><div class="p"><b>Status</b><div>${h.status}</div></div></div>
          <div class="card"><div class="p"><b>Uptime</b><div>${h.uptimeSec}s</div></div></div>
          <div class="card"><div class="p"><b>Booted</b><div>${new Date(h.bootedAt).toLocaleString()}</div></div></div>
          <div class="card"><div class="p"><b>Version</b><div>${h.version}</div></div></div>
          <div class="card"><div class="p"><b>Node</b><div>${h.node}</div></div></div>
          <div class="card"><div class="p"><b>Env</b><div>PORT=${h.env.PORT} / NODE_ENV=${h.env.NODE_ENV}</div></div></div>
        </div>
      `;
    } catch(e){
      body.innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
    }
  }

  async function setTab(name){
    tabs.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    tabs.querySelector(`.tab[data-tab="${name}"]`)?.classList.add("active");
    if (name === "users") return showUsers();
    if (name === "flags") return showFlags();
    if (name === "audit") return showAudit();
    if (name === "health") return showHealth();
  }

  tabs.addEventListener("click", (e) => {
    const el = e.target.closest(".tab");
    if (!el) return;
    setTab(el.dataset.tab);
  });

  setTab("users");
  return root;
}

function ViewRfps(){
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const wrap = document.createElement("div");
  wrap.className = "layout";
  root.appendChild(wrap);

  wrap.appendChild(sidebar());

  // Main
  const main = document.createElement("div");
  main.className = "main";
  wrap.appendChild(main);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <div class="flex-between">
        <h2>RFPs</h2>
        <div class="inline">
          <input id="q" placeholder="Search id/title…" style="width: 220px;">
          <select id="stage">
            <option value="">All stages</option>
            ${["Draft","Internal Review","Client Review","Submitted","Won","Lost"].map(s=>`<option>${s}</option>`).join("")}
          </select>
          <button class="btn" id="new">New RFP</button>
        </div>
      </div>
      <div style="height:10px;"></div>
      <table class="table">
        <thead>
          <tr><th style="width:160px;">ID</th><th>Title</th><th style="width:160px;">Client</th><th style="width:150px;">Stage</th><th style="width:120px;">Due</th><th style="width:120px;"></th></tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  `;
  main.appendChild(card);

  const rows = card.querySelector("#rows");
  const q = card.querySelector("#q");
  const stage = card.querySelector("#stage");

  async function refresh(){
    rows.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;
    try {
      // Use api.get to fetch RFPs
      const { rfps=[] } = await rfpList({ q: q.value, stage: stage.value });
      rows.innerHTML = rfps.map(r => `
        <tr>
          <td>${r.id}</td>
          <td>${r.title}</td>
          <td>${r.client}</td>
          <td><span class="pill">${r.stage}</span></td>
          <td>${r.due || "-"}</td>
          <td><button class="btn-ghost" data-id="${r.id}">Open</button></td>
        </tr>
      `).join("") || `<tr><td colspan="6" class="muted">No RFPs</td></tr>`;
    } catch(e){
      rows.innerHTML = `<tr><td colspan="6" style="color:#b91c1c">${e.message}</td></tr>`;
    }
  }

  q.oninput = () => refresh();
  stage.onchange = () => refresh();
  refresh();

  // New RFP (tiny inline dialog)
  card.querySelector("#new").onclick = async () => {
    const id = prompt("RFP ID (e.g., RFP-SS-24Q3):");
    const client = id ? prompt("Client (e.g., SunSuper):") : null;
    const title = client ? prompt("Title:") : null;
    if (!id || !client || !title) return;
    try {
      // Use api.post to create RFP
      await rfpCreate({ id, client, title }); await refresh();
    }
    catch(e){ alert(e.message || "Failed to create RFP"); }
  };

  // Open detail
  rows.addEventListener("click", async (e) => {
    const id = e.target?.dataset?.id;
    if (!id) return;
    state.view = "rfp";
    state.rfpId = id;
    render();
  });

  return root;
}

function ViewRfpDetail(){
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const wrap = document.createElement("div");
  wrap.className = "layout";
  root.appendChild(wrap);

  wrap.appendChild(sidebar());

  const main = document.createElement("div");
  main.className = "main";
  wrap.appendChild(main);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <div class="flex-between">
        <h2>RFP: <span id="rid"></span></h2>
        <button class="btn" id="back">← All RFPs</button>
      </div>
      <div class="sep" style="margin:10px 0;"></div>
      <div id="meta" class="grid" style="grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px;"></div>

      <div class="tabs" id="tabs" style="margin-top:10px;">
        <div class="tab active" data-tab="overview">Overview</div>
        <div class="tab" data-tab="notes">Notes</div>
        <div class="tab" data-tab="checklist">Checklist</div>
        <div class="tab" data-tab="attachments">Attachments</div>
      </div>
      <div id="body" style="margin-top:10px;"></div>
    </div>
  `;
  main.appendChild(card);

  const rid = card.querySelector("#rid");
  const meta = card.querySelector("#meta");
  const body = card.querySelector("#body");
  const tabs = card.querySelector("#tabs");

  card.querySelector("#back").onclick = () => { state.view = "rfps"; render(); };

  async function load(){
    try {
      // Use api.get to fetch RFP details
      const r = await rfpGet(state.rfpId);
      rid.textContent = r.id;
      meta.innerHTML = `
        <div class="card"><div class="p"><b>Title</b><div>${r.title}</div></div></div>
        <div class="card"><div class="p"><b>Client</b><div>${r.client}</div></div></div>
        <div class="card"><div class="p"><b>Owner</b><div>${r.owner}</div></div></div>
        <div class="card"><div class="p"><b>Stage</b>
          <div class="inline">
            <select id="stageSel">
              ${["Draft","Internal Review","Client Review","Submitted","Won","Lost"].map(s=>`<option ${s===r.stage?"selected":""}>${s}</option>`).join("")}
            </select>
            <button class="btn" id="saveStage">Save</button>
          </div>
        </div></div>
        <div class="card"><div class="p"><b>Due</b><div>${r.due || "-"}</div></div></div>
        <div class="card"><div class="p"><b>Updated</b><div>${new Date(r.lastUpdated).toLocaleString()}</div></div></div>
      `;

      async function renderTab(name){
        if (name === "overview") {
          body.innerHTML = `
            <div class="muted">Use the controls above to manage stage. Other sections are in the tabs.</div>
          `;
          return;
        }
        if (name === "notes"){
          body.innerHTML = `
            <div class="inline">
              <input id="noteText" placeholder="Add a note..." style="width: 60%;">
              <button class="btn" id="addNote">Add</button>
            </div>
            <div style="height:8px;"></div>
            <div id="notesList"></div>
          `;
          const list = body.querySelector("#notesList");
          list.innerHTML = (r.notes || []).map(n => `
            <div class="card"><div class="p">
              <div class="muted">${new Date(n.ts).toLocaleString()} — ${n.user}</div>
              <div>${n.text}</div>
            </div></div>
          `).join("") || `<div class="muted">No notes.</div>`;
          body.querySelector("#addNote").onclick = async () => {
            const t = body.querySelector("#noteText").value.trim();
            if (!t) return;
            // Use api.post to add a note
            const note = await rfpAddNote(r.id, t);
            const list = body.querySelector("#notesList");
            list.insertAdjacentHTML("afterbegin",
              `<div class="card"><div class="p">
                <div class="muted">${new Date(note.ts).toLocaleString()} — ${note.user}</div>
                <div>${note.text}</div>
              </div></div>`
            );
            body.querySelector("#noteText").value = "";
            toast("Note added");
          };
          return;
        }
        if (name === "checklist"){
          body.innerHTML = `
            <table class="table">
              <thead><tr><th>Item</th><th style="width:120px;">Done</th></tr></thead>
              <tbody>${(r.checklist || []).map(c => `
                <tr>
                  <td>${c.key}</td>
                  <td>
                    <label class="switch">
                      <input type="checkbox" data-key="${c.key}" ${c.done ? "checked" : ""}/>
                      <span class="slider"></span>
                    </label>
                  </td>
                </tr>`).join("")}
              </tbody>
            </table>
          `;
          body.querySelector("tbody").addEventListener("change", async (e) => {
            const key = e.target?.dataset?.key;
            if (!key) return;
            const done = !!e.target.checked;
            try {
              // Use api.put for the PUT request
              await rfpToggleChecklist(r.id, key, done);
              toast("Checklist updated");
            } catch (err) {
              alert(err.message || "Failed to update");
              e.target.checked = !done; // revert UI on error
            }
          });
          return;
        }
        if (name === "attachments"){
          body.innerHTML = `
            <div class="inline">
              <input id="attName" placeholder="File name (e.g., Perf-Appendix.pdf)" style="width: 280px;">
              <select id="attType">
                <option>PDF</option><option>DOCX</option><option>XLSX</option><option>PPTX</option>
              </select>
              <input id="attSize" placeholder="Size (e.g., 1.2 MB)" style="width: 120px;">
              <button class="btn" id="addAtt">Add</button>
            </div>
            <div style="height:10px;"></div>
            <table class="table">
              <thead><tr><th>Name</th><th style="width:90px;">Type</th><th style="width:100px;">Size</th><th style="width:140px;">Uploaded</th></tr></thead>
              <tbody id="attRows">
                ${(r.attachments || []).map(a => `
                  <tr><td>${a.name}</td><td>${a.type}</td><td>${a.size}</td><td>${new Date(a.uploadedAt).toLocaleString()}</td></tr>
                `).join("")}
              </tbody>
            </table>
          `;
          const rows = body.querySelector("#attRows");
          body.querySelector("#addAtt").onclick = async () => {
            const name = body.querySelector("#attName").value.trim();
            const type = body.querySelector("#attType").value;
            const size = body.querySelector("#attSize").value.trim() || "—";
            if (!name) return alert("Enter a file name");
            try {
              // Use api.post for adding attachment
              const a = await rfpAddAttachment(r.id, { name, type, size });
              rows.insertAdjacentHTML("afterbegin",
                `<tr><td>${a.name}</td><td>${a.type}</td><td>${a.size}</td><td>${new Date(a.uploadedAt).toLocaleString()}</td></tr>`
              );
              toast("Attachment added");
              body.querySelector("#attName").value = "";
              body.querySelector("#attSize").value = "";
            } catch (err) {
              alert(err.message || "Failed to add attachment");
            }
          };
          return;
        }
      }

      // Tab wiring
      tabs.addEventListener("click", (e) => {
        const t = e.target.closest(".tab");
        if (!t) return;
        tabs.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        renderTab(t.dataset.tab);
      });
      await renderTab("overview");

      // Save stage
      card.querySelector("#saveStage").onclick = async () => {
        const val = card.querySelector("#stageSel").value;
        // Use api.put for the PUT request
        await rfpSetStage(r.id, val);
        toast("RFP stage updated");
        state.view = "rfp"; render();
      };

    } catch(e){
      main.innerHTML = `<div class="card"><div class="p" style="color:#b91c1c">${e.message}</div></div>`;
    }
  }

  load();
  return root;
}

function ViewPortfolioRisk() {
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const main = document.createElement("div");
  main.className = "grid";
  main.style.gridTemplateColumns = "2fr 1fr";
  main.style.gap = "16px";

  // Main content card
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="p">
      <div id="content"><small class="muted">Loading Portfolio Risk data…</small></div>
    </div>
  `;

  // Sidebar card
  const sidebar = document.createElement("div");
  sidebar.className = "card";
  sidebar.innerHTML = `
    <div class="p">
      <div id="sidebar"><small class="muted">Loading…</small></div>
    </div>
  `;

  main.appendChild(card);
  main.appendChild(sidebar);
  root.appendChild(main);

  const content = card.querySelector("#content");
  const sidebarContent = sidebar.querySelector("#sidebar");

  // Helper function to create progress bars
  function createBar(value, max = 5, color = "#0ea5e9") {
    const width = Math.min(100, Math.abs(value) / max * 100);
    const bg = value >= 0 ? color : "#ef4444";
    return `
      <div style="background: #374151; border: 1px solid #4b5563; height: 8px; border-radius: 4px; overflow: hidden; width: 100%; margin-top: 2px;">
        <div style="width: ${width}%; height: 100%; background: ${bg};"></div>
      </div>
    `;
  }

  (async () => {
    try {
      // Use api.get to fetch portfolio risk data
      const data = await api.get("/reports/RISK-PORTFOLIO");
      const m = data.metrics || {};
      const sectors = data.sectorExposures || [];
      const factors = data.factorExposures || [];
      const contrib = data.topContributorsBps || [];
      const scenarios = data.scenarios || [];

      content.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px;">
          <div>
            <h2 style="margin: 0;">Portfolio Risk — ${data.portfolio?.name}</h2>
            <small class="muted">Benchmark: ${data.portfolio?.benchmark}</small>
          </div>
          <small class="muted">As of: ${new Date(data.asOf).toLocaleString()}</small>
        </div>

        <!-- KPI Cards -->
        <div class="grid" style="grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px;">
          <div class="card" style="text-align: center; padding: 12px;">
            <div class="muted" style="font-size: 12px;">Tracking Error</div>
            <div style="font-weight: 700; font-size: 20px; margin-top: 4px;">${fmtPct(m.trackingErrorPct)}</div>
          </div>
          <div class="card" style="text-align: center; padding: 12px;">
            <div class="muted" style="font-size: 12px;">Beta</div>
            <div style="font-weight: 700; font-size: 20px; margin-top: 4px;">${m.beta?.toFixed(2)}</div>
          </div>
          <div class="card" style="text-align: center; padding: 12px;">
            <div class="muted" style="font-size: 12px;">VaR 95% (1d)</div>
            <div style="font-weight: 700; font-size: 20px; margin-top: 4px;">${fmtPct(m.var95_oneDayPct)}</div>
          </div>
          <div class="card" style="text-align: center; padding: 12px;">
            <div class="muted" style="font-size: 12px;">Active Share</div>
            <div style="font-weight: 700; font-size: 20px; margin-top: 4px;">${fmtPct(m.activeSharePct)}</div>
          </div>
        </div>

        <!-- Sector & Factor Tables -->
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div class="card">
            <div class="p">
              <h3 style="margin: 0 0 12px 0;">Sector exposures</h3>
              <table class="table">
                <thead>
                  <tr><th>Sector</th><th>Port</th><th>Bench</th><th>Active</th><th style="width: 60px;"></th></tr>
                </thead>
                <tbody>
                  ${sectors.map(s => `
                    <tr>
                      <td>${s.sector}</td>
                      <td>${fmtPct(s.portWtPct)}</td>
                      <td>${fmtPct(s.benchWtPct)}</td>
                      <td style="color: ${s.activePct >= 0 ? '#10b981' : '#ef4444'}">${fmtPct(s.activePct)}</td>
                      <td>${createBar(s.activePct, 5)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="p">
              <h3 style="margin: 0 0 12px 0;">Factor exposures</h3>
              <table class="table">
                <thead>
                  <tr><th>Factor</th><th>Exposure</th><th style="width: 60px;"></th></tr>
                </thead>
                <tbody>
                  ${factors.map(f => `
                    <tr>
                      <td>${f.factor}</td>
                      <td style="color: ${f.exposure >= 0 ? '#10b981' : '#ef4444'}">${f.exposure.toFixed(2)}</td>
                      <td>${createBar(f.exposure, 0.5, "#8b5cf6")}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Contributors & Scenarios -->
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div class="card">
            <div class="p">
              <h3 style="margin: 0 0 12px 0;">Top contributors (bps)</h3>
              <ul style="list-style: none; padding: 0; margin: 0;">
                ${contrib.map(c => `
                  <li style="margin-bottom: 6px; color: ${c.contribBps >= 0 ? '#e5e7eb' : '#ef4444'};">
                    ${c.name} — <strong>${fmtBps(c.contribBps)}</strong>
                  </li>
                `).join("")}
              </ul>
            </div>
          </div>

          <div class="card">
            <div class="p">
              <h3 style="margin: 0 0 12px 0;">Scenarios</h3>
              <table class="table">
                <thead>
                  <tr><th>Scenario</th><th>Shock</th><th>PnL (bps)</th></tr>
                </thead>
                <tbody>
                  ${scenarios.map(s => `
                    <tr>
                      <td>${s.name}</td>
                      <td><small class="muted">${s.shock}</small></td>
                      <td style="color: ${s.pnlBps >= 0 ? '#10b981' : '#ef4444'}">${fmtBps(s.pnlBps)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 8px;">
          <button class="btn" onclick="alert('Download CSV - Mock functionality')">Download CSV</button>
          <button class="btn" onclick="alert('Export PDF - Mock functionality')">Export PDF</button>
        </div>
      `;

      sidebarContent.innerHTML = `
        <h3 style="margin: 0 0 12px 0;">Portfolio Info</h3>
        <div class="kv">
          <div><strong>AUM:</strong> ${fmtAUD(data.portfolio?.aumAud || 0)}</div>
          <div><strong>Name:</strong> ${data.portfolio?.name}</div>
          <div><strong>Benchmark:</strong> ${data.portfolio?.benchmark}</div>
        </div>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #374151;">
          <small class="muted">All figures are mock and for training purposes only.</small>
        </div>
      `;

    } catch (e) {
      content.innerHTML = `<div style="color: #ef4444;">Error loading Portfolio Risk data: ${e.message}</div>`;
      sidebarContent.innerHTML = `<div style="color: #ef4444;">Error</div>`;
    }
  })();

  return root;
}

// Check authentication on load
(async function initAuth() {
  // Only run auth check if we're on the main app page (not login pages)
  if (location.pathname === "/login.html" || location.pathname === "/login-password.html") {
    return;
  }

  // Only run if we're on the main app page or root
  if (location.pathname !== "/" && location.pathname !== "/index.html") {
    return;
  }

  const token = window.api?.getToken();
  if (!token) {
    // No token, redirect to login
    location.href = "/login.html";
    return;
  }

  // Has token, set initial state
  try {
    const user = await fetchMe();
    if (user) {
      setState({ token, user, view: "dashboard" });
      await loadDashboard();
    } else {
      // Invalid token
      window.api.clearToken();
      location.href = "/login.html";
      return;
    }
  } catch (e) {
    // Token validation failed
    window.api.clearToken();
    location.href = "/login.html";
    return;
  }

  // Render the app
  await render();
})();