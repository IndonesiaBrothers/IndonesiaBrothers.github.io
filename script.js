// ============================================
// IDs - Indonesian Brothers | ESPORTS WEBSITE
// ============================================

// --- Member Data loaded from members.json ---
let members = [];

// --- Utility: Parse power string to number for sorting ---

// --- Calculate Alliance Power from members data ---
function calculateAlliancePower(memberList) {
  var totalM = 0; // total in millions
  memberList.forEach(function(m) {
    if (!m.power || m.power === "N/A") return;
    var num = parseFloat(m.power.replace(/[^0-9.]/g, ""));
    if (isNaN(num)) return;
    if (m.power.includes("B")) totalM += num * 1000;
    else if (m.power.includes("M")) totalM += num;
    else if (m.power.includes("K")) totalM += num / 1000;
    else totalM += num / 1000000;
  });
  return totalM; // returns total in millions
}

function updateAlliancePowerDisplay(memberList) {
  var totalM = calculateAlliancePower(memberList);
  var totalRaw = Math.round(totalM * 1000000); // raw number for counter
  
  // Format for hero display
  var formatted;
  if (totalM >= 1000) {
    formatted = (totalM / 1000).toFixed(1) + "B+";
  } else {
    formatted = totalM.toFixed(0) + "M+";
  }
  
  // Update hero section
  var heroEl = document.getElementById("hero-alliance-power");
  if (heroEl) heroEl.textContent = formatted + " ALLIANCE POWER";
  
  // Update stats counter
  var statEl = document.getElementById("stat-alliance-power");
  if (statEl) {
    statEl.setAttribute("data-target", totalRaw.toString());
    // Re-trigger counter animation if already started
    statEl.textContent = totalRaw.toLocaleString("en-US");
  }
  
  console.log("⚡ Alliance Power: " + formatted + " (" + totalRaw.toLocaleString() + ")");
}

function parsePower(powerStr) {
  if (!powerStr || powerStr === "N/A") return Infinity; // Leader always on top
  const num = parseFloat(powerStr.replace(/[^0-9.]/g, ""));
  if (powerStr.includes("B")) return num * 1000;
  if (powerStr.includes("M")) return num;
  if (powerStr.includes("K")) return num / 1000;
  return num;
}

// --- Rank labels ---
const rankLabels = {
  R5: "Leader",
  R4: "Officer",
  R3: "Elite",
  R2: "Member",
  R1: "Inactive"
};

// --- Hall of Fame Weekly Titles ---
const HOF_TITLES = {
  improve: ['⚡ Supreme Ascendant', '⚡ Power Titan', '⚡ Rising Force'],
  donation: ['🎁 Grand Benefactor', '🎁 Elite Patron', '🎁 Noble Giver'],
  duel: ['⚔️ Duel Overlord', '⚔️ Shadow Slayer', '⚔️ Battle Fury']
};
let hofTitles = {};

async function loadHofTitles() {
  hofTitles = {};
  // Top Improve from powerhistory.json
  try {
    const histResp = await fetch('powerhistory.json?t=' + Date.now());
    if (histResp.ok) {
      const history = await histResp.json();
      const weeks = history.weeks || [];
      if (weeks.length >= 2) {
        const curr = weeks[weeks.length - 1];
        const prev = weeks[weeks.length - 2];
        const improvements = [];
        Object.keys(curr.power || {}).forEach(function(name) {
          const c = curr.power[name] || 0;
          const p = prev.power[name] || 0;
          if (p > 0 && c > 0) improvements.push({ name: name, pct: ((c - p) / p) * 100 });
        });
        improvements.sort(function(a, b) { return b.pct - a.pct; });
        improvements.slice(0, 3).forEach(function(p, i) {
          if (!hofTitles[p.name]) hofTitles[p.name] = [];
          hofTitles[p.name].push(HOF_TITLES.improve[i]);
        });
      }
    }
  } catch(e) {}
  // Donation & Duel from weeklydata.json
  try {
    const wResp = await fetch('weeklydata.json?t=' + Date.now());
    if (wResp.ok) {
      const weekly = await wResp.json();
      var donations = weekly.donations || {};
      Object.entries(donations).filter(function(e) { return e[1] > 0; }).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3).forEach(function(entry, i) {
        if (!hofTitles[entry[0]]) hofTitles[entry[0]] = [];
        hofTitles[entry[0]].push(HOF_TITLES.donation[i]);
      });
      var daPoints = weekly.daPoints || {};
      Object.entries(daPoints).filter(function(e) { return e[1] > 0; }).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3).forEach(function(entry, i) {
        if (!hofTitles[entry[0]]) hofTitles[entry[0]] = [];
        hofTitles[entry[0]].push(HOF_TITLES.duel[i]);
      });
    }
  } catch(e) {}
}

// Sort members by Rank (R5→R1) then by power (highest first) within each rank
const rankOrder = { 'R5': 1, 'R4': 2, 'R3': 3, 'R2': 4, 'R1': 5 };
members.sort((a, b) => {
  const rankDiff = (rankOrder[a.rank] || 9) - (rankOrder[b.rank] || 9);
  if (rankDiff !== 0) return rankDiff;
  return parsePower(b.power) - parsePower(a.power);
});

// ============================================
// DOM READY
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
  // Load member data from separate JSON file
  try {
    const res = await fetch('members.json?v=' + Date.now());
    members = await res.json();
    console.log("✅ Loaded " + members.length + " members from members.json");
    updateAlliancePowerDisplay(members);
  } catch(e) {
    console.error("❌ Failed to load members.json:", e);
  }
  initParticleCanvas();
  initNavbar();
  initMobileNav();
  initTranslateToggle();
  initSmoothScroll();
  initTypingEffect();
  await loadHofTitles();
  initMembers();
  initTopPower();
  initScrollReveal();
  initCounterAnimation();
  initCardTiltEffect();
});

// ============================================
// TOP POWER LEADERBOARD — COMMAND CENTER
// ============================================

// Role config: emoji, color theme, description
const roleConfig = {
  king:      { emoji: "👑", tag: "THE KING",   theme: "king",      specialty: "POWERHOUSE",  desc: "Highest Power · The Pillar of Strength" },
  leader:    { emoji: "🛡️", tag: "LEADER",     theme: "leader",    specialty: "STRATEGIST",  desc: "Strategic Mind · The Brain of IDs" },
  muse:      { emoji: "🎭", tag: "MUSE",       theme: "muse",      specialty: "MOTIVATOR",   desc: "The Voice · Heart of the Alliance" },
  butler:    { emoji: "🏛️", tag: "BUTLER",     theme: "butler",    specialty: "ORGANIZER",   desc: "The Keeper · Foundation of Order" },
  recruiter: { emoji: "🔱", tag: "RECRUITER",  theme: "recruiter", specialty: "HEADHUNTER",  desc: "The Seeker · Builder of Brotherhood" },
};

