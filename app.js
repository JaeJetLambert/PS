// Demo data
cconst projects = [
  {
    name: "Project Smith",
    designer: "Smith",
    tasks: [
      { name: "UI Design", status: "In Progress" },
      { name: "Backend API", status: "Not Started" },
      { name: "Testing", status: "Not Started" }
    ]
  },
  {
    name: "Project Bach",
    designer: "Bach",
    tasks: [
      { name: "Research", status: "Completed" },
      { name: "Prototype", status: "In Progress" },
      { name: "Client Review", status: "Not Started" }
    ]
  }
];

const grid = document.getElementById('projectGrid');
const activeCount = document.getElementById('activeCount');
const completedCount = document.getElementById('completedCount');
const overdueCount = document.getElementById('overdueCount');
const designerFilter = document.getElementById('designerFilter');
const searchInput = document.getElementById('searchInput');

// Render counters
function updateCounters() {
  const active = projects.filter(p => !p.completed).length;
  const completed = projects.filter(p => p.completed).length;
  const overdue = projects.filter(p => p.overdue).length;
  activeCount.textContent = active;
  completedCount.textContent = completed;
  overdueCount.textContent = overdue;
}

// Render projects
function renderProjects(filter = "", designer = "") {
  grid.innerHTML = "";
  projects
    .filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))
    .filter(p => !designer || p.designer === designer)
    .forEach(p => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${p.name}</h3>
        <p><strong>Designer:</strong> ${p.designer}</p>
        <ul>
          ${p.tasks.map(t => `<li>${t.title} – ${t.status}</li>`).join("")}
        </ul>
      `;
      grid.appendChild(card);
    });
}

// Populate designer filter
function populateDesignerFilter() {
  const designers = [...new Set(projects.map(p => p.designer))];
  designerFilter.innerHTML = designers
    .map(d => `<button onclick="renderProjects(searchInput.value, '${d}')">${d}</button>`)
    .join("");
}

// Event listeners
searchInput.addEventListener('input', () => {
  renderProjects(searchInput.value);
});

document.getElementById('newProjectBtn').addEventListener('click', () => {
  const name = prompt("Enter project name:");
  if (!name) return;
  projects.push({
    name,
    designer: "Unassigned",
    tasks: [],
    completed: false,
    overdue: false
  });
  updateCounters();
  populateDesignerFilter();
  renderProjects(searchInput.value);
});

// Initial render
updateCounters();
populateDesignerFilter();
renderProjects();
function renderProjects() {
  // Find the project grid container
  const grid = document.querySelector(".project-grid");

  // Clear old content (so it doesn’t duplicate on refresh)
  grid.innerHTML = "";

  // Sort projects alphabetically by name
  projects
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(project => {
      // Get the first couple of tasks to preview
      const nextTasks = project.tasks
        .slice(0, 2)
        .map(t => `<li>${t.name} – <strong>${t.status}</strong></li>`)
        .join("");

      // Build the card
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <h3>${project.name}</h3>
        <p><strong>Designer:</strong> ${project.designer}</p>
        <ul>${nextTasks}</ul>
        <button class="view-btn" data-name="${project.name}">View Details</button>
      `;

      // Add to grid
      grid.appendChild(card);
    });
}
renderProjects();
