// ===============================
// app.js — Dashboard logic
// ===============================

// --- DB Client (attached on each page by index.html/project.html) ---
let db; // Supabase JS client created in the HTML <script type="module"> block

// --- In-memory cache of projects (UI works against this array) ---
let projects = [];

// --- Data-access helpers ------------------------------------------
// Loads all projects from Supabase, newest first.
// Also normalizes snake_case DB fields to camelCase for the UI.
async function dbLoadProjects() {
  const { data, error } = await db
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Normalize for UI consumption
  return data.map(r => ({
    id: r.id,
    name: r.name,
    designer: r.designer,
    type: r.type,
    startDate: r.start_date ?? '',
    status: r.status ?? 'active',
    abandon_reason: r.abandon_reason ?? null,
    created_at: r.created_at
  }));
}

// Inserts a new project row into the DB (status defaults to 'active').
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
// Renders the dashboard card grid from the global `projects` array.
// Each card links to the detail view by project *name*.
function renderProjects() {
  const grid = document.getElementById("projectGrid");

  // show only active (not completed/abandoned)
  const activeList = projects.filter(
    p => p.status !== 'completed' && p.status !== 'abandoned'
  );

  grid.innerHTML = activeList.map(p => `
    <div class="dashboard-card"
         onclick="window.location.href='project.html?name=${encodeURIComponent(p.name)}'">
      <h3>${p.name}</h3>
      <p><strong>Designer:</strong> ${p.designer || ''}</p>
      <p><strong>Start Date:</strong> ${p.startDate || ''}</p>
    </div>
  `).join("");
}

// --- Page bootstrap ------------------------------------------------
// Wait for DOM, then load projects from DB, render, update counters, and wire search.
document.addEventListener('DOMContentLoaded', async () => {
    db = window.supabase;
  if (!db) {
    console.error('Supabase client not found on window.');
    return; // prevents calling db.* if the client failed to load
  }
  try {
    projects = await dbLoadProjects();
  } catch (e) {
    console.error('Failed to load from DB:', e);
    projects = []; // fail-safe empty state
  }
  renderProjects(projects);
  updateCounters();
  setupSearch();
  setupRealtime();
});
// Realtime: refetch & rerender whenever any project row changes
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
// Handles opening/closing the modal and submitting the new project form.
const modal = document.getElementById("newProjectModal");
const newBtn = document.getElementById("newProjectBtn");
const closeModal = document.getElementById("closeModal");
const form = document.getElementById("newProjectForm");

// Open the modal
newBtn.addEventListener("click", () => {
  modal.style.display = "block";
});

// Close when clicking the × icon
closeModal.addEventListener("click", () => {
  modal.style.display = "none";
});

// Close when clicking the backdrop
window.addEventListener("click", e => {
  if (e.target === modal) modal.style.display = "none";
});

// Create a new project in Supabase, then refresh the grid and counters.
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Collect form values
  const newProj = {
    name: document.getElementById('projectNameInput').value.trim(),
    designer: document.getElementById('designerSelect').value,
    type: document.getElementById('projectType').value,
    startDate: document.getElementById('startDateInput').value,
    status: 'active'
  };
  if (!newProj.name) return; // minimal guard

  try {
    await dbInsertProject(newProj);     // write to DB
    projects = await dbLoadProjects();  // refresh cache from DB
    renderProjects(projects);           // repaint UI
    updateCounters();                   // update top counters
    modal.style.display = 'none';       // close modal
    form.reset();                       // clear form
  } catch (err) {
    alert('Could not save project: ' + err.message);
    console.error(err);
  }
});

// --- Counters + Search functionality -------------------------------
// Calculates and updates the top summary counters.
// Past Due is a placeholder until business logic is defined.
function updateCounters() {
  const active    = projects.filter(p => p.status !== 'completed' && p.status !== 'abandoned').length;
  const completed = projects.filter(p => p.status === 'completed').length;
  const pastDue   = 0; // TODO: define "past due" rule (e.g., startDate + N days && not completed)

  document.getElementById('activeCounter').querySelector('h2').textContent = active;
  document.getElementById('completedCounter').querySelector('h2').textContent = completed;
  document.getElementById('pastDueCounter').querySelector('h2').textContent = pastDue;
}

// Simple client-side filter that reuses the same renderer,
// so results stay clickable and styled the same way.
function setupSearch() {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    const term = input.value.toLowerCase();
    const activeList = projects.filter(
      p => p.status !== 'completed' && p.status !== 'abandoned'
    );
    const list = term
      ? activeList.filter(p => p.name.toLowerCase().includes(term))
      : activeList;

    const grid = document.getElementById("projectGrid");
    grid.innerHTML = list.map(p => `
      <div class="dashboard-card"
           onclick="window.location.href='project.html?name=${encodeURIComponent(p.name)}'">
        <h3>${p.name}</h3>
        <p><strong>Designer:</strong> ${p.designer || ''}</p>
        <p><strong>Start Date:</strong> ${p.startDate || ''}</p>
      </div>
    `).join("");
  });
}