/* ═══════════════════════════════════════════════════════════
   dataImporter — ورود داده از فایل Excel، CSV، لینک Google Sheets و چسباندن متن
   تمام پردازش‌ها محلی و در مرورگر انجام می‌شود.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const dataImporter = (function () {
  const { esc } = Utils;

  const LIMITS = {
    maxExcelMB: 12,
    maxCsvMB: 25,
    warnRows: 30000
  };

  /* ---------- اعتبارسنجی فایل ---------- */
  function validateFile(file) {
    if (!file) throw new Error('هیچ فایلی انتخاب نشده است.');
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      throw new Error(`فرمت «.${esc(ext)}» پشتیبانی نمی‌شود. فرمت‌های مجاز: xlsx و csv`);
    }
    const mb = file.size / (1024 * 1024);
    const limit = ext === 'csv' ? LIMITS.maxCsvMB : LIMITS.maxExcelMB;
    if (mb > limit) throw new Error(`حجم فایل (${Utils.fmtPct ? '' : ''}${mb.toFixed(1)} مگابایت) از محدودیت ${limit} مگابایت بیشتر است.`);
    return { ext, mb };
  }

  /* ---------- ساخت مجموعه داده از ماتریس ---------- */
  function buildDataset(matrix, sourceNote) {
    if (!matrix || matrix.length === 0) throw new Error('منبع داده خالی است و هیچ ردیفی برای خواندن وجود ندارد.');
    // پیدا کردن اولین ردیف دارای حداقل ۲ سلول پر به‌عنوان سرستون
    let headerIdx = 0;
    for (let i = 0; i < Math.min(matrix.length, 15); i++) {
      const filled = (matrix[i] || []).filter(c => String(c == null ? '' : c).trim() !== '').length;
      if (filled >= 2) { headerIdx = i; break; }
    }
    const header = matrix[headerIdx] || [];
    const colNames = [];
    const seen = {};
    header.forEach((h, i) => {
      let name = String(h == null ? '' : h).trim();
      if (name === '') name = `ستون ${Utils.faDig(i + 1)}`;
      if (seen[name] != null) { seen[name]++; name = `${name} (${Utils.faDig(seen[name] + 1)})`; }
      else seen[name] = 0;
      colNames.push(name);
    });
    if (colNames.length === 0) throw new Error('هیچ ستونی شناسایی نشد؛ ساختار فایل معتبر نیست.');

    const bodyRows = matrix.slice(headerIdx + 1).filter(r => (r || []).some(c => String(c == null ? '' : c).trim() !== ''));
    if (bodyRows.length === 0) throw new Error('پس از ردیف سرستون، هیچ داده‌ای یافت نشد.');

    // نرمال‌سازی سلول‌ها: تاریخ Excel → رشته ISO
    const rows = bodyRows.map(r => {
      const out = [];
      for (let c = 0; c < colNames.length; c++) {
        let v = r == null ? '' : r[c];
        if (v instanceof Date && !isNaN(v)) {
          v = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
        } else if (v === null || v === undefined) v = '';
        else v = String(v);
        out.push(v);
      }
      return out;
    });

    // استنتاج نوع ستون‌ها
    const columns = colNames.map((name, ci) => {
      const counts = { number: 0, date: 0, boolean: 0, text: 0, empty: 0 };
      let nonEmpty = 0;
      for (const r of rows) {
        const t = Utils.classifyValue(r[ci]);
        if (t === 'empty') counts.empty++;
        else { nonEmpty++; counts[t]++; }
      }
      let type = 'text';
      if (nonEmpty > 0) {
        const top = Object.entries(counts).filter(([k]) => k !== 'empty').sort((a, b) => b[1] - a[1])[0];
        type = (top[1] / nonEmpty >= 0.7) ? top[0] : 'mixed';
      }
      return { name, type, emptyCount: counts.empty };
    });

    // آمار اولیه
    let emptyCells = 0;
    columns.forEach(c => emptyCells += c.emptyCount);
    const sig = new Map();
    let dupCount = 0;
    for (const r of rows) {
      const k = JSON.stringify(r);
      if (sig.has(k)) dupCount++;
      else sig.set(k, 1);
    }

    return {
      columns,
      rows,
      meta: {
        sourceNote: sourceNote || '',
        rowCount: rows.length,
        colCount: colNames.length,
        emptyCells,
        dupEstimate: dupCount,
        sampledAt: new Date().toISOString()
      }
    };
  }

  /* ---------- خواندن فایل CSV ---------- */
  function readCsvFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('خطا در خواندن فایل از دیسک.'));
      reader.onload = () => {
        let buf = reader.result;
        let text = '';
        try {
          text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
          const bad = (text.match(/\uFFFD/g) || []).length;
          // اگر تعداد نویسه‌های خراب زیاد بود، احتمالاً کدگذاری ویندوز-۱۲۵۶ است
          if (bad > text.length * 0.01) {
            try { text = new TextDecoder('windows-1256').decode(buf); } catch (e) { /* از همان UTF-8 استفاده می‌شود */ }
          }
        } catch (e) {
          reject(new Error('کدگذاری فایل قابل تشخیص نبود. فایل را با کدگذاری UTF-8 ذخیره کنید.'));
          return;
        }
        if (!text.trim()) { reject(new Error('فایل CSV خالی است.')); return; }
        try {
          const parsed = Utils.parseCSV(text);
          if (parsed.rows.length < 2) { reject(new Error('فایل CSV باید حداقل شامل یک ردیف سرستون و یک ردیف داده باشد.')); return; }
          resolve(buildDataset(parsed.rows, `فایل CSV: ${file.name}`));
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /* ---------- خواندن فایل Excel ---------- */
  function readExcelFile(file) {
    if (typeof XLSX === 'undefined') {
      throw new Error('کتابخانه خواندن Excel بارگذاری نشده است. برای اولین بارگیری کتابخانه به اینترنت نیاز است یا نسخه محلی vendor/xlsx.full.min.js باید کنار برنامه باشد.');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('خطا در خواندن فایل از دیسک.'));
      reader.onload = () => {
        try {
          const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
          const sheets = wb.SheetNames || [];
          if (!sheets.length) { reject(new Error('فایل Excel هیچ شیتی ندارد.')); return; }
          resolve({ wb, sheets, fileName: file.name });
        } catch (err) {
          reject(new Error('فایل Excel قابل خواندن نیست؛ ممکن است خراب یا رمزگذاری‌شده باشد. (' + err.message + ')'));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function extractSheet(wb, sheetName, fileName) {
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`شیت «${sheetName}» در فایل یافت نشد.`);
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
    if (!matrix.length) throw new Error(`شیت «${sheetName}» خالی است.`);
    return buildDataset(matrix, `فایل Excel: ${fileName} — شیت: ${sheetName}`);
  }

  /* ---------- ورودی اصلی فایل ---------- */
  async function importFile(file, sheetName) {
    const info = validateFile(file);
    if (info.ext === 'csv') {
      const ds = await readCsvFile(file);
      checkRowWarn(ds);
      return { dataset: ds, workbook: null, sheets: null };
    }
    const opened = await readExcelFile(file);
    const target = sheetName || opened.sheets[0];
    const ds = extractSheet(opened.wb, target, opened.fileName);
    checkRowWarn(ds);
    return { dataset: ds, workbook: opened.wb, sheets: opened.sheets, activeSheet: target };
  }

  function checkRowWarn(ds) {
    if (ds.rows.length > LIMITS.warnRows) {
      UIKit.toast('warning', 'حجم داده زیاد است', `${Utils.fmtInt(ds.rows.length)} ردیف وارد شد. پردازش ممکن است در مرورگر کند شود.`);
    }
  }

  /* ---------- Google Sheets (فقط لینک عمومی) ---------- */
  function buildGsCsvUrl(input) {
    const url = String(input || '').trim();
    if (!url) throw new Error('لینک Google Sheets را وارد کنید.');
    // لینک منتشرشده (Publish to web)
    let m = url.match(/docs\.google\.com\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\/pub[^?]*\?(.*)/);
    if (m) {
      const params = new URLSearchParams(m[2]);
      params.set('output', 'csv');
      return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?${params.toString()}`;
    }
    // لینک عادی /gviz/
    m = url.match(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    if (m) {
      const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
      const gid = gidMatch ? gidMatch[1] : '0';
      return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&gid=${gid}`;
    }
    throw new Error('لینک واردشده شبیه لینک Google Sheets نیست. نمونه صحیح: https://docs.google.com/spreadsheets/d/…');
  }

  async function importGSheet(url) {
    const csvUrl = buildGsCsvUrl(url);
    let resp;
    try {
      resp = await fetch(csvUrl, { redirect: 'follow' });
    } catch (err) {
      throw new Error('دریافت داده از Google Sheets ناموفق بود. دسترسی اینترنت و عمومی بودن شیت را بررسی کنید. (دسترسی خصوصی در فاز دوم با Google Apps Script پشتیبانی می‌شود)');
    }
    if (!resp.ok) {
      throw new Error(`سرور Google پاسخ ${resp.status} داد. اگر شیت خصوصی است، آن را «منتشرشده برای وب» کنید یا در فاز دوم از اتصال امن Apps Script استفاده کنید.`);
    }
    const text = await resp.text();
    if (text.trim().startsWith('<')) {
      throw new Error('پاسخ دریافتی صفحه HTML بود نه داده CSV؛ احتمالاً شیت عمومی نیست. گزینه «اشتراک‌گذاری → هر کسی که لینک دارد» یا «File → Share → Publish to web» را فعال کنید.');
    }
    if (!text.trim()) throw new Error('شیت Google خالی است یا دسترسی به داده‌ها وجود ندارد.');
    const parsed = Utils.parseCSV(text);
    if (parsed.rows.length < 2) throw new Error('شیت Google باید حداقل یک ردیف سرستون و یک ردیف داده داشته باشد.');
    const ds = buildDataset(parsed.rows, 'برگه گوگل‌شیت (لینک عمومی)');
    checkRowWarn(ds);
    return { dataset: ds, sheets: null };
  }

  /* ---------- چسباندن متن (CSV/TSV) ---------- */
  function importPasted(text, name) {
    if (!text || !text.trim()) throw new Error('متنی برای پردازش وارد نشده است.');
    const delim = text.includes('\t') && !text.includes(',') ? '\t' : undefined;
    const parsed = Utils.parseCSV(text.trim(), delim);
    if (parsed.rows.length < 2) throw new Error('متن چسبانده‌شده باید حداقل یک ردیف سرستون و یک ردیف داده داشته باشد.');
    const ds = buildDataset(parsed.rows, name || 'داده چسبانده‌شده');
    checkRowWarn(ds);
    return { dataset: ds, sheets: null };
  }

  /* ═══════════ ستون‌های محاسباتی استخراج‌شده از داده ═══════════
     نرم‌افزار از ستون‌های موجود، ستون‌های مشتق پیشنهاد می‌دهد:
     • تاریخ → سال، ماه، نام ماه، روز، روز هفته، آخر هفته، فصل
     • (تعداد × قیمت واحد) → مبلغ فروش
     کاربر هر چندتا که بخواهد را انتخاب و در گزارش استفاده می‌کند. */
  function proposeDerived(dataset) {
    const out = [];
    if (!dataset || !dataset.columns) return out;
    dataset.columns.forEach(c => {
      if (c.type === 'date') {
        out.push({ id: `year:${c.name}`, kind: 'datePart', col: c.name, part: 'year', name: `${c.name} — سال`, desc: 'سال شمسی استخراج‌شده از تاریخ', icon: 'calendar', group: 'از ستون تاریخ' });
        out.push({ id: `monthNum:${c.name}`, kind: 'datePart', col: c.name, part: 'monthNum', name: `${c.name} — ماه (عدد)`, desc: 'شماره ماه (۱ تا ۱۲)', icon: 'calendar', group: 'از ستون تاریخ' });
        out.push({ id: `monthName:${c.name}`, kind: 'datePart', col: c.name, part: 'monthName', name: `${c.name} — نام ماه`, desc: 'فروردین تا اسفند', icon: 'calendar', group: 'از ستون تاریخ' });
        out.push({ id: `day:${c.name}`, kind: 'datePart', col: c.name, part: 'day', name: `${c.name} — روز`, desc: 'روز ماه', icon: 'calendar', group: 'از ستون تاریخ' });
        out.push({ id: `weekday:${c.name}`, kind: 'datePart', col: c.name, part: 'weekday', name: `${c.name} — روز هفته`, desc: 'شنبه تا جمعه', icon: 'calendar', group: 'از ستون تاریخ' });
        out.push({ id: `weekend:${c.name}`, kind: 'datePart', col: c.name, part: 'weekend', name: `${c.name} — آخر هفته`, desc: 'پنجشنبه و جمعه = بله', icon: 'calendar', group: 'از ستون تاریخ' });
        out.push({ id: `season:${c.name}`, kind: 'datePart', col: c.name, part: 'season', name: `${c.name} — فصل`, desc: 'بهار/تابستان/پاییز/زمستان', icon: 'calendar', group: 'از ستون تاریخ' });
      }
    });
    const nums = dataset.columns.filter(c => c.type === 'number' || c.type === 'mixed');
    const qtyCols = nums.filter(c => /تعداد|quantity|qty|شمار/i.test(c.name));
    const priceCols = nums.filter(c => /قیمت|price|فی$|نرخ|rate/i.test(c.name));
    qtyCols.forEach(q => {
      priceCols.filter(p => p.name !== q.name).forEach(p => {
        out.push({ id: `mul:${q.name}|${p.name}`, kind: 'mul', colA: q.name, colB: p.name, name: `فروش (${q.name} × ${p.name})`, desc: 'محاسبه خودکار: تعداد × قیمت واحد', icon: 'calc', group: 'از ستون‌های عددی' });
      });
    });
    /* مجموع دو ستون عددی با نام‌های مکمل (بدهکار/بستانکار و...) — پیشنهاد محدود */
    return out;
  }

  const WEEK_FA = { 0: 'یکشنبه', 1: 'دوشنبه', 2: 'سه‌شنبه', 3: 'چهارشنبه', 4: 'پنجشنبه', 5: 'جمعه', 6: 'شنبه' };
  function seasonOf(jm) { return jm <= 3 ? 'بهار' : jm <= 6 ? 'تابستان' : jm <= 9 ? 'پاییز' : 'زمستان'; }

  /** محاسبه مقادیر یک ستون مشتق برای همه ردیف‌ها */
  function computeDerivedValues(dataset, def) {
    const ci = dataset.columns.findIndex(c => c.name === def.col);
    const aI = def.colA != null ? dataset.columns.findIndex(c => c.name === def.colA) : -1;
    const bI = def.colB != null ? dataset.columns.findIndex(c => c.name === def.colB) : -1;
    return dataset.rows.map(r => {
      if (def.kind === 'datePart') {
        if (ci < 0) return '';
        const pv = Utils.parseDateValue(r[ci]);
        if (!pv.valid) return '';
        switch (def.part) {
          case 'year': return String(pv.jy);
          case 'monthNum': return String(pv.jm);
          case 'monthName': return Utils.J_MONTHS[pv.jm - 1] || '';
          case 'day': return String(pv.jd);
          case 'weekday': {
            const g = Utils.d2g(pv.serial);
            const jsDay = new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay();
            return WEEK_FA[jsDay] || '';
          }
          case 'weekend': {
            const g = Utils.d2g(pv.serial);
            const jsDay = new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay();
            return (jsDay === 5 || jsDay === 4) ? 'بله' : 'خیر'; /* پنجشنبه/جمعه */
          }
          case 'season': return seasonOf(pv.jm);
          default: return '';
        }
      }
      if (def.kind === 'mul') {
        if (aI < 0 || bI < 0) return '';
        const a = Utils.parseNum(r[aI]), b = Utils.parseNum(r[bI]);
        if (a === null || b === null) return '';
        return String(Math.round(a * b * 100) / 100);
      }
      return '';
    });
  }

  /** افزودن ستون‌های مشتق انتخابی به مجموعه داده (raw/work/active) */
  function appendDerivedColumns(dataset, defs) {
    if (!dataset || !defs || !defs.length) return 0;
    let added = 0;
    defs.forEach(def => {
      /* اگر قبلاً اضافه شده، به‌روزرسانی می‌شود */
      let ci = dataset.columns.findIndex(c => c.name === def.name && c.derived);
      const values = computeDerivedValues(dataset, def);
      if (ci < 0) {
        dataset.columns.push({ name: def.name, type: def.kind === 'mul' ? 'number' : 'text', emptyCount: 0, derived: true, derivedDef: def });
        ci = dataset.columns.length - 1;
        dataset.rows.forEach((r, ri) => { r[ci] = values[ri] || ''; });
        added++;
      } else {
        dataset.rows.forEach((r, ri) => { r[ci] = values[ri] || ''; });
      }
      /* نوع واقعی + تعداد خالی */
      const col = dataset.columns[ci];
      let empty = 0;
      const counts = {};
      dataset.rows.forEach(r => {
        const t = Utils.classifyValue(r[ci]);
        if (t === 'empty') { empty++; return; }
        counts[t] = (counts[t] || 0) + 1;
      });
      col.emptyCount = empty;
      if (def.kind !== 'mul') {
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        col.type = top ? top[0] : 'text';
      }
    });
    return added;
  }

  return { LIMITS, validateFile, importFile, extractSheet, importGSheet, importPasted, buildDataset, proposeDerived, computeDerivedValues, appendDerivedColumns };
})();
