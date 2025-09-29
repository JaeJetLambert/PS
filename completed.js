// ===============================
// completed.js — Completed/Abandoned lists with tabs + realtime (ALPHA-SORTED)
// ===============================
const db = window.supabase;

let projects = [];
let currentTab = 'completed';  // 'completed' | 'abandoned'
let rtChannel;                  // for unsubscribe on unload

// Case-insensitive name sorter
const byName = (a, b) =>
  (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });

// Load both completed and abandoned from the DB
async function loadAll() {
  const { data, error } = await db
    .from('projects')
    .select('*')
    .in('status', ['completed', 'abandoned'])
    .order('completed_at', { ascending: false })
    .order('abandoned_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  return data.map(r => ({
    id: r.id,
    name: r.name,
    designer: r.designer,
    type: r.type,
    startDate: r.start_date ?? '',
    status: r.status ?? 'active',
    completed_at: r.completed_at ?? null,
    abandoned_at: r.abandoned_at ?? null
  }));
}

// Basic card renderer for whatever list we pass in
function render(list) {
  const grid = document.getElementById('completedGrid');
  grid.innerHTML = list.map(p => {
    const isAbandoned = p.status === 'abandoned';
    const ts = isAbandoned ? p.abandoned_at : p.completed_at;
    const label = isAbandoned ? 'Abandoned' : 'Completed';
    const dateText = ts ? new Date(ts).toLocaleDateString() : '—';
    return `
      <div class="dashboard-card"
           onclick="window.location.href='project.html?name=${encodeURIComponent(p.name)}'">
        <h3>${p.name}</h3>
        <p><strong>Designer:</strong> ${p.designer || ''}</p>
        <p><strong>${label}:</strong> ${dateText}</p>
      </div>
    `;
  }).join('');
}

// Re-render respecting the active tab + current search term (ALPHA-SORTED)
function renderFiltered() {
  const term = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

  const base = currentTab === 'completed'
    ? projects.filter(p => p.status === 'completed')
    : projects.filter(p => p.status === 'abandoned');

  const list = (term
    ? base.filter(p =>
        (p.name || '').toLowerCase().includes(term) ||
        (p.designer || '').toLowerCase().includes(term)
      )
    : base
  ).sort(byName); // <-- enforce A→Z

  render(list);
}

// Search: updates the filtered render as you type
function wireSearch() {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', renderFiltered);
}

// Tabs: Completed / Abandoned
function wireTabs() {
  const tC = document.getElementById('tabCompleted');
  const tA = document.getElementById('tabAbandoned');

  function setActive(tab) {
    currentTab = tab;
    tC.classList.toggle('active', tab === 'completed');
    tA.classList.toggle('active', tab === 'abandoned');
    renderFiltered();
  }

  tC.addEventListener('click', () => setActive('completed'));
  tA.addEventListener('click', () => setActive('abandoned'));
}

// Realtime: refetch and re-render when any project row changes
function setupRealtime() {
  rtChannel = db.channel('projects-completed-live');
  rtChannel
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'projects' },
      async () => {
        try {
          projects = await loadAll();
          renderFiltered(); // keeps sort + tab + search
        } catch (e) {
          console.error('Realtime refresh (completed/abandoned) failed:', e);
        }
      }
    )
    .subscribe();
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  try {
    projects = await loadAll();
  } catch (e) {
    console.error(e);
    projects = [];
  }
  wireSearch();
  wireTabs();
  renderFiltered();
  setupRealtime();

  // tidy up the realtime subscription when leaving the page
  window.addEventListener('beforeunload', () => {
    try { rtChannel?.unsubscribe(); } catch (_) {}
  });
});