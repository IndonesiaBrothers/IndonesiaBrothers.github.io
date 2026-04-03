// ============================================
// IDs Brotherhood - Admin Panel v3
// Direct GitHub API + Tesseract.js OCR
// No webhook needed!
// ============================================

// --- Constants ---
const GITHUB_OWNER = 'IndonesiaBrothers';
const GITHUB_REPO = 'IndonesiaBrothers.github.io';
const GITHUB_FILE = 'script.js';
const GITHUB_API = 'https://api.github.com';
const DEFAULT_PASSWORD = 'ids2026';

// --- State ---
let players = [];
let originalPlayers = [];
let changes = new Set();
let newPlayers = new Set();
let deletedIndices = new Set();
let currentSort = { field: 'rank', dir: 'asc' };
let screenshotFiles = [];
let ocrResults = [];
let scriptJsSha = null;
let fullScriptContent = '';
let tesseractWorker = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('ids_admin_auth') === 'true') {
    showAdmin();
  }

  document.getElementById('passwordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') attemptLogin();
  });

  document.getElementById('searchBox').addEventListener('input', renderTable);
  document.getElementById('rankFilter').addEventListener('change', renderTable);

  // Screenshot drag & drop
  const dropZone = document.getElementById('screenshotDropZone');
  const fileInput = document.getElementById('screenshotInput');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleScreenshotFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', e => handleScreenshotFiles(e.target.files));
});

// ============================================
// LOGIN
// ============================================
function attemptLogin() {
  const input = document.getElementById('passwordInput').value;
  const savedPassword = localStorage.getItem('ids_admin_password') || DEFAULT_PASSWORD;

  if (input === savedPassword) {
    sessionStorage.setItem('ids_admin_auth', 'true');
    showAdmin();
  } else {
    const err = document.getElementById('loginError');
    err.style.display = 'block';
    document.getElementById('passwordInput').value = '';
    setTimeout(() => err.style.display = 'none', 3000);
  }
}

function showAdmin() {
  document.getElementById('loginScreen').style.display = 'none';
  const container = document.getElementById('adminContainer');
  container.style.display = 'flex'; // flexbox layout!
  document.body.style.overflow = 'hidden'; // prevent body scroll
  loadPlayersFromGitHub();
  loadConfig();
}

// ============================================
// TAB SWITCHING
// ============================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="' + tabId + '"]').classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
}

// ============================================
// CONFIG (GitHub Token)
// ============================================
function loadConfig() {
  const token = localStorage.getItem('ids_github_token') || '';
  document.getElementById('githubToken').value = token;
  updateTokenStatus(token);
}

function saveConfig() {
  const token = document.getElementById('githubToken').value.trim();
  const pw = document.getElementById('configPassword').value.trim();

  if (token) {
    localStorage.setItem('ids_github_token', token);
    updateTokenStatus(token);
    showToast('GitHub Token saved!', 'success');
  }
  if (pw) {
    localStorage.setItem('ids_admin_password', pw);
    showToast('Password updated!', 'success');
  }
  if (!token && !pw) {
    showToast('Nothing to save', 'info');
  }
}

function updateTokenStatus(token) {
  const el = document.getElementById('tokenStatus');
  if (token) {
    el.textContent = '✅ Token configured';
    el.className = 'token-status configured';
  } else {
    el.textContent = '⚠️ Token belum di-set — Push ke GitHub tidak bisa dilakukan';
    el.className = 'token-status not-configured';
  }
}

function openConfig() {
  document.getElementById('configOverlay').style.display = 'flex';
}

function closeConfig() {
  document.getElementById('configOverlay').style.display = 'none';
}

function closeConfigOutside(e) {
  if (e.target === document.getElementById('configOverlay')) closeConfig();
}

