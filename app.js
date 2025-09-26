// Example projects (static for now)
const projects = [
  { name: "Smith", designer: "Alice", startDate: "2025-09-01" },
  { name: "Bach",  designer: "Bob",   startDate: "2025-09-15" }
];

function renderProjects() {
  const grid = document.querySelector(".project-grid");
  grid.innerHTML = projects.map(p => `
    <div class="project-card">
      <h3>${p.name}</h3>
      <p><strong>Designer:</strong> ${p.designer}</p>
      <p><strong>Start Date:</strong> ${p.startDate}</p>
    </div>
  `).join("");
}

renderProjects();
// --- existing dashboard code remains above ---


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
