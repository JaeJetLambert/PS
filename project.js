const urlParams = new URLSearchParams(window.location.search);
const index = urlParams.get('project');

// Same data as in app.js for now
const projects = [
  { name: "Smith", designer: "Alice", startDate: "2025-09-01" },
  { name: "Bach",  designer: "Bob",   startDate: "2025-09-15" }
];

if (index !== null && projects[index]) {
  const p = projects[index];
  document.getElementById('project-name').textContent = p.name;
  document.getElementById('designer').textContent = p.designer;
  document.getElementById('startDate').textContent = p.startDate;
}
