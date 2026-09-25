"use strict";
/* ============================================================
   Adjustments Builder — state, preferences, wording engine
   ============================================================ */
const DB = JSON.parse(document.getElementById('adj-data').textContent);
const { domains: DOMAINS, domainActs: DOMACTS, activities: ACTS, levels: LEVELS,
        levelinfo: LEVELINFO, cats: CATS, roles: ROLE_CAT, items: ITEMS,
        roleCats: RCATS, roleSupports: RSUP, tiers: TIERS,
        vcLevels: VC_LEVELS, vcAreas: VC_AREAS, vcGuidance: VC_GUIDANCE } = DB;

const $ = s => document.querySelector(s);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const lc1 = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : '';
const uc1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const strip = s => String(s || '').replace(/\s*[.;]\s*$/, '');
const uniq = a => [...new Set(a)];

const K_SET = 'adjb.settings.v3';   // school preferences — survive "new student"
const K_STU = 'adjb.student.v3';    // the student being worked on

/* ---------- preference definitions ---------- */
const FIELD_DEFS = [
  ['level',      'Level of adjustment',         true],
  ['tier',       'Tier',                        true],
  ['category',   'Category',                    false],
  ['frequency',  'Frequency',                   true],
  ['intensity',  'Intensity',                   true],
  ['setting',    'Setting or trigger',          false],
  ['outcome',    'Access outcome',              false],
  ['roles',      'Who is responsible',          true],
  ['assigned',   'Named staff member',          false],
  ['evidence',   'Evidence to monitor',         true],
  ['evbase',     'Evidence this is based on',   false],
  ['specialist', 'Specialist or expert advice', false],
  ['voice',      'Student voice prompt',        false],
  ['independence','How support will fade',      false],
  ['status',     'Implementation status',       false],
  ['startdate',  'Start date',                  false],
  ['reviewdate', 'Review date',                 false],
  ['approver',   'Approved by and date',        false],
  ['notes',      'Notes',                       true],
  ['id',         'Record ID',                   false],
  ['vc',         'Curriculum link',             false],
];
/* FIELD_DEFS is plain data, so the school's own word for its curriculum is
   resolved when a label is displayed rather than baked into the table. */
function fieldLabel(key, label) { return key === 'vc' ? W('curriculum') + ' link' : label; }
const STRUCTURES = [
  ['role',     'Who does it, then what, then why',
   'The Classroom Teacher should provide …, most days, so David can …'],
  ['outcome',  'Why first, then who does what',
   'So that David can …, the Classroom Teacher should provide …, most days.'],
  ['setting',  'Where or when first',
   'During reading tasks, the Classroom Teacher should provide …, so David can …'],
  ['labelled', 'Labelled lines',
   'Adjustment: … / Frequency: … / Intensity: … / Who is responsible: …'],
  ['table',    'A table, one row per adjustment',
   'Columns: adjustment, frequency, intensity, who, access outcome'],
  ['source',   'Use the library wording unchanged',
   'The Classroom Teacher should provide …, supporting David to …'],
];
const AUDIENCES = [
  ['staff',   'Staff',
   'The Classroom Teacher should provide …, so David can …'],
  ['support', 'Support staff working to the plan',
   'Under teacher and plan direction, the Education Support Staff should provide …'],
  ['family',  'Family and carers',
   "David's teachers will provide …, so David can …"],
  ['student', 'The student, in their own words',
   'My teachers will provide …, so I can …'],
  ['log',     'A record of what was provided',
   'Adjustment provided for David: … This supported David to …'],
];
const EMPH_PARTS = [
  ['role',      'The role'],
  ['action',    'The action'],
  ['student',   "The student's name"],
  ['frequency', 'The frequency'],
  ['outcome',   'The access outcome'],
  ['setting',   'The setting or trigger'],
];
const EMPH_STYLES = [['none', 'Plain'], ['bold', 'Bold'], ['italic', 'Italic'], ['underline', 'Underlined']];
const COLOURS = [['', 'Same as the text'], ['#1f5872', 'Blue'], ['#8a3030', 'Red'], ['#2f6b4f', 'Green'],
                 ['#5b4a86', 'Purple'], ['#8a5a1f', 'Amber'], ['#5f6b7a', 'Grey']];
const STATUSES = ['Proposed', 'Agreed', 'In place', 'Under trial', 'Being faded', 'Ceased'];

function defaultTiers() {
  return TIERS.map((t, i) => ({ label: t.label, maps: i + 1 }));
}
function defaultSettings() {
  const fields = {}; FIELD_DEFS.forEach(([k, , on]) => fields[k] = on);
  return {
    v: 3,
    onboarded: false,
    roleLabels: {},                 // key -> the school's own label
    rolesOff: [],                   // roles this school does not have
    customRoles: [],                // [{key,label,hint}] added by the school
    staff: [],                      // [{name, role}]
    words: { student:'student', adjustment:'adjustment', level:'level of adjustment', plan:'plan', curriculum:'Curriculum' },
    showTiers: true,
    tierList: defaultTiers(),       // the school's own tier names, in their order
    structure: 'role',
    modal: 'should',
    includeSetting: false,
    audience: 'staff',
    emph:      { role:'bold', action:'none', student:'none', frequency:'none', outcome:'italic', setting:'none' },
    emphColor: { role:'',     action:'',     student:'',     frequency:'',     outcome:'',       setting:'' },
    fields,
    doc: { groupBy:'domain', cover:true, approvalBlock:false, guidance:true, ids:false,
           paper:'A4', font:11, org:'', logo:'', logoWidth:120, header:'', footer:'',
           colour:'#1f5872', bands:true, curriculumUrl:'' },
  };
}
let S = defaultSettings();

function blankStudent() {
  return { details: { name:'', pref:'', year:'', date: new Date().toISOString().slice(0,10),
                      by:'', review:'', context:'' },
           acts: {},      // activity index -> {level, state, picks}
           team: {} };    // support id -> pick   (chosen from the same navigator)
}
let ST = blankStudent();
let view = 'setup';
let curAct = null;        // number = activity index; 'team:<roleKey>' = a team section

/* ---------- persistence ---------- */
/* Storage can be unavailable: a private window, a full quota, or a managed
   browser with site data switched off. Never tell someone their work is saved
   when it is not — say so and point them at Save file.
   Failures are tracked per key, so a save that later succeeds clears the
   warning, but one key still failing (say, settings with a large logo) keeps it. */
const failedKeys = new Set();
let storageBroken = false;
function saveSettings() { flash(writeStore(K_SET, S)); }
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); failedKeys.delete(key); }
  catch (e) { failedKeys.add(key); }
  storageBroken = failedKeys.size > 0;
  return !failedKeys.has(key);
}
let flashT = null;
function flash(ok) {
  const h = $('#savedhint'); if (!h) return;
  clearTimeout(flashT);
  if (ok === false || storageBroken) {
    h.textContent = 'Not saved — this browser is not storing data. Use Save file.';
    h.classList.add('warnhint');
    h.title = 'Your work is only in this tab. Use Save file to keep it, and Open file to come back to it.';
    return;
  }
  h.classList.remove('warnhint');
  h.textContent = 'Saved'; h.title = '';
  flashT = setTimeout(() => h.textContent = 'Saved on this device', 1400);
}
/* Closing the tab is the moment unsaved work is lost. Only ask when storage
   is failing and there is something to lose. */
window.addEventListener('beforeunload', e => {
  if (!storageBroken || !studentHasContent(ST)) return;
  e.preventDefault(); e.returnValue = '';
});

/* ---------- students kept on this device ---------- */
/* Each student lives under its own key, with a small index of who is on the
   device. Typing only rewrites the current student, never the whole list.
   Older versions kept a single student under K_STU; loadAll moves it across. */
const K_ROSTER = 'adjb.roster.v1';
const K_STU_PREFIX = 'adjb.stu.';
let ROSTER = { current: '', list: [] };   // list: [{id, name, year, updated, count}]
const newStudentId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function studentPickCount(st) {
  return Object.values((st && st.acts) || {}).reduce((n, a) => n + Object.keys((a && a.picks) || {}).length, 0)
    + Object.keys((st && st.team) || {}).length;
}
function studentHasContent(st) {
  if (!st) return false;
  const d = st.details || {};
  return !!(String(d.name || '').trim() || String(d.pref || '').trim() || String(d.context || '').trim() || studentPickCount(st));
}
function rosterEntry(st) {
  return { id: st.id, name: (st.details && (st.details.name || st.details.pref)) || '',
           year: (st.details && st.details.year) || '', updated: st.updated || '', count: studentPickCount(st) };
}
function saveStudent() {
  if (!ST.id) ST.id = newStudentId();
  ST.updated = new Date().toISOString();
  const i = ROSTER.list.findIndex(r => r.id === ST.id);
  if (i < 0) ROSTER.list.push(rosterEntry(ST)); else ROSTER.list[i] = rosterEntry(ST);
  ROSTER.current = ST.id;
  const ok = writeStore(K_STU_PREFIX + ST.id, ST);
  flash(writeStore(K_ROSTER, ROSTER) && ok);
}
/* Older saves selected a library item without retaining the activity's
   prediction.  Migrate only that missing context; never rewrite teacher text. */
function normaliseStudent(raw) {
  const st = Object.assign(blankStudent(), raw || {});
  st.details = Object.assign(blankStudent().details, st.details || {});
  if (!st.acts || typeof st.acts !== 'object') st.acts = {};
  if (!st.team || typeof st.team !== 'object') st.team = {};
  Object.values(st.acts).forEach(a => {
    if (!a || !a.picks) return;
    Object.values(a.picks).forEach(p => {
      if (p && !Number.isInteger(p.level) && Number.isInteger(a.level)) p.level = a.level;
      if (p && !p.status) p.status = 'Proposed';
    });
  });
  Object.values(st.team).forEach(p => { if (p && !p.status) p.status = 'Proposed'; });
  return st;
}
function readStudent(id) {
  try { const r = localStorage.getItem(K_STU_PREFIX + id); return r ? normaliseStudent(JSON.parse(r)) : null; }
  catch (e) { return null; }
}
function switchStudent(id) {
  if (id === ST.id) { go('setup'); return; }
  const st = readStudent(id);
  if (!st) { alert('That ' + W('student') + ' could not be read from this device.'); return; }
  ST = st; ST.id = id; curAct = null; saveStudent(); go('setup');
}
function removeStudent(id) {
  const entry = ROSTER.list.find(r => r.id === id);
  const name = (entry && entry.name) || 'this ' + W('student');
  if (!confirm('Remove ' + name + ' from this device? This cannot be undone. Use Save file first if you want to keep a copy.')) return;
  try { localStorage.removeItem(K_STU_PREFIX + id); } catch (e) {}
  ROSTER.list = ROSTER.list.filter(r => r.id !== id);
  if (id === ST.id) {
    const next = ROSTER.list.slice().sort((a, b) => String(b.updated).localeCompare(String(a.updated)))[0];
    const st = next && readStudent(next.id);
    ST = st ? Object.assign(st, { id: next.id }) : blankStudent();
    curAct = null;
    if (!st) ROSTER.current = '';
  }
  if (ST.id) saveStudent(); else flash(writeStore(K_ROSTER, ROSTER));
  go('setup');
}

function loadAll() {
  try { const r = localStorage.getItem(K_SET); if (r) S = Object.assign(defaultSettings(), JSON.parse(r)); } catch (e) {}
  const d = defaultSettings();
  ['fields', 'emph', 'emphColor', 'doc', 'words'].forEach(k => S[k] = Object.assign(d[k], S[k] || {}));
  if (!Array.isArray(S.tierList) || !S.tierList.length) S.tierList = defaultTiers();
  if (!Array.isArray(S.customRoles)) S.customRoles = [];
  try {
    const r = localStorage.getItem(K_ROSTER);
    if (r) { const x = JSON.parse(r); if (x && Array.isArray(x.list)) ROSTER = { current: x.current || '', list: x.list }; }
  } catch (e) {}
  if (ROSTER.current) {
    const st = readStudent(ROSTER.current);
    if (st) { ST = st; ST.id = ROSTER.current; }
  }
  /* one-off move from the single-student save used before the list existed */
  let legacy = null;
  try { const r = localStorage.getItem(K_STU); if (r) legacy = normaliseStudent(JSON.parse(r)); } catch (e) {}
  if (legacy) {
    if (studentHasContent(legacy)) {
      const keep = ST; ST = legacy; ST.id = ST.id || newStudentId(); saveStudent();
      if (keep.id && keep.id !== ST.id) { ST = keep; saveStudent(); }
    }
    if (!storageBroken) { try { localStorage.removeItem(K_STU); } catch (e) {} }
  }
}

/* ---------- roles ---------- */
function allRoles() { return ROLE_CAT.concat(S.customRoles || []); }
function roleDef(key) { return allRoles().find(r => r.key === key) || { key, label: key, hint: '' }; }
const roleLabel = key => S.roleLabels[key] || roleDef(key).label || key;
const roleOn = key => !S.rolesOff.includes(key);
const rolesInUse = () => allRoles().filter(r => roleOn(r.key));

/* ---------- words, levels, tiers ---------- */
const W = k => S.words[k] || k;
const AN = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const levelLabel = i => LEVELS[i];
const tierNum = t => /Tier 1/.test(t) ? 1 : /Tier 3/.test(t) ? 3 : 2;
/* the school's own name for the tier a library record maps to */
function tierFull(n) {
  const row = (S.tierList || []).find(t => t.maps === n);
  return row ? row.label : (TIERS[n - 1] || {}).label || ('Tier ' + n);
}
const tierShort = s => String(s).split(/\s[\u2013\u2014-]\s/)[0];
function tierLabel(t) {
  if (/coordination dependent/i.test(t)) return tierShort(tierFull(2)) + ' or ' + tierShort(tierFull(3));
  return tierFull(tierNum(t));
}
function prefName(sample) {
  if (sample) return 'David';
  return (ST.details.pref || ST.details.name || 'the ' + W('student')).trim();
}
/* Neutral pronoun defaults for bank placeholders (DI-297). The bank carries
   {heshethey} / {himherthem} / {hishertheir} alongside {preferredName}, but
   the builder holds no pronoun preference, so render the neutral forms
   everywhere a name placeholder is already resolved. Personalised pronouns
   belong to DI-133; until then neutral is always safe and never leaks a
   raw {token} into handed-out text. */
function resolvePronouns(v) {
  return String(v || '').replace(/\{heshethey\}/g, 'they')
    .replace(/\{himherthem\}/g, 'them').replace(/\{hishertheir\}/g, 'their');
}

/* ---------- Curriculum ---------- */
function vcLevelLabel(code) {
  const r = (VC_LEVELS || []).find(l => l.code === code);
  return r ? r.label : code;
}
function vcAreaLabel(code) {
  const r = (VC_AREAS || []).find(a => a.code === code || a.label === code);
  return r ? r.label : code;
}
function vcLinkFor(pick) {
  if (!pick) return '';
  const parts = [];
  if (pick.vcArea) parts.push(vcAreaLabel(pick.vcArea));
  if (pick.vcLevel) parts.push(vcLevelLabel(pick.vcLevel));
  if (pick.vcCode) parts.push(pick.vcCode);
  return parts.join(' · ');
}

/* ============================================================
   Wording engine — every adjustment is composed from its parts
   ============================================================ */
/* A selected prediction produces a proposal.  It is deliberately separate from
   the bank record's source level: a teacher can keep a useful action while
   reconsidering the level for this activity. */
function levelForRecommendation(it, pick) {
  /* Number(null) is 0.  An omitted level in an older save must inherit the
     activity prediction, rather than quietly becoming the lowest level. */
  const raw = pick && pick.level;
  const chosen = raw === null || raw === '' || raw === undefined ? NaN : Number(raw);
  if (Number.isInteger(chosen) && chosen >= 0 && chosen < LEVELS.length) return chosen;
  return Number.isInteger(it && it.l) && it.l >= 0 && it.l < LEVELS.length ? it.l : 2;
}
function recommendedDefaultsFor(level) {
  return [
    { frequency: 'available every day in the relevant setting', intensity: 'ordinary accessible arrangements, with assistance only when a current observed need arises' },
    { frequency: 'in every relevant lesson and when each new task is introduced', intensity: 'ordinary responsive teaching, with a brief individual check before independent work' },
    { frequency: 'every time an unfamiliar task is introduced or at identified times across the week', intensity: 'targeted personalised support with one or two individual checks or prompts' },
    { frequency: 'every day across most relevant lessons', intensity: 'frequent personalised support with regular individual prompting and monitoring throughout each relevant multi-step task' },
    { frequency: 'throughout every relevant activity while the functional barrier is present', intensity: 'sustained, highly personalised support at each stage of unfamiliar or complex tasks' },
  ][Math.max(0, Math.min(4, Number(level) || 0))];
}
function hasOperationalIntensity(value) {
  return /\b(each|every|throughout|before|during|at\s+(?:the|each)|check|prompt|monitor|individual|stage|minute|sustain|regular|active)\b/i.test(String(value || ''));
}
/* Every library record carries one of the five level-wide intensity summaries
   ("Regular, planned and personalised; at specific times/settings"). They are
   level labels, not sentence parts, so they never go into the wording; the
   level's written default is used instead. */
const LEVEL_INTENSITIES = new Set(LEVELINFO.map(l => String(l.intensity || '').trim().toLowerCase()));
function isGenericBankIntensity(value) {
  const v = String(value || '').trim().toLowerCase();
  return LEVEL_INTENSITIES.has(v)
    || /sustained,?\s*highly individuali[sz]ed\s*;\s*consistently across activity\/settings/i.test(v);
}
function usableIntensity(value) {
  return hasOperationalIntensity(value) && !isGenericBankIntensity(value);
}
/* Keep blank fields useful in the editor: they mean "use the proposed
   default", not "show an empty control". */
