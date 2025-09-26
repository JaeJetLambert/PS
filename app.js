// --- DB Client (provided by index.html) ---
const db = window.supabase;

// In-memory cache populated from DB
let projects = [];

// DB helpers
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
    created_at: r.created_at
  }));
}

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

function renderProjects() {
  const grid = document.getElementById("projectGrid");
  grid.innerHTML = projects.map((p, i) => `
    <div class="dashboard-card"
         onclick="window.location.href='project.html?name=${encodeURIComponent(p.name)}'">
      <h3>${p.name}</h3>
      <p><strong>Designer:</strong> ${p.designer}</p>
      <p><strong>Start Date:</strong> ${p.startDate}</p>
    </div>
  `).join("");
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    projects = await dbLoadProjects();
  } catch (e) {
    console.error('Failed to load from DB:', e);
    projects = [];
  }
  renderProjects(projects);
  updateCounters();
  setupSearch();
});

// --- existing dashboard code remains above ---

// --- New Project Modal Logic ---
const modal = document.getElementById("newProjectModal");
const newBtn = document.getElementById("newProjectBtn");
const closeModal = document.getElementById("closeModal");
const form = document.getElementById("newProjectForm");

newBtn.addEventListener("click", () => {
  modal.style.display = "block";
});

closeModal.addEventListener("click", () => {
  modal.style.display = "none";
});

window.addEventListener("click", e => {
  if (e.target === modal) modal.style.display = "none";
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newProj = {
    name: document.getElementById('projectNameInput').value.trim(),
    designer: document.getElementById('designerSelect').value,
    type: document.getElementById('projectType').value,
    startDate: document.getElementById('startDateInput').value,
    status: 'active'
  };
  if (!newProj.name) return;

  try {
    await dbInsertProject(newProj);
    projects = await dbLoadProjects();   // refresh from DB
    renderProjects(projects);
    updateCounters();
    modal.style.display = 'none';
    form.reset();
  } catch (err) {
    alert('Could not save project: ' + err.message);
    console.error(err);
  }
});

// --- Counters + Search functionality ---
function updateCounters() {
  const active    = projects.filter(p => p.status !== 'completed' && p.status !== 'abandoned').length;
  const completed = projects.filter(p => p.status === 'completed').length;
  const pastDue   = 0; // define later
  document.getElementById('activeCounter').querySelector('h2').textContent = active;
  document.getElementById('completedCounter').querySelector('h2').textContent = completed;
  document.getElementById('pastDueCounter').querySelector('h2').textContent = pastDue;
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    const term = input.value.toLowerCase();
    const filtered = projects.filter(p => p.name.toLowerCase().includes(term));
    renderProjects(filtered);
  });
}

// Call them on load
updateCounters();
setupSearch();

