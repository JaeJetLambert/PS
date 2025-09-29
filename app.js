// ===============================
// app.js — Dashboard logic (ALPHA-SORTED + duplicate-name guard)
// ===============================

// --- DB Client (attached on each page by index.html) ---
let db; // set inside DOMContentLoaded

// --- In-memory cache of projects for the UI ---
let projects = [];

// Case-insensitive name sorter
const byName = (a, b) =>
  (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });

// --- Data-access helpers ------------------------------------------
async function dbLoadProjects() {
  const { data, error } = await db
    .from('projects')
    .select('*')
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
    completed_at: r.completed_at ?? null,
    completion_notes: r.completion_notes ?? null,
    created_at: r.created_at
  }));
}

// Insert a new project row
async function dbInsertProject(p) {
  const { error } = await db.from('projects').insert({
    name: p.name,
    designer: p.designer,
    type: p.type,
    start_date: p.startDate,
    status: p.status ?? 'active'
  });
  if (error) throw error;
}

// --- Rendering -----------------------------------------------------
// Render only ACTIVE projects in the grid, ALPHA by name
function renderProjects() {
  const grid = document.getElementById("projectGrid");

  const activeList = projects
    .filter(p => p.status !== 'completed' && p.status !== 'abandoned')
    .sort(byName);

  grid.innerHTML = activeList.map(p => `
    <div class="dashboard-card"
         onclick="window.location.href='project.html?id=${encodeURIComponent(p.id)}'">
      <h3>${p.name}</h3>
      <p><strong>Designer:</strong> ${p.designer || ''}</p>
      <p><strong>Start Date:</strong> ${p.startDate || ''}</p>
    </div>
  `).join("");
}

// --- Counters ------------------------------------------------------
function updateCounters() {
  const year = new Date().getFullYear();

  const active = projects.filter(
    p => p.status !== 'completed' && p.status !== 'abandoned'
  ).length;

  const completedThisYear = projects.filter(p =>
    p.status === 'completed' &&
    p.completed_at &&
    new Date(p.completed_at).getFullYear() === year
  ).length;

  const pastDue = 0; // TODO: define rule later

  document.getElementById('activeCounter').querySelector('h2').textContent = active;
  document.getElementById('completedCounter').querySelector('h2').textContent = completedThisYear;
  document.getElementById('pastDueCounter').querySelector('h2').textContent = pastDue;
}

// --- Search (active projects only), ALPHA results ------------------
function setupSearch() {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    const term = (input.value || '').toLowerCase();

    const activeList = projects
      .filter(p => p.status !== 'completed' && p.status !== 'abandoned');

    const list = (term
      ? activeList.filter(p => (p.name || '').toLowerCase().includes(term))
      : activeList
    ).sort(byName);

    const grid = document.getElementById("projectGrid");
    grid.innerHTML = list.map(p => `
      <div class="dashboard-card"
           onclick="window.location.href='project.html?id=${encodeURIComponent(p.id)}'">
        <h3>${p.name}</h3>
        <p><strong>Designer:</strong> ${p.designer || ''}</p>
        <p><strong>Start Date:</strong> ${p.startDate || ''}</p>
      </div>
    `).join("");
  });
}

// --- Realtime: refresh dashboard whenever any row changes ----------
function setupRealtime() {
  const channel = db.channel('projects-live');
  channel
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'projects' },
      async () => {
        try {
          projects = await dbLoadProjects();
          renderProjects();
          updateCounters();
        } catch (e) {
          console.error('Realtime refresh failed:', e);
        }
      }
    )
    .subscribe();
}

// --- New Project Modal Logic --------------------------------------
const modal = document.getElementById("newProjectModal");
const newBtn = document.getElementById("newProjectBtn");
const closeModal = document.getElementById("closeModal");
const form = document.getElementById("newProjectForm");

newBtn.addEventListener("click", () => { modal.style.display = "block"; });
closeModal.addEventListener("click", () => { modal.style.display = "none"; });
window.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameRaw = document.getElementById('projectNameInput').value;
  const normalizedName = nameRaw.trim().replace(/\s+/g, ' ');
  const newProj = {
    name: normalizedName,
    designer: document.getElementById('designerSelect').value,
    type: document.getElementById('projectType').value,
    startDate: document.getElementById('startDateInput').value,
    status: 'active'
  };
  if (!newProj.name) return;

  // --- Duplicate-name guard (case-insensitive) --------------------
  const dup = projects.some(
    p => (p.name || '').trim().toLowerCase() === newProj.name.toLowerCase()
  );
  if (dup) {
    alert(
      'A project with that name already exists.\n\n' +
      'Please add more info to make it unique (e.g., address, client, or date).'
    );
    document.getElementById('projectNameInput').focus();
    return;
  }

  try {
    await dbInsertProject(newProj);
    projects = await dbLoadProjects();
    renderProjects();     // grid re-renders alpha
    updateCounters();
    modal.style.display = 'none';
    form.reset();
  } catch (err) {
    alert('Could not save project: ' + err.message);
    console.error(err);
  }
});

// --- Page bootstrap ------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  db = window.supabase;
  if (!db) {
    console.error('Supabase client not found on window.');
    return;
  }

  try {
    projects = await dbLoadProjects();
  } catch (e) {
    console.error('Failed to load from DB:', e);
    projects = [];
  }

  renderProjects();  // alpha-sorted
  updateCounters();
  setupSearch();
  setupRealtime();
});