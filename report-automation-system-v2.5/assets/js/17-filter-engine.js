/* ═══════════════════════════════════════════════════════════
   FilterEngine — موتور فیلتر سراسری داده
   • انتخاب هر فیلتر، بلافاصله تمام خروجی‌های وابسته (KPI، نمودار، جدول)
     را بدون بارگذاری مجدد صفحه به‌روزرسانی می‌کند
   • گزینه‌های هر فیلتر از «مقادیر یکتای واقعی داده» ساخته می‌شوند
   • فیلترهای وابسته (Cross-Filter): گزینه‌های هر ستون با درنظرگرفتن
     سایر فیلترها محدود می‌شوند (مثلاً فهرست کارکنان پس از انتخاب واحد)
   • داده منبع هرگز تغییر نمی‌کند (نمای فیلترشده برگردانده می‌شود)
   ═══════════════════════════════════════════════════════════ */
'use strict';

const FilterEngine = (function () {
  const listeners = [];

  function ensure() {
    const ui = Store.state.ui;
    if (!ui.filters) ui.filters = { rules: {} };   // rules: { colName: [values...] }
    if (!ui.filters.rules) ui.filters.rules = {};
    return ui.filters;
  }

  function subscribe(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error('filter listener', e); } }); }

  function activeDataset() {
    const f = Store.state.flow;
    return f.active || f.work || f.raw || null;
  }

  /* ---------- مدیریت قواعد ---------- */
  function setRule(col, values) {
    const flt = ensure();
    const vals = (values || []).filter(v => v !== null && v !== undefined && String(v) !== '');
    if (!vals.length) delete flt.rules[col];
    else flt.rules[col] = vals;
    notify();
  }

  /** روشن/خاموش کردن یک مقدار در فیلتر ستون */
  function toggleValue(col, value) {
    const flt = ensure();
    const cur = (flt.rules[col] || []).slice();
    const s = String(value);
    const i = cur.findIndex(v => String(v) === s);
    if (i >= 0) cur.splice(i, 1); else cur.push(s);
    setRule(col, cur);
  }

  function clearRule(col) { const flt = ensure(); delete flt.rules[col]; notify(); }
  function clearAll() { const flt = ensure(); flt.rules = {}; notify(); }

  function getRule(col) { const flt = ensure(); return flt.rules[col] || null; }
  function hasFilters() { const flt = ensure(); return Object.keys(flt.rules).length > 0; }
  function rulesSnapshot() {
    const flt = ensure();
    return Object.keys(flt.rules).map(col => ({ col, values: flt.rules[col].slice() }));
  }
  function activeCount() {
    const flt = ensure();
    return Object.keys(flt.rules).reduce((s, k) => s + flt.rules[k].length, 0);
  }

  /* ---------- اعمال قواعد روی ردیف‌ها (بدون تغییر داده منبع) ---------- */
  function rowPasses(row, colIdxMap, rules) {
    for (const col of Object.keys(rules)) {
      const ci = colIdxMap[col];
      if (ci === undefined || ci < 0) continue;
      const allowed = rules[col];
      const v = String(row[ci] == null ? '' : row[ci]).trim();
      if (!allowed.some(a => String(a) === v)) return false;
    }
    return true;
  }

  /** ردیف‌های فیلترشده (نمای زنده از مجموعه داده فعال) */
  function filteredRows() {
    const ds = activeDataset();
    if (!ds) return [];
    const flt = ensure();
    const cols = Object.keys(flt.rules);
    if (!cols.length) return ds.rows;
    const colIdxMap = {};
    ds.columns.forEach((c, i) => { colIdxMap[c.name] = i; });
    return ds.rows.filter(r => rowPasses(r, colIdxMap, flt.rules));
  }

  /** مجموعه داده فیلترشده — همان ارجاع ستون‌ها با ردیف‌های نمای فیلترشده */
  function filteredDataset() {
    const ds = activeDataset();
    if (!ds) return null;
    return { columns: ds.columns, rows: filteredRows(), meta: ds.meta || {} };
  }

  /* ---------- مقادیر یکتا از دل واقعی داده ---------- */
  /**
   * مقادیر یکتای ستون همراه با تعداد — برای فیلترهای وابسته،
   * ردیف‌ها ابتدا با «سایر فیلترها» (به‌جز خود این ستون) فیلتر می‌شوند.
   */
  function uniqueValues(col, opts) {
    opts = opts || {};
    const ds = activeDataset();
    if (!ds) return [];
    const ci = ds.columns.findIndex(c => c.name === col);
    if (ci < 0) return [];
    let rows = ds.rows;
    if (opts.dependent !== false) {
      const flt = ensure();
      const others = {};
      Object.keys(flt.rules).forEach(k => { if (k !== col) others[k] = flt.rules[k]; });
      if (Object.keys(others).length) {
        const colIdxMap = {};
        ds.columns.forEach((c, i) => { colIdxMap[c.name] = i; });
        rows = rows.filter(r => rowPasses(r, colIdxMap, others));
      }
    }
    const freq = new Map();
    rows.forEach(r => {
      const v = String(r[ci] == null ? '' : r[ci]).trim();
      const k = v === '' ? '(خالی)' : v;
      freq.set(k, (freq.get(k) || 0) + 1);
    });
    return [...freq.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fa'));
  }

  /** پیش‌نمایش نتیجه پس از اعمال فیلتر فعلی */
  function resultCount() { return filteredRows().length; }

  /** برچسب خلاصه برای نمایش چیپ‌ها */
  function chipLabel(col) {
    const rule = getRule(col);
    if (!rule) return null;
    const shown = rule.slice(0, 2).map(v => String(v).length > 14 ? String(v).slice(0, 13) + '…' : String(v)).join('، ');
    return { col, n: rule.length, text: shown + (rule.length > 2 ? ` و ${Utils.faDig(rule.length - 2)} مورد دیگر` : '') };
  }

  return {
    subscribe, notify, setRule, toggleValue, clearRule, clearAll,
    getRule, hasFilters, rulesSnapshot, activeCount,
    filteredRows, filteredDataset, uniqueValues, resultCount, chipLabel, activeDataset
  };
})();