function editorValueFor(kind, it, pick, key) {
  const raw = pick && pick[key];
  if (raw !== null && raw !== undefined && String(raw).trim()) return raw;
  return effectiveParts(kind, it, pick, false)[key] || '';
}
function tierForRecommendation(kind, it, pick) {
  if (kind === 'team') return tierFull(it.tier);
  return tierLabel(LEVELINFO[levelForRecommendation(it, pick)].tier);
}
function selectableRolesFor(pick) {
  const current = pick && pick.role ? String(pick.role) : '';
  const active = rolesInUse();
  if (current && !active.some(r => r.key === current)) active.push(roleDef(current));
  return active;
}
function changeActivityPrediction(activity, nextLevel) {
  const previous = activity.level;
  activity.level = nextLevel;
  activity.state = 'set';
  if (previous !== nextLevel) Object.values(activity.picks || {}).forEach(pick => {
    if (!pick) return;
    pick.previousLevel = Number.isInteger(pick.level) ? pick.level : previous;
    pick.level = nextLevel;
    pick.reviewNeeded = true;
  });
  return activity;
}
function implementationStatus(pick) {
  return (pick && pick.status) || 'Proposed';
}
function canRecordImplementation(pick) {
  if (!pick || !String(pick.startdate || '').trim() || !String(pick.observation || '').trim()) return false;
  return ['In place', 'Under trial', 'Being faded', 'Ceased'].includes(implementationStatus(pick));
}
function responsibilityFor(kind, it, pick) {
  const requested = pick && pick.role ? [pick.role]
    : (kind === 'team' ? [it.role] : ((it.rk && it.rk.length) ? it.rk : ['classroom_teacher']));
  const active = requested.filter(roleOn);
  const qualified = String((it && it.rq) || '').trim();
  if (active.length) {
    const names = active.map(roleLabel);
    const label = names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names[0];
    return qualified ? label + ' (' + qualified + ')' : label;
  }
  const unavailable = requested.map(roleLabel).join(' or ') || 'Selected role';
  const nominee = qualified ? 'a nominee with the required qualification (' + qualified + ')' : 'an appropriate available nominee';
  return 'Classroom Teacher (accountable; role unavailable: ' + unavailable + '; nominate ' + nominee + ')';
}
function effectiveParts(kind, it, pick, sample) {
  const nm = prefName(sample);
  const tok = v => resolvePronouns(String(v || '').replace(/\{preferredName\}/g, nm));
  const join = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1] : (a[0] || '');
  const chosenLevel = levelForRecommendation(it, pick);
  const defaults = recommendedDefaultsFor(chosenLevel);
  if (kind === 'team') {
    return { role: responsibilityFor(kind, it, pick), supportRole: roleLabel('support_staff'),
             action: lc1(strip((pick && pick.action) || it.action)), setting: strip((pick && pick.setting) || ''),
             frequency: strip((pick && pick.frequency) || it.frequency || defaults.frequency),
             intensity: strip((pick && pick.intensity) || it.intensity || defaults.intensity),
             outcome: lc1(strip((pick && pick.outcome) || '')), student: nm, wording: tok(it.wording), level: chosenLevel };
  }
  const rl = ((it.rk || []).filter(roleOn).length ? it.rk.filter(roleOn) : (it.rk || ['classroom_teacher'])).map(roleLabel);
  const sup = (it.sk || []).filter(roleOn).map(roleLabel);
  const sourceMatchesPrediction = chosenLevel === it.l;
  const sourceIntensity = sourceMatchesPrediction && usableIntensity(tok(it.i)) ? tok(it.i) : '';
  const chosenIntensity = (pick && pick.intensity) || sourceIntensity || defaults.intensity;
  /* a teacher's own vague intensity is kept and given the level's concrete
     default alongside; the default itself is never doubled up */
  const intensity = usableIntensity(chosenIntensity) || chosenIntensity === defaults.intensity ? chosenIntensity
    : (chosenIntensity ? chosenIntensity + ', with ' + defaults.intensity : defaults.intensity);
  return {
    role: responsibilityFor(kind, it, pick) || join(rl),
    supportRole: sup.length ? join(sup) : roleLabel('support_staff'),
    action: lc1(strip(tok((pick && pick.action) || it.at || it.ac))),
    setting: strip(tok((pick && pick.setting) || it.ctx)).replace(/;\s*/g, ', '),
    frequency: strip(tok((pick && pick.frequency) || (sourceMatchesPrediction ? it.f : '') || defaults.frequency)),
    intensity: strip(tok(intensity)),
    outcome: lc1(strip(tok((pick && pick.outcome) || it.ao || 'participate in the relevant activity'))),
    student: nm,
    level: chosenLevel,
  };
}
/* Retain the older public helper while exports use the explicit effective name. */
function parts(it, kind, sample, pick) { return effectiveParts(kind, it, pick, sample); }
const SEG = (t, v) => ({ t, v });
const BR = () => SEG('br', '\n');
function lowerFirst(segs) {
  const c = (segs || []).map(s => ({ ...s }));
  if (c[0] && c[0].t === 'text') c[0].v = lc1(c[0].v);
  return c;
}
function frame(aud, p) {
  switch (aud) {
    case 'support': return { subj: [SEG('text','Under teacher and plan direction, the '), SEG('role', p.supportRole)], who: p.student };
    case 'student': return { subj: [SEG('text','My teachers')], who: 'I', first: true };
    case 'family':  return { subj: [SEG('student', p.student), SEG('text',"'s teachers")], who: p.student, plural: true };
    case 'log':     return { subj: null, who: p.student };
    default:        return { subj: [SEG('text','The '), SEG('role', p.role)], who: p.student };
  }
}
function labelledSegs(p, who) {
  const rows = [
    [uc1(W('adjustment')), [SEG('action', uc1(p.action))]],
    ['Frequency', p.frequency ? [SEG('frequency', uc1(p.frequency))] : null],
    ['Intensity', p.intensity ? [SEG('text', p.intensity)] : null],
    ['Who is responsible', [SEG('role', p.role)]],
    ['Setting or trigger', p.setting ? [SEG('setting', uc1(p.setting))] : null],
    ['Access outcome', p.outcome ? [who, SEG('text',' can '), SEG('outcome', p.outcome)] : null],
  ];
  const out = [];
  rows.filter(r => r[1]).forEach((r, i) => {
    if (i) out.push(BR());
    out.push(SEG('text', r[0] + ': '), ...r[1]);
  });
  return out;
}
function compose(it, kind, sample, pick) {
  const p = effectiveParts(kind, it, pick, sample);
  const aud = S.audience, f = frame(aud, p);
  const who = f.who === 'I' ? SEG('text','I') : SEG('student', f.who);

  if (kind === 'team') {
    /* team entries carry their own fuller sentence; the tokens are already substituted.
       The commitment word is swapped in so the school's should/will/must/is to choice applies. */
    if (S.structure === 'labelled' || S.structure === 'table') return labelledSegs(p, who);
    const out = [];
    String(p.wording).split(/(\{role\})/).forEach(chunk => {
      if (chunk === '{role}') out.push(SEG('role', p.role));
      else if (chunk) out.push(SEG('text', chunk));
    });
    let swapped = false;
    return out.map(s => {
      if (!swapped && s.t === 'text' && s.v.includes(' should ')) {
        swapped = true;
        return { t: s.t, v: s.v.replace(' should ', ' ' + S.modal + ' ') };
      }
      return s;
    });
  }

  const modal = (S.modal === 'is to' && (f.plural || f.first)) ? 'are to' : S.modal;
  const setSeg = S.includeSetting && p.setting ? [SEG('text',' during '), SEG('setting', p.setting)] : [];
  const freqSeg = p.frequency ? [SEG('text',', '), SEG('frequency', p.frequency)] : [];
  const intensitySeg = p.intensity ? [SEG('text', /^with\s/i.test(p.intensity) ? ', ' : ', with '), SEG('intensity', p.intensity)] : [];
  const act = [SEG('action', p.action)];
  const outSeg = [SEG('outcome', p.outcome)];

  if (S.structure === 'labelled' || S.structure === 'table') return labelledSegs(p, who);

  if (aud === 'log') {
    if (!canRecordImplementation(pick)) {
      return [SEG('text', 'Proposed ' + W('adjustment') + ' for '), who,
              SEG('text', ' (not recorded as implemented): '), SEG('action', uc1(p.action)), ...setSeg, ...freqSeg, ...intensitySeg, SEG('text', '.')];
    }
    return [SEG('text', 'Implementation record for '), who, SEG('text', ' (' + implementationStatus(pick) + ', ' + pick.startdate + '): '),
            SEG('action', uc1(p.action)), ...setSeg, ...freqSeg, ...intensitySeg, SEG('text', '. Observed response: '),
            SEG('text', String(pick.observation).trim()), SEG('text', '.')];
  }
  if (S.structure === 'source') {
    return [...f.subj, SEG('text',' ' + modal + ' '), ...act, ...setSeg, ...freqSeg, ...intensitySeg,
            SEG('text',', supporting '), who, SEG('text',' to '), ...outSeg, SEG('text','.')];
  }
  if (S.structure === 'outcome') {
    return [SEG('text','So that '), who, SEG('text',' can '), ...outSeg, SEG('text',', '),
            ...lowerFirst(f.subj), SEG('text',' ' + modal + ' '), ...act, ...setSeg, ...freqSeg, ...intensitySeg, SEG('text','.')];
  }
  if (S.structure === 'setting' && p.setting) {
    return [SEG('text','During '), SEG('setting', p.setting), SEG('text',', '),
            ...lowerFirst(f.subj), SEG('text',' ' + modal + ' '), ...act, ...freqSeg, ...intensitySeg,
            SEG('text',', so '), who, SEG('text',' can '), ...outSeg, SEG('text','.')];
  }
  return [...f.subj, SEG('text',' ' + modal + ' '), ...act, ...setSeg, ...freqSeg, ...intensitySeg,
          SEG('text',', so '), who, SEG('text',' can '), ...outSeg, SEG('text','.')];
}
function segText(segs) { return segs.map(s => s.t === 'br' ? '\n' : s.v).join(''); }
function segHtml(segs) {
  return segs.map(s => {
    if (s.t === 'br') return '<br>';
    const v = esc(s.v);
    if (s.t === 'text') return v;
    const style = S.emph[s.t] || 'none', colour = S.emphColor[s.t] || '';
    let out = v;
    if (style === 'bold') out = '<b>' + out + '</b>';
    else if (style === 'italic') out = '<i>' + out + '</i>';
    else if (style === 'underline') out = '<u>' + out + '</u>';
    if (colour) out = '<span style="color:' + colour + '">' + out + '</span>';
    return out;
  }).join('');
}
function wordingFor(kind, obj, sample, pick) { return compose(obj, kind, sample, pick); }
function isFullTextOverride(pick) { return !!(pick && pick.custom && String(pick.text || '').trim()); }
function recommendationLabel(pick) {
  /* The only label left describes what the entry is, not how it was drafted:
     in evidence/log mode an entry can be a record of what was actually provided.
     Adjustments are chosen deliberately by a teacher, so they are not tagged. */
  if (S.audience === 'log' && canRecordImplementation(pick)) return '[Implementation record] ';
  return '';
}
function recommendationText(kind, obj, pick, sample) {
  const label = recommendationLabel(pick);
  return label + (isFullTextOverride(pick) ? String(pick.text).trim() : segText(compose(obj, kind, sample, pick)));
}
function recommendationHtml(kind, obj, pick, sample) {
  const label = recommendationLabel(pick);
  const tag = label ? '<span class="tiny">' + esc(label) + '</span>' : '';
  if (isFullTextOverride(pick)) return tag + esc(pick.text).replace(/\n/g, '<br>');
  return tag + segHtml(compose(obj, kind, sample, pick));
}

/* the five columns used when a school chooses the table layout */
function tableCells(kind, obj, pick, sample) {
  const p = effectiveParts(kind, obj, pick, sample);
  const nm = prefName(sample);
  return {
    adjustment: isFullTextOverride(pick) ? recommendationHtml(kind, obj, pick, sample) : segHtml([SEG('action', uc1(p.action))]),
    frequency: esc(p.frequency), intensity: esc(p.intensity),
    who: segHtml([SEG('role', p.role)]),
    outcome: p.outcome ? esc(nm + ' can ' + p.outcome) : '',
  };
}

/* custom adjustments teachers add themselves inside an activity */
function customCatIdx() {
  let i = CATS.indexOf('Custom');
  if (i < 0) { CATS.push('Custom'); i = CATS.length - 1; }
  return i;
}
function customObj(ai, ce, level) {
  return { id: ce.id, a: ai, l: level == null ? 2 : level, c: customCatIdx(),
    rk: ['classroom_teacher'], sk: [], ac: ce.action || ce.text, at: '', ao: '', ctx: '', f: '', i: '',
    ev: [], sv: '', ind: '', sc: 0, rp: 0, rt: 0, cm: 0, st: 'custom',
    isCustom: true, ce };
}

/* ---------- the preview example is always David Gill ---------- */
const SAMPLE = ITEMS.find(i => ACTS[i.a] === 'Reading' && i.l === 2 && i.ctx) || ITEMS[0];
const SAMPLE_PICK = { note:'Started 2 February. Working well in English, harder in Science.',
  assigned:'David Gill', approver:'A. Nguyen, 14 February',
  evbase:'Term 4 reading assessment; two classroom observations',
  specialist:'Speech pathology report, November', status:'In place',
  startdate:'2026-02-02', reviewdate:'2026-06-20' };
/* A setup-guide step can force the demo into sentence form (e.g. the
   commitment-word question when the school uses a labelled/table layout). */
let previewStructOverride = null;
function samplePreviewHtml() {
  const savedStruct = S.structure;
  if (previewStructOverride) S.structure = previewStructOverride;
  try {
  let h = '<div class="lbl">Example — ' + esc(DOMAINS[SAMPLE.d]) + ' › ' + esc(ACTS[SAMPLE.a]) + '</div>';
  if (S.structure === 'table') {
    const c = tableCells('activity', SAMPLE, null, true);
    h += '<table><tr><th>' + esc(uc1(W('adjustment'))) + '</th><th>Frequency</th><th>Intensity</th>'
      + '<th>Who</th><th>Access outcome</th></tr><tr><td>' + c.adjustment + '</td><td>' + c.frequency
      + '</td><td>' + c.intensity + '</td><td>' + c.who + '</td><td>' + c.outcome + '</td></tr></table>';
  } else {
    h += '<div>' + segHtml(compose(SAMPLE, 'activity', true)) + '</div>';
  }
  const rows = detailRows('activity', SAMPLE, SAMPLE_PICK, true);
  if (rows.length) h += '<table>' + rows.map(r => '<tr><th>' + esc(r[0]) + '</th><td>' + r[1] + '</td></tr>').join('') + '</table>';
    return h;
  } finally { S.structure = savedStruct; }
}

/* ---------- detail rows, filtered by what the school records ---------- */
function detailRows(kind, obj, pick, sample) {
  const F = S.fields, out = [], p = pick || {}, effective = effectiveParts(kind, obj, pick, sample);
  const t = v => resolvePronouns(String(v || '').replace(/\{preferredName\}/g, prefName(sample)));
  const add = (k, label, val) => { if (F[k] && val) out.push([label, esc(val)]); };
  const inSentence = S.structure === 'labelled' || S.structure === 'table';
  if (kind === 'activity') {
    add('level', uc1(W('level')), levelLabel(effective.level));
    if (S.showTiers) add('tier', 'MTSS tier', p.tier || tierLabel(LEVELINFO[effective.level].tier));
    add('category', 'Category', CATS[obj.c]);
    if (!inSentence) { add('frequency', 'Frequency', effective.frequency); add('intensity', 'Intensity', effective.intensity); }
    if (!inSentence) add('setting', 'Setting or trigger', effective.setting);
    if (!inSentence) add('outcome', 'Access outcome', uc1(effective.outcome));
    if (!inSentence) add('roles', 'Who is responsible', effective.role
      + ((obj.sk || []).filter(roleOn).length ? ', with ' + (obj.sk || []).filter(roleOn).map(roleLabel).join(', ') : ''));
    add('evidence', 'Evidence to monitor', t((obj.ev || []).join('; ')));
    add('voice', 'Student voice prompt', t(obj.sv));
    add('independence', 'How support will fade', t(obj.ind));
    add('id', 'Record ID', obj.id);
  } else {
    if (S.showTiers) add('tier', 'MTSS tier', p.tier || tierFull(obj.tier));
    add('category', 'Category', obj.category);
    if (!inSentence) { add('frequency', 'Frequency', effective.frequency); add('intensity', 'Intensity', effective.intensity); }
    if (!inSentence) add('roles', 'Who is responsible', effective.role);
    add('evidence', 'Evidence to monitor', (obj.evidence || []).join('; '));
    add('id', 'Record ID', obj.id);
  }
  add('assigned', 'Named staff member', p.assigned);
  add('evbase', 'Evidence this is based on', p.evbase);
  add('specialist', 'Specialist or expert advice', p.specialist);
  /* Implementation tracking remains visible even when a school hides optional
     questionnaire fields. */
  out.push(['Implementation status', esc(implementationStatus(p))]);
  if (p.reviewNeeded) out.push(['Level-change review', esc('Review needed: predicted level changed'
    + (Number.isInteger(p.previousLevel) && p.previousLevel >= 0 && p.previousLevel <= 4 ? ' from ' + levelLabel(p.previousLevel) : '')
    + ' to ' + levelLabel(effective.level) + '.')]);
  add('startdate', 'Start date', p.startdate);
  if (canRecordImplementation(p)) out.push(['Observed response', esc(p.observation)]);
  add('reviewdate', 'Review date', p.reviewdate);
  add('approver', 'Approved by', p.approver);
  if (F.vc) {
    if (p.vcArea || p.vcLevel || p.vcCode) out.push([W('curriculum'), esc(vcLinkFor(p))]);
    if (p.vcDesc) out.push(['Content description', esc(p.vcDesc)]);
    if (p.vcElab) out.push(['Elaboration', esc(p.vcElab)]);
    if (p.vcAdvice) out.push([W('curriculum') + ' advice', esc(p.vcAdvice)]);
  }
  add('notes', 'Notes', p.note);
  return out;
}
function flagsFor(kind, obj) {
  const f = [];
  if (kind === 'activity') {
    if (obj.sc) f.push('Safety critical');
    if (obj.cm) f.push('Check what the task is assessing');
    if (obj.rp) f.push(obj.rp === 2 ? 'Plan required by context' : 'Plan recommended');
    if (obj.rt) f.push('Staff training required');
  } else {
    const g = obj.flags || {};
    if (g.safety) f.push('Safety critical');
    if (g.curriculum) f.push('Check what the task is assessing');
    if (g.plan) f.push(g.plan === 2 ? 'Plan required by context' : 'Plan recommended');
    if (g.training) f.push('Staff training required');
  }
  return f;
}

/* ============================================================
   Curriculum packs — search real content descriptions instead of
   copying codes across from another website by hand.
   Packs ship gzipped; they are inflated once, on first use.
   ============================================================ */
const CURRICULA = (DB.curricula || []);
const curriculumCache = {};

const CURR_CSS = `
.currbox{border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:6px 0;background:#fbfdfe}
.currbox .hits{max-height:220px;overflow:auto;margin-top:6px}
.currbox .hit{display:block;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid var(--line2);
  padding:6px 4px;color:var(--ink);font-size:12.5px;cursor:pointer}
.currbox .hit:hover{background:var(--accent2)}
.currbox .hit b{display:block;font-size:12px;color:var(--accent)}
.currbox .hit span{color:var(--muted)}
.currbox .cite{font-size:11px;color:var(--faint);margin-top:6px;display:block}
.currpicked{background:var(--accent2);border-radius:6px;padding:6px 8px;font-size:12.5px;margin:6px 0}
`;
(() => { const s = document.createElement('style'); s.textContent = CURR_CSS; document.head.append(s); })();

function curriculumAvailable() {
  return CURRICULA.length > 0 && typeof DecompressionStream === 'function';
}
function curriculumPack(id) {
  return CURRICULA.find(p => p.id === id) || CURRICULA[0] || null;
}
/* inflate the pack the first time something asks for it */
async function curriculumItems(id) {
  const pack = curriculumPack(id);
  if (!pack) return [];
  if (curriculumCache[pack.id]) return curriculumCache[pack.id];
  if (typeof DecompressionStream !== 'function') return [];
  const bin = Uint8Array.from(atob(pack.gz), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  curriculumCache[pack.id] = JSON.parse(text);
  return curriculumCache[pack.id];
}
/* code, description, learning area and level all searchable; terms are ANDed */
function curriculumSearch(items, query, area, level) {
  const q = String(query || '').trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const it of items) {
    if (area && it.a !== area) continue;
    if (level && it.l !== level) continue;
    if (terms.length) {
      const hay = (it.c + ' ' + it.d + ' ' + it.a + ' ' + it.sub + ' ' + it.s + ' ' + it.ss).toLowerCase();
      if (!terms.every(t => hay.includes(t))) continue;
    }
    out.push(it);
    if (out.length >= 40) break;
  }
  return out;
}
function curriculumFacets(items, key) {
  return [...new Set(items.map(i => i[key]).filter(Boolean))].sort();
}

/* The picker. Writes into the same pick fields the manual form uses, so saved
   students from before this feature keep working. */
