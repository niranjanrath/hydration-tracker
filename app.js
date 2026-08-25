/* ==========================================================================
   Hydro — Hydration & Urination Tracker
   100% client-side. No network calls. All data lives in localStorage.
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. STORAGE + STATE
   ========================================================================== */
const STORAGE_KEY = 'hydro_tracker_state_v1';

const DEFAULT_STATE = {
  entries: [], // {id, type:'water'|'urine', datetime: ISOString, amountMl, size, note}
  settings: {
    goalMl: 2500,
    units: 'ml', // 'ml' | 'oz'
    userName: '',
    onboarded: true,
    reminders: { enabled: false, intervalMin: 60, startTime: '08:00', endTime: '22:00', lastFiredAt: null }
  }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredCloneSafe(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      settings: Object.assign({}, DEFAULT_STATE.settings, parsed.settings || {}, {
        reminders: Object.assign({}, DEFAULT_STATE.settings.reminders, (parsed.settings && parsed.settings.reminders) || {})
      })
    };
  } catch (e) {
    console.warn('Failed to parse local data, starting fresh.', e);
    return structuredCloneSafe(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function structuredCloneSafe(obj) { return JSON.parse(JSON.stringify(obj)); }

let state = loadState();

// Non-persisted UI/session state
const ui = {
  route: 'dashboard',
  dashboardDate: new Date(),
  historyType: 'all', // all | water | urine
  historyDate: null,  // Date or null (no filter)
  statsTab: 'day',    // day | month | year
  statsDay: new Date(),
  statsMonth: startOfMonth(new Date()),
  statsYear: new Date().getFullYear(),
  editingId: null,
  addWaterAmount: 250,
  addWaterCustom: false,
  addUrineSize: 'medium'
};

/* ==========================================================================
   2. UTILITIES
   ========================================================================== */
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function uid() { return 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function round1(n) { return Math.round(n * 10) / 10; }

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function daysInMonth(year, monthIdx) { return new Date(year, monthIdx + 1, 0).getDate(); }
function isToday(d) { return isSameDay(d, new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((startOfDay(d) - start) / 86400000) + 1;
}
function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function daysInYear(y) { return isLeapYear(y) ? 366 : 365; }

function formatDateHeading(d) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function formatDateShort(d) {
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function formatDayLabel(d) {
  if (isToday(d)) return `Today, ${formatDateHeading(d)}`;
  if (isSameDay(d, addDays(new Date(), -1))) return `Yesterday, ${formatDateHeading(d)}`;
  return formatDateHeading(d);
}
function formatTime(d) {
  let h = d.getHours(); const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${pad(m)} ${ampm}`;
}
function toInputDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function toInputDatetimeLocal(d) { return `${toInputDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function toInputMonth(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }

/* Unit conversion & formatting */
function mlToOz(ml) { return ml / 29.5735; }
function ozToMl(oz) { return oz * 29.5735; }

function formatAmountUnit(ml) {
  if (state.settings.units === 'oz') return `${round1(mlToOz(ml))} oz`;
  return `${Math.round(ml)} ml`;
}
function formatTotalUnit(ml) {
  if (state.settings.units === 'oz') return `${round1(mlToOz(ml))} oz`;
  return `${(ml / 1000).toFixed(ml >= 1000 || ml === 0 ? 1 : 2)} L`;
}
function unitSuffix() { return state.settings.units === 'oz' ? 'oz' : 'ml'; }

const SIZE_ML = { small: 150, medium: 300, large: 450 };
const SIZE_LABEL = { small: 'Small', medium: 'Medium', large: 'Large' };

/* ==========================================================================
   3. ICONS (inline SVG path fragments, stroked at 1.8-2.2 unless noted)
   ========================================================================== */
const ICONS = {
  drop: '<path d="M12 3c-3.6 5-7 9-7 12.8A7 7 0 0 0 12 22a7 7 0 0 0 7-6.2C19 12 15.6 8 12 3z"/>',
  bell: '<path d="M6.5 8.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5h-14s1.5-1.5 1.5-5.5Z"/><path d="M10 17.5a2 2 0 0 0 4 0"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15.5" rx="3.2"/><path d="M8 3.2v4.4M16 3.2v4.4M3.5 10.2h17"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  download: '<path d="M12 3v11.5M12 14.5 7.5 10M12 14.5 16.5 10"/><path d="M4.5 17.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1.5"/>',
  upload: '<path d="M12 21V9.5M12 9.5 7.5 14M12 9.5 16.5 14"/><path d="M4.5 17.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1.5"/>',
  trash: '<path d="M5 7.5h14M9.5 7.5V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.3m-8.3 0L7.4 19a1.7 1.7 0 0 0 1.7 1.8h5.8A1.7 1.7 0 0 0 16.6 19l1.2-11.5"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 14.9a1.7 1.7 0 0 0 .3 1.9l.05.06a2.1 2.1 0 1 1-3 3l-.05-.06a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.55V21.2a2.1 2.1 0 1 1-4.2 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.06.06a2.1 2.1 0 1 1-3-3l.06-.06a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.55-1H2.8a2.1 2.1 0 1 1 0-4.2h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.06-.06a2.1 2.1 0 1 1 3-3l.06.06a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.55V2.8a2.1 2.1 0 1 1 4.2 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.06-.06a2.1 2.1 0 1 1 3 3l-.06.06a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.55 1h.13a2.1 2.1 0 1 1 0 4.2h-.1a1.7 1.7 0 0 0-1.6 1z"/>',
  target: '<circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1"/>',
  shield: '<path d="M12 2.7 19 5.5v6.2c0 5-3.1 7.9-7 9.6-3.9-1.7-7-4.6-7-9.6V5.5l7-2.8z"/><path d="M8.7 12.2l2.2 2.2 4.4-4.6"/>',
  info: '<circle cx="12" cy="12" r="9.2"/><path d="M12 11v5.3M12 7.7v.01"/>',
  user: '<circle cx="12" cy="8.2" r="3.8"/><path d="M4.3 20c0-4 3.7-6.2 7.7-6.2s7.7 2.2 7.7 6.2"/>',
  edit: '<path d="M4 20h4L18.5 9.5a2.4 2.4 0 0 0-4-4L4 15v5z"/><path d="M13.2 6.8l4 4"/>',
  clock: '<circle cx="12" cy="12" r="9.2"/><path d="M12 6.8V12l3.6 2.1"/>',
  trendUp: '<path d="M4 16l6-6 4 4 6-8"/><path d="M14 6h6v6"/>',
  trendDown: '<path d="M4 8l6 6 4-4 6 8"/><path d="M14 18h6v-6"/>',
  trendFlat: '<path d="M4 12h16"/>',
  warning: '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 9.5v5M12 17.3v.01"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  checkCircle: '<circle cx="12" cy="12" r="9.2"/><path d="M8 12.3l2.6 2.6L16.2 9"/>',
  refresh: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.6"/><path d="M20 4v4.6h-4.6"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.4"/><path d="M4 20v-4.6h4.6"/>',
  droplets: '<path d="M9 2.8C6.6 6.5 4 9.6 4 12.2a5 5 0 0 0 10 0c0-2.6-2.6-5.7-5-9.4z"/><path d="M17.5 10.5c-1.6 2.5-3.2 4.4-3.2 6.1a3.2 3.2 0 0 0 6.4 0c0-1.7-1.6-3.6-3.2-6.1z"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.8-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 9.8 5.5c-2.3 4.4-9.8 9-9.8 9z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.4"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
  linkOut: '<path d="M9.5 14.5 20 4"/><path d="M13.5 4H20v6.5"/><path d="M19 13.5V19a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19V6.5A1.5 1.5 0 0 1 5.5 5H11"/>'
};
function icon(name, cls, strokeW) {
  return `<svg viewBox="0 0 24 24" class="${cls || ''}" fill="none" stroke="currentColor" stroke-width="${strokeW || 1.9}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
function iconFilled(name, cls) {
  return `<svg viewBox="0 0 24 24" class="${cls || ''}" fill="currentColor">${ICONS[name] || ''}</svg>`;
}

/* ==========================================================================
   4. DATA HELPERS (queries over entries)
   ========================================================================== */
function getEntries() { return state.entries; }

function entriesBetween(start, end) {
  const s = start.getTime(), e = end.getTime();
  return state.entries.filter(en => {
    const t = new Date(en.datetime).getTime();
    return t >= s && t <= e;
  });
}
function entriesForDay(d) { return entriesBetween(startOfDay(d), endOfDay(d)); }
function entriesForMonth(year, monthIdx) {
  return entriesBetween(new Date(year, monthIdx, 1, 0, 0, 0), new Date(year, monthIdx, daysInMonth(year, monthIdx), 23, 59, 59, 999));
}
function entriesForYear(year) {
  return entriesBetween(new Date(year, 0, 1, 0, 0, 0), new Date(year, 11, 31, 23, 59, 59, 999));
}

function waterTotalMl(entries) {
  return entries.filter(e => e.type === 'water').reduce((s, e) => s + (e.amountMl || 0), 0);
}
function urineCount(entries) { return entries.filter(e => e.type === 'urine').length; }

function sortedAllDesc() {
  return [...state.entries].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
}

function addEntry(entry) {
  entry.id = uid();
  state.entries.push(entry);
  saveState();
}
function updateEntry(id, patch) {
  const idx = state.entries.findIndex(e => e.id === id);
  if (idx > -1) { state.entries[idx] = Object.assign({}, state.entries[idx], patch); saveState(); }
}
function deleteEntry(id) {
  state.entries = state.entries.filter(e => e.id !== id);
  saveState();
}
function getEntry(id) { return state.entries.find(e => e.id === id); }

/* ==========================================================================
   5. ROUTER
   ========================================================================== */
const ROUTES = ['dashboard', 'add-water', 'add-urine', 'history', 'stats', 'goals', 'reminders', 'settings', 'more', 'about'];

function navigate(route, opts) {
  opts = opts || {};
  if (!ROUTES.includes(route)) route = 'dashboard';
  ui.route = route;
  location.hash = '#/' + route;
  if (!opts.noScroll) window.scrollTo(0, 0);
  render();
}

function currentRouteFromHash() {
  const h = location.hash.replace('#/', '');
  return ROUTES.includes(h) ? h : 'dashboard';
}

window.addEventListener('hashchange', () => { ui.route = currentRouteFromHash(); render(); });

/* ==========================================================================
   6. TOAST
   ========================================================================== */
let toastTimer = null;
function showToast(msg, iconName) {
  const el = document.getElementById('toast');
  el.innerHTML = (iconName ? icon(iconName, '', 2.2) : '') + `<span>${escapeHtml(msg)}</span>`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ==========================================================================
   7. MODAL / SHEET
   ========================================================================== */
function openSheet(innerHtml, opts) {
  opts = opts || {};
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'overlay' + (opts.center ? ' center' : '');
  overlay.innerHTML = `<div class="sheet">${opts.center ? '' : '<div class="sheet-handle"></div>'}${innerHtml}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
  root.innerHTML = '';
  root.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  return overlay;
}
function closeSheet() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  document.body.style.overflow = '';
}

function confirmDialog({ title, message, confirmLabel, onConfirm, danger }) {
  const html = `
    <div class="confirm-icon">${icon(danger === false ? 'info' : 'warning', '', 1.8)}</div>
    <h3 class="text-center" style="margin-bottom:8px;">${escapeHtml(title)}</h3>
    <p class="confirm-text">${message}</p>
    <div class="btn-row">
      <button class="btn ghost" id="cf-cancel">Cancel</button>
      <button class="btn ${danger === false ? 'primary-water' : 'danger'}" id="cf-ok">${escapeHtml(confirmLabel || 'Confirm')}</button>
    </div>`;
  const overlay = openSheet(html, { center: true });
  overlay.querySelector('#cf-cancel').addEventListener('click', closeSheet);
  overlay.querySelector('#cf-ok').addEventListener('click', () => { closeSheet(); onConfirm(); });
}

/* Hidden native date input trick — lets us use the OS date picker without
   building our own calendar widget (keeps footprint small + accessible). */
function pickNativeDate({ type, value, onChange }) {
  const input = document.createElement('input');
  input.type = type; // 'date' | 'month'
  input.value = value;
  input.style.position = 'fixed';
  input.style.top = '-100px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => { onChange(input.value); document.body.removeChild(input); });
  input.addEventListener('blur', () => { setTimeout(() => { if (input.parentNode) document.body.removeChild(input); }, 300); });
  if (input.showPicker) { try { input.showPicker(); } catch (e) { input.click(); } } else { input.click(); }
}

/* ==========================================================================
   8. TOPBAR (per-route header)
   ========================================================================== */
function renderTopbar() {
  const tb = document.getElementById('topbar');
  const brand = `<span class="brand-dot">${iconFilled('drop')}</span>`;
  let html = '';
  switch (ui.route) {
    case 'dashboard':
      html = `<span class="tb-title">${brand}Hydro</span><span class="tb-spacer"></span>
        <button class="tb-icon-btn" id="tb-reminder-btn" aria-label="Reminders">${icon('bell')}</button>`;
      break;
    case 'add-water':
    case 'add-urine':
    case 'goals':
    case 'reminders':
    case 'settings':
    case 'about':
      html = `<button class="tb-back" id="tb-back">${icon('back', '', 2.3)}</button>
        <span class="tb-spacer"></span>`;
      break;
    case 'history':
      html = `<span class="tb-heading">History</span><span class="tb-spacer"></span>
        <button class="tb-icon-btn" id="tb-history-cal">${icon('calendar')}</button>`;
      break;
    case 'stats':
      html = `<span class="tb-heading">Statistics</span><span class="tb-spacer"></span>`;
      break;
    case 'more':
      html = `<span class="tb-title">${brand}Hydro</span><span class="tb-spacer"></span>`;
      break;
    default:
      html = `<span class="tb-heading"></span>`;
  }
  tb.innerHTML = html;

  const back = document.getElementById('tb-back');
  if (back) back.addEventListener('click', () => history.back ? goBack() : navigate('dashboard'));
  const bellBtn = document.getElementById('tb-reminder-btn');
  if (bellBtn) bellBtn.addEventListener('click', () => navigate('reminders'));
  const histCal = document.getElementById('tb-history-cal');
  if (histCal) histCal.addEventListener('click', () => {
    pickNativeDate({
      type: 'date',
      value: toInputDate(ui.historyDate || new Date()),
      onChange: (v) => { ui.historyDate = new Date(v + 'T00:00:00'); render(); }
    });
  });
}

function goBack() {
  const map = { 'add-water': 'dashboard', 'add-urine': 'dashboard', 'goals': 'more', 'reminders': 'more', 'settings': 'more', 'about': 'more' };
  navigate(map[ui.route] || 'dashboard');
}

/* ==========================================================================
   9. BOTTOM NAV
   ========================================================================== */
function renderBottomNav() {
  const topLevel = { dashboard: 'dashboard', history: 'history', stats: 'stats' };
  const active = topLevel[ui.route] || (['more','goals','reminders','settings','about'].includes(ui.route) ? 'more' : '');
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === active);
  });
}
document.getElementById('bottom-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  navigate(btn.dataset.route);
});

/* ==========================================================================
   10. MAIN RENDER DISPATCH
   ========================================================================== */
function render() {
  renderTopbar();
  renderBottomNav();
  const main = document.getElementById('app-main');
  switch (ui.route) {
    case 'dashboard': return renderDashboard(main);
    case 'add-water': return renderAddWater(main);
    case 'add-urine': return renderAddUrine(main);
    case 'history': return renderHistory(main);
    case 'stats': return renderStats(main);
    case 'goals': return renderGoals(main);
    case 'reminders': return renderReminders(main);
    case 'settings': return renderSettings(main);
    case 'more': return renderMore(main);
    case 'about': return renderAbout(main);
    default: return renderDashboard(main);
  }
}

/* ==========================================================================
   11. DASHBOARD
   ========================================================================== */
function svgRing(pct, size) {
  size = size || 200;
  const r = size * 0.45, c = 2 * Math.PI * r, center = size / 2;
  const offset = c * (1 - clamp(pct, 0, 1));
  return `<svg viewBox="0 0 ${size} ${size}">
    <circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="var(--water-light)" stroke-width="${size*0.075}"/>
    <circle cx="${center}" cy="${center}" r="${r}" fill="none" stroke="var(--water)" stroke-width="${size*0.075}"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
      style="transition: stroke-dashoffset .4s ease;"/>
  </svg>`;
}

function entryRowHtml(en) {
  const d = new Date(en.datetime);
  if (en.type === 'water') {
    return `<button class="entry-row" data-edit="${en.id}">
      <span class="entry-icon water">${icon('drop', '', 2)}</span>
      <span class="entry-main">
        <span class="entry-title">${formatAmountUnit(en.amountMl)} water</span>
        <span class="entry-sub">${formatTime(d)}</span>
        ${en.note ? `<span class="entry-note">${escapeHtml(en.note)}</span>` : ''}
      </span>
      <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
    </button>`;
  }
  return `<button class="entry-row" data-edit="${en.id}">
      <span class="entry-icon urine">${icon('droplets', '', 2)}</span>
      <span class="entry-main">
        <span class="entry-title">Urination (${SIZE_LABEL[en.size]})</span>
        <span class="entry-sub">${formatTime(d)}</span>
        ${en.note ? `<span class="entry-note">${escapeHtml(en.note)}</span>` : ''}
      </span>
      <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
    </button>`;
}

function renderDashboard(main) {
  const day = ui.dashboardDate;
  const dayEntries = entriesForDay(day).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  const water = waterTotalMl(dayEntries);
  const goal = state.settings.goalMl;
  const pct = goal > 0 ? water / goal : 0;
  const waterCount = dayEntries.filter(e => e.type === 'water').length;
  const urineN = urineCount(dayEntries);
  const recent = dayEntries.slice(0, 5);

  main.innerHTML = `
    <div class="date-pill" id="dash-date-pill">
      <span>${formatDayLabel(day)}</span>
      <button class="icon-btn" id="dash-cal-btn" aria-label="Pick date">${icon('calendar', '', 2.1)}</button>
    </div>

    <div class="card progress-card">
      <div class="ring-wrap">
        ${svgRing(pct)}
        <div class="ring-center">
          <div class="amt">${formatTotalUnit(water)}</div>
          <div class="of">of ${formatTotalUnit(goal)} goal</div>
          <div class="pct">${Math.round(pct * 100)}%</div>
        </div>
      </div>
      <div class="stat-cards">
        <div class="stat-card water">
          <span class="stat-icon">${icon('drop', '', 2)}</span>
          <span class="stat-value">${waterCount}</span>
          <span class="stat-label">Water logs</span>
        </div>
        <div class="stat-card urine">
          <span class="stat-icon">${icon('droplets', '', 2)}</span>
          <span class="stat-value">${urineN}</span>
          <span class="stat-label">Urinations</span>
        </div>
      </div>
      <div class="quick-actions">
        <button class="qa-btn water" id="qa-water">${icon('plus', '', 2.4)} Add Water</button>
        <button class="qa-btn urine" id="qa-urine">${icon('plus', '', 2.4)} Add Urination</button>
      </div>
    </div>

    <div class="row-between" style="margin-top:22px;">
      <h4 class="section-title first" style="margin:0;">Recent Entries</h4>
      <button class="see-all" id="dash-see-all">See all</button>
    </div>
    <div class="card" style="padding:6px 14px;">
      ${recent.length ? recent.map(entryRowHtml).join('') : `
        <div class="empty-state">
          <span class="empty-icon">${icon('drop', '', 1.8)}</span>
          <h4>No entries yet</h4>
          <p>Log your first glass of water or a urination to start tracking today.</p>
        </div>`}
    </div>
  `;

  document.getElementById('qa-water').addEventListener('click', () => navigate('add-water'));
  document.getElementById('qa-urine').addEventListener('click', () => navigate('add-urine'));
  document.getElementById('dash-see-all').addEventListener('click', () => { ui.historyDate = null; navigate('history'); });
  document.getElementById('dash-cal-btn').addEventListener('click', () => {
    pickNativeDate({ type: 'date', value: toInputDate(day), onChange: (v) => { ui.dashboardDate = new Date(v + 'T00:00:00'); renderDashboard(document.getElementById('app-main')); } });
  });
  main.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditEntry(b.dataset.edit)));
}

