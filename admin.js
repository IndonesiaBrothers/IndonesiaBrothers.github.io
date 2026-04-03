(function() {
  "use strict";

  // === CONFIG ===
  var REPO_OWNER = "IndonesiaBrothers";
  var REPO_NAME = "IndonesiaBrothers.github.io";
  var CONFIG_PATH = "admin-config.json";
  var SCRIPT_PATH = "script.js";
  var GH_API = "https://api.github.com";

  // === STATE ===
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
    dirty: false
  };

  var app = document.getElementById("app");

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
    var res = await fetch(GH_API + "/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + path, {
      headers: { "Authorization": "token " + state.token, "Accept": "application/vnd.github.v3+json" }
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

  // === DATA PARSING ===
  function parseMembers(src) {
    var match = src.match(/const members\s*=\s*\[([\s\S]*?)\];/);
    if (!match) return [];
    var arr = [], re = /\{\s*name:\s*"([^"]*?)"\s*,\s*power:\s*"([^"]*?)"\s*,\s*level:\s*(\d+)\s*,\s*rank:\s*"([^"]*?)"\s*,\s*role:\s*"([^"]*?)"\s*\}/g, m;
    while ((m = re.exec(match[1])) !== null) {
      arr.push({ name: m[1], power: m[2], level: parseInt(m[3]), rank: m[4], role: m[5] });
    }
    return arr;
  }

  function parsePowerNum(s) {
    if (!s || s === "N/A") return 0;
    var n = parseFloat(s.replace(/[^0-9.]/g, ""));
    if (s.includes("B")) return n * 1000;
    if (s.includes("M")) return n;
    if (s.includes("K")) return n / 1000;
    return n;
  }

  function rankOrder(r) { return { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4 }[r] || 5; }

  function rankLabel(r) { return { R5: "Leader", R4: "Officers", R3: "Elite Members", R2: "Members", R1: "Inactive" }[r] || r; }

  function generateScript(orig, players) {
    var ro = { R5: 0, R4: 1, R3: 2, R2: 3, R1: 4 };
    var sorted = players.slice().sort(function(a, b) {
      if (ro[a.rank] !== ro[b.rank]) return ro[a.rank] - ro[b.rank];
      return parsePowerNum(b.power) - parsePowerNum(a.power);
    });
    var counts = {};
    sorted.forEach(function(p) { counts[p.rank] = (counts[p.rank] || 0) + 1; });
    var lines = [], cr = "";
    sorted.forEach(function(p, i) {
      if (p.rank !== cr) {
        if (lines.length) lines.push("");
        lines.push("    // " + p.rank + " - " + rankLabel(p.rank) + " (" + counts[p.rank] + ")");
        cr = p.rank;
      }
      var comma = i < sorted.length - 1 ? "," : ",";
      lines.push('    { name: "' + p.name + '", power: "' + p.power + '", level: ' + p.level + ', rank: "' + p.rank + '", role: "' + p.role + '" }' + comma);
    });
    var membersBlock = "const members = [\n" + lines.join("\n") + "\n];";
    return orig.replace(/const members\s*=\s*\[[\s\S]*?\];/, membersBlock);
  }

  function esc(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }

  // === INIT ===
  async function init() {
    state.view = "loading"; render();
    try {
      var res = await fetch("admin-config.json?t=" + Date.now());
      if (res.ok) {
        state.configData = await res.json();
        state.view = "login";
      } else {
        var bk = localStorage.getItem("ids-admin-config");
        if (bk) { state.configData = JSON.parse(bk); state.view = "login"; }
        else state.view = "setup";
      }
    } catch(e) {
      var bk = localStorage.getItem("ids-admin-config");
      if (bk) { state.configData = JSON.parse(bk); state.view = "login"; }
      else state.view = "setup";
    }
    render();
  }

  // === SETUP ===
  async function handleSetup(pw, token) {
    state.loading = true; state.msg = null; render();
    try {
      state.token = token;
      await ghGet(SCRIPT_PATH);
      var enc = await encryptText(token, pw);
      var cfg = JSON.stringify({ encrypted: enc, v: 1 }, null, 2);
      var sha = null;
      try { var ex = await ghGet(CONFIG_PATH); sha = ex.sha; } catch(e) {}
      await ghPut(CONFIG_PATH, cfg, sha, "Setup admin panel");
      localStorage.setItem("ids-admin-config", cfg);
      state.configData = { encrypted: enc, v: 1 };
      await loadPlayerData();
      state.view = "dashboard";
      state.msg = "Setup complete! Admin panel ready.";
      state.msgType = "success";
    } catch(e) {
      state.msg = e.message;
      state.msgType = "error";
    }
    state.loading = false; render();
  }

  // === LOGIN ===
  async function handleLogin(pw) {
    state.loading = true; state.msg = null; render();
    try {
      var token = await decryptText(state.configData.encrypted, pw);
      state.token = token;
      await loadPlayerData();
      state.view = "dashboard";
      state.msg = "Logged in!";
      state.msgType = "success";
    } catch(e) {
      state.msg = (e.name === "OperationError") ? "Wrong password!" : e.message;
      state.msgType = "error";
    }
    state.loading = false; render();
  }

  // === LOAD DATA ===
  async function loadPlayerData() {
    var file = await ghGet(SCRIPT_PATH);
    state.originalScript = decodeURIComponent(escape(atob(file.content)));
    state.scriptSHA = file.sha;
    state.players = parseMembers(state.originalScript);
    if (state.players.length === 0) throw new Error("Could not parse player data");
  }

  // === PUSH ===
  async function pushToGitHub() {
    state.loading = true; state.msg = "Pushing to GitHub..."; state.msgType = "info"; render();
    try {
      // Re-fetch to get latest SHA
      try {
        var latest = await ghGet(SCRIPT_PATH);
        state.scriptSHA = latest.sha;
        state.originalScript = decodeURIComponent(escape(atob(latest.content)));
      } catch(e) {}
      var ns = generateScript(state.originalScript, state.players);
      var result = await ghPut(SCRIPT_PATH, ns, state.scriptSHA, "Update member data (" + state.players.length + " players)");
      state.scriptSHA = result.content.sha;
      state.originalScript = ns;
      state.dirty = false;
      state.msg = "Pushed! Website updates in ~1 min.";
      state.msgType = "success";
    } catch(e) {
      state.msg = "Push failed: " + e.message;
      state.msgType = "error";
    }
    state.loading = false; render();
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
      '<p class="auth-desc">Set up admin access. You need a GitHub Fine-grained Token.</p>' +
      '<div class="setup-steps">' +
        '<div class="step"><span class="step-num">1</span><div>' +
          '<strong>Create GitHub Token</strong>' +
          '<a href="https://github.com/settings/tokens?type=beta" target="_blank" class="step-link">github.com/settings/tokens</a>' +
          '<ul class="step-details"><li>Repository: <code>' + REPO_NAME + '</code></li><li>Permission: Contents → <strong>Read and Write</strong></li></ul>' +
        '</div></div>' +
        '<div class="step"><span class="step-num">2</span><div><strong>Paste token & set password below</strong></div></div>' +
      '</div>' +
      '<form id="sf">' +
        '<div class="form-group"><label>GitHub Token</label><input type="password" id="st" placeholder="github_pat_..." required></div>' +
        '<div class="form-group"><label>Admin Password</label><input type="password" id="sp" placeholder="Choose a password" required minlength="4"></div>' +
        '<div class="form-group"><label>Confirm Password</label><input type="password" id="sp2" placeholder="Confirm password" required></div>' +
        msgHtml +
        '<button type="submit" class="btn-primary"' + (state.loading ? ' disabled' : '') + '>' + (state.loading ? 'Setting up...' : 'Setup Admin Panel') + '</button>' +
      '</form>' +
    '</div></div>';
    document.getElementById("sf").onsubmit = function(e) {
      e.preventDefault();
      var pw = document.getElementById("sp").value, pw2 = document.getElementById("sp2").value;
      if (pw !== pw2) { state.msg = "Passwords don't match!"; state.msgType = "error"; render(); return; }
      handleSetup(pw, document.getElementById("st").value.trim());
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
        '<button type="submit" class="btn-primary"' + (state.loading ? ' disabled' : '') + '>' + (state.loading ? 'Logging in...' : 'Login') + '</button>' +
      '</form>' +
      '<p style="margin-top:16px;font-size:0.8rem;color:var(--text-muted)"><a href="#" id="reset-link" style="color:var(--cyan-primary)">Reset setup</a></p>' +
    '</div></div>';
    document.getElementById("lf").onsubmit = function(e) { e.preventDefault(); handleLogin(document.getElementById("lp").value); };
    document.getElementById("reset-link").onclick = function(e) {
      e.preventDefault();
      if (confirm("Reset admin setup? You'll need to enter the GitHub token again.")) {
        localStorage.removeItem("ids-admin-config");
        state.configData = null;
        state.view = "setup";
        state.msg = null;
        render();
      }
    };
  }

  function renderDashboard() {
    var p = state.players;
    var counts = { all: p.length, R5: 0, R4: 0, R3: 0, R2: 0, R1: 0 };
    p.forEach(function(m) { counts[m.rank] = (counts[m.rank] || 0) + 1; });

    // Filter & sort
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

    // Stats
    var totalPower = 0;
    p.forEach(function(m) { totalPower += parsePowerNum(m.power); });
    var powerStr = totalPower >= 1000 ? (totalPower / 1000).toFixed(1) + "B" : totalPower.toFixed(0) + "M";

    var html = '';
    // Header
    html += '<div class="dash-header"><div class="dash-brand">IDs ADMIN</div><div class="dash-actions">';
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
    html += '<button class="tab-btn' + (state.tab === "roster" ? " active" : "") + '" data-tab="roster">Roster</button>';
    html += '<button class="tab-btn' + (state.tab === "screenshot" ? " active" : "") + '" data-tab="screenshot">Screenshot</button>';
    html += '</div>';

    if (state.tab === "roster") {
      // Toolbar
      html += '<div class="toolbar">';
      html += '<input type="search" id="search-input" placeholder="Search player..." value="' + esc(state.search) + '">';
      html += '<div class="filter-pills">';
      var ranks = ["all","R5","R4","R3","R2","R1"];
      ranks.forEach(function(r) {
        var label = r === "all" ? "ALL" : r;
        var count = r === "all" ? counts.all : (counts[r]||0);
        html += '<button class="pill' + (state.filterRank === r ? " active" : "") + '" data-rank="' + r + '">' + label + ' ' + count + '</button>';
      });
      html += '</div>';
      html += '<button class="btn-sm" id="add-btn">+ ADD</button>';
      html += '</div>';

      // Table
      html += '<div class="content"><div class="table-wrap"><table><thead><tr>';
      html += '<th class="col-num">#</th>';
      var cols = [["name","NAME"],["power","POWER"],["level","LVL"],["rank","RANK"],["role","ROLE"]];
      cols.forEach(function(c) {
        var cls = "col-" + c[0] + (state.sortCol === c[0] ? " sorted" : "");
        var arrow = state.sortCol === c[0] ? (state.sortAsc ? " ▲" : " ▼") : "";
        html += '<th class="' + cls + '" data-sort="' + c[0] + '">' + c[1] + arrow + '</th>';
      });
      html += '<th class="col-actions">ACTIONS</th></tr></thead><tbody>';

      if (filtered.length === 0) {
        html += '<tr><td colspan="7" class="empty-state"><div class="icon">🔍</div>No players found</td></tr>';
      } else {
        filtered.forEach(function(m, i) {
          var idx = state.players.indexOf(m);
          html += '<tr data-idx="' + idx + '">';
          html += '<td class="col-num">' + (i+1) + '</td>';
          html += '<td class="col-name"><span class="player-name">' + esc(m.name) + '</span></td>';
          html += '<td class="col-power"><span class="power-val">' + esc(m.power) + '</span></td>';
          html += '<td class="col-level">' + m.level + '</td>';
          html += '<td class="col-rank"><span class="rank-badge rank-' + m.rank + '">' + m.rank + '</span></td>';
          html += '<td class="col-role"><span class="role-tag">' + esc(m.role) + '</span></td>';
          html += '<td class="col-actions"><div class="row-actions">';
          html += '<button class="btn-sm edit-btn" data-idx="' + idx + '">EDIT</button>';
          html += '<button class="btn-danger del-btn" data-idx="' + idx + '">DEL</button>';
          html += '</div></td>';
          html += '</tr>';
        });
      }
      html += '</tbody></table></div></div>';
    } else {
      // Screenshot tab
      html += '<div class="content"><div class="screenshot-tab">';
      html += '<div class="upload-zone" id="upload-zone"><div class="icon">📸</div><p>Drop screenshots here or click to upload</p><p class="hint">Upload Member List screenshots from the game</p></div>';
      html += '<input type="file" id="file-input" accept="image/*" multiple style="display:none">';

      if (state.screenshots.length > 0) {
        html += '<div class="preview-grid">';
        state.screenshots.forEach(function(s, i) {
          html += '<div class="preview-thumb"><img src="' + s + '"><button class="remove-btn" data-si="' + i + '">✕</button></div>';
        });
        html += '</div>';
        html += '<button class="btn-primary" id="ocr-btn" style="margin-bottom:16px"' + (state.loading ? ' disabled' : '') + '>Scan & Parse Screenshots</button>';
      }

      if (state.ocrStatus) {
        html += '<div class="ocr-status">' + esc(state.ocrStatus);
        if (state.ocrProgress > 0 && state.ocrProgress < 100) {
          html += '<div class="progress-bar"><div class="progress-fill" style="width:' + state.ocrProgress + '%"></div></div>';
        }
        html += '</div>';
      }

      if (state.ocrResults.length > 0) {
        html += '<h3 style="margin:16px 0 10px;font-family:var(--font-heading);font-size:1rem;letter-spacing:2px;color:var(--gold-primary)">PARSED RESULTS (' + state.ocrResults.length + ' players)</h3>';
        html += '<div class="table-wrap"><table><thead><tr><th>NAME</th><th>POWER</th><th>STATUS</th></tr></thead><tbody>';
        state.ocrResults.forEach(function(r) {
          var status = r.matched ? '<span style="color:#00c853">Matched</span>' : '<span style="color:var(--gold-primary)">New</span>';
          html += '<tr><td>' + esc(r.name) + '</td><td><span class="power-val">' + esc(r.power) + '</span></td><td>' + status + '</td></tr>';
        });
        html += '</tbody></table></div>';
        html += '<button class="btn-gold" id="apply-ocr" style="margin-top:12px;width:100%">Apply to Roster</button>';
      }
      html += '</div></div>';
    }

    // Push bar
    var pushMsg = state.msg || (state.dirty ? "Changes pending" : "Up to date");
    var pushCls = state.msgType === "success" ? " success" : state.msgType === "error" ? " error" : "";
    html += '<div class="push-bar">';
    html += '<span class="push-msg' + pushCls + '">' + esc(pushMsg) + '</span>';
    html += '<button class="btn-gold" id="push-btn"' + (state.loading ? ' disabled' : '') + '>' + (state.loading ? 'PUSHING...' : 'PUSH TO GITHUB') + '</button>';
    html += '</div>';

    // Modal
    if (state.editPlayer !== null) {
      var ep = state.editPlayer;
      var title = state.editIdx === -1 ? "ADD PLAYER" : "EDIT PLAYER";
      html += '<div class="modal-overlay" id="modal-overlay">';
      html += '<div class="modal"><h3>' + title + '</h3><form id="edit-form">';
      html += '<div class="form-group"><label>Name</label><input id="ed-name" value="' + esc(ep.name) + '" required></div>';
      html += '<div class="form-group"><label>Power</label><input id="ed-power" value="' + esc(ep.power) + '" placeholder="e.g. 50.1M" required></div>';
      html += '<div class="form-group"><label>Level</label><input id="ed-level" type="number" value="' + ep.level + '" min="1" max="99" required></div>';
      html += '<div class="form-group"><label>Rank</label><select id="ed-rank"><option value="R5"' + (ep.rank==="R5"?" selected":"") + '>R5 - Leader</option><option value="R4"' + (ep.rank==="R4"?" selected":"") + '>R4 - Officer</option><option value="R3"' + (ep.rank==="R3"?" selected":"") + '>R3 - Elite</option><option value="R2"' + (ep.rank==="R2"?" selected":"") + '>R2 - Member</option><option value="R1"' + (ep.rank==="R1"?" selected":"") + '>R1 - Inactive</option></select></div>';
      html += '<div class="form-group"><label>Role (optional)</label><input id="ed-role" value="' + esc(ep.role) + '" placeholder="Leader, Warlord, Muse..."></div>';
      html += '<div class="modal-actions"><button type="submit" class="btn-primary">SAVE</button><button type="button" class="btn-secondary" id="cancel-edit">CANCEL</button></div>';
      html += '</form></div></div>';
    }

    app.innerHTML = html;
    bindDashboard();
  }

  function bindDashboard() {
    // Logout
    var lb = document.getElementById("logout-btn");
    if (lb) lb.onclick = function() { state.view = "login"; state.token = null; state.msg = null; render(); };

    // Tabs
    document.querySelectorAll(".tab-btn").forEach(function(b) {
      b.onclick = function() { state.tab = b.dataset.tab; state.msg = null; render(); };
    });

    // Search
    var si = document.getElementById("search-input");
    if (si) si.oninput = function() { state.search = si.value; render(); var el = document.getElementById("search-input"); if (el) { el.focus(); el.selectionStart = el.selectionEnd = si.value.length; } };

    // Filter pills
    document.querySelectorAll(".pill").forEach(function(b) {
      b.onclick = function() { state.filterRank = b.dataset.rank; render(); };
    });

    // Sort
    document.querySelectorAll("th[data-sort]").forEach(function(th) {
      th.onclick = function() {
        if (state.sortCol === th.dataset.sort) state.sortAsc = !state.sortAsc;
        else { state.sortCol = th.dataset.sort; state.sortAsc = true; }
        render();
      };
    });

    // Add
    var ab = document.getElementById("add-btn");
    if (ab) ab.onclick = function() { state.editPlayer = { name: "", power: "", level: 1, rank: "R2", role: "" }; state.editIdx = -1; render(); };

    // Edit buttons
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

    // Delete buttons
    document.querySelectorAll(".del-btn").forEach(function(b) {
      b.onclick = function(e) {
        e.stopPropagation();
        var idx = parseInt(b.dataset.idx);
        if (confirm("Delete " + state.players[idx].name + "?")) {
          state.players.splice(idx, 1);
          state.dirty = true;
          state.msg = "Player deleted. Don't forget to push!";
          state.msgType = "info";
          render();
        }
      };
    });

    // Push
    var pb = document.getElementById("push-btn");
    if (pb) pb.onclick = pushToGitHub;

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
      state.msg = "Player saved. Don't forget to push!";
      state.msgType = "info";
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

    // OCR
    var ob = document.getElementById("ocr-btn");
    if (ob) ob.onclick = runOCR;

    // Apply OCR
    var ao = document.getElementById("apply-ocr");
    if (ao) ao.onclick = function() {
      var updated = 0, added = 0;
      state.ocrResults.forEach(function(r) {
        if (r.matched) {
          var idx = state.players.findIndex(function(p) { return p.name.toLowerCase() === r.name.toLowerCase(); });
          if (idx !== -1) { state.players[idx].power = r.power; updated++; }
        }
      });
      state.ocrResults = [];
      state.ocrStatus = "";
      state.screenshots = [];
      state.dirty = true;
      state.msg = updated + " players updated. Don't forget to push!";
      state.msgType = "success";
      state.tab = "roster";
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

  // === OCR ===
  async function runOCR() {
    if (state.screenshots.length === 0) return;
    state.loading = true;
    state.ocrStatus = "Loading OCR engine...";
    state.ocrProgress = 5;
    state.ocrResults = [];
    render();

    try {
      // Load Tesseract.js dynamically if needed
      if (typeof Tesseract === "undefined") {
        await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
      }

      var allText = "";
      for (var i = 0; i < state.screenshots.length; i++) {
        state.ocrStatus = "Scanning image " + (i+1) + "/" + state.screenshots.length + "...";
        state.ocrProgress = 10 + (i / state.screenshots.length) * 70;
        render();

        var result = await Tesseract.recognize(state.screenshots[i], "eng", {
          logger: function(m) {
            if (m.status === "recognizing text") {
              state.ocrProgress = 10 + ((i + m.progress) / state.screenshots.length) * 70;
              render();
            }
          }
        });
        allText += result.data.text + "\n";
      }

      state.ocrStatus = "Parsing results...";
      state.ocrProgress = 85;
      render();

      // Parse OCR text
      var lines = allText.split("\n");
      var results = [];
      var powerRe = /(\d+[\.,]\d+)\s*[MmBb]/;

      lines.forEach(function(line) {
        line = line.trim();
        if (!line || line.length < 3) return;
        var pm = line.match(powerRe);
        if (!pm) return;

        var powerVal = pm[1].replace(",", ".") + "M";
        var beforePower = line.substring(0, pm.index).trim();
        if (!beforePower || beforePower.length < 2) return;

        // Clean up name
        var name = beforePower.replace(/^[\d\.\s#]+/, "").replace(/[^\w\s\-_.'"]/g, " ").replace(/\s+/g, " ").trim();
        if (name.length < 2) return;

        // Check if player exists
        var matched = state.players.some(function(p) {
          return p.name.toLowerCase() === name.toLowerCase() || 
                 p.name.toLowerCase().indexOf(name.toLowerCase()) !== -1 ||
                 name.toLowerCase().indexOf(p.name.toLowerCase()) !== -1;
        });

        // Find exact match
        var exactMatch = state.players.find(function(p) {
          return p.name.toLowerCase() === name.toLowerCase();
        });

        if (exactMatch) {
          results.push({ name: exactMatch.name, power: powerVal, matched: true });
        } else {
          // Fuzzy match
          var bestMatch = null, bestScore = 0;
          state.players.forEach(function(p) {
            var score = similarity(name.toLowerCase(), p.name.toLowerCase());
            if (score > bestScore && score > 0.6) { bestScore = score; bestMatch = p; }
          });
          if (bestMatch) {
            results.push({ name: bestMatch.name, power: powerVal, matched: true });
          }
        }
      });

      // Deduplicate (keep last occurrence)
      var seen = {};
      results = results.filter(function(r) {
        if (seen[r.name]) return false;
        seen[r.name] = true;
        return true;
      });

      state.ocrResults = results;
      state.ocrStatus = "Found " + results.length + " players from screenshots.";
      state.ocrProgress = 100;
    } catch(e) {
      state.ocrStatus = "OCR Error: " + e.message;
    }
    state.loading = false;
    render();
  }

  function similarity(a, b) {
    if (a === b) return 1;
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

  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // === START ===
  init();
})();