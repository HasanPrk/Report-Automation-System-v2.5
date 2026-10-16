/* ═══════════════════════════════════════════════════════════
   slicerEngine — ویجت Slicer (جایگزین «فیلترهای داده» در استودیو نمودار)
   • هر Slicer: یک فیلد + نوع کنترل (فهرست دسته‌ای / انتخاب چندگانه /
     بازه عددی / بازه تاریخ) + نمودارهای تحت تأثیر و مستثنا
   • رفتار مشابه Slicer اکسل: تغییر آن، نمودارهای متصل را بدون رفرش
     صفحه به‌روزرسانی می‌کند؛ فیلترها نمای زنده‌ای از داده واقعی‌اند.
   • قواعد کلیک‌به‌فیلتر قبلی (FilterEngine) به‌عنوان Slicer ضمنی «همگانی»
     حفظ شده‌اند تا رفتار کلیک روی نمودارها بدون تغییر کار کند.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const slicerEngine = (function () {

  function ensure() {
    const ui = Store.state.ui;
    if (!ui.slicers) ui.slicers = { list: [], seq: 0 };
    return ui.slicers;
  }

  function activeDataset() {
    const f = Store.state.flow;
    return f.active || f.work || f.raw || null;
  }

  const listeners = [];
  function subscribe(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error('slicer listener', e); } }); }

  function create(col, kind) {
    const s = ensure();
    /* یک Slicer برای هر فیلد کافی است */
    const exists = s.list.find(x => x.col === col);
    if (exists) return exists;
    const slicer = {
      id: 'sl' + (++s.seq),
      col,
      kind: kind || detectKind(col),
      values: [],            /* برای list */
      min: null, max: null,  /* برای number/date */
      exceptions: [],        /* شناسه نمودارهای مستثنا */
      createdAt: new Date().toISOString()
    };
    s.list.push(slicer);
    notify();
    return slicer;
  }

  function detectKind(colName) {
    const ds = activeDataset();
    if (!ds) return 'list';
    const c = ds.columns.find(x => x.name === colName);
    if (!c) return 'list';
    if (c.type === 'date') return 'date';
    if (c.type === 'number') return 'number';
    return 'list';
  }

  function remove(id) {
    const s = ensure();
    s.list = s.list.filter(x => x.id !== id);
    notify();
  }

  function get(id) { return ensure().list.find(x => x.id === id) || null; }
  function list() { return ensure().list.slice(); }
  function clear(id) {
    const sl = get(id);
    if (!sl) return;
    sl.values = []; sl.min = null; sl.max = null;
    notify();
  }
  function clearAll() {
    ensure().list = [];
    notify();
  }

  function isActive(sl) {
    if (!sl) return false;
    if (sl.kind === 'list') return sl.values && sl.values.length > 0;
    return sl.min != null || sl.max != null;
  }

  function hasActive() { return ensure().list.some(isActive); }

  /* آیا این نمودار تحت تأثیر این Slicer است؟ (همه نمودارها پیش‌فرض؛ مستثناها نه) */
  function appliesTo(sl, itemId) {
    return !sl.exceptions.includes(itemId);
  }

  /* آیا ردیف از این Slicer عبور می‌کند؟ */
  function rowPasses(sl, row, colIdx) {
    const v = row[colIdx];
    if (sl.kind === 'list') {
      if (!sl.values || !sl.values.length) return true;
      const sv = String(v == null ? '' : v).trim() || '(خالی)';
      return sl.values.includes(sv);
    }
    const num = Utils.parseNum(v);
    if (sl.kind === 'number') {
      if (sl.min != null && (num === null || num < sl.min)) return false;
      if (sl.max != null && (num === null || num > sl.max)) return false;
      return true;
    }
    if (sl.kind === 'date') {
      const pv = Utils.parseDateValue(v);
      if (!pv.valid) return false;
      if (sl.min != null) { const mn = Utils.parseDateValue(sl.min); if (mn.valid && pv.serial < mn.serial) return false; }
      if (sl.max != null) { const mx = Utils.parseDateValue(sl.max); if (mx.valid && pv.serial > mx.serial) return false; }
      return true;
    }
    return true;
  }

  /**
   * ردیف‌های قابل مشاهده برای یک نمودار مشخص:
   * قواعد کلیک‌به‌فیلتر (FilterEngine) + همه Slicerهای متصل به همین نمودار
   */
  function rowsFor(itemId) {
    const ds = activeDataset();
    if (!ds) return [];
    const colIdx = new Map(ds.columns.map((c, i) => [c.name, i]));
    const sls = list().filter(sl => isActive(sl) && appliesTo(sl, itemId));
    if (!sls.length) return FilterEngine.filteredRows();
    const base = FilterEngine.filteredRows();
    return base.filter(row => sls.every(sl => {
      const ci = colIdx.get(sl.col);
      if (ci == null) return true;
      return rowPasses(sl, row, ci);
    }));
  }

  /* تعداد ردیف عبوری مستقل از نمودار (برای نمایش در UI) */
  function countFor(itemId) { return rowsFor(itemId).length; }

  /* مقادیر یکتا برای فهرست Slicer (وابسته به سایر فیلترهای فعال روی ستون‌های دیگر) */
  function uniqueValues(col) { return FilterEngine.uniqueValues(col); }

  /* برچسب وضعیت برای چیپ */
  function chipLabel(sl) {
    if (sl.kind === 'list') {
      const n = sl.values.length;
      const shown = sl.values.slice(0, 2).join('، ');
      return { n, text: shown + (n > 2 ? ` و ${Utils.faDig(n - 2)} مورد دیگر` : '') };
    }
    const parts = [];
    if (sl.min != null) parts.push('از ' + sl.min);
    if (sl.max != null) parts.push('تا ' + sl.max);
    return { n: parts.length, text: parts.join(' ') };
  }

  return { create, remove, get, list, clear, clearAll, isActive, hasActive, rowsFor, countFor, uniqueValues, chipLabel, appliesTo, subscribe, notify, detectKind };
})();
