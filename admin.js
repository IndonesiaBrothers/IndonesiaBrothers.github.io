(function() {
  "use strict";

  var REPO_OWNER = "IndonesiaBrothers";
  var REPO_NAME = "IndonesiaBrothers.github.io";
  var CONFIG_PATH = "admin-config.json";
  var SCRIPT_PATH = "script.js";
  var WEEKLY_PATH = "weeklydata.json";
  var GH_API = "https://api.github.com";

  var state = {
    view: "loading",
    token: null,
    players: [],
    originalScript: "",
    scriptSHA: null,
    tab: "roster",
    search: "",
    filterRank: "all",
    sortCol: "rank",
    sortAsc: true,
    editPlayer: null,
    editIdx: -1,
    msg: null,
    msgType: "info",
    loading: false,
    configData: null,
    screenshots: [],
    ocrStatus: "",
    ocrProgress: 0,
    ocrResults: [],
    ocrRawText: "",
    geminiKey: null,
    dirty: false,
    weeklyData: null,
    weeklySHA: null,
    hofSearch: "",
    hofDirty: false
  };

  var app = document.getElementById("app");

  function esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  // === CRYPTO ===
  function b64e(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function b64d(s) { return Uint8Array.from(atob(s), function(c){ return c.charCodeAt(0); }); }

  async function deriveKey(pw, salt) {
    var km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function encryptText(text, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(pw, salt);
    var enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(text));
    return { s: b64e(salt), i: b64e(iv), d: b64e(enc) };
  }

  async function decryptText(enc, pw) {
    var key = await deriveKey(pw, b64d(enc.s));
    var dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(enc.i) }, key, b64d(enc.d));
    return new TextDecoder().decode(dec);
  }

  // === GITHUB API ===
  async function ghGet(path) {
    var res = await fetch(GH_API + "/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + path + "?t=" + Date.now(), {
      headers: { "Authorization": "token " + state.token, "Accept": "application/vnd.github.v3+json" },
      cache: "no-store"
    });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); throw new Error(e.message || res.statusText); }
    return res.json();
  }

  async function ghPut(path, content, sha, msg) {
    var body = { message: msg, content: btoa(unescape(encodeURIComponent(content))) };
    if (sha) body.sha = sha;
    var res = await fetch(GH_API + "/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + path, {
      method: "PUT",
      headers: { "Authorization": "token " + state.token, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); throw new Error(e.message || res.statusText); }
    return res.json();
  }

  // === INIT ===
  async function init() {
    try {
      var raw = await fetch("https://raw.githubusercontent.com/" + REPO_OWNER + "/" + REPO_NAME + "/main/" + CONFIG_PATH + "?t=" + Date.now(), { cache: "no-store" });
      if (raw.ok) {
        state.configData = await raw.json();
        state.view = "login";
      } else {
        state.view = "setup";
      }
    } catch(e) {
      state.view = "setup";
    }
    render();
  }

  async function handleSetup(pw, token, geminiKey) {
    state.loading = true; state.msg = null; render();
    try {
      // Test token
      state.token = token;
      var test = await ghGet(SCRIPT_PATH);
      // Encrypt and save
      var encToken = await encryptText(token, pw);
      var encGemini = await encryptText(geminiKey, pw);
      state.geminiKey = geminiKey;
      var configContent = JSON.stringify({ encrypted_token: encToken, encrypted_gemini: encGemini, version: 2 });
      var existing = null;
      try { existing = await ghGet(CONFIG_PATH); } catch(e) {}
      await ghPut(CONFIG_PATH, configContent, existing ? existing.sha : null, "Setup admin config");
      state.configData = JSON.parse(configContent);
      // Load players
      state.originalScript = decodeURIComponent(escape(atob(test.content.replace(/\n/g, ""))));
      state.scriptSHA = test.sha;
      state.players = parseMembers(state.originalScript);
      state.view = "dashboard";
      state.msg = "Setup complete! " + state.players.length + " players loaded.";
      state.msgType = "success";
    } catch(e) {
      state.msg = "Error: " + e.message;
      state.msgType = "error";
    }
    state.loading = false; render();
  }

  async function handleLogin(pw) {
    state.loading = true; state.msg = null; render();
    try {
      var token;
      try {
        token = await decryptText(state.configData.encrypted_token, pw);
      } catch(de) {
        state.msg = "❌ Password salah. Coba lagi.";
        state.msgType = "error";
        state.loading = false; render();
        return;
      }
      state.token = token;
      // Decrypt Gemini key
      try {
        if (state.configData.encrypted_gemini) {
          state.geminiKey = await decryptText(state.configData.encrypted_gemini, pw);
        }
      } catch(ge) { /* Old config without Gemini key */ }
      try {
        var data = await ghGet(SCRIPT_PATH);
        state.originalScript = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
        state.scriptSHA = data.sha;
        state.players = parseMembers(state.originalScript);
      } catch(ge) {
        state.msg = "❌ GitHub token expired atau tidak valid. Silakan reset setup.";
        state.msgType = "error";
        state.loading = false; render();
        return;
      }
      state.view = "dashboard";
      state.msg = "✅ " + state.players.length + " players loaded.";
      state.msgType = "success";
    } catch(e) {
      state.msg = "❌ Error: " + e.message;
      state.msgType = "error";
    }
    state.loading = false; render();
  }

  // === PARSER ===
  function parseMembers(script) {
    var members = [];
    // Match the members array
    var match = script.match(/const\s+members\s*=\s*\[([\s\S]*?)\];/);
    if (!match) match = script.match(/var\s+members\s*=\s*\[([\s\S]*?)\];/);
    if (!match) match = script.match(/let\s+members\s*=\s*\[([\s\S]*?)\];/);
    if (!match) return members;

    var block = match[1];
    // Match each object
    var objRe = /\{[^}]+\}/g;
    var m;
    while ((m = objRe.exec(block)) !== null) {
      var obj = m[0];
      var name = extractField(obj, "name");
      var power = extractField(obj, "power");
      var level = extractField(obj, "level");
      var rank = extractField(obj, "rank");
      var role = extractField(obj, "role");
      if (name) {
        members.push({
          name: name,
          power: power || "0M",
          level: parseInt(level) || 1,
          rank: rank || "R2",
          role: role || ""
        });
      }
    }
    return members;
  }

  function extractField(obj, field) {
    var re = new RegExp(field + '\\s*:\\s*["\']([^"\']*)["\']');
    var m = obj.match(re);
    if (m) return m[1];
    // Try numeric
    re = new RegExp(field + '\\s*:\\s*(\\d+)');
    m = obj.match(re);
    return m ? m[1] : "";
  }

  function rankOrder(r) {
    var o = { R5: 1, R4: 2, R3: 3, R2: 4, R1: 5 };
    return o[r] || 99;
  }

  function parsePowerNum(p) {
    if (!p) return 0;
    var s = String(p).replace(/,/g, ".");
    var m = s.match(/([\d.]+)\s*([BMbm]?)/);
    if (!m) return 0;
    var v = parseFloat(m[1]);
    if (m[2] && m[2].toUpperCase() === "B") v *= 1000;
    return v;
  }

  function formatPower(p) {
    if (typeof p === "string") return p;
    if (p >= 1000) return (p / 1000).toFixed(1) + "B";
    return p.toFixed(1) + "M";
  }

  // === GENERATE SCRIPT ===
  function generateScript(original, players) {
    var arr = "const members = [\n";
    players.forEach(function(p, i) {
      arr += '  { name: "' + p.name.replace(/"/g, '\\"') + '", power: "' + p.power + '", level: ' + p.level + ', rank: "' + p.rank + '", role: "' + p.role.replace(/"/g, '\\"') + '" }';
      if (i < players.length - 1) arr += ",";
      arr += "\n";
    });
    arr += "];";
    var result = original.replace(/(?:const|var|let)\s+members\s*=\s*\[[\s\S]*?\];/, arr);
    return result;
  }

  // === PUSH ===
  async function pushToGitHub() {
    state.loading = true; state.msg = "Pushing to GitHub..."; state.msgType = "info"; render();
    try {
      try {
        var latest = await ghGet(SCRIPT_PATH);
        state.scriptSHA = latest.sha;
        state.originalScript = decodeURIComponent(escape(atob(latest.content.replace(/\n/g, ""))));
      } catch(e) {}
      var ns = generateScript(state.originalScript, state.players);
      var result = await ghPut(SCRIPT_PATH, ns, state.scriptSHA, "Update member data (" + state.players.length + " players)");
      state.scriptSHA = result.content.sha;
      state.originalScript = ns;
      state.dirty = false;
      state.msg = "✅ Pushed! Website updates in ~1 min.";
      state.msgType = "success";
      showToast("Pushed to GitHub! ✅");
    } catch(e) {
      state.msg = "Push failed: " + e.message;
      state.msgType = "error";
    }
    state.loading = false; render();
  }

  function showToast(text) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2500);
  }


  // === WEEKLY DATA (HALL OF FAME) ===
  async function loadWeeklyData() {
    try {
      var resp = await ghGet("contents/" + WEEKLY_PATH);
      state.weeklySHA = resp.sha;
      var text = atob(resp.content.replace(/\n/g, ""));
      state.weeklyData = JSON.parse(text);
    } catch(e) {
      // File doesn't exist yet, create default
      state.weeklyData = {
        weekLabel: getWeekLabel(),
        lastUpdated: new Date().toISOString().split("T")[0],
        previousPower: {},
        donations: {},
        daPoints: {}
      };
      state.weeklySHA = null;
    }
    // Ensure all players exist in weekly data
    state.players.forEach(function(p) {
      if (state.weeklyData.donations[p.name] === undefined) state.weeklyData.donations[p.name] = 0;
      if (state.weeklyData.daPoints[p.name] === undefined) state.weeklyData.daPoints[p.name] = 0;
      if (state.weeklyData.previousPower[p.name] === undefined) state.weeklyData.previousPower[p.name] = parsePowerNum(p.power);
    });
  }

  function getWeekLabel() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 1);
    var week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return "Week " + week + ", " + months[now.getMonth()] + " " + now.getFullYear();
  }

  async function pushWeeklyData() {
    if (!state.weeklyData) return;
    state.weeklyData.weekLabel = getWeekLabel();
    state.weeklyData.lastUpdated = new Date().toISOString().split("T")[0];
    var content = btoa(unescape(encodeURIComponent(JSON.stringify(state.weeklyData, null, 2))));
    var payload = { message: "Update weekly data - " + state.weeklyData.weekLabel, content: content };
    if (state.weeklySHA) payload.sha = state.weeklySHA;
    var resp = await ghPut("contents/" + WEEKLY_PATH, content, state.weeklySHA, "Update weekly data - " + state.weeklyData.weekLabel);
    state.weeklySHA = resp.content.sha;
    state.hofDirty = false;
  }

  function snapshotCurrentPower() {
    if (!state.weeklyData) return;
    state.weeklyData.previousPower = {};
    state.players.forEach(function(p) {
      state.weeklyData.previousPower[p.name] = parsePowerNum(p.power);
    });
    state.hofDirty = true;
    showToast("Power snapshot saved! \ud83d\udcf8");
  }

  function renderHofTab() {
    var html = '<div class="content">';

    // Week info & snapshot button
    html += '<div class="hof-header">';
    html += '<div class="hof-week-info">';
    html += '<span class="hof-week-label">\ud83d\udcc5 ' + esc(state.weeklyData ? state.weeklyData.weekLabel : "Loading...") + '</span>';
    html += '<span class="hof-updated">Last: ' + esc(state.weeklyData ? state.weeklyData.lastUpdated : "-") + '</span>';
    html += '</div>';
    html += '<div class="hof-actions">';
    html += '<button class="btn-sm" id="snapshot-btn" title="Save current power as baseline for next week">\ud83d\udcf8 Snapshot Power</button>';
    html += '<button class="btn-sm btn-gold" id="push-hof-btn"' + (state.loading ? ' disabled' : '') + '>\ud83d\ude80 Push HoF Data</button>';
    html += '</div>';
    html += '</div>';

    if (state.hofDirty) {
      html += '<div class="hof-dirty-notice">\u26a0\ufe0f Unsaved changes — click Push HoF Data to save</div>';
    }

    // Search
    html += '<div class="hof-search-bar">';
    html += '<input type="text" id="hof-search" placeholder="Search player..." value="' + esc(state.hofSearch) + '">';
    html += '</div>';

    // Player list with donation & DA inputs
    html += '<div class="hof-player-list">';

    var filtered = (state.players || []).filter(function(p) {
      if (state.hofSearch && p.name.toLowerCase().indexOf(state.hofSearch.toLowerCase()) === -1) return false;
      return true;
    });

    // Sort by power desc
    filtered.sort(function(a, b) { return parsePowerNum(b.power) - parsePowerNum(a.power); });

    // Table header
    html += '<div class="hof-table-header">';
    html += '<span class="hof-col-name">Player</span>';
    html += '<span class="hof-col-power">Power</span>';
    html += '<span class="hof-col-input">\ud83d\udcb0 Donation</span>';
    html += '<span class="hof-col-input">\ud83d\udc09 DA Point</span>';
    html += '</div>';

    filtered.forEach(function(p) {
      var don = state.weeklyData ? (state.weeklyData.donations[p.name] || 0) : 0;
      var da = state.weeklyData ? (state.weeklyData.daPoints[p.name] || 0) : 0;
      var prevPow = state.weeklyData ? (state.weeklyData.previousPower[p.name] || 0) : 0;
      var curPow = parsePowerNum(p.power);
      var diff = prevPow > 0 ? curPow - prevPow : 0;
      var pct = prevPow > 0 ? ((diff / prevPow) * 100).toFixed(1) : "0.0";
      var diffClass = diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral";
      var diffSign = diff > 0 ? "+" : "";

      html += '<div class="hof-row">';
      html += '<div class="hof-col-name">';
      html += '<span class="hof-player-name">' + esc(p.name) + '</span>';
      html += '<span class="hof-player-meta">' + p.rank + ' · Lv.' + p.level + '</span>';
      html += '</div>';
      html += '<div class="hof-col-power">';
      html += '<span class="hof-power-val">' + esc(p.power) + '</span>';
      html += '<span class="hof-power-diff ' + diffClass + '">' + diffSign + formatPower(Math.abs(diff)) + ' (' + diffSign + pct + '%)</span>';
      html += '</div>';
      html += '<div class="hof-col-input"><input type="number" class="hof-input" data-player="' + esc(p.name) + '" data-field="donation" value="' + don + '" min="0"></div>';
      html += '<div class="hof-col-input"><input type="number" class="hof-input" data-player="' + esc(p.name) + '" data-field="da" value="' + da + '" min="0"></div>';
      html += '</div>';
    });

    html += '</div></div>';
    return html;
  }

  // === RENDER ===
  function render() {
    switch(state.view) {
      case "loading": renderLoading(); break;
      case "setup": renderSetup(); break;
      case "login": renderLogin(); break;
      case "dashboard": renderDashboard(); break;
    }
  }

  function renderLoading() {
    app.innerHTML = '<div class="auth-page"><div class="auth-card"><div class="loader"></div><p style="color:var(--text-muted)">Loading...</p></div></div>';
  }

  function renderSetup() {
    var msgHtml = state.msg ? '<div class="msg msg-' + state.msgType + '">' + esc(state.msg) + '</div>' : '';
    app.innerHTML = '<div class="auth-page"><div class="auth-card">' +
      '<div class="auth-logo">IDs ADMIN</div>' +
      '<h2>First Time Setup</h2>' +
      '<p class="auth-desc">Setup admin access. You need a GitHub Fine-grained Token.</p>' +
      '<div class="setup-steps">' +
        '<div class="step"><span class="step-num">1</span><div>' +
          '<strong>Create GitHub Token</strong>' +
          '<a href="https://github.com/settings/tokens?type=beta" target="_blank" class="step-link">github.com/settings/tokens</a>' +
          '<ul class="step-details"><li>Repository: <code>' + REPO_NAME + '</code></li><li>Permission: Contents → <strong>Read and Write</strong></li></ul>' +
        '</div></div>' +
        '<div class="step"><span class="step-num">2</span><div>' +
          '<strong>Create Gemini API Key (Gratis)</strong>' +
          '<a href="https://aistudio.google.com/apikey" target="_blank" class="step-link">aistudio.google.com/apikey</a>' +
          '<ul class="step-details"><li>Klik <strong>Create API Key</strong></li><li>Copy key yang muncul</li></ul>' +
        '</div></div>' +
        '<div class="step"><span class="step-num">3</span><div><strong>Paste kedua key & set password di bawah</strong></div></div>' +
      '</div>' +
      '<form id="sf">' +
        '<div class="form-group"><label>GitHub Token</label><input type="password" id="st" placeholder="github_pat_..." required></div>' +
        '<div class="form-group"><label>Gemini API Key</label><input type="password" id="sg" placeholder="AIza..." required></div>' +
        '<div class="form-group"><label>Admin Password</label><input type="password" id="sp" placeholder="Choose a password" required minlength="4"></div>' +
        '<div class="form-group"><label>Confirm Password</label><input type="password" id="sp2" placeholder="Confirm password" required></div>' +
        msgHtml +
        '<button type="submit" class="btn-primary"' + (state.loading ? ' disabled' : '') + '>' + (state.loading ? 'Setting up...' : '🔐 Setup Admin Panel') + '</button>' +
      '</form>' +
    '</div></div>';
    document.getElementById("sf").onsubmit = function(e) {
      e.preventDefault();
      var pw = document.getElementById("sp").value, pw2 = document.getElementById("sp2").value;
      if (pw !== pw2) { state.msg = "Passwords don't match!"; state.msgType = "error"; render(); return; }
      handleSetup(pw, document.getElementById("st").value.trim(), document.getElementById("sg").value.trim());
    };
  }

  function renderLogin() {
    var msgHtml = state.msg ? '<div class="msg msg-' + state.msgType + '">' + esc(state.msg) + '</div>' : '';
    app.innerHTML = '<div class="auth-page"><div class="auth-card">' +
      '<div class="auth-logo">IDs ADMIN</div>' +
      '<h2>Admin Login</h2>' +
      '<form id="lf">' +
        '<div class="form-group"><label>Password</label><input type="password" id="lp" placeholder="Enter admin password" required autofocus></div>' +
        msgHtml +
        '<button type="submit" class="btn-primary"' + (state.loading ? ' disabled' : '') + '>' + (state.loading ? 'Logging in...' : '🔓 Login') + '</button>' +
      '</form>' +
      '<p style="margin-top:14px;font-size:0.75rem;color:var(--text-muted)"><a href="#" id="reset-link" style="color:var(--cyan-primary)">Reset setup</a></p>' +
    '</div></div>';
    document.getElementById("lf").onsubmit = function(e) { e.preventDefault(); handleLogin(document.getElementById("lp").value); };
    document.getElementById("reset-link").onclick = function(e) {
      e.preventDefault();
      if (confirm("Reset admin setup? Kamu perlu memasukkan GitHub token dan Gemini API key lagi.")) {
        state.configData = null; state.view = "setup"; state.msg = null; render();
      }
    };
  }

  function renderDashboard() {
    var p = state.players;
    var counts = { all: p.length, R5: 0, R4: 0, R3: 0, R2: 0, R1: 0 };
    p.forEach(function(m) { counts[m.rank] = (counts[m.rank] || 0) + 1; });

    var filtered = p.filter(function(m) {
      if (state.filterRank !== "all" && m.rank !== state.filterRank) return false;
      if (state.search && m.name.toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
      return true;
    });

    var sc = state.sortCol, asc = state.sortAsc;
    filtered.sort(function(a, b) {
      var v;
      if (sc === "name") v = a.name.localeCompare(b.name);
      else if (sc === "power") v = parsePowerNum(b.power) - parsePowerNum(a.power);
      else if (sc === "level") v = b.level - a.level;
      else if (sc === "rank") v = rankOrder(a.rank) - rankOrder(b.rank) || parsePowerNum(b.power) - parsePowerNum(a.power);
      else v = 0;
      return asc ? v : -v;
    });

    var totalPower = 0;
    p.forEach(function(m) { totalPower += parsePowerNum(m.power); });
    var powerStr = totalPower >= 1000 ? (totalPower / 1000).toFixed(1) + "B" : totalPower.toFixed(0) + "M";

    var html = '';

    // Header
    html += '<div class="dash-header"><div class="dash-brand">IDs ADMIN</div><div class="dash-actions">';
    if (state.dirty) html += '<span style="font-size:0.65rem;color:var(--gold-primary);font-family:var(--font-accent)">● UNSAVED</span>';
    html += '<button class="btn-secondary" id="logout-btn">Logout</button>';
    html += '</div></div>';

    // Stats
    html += '<div class="stats-bar">';
    html += '<div class="stat-chip">TOTAL <span class="val">' + counts.all + '</span></div>';
    html += '<div class="stat-chip">POWER <span class="val">' + powerStr + '</span></div>';
    ["R5","R4","R3","R2","R1"].forEach(function(r) {
      html += '<div class="stat-chip">' + r + ' <span class="val">' + (counts[r]||0) + '</span></div>';
    });
    html += '</div>';

    // Tabs
    html += '<div class="tab-bar">';
    html += '<button class="tab-btn' + (state.tab === "roster" ? " active" : "") + '" data-tab="roster">📋 Roster</button>';
    html += '<button class="tab-btn' + (state.tab === "screenshot" ? " active" : "") + '" data-tab="screenshot">📸 Update</button>';
    html += '<button class="tab-btn' + (state.tab === "halloffame" ? " active" : "") + '" data-tab="halloffame">🏆 Hall of Fame</button>';
    html += '</div>';

    if (state.tab === "roster") {
      html += renderRosterTab(filtered, counts);
    } else if (state.tab === "screenshot") {
      html += renderScreenshotTab();
    } else if (state.tab === "halloffame") {
      html += renderHofTab();
    }

    // Push bar
    var pushMsg = state.msg || (state.dirty ? "⚠️ Changes pending" : "✅ Up to date");
    var pushCls = state.msgType === "success" ? " success" : state.msgType === "error" ? " error" : "";
    html += '<div class="push-bar">';
    html += '<span class="push-msg' + pushCls + '">' + esc(pushMsg) + '</span>';
    html += '<button class="btn-gold" id="push-btn"' + (state.loading ? ' disabled' : '') + '>' + (state.loading ? '⏳' : '🚀 PUSH') + '</button>';
    html += '</div>';

    // Modal
    if (state.editPlayer !== null) {
      html += renderEditModal();
    }

    app.innerHTML = html;
    bindDashboard();
  }

  function renderRosterTab(filtered, counts) {
    var html = '';
    // Toolbar
    html += '<div class="toolbar">';
    html += '<input type="search" id="search-input" placeholder="🔍 Search player..." value="' + esc(state.search) + '">';
    html += '<div class="filter-pills">';
    ["all","R5","R4","R3","R2","R1"].forEach(function(r) {
      var label = r === "all" ? "ALL" : r;
      var count = r === "all" ? counts.all : (counts[r]||0);
      html += '<button class="pill' + (state.filterRank === r ? " active" : "") + '" data-rank="' + r + '">' + label + ' ' + count + '</button>';
    });
    html += '</div>';
    html += '<button class="btn-sm" id="add-btn">+ ADD</button>';
    html += '</div>';

    // Content area
    html += '<div class="content">';

    if (filtered.length === 0) {
      html += '<div class="empty-state"><div class="icon">🔍</div>No players found</div>';
    } else {
      // Mobile: player cards
      html += '<div class="player-list">';
      filtered.forEach(function(m, i) {
        var idx = state.players.indexOf(m);
        html += '<div class="player-card" data-idx="' + idx + '">';
        html += '<div class="pc-num">' + (i+1) + '</div>';
        html += '<div class="pc-rank"><span class="rank-badge rank-' + m.rank + '">' + m.rank + '</span></div>';
        html += '<div class="pc-info">';
        html += '<div class="pc-name">' + esc(m.name) + '</div>';
        html += '<div class="pc-meta">';
        html += '<span class="pc-power">' + esc(m.power) + '</span>';
        html += '<span class="pc-level">Lv.' + m.level + '</span>';
        if (m.role) html += '<span class="pc-role">' + esc(m.role) + '</span>';
        html += '</div></div></div>';
      });
      html += '</div>';

      // Desktop: table
      html += '<div class="table-wrap"><table><thead><tr>';
      html += '<th class="col-num">#</th>';
      [["name","NAME"],["power","POWER"],["level","LVL"],["rank","RANK"],["role","ROLE"]].forEach(function(c) {
        var cls = "col-" + c[0] + (state.sortCol === c[0] ? " sorted" : "");
        var arrow = state.sortCol === c[0] ? (state.sortAsc ? " ▲" : " ▼") : "";
        html += '<th class="' + cls + '" data-sort="' + c[0] + '">' + c[1] + arrow + '</th>';
      });
      html += '<th class="col-actions">ACT</th></tr></thead><tbody>';
      filtered.forEach(function(m, i) {
        var idx = state.players.indexOf(m);
        html += '<tr>';
        html += '<td class="col-num">' + (i+1) + '</td>';
        html += '<td class="col-name"><span class="player-name">' + esc(m.name) + '</span></td>';
        html += '<td class="col-power"><span class="power-val">' + esc(m.power) + '</span></td>';
        html += '<td class="col-level">' + m.level + '</td>';
        html += '<td class="col-rank"><span class="rank-badge rank-' + m.rank + '">' + m.rank + '</span></td>';
        html += '<td class="col-role"><span class="role-tag">' + esc(m.role) + '</span></td>';
        html += '<td class="col-actions"><div class="row-actions">';
        html += '<button class="btn-sm edit-btn" data-idx="' + idx + '">✏️</button>';
        html += '<button class="btn-danger del-btn" data-idx="' + idx + '">🗑</button>';
        html += '</div></td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    return html;
  }

  function renderScreenshotTab() {
    var html = '<div class="content"><div class="screenshot-tab">';

    // Upload zone
    html += '<div class="upload-zone" id="upload-zone"><div class="icon">📸</div><p>Tap to upload Member List screenshots</p><p class="hint">Upload screenshots from game, multiple images OK</p></div>';
    html += '<input type="file" id="file-input" accept="image/*" multiple style="display:none">';

    if (state.screenshots.length > 0) {
      html += '<div class="preview-grid">';
      state.screenshots.forEach(function(s, i) {
        html += '<div class="preview-thumb"><img src="' + s + '"><button class="remove-btn" data-si="' + i + '">✕</button></div>';
      });
      html += '</div>';
      html += '<button class="btn-primary" id="ocr-btn"' + (state.loading ? ' disabled' : '') + '>🤖 Scan with Gemini AI</button>';
      html += '<div style="height:12px"></div>';
    }

    if (state.ocrStatus) {
      html += '<div class="ocr-status">' + esc(state.ocrStatus);
      if (state.ocrProgress > 0 && state.ocrProgress < 100) {
        html += '<div class="progress-bar"><div class="progress-fill" style="width:' + state.ocrProgress + '%"></div></div>';
      }
      html += '</div>';
    }

    // Show raw OCR text for debugging
    if (state.ocrRawText) {
      html += '<details style="margin-bottom:12px"><summary style="color:var(--text-muted);font-size:0.75rem;cursor:pointer">📝 Gemini AI Response (debug)</summary>';
      html += '<div class="debug-text">' + esc(state.ocrRawText) + '</div></details>';
    }

    if (state.ocrResults.length > 0) {
      html += '<div class="section-title">PARSED RESULTS <span class="count">(' + state.ocrResults.length + ' players)</span></div>';
      state.ocrResults.forEach(function(r) {
        var statusColor = r.matched ? "#00c853" : "var(--gold-primary)";
        var statusText = r.matched ? "✅ Match" : "🆕 New";
        html += '<div class="ocr-result-card">';
        html += '<div class="orc-name">' + esc(r.name) + '</div>';
        html += '<div class="orc-power">' + esc(r.power) + (r.level ? ' | Lv.' + r.level : '') + '</div>';
        html += '<div class="orc-status" style="color:' + statusColor + '">' + statusText + '</div>';
        html += '</div>';
      });
      html += '<div style="height:12px"></div>';
      html += '<button class="btn-gold" id="apply-ocr" style="width:100%">✅ Apply ' + state.ocrResults.length + ' Results to Roster</button>';
    }

    // Separator
    html += '<div style="border-top:1px solid var(--border-color);margin:20px 0;padding-top:16px">';
    html += '<div class="section-title">✏️ QUICK MANUAL UPDATE</div>';
    html += '<p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px">If screenshot scan doesn\'t work perfectly, update power values manually here:</p>';

    // Quick update - show top players by rank for easy power update
    html += '<div class="quick-update-list">';
    var sorted = state.players.slice().sort(function(a,b) { return rankOrder(a.rank) - rankOrder(b.rank) || parsePowerNum(b.power) - parsePowerNum(a.power); });
    sorted.forEach(function(p, i) {
      var idx = state.players.indexOf(p);
      html += '<div class="qu-item">';
      html += '<span class="rank-badge rank-' + p.rank + '" style="flex-shrink:0;font-size:0.5rem">' + p.rank + '</span>';
      html += '<span class="qu-name">' + esc(p.name) + '</span>';
      html += '<input type="text" class="qu-power" data-idx="' + idx + '" value="' + esc(p.power) + '" placeholder="e.g. 50.1M">';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="height:12px"></div>';
    html += '<button class="btn-primary" id="apply-quick" style="width:100%">💾 Save Manual Changes</button>';
    html += '</div>';

    html += '</div></div>';
    return html;
  }

  function renderEditModal() {
    var ep = state.editPlayer;
    var title = state.editIdx === -1 ? "ADD PLAYER" : "EDIT PLAYER";
    var html = '<div class="modal-overlay" id="modal-overlay">';
    html += '<div class="modal"><h3>' + title + '</h3><form id="edit-form">';
    html += '<div class="form-group"><label>Name</label><input id="ed-name" value="' + esc(ep.name) + '" required></div>';
    html += '<div class="form-group"><label>Power</label><input id="ed-power" value="' + esc(ep.power) + '" placeholder="e.g. 50.1M" required></div>';
    html += '<div class="form-group"><label>Level</label><input id="ed-level" type="number" value="' + ep.level + '" min="1" max="99" required></div>';
    html += '<div class="form-group"><label>Rank</label><select id="ed-rank">';
    ["R5","R4","R3","R2","R1"].forEach(function(r) {
      var labels = { R5: "R5 - Leader", R4: "R4 - Officer", R3: "R3 - Elite", R2: "R2 - Member", R1: "R1 - Inactive" };
      html += '<option value="' + r + '"' + (ep.rank === r ? " selected" : "") + '>' + labels[r] + '</option>';
    });
    html += '</select></div>';
    html += '<div class="form-group"><label>Role (optional)</label><input id="ed-role" value="' + esc(ep.role) + '" placeholder="Leader, Warlord..."></div>';
    html += '<div class="modal-actions"><button type="submit" class="btn-primary">💾 SAVE</button><button type="button" class="btn-secondary" id="cancel-edit">CANCEL</button></div>';
    html += '</form></div></div>';
    return html;
  }

  // === EVENT BINDING ===
  function bindDashboard() {
    var lb = document.getElementById("logout-btn");
    if (lb) lb.onclick = function() { state.view = "login"; state.token = null; state.msg = null; render(); };

    // Tabs
    document.querySelectorAll(".tab-btn").forEach(function(b) {
      b.onclick = function() { state.tab = b.dataset.tab; state.msg = null; render(); };
    });

    // Search
    var si = document.getElementById("search-input");
    if (si) {
      si.oninput = function() {
        state.search = si.value;
        render();
        var el = document.getElementById("search-input");
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = si.value.length; }
      };
    }

    // Filter pills
    document.querySelectorAll(".pill").forEach(function(b) {
      b.onclick = function() { state.filterRank = b.dataset.rank; render(); };
    });

    // Sort headers (desktop)
    document.querySelectorAll("th[data-sort]").forEach(function(th) {
      th.onclick = function() {
        if (state.sortCol === th.dataset.sort) state.sortAsc = !state.sortAsc;
        else { state.sortCol = th.dataset.sort; state.sortAsc = true; }
        render();
      };
    });

    // Player cards (mobile) - tap to edit
    document.querySelectorAll(".player-card[data-idx]").forEach(function(card) {
      card.onclick = function() {
        var idx = parseInt(card.dataset.idx);
        var p = state.players[idx];
        state.editPlayer = { name: p.name, power: p.power, level: p.level, rank: p.rank, role: p.role };
        state.editIdx = idx;
        render();
      };
    });

    // Add button
    var ab = document.getElementById("add-btn");
    if (ab) ab.onclick = function() { state.editPlayer = { name: "", power: "", level: 1, rank: "R2", role: "" }; state.editIdx = -1; render(); };

    // Edit buttons (desktop)
    document.querySelectorAll(".edit-btn").forEach(function(b) {
      b.onclick = function(e) {
        e.stopPropagation();
        var idx = parseInt(b.dataset.idx);
        var p = state.players[idx];
        state.editPlayer = { name: p.name, power: p.power, level: p.level, rank: p.rank, role: p.role };
        state.editIdx = idx;
        render();
      };
    });

    // Delete buttons (desktop)
    document.querySelectorAll(".del-btn").forEach(function(b) {
      b.onclick = function(e) {
        e.stopPropagation();
        var idx = parseInt(b.dataset.idx);
        if (confirm("Delete " + state.players[idx].name + "?")) {
          state.players.splice(idx, 1);
          state.dirty = true;
          state.msg = "Player deleted.";
          state.msgType = "info";
          render();
        }
      };
    });

    // Push
    var pb = document.getElementById("push-btn");
    if (pb) pb.onclick = pushToGitHub;

    // Hall of Fame bindings
    var snBtn = document.getElementById("snapshot-btn");
    if (snBtn) snBtn.onclick = function() {
      if (confirm("Save current power values as the baseline for next week comparison?")) {
        snapshotCurrentPower();
        render();
      }
    };

    var phBtn = document.getElementById("push-hof-btn");
    if (phBtn) phBtn.onclick = async function() {
      try {
        state.loading = true; render();
        await pushWeeklyData();
        state.loading = false;
        showToast("Hall of Fame data pushed! \ud83c\udfc6");
        render();
      } catch(e) {
        state.loading = false;
        showToast("Error: " + e.message);
        render();
      }
    };

    var hofSearch = document.getElementById("hof-search");
    if (hofSearch) {
      hofSearch.oninput = function() {
        state.hofSearch = hofSearch.value;
        render();
        var el = document.getElementById("hof-search");
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = hofSearch.value.length; }
      };
    }

    document.querySelectorAll(".hof-input").forEach(function(inp) {
      inp.onchange = function() {
        var name = inp.dataset.player;
        var field = inp.dataset.field;
        var val = parseInt(inp.value) || 0;
        if (state.weeklyData) {
          if (field === "donation") state.weeklyData.donations[name] = val;
          else if (field === "da") state.weeklyData.daPoints[name] = val;
          state.hofDirty = true;
        }
      };
    });

    // Modal
    var ef = document.getElementById("edit-form");
    if (ef) ef.onsubmit = function(e) {
      e.preventDefault();
      var np = {
        name: document.getElementById("ed-name").value.trim(),
        power: document.getElementById("ed-power").value.trim(),
        level: parseInt(document.getElementById("ed-level").value),
        rank: document.getElementById("ed-rank").value,
        role: document.getElementById("ed-role").value.trim()
      };
      if (state.editIdx === -1) state.players.push(np);
      else state.players[state.editIdx] = np;
      state.editPlayer = null;
      state.editIdx = -1;
      state.dirty = true;
      state.msg = "Player saved!";
      state.msgType = "info";
      showToast("Player saved! ✅");
      render();
    };

    var ce = document.getElementById("cancel-edit");
    if (ce) ce.onclick = function() { state.editPlayer = null; state.editIdx = -1; render(); };

    var mo = document.getElementById("modal-overlay");
    if (mo) mo.onclick = function(e) { if (e.target === mo) { state.editPlayer = null; state.editIdx = -1; render(); } };

    // Screenshot upload
    var uz = document.getElementById("upload-zone");
    var fi = document.getElementById("file-input");
    if (uz && fi) {
      uz.onclick = function() { fi.click(); };
      uz.ondragover = function(e) { e.preventDefault(); uz.classList.add("dragover"); };
      uz.ondragleave = function() { uz.classList.remove("dragover"); };
      uz.ondrop = function(e) { e.preventDefault(); uz.classList.remove("dragover"); addFiles(e.dataTransfer.files); };
      fi.onchange = function() { addFiles(fi.files); fi.value = ""; };
    }

    // Remove screenshot
    document.querySelectorAll(".remove-btn[data-si]").forEach(function(b) {
      b.onclick = function(e) { e.stopPropagation(); state.screenshots.splice(parseInt(b.dataset.si), 1); render(); };
    });

    // OCR scan
    var ob = document.getElementById("ocr-btn");
    if (ob) ob.onclick = runOCR;

    // Apply OCR results
    var ao = document.getElementById("apply-ocr");
    if (ao) ao.onclick = function() {
      var updated = 0;
      state.ocrResults.forEach(function(r) {
        if (r.matched) {
          var idx = state.players.findIndex(function(p) { return p.name.toLowerCase() === r.name.toLowerCase(); });
          if (idx !== -1) { state.players[idx].power = r.power; if (r.level) state.players[idx].level = String(r.level); updated++; }
        }
      });
      state.ocrResults = [];
      state.ocrStatus = "";
      state.ocrRawText = "";
      state.screenshots = [];
      state.dirty = true;
      state.msg = updated + " players updated!";
      state.msgType = "success";
      state.tab = "roster";
      showToast(updated + " players updated! ✅");
      render();
    };

    // Quick manual update - save button
    var aq = document.getElementById("apply-quick");
    if (aq) aq.onclick = function() {
      var changed = 0;
      document.querySelectorAll(".qu-power").forEach(function(input) {
        var idx = parseInt(input.dataset.idx);
        var newPower = input.value.trim();
        if (newPower && newPower !== state.players[idx].power) {
          state.players[idx].power = newPower;
          changed++;
        }
      });
      if (changed > 0) {
        state.dirty = true;
        state.msg = changed + " players updated!";
        state.msgType = "success";
        showToast(changed + " players updated! ✅");
      } else {
        state.msg = "No changes detected.";
        state.msgType = "info";
      }
      render();
    };
  }

  function addFiles(files) {
    Array.from(files).forEach(function(f) {
      if (!f.type.startsWith("image/")) return;
      var reader = new FileReader();
      reader.onload = function(e) { state.screenshots.push(e.target.result); render(); };
      reader.readAsDataURL(f);
    });
  }

  // === GEMINI VISION AI ===
  async function runOCR() {
    if (state.screenshots.length === 0) return;
    if (!state.geminiKey) {
      state.ocrStatus = "⚠️ Gemini API Key belum di-setup. Klik 'Reset setup' di halaman login untuk setup ulang.";
      render();
      return;
    }
    state.loading = true;
    state.ocrStatus = "🤖 Mengirim ke Gemini AI...";
    state.ocrProgress = 10;
    state.ocrResults = [];
    state.ocrRawText = "";
    render();

    try {
      var allResults = [];
      for (var i = 0; i < state.screenshots.length; i++) {
        state.ocrStatus = "🤖 Menganalisis gambar " + (i+1) + "/" + state.screenshots.length + " dengan Gemini AI...";
        state.ocrProgress = 10 + (i / state.screenshots.length) * 80;
        render();

        var dataUrl = state.screenshots[i];
        var base64Data = dataUrl.split(",")[1];
        var mimeType = dataUrl.match(/data:(.*?);/)[1];

        var response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + state.geminiKey, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Extract ALL player data from this Last War: Survival game member list screenshot. The game language is Indonesian (Bahasa Indonesia). Power may be shown as 'Kekuatan'. Look for every player entry visible.\nFor each player extract:\n- name: exact player name as displayed\n- power: power value with suffix (e.g. \"64.3M\", \"1.2B\", \"850.5K\")\n- level: level number (integer)\n\nReturn ONLY a valid JSON array, no markdown backticks, no explanation. Example:\n[{\"name\":\"PlayerName\",\"power\":\"64.3M\",\"level\":28}]" },
                { inline_data: { mime_type: mimeType, data: base64Data } }
              ]
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 8192 }
          })
        });

        if (!response.ok) {
          var errData = await response.json().catch(function() { return {}; });
          throw new Error("Gemini API error: " + (errData.error ? errData.error.message : response.statusText));
        }

        var data = await response.json();
        var text = data.candidates[0].content.parts[0].text;
        state.ocrRawText += "=== Image " + (i+1) + " ===\n" + text + "\n\n";

        // Parse JSON from response (handle markdown code blocks)
        var cleanText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        var jsonMatch = cleanText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            var parsed = JSON.parse(jsonMatch[0]);
            allResults = allResults.concat(parsed);
          } catch(pe) {
            state.ocrRawText += "\n⚠️ JSON parse error: " + pe.message + "\n";
          }
        }
      }

      // Match results to existing players (fuzzy matching)
      var matched = [];
      allResults.forEach(function(r) {
        if (!r.name || !r.power) return;
        var exactMatch = state.players.find(function(p) {
          return p.name.toLowerCase() === r.name.toLowerCase();
        });
        if (exactMatch) {
          matched.push({ name: exactMatch.name, power: r.power, level: r.level, matched: true });
        } else {
          var bestMatch = null, bestScore = 0;
          state.players.forEach(function(p) {
            var score = similarity(r.name.toLowerCase(), p.name.toLowerCase());
            if (score > bestScore && score > 0.5) { bestScore = score; bestMatch = p; }
          });
          if (bestMatch) {
            matched.push({ name: bestMatch.name, power: r.power, level: r.level, matched: true, originalName: r.name });
          } else {
            matched.push({ name: r.name, power: r.power, level: r.level, matched: false });
          }
        }
      });

      // Deduplicate (keep last occurrence)
      var seen = {};
      var deduped = [];
      for (var di = matched.length - 1; di >= 0; di--) {
        var key = matched[di].name.toLowerCase();
        if (!seen[key]) { seen[key] = true; deduped.unshift(matched[di]); }
      }

      state.ocrResults = deduped;
      state.ocrStatus = "✅ Gemini AI menemukan " + deduped.length + " players!";
      state.ocrProgress = 100;

      if (deduped.length === 0) {
        state.ocrStatus = "⚠️ Tidak ada player yang ditemukan. Coba screenshot yang lebih jelas.";
      }
    } catch(e) {
      state.ocrStatus = "❌ Error: " + e.message;
    }
    state.loading = false;
    render();
  }

  function similarity(a, b) {
    if (a === b) return 1;
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return 0.85;
    var longer = a.length > b.length ? a : b;
    var shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    return (longer.length - editDist(longer, shorter)) / longer.length;
  }

  function editDist(a, b) {
    var m = [];
    for (var i = 0; i <= b.length; i++) { m[i] = [i]; }
    for (var j = 0; j <= a.length; j++) { m[0][j] = j; }
    for (var i = 1; i <= b.length; i++) {
      for (var j = 1; j <= a.length; j++) {
        if (b.charAt(i-1) === a.charAt(j-1)) m[i][j] = m[i-1][j-1];
        else m[i][j] = Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
      }
    }
    return m[b.length][a.length];
  }

  // === START ===
  init();
})();