function initTopPower() {
  const duoContainer = document.getElementById("featured-duo");
  const roleContainer = document.getElementById("role-cards");
  const lbContainer = document.getElementById("top-power-leaderboard");
  if (!duoContainer || !roleContainer || !lbContainer) return;

  // Find featured members
  const king = members.find(m => m.name === "JubekBoy");
  const leader = members.find(m => m.name === "Scythe7FN");
  const muse = members.find(m => m.role === "Muse");
  const butler = members.find(m => m.role === "Butler");
  const recruiter = members.find(m => m.role === "Recruiter");

  // --- FEATURED DUO: JubekBoy (KING) & Scythe7FN (LEADER) ---
  duoContainer.innerHTML = `
    <div class="duo-card duo-theme-king">
      <div class="duo-crown-glow"></div>
      <div class="duo-badge-wrap">
        <div class="duo-crown">${roleConfig.king.emoji}</div>
        <div class="duo-title-tag tag-king">${roleConfig.king.tag}</div>
      </div>
      <div class="duo-name duo-name-king">${king.name}</div>
      <div class="duo-role">R4 · Warlord</div>
      <div class="duo-specialty-wrap">
        <span class="duo-specialty-label">SPECIALTY</span>
        <span class="duo-specialty-value sv-king">${roleConfig.king.specialty}</span>
      </div>
      <div class="duo-power-small">${king.power}</div>
      <div class="duo-level">LVL ${king.level}</div>
      <div class="duo-desc">${roleConfig.king.desc}</div>
      <div class="duo-aura duo-aura-king"></div>
    </div>



    <div class="duo-card duo-theme-leader">
      <div class="duo-shield-glow"></div>
      <div class="duo-badge-wrap">
        <div class="duo-crown">${roleConfig.leader.emoji}</div>
        <div class="duo-title-tag tag-leader">${roleConfig.leader.tag}</div>
      </div>
      <div class="duo-name duo-name-leader">${leader.name}</div>
      <div class="duo-role">R5 · Leader</div>
      <div class="duo-specialty-wrap">
        <span class="duo-specialty-label">SPECIALTY</span>
        <span class="duo-specialty-value sv-leader">${roleConfig.leader.specialty}</span>
      </div>
      <div class="duo-power-small">${leader.power !== "N/A" ? leader.power : "—"}</div>
      <div class="duo-level">LVL ${leader.level}</div>
      <div class="duo-desc">${roleConfig.leader.desc}</div>
      <div class="duo-aura duo-aura-leader"></div>
    </div>
  `;

  // --- OTHER ROLE CARDS: Muse, Butler, Recruiter ---
  const otherRoles = [
    { member: muse,      key: "muse" },
    { member: butler,    key: "butler" },
    { member: recruiter, key: "recruiter" },
  ].filter(r => r.member);

  let roleHTML = '<div class="role-cards-grid">';
  otherRoles.forEach(({ member: m, key }) => {
    const cfg = roleConfig[key];
    const pw = m.power && m.power !== "N/A" ? m.power : "—";
    roleHTML += `
      <div class="role-card role-theme-${cfg.theme}">
        <div class="role-glow role-glow-${cfg.theme}"></div>
        <div class="role-emoji">${cfg.emoji}</div>
        <div class="role-tag-badge tag-${cfg.theme}">${cfg.tag}</div>
        <div class="role-card-name">${m.name}</div>
        <div class="role-card-rank">${m.rank} · ${rankLabels[m.rank]}</div>
        <div class="role-specialty">
          <span class="role-specialty-label">SPECIALTY</span>
          <span class="role-specialty-value role-sv-${cfg.theme}">${cfg.specialty}</span>
        </div>
        <div class="role-card-power">${pw}</div>
        <div class="role-card-desc">${cfg.desc}</div>
      </div>
    `;
  });
  roleHTML += '</div>';
  roleContainer.innerHTML = roleHTML;

  // --- TOP 10 POWER RANKING (all members with power, no exclusions) ---
  const withPower = members.filter(m => m.power && m.power !== "N/A");
  const sorted = [...withPower].sort((a, b) => parsePower(b.power) - parsePower(a.power));
  const top8 = sorted.slice(0, 8);
  const maxPower = parsePower(top8[0].power);

  top8.forEach((member, i) => {
    const pos = i + 1;
    const rankClass = pos <= 3 ? ` rank-${pos}` : "";
    const powerNum = parsePower(member.power);
    const barWidth = (powerNum / maxPower) * 100;

    const medalEmoji = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "";
    const badgeClass = pos > 3 ? " rank-other" : "";

    const row = document.createElement("div");
    row.className = `power-row${rankClass}`;
    row.style.animationDelay = `${i * 0.1}s`;

    const rankTag = rankLabels[member.rank];
    const roleColors = { Warlord: "#ffffff", Leader: "#ff4444", Muse: "#d0a0b8", Butler: "#a0b0c0", Recruiter: "#a0b8a8" };
    let displayRole = member.role;
    if (member.name === "JubekBoy") displayRole = "Warlord";
    const roleBadge = displayRole && roleColors[displayRole]
      ? `<span class="lb-role-badge" style="background:${roleColors[displayRole]}20;color:${roleColors[displayRole]};border:1px solid ${roleColors[displayRole]}40;">${displayRole === "Warlord" && member.name === "JubekBoy" ? "👑 KING" : displayRole.toUpperCase()}</span>`
      : "";

    row.innerHTML = `
      <div class="power-rank-badge${badgeClass}">${medalEmoji || "#" + pos}</div>
      <div class="power-player-info">
        <div class="power-player-name">${member.name}${roleBadge}</div>
        <div class="power-player-rank">${member.rank} · ${rankTag}</div>
      </div>
      <div class="power-bar-container">
        <div class="power-bar" data-width="${barWidth}"></div>
      </div>
      <div class="power-value">${member.power}</div>
    `;
    lbContainer.appendChild(row);
  });

  // Animate everything on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Animate duo cards
        const cards = duoContainer.querySelectorAll(".duo-card");
        cards.forEach((card, i) => {
          setTimeout(() => { card.classList.add("duo-visible"); }, i * 350);
        });
        const vsEl = duoContainer.querySelector(".duo-vs");
        if (vsEl) setTimeout(() => { vsEl.classList.add("duo-vs-visible"); }, 700);

        // Animate role cards
        const roleCards = roleContainer.querySelectorAll(".role-card");
        roleCards.forEach((card, i) => {
          setTimeout(() => { card.classList.add("role-visible"); }, 900 + i * 200);
        });

        // Animate power bars
        const bars = lbContainer.querySelectorAll(".power-bar");
        bars.forEach(bar => {
          setTimeout(() => { bar.style.width = bar.dataset.width + "%"; }, 1400);
        });

        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  observer.observe(duoContainer);
}