function curriculumPicker(p, onPick) {
  const pack = curriculumPack(S.curriculumPack);
  const box = el('div', 'currbox');
  if (!curriculumAvailable()) {
    box.append(el('p', 'tiny', !CURRICULA.length
      ? 'No curriculum is loaded, so codes are typed by hand below.'
      : 'This browser cannot unpack the curriculum data, so codes are typed by hand below.'));
    return box;
  }
  const row = el('div', 'tools'); row.style.margin = '0 0 4px';
  const q = el('input'); q.type = 'text';
  q.placeholder = 'Search ' + pack.name + ' — a word, or a code';
  q.setAttribute('aria-label', 'Search ' + pack.name);
  q.style.maxWidth = '100%';
  const areaSel = el('select'); areaSel.append(new Option('All learning areas', ''));
  areaSel.setAttribute('aria-label', 'Learning area');
  const levSel = el('select'); levSel.append(new Option('All levels', ''));
  levSel.setAttribute('aria-label', 'Level');
  row.append(q, areaSel, levSel);
  box.append(row);
  const hits = el('div', 'hits');
  box.append(hits);
  const cite = el('span', 'cite', pack.attribution + ' ' + pack.source);
  box.append(cite);

  let items = [];
  const draw = () => {
    hits.innerHTML = '';
    const found = curriculumSearch(items, q.value, areaSel.value, levSel.value);
    if (!q.value.trim() && !areaSel.value && !levSel.value) {
      hits.append(el('p', 'tiny', pack.count + ' content descriptions. Type a word to search.'));
      return;
    }
    if (!found.length) { hits.append(el('p', 'tiny', 'Nothing matches.')); return; }
    found.forEach(it => {
      const b = el('button', 'hit'); b.type = 'button';
      b.append(el('b', null, it.c + ' · ' + it.l + ' · ' + it.a + (it.sub && it.sub !== it.a ? ' (' + it.sub + ')' : '')));
      b.append(el('span', null, it.d));
      b.onclick = () => {
        p.vcCode = it.c; p.vcDesc = it.d; p.vcArea = it.a; p.vcLevel = it.l;
        saveStudent();
        onPick(it);
      };
      hits.append(b);
    });
    if (found.length >= 40) hits.append(el('p', 'tiny', 'Showing the first 40 — narrow the search to see more.'));
  };
  q.oninput = draw; areaSel.onchange = draw; levSel.onchange = draw;

  curriculumItems(pack.id).then(list => {
    items = list;
    curriculumFacets(list, 'a').forEach(a => areaSel.append(new Option(a, a)));
    curriculumFacets(list, 'l').forEach(l => levSel.append(new Option(l, l)));
    draw();
  }).catch(() => {
    hits.append(el('p', 'tiny', 'The curriculum data could not be read. Type the code by hand below.'));
  });
  draw();
  return box;
}

/* ============================================================
   Views
   ============================================================ */
const NAV = [
  ['setup',      'Student details'],
  ['activities', 'Build the plan'],
  ['review',     'Review and export'],
  ['settings',   'Preferences'],
];
function go(v, act) { view = v; if (act !== undefined) curAct = act; render(); window.scrollTo({ top: 0 }); }

/* ---------- sections: the 31 activities (team supports are shown inside their activity) ---------- */
function isTeam(sec) { return typeof sec === 'string' && sec.startsWith('team:'); }
function secRole(sec) { return String(sec).slice(5); }
function teamForActivity(ai) {
  return RSUP.filter(s => (s.wholePlan || (s.activities || []).includes(ai)) && roleOn(s.role));
}
function sections() {
  const out = [];
  DOMAINS.forEach((d, di) => DOMACTS[di].forEach(ai => out.push(ai)));
  return out;
}
function secState(sec) {
  if (isTeam(sec)) return (ST.teamState || {})[secRole(sec)] || '';
  return (ST.acts[sec] || {}).state || '';
}
function secCount(sec) {
  if (isTeam(sec)) return Object.keys(ST.team).filter(id => (RSUP.find(x => x.id === id) || {}).role === secRole(sec)).length;
  const actPicks = Object.keys((ST.acts[sec] || {}).picks || {}).length;
  const teamPicks = Object.keys(ST.team).filter(id => {
    const s = RSUP.find(x => x.id === id);
    return s && (s.activities || []).includes(sec);
  }).length;
  return actPicks + teamPicks;
}
function addressed() { return sections().filter(s => secState(s) || secCount(s)).length; }
function totalPicks() {
  return Object.values(ST.acts).reduce((n, a) => n + Object.keys(a.picks || {}).length, 0) + Object.keys(ST.team).length;
}

function render() {
  renderNav(); renderBar();
  const m = $('#main'); m.innerHTML = '';
  $('#whoami').textContent = ST.details.name ? '· ' + ST.details.name : '';
  ({ setup:viewSetup, activities:viewActivities, review:viewReview,
     settings:viewSettings, onboard:viewOnboard }[view] || viewSetup)(m);
}
function renderNav() {
  const secs = sections();
  const mob = $('#mobnav');
  if (mob) {
    mob.innerHTML = '';
    NAV.forEach(([k, label]) => {
      const extra = k === 'activities' ? ' (' + addressed() + '/' + secs.length + ')' : '';
      mob.append(new Option(label + extra, k));
    });
    mob.value = NAV.some(([k]) => k === view) ? view : NAV[0][0];
    mob.onchange = () => go(mob.value);
  }
  const n = $('#sidenav'); n.innerHTML = '';
  NAV.forEach(([k, label]) => {
    const b = el('button', view === k ? 'on' : '', label);
    if (k === 'activities') b.append(el('span', 'n', addressed() + '/' + secs.length));
    b.onclick = () => go(k);
    n.append(b);
  });
  n.append(el('div', 'grp', 'Progress'));
  const wrap = el('div'); wrap.style.padding = '0 10px';
  const bar = el('div', 'progress'); const fill = el('i');
  fill.style.width = Math.round(addressed() / secs.length * 100) + '%'; bar.append(fill);
  wrap.append(bar, el('div', 'tiny', addressed() + ' of ' + secs.length + ' sections · ' + totalPicks() + ' selected'));
  n.append(wrap);
}
function renderBar() {
  const b = $('#bar'); b.innerHTML = '';
  const mk = (label, cls, fn) => { const x = el('button', cls, label); x.onclick = fn; return x; };
  b.append(mk('Export Word (.docx)', '', exportDocx));
  b.append(mk('Export spreadsheet (.xlsx)', 'ghost', exportXlsx));
  b.append(mk('Print or save as PDF', 'ghost', exportPrint));
  b.append(el('span', 'spacer'));
  if (view === 'activities') {
    const t = mk('Selected', 'plain small drawer-only', () => {
      const side = document.querySelector('.actside');
      if (side) side.classList.toggle('open');
    });
    t.id = 'sidetoggle';
    b.append(t);
  }
  b.append(mk('Save file', 'plain small', saveFile));
  b.append(mk('Open file', 'plain small', openFile));
  b.append(mk('New ' + W('student'), 'plain small', newStudent));
}

/* ---------------- student details ---------------- */
function viewSetup(m) {
  const p = el('div', 'panel');
  p.append(el('h2', null, uc1(W('student')) + ' details'));
  p.append(el('p', 'sub', 'The preferred name is used inside every ' + W('adjustment') + '. Nothing here leaves this device.'));
  const g = el('div', 'grid g4');
  const f = (k, label, type) => {
    const d = el('div'); d.append(el('label', 'f', label));
    const i = el('input'); i.type = type || 'text'; i.value = ST.details[k] || '';
    i.oninput = () => { ST.details[k] = i.value; saveStudent(); $('#whoami').textContent = ST.details.name ? '· ' + ST.details.name : ''; };
    d.append(i); return d;
  };
  g.append(f('name', uc1(W('student')) + ' name'), f('pref', 'Preferred name'), f('year', 'Year level'),
           f('date', 'Date', 'date'), f('by', 'Prepared by'), f('review', 'Review date', 'date'));
  const c = el('div'); c.style.gridColumn = 'span 2';
  c.append(el('label', 'f', 'Purpose or context'));
  const ci = el('input'); ci.type = 'text'; ci.value = ST.details.context || '';
  ci.placeholder = 'e.g. plan review, support group meeting, funding application';
  ci.oninput = () => { ST.details.context = ci.value; saveStudent(); };
  c.append(ci); g.append(c);
  p.append(g);
  const row = el('div', 'tools'); row.style.marginTop = '14px';
  const b1 = el('button', '', 'Start building →'); b1.onclick = () => go('activities', curAct == null ? 0 : curAct);
  const b2 = el('button', 'ghost', 'Run the setup guide'); b2.onclick = () => { step = 0; go('onboard'); };
  row.append(b1, b2); p.append(row);
  m.append(p);
  m.append(studentListPanel());
}
function studentListPanel() {
  const p = el('div', 'panel');
  const plural = uc1(W('student')) + 's';
  p.append(el('h2', null, plural + ' on this device'));
  p.append(el('p', 'sub', 'Kept in this browser only. Anyone who uses this browser profile can open them, '
    + 'so remove a ' + W('student') + ' when you are finished and use Save file to keep a copy somewhere safe.'));
  const list = ROSTER.list.slice().sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  if (!list.length) { p.append(el('p', 'tiny', 'Nobody yet. The ' + W('student') + ' you are working on appears here as soon as you type.')); return p; }
  const ul = el('ul', 'stulist');
  list.forEach(r => {
    const li = el('li');
    const here = r.id === ST.id;
    const who = el('div', 'stuwho');
    who.append(el('b', null, r.name || 'Unnamed ' + W('student')));
    const bits = [];
    if (r.year) bits.push(r.year);
    bits.push(r.count + ' selected');
    if (r.updated) bits.push('changed ' + new Date(r.updated).toLocaleDateString());
    who.append(el('span', 'tiny', ' ' + bits.join(' · ')));
    li.append(who);
    if (here) li.append(el('span', 'tiny stuhere', 'Open now'));
    else {
      const o = el('button', 'ghost small', 'Open');
      o.setAttribute('aria-label', 'Open ' + (r.name || 'unnamed ' + W('student')));
      o.onclick = () => switchStudent(r.id); li.append(o);
    }
    const x = el('button', 'danger small', 'Remove');
    x.setAttribute('aria-label', 'Remove ' + (r.name || 'unnamed ' + W('student')) + ' from this device');
    x.onclick = () => removeStudent(r.id); li.append(x);
    ul.append(li);
  });
  p.append(ul);
  return p;
}

/* ---------------- the build screen ---------------- */
function ensureAct(i) {
  if (!ST.acts[i]) ST.acts[i] = { level: 2, state: '', picks: {}, q: '', cat: '', adjacent: false };
  if (!ST.acts[i].picks) ST.acts[i].picks = {};
  return ST.acts[i];
}
function viewActivities(m) {
  const secs = sections();
  if (curAct == null || !secs.includes(curAct)) curAct = secs[0];
  // legacy saves may have curAct pointing at a team section; map to its activity
  if (isTeam(curAct)) {
    const role = secRole(curAct);
    const mapped = RSUP.find(s => s.role === role);
    curAct = mapped && mapped.activities && mapped.activities[0] != null ? mapped.activities[0] : secs[0];
  }
  const wrap = el('div', 'actwrap');
  wrap.append(navigator_(secs), el('div', 'actmain', ''), el('div', 'actside'));
  m.append(wrap);
  const main = wrap.querySelector('.actmain'), side = wrap.querySelector('.actside');
  main.innerHTML = '';
  activityPanel(curAct, main, side);
}
function navigator_(secs) {
  const list = el('div', 'actlist noprint');
  DOMAINS.forEach((d, di) => {
    list.append(el('div', 'dom', d));
    DOMACTS[di].forEach(ai => list.append(navBtn(ai, ACTS[ai])));
  });
  return list;
}
function navBtn(sec, label) {
  const b = el('button', sec === curAct ? 'on' : '');
  const st = secState(sec), n = secCount(sec);
  const cls = n ? 'done' : st === 'skip' ? 'skip' : st ? 'part' : '';
  b.append(el('span', 'dot ' + cls), el('span', null, label));
  if (n) b.append(el('span', 'cnt', String(n)));
  b.onclick = () => go('activities', sec);
  return b;
}
function sectionNav(sec, panel) {
  const secs = sections(), i = secs.indexOf(sec);
  const nav = el('div', 'tools noprint'); nav.style.marginTop = '16px';
  const prev = el('button', 'plain', '← Previous'); prev.disabled = i <= 0;
  prev.onclick = () => go('activities', secs[i - 1]);
  const next = el('button', 'plain', 'Next →'); next.disabled = i >= secs.length - 1;
  next.onclick = () => go('activities', secs[i + 1]);
  const skip = el('button', 'ghost', isTeam(sec) ? 'Nothing needed here, next →' : 'Not assessed, next →');
  skip.onclick = () => {
    if (isTeam(sec)) { ST.teamState = ST.teamState || {}; ST.teamState[secRole(sec)] = 'skip'; }
    else ensureAct(sec).state = 'skip';
    saveStudent();
    i >= secs.length - 1 ? go('review') : go('activities', secs[i + 1]);
  };
  const done = el('button', '', 'Review and export →');
  done.onclick = () => go('review');
  nav.append(prev, next, skip, el('span', 'spacer'), done);
  nav.querySelector('.spacer').style.flex = '1 1 auto';
  panel.append(nav);
}
function sectionHead(panel, title, sub, sec) {
  const secs = sections(), i = secs.indexOf(sec);
  panel.append(el('div', 'tiny', 'Section ' + (i + 1) + ' of ' + secs.length + ' · ' + addressed() + ' addressed'));
  panel.append(el('h2', null, title));
  if (sub) panel.append(el('p', 'sub', sub));
}

function activityPanel(ai, main, side) {
  const a = ensureAct(ai);
  /* declared before the early returns below, which call refreshAll() */
  const tierOf = e => e.kind === 'team' ? e.obj.tier : tierNum(LEVELINFO[e.obj.l].tier);
  const after = () => { saveStudent(); sidePanel(side, ai); renderNav(); };
  if (typeof a.cat === 'number') a.cat = 'a:' + a.cat; // saves from before the merged list
  if (!a.custom) a.custom = [];
  const di = DOMAINS.findIndex((_, k) => DOMACTS[k].includes(ai));
  const p = el('div', 'panel');
  sectionHead(p, ACTS[ai], DOMAINS[di] + ' \u00b7 choose the predicted ' + W('level') + ' for this activity, then review the suggested adjustments.', ai);

  const lv = el('div', 'tools');
  LEVELS.forEach((_, i) => {
    const b = el('button', (a.state === 'set' && a.level === i) ? 'small' : 'plain small', levelLabel(i));
    b.onclick = () => {
      changeActivityPrediction(a, i);
      saveStudent(); render();
    };
    lv.append(b);
  });
  [['skip', 'Not assessed'], ['insuff', 'Insufficient evidence']].forEach(([k, label]) => {
    const b = el('button', a.state === k ? 'small' : 'plain small', label);
    b.onclick = () => { a.state = a.state === k ? '' : k; saveStudent(); render(); };
    lv.append(b);
  });
  p.append(lv);

  const teamRelevant = teamForActivity(ai);
  const cIdx = customCatIdx();
  const isSet = () => a.state === 'set';

  // one search and one category filter across the single merged list
  const tools = el('div', 'tools noprint');
  const q = el('input'); q.type = 'text'; q.placeholder = 'Search\u2026'; q.value = a.q || '';
  q.setAttribute('aria-label', 'Search ' + W('adjustment') + 's for this activity');
  q.oninput = () => { a.q = q.value; refreshAll(); };
  const cat = el('select'); cat.append(new Option('All categories', ''));
  cat.setAttribute('aria-label', 'Category');
  const catOpts = [];
  uniq(ITEMS.filter(i => i.a === ai).map(i => i.c)).sort((x, y) => CATS[x].localeCompare(CATS[y]))
    .forEach(i => catOpts.push(['a:' + i, CATS[i]]));
  if ((a.custom || []).length) catOpts.push(['a:' + cIdx, 'Custom']);
  uniq(teamRelevant.map(x => x.category)).sort().forEach(c => catOpts.push(['t:' + c, c + ' \u00b7 team']));
  catOpts.sort((x, y) => x[1].localeCompare(y[1])).forEach(([v, l]) => cat.append(new Option(l, v)));
  cat.value = a.cat == null ? '' : a.cat;
  cat.onchange = () => { a.cat = cat.value; refreshAll(); };
  const adjL = el('label'); adjL.style.cssText = 'font-size:12.5px;display:flex;gap:6px;align-items:center;color:var(--muted)';
  const adjB = el('input'); adjB.type = 'checkbox'; adjB.checked = !!a.adjacent;
  adjB.onchange = () => { a.adjacent = adjB.checked; refreshAll(); };
  adjL.append(adjB, document.createTextNode('Show the levels either side'));
  tools.append(q, cat, adjL);

  const listWrap = el('div', 'noprint');

  // add-your-own composer (only when a level is set, so the pick can export)
  const addBtn = el('button', 'ghost small', 'Add your own adjustment');
  const composer = el('div', 'noprint'); composer.style.display = 'none';
  const cta = el('textarea'); cta.placeholder = 'Write the adjustment in your own words\u2026'; cta.style.marginBottom = '6px';
  const cRow = el('div', 'tools');
  const cAdd = el('button', 'small', 'Add to this activity');
  const cCancel = el('button', 'plain small', 'Cancel');
  cCancel.onclick = () => { composer.style.display = 'none'; addBtn.style.display = ''; };
  cAdd.onclick = () => {
    const text = cta.value.trim();
    if (!text) { cta.focus(); return; }
    const ce = { id: 'C-' + ai + '-' + Date.now().toString(36), a: ai, action: text };
    a.custom.push(ce);
    a.picks[ce.id] = { action: text, note: '', custom: false, level: a.level, status: 'Proposed' };
    cta.value = ''; composer.style.display = 'none'; addBtn.style.display = '';
    saveStudent(); refreshAll(); renderNav();
  };
  cRow.append(cAdd, cCancel); composer.append(cta, cRow);
  addBtn.onclick = () => { composer.style.display = ''; addBtn.style.display = 'none'; cta.focus(); };

  if (a.state === 'skip' || a.state === 'insuff') {
    p.append(el('p', 'note', a.state === 'skip'
      ? 'Marked as not assessed. This is an assessment state, not a ' + W('level') + ' \u2014 nothing is exported for this activity.'
      : 'Marked as insufficient evidence. Gather evidence before setting a ' + W('level') + '.'));
    p.append(tools, listWrap);
    sectionNav(ai, p); main.append(p); refreshAll(); sidePanel(side, ai); return;
  }
  if (!isSet()) {
    p.append(el('p', 'note', 'Choose a ' + W('level') + ' above to see the matching ' + W('adjustment') + 's, or mark the activity as not assessed.'));
    p.append(tools, listWrap);
    sectionNav(ai, p); main.append(p); refreshAll(); sidePanel(side, ai); return;
  }

  const info = LEVELINFO[a.level];
  p.append(el('p', 'note', (S.showTiers ? 'Indicative tier: ' + tierLabel(info.tier) + '. ' : '') + info.rule));
  p.append(tools, listWrap, addBtn, composer);
  sectionNav(ai, p);
  main.append(p);

  function actFound() {
    if (!isSet()) return [];
    const want = a.adjacent ? [a.level - 1, a.level, a.level + 1].filter(i => i >= 0 && i < LEVELS.length) : [a.level];
    const s = (a.q || '').trim().toLowerCase();
    const c = a.cat == null ? '' : String(a.cat);
    return ITEMS.filter(it => it.a === ai && want.includes(it.l)
      && (c === '' || c === 'a:' + it.c)
      && (!s || (it.ac + ' ' + it.ao + ' ' + CATS[it.c]).toLowerCase().includes(s)));
  }
  function teamFound() {
    if (!teamRelevant.length) return [];
    const s = (a.q || '').trim().toLowerCase();
    const c = a.cat == null ? '' : String(a.cat);
    return teamRelevant.filter(x =>
      (c === '' || c === 't:' + x.category) &&
      (!s || (x.action + ' ' + x.wording + ' ' + x.category).toLowerCase().includes(s)));
  }
  function customFound() {
    if (!isSet()) return [];
    const s = (a.q || '').trim().toLowerCase();
    const c = a.cat == null ? '' : String(a.cat);
    return (a.custom || []).filter(ce =>
      (c === '' || c === 'a:' + cIdx) &&
      (!s || ce.text.toLowerCase().includes(s)));
  }
  function refreshAll() {
    listWrap.innerHTML = '';
    const merged = [
      ...actFound().map(it => ({ kind: 'activity', obj: it })),
      ...teamFound().map(x => ({ kind: 'team', obj: x })),
      ...customFound().map(ce => ({ kind: 'custom', obj: customObj(ai, ce, a.level) })),
    ].sort((m, n) => tierOf(m) - tierOf(n) || ((m.kind === 'team') - (n.kind === 'team')));
    listWrap.append(el('p', 'tiny', merged.length + ' matching ' + W('adjustment') + (merged.length === 1 ? '' : 's')));
    if (!merged.length) listWrap.append(el('p', 'muted', 'Nothing matches. Clear the search or show the levels either side.'));
    merged.forEach(e => {
      if (e.kind === 'team') listWrap.append(optionRow('team', e.obj, ST.team, after));
      else if (e.kind === 'custom') listWrap.append(customRow(e.obj, a.picks, after));
      else listWrap.append(optionRow('activity', e.obj, a.picks, after, a.level));
    });
    sidePanel(side, ai);
  }
  refreshAll();
}