// ============================================
// LOAD PLAYERS
// ============================================
async function loadPlayersFromGitHub() {
  try {
    const token = localStorage.getItem('ids_github_token');
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let text = '';

    // Try GitHub API first (gives SHA for push)
    try {
      const resp = await fetch(GITHUB_API + '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + GITHUB_FILE, { headers });
      if (resp.ok) {
        const data = await resp.json();
        scriptJsSha = data.sha;
        text = base64ToUtf8(data.content.replace(/\n/g, ''));
        fullScriptContent = text;
        console.log('[Admin] Loaded from GitHub API, SHA:', scriptJsSha);
      }
    } catch (e) {
      console.warn('[Admin] GitHub API failed, falling back to direct fetch:', e);
    }

    // Fallback: direct same-origin fetch
    if (!text) {
      const resp = await fetch('script.js?t=' + Date.now());
      if (!resp.ok) throw new Error('Failed to fetch script.js: ' + resp.status);
      text = await resp.text();
      fullScriptContent = text;
      console.log('[Admin] Loaded from direct fetch');
    }

    // Parse players
    players = parsePlayersRegex(text);
    if (players.length === 0) {
      console.warn('[Admin] Regex parse failed, trying eval...');
      players = parsePlayersEval(text);
    }

    if (players.length === 0) {
      showToast('No players found! Check console.', 'error');
      console.error('[Admin] Parse failed. First 500 chars:', text.substring(0, 500));
      return;
    }

    console.log('[Admin] Loaded ' + players.length + ' players');

    originalPlayers = JSON.parse(JSON.stringify(players));
    changes.clear();
    newPlayers.clear();
    deletedIndices.clear();

    renderStats();
    renderTable();
    updateSaveBar();
    showToast('Loaded ' + players.length + ' players', 'success');
  } catch (err) {
    console.error('[Admin] Load error:', err);
    showToast('Failed to load: ' + err.message, 'error');
  }
}

// --- Parse Method 1: Regex ---
function parsePlayersRegex(text) {
  const result = [];
  // Match const members = [ ... ];
  const arrMatch = text.match(/const\s+members\s*=\s*\[([\s\S]*?)\];/);
  if (!arrMatch) {
    console.warn('[Admin] Regex: Could not find members array');
    return [];
  }

  const arrContent = arrMatch[1];
  // Match each object { name: "...", power: "...", level: N, rank: "...", role: "..." }
  const objRegex = /\{\s*name:\s*"([^"]*?)"\s*,\s*power:\s*"([^"]*?)"\s*,\s*level:\s*(\d+)\s*,\s*rank:\s*"([^"]*?)"\s*,\s*role:\s*"([^"]*?)"\s*\}/g;
  let m;
  while ((m = objRegex.exec(arrContent)) !== null) {
    result.push({
      name: m[1],
      power: m[2],
      level: parseInt(m[3]),
      rank: m[4],
      role: m[5]
    });
  }

  console.log('[Admin] Regex parsed: ' + result.length + ' players');
  return result;
}

// --- Parse Method 2: Eval (fallback) ---
function parsePlayersEval(text) {
  try {
    const match = text.match(/const\s+members\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) return [];

    const parsed = new Function('return ' + match[1])();
    if (!Array.isArray(parsed)) return [];

    return parsed.map(p => ({
      name: String(p.name || ''),
      power: String(p.power || 'N/A'),
      level: parseInt(p.level) || 1,
      rank: String(p.rank || 'R1'),
      role: String(p.role || '')
    }));
  } catch (err) {
    console.error('[Admin] Eval parse failed:', err);
    return [];
  }
}

// ============================================
// RENDER
// ============================================
function renderStats() {
  const active = players.filter((_, i) => !deletedIndices.has(i));
  const counts = { total: active.length, R5: 0, R4: 0, R3: 0, R2: 0, R1: 0 };
  active.forEach(p => { if (counts[p.rank] !== undefined) counts[p.rank]++; });

  document.getElementById('statsBar').innerHTML =
    '<div class="stat-card total"><div class="stat-value">' + counts.total + '</div><div class="stat-label">Total</div></div>' +
    '<div class="stat-card r5"><div class="stat-value">' + counts.R5 + '</div><div class="stat-label">R5</div></div>' +
    '<div class="stat-card r4"><div class="stat-value">' + counts.R4 + '</div><div class="stat-label">R4</div></div>' +
    '<div class="stat-card r3"><div class="stat-value">' + counts.R3 + '</div><div class="stat-label">R3</div></div>' +
    '<div class="stat-card r2"><div class="stat-value">' + counts.R2 + '</div><div class="stat-label">R2</div></div>' +
    '<div class="stat-card r1"><div class="stat-value">' + counts.R1 + '</div><div class="stat-label">R1</div></div>';
}

function renderTable() {
  const search = document.getElementById('searchBox').value.toLowerCase().trim();
  const rankFilter = document.getElementById('rankFilter').value;
  const tbody = document.getElementById('playerTableBody');

  if (players.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No players loaded.</td></tr>';
    return;
  }

  let list = players.map((p, i) => ({ ...p, _idx: i }));
  list = list.filter(p => !deletedIndices.has(p._idx));
  if (search) list = list.filter(p => p.name.toLowerCase().includes(search));
  if (rankFilter) list = list.filter(p => p.rank === rankFilter);

  // Sort
  list.sort((a, b) => {
    let va, vb;
    switch (currentSort.field) {
      case 'name':
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
        return currentSort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'power':
        va = parsePower(a.power);
        vb = parsePower(b.power);
        return currentSort.dir === 'asc' ? va - vb : vb - va;
      case 'level':
        return currentSort.dir === 'asc' ? a.level - b.level : b.level - a.level;
      case 'rank':
        va = rankOrder(a.rank);
        vb = rankOrder(b.rank);
        if (va !== vb) return currentSort.dir === 'asc' ? va - vb : vb - va;
        return parsePower(b.power) - parsePower(a.power);
      default:
        return 0;
    }
  });

  // Update sort arrows
  document.querySelectorAll('.sort-arrow').forEach(el => el.classList.remove('active'));
  const activeArrow = document.getElementById('sort-' + currentSort.field);
  if (activeArrow) {
    activeArrow.classList.add('active');
    activeArrow.textContent = currentSort.dir === 'asc' ? '▲' : '▼';
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No players match your search.</td></tr>';
    return;
  }

  let html = '';
  list.forEach((p, displayIdx) => {
    const idx = p._idx;
    const isModified = changes.has(idx);
    const isNew = newPlayers.has(idx);
    const rowClass = isNew ? 'row-new' : (isModified ? 'row-modified' : '');

    const nameEsc = escapeHtml(p.name);
    const powerEsc = escapeHtml(p.power);
    const roleEsc = escapeHtml(p.role);

    html += '<tr class="' + rowClass + '" data-idx="' + idx + '">' +
      '<td class="row-number">' + (displayIdx + 1) + '</td>' +
      '<td><input type="text" value="' + nameEsc + '" onchange="updateField(' + idx + ',\'name\',this.value)"></td>' +
      '<td><input type="text" value="' + powerEsc + '" onchange="updateField(' + idx + ',\'power\',this.value)" style="width:110px"></td>' +
      '<td><input type="number" value="' + p.level + '" min="1" max="30" onchange="updateField(' + idx + ',\'level\',parseInt(this.value))" style="width:60px"></td>' +
      '<td><select onchange="updateField(' + idx + ',\'rank\',this.value)">' +
        ['R5','R4','R3','R2','R1'].map(r => '<option value="' + r + '"' + (p.rank === r ? ' selected' : '') + '>' + r + '</option>').join('') +
      '</select></td>' +
      '<td><input type="text" value="' + roleEsc + '" onchange="updateField(' + idx + ',\'role\',this.value)"></td>' +
      '<td><button class="btn btn-danger btn-sm" onclick="deletePlayer(' + idx + ')">✕</button></td>' +
    '</tr>';
  });

  tbody.innerHTML = html;
}

// ============================================
// CRUD OPERATIONS
// ============================================
function updateField(idx, field, value) {
  players[idx][field] = value;

  if (idx < originalPlayers.length) {
    const orig = originalPlayers[idx];
    if (orig[field] !== value) {
      changes.add(idx);
    } else {
      const allMatch = ['name','power','level','rank','role'].every(f => players[idx][f] === orig[f]);
      if (allMatch) changes.delete(idx);
    }
  }

  renderStats();
  updateSaveBar();
}

function toggleAddPlayer() {
  const section = document.getElementById('addSection');
  section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

function addPlayer() {
  const name = document.getElementById('addName').value.trim();
  const power = document.getElementById('addPower').value.trim() || 'N/A';
  const level = parseInt(document.getElementById('addLevel').value) || 1;
  const rank = document.getElementById('addRank').value;
  const role = document.getElementById('addRole').value.trim();

  if (!name) {
    showToast('Player name is required!', 'error');
    return;
  }

  if (players.some((p, i) => !deletedIndices.has(i) && p.name.toLowerCase() === name.toLowerCase())) {
    showToast('Player already exists!', 'error');
    return;
  }

  const idx = players.length;
  players.push({ name, power, level, rank, role });
  newPlayers.add(idx);

  document.getElementById('addName').value = '';
  document.getElementById('addPower').value = '';
  document.getElementById('addLevel').value = '';
  document.getElementById('addRole').value = '';

  toggleAddPlayer();
  renderStats();
  renderTable();
  updateSaveBar();
  showToast(name + ' added!', 'success');
}

function deletePlayer(idx) {
  const name = players[idx].name;
  if (confirm('Remove ' + name + ' from the roster?')) {
    deletedIndices.add(idx);
    if (newPlayers.has(idx)) newPlayers.delete(idx);
    renderStats();
    renderTable();
    updateSaveBar();
    showToast(name + ' removed', 'info');
  }
}

function discardChanges() {
  if (confirm('Discard all changes?')) {
    players = JSON.parse(JSON.stringify(originalPlayers));
    changes.clear();
    newPlayers.clear();
    deletedIndices.clear();
    renderStats();
    renderTable();
    updateSaveBar();
    showToast('Changes discarded', 'info');
  }
}

// ============================================
// SORT & FILTER
// ============================================
function sortBy(field) {
  if (currentSort.field === field) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.field = field;
    currentSort.dir = 'asc';
  }
  renderTable();
}

function rankOrder(rank) {
  const order = { R5: 1, R4: 2, R3: 3, R2: 4, R1: 5 };
  return order[rank] || 99;
}

function parsePower(str) {
  if (!str || str === 'N/A') return 0;
  str = str.replace(/,/g, '').trim();
  const m = str.match(/([\d.]+)\s*(B|M|K)?/i);
  if (!m) return 0;
  let num = parseFloat(m[1]);
  const suffix = (m[2] || '').toUpperCase();
  if (suffix === 'B') num *= 1000000000;
  else if (suffix === 'M') num *= 1000000;
  else if (suffix === 'K') num *= 1000;
  return num;
}

// ============================================
// SAVE BAR
// ============================================
function updateSaveBar() {
  const totalChanges = changes.size + newPlayers.size + deletedIndices.size;
  const bar = document.getElementById('saveBar');

  if (totalChanges > 0) {
    bar.classList.add('visible');
    const parts = [];
    if (changes.size) parts.push(changes.size + ' edited');
    if (newPlayers.size) parts.push(newPlayers.size + ' added');
    if (deletedIndices.size) parts.push(deletedIndices.size + ' removed');
    document.getElementById('changesInfo').textContent = totalChanges + ' change' + (totalChanges > 1 ? 's' : '') + ' pending (' + parts.join(', ') + ')';
  } else {
    bar.classList.remove('visible');
  }
}

// ============================================
// PUSH TO GITHUB (Direct API)
// ============================================
async function pushToGitHub() {
  const token = localStorage.getItem('ids_github_token');
  if (!token) {
    showToast('Set GitHub Token dulu di ⚙️ Config!', 'error');
    openConfig();
    return;
  }

  const totalChanges = changes.size + newPlayers.size + deletedIndices.size;
  if (totalChanges === 0) {
    showToast('No changes to push!', 'info');
    return;
  }

  const finalPlayers = players.filter((_, i) => !deletedIndices.has(i));

  showLoading('Pushing to GitHub...');

  try {
    // Generate new members array
    const membersStr = generateMembersArray(finalPlayers);

    // Get latest SHA if we don't have it
    if (!scriptJsSha) {
      const resp = await fetch(GITHUB_API + '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + GITHUB_FILE, {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!resp.ok) throw new Error('Failed to get file from GitHub: ' + resp.status);
      const data = await resp.json();
      scriptJsSha = data.sha;
      fullScriptContent = base64ToUtf8(data.content.replace(/\n/g, ''));
    }

    // Replace ONLY the members array in script.js
    const newContent = replaceMembersArray(fullScriptContent, membersStr);

    // Push to GitHub
    const pushResp = await fetch(GITHUB_API + '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + GITHUB_FILE, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Update player data (' + finalPlayers.length + ' players)',
        content: utf8ToBase64(newContent),
        sha: scriptJsSha
      })
    });

    if (!pushResp.ok) {
      const errData = await pushResp.json().catch(() => ({}));
      throw new Error(errData.message || 'Push failed: ' + pushResp.status);
    }

    const result = await pushResp.json();
    scriptJsSha = result.content.sha;
    fullScriptContent = newContent;

    // Reset state
    players = JSON.parse(JSON.stringify(finalPlayers));
    originalPlayers = JSON.parse(JSON.stringify(finalPlayers));
    changes.clear();
    newPlayers.clear();
    deletedIndices.clear();

    hideLoading();
    renderStats();
    renderTable();
    updateSaveBar();
    showToast('✅ Pushed! ' + finalPlayers.length + ' players. Website updates in ~1 min.', 'success');
  } catch (err) {
    hideLoading();
    console.error('[Admin] Push error:', err);
    showToast('Push failed: ' + err.message, 'error');
  }
}

