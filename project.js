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
const deleteBtn = document.getElementById('deleteBtn');

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

// ==== Missing-task backfill (ensures every project has all template tasks) ====

function computeDefaultAssigneesForProject(role, projectRow) {
  if (!role) return [];
  const parts = String(role).split(/[,+]/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let p of parts) {
    p = p.replace(/\.$/, ''); // "Admin." -> "Admin"
    const low = p.toLowerCase();
    if (low === 'designer') {
      out.push(projectRow.designer || 'Designer');
    } else if (low === 'project manager' || low === 'pm') {
      out.push('PM');
    } else if (low === 'admin') {
      out.push('Admin');
    } else {
      out.push(p);
    }
  }
  // de-dupe, preserve order
  return Array.from(new Set(out.filter(Boolean)));
}

async function ensureMissingTemplateTasks(projectRow) {
  const db = window.supabase;
  if (!db || !projectRow?.id) return;

  // 1) Load all templates (ordered)
  const { data: tmpl, error: e0 } = await db
    .from('task_templates')
    .select('id, title, role, position, created_at')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (e0) { console.error('Template load failed:', e0); return; }

  // 2) Existing tasks for this project
  const { data: existing, error: e1 } = await db
    .from('tasks')
    .select('id, template_id, title')
    .eq('project_id', projectRow.id);
  if (e1) { console.error('Existing tasks load failed:', e1); return; }

  const haveByTemplate = new Set((existing || [])
    .map(r => r.template_id)
    .filter(Boolean));

  const toInsert = [];
  for (const t of (tmpl || [])) {
    // If a row for this template id already exists, skip
    if (t.id && haveByTemplate.has(t.id)) continue;

    // Fallback: avoid duplicate by title if template_id linkage missing
    const titleExists = (existing || []).some(x => (x.title || '').trim() === (t.title || '').trim());
    if (titleExists) continue;

    const people = computeDefaultAssigneesForProject(t.role, projectRow);
    toInsert.push({
      project_id: projectRow.id,
      template_id: t.id,
      title: t.title,
      role: t.role,
      assignee: people[0] || null, // legacy single field kept in sync
      assignees: people,           // multi-assign
      status: 'todo',
      due_date: null,
      notes: null,
      position: t.position ?? null // keep your stable ordering
    });
  }

  if (!toInsert.length) return;

  // 3) Insert. If "position" is IDENTITY ALWAYS in your DB, retry without it.
  const attempt = await db.from('tasks').insert(toInsert);
  if (attempt.error) {
    const msg = String(attempt.error.message || '');
    if (/identity|generated always/i.test(msg)) {
      const fallback = toInsert.map(({ position, ...rest }) => rest);
      const retry = await db.from('tasks').insert(fallback);
      if (retry.error) console.error('Insert retry without position failed:', retry.error);
    } else {
      console.error('Insert failed:', attempt.error);
    }
  }
}

