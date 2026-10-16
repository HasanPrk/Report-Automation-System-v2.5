/* ═══════════════════════════════════════════════════════════
   joinEngine — موتور ترکیب (Merge/Join) دو جدول بر اساس کلید مشترک
   • انواع: inner | left | right | full | cross
   • کلید چندستونی، نرمال‌سازی کلید (فاصله/ی/ک/ارقام)، مدیریت Null
   • هشدار برای انفجار ردیف (کلید تکراری، یک‌به‌چند، چندبه‌چند)
   • نام ستون‌های هم‌نام با پسوند قابل تشخیص حفظ می‌شوند (حذف خاموش نداریم)
   • نسخه ۲٫۴: انتخاب ستون‌های جدول ۲ (شبیه Power Query) — گزینه includeB
     فهرست نام ستون‌های جدول ۲ که برداشته می‌شوند؛ null/خالی = همه ستون‌ها.
     ستون‌های کلیدی همیشه حفظ می‌شوند (حذفشان Join را خراب می‌کند).
   • این ماژول «منبع» را جهش نمی‌دهد؛ همیشه مجموعه جدید می‌سازد.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const joinEngine = (function () {

  const JOIN_TYPES = {
    inner: { label: 'Inner Join — اشتراک', hint: 'فقط ردیف‌هایی که کلیدشان در هر دو جدول هست.', icon: 'checkCircle' },
    left:  { label: 'Left Outer Join', hint: 'همه ردیف‌های جدول چپ + ستون‌های مطابق جدول راست.', icon: 'arrowRight' },
    right: { label: 'Right Outer Join', hint: 'همه ردیف‌های جدول راست + ستون‌های مطابق جدول چپ.', icon: 'arrowLeft' },
    full:  { label: 'Full Outer Join', hint: 'همه ردیف‌های هر دو جدول؛ نامطابق‌ها با خالی.', icon: 'layers' },
    cross: { label: 'Cross Join (ضرب دکارتی)', hint: 'هر ردیف با هر ردیف — هشدار: ردیف‌ها ضرب می‌شوند!', icon: 'alert' }
  };

  /* ---------- کلید تطبیق ---------- */
  function normKey(v, opts) {
    let s = String(v == null ? '' : v).trim();
    if (!s || s === '(خالی)') return null;             // Null/خالی هیچ‌وقت match نمی‌شود
    if (opts && opts.normalizeFa !== false) s = Utils.normalizeFa(s);
    if (opts && opts.normalizeDigits !== false) s = Utils.normalizeDigits(s);
    return s;
  }

  function colIndex(ds, name) {
    return ds.columns.findIndex(c => c.name === name);
  }

  function resolvePairs(dsA, dsB, pairs) {
    /* pairs: [{a: columnNameA, b: columnNameB}] → ایندکس‌ها */
    const out = [];
    for (const p of pairs) {
      const ia = colIndex(dsA, p.a), ib = colIndex(dsB, p.b);
      if (ia < 0 || ib < 0) continue;
      out.push({ a: ia, b: ib, nameA: p.a, nameB: p.b });
    }
    return out;
  }

  /* ---------- ساخت ستون‌های خروجی ----------
     کلیدهای جدول B که با کلید A جفت شده‌اند حذف نمی‌شوند؛
     در صورت هم‌نام بودن با ستون A، پسوند می‌گیرند.
     نسخه ۲٫۴: فقط ستون‌های انتخابی جدول ۲ (includeB) برداشته می‌شوند؛
     ستون‌های کلیدی جفتی همیشه نگه داشته می‌شوند. */
  function buildColumns(dsA, dsB, pairs, suffixB, includeB) {
    const sfx = suffixB || ' (جدول ۲)';
    const used = new Set(dsA.columns.map(c => c.name));
    /* پشتیبانی از جفت‌کلید خام {a,b} و حل‌شده {nameA,nameB} */
    const keyB = new Set((pairs || []).map(p => p.nameB || p.b));
    const sel = (includeB && includeB.length) ? new Set(includeB) : null;
    const colsA = dsA.columns.map(c => ({ name: c.name, type: c.type, emptyCount: 0, from: 'A' }));
    colsA.forEach(c => used.add(c.name));
    const colsB = [];
    dsB.columns.forEach((c, ci) => {
      /* انتخاب ستون‌های جدول ۲ — ستون کلیدی همیشه حفظ می‌شود */
      if (sel && !sel.has(c.name) && !keyB.has(c.name)) return;
      let name = c.name;
      if (used.has(name)) name = name + sfx;
      used.add(name);
      colsB.push({ name, type: c.type, emptyCount: 0, from: 'B', origIdx: ci, isKeyDup: keyB.has(c.name) && c.name === pairs.find(p => p.b === c.name)?.b });
    });
    return { cols: colsA.concat(colsB), colsB, colsA };
  }

  /* برچسب وضعیت انتخاب ستون‌های جدول ۲ برای پیام‌ها */
  function includeBLabel(dsB, includeB) {
    if (!includeB || !includeB.length || includeB.length >= dsB.columns.length) return 'همه ستون‌های جدول ۲';
    return `${Utils.faDig(includeB.length)} ستون از ${Utils.faDig(dsB.columns.length)} ستون جدول ۲`;
  }

  /* ---------- پیش‌نمایش سریع (بدون ساخت کامل خروجی) ---------- */
  function preview(dsA, dsB, type, pairs, opts) {
    const res = {
      type, pairs, rowsA: dsA.rows.length, rowsB: dsB.rows.length,
      outRows: 0, matchedA: 0, matchedB: 0, unmatchedA: 0, unmatchedB: 0,
      dupKeysA: 0, dupKeysB: 0, warnings: [], missingPairs: []
    };
    if (type === 'cross') {
      res.outRows = res.rowsA * res.rowsB;
      if (res.outRows > 200000) res.warnings.push('خروجی Cross Join بسیار بزرگ خواهد شد (بیش از ۲۰۰ هزار ردیف).');
      else if (res.outRows > 10000) res.warnings.push('خروجی Cross Join بزرگ است؛ مطمئنید این نوع Join موردنظر شماست.');
      return res;
    }
    const pr = resolvePairs(dsA, dsB, pairs || []);
    if (!pr.length) {
      res.missingPairs.push('هیچ جفت‌کلیدی انتخاب نشده است.');
      return res;
    }
    const keyOfB = r => pr.map(p => normKey(r[p.b], opts));
    const keyOfA = r => pr.map(p => normKey(r[p.a], opts));
    const idx = new Map();
    const seenB = new Map();
    dsB.rows.forEach((r, ri) => {
      const parts = keyOfB(r);
      if (parts.every(x => x === null)) return; // ردیف با کلید کاملاً خالی
      const k = parts.join('\u0001');
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(ri);
      seenB.set(k, (seenB.get(k) || 0) + 1);
    });
    seenB.forEach(cnt => { if (cnt > 1) res.dupKeysB++; });
    const seenA = new Map();
    const matchedBIdx = new Set();
    const hitsForB = new Map();   /* هر ردیف B با چند ردیف A مطابق شده (برای Right Join) */
    dsA.rows.forEach(r => {
      const parts = keyOfA(r);
      const k = parts.join('\u0001');
      if (parts.every(x => x === null)) { res.unmatchedA++; return; }
      const hits = idx.get(k);
      seenA.set(k, (seenA.get(k) || 0) + 1);
      if (hits && hits.length) {
        res.matchedA++;
        hits.forEach(ri => { matchedBIdx.add(ri); hitsForB.set(ri, (hitsForB.get(ri) || 0) + 1); });
      } else res.unmatchedA++;
    });
    seenA.forEach(cnt => { if (cnt > 1) res.dupKeysA++; });
    const hitsTotal = Array.from(hitsForB.values()).reduce((s, x) => s + x, 0);
    res.matchedB = matchedBIdx.size;          /* تعداد ردیف متمایز B که حداقل یک مطابقت دارند */
    res.unmatchedB = res.rowsB - res.matchedB; /* شامل ردیف‌های با کلید Null هم می‌شود */
    /* outRows بر اساس نوع Join */
    if (type === 'inner') res.outRows = hitsTotal;
    else if (type === 'left') res.outRows = res.matchedA + res.unmatchedA;
    else if (type === 'right') res.outRows = hitsTotal + res.unmatchedB;
    else if (type === 'full') res.outRows = res.matchedA + res.unmatchedA + res.unmatchedB;

    /* هشدارها */
    if (res.dupKeysA > 0 || res.dupKeysB > 0) {
      res.warnings.push(`کلید تکراری شناسایی شد (در جدول ۱: ${Utils.faDig(res.dupKeysA)} مقدار تکراری، در جدول ۲: ${Utils.faDig(res.dupKeysB)}). این حالت «یک‌به‌چند/چندبه‌چند» است و می‌تواند تعداد ردیف‌های خروجی را افزایش دهد.`);
    }
    if (res.outRows > Math.max(res.rowsA, res.rowsB) * 2 && res.outRows > 100) {
      res.warnings.push(`تعداد ردیف خروجی (${Utils.fmtInt(res.outRows)}) به‌مراتب بیشتر از جدول‌های ورودی است.`);
    }
    /* ناسازگاری نوع کلیدها */
    pr.forEach(p => {
      const ta = dsA.columns[p.a] && dsA.columns[p.a].type, tb = dsB.columns[p.b] && dsB.columns[p.b].type;
      const simple = t => (t === 'number' || t === 'date') ? t : 'other';
      if (ta && tb && simple(ta) !== simple(tb)) {
        res.warnings.push(`نوع داده کلیدها متفاوت است: «${p.nameA}» (${Utils.typeFa(ta)}) با «${p.nameB}» (${Utils.typeFa(tb)}). مقایسه به‌صورت متنِ نرمال‌شده انجام می‌شود.`);
      }
    });
    return res;
  }

  /* ---------- اجرای Join ---------- */
  function join(dsA, dsB, type, pairs, opts) {
    if (!dsA || !dsB) throw new Error('هر دو جدول باید انتخاب شده باشند.');
    if (!JOIN_TYPES[type]) throw new Error('نوع Join نامعتبر است.');
    const sfx = (opts && opts.suffixB) || ' (جدول ۲)';
    const includeB = (opts && opts.includeB) || null;
    if (type === 'cross') return joinCross(dsA, dsB, sfx, includeB);
    const pr = resolvePairs(dsA, dsB, pairs);
    if (!pr.length) throw new Error('حداقل یک جفت‌کلید معتبر لازم است.');
    const { cols, colsB } = buildColumns(dsA, dsB, pr, sfx, includeB);
    const nA = colsA_count(cols, dsA);
    const nAll = cols.length;
    const rows = [];
    const stats = { matchedA: 0, matchedB: 0, unmatchedA: 0, unmatchedB: 0 };

    const idx = new Map();
    dsB.rows.forEach((r, ri) => {
      const parts = pr.map(p => normKey(r[p.b], opts));
      if (parts.every(x => x === null)) return;
      const k = parts.join('\u0001');
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(ri);
    });

    const pushRow = (aRow, bRow) => {
      const out = new Array(nAll).fill('');
      for (let c = 0; c < nA; c++) out[c] = aRow == null ? '' : (aRow[c] == null ? '' : aRow[c]);
      if (bRow) {
        for (let j = 0; j < colsB.length; j++) {
          const src = colsB[j].origIdx;
          out[nA + j] = bRow[src] == null ? '' : bRow[src];
        }
      }
      rows.push(out);
    };

    const matchedBSet = new Set();
    dsA.rows.forEach(aRow => {
      const parts = pr.map(p => normKey(aRow[p.a], opts));
      const k = parts.join('\u0001');
      const hits = parts.every(x => x === null) ? null : idx.get(k);
      if (hits && hits.length) {
        stats.matchedA++;
        hits.forEach(ri => { stats.matchedB++; matchedBSet.add(ri); pushRow(aRow, dsB.rows[ri]); });
      } else {
        stats.unmatchedA++;
        if (type === 'left' || type === 'full') pushRow(aRow, null);
      }
    });
    if (type === 'right' || type === 'full') {
      dsB.rows.forEach((bRow, ri) => {
        if (matchedBSet.has(ri)) return;
        stats.unmatchedB++;
        pushRow(null, bRow);
      });
    }

    /* بازمحاسبه نوع ستون‌ها و آمار خالی پس از Join */
    finalizeColumns(cols, rows);
    return {
      dataset: {
        columns: cols,
        rows,
        meta: {
          sourceNote: `${dsA.meta && dsA.meta.sourceNote ? dsA.meta.sourceNote : 'جدول ۱'} ⟕⟖ Join(${JOIN_TYPES[type].label}) ${dsB.meta && dsB.meta.sourceNote ? dsB.meta.sourceNote : 'جدول ۲'}`,
          rowCount: rows.length,
          colCount: cols.length,
          emptyCells: cols.reduce((s, c) => s + c.emptyCount, 0),
          dupEstimate: estimateDup(rows),
          sampledAt: new Date().toISOString(),
          join: { type, pairs: pairs.slice(), stats: Object.assign({}, stats), includeB: includeB ? includeB.slice() : null }
        }
      },
      stats
    };
  }

  function colsA_count(cols, dsA) { return dsA.columns.length; }

  function joinCross(dsA, dsB, sfx, includeB) {
    const pairs = [];
    const { cols, colsB } = buildColumns(dsA, dsB, pairs, sfx, includeB);
    const nA = dsA.columns.length;
    const rows = [];
    dsA.rows.forEach(a => {
      dsB.rows.forEach(b => {
        const out = new Array(cols.length).fill('');
        for (let c = 0; c < nA; c++) out[c] = a[c] == null ? '' : a[c];
        for (let j = 0; j < colsB.length; j++) out[nA + j] = b[colsB[j].origIdx] == null ? '' : b[colsB[j].origIdx];
        rows.push(out);
      });
    });
    finalizeColumns(cols, rows);
    return {
      dataset: {
        columns: cols, rows,
        meta: {
          sourceNote: 'Cross Join', rowCount: rows.length, colCount: cols.length,
          emptyCells: cols.reduce((s, c) => s + c.emptyCount, 0),
          dupEstimate: estimateDup(rows), sampledAt: new Date().toISOString(),
          join: { type: 'cross', pairs: [], stats: { rowsA: dsA.rows.length, rowsB: dsB.rows.length }, includeB: includeB ? includeB.slice() : null }
        }
      },
      stats: { outRows: rows.length }
    };
  }

  function finalizeColumns(cols, rows) {
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
  }

  function estimateDup(rows) {
    const sig = new Map();
    let dup = 0;
    rows.forEach(r => { const k = JSON.stringify(r); if (sig.has(k)) dup++; else sig.set(k, 1); });
    return dup;
  }

  return { JOIN_TYPES, preview, join, resolvePairs, includeBLabel };
})();

/* ═══════════════════════════════════════════════════════════
   تست‌های داخلی (وقتی به‌عنوان ماژول node اجرا شود)
   ═══════════════════════════════════════════════════════════ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { joinEngine };
}