// ============================================
// CANVAS PARTICLE SYSTEM
// ============================================
function initParticleCanvas() {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  // Respect reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext("2d");

  let width, height;
  let particles = [];
  let animId;
  const PARTICLE_COUNT = 35;
  const CONNECTION_DIST = 100;
  const MOUSE = { x: -1000, y: -1000 };

  function resize() {
    width = canvas.width = canvas.offsetWidth;
    height = canvas.height = canvas.offsetHeight;
  }

  function createParticle() {
    const shapes = ["circle", "triangle", "square", "diamond"];
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      size: Math.random() * 3 + 1.5,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      opacity: Math.random() * 0.5 + 0.15,
      color: Math.random() > 0.5 ? "rgba(255,23,68," : "rgba(255,138,149,",
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
    };
  }

  function init() {
    resize();
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle());
    }
  }

  function drawShape(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color + p.opacity + ")";
    ctx.strokeStyle = p.color + (p.opacity * 0.5) + ")";
    ctx.lineWidth = 0.5;

    const s = p.size;
    switch (p.shape) {
      case "circle":
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "triangle":
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s, s);
        ctx.lineTo(-s, s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case "square":
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.strokeRect(-s, -s, s * 2, s * 2);
        break;
      case "diamond":
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.3);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s * 1.3);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Update & draw particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;

      // Wrap around edges
      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;
      if (p.y < -20) p.y = height + 20;
      if (p.y > height + 20) p.y = -20;

      // Mouse repulsion (subtle)
      const dx = p.x - MOUSE.x;
      const dy = p.y - MOUSE.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        const force = (120 - dist) / 120 * 0.3;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force;
      }

      // Damping
      p.vx *= 0.998;
      p.vy *= 0.998;

      drawShape(ctx, p);
    }

    // Draw connections
    // Skip connection lines on mobile for performance
    if (window.innerWidth > 768)
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONNECTION_DIST) {
          const opacity = (1 - dist / CONNECTION_DIST) * 0.15;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 23, 68, ${opacity})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    animId = requestAnimationFrame(animate);
  }

  // Mouse tracking for hero area
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    MOUSE.x = e.clientX - rect.left;
    MOUSE.y = e.clientY - rect.top;
  });

  canvas.addEventListener("mouseleave", () => {
    MOUSE.x = -1000;
    MOUSE.y = -1000;
  });

  window.addEventListener("resize", () => {
    resize();
  });

  init();
  animate();

  // Stop animation when not visible
  const heroSection = document.getElementById("hero");
  if (heroSection && "IntersectionObserver" in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (!animId) animate();
        } else {
          cancelAnimationFrame(animId);
          animId = null;
        }
      });
    }, { threshold: 0.05 });
    obs.observe(heroSection);
  }
}

// ============================================
// TYPING EFFECT
// ============================================
function initTypingEffect() {
  const el = document.getElementById("hero-slogan");
  const cursor = document.getElementById("slogan-cursor");
  if (!el) return;

  const text = "\"We stand as one. Bound by loyalty, guided by honor, and strengthened through unity. We do not seek conflict, but we will not step back from it.\"";
  let i = 0;
  const speed = 30;

  function type() {
    if (i < text.length) {
      // Insert text before the cursor span
      if (cursor && cursor.parentNode === el) {
        el.insertBefore(document.createTextNode(text.charAt(i)), cursor);
      } else {
        el.textContent += text.charAt(i);
      }
      i++;
      setTimeout(type, speed);
    } else {
      // Keep cursor blinking after typing done
      if (cursor) {
        setTimeout(() => {
          cursor.style.animation = "cursorBlink 0.8s infinite";
        }, 500);
      }
    }
  }

  // Start typing after hero animations
  setTimeout(type, 1800);
}

// ============================================
// NAVBAR SCROLL EFFECT
// ============================================
function initNavbar() {
  const navbar = document.getElementById("navbar");
  if (!navbar) return;

  let ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => {
        if (window.scrollY > 60) {
          navbar.classList.add("scrolled");
        } else {
          navbar.classList.remove("scrolled");
        }
        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// ============================================
// MOBILE NAVIGATION
// ============================================
function initMobileNav() {
  const toggle = document.getElementById("nav-toggle");
  const navLinks = document.getElementById("nav-links");
  const overlay = document.getElementById("mobile-nav-overlay");
  if (!toggle || !navLinks) return;

  function openNav() {
    toggle.classList.add("active");
    toggle.setAttribute("aria-expanded", "true");
    navLinks.classList.add("active");
    if (overlay) { overlay.classList.add("active"); overlay.style.display = "block"; }
    document.body.style.overflow = "hidden";
  }

  function closeNav() {
    toggle.classList.remove("active");
    toggle.setAttribute("aria-expanded", "false");
    navLinks.classList.remove("active");
    if (overlay) { overlay.classList.remove("active"); setTimeout(() => { overlay.style.display = "none"; }, 400); }
    document.body.style.overflow = "";
  }

  toggle.addEventListener("click", () => {
    if (navLinks.classList.contains("active")) {
      closeNav();
    } else {
      openNav();
    }
  });

  // Close on link click, then smooth scroll after menu animation finishes
  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const href = link.getAttribute("href");
      closeNav();
      // Wait for menu close animation to finish before scrolling
      setTimeout(() => {
        if (href && href !== "#") {
          const target = document.querySelector(href);
          if (target) {
            const navHeight = document.querySelector('.navbar') ? document.querySelector('.navbar').offsetHeight : 70;
            const targetPos = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
            window.scrollTo({ top: targetPos, behavior: "smooth" });
          }
        }
      }, 350);
    });
  });

  // Close on overlay click
  if (overlay) overlay.addEventListener("click", closeNav);

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!toggle.contains(e.target) && !navLinks.contains(e.target)) {
      closeNav();
    }
  });
}