/* ---------------- the option list ---------------- */
/* A pick checkbox is named by the adjustment's own sentence, so a screen reader
   reads what is being chosen rather than an anonymous "checkbox". */
let optSeq = 0;
function nameCheckbox(cb, line) {
  line.id = 'opt-text-' + (++optSeq);
  cb.setAttribute('aria-labelledby', line.id);
}
function optionRow(kind, obj, store, after, selectedLevel) {
  const id = obj.id, picked = !!store[id];
  const o = el('div', 'opt' + (picked ? ' on' : ''));
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = picked; cb.dataset.id = id;
  cb.onchange = () => {
    if (cb.checked) store[id] = { text:'', note:'', custom:false,
      level: Number.isInteger(selectedLevel) ? selectedLevel : obj.l, status: 'Proposed' };
    else delete store[id];
    o.classList.toggle('on', cb.checked);
    after();
  };
  const txt = el('div', 'txt');
  const line = el('div'); line.innerHTML = picked ? recommendationHtml(kind, obj, store[id]) : segHtml(wordingFor(kind, obj));
  nameCheckbox(cb, line);
  txt.append(line);
  const meta = el('div', 'meta');
  if (kind === 'activity') {
    meta.append(el('span', 'pill', levelLabel(obj.l)));
    if (S.showTiers) { const t = el('span', 'pill t' + tierNum(LEVELINFO[obj.l].tier)); t.textContent = tierLabel(LEVELINFO[obj.l].tier); meta.append(t); }
    meta.append(el('span', 'pill', CATS[obj.c]));
  } else {
    if (S.showTiers) { const t = el('span', 'pill t' + obj.tier); t.textContent = tierFull(obj.tier); meta.append(t); }
    meta.append(el('span', 'pill', obj.category));
  }
  flagsFor(kind, obj).forEach(f => meta.append(el('span', 'pill flag', f)));
  const more = el('button', 'link', 'Details');
  more.setAttribute('aria-expanded', 'false');
  more.onclick = () => more.setAttribute('aria-expanded', String(o.classList.toggle('open')));
  meta.append(more);
  txt.append(meta);
  const tk = v => resolvePronouns(String(v || '').replace(/\{preferredName\}/g, prefName()));
  const rows = kind === 'activity'
    ? [['Frequency', tk(obj.f)], ['Intensity', tk(obj.i)], ['Access outcome', uc1(tk(obj.ao))],
       ['Setting or trigger', tk(obj.ctx).replace(/;\s*/g, ', ')],
       ['Who is responsible', (obj.rk || []).map(roleLabel).join(' or ')
         + ((obj.sk || []).length ? ', with ' + (obj.sk || []).map(roleLabel).join(', ') : '')],
       ['Evidence to monitor', tk((obj.ev || []).join('; '))],
       ['Student voice prompt', tk(obj.sv)], ['How support will fade', tk(obj.ind)],
       ['Record ID', obj.id + ' · ' + obj.st]]
    : [['Frequency', obj.frequency], ['Intensity', obj.intensity], ['Who is responsible', roleLabel(obj.role)],
       ['Evidence to monitor', (obj.evidence || []).join('; ')], ['Record ID', obj.id]];
  const d = el('div', 'more');
  d.innerHTML = rows.filter(r => r[1]).map(r => '<div><b>' + esc(r[0]) + ':</b> ' + esc(r[1]) + '</div>').join('');
  txt.append(d);
  o.append(cb, txt);
  return o;
}
/* a teacher-written adjustment: checkbox, own text, level + Custom pills */
function customRow(obj, store, after) {
  const id = obj.id, cur = store[id], picked = !!cur;
  const o = el('div', 'opt' + (picked ? ' on' : ''));
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = picked; cb.dataset.id = id;
  cb.onchange = () => {
    if (cb.checked) store[id] = { action: obj.ce.action || obj.ce.text, text: '', note: '', custom: false, level: obj.l, status: 'Proposed' };
    else delete store[id];
    o.classList.toggle('on', cb.checked);
    after();
  };
  const txt = el('div', 'txt');
  const line = el('div');
  line.innerHTML = picked ? recommendationHtml('activity', obj, cur) : esc(obj.ce.action || obj.ce.text);
  nameCheckbox(cb, line);
  txt.append(line);
  const meta = el('div', 'meta');
  meta.append(el('span', 'pill', levelLabel(obj.l)));
  meta.append(el('span', 'pill', 'Custom'));
  txt.append(meta);
  o.append(cb, txt);
  return o;
}

/* ---------------- the side column: what is selected, and its editor ---------------- */
let openEditor = null;
function sidePanel(side, sec) {
  const isT = isTeam(sec);
  // Legacy team section still supported for old saves that jump directly
  if (isT) {
    const role = secRole(sec);
    const ids = Object.keys(ST.team).filter(id => (RSUP.find(x => x.id === id) || {}).role === role);
    side.innerHTML = '';
    const head = el('div', 'sidehead');
    head.append(el('h3', null, 'Selected here'), el('span', 'pill', String(ids.length)));
    const close = el('button', 'link', 'Close'); close.className = 'link closeside';
    close.onclick = () => side.classList.remove('open');
    head.append(close);
    side.append(head);
    if (!ids.length) side.append(el('p', 'muted', 'Nothing selected in this section yet. Tick anything on the left and it appears here, ready to edit.'));
    ids.forEach(id => {
      const obj = RSUP.find(x => x.id === id);
      side.append(pickCard('team', obj, ST.team, id, () => {
        saveStudent(); renderNav();
        const listBox = document.querySelector('.actmain');
        const box = listBox && listBox.querySelector('input[data-id="' + CSS.escape(id) + '"]');
        if (box) { box.checked = !!ST.team[id]; box.closest('.opt').classList.toggle('on', !!ST.team[id]); }
        sidePanel(side, sec);
      }));
    });
    const btn = document.getElementById('sidetoggle');
    if (btn) btn.textContent = 'Selected (' + ids.length + ')';
    return;
  }
  const actStore = ensureAct(sec).picks;
  const act = ensureAct(sec);
  const actIds = Object.keys(actStore);
  const teamIds = Object.keys(ST.team).filter(id => {
    const s = RSUP.find(x => x.id === id);
    return s && (s.activities || []).includes(sec);
  });
  const resolveAct = id => {
    const it = ITEMS.find(x => x.id === id);
    if (it) return { kind: 'activity', obj: it };
    const ce = (act.custom || []).find(x => x.id === id);
    if (ce) return { kind: 'activity', obj: customObj(sec, ce, act.level) };
    return { kind: 'activity', obj: null };
  };
  const entries = [
    ...actIds.map(id => ({ id, ...resolveAct(id), store: actStore })),
    ...teamIds.map(id => ({ id, kind: 'team', obj: RSUP.find(x => x.id === id), store: ST.team })),
  ];
  side.innerHTML = '';
  const head = el('div', 'sidehead');
  head.append(el('h3', null, 'Selected here'), el('span', 'pill', String(entries.length)));
  const close = el('button', 'link', 'Close'); close.className = 'link closeside';
  close.onclick = () => side.classList.remove('open');
  head.append(close);
  side.append(head);
  if (!entries.length) {
    side.append(el('p', 'muted', 'Nothing selected in this section yet. Tick anything on the left and it appears here, ready to edit.'));
  }
  entries.forEach(function(entry) {
    const id = entry.id, kind = entry.kind, obj = entry.obj, store = entry.store;
    if (!obj) return;
    side.append(pickCard(kind, obj, store, id, function() {
      saveStudent(); renderNav();
      const listBox = document.querySelector('.actmain');
      const box = listBox && listBox.querySelector('input[data-id="' + CSS.escape(id) + '"]');
      if (box) { box.checked = !!store[id]; box.closest('.opt').classList.toggle('on', !!store[id]); }
      sidePanel(side, sec);
    }));
  });
  const btn = document.getElementById('sidetoggle');
  if (btn) btn.textContent = 'Selected (' + entries.length + ')';
}
function pickCard(kind, obj, store, id, after) {
  const p = store[id], s = el('div', 'sel');
  const top = el('div', 'top');
  if (kind === 'activity') top.append(el('span', 'pill', levelLabel(levelForRecommendation(obj, p))));
  else top.append(el('span', 'pill', roleLabel(obj.role)));
  flagsFor(kind, obj).forEach(f => top.append(el('span', 'pill flag', f)));
  s.append(top);

  const wording = el('div', 'wording');
  wording.innerHTML = recommendationHtml(kind, obj, p);
  s.append(wording);

  const acts = el('div', 'tools');
  const ed = el('button', 'link', 'Edit');
  const rm = el('button', 'link danger-link', 'Remove');
  rm.onclick = () => { delete store[id]; after(); };
  acts.append(ed, rm);
  s.append(acts);

  const body = el('div', 'editor');
  if (openEditor !== id) body.classList.add('hide');
  ed.onclick = () => {
    openEditor = body.classList.contains('hide') ? id : null;
    body.classList.toggle('hide');
  };

  const ta = el('textarea');
  ta.value = p.custom ? p.text : segText(wordingFor(kind, obj, false, p));
  ta.oninput = () => { p.text = ta.value; p.custom = true; saveStudent();
    wording.innerHTML = recommendationHtml(kind, obj, p); };
  body.append(el('label', 'f', 'Wording'), ta);
  const rst = el('button', 'link', 'Reset to the standard wording');
  if (obj.isCustom) {
    const del = el('button', 'link danger-link', 'Delete this custom adjustment');
    del.onclick = () => {
      const act = ensureAct(obj.a);
      act.custom = (act.custom || []).filter(x => x.id !== id);
      delete store[id];
      saveStudent(); render();
    };
    body.append(del);
  } else {
    rst.onclick = () => { p.custom = false; p.text = ''; p.reviewNeeded = false; ta.value = segText(wordingFor(kind, obj, false, p));
      wording.innerHTML = recommendationHtml(kind, obj, p); saveStudent(); };
    body.append(rst);
  }

  if (p.reviewNeeded) {
    const notice = el('p', 'note warn', 'The predicted level changed. Your wording has been kept. Review it before using it.');
    const refresh = el('button', 'link', 'Update to the recommended wording');
    refresh.onclick = () => { p.custom = false; p.text = ''; p.reviewNeeded = false;
      ta.value = segText(wordingFor(kind, obj, false, p)); wording.innerHTML = recommendationHtml(kind, obj, p); saveStudent(); };
    notice.append(document.createElement('br'), refresh); body.append(notice);
  }

  const field = (key, label, type) => {
    if (!S.fields[key] && !['frequency', 'intensity', 'setting', 'outcome', 'role', 'status', 'startdate', 'observation'].includes(key)) return;
    body.append(el('label', 'f', label));
    let i;
    if (key === 'status') { i = el('select'); STATUSES.forEach(v => i.append(new Option(v, v))); }
    else if (key === 'tier') {
      i = el('select'); i.append(new Option('Indicative: ' + tierForRecommendation(kind, obj, p), ''));
      (S.tierList || []).forEach(t => i.append(new Option(t.label, t.label)));
    }
    else if (key === 'role') {
      i = el('select');
      const current = p.role || '';
      i.append(new Option('Recommended: ' + responsibilityFor(kind, obj, p), ''));
      selectableRolesFor(p).forEach(r => i.append(new Option(roleLabel(r.key) + (roleOn(r.key) ? '' : ' (unavailable)'), r.key)));
    }
    else if (key === 'assigned' && S.staff.filter(x => x.name).length) {
      i = el('select'); i.append(new Option('—', ''));
      S.staff.filter(x => x.name).forEach(st => i.append(new Option(st.name + (st.role ? ' · ' + roleLabel(st.role) : ''), st.name)));
    }
    else { i = el('input'); i.type = type || 'text'; }
    i.value = key === 'status' ? implementationStatus(p)
      : (key === 'frequency' || key === 'intensity' ? editorValueFor(kind, obj, p, key) : (p[key] || ''));
    i.onchange = i.oninput = () => { p[key] = i.value; wording.innerHTML = recommendationHtml(kind, obj, p); saveStudent(); };
    body.append(i);
  };
  if (S.showTiers) field('tier', 'MTSS tier');
  field('frequency', 'Recommended frequency');
  field('intensity', 'Recommended intensity');
  field('setting', 'Setting or trigger');
  field('outcome', 'Intended access outcome');
  field('role', 'Who is responsible');
  field('assigned', 'Named staff member');
  field('status', 'Implementation status');
  field('startdate', 'Start date', 'date');
  field('observation', 'Observed response');
  field('reviewdate', 'Review date', 'date');
  field('approver', 'Approved by and date');
  field('evbase', 'Evidence this is based on');
  field('specialist', 'Specialist or expert advice');
  if (S.fields.vc) {
    body.append(el('div', 'tiny', W('curriculum')));
    const vcHead = el('div'); vcHead.style.cssText = 'font-weight:700;font-size:13px;margin:10px 0 6px;color:var(--ink)';
    vcHead.textContent = W('curriculum') + ' link';
    body.append(vcHead);
    if (VC_GUIDANCE) {
      const g = el('p', 'tiny');
      g.textContent = String(VC_GUIDANCE).replace(/\{curriculum\}/g, W('curriculum'));
      g.style.marginBottom = '8px';
      body.append(g);
    }
    // Search the loaded curriculum; the manual fields below stay as the fallback
    // and as the place to correct anything the search got not quite right.
    const manual = el('div');
    const picked = el('div');
    const drawPicked = () => {
      picked.innerHTML = '';
      if (!p.vcCode && !p.vcDesc) return;
      const d = el('div', 'currpicked');
      d.append(el('b', null, [p.vcCode, p.vcLevel, p.vcArea].filter(Boolean).join(' · ')));
      if (p.vcDesc) d.append(el('div', null, p.vcDesc));
      const clr = el('button', 'link', 'Clear');
      clr.onclick = () => { p.vcCode = ''; p.vcDesc = ''; p.vcArea = ''; p.vcLevel = ''; saveStudent();
        drawPicked(); syncManual(); };
      d.append(clr);
      picked.append(d);
    };
    body.append(curriculumPicker(p, () => { drawPicked(); syncManual(); }));
    body.append(picked);
    let syncManual = () => {};
    body.append(manual);
    const toggle = el('button', 'link', 'Enter it by hand instead');
    let manualOpen = !curriculumAvailable();
    manual.style.display = manualOpen ? '' : 'none';
    toggle.onclick = () => { manualOpen = !manualOpen; manual.style.display = manualOpen ? '' : 'none'; };
    body.append(toggle);
    drawPicked();

    // Learning area
    manual.append(el('label', 'f', 'Learning area'));
    const vcAreaSel = el('select');
    vcAreaSel.append(new Option('\u2014', ''));
    (VC_AREAS || []).forEach(function(a) { vcAreaSel.append(new Option(a.label, a.code)); });
    vcAreaSel.value = p.vcArea || '';
    vcAreaSel.onchange = function() { p.vcArea = vcAreaSel.value; saveStudent(); };
    manual.append(vcAreaSel);
    // Level working towards
    manual.append(el('label', 'f', 'Level the student is working towards'));
    const vcLevSel = el('select');
    vcLevSel.append(new Option('\u2014', ''));
    (VC_LEVELS || []).forEach(function(l) { vcLevSel.append(new Option(l.label, l.code)); });
    vcLevSel.value = p.vcLevel || '';
    vcLevSel.onchange = function() { p.vcLevel = vcLevSel.value; saveStudent(); };
    manual.append(vcLevSel);
    // Content description code
    manual.append(el('label', 'f', 'Content description or standard code'));
    const vcCodeI = el('input'); vcCodeI.type = 'text'; vcCodeI.placeholder = 'e.g. VC2M4N01 or VC2E3U02';
    vcCodeI.value = p.vcCode || '';
    vcCodeI.oninput = function() { p.vcCode = vcCodeI.value; saveStudent(); };
    manual.append(vcCodeI);
    // Content description text
    manual.append(el('label', 'f', 'Content description'));
    const vcDescI = el('textarea'); vcDescI.placeholder = S.doc.curriculumUrl ? ('Paste the content description text from ' + S.doc.curriculumUrl) : 'Paste the content description text';
    vcDescI.value = p.vcDesc || ''; vcDescI.style.minHeight = '56px';
    vcDescI.oninput = function() { p.vcDesc = vcDescI.value; saveStudent(); };
    syncManual = function() {
      vcAreaSel.value = p.vcArea || ''; vcLevSel.value = p.vcLevel || '';
      vcCodeI.value = p.vcCode || ''; vcDescI.value = p.vcDesc || '';
    };
    manual.append(vcDescI);
    // Elaboration
    body.append(el('label', 'f', 'Elaboration (optional)'));
    const vcElabI = el('textarea'); vcElabI.placeholder = 'Elaboration or standard elaboration, if relevant';
    vcElabI.value = p.vcElab || ''; vcElabI.style.minHeight = '44px';
    vcElabI.oninput = function() { p.vcElab = vcElabI.value; saveStudent(); };
    body.append(vcElabI);
    // Curriculum advice
    body.append(el('label', 'f', W('curriculum') + ' advice behind this adjustment'));
    const vcAdvI = el('textarea'); vcAdvI.placeholder = 'How the ' + W('curriculum') + ' informed this adjustment — e.g. which elaboration it scaffolds, or how it maintains the same curriculum goal with different access';
    vcAdvI.value = p.vcAdvice || ''; vcAdvI.style.minHeight = '48px';
    vcAdvI.oninput = function() { p.vcAdvice = vcAdvI.value; saveStudent(); };
    body.append(vcAdvI);
    if (S.doc.curriculumUrl) {
      const vcLink = el('a');
      vcLink.href = /^https?:\/\//i.test(S.doc.curriculumUrl) ? S.doc.curriculumUrl : 'https://' + S.doc.curriculumUrl;
      vcLink.target = '_blank';
      vcLink.textContent = 'Open ' + W('curriculum');
      vcLink.style.cssText = 'font-size:12px;display:inline-block;margin-top:4px';
      body.append(vcLink);
    }
  }
  if (S.fields.notes) {
    body.append(el('label', 'f', 'Notes'));
    const n = el('input'); n.type = 'text'; n.value = p.note || '';
    n.oninput = () => { p.note = n.value; saveStudent(); };
    body.append(n);
  }
  s.append(body);
  return s;
}

/* ============================================================
   Preference sections — shared by the setup guide and Preferences
   ============================================================ */
