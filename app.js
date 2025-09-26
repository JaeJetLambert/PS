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