function generateMembersArray(playerList) {
  let str = 'const members = [\n';
  playerList.forEach((p, i) => {
    str += '  { name: "' + escapeJS(p.name) + '", power: "' + escapeJS(p.power) + '", level: ' + p.level + ', rank: "' + escapeJS(p.rank) + '", role: "' + escapeJS(p.role) + '" }';
    if (i < playerList.length - 1) str += ',';
    str += '\n';
  });
  str += '];';
  return str;
}

function replaceMembersArray(scriptContent, newMembersStr) {
  const startRegex = /const\s+members\s*=\s*\[/;
  const match = scriptContent.match(startRegex);
  if (!match) throw new Error('Could not find members array in script.js');

  const startIdx = match.index;

  // Find matching ];
  let depth = 0;
  let endIdx = startIdx;
  let inString = false;
  let stringChar = '';

  for (let i = startIdx + match[0].length - 1; i < scriptContent.length; i++) {
    const c = scriptContent[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '[') depth++;
    if (c === ']') {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        if (scriptContent[i + 1] === ';') endIdx = i + 2;
        break;
      }
    }
  }

  return scriptContent.substring(0, startIdx) + newMembersStr + scriptContent.substring(endIdx);
}

// ============================================
// SCREENSHOT OCR (Tesseract.js)
// ============================================
function handleScreenshotFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    screenshotFiles.push(file);
  }
  renderScreenshotPreviews();
}