function livePreview() {
  const d = el('div', 'prev'); d.id = 'live-prev';
  d.innerHTML = samplePreviewHtml();
  return d;
}
function bump() { const d = $('#live-prev'); if (d) d.innerHTML = samplePreviewHtml(); saveSettings(); }
function section(title, sub) {
  const p = el('div', 'panel');
  p.append(el('h2', null, title));
  if (sub) p.append(el('p', 'sub', sub));
  return p;
}
function textPref(parent, label, get, set, ph) {
  const d = el('div'); d.append(el('label', 'f', label));
  const i = el('input'); i.type = 'text'; i.value = get() || ''; if (ph) i.placeholder = ph;
  i.oninput = () => { set(i.value); bump(); };
  d.append(i); parent.append(d); return i;
}
function checkPref(parent, label, get, set, rerender) {
  const l = el('label', 'chk');
  const c = el('input'); c.type = 'checkbox'; c.checked = !!get();
  c.onchange = () => { set(c.checked); bump(); if (rerender) render(); };
  l.append(c, el('span', null, label)); parent.append(l); return l;
}
function selectPref(parent, label, options, get, set) {
  const d = el('div'); d.append(el('label', 'f', label));
  const s = el('select'); options.forEach(([v, l]) => s.append(new Option(l, v)));
  s.value = get(); s.onchange = () => { set(s.value); bump(); };
  d.append(s); parent.append(d); return s;
}
function radioPref(parent, name, options, get, set) {
  options.forEach(([val, label, hint]) => {
    const l = el('label', 'chk');
    const r = el('input'); r.type = 'radio'; r.name = name; r.value = val; r.checked = get() === val;
    r.onchange = () => { if (r.checked) { set(val); bump(); } };
    const s = el('span');
    s.innerHTML = '<b>' + esc(label) + '</b>' + (hint ? '<br><span class="tiny">' + esc(hint) + '</span>' : '');
    l.append(r, s); parent.append(l);
  });
}

function secWords() {
  const p = section('The words you use', 'Set them once; every screen and document follows.');
  const g = el('div', 'grid g4');
  textPref(g, 'A young person is a', () => S.words.student, v => S.words.student = v, 'student');
  textPref(g, 'A support is an', () => S.words.adjustment, v => S.words.adjustment = v, 'adjustment');
  textPref(g, 'The scale is called the', () => S.words.level, v => S.words.level = v, 'level of adjustment');
  textPref(g, 'The document is a', () => S.words.plan, v => S.words.plan = v, 'plan');
  p.append(g);
  const g2 = el('div', 'grid g2');
  g2.style.marginTop = '12px';
  textPref(g2, 'What your curriculum is called', () => S.words.curriculum, v => S.words.curriculum = v, 'Curriculum');
  textPref(g2, 'Where staff copy codes from (optional)', () => S.doc.curriculumUrl, v => S.doc.curriculumUrl = v, 'a web address');
  p.append(g2);
  return p;
}

/* tiers: a school's own list, in its own order, mapped onto the library's three */
function secTiers() {
  const p = section('MTSS tiers', 'Name the tiers in your school\'s multi-tiered system of support. Additional opportunity or extension tiers can remain manually selected.');
  const box = el('div');
  checkPref(box, 'Show MTSS tiers', () => S.showTiers, v => S.showTiers = v, true);
  p.append(box);
  if (!S.showTiers) return p;
  const list = el('div');
  const draw = () => {
    list.innerHTML = '';
    const t = el('table', 'plain');
    t.innerHTML = '<tr><th style="width:46%">Tier name</th><th>Library tier it stands for</th><th></th></tr>';
    (S.tierList || []).forEach((row, i) => {
      const tr = el('tr');
      const c1 = el('td');
      const n = el('input'); n.type = 'text'; n.value = row.label;
      n.setAttribute('aria-label', 'Tier ' + (i + 1) + ' name');
      n.oninput = () => { row.label = n.value; bump(); };
      c1.append(n);
      const c2 = el('td');
      const sel = el('select');
      sel.setAttribute('aria-label', 'Library tier behind tier ' + (i + 1));
      sel.append(new Option('— chosen by hand —', ''));
      [1, 2, 3].forEach(k => sel.append(new Option((TIERS[k - 1] || {}).label || ('Tier ' + k), k)));
      sel.value = row.maps || '';
      sel.onchange = () => {
        const v = sel.value ? +sel.value : null;
        if (v) (S.tierList || []).forEach(o => { if (o !== row && o.maps === v) o.maps = null; });
        row.maps = v; bump(); draw();
      };
      c2.append(sel);
      const c3 = el('td');
      const x = el('button', 'danger small', 'Remove');
      x.onclick = () => { S.tierList.splice(i, 1); saveSettings(); draw(); bump(); };
      c3.append(x);
      tr.append(c1, c2, c3); t.append(tr);
    });
    list.append(t);
    const add = el('button', 'ghost small', 'Add a tier');
    add.onclick = () => { S.tierList.push({ label: 'New tier', maps: null }); saveSettings(); draw(); };
    list.append(add);
    list.append(el('p', 'tiny', 'A tier with no library tier behind it is never applied automatically — you choose it on an individual '
      + W('adjustment') + '. Each library tier can stand behind one of your tiers.'));
  };
  draw();
  p.append(list);
  return p;
}

function secRoles() {
  const p = section('Roles at your school',
    'Turn off what you do not have, and rename the rest. Learning Mentor, Education Support, Inclusion Officer and Teacher’s Aide are one role here — most schools use a single name for those people.');
  const t = el('table', 'plain');
  t.innerHTML = '<tr><th style="width:32%">Role</th><th style="width:46%">What you call it</th><th>Used here</th></tr>';
  allRoles().forEach(r => {
    const tr = el('tr');
    const c1 = el('td');
    c1.innerHTML = '<b>' + esc(r.label) + '</b><br><span class="tiny">' + esc(r.hint || '') + '</span>';
    const c2 = el('td');
    const i = el('input'); i.type = 'text'; i.value = S.roleLabels[r.key] || ''; i.placeholder = r.label;
    i.setAttribute('aria-label', 'What you call the ' + r.label);
    i.oninput = () => { if (i.value.trim()) S.roleLabels[r.key] = i.value.trim(); else delete S.roleLabels[r.key]; bump(); };
    c2.append(i);
    if (r.also && r.also.length) {
      const sug = el('div', 'tiny'); sug.style.marginTop = '4px';
      r.also.forEach(name => {
        const b = el('button', 'link', name); b.style.marginRight = '8px';
        b.onclick = () => { S.roleLabels[r.key] = name; i.value = name; bump(); };
        sug.append(b);
      });
      c2.append(sug);
    }
    const c3 = el('td');
    const c = el('input'); c.type = 'checkbox'; c.checked = roleOn(r.key);
    c.setAttribute('aria-label', r.label + ' is used at this school');
    c.onchange = () => { S.rolesOff = c.checked ? S.rolesOff.filter(k => k !== r.key) : uniq([...S.rolesOff, r.key]); bump(); };
    c3.append(c);
    tr.append(c1, c2, c3); t.append(tr);
  });
  p.append(t);
  const add = el('button', 'ghost small', 'Add a role of your own');
  add.onclick = () => {
    const name = prompt('What is the role called?');
    if (!name) return;
    S.customRoles.push({ key: 'custom_' + Date.now().toString(36), label: name.trim(), hint: 'Added by your school' });
    saveSettings(); render();
  };
  p.append(add);
  return p;
}

function secStaff() {
  const p = section('Staff names (optional)',
    'Add the people who hold these roles and you can attach a name to any ' + W('adjustment') + '. Kept when you start a new ' + W('student') + '.');
  const list = el('div');
  const draw = () => {
    list.innerHTML = '';
    if (!S.staff.length) list.append(el('p', 'muted', 'No staff added yet.'));
    S.staff.forEach((st, i) => {
      const row = el('div', 'tools');
      const n = el('input'); n.type = 'text'; n.placeholder = 'Name'; n.value = st.name; n.style.maxWidth = '230px';
      n.oninput = () => { st.name = n.value; saveSettings(); };
      const r = el('select'); r.style.maxWidth = '230px';
      r.append(new Option('— role —', ''));
      rolesInUse().forEach(x => r.append(new Option(roleLabel(x.key), x.key)));
      r.value = st.role || '';
      r.onchange = () => { st.role = r.value; saveSettings(); };
      const x = el('button', 'danger small', 'Remove');
      x.onclick = () => { S.staff.splice(i, 1); saveSettings(); draw(); };
      row.append(n, r, x); list.append(row);
    });
  };
  draw(); p.append(list);
  const add = el('button', 'ghost small', 'Add a staff member');
  add.onclick = () => { S.staff.push({ name:'', role:'' }); saveSettings(); draw(); };
  p.append(add);
  return p;
}

function secStructure() {
  const p = section('How ' + AN(W('adjustment')) + ' is written', 'The order, the voice and the verb.');
  const g = el('div', 'grid g2');
  const c1 = el('div');
  c1.append(el('label', 'f', 'Structure'));
  radioPref(c1, 'struct', STRUCTURES, () => S.structure, v => S.structure = v);
  const c2 = el('div');
  c2.append(el('label', 'f', 'Who it speaks to'));
  radioPref(c2, 'aud', AUDIENCES, () => S.audience, v => S.audience = v);
  selectPref(c2, 'The verb (sentence layouts only)',
    [['should', 'should'], ['will', 'will'], ['must', 'must'], ['is to', 'is to']],
    () => S.modal, v => S.modal = v);
  const box = el('div'); box.style.marginTop = '10px';
  checkPref(box, 'Name the setting or trigger inside the sentence', () => S.includeSetting, v => S.includeSetting = v);
  c2.append(box);
  g.append(c1, c2); p.append(g);
  return p;
}

function secEmph() {
  const p = section('Emphasis and colour', 'What stands out, in the app and in the exported document.');
  const t = el('table', 'plain');
  const head = el('tr');
  head.innerHTML = '<th style="width:30%">Part</th>' + EMPH_STYLES.map(([, l]) => '<th>' + l + '</th>').join('') + '<th>Colour</th>';
  t.append(head);
  EMPH_PARTS.forEach(([k, label]) => {
    const tr = el('tr'); tr.append(el('td', null, label));
    EMPH_STYLES.forEach(([v, styleLabel]) => {
      const td = el('td');
      const r = el('input'); r.type = 'radio'; r.name = 'emph_' + k; r.checked = (S.emph[k] || 'none') === v;
      r.setAttribute('aria-label', label + ': ' + styleLabel);
      r.onchange = () => { S.emph[k] = v; bump(); };
      td.append(r); tr.append(td);
    });
    const td = el('td');
    const sel = el('select');
    sel.setAttribute('aria-label', label + ': colour');
    COLOURS.forEach(([v, l]) => sel.append(new Option(l, v)));
    sel.value = S.emphColor[k] || '';
    sel.onchange = () => { S.emphColor[k] = sel.value; bump(); };
    td.append(sel); tr.append(td);
    t.append(tr);
  });
  p.append(t);
  return p;
}

function secFields() {
  const p = section('What each ' + W('adjustment') + ' records',
    'Anything ticked becomes a field to fill in, a row in the document and a column in the spreadsheet.');
  const g = el('div', 'grid g3');
  FIELD_DEFS.forEach(([k, label]) => {
    const box = el('div');
    checkPref(box, fieldLabel(k, label), () => S.fields[k], v => S.fields[k] = v);
    g.append(box);
  });
  p.append(g);
  return p;
}

function secDoc() {
  const p = section('The exported document', 'Layout, and your own logo, colour and page furniture.');
  const g = el('div', 'grid g2');
  const c1 = el('div');
  c1.append(el('label', 'f', 'Group the document by'));
  radioPref(c1, 'grp', [
    ['domain', 'Domain and activity', 'Follows the functional areas.'],
    ['role', 'Who is responsible', 'One section per role.'],
    ['tier', 'Tier', 'Least intensive first.'],
    ['category', 'Category', 'Similar ' + W('adjustment') + 's together.'],
  ], () => S.doc.groupBy, v => S.doc.groupBy = v);
  c1.append(el('label', 'f', 'Include'));
  checkPref(c1, 'A details table at the top', () => S.doc.cover, v => S.doc.cover = v);
  checkPref(c1, 'A sign-off block at the end', () => S.doc.approvalBlock, v => S.doc.approvalBlock = v);
  checkPref(c1, 'The closing note about how levels work', () => S.doc.guidance, v => S.doc.guidance = v);
  checkPref(c1, 'Record IDs', () => S.doc.ids, v => S.doc.ids = v);
  checkPref(c1, 'Colour bands behind the headings', () => S.doc.bands, v => S.doc.bands = v);

  const c2 = el('div');
  textPref(c2, 'Heading at the top (your school or service)', () => S.doc.org, v => S.doc.org = v, 'Leave blank for none');
  textPref(c2, 'Header line on every page', () => S.doc.header, v => S.doc.header = v, 'Optional');
  textPref(c2, 'Footer line on every page', () => S.doc.footer, v => S.doc.footer = v, 'Optional');
  c2.append(el('label', 'f', 'Your colour'));
  const col = el('input'); col.type = 'color'; col.value = S.doc.colour || '#1f5872';
  col.style.cssText = 'width:64px;height:32px;padding:2px';
  col.oninput = () => { S.doc.colour = col.value; bump(); };
  c2.append(col);
  c2.append(el('label', 'f', 'Logo'));
  const logoRow = el('div', 'tools');
  const pick = el('button', 'ghost small', S.doc.logo ? 'Replace logo' : 'Add a logo');
  pick.onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      if (f.size > 400000) { alert('That image is larger than 400 KB. Please use a smaller one.'); return; }
      const r = new FileReader();
      r.onload = () => {
        /* Word can only embed PNG or JPEG, so anything else (SVG, WebP, GIF) is
           redrawn as a PNG here — otherwise the logo would show in the app and
           silently vanish from the exported document. */
        const src = String(r.result);
        if (/^data:image\/(png|jpe?g);/i.test(src)) { S.doc.logo = src; saveSettings(); render(); return; }
        const img = new Image();
        img.onload = () => {
          try {
            const max = 600, scale = Math.min(1, max / (img.naturalWidth || max));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round((img.naturalWidth || max) * scale));
            c.height = Math.max(1, Math.round((img.naturalHeight || max) * scale));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            S.doc.logo = c.toDataURL('image/png');
          } catch (e) { S.doc.logo = src; }
          saveSettings(); render();
        };
        img.onerror = () => { alert('That image could not be read. Try a PNG or JPEG.'); };
        img.src = src;
      };
      r.readAsDataURL(f);
    };
    inp.click();
  };
  logoRow.append(pick);
  if (S.doc.logo) {
    const rm = el('button', 'danger small', 'Remove logo');
    rm.onclick = () => { S.doc.logo = ''; saveSettings(); render(); };
    logoRow.append(rm);
    const img = document.createElement('img');
    img.src = S.doc.logo; img.style.cssText = 'max-height:44px;margin-left:8px';
    logoRow.append(img);
  }
  c2.append(logoRow);
  selectPref(c2, 'Logo width in the document', [[90, 'Small'], [120, 'Medium'], [170, 'Large']],
    () => String(S.doc.logoWidth), v => S.doc.logoWidth = +v);
  selectPref(c2, 'Page size', [['A4', 'A4'], ['Letter', 'Letter']], () => S.doc.paper, v => S.doc.paper = v);
  selectPref(c2, 'Body text size', [[10, '10 pt'], [11, '11 pt'], [12, '12 pt'], [13, '13 pt']],
    () => String(S.doc.font), v => S.doc.font = +v);
  g.append(c1, c2); p.append(g);
  return p;
}

/* ---------------- Preferences view ---------------- */
function viewSettings(m) {
  const intro = el('div', 'panel');
  intro.append(el('h2', null, 'Preferences'));
  intro.append(el('p', 'sub', 'These belong to your school, not to a ' + W('student') + '. Kept on this device, and kept when you start a new ' + W('student') + '.'));
  const row = el('div', 'tools');
  const g = el('button', 'ghost', 'Run the setup guide'); g.onclick = () => { step = 0; go('onboard'); };
  const ex = el('button', 'plain', 'Export preferences'); ex.onclick = exportSettings;
  const im = el('button', 'plain', 'Import preferences'); im.onclick = importSettings;
  const rs = el('button', 'danger', 'Reset to defaults');
  rs.onclick = () => { if (confirm('Reset every preference to the defaults? Role names, staff and your logo will be cleared.')) { S = defaultSettings(); S.onboarded = true; saveSettings(); render(); } };
  row.append(g, ex, im, rs); intro.append(row);
  m.append(intro);

  const prevPanel = section('Live example', 'Everything below is shown against the same example, David Gill.');
  prevPanel.append(livePreview());
  prevPanel.style.position = 'sticky'; prevPanel.style.top = '62px'; prevPanel.style.zIndex = '4';
  m.append(prevPanel);
  [secWords(), secTiers(), secRoles(), secStaff(), secStructure(), secEmph(), secFields(), secDoc()]
    .forEach(s => m.append(s));
}

/* ============================================================
   Setup guide — one question per screen
   ============================================================ */
const ONB_CSS = `
.q{max-width:720px}
.q h2{font-size:22px;line-height:1.3;margin-bottom:6px;letter-spacing:-.01em}
.q .why{font-size:13.5px;color:var(--muted);margin:0 0 16px}
.cards{display:grid;gap:8px;margin-bottom:10px}
.card2{display:flex;gap:10px;align-items:flex-start;text-align:left;width:100%;
  background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:11px 13px;
  color:var(--ink);font-weight:500;cursor:pointer}
.card2:hover{border-color:var(--accent)}
.card2.on{border-color:var(--accent);background:#f4fafc;box-shadow:inset 0 0 0 1px var(--accent)}
.card2 .tick{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--line);flex:none;margin-top:2px}
.card2.on .tick{border-color:var(--accent);box-shadow:inset 0 0 0 4px var(--accent)}
.card2 b{display:block;font-size:14.5px}
.card2 span.ex{display:block;font-size:12.5px;color:var(--muted);margin-top:3px;font-weight:400}
.q .own{display:flex;gap:8px;align-items:center;margin-top:6px}
.q .own input{max-width:280px}
.onbbar{display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap}
.onbtop{max-width:720px;margin-bottom:14px}
.onbtop .lbl{display:flex;justify-content:space-between;font-size:12px;color:var(--faint);
  font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
`;
(() => { const st = document.createElement('style'); st.textContent = ONB_CSS; document.head.append(st); })();

/* --- small controls, one question's worth each --- */
function chooser(box, options, get, set, opts) {
  const wrap = el('div', 'cards');
  const draw = () => {
    wrap.innerHTML = '';
    options.forEach(([val, label, example]) => {
      const b = el('button', 'card2' + (get() === val ? ' on' : ''));
      b.type = 'button';
      b.append(el('span', 'tick'));
      const t = el('span');
      t.append(el('b', null, label));
      if (example) t.append(el('span', 'ex', example));
      b.append(t);
      b.onclick = () => { set(val); draw(); bump(); if (opts && opts.rerender) renderOnboard(); };
      wrap.append(b);
    });
  };
  draw();
  box.append(wrap);
  return wrap;
}
function wordQuestion(box, options, get, set) {
  const chosen = () => options.some(o => o[0] === get()) ? get() : '__own';
  const wrap = chooser(box, [...options.map(([v, l]) => [v, l, null]), ['__own', 'Something else', 'Type your own word']],
    chosen, v => { if (v !== '__own') set(v); });
  const own = el('div', 'own');
  const i = el('input'); i.type = 'text'; i.placeholder = 'Your word';
  i.value = options.some(o => o[0] === get()) ? '' : (get() || '');
  i.oninput = () => { set(i.value); bump(); };
  own.append(i);
  box.append(own);
}
function yesNo(box, get, set, yes, no, rerender) {
  chooser(box, [[true, yes[0], yes[1]], [false, no[0], no[1]]], () => !!get(), set, { rerender });
}
function textRows(box, rows) {
  const g = el('div', 'grid g2');
  rows.forEach(([label, get, set, ph]) => textPref(g, label, get, set, ph));
  box.append(g);
}

const FIELD_HINTS = {
  level:'Present Environment through to Extensive', tier:'Your own tier names',
  category:'Which kind of ' + 'adjustment it is', frequency:'How often it happens',
  intensity:'How much support is given', setting:'Where or when it applies',
  outcome:'What it makes possible', roles:'The role, and who supports them',
  assigned:'A named person from your staff list', evidence:'What staff should be noting',
  evbase:'What the decision was based on', specialist:'A report or practitioner behind it',
  voice:'A question to ask the student at review', independence:'How adult help reduces over time',
  status:'Proposed, agreed, in place, being faded', startdate:'When it starts',
  reviewdate:'When it is next looked at', approver:'Who signed it off and when',
  notes:'Free text for anything else', id:'The library reference',
  vc:'Learning area, level working towards, content description and curriculum advice',
};

