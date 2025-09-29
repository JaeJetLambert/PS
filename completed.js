// completed.js — render completed projects list
const db = window.supabase;
let projects = [];

async function loadAll() {
  const { data, error } = await db
    .from('projects')
    .select('*')
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
    completed_at: r.completed_at ?? null
  }));
}

function render(list) {
  const grid = document.getElementById('completedGrid');
  grid.innerHTML = list.map(p => `
    <div class="dashboard-card"
         onclick="window.location.href='project.html?name=${encodeURIComponent(p.name)}'">
      <h3>${p.name}</h3>
      <p><strong>Designer:</strong> ${p.designer || ''}</p>
      <p><strong>Completed:</strong> ${
        p.completed_at ? new Date(p.completed_at).toLocaleDateString() : '—'
      }</p>
    </div>
  `).join('');
}

function wireSearch() {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    const term = input.value.toLowerCase();
    const completed = projects.filter(p => p.status === 'completed');
    const list = term
      ? completed.filter(p => p.name.toLowerCase().includes(term))
      : completed;
    render(list);
  });
}
// Realtime updates on completed page
function setupRealtime() {
  const channel = db.channel('projects-completed-live');
  channel
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'projects' },
      async () => {
        try {
          projects = await loadAll();
          render(projects.filter(p => p.status === 'completed'));
        } catch (e) {
          console.error('Realtime refresh (completed) failed:', e);
        }
      }
    )
    .subscribe();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    projects = await loadAll();
  } catch (e) {
    console.error(e);
    projects = [];
  }
  render(projects.filter(p => p.status === 'completed'));
  wireSearch();
  setupRealtime();
});