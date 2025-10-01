// ===============================
// tasks.js — per-project tasks UI (auto-seed from template)
// Columns: Assignee | Task | Done | Start | Due | Notes
// - Multi-assign (assignees[]), compact checkbox dropdown
// - Notes auto-grow + debounced autosave
// - Cascading due dates from dependencies
// - Deep-link support: project.html?id=...#task-<taskId>
// ===============================
const TASK_USERS = [
  'Sarah','Darby','Adaline','Designer','Admin','Katie','Jae','PM','Trey',
  'Client','Ellen','Jessica'
];

let _openAssigneeRow = null; // which task row's assignee menu is open

// --- Helpers -------------------------------------------------------
function debounce(fn, delay = 600) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}
function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
function esc(s) {
  return (s ?? '').toString().replace(/[&<>"]/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]
  ));
}

// Map role string to default assignees array (supports comma/plus combos)
function computeDefaultAssignees(role, project) {
  if (!role) return [];
  const parts = role.split(/[,+]/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let p of parts) {
    p = p.replace(/\.$/, ''); // "Admin." -> "Admin"
    const low = p.toLowerCase();
    if (!p) continue;

    if (low.includes('designer')) {
      out.push(project.designer || 'Designer');
    } else if (low === 'admin') {
      out.push('Admin');
    } else if (low === 'project manager' || low === 'pm') {
      out.push('PM');
    } else {
      out.push(p);
    }
  }
  return Array.from(new Set(out.filter(Boolean)));
}

// project.js dispatches this after it loads the project
document.addEventListener('projectLoaded', (ev) => {
  const project = ev.detail;
  initTasksUI(project);
});

