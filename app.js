// Load projects from localStorage or start with defaults
let projects = JSON.parse(localStorage.getItem("projects")) || [];
  { name: "Smith", designer: "Alice", startDate: "2025-09-01" },
  { name: "Bach",  designer: "Bob",   startDate: "2025-09-15" }
];

// Save to localStorage anytime the list changes
function saveProjects() {
  localStorage.setItem("projects", JSON.stringify(projects));
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
    startDate: document.getElementById("startDateInput").value
  };
  if (!newProj.name) return;

  projects.push(newProj);
  saveProjects();
  renderProjects();
  updateCounters();        // if you already have this function
  modal.style.display = "none";
  form.reset();
});


// --- Project Detail Page Logic (NEW) ---
function loadProjectDetail() {
  const projectName = new URLSearchParams(window.location.search).get("name");
  const project = projects.find(p => p.name === projectName);
  if (!project) return;

  const container = document.querySelector("#project-detail");
  container.innerHTML = `
    <h2>${project.name}</h2>
    <p><strong>Designer:</strong> ${project.designer}</p>
    <p><strong>Start Date:</strong> ${project.startDate}</p>
    <button id="mark-complete">Mark Completed</button>
  `;

  document.querySelector("#mark-complete").addEventListener("click", () => {
    alert(`${project.name} marked completed!`);
  });
}

// If this is the detail page, call it
if (document.querySelector("#project-detail")) {
  loadProjectDetail();
}

// --- Counters + Search functionality ---
function updateCounters() {
  const active = projects.length; // placeholder: all are active
  const completed = 0;            // placeholder: none completed yet
  const pastDue = 0;               // placeholder
  document.getElementById("activeCounter").querySelector("h2").textContent = active;
  document.getElementById("completedCounter").querySelector("h2").textContent = completed;
  document.getElementById("pastDueCounter").querySelector("h2").textContent = pastDue;
}

function setupSearch() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", () => {
   const term = input.value.toLowerCase();
    const grid = document.getElementById("projectGrid");
    grid.innerHTML = projects
      .filter(p => p.name.toLowerCase().includes(term))
      .map(p => `
        <div class="project-card">
          <h3>${p.name}</h3>
          <p><strong>Designer:</strong> ${p.designer}</p>
          <p><strong>Start Date:</strong> ${p.startDate}</p>
        </div>
      `).join("");
  });
}

// Call them on load
updateCounters();
setupSearch();

