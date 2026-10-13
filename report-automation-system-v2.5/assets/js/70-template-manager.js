/* ═══════════════════════════════════════════════════════════
   templateManager — مدیریت قالب‌های گزارش
   ۲ قالب داخلی + آپلود قالب HTML با جای‌نگهدار {{...}} و مشخصات JSON
   ═══════════════════════════════════════════════════════════ */
'use strict';

const templateManager = (function () {
  const F = () => Store.state.flow;

  /* ---------- تشخیص خودکار فیلدهای مناسب در مجموعه داده ---------- */
  function detectFields(dataset) {
    const cols = dataset.columns;
    const find = (re, types) => cols.findIndex(c => re.test(c.name) && (!types || types.includes(c.type)));
    const numCols = cols.map((c, i) => ({ c, i })).filter(x => x.c.type === 'number');
    const fields = {
      moneyCol: -1, priceCol: -1, qtyCol: -1, discountCol: -1,
      dateCol: -1, idCol: -1, customerCol: -1, statusCol: -1,
      categoryCols: []
    };
    fields.moneyCol = find(/مبلغ کل|مبلغ نهایی|جمع کل|درآمد|revenue|total[_ ]?amount|sales/i, ['number']);
    if (fields.moneyCol < 0) fields.moneyCol = find(/مبلغ|درآمد|فروش|amount|revenue|sales/i, ['number']);
    fields.priceCol = find(/قیمت واحد|unit[_ ]?price|price/i, ['number']);
    fields.qtyCol = find(/تعداد|qty|quantity|count(_col)?$/i, ['number']);
    fields.discountCol = find(/تخفیف|discount/i, ['number']);
    fields.dateCol = find(/تاریخ|date/i, ['date']);
    if (fields.dateCol < 0) {
      const d = cols.findIndex(c => c.type === 'date');
      if (d >= 0) fields.dateCol = d;
    }
    fields.idCol = find(/شناسه|کد|رقم|(^|_)id($|_)|code/i);
    fields.customerCol = find(/مشتری|خریدار|customer|client/i);
    fields.statusCol = find(/وضعیت|status|state/i);
    // ستون‌های طبقه‌ای: متن با تعداد مقادیر یکتای کم
    cols.forEach((c, i) => {
      if (i === fields.idCol || i === fields.dateCol) return;
      if (c.type !== 'text' && c.type !== 'mixed') return;
      const distinct = new Set(dataset.rows.map(r => String(r[i] == null ? '' : r[i]).trim()).filter(Boolean));
      if (distinct.size >= 1 && distinct.size <= 25) fields.categoryCols.push(i);
    });
    if (fields.categoryCols.length > 4) fields.categoryCols = fields.categoryCols.slice(0, 4);
    return fields;
  }

  /* ---------- ساخت مشخصات محاسبات پویا برای قالب داخلی ---------- */
  function buildBuiltinSpec(templateId, dataset) {
    const f = detectFields(dataset);
    const C = dataset.columns;
    const defs = [];
    const add = (id, label, op, column, extra) => {
      const def = Object.assign({ id, label, op, column: column >= 0 ? C[column].name : null }, extra || {});
      defs.push(def);
    };
    add('count_rows', 'تعداد کل رکوردها', 'count', -1);
    if (f.moneyCol >= 0) {
      add('total_revenue', 'مجموع ' + C[f.moneyCol].name, 'sum', f.moneyCol);
      add('avg_order', 'میانگین ' + C[f.moneyCol].name, 'mean', f.moneyCol);
      add('median_' + 'revenue', 'میانه ' + C[f.moneyCol].name, 'median', f.moneyCol);
      add('max_revenue', 'بیشترین ' + C[f.moneyCol].name, 'max', f.moneyCol);
    }
    if (f.qtyCol >= 0) add('total_qty', 'مجموع ' + C[f.qtyCol].name, 'sum', f.qtyCol);
    if (f.customerCol >= 0) add('unique_customers', 'تعداد مشتریان یکتا', 'distinct', f.customerCol);
    if (f.statusCol >= 0) {
      add('status_counts', 'توزیع وضعیت', 'groupCount', f.statusCol);
      add('delivered_pct', 'درصد تحویل‌شده', 'pctFiltered', f.statusCol, { filter: { col: C[f.statusCol].name, op: 'eq', value: 'تحویل شده' } });
    }
    f.categoryCols.slice(0, 3).forEach(ci => {
      const cname = C[ci].name;
      const cid = 'by_' + ci;
      if (f.moneyCol >= 0) {
        add(cid, `${C[f.moneyCol].name} به تفکیک ${cname}`, 'groupSum', f.moneyCol, { groupBy: cname });
      } else {
        add(cid, `تعداد به تفکیک ${cname}`, 'groupCount', ci, {});
      }
    });
    if (f.dateCol >= 0) {
      if (f.moneyCol >= 0) {
        add('monthly_trend', `روند ماهانه ${C[f.moneyCol].name}`, 'periodCompare', f.moneyCol, { dateColumn: C[f.dateCol].name, grain: 'month' });
      } else {
        add('monthly_trend', 'روند ماهانه تعداد رکوردها', 'periodCount', -1, { dateColumn: C[f.dateCol].name, grain: 'month' });
      }
    }
    // KPIهای پیشنهادی برای کارت‌ها
    const kpiIds = ['total_revenue', 'count_rows', 'avg_order', 'total_qty', 'unique_customers', 'delivered_pct'].filter(id => defs.some(d => d.id === id));
    return { defs, kpiIds, fields: { moneyCol: f.moneyCol, dateCol: f.dateCol, categoryCols: f.categoryCols, statusCol: f.statusCol, qtyCol: f.qtyCol, customerCol: f.customerCol } };
  }

  /* ---------- قالب‌های داخلی ---------- */
  const BUILTIN = [
    {
      id: 'builtin-operational',
      name: 'گزارش عملکرد عملیاتی',
      description: 'قالب استاندارد برای گزارش دوره‌ای عملکرد: خلاصه مدیریتی، شاخص‌ها، تفکیک‌های عملیاتی، روندها، ریسک‌ها و پیشنهادها. شاخص‌ها به‌صورت خودکار با ستون‌های داده شما تطبیق می‌یابند.',
      kind: 'builtin', isDynamicSpec: true,
      structure: [
        { id: 'executive_summary', type: 'text', title: 'خلاصه مدیریتی', role: 'summary' },
        { id: 'kpi_cards', type: 'kpi', title: 'شاخص‌های کلیدی عملکرد', calcs: 'auto' },
        { id: 'objective', type: 'text', title: 'هدف و محدوده تحلیل', role: 'objective' },
        { id: 'data_source', type: 'text', title: 'منبع داده و وضعیت کیفیت', role: 'data_source' },
        { id: 'findings', type: 'text', title: 'نتایج اصلی', role: 'findings' },
        { id: 'sec_chart_breakdown', type: 'chart', title: 'تفکیک عملکرد', calcId: 'auto-breakdown' },
        { id: 'trends', type: 'text', title: 'روندها و تغییرات مهم', role: 'trends' },
        { id: 'sec_chart_monthly', type: 'chart', title: 'روند ماهانه', calcId: 'monthly_trend' },
        { id: 'comparisons', type: 'text', title: 'مقایسه‌های عملیاتی', role: 'comparisons' },
        { id: 'sec_table_breakdown', type: 'table', title: 'جدول تفکیک عملکرد', calcId: 'auto-breakdown' },
        { id: 'anomalies', type: 'text', title: 'ناهنجاری‌ها و ریسک‌های قابل مشاهده', role: 'anomalies' },
        { id: 'interpretation', type: 'text', title: 'تفسیر مدیریتی نتایج', role: 'interpretation' },
        { id: 'recommendations', type: 'text', title: 'پیشنهادهای عملیاتی', role: 'recommendations' },
        { id: 'limitations', type: 'text', title: 'محدودیت‌های تحلیل', role: 'limitations' },
        { id: 'conclusion', type: 'text', title: 'جمع‌بندی نهایی', role: 'conclusion' }
      ]
    },
    {
      id: 'builtin-kpi',
      name: 'گزارش مدیریتی شاخص‌های کلیدی (KPI)',
      description: 'قالب فشرده و متمرکز بر شاخص‌ها: کارت‌های KPI، مقایسه دوره جاری با دوره قبل، جدول عملکرد تفکیکی و جمع‌بندی کوتاه. مناسب جلسات مدیریتی.',
      kind: 'builtin', isDynamicSpec: true,
      structure: [
        { id: 'executive_summary', type: 'text', title: 'خلاصه مدیریتی', role: 'summary' },
        { id: 'kpi_cards', type: 'kpi', title: 'کارتی شاخص‌های کلیدی', calcs: 'auto' },
        { id: 'sec_chart_monthly', type: 'chart', title: 'روند ماهانه شاخص اصلی', calcId: 'monthly_trend' },
        { id: 'period_comparison', type: 'text', title: 'مقایسه دوره جاری و دوره قبل', role: 'comparisons' },
        { id: 'sec_table_breakdown', type: 'table', title: 'عملکرد به تفکیک دسته‌بندی', calcId: 'auto-breakdown' },
        { id: 'anomalies', type: 'text', title: 'ناهنجاری‌ها و ریسک‌های قابل مشاهده', role: 'anomalies' },
        { id: 'recommendations', type: 'text', title: 'پیشنهادهای عملیاتی', role: 'recommendations' },
        { id: 'limitations', type: 'text', title: 'محدودیت‌های تحلیل', role: 'limitations' },
        { id: 'conclusion', type: 'text', title: 'جمع‌بندی نهایی', role: 'conclusion' }
      ]
    }
  ];

  /* ---------- پشتیبانی قالب Word (.docx) و Google Docs ---------- */
  /**
   * فایل docx یک ZIP است؛ این تابع حداقلی، فایل word/document.xml را استخراج
   * و متن پاراگراف‌ها + سرصفحه‌ها را به HTML قالب با جای‌نگهدار {{...}} تبدیل می‌کند.
   * برای Google Docs: کاربر ابتدا از منوی File → Download نسخه docx یا HTML می‌گیرد.
   */
  async function docxToHtmlTemplate(file) {
    const buf = await file.arrayBuffer();
    const entries = zipEntries(buf);
    const doc = entries.find(e => e.name === 'word/document.xml');
    if (!doc) throw new Error('ساختار فایل Word معتبر نیست (word/document.xml یافت نشد).');
    const xml = await inflateEntry(buf, doc);
    return docxXmlToHtml(xml);
  }

  function zipEntries(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    // یافتن End of Central Directory از انتهای فایل
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0 && i > u8.length - 65557; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('فایل ZIP/DOCX قابل خواندن نیست.');
    const count = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder('utf-8');
    const out = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(ptr, true) !== 0x02014b50) break;
      const method = dv.getUint16(ptr + 10, true);
      const compSize = dv.getUint32(ptr + 20, true);
      const nameLen = dv.getUint16(ptr + 28, true);
      const extraLen = dv.getUint16(ptr + 30, true);
      const commentLen = dv.getUint16(ptr + 32, true);
      const localOff = dv.getUint32(ptr + 42, true);
      const name = dec.decode(u8.subarray(ptr + 46, ptr + 46 + nameLen));
      out.push({ name, method, compSize, localOff });
      ptr += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  async function inflateEntry(buf, entry) {
    const dv = new DataView(buf);
    const off = entry.localOff;
    if (dv.getUint32(off, true) !== 0x04034b50) throw new Error('ساختار ZIP نامعتبر است.');
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const start = off + 30 + nameLen + extraLen;
    const data = new Uint8Array(buf, start, entry.compSize);
    if (entry.method === 0) return new TextDecoder('utf-8').decode(data);
    if (entry.method !== 8) throw new Error('روش فشرده‌سازی فایل پشتیبانی نمی‌شود.');
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('مرورگر شما از استخراج فایل Word پشتیبانی نمی‌کند؛ لطفاً قالب را با فرمت HTML ذخیره و بارگذاری کنید.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    const out = await new Response(stream).arrayBuffer();
    return new TextDecoder('utf-8').decode(out);
  }

  function docxXmlToHtml(xml) {
    const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    const htmlParts = [];
    paras.forEach(p => {
      const styleM = p.match(/<w:pStyle w:val="([^"]+)"/);
      const style = styleM ? styleM[1].toLowerCase() : '';
      const texts = [];
      (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).forEach(t => {
        texts.push(t.replace(/<[^>]+>/g, ''));
      });
      const text = texts.join('').trim();
      if (!text) return;
      if (/^heading1$|^title$/.test(style)) htmlParts.push('<h1>' + Utils.esc(text) + '</h1>');
      else if (/^heading2$|^subtitle$/.test(style)) htmlParts.push('<h2>' + Utils.esc(text) + '</h2>');
      else if (/^heading3$/.test(style)) htmlParts.push('<h3>' + Utils.esc(text) + '</h3>');
      else htmlParts.push('<p>' + Utils.esc(text) + '</p>');
    });
    if (!htmlParts.length) throw new Error('متنی در فایل Word یافت نشد.');
    return htmlParts.join('\n');
  }

  /* ---------- پارس قالب سفارشی ---------- */
  function parsePlaceholders(html) {
    const re = /\{\{\s*([a-zA-Z0-9_\u0600-\u06FF:.\-]+)\s*\}\}/g;
    const out = [];
    let m;
    const seen = new Set();
    while ((m = re.exec(html)) !== null) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const token = m[1];
      let type = 'meta', key = token;
      if (token.includes(':')) {
        const [t, k] = token.split(':');
        type = t; key = k;
      }
      out.push({ token, type, key });
    }
    return out;
  }

  function validateCustomSpec(spec) {
    const errs = [], warns = [];
    if (!spec || typeof spec !== 'object') { errs.push('فایل JSON نامعتبر است.'); return { errs, warns }; }
    if (spec.calcSpec && !Array.isArray(spec.calcSpec)) errs.push('calcSpec باید یک آرایه باشد.');
    if (spec.calcSpec) {
      spec.calcSpec.forEach((d, i) => {
        if (!d.id) errs.push(`محاسبه شماره ${i + 1} شناسه (id) ندارد.`);
        if (!d.op) errs.push(`محاسبه «${d.id || i + 1}» نوع عملیات (op) ندارد.`);
        const validOps = ['count', 'sum', 'mean', 'median', 'min', 'max', 'distinct', 'groupCount', 'groupSum', 'groupMean', 'periodCompare', 'periodCount', 'pctFiltered'];
        if (d.op && !validOps.includes(d.op)) errs.push(`عملیات «${d.op}» در محاسبه «${d.id}» پشتیبانی نمی‌شود. عملیات‌های مجاز: ${validOps.join('، ')}`);
        if (['sum', 'mean', 'median', 'min', 'max', 'groupSum', 'groupMean', 'periodCompare'].includes(d.op) && !d.column) {
          errs.push(`محاسبه «${d.id}» برای عملیات ${d.op} به ستون عددی نیاز دارد.`);
        }
      });
    }
    return { errs, warns };
  }

  function addUploaded(htmlText, specJSON, fileName) {
    const phs = parsePlaceholders(htmlText);
    if (!phs.length) {
      throw new Error('هیچ جای‌نگهداری به شکل {{نام}} در فایل قالب یافت نشد. نمونه: {{report_title}} یا {{kpi:total_sales}}');
    }
    let spec = null;
    if (specJSON) {
      try { spec = JSON.parse(specJSON); }
      catch (e) { throw new Error('فایل JSON مشخصات محاسبات قابل خواندن نیست: ' + e.message); }
      const v = validateCustomSpec(spec);
      if (v.errs.length) throw new Error('خطاهای فایل مشخصات:\n• ' + v.errs.join('\n• '));
    }
    const t = {
      id: Utils.uid('tpl'),
      name: (spec && spec.name) || fileName || 'قالب سفارشی',
      description: (spec && spec.description) || 'قالب بارگذاری‌شده توسط کاربر',
      kind: 'custom', isDynamicSpec: false,
      html: htmlText, spec: spec, placeholders: phs,
      uploadedAt: new Date().toISOString(),
      fileName: fileName || ''
    };
    F().templates.uploaded.push(t);
    return t;
  }

  function removeUploaded(id) {
    const f = F();
    f.templates.uploaded = f.templates.uploaded.filter(t => t.id !== id);
    if (f.templates.selectedId === id) { f.templates.selectedId = null; f.compat = null; }
  }

  function list() {
    return BUILTIN.concat(F().templates.uploaded);
  }
  function get(id) {
    return list().find(t => t.id === id) || null;
  }

  /* ---------- مشخصات محاسبات مؤثر برای قالب انتخابی ---------- */
  function effectiveSpec(template, dataset) {
    if (!template) return null;
    if (template.isDynamicSpec) {
      return buildBuiltinSpec(template.id === 'builtin-kpi' ? 'builtin-kpi' : 'builtin-operational', dataset);
    }
    // قالب سفارشی: مشخصات از JSON + موارد تکمیلی خودکار
    const defs = ((template.spec && template.spec.calcSpec) || []).map(d => Object.assign({}, d));
    const auto = buildBuiltinSpec('builtin-operational', dataset);
    // اگر مشخصه‌ای در JSON نبود، از خودکارها فقط مواردی که JSON صریحاً استفاده می‌کند لازم است؛ ولی برای امکان‌پذیری، autoها به‌عنوان ذخیره اضافه می‌شوند با پیشوند auto_
    auto.defs.forEach(d => {
      if (!defs.some(x => x.id === d.id)) defs.push(Object.assign({}, d, { id: 'auto_' + d.id, auto: true }));
    });
    const kpiIds = (template.spec && template.spec.kpiIds) || [];
    return { defs, kpiIds, fields: auto.fields };
  }

  /* ---------- بررسی سازگاری قالب با داده ---------- */
  function checkCompat(template, dataset) {
    const issues = [], notes = [];
    if (!dataset) { issues.push('مجموعه داده فعال وجود ندارد.'); return { ok: false, issues, notes }; }
    const spec = effectiveSpec(template, dataset);
    const colNames = dataset.columns.map(c => c.name);
    spec.defs.forEach(d => {
      if (d.auto) return;
      if (d.column && !colNames.includes(d.column)) {
        issues.push(`محاسبه «${d.label || d.id}»: ستون «${d.column}» در داده موجود نیست.`);
      }
      if (d.groupBy && !colNames.includes(d.groupBy)) {
        issues.push(`محاسبه «${d.label || d.id}»: ستون گروه‌بندی «${d.groupBy}» یافت نشد.`);
      }
      if (d.dateColumn && !colNames.includes(d.dateColumn)) {
        issues.push(`محاسبه «${d.label || d.id}»: ستون تاریخ «${d.dateColumn}» یافت نشد.`);
      }
    });
    if (spec.fields.dateCol < 0) notes.push('ستون تاریخی شناسایی نشد؛ تحلیل روند ماهانه و مقایسه دوره‌ای غیرفعال خواهد بود.');
    if (spec.fields.moneyCol < 0) notes.push('ستون مبلغی شناسایی نشد؛ شاخص‌های مالی از تحلیل حذف می‌شوند.');
    const ok = issues.length === 0;
    return { ok, issues, notes, spec };
  }

  /* ---------- انتخاب قالب ---------- */
  function select(id) {
    const f = F();
    const t = get(id);
    if (!t) return { ok: false, error: 'قالب یافت نشد.' };
    const compat = checkCompat(t, f.active);
    f.templates.selectedId = id;
    f.templates.mapping = {};
    f.compat = compat;
    Store.emit('template-selected');
    return { ok: true, compat };
  }

  /* ---------- خروجی گرفتن تعریف قالب ---------- */
  function exportTemplate(id) {
    const t = get(id);
    if (!t) return null;
    if (t.kind === 'custom') {
      Utils.downloadFile(`${t.name || 'template'}-spec.json`, JSON.stringify({
        name: t.name, description: t.description, calcSpec: (t.spec && t.spec.calcSpec) || [], kpiIds: (t.spec && t.spec.kpiIds) || []
      }, null, 2), 'application/json;charset=utf-8');
    } else {
      const dataset = F().active;
      const spec = dataset ? effectiveSpec(t, dataset) : null;
      Utils.downloadFile(`${t.name}-calc-spec.json`, JSON.stringify({
        name: t.name, description: t.description,
        note: 'این فایل مشخصات محاسبات تولیدشده برای داده فعلی است.',
        calcSpec: spec ? spec.defs.filter(d => !d.auto) : [], kpiIds: spec ? spec.kpiIds : []
      }, null, 2), 'application/json;charset=utf-8');
    }
    return true;
  }

  return { BUILTIN, detectFields, buildBuiltinSpec, parsePlaceholders, validateCustomSpec, addUploaded, removeUploaded, list, get, effectiveSpec, checkCompat, select, exportTemplate, docxToHtmlTemplate };
})();
