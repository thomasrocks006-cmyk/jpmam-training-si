// Minimal front-end using vanilla JS + fetch to the API in this project.
// Branding is mock: "JPMorgan (Training)" / "JPMorgan Asset Management (Training)".

const API = window.API_BASE;

const state = {
  token: null,
  user: null,
  // search UI
  query: "",
  suggestions: [],
  activeIndex: -1,
  // approvals
  approvals: [],
  // view routing
  view: "auth", // auth -> mfa -> dashboard | client | report | profile
  selectedClient: null,
  selectedReport: null,
  // drawer
  drawerOpen: false,
  drawerItem: null,
  drawerTab: "details"
};

function setState(next) {
  Object.assign(state, next);
  render();
}

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

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
            <a class="link" id="forgot">Forgot password?</a>
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
      const { token, user } = await api("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
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

async function loadDashboard() {
  try {
    const approvals = await api("/approvals");
    setState({ approvals });
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
        <button id="notifBtn" class="btn">🔔</button>

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
      localStorage.removeItem("token");
      setState({ token: null, user: null, view: "auth" });
    }
    setMenu(false);
  };

  // Close on outside click
  document.addEventListener("click", (ev) => {
    const within = ev.target === youBtn || youMenu.contains(ev.target);
    if (!within) setMenu(false);
  });

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
  el.innerHTML = `
    <div class="card"><div class="p">
      <div class="row"><span>🏠</span> Home</div>
      <div class="row" style="margin-top:8px;"><span>📊</span> Dashboard</div>
      <div class="row link" id="clientsLink" style="margin-top:8px;"><span>👥</span> Clients</div>
      <div class="row" style="margin-top:8px;"><span>📈</span> Mandates</div>
      <div class="row" style="margin-top:8px;"><span>💼</span> RFPs</div>
      <div class="row" style="margin-top:8px;"><span>🛡️</span> Portfolio Risk</div>
      <div class="row" style="margin-top:8px;"><span>⚙️</span> Admin</div>
    </div></div>
  `;
  el.querySelector("#clientsLink").onclick = () => setState({ view: "clients" });
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
      const updated = await api(`/approvals/${a.id}/approve`, { method: "POST" });
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
      const updated = await api(`/approvals/${a.id}/approve`, { method: "POST" });
      const idx = state.approvals.findIndex(x => x.id === a.id);
      state.approvals[idx] = updated;
      setState({ drawerItem: updated, drawerTab: "audit" });
    } catch (e) { alert(e.message); }
  };

  d.querySelector("#changes").onclick = async () => {
    try {
      const ev = await api(`/approvals/${a.id}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "Requested changes", meta: "Assigned to Legal QA" })
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

  // Main content
  const main = document.createElement("div");
  main.className = "grid";
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

  // Approvals and Activity
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
    const filt = approvalsCard.querySelector("#filt").value;
    tbody.innerHTML = "";
    state.approvals
      .filter(a => (filt==="All" ? true : a.status === filt))
      .filter(a => [a.id,a.requester,a.dept].some(s => s.toLowerCase().includes(state.query.toLowerCase())))
      .forEach(a => tbody.appendChild(ApprovalRow(a)));
  };
  approvalsCard.querySelector("#filt").onchange = drawRows;
  drawRows();

  // Client & Portfolio Activity (simple)
  const activity = document.createElement("div");
  activity.className = "card";
  activity.innerHTML = `
    <div class="p">
      <h3>Client & Portfolio Activity</h3>
      <ul>
        <li>Client meeting set: SunSuper (Performance Review) · MEET-SUSU</li>
        <li>RFP draft uploaded for QBE Insurance LDI · RFP-QBE</li>
        <li>Quarterly factsheet generated: Aus Core Bond · FS-ACB</li>
        <li>Mandate change request: Real Assets tilt · MCR-RA</li>
      </ul>
    </div>
  `;
  main.appendChild(activity);

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

  const r = state.selectedReport || { label:"Report", hint:"" };
  const code = (r.hint || "").toString();

  const main = document.createElement("div");
  main.className = "card";
  main.innerHTML = `<div class="p"><h2>Report: ${r.label}</h2><div id="body"><small class="muted">Loading…</small></div></div>`;
  root.appendChild(main);

  (async()=>{
    try{
      const data = await api(`/reports/${encodeURIComponent(code)}`);
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

  const main = document.createElement("div");
  main.className = "card";
  main.innerHTML = `
    <div class="p">
      <h2>Profile & Settings</h2>
      <div id="body"><small class="muted">Loading…</small></div>
      <div style="height:16px;"></div>
      <h3>Preferences</h3>
      <div class="row">
        <label><input type="checkbox" checked> Email notifications</label>
        <label><input type="checkbox" checked> Desktop notifications</label>
        <label><input type="checkbox"> Dark theme (mock)</label>
      </div>
    </div>
  `;
  root.appendChild(main);

  (async()=>{
    try{
      const me = await api("/auth/me");
      const body = main.querySelector("#body");
      body.innerHTML = `
        <div class="grid" style="grid-template-columns: repeat(3,minmax(0,1fr));">
          <div>
            <small class="muted">Name</small><div><strong>${me.name}</strong></div>
            <small class="muted">DOB</small><div>${me.dob}</div>
            <small class="muted">Sex</small><div>${me.sex}</div>
          </div>
          <div>
            <small class="muted">Role</small><div>${me.role}</div>
            <small class="muted">Department</small><div>${me.department}</div>
            <small class="muted">Employee ID</small><div>${me.employeeId}</div>
          </div>
          <div>
            <small class="muted">Manager</small><div>${me.manager}</div>
            <small class="muted">Office</small><div>${me.office}</div>
            <small class="muted">Phone</small><div>${me.phone}</div>
          </div>
        </div>
        <div style="height:12px;"></div>
        <h3>Security</h3>
        <ul>
          <li>MFA Devices: ${me.mfaDevices.join(", ")}</li>
          <li>Last login: ${new Date().toLocaleString()}</li>
        </ul>
      `;
    } catch(e){
      main.querySelector("#body").innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
    }
  })();

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
    const list = await api("/clients");
    state._clientsList = list;
    draw(list);
  }
  function draw(list) {
    tbody.innerHTML = "";
    list.forEach(c => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><a class="link" href="#">${c.name}</a></td>
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
      data = await api(`/clients/${encodeURIComponent(name)}`);
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
        <tbody id="docsBody">${data.docs.map(d=>rowDoc(d)).join("")}</tbody>
      </table>
    `;
    content.querySelector("#addDoc").onclick = async () => {
      const name = content.querySelector("#docName").value.trim();
      const type = content.querySelector("#docType").value;
      if (!name) return alert("Enter a document name");
      try {
        const d = await api(`/clients/${encodeURIComponent(state.selectedClient)}/docs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, type, size: "—" })
        });
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
        ${data.notes.map(n=>noteHtml(n)).join("")}
      </div>
    `;
    content.querySelector("#addNote").onclick = async () => {
      const text = content.querySelector("#note").value.trim();
      if (!text) return;
      try {
        const n = await api(`/clients/${encodeURIComponent(state.selectedClient)}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });
        data.notes.unshift(n);
        content.querySelector("#notesList").insertAdjacentHTML("afterbegin", noteHtml(n));
        content.querySelector("#note").value = "";
      } catch(e) { alert(e.message); }
    };
  }

  // helpers
  function kpiHtml(label, val) {
    return `<div class="card"><div class="p"><small class="muted">${label}</small><h3>${val}</h3></div></div>`;
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
    const w = 320, h = 60, pad = 6;
    const min = Math.min(...arr), max = Math.max(...arr);
    const nx = (i) => pad + (i * (w - 2*pad)) / (arr.length - 1 || 1);
    const ny = (v) => h - pad - ((v - min) * (h - 2*pad)) / ((max - min) || 1);
    const d = arr.map((v, i) => `${i===0?"M":"L"} ${nx(i).toFixed(1)} ${ny(v).toFixed(1)}`).join(" ");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="sparkline"><path d="${d}" fill="none" stroke="#111827" stroke-width="2"/></svg>`;
  }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  return root;
}

// ---------- Root render ----------
function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  let view;
  if (state.view === "auth") view = ViewAuth();
  else if (state.view === "mfa") view = ViewMfa();
  else if (state.view === "dashboard") view = DashboardMain();
  else if (state.view === "clients") view = ViewClients();
  else if (state.view === "client") view = ViewClientDetail();
  else if (state.view === "report") view = ViewReportDetail();
  else if (state.view === "profile") view = ViewProfile();
  app.appendChild(view);
}

// initial
render();

