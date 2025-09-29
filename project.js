// ===============================
// project.js — Detail page logic (with Complete modal)
// ===============================

// Supabase client (created in project.html right above this script)
const db = window.supabase;

// Read the `name` query param (e.g., project.html?name=Smith)
const params = new URLSearchParams(location.search);
const projectName = params.get('name');

// Cache DOM elements
const title = document.getElementById('projectTitle');
const info  = document.getElementById('projectInfo');
const btnDone = document.getElementById('completeBtn');
const btnAbandon = document.getElementById('abandonBtn');

// Complete modal elements
const completeModal = document.getElementById('completeModal');
const closeCompleteModal = document.getElementById('closeCompleteModal');
const completionNotesInput = document.getElementById('completionNotesInput');
const completionDateInput = document.getElementById('completionDateInput');
const completeConfirmBtn = document.getElementById('completeConfirmBtn');

let project = null;

// --- Data access ---------------------------------------------------
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
    completed_at: r.completed_at ?? null,        // <-- new field
    completion_notes: r.completion_notes ?? null // <-- new field
  };
}

// --- Rendering -----------------------------------------------------
function renderInfo() {
  if (!project) {
    title.textContent = 'Project not found';
    info.textContent = '';
    btnDone.disabled = true;
    btnAbandon.disabled = true;
    return;
  }

  const completedBadge = project.status === 'completed'
    ? `<p><strong>Completed:</strong> ${
        project.completed_at ? new Date(project.completed_at).toLocaleDateString() : 'Today'
      }</p>`
    : '';

  const notesBlock = project.completion_notes
    ? `<p><strong>Completion Notes:</strong> ${project.completion_notes}</p>`
    : '';

  title.textContent = project.name;
  info.innerHTML = `
    <p><strong>Designer:</strong> ${project.designer || ''}</p>
    <p><strong>Start Date:</strong> ${project.startDate || ''}</p>
    <p><strong>Status:</strong> ${project.status}</p>
    ${completedBadge}
    ${notesBlock}
  `;

  const isClosed = project.status === 'completed' || project.status === 'abandoned';
  btnDone.disabled = isClosed;
  btnAbandon.disabled = isClosed;
}

// --- Modal helpers -------------------------------------------------
function openCompleteModal() {
  // default date to today (YYYY-MM-DD)
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  completionDateInput.value = `${yyyy}-${mm}-${dd}`;
  completionNotesInput.value = '';
  completeModal.style.display = 'block';
}
function closeComplete() { completeModal.style.display = 'none'; }

closeCompleteModal.addEventListener('click', closeComplete);
window.addEventListener('click', (e) => {
  if (e.target === completeModal) closeComplete();
});

// --- Event wiring --------------------------------------------------
// 1) Clicking "Mark as Completed" opens the modal
btnDone.addEventListener('click', () => {
  if (!project) return;
  openCompleteModal();
});

// 2) Clicking "Done" persists status + date + optional notes
completeConfirmBtn.addEventListener('click', async () => {
  if (!project) return;

  // prevent double-submit
  completeConfirmBtn.disabled = true;
  const oldLabel = completeConfirmBtn.textContent;
  completeConfirmBtn.textContent = 'Saving...';

  // Collect form values
  const notes = completionNotesInput.value.trim() || null;
  const dateStr = completionDateInput.value; // 'YYYY-MM-DD' or ''
  const chosenIso = dateStr
    ? new Date(`${dateStr}T00:00:00`).toISOString()
    : new Date().toISOString();

  const { error } = await db.from('projects')
    .update({ status: 'completed', completed_at: chosenIso, completion_notes: notes })
    .eq('id', project.id);

  if (error) {
    alert('Update failed: ' + error.message);
    completeConfirmBtn.disabled = false;
    completeConfirmBtn.textContent = oldLabel;
    return;
  }

  // Update local state + UI
  project.status = 'completed';
  project.completed_at = chosenIso;
  project.completion_notes = notes;

  renderInfo();
  closeComplete();
  completeConfirmBtn.disabled = false;
  completeConfirmBtn.textContent = oldLabel;
  alert(`${project.name} marked completed.`);
});

// (Abandon behavior unchanged for now; we can modal-ize it later if you want)
btnAbandon.addEventListener('click', async () => {
  if (!project) return;
  const reason = prompt('Why is this project abandoned?'); // optional
  if (reason === null) return;

  const { error } = await db.from('projects')
    .update({ status: 'abandoned', abandon_reason: reason })
    .eq('id', project.id);
  if (error) { alert('Update failed: ' + error.message); return; }

  project.status = 'abandoned';
  project.abandon_reason = reason;
  renderInfo();
  alert(`Abandoned with reason: ${reason}`);
});

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