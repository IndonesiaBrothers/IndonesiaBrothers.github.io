// ============================================
// IDs Brotherhood - Admin Panel Logic
// ============================================

// --- State ---
let players = [];
let originalPlayers = [];
let changes = new Set();
let newPlayers = new Set();
let deletedIndices = new Set();
let currentSort = { field: 'rank', dir: 'asc' };

// --- Default Config ---
const DEFAULT_PASSWORD = 'ids2026';

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  // Check if already logged in this session
  if (sessionStorage.getItem('ids_admin_auth') === 'true') {
    showAdmin();
  }

  // Enter key on password
  document.getElementById('passwordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') attemptLogin();
  });

  // Search & filter
  document.getElementById('searchBox').addEventListener('input', renderTable);
  document.getElementById('rankFilter').addEventListener('change', renderTable);
});

// --- Login ---
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
  document.getElementById('adminContainer').style.display = 'block';
  loadPlayersFromScript();
  loadConfig();
}

// --- Load Players from script.js ---
async function loadPlayersFromScript() {
  try {
    const response = await fetch('script.js');
    const text = await response.text();
    
    // Parse the members array from script.js
    const match = text.match(/const\s+members\s*=\s*\[([\s\S]*?)\];/);
    if (!match) {
      showToast('Could not parse player data from script.js', 'error');
      return;
    }

    // Parse each member object
    const memberBlock = match[1];
    const memberRegex = /\{\s*name:\s*"([^"]*)",\s*power:\s*"([^"]*)",\s*level:\s*(\d+),\s*rank:\s*"([^"]*)",\s*role:\s*"([^"]*)"\s*\}/g;
    
    players = [];
    let m;
    while ((m = memberRegex.exec(memberBlock)) !== null) {
      players.push({
        name: m[1],
        power: m[2],
        level: parseInt(m[3]),
        rank: m[4],
        role: m[5]
      });
    }

    if (players.length === 0) {
      showToast('No players found in script.js', 'error');
      return;
    }

    // Deep copy for change tracking
    originalPlayers = JSON.parse(JSON.stringify(players));
    changes.clear();
    newPlayers.clear();
    deletedIndices.clear();
    
    renderStats();
    renderTable();
    updateSaveBar();
    showToast(`Loaded ${players.length} players`, 'success');
  } catch (err) {
    showToast('Failed to load player data: ' + err.message, 'error');
  }
}

// --- Config ---
function loadConfig() {
  const url = localStorage.getItem('ids_webhook_url') || '';
  document.getElementById('webhookUrl').value = url;
}

function saveConfig() {
  const url = document.getElementById('webhookUrl').value.trim();
  const pw = document.getElementById('configPassword').value.trim();
  
  if (url) localStorage.setItem('ids_webhook_url', url);
  if (pw) {
    localStorage.setItem('ids_admin_password', pw);
    showToast('Password updated!', 'success');
  }
}

function openConfig() {
  const section = document.getElementById('configSection');
  section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

// --- Render Stats ---
function renderStats() {
  const active = players.filter((_, i) => !deletedIndices.has(i));
  const counts = { total: active.length, R5: 0, R4: 0, R3: 0, R2: 0, R1: 0 };
  active.forEach(p => { if (counts[p.rank] !== undefined) counts[p.rank]++; });

  document.getElementById('statsBar').innerHTML = `
    <div class="stat-card total"><div class="stat-value">${counts.total}</div><div class="stat-label">Total</div></div>
    <div class="stat-card r5"><div class="stat-value">${counts.R5}</div><div class="stat-label">R5</div></div>
    <div class="stat-card r4"><div class="stat-value">${counts.R4}</div><div class="stat-label">R4</div></div>
    <div class="stat-card r3"><div class="stat-value">${counts.R3}</div><div class="stat-label">R3</div></div>
    <div class="stat-card r2"><div class="stat-value">${counts.R2}</div><div class="stat-label">R2</div></div>
    <div class="stat-card r1"><div class="stat-value">${counts.R1}</div><div class="stat-label">R1</div></div>
  `;
}

// --- Render Table ---
function renderTable() {
  const search = document.getElementById('searchBox').value.toLowerCase();
  const rankFilter = document.getElementById('rankFilter').value;
  const tbody = document.getElementById('playerTableBody');

  // Build filtered + sorted list with original indices
  let list = players.map((p, i) => ({ ...p, _idx: i }));
  
  // Remove deleted
  list = list.filter(p => !deletedIndices.has(p._idx));
  
  // Filter
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
  const activeArrow = document.getElementById(`sort-${currentSort.field}`);
  if (activeArrow) {
    activeArrow.classList.add('active');
    activeArrow.textContent = currentSort.dir === 'asc' ? '▲' : '▼';
  }

  let html = '';
  list.forEach((p, displayIdx) => {
    const idx = p._idx;
    const isModified = changes.has(idx);
    const isNew = newPlayers.has(idx);
    const rowClass = isNew ? 'row-new' : (isModified ? 'row-modified' : '');

    html += `
      <tr class="${rowClass}" data-idx="${idx}">
        <td class="row-number">${displayIdx + 1}</td>
        <td><input type="text" value="${escapeHtml(p.name)}" onchange="updateField(${idx},'name',this.value)"></td>
        <td><input type="text" value="${escapeHtml(p.power)}" onchange="updateField(${idx},'power',this.value)" style="width:110px"></td>
        <td><input type="number" value="${p.level}" min="1" max="30" onchange="updateField(${idx},'level',parseInt(this.value))" style="width:60px"></td>
        <td>
          <select onchange="updateField(${idx},'rank',this.value)">
            ${['R5','R4','R3','R2','R1'].map(r => `<option value="${r}" ${p.rank===r?'selected':''}>${r}</option>`).join('')}
          </select>
        </td>
        <td><input type="text" value="${escapeHtml(p.role)}" onchange="updateField(${idx},'role',this.value)"></td>
        <td><button class="btn btn-danger btn-sm" onclick="deletePlayer(${idx})">✕</button></td>
      </tr>
    `;
  });

  tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No players found</td></tr>';
}

// --- Field Update ---
function updateField(idx, field, value) {
  players[idx][field] = value;
  
  // Check if it's actually different from original
  if (idx < originalPlayers.length) {
    const orig = originalPlayers[idx];
    if (orig[field] !== value) {
      changes.add(idx);
    } else {
      // Check if all fields match original
      const allMatch = ['name','power','level','rank','role'].every(f => players[idx][f] === orig[f]);
      if (allMatch) changes.delete(idx);
    }
  }
  
  renderStats();
  updateSaveBar();
}

// --- Add Player ---
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

  // Check duplicate
  if (players.some((p, i) => !deletedIndices.has(i) && p.name.toLowerCase() === name.toLowerCase())) {
    showToast('Player already exists!', 'error');
    return;
  }

  const idx = players.length;
  players.push({ name, power, level, rank, role });
  newPlayers.add(idx);
  
  // Clear form
  document.getElementById('addName').value = '';
  document.getElementById('addPower').value = '';
  document.getElementById('addLevel').value = '';
  document.getElementById('addRole').value = '';
  
  toggleAddPlayer();
  renderStats();
  renderTable();
  updateSaveBar();
  showToast(`${name} added!`, 'success');
}

