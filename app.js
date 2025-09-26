// Temporary demo data so you can see layout
const projects = [
  {
    name: "Alpha Project",
    designer: "Sarah",
    currentTasks: ["Initial Contact", "Send Process Document"],
    nextTasks: ["Schedule Initial Consultation"]
  },
  {
    name: "Beta Build",
    designer: "Darby",
    currentTasks: ["Prepare Client Dossier"],
    nextTasks: ["Have Initial Consultation"]
  }
];

function renderDashboard() {
  // Update counters
  document.getElementById('activeCount').textContent = projects.length;
  document.getElementById('completedCount').textContent = 0; // placeholder
  document.getElementById('overdueCount').textContent = 0; // placeholder

  // Designer dropdown
  const designers = [...new Set(projects.map(p => p.designer))].sort();
  const dd = document.getElementById('designer-dropdown');
  dd.innerHTML = designers.map(d => `<a href="#">${d}</a>`).join('');

  // Project cards
  const grid = document.getElementById('projectGrid');
  grid.innerHTML = projects
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(p => `
      <div class="card">
        <h3>${p.name}</h3>
        <p><strong>Designer:</strong> ${p.designer}</p>
        <p><strong>Current:</strong> ${p.currentTasks.join(', ')}</p>
        <p><strong>Next:</strong> ${p.nextTasks.join(', ')}</p>
      </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', renderDashboard);

