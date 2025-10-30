// ===============================
// app.js — Dashboard logic
// (A→Z sorting + realtime + duplicate-name guard
//  + per-designer breakdowns in counters
//  + AUTO-SEED tasks from templates on project create
//  + SMART default assignees from template role strings)
// ===============================

let db;               // Supabase client (set on DOMContentLoaded)
let projects = [];    // In-memory cache for UI

// --- Helpers: sorting, grouping, rendering small lists -------------
const byName = (a, b) =>
  (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });

const safeDesigner = (d) => (d && d.trim()) || 'Unassigned';

function groupCountByDesigner(list) {
  const map = new Map();
  for (const p of list) {
    const key = safeDesigner(p.designer);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([designer, count]) => ({ designer, count }))
    .sort((a, b) => a.designer.localeCompare(b.designer, undefined, { sensitivity: 'base' }));
}

function renderMiniList(ulId, items) {
  const ul = document.getElementById(ulId);
  if (!ul) return;
  if (!items.length) {
    ul.innerHTML = `<li class="muted"><span>—</span><span>0</span></li>`;
    return;
  }
  ul.innerHTML = items.map(it => `<li><span>${it.designer}</span><span>${it.count}</span></li>`).join('');
}

// small HTML-escape (for safety)
function esc(s){
  return (s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// Local YYYY-MM-DD string (no timezone bugs)
function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Normalize a person label for display/grouping
function normPerson(s) {
  if (!s) return null;
  let p = String(s).trim().replace(/\.$/, '');    // "Admin." -> "Admin"
  const low = p.toLowerCase();
  if (low === 'project manager' || low === 'pm') return 'PM';
  if (low === 'admin') return 'Admin';
  return p;
}

// --- Data access ---------------------------------------------------
async function dbLoadProjects() {
  const { data, error } = await db
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return data.map(r => ({
    id: r.id,
    name: r.name,
    designer: r.designer,
    type: r.type,
    startDate: r.start_date ?? '',
    status: r.status ?? 'active',
    abandon_reason: r.abandon_reason ?? null,
    completed_at: r.completed_at ?? null,
    completion_notes: r.completion_notes ?? null,
    created_at: r.created_at
  }));
}

// Insert and return created row
async function dbInsertProject(p) {
  const { data, error } = await db
    .from('projects')
    .insert({
      name: p.name,
      designer: p.designer,
      type: p.type,
      start_date: p.startDate,
      status: p.status ?? 'active'
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// -------- Past Due summary (LINKED version) ----------------------
// Load "past due" tasks across ACTIVE projects: due_date < today AND status != 'done'.
// Returns { totalCount, byAssignee: [{ assignee, items: [{project_id, project_name, task_id}] }] }
async function dbLoadPastDueSummary() {
  // 1) Only active projects
  const active = projects.filter(p => p.status !== 'completed' && p.status !== 'abandoned');
  if (!active.length) return { totalCount: 0, byAssignee: [] };

  const today = ymdLocal();       // 'YYYY-MM-DD'
  const ids = active.map(p => p.id);
  const nameById = new Map(active.map(p => [p.id, p.name]));

  // 2) Pull overdue, not-done tasks for those projects
  const { data, error } = await db
    .from('tasks')
    .select('id, project_id, assignees, assignee, status, due_date')
    .in('project_id', ids)
    .not('due_date', 'is', null)
    .lt('due_date', today)
    .neq('status', 'done');

  if (error) throw error;
  if (!data?.length) return { totalCount: 0, byAssignee: [] };

  // 3) Aggregate: assignee -> (project -> earliest overdue task)
  const perPerson = new Map(); // person => Map(project_id => { task_id, due_date, project_name })
  for (const t of data) {
    const projId = t.project_id;
    const projName = nameById.get(projId);
    if (!projName) continue;

    // expand multi-assign; fall back to single assignee
    let people = Array.isArray(t.assignees) && t.assignees.length
      ? t.assignees
      : (t.assignee ? [t.assignee] : []);
    people = people
      .map(s => (s || '').toString().trim().replace(/\.$/, '')) // "Admin." -> "Admin"
      .map(s => (s.toLowerCase() === 'project manager' || s.toLowerCase() === 'pm') ? 'PM' : s)
      .filter(Boolean);

    for (const person of people) {
      if (!perPerson.has(person)) perPerson.set(person, new Map());
      const m = perPerson.get(person);
      const prev = m.get(projId);
      // keep the earliest overdue task (smallest YYYY-MM-DD string)
      if (!prev || (t.due_date || '') < (prev.due_date || '')) {
        m.set(projId, { task_id: t.id, due_date: t.due_date, project_name: projName });
      }
    }
  }

  // 4) Shape for UI (assignees A→Z; projects A→Z)
  const byAssignee = Array.from(perPerson.entries())
    .map(([assignee, projMap]) => {
      const items = Array.from(projMap.entries())
        .map(([project_id, info]) => ({
          project_id,
          project_name: info.project_name,
          task_id: info.task_id
        }))
        .sort((a,b) => a.project_name.localeCompare(b.project_name, undefined, {sensitivity:'base'}));
      return { assignee, items };
    })
    .sort((a,b) => a.assignee.localeCompare(b.assignee, undefined, {sensitivity:'base'}));

  return { totalCount: data.length, byAssignee };
}

// Render the Past Due list with clickable project links to the earliest overdue task
function renderPastDueList(byAssignee) {
  const ul = document.getElementById('pastDueByDesigner');
  if (!ul) return;

  if (!byAssignee.length) {
    ul.innerHTML = `<li class="muted"><span>—</span><span>0</span></li>`;
    return;
  }

  ul.innerHTML = byAssignee.map(({ assignee, items }) => {
    const links = items.map(it =>
      `<a href="project.html?id=${encodeURIComponent(it.project_id)}#task-${encodeURIComponent(it.task_id)}">${esc(it.project_name)}</a>`
    ).join(', ');
    return `<li><span>${esc(assignee)}</span><span>${links}</span></li>`;
  }).join('');
}

async function refreshPastDueCounter() {
  try {
    const { totalCount, byAssignee } = await dbLoadPastDueSummary();
    const h2 = document.querySelector('#pastDueCounter h2');
    if (h2) h2.textContent = totalCount;
    renderPastDueList(byAssignee);
  } catch (e) {
    console.error('Failed to load Past Due summary:', e);
    const h2 = document.querySelector('#pastDueCounter h2');
    if (h2) h2.textContent = '—';
    const ul = document.getElementById('pastDueByDesigner');
    if (ul) ul.innerHTML = `<li class="muted"><span>—</span><span>0</span></li>`;
  }
}

// --- Default assignee helpers (used during seeding) ----------------
function computeDefaultAssignee(role, projectRow) {
  if (!role) return null;
  if (role.toLowerCase().includes('designer')) return projectRow.designer || 'Designer';
  let first = role.split(/[,+]/)[0].trim().replace(/\.$/, '');
  if (!first) return null;
  if (/^admin$/i.test(first)) return 'Admin';
  return first;
}

function computeDefaultAssignees(role, projectRow) {
  if (!role) return [];
  const parts = role.split(/[,+]/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let p of parts) {
    p = p.replace(/\.$/, '');
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
  return Array.from(new Set(out.filter(Boolean)));
}

// --- AUTO-SEED tasks from template for a newly created project ----
async function dbSeedTasksFromTemplate(projectRow) {
  // 1) Load template rows in a stable order
  const { data: tmpl, error: e0 } = await db
    .from('task_templates')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (e0) throw e0;
  if (!tmpl || !tmpl.length) return; // nothing to seed

  // 2) Prepare per-task inserts (smart default assignees + keep position)
  const toInsert = tmpl.map(t => {
    const people = computeDefaultAssignees(t.role, projectRow);
    return {
      project_id: projectRow.id,
      template_id: t.id,
      title: t.title,
      role: t.role,
      assignee: people[0] || null,  // keep legacy column in sync
      assignees: people,            // array column
      status: 'todo',
      due_date: null,
      notes: null,
      position: t.position ?? null  // <<< ensure stable order
    };
  });

  // 3) Insert tasks and capture IDs
  const { data: created, error: e1 } = await db
    .from('tasks')
    .insert(toInsert)
    .select('id, template_id');
  if (e1) throw e1;

  // 4) Convert template offsets → real dependencies
  const idByTemplate = new Map(created.map(r => [r.template_id, r.id]));
  const deps = tmpl
    .filter(t => t.schedule_kind === 'offset' && t.anchor_template_id)
    .map(t => ({
      task_id: idByTemplate.get(t.id),
      anchor_task_id: idByTemplate.get(t.anchor_template_id),
      offset_days: t.offset_days || 0
    }))
    .filter(d => d.task_id && d.anchor_task_id);

  if (deps.length) {
    const { error: e2 } = await db.from('task_dependencies').insert(deps);
    if (e2) throw e2;
  }
}

// --- Rendering -----------------------------------------------------
function renderProjects() {
  const grid = document.getElementById("projectGrid");

  const activeList = projects
    .filter(p => p.status !== 'completed' && p.status !== 'abandoned')
    .sort(byName);

  grid.innerHTML = activeList.map(p => `
    <div class="dashboard-card"
         onclick="window.location.href='project.html?id=${encodeURIComponent(p.id)}'">
      <h3>${esc(p.name)}</h3>
      <p><strong>Designer:</strong> ${esc(p.designer || '')}</p>
      <p><strong>Start Date:</strong> ${esc(p.startDate || '')}</p>
    </div>
  `).join("");
}

// --- Counters (+ per-designer lists) -------------------------------
function updateCounters() {
  const year = new Date().getFullYear();

  // Active
  const activeList = projects.filter(
    p => p.status !== 'completed' && p.status !== 'abandoned'
  );
  document.querySelector('#activeCounter h2').textContent = activeList.length;
  renderMiniList('activeByDesigner', groupCountByDesigner(activeList));

  // Completed (This Year)
  const completedThisYear = projects.filter(p =>
    p.status === 'completed' &&
    p.completed_at &&
    new Date(p.completed_at).getFullYear() === year
  );
  document.querySelector('#completedCounter h2').textContent = completedThisYear.length;
  renderMiniList('completedByDesigner', groupCountByDesigner(completedThisYear));
}

// --- Search (active projects only) --------------------------------
function setupSearch() {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    const term = (input.value || '').toLowerCase();
    const activeList = projects
      .filter(p => p.status !== 'completed' && p.status !== 'abandoned');

    const list = (term
      ? activeList.filter(p => (p.name || '').toLowerCase().includes(term))
      : activeList
    ).sort(byName);

    const grid = document.getElementById("projectGrid");
    grid.innerHTML = list.map(p => `
      <div class="dashboard-card"
           onclick="window.location.href='project.html?id=${encodeURIComponent(p.id)}'">
        <h3>${esc(p.name)}</h3>
        <p><strong>Designer:</strong> ${esc(p.designer || '')}</p>
        <p><strong>Start Date:</strong> ${esc(p.startDate || '')}</p>
      </div>
    `).join("");
  });
}

// --- Realtime ------------------------------------------------------
function setupRealtime() {
  // Projects channel
  const projChan = db.channel('projects-live');
  projChan
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'projects' },
      async () => {
        try {
          projects = await dbLoadProjects();
          renderProjects();
          updateCounters();
          await refreshPastDueCounter();
          buildDesignerSelect();
        } catch (e) {
          console.error('Realtime refresh (projects) failed:', e);
        }
      }
    )
    .subscribe();

  // Tasks channel (Past Due only)
  const taskChan = db.channel('tasks-live');
  taskChan
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'tasks' },
      async () => {
        try {
          await refreshPastDueCounter();
        } catch (e) {
          console.error('Realtime refresh (tasks) failed:', e);
        }
      }
    )
    .subscribe();
}

