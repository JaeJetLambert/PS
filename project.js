// ===============================
// project.js — Detail page logic
// ===============================

// Supabase client (injected by project.html)
const db = window.supabase;

// Read the `name` query param (e.g., project.html?name=Smith)
const params = new URLSearchParams(location.search);
const projectName = params.get('name');

// Cache DOM elements we update frequently
const title = document.getElementById('projectTitle');
const info  = document.getElementById('projectInfo');
const btnDone = document.getElementById('completeBtn');
const btnAbandon = document.getElementById('abandonBtn');

// The project record we load from the DB
let project = null;

// --- Data access ---------------------------------------------------
// Fetch a single project by *name* (current URL contract).
// NOTE: Names must be unique in your schema for this to be reliable.
async function fetchProject() {
  const { data, error } = await db
    .from('projects')
    .select('*')
    .eq('name', projectName)
    .limit(1);
  if (error) throw error;
  if (!data || !data.length) return null;

  const r = data[0];
  return {
    id: r.id,
    name: r.name,
    designer: r.designer,
    type: r.type,
    startDate: r.start_date ?? '',
    status: r.status ?? 'active',
    abandon_reason: r.abandon_reason ?? null,
    created_at: r.created_at
  };
}

// --- Rendering -----------------------------------------------------
// Paint the info panel based on current `project` state.
function renderInfo() {
  if (!project) {
    title.textContent = 'Project not found';
    info.textContent = '';
    btnDone.disabled = true;
    btnAbandon.disabled = true;
    return;
  }
  title.textContent = project.name;
  info.innerHTML = `
    <p><strong>Designer:</strong> ${project.designer || ''}</p>
    <p><strong>Start Date:</strong> ${project.startDate || ''}</p>
    <p><strong>Status:</strong> ${project.status}</p>
    ${project.abandon_reason ? `<p><strong>Reason:</strong> ${project.abandon_reason}</p>` : ''}
  `;
}

// --- Mutations -----------------------------------------------------
// Mark as completed (DB update by row id), then re-render.
async function markCompleted() {
  if (!project) return;
  const { error } = await db.from('projects')
    .update({ status: 'completed' })
    .eq('id', project.id);
  if (error) { alert('Update failed: ' + error.message); return; }
  project.status = 'completed';
  renderInfo();
  alert(`${project.name} marked completed.`);
}

// Mark as abandoned with a reason; update DB; re-render.
async function markAbandoned() {
  if (!project) return;
  const reason = prompt('Why is this project abandoned?');
  if (reason === null) return; // user cancelled
  const { error } = await db.from('projects')
    .update({ status: 'abandoned', abandon_reason: reason })
    .eq('id', project.id);
  if (error) { alert('Update failed: ' + error.message); return; }
  project.status = 'abandoned';
  project.abandon_reason = reason;
  renderInfo();
  alert(`Abandoned with reason: ${reason}`);
}

// Wire up buttons
btnDone.addEventListener('click', markCompleted);
btnAbandon.addEventListener('click', markAbandoned);

// Initial load
(async function init() {
  try {
    project = await fetchProject();
  } catch (e) {
    console.error(e);
    project = null;
  }
  renderInfo();
})();