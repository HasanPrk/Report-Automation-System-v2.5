/* ═══════════════════════════════════════════════════════════
   Utils — ابزارهای پایه: تقویم جلالی، اعداد، CSV، تشخیص نوع، آیکون‌ها
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Utils = (function () {

  /* ---------- عمومی ---------- */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let _uid = 0;
  const uid = (p) => (p || 'id') + '-' + (++_uid) + '-' + Math.random().toString(36).slice(2, 7);

  const debounce = (fn, ms) => {
    let t = null;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms || 250); };
  };

  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

  function downloadFile(name, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  /* ---------- اعداد ---------- */
  const faDig = (s) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

  function nf(n, opts) {
    if (n === null || n === undefined || n === '' || (typeof n === 'number' && !isFinite(n))) return '—';
    try {
      return new Intl.NumberFormat('fa-IR', Object.assign({ maximumFractionDigits: 2 }, opts)).format(n);
    } catch (e) { return String(n); }
  }
  function fmtInt(n) { return nf(n, { maximumFractionDigits: 0 }); }
  function fmtPct(p, digits) {
    if (p === null || p === undefined || !isFinite(p)) return '—';
    return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits == null ? 1 : digits }).format(p) + '٪';
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(+n)) return '—';
    return nf(Math.round(+n), { maximumFractionDigits: 0 }) + ' تومان';
  }
  /** نمایش فشرده با واحد صحیح (هزار / میلیون / میلیارد) برای اعداد بزرگ */
  function fmtCompact(n, unit) {
    if (n === null || n === undefined || !isFinite(+n)) return '—';
    const abs = Math.abs(+n);
    const unitSuffix = unit ? ' ' + unit : '';
    if (abs >= 1e9) return nf(+n / 1e9, { maximumFractionDigits: 1 }) + ' میلیارد' + unitSuffix;
    if (abs >= 1e6) return nf(+n / 1e6, { maximumFractionDigits: 1 }) + ' میلیون' + unitSuffix;
    if (abs >= 1e4) return nf(+n / 1e3, { maximumFractionDigits: 1 }) + ' هزار' + unitSuffix;
    return nf(+n, { maximumFractionDigits: 2 }) + unitSuffix;
  }
  /** نمایش مدت‌زمان (دقیقه) با قالب خوانا */
  function fmtDuration(minutes) {
    if (minutes === null || minutes === undefined || !isFinite(+minutes)) return '—';
    const total = Math.max(0, Math.round(+minutes));
    const h = Math.floor(total / 60), m = total % 60;
    if (h && m) return `${faDig(h)} ساعت و ${faDig(m)} دقیقه`;
    if (h) return `${faDig(h)} ساعت`;
    return `${faDig(m)} دقیقه`;
  }
  /** نمایش مقدار عددی بر اساس واحد استخراج‌شده از نام ستون (مبلغ/درصد/تعداد/ساعت) */
  function fmtByColName(name, n) {
    const s = String(name || '');
    if (/درصد|percent|%/i.test(s)) return fmtPct(n);
    if (/مبلغ|قیمت|پول|ریال|تومان|amount|price|revenue|cost/i.test(s)) return fmtCompact(n, 'تومان');
    if (/ساعت|ساعته|hour/i.test(s)) return fmtCompact(n) + ' ساعت';
    if (/دقیقه|minute/i.test(s)) return fmtDuration(n);
    if (Math.abs(+n) >= 1e5) return fmtCompact(n);
    return nf(n);
  }

  /* ---------- تبدیل ارقام فارسی/عربی به لاتین ---------- */
  function normalizeDigits(s) {
    return String(s == null ? '' : s)
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/٫/g, '.').replace(/[٬،]/g, ',');
  }

  /* ═══════════ یکسان‌سازی کامل نویسه‌های عربی به فارسی ═══════════
     همه نویسه‌های عربی رایج (نه فقط ي و ك): ی، ک، ه، ا، و، ارقام عربی،
     کشیده (تطویل)، اعراب و علائم مخصوص عربی */
  const AR_FA_MAP = {
    'ي': 'ی', 'ى': 'ی', 'ﻯ': 'ی', 'ﻰ': 'ی', 'ئ': 'ئ', /* ی */
    'ك': 'ک', 'ﻙ': 'ک', 'ﻚ': 'ک',                    /* ک */
    'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا', 'ﺍ': 'ا', 'ﺃ': 'ا', 'ﺇ': 'ا',
    'ة': 'ه', 'ۃ': 'ه', 'ۀ': 'ه', 'ﻩ': 'ه', 'ﻪ': 'ه',
    'ؤ': 'و', 'ﻭ': 'و',
    'ﺏ': 'ب', 'ﺏ': 'ب', 'ﺕ': 'ت', 'ﺙ': 'ث', 'ﺝ': 'ج', 'ﺡ': 'ح', 'ﺥ': 'خ',
    'ﺩ': 'د', 'ﺫ': 'ذ', 'ﺭ': 'ر', 'ﺯ': 'ز', 'ﺱ': 'س', 'ﺵ': 'ش', 'ﺹ': 'ص',
    'ﺽ': 'ض', 'ﻁ': 'ط', 'ﻅ': 'ظ', 'ﻉ': 'ع', 'ﻍ': 'غ', 'ﻑ': 'ف', 'ﻕ': 'ق',
    'ﻥ': 'ن', 'ﻡ': 'م', 'ﻝ': 'ل', 'ﻭ': 'و', 'ﻩ': 'ه', 'ﭖ': 'پ', 'ﭺ': 'چ',
    'ﮊ': 'ژ', 'ﮎ': 'ک', 'ﮒ': 'گ'
  };
  const AR_HARAKAT_RE = /[\u064B-\u0652\u0670\u0640]/g; /* اعراب + کشیده */
  const AR_DIGITS = { '٠': '۰', '١': '۱', '٢': '۲', '٣': '۳', '٤': '۴', '٥': '۵', '٦': '۶', '٧': '۷', '٨': '۸', '٩': '۹' };
  function normalizeArabic(s) {
    let t = String(s == null ? '' : s);
    if (/[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(t)) t = t.normalize('NFKC'); /* فرم‌های نمایشی عربی */
    t = t.replace(/[يىﻯﻰﻙكأإٱةۃۀؤ٠-٩ـ\u064B-\u0652\u0670]/g, (ch) => {
      if (AR_FA_MAP[ch]) return AR_FA_MAP[ch];
      if (AR_DIGITS[ch]) return AR_DIGITS[ch];
      return ''; /* کشیده و اعراب حذف می‌شوند */
    });
    return t;
  }

  /* ═══════════ تشخیص و استانداردسازی شناسه‌های ایرانی ═══════════
     شماره موبایل، شماره کارت بانکی و کد ملی — بر اساس استاندارد */
  /** تشخیص نوع شناسه از ظاهر مقدار: 'mobile' | 'card' | 'nationalId' | null */
  function detectIdentifier(v) {
    if (v === null || v === undefined) return null;
    let s = normalizeDigits(v).trim().replace(/[\s\-\.]/g, '');
    if (!s) return null;
    if (/^(\+98|0098|98|0)?9\d{9}$/.test(s)) return 'mobile';
    if (/^\d{16}$/.test(s)) return 'card';
    if (/^\d{9,10}$/.test(s)) return 'nationalId';
    return null;
  }
  /** استانداردسازی شماره موبایل به 09xxxxxxxxx — خروجی: {value, valid} */
  function normalizeMobile(v) {
    let s = normalizeDigits(v).trim().replace(/[\s\-\.]/g, '');
    s = s.replace(/^\+98/, '0').replace(/^0098/, '0').replace(/^98(?=9\d{9}$)/, '0');
    if (/^9\d{9}$/.test(s)) s = '0' + s;
    const valid = /^09(0|1|2|3|5|6|9)\d{7}$/.test(s);
    return { value: s, valid };
  }
  /** اعتبارسنجی و استانداردسازی کد ملی (الگوریتم رسمی + ترمیم صفر ابتدای ۹ رقمی) */
  function normalizeNationalId(v) {
    let s = normalizeDigits(v).trim().replace(/[\s\-]/g, '');
    if (!/^\d{9,10}$/.test(s)) return { value: s, valid: false, fixed: false };
    let fixed = false;
    if (s.length === 9) { s = '0' + s; fixed = true; } /* صفر ابتدایی حذف‌شده ترمیم می‌شود */
    const d = s.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += d[i] * (10 - i);
    const rem = sum % 11;
    const valid = rem < 2 ? d[9] === rem : d[9] === 11 - rem;
    return { value: s, valid, fixed };
  }
  /** اعتبارسنجی شماره کارت ۱۶ رقمی (الگوریتم Luhn) + قالب‌بندی ۴رقمی */
  function normalizeCard(v) {
    const s = normalizeDigits(v).trim().replace(/[\s\-]/g, '');
    if (!/^\d{16}$/.test(s)) return { value: s, valid: false, formatted: s, fixed: false };
    let sum = 0;
    for (let i = 0; i < 16; i++) {
      let d = +s[i];
      if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    const valid = sum % 10 === 0;
    const formatted = s.replace(/(\d{4})(?=\d)/g, '$1-');
    return { value: s, valid, formatted, fixed: false };
  }
  /** اصلاح خودکار مقدار شناسه بر اساس نوع — خروجی: {value, valid, fixed, kind} */
  function fixIdentifier(v, kind) {
    kind = kind || detectIdentifier(v);
    if (!kind) return { value: v, valid: false, fixed: false, kind: null };
    if (kind === 'mobile') {
      const r = normalizeMobile(v);
      return { value: r.value, valid: r.valid, fixed: String(r.value) !== String(v).trim(), kind };
    }
    if (kind === 'nationalId') {
      const r = normalizeNationalId(v);
      return { value: r.value, valid: r.valid, fixed: r.fixed, kind };
    }
    const r = normalizeCard(v);
    return { value: r.formatted, valid: r.valid, fixed: r.formatted !== String(v).trim(), kind };
  }

  /* ═══════════ تقویم جلالی (الگوریتم jalaali — مبتنی بر خورشیدی معتبر) ═══════════ */
  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }

  function jalCal(jy) {
    const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    const bl = breaks.length;
    const gy = jy + 621;
    let leapJ = -14, jp = breaks[0], jm, jump = 0, leap, n, i;
    if (jy < jp || jy >= breaks[bl - 1]) return { leap: 0, gy: gy, march: 20 };
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }

  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
      + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f, jm, jd;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy: jy, jm: jm, jd: jd }; }
      else k -= 186;
    } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }
  function isLeapJalaali(jy) { return jalCal(jy).leap === 0; }
  function jalaaliMonthLength(jy, jm) {
    if (jm < 1 || jm > 12) return 0;
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaali(jy) ? 30 : 29;
  }
  function isValidJalaali(jy, jm, jd) {
    return jy >= -61 && jy <= 3177 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= jalaaliMonthLength(jy, jm);
  }
  function toJalali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }

  const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /** تاریخ امروز جلالی به شکل ۱۴۰۳/۰۵/۱۲ (برگشتی با ارقام لاتین) */
  function todayJalali() {
    const t = new Date();
    const j = toJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());
    return `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`;
  }
  function jString(j) { return `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`; }
  function jStringFa(j) { return faDig(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`); }

  /**
   * تحلیل یک مقدار به‌عنوان تاریخ (شمسی یا میلادی)
   * خروجی: { isDate, valid, kind:'jalali'|'gregorian', jy,jm,jd, serial (روز ژولین برای مقایسه), text }
   */
  function parseDateValue(v) {
    const out = { isDate: false, valid: false, kind: null, jy: 0, jm: 0, jd: 0, serial: null, text: v };
    if (v == null) return out;
    let s = normalizeDigits(String(v)).trim().replace(/[\\٫]/g, '/');
    s = s.replace(/[-.]/g, '/');
    s = s.replace(/\s+/g, '');
    const m = s.match(/^(\d{3,4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m) return out;
    out.isDate = true;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y >= 1500) {
      out.kind = 'gregorian';
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y <= 2200) {
        const g = new Date(Date.UTC(y, mo - 1, d));
        if (g.getUTCFullYear() === y && g.getUTCMonth() === mo - 1 && g.getUTCDate() === d) {
          out.valid = true;
          out.serial = g2d(y, mo, d);
          const j = d2j(out.serial);
          out.jy = j.jy; out.jm = j.jm; out.jd = j.jd;
        }
      }
    } else if (y >= 1200 && y <= 1500) {
      out.kind = 'jalali';
      if (isValidJalaali(y, mo, d)) {
        out.valid = true;
        out.jy = y; out.jm = mo; out.jd = d;
        out.serial = j2d(y, mo, d);
      }
    } else if (y >= 100 && y < 200) {
      out.kind = 'jalali'; // سال دو رقمی شمسی — خارج از بازه منطقی، نامعتبر در نظر گرفته می‌شود در ارزیابی
      out.valid = false;
    }
    return out;
  }

  /* ---------- اعداد ---------- */
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null) return null;
    let s = normalizeDigits(v).trim();
    if (s === '') return null;
    s = s.replace(/[,،٬\s]/g, '');
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  const BOOL_TRUE = ['true', 'yes', 'بله', 'درست', 'صحیح', 'فعال', '1'];
  const BOOL_FALSE = ['false', 'no', 'خیر', 'نادرست', 'غلط', 'غیرفعال', '0'];
  function parseBool(v) {
    if (typeof v === 'boolean') return v;
    if (v == null) return null;
    const s = normalizeDigits(v).trim().toLowerCase();
    if (BOOL_TRUE.includes(s)) return true;
    if (BOOL_FALSE.includes(s)) return false;
    return null;
  }

  /** برچسب فارسی انواع ستون */
  function typeFa(t) {
    return { number: 'عدد', text: 'متن', date: 'تاریخ', boolean: 'منطقی', mixed: 'مختلط', identifier: 'شناسه' }[t] || t;
  }

  /** طبقه‌بندی نوع یک مقدار — با تشخیص شناسه‌های ایرانی (موبایل/کارت/کد ملی) */
  function classifyValue(v) {
    if (v === null || v === undefined || String(v).trim() === '') return 'empty';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'boolean') return 'boolean';
    if (v instanceof Date) return 'date';
    const s = String(v).trim();
    // شناسه‌های ایرانی قبل از عدد بررسی می‌شوند تا صفر ابتدایی از بین نرود
    const kind = detectIdentifier(s);
    if (kind === 'mobile') return 'identifier';
    if (kind === 'card') return 'identifier';
    if (kind === 'nationalId' && /^0\d{9}$/.test(s.replace(/[\s-]/g, ''))) return 'identifier';
    if (parseNum(s) !== null) return 'number';
    if (parseBool(s) !== null) return 'boolean';
    if (parseDateValue(s).isDate) return 'date';
    return 'text';
  }

  /* ---------- پارسر CSV (مستقل از اینترنت، با پشتیبانی از نقل‌قول) ---------- */
  function sniffDelimiter(text) {
    const line = (text.split(/\r?\n/)[0] || '');
    const cands = [',', ';', '\t', '|'];
    let best = ',', bestN = -1;
    let inQ = false;
    for (const d of cands) {
      let n = 0; inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQ = !inQ;
        else if (c === d && !inQ) n++;
      }
      if (n > bestN) { bestN = n; best = d; }
    }
    return best;
  }

  function parseCSV(text, delimiter) {
    text = String(text || '');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
    const d = delimiter || sniffDelimiter(text);
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === d) { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
        else if (c === '\r') { /* نادیده */ }
        else field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    // حذف ردیف‌های کاملاً خالی انتهایی
    while (rows.length && rows[rows.length - 1].every(c => String(c).trim() === '')) rows.pop();
    return { rows, delimiter: d };
  }

  /* ---------- یکسان‌سازی متن فارسی (برای مقایسه) ---------- */
  function normalizeFa(s) {
    return String(s == null ? '' : s)
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ؤ/g, 'و')
      .replace(/ى/g, 'ی').replace(/ۀ/g, 'ه').replace(/أ|إ|آ(.)/g, (m, p) => m.length > 1 ? 'آ' + p : 'ا')
      .replace(/[\u200c\u200f\u200e]/g, ' ') // نیم‌فاصله و نویسه‌های جهت
      .replace(/\s+/g, ' ').trim()
      .toLowerCase();
  }

  /* ---------- آیکون‌ها (SVG داخلی) ---------- */
  const ICONS = {
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    checkCircle: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14.01 9 11.01"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    broom: '<path d="M19 4l-7.5 7.5"/><path d="M14.5 8.5l3 3"/><path d="M3 21c4-1 7-3 9.5-6.5l3-3"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11.01"/><line x1="12" y1="11" x2="12" y2="11.01"/><line x1="16" y1="11" x2="16" y2="11.01"/><line x1="8" y1="15" x2="8" y2="15.01"/><line x1="12" y1="15" x2="12" y2="15.01"/><line x1="16" y1="15" x2="16" y2="15.01"/><line x1="8" y1="19" x2="8" y2="19.01"/><line x1="12" y1="19" x2="12" y2="19.01"/><line x1="16" y1="19" x2="16" y2="19.01"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
    chevronRight: '<polyline points="9 18 15 12 9 6"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    filter: '<polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>',
    trendUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    trendDown: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    undo: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    redo: '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
    history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 14"/>',
    map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
    mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>',
    creditCard: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    idCard: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M5.5 17c.7-1.8 2-2.7 3.5-2.7s2.8.9 3.5 2.7"/><line x1="15" y1="9" x2="19" y2="9"/><line x1="15" y1="13" x2="19" y2="13"/>',
    eraser: '<path d="M20 20H9L4 15a2 2 0 0 1 0-2.8L12.2 4a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L13 19"/><line x1="8.5" y1="9.5" x2="14.5" y2="15.5"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    chevronUp: '<polyline points="18 15 12 9 6 15"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    columns: '<path d="M14 3h7v18h-7z"/><path d="M3 3h7v18H3z"/>',
    checkSquare: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    square: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
    more: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    palette: '<circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="9" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="15.5" cy="9" r="1.2"/><path d="M12 22a10 10 0 0 0 6-2.5c.8-.7.4-2-.7-2.1-1.6-.2-2.8-1-2.8-2.4 0-1.7 1.3-2 3-2 1 0 1.5-1.4.7-2A10 10 0 0 0 12 22z"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><line x1="12" y1="13" x2="12" y2="21"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13l1.5 8-5-3-5 3 1.5-8"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  };
  function icon(name, size) {
    const p = ICONS[name] || ICONS.info;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${size ? ` style="width:${size}px;height:${size}px"` : ''} aria-hidden="true">${p}</svg>`;
  }

  /* ---------- جدول HTML استاندارد ---------- */
  /**
   * cols: [{name, type?}]  rows: [[..],..]
   * opts: { maxRows, missingCells:Set('r:c'), problemCells:Set, showRowIndex, footerNote }
   */
  function htmlTable(cols, rows, opts) {
    opts = opts || {};
    const max = opts.maxRows == null ? rows.length : opts.maxRows;
    let h = '<div class="table-wrap"><table class="data-table"><thead><tr>';
    if (opts.showRowIndex) h += '<th>#</th>';
    cols.forEach(c => { h += `<th>${esc(c.name || c)}</th>`; });
    h += '</tr></thead><tbody>';
    const n = Math.min(rows.length, max);
    for (let r = 0; r < n; r++) {
      h += '<tr>';
      if (opts.showRowIndex) h += `<td class="mono text-muted">${fmtInt(r + 1)}</td>`;
      for (let c = 0; c < cols.length; c++) {
        let v = rows[r][c];
        const missing = opts.missingCells && opts.missingCells.has(r + ':' + c);
        const problem = opts.problemCells && opts.problemCells.has(r + ':' + c);
        const cls = 'cell' + (problem ? ' cell-problem' : '') + (missing ? ' cell-missing' : '');
        const display = (v === null || v === undefined || String(v).trim() === '') ? '<span class="text-danger">خالی</span>' : esc(v);
        h += `<td class="${cls}" title="${esc(v)}">${display}</td>`;
      }
      h += '</tr>';
    }
    h += '</tbody></table></div>';
    if (rows.length > n) {
      h += `<div class="table-meta"><span>نمایش ${fmtInt(n)} ردیف از ${fmtInt(rows.length)} ردیف</span></div>`;
    } else if (opts.footerNote) {
      h += `<div class="table-meta"><span>${esc(opts.footerNote)}</span></div>`;
    }
    return h;
  }

  /** تاریخ و ساعت فعلی برای لاگ */
  function nowStamp() {
    const d = new Date();
    return `${todayJalali()} — ${faDig(pad2(d.getHours()))}:${faDig(pad2(d.getMinutes()))}`;
  }

  return {
    esc, uid, debounce, deepClone, downloadFile,
    nf, fmtInt, fmtPct, fmtMoney, fmtCompact, fmtDuration, fmtByColName, faDig, normalizeDigits,
    jalCal, g2d, d2g, j2d, d2j, isLeapJalaali, jalaaliMonthLength, isValidJalaali,
    toJalali, toGregorian, todayJalali, jString, jStringFa, J_MONTHS,
    parseDateValue, parseNum, parseBool, classifyValue, typeFa,
    normalizeArabic, detectIdentifier, normalizeMobile, normalizeNationalId, normalizeCard, fixIdentifier,
    parseCSV, sniffDelimiter, normalizeFa,
    icon, htmlTable, nowStamp,
  };
})();
