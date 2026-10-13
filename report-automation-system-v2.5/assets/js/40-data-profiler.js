/* ═══════════════════════════════════════════════════════════
   dataProfiler — مرکز بررسی کیفیت داده
   ۱۰ بررسی الزامی + نقشه سفر ۶ مرحله‌ای + امتیاز کیفیت شفاف
   ═══════════════════════════════════════════════════════════ */
'use strict';

const dataProfiler = (function () {

  const MAX_SAMPLES = 8;
  /* بازه منطقی تاریخ شمسی برای داده‌های کسب‌وکار (قابل تنظیم) */
  const DATE_RANGE = { minJy: 1340, maxJy: 1420 };

  const STAGES = [
    { id: 'structure', title: 'ساختار داده', checks: ['structural'] },
    { id: 'missing', title: 'مقادیر گمشده', checks: ['missing'] },
    { id: 'types', title: 'اعتبار نوع داده‌ها', checks: ['typeConsistency', 'invalidDates'] },
    { id: 'ranges', title: 'اعتبار مقادیر و محدوده‌ها', checks: ['numericRange', 'outliers'] },
    { id: 'consistency', title: 'سازگاری اطلاعات', checks: ['whitespace', 'categories', 'crossColumn'] },
    { id: 'final', title: 'مرور نهایی کیفیت', checks: ['duplicates', 'summary'] }
  ];

  const CHECK_DEFS = {
    structural: { name: 'خطاهای ساختاری', purpose: 'بررسی موجود بودن ستون‌های قابل استفاده، ردیف‌های خالی و سلامت کلی ساختار جدول داده.' },
    missing: { name: 'مقادیر گمشده یا خالی', purpose: 'شناسایی سلول‌های خالی در هر ستون که می‌توانند محاسبات و گزارش‌ها را منحرف کنند.' },
    typeConsistency: { name: 'ناسازگاری نوع داده‌ها', purpose: 'شناسایی مقادیری که نوع آن‌ها با نوع غالب ستون (عدد، تاریخ، متن و…) متفاوت است.' },
    invalidDates: { name: 'تاریخ‌های نامعتبر یا خارج از بازه', purpose: 'بررسی اعتبار تقویمی تاریخ‌ها (مثل ۱۴۰۳/۱۳/۰۵) و قرارگیری در بازه منطقی کسب‌وکار.' },
    numericRange: { name: 'مقادیر عددی غیرمجاز', purpose: 'شناسایی اعداد منفی در ستون‌های مبلغ/تعداد و مقادیر خارج از محدودیت‌های متعارف.' },
    outliers: { name: 'مقادیر پرت آماری', purpose: 'شناسایی مقادیر عددی غیرعادی با روش چارک (IQR)؛ مقدار پرت لزوماً خطا نیست و باید بازبینی شود.' },
    whitespace: { name: 'فاصله‌های اضافی و نویسه‌های ناسازگار', purpose: 'شناسایی فاصله در ابتدا/انتهای متن، فاصله‌های تکراری و نویسه‌های عربی به‌جای فارسی (ي/ك).' },
    categories: { name: 'دسته‌بندی‌های ناسازگار', purpose: 'شناسایی چند نگارش برای یک مقدار واحد (مثل «آنلاین» و «فروش آنلاین») در ستون‌های طبقه‌ای.' },
    crossColumn: { name: 'ناسازگاری منطقی بین ستون‌ها', purpose: 'بررسی قواعد بین‌ستونی مانند ترتیب تاریخ‌ها و سازگاری «تعداد × قیمت = مبلغ».' },
    duplicates: { name: 'رکوردهای تکراری', purpose: 'شناسایی رکوردهای کاملاً یکسان و کاندیداهای تکرار مبتنی بر ستون کلیدی.' }
  };

  /* ---------- ابزارهای داخلی ---------- */
  const isMoneyCol = (name) => /قیمت|مبلغ|هزینه|درآمد|فروش|تومان|ریال|cost|price|amount|revenue/i.test(name);
  const isQtyCol = (name) => /تعداد|count|qty|quantity/i.test(name);
  const isDateCol = (name, type) => type === 'date' || /تاریخ|date/i.test(name);

  function sev(pct, thresholds) {
    // thresholds: [high, medium, low] بر حسب درصد
    if (pct > thresholds[0]) return 'high';
    if (pct > thresholds[1]) return 'medium';
    if (pct > thresholds[2]) return 'low';
    return 'ok';
  }
  const pct = (n, d) => (d > 0 ? (n / d) * 100 : 0);

  function mkResult(id) {
    const def = CHECK_DEFS[id] || { name: id, purpose: '' };
    return {
      id, name: def.name, purpose: def.purpose,
      checkedCount: 0, issueCount: 0, issuePct: 0,
      samples: [], severity: 'ok', suggestion: '', status: 'pending',
      extra: {}
    };
  }

  /* ---------- بررسی‌ها ---------- */

  function checkStructural(ds) {
    const r = mkResult('structural');
    const cols = ds.columns, rows = ds.rows;
    r.checkedCount = rows.length;
    const emptyCols = cols.filter(c => c.emptyCount === rows.length).map(c => c.name);
    const sparseRows = [];
    rows.forEach((row, i) => {
      let empty = 0;
      row.forEach(v => { if (String(v).trim() === '') empty++; });
      if (empty / cols.length >= 0.6) sparseRows.push(i + 1);
    });
    r.issueCount = emptyCols.length + sparseRows.length;
    r.extra = { emptyCols, sparseRows: sparseRows.slice(0, MAX_SAMPLES), sparseCount: sparseRows.length };
    r.samples = emptyCols.map(cn => ({ row: '—', col: cn, value: 'کل ستون خالی', detail: 'این ستون هیچ داده‌ای ندارد' }))
      .concat(sparseRows.slice(0, 4).map(rn => ({ row: rn, col: 'کل ردیف', value: '>', detail: 'بیش از ۶۰٪ سلول‌های این ردیف خالی است' })));
    if (emptyCols.length) {
      r.severity = 'high';
      r.suggestion = 'ستون‌های کاملاً خالی را پیش از تحلیل حذف کنید یا منبع داده را اصلاح کنید.';
    } else if (sparseRows.length) {
      r.severity = 'medium';
      r.suggestion = 'ردیف‌های تقریباً خالی احتمالاً رکورد ناقص‌اند؛ در مرحله پاک‌سازی بررسی و در صورت لزوم حذف شوند.';
    } else {
      r.suggestion = 'ساختار جدول سالم است.';
    }
    return r;
  }

  function checkMissing(ds) {
    const r = mkResult('missing');
    const rows = ds.rows, cols = ds.columns;
    const perCol = cols.map((c, ci) => ({ name: c.name, count: rows.filter(row => String(row[ci] == null ? '' : row[ci]).trim() === '').length }));
    const totalMissing = perCol.reduce((s, x) => s + x.count, 0);
    const rowsAffected = rows.filter(row => row.some(v => String(v == null ? '' : v).trim() === '')).length;
    r.checkedCount = rows.length;
    r.issueCount = rowsAffected;
    r.issuePct = pct(rowsAffected, rows.length);
    r.extra = { totalCells: rows.length * cols.length, totalMissing, perCol: perCol.filter(p => p.count > 0).sort((a, b) => b.count - a.count) };
    const samples = [];
    for (let i = 0; i < rows.length && samples.length < MAX_SAMPLES; i++) {
      for (let c = 0; c < cols.length; c++) {
        if (String(rows[i][c] == null ? '' : rows[i][c]).trim() === '') {
          samples.push({ row: i + 1, col: cols[c].name, value: 'خالی', detail: 'سلول خالی' });
          break;
        }
      }
    }
    r.samples = samples;
    r.severity = sev(r.issuePct, [20, 5, 0]);
    if (totalMissing === 0) r.suggestion = 'هیچ مقدار گمشده‌ای وجود ندارد.';
    else r.suggestion = `در مجموع ${Utils.fmtInt(totalMissing)} سلول خالی است. در مرحله پاک‌سازی می‌توانید برای هر ستون روش اصلاح مناسب (حذف ردیف، جایگزینی با میانگین/میانه/مقدار ثابت یا رها کردن) را انتخاب کنید.`;
    return r;
  }

  function checkTypeConsistency(ds) {
    const r = mkResult('typeConsistency');
    const rows = ds.rows, cols = ds.columns;
    const perCol = [];
    let issueTotal = 0;
    const samples = [];
    cols.forEach((c, ci) => {
      const counts = {};
      let nonEmpty = 0;
      rows.forEach(row => {
        const t = Utils.classifyValue(row[ci]);
        if (t === 'empty') return;
        nonEmpty++;
        counts[t] = (counts[t] || 0) + 1;
      });
      if (nonEmpty === 0) return;
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const dominant = entries[0][0];
      const dominantCount = entries[0][1];
      const incompat = nonEmpty - dominantCount;
      if (incompat > 0) {
        perCol.push({ name: c.name, dominant, dominantCount, incompat, nonEmpty });
        issueTotal += incompat;
        let added = 0;
        for (let i = 0; i < rows.length && added < 3; i++) {
          const t = Utils.classifyValue(rows[i][ci]);
          if (t !== 'empty' && t !== dominant) {
            samples.push({ row: i + 1, col: c.name, value: rows[i][ci], detail: `نوع تشخیص‌شده «${typeFa(t)}» در ستونی با نوع غالب «${typeFa(dominant)}»` });
            added++;
          }
        }
      }
    });
    const cells = rows.length * cols.length;
    r.checkedCount = rows.length;
    r.issueCount = issueTotal;
    r.issuePct = pct(issueTotal, cells);
    r.samples = samples.slice(0, MAX_SAMPLES);
    r.extra = { perCol };
    r.severity = perCol.some(p => p.incompat / p.nonEmpty > 0.25) ? 'high' : sev(pct(issueTotal, cells), [3, 0.5, 0]);
    r.suggestion = issueTotal === 0
      ? 'نوع داده‌ها در ستون‌ها سازگار است.'
      : 'در مرحله پاک‌سازی می‌توانید نوع هر ستون را یکسان‌سازی کنید؛ مقادیر ناسازگار یا تبدیل یا به مقدار خالی تبدیل می‌شوند (با انتخاب شما).';
    return r;
  }

  function typeFa(t) {
    return { number: 'عدد', date: 'تاریخ', boolean: 'منطقی', text: 'متن', mixed: 'مختلط', identifier: 'شناسه', empty: 'خالی' }[t] || t;
  }

  function checkInvalidDates(ds) {
    const r = mkResult('invalidDates');
    const rows = ds.rows, cols = ds.columns;
    const samples = [];
    let checked = 0, invalid = 0, outOfRange = 0;
    const perCol = [];
    cols.forEach((c, ci) => {
      if (!isDateCol(c.name, c.type)) return;
      let colChecked = 0, colBad = 0, colRange = 0;
      rows.forEach((row, ri) => {
        const v = row[ci];
        if (String(v == null ? '' : v).trim() === '') return;
        const p = Utils.parseDateValue(v);
        if (!p.isDate) return; // غیرتاریخ — در بررسی نوع‌ها دیده می‌شود
        colChecked++;
        if (!p.valid) {
          colBad++;
          if (samples.length < MAX_SAMPLES) samples.push({ row: ri + 1, col: c.name, value: v, detail: 'تاریخ از نظر تقویمی نامعتبر است' });
        } else if (p.kind === 'jalali' && (p.jy < DATE_RANGE.minJy || p.jy > DATE_RANGE.maxJy)) {
          colRange++;
          if (samples.length < MAX_SAMPLES) samples.push({ row: ri + 1, col: c.name, value: v, detail: `سال خارج از بازه منطقی (${Utils.faDig(DATE_RANGE.minJy)} تا ${Utils.faDig(DATE_RANGE.maxJy)})` });
        }
      });
      if (colChecked) {
        perCol.push({ name: c.name, checked: colChecked, invalid: colBad, outOfRange: colRange });
        checked += colChecked; invalid += colBad; outOfRange += colRange;
      }
    });
    r.checkedCount = checked;
    r.issueCount = invalid + outOfRange;
    r.issuePct = pct(invalid + outOfRange, checked);
    r.samples = samples;
    r.extra = { perCol, range: DATE_RANGE };
    r.severity = sev(r.issuePct, [5, 0, 0]) === 'ok' && r.issueCount === 0 ? 'ok' : sev(r.issuePct, [5, 0, 0]);
    r.suggestion = r.issueCount === 0
      ? 'همه تاریخ‌ها از نظر تقویمی و بازه معتبرند.'
      : 'در پاک‌سازی می‌توانید تاریخ‌ها را به قالب یکدست شمسی تبدیل کنید؛ تاریخ‌های نامعتبر به «خالی» تبدیل و برای تصمیم شما گزارش می‌شوند.';
    return r;
  }

  function checkNumericRange(ds) {
    const r = mkResult('numericRange');
    const rows = ds.rows, cols = ds.columns;
    let checked = 0, bad = 0;
    const perCol = [];
    const samples = [];
    cols.forEach((c, ci) => {
      if (c.type !== 'number' && c.type !== 'mixed') return;
      const money = isMoneyCol(c.name) || isQtyCol(c.name);
      let colChecked = 0, colBad = 0;
      rows.forEach((row, ri) => {
        const raw = row[ci];
        if (String(raw == null ? '' : raw).trim() === '') return;
        const n = Utils.parseNum(raw);
        if (n === null) return;
        colChecked++;
        if (money && n < 0) {
          colBad++;
          if (samples.length < MAX_SAMPLES) samples.push({ row: ri + 1, col: c.name, value: raw, detail: 'مقدار منفی در ستون مبلغ/تعداد مجاز نیست' });
        }
      });
      if (colChecked) { perCol.push({ name: c.name, checked: colChecked, invalid: colBad }); checked += colChecked; bad += colBad; }
    });
    r.checkedCount = checked;
    r.issueCount = bad;
    r.issuePct = pct(bad, checked);
    r.samples = samples;
    r.extra = { perCol };
    r.severity = bad > 0 ? 'high' : 'ok';
    r.suggestion = bad === 0
      ? 'مقدار منفی غیرمجازی یافت نشد.'
      : 'مقادیر منفی در ستون‌های مبلغ/تعداد معمولاً خطای ثبت هستند؛ در پاک‌سازی می‌توانید آن‌ها را به «خالی» تبدیل یا رکورد را حذف کنید.';
    return r;
  }

  function checkOutliers(ds) {
    const r = mkResult('outliers');
    const rows = ds.rows, cols = ds.columns;
    const perCol = [];
    const samples = [];
    let checked = 0, out = 0;
    cols.forEach((c, ci) => {
      if (c.type !== 'number' && c.type !== 'mixed') return;
      const nums = [];
      rows.forEach(row => {
        const n = Utils.parseNum(row[ci]);
        if (n !== null) nums.push(n);
      });
      if (nums.length < 8) return; // تحلیل پرت برای داده کم معنادار نیست
      const sorted = nums.slice().sort((a, b) => a - b);
      const q = (p) => {
        const idx = p * (sorted.length - 1);
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
      };
      const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
      if (iqr === 0) return;
      const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
      const outs = [];
      rows.forEach((row, ri) => {
        const n = Utils.parseNum(row[ci]);
        if (n !== null && (n < loF || n > hiF)) {
          outs.push({ row: ri + 1, value: n });
          if (samples.length < MAX_SAMPLES) samples.push({ row: ri + 1, col: c.name, value: row[ci], detail: `خارج از محدوده چارکی [${Utils.nf(loF)} تا ${Utils.nf(hiF)}]` });
        }
      });
      if (outs.length) {
        perCol.push({ name: c.name, count: outs.length, lower: loF, upper: hiF });
        checked += nums.length; out += outs.length;
      }
    });
    r.checkedCount = checked;
    r.issueCount = out;
    r.issuePct = pct(out, checked);
    r.samples = samples;
    r.extra = { perCol };
    r.severity = sev(r.issuePct, [5, 1, 0]);
    r.suggestion = out === 0
      ? 'مقدار پرت آماری قابل توجهی یافت نشد.'
      : 'مقادیر پرت لزوماً خطا نیستند؛ اگر ثبت اشتباه باشند در پاک‌سازی می‌توانید آن‌ها را مدیریت کنید. تفسیر مدیریتی را با احتیاط انجام دهید.';
    return r;
  }

  function checkWhitespace(ds) {
    const r = mkResult('whitespace');
    const rows = ds.rows, cols = ds.columns;
    const samples = [];
    let checked = 0, bad = 0;
    const perCol = [];
    cols.forEach((c, ci) => {
      if (c.type === 'number' && c.type !== 'mixed') { /* ستون عددی هم می‌تواند فاصله داشته باشد */ }
      let colBad = 0;
      rows.forEach((row, ri) => {
        const v = row[ci];
        if (typeof v !== 'string' || v.trim() === '') return;
        checked++;
        const hasLeadingTrailing = v !== v.trim();
        const hasDouble = /\S\s{2,}\S/.test(v);
        const hasArabic = /[يك]/.test(v);
        if (hasLeadingTrailing || hasDouble || hasArabic) {
          colBad++;
          if (samples.length < MAX_SAMPLES) {
            let d = hasLeadingTrailing ? 'فاصله در ابتدا/انتهای مقدار' : hasDouble ? 'فاصله تکراری داخل متن' : 'نویسه عربی (ي/ك) به‌جای فارسی (ی/ک)';
            samples.push({ row: ri + 1, col: c.name, value: JSON.stringify(v), detail: d });
          }
        }
      });
      if (colBad) perCol.push({ name: c.name, count: colBad });
      bad += colBad;
    });
    r.checkedCount = checked;
    r.issueCount = bad;
    r.issuePct = pct(bad, checked);
    r.samples = samples;
    r.extra = { perCol };
    r.severity = sev(r.issuePct, [10, 2, 0]);
    r.suggestion = bad === 0
      ? 'مشکل فاصله یا نویسه ناسازگاری یافت نشد.'
      : 'این مشکل در گروه‌بندی و جمع‌بندی باعث جدا افتادن مقادیر مشابه می‌شود؛ در پاک‌سازی با یک کلیک اصلاح می‌شود.';
    return r;
  }

  function checkCategories(ds) {
    const r = mkResult('categories');
    const rows = ds.rows, cols = ds.columns;
    const samples = [];
    const perCol = [];
    let affectedRows = 0;
    cols.forEach((c, ci) => {
      if (c.type !== 'text' && c.type !== 'mixed') return;
      const groups = new Map();
      rows.forEach((row, ri) => {
        const v = row[ci];
        if (String(v == null ? '' : v).trim() === '') return;
        const key = Utils.normalizeFa(v);
        if (!groups.has(key)) groups.set(key, new Map());
        const g = groups.get(key);
        g.set(v, (g.get(v) || 0) + 1);
      });
      if (groups.size === 0 || groups.size > Math.max(30, rows.length * 0.6)) return; // ستون شناسه‌ای/متنی آزاد
      const merged = [];
      groups.forEach((variants, key) => {
        if (variants.size > 1) merged.push({ canonical: [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0], variants: [...variants.keys()] });
      });
      if (merged.length) {
        let cnt = 0;
        rows.forEach(row => {
          const v = row[ci];
          if (String(v == null ? '' : v).trim() === '') return;
          if (merged.some(m => m.variants.includes(v) && v !== m.canonical)) cnt++;
        });
        affectedRows += cnt;
        perCol.push({ name: c.name, groups: merged, affectedRows: cnt });
        merged.slice(0, 3).forEach(m => {
          if (samples.length < MAX_SAMPLES) samples.push({
            row: '—', col: c.name, value: m.variants.map(x => `«${x}»`).join(' , '),
            detail: `نگارش استاندارد پیشنهادی: «${m.canonical}»`
          });
        });
      }
    });
    r.checkedCount = rows.length;
    r.issueCount = affectedRows;
    r.issuePct = pct(affectedRows, rows.length);
    r.samples = samples;
    r.extra = { perCol };
    r.severity = affectedRows > 0 ? 'medium' : 'ok';
    r.suggestion = affectedRows === 0
      ? 'دسته‌بندی‌ها یکدست هستند.'
      : 'نگاشت پیشنهادی یکسان‌سازی در مرحله پاک‌سازی آماده شده است؛ می‌توانید آن را بازبینی و اعمال کنید.';
    return r;
  }

  function checkCrossColumn(ds) {
    const r = mkResult('crossColumn');
    const rows = ds.rows, cols = ds.columns;
    const samples = [];
    let checked = 0, bad = 0;
    const rules = [];

    // قاعده ۱: جفت تاریخ‌های شروع/پایان
    const startCols = cols.filter(c => /شروع|ورود|از تاریخ|سفارش|خرید/i.test(c.name) && isDateCol(c.name, c.type));
    const endCols = cols.filter(c => /پایان|خروج|تا تاریخ|تحویل|ارسال/i.test(c.name) && isDateCol(c.name, c.type));
    startCols.forEach(sc => {
      endCols.forEach(ec => {
        if (sc.name === ec.name) return;
        rows.forEach((row, ri) => {
          const p1 = Utils.parseDateValue(row[cols.indexOf(sc)]);
          const p2 = Utils.parseDateValue(row[cols.indexOf(ec)]);
          if (p1.valid && p2.valid) {
            checked++;
            if (p2.serial < p1.serial) {
              bad++;
              if (samples.length < MAX_SAMPLES) samples.push({ row: ri + 1, col: `${ec.name}`, value: `${row[cols.indexOf(ec)]}`, detail: `«${ec.name}» قبل از «${sc.name}» است` });
            }
          }
        });
        if (bad) rules.push(`ترتیب «${sc.name}» و «${ec.name}» بررسی شد`);
      });
    });

    // قاعده ۲: مبلغ کل ≈ تعداد × قیمت − تخفیف
    const qi = cols.findIndex(c => isQtyCol(c.name));
    const pi = cols.findIndex(c => /قیمت واحد/i.test(c.name));
    const di = cols.findIndex(c => /تخفیف/i.test(c.name));
    const ti = cols.findIndex(c => /مبلغ کل|مبلغ نهایی|جمع کل/i.test(c.name));
    if (qi >= 0 && pi >= 0 && ti >= 0) {
      rows.forEach((row, ri) => {
        const q = Utils.parseNum(row[qi]);
        const p = Utils.parseNum(row[pi]);
        const t = Utils.parseNum(row[ti]);
        const d = di >= 0 ? (Utils.parseNum(row[di]) || 0) : 0;
        if (q === null || p === null || t === null) return;
        checked++;
        const expected = q * p - d;
        const tol = Math.max(2, Math.abs(expected) * 0.005);
        if (Math.abs(t - expected) > tol) {
          bad++;
          if (samples.length < MAX_SAMPLES) samples.push({ row: ri + 1, col: cols[ti].name, value: Utils.nf(t), detail: `مورد انتظار: ${Utils.nf(expected)} (${Utils.fmtInt(q)} × ${Utils.nf(p)} − ${Utils.nf(d)})` });
        }
      });
      rules.push('رابطه «مبلغ کل = تعداد × قیمت واحد − تخفیف» بررسی شد');
    }

    r.checkedCount = checked;
    r.issueCount = bad;
    r.issuePct = pct(bad, checked);
    r.samples = samples;
    r.extra = { rules };
    r.severity = bad > 0 ? 'high' : 'ok';
    r.suggestion = bad === 0
      ? (rules.length ? 'قواعد بین‌ستونی قابل بررسی، بدون نقض هستند.' : 'ستونی برای قواعد بین‌ستونی شناسایی نشد. این بررسی هنگام وجود ستون‌های «تعداد/قیمت/مبلغ» یا «تاریخ شروع/پایان» فعال می‌شود.')
      : 'نقض قواعد منطقی باعث خطا در جمع‌های گزارش می‌شود؛ در پاک‌سازی رکوردهای مشکل‌دار را علامت‌گذاری یا حذف کنید.';
    return r;
  }

  function checkDuplicates(ds) {
    const r = mkResult('duplicates');
    const rows = ds.rows, cols = ds.columns;
    const seen = new Map();
    rows.forEach((row, i) => {
      const key = JSON.stringify(row.map(v => typeof v === 'string' ? v.trim() : v));
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(i + 1);
    });
    const groups = [...seen.values()].filter(g => g.length > 1);
    const affected = groups.reduce((s, g) => s + g.length, 0);
    const samples = groups.slice(0, 5).map((g, i) => ({
      row: g.join('، '), col: 'کل ردیف', value: `گروه ${Utils.faDig(i + 1)}`,
      detail: `${Utils.fmtInt(g.length)} رکورد کاملاً یکسان (شماره ردیف‌ها)`
    }));
    // کاندید ستون کلیدی
    const keyCands = [];
    cols.forEach((c, ci) => {
      if (c.type === 'text' && (c.name.length > 30)) return;
      const vals = new Map();
      rows.forEach(row => {
        const v = String(row[ci] == null ? '' : row[ci]).trim();
        if (!v) return;
        vals.set(v, (vals.get(v) || 0) + 1);
      });
      const reps = [...vals.values()].filter(n => n > 1).length;
      if (reps > 0 && vals.size < rows.length) keyCands.push({ name: c.name, repeatedValues: reps, distinct: vals.size });
    });
    keyCands.sort((a, b) => b.repeatedValues - a.repeatedValues);
    r.checkedCount = rows.length;
    r.issueCount = affected;
    r.issuePct = pct(affected, rows.length);
    r.samples = samples;
    r.extra = { exactGroups: groups.length, keyCandidates: keyCands.slice(0, 6) };
    r.severity = sev(r.issuePct, [10, 0, 0]);
    r.suggestion = groups.length === 0
      ? 'رکورد کاملاً تکراری‌ای یافت نشد. اگر تکرار بر اساس ستون خاصی تعریف می‌شود، در مرحله پاک‌سازی ستون‌های کلیدی را انتخاب کنید.'
      : 'در مرحله پاک‌سازی، بخش «حذف رکوردهای تکراری» امکان مشاهده گروه‌ها، انتخاب ستون کلیدی و سیاست نگهداری رکورد را دارد.';
    return r;
  }

  /* ---------- اجرای همه بررسی‌ها ---------- */
  async function runAll(ds, onStage) {
    const checks = {};
    const stageStatus = {};

    const steps = [
      ['structure', () => { checks.structural = checkStructural(ds); }],
      ['missing', () => { checks.missing = checkMissing(ds); }],
      ['types', () => { checks.typeConsistency = checkTypeConsistency(ds); checks.invalidDates = checkInvalidDates(ds); }],
      ['ranges', () => { checks.numericRange = checkNumericRange(ds); checks.outliers = checkOutliers(ds); }],
      ['consistency', () => { checks.whitespace = checkWhitespace(ds); checks.categories = checkCategories(ds); checks.crossColumn = checkCrossColumn(ds); }],
      ['final', () => { checks.duplicates = checkDuplicates(ds); }]
    ];

    for (let i = 0; i < steps.length; i++) {
      const [sid, fn] = steps[i];
      stageStatus[sid] = 'running';
      if (onStage) onStage(i, sid, 'running');
      await new Promise(r => setTimeout(r, 120)); // برای نمایش جریان کار به کاربر
      try { fn(); } catch (err) { console.error('check error', sid, err); }
      const stageChecks = STAGES.find(s => s.id === sid).checks.map(cid => checks[cid]).filter(Boolean);
      const hasIssue = stageChecks.some(c => c.issueCount > 0);
      const hasError = stageChecks.some(c => c.severity === 'high');
      stageStatus[sid] = hasError ? 'error' : hasIssue ? 'warn' : 'ok';
      if (onStage) onStage(i, sid, stageStatus[sid]);
    }

    // امتیاز شفاف: کسر درصدی + جریمه ثابت بر اساس شدت هر بررسی
    const weights = {
      missing: 0.18, duplicates: 0.18, typeConsistency: 0.14, invalidDates: 0.12,
      numericRange: 0.10, categories: 0.10, crossColumn: 0.08, structural: 0.06, outliers: 0.04, whitespace: 0.04
    };
    const sevFlat = { high: 50, medium: 15, low: 5, ok: 0 }; // جریمه ثابت (از ۱۰۰) بر اساس شدت
    const issuePct = {};
    let deduction = 0;
    Object.keys(weights).forEach(k => {
      const c = checks[k];
      const p = c ? Math.min(100, c.issuePct) : 0;
      issuePct[k] = p;
      if (c) deduction += weights[k] * p + weights[k] * (sevFlat[c.severity] || 0);
    });
    const score = Math.max(0, Math.round(100 - deduction));
    const grade = score >= 90 ? 'عالی' : score >= 75 ? 'خوب' : score >= 60 ? 'قابل قبول با اصلاح' : 'ضعیف';

    // وضعیت نهایی
    if (checks.summary) checks.summary.status = 'done';

    return {
      ranAt: new Date().toISOString(),
      datasetMeta: ds.meta,
      checks,
      stages: stageStatus,
      score, grade,
      scoreMeta: {
        formula: 'امتیاز = ۱۰۰ − Σ(وزن هر بررسی × درصد رکوردهای درگیر + جریمه ثابت بر اساس شدت مشکل: بحرانی ۵۰٪ وزن، هشدار ۱۵٪، جزئی ۵٪)',
        weights, issuePct,
        note: 'این امتیاز یک شاخص راهنمای داخلی برای اولویت‌بندی پاک‌سازی است، نه استاندارد رسمی سنجش کیفیت. وزن‌ها بر اساس تأثیر هر نوع خطا بر صحت گزارش‌های مدیریتی تنظیم شده‌اند و وجود حتی یک مشکل بحرانی، امتیاز را به‌طور محسوس کاهش می‌دهد.'
      }
    };
  }

  return { STAGES, CHECK_DEFS, runAll, DATE_RANGE };
})();