/* ==========================================================================
   12. ADD WATER
   ========================================================================== */
const WATER_PRESETS_ML = [100, 250, 500, 750, 1000];

function renderAddWater(main) {
  const now = new Date();
  const selected = ui.addWaterAmount;
  const isCustom = ui.addWaterCustom;

  main.innerHTML = `
    <div class="add-hero water">
      <span class="hero-icon">${icon('drop', '', 2)}</span>
      <h2>Add Water</h2>
    </div>

    <div class="form-label first">Select Amount</div>
    <div class="amount-grid" id="preset-grid">
      ${WATER_PRESETS_ML.map(ml => `
        <button class="amount-btn ${!isCustom && selected === ml ? 'selected' : ''}" data-ml="${ml}">
          ${formatAmountUnit(ml)}
        </button>`).join('')}
      <button class="amount-btn custom-btn ${isCustom ? 'selected' : ''}" id="custom-btn">
        ${icon('plus', '', 2.2)}<span>Custom</span>
      </button>
    </div>

    ${isCustom ? `
      <div class="custom-amount-row">
        <div class="field"><input type="number" min="1" id="custom-input" placeholder="Enter amount" value="${ui.addWaterCustomVal || ''}" inputmode="decimal"></div>
        <span class="unit-chip">${unitSuffix()}</span>
      </div>` : ''}

    <div class="form-label">Date &amp; Time</div>
    <div class="field with-icon">
      ${icon('clock', '', 2)}
      <input type="datetime-local" id="dt-input" value="${toInputDatetimeLocal(now)}" max="${toInputDatetimeLocal(now)}">
    </div>

    <div class="form-label">Notes (optional)</div>
    <div class="field"><textarea id="note-input" placeholder="e.g. After workout, morning, etc."></textarea></div>

    <div class="save-btn-wrap">
      <button class="btn primary-water" id="save-water-btn">Save</button>
    </div>
  `;

  main.querySelectorAll('#preset-grid .amount-btn[data-ml]').forEach(btn => {
    btn.addEventListener('click', () => {
      ui.addWaterAmount = Number(btn.dataset.ml);
      ui.addWaterCustom = false;
      renderAddWater(main);
    });
  });
  document.getElementById('custom-btn').addEventListener('click', () => {
    ui.addWaterCustom = true;
    renderAddWater(main);
    setTimeout(() => { const el = document.getElementById('custom-input'); if (el) el.focus(); }, 0);
  });
  const customInput = document.getElementById('custom-input');
  if (customInput) customInput.addEventListener('input', () => { ui.addWaterCustomVal = customInput.value; });

  document.getElementById('save-water-btn').addEventListener('click', () => {
    let amountMl;
    if (ui.addWaterCustom) {
      const raw = parseFloat((document.getElementById('custom-input') || {}).value);
      if (!raw || raw <= 0) { showToast('Enter a valid amount', 'warning'); return; }
      amountMl = state.settings.units === 'oz' ? ozToMl(raw) : raw;
    } else {
      amountMl = ui.addWaterAmount;
    }
    const dtVal = document.getElementById('dt-input').value;
    if (!dtVal) { showToast('Please choose a date & time', 'warning'); return; }
    const note = document.getElementById('note-input').value.trim();
    addEntry({ type: 'water', amountMl: Math.round(amountMl), datetime: new Date(dtVal).toISOString(), note });
    ui.addWaterCustom = false; ui.addWaterAmount = 250; ui.addWaterCustomVal = '';
    showToast('Water logged', 'checkCircle');
    navigate('dashboard');
  });
}