function renderScreenshotPreviews() {
  const container = document.getElementById('screenshotPreviews');
  const actions = document.getElementById('screenshotActions');

  if (screenshotFiles.length === 0) {
    container.innerHTML = '';
    actions.style.display = 'none';
    return;
  }

  actions.style.display = 'flex';

  let html = '';
  screenshotFiles.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    html += '<div class="preview-card">' +
      '<img src="' + url + '" alt="Screenshot ' + (i+1) + '">' +
      '<div class="preview-info">' +
        '<div class="preview-name">' + escapeHtml(file.name) + '</div>' +
        '<div class="preview-size">' + (file.size / 1024).toFixed(0) + ' KB</div>' +
      '</div>' +
      '<button class="preview-remove" onclick="removeScreenshot(' + i + ')">✕</button>' +
    '</div>';
  });

  container.innerHTML = html;
}

function removeScreenshot(index) {
  screenshotFiles.splice(index, 1);
  renderScreenshotPreviews();
}

function clearScreenshots() {
  screenshotFiles = [];
  ocrResults = [];
  renderScreenshotPreviews();
  document.getElementById('ocrProgress').style.display = 'none';
  document.getElementById('ocrReview').style.display = 'none';
}

async function loadTesseract() {
  if (tesseractWorker) return tesseractWorker;

  // Dynamically load Tesseract.js
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
      document.head.appendChild(script);
    });
  }

  tesseractWorker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        const pct = Math.round(m.progress * 100);
        const bar = document.getElementById('ocrProgressBar');
        if (bar) bar.style.width = pct + '%';
      }
    }
  });

  return tesseractWorker;
}