async function initTasksUI(project) {
  const db = window.supabase;
  if (!db || !project?.id) return;

  const listEl = document.getElementById('taskList');
  listEl.innerHTML = `
    <div class="info-card" style="padding:0;">
      <table id="tasksTable" style="width:100%; border-collapse:collapse; table-layout:fixed;">
        <thead>
          <tr style="border-bottom:1px solid #e6e8ee;">
            <th style="text-align:left; padding:.6rem; width:180px;">Assignee</th>
            <th style="text-align:left; padding:.6rem; width:220px;">Task</th>
            <th style="text-align:center; padding:.6rem; width:70px;">Done</th>
            <th style="text-align:left; padding:.6rem; width:150px;">Start</th>
            <th style="text-align:left; padding:.6rem; width:150px;">Due</th>
            <th style="text-align:left; padding:.6rem;">Notes</th>
          </tr>
        </thead>
        <tbody id="tasksBody"></tbody>
      </table>
    </div>
    <div id="tasksMsg" style="margin:.5rem 0; opacity:.75;"></div>
  `;

  // Load existing tasks (includes notes)
  let tasks = await loadTasks(db, project.id);

  // If none exist (older projects), auto-seed from the template, then reload
  if (!tasks.length) {
    try {
      await seedFromTemplate(db, project);
      tasks = await loadTasks(db, project.id);
      flash('Task list created from template.');
    } catch (e) {
      console.error('Auto-seed failed:', e);
      flash('Could not create tasks from template. Please try again later.');
    }
  }

  // Ensure stable order (fallback: in case DB ordering changes)
  tasks = (tasks || []).slice().sort((a,b) => {
    const pa = (a.position ?? 999999);
    const pb = (b.position ?? 999999);
    if (pa !== pb) return pa - pb;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  renderTasks(tasks);

  // scroll to a specific task if URL has #task-<id>
  maybeScrollToTaskFromHash();
}

function flash(msg) {
  const el = document.getElementById('tasksMsg');
  if (!el) return;
  el.textContent = msg || '';
  if (msg) setTimeout(() => (el.textContent = ''), 2500);
}

async function loadTasks(db, projectId) {
  const { data, error } = await db
    .from('tasks')
    .select('*, task_dependencies:task_dependencies!task_dependencies_task_id_fkey (anchor_task_id, offset_days)')
    .eq('project_id', projectId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

function maybeScrollToTaskFromHash() {
  const id = (location.hash || '').slice(1); // e.g., "task-123"
  if (!id) return;
  const row = document.getElementById(id);
  if (!row) return;

  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  highlightRow(row);
}

function highlightRow(row) {
  const original = row.style.backgroundColor;
  row.style.backgroundColor = 'rgba(45,106,79,.12)'; // soft green tint
  row.style.transition = 'background-color .6s ease';
  setTimeout(() => { row.style.backgroundColor = original || ''; }, 1600);
}

// if user clicks another deep link while on the page
window.addEventListener('hashchange', () => {
  maybeScrollToTaskFromHash();
});

// --- Render --------------------------------------------------------
function renderTasks(tasks) {
  const body = document.getElementById('tasksBody');
  body.innerHTML = tasks.map(t => {
    const selected = Array.isArray(t.assignees)
      ? t.assignees
      : (t.assignee ? [t.assignee] : []);
    const label = selected.length ? selected.join(', ') : '— Select —';

    return `
      <tr id="task-${t.id}" data-id="${t.id}" style="border-bottom:1px solid #f0f2f6;">
        <!-- Assignee -->
        <td class="assignee-cell" style="padding:.5rem .6rem;">
          <div class="assignee-box" data-action="assignee-toggle" style="display:flex; align-items:center; gap:.35rem; cursor:pointer;">
            <span class="assignee-label">${esc(label)}</span>
            <span class="caret">▾</span>
          </div>
          <div class="assignee-menu hidden" style="display:none; position:absolute; z-index:5; background:#fff; border:1px solid #d0d5dd; border-radius:8px; padding:.5rem; box-shadow:0 8px 24px rgba(0,0,0,.08);">
            <div class="assignee-list" style="display:grid; grid-template-columns:repeat(2,minmax(120px,1fr)); gap:.25rem .75rem; max-height:220px; overflow:auto; padding:.25rem .25rem .5rem;">
              ${TASK_USERS.map(u => `
                <label style="display:flex; align-items:center; gap:.4rem; font-size:.95rem;">
                  <input type="checkbox" value="${u}" ${selected.includes(u) ? 'checked' : ''}/>
                  ${esc(u)}
                </label>
              `).join('')}
            </div>
            <div class="assignee-actions" style="display:flex; gap:.5rem; justify-content:flex-end;">
              <button type="button" data-action="assignee-apply" class="save-btn" style="padding:.35rem .7rem;">Apply</button>
              <button type="button" data-action="assignee-clear" class="btn" style="padding:.35rem .7rem; border:1px solid #d0d5dd; background:#fff; border-radius:6px; cursor:pointer;">Clear</button>
            </div>
          </div>
        </td>

        <!-- Task (smaller) -->
        <td style="padding:.5rem .6rem;">${esc(t.title)}</td>

        <!-- Done -->
        <td style="padding:.5rem .6rem; text-align:center;">
          <input type="checkbox" ${t.status === 'done' ? 'checked' : ''} data-action="toggleDone"/>
        </td>

        <!-- Start -->
        <td style="padding:.5rem .6rem;">
          <input type="date" value="${t.start_date ?? ''}" data-action="start"/>
        </td>

        <!-- Due -->
        <td style="padding:.5rem .6rem;">
          <input type="date" value="${t.due_date ?? ''}" data-action="due"/>
        </td>

        <!-- Notes (auto-grow, borderless when filled) -->
        <td class="notes-cell" style="padding:.4rem .6rem;">
          <textarea class="notes-input${(t.notes && String(t.notes).trim()) ? ' filled' : ''}"
                    data-action="notes"
                    rows="1"
                    placeholder="Notes…">${esc(t.notes)}</textarea>
        </td>
      </tr>
    `;
  }).join('');

  // Wire row controls
  body.querySelectorAll('tr').forEach(row => {
    const id = row.getAttribute('data-id');

    // Assignee dropdown open/close
    row.querySelector('[data-action="assignee-toggle"]').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAssigneeMenu(row);
    });

    // Apply selection
    row.querySelector('[data-action="assignee-apply"]').addEventListener('click', async () => {
      const values = Array.from(row.querySelectorAll('.assignee-menu input[type="checkbox"]:checked'))
        .map(ch => ch.value);
      await updateTaskAssignees(id, values);
      // Update label
      row.querySelector('.assignee-label').textContent = values.length ? values.join(', ') : '— Select —';
      closeAssigneeMenus();
      flash('Assignees updated.');
    });

    // Clear selection
    row.querySelector('[data-action="assignee-clear"]').addEventListener('click', async () => {
      Array.from(row.querySelectorAll('.assignee-menu input[type="checkbox"]')).forEach(ch => ch.checked = false);
      await updateTaskAssignees(id, []);
      row.querySelector('.assignee-label').textContent = '— Select —';
      closeAssigneeMenus();
      flash('Assignees cleared.');
    });

    // Start / Due
    row.querySelector('[data-action="start"]').addEventListener('change', async (e) => {
      const v = e.target.value || null;
      await updateTaskStart(id, v);
      flash('Start date updated.');
    });

    row.querySelector('[data-action="due"]').addEventListener('change', async (e) => {
      const v = e.target.value || null;
      await updateTaskDue(id, v);
      await cascadeDependents(id); // if this is an anchor, bump dependents
      flash('Due date updated.');
    });

    // Done
    row.querySelector('[data-action="toggleDone"]').addEventListener('change', async (e) => {
      const checked = e.target.checked;
      await updateTaskStatus(id, checked ? 'done' : 'todo');
      flash(checked ? 'Marked complete.' : 'Marked todo.');
    });

    // Notes — auto-grow + debounced autosave + filled state
    const notesEl = row.querySelector('[data-action="notes"]');
    const saveNotes = debounce(async (txt) => {
      const trimmed = (txt && txt.trim()) ? txt.trim() : null;
      await updateTaskNotes(id, trimmed);
    }, 600);

    // initial size/state
    autoResize(notesEl);
    notesEl.classList.toggle('filled', (notesEl.value || '').trim().length > 0);

    notesEl.addEventListener('input', (e) => {
      autoResize(notesEl);
      notesEl.classList.toggle('filled', e.target.value.trim().length > 0);
      saveNotes(e.target.value);
    });

    notesEl.addEventListener('blur', async (e) => {
      await updateTaskNotes(id, (e.target.value && e.target.value.trim()) ? e.target.value.trim() : null);
    });
  });

  // Close menus when clicking anywhere else
  document.addEventListener('click', onGlobalClickCloseMenus, { once: true });
}

// --- Assignee menu helpers ----------------------------------------
function toggleAssigneeMenu(row) {
  const menu = row.querySelector('.assignee-menu');
  if (!menu) return;

  const isOpen = menu.style.display !== 'none' && !menu.classList.contains('hidden');
  if (isOpen) {
    menu.classList.add('hidden');
    menu.style.display = 'none';
    _openAssigneeRow = null;
    return;
  }

  // Close any other open menu
  closeAssigneeMenus();

  // Open this one near the trigger
  menu.classList.remove('hidden');
  menu.style.display = 'block';

  // ensure the cell is relatively positioned so menu anchors correctly
  row.querySelector('.assignee-cell').style.position = 'relative';

  _openAssigneeRow = row.getAttribute('data-id');
}

function closeAssigneeMenus() {
  document.querySelectorAll('.assignee-menu').forEach(m => {
    m.classList.add('hidden');
    m.style.display = 'none';
  });
  _openAssigneeRow = null;
}

function onGlobalClickCloseMenus(e) {
  if (e.target.closest('.assignee-cell')) return; // click was inside a menu/cell
  closeAssigneeMenus();
}

// ---- Mutations ----------------------------------------------------
async function updateTaskAssignees(taskId, whoList) {
  const db = window.supabase;
  const first = (whoList && whoList.length) ? whoList[0] : null; // keep legacy 'assignee' in sync
  const { error } = await db.from('tasks')
    .update({ assignees: whoList, assignee: first })
    .eq('id', taskId);
  if (error) throw error;
}

async function updateTaskStatus(taskId, status) {
  const db = window.supabase;
  const payload = { status };
  if (status === 'done') payload.completed_at = new Date().toISOString();
  const { error } = await db.from('tasks').update(payload).eq('id', taskId);
  if (error) throw error;
}

async function updateTaskStart(taskId, dateStr /* or null */) {
  const db = window.supabase;
  const { error } = await db.from('tasks').update({ start_date: dateStr }).eq('id', taskId);
  if (error) throw error;
}

async function updateTaskDue(taskId, dateStr /* or null */) {
  const db = window.supabase;
  const { error } = await db.from('tasks').update({ due_date: dateStr }).eq('id', taskId);
  if (error) throw error;
}

async function updateTaskNotes(taskId, text /* or null */) {
  const db = window.supabase;
  const { error } = await db.from('tasks').update({ notes: text }).eq('id', taskId);
  if (error) throw error;
}

async function cascadeDependents(anchorTaskId) {
  const db = window.supabase;
  // 1) Get anchor's due date
  const { data: anchorRows, error: e1 } = await db.from('tasks')
    .select('due_date').eq('id', anchorTaskId).limit(1);
  if (e1) throw e1;
  const anchorDate = anchorRows?.[0]?.due_date || null;
  if (!anchorDate) return;

  // 2) Get dependents
  const { data: deps, error: e2 } = await db.from('task_dependencies')
    .select('task_id, offset_days').eq('anchor_task_id', anchorTaskId);
  if (e2) throw e2;

  // 3) Update each dependent due date = anchor +/- offset_days
  for (const d of (deps || [])) {
    const next = new Date(anchorDate);
    next.setDate(next.getDate() + (d.offset_days || 0));
    const iso = next.toISOString().slice(0,10);
    await updateTaskDue(d.task_id, iso);
  }
}

// ---- Seeding from template ---------------------------------------
async function seedFromTemplate(db, project) {
  // 1) Load template rows ordered
  const { data: tmpl, error } = await db
    .from('task_templates')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!tmpl || !tmpl.length) throw new Error('No task templates found.');

  // 2) Prepare inserts (smart default assignees)
  const toInsert = tmpl.map(t => {
    const people = computeDefaultAssignees(t.role, project);
    return {
      project_id: project.id,
      template_id: t.id,
      title: t.title,
      role: t.role,
      assignee: people[0] || null,   // keep legacy single-assignee in sync
      assignees: people,             // multi-assign
      status: 'todo',
      due_date: null,
      notes: null,
      position: t.position           // keep stable order forever
    };
  });

  // 3) Insert tasks and get ids back
  const { data: created, error: e1 } = await db
    .from('tasks')
    .insert(toInsert)
    .select('id, template_id');
  if (e1) throw e1;

  const map = new Map(created.map(r => [r.template_id, r.id]));

  // 4) Create real dependencies for offset templates (if/when you add them)
  const deps = tmpl
    .filter(t => t.schedule_kind === 'offset' && t.anchor_template_id)
    .map(t => ({
      task_id: map.get(t.id),
      anchor_task_id: map.get(t.anchor_template_id),
      offset_days: t.offset_days || 0
    }))
    .filter(d => d.task_id && d.anchor_task_id);

  if (deps.length) {
    const { error: e2 } = await db.from('task_dependencies').insert(deps);
    if (e2) throw e2;
  }
}