// === Designer select: build + "Add new…" support ==================
function uniqueDesignersFromProjects() {
  const set = new Set(
    (projects || [])
      .map(p => (p.designer || '').trim())
      .filter(Boolean)
  );
  return Array.from(set).sort((a,b) => a.localeCompare(b, undefined, {sensitivity:'base'}));
}

function buildDesignerSelect() {
  const sel = document.getElementById('designerSelect');
  if (!sel) return; // not on this page

  const keepVal = sel.value; // remember current selection if any
  const designers = uniqueDesignersFromProjects();

  // Rebuild options
  sel.innerHTML = '';
  const ph = new Option('— Select designer —', '', true, false);
  ph.disabled = true;
  sel.add(ph);

  designers.forEach(name => sel.add(new Option(name, name)));
  sel.add(new Option('➕ Add new…', '__add_new__'));

  // Try to restore prior selection
  if (keepVal) {
    const match = designers.find(d => d.toLowerCase() === keepVal.toLowerCase());
    if (match) sel.value = match;
  }
}

// Intercept the "Add new…" selection and prompt for a name
document.addEventListener('change', (e) => {
  const sel = e.target;
  if (!(sel instanceof HTMLSelectElement)) return;
  if (sel.id !== 'designerSelect') return;
  if (sel.value !== '__add_new__') return;

  const typed = (window.prompt('New designer name:') || '').trim();
  if (!typed) {
    // Rebuild to put the placeholder back and clear selection
    buildDesignerSelect();
    sel.value = '';
    return;
  }

  // Avoid duplicates by label, case-insensitive
  const exists = Array.from(sel.options).some(
    o => o.value && o.value !== '__add_new__' && o.text.toLowerCase() === typed.toLowerCase()
  );
  if (!exists) {
    // Insert before the "Add new…" option (last one)
    const insertBefore = sel.options[sel.options.length - 1];
    sel.add(new Option(typed, typed), insertBefore);
  }
  sel.value = typed; // select the new/existing entry
});

