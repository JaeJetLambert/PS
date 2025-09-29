// ===============================
// project.js — Detail page logic (Complete + Abandon + Reactivate)
// Now reads ?id=<uuid> first, falls back to ?name=<string>
// ===============================

// Supabase client (created in project.html above this script)
const db = window.supabase;

// --- URL params: prefer id, fallback to name ----------------------
const params   = new URLSearchParams(location.search);
const projId   = params.get('id');
const projName = params.get('name'); // fallback

// Cache DOM elements
const title = document.getElementById('projectTitle');
const info  = document.getElementById('projectInfo');
const btnDone = document.getElementById('completeBtn');
const btnAbandon = document.getElementById('abandonBtn');
const reactivateBtn = document.getElementById('reactivateBtn');
const backBtn = document.getElementById('backBtn');

// Complete modal elements
const completeModal = document.getElementById('completeModal');
const closeCompleteModal = document.getElementById('closeCompleteModal');
const completionNotesInput = document.getElementById('completionNotesInput');
const completionDateInput = document.getElementById('completionDateInput');
const completeConfirmBtn = document.getElementById('completeConfirmBtn');

// Abandon modal elements
const abandonModal = document.getElementById('abandonModal');
const closeAbandonModal = document.getElementById('closeAbandonModal');
const abandonNotesInput = document.getElementById('abandonNotesInput');
const abandonConfirmBtn = document.getElementById('abandonConfirmBtn');

let project = null;

// --- Data access ---------------------------------------------------
async function fetchProject() {
  if (!projId && !projName) return null;

  let q = db.from('projects').select('*').limit(1);

  if (projId) {
    q = q.eq('id', projId);
  } else {
    // Fallback to name; pick the most recently created if duplicates exist
    q = q.eq('name', projName).order('created_at', { ascending: false });
  }

  const { data, error } = await q;
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
    abandoned_at: r.abandoned_at ?? null,
    completed_at: r.completed_at ?? null,
    completion_notes: r.completion_notes ?? null,
    created_at: r.created_at
  };
}

// --- Rendering -----------------------------------------------------
function renderInfo() {
  if (!project) {
    title.textContent = 'Project not found';
    info.textContent = '';
    btnDone.disabled = true;
    btnAbandon.disabled = true;
    reactivateBtn.style.display = 'none';
    return;
  }

  const completedBadge = project.status === 'completed'
    ? `<p><strong>Completed:</strong> ${
        project.completed_at ? new Date(project.completed_at).toLocaleDateString() : 'Today'
      }</p>`
    : '';

  const abandonedBadge = project.status === 'abandoned'
    ? `<p><strong>Abandoned:</strong> ${
        project.abandoned_at ? new Date(project.abandoned_at).toLocaleDateString() : 'Today'
      }</p>`
    : '';

  const notesBlocks = [
    project.completion_notes ? `<p><strong>Completion Notes:</strong> ${project.completion_notes}</p>` : '',
    project.abandon_reason   ? `<p><strong>Abandon Notes:</strong> ${project.abandon_reason}</p>`       : ''
  ].join('');

  title.textContent = project.name;
  info.innerHTML = `
    <p><strong>Designer:</strong> ${project.designer || ''}</p>
    <p><strong>Start Date:</strong> ${project.startDate || ''}</p>
    <p><strong>Status:</strong> ${project.status}</p>
    ${completedBadge}
    ${abandonedBadge}
    ${notesBlocks}
  `;
  // ^^^ FIXED: the template string properly closes with a backtick above

  const isCompleted = project.status === 'completed';
  const isAbandoned = project.status === 'abandoned';

  btnDone.disabled = isCompleted || isAbandoned;
  btnAbandon.disabled = isCompleted || isAbandoned;

  reactivateBtn.style.display = isAbandoned ? 'inline-block' : 'none';
  reactivateBtn.disabled = !isAbandoned;
}

// --- Complete modal helpers ---------------------------------------
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

// --- Abandon modal helpers ----------------------------------------
function openAbandonModal() {
  abandonNotesInput.value = '';
  abandonModal.style.display = 'block';
}
function closeAbandon() { abandonModal.style.display = 'none'; }

closeAbandonModal.addEventListener('click', closeAbandon);
window.addEventListener('click', (e) => {
  if (e.target === abandonModal) closeAbandon();
});

// --- Event wiring --------------------------------------------------

// Back button: go to previous page, or Dashboard if no history
backBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = 'index.html';
  }
});

// Complete → open modal
btnDone.addEventListener('click', () => {
  if (!project) return;
  openCompleteModal();
});

// Complete modal → Done (save)
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

// Abandon → open modal
btnAbandon.addEventListener('click', () => {
  if (!project) return;
  if (project.status === 'completed' || project.status === 'abandoned') return;
  openAbandonModal();
});

// Abandon modal → Done (save; notes required)
abandonConfirmBtn.addEventListener('click', async () => {
  if (!project) return;

  const notes = abandonNotesInput.value.trim();
  if (!notes) {
    alert('Please enter who abandoned and why.');
    return;
  }

  // prevent double-submit
  abandonConfirmBtn.disabled = true;
  const old = abandonConfirmBtn.textContent;
  abandonConfirmBtn.textContent = 'Saving...';

  const nowIso = new Date().toISOString();
  const { error } = await db.from('projects')
    .update({ status: 'abandoned', abandon_reason: notes, abandoned_at: nowIso })
    .eq('id', project.id);

  if (error) {
    alert('Update failed: ' + error.message);
    abandonConfirmBtn.disabled = false;
    abandonConfirmBtn.textContent = old;
    return;
  }

  project.status = 'abandoned';
  project.abandon_reason = notes;
  project.abandoned_at = nowIso;

  renderInfo();
  closeAbandon();
  abandonConfirmBtn.disabled = false;
  abandonConfirmBtn.textContent = old;
  alert('Project marked as abandoned.');
});

// Reactivate abandoned → back to active
reactivateBtn.addEventListener('click', async () => {
  if (!project || project.status !== 'abandoned') return;

  const ok = confirm('Reactivate this project back to Active?');
  if (!ok) return;

  const { error } = await db.from('projects')
    .update({
      status: 'active',
      abandon_reason: null,
      abandoned_at: null,
      completed_at: null,
      completion_notes: null
    })
    .eq('id', project.id);

  if (error) { alert('Update failed: ' + error.message); return; }

  project.status = 'active';
  project.abandon_reason = null;
  project.abandoned_at = null;
  project.completed_at = null;
  project.completion_notes = null;

  renderInfo();
  alert('Project reactivated.');
});

// --- Initial load --------------------------------------------------
(async function init() {
  try {
    project = await fetchProject();
  } catch (e) {
    console.error(e);
    project = null;
  }
  renderInfo();
})();