async function processScreenshots() {
  if (screenshotFiles.length === 0) {
    showToast('No screenshots to process!', 'error');
    return;
  }

  const progressSection = document.getElementById('ocrProgress');
  const progressBar = document.getElementById('ocrProgressBar');
  const progressText = document.getElementById('ocrProgressText');

  progressSection.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = 'Loading OCR engine...';

  try {
    const worker = await loadTesseract();
    ocrResults = [];

    for (let i = 0; i < screenshotFiles.length; i++) {
      progressText.textContent = 'Scanning screenshot ' + (i + 1) + ' of ' + screenshotFiles.length + '...';
      progressBar.style.width = Math.round(((i) / screenshotFiles.length) * 100) + '%';

      // Preprocess image for better OCR
      const processedBlob = await preprocessImage(screenshotFiles[i]);

      const result = await worker.recognize(processedBlob);
      const text = result.data.text;
      console.log('[OCR] Screenshot ' + (i+1) + ' raw text:', text);

      // Parse OCR output
      const parsed = parseOCRText(text);
      ocrResults.push(...parsed);
    }

    progressBar.style.width = '100%';

    if (ocrResults.length === 0) {
      progressText.textContent = '⚠️ Tidak ada data player yang terdeteksi. Coba screenshot yang lebih jelas.';
      showToast('No player data detected. Try clearer screenshots.', 'error');
      return;
    }

    progressText.textContent = '✅ Found ' + ocrResults.length + ' players!';
    showOCRReview();
    showToast('Detected ' + ocrResults.length + ' players. Review below!', 'success');

  } catch (err) {
    console.error('[OCR] Error:', err);
    progressText.textContent = '❌ Error: ' + err.message;
    showToast('OCR failed: ' + err.message, 'error');
  }
}

