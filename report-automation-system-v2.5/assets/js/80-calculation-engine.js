/* ═══════════════════════════════════════════════════════════
   calculationEngine — موتور محاسبات گزارش
   تجمیعی، گروهی، فیلتردار و مقایسه دوره‌ای + اعتبارسنجی کامل
   ═══════════════════════════════════════════════════════════ */
'use strict';

const calculationEngine = (function () {
  const F = () => Store.state.flow;

  const OPS_META = {
    count: { label: 'تعداد رکوردها', needsColumn: false, numeric: false },
    distinct: { label: 'تعداد مقادیر یکتا', needsColumn: true, numeric: false },
    sum: { label: 'مجموع', needsColumn: true, numeric: true },
    mean: { label: 'میانگین', needsColumn: true, numeric: true },
    median: { label: 'میانه', needsColumn: true, numeric: true },
    min: { label: 'کمینه', needsColumn: true, numeric: true },
    max: { label: 'بیشینه', needsColumn: true, numeric: true },
    groupCount: { label: 'شمارش گروهی', needsColumn: true, numeric: false },
    groupSum: { label: 'مجموع گروهی', needsColumn: true, numeric: true },
    groupMean: { label: 'میانگین گروهی', needsColumn: true, numeric: true },
    periodCompare: { label: 'مقایسه دوره‌ای', needsColumn: true, numeric: true },
    periodCount: { label: 'روند شمارش دوره‌ای', needsColumn: false, numeric: false },
    pctFiltered: { label: 'درصد از کل (با فیلتر)', needsColumn: true, numeric: false },
    countFiltered: { label: 'شمارش با فیلتر', needsColumn: false, numeric: false }
  };

  function dataset() {
    return F().active;
  }

  /* ---------- اعتبارسنجی تعریف محاسبه ---------- */
  function validateDef(def) {
    const ds = dataset();
    if (!ds) return { ok: false, error: 'مجموعه داده فعالی وجود ندارد.' };
    if (!def || !def.id) return { ok: false, error: 'شناسه محاسبه مشخص نیست.' };
    const meta = OPS_META[def.op];
    if (!meta) return { ok: false, error: `نوع عملیات «${def.op}» پشتیبانی نمی‌شود.` };
    const colIdx = def.column ? ds.columns.findIndex(c => c.name === def.column) : -1;
    if (meta.needsColumn && colIdx < 0) {
      return { ok: false, error: `ستون «${def.column || '؟'}» در مجموعه داده یافت نشد.` };
    }
    if (meta.numeric && colIdx >= 0 && !['number', 'mixed'].includes(ds.columns[colIdx].type)) {
      return { ok: false, error: `عملیات «${OPS_META[def.op].label}» برای ستون متنی «${def.column}» معتبر نیست؛ این عملیات فقط برای ستون عددی تعریف می‌شود.` };
    }
    if ((def.op === 'groupSum' || def.op === 'groupMean') && !def.groupBy) {
      return { ok: false, error: 'برای تجمیع گروهی، ستون گروه‌بندی را انتخاب کنید.' };
    }
    if (def.op === 'groupCount' && !def.groupBy && !def.column) {
      return { ok: false, error: 'برای شمارش گروهی، ستون گروه‌بندی را انتخاب کنید.' };
    }
    if ((def.op === 'pctFiltered' || def.op === 'countFiltered') && !(def.filter && (def.filter.col || def.column))) {
      return { ok: false, error: 'برای شمارش فیلتردار، ستون و شرط فیلتر را مشخص کنید.' };
    }
    if ((def.op === 'periodCompare' || def.op === 'periodCount') && !def.dateColumn) {
      return { ok: false, error: 'برای تحلیل دوره‌ای، ستون تاریخ را انتخاب کنید.' };
    }
    if ((def.op === 'periodCompare' || def.op === 'periodCount' || def.op === 'pctFiltered' || def.op === 'countFiltered' || def.op.startsWith('group')) ) {
      const gbName = def.op === 'periodCompare' || def.op === 'periodCount' ? def.dateColumn : def.groupBy || def.column;
      if (gbName) {
        const gi = ds.columns.findIndex(c => c.name === gbName);
        if (gi < 0) return { ok: false, error: `ستون «${gbName}» یافت نشد.` };
      }
    }
    return { ok: true, colIdx: Math.max(colIdx, -1) };
  }

  /* ---------- فیلتر ---------- */
  function matchFilter(value, filter) {
    if (!filter || !filter.op) return true;
    const sVal = String(value == null ? '' : value).trim();
    const norm = Utils.normalizeFa(sVal);
    const target = Utils.normalizeFa(String(filter.value == null ? '' : filter.value).trim());
    switch (filter.op) {
      case 'eq': return norm === target;
      case 'ne': return norm !== target;
      case 'contains': return norm.includes(target);
      case 'gt': { const a = Utils.parseNum(sVal), b = Utils.parseNum(filter.value); return a !== null && b !== null && a > b; }
      case 'gte': { const a = Utils.parseNum(sVal), b = Utils.parseNum(filter.value); return a !== null && b !== null && a >= b; }
      case 'lt': { const a = Utils.parseNum(sVal), b = Utils.parseNum(filter.value); return a !== null && b !== null && a < b; }
      case 'lte': { const a = Utils.parseNum(sVal), b = Utils.parseNum(filter.value); return a !== null && b !== null && a <= b; }
      default: return true;
    }
  }

  /* ---------- اجرای یک محاسبه ---------- */
  function runOne(def) {
    const ds = dataset();
    const v = validateDef(def);
    if (!v.ok) return { def, ok: false, error: v.error, meta: {} };
    const ci = v.colIdx;
    const meta = { n: 0, excludedMissing: 0, excludedNonNumeric: 0, warnings: [] };
    const rows = ds.rows;

    const numericVals = (rowFilter) => {
      const nums = [];
      rows.forEach((row, ri) => {
        const raw = row[ci];
        if (String(raw == null ? '' : raw).trim() === '') { meta.excludedMissing++; return; }
        if (rowFilter && !matchFilter(row[ds.columns.findIndex(c => c.name === (rowFilter.col || def.filter.col))], rowFilter)) return;
        const n = Utils.parseNum(raw);
        if (n === null) { meta.excludedNonNumeric++; return; }
        nums.push(n);
      });
      return nums;
    };

    switch (def.op) {
      case 'count': {
        meta.n = rows.length;
        return { def, ok: true, value: rows.length, meta };
      }
      case 'countFiltered': {
        const fci = ds.columns.findIndex(c => c.name === (def.filter && (def.filter.col || def.column)));
        if (fci < 0) return { def, ok: false, error: 'ستون فیلتر یافت نشد.', meta };
        let cnt = 0;
        rows.forEach(row => { if (matchFilter(row[fci], def.filter)) cnt++; });
        meta.n = cnt;
        return { def, ok: true, value: cnt, meta };
      }
      case 'pctFiltered': {
        const fci = ds.columns.findIndex(c => c.name === (def.filter && (def.filter.col || def.column)));
        if (fci < 0) return { def, ok: false, error: 'ستون فیلتر یافت نشد.', meta };
        let cnt = 0;
        rows.forEach(row => { if (matchFilter(row[fci], def.filter)) cnt++; });
        meta.n = cnt;
        const val = rows.length ? (cnt / rows.length) * 100 : 0;
        return { def, ok: true, value: Math.round(val * 10) / 10, meta: Object.assign(meta, { outOf: rows.length }) };
      }
      case 'distinct': {
        const s = new Set();
        rows.forEach(row => {
          const val = String(row[ci] == null ? '' : row[ci]).trim();
          if (val) s.add(Utils.normalizeFa(val));
        });
        meta.n = s.size;
        return { def, ok: true, value: s.size, meta };
      }
      case 'sum': case 'mean': case 'median': case 'min': case 'max': {
        const nums = numericVals();
        if (!nums.length) {
          return { def, ok: false, error: `هیچ مقدار عددی معتبری در ستون «${def.column}» یافت نشد.`, meta };
        }
        if (meta.excludedNonNumeric > 0) meta.warnings.push(`${Utils.fmtInt(meta.excludedNonNumeric)} مقدار غیرعددی نادیده گرفته شد.`);
        if (meta.excludedMissing > 0) meta.warnings.push(`${Utils.fmtInt(meta.excludedMissing)} مقدار خالی از محاسبه حذف شد.`);
        let value;
        if (def.op === 'sum') value = nums.reduce((a, b) => a + b, 0);
        else if (def.op === 'mean') value = nums.reduce((a, b) => a + b, 0) / nums.length;
        else if (def.op === 'median') {
          const s = nums.slice().sort((a, b) => a - b);
          const mid = Math.floor(s.length / 2);
          value = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
        }
        else if (def.op === 'min') value = Math.min(...nums);
        else value = Math.max(...nums);
        value = Math.round(value * 100) / 100;
        meta.n = nums.length;
        return { def, ok: true, value, meta };
      }
      case 'groupCount': case 'groupSum': case 'groupMean': {
        const gbName = def.groupBy || (def.op === 'groupCount' ? def.column : null);
        const gi = ds.columns.findIndex(c => c.name === gbName);
        if (gi < 0) return { def, ok: false, error: `ستون گروه‌بندی «${gbName || '؟'}» یافت نشد.`, meta };
        const groups = new Map();
        rows.forEach(row => {
          const key = String(row[gi] == null ? '' : row[gi]).trim();
          const k = Utils.normalizeFa(key) || '(خالی)';
          if (!groups.has(k)) groups.set(k, { label: key || '(خالی)', count: 0, sum: 0, nums: [] });
          const g = groups.get(k);
          g.count++;
          if (ci >= 0) {
            const n = Utils.parseNum(row[ci]);
            if (n !== null) { g.sum += n; g.nums.push(n); }
          }
        });
        if (!groups.size) return { def, ok: false, error: 'داده‌ای برای گروه‌بندی یافت نشد.', meta };
        const table = [...groups.values()].map(g => {
          const val = def.op === 'groupCount' ? g.count : def.op === 'groupSum' ? g.sum : (g.nums.length ? g.sum / g.nums.length : null);
          return { label: g.label || '(خالی)', count: g.count, value: val === null ? null : Math.round(val * 100) / 100 };
        });
        table.sort((a, b) => (b.value || 0) - (a.value || 0) || b.count - a.count);
        meta.n = table.length;
        return {
          def, ok: true,
          table,
          meta,
          chart: { type: 'bar', labelKey: 'label', valueKey: 'value', title: def.label }
        };
      }
      case 'periodCount': case 'periodCompare': {
        const di = ds.columns.findIndex(c => c.name === def.dateColumn);
        if (di < 0) return { def, ok: false, error: `ستون تاریخ «${def.dateColumn}» یافت نشد.`, meta };
        const byMonth = new Map();
        let skipped = 0;
        rows.forEach(row => {
          const pv = Utils.parseDateValue(row[di]);
          if (!pv.valid) { skipped++; return; }
          const key = `${pv.jy}/${String(pv.jm).padStart(2, '0')}`;
          if (!byMonth.has(key)) byMonth.set(key, { key, jy: pv.jy, jm: pv.jm, count: 0, sum: 0 });
          const m = byMonth.get(key);
          m.count++;
          if (ci >= 0) {
            const n = Utils.parseNum(row[ci]);
            if (n !== null) m.sum += n;
          }
        });
        if (skipped) meta.warnings.push(`${Utils.fmtInt(skipped)} ردیف به دلیل تاریخ نامعتبر/خالی از تحلیل دوره‌ای حذف شد.`);
        const series = [...byMonth.values()].sort((a, b) => (a.jy * 100 + a.jm) - (b.jy * 100 + b.jm))
          .map(m => ({ key: m.key, label: Utils.faDig(`${m.jy}/${String(m.jm).padStart(2, '0')}`), value: ci >= 0 ? Math.round(m.sum * 100) / 100 : m.count, count: m.count }));
        if (!series.length) return { def, ok: false, error: 'هیچ تاریخ معتبری برای تحلیل دوره‌ای یافت نشد.', meta };
        if (series.length < 2) meta.warnings.push('فقط یک ماه داده وجود دارد؛ مقایسه با دوره قبل ممکن نیست.');
        const current = series[series.length - 1];
        const previous = series.length >= 2 ? series[series.length - 2] : null;
        let deltaAbs = null, deltaPct = null;
        if (previous) {
          deltaAbs = Math.round((current.value - previous.value) * 100) / 100;
          deltaPct = previous.value !== 0 ? Math.round(((current.value - previous.value) / Math.abs(previous.value)) * 1000) / 10 : null;
          if (deltaPct === null) meta.warnings.push('مقدار دوره قبل صفر بود؛ درصد تغییر محاسبه نشد.');
        }
        meta.n = series.length;
        return {
          def, ok: true, series, current, previous, deltaAbs, deltaPct, meta,
          chart: { type: 'line', labelKey: 'label', valueKey: 'value', title: def.label }
        };
      }
      default:
        return { def, ok: false, error: 'عملیات پیاده‌سازی نشده است.', meta };
    }
  }

  /* ---------- اجرای همه (با در نظر گرفتن منبع محاسبات) ---------- */
  function activeDefs() {
    const f = F();
    const mode = f.calc.sourceMode || 'app';
    const fileDefs = (f.calc.fileDefs || []).map(d => Object.assign({}, d, { source: 'file' }));
    const appDefs = (f.calc.defs || []).map(d => Object.assign({}, d, { source: d.source || 'app' }));
    if (mode === 'file') return fileDefs;
    if (mode === 'both') return fileDefs.concat(appDefs);
    return appDefs;
  }

  function runAll() {
    const f = F();
    const defs = activeDefs();
    if (!defs.length) return { results: [], okCount: 0, errCount: 0, empty: true };
    const results = [];
    let okCount = 0, errCount = 0;
    defs.forEach(def => {
      const r = runOne(def);
      results.push(r);
      if (r.ok) okCount++; else errCount++;
    });
    f.calc.results = results;
    f.calc.ranAt = new Date().toISOString();
    f.calc.okCount = okCount;
    f.calc.errCount = errCount;
    Store.emit('calc-run');
    return { results, okCount, errCount };
  }

  /* ---------- مدیریت تعاریف ---------- */
  function addDef(def) {
    const f = F();
    const v = validateDef(def);
    if (!v.ok) return { ok: false, error: v.error };
    if (!def.id) def.id = Utils.uid('calc');
    if (f.calc.defs.some(d => d.id === def.id)) def.id = Utils.uid('calc');
    f.calc.defs.push(def);
    return { ok: true, def };
  }
  function removeDef(id) {
    const f = F();
    f.calc.defs = f.calc.defs.filter(d => d.id !== id);
  }
  function getResult(id) {
    return F().calc.results.find(r => r.def.id === id) || null;
  }

  /* ---------- حل شناسه‌های خودکار قالب داخلی ---------- */
  function resolveAuto(calcId) {
    const f = F();
    if (calcId !== 'auto-breakdown') return calcId;
    const spec = templateManager.effectiveSpec(templateManager.get(f.templates.selectedId), f.active);
    if (!spec) return calcId;
    const catDef = spec.defs.find(d => d.op === 'groupSum' || d.op === 'groupCount');
    return catDef ? catDef.id : calcId;
  }

  /* ---------- تعاریف محاسبات از درون فایل داده (شیت «محاسبات» یا JSON) ---------- */
  /**
   * matrix: ردیف‌های شیت محاسبات از فایل Excel — سرستون‌ها:
   * id, label, op, column, groupBy, dateColumn, filterCol, filterOp, filterValue
   */
  function defsFromMatrix(matrix) {
    if (!matrix || matrix.length < 2) throw new Error('شیت محاسبات خالی است یا سرستون ندارد.');
    const header = matrix[0].map(h => Utils.normalizeFa(String(h == null ? '' : h)).replace(/\s+/g, ''));
    const idx = (names) => header.findIndex(h => names.some(n => h === Utils.normalizeFa(n).replace(/\s+/g, '')));
    const iId = idx(['id', 'کلید', 'شناسه']), iLabel = idx(['label', 'نام شاخص', 'شاخص', 'عنوان']),
      iOp = idx(['op', 'operation', 'عملیات', 'نوع']), iCol = idx(['column', 'ستون', 'ستون مقدار']),
      iGroup = idx(['groupby', 'group', 'گروه‌بندی', 'ستون گروه‌بندی']), iDate = idx(['datecolumn', 'تاریخ', 'ستون تاریخ']),
      iFC = idx(['filtercol', 'ستون فیلتر']), iFO = idx(['filterop', 'شرط فیلتر']), iFV = idx(['filtervalue', 'مقدار فیلتر']);
    if (iOp < 0 || (iLabel < 0 && iId < 0)) throw new Error('ساختار شیت محاسبات معتبر نیست؛ حداقل ستون‌های «label» و «op» لازم است.');
    const defs = [];
    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const op = String(row[iOp] == null ? '' : row[iOp]).trim();
      if (!op) continue;
      const label = iLabel >= 0 ? String(row[iLabel] == null ? '' : row[iLabel]).trim() : '';
      const def = {
        id: (iId >= 0 && String(row[iId] || '').trim()) ? String(row[iId]).trim() : Utils.uid('fcalc'),
        label: label || op,
        op,
        column: iCol >= 0 && String(row[iCol] || '').trim() ? String(row[iCol]).trim() : null,
        groupBy: iGroup >= 0 && String(row[iGroup] || '').trim() ? String(row[iGroup]).trim() : null,
        dateColumn: iDate >= 0 && String(row[iDate] || '').trim() ? String(row[iDate]).trim() : null,
        filter: (iFC >= 0 && String(row[iFC] || '').trim()) ? { col: String(row[iFC]).trim(), op: iFO >= 0 && String(row[iFO] || '').trim() ? String(row[iFO]).trim() : 'eq', value: iFV >= 0 ? String(row[iFV] == null ? '' : row[iFV]).trim() : '' } : null
      };
      defs.push(def);
    }
    if (!defs.length) throw new Error('هیچ محاسبه‌ای در شیت محاسبات یافت نشد.');
    return defs;
  }

  function defsFromJSON(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('فایل JSON قابل خواندن نیست: ' + e.message); }
    const arr = Array.isArray(obj) ? obj : (obj.calcSpec || []);
    if (!Array.isArray(arr) || !arr.length) throw new Error('هیچ محاسبه‌ای در فایل JSON یافت نشد (کلید calcSpec).');
    return arr.map(d => Object.assign({}, d, {
      id: d.id || Utils.uid('fcalc'),
      label: d.label || d.op,
      filter: d.filter || null
    }));
  }

  function setFileDefs(defs, sourceName) {
    const f = F();
    f.calc.fileDefs = defs;
    f.calc.fileSourceName = sourceName || '';
  }

  return { OPS_META, validateDef, runOne, runAll, activeDefs, addDef, removeDef, getResult, matchFilter, resolveAuto, defsFromMatrix, defsFromJSON, setFileDefs };
})();
