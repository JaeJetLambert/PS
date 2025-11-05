window.BUILD_TAG = window.BUILD_TAG || 'v20251104a';
console.log(`tasks.js ${window.BUILD_TAG} loaded at`, new Date().toISOString());
window.addEventListener('error', e => {
  console.error('[tasks.js global error]', e.message, e.filename, e.lineno, e.colno);
});
// ===============================
// tasks.js — per-project tasks UI (auto-seed + title renames + date rules)
// Columns: Assignee | Task | Done | Start | Due | Notes
// ===============================
const TASK_USERS = [
  'Sarah','Darby','Adaline','Designer','Admin','Katie','Jae','PM','Trey',
  'Client','Ellen','Jessica'
];

let _openAssigneeRow = null;
let _currentProjectId = null;
let _currentTasks = [];
let _titleIndex = new Map(); // title (normalized) -> [taskId, taskId, ...] in row order
let _lineById = new Map(); // task.id -> line number (1-based)

// Put this near the top (where your broken REMINDER_LINKS currently is)
const REMINDER_LINKS = [
  { anchor:'Schedule Initial Consultation',              target:'Have Initial Consultation' },
  { anchor:'Schedule Pictures and Measure',              target:'Execute Pictures and Measure' },
  { anchor:'Schedule Specific Presentation',             target:'Specific Presentation Meeting' },
  { anchor:'Schedule Sub Meeting',                       target:'Sub Meeting' },
  { anchor:'Schedule Final Pricing + Specifics Meeting', target:'Final Pricing + Specifics Meeting' },
  { anchor:'Schedule Signing',                           target:'Sign Contract' },
  { anchor:'Schedule Drapery Final Measure',             target:'Drapery Final Measure' },
];