/* --- the questions --- */
function onbSteps() {
  const steps = [];
  const add = (group, q, why, build, example) => steps.push({ group, q, why, build, example: example !== false });

  add('Welcome', 'Set this up for your school',
      'One short question at a time. Nothing is permanent — you can change any of it later under Preferences.',
      box => {
        const d = el('p', 'muted');
        d.innerHTML = 'Every question shows the same example, <b>David Gill</b>, so you can see what your choice does before you move on.';
        box.append(d);
      });

  add('Words', 'What do you call a young person at your school?', 'This word is used across every screen and every document.',
      box => wordQuestion(box, [['student', 'Student'], ['young person', 'Young person'], ['learner', 'Learner'], ['child', 'Child']],
        () => S.words.student, v => S.words.student = v));

  add('Words', 'And what do you call a support that is put in place?', 'Schools use different words for the same thing.',
      box => wordQuestion(box, [['adjustment', 'Adjustment'], ['accommodation', 'Accommodation'], ['support', 'Support'], ['modification', 'Modification']],
        () => S.words.adjustment, v => S.words.adjustment = v));

  add('Words', 'What do you call the scale you set for each activity?', 'The five-point scale from Present Environment through to Extensive.',
      box => wordQuestion(box, [['level of adjustment', 'Level of adjustment'], ['level of support', 'Level of support'], ['adjustment level', 'Adjustment level']],
        () => S.words.level, v => S.words.level = v));

  add('MTSS tiers', 'Does your school use MTSS tiers of support?',
      'MTSS means multi-tiered system of support. Tiers describe the support arrangement, while the predicted activity level guides the recommended frequency and intensity.',
      box => yesNo(box, () => S.showTiers, v => S.showTiers = v,
        ['Yes, we use MTSS tiers', 'Each ' + W('adjustment') + ' shows an indicative MTSS tier'],
        ['No, leave tiers out', 'Nothing about tiers appears anywhere'], true));

  if (S.showTiers) {
    add('Tiers', 'What are your tiers called?',
        'Add or remove rows — some schools have a Tier 0, or a Tier 2+ and Tier 3+. Say which library tier each of yours stands for; '
        + 'a tier with none behind it is one you pick by hand on an individual ' + W('adjustment') + '.',
        box => { const t = secTiers(); t.querySelector('h2').remove(); const sub = t.querySelector('.sub'); if (sub) sub.remove();
                 t.style.cssText = 'border:none;padding:0;margin:0'; box.append(t); }, false);
  }

  add('Roles', 'Who does this work at your school?',
      'Turn a role on if someone at your school does it. Naming them and adding people is optional, and anything off disappears from every list and document. '
      + 'Learning Mentor, Education Support, Inclusion Officer and Teacher\u2019s Aide are one role here.',
      box => {
        // One flowing card per role: switch it on, then name it and staff it inline.
        // Grouping, counts and examples all come from the library, so they stay true as it changes.
        const primaryCat = r => {
          const counts = {};
          RSUP.filter(x => x.role === r.key).forEach(x => counts[x.category] = (counts[x.category] || 0) + 1);
          let best = '', n = 0;
          Object.keys(counts).forEach(c => { if (counts[c] > n) { n = counts[c]; best = c; } });
          return best; // '' for custom roles with no library supports yet
        };
        const statsOf = key => {
          const mine = RSUP.filter(x => x.role === key);
          if (!mine.length) return null;
          const tiers = mine.map(x => x.tier);
          const lo = Math.min(...tiers), hi = Math.max(...tiers);
          return { n: mine.length, tiers: lo === hi ? 'Tier ' + lo : 'Tier ' + lo + '\u2013' + hi,
                   acts: [...new Set(mine.flatMap(x => x.activities || []))].length, ex: mine[0] };
        };
        const card = (r, g) => {
          const wrap = el('div');
          const b = el('button', 'card2' + (roleOn(r.key) ? ' on' : '')); b.type = 'button';
          b.append(el('span', 'tick'));
          const t = el('span'); t.append(el('b', null, roleLabel(r.key)), el('span', 'ex', r.hint));
          const st = statsOf(r.key);
          if (st) {
            const bits = [st.n + ' adjustment' + (st.n === 1 ? '' : 's') + ' · ' + st.tiers];
            if (st.acts) bits.push('in ' + st.acts + ' activit' + (st.acts === 1 ? 'y' : 'ies'));
            t.append(el('span', 'ex', bits.join(' · ')));
          }
          const cats = [...new Set(RSUP.filter(x => x.role === r.key).map(x => x.category))].slice(0, 2).join(' · ');
          if (cats) t.append(el('span', 'ex', 'Oversees: ' + cats));
          b.append(t);
          const exp = el('div');
          const drawExp = () => {
            exp.innerHTML = '';
            if (!roleOn(r.key)) return;
            exp.style.cssText = 'border:1px solid var(--line);border-top:none;border-radius:0 0 9px 9px;margin:-8px 0 8px;padding:10px 13px;background:#fbfdfe';
            exp.append(el('label', 'f', 'What do you call this role? (optional)'));
            const nm = el('input'); nm.type = 'text'; nm.placeholder = r.label; nm.value = S.roleLabels[r.key] || '';
            nm.style.maxWidth = '320px';
            nm.oninput = () => {
              if (nm.value.trim()) S.roleLabels[r.key] = nm.value.trim(); else delete S.roleLabels[r.key];
              b.querySelector('b').textContent = roleLabel(r.key); bump();
            };
            exp.append(nm);
            if (r.also && r.also.length) {
              const sug = el('div', 'tiny'); sug.style.marginTop = '4px';
              r.also.forEach(name => {
                const sb = el('button', 'link', name); sb.style.marginRight = '8px';
                sb.onclick = () => { S.roleLabels[r.key] = name; nm.value = name; b.querySelector('b').textContent = name; bump(); };
                sug.append(sb);
              });
              exp.append(sug);
            }
            if (st) {
              const exP = el('p', 'tiny');
              exP.style.margin = '8px 0 0';
              exP.textContent = 'Sounds like: ' + segText(compose(st.ex, 'team', true)).slice(0, 150) + '\u2026';
              exp.append(exP);
            }
            exp.append(el('label', 'f', 'Who fills this role? Add names (optional)'));
            const list = el('div');
            const drawNames = () => {
              list.innerHTML = '';
              S.staff.filter(x => x.role === r.key).forEach(st2 => {
                const row = el('div', 'tools');
                const n = el('input'); n.type = 'text'; n.placeholder = 'Name'; n.value = st2.name; n.style.maxWidth = '220px';
                n.oninput = () => { st2.name = n.value; saveSettings(); };
                const x = el('button', 'danger small', 'Remove');
                x.onclick = () => { S.staff.splice(S.staff.indexOf(st2), 1); saveSettings(); drawNames(); };
                row.append(n, x); list.append(row);
              });
            };
            drawNames(); exp.append(list);
            const addP = el('button', 'ghost small', 'Add a person');
            addP.onclick = () => { S.staff.push({ name: '', role: r.key }); saveSettings(); drawNames(); };
            exp.append(addP);
          };
          drawExp();
          b.onclick = () => {
            S.rolesOff = roleOn(r.key) ? uniq([...S.rolesOff, r.key]) : S.rolesOff.filter(k => k !== r.key);
            b.classList.toggle('on', roleOn(r.key)); drawExp(); bump();
          };
          wrap.append(b, exp);
          g.append(wrap);
        };
        const groups = {}, order = [];
        allRoles().forEach(r => {
          const c = primaryCat(r);
          if (!groups[c]) { groups[c] = []; order.push(c); }
          groups[c].push(r);
        });
        order.forEach(c => {
          box.append(el('div', 'tiny', c ? 'Who oversees ' + c.toLowerCase() + ' adjustments?' : 'Other roles'));
          const g = el('div', 'grid g2');
          groups[c].forEach(r => card(r, g));
          box.append(g);
        });
        // Staff left over from earlier setups (no role, or a role since turned off) stay editable here
        const loose = () => S.staff.filter(st => !st.role || !roleOn(st.role));
        if (loose().length) {
          box.append(el('div', 'tiny', 'Other staff (no current role)'));
          const list = el('div');
          const inUse = rolesInUse();
          loose().forEach(st => {
            const row = el('div', 'tools');
            const n = el('input'); n.type = 'text'; n.placeholder = 'Name'; n.value = st.name; n.style.maxWidth = '200px';
            n.oninput = () => { st.name = n.value; saveSettings(); };
            const r = el('select'); r.style.maxWidth = '220px';
            r.append(new Option('\u2014 role \u2014', ''));
            inUse.forEach(x => r.append(new Option(roleLabel(x.key), x.key)));
            if (st.role && !inUse.some(x => x.key === st.role)) r.append(new Option(roleLabel(st.role) + ' (off)', st.role));
            r.value = st.role || '';
            r.onchange = () => { st.role = r.value; saveSettings(); render(); };
            const x = el('button', 'danger small', 'Remove');
            x.onclick = () => { S.staff.splice(S.staff.indexOf(st), 1); saveSettings(); render(); };
            row.append(n, r, x); list.append(row);
          });
          box.append(list);
        }
      }, false);

  add('Wording', 'How should ' + AN(W('adjustment')) + ' be written?',
      'The same ' + W('adjustment') + ', written several different ways. Watch the example change.',
      box => chooser(box, STRUCTURES.map(([v, l, ex]) => [v, l, ex]), () => S.structure, v => S.structure = v));

  add('Wording', 'Which word describes the commitment?',
      'Some schools want an expectation, others want a firm undertaking.',
      box => {
        chooser(box, [
          ['should', 'should', 'The Classroom Teacher should provide …'],
          ['will',   'will',   'The Classroom Teacher will provide …'],
          ['must',   'must',   'The Classroom Teacher must provide …'],
          ['is to',  'is to',  'The Classroom Teacher is to provide …'],
        ], () => S.modal, v => S.modal = v);
        if (S.structure === 'labelled' || S.structure === 'table') {
          previewStructOverride = 'role';
          const n = el('p', 'note');
          n.textContent = 'Your layout (' + (STRUCTURES.find(x => x[0] === S.structure) || [])[1]
            + ') does not use a commitment word, so the example is shown as a sentence. '
            + 'Your choice is kept and applies whenever a sentence layout is used.';
          box.append(n);
          const d = $('#live-prev'); if (d) d.innerHTML = samplePreviewHtml();
        } else previewStructOverride = null;
      });

  add('Wording', 'Who is the wording written for?',
      'Each one reads differently — the example underneath shows the one you pick.',
      box => chooser(box, AUDIENCES, () => S.audience, v => S.audience = v));

  add('Wording', 'Should the sentence name the setting or trigger?',
      'For example "during reading tasks" or "at transitions". It is more precise, but it makes the sentence longer.',
      box => yesNo(box, () => S.includeSetting, v => S.includeSetting = v,
        ['Yes, name it in the sentence', 'More precise, a little longer'],
        ['No, keep it shorter', 'The setting is still recorded as a detail']));

  add('Emphasis', 'What should stand out, and in what colour?',
      'Bold, italic, underline or a colour for any part. This carries into the exported document and the printed copy.',
      box => { const t = secEmph(); t.querySelector('h2').remove(); const sub = t.querySelector('.sub'); if (sub) sub.remove();
               t.style.cssText = 'border:none;padding:0;margin:0'; box.append(t); });

  add('What to record', 'What should each ' + W('adjustment') + ' record?',
      'Tick everything you want kept against each one. Each becomes a field to fill in, a row in the document and a column in the '
      + 'spreadsheet. Nothing is invented — anything you tick starts blank until someone fills it in.',
      box => {
        const g = el('div', 'grid g2');
        FIELD_DEFS.forEach(([k, label]) => {
          if (k === 'tier' && !S.showTiers) return;
          const b = el('button', 'card2' + (S.fields[k] ? ' on' : '')); b.type = 'button';
          b.append(el('span', 'tick'));
          const t = el('span'); t.append(el('b', null, fieldLabel(k, label)));
          const hint = FIELD_HINTS[k];
          if (hint) t.append(el('span', 'ex', hint));
          b.append(t);
          b.onclick = () => { S.fields[k] = !S.fields[k]; b.classList.toggle('on', S.fields[k]); bump(); };
          g.append(b);
        });
        box.append(g);
      });

  add('The document', 'How should the exported document look?',
      'Grouping, what is included, your logo, colour and page furniture. All of it can be changed later.',
      box => { const t = secDoc(); t.querySelector('h2').remove(); const sub = t.querySelector('.sub'); if (sub) sub.remove();
               t.style.cssText = 'border:none;padding:0;margin:0'; box.append(t); }, false);

  add('Finish', 'That is the setup done', 'Saved on this device. It stays when you start a new ' + W('student') + '.',
      box => {
        const t = el('table', 'plain');
        const row = (k, v) => { const tr = el('tr'); tr.append(el('td', null, k)); const d = el('td'); d.innerHTML = '<b>' + esc(v) + '</b>'; tr.append(d); t.append(tr); };
        row('Your words', [W('student'), W('adjustment'), W('level')].join(' · '));
        row('Tiers', S.showTiers ? (S.tierList || []).map(t => t.label).join(' · ') : 'Not used');
        row('Roles turned off', S.rolesOff.length ? S.rolesOff.map(roleLabel).join(', ') : 'None');
        row('Staff added', S.staff.filter(x => x.name).length || 'None yet');
        row('Wording', (STRUCTURES.find(x => x[0] === S.structure) || [])[1] + ', "' + S.modal + '", for ' + (AUDIENCES.find(a => a[0] === S.audience) || [])[1].toLowerCase());
        row('Recorded with each ' + W('adjustment'),
            FIELD_DEFS.filter(([k]) => S.fields[k] && (k !== 'tier' || S.showTiers)).map(([k, l]) => fieldLabel(k, l)).join(', ') || 'Just the wording');
        row('Document', 'Grouped by ' + S.doc.groupBy + ' · ' + S.doc.paper + ' · ' + S.doc.font + 'pt'
              + (S.doc.logo ? ' · with your logo' : '') + (S.doc.org ? ' · ' + S.doc.org : ''));
        box.append(t);
        box.append(el('p', 'muted', 'Next: add the ' + W('student') + "'s details, then work through the " + ACTS.length + ' activities one at a time.'));
      });

  return steps;
}

let step = 0;
function renderOnboard() { render(); }
function viewOnboard(m) {
  const steps = onbSteps();
  if (step >= steps.length) step = steps.length - 1;
  if (step < 0) step = 0;
  const cur = steps[step];

  const top = el('div', 'onbtop');
  const lbl = el('div', 'lbl');
  lbl.append(el('span', null, cur.group), el('span', null, 'Step ' + (step + 1) + ' of ' + steps.length));
  const bar = el('div', 'progress'); const fill = el('i');
  fill.style.width = Math.round((step + 1) / steps.length * 100) + '%'; bar.append(fill);
  top.append(lbl, bar);
  m.append(top);

  const q = el('div', 'q');
  q.append(el('h2', null, cur.q));
  if (cur.why) q.append(el('p', 'why', cur.why));
  const box = el('div');
  previewStructOverride = null;
  cur.build(box);
  q.append(box);
  if (cur.example) {
    const ex = livePreview(); ex.style.marginTop = '14px';
    q.append(ex);
  }

  const bar2 = el('div', 'onbbar');
  const back = el('button', 'plain', '← Back'); back.disabled = step === 0;
  back.onclick = () => { step--; render(); window.scrollTo({ top: 0 }); };
  const next = el('button', '', step === steps.length - 1 ? 'Finish setup' : 'Next');
  next.onclick = () => {
    if (step === steps.length - 1) { S.onboarded = true; saveSettings(); step = 0; go('setup'); }
    else { step++; render(); window.scrollTo({ top: 0 }); }
  };
  const skip = el('button', 'link', 'Skip the rest');
  skip.onclick = () => { S.onboarded = true; saveSettings(); step = 0; go('setup'); };
  bar2.append(back, next, el('span', 'spacer'), skip);
  bar2.querySelector('.spacer').style.flex = '1 1 auto';
  q.append(bar2);
  m.append(q);

  window.onkeydown = e => {
    if (view !== 'onboard') { window.onkeydown = null; return; }
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); next.click(); }
    else if (e.key === 'Escape') skip.click();
  };
}

/* ============================================================
   Review, exports, boot
   ============================================================ */
function entries() {
  const out = [];
  Object.keys(ST.acts).forEach(k => {
    const a = ST.acts[k];
    if (a.state !== 'set') return;
    Object.keys(a.picks || {}).forEach(id => {
      const obj = ITEMS.find(x => x.id === id);
      if (obj) {
        const pick = { ...a.picks[id], level: Number.isInteger(a.picks[id].level) ? a.picks[id].level : a.level };
        out.push({ kind:'activity', obj, pick, act:+k, level:levelForRecommendation(obj, pick) });
      }
    });
    (a.custom || []).forEach(ce => {
      if (a.picks && a.picks[ce.id]) {
        const obj = customObj(+k, ce, a.level);
        const pick = { ...a.picks[ce.id], level: Number.isInteger(a.picks[ce.id].level) ? a.picks[ce.id].level : a.level };
        out.push({ kind:'activity', obj, pick, act:+k, level:levelForRecommendation(obj, pick) });
      }
    });
  });
  Object.keys(ST.team).forEach(id => {
    const obj = RSUP.find(x => x.id === id);
    if (obj) out.push({ kind:'team', obj, pick:ST.team[id] });
  });
  return out;
}
function groupKey(e) {
  switch (S.doc.groupBy) {
    case 'role':
      return responsibilityFor(e.kind, e.obj, e.pick);
    case 'tier': {
      const p = e.pick || {};
      return p.tier || (e.kind === 'team' ? tierFull(e.obj.tier) : tierLabel(LEVELINFO[levelForRecommendation(e.obj, p)].tier));
    }
    case 'category':
      return e.kind === 'team' ? e.obj.category : CATS[e.obj.c];
    default: {
      if (e.kind === 'team') {
        if (e.obj.wholePlan) return 'Whole-plan coordination';
        const ai = (e.obj.activities || [])[0];
        if (ai != null && ACTS[ai]) {
          const di = DOMAINS.findIndex((_, k) => DOMACTS[k].includes(ai));
          return DOMAINS[di] + ' \u2014 ' + ACTS[ai];
        }
        return roleLabel(e.obj.role);
      }
      return DOMAINS[DOMAINS.findIndex((_, k) => DOMACTS[k].includes(e.act))] + ' \u2014 ' + ACTS[e.act];
    }
  }
}
function grouped() {
  const g = new Map();
  entries().forEach(e => { const k = groupKey(e); if (!g.has(k)) g.set(k, []); g.get(k).push(e); });
  return g;
}
function entryHtml(e) { return recommendationHtml(e.kind, e.obj, e.pick); }
function entryText(e) { return recommendationText(e.kind, e.obj, e.pick); }
function recommendationGroupSummary(items) {
  const levels = [...new Set(items.map(e => levelLabel(levelForRecommendation(e.obj, e.pick))))];
  const tiers = [...new Set(items.map(e => e.pick.tier || tierLabel(LEVELINFO[levelForRecommendation(e.obj, e.pick)].tier)))];
  return 'Recommended ' + W('level') + ': ' + levels.join('; ')
    + (S.showTiers ? ' · MTSS tier: ' + tiers.join('; ') : '');
}

