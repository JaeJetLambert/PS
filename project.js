// --- Load project name from query string ---
const params = new URLSearchParams(window.location.search);
const projectName = params.get("name");

// Dummy data for now (later this will come from storage)
const projects = [
  { name: "Smith", designer: "Alice", startDate: "2025-09-01" },
  { name: "Bach", designer: "Bob", startDate: "2025-09-15" }
];

// Find the project
const project = projects.find(p => p.name === projectName);

const title = document.getElementById("projectTitle");
const info = document.getElementById("projectInfo");

if (project) {
  title.textContent = project.name;
  info.innerHTML = `
    <p><strong>Designer:</strong> ${project.designer}</p>
    <p><strong>Start Date:</strong> ${project.startDate}</p>
  `;
} else {
  title.textContent = "Project not found";
}

// Hook up the buttons
document.getElementById("completeBtn").addEventListener("click", () => {
  alert("Marked as Completed (placeholder)");
});

document.getElementById("abandonBtn").addEventListener("click", () => {
  const reason = prompt("Why is this project abandoned?");
  if (reason) alert("Abandoned with reason: " + reason);
});