// ============================================
// TRANSLATE BUTTON
// ============================================
function initTranslateToggle() {
  const btn = document.getElementById('translate-btn');
  const dropdown = document.getElementById('translate-dropdown');
  if (!btn || !dropdown) return;

  const languages = [
    { code: '', flag: '🇮🇩', name: 'Indonesia (Original)' },
    { code: 'en', flag: '🇬🇧', name: 'English' },
    { code: 'zh-CN', flag: '🇨🇳', name: '中文 简体' },
    { code: 'zh-TW', flag: '🇹🇼', name: '中文 繁體' },
    { code: 'ja', flag: '🇯🇵', name: '日本語' },
    { code: 'ko', flag: '🇰🇷', name: '한국어' },
    { code: 'ms', flag: '🇲🇾', name: 'Melayu' },
    { code: 'th', flag: '🇹🇭', name: 'ไทย' },
    { code: 'vi', flag: '🇻🇳', name: 'Tiếng Việt' },
    { code: 'hi', flag: '🇮🇳', name: 'हिन्दी' },
    { code: 'ar', flag: '🇸🇦', name: 'العربية' },
    { code: 'tr', flag: '🇹🇷', name: 'Türkçe' },
    { code: 'fr', flag: '🇫🇷', name: 'Français' },
    { code: 'es', flag: '🇪🇸', name: 'Español' },
    { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
    { code: 'ru', flag: '🇷🇺', name: 'Русский' },
    { code: 'pt', flag: '🇵🇹', name: 'Português' }
  ];

  // Detect if we're inside Google Translate proxy
  const isTranslated = location.hostname.includes('.translate.goog');

  // Build custom dropdown
  dropdown.innerHTML = languages.map(lang => {
    const isActive = lang.code === '' ? !isTranslated : false;
    return `<button class="lang-option${isActive ? ' active' : ''}" data-lang="${lang.code}">
      <span class="lang-flag">${lang.flag}</span>
      <span class="lang-name">${lang.name}</span>
    </button>`;
  }).join('');

  // Toggle dropdown
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });

  // Handle language selection
  dropdown.addEventListener('click', (e) => {
    const option = e.target.closest('.lang-option');
    if (!option) return;
    const langCode = option.dataset.lang;
    dropdown.classList.remove('show');

    const originalUrl = 'https://indonesiabrothers.github.io/';

    if (langCode === '') {
      // Go back to original site
      window.location.href = originalUrl;
    } else {
      // Redirect through Google Translate proxy
      window.location.href = 'https://translate.google.com/translate?sl=id&tl=' + langCode + '&u=' + encodeURIComponent(originalUrl);
    }
  });
}

// ============================================
// SMOOTH SCROLL
// ============================================
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href");
      if (targetId === "#") return;
      const target = document.querySelector(targetId);
      if (target) {
        const navHeight = document.querySelector('.navbar') ? document.querySelector('.navbar').offsetHeight : 70;
        const targetPos = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
        window.scrollTo({ top: targetPos, behavior: "smooth" });
      }
    });
  });
}

// ============================================
// COUNTER ANIMATION
// ============================================
function initCounterAnimation() {
  const counters = document.querySelectorAll(".counter");
  if (!counters.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(c => observer.observe(c));
}

function animateCounter(el) {
  const target = parseFloat(el.dataset.target);
  const format = el.dataset.format || "plain";
  const duration = 2000;
  const startTime = performance.now();

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function formatNumber(num, fmt) {
    switch (fmt) {
      case "comma":
        return Math.floor(num).toLocaleString("en-US");
      case "decimal":
        return num.toFixed(1);
      default:
        return Math.floor(num).toString();
    }
  }

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);
    const current = eased * target;

    el.textContent = formatNumber(current, format);

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = formatNumber(target, format);
    }
  }

  requestAnimationFrame(update);
}

// ============================================
// CARD TILT EFFECT (3D perspective on hover)
// ============================================
function initCardTiltEffect() {
  // Apply tilt to member cards using event delegation
  const grid = document.getElementById("members-grid");
  if (!grid) return;

  grid.addEventListener("mousemove", (e) => {
    const card = e.target.closest(".member-card");
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -5;
    const rotateY = ((x - centerX) / centerX) * 5;

    card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
  });

  grid.addEventListener("mouseleave", (e) => {
    const card = e.target.closest(".member-card");
    if (card) {
      card.style.transform = "";
    }
  });

  // Handle leaving individual cards
  grid.addEventListener("mouseout", (e) => {
    const card = e.target.closest(".member-card");
    if (card && !card.contains(e.relatedTarget)) {
      card.style.transform = "";
    }
  });
}

// ============================================
// MEMBERS SECTION
// ============================================
let currentFilter = "All";
let currentSearch = "";

function initMembers() {
  const searchInput = document.getElementById("member-search");
  const filterBtns = document.querySelectorAll(".filter-btn");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      renderMembers();
    });
    // Close keyboard on Enter for mobile
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchInput.blur();
      }
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.rank;
      renderMembers();
    });
  });

  // Update filter counts
  updateFilterCounts();

  // Initial render
  renderMembers();
}

function updateFilterCounts() {
  const counts = { All: members.length };
  members.forEach(m => {
    counts[m.rank] = (counts[m.rank] || 0) + 1;
  });

  document.querySelectorAll(".filter-btn").forEach(btn => {
    const rank = btn.dataset.rank;
    const countEl = btn.querySelector(".count");
    if (countEl && counts[rank] !== undefined) {
      countEl.textContent = `(${counts[rank]})`;
    }
  });
}

