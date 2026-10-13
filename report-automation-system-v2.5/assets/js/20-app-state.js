/* ═══════════════════════════════════════════════════════════
   AppState — مدیریت وضعیت مرکزی برنامه و تاریخچه عملیات
   داده‌ها فقط در حافظه مرورگر نگهداری می‌شوند.
   تاریخچه فقط شامل اطلاعات خلاصه است (بدون داده خام).
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Store = (function () {

  const HISTORY_KEY = 'ras_history_v1';
  const THEME_KEY = 'ras_theme_v1';
  const PREFS_KEY = 'ras_prefs_v2';

  const defaultState = () => ({
    settings: { theme: 'light' },
    ui: { view: 'dashboard', calcChartRegistry: {} },
    flow: {
      /* مرحله ۱: ورود داده */
      source: null,          // { kind, name, importedAt, sheets, activeSheet, note }
      raw: null,             // { columns:[{name,type}], rows:[[..]] }
      /* مرحله ۲: کیفیت */
      profile: null,         // { ranAt, checks:[], stages:{}, score, grade, scoreMeta }
      /* مرحله ۳: پاک‌سازی */
      work: null,            // نسخه کاری در حال پاک‌سازی { columns, rows }
      clean: { started: false, confirmed: false, log: [], undoStack: [] },
      dupes: { scanned: false, config: null, groups: [], lastRemoval: null, removedTotal: 0 },
      /* مجموعه داده فعال برای ادامه گردش کار */
      active: null,          // { columns, rows, label, cleaned, rowCount }
      /* ستون‌های محاسباتی استخراج‌شده از داده (تاریخ→ماه/سال/روز هفته، تعداد×قیمت و…) */
      derived: { defs: [], appliedAt: null },
      /* مرحله ۴: قالب */
      templates: { selectedId: null, uploaded: [], mapping: {}, specJSON: null },
      compat: null,          // { ok, issues:[], notes:[] }
      /* مرحله ۵: محاسبات */
      calc: { defs: [], results: [], ranAt: null, sourceMode: 'app', fileDefs: [], fileSourceName: '', specLoaded: false },
      /* مرحله ۶: نمودارهای تعاملی (drag & drop) */
      charts: { items: [], seq: 0 },
      /* مرحله ۷: گزارش AI */
      ai: { mode: 'demo', provider: null, generated: null, contextNotes: '',
            config: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', apiKey: '' },
            customPrompt: '' },
      /* مرحله ۸-۹: گزارش و خروجی */
      report: { renderedAt: null, title: '', exportedAt: null, fileName: '',
        meta: null,
        lang: 'fa',
        branding: { logo: '', paletteId: 'corporate-blue', customColors: [] },
        pageSetup: { size: 'A4', orientation: 'portrait', custom: { w: 210, h: 297 }, margins: { t: 20, r: 18, b: 22, l: 18 } },
        breaks: [],                 /* شناسه بخش‌هایی که قبل از آنها شکست صفحه درج شده */
        output: { fileName: '', ext: 'pdf', fontFa: 'Vazirmatn FD', fontEn: 'Arial' } }
    },
    history: []
  });

  let state = defaultState();
  const listeners = [];

  function subscribe(fn) { listeners.push(fn); }
  function emit(evt) { listeners.forEach(fn => { try { fn(evt); } catch (e) { console.error('listener error', e); } }); }

  function resetFlow(keepTemplates) {
    const uploaded = keepTemplates ? state.flow.templates.uploaded : [];
    const selectedId = keepTemplates ? state.flow.templates.selectedId : null;
    state.flow = defaultState().flow;
    if (keepTemplates) { state.flow.templates.uploaded = uploaded; state.flow.templates.selectedId = selectedId; }
    /* فیلترهای داده هم با شروع فرایند جدید پاک می‌شوند */
    if (state.ui.filters) state.ui.filters = { rules: {} };
    if (typeof UndoManager !== 'undefined' && UndoManager.clear) UndoManager.clear();
    emit('flow-reset');
  }

  function fullReset() {
    state = defaultState();
    if (state.ui.filters) state.ui.filters = { rules: {} };
    if (typeof UndoManager !== 'undefined' && UndoManager.clear) UndoManager.clear();
    loadTheme();
    emit('full-reset');
  }

  /* ---------- تم ---------- */
  /* ---------- ترجیحات سبک (فونت/اندازه صفحه) بین نشست‌ها ---------- */
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p && p.pageSetup) state.flow.report.pageSetup = Object.assign(state.flow.report.pageSetup, p.pageSetup);
      if (p && p.output) state.flow.report.output = Object.assign(state.flow.report.output, p.output);
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        pageSetup: state.flow.report.pageSetup,
        output: { fontFa: state.flow.report.output.fontFa, fontEn: state.flow.report.output.fontEn, ext: state.flow.report.output.ext }
      }));
    } catch (e) { /* ignore */ }
  }

  function loadTheme() {
    let t = 'light';
    try { t = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { /* دسترسی محدود */ }
    state.settings.theme = (t === 'dark') ? 'dark' : 'light';
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    try { localStorage.setItem(THEME_KEY, state.settings.theme); } catch (e) { /* ignore */ }
  }
  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    emit('theme');
  }

  /* ---------- تاریخچه (localStorage — فقط اطلاعات خلاصه) ---------- */
  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) state.history = JSON.parse(raw) || [];
    } catch (e) { state.history = []; }
  }
  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, 50))); }
    catch (e) {
      console.warn('ذخیره تاریخچه ناموفق بود (احتمالاً حافظه مرورگر پر است):', e);
      UIKit.toast('warning', 'تاریخچه ذخیره نشد', 'حافظه محلی مرورگر در دسترس نیست یا پر شده است. عملیات اصلی تحت تأثیر قرار نمی‌گیرد.');
    }
  }
  function addHistoryEntry(entry) {
    entry.id = 'H' + Date.now();
    entry.createdAt = new Date().toISOString();
    state.history.unshift(entry);
    state.history = state.history.slice(0, 50);
    saveHistory();
    emit('history');
  }
  function deleteHistoryEntry(id) {
    state.history = state.history.filter(h => h.id !== id);
    saveHistory();
    emit('history');
  }
  function clearHistory() {
    state.history = [];
    saveHistory();
    emit('history');
  }

  loadTheme();
  loadHistory();
  loadPrefs();

  return { state, subscribe, emit, resetFlow, fullReset, applyTheme, toggleTheme, addHistoryEntry, deleteHistoryEntry, clearHistory, savePrefs };
})();