/* ==========================================================================
   13. ADD URINATION
   ========================================================================== */
function renderAddUrine(main) {
  const now = new Date();
  const sel = ui.addUrineSize;
  main.innerHTML = `
    <div class="add-hero urine">
      <span class="hero-icon">${icon('droplets', '', 2)}</span>
      <h2>Add Urination</h2>
    </div>

    <div class="form-label first">Rate Volume</div>
    <div class="size-grid" id="size-grid">
      ${['small','medium','large'].map(s => `
        <button class="size-btn ${s} ${sel === s ? 'selected' : ''}" data-size="${s}">
          <span class="drop">${icon('droplets', '', 1.8)}</span>
          <span>${SIZE_LABEL[s]}</span>
        </button>`).join('')}
    </div>

    <div class="form-label">Date &amp; Time</div>
    <div class="field with-icon">
      ${icon('clock', '', 2)}
      <input type="datetime-local" id="dt-input" value="${toInputDatetimeLocal(now)}" max="${toInputDatetimeLocal(now)}">
    </div>

    <div class="form-label">Notes (optional)</div>
    <div class="field"><textarea id="note-input" placeholder="e.g. Normal, urgent, etc."></textarea></div>

    <div class="save-btn-wrap">
      <button class="btn primary-urine" id="save-urine-btn">Save</button>
    </div>
  `;

  main.querySelectorAll('#size-grid .size-btn').forEach(btn => {
    btn.addEventListener('click', () => { ui.addUrineSize = btn.dataset.size; renderAddUrine(main); });
  });

  document.getElementById('save-urine-btn').addEventListener('click', () => {
    const dtVal = document.getElementById('dt-input').value;
    if (!dtVal) { showToast('Please choose a date & time', 'warning'); return; }
    const note = document.getElementById('note-input').value.trim();
    addEntry({ type: 'urine', size: ui.addUrineSize, datetime: new Date(dtVal).toISOString(), note });
    ui.addUrineSize = 'medium';
    showToast('Urination logged', 'checkCircle');
    navigate('dashboard');
  });
}

