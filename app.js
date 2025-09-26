// --- State + persistence ---
const STORAGE_KEY = "projects";

function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  // Defaults if nothing in storage
  return [
    { name: "Smith", designer: "Alice", startDate: "2025-09-01", status: "active" },
    { name: "Bach",  designer: "Bob",   startDate: "2025-09-15", status: "active" }
  ];
}

let projects = loadProjects();

function saveProjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
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

renderProjects();
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

form.addEventListener("submit", e => {
  e.preventDefault();
  const newProj = {
  name: document.getElementById("projectNameInput").value.trim(),
  designer: document.getElementById("designerSelect").value,
  type: document.getElementById("projectType").value,
  startDate: document.getElementById("startDateInput").value,
  status: "active"
  };
  if (!newProj.name) return;

  projects.push(newProj);
  saveProjects();
  renderProjects();
  updateCounters();        // if you already have this function
  modal.style.display = "none";
  form.reset();
});

// If this is the detail page, call it
if (document.querySelector("#project-detail")) {
  loadProjectDetail();
}

// --- Counters + Search functionality ---
function updateCounters() {
  const active = projects.filter(p => p.status !== "completed" && p.status !== "abandoned").length;
  const completed = projects.filter(p => p.status === "completed").length;

  // Define "past due" however you want later; placeholder 0 for now:
  const pastDue = 0;

  document.getElementById("activeCounter").querySelector("h2").textContent = active;
  document.getElementById("completedCounter").querySelector("h2").textContent = completed;
  document.getElementById("pastDueCounter").querySelector("h2").textContent = pastDue;
}

function setupSearch() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", () => {
    const term = input.value.toLowerCase();
    const filtered = projects.filter(p => p.name.toLowerCase().includes(term));
    renderProjects(filtered); // reuse the same clickable card template
  });
}

// Call them on load
updateCounters();
setupSearch();

