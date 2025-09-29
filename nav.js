// ===============================
// nav.js — Populate "By Designer" dropdown dynamically
// ===============================
(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    const db = window.supabase;
    if (!db) {
      console.warn('Supabase client missing; nav dropdown will stay static.');
      return;
    }

    // Find all dropdown containers on the page
    const containers = Array.from(
      document.querySelectorAll('.designer-dropdown .dropdown-content')
    );
    if (!containers.length) return;

    // Load designers (unique, non-empty), then sort A→Z
    let names = [];
    try {
      const { data, error } = await db
        .from('projects')
        .select('designer')
        .not('designer', 'is', null); // exclude null

      if (error) throw error;

      names = [...new Set((data || []).map(r => r.designer).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    } catch (e) {
      console.error('Failed to load designers for nav:', e);
      names = [];
    }

    // Build links or show an empty message
    const html = names.length
      ? names.map(n => `<a href="designer.html?name=${encodeURIComponent(n)}">${n}</a>`).join('')
      : '<span style="padding:0.5rem 1rem;display:block;opacity:.7;">No designers yet</span>';

    containers.forEach(el => { el.innerHTML = html; });
  });
})();