// --- Delete Player ---
function deletePlayer(idx) {
  const name = players[idx].name;
  if (confirm(`Remove ${name} from the roster?`)) {
    deletedIndices.add(idx);
    if (newPlayers.has(idx)) newPlayers.delete(idx);
    renderStats();
    renderTable();
    updateSaveBar();
    showToast(`${name} removed`, 'info');
  }
}

// --- Discard Changes ---
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

// --- Save Bar ---
function updateSaveBar() {
  const totalChanges = changes.size + newPlayers.size + deletedIndices.size;
  const bar = document.getElementById('saveBar');
  
  if (totalChanges > 0) {
    bar.classList.add('visible');
    const parts = [];
    if (changes.size) parts.push(`${changes.size} edited`);
    if (newPlayers.size) parts.push(`${newPlayers.size} added`);
    if (deletedIndices.size) parts.push(`${deletedIndices.size} removed`);
    document.getElementById('changesInfo').textContent = `${totalChanges} change${totalChanges > 1 ? 's' : ''} pending (${parts.join(', ')})`;
  } else {
    bar.classList.remove('visible');
  }
}

// --- Push to GitHub via Webhook ---
async function pushToGitHub() {
  const webhookUrl = localStorage.getItem('ids_webhook_url');
  
  if (!webhookUrl) {
    showToast('Please configure the Webhook URL first! Click ⚙️ Config', 'error');
    openConfig();
    return;
  }

  const totalChanges = changes.size + newPlayers.size + deletedIndices.size;
  if (totalChanges === 0) {
    showToast('No changes to push!', 'info');
    return;
  }

  // Build final player list (exclude deleted)
  const finalPlayers = players.filter((_, i) => !deletedIndices.has(i));

  showLoading('Pushing update to GitHub...');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_players',
        players: finalPlayers,
        summary: {
          total: finalPlayers.length,
          edited: changes.size,
          added: newPlayers.size,
          removed: deletedIndices.size
        }
      })
    });

    if (response.ok) {
      // Reset change tracking
      originalPlayers = JSON.parse(JSON.stringify(finalPlayers));
      players = JSON.parse(JSON.stringify(finalPlayers));
      changes.clear();
      newPlayers.clear();
      deletedIndices.clear();
      
      hideLoading();
      renderStats();
      renderTable();
      updateSaveBar();
      showToast(`✅ Update sent! ${finalPlayers.length} players will be pushed to GitHub.`, 'success');
    } else {
      hideLoading();
      showToast('Failed to send update. Check webhook URL.', 'error');
    }
  } catch (err) {
    hideLoading();
    showToast('Connection error: ' + err.message, 'error');
  }
}

// --- Sort ---
function sortBy(field) {
  if (currentSort.field === field) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.field = field;
    currentSort.dir = field === 'rank' ? 'asc' : 'desc';
  }
  renderTable();
}

// --- Utilities ---
function parsePower(str) {
  if (!str || str === 'N/A') return 0;
  str = str.replace(/,/g, '');
  if (str.endsWith('B')) return parseFloat(str) * 1000;
  if (str.endsWith('M')) return parseFloat(str);
  if (str.endsWith('K')) return parseFloat(str) / 1000;
  return parseFloat(str) || 0;
}

function rankOrder(r) {
  return { R5: 1, R4: 2, R3: 3, R2: 4, R1: 5 }[r] || 99;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function showLoading(text) {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.add('visible');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('visible');
}