// ---------- Utils ----------
function debounce(fn, delay = 600) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
function autoResize(el){ if(!el) return; el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }
function esc(s){ return (s ?? '').toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function ymdLocal(d = new Date()){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }

// ---------- Title normalization / aliases ----------
function _normalizeQuotes(s){
  return (s||'')
    .replace(/[’‘]/g,"'")
    .replace(/[“”]/g,'"');
}

// NEW: collapse weird dashes/spaces so "Tab – Sign" == "Tab - Sign"
function _normalizeDashesSpaces(s){
  return (s||'')
    .replace(/[\u2013\u2014]/g, '-')   // en/em dash → hyphen
    .replace(/\u00A0/g, ' ')           // NBSP → space
    .replace(/\s*-\s*/g, ' - ')        // normalize hyphen spacing
    .replace(/\s+/g, ' ')              // collapse extra spaces
    .trim();
}

function _normTitle(s){
  return _normalizeDashesSpaces(_normalizeQuotes(String(s||''))).toLowerCase();
}

// Build a fast lookup once _normTitle exists
const REMINDER_MAP = new Map(
  REMINDER_LINKS.map(({ anchor, target }) => [_normTitle(anchor), _normTitle(target)])
);

// New official names (your latest list)
const OFFICIAL_TITLES = [
  "Initial Contact","Send the Process Document","Nudge Process Document","Schedule Initial Consultation",
  "Confirm Initial Consultation","Prepare Client Dossier","Have Initial Consultation","Clipboard on Katie's Desk",
  "Send Design Agreement","Weekly Check In - Sign Design Agreement","Signed Design Agreement",
  "Schedule Pictures and Measure","Make Google Drive Folder","Create Client Accounts in Both XERO Accounts",
  "Receive Deposit","Execute Pictures and Measure","Send P&M Review Email to Client","Folder on Sarah's Desk",
  "Upload Pics to Google Photos","Share Pics With Everyone on the Project","Create Initial Presentation",
  "Send Initial Presentation to Client","Weekly Double Tap - Send IP to Client","Client Sends Review",
  "Schedule Specific Presentation","Create Specific Presentation","Create Spreadsheet","Price Spreadsheet",
  "Create Sub Packet for Quick Price","Quick Price Cons","Specific Presentation Meeting","Designer Creates Sub Notes",
  "Send Sub Notes to Katie ","Schedule Sub Meeting","Sub Meeting","Send Sum Meeting Review Email to Client",
  "Send Updates to Katie + Designer","Update Sub Notes and Drawings Based on Feedback","Price Construction Job",
  "Schedule Final Pricing + Specifics Meeting","Final pricing printout emailed or in client drawer",
  "Final Pricing Printouts, Calendar, and Contract Ready in Client Drawer","Final Pricing + Specifics Meeting",
  "Send SP Review Email to Client","Designer Edits","Pricer Edits","Schedule Signing","Sign Contract",
  "Receive Payment from Clients","Hit Approve Invoice","Schedule Drapery Final Measure","Drapery Final Measure",
  "Drapery Diagram","Order Design Items","Prepare Warehousing Bay","Finalize Drawings and Print",
  "Designer meet with DJ","Designer do PSG sign offs","Do Legacy stone details and sign offs",
  "Designer add all docs to google drive","Add all docs to google drive","Order Construction Things (wallpaper?)",
  "Schedule Subs","Make PM Packet","Add Events to Construction Calendar",
  "Update construction start and completion date on lines","Put Subcontractor Bills into Xero","Order Ferguson",
  "Add to Payment Calendar","Cadenced Follow Up to Designer and client","Final Friday Walkthrough",
  "Construction Job Starts","PM visit job every day (or multi, as needed)","PMs Bring Change Orders",
  "Create Invoices and bills to Reflect Change Orders","Create Invoices to Reflect Design Additions",
  "Designer Visits Job","Receive Payment 2","Monitor Job Progress","Receive Payment 3",
  "Update Jae on Install Timing","Update Jae on Install Timing","Schedule Install","Schedule Roland",
  "Schedule Thomas","Schedule Movers","Punch walk with client","PM punch list ","Completion walk",
  "Construction Project Completion Date","Designer Celebration walk","Email Accessories Allowance to Designer",
  "Prep Accessories for Install","Prepare/load for install","Install + Style","Manage Broken and Rejected Shit",
  "Email Recap of Install and Accessories Left","Prepare and send Final Bill and accessories ",
  "Accessories Review ","Pick Up Accessories","Finalize and Send Final Bill","Receive Final Payment",
  "Archive shared drive folder","Decision on Marketing Photos"
];

// Simple one-to-one renames (old -> new)
const SIMPLE_RENAMES = [
  ['Send Contract', 'Send Design Agreement'],

  // Canonicalize legacy "Weekly Double Tap/Tab" → new "Weekly Check In"
  ['Weekly Double Tap - Sign Design Agreement', 'Weekly Check In - Sign Design Agreement'],
  ['Weekly Double Tab - Sign Design Agreement', 'Weekly Check In - Sign Design Agreement'],
  ['Weekly Double Tap - Send Design Agreement', 'Weekly Check In - Send Design Agreement'],
  ['Weekly Double Tab - Send Design Agreement', 'Weekly Check In - Send Design Agreement'],

  // (Keep legacy IP mapping, unrelated to Design Agreement)
  ['Weekly Double Tap - Send IP to Client', 'Weekly Double Tap - Send IP to Client'],

  // Downstream canonicalizations you already had
  ['Sign Design Agreement', 'Signed Design Agreement'],
  ['PM punch list', 'PM punch list '], // ensure trailing space variant matches your official title
  ['Send Sub Meeting Review Email to Client', 'Send Sum Meeting Review Email to Client'], // unify Sub→Sum
];

// Three formerly identical titles → disambiguate by order in list (position)
const TRIPLE_REVIEW_OLD = 'Send Review Email to Client';
const TRIPLE_REVIEW_NEW = [
  'Send P&M Review Email to Client',      // 1st occurrence
  'Send Sum Meeting Review Email to Client', // 2nd
  'Send SP Review Email to Client'        // 3rd
];

function titlesEqual(a,b){ return _normTitle(a) === _normTitle(b); }

// ---------- Date math ----------
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
function _prevFriday(beforeYMD){
  if (!beforeYMD) return null;
  const [y,m,d] = beforeYMD.split('-').map(Number);
  const dt = new Date(y,(m||1)-1,(d||1));
  dt.setDate(dt.getDate()-1);
  while (dt.getDay() !== 5) dt.setDate(dt.getDate()-1);
  return dt.toISOString().slice(0,10);
}
function _nextFriday(afterYMD){
  if (!afterYMD) return null;
  const [y,m,d] = afterYMD.split('-').map(Number);
  const dt = new Date(y,(m||1)-1,(d||1));
  dt.setDate(dt.getDate()+1);
  while (dt.getDay() !== 5) dt.setDate(dt.getDate()+1);
  return dt.toISOString().slice(0,10);
}
function _secondFridayAfter(startYMD){ const first = _nextFriday(startYMD); return addDaysYMD(first, 7); }
function _computeTargetYMD(baseYMD, rule){
  if (!baseYMD) return null;
  switch (rule.calc){
    case 'prevFriday':   return _prevFriday(baseYMD);
    case 'nextFriday':   return _nextFriday(baseYMD);
    case 'secondFriday': return _secondFridayAfter(baseYMD);
    default:             return addDaysYMD(baseYMD, rule.offsetDays||0);
  }
}

// ---------- In-memory helpers ----------
function _tasksOrdered(){ return (_currentTasks||[]).slice().sort((a,b)=>{
  const pa=(a.position??9e9), pb=(b.position??9e9);
  if (pa!==pb) return pa-pb;
  return String(a.created_at||'').localeCompare(String(b.created_at||''));
});}
function _rebuildTitleIndex() {
  _titleIndex = new Map();
  (_currentTasks || []).forEach(t => {
    const key = _normTitle(t.title);
    if (!_titleIndex.has(key)) _titleIndex.set(key, []);
    _titleIndex.get(key).push(String(t.id));
  });
}

// Find the Nth task by title (1-based), robust even if index is stale
function _findTaskByTitleOcc(title, occ = 1) {
  if (!_titleIndex || !_titleIndex.size) _rebuildTitleIndex();

  const key = _normTitle(title);
  const ids = _titleIndex.get(key);

  // Fallback scan if index doesn’t have it
  if (!ids || !ids.length) {
    const matches = (_currentTasks || [])
      .filter(t => _normTitle(t.title) === key)
      .sort((a,b) => {
        const pa=(a.position ?? 9e9), pb=(b.position ?? 9e9);
        if (pa!==pb) return pa-pb;
        return String(a.created_at||'').localeCompare(String(b.created_at||''));
      });
    return matches[(occ||1)-1] || null;
  }

  const wantId = ids[(occ || 1) - 1];
  if (!wantId) return null;
  return (_currentTasks || []).find(t => String(t.id) === String(wantId)) || null;
}

function maybeRemindAfterStart(anchorTitle){
  if (!anchorTitle) return;
  const targetTitle = REMINDER_MAP.get(_normTitle(anchorTitle));
  if (!targetTitle) return;

  // Find the target task
  const target = _findTaskByTitleOcc(targetTitle, 1);
  if (!target) return;

  // Only remind if the target START date is empty
  if (target.start_date) return;

  const lineNum = _lineById?.get(String(target.id));
  const suffix = lineNum ? ` (line ${lineNum})` : '';
  alert(`Reminder: set a START date for "${target.title}"${suffix}.`);

  // Nice-to-have: scroll + highlight the target row
  const row = document.getElementById(`task-${target.id}`);
  if (row) {
    row.scrollIntoView({ behavior:'smooth', block:'center' });
    highlightRow(row);
  }
}

// ---------- RULES (already aligned to your new names) ----------
const DATE_RULES = [
  // Process Doc / Nudge — always re-sync Nudge due when Process Doc start changes
  { when:{title:'Send the Process Document', on:'start'},
    target:{title:'Nudge Process Document', field:'due'},
    base:'anchor.start', offsetDays:+14 },

  // Once Nudge starts, push its own due out 14 days (rolling follow-up)
  { when:{title:'Nudge Process Document', on:'start'},
    target:{title:'Nudge Process Document', field:'due'},
    base:'anchor.start', offsetDays:+14 },

// NEW: Weekly Double Tap - Send IP to Client self-resync
{ when:{title:'Weekly Double Tap - Send IP to Client', on:'start'},
  target:{title:'Weekly Double Tap - Send IP to Client', field:'due'},
  base:'anchor.start', offsetDays:+14 },

  // Initial Consultation anchors
  { when:{title:'Have Initial Consultation', on:'start'},
    target:{title:'Confirm Initial Consultation', field:'due'},
    base:'anchor.start', offsetDays:-5 },
  { when:{title:'Have Initial Consultation', on:'start'}, target:{title:'Prepare Client Dossier',       field:'due'}, base:'anchor.start', offsetDays:-5 },
  { when:{title:'Have Initial Consultation', on:'start'}, target:{title:"Clipboard on Katie's Desk",    field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Have Initial Consultation', on:'start'}, target:{title:'Send Design Agreement',        field:'due'}, base:'anchor.start', offsetDays:+1 },

 // Weekly Check In — Send Design Agreement rules

// A) Base trigger: from "Send Design Agreement" start → set WCI Send DA due = +14d
{ when:{title:'Send Design Agreement', on:'start'},
  target:{title:'Weekly Check In - Send Design Agreement', field:'due'},
  base:'anchor.start', offsetDays:+14, onlyIfBlank:true },

// B) Self trigger: from "Weekly Check In - Send Design Agreement" start → set its own due = +14d
{ when:{title:'Weekly Check In - Send Design Agreement', on:'start'},
  target:{title:'Weekly Check In - Send Design Agreement', field:'due'},
  base:'anchor.start', offsetDays:+14 },

  // After agreement is signed (milestone)
  { when:{title:'Signed Design Agreement', on:'start'}, target:{title:'Schedule Pictures and Measure',  field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Signed Design Agreement', on:'start'}, target:{title:'Make Google Drive Folder',       field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Signed Design Agreement', on:'start'}, target:{title:'Create Client Accounts in Both XERO Accounts', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Signed Design Agreement', on:'start'}, target:{title:'Execute Pictures and Measure',   field:'due'}, base:'anchor.start', offsetDays:+7 },

  // Photos / measure branch
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Receive Deposit',                 field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Send P&M Review Email to Client', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:"Folder on Sarah's Desk",          field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Upload Pics to Google Photos',    field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Share Pics With Everyone on the Project', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Execute Pictures and Measure', on:'start'}, target:{title:'Send Initial Presentation to Client', field:'due'}, base:'anchor.start', offsetDays:+14 },

  // IP weekly double tap
  { when:{title:'Send Initial Presentation to Client', on:'start'}, target:{title:'Weekly Double Tap - Send IP to Client', field:'due'}, base:'anchor.start', offsetDays:+14, onlyIfBlank:true },
  { when:{title:'Weekly Double Tap - Send IP to Client', on:'start'}, target:{title:'Weekly Double Tap - Send IP to Client', field:'due'}, base:'anchor.start', offsetDays:+14 },

  // Client review → schedule specific presentation
  { when:{title:'Client Sends Review', on:'start'}, target:{title:'Schedule Specific Presentation', field:'due'}, base:'anchor.start', offsetDays:+21 },

  // Specific Presentation Meeting downstream
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Create Spreadsheet',                   field:'due'}, base:'anchor.start', offsetDays:-3 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Price Spreadsheet',                    field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Create Sub Packet for Quick Price',    field:'due'}, base:'anchor.start', offsetDays:-3 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Quick Price Cons',                     field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Designer Creates Sub Notes',           field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Send Sub Notes to Katie ',             field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Schedule Sub Meeting',                 field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Specific Presentation Meeting', on:'start'}, target:{title:'Sub Meeting',                          field:'due'}, base:'anchor.start', offsetDays:+14 },

  // After Sub Meeting
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Send Sum Meeting Review Email to Client', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Send Updates to Katie + Designer',        field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Update Sub Notes and Drawings Based on Feedback', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Price Construction Job',                  field:'due'}, base:'anchor.start', offsetDays:+28 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Schedule Final Pricing + Specifics Meeting', field:'due'}, base:'anchor.start', offsetDays:+28 },
  { when:{title:'Sub Meeting', on:'start'}, target:{title:'Final Pricing + Specifics Meeting',       field:'due'}, base:'anchor.start', offsetDays:+28 },

  // Final Pricing + Specifics Meeting fan-out
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Final pricing printout emailed or in client drawer', field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Final Pricing Printouts, Calendar, and Contract Ready in Client Drawer', field:'due'}, base:'anchor.start', offsetDays:0 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Send SP Review Email to Client', field:'due'}, base:'anchor.start', offsetDays:+1 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Designer Edits', field:'due'}, base:'anchor.start', offsetDays:+3 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Pricer Edits',   field:'due'}, base:'anchor.start', offsetDays:+3 },
  { when:{title:'Final Pricing + Specifics Meeting', on:'start'}, target:{title:'Sign Contract',   field:'due'}, base:'anchor.start', offsetDays:+7 },

  // Post Sign Contract fan-out
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
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Update construction start and completion date on lines', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Put Subcontractor Bills into Xero', field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Order Ferguson',                field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Add to Payment Calendar',       field:'due'}, base:'anchor.start', offsetDays:+7 },
  { when:{title:'Sign Contract', on:'start'}, target:{title:'Cadenced Follow Up to Designer and client', field:'due'}, base:'anchor.start', offsetDays:+7 },

  // Construction timeline anchors
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Designer meet with DJ',  field:'due'}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Designer do PSG sign offs', field:'due'}, base:'anchor.start', offsetDays:-14 },
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Final Friday Walkthrough', field:'due'}, base:'anchor.start', calc:'prevFriday' },

  // Weekly cadence
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'PMs Bring Change Orders', field:'due'}, base:'anchor.start', calc:'nextFriday' },
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Create Invoices and bills to Reflect Change Orders', field:'due'}, base:'anchor.start', calc:'nextFriday' },

  // Designer visits cadence
  { when:{title:'Final Friday Walkthrough', on:'start'}, target:{title:'Designer Visits Job', field:'due'}, base:'anchor.start', offsetDays:+14 },
  { when:{title:'Designer Visits Job',     on:'start'}, target:{title:'Designer Visits Job', field:'due'}, base:'anchor.start', calc:'secondFriday' },

  // Staged payments
  { when:{title:'Construction Job Starts', on:'start'}, target:{title:'Receive Payment 2', field:'due'}, base:'anchor.start', offsetDays:+28 },
  { when:{title:'Receive Payment 2',       on:'start'}, target:{title:'Receive Payment 3', field:'due'}, base:'anchor.start', offsetDays:+28 },

  // Completion anchors
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

  // Install chain
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

