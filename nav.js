// ===============================
// nav.js — Dynamic "By Designer" menu + stable click-to-open dropdown
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  const db = window.supabase;

  // 1) Populate designer lists on all pages
  const containers = Array.from(document.querySelectorAll('.designer-dropdown .dropdown-content'));
  if (containers.length) {
    let names = [];
    try {
      const { data, error } = await db
        .from('projects')
        .select('designer')
        .not('designer', 'is', null);
      if (error) throw error;

      names = [...new Set((data || []).map(r => r.designer).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    } catch (e) {
      console.error('Failed to load designers for nav:', e);
    }

    const html = names.length
      ? names.map(n => `<a href="designer.html?name=${encodeURIComponent(n)}">${n}</a>`).join('')
      : '<span style="padding:0.5rem 1rem;display:block;opacity:.7;">No designers yet</span>';

    containers.forEach(el => { el.innerHTML = html; });
  }

  // 2) Click-to-open dropdown behavior (stable across pages)
  const dropdowns = Array.from(document.querySelectorAll('.designer-dropdown'));
  dropdowns.forEach(dd => {
    const btn = dd.querySelector('.dropbtn');
    const panel = dd.querySelector('.dropdown-content');
    if (!btn || !panel) return;

    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');

    const open = () => {
      dd.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      dd.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dd.classList.contains('open') ? close() : open();
    });

    // Keep clicks inside the panel from closing it prematurely
    panel.addEventListener('click', (e) => e.stopPropagation());
  });

  // Close any open dropdown on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.designer-dropdown.open').forEach(dd => {
      dd.classList.remove('open');
      const btn = dd.querySelector('.dropbtn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.designer-dropdown.open').forEach(dd => {
        dd.classList.remove('open');
        const btn = dd.querySelector('.dropbtn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        btn?.focus();
      });
    }
  });
});