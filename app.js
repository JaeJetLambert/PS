// Temporary sample data
const projects = [
  { name: "Alpha Project", designer: "Sarah", status: "Active" },
  { name: "Beta Project", designer: "Darby", status: "Completed" },
  { name: "Gamma Project", designer: "Adaline", status: "Active" }
];

// Populate dashboard counts
function updateCounters() {
  const active = projects.filter(p => p.status === "Active").length;
  const completedThisYear = projects.filter(p => p.status === "Completed").length;
  const overdue = 0; // placeholder
  document.getElementById('activeCount').textContent = active;
  document.getElementById('completedCount').textContent = completedThisYear;
  document.getElementById('overdueCount').textContent = overdue;
}

// Render project cards
function renderProjects(list) {
  const grid = document.getElementById('projectGrid');
  grid.innerHTML = '';
  list.sort((a,b)=>a.name.localeCompare(b.name))
      .forEach(p => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
          <h3>${p.name}</h3>
          <p>Designer: ${p.designer}</p>
          <p>Status: ${p.status}</p>
        `;
        grid.appendChild(card);
      });
}

// Populate Designer dropdown
function populateDesignerDropdown() {
  const dropdown = document.getElementById('designerDropdown');
  const designers = [...new Set(projects.map(p => p.designer))];
  dropdown.innerHTML = '';
  designers.forEach(d => {
    const btn = document.createElement('button');
    btn.textContent = d;
    btn.onclick = () => renderProjects(projects.filter(p=>p.designer===d));
    dropdown.appendChild(btn);
  });
}

// Search
document.getElementById('searchInput').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  renderProjects(projects.filter(p => p.name.toLowerCase().includes(term)));
});

// Initial render
updateCounters();
renderProjects(projects);
populateDesignerDropdown();