// ---------- Title normalization in DB (templates + project tasks) ----------
async function normalizeTemplateTitles(){
  const db = window.supabase;
  const { data: rows, error } = await db.from('task_templates')
    .select('id, title, position, created_at');
  if (error) { console.warn('template fetch:', error); return; }
  if (!rows?.length) return;

  // 1) Simple one-to-one renames
  for (const [oldTitle, newTitle] of SIMPLE_RENAMES){
    const hit = rows.filter(r => titlesEqual(r.title, oldTitle));
    for (const r of hit){
      await db.from('task_templates').update({ title: newTitle }).eq('id', r.id);
    }
  }

  // 2) Disambiguate the triple “Send Review Email to Client” in templates (rare, but handle)
  const triples = rows.filter(r => titlesEqual(r.title, TRIPLE_REVIEW_OLD))
    .sort((a,b)=>{
      const pa=(a.position??9e9), pb=(b.position??9e9);
      if (pa!==pb) return pa-pb;
      return String(a.created_at||'').localeCompare(String(b.created_at||''));
    });
  if (triples.length >= 1) await db.from('task_templates').update({ title: TRIPLE_REVIEW_NEW[0] }).eq('id', triples[0].id);
  if (triples.length >= 2) await db.from('task_templates').update({ title: TRIPLE_REVIEW_NEW[1] }).eq('id', triples[1].id);
  if (triples.length >= 3) await db.from('task_templates').update({ title: TRIPLE_REVIEW_NEW[2] }).eq('id', triples[2].id);
}