/* ==========================================================================
   14. EDIT ENTRY (bottom sheet, works for both types)
   ========================================================================== */
function openEditEntry(id) {
  const en = getEntry(id);
  if (!en) return;
  const isWater = en.type === 'water';
  const dt = new Date(en.datetime);

  const html = `
    <div class="sheet-head">
      <h3>Edit ${isWater ? 'Water' : 'Urination'}</h3>
      <button class="sheet-close" id="edit-close">${icon('x', '', 2.4)}</button>
    </div>

    ${isWater ? `
      <div class="form-label first">Amount</div>
      <div class="custom-amount-row">
        <div class="field"><input type="number" min="1" id="edit-amount" value="${state.settings.units === 'oz' ? round1(mlToOz(en.amountMl)) : en.amountMl}" inputmode="decimal"></div>
        <span class="unit-chip">${unitSuffix()}</span>
      </div>
    ` : `
      <div class="form-label first">Rate Volume</div>
      <div class="size-grid" id="edit-size-grid">
        ${['small','medium','large'].map(s => `
          <button class="size-btn ${s} ${en.size === s ? 'selected' : ''}" data-size="${s}">
            <span class="drop">${icon('droplets', '', 1.8)}</span><span>${SIZE_LABEL[s]}</span>
          </button>`).join('')}
      </div>
    `}

    <div class="form-label">Date &amp; Time</div>
    <div class="field with-icon">
      ${icon('clock', '', 2)}
      <input type="datetime-local" id="edit-dt" value="${toInputDatetimeLocal(dt)}" max="${toInputDatetimeLocal(new Date())}">
    </div>

    <div class="form-label">Notes (optional)</div>
    <div class="field"><textarea id="edit-note" placeholder="Add a note...">${escapeHtml(en.note || '')}</textarea></div>

    <div class="btn-row">
      <button class="btn danger" id="edit-delete">${icon('trash','',2.1)} Delete</button>
      <button class="btn ${isWater ? 'primary-water' : 'primary-urine'}" id="edit-save">Save Changes</button>
    </div>
  `;
  const overlay = openSheet(html);
  overlay.querySelector('#edit-close').addEventListener('click', closeSheet);

  let editSize = en.size;
  const grid = overlay.querySelector('#edit-size-grid');
  if (grid) grid.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editSize = btn.dataset.size;
      grid.querySelectorAll('.size-btn').forEach(b => b.classList.toggle('selected', b === btn));
    });
  });

  overlay.querySelector('#edit-delete').addEventListener('click', () => {
    closeSheet();
    confirmDialog({
      title: 'Delete this entry?',
      message: 'This entry will be permanently removed from your local history.',
      confirmLabel: 'Delete',
      onConfirm: () => { deleteEntry(id); showToast('Entry deleted', 'trash'); render(); }
    });
  });

  overlay.querySelector('#edit-save').addEventListener('click', () => {
    const dtVal = overlay.querySelector('#edit-dt').value;
    if (!dtVal) { showToast('Please choose a date & time', 'warning'); return; }
    const note = overlay.querySelector('#edit-note').value.trim();
    const patch = { datetime: new Date(dtVal).toISOString(), note };
    if (isWater) {
      const raw = parseFloat(overlay.querySelector('#edit-amount').value);
      if (!raw || raw <= 0) { showToast('Enter a valid amount', 'warning'); return; }
      patch.amountMl = Math.round(state.settings.units === 'oz' ? ozToMl(raw) : raw);
    } else {
      patch.size = editSize;
    }
    updateEntry(id, patch);
    closeSheet();
    showToast('Entry updated', 'checkCircle');
    render();
  });
}

/* ==========================================================================
   15b. CHART BUILDER (lightweight SVG bar chart, no dependencies)
   ========================================================================== */
function svgBarChart(values, labels, color, opts) {
  opts = opts || {};
  const w = 320, h = opts.height || 130;
  const n = values.length;
  const padTop = 10, padBottom = opts.labels === false ? 4 : 18, gap = n > 20 ? 1.5 : 4;
  const barW = Math.max(1.2, (w - (n - 1) * gap) / n);
  const maxV = Math.max(opts.maxValue || 0, ...values, 1);
  const usableH = h - padTop - padBottom;
  const labelEvery = opts.labelEvery || 1;

  let bars = '';
  values.forEach((v, i) => {
    const bh = maxV > 0 ? (v / maxV) * usableH : 0;
    const x = i * (barW + gap);
    const y = padTop + (usableH - bh);
    const isHi = opts.highlightIndex === i;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(bh, v > 0 ? 2 : 1).toFixed(1)}" rx="${Math.min(3, barW / 2).toFixed(1)}" fill="${color}" opacity="${v > 0 ? (isHi ? 1 : 0.85) : 0.15}"/>`;
  });
  let labelsSvg = '';
  if (opts.labels !== false) {
    labels.forEach((l, i) => {
      if (i % labelEvery !== 0 && i !== n - 1) return;
      const x = i * (barW + gap) + barW / 2;
      labelsSvg += `<text x="${x.toFixed(1)}" y="${h - 4}" text-anchor="middle" class="chart-axis-label">${escapeHtml(l)}</text>`;
    });
  }
  return `<div class="chart-wrap"><svg viewBox="0 0 ${w} ${h}">${bars}${labelsSvg}</svg></div>`;
}

function trendPill(current, previous) {
  if (previous <= 0 && current <= 0) return `<span class="trend-pill flat">${icon('trendFlat','',2.4)} No data</span>`;
  if (previous <= 0) return `<span class="trend-pill up">${icon('trendUp','',2.4)} New</span>`;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return `<span class="trend-pill flat">${icon('trendFlat','',2.4)} Flat</span>`;
  const cls = change > 0 ? 'up' : 'down';
  const ic = change > 0 ? 'trendUp' : 'trendDown';
  return `<span class="trend-pill ${cls}">${icon(ic,'',2.4)} ${change > 0 ? '+' : ''}${Math.round(change)}%</span>`;
}

/* ==========================================================================
   16. STATISTICS
   ========================================================================== */
function renderStats(main) {
  main.innerHTML = `
    <div class="tabbar" id="stats-tabs">
      <button data-tab="day" class="${ui.statsTab === 'day' ? 'active' : ''}">Day</button>
      <button data-tab="month" class="${ui.statsTab === 'month' ? 'active' : ''}">Month</button>
      <button data-tab="year" class="${ui.statsTab === 'year' ? 'active' : ''}">Year</button>
    </div>
    <div id="stats-body"></div>
  `;
  main.querySelectorAll('#stats-tabs button').forEach(b => {
    b.addEventListener('click', () => { ui.statsTab = b.dataset.tab; renderStats(main); });
  });
  const body = document.getElementById('stats-body');
  if (ui.statsTab === 'day') renderStatsDay(body);
  else if (ui.statsTab === 'month') renderStatsMonth(body);
  else renderStatsYear(body);
}