function renderMembers() {
  const grid = document.getElementById("members-grid");
  const countDisplay = document.getElementById("member-count");
  if (!grid) return;

  // Filter members
  let filtered = members.filter(m => {
    const matchRank = currentFilter === "All" || m.rank === currentFilter;
    const matchSearch = !currentSearch || m.name.toLowerCase().includes(currentSearch);
    return matchRank && matchSearch;
  });

  // Update count
  if (countDisplay) {
    countDisplay.innerHTML = `Showing <span>${filtered.length}</span> of <span>${members.length}</span> warriors`;
  }

  // Render
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="no-results">
        <div class="icon">🔍</div>
        <p>No warriors found matching your search.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((member, index) => {
    const roleHTML = member.role
      ? `<div class="member-role">◆ ${escapeHtml(member.role)}</div>`
      : "";

    const badgeIcon = getBadgeIcon(member.rank);

    return `
      <div class="member-card" data-rank="${member.rank}" style="animation-delay: ${Math.min(index * 0.03, 1.5)}s">
        <div class="member-header">
          <div class="member-name">${badgeIcon} ${escapeHtml(member.name)}</div>
          <span class="member-rank-badge rank-${member.rank}">${member.rank}</span>
        </div>
        ${roleHTML}
        <div class="member-stats">
          <div class="member-stat">
            <span class="member-stat-label">Power</span>
            <span class="member-stat-value">${escapeHtml(member.power)}</span>
          </div>
          <div class="member-stat">
            <span class="member-stat-label">Level</span>
            <span class="member-stat-value">${member.level}</span>
          </div>
          <div class="member-stat">
            <span class="member-stat-label">Title</span>
            ${(hofTitles[member.name] || []).length > 0
              ? (hofTitles[member.name]).map(function(t) { return '<span class="member-stat-value member-weekly-title">' + t + '</span>'; }).join('')
              : '<span class="member-stat-value">—</span>'}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function getBadgeIcon(rank) {
  switch (rank) {
    case "R5": return "👑";
    case "R4": return "⚔️";
    case "R3": return "🛡️";
    case "R2": return "🗡️";
    case "R1": return "💤";
    default: return "";
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// SCROLL REVEAL (Intersection Observer)
// ============================================
function initScrollReveal() {
  const revealElements = document.querySelectorAll(".reveal, .reveal-left, .reveal-right");

  if (!("IntersectionObserver" in window)) {
    revealElements.forEach(el => el.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Stagger based on data-delay attribute
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add("visible");
        }, parseInt(delay));
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: "0px 0px -40px 0px"
  });

  revealElements.forEach(el => observer.observe(el));
}

// ============================================
// TRAIN LOTTERY SYSTEM
// ============================================
function initTrainLottery() {
  const spinBtn = document.getElementById("spin-btn");
  const slotReel = document.getElementById("slot-reel");
  const resultsContainer = document.getElementById("lottery-results");
  const historyList = document.getElementById("history-list");

  if (!spinBtn || !slotReel) return;

  let pickCount = 1;
  let rankFilter = "All";
  let isSpinning = false;
  const rankLabels = { R5: "LEADER", R4: "OFFICER", R3: "ELITE", R2: "SOLDIER", R1: "RECRUIT" };

  // HoF Bonus System: players with weekly titles get +0.1% per title
  // Once a player wins, bonus resets to 0 (same as everyone else)
  const hofBonusUsed = new Set(); // tracks winners this session

  // Count selector
  document.querySelectorAll(".slot-count-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (isSpinning) return;
      document.querySelectorAll(".slot-count-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      pickCount = parseInt(btn.dataset.count);
    });
  });

  // Rank filter
  document.querySelectorAll(".slot-rank-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (isSpinning) return;
      document.querySelectorAll(".slot-rank-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      rankFilter = btn.dataset.rank;
    });
  });

  // ============================================
  // CRYPTOGRAPHIC RANDOM NUMBER GENERATOR
  // Uses crypto.getRandomValues() for true randomness
  // Each player has exactly equal probability (≤0.09%)
  // No patterns, no predictability, no bias
  // ============================================
  function cryptoRandom() {
    // Returns a truly random float in [0, 1) using crypto API
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / (0xFFFFFFFF + 1);
  }

  function cryptoRandomInt(max) {
    // Unbiased random integer in [0, max) using rejection sampling
    // This eliminates modulo bias that plagues naive implementations
    if (max <= 0) return 0;
    const limit = Math.floor(0x100000000 / max) * max;
    let val;
    do {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      val = arr[0];
    } while (val >= limit); // reject biased values
    return val % max;
  }

  // Fisher-Yates shuffle with cryptographic randomness
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Multi-pass shuffle for extra entropy (3 full passes)
  function hyperShuffle(arr) {
    let a = [...arr];
    for (let pass = 0; pass < 3; pass++) {
      a = shuffle(a);
    }
    return a;
  }

  // ============================================
  // WEIGHTED SELECTION WITH HoF BONUS
  // Base weight = 1.0 (equal for all)
  // HoF title holders: +0.1 per title (max +0.3 for 3 titles)
  // After winning: bonus resets, back to 1.0
  // ============================================
  function weightedSelect(pool, count) {
    const selected = [];
    const remaining = [...pool];

    for (let i = 0; i < count && remaining.length > 0; i++) {
      // Calculate weight for each player
      const weights = remaining.map(function(m) {
        var base = 1.0;
        // If already won this session, no bonus
        if (hofBonusUsed.has(m.name)) return base;
        // +0.1 per HoF title category
        var titleCount = (hofTitles[m.name] || []).length;
        return base + (titleCount * 0.1);
      });

      var totalWeight = 0;
      for (var w = 0; w < weights.length; w++) totalWeight += weights[w];

      // Crypto-random weighted pick
      var rand = cryptoRandom() * totalWeight;
      var pickIdx = 0;
      for (var j = 0; j < weights.length; j++) {
        rand -= weights[j];
        if (rand <= 0) { pickIdx = j; break; }
      }

      var winner = remaining[pickIdx];
      selected.push(winner);
      // Reset bonus — winner goes back to base weight
      hofBonusUsed.add(winner.name);
      remaining.splice(pickIdx, 1);
    }
    return selected;
  }

  // ============================================
  // DRAMATIC SPIN SYSTEM - Epic name cycling
  // True random winner selection at spin time
  // Winner is ONLY determined at the final moment
  // ============================================
  spinBtn.addEventListener("click", () => {
    if (isSpinning) return;
    const pool = rankFilter === "All" ? [...members] : members.filter(m => m.rank === rankFilter);
    if (pool.length === 0) return;
    const count = Math.min(pickCount, pool.length);
    isSpinning = true;
    spinBtn.classList.add("spinning");
    spinBtn.querySelector(".spin-btn-text").textContent = "\u23F3 SPINNING...";
    resultsContainer.innerHTML = "";

    // Winners selected with weighted cryptographic randomness
    // Base: equal 1/N probability — HoF title holders get +0.1% per title
    // Bonus resets after winning (back to same as everyone else)
    const winners = weightedSelect(pool, count);
    const namePool = hyperShuffle(pool.map(m => m.name));
    const slotFrame = document.querySelector(".slot-frame");

    slotReel.innerHTML = "";
    slotReel.style.transition = "none";
    slotReel.style.transform = "translateY(0)";

    const prevEl = document.createElement("div");
    prevEl.className = "slot-item spin-adj";
    prevEl.textContent = namePool[0] || "???";
    const currEl = document.createElement("div");
    currEl.className = "slot-item spin-curr";
    currEl.textContent = namePool[1 % namePool.length] || "???";
    const nextEl = document.createElement("div");
    nextEl.className = "slot-item spin-adj";
    nextEl.textContent = namePool[2 % namePool.length] || "???";
    slotReel.appendChild(prevEl);
    slotReel.appendChild(currEl);
    slotReel.appendChild(nextEl);

    let nIdx = 3;
    function rn() { return namePool[nIdx++ % namePool.length]; }
    let wIdx = 0;

    function revealNext() {
      if (wIdx >= count) {
        slotFrame.className = "slot-frame";
        isSpinning = false;
        spinBtn.classList.remove("spinning");
        spinBtn.querySelector(".spin-btn-text").textContent = "\u26A1 SPIN \u26A1";
        return;
      }
      const winner = winners[wIdx];
      const sp = wIdx === 0 ? 1.0 : Math.max(0.55, 1.0 - wIdx * 0.15);
      const hasFake = namePool.length > 1;
      const decoy = namePool.find(n => n !== winner.name) || namePool[0];

      const seq = [];
      for (let i = 0; i < 8; i++) seq.push({d: Math.round((40 + i*2)*sp), p: "turbo"});
      for (let i = 0; i < 6; i++) { const t=i/6; seq.push({d: Math.round((70 + t*t*120)*sp), p: "fast"}); }
      for (let i = 0; i < 4; i++) { const t=i/4; seq.push({d: Math.round((200 + t*200)*sp), p: "medium"}); }
      for (let i = 0; i < 3; i++) { const t=i/3; seq.push({d: Math.round((400 + t*300)*sp), p: "slow"}); }
      if (hasFake) {
        seq.push({d: Math.round(1200*sp), p: "fakeout"});
        seq.push({d: 200, p: "jerk"});
      }
      seq.push({d: 300, p: "winner"});

      let ti = 0;
      function tick() {
        if (ti >= seq.length) return;
        const {d, p} = seq[ti];
        slotFrame.className = "slot-frame spin-active spin-p-" + p;

        if (p === "winner") {
          prevEl.textContent = "";
          nextEl.textContent = "";
          currEl.classList.remove("spin-fakeout-glow");
          currEl.style.transition = "none";
          currEl.style.transform = "scale(0.5)";
          currEl.style.opacity = "0";
          currEl.textContent = winner.name;
          currEl.className = "slot-item spin-curr spin-winner-name";
          // Use rAF double-frame instead of forced reflow for better mobile perf
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              currEl.style.transition = "transform 0.5s cubic-bezier(0.17,0.67,0.35,1.3), opacity 0.3s ease-out";
              currEl.style.transform = "scale(1.1)";
              currEl.style.opacity = "1";
              slotFrame.className = "slot-frame spin-winner-explode";
            });
          });
          // Winner flash removed for performance
          // Screen shake removed for performance
          launchConfetti();
          setTimeout(() => {
            const card = document.createElement("div");
            card.className = "result-card";
            card.style.animationDelay = "0s";
            const roleTag = winner.role ? " \u00B7 " + winner.role : "";
            const titleCount = (hofTitles[winner.name] || []).length;
            const hofBadge = titleCount > 0 ? '<span class="result-hof-badge">\uD83C\uDFC6 HoF Bonus</span>' : '';
            card.innerHTML = '<div class="result-number">' + (wIdx+1) + '</div><div class="result-info"><div class="result-name">\uD83C\uDFAF ' + winner.name + hofBadge + '</div><div class="result-rank">' + winner.rank + ' \u00B7 ' + rankLabels[winner.rank] + roleTag + '</div></div><div class="result-power">' + (winner.power || "N/A") + '</div>';
            const sparkleCount = window.innerWidth <= 768 ? 0 : 2;
            for (let s = 0; s < sparkleCount; s++) {
              const sparkle = document.createElement("div");
              sparkle.className = "result-sparkle";
              sparkle.style.setProperty("--sx", (Math.random()-0.5)*80+"px");
              sparkle.style.setProperty("--sy", (Math.random()-0.5)*60+"px");
              sparkle.style.left = Math.random()*100+"%";
              sparkle.style.top = Math.random()*100+"%";
              sparkle.style.animationDelay = Math.random()*2+"s";
              sparkle.style.background = ["#ff1744","#ff8a95","#ffffff","#e0d0d8"][Math.floor(Math.random()*4)];
              card.appendChild(sparkle);
            }
            resultsContainer.appendChild(card);
            // Extra confetti removed for performance
            wIdx++;
            if (wIdx < count) {
              setTimeout(() => {
                slotFrame.className = "slot-frame";
                currEl.className = "slot-item spin-curr spin-next-warrior";
                currEl.style.cssText = "";
                currEl.textContent = "\u2694\uFE0F NEXT WARRIOR \u2694\uFE0F";
                prevEl.textContent = "";
                nextEl.textContent = "";
                setTimeout(revealNext, 1800);
              }, 2200);
            } else {
              setTimeout(() => {
                slotFrame.className = "slot-frame";
                isSpinning = false;
                spinBtn.classList.remove("spinning");
                spinBtn.querySelector(".spin-btn-text").textContent = "\u26A1 SPIN \u26A1";
                addHistory(winners);
              }, 1500);
            }
          }, 800);
          return;
        }

        const centerName = p === "fakeout" ? decoy : rn();
        prevEl.textContent = currEl.textContent;
        nextEl.textContent = rn();
        const slideDur = Math.max(30, Math.min(d*0.5, 180));
        currEl.style.transition = "none";
        currEl.style.transform = "translateY(22px)";
        currEl.style.opacity = "0.3";
        currEl.textContent = centerName;
        // blur removed for perf
                currEl.style.transition = "transform " + slideDur + "ms ease-out, opacity " + slideDur + "ms ease-out";
        currEl.style.transform = "translateY(0)";
        currEl.style.opacity = "1";
        if (p === "fakeout") currEl.classList.add("spin-fakeout-glow");
        else currEl.classList.remove("spin-fakeout-glow");
        // Tick flash removed for performance
        if (p === "jerk") {
          slotFrame.classList.add("spin-jerk-shake");
          setTimeout(() => slotFrame.classList.remove("spin-jerk-shake"), 250);
        }
        ti++;
        if (ti < seq.length) {
          if (d <= 50) {
            // For very fast ticks, use rAF for smoother rendering
            requestAnimationFrame(() => setTimeout(tick, Math.max(d - 16, 0)));
          } else {
            setTimeout(tick, d);
          }
        }
      }
      tick();
    }
    revealNext();
  });


  function addHistory(winners) {
    const emptyMsg = historyList.querySelector(".history-empty");
    if (emptyMsg) emptyMsg.remove();

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const names = winners.map(w => w.name).join(", ");

    const entry = document.createElement("div");
    entry.className = "history-entry";
    entry.innerHTML = `
      <span class="history-time">${timeStr}</span>
      <span class="history-names">${names}</span>
    `;

    historyList.insertBefore(entry, historyList.firstChild);

    // Keep max 10 entries
    while (historyList.children.length > 10) {
      historyList.removeChild(historyList.lastChild);
    }
  }
}

// ============================================
// CONFETTI EXPLOSION SYSTEM
// ============================================
function launchConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;";

  const colors = [
    "#ff1744", "#ff8a95", "#ffffff", "#e07080",
    "#d0a0b8", "#ff4060", "#e0d0d8", "#c0b8c8",
    "#ff6b7a", "#f0e0e4", "#ffa0a8", "#b0a8b8"
  ];
  const shapes = ["rect", "circle", "star", "ribbon"];
  const confetti = [];
  const isMobile = window.innerWidth <= 768;
  const TOTAL = isMobile ? 20 : 60;

  for (let i = 0; i < TOTAL; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 12 + 4;
    confetti.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 2 + (Math.random() - 0.5) * 100,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - Math.random() * 6,
      size: Math.random() * 8 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 15,
      gravity: 0.12 + Math.random() * 0.08,
      friction: 0.98 + Math.random() * 0.015,
      opacity: 1,
      wobble: Math.random() * 10,
      wobbleSpeed: Math.random() * 0.1 + 0.05,
    });
  }

  let frame = 0;
  const maxFrames = isMobile ? 70 : 120;

  function drawStar(ctx, x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const r = i === 0 ? size : size;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      const b = a + (2 * Math.PI) / 5;
      ctx.lineTo(x + Math.cos(b) * (r * 0.4), y + Math.sin(b) * (r * 0.4));
    }
    ctx.closePath();
    ctx.fill();
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    const fadeStart = maxFrames * 0.6;
    const globalFade = frame > fadeStart ? 1 - (frame - fadeStart) / (maxFrames - fadeStart) : 1;

    confetti.forEach(p => {
      p.vy += p.gravity;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.x += p.vx + Math.sin(p.wobble) * 0.5;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.wobble += p.wobbleSpeed;
      p.opacity = globalFade;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      // Shadow removed for perf

      switch (p.shape) {
        case "rect":
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          break;
        case "circle":
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "star":
          drawStar(ctx, 0, 0, p.size / 2);
          break;
        case "ribbon":
          ctx.fillRect(-p.size, -1.5, p.size * 2, 3);
          break;
      }
      ctx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }
  animate();
}

// Init lottery on DOMContentLoaded
document.addEventListener("DOMContentLoaded", initTrainLottery);


// ============================================

// ============================================
// HALL OF FAME - TOP IMPROVE
// ============================================

function formatPower(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

async function initHofImprove() {
  const container = document.getElementById('hof-improve-leaderboard');
  const weekLabel = document.getElementById('hof-improve-week');
  if (!container) return;
  
  try {
    // Try to load power history first
    let weeks = [];
    try {
      const histResp = await fetch('powerhistory.json?t=' + Date.now());
      if (histResp.ok) {
        const history = await histResp.json();
        weeks = history.weeks || [];
      }
    } catch(e) {}
    
    if (weeks.length >= 2) {
      // Use last 2 weeks from history
      const currentWeek = weeks[weeks.length - 1];
      const prevWeek = weeks[weeks.length - 2];
      
      // Week label hidden by request
      
      const improvements = [];
      const currentPower = currentWeek.power || {};
      const prevPower = prevWeek.power || {};
      
      Object.keys(currentPower).forEach(function(name) {
        const curr = currentPower[name] || 0;
        const prev = prevPower[name] || 0;
        if (prev > 0 && curr > 0) {
          const pct = ((curr - prev) / prev) * 100;
          improvements.push({
            name: name,
            pct: pct,
            currentPower: formatPower(curr),
            previousPower: formatPower(prev)
          });
        }
      });
      
      improvements.sort(function(a, b) { return b.pct - a.pct; });
      const top10 = improvements.slice(0, 10);
      
      if (top10.length === 0) {
        container.innerHTML = '<div class="hof-improve-no-data">Belum ada data improvement minggu ini.</div>';
        return;
      }
      
      const maxPct = Math.max(...top10.map(function(p) { return Math.abs(p.pct); }));
      container.innerHTML = '';
      
      top10.forEach(function(player, i) {
        const pos = i + 1;
        const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '#' + pos;
        const rankClass = pos <= 3 ? ' hof-rank-' + pos : '';
        const pctClass = player.pct >= 0 ? 'hof-improve-up' : 'hof-improve-down';
        const arrow = player.pct >= 0 ? '▲' : '▼';
        const barWidth = maxPct > 0 ? (Math.abs(player.pct) / maxPct * 100) : 0;
        const barClass = pos > 3 ? ' hof-improve-bar-default' : '';
        
        const row = document.createElement('div');
        row.className = 'hof-improve-row' + rankClass;
        row.innerHTML =
          '<div class="hof-improve-badge">' + medal + '</div>' +
          '<div class="hof-improve-info">' +
            '<div class="hof-improve-name">' + player.name + '</div>' +
            '<div class="hof-improve-power-detail"><span>' + player.previousPower + '</span> → <span>' + player.currentPower + '</span></div>' +
          '</div>' +
          '<div class="hof-improve-bar-wrap">' +
            '<div class="hof-improve-bar' + barClass + '" data-width="' + barWidth + '"></div>' +
          '</div>' +
          '<div class="hof-improve-percent ' + pctClass + '">' +
            '<span class="hof-improve-arrow">' + arrow + '</span>' + Math.abs(player.pct).toFixed(1) + '%' +
          '</div>';
        container.appendChild(row);
      });
      
      // Animate rows visibility with stagger
      const rows = container.querySelectorAll('.hof-improve-row');
      rows.forEach(function(row, idx) {
        setTimeout(function() {
          row.classList.add('hof-row-visible');
        }, idx * 80);
      });
      
      // Animate bars
      setTimeout(function() {
        container.querySelectorAll('.hof-improve-bar').forEach(function(bar) {
          bar.style.width = bar.getAttribute('data-width') + '%';
        });
      }, rows.length * 80 + 200);
      
    } else {
      // Fallback: use weeklydata.json (old method)
      const wResp = await fetch('weeklydata.json?t=' + Date.now());
      if (!wResp.ok) throw new Error('No data');
      const weekly = await wResp.json();
      
      if (weekLabel) weekLabel.textContent = '📅 ' + (weekly.weekLabel || '');
      
      const prevPower = weekly.previousPower || {};
      const improvements = [];
      
      members.forEach(function(m) {
        const curr = parsePower(m.power);
        const prev = prevPower[m.name] || 0;
        if (prev > 0 && curr > 0) {
          const pct = ((curr - prev) / prev) * 100;
          improvements.push({
            name: m.name,
            pct: pct,
            currentPower: m.power,
            previousPower: formatPower(prev)
          });
        }
      });
      
      improvements.sort(function(a, b) { return b.pct - a.pct; });
      const top10 = improvements.slice(0, 10);
      
      if (top10.length === 0) {
        container.innerHTML = '<div class="hof-improve-no-data">Belum ada data improvement. Upload 2 minggu data power untuk melihat perbandingan.</div>';
        return;
      }
      
      const maxPct = Math.max(...top10.map(function(p) { return Math.abs(p.pct); }));
      container.innerHTML = '';
      
      top10.forEach(function(player, i) {
        const pos = i + 1;
        const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '#' + pos;
        const rankClass = pos <= 3 ? ' hof-rank-' + pos : '';
        const pctClass = player.pct >= 0 ? 'hof-improve-up' : 'hof-improve-down';
        const arrow = player.pct >= 0 ? '▲' : '▼';
        const barWidth = maxPct > 0 ? (Math.abs(player.pct) / maxPct * 100) : 0;
        const barClass = pos > 3 ? ' hof-improve-bar-default' : '';
        
        const row = document.createElement('div');
        row.className = 'hof-improve-row' + rankClass;
        row.innerHTML =
          '<div class="hof-improve-badge">' + medal + '</div>' +
          '<div class="hof-improve-info">' +
            '<div class="hof-improve-name">' + player.name + '</div>' +
            '<div class="hof-improve-power-detail"><span>' + player.previousPower + '</span> → <span>' + player.currentPower + '</span></div>' +
          '</div>' +
          '<div class="hof-improve-bar-wrap">' +
            '<div class="hof-improve-bar' + barClass + '" data-width="' + barWidth + '"></div>' +
          '</div>' +
          '<div class="hof-improve-percent ' + pctClass + '">' +
            '<span class="hof-improve-arrow">' + arrow + '</span>' + Math.abs(player.pct).toFixed(1) + '%' +
          '</div>';
        container.appendChild(row);
      });
      
      // Animate rows visibility with stagger
      const rows2 = container.querySelectorAll('.hof-improve-row');
      rows2.forEach(function(row, idx) {
        setTimeout(function() {
          row.classList.add('hof-row-visible');
        }, idx * 80);
      });
      
      // Animate bars
      setTimeout(function() {
        container.querySelectorAll('.hof-improve-bar').forEach(function(bar) {
          bar.style.width = bar.getAttribute('data-width') + '%';
        });
      }, rows2.length * 80 + 200);
    }
  } catch(err) {
    container.innerHTML = '<div class="hof-improve-no-data">Belum ada data improvement. Upload 2 minggu data power untuk melihat perbandingan.</div>';
  }
}

function formatDonationValue(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

async function initHofDonation() {
  const container = document.getElementById('hof-donation-leaderboard');
  const weekLabel = document.getElementById('hof-donation-week');
  if (!container) return;
  
  try {
    const resp = await fetch('weeklydata.json?t=' + Date.now());
    if (!resp.ok) throw new Error('No data');
    const weekly = await resp.json();
    
    if (weekLabel) weekLabel.textContent = '📅 ' + (weekly.weekLabel || '');
    
    const donations = weekly.donations || {};
    
    // Sort by value descending, filter non-zero
    const sorted = Object.entries(donations)
      .filter(function(e) { return e[1] > 0; })
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 10);
    
    if (sorted.length === 0) {
      container.innerHTML = '<div class="hof-lb-no-data">Belum ada data donasi minggu ini.<br>Data akan muncul setelah admin menginput data donasi.</div>';
      return;
    }
    
    const maxVal = sorted[0][1];
    container.innerHTML = '';
    
    sorted.forEach(function(entry, i) {
      const name = entry[0];
      const val = entry[1];
      const pos = i + 1;
      const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '#' + pos;
      const rankClass = pos <= 3 ? ' hof-lb-top' + pos : '';
      const barWidth = maxVal > 0 ? (val / maxVal * 100) : 0;
      const barColorClass = pos === 1 ? 'hof-lb-bar-gold' : pos === 2 ? 'hof-lb-bar-silver' : pos === 3 ? 'hof-lb-bar-bronze' : 'hof-lb-bar-default';
      
      const row = document.createElement('div');
      row.className = 'hof-lb-row' + rankClass;
      row.innerHTML =
        '<div class="hof-lb-badge">' + medal + '</div>' +
        '<div class="hof-lb-info">' +
          '<div class="hof-lb-name">' + name + '</div>' +
        '</div>' +
        '<div class="hof-lb-bar-wrap">' +
          '<div class="hof-lb-bar ' + barColorClass + '" data-width="' + barWidth + '"></div>' +
        '</div>' +
        '<div class="hof-lb-value">' + formatDonationValue(val) + '</div>';
      container.appendChild(row);
    });
    
    // Animate bars
    setTimeout(function() {
      container.querySelectorAll('.hof-lb-bar').forEach(function(bar) {
        bar.style.width = bar.getAttribute('data-width') + '%';
      });
    }, 100);
    
  } catch(err) {
    container.innerHTML = '<div class="hof-lb-no-data">Belum ada data donasi minggu ini.</div>';
  }
}

async function initHofDuel() {
  const container = document.getElementById('hof-duel-leaderboard');
  const weekLabel = document.getElementById('hof-duel-week');
  if (!container) return;
  
  try {
    const resp = await fetch('weeklydata.json?t=' + Date.now());
    if (!resp.ok) throw new Error('No data');
    const weekly = await resp.json();
    
    if (weekLabel) weekLabel.textContent = '📅 ' + (weekly.weekLabel || '');
    
    const daPoints = weekly.daPoints || {};
    
    // Sort by value descending, filter non-zero
    const sorted = Object.entries(daPoints)
      .filter(function(e) { return e[1] > 0; })
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 10);
    
    if (sorted.length === 0) {
      container.innerHTML = '<div class="hof-lb-no-data">Belum ada data Duel Aliansi minggu ini.<br>Data akan muncul setelah admin menginput poin duel.</div>';
      return;
    }
    
    const maxVal = sorted[0][1];
    container.innerHTML = '';
    
    sorted.forEach(function(entry, i) {
      const name = entry[0];
      const val = entry[1];
      const pos = i + 1;
      const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '#' + pos;
      const rankClass = pos <= 3 ? ' hof-lb-top' + pos : '';
      const barWidth = maxVal > 0 ? (val / maxVal * 100) : 0;
      const barColorClass = pos === 1 ? 'hof-lb-bar-gold' : pos === 2 ? 'hof-lb-bar-silver' : pos === 3 ? 'hof-lb-bar-bronze' : 'hof-lb-bar-default';
      
      const row = document.createElement('div');
      row.className = 'hof-lb-row' + rankClass;
      row.innerHTML =
        '<div class="hof-lb-badge">' + medal + '</div>' +
        '<div class="hof-lb-info">' +
          '<div class="hof-lb-name">' + name + '</div>' +
        '</div>' +
        '<div class="hof-lb-bar-wrap">' +
          '<div class="hof-lb-bar ' + barColorClass + '" data-width="' + barWidth + '"></div>' +
        '</div>' +
        '<div class="hof-lb-value">' + val.toLocaleString() + ' pts</div>';
      container.appendChild(row);
    });
    
    // Animate bars
    setTimeout(function() {
      container.querySelectorAll('.hof-lb-bar').forEach(function(bar) {
        bar.style.width = bar.getAttribute('data-width') + '%';
      });
    }, 100);
    
  } catch(err) {
    container.innerHTML = '<div class="hof-lb-no-data">Belum ada data Duel Aliansi minggu ini.</div>';
  }
}


// HALL OF FAME TABS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const hofTabs = document.querySelectorAll('.hof-tab');
  const hofPanels = document.querySelectorAll('.hof-panel');
  
  hofTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.hof;
      
      hofTabs.forEach(t => t.classList.remove('active'));
      hofPanels.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const panel = document.getElementById('hof-' + target);
      panel.classList.add('active');
      
      // Auto-scroll to Hall of Fame section
      const hofSection = document.getElementById('halloffame');
      if (hofSection) hofSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Initialize Hall of Fame - Top Improve
  initHofImprove();
  initHofDonation();
  initHofDuel();
});
