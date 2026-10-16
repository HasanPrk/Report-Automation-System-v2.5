/* ═══════════════════════════════════════════════════════════
   chartBuilder — موتور نمودارهای تعاملی drag & drop (شبیه Power BI)
   • همه نمودارها از «داده فیلترشده» موتور فیلتر سراسری تغذیه می‌شوند
   • نوع جدید: نقشه ایران (منطقه‌ای)
   • تنظیمات کامل: عنوان، عناوین محورها، راهنما با موقعیت، Data Label با موقعیت
   ═══════════════════════════════════════════════════════════ */
'use strict';

const chartBuilder = (function () {
  const F = () => Store.state.flow;

  /* پالت‌های رنگی پیش‌فرض + سفارشی */
  const PALETTES = {
    'corporate-blue': { name: 'آبی سازمانی', colors: ['#2f6fed', '#16a34a', '#d97706', '#8b5cf6', '#0e7f96', '#d23b3b', '#64748b', '#c026d3'] },
    'calm-green':     { name: 'سبز آرام', colors: ['#0f766e', '#22c55e', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#6366f1', '#14b8a6'] },
    'modern-purple':  { name: 'بنفش مدرن', colors: ['#7c3aed', '#2563eb', '#db2777', '#059669', '#f59e0b', '#64748b', '#a855f7', '#0d9488'] },
    'formal-gray':    { name: 'خاکستری رسمی', colors: ['#334155', '#0e7490', '#b45309', '#64748b', '#7c2d12', '#14532d', '#475569', '#1e3a8a'] }
  };

  function paletteColors(paletteId) {
    const f = F();
    if (paletteId && paletteId.startsWith('custom:')) {
      const list = (f.report.branding && f.report.branding.customColors) || [];
      if (list.length) return list;
    }
    const p = PALETTES[paletteId] || PALETTES['corporate-blue'];
    return p.colors.slice();
  }

  const TYPE_META = {
    column:   { label: 'ستونی عمودی', icon: 'bar-vertical' },
    bar:      { label: 'میله‌ای افقی', icon: 'bar-horizontal' },
    line:     { label: 'خطی', icon: 'trendUp' },
    area:     { label: 'ناحیه‌ای', icon: 'area' },
    pie:      { label: 'دایره‌ای', icon: 'pie' },
    doughnut: { label: 'حلقوی', icon: 'doughnut' },
    radar:    { label: 'راداری', icon: 'radar' },
    scatter:  { label: 'پراکنده', icon: 'scatter' },
    map:      { label: 'نقشه ایران', icon: 'map' },
    table:    { label: 'جدول', icon: 'table' },
    kpi:      { label: 'کارت شاخص', icon: 'calc' },
    infographic: { label: 'اینفوگرافیک', icon: 'users' },
    treemap:  { label: 'درختی (Treemap)', icon: 'grid' },
    heatmap:  { label: 'نقشه حرارتی', icon: 'activity' },
    gauge:    { label: 'سنجه (Gauge)', icon: 'award' },
    textbox:  { label: 'کادر متن', icon: 'fileText' }
  };

  const AGG_META = {
    sum: { label: 'مجموع' }, mean: { label: 'میانگین' }, median: { label: 'میانه' },
    min: { label: 'کمینه' }, max: { label: 'بیشینه' }, count: { label: 'تعداد' }
  };

  const LABEL_POSITIONS = [
    { id: 'outside', label: 'بیرون (بالای ستون)' },
    { id: 'inside', label: 'درون' },
    { id: 'top', label: 'بالا' },
    { id: 'bottom', label: 'پایین' },
    { id: 'left', label: 'چپ' },
    { id: 'right', label: 'راست' },
    { id: 'center', label: 'مرکز' }
  ];

  function defaultItem() {
    const f = F();
    const ds = f.active;
    const numCol = ds ? ds.columns.find(c => c.type === 'number') : null;
    const catCol = ds ? ds.columns.find(c => c.type === 'text') : null;
    return {
      id: 'uc' + (++f.charts.seq),
      type: 'column',
      title: 'نمودار جدید',
      catCol: catCol ? catCol.name : '',
      catCol2: catCol ? catCol.name : '',   /* ستون دوم برای Heatmap */
      valCol: numCol ? numCol.name : '',
      xCol: numCol ? numCol.name : '',
      yCol: numCol ? numCol.name : '',
      agg: 'sum',
      sort: 'value-desc',
      topN: 0,
      /* نسخه ۲٫۴: Drill-down همه نمودارهای دسته‌ای — سطح ۲ روی ستون دوم */
      drill: { enabled: false, col2: '', active: null },
      opts: {
        legend: true, legendPos: 'top', dataLabels: false, dataLabelsPos: 'outside',
        dataLabelsSize: 11, dataLabelsShowValue: true, dataLabelsShowPct: false,
        gridlines: true, tooltip: true,
        palette: 'corporate-blue', height: 280,
        axisTitleCat: '', axisTitleVal: '',
        includeInReport: false, span: 1,
        /* ← نسخه ۲٫۲: تنظیمات مستقل هر نمودار */
        text: '',                      /* Textbox */
        perIcon: 0, igUnit: '',        /* Infographic (۰ = خودکار) */
        gaugeMin: null, gaugeMax: null, gaugeTarget: null,  /* Gauge */
        titlePadTop: 6,                /* فاصله عنوان نمودار از ناحیه رسم */
        axisNamePadX: 10, axisNamePadY: 6, /* فاصله نام محور افقی/عمودی از برچسب‌ها */
        cornerRadius: 6,               /* گردگوشه میله‌ها */
        borderWidth: 2                 /* ضخامت خط/ناحیه */
      }
    };
  }

  /* ---------- منبع داده: مجموعه فیلترشده — آگاه از Slicerهای متصل به همین نمودار ---------- */
  function sourceRows(itemId) {
    try {
      /* اگر Slicer فعالی وجود دارد، ردیف‌ها به‌صورت نمودار-محور فیلتر می‌شوند */
      if (typeof slicerEngine !== 'undefined' && itemId) {
        return slicerEngine.rowsFor(itemId);
      }
      if (typeof FilterEngine !== 'undefined') return FilterEngine.filteredRows();
    } catch (e) { /* fallback */ }
    const f = F();
    return f.active ? f.active.rows : [];
  }

  /* ---------- تجمیع داده برای یک نمودار ---------- */
  function build(item) {
    const f = F();
    const ds = f.active;
    if (!ds) return { ok: false, error: 'مجموعه داده فعالی وجود ندارد.' };
    const rows = sourceRows(item.id);
    if (item.type !== 'kpi' && !rows.length) {
      return { ok: false, error: 'نتیجه‌ای برای نمایش وجود ندارد — فیلترهای فعلی هیچ رکوردی را برنگرداندند.' };
    }
    const colIdx = (name) => ds.columns.findIndex(c => c.name === name);

    if (item.type === 'kpi') {
      const ci = colIdx(item.valCol);
      if (item.agg === 'count') return { ok: true, scalar: rows.length, label: item.title || 'تعداد رکوردها' };
      if (ci < 0) return { ok: false, error: 'ستون مقدار یافت نشد.' };
      const nums = rows.map(r => Utils.parseNum(r[ci])).filter(n => n !== null);
      if (!nums.length) return { ok: false, error: 'مقدار عددی معتبری در ستون انتخابی نیست.' };
      let v;
      switch (item.agg) {
        case 'sum': v = nums.reduce((a, b) => a + b, 0); break;
        case 'mean': v = nums.reduce((a, b) => a + b, 0) / nums.length; break;
        case 'min': v = Math.min(...nums); break;
        case 'max': v = Math.max(...nums); break;
        default: {
          const s = nums.slice().sort((a, b) => a - b);
          v = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
        }
      }
      return { ok: true, scalar: Math.round(v * 100) / 100, label: item.title || item.valCol };
    }

    if (item.type === 'scatter') {
      const xi = colIdx(item.xCol), yi = colIdx(item.yCol);
      if (xi < 0 || yi < 0) return { ok: false, error: 'ستون‌های X و Y را انتخاب کنید.' };
      const points = [];
      rows.forEach(r => {
        const x = Utils.parseNum(r[xi]), y = Utils.parseNum(r[yi]);
        if (x !== null && y !== null) points.push({ x, y });
      });
      if (points.length < 2) return { ok: false, error: 'حداقل دو ردیف با مقدار عددی معتبر در هر دو ستون لازم است.' };
      return { ok: true, points, xLabel: item.opts.axisTitleCat || item.xCol, yLabel: item.opts.axisTitleVal || item.yCol };
    }

    if (item.type === 'map') {
      return buildMap(item, rows, colIdx);
    }

    /* ---------- انواع جدید ۲٫۲ ---------- */
    if (item.type === 'textbox') {
      return { ok: true, text: item.opts.text || '', isTextbox: true };
    }
    if (item.type === 'gauge') {
      const ci = colIdx(item.valCol);
      if (item.agg === 'count') {
        return { ok: true, scalar: rows.length, label: item.title || 'تعداد رکوردها', gauge: true };
      }
      if (ci < 0) return { ok: false, error: 'ستون مقدار را انتخاب کنید.' };
      const nums = rows.map(r => Utils.parseNum(r[ci])).filter(n => n !== null);
      if (!nums.length) return { ok: false, error: 'مقدار عددی معتبری در ستون انتخابی نیست.' };
      let v;
      switch (item.agg) {
        case 'mean': v = nums.reduce((a, b) => a + b, 0) / nums.length; break;
        case 'min': v = Math.min(...nums); break;
        case 'max': v = Math.max(...nums); break;
        default: v = nums.reduce((a, b) => a + b, 0);
      }
      return { ok: true, scalar: Math.round(v * 100) / 100, label: item.title || item.valCol, gauge: true };
    }

    /* اینفوگرافیک / درختی / حرارتی / دسته‌ای — همه از گروه‌بندی دسته‌ای استفاده می‌کنند */
    let catI = colIdx(item.catCol);
    if (catI < 0) {
      return { ok: false, error: item.type === 'heatmap' ? 'ستون سطر (محور دسته) را انتخاب کنید.' : 'ستون دسته‌بندی (محور دسته) را انتخاب کنید.' };
    }
    const valI = item.agg === 'count' ? -1 : colIdx(item.valCol);
    if (item.agg !== 'count' && valI < 0) return { ok: false, error: 'ستون مقدار را انتخاب کنید.' };

    /* ═════════ Drill-down (نسخه ۲٫۴) — سطح ۲ روی ستون دوم ═════════
       وقتی فعال باشد، نمودار به‌جای کل داده، شکست سطح دومِ همان دسته انتخابی
       را نشان می‌دهد (مثل Drill-down در Power BI) — بدون فیلتر کردن بقیه نمودارها */
    let srcRows = rows;
    let drillMeta = null;
    if (item.type !== 'heatmap' && item.drill && item.drill.enabled && item.drill.col2 && item.drill.active) {
      const c2 = colIdx(item.drill.col2);
      if (c2 >= 0 && c2 !== catI) {
        const parent = item.drill.active;
        srcRows = rows.filter(r => String(r[catI] == null ? '' : r[catI]).trim() === parent);
        catI = c2;
        drillMeta = { level: 2, parent, col: item.drill.col2, parentCount: srcRows.length };
      }
    }

    if (item.type === 'heatmap') {
      const cat2I = colIdx(item.catCol2);
      if (cat2I < 0) return { ok: false, error: 'ستون ستونِ (بعد دوم) نقشه حرارتی را در تنظیمات انتخاب کنید.' };
      if (cat2I === catI) return { ok: false, error: 'برای نقشه حرارتی، دو بعد باید ستون‌های متفاوتی باشند (ستون سطر و ستون ستون).' };
      const mat = new Map();
      const rowNames = new Set(), colNames = new Set();
      rows.forEach(r => {
        const rk = String(r[catI] == null ? '' : r[catI]).trim() || '(خالی)';
        const ck = String(r[cat2I] == null ? '' : r[cat2I]).trim() || '(خالی)';
        const n = item.agg === 'count' ? 1 : Utils.parseNum(r[valI]);
        if (n === null) return;
        rowNames.add(rk); colNames.add(ck);
        const k = rk + '|' + ck;
        mat.set(k, (mat.get(k) || 0) + n);
      });
      if (!mat.size) return { ok: false, error: 'ترکیب معتبری از دو بعد با مقدار عددی یافت نشد. دو ستون دسته‌ای متفاوت و یک ستون مقدار لازم است.' };
      const rArr = [...rowNames].slice(0, 25);
      const cArr = [...colNames].slice(0, 25);
      const truncated = rowNames.size > 25 || colNames.size > 25;
      return { ok: true, heat: { rows: rArr, cols: cArr, values: mat, truncated }, aggLabel: AGG_META[item.agg] ? AGG_META[item.agg].label : item.agg };
    }

    const groups = new Map();
    srcRows.forEach(r => {
      const key = String(r[catI] == null ? '' : r[catI]).trim() || '(خالی)';
      if (!groups.has(key)) groups.set(key, []);
      const g = groups.get(key);
      if (item.agg === 'count') g.push(1);
      else { const n = Utils.parseNum(r[valI]); if (n !== null) g.push(n); }
    });
    let rowsAgg = [...groups.entries()].map(([label, arr]) => ({
      label,
      count: arr.length,
      value: item.agg === 'count' ? arr.length
        : item.agg === 'sum' ? arr.reduce((a, b) => a + b, 0)
        : item.agg === 'mean' ? (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
        : item.agg === 'min' ? (arr.length ? Math.min(...arr) : null)
        : item.agg === 'max' ? (arr.length ? Math.max(...arr) : null)
        : (() => { const s = arr.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; })()
    })).filter(r => r.value !== null);
    if (!rowsAgg.length) return { ok: false, error: drillMeta ? `برای «${drillMeta.parent}» در ستون «${drillMeta.col}» داده قابل نمایشی یافت نشد.` : 'داده قابل نمایشی برای این ترکیب یافت نشد.' };

    switch (item.sort) {
      case 'value-desc': rowsAgg.sort((a, b) => b.value - a.value); break;
      case 'value-asc': rowsAgg.sort((a, b) => a.value - b.value); break;
      case 'label': rowsAgg.sort((a, b) => a.label.localeCompare(b.label, 'fa')); break;
      default: break; // ترتیب داده
    }
    if (item.topN > 0) rowsAgg = rowsAgg.slice(0, item.topN);
    return { ok: true, labels: rowsAgg.map(r => r.label), values: rowsAgg.map(r => Math.round(r.value * 100) / 100), counts: rowsAgg.map(r => r.count), aggLabel: AGG_META[item.agg] ? AGG_META[item.agg].label : item.agg, drill: drillMeta };
  }

  /* ---------- تجمیع نقشه ایران بر اساس نام استان (یا شهرستان در سطح drill-down) ---------- */
  function buildMap(item, rows, colIdx) {
    const catI = colIdx(item.catCol);
    if (catI < 0) return { ok: false, error: 'ستون نام استان (محور دسته) را انتخاب کنید.' };
    const valI = item.agg === 'count' ? -1 : colIdx(item.valCol);
    if (item.agg !== 'count' && valI < 0) return { ok: false, error: 'ستون مقدار را انتخاب کنید.' };
    const lvl = (typeof iranMap !== 'undefined' && iranMap.currentLevel) ? iranMap.currentLevel() : { level: 'country', province: null };
    const atCounty = lvl.level === 'county' && iranMap.hasCounties(lvl.province);
    const groups = new Map();
    let unmatched = 0;
    rows.forEach(r => {
      const raw = String(r[catI] == null ? '' : r[catI]).trim();
      if (!raw) return;
      let key = null;
      if (atCounty) {
        key = iranMap.matchCounty(lvl.province, raw);
      } else {
        key = iranMap.matchProvince(raw);
      }
      if (!key) { unmatched++; return; }
      if (!groups.has(key)) groups.set(key, []);
      const g = groups.get(key);
      if (item.agg === 'count') g.push(1);
      else { const n = Utils.parseNum(r[valI]); if (n !== null) g.push(n); }
    });
    const regions = [...groups.entries()].map(([key, arr]) => ({
      key,
      count: arr.length,
      value: item.agg === 'count' ? arr.length
        : item.agg === 'sum' ? arr.reduce((a, b) => a + b, 0)
        : item.agg === 'mean' ? (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
        : item.agg === 'min' ? Math.min(...arr)
        : item.agg === 'max' ? Math.max(...arr)
        : (() => { const s = arr.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; })()
    })).filter(r => r.value !== null);
    if (!regions.length) {
      return { ok: false, error: atCounty
        ? `هیچ نام شهرستانی از استان ${lvl.province} در ستون دسته‌بندی یافت نشد (مثل «${(iranMap.countiesOf(lvl.province)[0] || {}).key || 'شهرستان'}» و…). اگر داده شما فقط نام استان دارد، با «بازگشت به سطح استان» به نمای کشوری برگردید.`
        : 'هیچ نام استانی در ستون دسته‌بندی شناسایی نشد. نام‌های استان (مثل تهران، فارس، اصفهان و…) لازم است.' };
    }
    switch (item.sort) {
      case 'value-desc': regions.sort((a, b) => b.value - a.value); break;
      case 'value-asc': regions.sort((a, b) => a.value - b.value); break;
      case 'label': regions.sort((a, b) => a.key.localeCompare(b.key, 'fa')); break;
    }
    if (item.topN > 0) { /* TopN روی نقشه اعمال نمی‌شود — همه استان‌های دارای داده نمایش داده می‌شوند */ }
    return {
      ok: true,
      regions: regions.map(r => ({ key: r.key, label: r.key, value: Math.round(r.value * 100) / 100, count: r.count })),
      unmatched,
      aggLabel: AGG_META[item.agg] ? AGG_META[item.agg].label : item.agg
    };
  }

  /* ---------- مدیریت اقلام ---------- */
  function add() {
    const f = F();
    const it = defaultItem();
    f.charts.items.push(it);
    return it;
  }
  function remove(id) {
    const f = F();
    f.charts.items = f.charts.items.filter(x => x.id !== id);
  }
  function duplicate(id) {
    const f = F();
    const src = f.charts.items.find(x => x.id === id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 'uc' + (++f.charts.seq);
    copy.title = src.title + ' (کپی)';
    const i = f.charts.items.findIndex(x => x.id === id);
    f.charts.items.splice(i + 1, 0, copy);
    return copy;
  }
  function move(id, dir) {
    const f = F();
    const i = f.charts.items.findIndex(x => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= f.charts.items.length) return;
    const arr = f.charts.items;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  function get(id) {
    return F().charts.items.find(x => x.id === id) || null;
  }
  function includedCharts() {
    return F().charts.items.filter(x => x.opts && x.opts.includeInReport);
  }

  /* Chart.js type mapping — map نوع مخصوص است و توسط Chart.js رسم نمی‌شود */
  function chartJsType(item) {
    switch (item.type) {
      case 'column': return 'bar';
      case 'bar': return 'bar'; // با indexAxis:y
      case 'line': return 'line';
      case 'area': return 'line';
      case 'pie': return 'pie';
      case 'doughnut': return 'doughnut';
      case 'radar': return 'radar';
      case 'scatter': return 'scatter';
      case 'map': return 'map';
      default: return 'bar';
    }
  }

  return { PALETTES, TYPE_META, AGG_META, LABEL_POSITIONS, paletteColors, defaultItem, build, add, remove, duplicate, move, get, includedCharts, chartJsType, sourceRows };
})();
