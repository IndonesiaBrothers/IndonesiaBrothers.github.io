/* ============================================
   HALL OF FAME - IDs Indonesian Brothers
   ============================================ */

(function() {
  'use strict';

  const REPO = 'IndonesiaBrothers/IndonesiaBrothers.github.io';
  const CACHE_BUST = '?t=' + Date.now();

  let weeklyData = null;
  let currentMembers = [];

  // ---- Data Loading ----
  async function loadData() {
    showLoading();
    try {
      // Load script.js for current power data
      const scriptResp = await fetch('script.js' + CACHE_BUST);
      const scriptText = await scriptResp.text();
      currentMembers = parseMembers(scriptText);

      // Load weekly data
      try {
        const weekResp = await fetch('weeklydata.json' + CACHE_BUST);
        if (weekResp.ok) {
          weeklyData = await weekResp.json();
        }
      } catch(e) {
        weeklyData = null;
      }

      renderAll();
    } catch(e) {
      console.error('Failed to load data:', e);
      showError('Failed to load data. Please try again.');
    }
  }

  function parseMembers(text) {
    const members = [];
    // Match member objects in the members array
    const regex = /\{\s*name:\s*"([^"]+)"\s*,\s*power:\s*"([^"]+)"\s*,\s*level:\s*(\d+)\s*,\s*rank:\s*"([^"]+)"\s*(?:,\s*role:\s*"([^"]*)")?\s*\}/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      members.push({
        name: m[1],
        power: m[2],
        level: parseInt(m[3]),
        rank: m[4],
        role: m[5] || ''
      });
    }
    return members;
  }

  function parsePowerToNumber(str) {
    if (!str) return 0;
    str = str.toString().trim().toUpperCase();
    // Handle "64.3M", "1.2B" etc
    if (str.endsWith('B')) return parseFloat(str) * 1000000000;
    if (str.endsWith('M')) return parseFloat(str) * 1000000;
    if (str.endsWith('K')) return parseFloat(str) * 1000;
    return parseFloat(str.replace(/,/g, '')) || 0;
  }

  function formatPower(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  }

  // ---- Rendering ----
  function renderAll() {
    renderWeekBadge();
    renderImproveSection();
    renderDonationSection();
    renderDASection();
  }

  function renderWeekBadge() {
    const badge = document.getElementById('week-badge');
    if (weeklyData && weeklyData.weekLabel) {
      badge.textContent = '📅 ' + weeklyData.weekLabel;
    } else {
      badge.textContent = '📅 Data not yet available';
    }
  }

  function renderImproveSection() {
    const podiumEl = document.getElementById('podium-improve');
    const rankEl = document.getElementById('rankings-improve');

    if (!weeklyData || !weeklyData.previousPower || Object.keys(weeklyData.previousPower).length === 0) {
      podiumEl.innerHTML = '';
      rankEl.innerHTML = renderEmpty('🚀', 'No improvement data yet', 'Data will appear after the first weekly update');
      return;
    }

    // Calculate improvements
    const improvements = [];
    currentMembers.forEach(member => {
      const currentPow = parsePowerToNumber(member.power);
      const prevPow = weeklyData.previousPower[member.name] || 0;
      if (prevPow > 0) {
        const diff = currentPow - prevPow;
        const pct = ((diff / prevPow) * 100);
        improvements.push({
          name: member.name,
          rank: member.rank,
          currentPower: currentPow,
          previousPower: prevPow,
          diff: diff,
          percent: pct
        });
      }
    });

    // Sort by absolute diff descending
    improvements.sort((a, b) => b.diff - a.diff);

    // Filter only positive improvements for podium
    const positive = improvements.filter(p => p.diff > 0);

    if (positive.length === 0) {
      podiumEl.innerHTML = '';
      rankEl.innerHTML = renderEmpty('🚀', 'No improvements this week', 'Everyone maintained their power level');
      return;
    }

    // Podium (top 3)
    podiumEl.innerHTML = renderPodium(positive.slice(0, 3), 'power');

    // Full rankings
    rankEl.innerHTML = renderRankingRows(improvements, 'power');
  }

  function renderDonationSection() {
    const podiumEl = document.getElementById('podium-donation');
    const rankEl = document.getElementById('rankings-donation');

    if (!weeklyData || !weeklyData.donations || Object.keys(weeklyData.donations).length === 0) {
      podiumEl.innerHTML = '';
      rankEl.innerHTML = renderEmpty('💰', 'No donation data yet', 'Update via admin panel to see rankings');
      return;
    }

    const donors = Object.entries(weeklyData.donations)
      .map(([name, amount]) => ({ name, value: amount }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);

    if (donors.length === 0) {
      podiumEl.innerHTML = '';
      rankEl.innerHTML = renderEmpty('💰', 'No donations recorded', 'Check back after the weekly update');
      return;
    }

    podiumEl.innerHTML = renderPodium(donors.slice(0, 3), 'donation');
    rankEl.innerHTML = renderDonationRows(donors);
  }

  function renderDASection() {
    const podiumEl = document.getElementById('podium-da');
    const rankEl = document.getElementById('rankings-da');

    if (!weeklyData || !weeklyData.daPoints || Object.keys(weeklyData.daPoints).length === 0) {
      podiumEl.innerHTML = '';
      rankEl.innerHTML = renderEmpty('🐉', 'No DA Point data yet', 'Update via admin panel to see rankings');
      return;
    }

    const players = Object.entries(weeklyData.daPoints)
      .map(([name, pts]) => ({ name, value: pts }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);

    if (players.length === 0) {
      podiumEl.innerHTML = '';
      rankEl.innerHTML = renderEmpty('🐉', 'No DA points recorded', 'Check back after the weekly update');
      return;
    }

    podiumEl.innerHTML = renderPodium(players.slice(0, 3), 'da');
    rankEl.innerHTML = renderDARows(players);
  }

  // ---- Podium Renderer ----
  function renderPodium(items, type) {
    const medals = ['🥇', '🥈', '🥉'];
    let html = '';

    for (let i = 0; i < Math.min(3, items.length); i++) {
      const item = items[i];
      let valueHtml = '';
      let subHtml = '';

      if (type === 'power') {
        valueHtml = '+' + formatPower(item.diff);
        const pctClass = item.percent >= 0 ? '' : 'negative';
        subHtml = `<div class="podium-percent ${pctClass}">${item.percent >= 0 ? '+' : ''}${item.percent.toFixed(1)}%</div>`;
      } else if (type === 'donation') {
        valueHtml = formatNumber(item.value);
        subHtml = '<div class="podium-percent" style="color:var(--gold-primary)">donations</div>';
      } else {
        valueHtml = formatNumber(item.value);
        subHtml = '<div class="podium-percent" style="color:var(--cyan-primary)">DA points</div>';
      }

      html += `
        <div class="podium-card rank-${i + 1}">
          <div class="podium-pedestal">
            <div class="podium-medal">${medals[i]}</div>
            <div class="podium-name">${escHtml(item.name)}</div>
            <div class="podium-value">${valueHtml}</div>
            ${subHtml}
          </div>
          <div class="podium-rank-label">${['1st Place', '2nd Place', '3rd Place'][i]}</div>
        </div>`;
    }

    return html;
  }

  // ---- Ranking Rows ----
  function renderRankingRows(items, type) {
    let html = '';
    items.forEach((item, idx) => {
      const pos = idx + 1;
      const posClass = pos <= 3 ? 'top-3' : '';
      const diffSign = item.diff >= 0 ? '+' : '';
      const subClass = item.diff >= 0 ? 'positive' : 'negative';

      html += `
        <div class="ranking-row">
          <div class="ranking-pos ${posClass}">#${pos}</div>
          <div class="ranking-info">
            <div class="ranking-name">${escHtml(item.name)}</div>
            <div class="ranking-detail">${item.rank} · ${formatPower(item.currentPower)}</div>
          </div>
          <div class="ranking-values">
            <div class="ranking-main-value">${diffSign}${formatPower(Math.abs(item.diff))}</div>
            <div class="ranking-sub-value ${subClass}">${diffSign}${item.percent.toFixed(1)}%</div>
          </div>
        </div>`;
    });
    return html;
  }

  function renderDonationRows(items) {
    let html = '';
    items.forEach((item, idx) => {
      const pos = idx + 1;
      const posClass = pos <= 3 ? 'top-3' : '';
      html += `
        <div class="ranking-row">
          <div class="ranking-pos ${posClass}">#${pos}</div>
          <div class="ranking-info">
            <div class="ranking-name">${escHtml(item.name)}</div>
          </div>
          <div class="ranking-values">
            <div class="ranking-main-value">${formatNumber(item.value)}</div>
            <div class="ranking-sub-value neutral">donations</div>
          </div>
        </div>`;
    });
    return html;
  }

  function renderDARows(items) {
    let html = '';
    items.forEach((item, idx) => {
      const pos = idx + 1;
      const posClass = pos <= 3 ? 'top-3' : '';
      html += `
        <div class="ranking-row">
          <div class="ranking-pos ${posClass}">#${pos}</div>
          <div class="ranking-info">
            <div class="ranking-name">${escHtml(item.name)}</div>
          </div>
          <div class="ranking-values">
            <div class="ranking-main-value">${formatNumber(item.value)}</div>
            <div class="ranking-sub-value neutral">DA points</div>
          </div>
        </div>`;
    });
    return html;
  }

  // ---- Helpers ----
  function renderEmpty(icon, text, sub) {
    return `<div class="hof-empty">
      <div class="hof-empty-icon">${icon}</div>
      <div class="hof-empty-text">${text}</div>
      <div class="hof-empty-sub">${sub}</div>
    </div>`;
  }

  function showLoading() {
    const sections = ['improve', 'donation', 'da'];
    sections.forEach(s => {
      const el = document.getElementById('rankings-' + s);
      if (el) el.innerHTML = `<div class="hof-loading">
        <div class="hof-loading-spinner"></div>
        <div class="hof-loading-text">LOADING DATA...</div>
      </div>`;
    });
  }

  function showError(msg) {
    const sections = ['improve', 'donation', 'da'];
    sections.forEach(s => {
      const el = document.getElementById('rankings-' + s);
      if (el) el.innerHTML = renderEmpty('⚠️', msg, 'Check your connection and refresh');
    });
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---- Tab Switching ----
  function initTabs() {
    const tabs = document.querySelectorAll('.hof-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.hof-section').forEach(s => s.classList.remove('active'));
        const target = document.getElementById('section-' + tab.dataset.tab);
        if (target) target.classList.add('active');
      });
    });
  }

  // ---- Mobile Nav ----
  function initMobileNav() {
    const toggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');
    const overlay = document.getElementById('mobile-nav-overlay');

    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.contains('active');
      navLinks.classList.toggle('active');
      toggle.classList.toggle('active');
      overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
      navLinks.classList.remove('active');
      toggle.classList.remove('active');
      overlay.classList.remove('active');
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        toggle.classList.remove('active');
        overlay.classList.remove('active');
      });
    });
  }

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initMobileNav();
    loadData();
  });

})();
