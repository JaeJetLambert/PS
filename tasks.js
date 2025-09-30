// ===============================
// tasks.js — per-project tasks UI (auto-seed from template)
// ===============================
const TASK_USERS = [
  'Sarah','Darby','Adaline','Designer','Admin','Katie','Jae','PM','Trey',
  'Client','Ellen','Jessica'
]; // quick list for reassignment
function computeDefaultAssignee(role, project) {
  if (!role) return null;
  const r = role.toLowerCase();
  if (r.includes('designer')) return project.designer || 'Designer';
  let first = role.split(/[,+]/)[0].trim();
  first = first.replace(/\.$/, '');
  if (!first) return null;
  if (/^admin$/i.test(first)) return 'Admin';
  return first;
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
      <table id="tasksTable" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #e6e8ee;">
            <th style="text-align:left; padding:.6rem; width:70px;">Done</th>
            <th style="text-align:left; padding:.6rem;">Task</th>
            <th style="text-align:left; padding:.6rem; width:120px;">Role</th>
            <th style="text-align:left; padding:.6rem; width:160px;">Assignee</th>
            <th style="text-align:left; padding:.6rem; width:160px;">Due</th>
          </tr>
        </thead>
        <tbody id="tasksBody"></tbody>
      </table>
    </div>
    <div id="tasksMsg" style="margin:.5rem 0; opacity:.75;"></div>
  `;

  // Load existing tasks
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

  renderTasks(tasks);
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
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

function renderTasks(tasks) {
  const body = document.getElementById('tasksBody');
  body.innerHTML = tasks.map(t => {
    const options = TASK_USERS.map(u =>
      `<option value="${u}" ${t.assignee === u ? 'selected' : ''}>${u}</option>`
    ).join('');
    return `
      <tr data-id="${t.id}" style="border-bottom:1px solid #f0f2f6;">
        <td style="padding:.5rem .6rem;">
          <input type="checkbox" ${t.status === 'done' ? 'checked' : ''} data-action="toggleDone"/>
        </td>
        <td style="padding:.5rem .6rem;">${t.title}</td>
        <td style="padding:.5rem .6rem; opacity:.8;">${t.role}</td>
        <td style="padding:.5rem .6rem;">
          <select data-action="assign">${options}</select>
        </td>
        <td style="padding:.5rem .6rem;">
          <input type="date" value="${t.due_date ?? ''}" data-action="due"/>
        </td>
      </tr>
    `;
  }).join('');

  // Wire row controls
  body.querySelectorAll('tr').forEach(row => {
    const id = row.getAttribute('data-id');

    row.querySelector('[data-action="toggleDone"]').addEventListener('change', async (e) => {
      const checked = e.target.checked;
      await updateTaskStatus(id, checked ? 'done' : 'todo');
      flash(checked ? 'Marked complete.' : 'Marked todo.');
    });

    row.querySelector('[data-action="assign"]').addEventListener('change', async (e) => {
      await updateTaskAssignee(id, e.target.value);
      flash('Assignee updated.');
    });

    row.querySelector('[data-action="due"]').addEventListener('change', async (e) => {
      const v = e.target.value || null; // 'YYYY-MM-DD' or ''
      await updateTaskDue(id, v);
      await cascadeDependents(id);      // bump dependents if this is an anchor
      flash('Due date updated.');
    });
  });
}

// ---- Mutations ----------------------------------------------------
async function updateTaskStatus(taskId, status) {
  const db = window.supabase;
  const payload = { status };
  if (status === 'done') payload.completed_at = new Date().toISOString();
  const { error } = await db.from('tasks').update(payload).eq('id', taskId);
  if (error) throw error;
}

async function updateTaskAssignee(taskId, who) {
  const db = window.supabase;
  const { error } = await db.from('tasks').update({ assignee: who }).eq('id', taskId);
  if (error) throw error;
}

async function updateTaskDue(taskId, dateStr /* or null */) {
  const db = window.supabase;
  const { error } = await db.from('tasks').update({ due_date: dateStr }).eq('id', taskId);
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

  // 2) Prepare inserts (smart default assignee)
  const toInsert = tmpl.map(t => ({
    project_id: project.id,
    template_id: t.id,
    title: t.title,
    role: t.role,
    assignee: computeDefaultAssignee(t.role, project),
    status: 'todo',
    due_date: null
  }));

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