async function normalizeProjectTaskTitles(projectId){
  const db = window.supabase;
  const { data: rows, error } = await db.from('tasks')
    .select('id, title, position, created_at')
    .eq('project_id', projectId);
  if (error) { console.warn('project tasks fetch:', error); return; }
  if (!rows?.length) return;

  // 1) Simple renames
  for (const [oldTitle, newTitle] of SIMPLE_RENAMES){
    const hit = rows.filter(r => titlesEqual(r.title, oldTitle));
    for (const r of hit){
      await db.from('tasks').update({ title: newTitle }).eq('id', r.id);
    }
  }

  // 2) Disambiguate the three “Send Review Email to Client” by order within this project
  const triples = rows.filter(r => titlesEqual(r.title, TRIPLE_REVIEW_OLD))
    .sort((a,b)=>{
      const pa=(a.position??9e9), pb=(b.position??9e9);
      if (pa!==pb) return pa-pb;
      return String(a.created_at||'').localeCompare(String(b.created_at||''));
    });
  if (triples.length >= 1) await db.from('tasks').update({ title: TRIPLE_REVIEW_NEW[0] }).eq('id', triples[0].id);
  if (triples.length >= 2) await db.from('tasks').update({ title: TRIPLE_REVIEW_NEW[1] }).eq('id', triples[1].id);
  if (triples.length >= 3) await db.from('tasks').update({ title: TRIPLE_REVIEW_NEW[2] }).eq('id', triples[2].id);
}