function statsDateNav({ label, nextDisabled }) {
  return `
    <div class="date-nav">
      <button class="arrow-btn" id="dn-prev">${icon('chevronLeft','',2.4)}</button>
      <button class="date-label-btn" id="dn-pick">${icon('calendar','',2.1)}${label}</button>
      <button class="arrow-btn" id="dn-next" ${nextDisabled ? 'disabled' : ''}>${icon('chevronRight','',2.4)}</button>
    </div>`;
}
function bindStatsDateNav(container, { onPrev, onNext, onPick }) {
  const prev = container.querySelector('#dn-prev');
  const next = container.querySelector('#dn-next');
  const pick = container.querySelector('#dn-pick');
  if (prev) prev.addEventListener('click', onPrev);
  if (next && !next.disabled) next.addEventListener('click', onNext);
  if (pick) pick.addEventListener('click', onPick);
}

/* ---- DAY ---- */
function renderStatsDay(body) {
  const day = ui.statsDay;
  const todayEntries = entriesForDay(day);
  const yEntries = entriesForDay(addDays(day, -1));

  const water = waterTotalMl(todayEntries);
  const waterY = waterTotalMl(yEntries);
  const uCount = urineCount(todayEntries);
  const uCountY = urineCount(yEntries);
  const goal = state.settings.goalMl;
  const pct = goal > 0 ? Math.round((water / goal) * 100) : 0;

  const hourlyWater = new Array(24).fill(0);
  const hourlyUrine = new Array(24).fill(0);
  todayEntries.forEach(en => {
    const h = new Date(en.datetime).getHours();
    if (en.type === 'water') hourlyWater[h] += en.amountMl; else hourlyUrine[h] += 1;
  });
  const hourLabels = ['12A','','','','','6A','','','','','','12P','','','','','6P','','','','','','12A'].map((l,i)=> i%6===0? l : '');

  const waterLogs = todayEntries.filter(e => e.type === 'water');
  const avgPerLog = waterLogs.length ? water / waterLogs.length : 0;
  const times = todayEntries.map(e => new Date(e.datetime)).sort((a,b)=>a-b);
  const firstLog = times[0] ? formatTime(times[0]) : '—';
  const lastLog = times.length ? formatTime(times[times.length-1]) : '—';

  const ratio = water > 0 ? (uCount / (water / 1000)) : 0;

  body.innerHTML = `
    ${statsDateNav({ label: formatDayLabel(day), nextDisabled: isToday(day) })}

    <div class="card stat-block">
      <div class="stat-block-head">
        <span class="sb-title"><span class="sb-dot water"></span>Water Intake</span>
        <span class="sb-badge water">${pct}%</span>
      </div>
      <div class="row-between" style="align-items:flex-end;">
        <span class="sb-value">${formatTotalUnit(water)}</span>
        ${trendPill(water, waterY)}
      </div>
      <div class="sb-sub">of ${formatTotalUnit(goal)} daily goal</div>
      ${svgBarChart(hourlyWater, hourLabels, 'var(--water)', { labelEvery: 6 })}
      <div class="mini-stats-grid">
        <div class="mini-stat"><div class="mv">${waterLogs.length}</div><div class="ml">Logs</div></div>
        <div class="mini-stat"><div class="mv">${formatAmountUnit(avgPerLog)}</div><div class="ml">Avg / log</div></div>
        <div class="mini-stat"><div class="mv">${firstLog}</div><div class="ml">First log</div></div>
      </div>
    </div>

    <div class="card stat-block">
      <div class="stat-block-head">
        <span class="sb-title"><span class="sb-dot urine"></span>Urinations</span>
        <span class="sb-badge urine">${uCount}x</span>
      </div>
      <div class="row-between" style="align-items:flex-end;">
        <span class="sb-value">${uCount} times</span>
        ${trendPill(uCount, uCountY)}
      </div>
      <div class="sb-sub">vs. ${uCountY} yesterday</div>
      ${svgBarChart(hourlyUrine, hourLabels, 'var(--urine)', { labelEvery: 6 })}
      <div class="mini-stats-grid">
        <div class="mini-stat"><div class="mv">${todayEntries.filter(e=>e.type==='urine'&&e.size==='small').length}</div><div class="ml">Small</div></div>
        <div class="mini-stat"><div class="mv">${todayEntries.filter(e=>e.type==='urine'&&e.size==='medium').length}</div><div class="ml">Medium</div></div>
        <div class="mini-stat"><div class="mv">${todayEntries.filter(e=>e.type==='urine'&&e.size==='large').length}</div><div class="ml">Large</div></div>
      </div>
    </div>

    <div class="card stat-block">
      <div class="stat-block-head"><span class="sb-title">Water vs. Urination</span></div>
      <div class="pattern-note">
        ${icon('info','',2)}
        <p>${water > 0
          ? `<b>${uCount}</b> urination${uCount===1?'':'s'} logged for every <b>${formatTotalUnit(water)}</b> of water today${ratio ? ` — about <b>${round1(ratio)}</b> per litre.` : '.'} Last activity ended at <b>${lastLog}</b>.`
          : `Log some water to see how your intake compares with urination frequency.`}</p>
      </div>
    </div>
  `;
  bindStatsDateNav(body, {
    onPrev: () => { ui.statsDay = addDays(ui.statsDay, -1); renderStatsDay(body); },
    onNext: () => { ui.statsDay = addDays(ui.statsDay, 1); renderStatsDay(body); },
    onPick: () => pickNativeDate({ type: 'date', value: toInputDate(ui.statsDay), onChange: v => { ui.statsDay = new Date(v + 'T00:00:00'); renderStatsDay(body); } })
  });
}

/* ---- MONTH ---- */
function renderStatsMonth(body) {
  const cursor = ui.statsMonth;
  const year = cursor.getFullYear(), monthIdx = cursor.getMonth();
  const nDays = daysInMonth(year, monthIdx);
  const entries = entriesForMonth(year, monthIdx);

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === monthIdx;
  const elapsedDays = isCurrentMonth ? now.getDate() : nDays;

  const prevCursor = addMonths(cursor, -1);
  const prevEntries = entriesForMonth(prevCursor.getFullYear(), prevCursor.getMonth());
  const prevElapsed = (prevCursor.getFullYear() === now.getFullYear() && prevCursor.getMonth() === now.getMonth()) ? now.getDate() : daysInMonth(prevCursor.getFullYear(), prevCursor.getMonth());

  const water = waterTotalMl(entries);
  const waterAvg = water / elapsedDays;
  const prevWaterAvg = waterTotalMl(prevEntries) / Math.max(1, prevElapsed);

  const uCount = urineCount(entries);
  const uAvg = uCount / elapsedDays;
  const prevUAvg = urineCount(prevEntries) / Math.max(1, prevElapsed);

  const goal = state.settings.goalMl;
  const pct = goal > 0 ? Math.round((waterAvg / goal) * 100) : 0;

  const dailyWater = new Array(nDays).fill(0);
  const dailyUrine = new Array(nDays).fill(0);
  entries.forEach(en => {
    const d = new Date(en.datetime).getDate() - 1;
    if (en.type === 'water') dailyWater[d] += en.amountMl; else dailyUrine[d] += 1;
  });
  const dayLabels = dailyWater.map((_, i) => (i === 0 || (i+1) % 7 === 0) ? String(i+1) : '');

  let goalDaysMet = 0;
  dailyWater.forEach(v => { if (v >= goal) goalDaysMet++; });
  const bestDayIdx = dailyWater.indexOf(Math.max(...dailyWater));
  const bestDay = Math.max(...dailyWater) > 0 ? `${bestDayIdx + 1} ${MONTH_SHORT[monthIdx]}` : '—';

  body.innerHTML = `
    ${statsDateNav({ label: `${MONTH_NAMES[monthIdx]} ${year}`, nextDisabled: isCurrentMonth })}

    <div class="card stat-block">
      <div class="stat-block-head">
        <span class="sb-title"><span class="sb-dot water"></span>Water Intake (Daily Avg)</span>
        <span class="sb-badge water">${pct}%</span>
      </div>
      <div class="row-between" style="align-items:flex-end;">
        <span class="sb-value">${formatTotalUnit(waterAvg)}</span>
        ${trendPill(waterAvg, prevWaterAvg)}
      </div>
      <div class="sb-sub">Goal: ${formatTotalUnit(goal)} / day</div>
      ${svgBarChart(dailyWater, dayLabels, 'var(--water)', { labelEvery: 7 })}
      <div class="mini-stats-grid">
        <div class="mini-stat"><div class="mv">${formatTotalUnit(water)}</div><div class="ml">Month total</div></div>
        <div class="mini-stat"><div class="mv">${goalDaysMet}/${nDays}</div><div class="ml">Goal days</div></div>
        <div class="mini-stat"><div class="mv">${bestDay}</div><div class="ml">Best day</div></div>
      </div>
    </div>

    <div class="card stat-block">
      <div class="stat-block-head">
        <span class="sb-title"><span class="sb-dot urine"></span>Urinations (Daily Avg)</span>
        <span class="sb-badge urine">${round1(uAvg)}/day</span>
      </div>
      <div class="row-between" style="align-items:flex-end;">
        <span class="sb-value">${uCount} times</span>
        ${trendPill(uAvg, prevUAvg)}
      </div>
      <div class="sb-sub">Monthly total</div>
      ${svgBarChart(dailyUrine, dayLabels, 'var(--urine)', { labelEvery: 7 })}
    </div>

    <div class="card stat-block">
      <div class="stat-block-head"><span class="sb-title">Water vs. Urination</span></div>
      <div class="pattern-note">
        ${icon('info','',2)}
        <p>You averaged <b>${round1(uAvg)}</b> urination${uAvg===1?'':'s'} per day against <b>${formatTotalUnit(waterAvg)}</b> of water — you hit your goal on <b>${goalDaysMet} of ${nDays}</b> days this month.</p>
      </div>
    </div>
  `;
  bindStatsDateNav(body, {
    onPrev: () => { ui.statsMonth = addMonths(ui.statsMonth, -1); renderStatsMonth(body); },
    onNext: () => { ui.statsMonth = addMonths(ui.statsMonth, 1); renderStatsMonth(body); },
    onPick: () => pickNativeDate({ type: 'month', value: toInputMonth(ui.statsMonth), onChange: v => { const [y,m] = v.split('-').map(Number); ui.statsMonth = new Date(y, m-1, 1); renderStatsMonth(body); } })
  });
}

