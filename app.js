// Simple hard-coded projects for testing
const projects = [
  { name: "Smith",   designer: "Alice",   startDate: "2025-09-01" },
  { name: "Bach",    designer: "Bob",     startDate: "2025-09-15" }
];

function renderProjects() {
  const grid = document.querySelector(".project-grid");
  grid.innerHTML = projects.map(p => `
    <div style="
      background:#fff;
      border:1px solid #ccc;
      border-radius:6px;
      padding:1rem;
      box-shadow:0 2px 4px rgba(0,0,0,0.1);
      ">
      <h3>${p.name}</h3>
      <p><strong>Designer:</strong> ${p.designer}</p>
      <p><strong>Start Date:</strong> ${p.startDate}</p>
    </div>
  `).join("");
}

renderProjects();