// Preprocess image for better OCR (invert, enhance contrast)
function preprocessImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      // Draw original
      ctx.drawImage(img, 0, 0);

      // Get pixel data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert to grayscale, invert, increase contrast
      for (let i = 0; i < data.length; i += 4) {
        // Grayscale
        let gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
        // Invert (dark bg → light bg for better OCR)
        gray = 255 - gray;
        // Increase contrast
        gray = gray < 100 ? 0 : Math.min(255, gray * 1.5);

        data[i] = gray;
        data[i+1] = gray;
        data[i+2] = gray;
      }

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(blob => resolve(blob), 'image/png');
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Parse OCR text into player data
function parseOCRText(text) {
  const results = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Look for patterns:
  // - Power values: numbers like 64,300,428 or 64.3M or 234.2M
  // - Level: Lv.30 or Lv 30 or level numbers
  // - Player names: text strings near power values
  const powerRegex = /(\d[\d,]*\.?\d*)\s*(B|M|K|b|m|k)?/;
  const lvRegex = /[Ll][Vv]\.?\s*(\d+)/;

  let currentName = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Try to find a power value in this line
    const powerMatch = line.match(/^(\d[\d,]*\.?\d*)\s*(B|M|K)?$/i);
    const lvMatch = line.match(lvRegex);

    if (powerMatch) {
      // This line is a power value
      let power = powerMatch[1].replace(/,/g, '');
      const suffix = (powerMatch[2] || '').toUpperCase();

      // Convert to human readable
      if (!suffix && power.length > 6) {
        const num = parseFloat(power) / 1000000;
        power = num.toFixed(1) + 'M';
      } else if (suffix) {
        power = powerMatch[1] + suffix;
      }

      // The previous non-empty, non-number line was likely the name
      if (currentName) {
        let level = 0;
        // Check next line for level
        if (i + 1 < lines.length) {
          const nextLv = lines[i + 1].match(lvRegex);
          if (nextLv) {
            level = parseInt(nextLv[1]);
            i++; // skip level line
          }
        }

        results.push({
          name: currentName.trim(),
          power: power,
          level: level || 30,
          detected: true
        });
        currentName = '';
      }
    } else if (!line.match(/^\d/) && !lvMatch && line.length > 1 && line.length < 30) {
      // Likely a player name (not a number, not a level, reasonable length)
      currentName = line;
    }

    i++;
  }

  return results;
}