/* ---- YEAR ---- */
function renderStatsYear(body) {
  const year = ui.statsYear;
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const elapsed = isCurrentYear ? dayOfYear(now) : daysInYear(year);
  const prevElapsed = (year - 1 === now.getFullYear()) ? dayOfYear(now) : daysInYear(year - 1);

  const entries = entriesForYear(year);
  const prevEntries = entriesForYear(year - 1);

  const water = waterTotalMl(entries);
  const waterAvg = water / elapsed;
  const prevWaterAvg = waterTotalMl(prevEntries) / Math.max(1, prevElapsed);

  const uCount = urineCount(entries);
  const uAvg = uCount / elapsed;
  const prevUAvg = urineCount(prevEntries) / Math.max(1, prevElapsed);

  const goal = state.settings.goalMl;
  const pct = goal > 0 ? Math.round((waterAvg / goal) * 100) : 0;

  const monthlyWater = new Array(12).fill(0);
  const monthlyUrine = new Array(12).fill(0);
  entries.forEach(en => {
    const m = new Date(en.datetime).getMonth();
    if (en.type === 'water') monthlyWater[m] += en.amountMl; else monthlyUrine[m] += 1;
  });

  let goalMonthsMet = 0;
  monthlyWater.forEach((v, i) => {
    const dim = isCurrentYear && i === now.getMonth() ? now.getDate() : daysInMonth(year, i);
    if (dim > 0 && v / dim >= goal) goalMonthsMet++;
  });

  body.innerHTML = `
    ${statsDateNav({ label: String(year), nextDisabled: isCurrentYear })}

    <div class="card stat-block">
      <div class="stat-block-head">
        <span class="sb-title"><span class="sb-dot water"></span>Water Intake (Daily Avg)</span>
        <span class="sb-badge water">${pct}%</span>
      </div>
      <div class="row-between" style="align-items:flex-end;">
        <span class="sb-value">${formatTotalUnit(waterAvg)}</span>
        ${trendPill(waterAvg, prevWaterAvg)}
      </div>
      <div class="sb-sub">Goal: ${formatTotalUnit(goal)} / day</div>
      ${svgBarChart(monthlyWater, MONTH_SHORT, 'var(--water)', { labelEvery: 2 })}
      <div class="mini-stats-grid">
        <div class="mini-stat"><div class="mv">${formatTotalUnit(water)}</div><div class="ml">Year total</div></div>
        <div class="mini-stat"><div class="mv">${goalMonthsMet}/12</div><div class="ml">Goal months</div></div>
        <div class="mini-stat"><div class="mv">${round1(uAvg)}</div><div class="ml">Avg urin/day</div></div>
      </div>
    </div>

    <div class="card stat-block">
      <div class="stat-block-head">
        <span class="sb-title"><span class="sb-dot urine"></span>Urinations (Monthly Avg)</span>
        <span class="sb-badge urine">${round1(uAvg * 30)}/mo</span>
      </div>
      <div class="row-between" style="align-items:flex-end;">
        <span class="sb-value">${uCount} times</span>
        ${trendPill(uAvg, prevUAvg)}
      </div>
      <div class="sb-sub">Yearly total</div>
      ${svgBarChart(monthlyUrine, MONTH_SHORT, 'var(--urine)', { labelEvery: 2 })}
    </div>

    <div class="card stat-block">
      <div class="stat-block-head"><span class="sb-title">Water vs. Urination</span></div>
      <div class="pattern-note">
        ${icon('info','',2)}
        <p>Across ${year}, you met your daily goal in <b>${goalMonthsMet} of 12</b> months, averaging <b>${round1(uAvg)}</b> urinations per day.</p>
      </div>
    </div>
  `;
  bindStatsDateNav(body, {
    onPrev: () => { ui.statsYear -= 1; renderStatsYear(body); },
    onNext: () => { ui.statsYear += 1; renderStatsYear(body); },
    onPick: () => {
      const options = [];
      const curY = new Date().getFullYear();
      for (let y = curY; y >= curY - 8; y--) options.push(y);
      openSheet(`
        <div class="sheet-head"><h3>Select Year</h3><button class="sheet-close" id="yr-close">${icon('x','',2.4)}</button></div>
        <div class="goal-preset-grid" style="grid-template-columns:repeat(3,1fr);">
          ${options.map(y => `<button class="goal-preset ${y===ui.statsYear?'selected':''}" data-y="${y}">${y}</button>`).join('')}
        </div>
      `);
      document.getElementById('yr-close').addEventListener('click', closeSheet);
      document.querySelectorAll('#modal-root [data-y]').forEach(b => b.addEventListener('click', () => {
        ui.statsYear = Number(b.dataset.y); closeSheet(); renderStatsYear(document.getElementById('stats-body'));
      }));
    }
  });
}

/* ==========================================================================
   15. HISTORY
   ========================================================================== */