/* ---------------- review ---------------- */
function viewReview(m) {
  const list = entries();
  const p = section('Review', list.length + ' selected in total. This is exactly what will be exported.');
  const notAddressed = ACTS.map((_, i) => i).filter(i => !(ST.acts[i] && ST.acts[i].state));
  const setNoPicks = Object.keys(ST.acts).filter(k => ST.acts[k].state === 'set' && !Object.keys(ST.acts[k].picks || {}).length);
  if (!ST.details.name) p.append(el('p', 'note warn', 'No ' + W('student') + ' name yet — add it under ' + NAV[0][1] + '.'));
  if (notAddressed.length) {
    const n = el('p', 'note');
    n.innerHTML = '<b>' + notAddressed.length + ' activit' + (notAddressed.length === 1 ? 'y has' : 'ies have')
      + ' not been looked at yet:</b> ' + esc(notAddressed.slice(0, 8).map(i => ACTS[i]).join(', '))
      + (notAddressed.length > 8 ? ' and ' + (notAddressed.length - 8) + ' more.' : '');
    const b = el('button', 'link', 'Go to the first one');
    b.onclick = () => go('activities', notAddressed[0]);
    n.append(document.createElement('br'), b);
    p.append(n);
  }
  if (setNoPicks.length) p.append(el('p', 'note', setNoPicks.length + ' activit' + (setNoPicks.length === 1 ? 'y has a ' : 'ies have a ') + W('level') + ' set but nothing selected. That is fine if nothing was needed.'));
  m.append(p);

  const g = grouped();
  if (!g.size) { m.append(el('p', 'muted', 'Nothing selected yet.')); return; }
  g.forEach((items, key) => {
    const s = section(key, items.length + ' ' + W('adjustment') + (items.length === 1 ? '' : 's'));
    items.forEach(e => {
      const d = el('div', 'sel');
      const t = el('div'); t.innerHTML = entryHtml(e); t.style.marginBottom = '4px';
      d.append(t);
      const rows = detailRows(e.kind, e.obj, e.pick);
      if (rows.length) {
        const tb = el('table', 'plain');
        rows.forEach(r => { const tr = el('tr'); const a = el('td'); a.innerHTML = '<span class="tiny">' + esc(r[0]) + '</span>';
          a.style.width = '32%'; const b = el('td'); b.innerHTML = r[1]; tr.append(a, b); tb.append(tr); });
        d.append(tb);
      }
      flagsFor(e.kind, e.obj).forEach(f => d.append(el('span', 'pill flag', f)));
      const jump = el('button', 'link', e.kind === 'team' ? (e.obj.wholePlan ? 'Edit whole-plan support' : 'Edit in ' + (ACTS[(e.obj.activities||[])[0]] || 'activity')) : 'Edit in ' + ACTS[e.act]);
      jump.style.marginLeft = '8px';
      jump.onclick = () => {
        if (e.kind === 'team') {
          const ai = (e.obj.activities || [])[0];
          go('activities', ai != null ? ai : 0);
        } else {
          go('activities', e.act);
        }
      };
      d.append(jump);
      s.append(d);
    });
    m.append(s);
  });
}

/* ---------------- document ---------------- */
function docHtml() {
  const D = ST.details, d = S.doc, col = d.colour || '#1f5872';
  const title = uc1(W('adjustment')) + 's' + (D.name ? ' for ' + esc(D.name) : '');
  const band = d.bands ? 'background:' + col + ';color:#fff;padding:3pt 6pt;' : 'border-bottom:1pt solid ' + col + ';';
  let h = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:${d.paper === 'Letter' ? 'letter' : 'A4'};margin:2cm}
