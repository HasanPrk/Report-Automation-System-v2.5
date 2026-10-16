/* ═══════════════════════════════════════════════════════════
   backupManager — پشتیبان‌گیری و بازیابی کامل داده‌ها و گزارش‌ها
   خروجی: فایل JSON شامل وضعیت کامل گردش کار (داده، پاک‌سازی، قالب‌ها،
   محاسبات، نمودارها، متن گزارش، هویت بصری، تنظیمات) + تاریخچه
   ═══════════════════════════════════════════════════════════ */
'use strict';

const backupManager = (function () {
  const VERSION = 2;

  function exportBackup() {
    const s = Store.state;
    const payload = {
      app: 'report-automation-system',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      flow: {
        source: s.flow.source,
        raw: s.flow.raw,
        profile: s.flow.profile,
        work: s.flow.work,
        clean: { started: true, confirmed: s.flow.clean.confirmed, log: s.flow.clean.log, rowsBefore: s.flow.clean.rowsBefore, undoStack: [] },
        dupes: s.flow.dupes,
        active: s.flow.active,
        derived: s.flow.derived || { defs: [], appliedAt: null },
        templates: s.flow.templates,
        compat: s.flow.compat,
        calc: s.flow.calc,
        charts: s.flow.charts,
        ai: { mode: s.flow.ai.mode, generated: s.flow.ai.generated, contextNotes: s.flow.ai.contextNotes, customPrompt: s.flow.ai.customPrompt, config: { endpoint: s.flow.ai.config.endpoint, model: s.flow.ai.config.model, apiKey: '' } },
        report: s.flow.report
      },
      history: s.history
    };
    const name = `پشتیبان-گزارش‌ساز-${Utils.todayJalali().replace(/\//g, '.')}.json`;
    Utils.downloadFile(name, JSON.stringify(payload, null, 1), 'application/json;charset=utf-8');
    return name;
  }

  function importBackup(text) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('فایل پشتیبان قابل خواندن نیست: ' + e.message); }
    if (!data || data.app !== 'report-automation-system') {
      throw new Error('این فایل پشتیبان سامانه گزارش‌ساز نیست.');
    }
    if (!data.flow) throw new Error('ساختار فایل پشتیبان معتبر نیست (flow یافت نشد).');
    const s = Store.state;
    const def = { clean: { undoStack: [] }, dupes: {}, calc: {}, charts: { items: [], seq: 0 }, ai: { config: {} }, report: {} };
    // ادغام محتاطانه با ساختار پیش‌فرض
    const f = Object.assign({}, def, JSON.parse(JSON.stringify(data.flow)));
    f.clean = Object.assign({ started: false, confirmed: false, log: [], undoStack: [] }, f.clean || {});
    if (!Array.isArray(f.clean.undoStack)) f.clean.undoStack = [];
    f.clean.redoStack = [];
    f.dupes = Object.assign({ scanned: false, config: null, groups: [], lastRemoval: null, removedTotal: 0 }, f.dupes || {});
    f.calc = Object.assign({ defs: [], results: [], ranAt: null, sourceMode: 'app', fileDefs: [] }, f.calc || {});
    f.charts = Object.assign({ items: [], seq: 0 }, f.charts || {});
    f.derived = Object.assign({ defs: [], appliedAt: null }, f.derived || {});
    f.ai = Object.assign({ mode: 'demo', generated: null, customPrompt: '' }, f.ai || {});
    f.ai.config = Object.assign({ endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', apiKey: '' }, f.ai.config || {});
    f.ai.config.apiKey = ''; // کلید هرگز از پشتیبان بازنخواهی نمی‌شود
    f.report = Object.assign({}, f.report || {});
    s.flow = f;
    if (Array.isArray(data.history)) {
      data.history.forEach(h => { if (!s.history.some(x => x.id === h.id)) s.history.push(h); });
      s.history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      try { localStorage.setItem('ras_history_v1', JSON.stringify(s.history.slice(0, 50))); } catch (e) { /* ignore */ }
    }
    Store.emit('backup-restored');
    return true;
  }

  function statsSummary() {
    const f = Store.state.flow;
    return {
      hasData: !!f.raw,
      rows: f.raw ? f.raw.rows.length : 0,
      cleanConfirmed: !!f.clean.confirmed,
      templates: f.templates.uploaded.length,
      calcs: (f.calc.defs || []).length + (f.calc.fileDefs || []).length,
      charts: (f.charts.items || []).length,
      hasReport: !!f.ai.generated,
      historyCount: Store.state.history.length
    };
  }

  return { exportBackup, importBackup, statsSummary };
})();