function renderHistory(main) {
  let entries = sortedAllDesc();
  if (ui.historyType !== 'all') entries = entries.filter(e => e.type === ui.historyType);
  if (ui.historyDate) entries = entries.filter(e => isSameDay(new Date(e.datetime), ui.historyDate));

  // group by day
  const groups = [];
  let lastKey = null, group = null;
  entries.forEach(en => {
    const d = new Date(en.datetime);
    const key = toInputDate(d);
    if (key !== lastKey) { group = { date: d, items: [] }; groups.push(group); lastKey = key; }
    group.items.push(en);
  });

  main.innerHTML = `
    <div class="filter-chips" id="filter-chips">
      <button class="chip ${ui.historyType === 'all' ? 'active' : ''}" data-type="all">All</button>
      <button class="chip ${ui.historyType === 'water' ? 'active water-c' : ''}" data-type="water">${icon('drop','',2.4)} Water</button>
      <button class="chip ${ui.historyType === 'urine' ? 'active urine-c' : ''}" data-type="urine">${icon('droplets','',2.4)} Urination</button>
      ${ui.historyDate ? `<button class="chip" id="clear-date-filter">${formatDateShort(ui.historyDate)} ✕</button>` : ''}
    </div>

    ${groups.length ? groups.map(g => `
      <div class="history-group">
        <div class="history-date-heading row-between">
          <span>${formatDayLabel(g.date)}</span>
          <span class="history-day-summary">${formatTotalUnit(waterTotalMl(g.items))} · ${urineCount(g.items)}x</span>
        </div>
        <div class="card" style="padding:6px 14px;">
          ${g.items.map(entryRowHtml).join('')}
        </div>
      </div>
    `).join('') : `
      <div class="card">
        <div class="empty-state">
          <span class="empty-icon">${icon('calendar', '', 1.8)}</span>
          <h4>No entries found</h4>
          <p>Try a different filter, or log your first entry from the dashboard.</p>
        </div>
      </div>
    `}
  `;

  main.querySelectorAll('#filter-chips .chip[data-type]').forEach(chip => {
    chip.addEventListener('click', () => { ui.historyType = chip.dataset.type; renderHistory(main); });
  });
  const clearBtn = document.getElementById('clear-date-filter');
  if (clearBtn) clearBtn.addEventListener('click', () => { ui.historyDate = null; renderHistory(main); });
  main.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditEntry(b.dataset.edit)));
}

/* ==========================================================================
   17. MORE MENU
   ========================================================================== */
function renderMore(main) {
  const name = state.settings.userName || 'Friend';
  main.innerHTML = `
    <div class="card profile-card">
      <span class="avatar">${icon('user','',1.8)}</span>
      <div>
        <h3>${escapeHtml(name)}</h3>
        <p>Stay hydrated, stay healthy!</p>
      </div>
    </div>

    <div class="menu-list" style="margin-top:16px;">
      <button class="menu-row" data-go="goals">
        <span class="mr-icon">${icon('target','',2)}</span>
        <span class="mr-label">Goals</span>
        <span class="mr-value">${formatTotalUnit(state.settings.goalMl)} / day</span>
        <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
      </button>
      <button class="menu-row" data-go="reminders">
        <span class="mr-icon">${icon('bell','',2)}</span>
        <span class="mr-label">Reminders</span>
        <span class="mr-value">${state.settings.reminders.enabled ? 'On' : 'Off'}</span>
        <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
      </button>
      <button class="menu-row" data-go="settings">
        <span class="mr-icon">${icon('gear','',2)}</span>
        <span class="mr-label">Settings</span>
        <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
      </button>
      <button class="menu-row" id="mr-export">
        <span class="mr-icon">${icon('download','',2)}</span>
        <span class="mr-label">Export Data</span>
        <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
      </button>
      <button class="menu-row danger" id="mr-clear">
        <span class="mr-icon">${icon('trash','',2)}</span>
        <span class="mr-label">Clear All Data</span>
        <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
      </button>
      <button class="menu-row" data-go="about">
        <span class="mr-icon">${icon('info','',2)}</span>
        <span class="mr-label">About Hydro</span>
        <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
      </button>
    </div>

    <div class="privacy-banner" style="margin-top:18px;">
      ${icon('shield','',1.8)}
      <p><b>100% private.</b> Everything you log stays in this browser's local storage on this device. Nothing is uploaded, synced, or shared.</p>
    </div>
  `;
  main.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.go)));
  document.getElementById('mr-export').addEventListener('click', exportData);
  document.getElementById('mr-clear').addEventListener('click', () => {
    confirmDialog({
      title: 'Clear all data?',
      message: `This permanently deletes <b>all ${state.entries.length} entries</b> and resets your settings on this device. This can\u2019t be undone.`,
      confirmLabel: 'Delete Everything',
      onConfirm: () => {
        state = structuredCloneSafe(DEFAULT_STATE);
        saveState();
        showToast('All data cleared', 'trash');
        navigate('dashboard');
      }
    });
  });
}

/* ==========================================================================
   18. GOALS
   ========================================================================== */
const GOAL_PRESETS_ML = [1500, 2000, 2500, 3000];
function renderGoals(main) {
  const goal = state.settings.goalMl;
  // streak calculation: consecutive days ending today meeting goal
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const total = waterTotalMl(entriesForDay(cursor));
    if (total >= goal && total > 0) { streak++; cursor = addDays(cursor, -1); }
    else break;
    if (streak > 3650) break;
  }

  main.innerHTML = `
    <div class="add-hero water">
      <span class="hero-icon">${icon('target','',2)}</span>
      <h2>Daily Water Goal</h2>
    </div>

    <div class="card text-center" style="padding:22px 18px;">
      <div class="amt" style="font-size:30px;font-weight:800;">${formatTotalUnit(goal)}</div>
      <div class="of" style="color:var(--text-secondary);font-weight:600;font-size:13px;margin-top:2px;">per day</div>
      <div class="trend-pill up" style="margin-top:14px;">${icon('checkCircle','',2.4)} ${streak} day streak</div>
    </div>

    <div class="form-label">Quick Presets</div>
    <div class="goal-preset-grid" id="goal-presets">
      ${GOAL_PRESETS_ML.map(ml => `<button class="goal-preset ${goal===ml?'selected':''}" data-ml="${ml}">${(ml/1000).toFixed(1)}L</button>`).join('')}
    </div>

    <div class="form-label">Custom Goal (${unitSuffix()})</div>
    <div class="field"><input type="number" min="1" id="goal-custom" value="${state.settings.units === 'oz' ? round1(mlToOz(goal)) : goal}" inputmode="decimal"></div>
    <p class="hairline-hint">A common recommendation is around 2–2.5L (roughly 8 glasses) per day, but individual needs vary with activity, climate and health. Adjust to what works for you.</p>

    <div class="save-btn-wrap">
      <button class="btn primary-water" id="save-goal-btn">Save Goal</button>
    </div>
  `;
  main.querySelectorAll('#goal-presets .goal-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('goal-custom').value = state.settings.units === 'oz' ? round1(mlToOz(Number(btn.dataset.ml))) : btn.dataset.ml;
      main.querySelectorAll('#goal-presets .goal-preset').forEach(b => b.classList.toggle('selected', b === btn));
    });
  });
  document.getElementById('save-goal-btn').addEventListener('click', () => {
    const raw = parseFloat(document.getElementById('goal-custom').value);
    if (!raw || raw <= 0) { showToast('Enter a valid goal', 'warning'); return; }
    state.settings.goalMl = Math.round(state.settings.units === 'oz' ? ozToMl(raw) : raw);
    saveState();
    showToast('Goal updated', 'checkCircle');
    navigate('more');
  });
}

/* ==========================================================================
   19. REMINDERS
   ========================================================================== */
function renderReminders(main) {
  const r = state.settings.reminders;
  const notifSupported = 'Notification' in window;
  main.innerHTML = `
    <div class="add-hero water">
      <span class="hero-icon">${icon('bell','',2)}</span>
      <h2>Water Reminders</h2>
    </div>

    <div class="menu-list">
      <div class="toggle-row">
        <div class="tr-text"><b>Enable reminders</b><small>Get a gentle nudge to drink water</small></div>
        <label class="switch">
          <input type="checkbox" id="rem-enable" ${r.enabled ? 'checked' : ''}>
          <span class="track"></span><span class="thumb"></span>
        </label>
      </div>
    </div>

    <div class="form-label">Remind me every</div>
    <div class="segmented" id="rem-interval">
      ${[30,60,90,120].map(m => `<button data-min="${m}" class="${r.intervalMin===m?'active':''}">${m}m</button>`).join('')}
    </div>

    <div class="form-label">Active hours</div>
    <div class="custom-amount-row">
      <div class="field with-icon">${icon('clock','',2)}<input type="time" id="rem-start" value="${r.startTime}"></div>
      <div class="field with-icon">${icon('clock','',2)}<input type="time" id="rem-end" value="${r.endTime}"></div>
    </div>

    <p class="hairline-hint">${icon('info', 'inline-note-icon', 2)}Reminders use your browser's notification permission and only fire while this tab is open — nothing is sent through a server, so your schedule never leaves this device.${!notifSupported ? ' Your browser does not support notifications.' : ''}</p>

    <div class="save-btn-wrap">
      <button class="btn primary-water" id="save-rem-btn">Save Reminder Settings</button>
    </div>
  `;

  document.getElementById('rem-interval').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('rem-interval').querySelectorAll('button').forEach(b => b.classList.toggle('active', b===btn));
    });
  });

  document.getElementById('save-rem-btn').addEventListener('click', () => {
    const enabled = document.getElementById('rem-enable').checked;
    const activeBtn = document.getElementById('rem-interval').querySelector('button.active');
    const intervalMin = activeBtn ? Number(activeBtn.dataset.min) : r.intervalMin;
    const startTime = document.getElementById('rem-start').value || r.startTime;
    const endTime = document.getElementById('rem-end').value || r.endTime;

    const finish = () => {
      state.settings.reminders = Object.assign({}, r, { enabled, intervalMin, startTime, endTime });
      saveState();
      startReminderEngine();
      showToast('Reminder settings saved', 'checkCircle');
      navigate('more');
    };

    if (enabled && notifSupported && Notification.permission === 'default') {
      Notification.requestPermission().then(() => finish());
    } else if (enabled && notifSupported && Notification.permission === 'denied') {
      showToast('Notifications are blocked in your browser settings', 'warning');
      finish();
    } else {
      finish();
    }
  });
}