function showOCRReview() {
  const reviewSection = document.getElementById('ocrReview');
  const tbody = document.getElementById('ocrReviewBody');
  const count = document.getElementById('ocrReviewCount');

  let html = '';
  ocrResults.forEach((r, i) => {
    // Check if player exists
    const existingIdx = players.findIndex(p => p.name.toLowerCase() === r.name.toLowerCase());
    let status = '';
    let statusClass = '';

    if (existingIdx >= 0) {
      const existing = players[existingIdx];
      if (existing.power !== r.power) {
        status = '⬆️ Update (' + existing.power + ' → ' + r.power + ')';
        statusClass = 'ocr-status-update';
      } else {
        status = '— Same';
        statusClass = 'ocr-status-same';
      }
    } else {
      status = '✨ New';
      statusClass = 'ocr-status-new';
    }

    html += '<tr>' +
      '<td class="row-number">' + (i + 1) + '</td>' +
      '<td><input type="text" value="' + escapeHtml(r.name) + '" onchange="ocrResults[' + i + '].name=this.value"></td>' +
      '<td><input type="text" value="' + escapeHtml(r.power) + '" onchange="ocrResults[' + i + '].power=this.value" style="width:100px"></td>' +
      '<td><input type="number" value="' + r.level + '" min="1" max="30" onchange="ocrResults[' + i + '].level=parseInt(this.value)" style="width:60px"></td>' +
      '<td><span class="' + statusClass + '">' + status + '</span></td>' +
      '<td><button class="btn btn-danger btn-sm" onclick="removeOCRResult(' + i + ')">✕</button></td>' +
    '</tr>';
  });

  tbody.innerHTML = html;
  count.textContent = ocrResults.length + ' players detected';
  reviewSection.style.display = 'block';
}

function removeOCRResult(index) {
  ocrResults.splice(index, 1);
  showOCRReview();
}

function applyOCRResults() {
  let updated = 0;
  let added = 0;

  ocrResults.forEach(r => {
    const existingIdx = players.findIndex(p =>
      !deletedIndices.has(players.indexOf(p)) &&
      p.name.toLowerCase() === r.name.toLowerCase()
    );

    if (existingIdx >= 0) {
      // Update existing player
      if (players[existingIdx].power !== r.power || players[existingIdx].level !== r.level) {
        players[existingIdx].power = r.power;
        players[existingIdx].level = r.level;
        changes.add(existingIdx);
        updated++;
      }
    } else {
      // Add new player
      const idx = players.length;
      players.push({
        name: r.name,
        power: r.power,
        level: r.level,
        rank: 'R2',
        role: ''
      });
      newPlayers.add(idx);
      added++;
    }
  });

  ocrResults = [];
  document.getElementById('ocrReview').style.display = 'none';
  document.getElementById('ocrProgress').style.display = 'none';

  // Switch to roster tab
  switchTab('roster');

  renderStats();
  renderTable();
  updateSaveBar();

  const msg = [];
  if (updated) msg.push(updated + ' updated');
  if (added) msg.push(added + ' added');
  showToast('✅ Applied! ' + msg.join(', ') + '. Push to GitHub when ready.', 'success');
}

function cancelOCR() {
  ocrResults = [];
  document.getElementById('ocrReview').style.display = 'none';
  document.getElementById('ocrProgress').style.display = 'none';
}

// ============================================
// UTILITIES
// ============================================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeJS(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function showLoading(text) {
  document.getElementById('loadingText').textContent = text || 'Loading...';
  document.getElementById('loadingOverlay').classList.add('visible');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('visible');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
