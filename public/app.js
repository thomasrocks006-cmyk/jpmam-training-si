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
    <div class="layout" style="grid-template-columns: 1fr;">
      <div class="card"><div class="p">
        <h2 style="margin-bottom:6px;">JPMorgan (Training)</h2>
        <small class="muted">Employee Access Portal — Asset Management</small>
        <div style="height:12px;"></div>
        <div>
          <label>Username or Email</label>
          <input id="email" class="input" placeholder="firstname.lastname@company"/>
        </div>
        <div style="height:10px;"></div>
        <div>
          <label>Password</label>
          <input id="password" class="input" type="password" placeholder="••••••••"/>
        </div>
        <div style="height:12px;"></div>
        <button id="loginBtn" class="btn primary">Sign in</button>
        <div style="height:8px;"></div>
        <small class="muted">By signing in you agree to JPMorgan (Training)'s acceptable use & security policy.</small>
      </div></div>
    </div>
  `;
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
      <div class="brand">JPMorgan (Training)</div>
      <div class="searchbox">
        <input id="search" placeholder="Search mandates, clients, reports… (press / to focus)" />
        <ul id="suggest" class="suggest" style="display:none"></ul>
      </div>
      <div class="toolbar">
        <button id="newBtn" class="btn">New</button>
        <button id="notifBtn" class="btn">🔔</button>
        <div class="row">
          <button id="youBtn" class="btn">You ▾</button>
        </div>
      </div>
    </div>
  `;

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

  // '/' focuses search
  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });

  el.querySelector("#youBtn").onclick = () => {
    setState({ view: "profile" });
  };

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
      <div class="row" style="margin-top:8px;"><span>👥</span> Clients</div>
      <div class="row" style="margin-top:8px;"><span>📈</span> Mandates</div>
      <div class="row" style="margin-top:8px;"><span>💼</span> RFPs</div>
      <div class="row" style="margin-top:8px;"><span>🛡️</span> Portfolio Risk</div>
      <div class="row" style="margin-top:8px;"><span>⚙️</span> Admin</div>
    </div></div>
  `;
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

function ViewClientDetail() {
  const root = document.createElement("div");
  root.className = "container";
  root.appendChild(topNav());

  const main = document.createElement("div");
  main.className = "card";
  main.innerHTML = `<div class="p"><h2>Client: ${state.selectedClient}</h2><div id="body"><small class="muted">Loading…</small></div></div>`;
  root.appendChild(main);

  (async()=>{
    try{
      const data = await api(`/clients/${encodeURIComponent(state.selectedClient)}`);
      const body = main.querySelector("#body");
      body.innerHTML = `
        <div class="grid" style="grid-template-columns: repeat(3,minmax(0,1fr));">
          <div><small class="muted">Type</small><div><strong>${data.type}</strong></div></div>
          <div><small class="muted">Strategies</small><div>${data.strategies.join(", ")}</div></div>
          <div><small class="muted">SLA</small><div>${data.sla}</div></div>
        </div>
        <div style="height:12px;"></div>
        <h3>Upcoming</h3>
        <ul>
          ${data.meetings.map(m=>`<li>${new Date(m.when).toLocaleString()} — ${m.topic}</li>`).join("")}
        </ul>
        <h3>Pipeline</h3>
        <ul>
          ${data.pipeline.map(p=>`<li>${p.stage} — <span class="muted">Due ${p.due}</span></li>`).join("")}
        </ul>
      `;
    } catch(e){
      main.querySelector("#body").innerHTML = `<span style="color:#b91c1c">${e.message}</span>`;
    }
  })();

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

// ---------- Root render ----------
function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  let view;
  if (state.view === "auth") view = ViewAuth();
  else if (state.view === "mfa") view = ViewMfa();
  else if (state.view === "dashboard") view = DashboardMain();
  else if (state.view === "client") view = ViewClientDetail();
  else if (state.view === "report") view = ViewReportDetail();
  else if (state.view === "profile") view = ViewProfile();
  app.appendChild(view);
}

// initial
render();