let reminderTimer = null;
function startReminderEngine() {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(checkReminder, 30000);
  checkReminder();
}
function checkReminder() {
  const r = state.settings.reminders;
  if (!r.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const [sh, sm] = r.startTime.split(':').map(Number);
  const [eh, em] = r.endTime.split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const startMins = sh * 60 + sm, endMins = eh * 60 + em;
  const inWindow = startMins <= endMins ? (mins >= startMins && mins <= endMins) : (mins >= startMins || mins <= endMins);
  if (!inWindow) return;
  const last = r.lastFiredAt ? new Date(r.lastFiredAt) : null;
  if (last && (now - last) < r.intervalMin * 60000) return;
  try {
    new Notification('💧 Time to hydrate', { body: 'Log a glass of water to stay on track with your goal.', tag: 'hydro-reminder' });
  } catch (e) { /* ignore notification errors */ }
  state.settings.reminders.lastFiredAt = now.toISOString();
  saveState();
}

/* ==========================================================================
   20. SETTINGS
   ========================================================================== */
function renderSettings(main) {
  const s = state.settings;
  main.innerHTML = `
    <h2 class="section-title first" style="margin-top:4px;">Preferences</h2>
    <div class="menu-list">
      <div class="toggle-row">
        <div class="tr-text"><b>Display name</b><small>Shown on the More screen only</small></div>
      </div>
      <div style="padding:0 16px 16px;">
        <div class="field"><input type="text" id="set-name" placeholder="Optional" value="${escapeHtml(s.userName)}" maxlength="30"></div>
      </div>
      <div class="toggle-row">
        <div class="tr-text"><b>Units</b><small>Used across the whole app</small></div>
        <div class="segmented" id="set-units" style="width:140px;">
          <button data-u="ml" class="${s.units==='ml'?'active':''}">ml / L</button>
          <button data-u="oz" class="${s.units==='oz'?'active':''}">oz</button>
        </div>
      </div>
    </div>

    <h2 class="section-title">Your Data</h2>
    <div class="menu-list">
      <button class="menu-row" id="set-export">
        <span class="mr-icon">${icon('download','',2)}</span>
        <span class="mr-label">Export Data<small>Save a JSON backup file</small></span>
        <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
      </button>
      <button class="menu-row" id="set-import">
        <span class="mr-icon">${icon('upload','',2)}</span>
        <span class="mr-label">Import Data<small>Restore from a backup file</small></span>
        <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
      </button>
      <button class="menu-row danger" id="set-clear">
        <span class="mr-icon">${icon('trash','',2)}</span>
        <span class="mr-label">Clear All Data<small>Delete everything on this device</small></span>
        <svg class="chev" viewBox="0 0 24 24">${ICONS.chevronRight}</svg>
      </button>
    </div>

    <div class="privacy-banner">
      ${icon('lock','',1.8)}
      <p>Hydro has <b>no account, no backend, and no analytics</b>. Every setting and entry is stored only in this browser via Local Storage.</p>
    </div>

    <input type="file" id="import-file-input" accept="application/json" style="display:none;">
  `;

  document.getElementById('set-name').addEventListener('change', (e) => {
    state.settings.userName = e.target.value.trim(); saveState();
  });
  document.getElementById('set-units').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.settings.units = btn.dataset.u; saveState();
      renderSettings(main);
      showToast(`Units set to ${btn.dataset.u === 'oz' ? 'ounces' : 'ml / L'}`, 'checkCircle');
    });
  });
  document.getElementById('set-export').addEventListener('click', exportData);
  document.getElementById('set-clear').addEventListener('click', () => {
    confirmDialog({
      title: 'Clear all data?',
      message: `This permanently deletes <b>all ${state.entries.length} entries</b> and resets your settings. This can\u2019t be undone.`,
      confirmLabel: 'Delete Everything',
      onConfirm: () => {
        state = structuredCloneSafe(DEFAULT_STATE);
        saveState();
        showToast('All data cleared', 'trash');
        navigate('dashboard');
      }
    });
  });
  const fileInput = document.getElementById('import-file-input');
  document.getElementById('set-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.entries)) throw new Error('bad shape');
        confirmDialog({
          title: 'Import backup?',
          message: `This will replace your current ${state.entries.length} entries with <b>${parsed.entries.length}</b> entries from the backup file.`,
          confirmLabel: 'Import',
          danger: false,
          onConfirm: () => {
            state = {
              entries: parsed.entries,
              settings: Object.assign({}, DEFAULT_STATE.settings, parsed.settings || {})
            };
            saveState();
            showToast('Backup imported', 'checkCircle');
            navigate('dashboard');
          }
        });
      } catch (e) {
        showToast('That file doesn\u2019t look like a valid backup', 'warning');
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  a.href = url;
  a.download = `hydro-backup-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Backup file downloaded', 'download');
}

/* ==========================================================================
   21. ABOUT
   ========================================================================== */
function renderAbout(main) {
  main.innerHTML = `
    <div class="about-hero">
      <span class="logo-circle">${iconFilled('drop')}</span>
      <h2>Hydro</h2>
      <p>Hydration &amp; Urination Tracker</p>
    </div>

    <div class="privacy-banner">
      ${icon('shield','',1.8)}
      <p><b>Your data never leaves this device.</b> Hydro has no server, no account, and no analytics. Everything is stored locally in your browser using Local Storage.</p>
    </div>

    <h2 class="section-title">What Hydro does</h2>
    <div class="card">
      <div class="feature-list">
        <div class="feature-item"><span class="fi-icon">${icon('drop','',2)}</span><p><b>Log in a tap.</b> Preset or custom water volumes, and small/medium/large urination events.</p></div>
        <div class="feature-item"><span class="fi-icon">${icon('trendUp','',2)}</span><p><b>See patterns.</b> Day, month and year charts for totals, averages, frequency and trends.</p></div>
        <div class="feature-item"><span class="fi-icon">${icon('target','',2)}</span><p><b>Set a goal.</b> Track progress toward a personal daily hydration target.</p></div>
        <div class="feature-item"><span class="fi-icon">${icon('bell','',2)}</span><p><b>Optional reminders.</b> Local, on-device notifications while the app is open — no push server involved.</p></div>
      </div>
    </div>

    <h2 class="section-title">Privacy details</h2>
    <p class="about-text">All entries, goals, and settings are saved with the browser's <b>Local Storage</b> API on this device only. Nothing is transmitted to Anthropic, to us, or to any third party — there is no backend for this app to talk to. Clearing your browser data, using a different browser, or switching devices will not carry your history over; use <b>Export Data</b> in Settings any time you want a personal backup file.</p>
    <p class="about-text">Hydro does not require sign-up, sign-in, email, or any personal information to function.</p>

    <p class="version-tag">Hydro v1.0.0 · Built with HTML, CSS &amp; vanilla JavaScript</p>
  `;
}

/* ==========================================================================
   22. INIT
   ========================================================================== */
function init() {
  ui.route = currentRouteFromHash();
  if (!location.hash) location.hash = '#/dashboard';
  render();
  if (state.settings.reminders.enabled) startReminderEngine();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => { /* offline support is optional */ });
    });
  }
}

init();