// ---------- Next-due picker ----------
function findNextDueTaskId(tasks){
  if (!Array.isArray(tasks) || !tasks.length) return null;
  const today = ymdLocal();
  const open = tasks.filter(t => t.status !== 'done');

  const future = open.filter(t => t.due_date && t.due_date >= today)
    .sort((a,b) => (a.due_date === b.due_date)
      ? ((a.position??9e9) - (b.position??9e9))
      : a.due_date.localeCompare(b.due_date));
  if (future[0]) return future[0].id;

  const overdue = open.filter(t => t.due_date && t.due_date < today)
    .sort((a,b) => (a.due_date === b.due_date)
      ? ((a.position??9e9) - (b.position??9e9))
      : a.due_date.localeCompare(b.due_date));
  if (overdue[0]) return overdue[0].id;

  const byPos = open.slice().sort((a,b) => {
    const pa=(a.position??9e9), pb=(b.position??9e9);
    if (pa!==pb) return pa-pb;
    return String(a.created_at||'').localeCompare(String(b.created_at||''));
  });
  return byPos[0]?.id ?? null;
}

// ---------- Receive Final Payment highlight ----------
function _updateReceiveFinalPaymentHighlight(){
  const t = _findTaskByTitleOcc('Receive Final Payment', 1);
  if (!t) return;
  const row = document.getElementById(`task-${t.id}`);
  if (!row) return;
  const dueInput = row.querySelector('input[data-action="due"]');
  const today = ymdLocal();
  if (t.due_date && t.status !== 'done' && today >= t.due_date){
    if (dueInput){ dueInput.style.borderColor = '#b91c1c'; dueInput.style.background = 'rgba(220,38,38,.08)'; }
  } else if (dueInput){
    dueInput.style.borderColor = ''; dueInput.style.background = '';
  }
}
function adjustToWeekday(ymd) {
  if (!ymd) return ymd;
  const dt = new Date(ymd);
  const day = dt.getDay(); // 0=Sun, 6=Sat
  if (day === 6) dt.setDate(dt.getDate() + 2); // Saturday → Monday
  if (day === 0) dt.setDate(dt.getDate() + 1); // Sunday → Monday
  return dt.toISOString().slice(0,10);
}
// ---------- Apply date rules ----------
async function applyDateRulesAfterChange({ anchorTitle, fieldChanged, value }) {
  const db = window.supabase;
  if (!db || !_currentProjectId) return;

  // We only act when a START date changes (that’s how all rules are written)
  if (fieldChanged !== 'start') return;
  if (!value) return; // user cleared the date; nothing to propagate

  // Make sure our title index mirrors the latest _currentTasks
  _rebuildTitleIndex();

  const anchorNorm = _normTitle(anchorTitle);
  const relevant = DATE_RULES.filter(r =>
    _normTitle(r.when.title) === anchorNorm &&
    r.when.on === 'start'
  );

  if (!relevant.length) {
    // Helpful: you were probably editing the wrong anchor task
    // e.g., set "Schedule Initial Consultation" instead of "Have Initial Consultation"
    console.debug('[rules] No rules for anchor:', anchorTitle);
    return;
  }

  for (const rule of relevant) {
    const target = _findTaskByTitleOcc(rule.target.title, rule.target.occurrence || 1);
    if (!target) {
      console.debug('[rules] Target not found:', rule.target.title, rule.target.occurrence || 1);
      continue;
    }

    if (rule.onlyIfBlank) {
      const curr = (rule.target.field === 'due') ? target.due_date : target.start_date;
      if (curr) continue;
    }

    // NEW: If the target task already has a start date, don't let the anchor override it
      if (rule.skipIfTargetHasStart && target.start_date) {
      continue;
    }

    const baseYMD = value; // all rules use anchor.start
    let newYMD = _computeTargetYMD(baseYMD, rule);
if (!newYMD) continue;

if (rule.target.field === 'due') {
  const adjYMD = adjustToWeekday(newYMD);
  await updateTaskDue(target.id, adjYMD);
  target.due_date = adjYMD;

  const row = document.getElementById(`task-${target.id}`);
  const el  = row?.querySelector('input[data-action="due"]');
  if (el) {
    el.value = adjYMD;
    el.classList.remove('date-empty');
    el.dispatchEvent(new Event('input',  { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  }
} else {
  await updateTaskStart(target.id, newYMD);
  target.start_date = newYMD;

  const row = document.getElementById(`task-${target.id}`);
  const el  = row?.querySelector('input[data-action="start"]');
  if (el) {
    el.value = newYMD;
    el.classList.remove('date-empty');
    el.dispatchEvent(new Event('input',  { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  }
}
  }

  // Special highlight check for Receive Final Payment
  _updateReceiveFinalPaymentHighlight?.();
}

// --- Hard-wire: Send the Process Document (Start) -> Nudge Process Document (Due = +14, weekday-only)
async function forceNudgeDueFromSend(sendStartYMD) {
  if (!sendStartYMD) return;
  console.debug('[nudge-sync] setting Nudge due from Send start', sendStartYMD);

  // find the Nudge row from the in-memory list (no index assumptions)
  const target = (_currentTasks || []).find(
    t => _normTitle(t.title) === _normTitle('Nudge Process Document')
  );
  if (!target) return;

  // compute +14 then shift weekends to Monday
  const rawYMD = addDaysYMD(sendStartYMD, 14);
  const newYMD = adjustToWeekday(rawYMD);
  if (!newYMD) return;

  // persist
  await updateTaskDue(target.id, newYMD);
  target.due_date = newYMD;

  // update the input immediately so you see it without refresh
  const row = document.getElementById(`task-${target.id}`);
  const dueInput = row?.querySelector('input[data-action="due"]');
  if (dueInput) {
    dueInput.value = newYMD;
    dueInput.classList.remove('date-empty');
    dueInput.dispatchEvent(new Event('input', { bubbles: true }));
    dueInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// ---------- Lifecycle ----------
document.addEventListener('projectLoaded', (ev) => {
  console.log('[tasks] projectLoaded heard', ev?.detail?.id || ev?.detail);
  initTasksUI(ev.detail);
});

async function initTasksUI(project) {
  const db = window.supabase;
  if (!db || !project?.id) return;

  // 0) One-time normalization: update titles in templates and in this project's tasks
  try {
    await normalizeTemplateTitles();
  } catch(e){ console.warn('template title normalize failed:', e); }
  try {
    await normalizeProjectTaskTitles(project.id);
  } catch(e){ console.warn('project title normalize failed:', e); }

  // UI shell
  const listEl = document.getElementById('taskList');
  listEl.innerHTML = `
    <div class="info-card" style="padding:0;">
      <table id="tasksTable" class="tasks-table" style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0;">
        <thead>
  <tr style="border-bottom:1px solid #e6e8ee;">
    <th style="text-align:right; padding:.6rem; width:48px;">#</th>
    <th style="text-align:left;  padding:.6rem; width:180px;">Assignee</th>
    <th style="text-align:left;  padding:.6rem; width:220px;">Task</th>
    <th style="text-align:center; padding:.6rem; width:70px;">Done</th>
    <th style="text-align:left;  padding:.6rem; width:150px;">Start</th>
    <th style="text-align:left;  padding:.6rem; width:150px;">Due</th>
    <th style="text-align:left;  padding:.6rem;">Notes</th>
  </tr>
</thead>
        <tbody id="tasksBody"></tbody>
      </table>
    </div>
    <div id="tasksMsg" style="margin:.5rem 0; opacity:.75;"></div>
  `;

// Load tasks (post-normalization)
let tasks = [];
try {
  tasks = await loadTasks(db, project.id);
  console.log('[tasks] loaded', tasks?.length || 0);
} catch (e) {
  console.error('[tasks] load failed:', e);
  flash('Could not load tasks (see console).');
  tasks = [];
}

// If none exist, seed from template and reload
if (!tasks.length) {
  try {
    await seedFromTemplate(db, project);
    // normalize again in case the template titles were adjusted
    await normalizeProjectTaskTitles(project.id);
    tasks = await loadTasks(db, project.id);
    console.log('[tasks] seeded, now have', tasks.length);
    flash('Task list created from template.');
  } catch (e) {
    console.error('Auto-seed failed:', e);
    flash('Could not create tasks from template. Check console.');
  }
}

  // Stable order
  tasks = (tasks || []).slice().sort((a,b) => {
    const pa = (a.position ?? 999999), pb = (b.position ?? 999999);
    if (pa !== pb) return pa - pb;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  _currentProjectId = project.id;
  _currentTasks = tasks.slice();
  renderTasks(tasks);

  if (location.hash && location.hash.startsWith('#task-')) {
    maybeScrollToTaskFromHash();
  } else {
    const nextId = findNextDueTaskId(tasks);
    if (nextId) {
      requestAnimationFrame(() => {
        const row = document.getElementById(`task-${nextId}`);
        if (row) { row.scrollIntoView({ behavior:'smooth', block:'center' }); highlightRow(row); }
      });
    }
  }
  _updateReceiveFinalPaymentHighlight();
}

function flash(msg){ const el=document.getElementById('tasksMsg'); if(!el) return; el.textContent=msg||''; if(msg) setTimeout(()=> (el.textContent=''), 2500); }
async function loadTasks(db, projectId){
  const { data, error } = await db
    .from('tasks')
    .select('*')                           // <-- no join here
    .eq('project_id', projectId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}
function maybeScrollToTaskFromHash(){
  const id=(location.hash||'').slice(1); if(!id) return;
  const row=document.getElementById(id); if(!row) return;
  row.scrollIntoView({ behavior:'smooth', block:'center' }); highlightRow(row);
}
function highlightRow(row){
  const original=row.style.backgroundColor;
  row.style.backgroundColor='rgba(45,106,79,.12)';
  row.style.transition='background-color .6s ease';
  setTimeout(()=>{ row.style.backgroundColor=original||''; },1600);
}
window.addEventListener('hashchange', maybeScrollToTaskFromHash);

// ---------- Render ----------
function renderTasks(tasks){
  // Build a fresh title index in the exact row order we’re about to render
  _titleIndex = new Map();
  (tasks || []).forEach(t => {
    const key = _normTitle(t.title);
    if (!_titleIndex.has(key)) _titleIndex.set(key, []);
    _titleIndex.get(key).push(t.id);
  });
  _lineById = new Map();
  (tasks || []).forEach((t, i) => _lineById.set(String(t.id), i + 1));
  const body = document.getElementById('tasksBody');
  body.innerHTML = tasks.map(t => {
    // ... keep the rest of your existing renderTasks exactly as-is ...
    const selected = Array.isArray(t.assignees) ? t.assignees : (t.assignee ? [t.assignee] : []);
    const label = selected.length ? selected.join(', ') : '— Select —';
    const lineNum = _lineById.get(String(t.id)) || '';

return `
  <tr id="task-${t.id}" data-id="${t.id}" style="border-bottom:1px solid #f0f2f6;">
    <td class="line-num" style="padding:.5rem .6rem; text-align:right; opacity:.7; width:48px;">${lineNum}</td>
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
        <td style="padding:.5rem .6rem;">${esc(t.title)}</td>
        <td style="padding:.5rem .6rem; text-align:center;">
          <input type="checkbox" ${t.status === 'done' ? 'checked' : ''} data-action="toggleDone"/>
        </td>
        <td style="padding:.5rem .6rem;">
          <input type="date" autocomplete="off" value="${t.start_date ?? ''}" data-action="start"/>
        </td>
        <td style="padding:.5rem .6rem;">
          <input type="date" autocomplete="off" value="${t.due_date ?? ''}" data-action="due"/>
        </td>
        <td class="notes-cell" style="padding:.4rem .6rem;">
          <textarea class="notes-input${(t.notes && String(t.notes).trim()) ? ' filled' : ''}" data-action="notes" rows="1" placeholder="Notes…">${esc(t.notes)}</textarea>
        </td>
      </tr>
    `;
  }).join('');

  // Hide browser ghost text on empty date inputs
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

    row.querySelector('[data-action="assignee-toggle"]').addEventListener('click', (e) => {
      e.stopPropagation(); toggleAssigneeMenu(row);
    });

    row.querySelector('[data-action="assignee-apply"]').addEventListener('click', async () => {
      const values = Array.from(row.querySelectorAll('.assignee-menu input[type="checkbox"]:checked')).map(ch => ch.value);
      await updateTaskAssignees(id, values);
      row.querySelector('.assignee-label').textContent = values.length ? values.join(', ') : '— Select —';
      closeAssigneeMenus(); flash('Assignees updated.');
    });

    row.querySelector('[data-action="assignee-clear"]').addEventListener('click', async () => {
      Array.from(row.querySelectorAll('.assignee-menu input[type="checkbox"]')).forEach(ch => ch.checked = false);
      await updateTaskAssignees(id, []);
      row.querySelector('.assignee-label').textContent = '— Select —';
      closeAssigneeMenus(); flash('Assignees cleared.');
    });

const startHandler = async (e) => {
  const v = e.target.value || null;

  // Save start
  await updateTaskStart(id, v);

  // Update local cache
  const local = _currentTasks.find(x => String(x.id) === String(id));
  if (local) local.start_date = v;

  // *** NEW: if this row is "Send the Process Document", force Nudge due = start+14
  const thisTitle = local?.title || '';
  if (_normTitle(thisTitle) === _normTitle('Send the Process Document')) {
    await forceNudgeDueFromSend(v);
  }

  // Existing rule-engine cascade (keep this)
  await applyDateRulesAfterChange({
    anchorTitle: (local?.title ?? ''),
    fieldChanged: 'start',
    value: v
  });
  maybeRemindAfterStart(thisTitle);
  flash('Start date updated.');
};

// Fire when picker changes AND while editing
const startEl = row.querySelector('[data-action="start"]');
startEl.addEventListener('input', startHandler);
startEl.addEventListener('change', startHandler);

    row.querySelector('[data-action="due"]').addEventListener('change', async (e) => {
      let v = e.target.value || null;
      v = adjustToWeekday(v);
      await updateTaskDue(id, v);
      e.target.value = v; // reflect the corrected weekday in UI
      const local = _currentTasks.find(x => String(x.id) === String(id));
      if (local) local.due_date = v;
      await cascadeDependents(id);
      flash('Due date updated.');
    });

    row.querySelector('[data-action="toggleDone"]').addEventListener('change', async (e) => {
      const checked = e.target.checked;
      await updateTaskStatus(id, checked ? 'done' : 'todo');
      flash(checked ? 'Marked complete.' : 'Marked todo.');
      _updateReceiveFinalPaymentHighlight();
    });

    const notesEl = row.querySelector('[data-action="notes"]');
    const saveNotes = debounce(async (txt) => {
      const trimmed = (txt && txt.trim()) ? txt.trim() : null; await updateTaskNotes(id, trimmed);
    }, 600);
    autoResize(notesEl);
    notesEl.classList.toggle('filled', (notesEl.value || '').trim().length > 0);
    notesEl.addEventListener('input', (e) => { autoResize(notesEl); notesEl.classList.toggle('filled', e.target.value.trim().length>0); saveNotes(e.target.value); });
    notesEl.addEventListener('blur', async (e) => { await updateTaskNotes(id, (e.target.value && e.target.value.trim()) ? e.target.value.trim() : null); });
  });

  }
function syncDateEmptyClass(el){ const isEmpty = !el.value || String(el.value).trim()===''; el.classList.toggle('date-empty', isEmpty); }

// ---------- Assignee menu ----------
function toggleAssigneeMenu(row){
  const menu=row.querySelector('.assignee-menu'); if(!menu) return;
  const isOpen = menu.style.display!=='none' && !menu.classList.contains('hidden');
  if (isOpen){
    menu.classList.add('hidden'); menu.style.display='none'; _openAssigneeRow=null; return;
  }
  closeAssigneeMenus();
  menu.classList.remove('hidden'); menu.style.display='block';
  row.querySelector('.assignee-cell').style.position='relative';
  _openAssigneeRow=row.getAttribute('data-id');

  // add the outside-click listener now, so every open gets one
  const closer = (e) => { if (!e.target.closest('.assignee-cell')) { closeAssigneeMenus(); document.removeEventListener('click', closer); } };
  document.addEventListener('click', closer);
}
function closeAssigneeMenus(){ document.querySelectorAll('.assignee-menu').forEach(m=>{ m.classList.add('hidden'); m.style.display='none'; }); _openAssigneeRow=null; }

// ---------- Mutations ----------
async function updateTaskAssignees(taskId, whoList){
  const db=window.supabase; const first=(whoList && whoList.length)? whoList[0]: null;
  const { error } = await db.from('tasks').update({ assignees: whoList, assignee: first }).eq('id', taskId);
  if (error) throw error;
}
async function updateTaskStatus(taskId, status){
  const db=window.supabase; const payload={ status }; if (status==='done') payload.completed_at=new Date().toISOString();
  const { error } = await db.from('tasks').update(payload).eq('id', taskId); if (error) throw error;
}
async function updateTaskStart(taskId, dateStr){ const db=window.supabase; const { error }=await db.from('tasks').update({ start_date: dateStr }).eq('id', taskId); if (error) throw error; }
async function updateTaskDue(taskId, dateStr){ const db=window.supabase; const { error }=await db.from('tasks').update({ due_date: dateStr }).eq('id', taskId); if (error) throw error; }
async function updateTaskNotes(taskId, text){ const db=window.supabase; const { error }=await db.from('tasks').update({ notes: text }).eq('id', taskId); if (error) throw error; }

async function cascadeDependents(anchorTaskId){
  const db = window.supabase;

  // get the anchor's DUE date; if no due, nothing to propagate
  const { data: anchorRows, error: e1 } = await db
    .from('tasks')
    .select('due_date')
    .eq('id', anchorTaskId)
    .limit(1);
  if (e1) throw e1;

  const anchorDate = anchorRows?.[0]?.due_date || null;
  if (!anchorDate) return;

  // fetch dependents and apply offsets
  const { data: deps, error: e2 } = await db
    .from('task_dependencies')
    .select('task_id, offset_days')
    .eq('anchor_task_id', anchorTaskId);
  if (e2) throw e2;

  for (const d of (deps || [])) {
    const next = new Date(anchorDate);
    next.setDate(next.getDate() + (d.offset_days || 0));
    // shift Saturday/Sunday → Monday
    const isoShifted = adjustToWeekday(next.toISOString().slice(0,10));
    await updateTaskDue(d.task_id, isoShifted);
  }
}

// ---------- Seeding ----------
async function seedFromTemplate(db, project){
  const { data: tmpl, error } = await db.from('task_templates').select('*')
    .order('position', { ascending:true })
    .order('created_at', { ascending:true });
  if (error) throw error;
  if (!tmpl?.length) throw new Error('No task templates found.');

  const toInsert = tmpl.map(t => {
    const people = computeDefaultAssignees(t.role, project);
    return {
      project_id: project.id, template_id: t.id, title: t.title, role: t.role,
      assignee: people[0] || null, assignees: people, status:'todo',
      due_date: null, notes: null, position: t.position
    };
  });

  const { data: created, error: e1 } = await db.from('tasks').insert(toInsert).select('id, template_id');
  if (e1) throw e1;

  const map = new Map(created.map(r => [r.template_id, r.id]));
  const deps = tmpl
    .filter(t => t.schedule_kind === 'offset' && t.anchor_template_id)
    .map(t => ({ task_id: map.get(t.id), anchor_task_id: map.get(t.anchor_template_id), offset_days: t.offset_days || 0 }))
    .filter(d => d.task_id && d.anchor_task_id);
  if (deps.length){
    const { error: e2 } = await db.from('task_dependencies').insert(deps);
    if (e2) throw e2;
  }
}

// ---------- Default assignees ----------
function computeDefaultAssignees(role, project){
  if (!role) return [];
  const parts = role.split(/[,+]/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let p of parts){
    p = p.replace(/\.$/, '');
    const low = p.toLowerCase();
    if (!p) continue;
    if (low.includes('designer')) out.push(project.designer || 'Designer');
    else if (low === 'admin') out.push('Admin');
    else if (low === 'project manager' || low === 'pm') out.push('PM');
    else out.push(p);
  }
  return Array.from(new Set(out.filter(Boolean)));
}