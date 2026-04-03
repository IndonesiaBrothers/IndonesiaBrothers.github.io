/* ============================================
   HALL OF FAME - IDs Indonesian Brothers
   Simple tab switching + mobile nav
   ============================================ */

(function() {
  'use strict';

  // --- Tab Switching ---
  const tabs = document.querySelectorAll('.hof-tab');
  const panels = document.querySelectorAll('.hof-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      panels.forEach(p => {
        p.classList.remove('active');
        if (p.id === 'panel-' + target) {
          p.classList.add('active');
        }
      });
    });
  });

  // --- Mobile Nav ---
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  const overlay = document.getElementById('mobile-nav-overlay');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      if (overlay) overlay.classList.toggle('active');
      navToggle.classList.toggle('active');
    });

    if (overlay) {
      overlay.addEventListener('click', () => {
        navLinks.classList.remove('active');
        overlay.classList.remove('active');
        navToggle.classList.remove('active');
      });
    }

    // Close on link click
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        navToggle.classList.remove('active');
      });
    });
  }
})();