// --- Rendering -----------------------------------------------------
function renderInfo() {
  if (!project) {
    title.textContent = 'Project not found';
    info.textContent = '';
    if (btnDone) btnDone.disabled = true;
    if (btnAbandon) btnAbandon.disabled = true;
    if (reactivateBtn) reactivateBtn.style.display = 'none';
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

  const isCompleted = project.status === 'completed';
  const isAbandoned = project.status === 'abandoned';

  if (btnDone) btnDone.disabled = isCompleted || isAbandoned;
  if (btnAbandon) btnAbandon.disabled = isCompleted || isAbandoned;

  if (reactivateBtn) {
    reactivateBtn.style.display = isAbandoned ? 'inline-block' : 'none';
    reactivateBtn.disabled = !isAbandoned;
  }
}

// --- Complete modal helpers ---------------------------------------
function openCompleteModal() {
  // Leave blank unless the user sets it
  completionDateInput.value = '';
  completionNotesInput.value = '';
  completeModal.style.display = 'block';
}
function closeComplete() { completeModal.style.display = 'none'; }

if (closeCompleteModal) {
  closeCompleteModal.addEventListener('click', closeComplete);
  window.addEventListener('click', (e) => {
    if (e.target === completeModal) closeComplete();
  });
}

// --- Abandon modal helpers ----------------------------------------
function openAbandonModal() {
  abandonNotesInput.value = '';
  abandonModal.style.display = 'block';
}
function closeAbandon() { abandonModal.style.display = 'none'; }

if (closeAbandonModal) {
  closeAbandonModal.addEventListener('click', closeAbandon);
  window.addEventListener('click', (e) => {
    if (e.target === abandonModal) closeAbandon();
  });
}

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
btnDone?.addEventListener('click', () => {
  if (!project) return;
  openCompleteModal();
});

// Complete modal → Done (save)
completeConfirmBtn?.addEventListener('click', async () => {
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
btnAbandon?.addEventListener('click', () => {
  if (!project) return;
  if (project.status === 'completed' || project.status === 'abandoned') return;
  openAbandonModal();
});

// Abandon modal → Done (save; notes required)
abandonConfirmBtn?.addEventListener('click', async () => {
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
reactivateBtn?.addEventListener('click', async () => {
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

// --- Layout helper for pinned header + scrollable task list -------
(function(){
  function sizeTasksScroll(){
    const header = document.querySelector('.dashboard-header');
    const topFixed = document.getElementById('projectTop');
    const scroller = document.getElementById('tasksScroll');
    if (!scroller) return;

    const headerH = header ? header.offsetHeight : 0;

    // Pin the "top" block directly under the sticky header
    if (topFixed) topFixed.style.top = headerH + 'px';

    // Compute how tall the top block is (after laying out its content)
    const topH = topFixed ? topFixed.offsetHeight : 0;

    // Fill the rest of the viewport with the task scroller
    scroller.style.height = `calc(100vh - ${headerH + topH}px)`;
  }

  // Recompute on resize; tasks.js will also trigger after render
  window.addEventListener('resize', sizeTasksScroll);
  document.addEventListener('projectLoaded', () => {
    setTimeout(sizeTasksScroll, 0);
  });
})();

// Delete project (double-confirm by typing the exact name)
deleteBtn?.addEventListener('click', async () => {
  if (!project) return;

  const ok = confirm('This will permanently delete the project, all tasks, and dependencies. Continue?');
  if (!ok) return;

  const typed = prompt(`Type the project name exactly to confirm deletion:\n\n${project.name}`);
  if (!typed || typed.trim() !== (project.name || '').trim()) {
    alert('Name did not match. Deletion canceled.');
    return;
  }

  deleteBtn.disabled = true;
  const prev = deleteBtn.textContent;
  deleteBtn.textContent = 'Deleting…';

  try {
    await deleteProjectAndChildren(project.id);
    alert('Project deleted.');
    window.location.href = 'index.html';
  } catch (err) {
    console.error(err);
    alert('Delete failed: ' + (err?.message || err));
    deleteBtn.disabled = false;
    deleteBtn.textContent = prev;
  }
});

// Permanently delete a project, its tasks, and related dependencies
async function deleteProjectAndChildren(projectId) {
  // 1) Find all task ids in this project
  const { data: tasks, error: e0 } = await db
    .from('tasks')
    .select('id')
    .eq('project_id', projectId);
  if (e0) throw e0;

  const ids = (tasks || []).map(t => t.id);

  // 2) Delete dependencies that reference those tasks (both sides)
  if (ids.length) {
    const { error: e1 } = await db
      .from('task_dependencies')
      .delete()
      .in('task_id', ids);
    if (e1) throw e1;

    const { error: e2 } = await db
      .from('task_dependencies')
      .delete()
      .in('anchor_task_id', ids);
    if (e2) throw e2;

    // 3) Delete all tasks in this project
    const { error: e3 } = await db
      .from('tasks')
      .delete()
      .eq('project_id', projectId);
    if (e3) throw e3;
  }

  // 4) Delete the project itself
  const { error: e4 } = await db
    .from('projects')
    .delete()
    .eq('id', projectId);
  if (e4) throw e4;
}

// --- Initial load --------------------------------------------------
(async function init(){
  try {
    project = await fetchProject();
  } catch (e) {
    console.error(e);
    project = null;
  }

  renderInfo();

  // Backfill any missing template tasks (e.g., “Initial Contact”)
  try {
    await ensureMissingTemplateTasks(project);
  } catch (e) {
    console.error('Backfill tasks failed:', e);
  }

  // Let tasks.js boot the task table UI with a complete set
  document.dispatchEvent(new CustomEvent('projectLoaded', { detail: project }));
})();