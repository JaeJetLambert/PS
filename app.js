// ===============================
// app.js — Dashboard logic
// (A→Z sorting + realtime + duplicate-name guard
//  + per-designer breakdowns in counters
//  + AUTO-SEED tasks from templates on project create)
// ===============================

// --- DB Client (attached on each page by index.html) ---
let db; // set inside DOMContentLoaded

// --- In-memory cache of projects for the UI ---
let projects = [];

// Case-insensitive name sorter (projects by name)
const byName = (a, b) =>
  (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });

// Designer label normalizer for grouping
const safeDesigner = (d) => (d && d.trim()) || 'Unassigned';

// Group an array of projects -> [{ designer, count }] sorted A→Z
function groupCountByDesigner(list) {
  const map = new Map();
  for (const p of list) {
    const key = safeDesigner(p.designer);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([designer, count]) => ({ designer, count }))
    .sort((a, b) => a.designer.localeCompare(b.designer, undefined, { sensitivity: 'base' }));
}

// Render a tiny list inside a counter card
function renderMiniList(ulId, items) {
  const ul = document.getElementById(ulId);
  if (!ul) return;
  if (!items.length) {
    ul.innerHTML = `<li class="muted"><span>—</span><span>0</span></li>`;
    return;
  }
  ul.innerHTML = items.map(it =>
    `<li><span>${it.designer}</span><span>${it.count}</span></li>`
  ).join('');
}

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

// Insert a new project row and RETURN the created row (incl. id)
async function dbInsertProject(p) {
  const { data, error } = await db
    .from('projects')
    .insert({
      name: p.name,
      designer: p.designer,
      type: p.type,
      start_date: p.startDate,
      status: p.status ?? 'active'
    })
    .select('*')
    .single(); // <- return the inserted row
  if (error) throw error;
  return data; // { id, name, designer, ... }
}

// --- AUTO-SEED tasks from template for a newly created project ----
async function dbSeedTasksFromTemplate(projectRow) {
  // 1) Load template rows in a stable order
  const { data: tmpl, error: e0 } = await db
    .from('task_templates')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (e0) throw e0;
  if (!tmpl || !tmpl.length) return; // nothing to seed

  // 2) Prepare per-task inserts
  const toInsert = tmpl.map(t => ({
    project_id: projectRow.id,
    template_id: t.id,
    title: t.title,
    role: t.role,
    // Default assignee rule:
    //  - Designer tasks -> the project's designer
    //  - Everything else -> 'Admin'
    assignee: t.role === 'Designer' ? (projectRow.designer || null) : 'Admin',
    status: 'todo',
    due_date: null
  }));

  // 3) Insert tasks and capture IDs
  const { data: created, error: e1 } = await db
    .from('tasks')
    .insert(toInsert)
    .select('id, template_id');
  if (e1) throw e1;

  // 4) Build dependency rows from template offsets
  const idByTemplate = new Map(created.map(r => [r.template_id, r.id]));
  const deps = tmpl
    .filter(t => t.schedule_kind === 'offset' && t.anchor_template_id)
    .map(t => ({
      task_id: idByTemplate.get(t.id),
      anchor_task_id: idByTemplate.get(t.anchor_template_id),
      offset_days: t.offset_days || 0
    }))
    .filter(d => d.task_id && d.anchor_task_id);

  if (deps.length) {
    const { error: e2 } = await db.from('task_dependencies').insert(deps);
    if (e2) throw e2;
  }
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

// --- Counters (+ per-designer lists) -------------------------------
function updateCounters() {
  const year = new Date().getFullYear();

  // Active
  const activeList = projects.filter(
    p => p.status !== 'completed' && p.status !== 'abandoned'
  );
  const activeCount = activeList.length;
  document.querySelector('#activeCounter h2').textContent = activeCount;
  renderMiniList('activeByDesigner', groupCountByDesigner(activeList));

  // Completed (This Year)
  const completedThisYear = projects.filter(p =>
    p.status === 'completed' &&
    p.completed_at &&
    new Date(p.completed_at).getFullYear() === year
  );
  document.querySelector('#completedCounter h2').textContent = completedThisYear.length;
  renderMiniList('completedByDesigner', groupCountByDesigner(completedThisYear));

  // Past Due (placeholder for now — will fill once we define the rule)
  const pastDueList = []; // TODO: compute from projects when logic is defined
  document.querySelector('#pastDueCounter h2').textContent = pastDueList.length;
  renderMiniList('pastDueByDesigner', groupCountByDesigner(pastDueList));
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

  // Duplicate-name guard (case-insensitive) — encourage disambiguation
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
    // 1) Create the project and get its id/designer back
    const created = await dbInsertProject(newProj);

    // 2) Immediately seed tasks for this new project
    try {
      await dbSeedTasksFromTemplate(created);
    } catch (seedErr) {
      console.error('Task seeding failed (project still created):', seedErr);
      alert('Project saved, but tasks could not be seeded: ' + seedErr.message);
    }

    // 3) Refresh dashboard
    projects = await dbLoadProjects();
    renderProjects();
    updateCounters();

    // 4) Close/reset modal
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
  updateCounters();  // fills the per-designer mini-lists
  setupSearch();
  setupRealtime();
});