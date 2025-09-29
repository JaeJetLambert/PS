// ===============================
// designer.js — Per-designer view (ALPHA-SORTED + realtime)
// ===============================

const db = window.supabase;

// Read ?name=Sarah from the URL
const params = new URLSearchParams(location.search);
const designerName = params.get('name') || '';

let all = [];        // all projects for this designer
let rtChannel = null;

// ---------- UI refs ----------
const h1 = document.getElementById('designerPageTitle');
const searchInput = document.getElementById('searchInput');
const activeGrid = document.getElementById('designerActiveGrid');
const completedGrid = document.getElementById('designerCompletedGrid');

// Case-insensitive name sorter
const byName = (a, b) =>
  (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });

// ---------- Title ----------
function setTitle() {
  h1.textContent = designerName
    ? `Projects — ${designerName}`
    : 'Projects — (no designer selected)';
}

// Render a list of project cards into a grid element
function renderList(gridEl, list) {
  gridEl.innerHTML = list.map(p => `
    <div class="dashboard-card"
         onclick="window.location.href='project.html?name=${encodeURIComponent(p.name)}'">
      <h3>${p.name}</h3>
      <p><strong>Designer:</strong> ${p.designer || ''}</p>
      <p><strong>${p.status === 'completed' ? 'Completed' : 'Start Date'}:</strong> ${
        p.status === 'completed'
          ? (p.completed_at ? new Date(p.completed_at).toLocaleDateString() : '—')
          : (p.startDate || '—')
      }</p>
    </div>
  `).join('');
}

// Update the three counters for THIS designer
function updateCounters() {
  const year = new Date().getFullYear();

  const activeCount = all.filter(p =>
    p.status !== 'completed' && p.status !== 'abandoned'
  ).length;

  const completedThisYear = all.filter(p =>
    p.status === 'completed' &&
    p.completed_at &&
    new Date(p.completed_at).getFullYear() === year
  ).length;

  const pastDue = 0; // TODO: define rule if/when needed

  document.querySelector('#activeCounter h2').textContent = activeCount;
  document.querySelector('#completedCounter h2').textContent = completedThisYear;
  document.querySelector('#pastDueCounter h2').textContent = pastDue;
}

// Apply search term across both lists and render (ALPHA-SORTED)
function renderAll() {
  const term = (searchInput?.value || '').trim().toLowerCase();

  const active = all.filter(p => p.status !== 'completed' && p.status !== 'abandoned');
  const completed = all.filter(p => p.status === 'completed');

  const activeRendered = (
    term ? active.filter(p => (p.name || '').toLowerCase().includes(term)) : active
  ).sort(byName);

  const completedRendered = (
    term ? completed.filter(p => (p.name || '').toLowerCase().includes(term)) : completed
  ).sort(byName);

  renderList(activeGrid, activeRendered);
  renderList(completedGrid, completedRendered);
  updateCounters(); // counters are based on all; change to use filtered if you prefer
}

// ---------- Data ----------
async function loadForDesigner() {
  if (!designerName) return [];

  const { data, error } = await db
    .from('projects')
    .select('*')
    .eq('designer', designerName)
    .order('completed_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data.map(r => ({
    id: r.id,
    name: r.name,
    designer: r.designer,
    type: r.type,
    startDate: r.start_date ?? '',
    status: r.status ?? 'active',
    abandon_reason: r.abandon_reason ?? null,
    abandoned_at: r.abandoned_at ?? null,
    completed_at: r.completed_at ?? null,
    completion_notes: r.completion_notes ?? null,
    created_at: r.created_at
  }));
}

// ---------- Realtime ----------
function setupRealtime() {
  rtChannel = db.channel('designer-live');
  rtChannel
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'projects' },
      async (payload) => {
        const row = payload.new || payload.old || {};
        if (!designerName || row.designer === designerName) {
          try {
            all = await loadForDesigner();
            renderAll(); // keeps alpha sort + search
          } catch (e) {
            console.error('Realtime refresh (designer) failed:', e);
          }
        }
      }
    )
    .subscribe();
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', async () => {
  setTitle();

  try {
    all = await loadForDesigner();
  } catch (e) {
    console.error(e);
    all = [];
  }

  renderAll();

  // Wire search
  searchInput.addEventListener('input', renderAll);

  // Realtime updates
  setupRealtime();

  // Clean up channel on navigate away
  window.addEventListener('beforeunload', () => {
    try { rtChannel?.unsubscribe(); } catch (_) {}
  });
});