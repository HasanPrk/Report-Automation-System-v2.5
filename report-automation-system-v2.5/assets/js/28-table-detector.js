/* ═══════════════════════════════════════════════════════════
   tableDetector — تشخیص «همه جدول‌ها» داخل هر شیت Excel
   • هر شیت ممکن است چند جدول (پشت سر هم یا کنار هم) داشته باشد
   • جدول‌ها با مرز ردیف/ستون کاملاً خالی از هم جدا می‌شوند
   • کاربر هر ترکیبی را می‌تواند با چک‌باکس انتخاب کند و نرم‌افزار
     جدول‌های انتخاب‌شده را در یک مجموعه داده یکپارچه ادغام می‌کند
   ═══════════════════════════════════════════════════════════ */
'use strict';

const tableDetector = (function () {

  const isFilled = (v) => String(v == null ? '' : v).trim() !== '';

  /** ماتریس خام شیت (ردیف‌های خالی حفظ می‌شوند تا مرز جدول‌ها دیده شود) */
  function sheetMatrix(wb, sheetName) {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
  }

  /**
   * تشخیص جدول‌های یک شیت
   * خروجی: [{ id, sheet, idx, name, headerRow, r1, r2, c1, c2, rowCount, colCount, headers, dataset }]
   */
  function detectInSheet(wb, sheetName, fileName) {
    const matrix = sheetMatrix(wb, sheetName);
    const tables = [];
    if (!matrix.length) return tables;

    /* --- ۱) باندهای ردیفی: ردیف‌های دارای داده که با ردیف خالی از هم جدا شده‌اند --- */
    const rowBands = [];
    let cur = null;
    for (let r = 0; r < matrix.length; r++) {
      const has = (matrix[r] || []).some(isFilled);
      if (has) { if (!cur) cur = { r1: r, r2: r }; else cur.r2 = r; }
      else if (cur) { rowBands.push(cur); cur = null; }
    }
    if (cur) rowBands.push(cur);

    /* --- ۲) داخل هر باند ردیفی، باندهای ستونی (جدول‌های کنار هم) --- */
    let seq = 0;
    rowBands.forEach(band => {
      const colHas = [];
      for (let r = band.r1; r <= band.r2; r++) {
        (matrix[r] || []).forEach((v, c) => { if (isFilled(v)) colHas[c] = true; });
      }
      const colBands = [];
      let cb = null;
      const maxC = colHas.length - 1;
      for (let c = 0; c <= maxC; c++) {
        if (colHas[c]) { if (!cb) cb = { c1: c, c2: c }; else cb.c2 = c; }
        else if (cb) { colBands.push(cb); cb = null; }
      }
      if (cb) colBands.push(cb);

      colBands.forEach(colBand => {
        const sub = [];
        for (let r = band.r1; r <= band.r2; r++) {
          const row = matrix[r] || [];
          const slice = [];
          for (let c = colBand.c1; c <= colBand.c2; c++) slice.push(row[c] == null ? '' : row[c]);
          sub.push(slice);
        }
        /* حداقل یک ردیف سرستون + یک ردیف داده و حداقل ۲ ستون */
        if (sub.length < 2 || colBand.c2 - colBand.c1 < 1) return;
        const filledHeader = sub[0].filter(isFilled).length;
        if (filledHeader < 2) return;
        try {
          const ds = dataImporter.buildDataset(sub, `شیت «${sheetName}»`);
          seq++;
          tables.push({
            id: `T${tables.length + 1}`,
            sheet: sheetName,
            idx: seq,
            name: `جدول ${Utils.faDig(seq)}`,
            r1: band.r1 + 1, r2: band.r2 + 1,
            c1: colBand.c1 + 1, c2: colBand.c2 + 1,
            rowCount: ds.rows.length,
            colCount: ds.columns.length,
            headers: ds.columns.map(c => c.name),
            columnTypes: ds.columns.map(c => c.type),
            emptyCells: ds.meta.emptyCells,
            dupEstimate: ds.meta.dupEstimate,
            dataset: ds
          });
        } catch (e) { /* بلوک نامعتبر — نادیده گرفته می‌شود */ }
      });
    });
    return tables;
  }

  /** تشخیص جدول‌های همه شیت‌های فایل */
  function detectWorkbook(wb, sheets, fileName) {
    const out = [];
    (sheets || wb.SheetNames || []).forEach(sn => {
      const ts = detectInSheet(wb, sn, fileName);
      out.push({ sheet: sn, tables: ts });
    });
    return out;
  }

  /**
   * ادغام جدول‌های انتخابی در یک مجموعه داده یکپارچه
   * ستون‌ها به‌صورت اجتماع نام‌ها ساخته می‌شوند؛ سلول‌های نبودن با «خالی» پر می‌شوند.
   */
  function mergeDatasets(selected) {
    if (!selected || !selected.length) throw new Error('هیچ جدولی برای ورود انتخاب نشده است.');
    if (selected.length === 1) return selected[0].dataset;
    const cols = [];
    const seen = new Map();
    selected.forEach(t => {
      t.dataset.columns.forEach(c => {
        if (!seen.has(c.name)) { seen.set(c.name, cols.length); cols.push({ name: c.name, type: c.type, emptyCount: 0, from: [] }); }
        const entry = cols[seen.get(c.name)];
        entry.from.push(t.name);
        if (entry.type !== c.type) entry.type = 'mixed';
      });
    });
    const rows = [];
    selected.forEach(t => {
      const idxMap = t.dataset.columns.map(c => seen.get(c.name));
      t.dataset.rows.forEach(r => {
        const out = new Array(cols.length).fill('');
        idxMap.forEach((target, src) => { if (src < r.length) out[target] = r[src]; });
        rows.push(out);
      });
    });
    /* نوع واقعی هر ستون پس از ادغام بازمحاسبه می‌شود */
    cols.forEach((c, ci) => {
      const counts = {};
      let nonEmpty = 0;
      rows.forEach(r => {
        const t = Utils.classifyValue(r[ci]);
        if (t === 'empty') return;
        nonEmpty++; counts[t] = (counts[t] || 0) + 1;
      });
      c.emptyCount = rows.length - nonEmpty;
      if (!nonEmpty) { c.type = 'text'; return; }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      c.type = (top[1] / nonEmpty >= 0.7) ? top[0] : 'mixed';
    });
    const emptyCells = cols.reduce((s, c) => s + c.emptyCount, 0);
    const sig = new Map();
    let dupCount = 0;
    rows.forEach(r => { const k = JSON.stringify(r); if (sig.has(k)) dupCount++; else sig.set(k, 1); });
    return {
      columns: cols,
      rows,
      meta: {
        sourceNote: selected.map(t => `${t.sheet} › ${t.name}`).join(' + '),
        rowCount: rows.length,
        colCount: cols.length,
        emptyCells,
        dupEstimate: dupCount,
        sampledAt: new Date().toISOString()
      }
    };
  }

  return { detectInSheet, detectWorkbook, mergeDatasets, sheetMatrix };
})();
