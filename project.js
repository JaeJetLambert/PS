const STORAGE_KEY = "projects";
function getProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}
function setProjects(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const params = new URLSearchParams(location.search);
const projectName = params.get("name");

let projects = getProjects();
let project = projects.find(p => p.name === projectName);

const title = document.getElementById("projectTitle");
const info  = document.getElementById("projectInfo");

function renderInfo() {
  if (!project) {
    title.textContent = "Project not found";
    info.textContent = "";
    return;
  }
  title.textContent = project.name;
  info.innerHTML = `
    <p><strong>Designer:</strong> ${project.designer}</p>
    <p><strong>Start Date:</strong> ${project.startDate}</p>
    <p><strong>Status:</strong> ${project.status ?? "active"}</p>
  `;
}
renderInfo();

document.getElementById("completeBtn").addEventListener("click", () => {
  if (!project) return;
  project.status = "completed";
  setProjects(projects);
  renderInfo();
  alert(`${project.name} marked completed.`);
});

document.getElementById("abandonBtn").addEventListener("click", () => {
  if (!project) return;
  const reason = prompt("Why is this project abandoned?");
  if (reason !== null) {
    project.status = "abandoned";
    project.abandon_reason = reason;
    setProjects(projects);
    renderInfo();
    alert(`Abandoned with reason: ${reason}`);
  }
});