// --- New Project Modal --------------------------------------------
const modal = document.getElementById("newProjectModal");
const newBtn = document.getElementById("newProjectBtn");
const closeModal = document.getElementById("closeModal");
const form = document.getElementById("newProjectForm");

newBtn.addEventListener("click", () => { modal.style.display = "block"; });
closeModal.addEventListener("click", () => { modal.style.display = "none"; });
window.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameRaw = document.getElementById('projectNameInput').value;
  const normalizedName = nameRaw.trim().replace(/\s+/g, ' ');
  const newProj = {
    name: normalizedName,
    designer: document.getElementById('designerSelect').value,
    type: document.getElementById('projectType').value,
    startDate: document.getElementById('startDateInput').value,
    status: 'active'
  };
  if (!newProj.name) return;

  // Duplicate-name guard
  const dup = projects.some(
    p => (p.name || '').trim().toLowerCase() === newProj.name.toLowerCase()
  );
  if (dup) {
    alert('A project with that name already exists.\n\nPlease add more info to make it unique (e.g., address, client, or date).');
    document.getElementById('projectNameInput').focus();
    return;
  }

  try {
    const created = await dbInsertProject(newProj);

    // seed tasks immediately
    try {
      await dbSeedTasksFromTemplate(created);
    } catch (seedErr) {
      console.error('Task seeding failed (project still created):', seedErr);
      alert('Project saved, but tasks could not be seeded: ' + seedErr.message);
    }

    projects = await dbLoadProjects();
    renderProjects();
    updateCounters();
    await refreshPastDueCounter();
    buildDesignerSelect();

    modal.style.display = 'none';
    form.reset();
  } catch (err) {
    alert('Could not save project: ' + err.message);
    console.error(err);
  }
});

// --- Bootstrap -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  db = window.supabase;
  if (!db) { console.error('Supabase client not found on window.'); return; }

  dbLoadProjects()
    .then(rows => { projects = rows || []; })
    .catch(e => { console.error('Failed to load from DB:', e); projects = []; })
    .finally(() => {
      renderProjects();
      updateCounters();
      refreshPastDueCounter(); // no await
      buildDesignerSelect();
      setupSearch();
      setupRealtime();
    });
});

