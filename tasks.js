// ===============================
// tasks.js — per-project tasks UI (auto-seed from template)
// Columns: Assignee | Task | Done | Start | Due | Notes
// - Multi-assign (assignees[]), compact checkbox dropdown
// - Notes auto-grow + debounced autosave
// - Cascading due dates from dependencies
// - Deep-link support: project.html?id=...#task-<taskId>
// - Auto-jump to next due task if no deep link
// - Date inputs show BLANK UI when empty
// ===============================
const TASK_USERS = [
  'Sarah','Darby','Adaline','Designer','Admin','Katie','Jae','PM','Trey',
  'Client','Ellen','Jessica'
];

let _openAssigneeRow = null; // which task row's assignee menu is open
let _currentProjectId = null;
let _currentTasks = []; // local snapshot for rule lookups

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
// Local YYYY-MM-DD (avoid TZ surprises)
function ymdLocal(d = new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Pick the "next due" task id from a project's task list
function findNextDueTaskId(tasks){
  if (!Array.isArray(tasks) || !tasks.length) return null;

  const today = ymdLocal();
  const open = tasks.filter(t => t.status !== 'done');

  // 1) Due today or future: earliest date wins
  const future = open.filter(t => t.due_date && t.due_date >= today)
    .sort((a,b) => (a.due_date === b.due_date)
      ? ((a.position??9e9) - (b.position??9e9))
      : a.due_date.localeCompare(b.due_date)
    );
  if (future[0]) return future[0].id;

  // 2) Overdue: the one closest to today (latest past date)
  const overdue = open.filter(t => t.due_date && t.due_date < today)
    .sort((a,b) => (a.due_date === b.due_date)
      ? ((a.position??9e9) - (b.position??9e9))
      : b.due_date.localeCompare(a.due_date)
    );
  if (overdue[0]) return overdue[0].id;

  // 3) No due dates: first open by position/created_at
  const byPos = open.slice().sort((a,b) => {
    const pa = (a.position ?? 9e9), pb = (b.position ?? 9e9);
    if (pa !== pb) return pa - pb;
    return String(a.created_at||'').localeCompare(String(b.created_at||''));
  });
  return byPos[0]?.id ?? null;
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
      <table id="tasksTable" class="tasks-table" style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0;">
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

  // Ensure stable order
  tasks = (tasks || []).slice().sort((a,b) => {
    const pa = (a.position ?? 999999);
    const pb = (b.position ?? 999999);
    if (pa !== pb) return pa - pb;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  _currentProjectId = project.id;
  _currentTasks = tasks.slice(); // keep a local snapshot for title lookups

  // Render table
  renderTasks(tasks);

  // Deep link has priority; otherwise auto-jump to “next due”
  if (location.hash && location.hash.startsWith('#task-')) {
    maybeScrollToTaskFromHash();
  } else {
    const nextId = findNextDueTaskId(tasks);
    if (nextId) {
      requestAnimationFrame(() => {
        const row = document.getElementById(`task-${nextId}`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightRow(row);
        }
      });
    }
  }
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

// ========== DATE RULES ENGINE (drop-in) =====================================
// Normalization helpers (titles with smart quotes, case, spacing)
function _normalizeQuotes(s){ return (s||'').replace(/[’‘]/g,"'").replace(/[“”]/g,'"'); }
function _normTitle(s){ return _normalizeQuotes(String(s||'').trim()).toLowerCase(); }

// YYYY-MM-DD math (local)
function addDaysYMD(ymd, days){
  if (!ymd) return null;
  const [y,m,d] = ymd.split('-').map(Number);
  const dt = new Date(y,(m||1)-1,(d||1));
  dt.setDate(dt.getDate() + (days||0));
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  return `${yy}-${mm}-${dd}`;
}

// Friday calculators
function _prevFriday(beforeYMD){
  if (!beforeYMD) return null;
  const [y,m,d] = beforeYMD.split('-').map(Number);
  const dt = new Date(y,(m||1)-1,(d||1));
  // strictly before → step one day back first
  dt.setDate(dt.getDate()-1);
  while (dt.getDay() !== 5) dt.setDate(dt.getDate()-1); // 5 = Friday
  return dt.toISOString().slice(0,10);
}
function _nextFriday(afterYMD){
  if (!afterYMD) return null;
  const [y,m,d] = afterYMD.split('-').map(Number);
  const dt = new Date(y,(m||1)-1,(d||1));
  // strictly after → step one day forward first
  dt.setDate(dt.getDate()+1);
  while (dt.getDay() !== 5) dt.setDate(dt.getDate()+1);
  return dt.toISOString().slice(0,10);
}
function _secondFridayAfter(startYMD){
  const first = _nextFriday(startYMD);
  return addDaysYMD(first, 7);
}

// In-memory snapshot is kept in _currentTasks (set in initTasksUI)
function _tasksOrdered(){
  return (_currentTasks||[]).slice().sort((a,b)=>{
    const pa = (a.position ?? 9e9), pb = (b.position ?? 9e9);
    if (pa !== pb) return pa - pb;
    return String(a.created_at||'').localeCompare(String(b.created_at||''));
  });
}

// Find the Nth occurrence (1-based) of a title in this project
function _findTaskByTitleOcc(title, occ=1){
  const needle = _normTitle(title);
  const matches = _tasksOrdered().filter(t => _normTitle(t.title) === needle);
  return matches[(occ||1)-1] || null;
}

// --- Title aliases (map tiny wording/spelling differences to your canonical names) ---
const TITLE_ALIAS = new Map([
  // Tap vs Tab (use your canonical 'Tab')
  ['weekly double tap - sign design agreement', 'Weekly Double Tab - Sign Design Agreement'],
  ['weekly double tab - sign design agreement', 'Weekly Double Tab - Sign Design Agreement'],
  ['weekly double tap - send ip to client', 'Weekly Double Tap - Send IP to Client'],
  ['weekly double tab - send ip to client', 'Weekly Double Tap - Send IP to Client'],

  // Signed/Sign variants
  ['sign design agreement', 'Signed Design Agreement'],
  ['signed design agreement', 'Signed Design Agreement'],

  // Smart quotes & minor typos
  ["clipboard on katie’s desk", "Clipboard on Katie's Desk"],
  ["folder on sarah’s desk",  "Folder on Sarah's Desk"],
  ['send sub meeting review email to client', 'Send Sum Meeting Review Email to Client'], // handles “Sub” vs “Sum”
  ['pm punch list', 'PM punch list'],

  // IP wording
  ['send initial presentation', 'Send Initial Presentation to Client'],
  ['send initial presentation to client', 'Send Initial Presentation to Client'],
]);

function _resolveTitle(t){
  const key = _normTitle(t);
  for (const [k,v] of TITLE_ALIAS.entries()){
    if (key === _normTitle(k)) return v;
  }
  return t;
}
}

// SCHEMA:
// when:{title, on:'start'|'due'}  target:{title, field:'start'|'due', occurrence?}
// base:'anchor.start'|'anchor.due'  + either offsetDays:int OR calc:'prevFriday'|'nextFriday'|'secondFriday'
// onlyIfBlank?: true -> only set if target field is empty

const DATE_RULES = [
  // ===== Process Document / Nudge =====
  { when:{title:'Send the Process Document', on:'start'}, target:{title:'Nudge Process Document', field:'due'}, base:'anchor.start', offsetDays:+14, onlyIfBlank:true },
  { when:{title:'Nudge Process Document',    on:'start'}, target:{title:'Nudge Process Document', field:'due'}, base:'anchor.start', offsetDays:+14 },

  // ===== Initial Consultation anchors =====
  { when:{title:'Have Initial Consultation', on:'start'}, target:{title:'Confirm Initial Consultation', field:'due'}, base:'anchor.start', offsetDays:-5 },
  { when:{title:'Have Initial Consultation', on:'start'}, target:{title:'Prepare Client Dossier',       field:'due'}, base:'anchor.start', offsetDays:-5 },
  { when:{title:'Have Initial Consultation', on:'start'}, target:{title:"Clipboard on Katie's Desk",    field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Have Initial Consultation', on:'start'}, target:{title:'Send Design Agreement',        field:'due'}, base:'anchor.start', offsetDays:+1 },

  // ===== Agreement follow-ups =====
  { when:{title:'Send Design Agreement', on:'start'}, target:{title:'Weekly Double Tab - Sign Design Agreement', field:'due'}, base:'anchor.start', offsetDays:+14, onlyIfBlank:true },
  { when:{title:'Weekly Double Tab - Sign Design Agreement', on:'start'}, target:{title:'Weekly Double Tab - Sign Design Agreement', field:'due'}, base:'anchor.start', offsetDays:+14 },

  // ===== After agreement is signed (milestone) =====
  { when:{title:'Signed Design Agreement', on:'start'}, target:{title:'Schedule Pictures and Measure',  field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Signed Design Agreement', on:'start'}, target:{title:'Make Google Drive Folder',       field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Signed Design Agreement', on:'start'}, target:{title:'Create Client Accounts in Both XERO Accounts', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Signed Design Agreement', on:'start'}, target:{title:'Execute Pictures and Measure',   field:'due'}, base:'anchor.start', offsetDays:+7 },

  // ===== Photos / measure branch =====
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Receive Deposit',                    field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Send P&M Review Email to Client',    field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:"Folder on Sarah's Desk",             field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Upload Pics to Google Photos',       field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Share Pics With Everyone on the Project', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Send Initial Presentation to Client', field:'due'}, base:'anchor.start', offsetDays:+14 },

  // ===== IP weekly double tap =====
  { when:{title:'Send Initial Presentation to Client', on:'start'}, target:{title:'Weekly Double Tap - Send IP to Client', field:'due'}, base:'anchor.start', offsetDays:+14, onlyIfBlank:true },
  { when:{title:'Weekly Double Tap - Send IP to Client', on:'start'}, target:{title:'Weekly Double Tap - Send IP to Client', field:'due'}, base:'anchor.start', offsetDays:+14 },

  // ===== Client review → schedule specific presentation =====
  { when:{title:'Client Sends Review', on:'start'}, target:{title:'Schedule Specific Presentation', field:'due'}, base:'anchor.start', offsetDays:+21 },

  // ===== Specific Presentation Meeting downstream =====
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Create Spreadsheet',                   field:'due'}, base:'anchor.start', offsetDays:-3 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Price Spreadsheet',                    field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Create Sub Packet for Quick Price',    field:'due'}, base:'anchor.start', offsetDays:-3 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Quick Price Cons',                     field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Designer Creates Sub Notes',           field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Send Sub Notes to Katie ',             field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Schedule Sub Meeting',                 field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Sub Meeting',                          field:'due'}, base:'anchor.start', offsetDays:+14 },

  // ===== After Sub Meeting =====
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Send Sum Meeting Review Email to Client', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Send Updates to Katie + Designer',        field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Update Sub Notes and Drawings Based on Feedback', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Price Construction Job',                  field:'due'}, base:'anchor.start', offsetDays:+28 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Schedule Final Pricing + Specifics Meeting', field:'due'}, base:'anchor.start', offsetDays:+28 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Final Pricing + Specifics Meeting',       field:'due'}, base:'anchor.start', offsetDays:+28 },

  // ===== Final Pricing + Specifics Meeting fan-out =====
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Final pricing printout emailed or in client drawer', field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Final Pricing Printouts, Calendar, and Contract Ready in Client Drawer', field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Send SP Review Email to Client', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Designer Edits', field:'due'}, base:'anchor.start', offsetDays:+3 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Pricer Edits',   field:'due'}, base:'anchor.start', offsetDays:+3 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Sign Contract',   field:'due'}, base:'anchor.start', offsetDays:+7 },

  // ===== Post Sign Contract fan-out =====
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Receive Payment from Clients', field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Hit Approve Invoice',         field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Schedule Drapery Final Measure', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Drapery Final Measure',          field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Drapery Diagram',                field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Order Design Items',             field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Prepare Warehousing Bay',        field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Finalize Drawings and Print',    field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Do Legacy stone details and sign offs', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Designer add all docs to google drive', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Add all docs to google drive',         field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Order Construction Things (wallpaper?)', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Schedule Subs',                  field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Make PM Packet',                 field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Add Events to Construction Calendar', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Update construction start and completion date on lines', field:'due'}, base:'anchor.start', offsetDays:+7 }, // if you prefer to key it from "Add all docs..." see rule below
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Put Subcontractor Bills into Xero', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Order Ferguson',                field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Add to Payment Calendar',       field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Cadenced Follow Up to Designer and client', field:'due'}, base:'anchor.start', offsetDays:+7 },

  // Optionally: tie “Update construction start…” directly to “Add all docs…” start
  { when:{title:'Add all docs to google drive', on:'start'}, target:{title:'Update construction start and completion date on lines', field:'due'}, base:'anchor.start', offsetDays:0 },

  // ===== Construction timeline anchors =====
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Designer meet with DJ',  field:'due'}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Designer do PSG sign offs', field:'due'}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Final Friday Walkthrough', field:'due'}, base:'anchor.start', calc:'prevFriday' },

  // Weekly cadence: first due = next Friday after start
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'PMs Bring Change Orders', field:'due'}, base:'anchor.start', calc:'nextFriday' },
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Create Invoices and bills to Reflect Change Orders', field:'due'}, base:'anchor.start', calc:'nextFriday' },

  // Designer visits cadence
  { when:{title:'Final Friday Walkthrough', on:'start'}, target:{title:'Designer Visits Job', field:'due'}, base:'anchor.start', offsetDays:+14 },
  { when:{title:'Designer Visits Job',     on:'start'}, target:{title:'Designer Visits Job', field:'due'}, base:'anchor.start', calc:'secondFriday' },

  // Staged payments
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Receive Payment 2', field:'due'}, base:'anchor.start', offsetDays:+28 },
  { when:{title:'Receive Payment 2',       on:'start'}, target:{title:'Receive Payment 3', field:'due'}, base:'anchor.start', offsetDays:+28 },

  // ===== Completion anchors =====
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Update Jae on Install Timing', field:'due', occurrence:1}, base:'anchor.start', offsetDays:-28 },
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Update Jae on Install Timing', field:'due', occurrence:2}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Schedule Install', field:'due'}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Schedule Roland',  field:'due'}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Schedule Thomas',  field:'due'}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Schedule Movers',  field:'due'}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Punch walk with client', field:'due'}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'PM punch list ', field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Completion walk', field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Designer Celebration walk', field:'due'}, base:'anchor.start', offsetDays:+7 },

  // ===== Install chain =====
  { when:{title:'Construction Project Completion Date', on:'start'}, target:{title:'Install + Style', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Install + Style', on:'start'}, target:{title:'Email Accessories Allowance to Designer', field:'due'}, base:'anchor.start', offsetDays:-1 },
  { when:{title:'Install + Style', on:'start'}, target:{title:'Prep Accessories for Install',          field:'due'}, base:'anchor.start', offsetDays:-1 },
  { when:{title:'Install + Style', on:'start'}, target:{title:'Prepare/load for install',               field:'due'}, base:'anchor.start', offsetDays:-1 },
  { when:{title:'Install + Style', on:'start'}, target:{title:'Manage Broken and Rejected Shit',        field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Install + Style', on:'start'}, target:{title:'Email Recap of Install and Accessories Left', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Install + Style', on:'start'}, target:{title:'Prepare and send Final Bill and accessories ', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Install + Style', on:'start'}, target:{title:'Accessories Review ', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Install + Style', on:'start'}, target:{title:'Pick Up Accessories', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Pick Up Accessories', on:'start'}, target:{title:'Finalize and Send Final Bill', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Finalize and Send Final Bill', on:'start'}, target:{title:'Receive Final Payment', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Receive Final Payment', on:'start'}, target:{title:'Archive shared drive folder', field:'due'}, base:'anchor.start', offsetDays:+7 },
];

// Compute target date from a base YMD and a rule
function _computeTargetYMD(baseYMD, rule){
  if (!baseYMD) return null;
  switch (rule.calc){
    case 'prevFriday':   return _prevFriday(baseYMD);
    case 'nextFriday':   return _nextFriday(baseYMD);
    case 'secondFriday': return _secondFridayAfter(baseYMD);
    default:             return addDaysYMD(baseYMD, rule.offsetDays||0);
  }
}

// Red highlight for “Receive Final Payment” when due and not done
function _updateReceiveFinalPaymentHighlight(){
  const t = _findTaskByTitleOcc('Receive Final Payment', 1);
  if (!t) return;
  const row = document.getElementById(`task-${t.id}`);
  if (!row) return;
  const dueInput = row.querySelector('input[data-action="due"]');
  const today = ymdLocal();
  if (t.due_date && t.status !== 'done' && today >= t.due_date){
    if (dueInput){
      dueInput.style.borderColor = '#b91c1c';
      dueInput.style.background = 'rgba(220,38,38,.08)';
    }
  } else if (dueInput){
    dueInput.style.borderColor = '';
    dueInput.style.background = '';
  }
}

// Main: apply rules when a task’s field changes (you already call this on start-change)
async function applyDateRulesAfterChange({ anchorTitle, fieldChanged, value }){
  const db = window.supabase;
  if (!db || !_currentProjectId) return;

  const anchorNorm = _normTitle(anchorTitle);
  const relevant = DATE_RULES.filter(r =>
    _normTitle(r.when.title) === anchorNorm && r.when.on === fieldChanged
  );

  for (const rule of relevant){
    const target = _findTaskByTitleOcc(rule.target.title, rule.target.occurrence || 1);
    if (!target) continue;

    if (rule.onlyIfBlank){
      const curr = (rule.target.field === 'due') ? target.due_date : target.start_date;
      if (curr) continue;
    }

    const baseYMD = (rule.base === 'anchor.start' ? value : null);
    if (!baseYMD) continue;

    const newYMD = _computeTargetYMD(baseYMD, rule);
    if (!newYMD) continue;

    if (rule.target.field === 'due'){
      await updateTaskDue(target.id, newYMD);
      target.due_date = newYMD;
      const row = document.getElementById(`task-${target.id}`);
      if (row){
        const el = row.querySelector('input[data-action="due"]');
        if (el) el.value = newYMD;
      }
    } else {
      await updateTaskStart(target.id, newYMD);
      target.start_date = newYMD;
      const row = document.getElementById(`task-${target.id}`);
      if (row){
        const el = row.querySelector('input[data-action="start"]');
        if (el) el.value = newYMD;
      }
    }
  }

  // Special highlight check
  _updateReceiveFinalPaymentHighlight();
}

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
          <input type="date" autocomplete="off" value="${t.start_date ?? ''}" data-action="start"/>
        </td>

        <!-- Due -->
        <td style="padding:.5rem .6rem;">
          <input type="date" autocomplete="off" value="${t.due_date ?? ''}" data-action="due"/>
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

  // Make empty date inputs visually BLANK (hide browser ghost text)
  body.querySelectorAll('input[type="date"]').forEach(el => {
    el.value = el.value || '';
    el.setAttribute('autocomplete','off');
    syncDateEmptyClass(el);
    const sync = () => syncDateEmptyClass(el);
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
    el.addEventListener('blur', sync);
  });

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

    row.querySelector('[data-action="start"]').addEventListener('change', async (e) => {
  const v = e.target.value || null;
  await updateTaskStart(id, v);

  // keep local cache in sync
  const local = _currentTasks.find(x => String(x.id) === String(id));
  if (local) local.start_date = v;

  // fire rules & update UI immediately
  await applyDateRulesAfterChange({
    anchorTaskId: id,
    anchorTitle: (local?.title ?? ''),
    fieldChanged: 'start',
    value: v
  });

  flash('Start date updated.');
});

    row.querySelector('[data-action="due"]').addEventListener('change', async (e) => {
      const v = e.target.value || null;
      await updateTaskDue(id, v);

      // keep local cache in sync
      const local = _currentTasks.find(x => String(x.id) === String(id));
      if (local) local.due_date = v;

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

// Hide ghost text when date input is empty; show when it has a value
function syncDateEmptyClass(el){
  const isEmpty = !el.value || String(el.value).trim() === '';
  el.classList.toggle('date-empty', isEmpty);
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