body{font-family:Calibri,-apple-system,"Segoe UI",Arial,sans-serif;font-size:${d.font}pt;color:#1d2430}
h1{font-size:${d.font + 6}pt;margin:0 0 2pt;color:${col}}
h2{font-size:${d.font + 1.5}pt;margin:15pt 0 5pt;${band}}
p.org{font-size:${d.font}pt;color:#5f6b7a;margin:0 0 6pt}
p.rule{font-size:${d.font - 2}pt;color:#8a95a3;margin:0 0 10pt;border-bottom:0.5pt solid #cfd6de;padding-bottom:4pt}
p.small{font-size:${d.font - 1.5}pt;color:#5f6b7a;margin:2pt 0}
table{border-collapse:collapse;width:100%;margin:5pt 0 10pt}
td,th{border:0.5pt solid #b9c2cc;padding:4pt 6pt;font-size:${d.font - 0.5}pt;vertical-align:top;text-align:left}
th{background:#eef1f5;font-weight:600}
table.detail th{width:32%}
table.grid th{background:${col};color:#fff}
.adj{margin:0 0 3pt;font-size:${d.font}pt}
.flags{font-size:${d.font - 1.5}pt;color:#8a4030}
.sign td{height:34pt}
img.logo{max-width:${d.logoWidth || 120}px;margin-bottom:6pt}
</style></head><body>`;
  if (d.logo) h += `<img class="logo" src="${d.logo}">`;
  if (d.header) h += `<p class="rule">${esc(d.header)}</p>`;
  if (d.org) h += `<p class="org">${esc(d.org)}</p>`;
  h += `<h1>${esc(title)}</h1>`;
  h += `<p class="small">Prepared ${esc(D.date || '')}${D.by ? ' by ' + esc(D.by) : ''}${D.context ? ' · ' + esc(D.context) : ''}.</p>`;
  if (d.cover) {
    h += `<table class="detail">
<tr><th>${esc(uc1(W('student')))}</th><td>${esc(D.name)}</td><th>Year level</th><td>${esc(D.year)}</td></tr>
<tr><th>Preferred name</th><td>${esc(D.pref)}</td><th>Date</th><td>${esc(D.date)}</td></tr>
<tr><th>Prepared by</th><td>${esc(D.by)}</td><th>Review date</th><td>${esc(D.review)}</td></tr>
<tr><th>Purpose</th><td colspan="3">${esc(D.context)}</td></tr></table>`;
  }
  grouped().forEach((items, key) => {
    h += `<h2>${esc(key)}</h2>`;
    if (d.groupBy === 'domain' && items[0].kind === 'activity') {
      h += `<p class="small">${esc(recommendationGroupSummary(items))}</p>`;
    }
    if (S.structure === 'table') {
      h += `<table class="grid"><tr><th style="width:40%">${esc(uc1(W('adjustment')))}</th><th>Frequency</th>`
        + `<th>Intensity</th><th>Who is responsible</th><th>Access outcome</th></tr>`;
      items.forEach(e => {
        const c = tableCells(e.kind, e.obj, e.pick);
        h += `<tr><td>${c.adjustment}${extraCell(e)}</td><td>${c.frequency}</td><td>${c.intensity}</td>`
          + `<td>${c.who}</td><td>${c.outcome}</td></tr>`;
      });
      h += `</table>`;
      return;
    }
    items.forEach(e => {
      h += `<p class="adj">${entryHtml(e)}</p>`;
      let rows = detailRows(e.kind, e.obj, e.pick);
      if (d.groupBy === 'domain' && e.kind === 'activity' && e.level === ST.acts[e.act].level) {
        const drop = [uc1(W('level')), 'MTSS tier'];
        rows = rows.filter(r => !drop.includes(r[0]) || (r[0] === 'MTSS tier' && e.pick.tier));
      }
      if (rows.length) h += '<table class="detail">' + rows.map(r => `<tr><th>${esc(r[0])}</th><td>${r[1]}</td></tr>`).join('') + '</table>';
      const fl = flagsFor(e.kind, e.obj);
      if (fl.length) h += `<p class="flags">${esc(fl.join(' · '))}</p>`;
      if (d.ids) h += `<p class="small">${esc(e.obj.id)}</p>`;
    });
  });
  if (d.approvalBlock) {
    h += `<h2>Sign-off</h2><table class="sign">
<tr><th>Role</th><th>Name</th><th>Signature</th><th>Date</th></tr>
<tr><td>${esc(uc1(W('student')))}</td><td></td><td></td><td></td></tr>
<tr><td>Parent or carer</td><td></td><td></td><td></td></tr>
<tr><td>${esc(roleLabel('classroom_teacher'))}</td><td></td><td></td><td></td></tr>
<tr><td>${esc(roleLabel('di_lead'))}</td><td></td><td></td><td></td></tr></table>`;
  }
  if (d.guidance) {
    h += `<p class="small">${esc(uc1(W('level')))} is decided for each activity, not for the ${esc(W('student'))} as a whole.`
      + (S.showTiers ? ` Any MTSS tier shown describes the ${esc(W('adjustment'))}; quality teaching continues alongside targeted and intensive support.` : '')
      + ` Recommended frequency and intensity are proposed starting arrangements for the selected level. Keep, edit or remove suggestions before agreeing the plan.</p>`
      + `<p class="small">Built with the Adjustments Builder. The ${esc(W('adjustment'))} library is a working draft, not approved guidance,`
      + ` shared under CC BY-NC-SA 4.0 by David Gill. Victorian Curriculum F–10 content elements are © VCAA, licensed CC-BY-NC.</p>`;
  }
  if (d.footer) h += `<p class="rule" style="border:none;border-top:0.5pt solid #cfd6de;padding-top:4pt;margin-top:12pt">${esc(d.footer)}</p>`;
  return h + '</body></html>';
}
/* extra per-adjustment detail that still needs to appear inside a table cell */
function extraCell(e) {
  const rows = detailRows(e.kind, e.obj, e.pick).filter(r =>
    !['Frequency', 'Intensity', 'Who is responsible', 'Access outcome', uc1(W('adjustment'))].includes(r[0]));
  const fl = flagsFor(e.kind, e.obj);
  let out = '';
  if (rows.length) out += '<p class="small">' + rows.map(r => esc(r[0]) + ': ' + r[1]).join(' · ') + '</p>';
  if (fl.length) out += '<p class="flags">' + esc(fl.join(' · ')) + '</p>';
  return out;
}

function stamp(ext) {
  const n = (ST.details.name || W('student')).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'student';
  return n + '_' + W('adjustment') + 's_' + new Date().toISOString().slice(0, 10) + '.' + ext;
}
function download(name, mime, text) {
  const b = new Blob(['﻿' + text], { type: mime });
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}
function needEntries() {
  if (entries().length) return true;
  alert('Select at least one ' + W('adjustment') + ' first.');
  return false;
}
function exportPrint() {
  if (!needEntries()) return;
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for this page to print.'); return; }
  w.document.write(docHtml()); w.document.close(); w.focus();
  setTimeout(() => w.print(), 350);
}
/* ---------------- files ---------------- */
function pickFile(cb) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json';
  i.onchange = () => {
    const f = i.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { cb(JSON.parse(r.result)); } catch (e) { alert('That file could not be read.'); } };
    r.readAsText(f);
  };
  i.click();
}
function saveFile() { download(stamp('json'), 'application/json', JSON.stringify({ kind:'student', v:2, student:ST }, null, 2)); }
/* Opening a file adds that student to the list on this device. It never
   overwrites whoever is on screen; the only replacement is a newer or older
   copy of the same student, and that is asked first. */
function openFile() {
  pickFile(d => {
    const data = d.student || d;
    if (!data || !data.details) { alert('That does not look like a saved ' + W('student') + ' file.'); return; }
    const incoming = normaliseStudent(data);
    const existing = incoming.id && ROSTER.list.find(r => r.id === incoming.id);
    if (existing) {
      const nm = existing.name || 'this ' + W('student');
      const when = existing.updated ? ' (last changed ' + new Date(existing.updated).toLocaleString() + ')' : '';
      if (!confirm(nm + ' is already on this device' + when + '. Replace that copy with the one in this file?')) return;
    } else {
      incoming.id = newStudentId();
    }
    ST = incoming; curAct = null; saveStudent(); go('setup');
  });
}
function exportSettings() {
  download('adjustments_preferences_' + new Date().toISOString().slice(0, 10) + '.json',
    'application/json', JSON.stringify({ kind:'settings', v:2, settings:S }, null, 2));
}
function importSettings() {
  pickFile(d => {
    const data = d.settings || d;
    if (!data.words || !data.fields) { alert('That does not look like a preferences file.'); return; }
    S = Object.assign(defaultSettings(), data); saveSettings(); render();
  });
}
/* A new student is added alongside the others; nobody is cleared. An empty
   current student is reused rather than leaving blank entries in the list. */
function newStudent() {
  if (studentHasContent(ST)) { ST = blankStudent(); }
  curAct = null; saveStudent(); go('setup');
}

/* ---------------- accessibility ---------------- */
/* Field captions are drawn as <label class="f"> followed by their control.
   Link each one to that control so screen readers announce the field's name.
   A label already wrapping its control, or captioning a group of options,
   is left alone. Runs whenever the page draws something new. */
let labelSeq = 0;
function linkLabels(root) {
  (root || document).querySelectorAll('label.f:not([for])').forEach(l => {
    if (l.querySelector('input,select,textarea')) return;
    const c = l.nextElementSibling;
    if (!c || !/^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName) || c.type === 'radio' || c.type === 'checkbox') return;
    if (!c.id) c.id = 'fld-' + (++labelSeq);
    l.htmlFor = c.id;
  });
}
let labelPending = false;
new MutationObserver(() => {
  if (labelPending) return;
  labelPending = true;
  queueMicrotask(() => { labelPending = false; linkLabels(); });
}).observe(document.body, { childList: true, subtree: true });

/* ---------------- boot ---------------- */
$('#btn-onboard').onclick = () => { step = 0; go('onboard'); };
loadAll();
view = S.onboarded ? 'setup' : 'onboard';
render();

/* ============================================================
   Offline OOXML export — real .xlsx and .docx with no dependencies.
   Stored (uncompressed) zip + minimal SpreadsheetML/WordprocessingML,
   reusing the app's own columns, groups and detail rows.
   ============================================================ */
function crc32Bytes(b) {
  let t = crc32Bytes.t;
  if (!t) {
    t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    crc32Bytes.t = t;
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const ooxmlEnc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const strBytes = s => ooxmlEnc.encode(s);
function zipStore(files) {
  // files: [[name, Uint8Array]] — plain stored zip, no compression
  const enc = [], central = [];
  let off = 0;
  const w32 = (a, v) => { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); };
  const w16 = (a, v) => { a.push(v & 255, (v >>> 8) & 255); };
  files.forEach(([name, data]) => {
    const nb = strBytes(name), crc = crc32Bytes(data);
    const lh = [];
    w32(lh, 0x04034b50); w16(lh, 20); w16(lh, 0x0800); w16(lh, 0); w16(lh, 0); w16(lh, 0);
    w32(lh, crc); w32(lh, data.length); w32(lh, data.length);
    w16(lh, nb.length); w16(lh, 0);
    const ce = [];
    w32(ce, 0x02014b50); w16(ce, 20); w16(ce, 20); w16(ce, 0x0800); w16(ce, 0); w16(ce, 0); w16(ce, 0);
    w32(ce, crc); w32(ce, data.length); w32(ce, data.length);
    w16(ce, nb.length); w16(ce, 0); w16(ce, 0); w16(ce, 0); w16(ce, 0); w32(ce, 0); w32(ce, off);
    central.push({ head: new Uint8Array(ce), nb });
    enc.push({ head: new Uint8Array(lh), nb, data });
    off += lh.length + nb.length + data.length;
  });
  let cdSize = 0;
  central.forEach(c => cdSize += c.head.length + c.nb.length);
  const out = new Uint8Array(off + cdSize + 22);
  let p = 0;
  enc.forEach(e => { out.set(e.head, p); p += e.head.length; out.set(e.nb, p); p += e.nb.length; out.set(e.data, p); p += e.data.length; });
  const cdOff = p;
  central.forEach(c => { out.set(c.head, p); p += c.head.length; out.set(c.nb, p); p += c.nb.length; });
  const end = [];
  w32(end, 0x06054b50); w16(end, 0); w16(end, 0);
  w16(end, central.length); w16(end, central.length);
  w32(end, cdSize); w32(end, cdOff); w16(end, 0);
  out.set(end, p);
  return out;
}
function downloadBytes(name, bytes, mime) {
  const b = new Blob([bytes], { type: mime });
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}
const xesc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = s => String(s == null ? '' : s).replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

/* ---------------- spreadsheet columns (one row per adjustment) ---------------- */
function sheetColumns() {
  const D = ST.details, F = S.fields;
  const cols = [
    [uc1(W('student')), () => D.name], ['Preferred name', () => D.pref], ['Year level', () => D.year],
    ['Date', () => D.date], ['Prepared by', () => D.by], ['Review date', () => D.review], ['Purpose', () => D.context],
    ['Type', e => e.kind === 'team' ? 'Team and coordination' : 'Activity'],
    ['Role section', e => e.kind === 'team' ? roleLabel(e.obj.role) : ''],
    ['Domain', e => {
      if (e.kind === 'team') {
        const ai = (e.obj.activities || [])[0];
        if (ai != null) return DOMAINS[DOMAINS.findIndex((_, k) => DOMACTS[k].includes(ai))] || '';
        return '';
      }
      return DOMAINS[DOMAINS.findIndex((_, k) => DOMACTS[k].includes(e.act))];
    }],
    ['Activity', e => {
      if (e.kind === 'team') {
        if (e.obj.wholePlan) return 'Whole-plan coordination';
        const ai = (e.obj.activities || [])[0];
        return ai != null ? ACTS[ai] : '';
      }
      return ACTS[e.act];
    }],
    [uc1(W('level')), e => e.kind === 'team' ? '' : levelLabel(e.level)],
    [uc1(W('adjustment')), e => entryText(e)],
    ['Implementation status', e => implementationStatus(e.pick)],
    ['Library status', e => e.obj.st || (e.kind === 'team' ? 'Draft support library' : 'Custom draft')],
    ['Review needed', e => e.pick.reviewNeeded ? 'Review recommended wording after level change' : ''],
  ];
  if (S.showTiers) cols.push(['MTSS tier', e => e.pick.tier || (e.kind === 'team' ? tierFull(e.obj.tier) : tierLabel(LEVELINFO[levelForRecommendation(e.obj, e.pick)].tier))]);
  const map = {
    category:  ['Category', e => e.kind === 'team' ? e.obj.category : CATS[e.obj.c]],
    frequency: ['Frequency', e => effectiveParts(e.kind, e.obj, e.pick).frequency],
    intensity: ['Intensity', e => effectiveParts(e.kind, e.obj, e.pick).intensity],
    setting:   ['Setting or trigger', e => effectiveParts(e.kind, e.obj, e.pick).setting],
    outcome:   ['Access outcome', e => effectiveParts(e.kind, e.obj, e.pick).outcome],
    roles:     ['Who is responsible', e => responsibilityFor(e.kind, e.obj, e.pick)],
    evidence:  ['Evidence to monitor', e => resolvePronouns((e.kind === 'team' ? e.obj.evidence : e.obj.ev || []).join('; ').replace(/\{preferredName\}/g, prefName()))],
    voice:     ['Student voice prompt', e => e.kind === 'team' ? '' : resolvePronouns(String(e.obj.sv || '').replace(/\{preferredName\}/g, prefName()))],
    independence: ['How support will fade', e => e.kind === 'team' ? '' : resolvePronouns(String(e.obj.ind || '').replace(/\{preferredName\}/g, prefName()))],
    assigned:  ['Named staff member', e => e.pick.assigned],
    observation: ['Observed response', e => e.pick.observation || ''],
    startdate: ['Start date', e => e.pick.startdate], reviewdate: ['Review date for this ' + W('adjustment'), e => e.pick.reviewdate],
    approver:  ['Approved by', e => e.pick.approver], evbase: ['Evidence this is based on', e => e.pick.evbase],
    specialist:['Specialist or expert advice', e => e.pick.specialist], notes: ['Notes', e => e.pick.note],
    id:        ['Record ID', e => e.obj.id],
  };
  Object.keys(map).forEach(k => { if (F[k]) cols.push(map[k]); });
  if (F.vc) {
    cols.push(
      [W('curriculum') + ' learning area', e => e.pick.vcArea ? vcAreaLabel(e.pick.vcArea) : ''],
      [W('curriculum') + ' level working towards', e => e.pick.vcLevel ? vcLevelLabel(e.pick.vcLevel) : ''],
      [W('curriculum') + ' code', e => e.pick.vcCode || ''],
      [W('curriculum') + ' content description', e => e.pick.vcDesc || ''],
      [W('curriculum') + ' elaboration', e => e.pick.vcElab || ''],
      [W('curriculum') + ' advice', e => e.pick.vcAdvice || '']
    );
  }
  cols.push(['Flags', e => flagsFor(e.kind, e.obj).join('; ')]);
  return cols;
}
function xlsxCell(v) {
  const t = String(v == null ? '' : v).replace(/\r\n|\r/g, '\n');
  return '<c t="inlineStr"><is><t xml:space="preserve">' + xesc(t).replace(/\n/g, '&#10;') + '</t></is></c>';
}
function buildXlsx() {
  const cols = sheetColumns();
  const lines = [cols.map(c => c[0])];
  entries().forEach(e => lines.push(cols.map(c => { try { const v = c[1](e); return v == null ? '' : String(v); } catch (err) { return ''; } })));
  /* A spreadsheet carrying curriculum content is a redistribution of it, so the
     attribution travels with the file. Separated by a blank row, after the data,
     so an import that reads until the first blank row is unaffected. */
  lines.push(cols.map(() => ''));
  lines.push([uc1(W('adjustment')) + 's built with the Adjustments Builder — working draft wording, '
    + 'shared under CC BY-NC-SA 4.0 by David Gill. Check every ' + W('adjustment') + ' before it is agreed.']);
  if (entries().some(e => e.pick && (e.pick.vcCode || e.pick.vcDesc))) {
    const pack = (typeof curriculumPack === 'function' && curriculumPack()) || null;
    lines.push([pack ? pack.attribution + ' ' + pack.source
      : 'Curriculum content remains the copyright of its publisher.']);
  }
  let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  lines.forEach(r => { s += '<row>'; r.forEach(v => { s += xlsxCell(v); }); s += '</row>'; });
  s += '</sheetData></worksheet>';
  return zipStore([
    ['[Content_Types].xml', strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')],
    ['_rels/.rels', strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')],
    ['xl/workbook.xml', strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Adjustments" sheetId="1" r:id="rId1"/></sheets></workbook>')],
    ['xl/_rels/workbook.xml.rels', strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')],
    ['xl/worksheets/sheet1.xml', strBytes(s)],
  ]);
}
function exportXlsx() {
  if (!needEntries()) return;
  downloadBytes(stamp('xlsx'), buildXlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ---------------- document ---------------- */
function htmlRuns(html) {
  // entryHtml uses <b> <i> <u> <br> and colour <span>; convert to runs
  const runs = [];
  let b = false, i = false, u = false, color = '';
  const re = /(<\/?(?:b|i|u|br|span)[^>]*>)|([^<>]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[2] != null) { if (m[2]) runs.push({ t: unesc(m[2]), b, i, u, color }); }
    else {
      const tag = m[1].toLowerCase();
      if (tag === '<b>') b = true;
      else if (tag === '</b>') b = false;
      else if (tag === '<i>') i = true;
      else if (tag === '</i>') i = false;
      else if (tag === '<u>') u = true;
      else if (tag === '</u>') u = false;
      else if (tag.indexOf('<br') === 0) runs.push({ br: true });
      else if (tag.indexOf('<span') === 0) { const cm = tag.match(/color\s*:\s*#?([0-9a-f]{6}|[0-9a-f]{3})/i); color = cm ? cm[1] : ''; }
      else if (tag === '</span>') color = '';
    }
  }
  return runs;
}
function runXml(r, size, base) {
  if (r.br) return '<w:r><w:br/></w:r>';
  base = base || {};
  let pr = '<w:rPr>';
  if (r.b || base.bold) pr += '<w:b/>';
  if (r.i) pr += '<w:i/>';
  if (r.u) pr += '<w:u w:val="single"/>';
  if (size) pr += '<w:sz w:val="' + Math.round(size * 2) + '"/>';
  const colour = r.color || base.color;
  if (colour) { let c = String(colour).replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); pr += '<w:color w:val="' + c.toUpperCase() + '"/>'; }
  pr += '</w:rPr>';
  return '<w:r>' + pr + '<w:t xml:space="preserve">' + xesc(r.t) + '</w:t></w:r>';
}
function docxPara(runs, o) {
  o = o || {};
  if (typeof runs === 'string') runs = [{ t: runs }];
  /* w:pPr children must follow the schema order: spacing, jc, then rPr last */
  let pp = '';
  if (o.after != null) pp += '<w:spacing w:after="' + o.after + '"/>';
  if (o.align) pp += '<w:jc w:val="' + o.align + '"/>';
  let rp = '';
  if (o.bold) rp += '<w:b/>';
  if (o.size) rp += '<w:sz w:val="' + Math.round(o.size * 2) + '"/>';
  if (o.color) rp += '<w:color w:val="' + String(o.color).replace('#', '').toUpperCase() + '"/>';
  if (rp) pp += '<w:rPr>' + rp + '</w:rPr>';
  return '<w:p>' + (pp ? '<w:pPr>' + pp + '</w:pPr>' : '')
    + runs.map(r => runXml(r, o.size, { bold: o.bold, color: o.color })).join('') + '</w:p>';
}
function docxTable(widths, rows) {
  // rows: array of array of {text} | {runs} | string cells; first row shaded as header
  const bd = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="B9C2CC"/><w:left w:val="single" w:sz="4" w:color="B9C2CC"/><w:bottom w:val="single" w:sz="4" w:color="B9C2CC"/><w:right w:val="single" w:sz="4" w:color="B9C2CC"/><w:insideH w:val="single" w:sz="4" w:color="B9C2CC"/><w:insideV w:val="single" w:sz="4" w:color="B9C2CC"/></w:tblBorders>';
  let x = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + bd + '</w:tblPr><w:tblGrid>';
  widths.forEach(wd => { x += '<w:gridCol w:w="' + wd + '"/>'; });
  x += '</w:tblGrid>';
  rows.forEach((row, ri) => {
    x += '<w:tr>';
    row.forEach((cell, ci) => {
      const c = typeof cell === 'string' ? { text: cell } : cell;
      let tcp = '<w:tcW w:w="' + widths[ci] + '" w:type="dxa"/>';
      if (ri === 0) tcp += '<w:shd w:fill="EEF1F5" w:val="clear"/>';
      let inner;
      if (c.runs) inner = docxPara(c.runs, { size: 10.5 });
      else if (c.text) inner = String(c.text).split('\n').map(t => docxPara(t, { size: 10.5, bold: ri === 0 })).join('');
      else inner = '<w:p/>';
      x += '<w:tc><w:tcPr>' + tcp + '</w:tcPr>' + inner + '</w:tc>';
    });
    x += '</w:tr>';
  });
  return x + '</w:tbl>';
}
function b64Bytes(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function pngDims(b) {
  if (b.length < 33 || !(b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71)) return null;
  const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
  const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
  return (w > 0 && h > 0 && w < 10000 && h < 10000) ? { w, h } : null;
}
function jpgDims(b) {
  if (!(b[0] === 0xFF && b[1] === 0xD8)) return null;
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xFF) { p++; continue; }
    const m = b[p + 1];
    if (m === 0xD8 || m === 0xD9 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { p += 2; continue; }
    const len = (b[p + 2] << 8) | b[p + 3];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      const h = (b[p + 5] << 8) | b[p + 6], w = (b[p + 7] << 8) | b[p + 8];
      return (w > 0 && h > 0) ? { w, h } : null;
    }
    p += 2 + len;
  }
  return null;
}
function logoDrawing(rid, cx, cy) {
  return '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="1" name="Logo"/>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
    + '<pic:nvPicPr><pic:cNvPr id="1" name="logo"/><pic:cNvPicPr/></pic:nvPicPr>'
    + '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}
function buildDocx() {
  const D = ST.details, d = S.doc;
  const col = (d.colour || '#1f5872').replace('#', '');
  const font = d.font || 11;
  const title = uc1(W('adjustment')) + 's' + (D.name ? ' for ' + D.name : '');
  const extra = [], rels = [];
  let rId = 1;
  const addRel = (type, target) => { rId++; rels.push({ id: 'rId' + rId, type, target }); return 'rId' + rId; };
  const B = [];

  if (d.logo && typeof d.logo === 'string' && d.logo.indexOf('data:image/') === 0) {
    const m = d.logo.match(/^data:image\/(png|jpe?g);base64,([\s\S]*)$/);
    if (m) {
      const ext = m[1] === 'png' ? 'png' : 'jpg';
      try {
        const bytes = b64Bytes(m[2]);
        const dim = ext === 'png' ? pngDims(bytes) : jpgDims(bytes);
        if (dim) {
          const wpx = d.logoWidth || 120;
          const rid = addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', 'media/logo.' + ext);
          extra.push(['word/media/logo.' + ext, bytes]);
          B.push(logoDrawing(rid, Math.round(wpx * 9525), Math.round(wpx * dim.h / dim.w * 9525)));
        }
      } catch (e) { /* corrupt logo: skip it rather than failing the export */ }
    }
  }
  if (d.org) B.push(docxPara(d.org, { size: font, color: '5F6B7A', after: 120 }));
  B.push(docxPara(title, { size: font + 6, bold: true, color: col, after: 60 }));
  B.push(docxPara('Prepared ' + (D.date || '') + (D.by ? ' by ' + D.by : '') + (D.context ? ' · ' + D.context : '') + '.', { size: font - 1.5, color: '5F6B7A', after: 200 }));
  if (d.cover) {
    B.push(docxTable([1600, 3200, 1600, 3200], [
      [{ text: uc1(W('student')) }, { text: D.name || '' }, { text: 'Year level' }, { text: D.year || '' }],
      [{ text: 'Preferred name' }, { text: D.pref || '' }, { text: 'Date' }, { text: D.date || '' }],
      [{ text: 'Prepared by' }, { text: D.by || '' }, { text: 'Review date' }, { text: D.review || '' }],
      [{ text: 'Purpose' }, { text: D.context || '' }, { text: '' }, { text: '' }],
    ]));
  }
  grouped().forEach((items, key) => {
    B.push(docxPara(key, { size: font + 1.5, bold: true, color: '004990', after: 100 }));
    if (d.groupBy === 'domain' && items[0].kind === 'activity') {
      B.push(docxPara(recommendationGroupSummary(items), { size: font - 1.5, color: '5F6B7A', after: 100 }));
    }
    if (S.structure === 'table') {
      const rows = [[{ text: uc1(W('adjustment')) }, { text: 'Frequency' }, { text: 'Intensity' }, { text: 'Who is responsible' }, { text: 'Access outcome' }]];
      items.forEach(e => {
        const c = tableCells(e.kind, e.obj, e.pick);
        const extraRows = detailRows(e.kind, e.obj, e.pick)
          .filter(r => ['Frequency', 'Intensity', 'Who is responsible', 'Access outcome', uc1(W('adjustment'))].indexOf(r[0]) < 0)
          .map(r => unesc(r[0]) + ': ' + unesc(r[1])).join(' · ');
        const fl = flagsFor(e.kind, e.obj);
        rows.push([
          { text: unesc(stripTags(c.adjustment)) + (extraRows ? '\n' + extraRows : '') + (fl.length ? '\n' + fl.join(' · ') : '') },
          { text: unesc(stripTags(c.frequency)) }, { text: unesc(stripTags(c.intensity)) },
          { text: unesc(stripTags(c.who)) }, { text: c.outcome },
        ]);
      });
      B.push(docxTable([3800, 1450, 1450, 1450, 1450], rows));
      return;
    }
    items.forEach(e => {
      B.push(docxPara(htmlRuns(entryHtml(e)), { size: font, after: 60 }));
      let rows = detailRows(e.kind, e.obj, e.pick);
      if (d.groupBy === 'domain' && e.kind === 'activity' && e.level === ST.acts[e.act].level) {
        const drop = [uc1(W('level')), 'MTSS tier'];
        rows = rows.filter(r => drop.indexOf(r[0]) < 0 || (r[0] === 'MTSS tier' && e.pick.tier));
      }
      if (rows.length) B.push(docxTable([2900, 6700], rows.map(r => [{ text: unesc(r[0]) }, { text: unesc(r[1]) }])));
      const fl = flagsFor(e.kind, e.obj);
      if (fl.length) B.push(docxPara(fl.join(' · '), { size: font - 1.5, color: '8A4030', after: 60 }));
      if (d.ids) B.push(docxPara(e.obj.id, { size: font - 1.5, color: '5F6B7A', after: 60 }));
    });
  });
  if (d.approvalBlock) {
    B.push(docxPara('Sign-off', { size: font + 1.5, bold: true, color: col, after: 100 }));
    B.push(docxTable([2400, 2400, 2400, 2400], [
      [{ text: 'Role' }, { text: 'Name' }, { text: 'Signature' }, { text: 'Date' }],
      [{ text: uc1(W('student')) }, { text: '' }, { text: '' }, { text: '' }],
      [{ text: 'Parent or carer' }, { text: '' }, { text: '' }, { text: '' }],
      [{ text: roleLabel('classroom_teacher') }, { text: '' }, { text: '' }, { text: '' }],
      [{ text: roleLabel('di_lead') }, { text: '' }, { text: '' }, { text: '' }],
    ]));
  }
  if (d.guidance) {
    B.push(docxPara(uc1(W('level')) + ' is decided for each activity, not for the ' + W('student') + ' as a whole.'
      + (S.showTiers ? ' Any MTSS tier shown describes the ' + W('adjustment') + '; quality teaching continues alongside targeted and intensive support.' : '')
      + ' Recommended frequency and intensity are proposed starting arrangements for the selected level. Keep, edit or remove suggestions before agreeing the plan.',
      { size: font - 1.5, color: '5F6B7A', after: 100 }));
  }
  B.push(docxPara('Built with the Adjustments Builder. The ' + W('adjustment')
    + ' library is a working draft, not approved guidance, shared under CC BY-NC-SA 4.0 by David Gill. '
    + 'Victorian Curriculum F-10 content elements are (c) VCAA, licensed CC-BY-NC.',
    { size: font - 1.5, color: '5F6B7A', after: 60 }));

  let headerRid = null, footerRid = null;
  if (d.header) {
    headerRid = addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/header', 'header1.xml');
    extra.push(['word/header1.xml', strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + docxPara(d.header, { size: 9, color: '8A95A3' }) + '</w:hdr>')]);
  }
  if (d.footer) {
    footerRid = addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer', 'footer1.xml');
    extra.push(['word/footer1.xml', strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + docxPara(d.footer, { size: 9, color: '8A95A3' }) + '</w:ftr>')]);
  }
  const letter = d.paper === 'Letter';
  let sect = '<w:sectPr>';
  if (headerRid) sect += '<w:headerReference w:type="default" r:id="' + headerRid + '"/>';
  if (footerRid) sect += '<w:footerReference w:type="default" r:id="' + footerRid + '"/>';
  sect += '<w:pgSz w:w="' + (letter ? '12240' : '11906') + '" w:h="' + (letter ? '15840' : '16838') + '"/>'
    + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/></w:sectPr>';
  const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<w:body>' + B.join('') + sect + '</w:body></w:document>';
  let relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  rels.forEach(r => { relsXml += '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + r.target + '"/>'; });
  relsXml += '</Relationships>';
  let types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>';
  if (headerRid) types += '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>';
  if (footerRid) types += '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>';
  types += '</Types>';
  const files = [
    ['[Content_Types].xml', strBytes(types)],
    ['_rels/.rels', strBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')],
    ['word/document.xml', strBytes(docXml)],
    ['word/_rels/document.xml.rels', strBytes(relsXml)],
  ];
  extra.forEach(f => files.push(f));
  return zipStore(files);
}
function stripTags(h) {
  return String(h == null ? '' : h).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
}
function exportDocx() {
  if (!needEntries()) return;
  downloadBytes(stamp('docx'), buildDocx(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

/* ============================================================
   About, provenance and licence — what a school receiving this
   file needs to know before it trusts anything the app writes.
   ============================================================ */
const ABOUT_CSS = `
.aboutmask{position:fixed;inset:0;background:rgba(29,36,48,.45);z-index:60;display:flex;
  align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}
.aboutbox{background:var(--panel);border-radius:12px;max-width:640px;width:100%;padding:22px 24px;
  box-shadow:0 12px 40px rgba(0,0,0,.2)}
.aboutbox h2{font-size:20px;margin:0 0 4px}
.aboutbox h3{font-size:14px;margin:18px 0 4px;color:var(--accent)}
.aboutbox p{margin:6px 0;font-size:14px}
.aboutbox .draftnote{background:var(--warnbg);border-left:3px solid #c9873f;padding:10px 12px;
  border-radius:0 6px 6px 0;margin:12px 0;font-size:13.5px}
.aboutbox .foot{display:flex;gap:8px;align-items:center;margin-top:18px}
.aboutbox .ver{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--faint)}
`;
(() => { const s = document.createElement('style'); s.textContent = ABOUT_CSS; document.head.append(s); })();

function aboutVersion() {
  const v = document.getElementById('appversion');
  return v ? v.textContent.trim() : 'unreleased';
}
function showAbout() {
  if (document.querySelector('.aboutmask')) return;
  const opener = document.activeElement;
  const mask = el('div', 'aboutmask');
  const box = el('div', 'aboutbox');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'about-title');
  box.innerHTML = `
    <h2 id="about-title">About the Adjustments Builder</h2>
    <p class="muted">A tool for building a ${esc(W('student'))}'s reasonable ${esc(W('adjustment'))}s,
      and for keeping the wording consistent across a school.</p>

    <div class="draftnote">
      <b>The ${esc(W('adjustment'))} library is a working draft.</b> It was assembled in one school and
      expanded with AI assistance. It is not departmental policy, not approved guidance, and not a
      substitute for professional judgement or your school's own processes. Everything it writes is a
      starting point — someone who knows the ${esc(W('student'))} must check that it describes what will
      actually happen before it is agreed or acted on.
    </div>

    <h3>Where your information goes</h3>
    <p>Nowhere. The app runs entirely in this browser: no server, no sign-in, no network call of any
      kind. What you type stays on this device, and nobody — including the author — can see it.</p>
    <p>Work in progress is kept in this browser's storage. Clearing your browser data clears it, so use
      <b>Save file</b> to keep a copy you can reopen. If your browser or school policy blocks storage,
      the app tells you rather than pretending to save.</p>

    <h3>Licence</h3>
    <p>Creative Commons Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0). Any school,
      teacher or education service may use this, adapt it and pass it on, free of charge, as long as
      they credit the source and share their changes on the same terms. Nobody may sell it or build a
      paid product on it. Created by David Gill, david.gill@education.vic.gov.au.</p>

    <h3>Curriculum</h3>
    <p>This app includes the Victorian Curriculum F–10 Version 2.0 content descriptions, so an
      ${esc(W('adjustment'))} can be linked to the curriculum by searching rather than by copying codes
      across from another website. Achievement standards and elaborations are not included.</p>
    <p class="tiny">The Victorian Curriculum F–10 content elements are © VCAA, licensed CC-BY-NC.
      The Victorian Curriculum F–10 and related content can be accessed directly at the VCAA website,
      f10.vcaa.vic.edu.au. Exported 13 September 2026 and reformatted; the wording is unchanged apart
      from mathematical notation being written in plain text. A school outside Victoria can replace
      this with its own curriculum.</p>

    <h3>If you adapt it</h3>
    <p>Please keep the note that says the wording needs checking. It is the part that protects the
      ${esc(W('student'))}.</p>

    <div class="foot">
      <span class="ver">${esc(aboutVersion())}</span>
      <span class="spacer" style="flex:1 1 auto"></span>
    </div>`;
  const close = el('button', '', 'Close');
  /* one way out, whichever way it is closed: listener removed, focus returned */
  const shut = () => {
    mask.remove();
    document.removeEventListener('keydown', onKey);
    if (opener && opener.focus) opener.focus();
  };
  const onKey = e => {
    if (e.key === 'Escape') { shut(); return; }
    if (e.key !== 'Tab') return;
    /* keep keyboard focus inside the dialog while it is open */
    const f = [...box.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  close.onclick = shut;
  box.querySelector('.foot').append(close);
  mask.onclick = e => { if (e.target === mask) shut(); };
  document.addEventListener('keydown', onKey);
  mask.append(box);
  document.body.append(mask);
  close.focus();
}
(() => {
  const b = document.getElementById('btn-about');
  if (b) b.onclick = showAbout;
})();
