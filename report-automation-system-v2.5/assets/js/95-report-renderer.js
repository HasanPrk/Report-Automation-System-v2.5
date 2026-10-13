/* ═══════════════════════════════════════════════════════════
   reportRenderer — ساخت مدل گزارش و پیش‌نمایش زنده
   پشتیبانی: هویت بصری (لوگو/پالت/برچسب)، زبان، فونت، تنظیمات صفحه
   (اندازه/مارجین)، شکست صفحه دستی، نمودارهای کاربر از استودیو نمودار
   ═══════════════════════════════════════════════════════════ */
'use strict';

const reportRenderer = (function () {
  const F = () => Store.state.flow;
  let _charts = [];
  let _noAnim = false;

  const DEFAULT_COLORS = ['#2f6fed', '#16a34a', '#d97706', '#8b5cf6', '#0e7f96', '#d23b3b', '#64748b', '#c026d3'];
  const MM = 3.7795; // پیکسل بر میلی‌متر در 96dpi

  const LABEL_DEFS = {
    none: null,
    public: { text: 'عمومی', cls: '#178a50' },
    internal: { text: 'داخلی', cls: '#2f6fed' },
    confidential: { text: 'محرمانه', cls: '#d23b3b' }
  };

  /* ترجمه عناوین نقش‌ها برای گزارش انگلیسی */
  const ROLE_TITLE_EN = {
    summary: 'Executive Summary', objective: 'Objective & Scope', data_source: 'Data Source & Quality',
    findings: 'Key Findings', trends: 'Trends & Changes', comparisons: 'Operational Comparisons',
    anomalies: 'Anomalies & Risks', interpretation: 'Management Interpretation',
    recommendations: 'Operational Recommendations', limitations: 'Limitations', conclusion: 'Conclusion'
  };
  const UI_LABELS = {
    fa: { page: (a, b) => `صفحه ${Utils.faDig(a)} از ${Utils.faDig(b)}`, footer: 'گزارش‌ساز هوشمند سازمانی — نسخه ۲٫۵', date: 'تاریخ گزارش', source: 'منبع داده', records: 'رکورد', template: 'قالب', period: 'دوره', prepared: 'تهیه‌کننده', tableRecs: 'تعداد رکورد', tableVal: 'مقدار', tableGroup: 'گروه', label: 'برچسب' },
    en: { page: (a, b) => `Page ${a} of ${b}`, footer: 'Smart Enterprise Report Builder — v2.5', date: 'Report date', source: 'Data source', records: 'records', template: 'Template', period: 'Period', prepared: 'Prepared by', tableRecs: 'Records', tableVal: 'Value', tableGroup: 'Group', label: 'Classification' }
  };

  function colors() {
    const f = F();
    const b = f.report.branding || {};
    if (b.paletteId && b.paletteId.startsWith('custom:') && b.customColors && b.customColors.length) return b.customColors;
    return (chartBuilder.PALETTES[b.paletteId || 'corporate-blue'] || chartBuilder.PALETTES['corporate-blue']).colors.slice();
  }

  function uiLang() { return UI_LABELS[F().report.lang || 'fa'] || UI_LABELS.fa; }
  function isEn() { return (F().report.lang || 'fa') === 'en'; }

  function fmtNum(v, frac) {
    const n = typeof v === 'string' ? Utils.parseNum(v) : v;
    if (n === null || n === undefined || !isFinite(n)) return String(v == null ? '' : v);
    return isEn()
      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: frac == null ? 2 : frac }).format(n)
      : Utils.nf(n, { maximumFractionDigits: frac == null ? 2 : frac });
  }

  /* ---------- مدل گزارش ---------- */
  function buildModel() {
    const f = F();
    const ds = f.active;
    const tpl = templateManager.get(f.templates.selectedId);
    if (!ds || !tpl) return null;
    const gen = f.ai.generated;
    const meta = f.report.meta || {};
    const labelId = f.report.label || 'none';
    /* نسخه ۲٫۴: برچسب‌های متن ساده «تهیه‌کننده» و «نام سازمان» — بدون رنگ و کادر،
       مقدار از مشخصات گزارش (تهیه‌کننده / نام سازمان) برداشته می‌شود */
    const label = labelId === 'custom' ? (f.report.customLabel || 'برچسب سفارشی')
      : labelId === 'prepared' ? (meta.preparedBy ? (isEn() ? 'Prepared by: ' + meta.preparedBy : 'تهیه‌کننده: ' + meta.preparedBy) : null)
      : labelId === 'org' ? (meta.org ? (isEn() ? 'Organization: ' + meta.org : 'نام سازمان: ' + meta.org) : null)
      : (LABEL_DEFS[labelId] ? LABEL_DEFS[labelId].text : null);
    const labelBare = (labelId === 'prepared' || labelId === 'org');
    return {
      meta: {
        title: meta.title || 'گزارش مدیریتی',
        org: meta.org || '',
        period: meta.period || '',
        preparedBy: meta.preparedBy || '',
        date: Utils.todayJalali(),
        sourceName: f.source ? f.source.name : '—',
        templateName: tpl.name,
        aiMode: gen ? gen.meta.provider : '—',
        rowCount: ds.rows.length
      },
      label: label,
      labelBare: labelBare,
      labelColor: labelId === 'custom' ? '#b9770e' : (LABEL_DEFS[labelId] ? LABEL_DEFS[labelId].cls : null),
      tpl, gen,
      spec: templateManager.effectiveSpec(tpl, ds)
    };
  }

  function fmtValue(defId, val, results) {
    const r = results.find(x => x.def.id === defId);
    if (val === null || val === undefined) return '—';
    const op = r ? r.def.op : '';
    if (op === 'pctFiltered') return fmtNum(val, 1) + (isEn() ? '%' : '٪');
    if (/revenue|sum|mean|median|min|max|group/i.test(defId + op)) {
      const n = Utils.parseNum(val);
      if (n !== null && Math.abs(n) >= 1000) return fmtNum(Math.round(n), 0);
    }
    if (typeof val === 'number' && !Number.isInteger(val)) return fmtNum(val);
    return typeof val === 'number' ? fmtNum(val, 0) : String(val);
  }

  /* ---------- اجزای گزارش ---------- */
  function kpiCards(model) {
    const f = F();
    const results = f.calc.results.filter(r => r.ok);
    let ids = model.spec.kpiIds || [];
    if (!ids.length) {
      ids = results.filter(r => r.value !== undefined && r.table === undefined).slice(0, 4).map(r => r.def.id);
    }
    const cards = ids.map(id => {
      const r = results.find(x => x.def.id === id);
      if (!r || r.value === undefined) return null;
      const metaTxt = [];
      if (r.meta && r.meta.n !== undefined && ['sum', 'mean', 'median'].includes(r.def.op)) metaTxt.push('n=' + fmtNum(r.meta.n, 0));
      return `<div class="rp-kpi"><div class="k">${Utils.esc(r.def.label)}</div><div class="v">${fmtValue(id, r.value, results)}</div>${metaTxt.length ? `<div class="m">${Utils.esc(metaTxt.join(' • '))}</div>` : ''}</div>`;
    }).filter(Boolean);
    return cards.length ? `<div class="rp-kpi-grid">${cards.join('')}</div>` : '';
  }

  function tableHTML(res) {
    if (!res || !res.ok || !res.table) return '';
    const L = uiLang();
    const head = '<tr><th>' + (res.def.groupBy || L.tableGroup) + '</th><th>' + L.tableRecs + '</th><th>' + (res.def.op === 'groupCount' ? L.tableRecs : L.tableVal) + '</th></tr>';
    const body = res.table.slice(0, 12).map(r => `<tr><td>${Utils.esc(r.label)}</td><td>${fmtNum(r.count, 0)}</td><td>${r.value === null ? '—' : fmtNum(r.value)}</td></tr>`).join('');
    return `<table class="rp-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  function userChartHTML(item, mountId) {
    const res = chartBuilder.build(item);
    if (!res.ok) return '';
    if (item.type === 'kpi') {
      return `<div class="rp-kpi-grid"><div class="rp-kpi"><div class="k">${Utils.esc(res.label)}</div><div class="v">${fmtNum(res.scalar)}</div></div></div>`;
    }
    if (item.type === 'map') {
      const rows = res.regions.map(r => `<tr><td>${Utils.esc(r.key)}</td><td>${Utils.esc(iranMap.capitalOf(r.key))}</td><td>${fmtNum(r.value)}</td><td>${fmtNum(r.count, 0)}</td></tr>`).join('');
      return `<div class="chart-box"><div class="chart-title">${Utils.esc(item.title)} — تفکیک استانی</div>
        <table class="rp-table"><thead><tr><th>استان</th><th>مرکز</th><th>${Utils.esc(item.agg === 'count' ? (isEn() ? 'Count' : 'تعداد') : item.valCol)}</th><th>${isEn() ? 'Records' : 'تعداد رکورد'}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (item.type === 'table') {
      const rows = res.labels.map((l, i) => `<tr><td>${Utils.esc(l)}</td><td>${fmtNum(res.counts[i], 0)}</td><td>${fmtNum(res.values[i])}</td></tr>`).join('');
      return `<table class="rp-table"><thead><tr><th>${Utils.esc(item.catCol || '')}</th><th>${isEn() ? 'Records' : 'تعداد'}</th><th>${Utils.esc(item.agg === 'count' ? (isEn() ? 'Count' : 'تعداد') : item.valCol)}</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    return `<div class="chart-box" data-user-chart="${item.id}"><div class="chart-title">${Utils.esc(item.title)}</div><div class="chart-canvas-wrap" style="height:${Math.min(item.opts.height, 300)}px"><canvas id="${mountId}"></canvas></div></div>`;
  }

  function getCalcResult(model, calcId) {
    const f = F();
    let id = calcId;
    if (id === 'auto-breakdown' || id === 'auto_auto-breakdown') id = calculationEngine.resolveAuto('auto-breakdown');
    return f.calc.results.find(r => r.def.id === id) || null;
  }

  /* ---------- گزینه‌های Chart.js ---------- */
  function chartOptions(extra) {
    const c = colors();
    const base = {
      responsive: true, maintainAspectRatio: false, animation: { duration: _noAnim ? 0 : 350 },
      plugins: {
        legend: { display: false, rtl: !isEn(), labels: { font: { family: paperFontFamily() } } },
        tooltip: { rtl: !isEn(), titleFont: { family: paperFontFamily() }, bodyFont: { family: paperFontFamily() } }
      },
      scales: {
        x: { ticks: { font: { family: paperFontFamily(), size: 10.5 } }, grid: { display: false } },
        y: { ticks: { font: { family: paperFontFamily(), size: 10.5 }, callback: (v) => fmtNum(v) }, grid: { color: 'rgba(120,130,150,.14)' } }
      }
    };
    return Object.assign(base, extra || {});
  }

  function drawStandardChart(cv, res) {
    const c = colors();
    if (res.series) {
      _charts.push(new Chart(cv, {
        type: 'line',
        data: { labels: res.series.map(s => s.label), datasets: [{ label: res.def.label, data: res.series.map(s => s.value), borderColor: c[0], backgroundColor: c[0] + '22', fill: true, tension: .32, pointRadius: 3.4, borderWidth: 2.4 }] },
        options: chartOptions()
      }));
    } else if (res.table) {
      const rows = res.table.slice(0, 8).filter(r => r.value !== null && r.value !== undefined);
      _charts.push(new Chart(cv, {
        type: 'bar',
        data: {
          labels: rows.map(r => r.label),
          datasets: [{ label: res.def.label, data: rows.map(r => r.value), backgroundColor: rows.map((_, i) => c[i % c.length] + 'cc'), borderRadius: 6 }]
        },
        options: chartOptions()
      }));
    }
  }

  function drawUserChart(cv, item) {
    const res = chartBuilder.build(item);
    if (!res.ok) return;
    const c = colors();
    const font = { family: paperFontFamily() };
    const type = chartBuilder.chartJsType(item);
    if (item.type === 'map') return; /* نقشه در گزارش به‌صورت جدول تفکیک استانی رندر شده است */
    if (item.type === 'scatter') {
      _charts.push(new Chart(cv, {
        type: 'scatter',
        data: { datasets: [{ label: item.title, data: res.points, backgroundColor: c[0] + 'cc', pointRadius: 4 }] },
        options: chartOptions({
          plugins: { legend: { display: item.opts.legend, labels: { font } }, tooltip: { rtl: !isEn(), titleFont: font, bodyFont: font } },
          scales: {
            x: { title: { display: true, text: res.xLabel, font }, ticks: { font } },
            y: { title: { display: true, text: res.yLabel, font }, ticks: { font, callback: v => fmtNum(v) } }
          }
        })
      }));
    } else if (type === 'pie' || type === 'doughnut') {
      _charts.push(new Chart(cv, {
        type,
        data: { labels: res.labels, datasets: [{ data: res.values, backgroundColor: res.labels.map((_, i) => c[i % c.length] + 'dd'), borderWidth: 1.4 }] },
        options: chartOptions({ plugins: { legend: { display: item.opts.legend, position: 'left', rtl: !isEn(), labels: { font, boxWidth: 12 } }, tooltip: { rtl: !isEn(), titleFont: font, bodyFont: font } } })
      }));
    } else if (type === 'radar') {
      _charts.push(new Chart(cv, {
        type: 'radar',
        data: { labels: res.labels, datasets: [{ label: item.title, data: res.values, borderColor: c[0], backgroundColor: c[0] + '33', pointBackgroundColor: c[0] }] },
        options: chartOptions({ scales: { r: { ticks: { font, callback: v => fmtNum(v) }, pointLabels: { font } } } })
      }));
    } else if (item.type === 'line' || item.type === 'area') {
      _charts.push(new Chart(cv, {
        type: 'line',
        data: { labels: res.labels, datasets: [{ label: item.title, data: res.values, borderColor: c[0], backgroundColor: c[0] + '22', fill: item.type === 'area', tension: .32, pointRadius: 3.2, borderWidth: 2.4 }] },
        options: chartOptions()
      }));
    } else if (item.type === 'bar') {
      _charts.push(new Chart(cv, {
        type: 'bar',
        data: { labels: res.labels, datasets: [{ label: item.title, data: res.values, backgroundColor: res.values.map((_, i) => c[i % c.length] + 'cc'), borderRadius: 5 }] },
        options: chartOptions({ indexAxis: 'y' })
      }));
    } else { // column
      _charts.push(new Chart(cv, {
        type: 'bar',
        data: { labels: res.labels, datasets: [{ label: item.title, data: res.values, backgroundColor: res.values.map((_, i) => c[i % c.length] + 'cc'), borderRadius: 6 }] },
        options: chartOptions()
      }));
    }
  }

  /* ---------- فونت کاغذ ---------- */
  function paperFontFamily() {
    const out = F().report.output || {};
    const fa = out.fontFa || 'Vazirmatn FD';
    const en = out.fontEn || 'Arial';
    return `'${fa}', '${en}', Tahoma, sans-serif`;
  }

  /* ---------- رندر قالب سفارشی ---------- */
  function kpiCardFor(calcId, model) {
    const f = F();
    const res = f.calc.results.find(r => r.def.id === calcId || r.def.id === 'auto_' + calcId);
    if (!res || res.value === undefined) return '';
    const results = f.calc.results.filter(r => r.ok);
    return `<div class="rp-kpi-grid"><div class="rp-kpi"><div class="k">${Utils.esc(res.def.label)}</div><div class="v">${fmtValue(res.def.id, res.value, results)}</div>${res.meta && res.meta.n !== undefined ? `<div class="m">n=${fmtNum(res.meta.n, 0)}</div>` : ''}</div></div>`;
  }

  function buildCustomPages(model) {
    let html = model.tpl.html;
    const metaMap = {
      report_title: model.meta.title, report_date: isEn() ? new Date().toLocaleDateString('en-GB') : Utils.faDig(model.meta.date), today: isEn() ? new Date().toLocaleDateString('en-GB') : Utils.faDig(model.meta.date),
      org_name: model.meta.org, report_period: model.meta.period, prepared_by: model.meta.preparedBy,
      data_source: model.meta.sourceName, row_count: fmtNum(model.meta.rowCount, 0), template_name: model.meta.templateName
    };
    model.tpl.placeholders.forEach(ph => {
      let repl = '';
      if (!ph.token.includes(':') || ph.type === 'meta') {
        const v = metaMap[ph.key] !== undefined ? metaMap[ph.key] : metaMap[ph.token];
        if (v !== undefined) repl = Utils.esc(v);
        else {
          const res = F().calc.results.find(r => r.def.id === ph.token && r.value !== undefined);
          repl = res ? fmtValue(res.def.id, res.value, F().calc.results.filter(r => r.ok)) : '—';
        }
      } else if (ph.type === 'section') {
        const sec = model.gen ? model.gen.sections.find(s => s.role === ph.key || s.id === ph.key) : null;
        repl = sec && sec.status !== 'rejected' && sec.body ? `<p class="rp-text">${Utils.esc(sec.body)}</p>` : '';
      } else if (ph.type === 'kpi') {
        repl = kpiCardFor(ph.key, model);
      } else if (ph.type === 'table') {
        const res = getCalcResult(model, ph.key);
        repl = res && res.ok ? tableHTML(res) : '';
      } else if (ph.type === 'chart') {
        const res = getCalcResult(model, ph.key);
        if (res && res.ok) {
          const cid = 'chart-' + Utils.uid('c');
          repl = `<div class="chart-box" data-chart-res="${Utils.esc(res.def.id)}"><div class="chart-title">${Utils.esc(res.def.label)}</div><div class="chart-canvas-wrap"><canvas id="${cid}"></canvas></div></div>`;
        }
      }
      html = html.split('{{' + ph.token + '}}').join(repl);
      html = html.split('{{ ' + ph.token + ' }}').join(repl);
    });
    return [{ custom: html }];
  }

  /* ---------- ساخت بلوک‌ها (با پشتیبانی شکست دستی و نمودار کاربر) ---------- */
  function buildBlocks(model) {
    const f = F();
    const gen = model.gen;
    const blocks = [];
    model.tpl.structure.forEach(sec => {
      if (sec.type === 'kpi') { blocks.push({ key: 'kpi:' + sec.id, type: 'kpi', title: sec.title }); return; }
      if (sec.type === 'text') {
        const g = gen ? gen.sections.find(s => s.id === sec.id || s.role === sec.role) : null;
        if (g && g.status !== 'rejected' && g.body) {
          const title = isEn() && ROLE_TITLE_EN[sec.role] ? ROLE_TITLE_EN[sec.role] : g.title;
          blocks.push({ key: 'text:' + sec.id, type: 'text', section: g, title });
        }
        return;
      }
      if (sec.type === 'table' || sec.type === 'chart') {
        const res = getCalcResult(model, sec.calcId);
        if (res && res.ok) blocks.push({ key: sec.type + ':' + sec.id, type: sec.type, res, title: sec.title });
      }
    });
    // نمودارهای کاربر که «درج در گزارش» دارند
    chartBuilder.includedCharts().forEach(it => {
      blocks.push({ key: 'userchart:' + it.id, type: 'userChart', item: it, title: it.title });
    });
    return blocks;
  }

  function buildPages(model) {
    if (model.tpl.kind === 'custom') return buildCustomPages(model);
    const f = F();
    const breaks = new Set(f.report.breaks || []);
    const blocks = buildBlocks(model);
    const pages = [];
    let page = { sections: [] };
    const push = (b) => page.sections.push(b);
    const breakPage = () => { if (page.sections.length) { pages.push(page); page = { sections: [] }; } };

    blocks.forEach(b => {
      // شکست خودکار قبل از جدول/نمودار + شکست دستی کاربر
      if (breaks.has(b.key) || b.type === 'table' || b.type === 'chart' || b.type === 'userChart') breakPage();
      push(b);
    });
    breakPage();
    pages.push(page);
    return pages;
  }

  /* ---------- HTML کاغذ ---------- */
  function paperVars() {
    const f = F();
    const ps = f.report.pageSetup || { size: 'A4', orientation: 'portrait', custom: { w: 210, h: 297 }, margins: { t: 20, r: 18, b: 22, l: 18 } };
    let w = ps.custom.w, h = ps.custom.h;
    if (ps.orientation === 'landscape') { const t = w; w = h; h = t; }   /* جهت افقی: جابه‌جایی عرض/ارتفاع */
    w = Math.round(w * MM); h = Math.round(h * MM);
    const m = ps.margins;
    syncPrintPageRule(w / MM, h / MM);
    /* --pb: حاشیه پایین برای جای‌گذاری دقیق پابرگ در همان نوار حاشیه (چاپ و پیش‌نمایش یکسان) */
    return `width:${w}px;min-height:${h}px;--pb:${Math.round(m.b * MM)}px;padding:${Math.round(m.t * MM)}px ${Math.round(m.r * MM)}px ${Math.round(m.b * MM)}px ${Math.round(m.l * MM)}px;`;
  }

  /* قانون @page چاپ — یک منبع واحد حقیقت: اندازه/جهت از تنظیمات صفحه، margin صفر
     (حاشیه‌ها با padding خود کاغذ اعمال می‌شوند تا Header/Footer در چاپ دقیقاً
     همان جای پیش‌نمایش بنشیند — رفع بهم‌ریختگی چاپ نسخه ۲٫۴) */
  let _pageRuleEl = null;
  function syncPrintPageRule(wMm, hMm) {
    try {
      if (!_pageRuleEl) {
        _pageRuleEl = document.createElement('style');
        _pageRuleEl.id = 'dynamic-page-rule';
        document.head.appendChild(_pageRuleEl);
      }
      _pageRuleEl.textContent = `@media print { @page { size: ${Math.round(wMm)}mm ${Math.round(hMm)}mm; margin: 0; } }`;
    } catch (e) { /* محیط بدون DOM (تست) — نادیده گرفته می‌شود */ }
  }

  function paperHTML(model, page, pageNo, total, forPrint) {
    const m = model.meta;
    const L = uiLang();
    const c = colors();
    const accent = c[0];
    /* برچسب گزارش — متن ساده کنار مشخصات (بدون رنگ و کادر — نسخه ۲٫۴)
       برچسب‌های «تهیه‌کننده/نام سازمان» بدون پیشوند «برچسب:» رندر می‌شوند */
    const labelPlain = model.label ? (model.labelBare ? `<div class="rp-label-plain">${Utils.esc(model.label)}</div>` : `<div class="rp-label-plain"><span>${L.label}:</span> ${Utils.esc(model.label)}</div>`) : '';
    const logo = (F().report.branding && F().report.branding.logo)
      ? `<img class="rp-logo" src="${F().report.branding.logo}" alt="logo">` : '';

    if (page.custom) {
      return `<div class="paper" data-page="${pageNo}" dir="${isEn() ? 'ltr' : 'rtl'}" style="min-height:auto">
        <div class="paper-inner">${page.custom}</div>
        <div class="rp-footer"><span>${L.footer}</span><span>${L.page(pageNo, total)}</span></div>
      </div>`;
    }
    let inner = '';
    page.sections.forEach(s => {
      if (s.type === 'kpi') {
        inner += kpiCards(model);
      } else if (s.type === 'text') {
        inner += `<h3 class="rp-sec" style="border-inline-start-color:${accent}">${Utils.esc(s.title)}</h3><p class="rp-text">${Utils.esc(s.section.body)}</p>`;
      } else if (s.type === 'table') {
        inner += `<h3 class="rp-sec" style="border-inline-start-color:${accent}">${Utils.esc(s.title || '')}</h3>` + tableHTML(s.res);
      } else if (s.type === 'chart') {
        const cid = 'chart-' + Utils.uid('c');
        inner += `<h3 class="rp-sec" style="border-inline-start-color:${accent}">${Utils.esc(s.title || '')}</h3>` +
          `<div class="chart-box" data-chart-res="${Utils.esc(s.res.def.id)}"><div class="chart-canvas-wrap"><canvas id="${cid}"></canvas></div></div>`;
      } else if (s.type === 'userChart') {
        const cid = 'uchart-' + Utils.uid('u');
        inner += userChartHTML(s.item, cid);
      }
    });
    /* حالت Demo فقط یک‌بار در رابط کاربری اعلام می‌شود (نشان وضعیت AI + بخش تولید گزارش)،
       نه به‌صورت کادر تکراری در تک‌تک صفحات گزارش. */
    return `<div class="paper" data-page="${pageNo}" dir="${isEn() ? 'ltr' : 'rtl'}" style="${paperVars()}">
      <div class="paper-inner">
      <div class="rp-header" style="border-bottom-color:${accent}">
        <div class="rp-header-main">
          ${logo}
          <div>
            ${m.org ? `<div class="rp-org">${Utils.esc(m.org)}</div>` : ''}
            <div class="rp-title">${Utils.esc(m.title)}</div>
            ${m.period ? `<div class="rp-subtitle">${L.period}: ${Utils.esc(m.period)}</div>` : ''}
          </div>
        </div>
        <div class="rp-meta">
          ${labelPlain}
          ${m.preparedBy ? `${L.prepared}: ${Utils.esc(m.preparedBy)}<br>` : ''}
          ${L.date}: ${isEn() ? new Date().toLocaleDateString('en-GB') : Utils.faDig(m.date)}<br>
          ${L.source}: ${Utils.esc(m.sourceName)} (${fmtNum(m.rowCount, 0)} ${L.records})
        </div>
      </div>
      ${inner}
      </div>
      <div class="rp-footer">
        <span>${L.footer}</span>
        <span>${L.page(pageNo, total)}</span>
      </div>
    </div>`;
  }

  function afterMountCharts(model, rootEl) {
    rootEl.querySelectorAll('.chart-box[data-chart-res]').forEach(box => {
      const id = box.getAttribute('data-chart-res');
      const res = getCalcResult(model, id);
      const cv = box.querySelector('canvas');
      if (!res || !res.ok || !cv) return;
      drawStandardChart(cv, res);
    });
    rootEl.querySelectorAll('.chart-box[data-user-chart]').forEach(box => {
      const item = chartBuilder.get(box.getAttribute('data-user-chart'));
      const cv = box.querySelector('canvas');
      if (!item || !cv) return;
      drawUserChart(cv, item);
    });
  }

  function destroyCharts() {
    _charts.forEach(c => { try { c.destroy(); } catch (e) { /* ignore */ } });
    _charts = [];
  }

  /* ---------- پیش‌نمایش زنده ---------- */
  let _zoom = 0.85;
  function renderPreview(stageEl) {
    destroyCharts();
    const model = buildModel();
    if (!model) {
      stageEl.innerHTML = UIKit.emptyState('fileText', 'گزارشی برای پیش‌نمایش وجود ندارد', 'ابتدا مراحل قبلی را کامل کنید.');
      return null;
    }
    const pages = buildPages(model);
    const total = pages.length;
    stageEl.innerHTML = pages.map((p, i) => paperHTML(model, p, i + 1, total)).join('');
    afterMountCharts(model, stageEl);
    applyZoom(stageEl);
    injectDynamicPageStyle();
    mountBreakHandles(stageEl, pages);
    F().report.renderedAt = new Date().toISOString();
    WorkflowManager.refresh();
    return { model, pages };
  }

  /* استایل داینامیک اندازه/مارجین صفحه برای چاپ — هماهنگ با syncPrintPageRule
     (اندازه/جهت کامل + margin صفر؛ حاشیه‌ها با padding کاغذ اعمال می‌شوند) */
  function injectDynamicPageStyle() {
    const f = F();
    const ps = f.report.pageSetup || { size: 'A4', orientation: 'portrait', custom: { w: 210, h: 297 } };
    let w = ps.custom.w, h = ps.custom.h;
    if (ps.orientation === 'landscape') { const t = w; w = h; h = t; }
    syncPrintPageRule(w, h);
  }

  /* ---------- دستگیره‌های شکست صفحه (drag & drop) ---------- */
  function mountBreakHandles(stageEl, pages) {
    const f = F();
    const breakEdit = !!f.report.breakEdit;
    if (!breakEdit) return;
    // در حالت ویرایش، بلوک‌ها به‌صورت فهرست خطی با نشانگرهای درج نمایش داده می‌شوند
    stageEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'break-editor';
    const allBlocks = buildBlocks(buildModel());
    let dragKey = null;

    const dropZoneHTML = (beforeKey) => `<div class="brk-drop" data-before="${Utils.esc(beforeKey || '__end__')}">
        <span class="brk-drop-line"></span>
        <span class="brk-drop-chip">${Utils.icon('scissors', 12)} رهاسازی برای درج شکست</span>
      </div>`;

    let h = dropZoneHTML(allBlocks.length ? allBlocks[0].key : '__end__');
    allBlocks.forEach(b => {
      const hasBreak = (F().report.breaks || []).includes(b.key);
      h += `<div class="brk-block ${hasBreak ? 'has-break' : ''}" draggable="true" data-key="${Utils.esc(b.key)}">
          <span class="brk-handle" title="بکشید و بین بخش‌ها رها کنید">${Utils.icon('grid', 12)}</span>
          <span class="brk-block-title">${Utils.esc(b.title || (b.type === 'kpi' ? 'شاخص‌های کلیدی' : b.type))}</span>
          <span class="badge ${hasBreak ? 'badge-warning' : 'badge-neutral'}">${hasBreak ? 'شکست قبل از این بخش' : ''}</span>
          <button class="btn btn-sm ${hasBreak ? 'btn-ghost' : 'btn-secondary'}" data-toggle-break="${Utils.esc(b.key)}">${hasBreak ? 'حذف شکست' : 'درج شکست'}</button>
        </div>`;
      h += dropZoneHTML(allBlocks[allBlocks.indexOf(b) + 1] ? allBlocks[allBlocks.indexOf(b) + 1].key : '__end__');
    });
    wrap.innerHTML = h;
    stageEl.appendChild(wrap);

    wrap.querySelectorAll('.brk-block').forEach(bl => {
      bl.addEventListener('dragstart', (e) => { dragKey = bl.dataset.key; e.dataTransfer.effectAllowed = 'move'; });
      bl.addEventListener('dragend', () => { dragKey = null; });
    });
    wrap.querySelectorAll('.brk-drop').forEach(dz => {
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
      dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        // محل رهاسازی تعیین‌کننده است: شکست قبل از بخشِ بعد از این ناحیه درج می‌شود
        const before = dz.dataset.before;
        if (before === '__end__' || !allBlocks.some(b => b.key === before)) { dragKey = null; return; }
        const breaks = new Set(F().report.breaks || []);
        breaks.add(before);
        F().report.breaks = [...breaks];
        dragKey = null;
        renderPreview(stageEl);
      });
      dz.addEventListener('click', () => {
        const before = dz.dataset.before;
        if (before === '__end__' || !allBlocks.some(b => b.key === before)) return;
        const breaks = new Set(F().report.breaks || []);
        if (breaks.has(before)) breaks.delete(before); else breaks.add(before);
        F().report.breaks = [...breaks];
        renderPreview(stageEl);
      });
    });
    wrap.querySelectorAll('[data-toggle-break]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggleBreak;
        const breaks = new Set(F().report.breaks || []);
        if (breaks.has(key)) breaks.delete(key); else breaks.add(key);
        F().report.breaks = [...breaks];
        renderPreview(stageEl);
      });
    });
  }

  function applyZoom(stageEl) {
    stageEl.querySelectorAll('.paper').forEach(p => { p.style.transform = `scale(${_zoom})`; });
    stageEl.style.height = '';
  }
  function zoom(stageEl, dir) {
    _zoom = Math.min(1.4, Math.max(0.55, _zoom + dir * 0.12));
    applyZoom(stageEl);
    return _zoom;
  }
  function getZoom() { return _zoom; }

  /* ---------- ساخت DOM چاپ ---------- */
  function buildPrintDOM(printRoot) {
    destroyCharts();
    const model = buildModel();
    if (!model) return false;
    const pages = buildPages(model);
    const total = pages.length;
    printRoot.innerHTML = pages.map((p, i) => paperHTML(model, p, i + 1, total, true)).join('');
    injectDynamicPageStyle();
    afterMountCharts(model, printRoot);
    return { model, pageCount: total };
  }

  /* ---------- Markdown ---------- */
  function buildMarkdown() {
    const model = buildModel();
    if (!model) return null;
    const f = F();
    const L = uiLang();
    const md = [];
    md.push('# ' + model.meta.title);
    if (model.label) md.push(`> **${model.label}**`);
    md.push('');
    md.push(`- ${L.date}: ${model.meta.date}`);
    if (model.meta.org) md.push(`- ${L.prepared}: ${model.meta.org}`);
    if (model.meta.period) md.push(`- ${L.period}: ${model.meta.period}`);
    md.push(`- ${L.source}: ${model.meta.sourceName} (${model.meta.rowCount} ${L.records})`);
    md.push(`- ${L.template}: ${model.meta.templateName}`);
    md.push('');
    // KPI
    const results = f.calc.results.filter(r => r.ok && r.value !== undefined && r.table === undefined);
    if (results.length) {
      md.push('## KPI');
      md.push('');
      md.push('| # | ' + (isEn() ? 'Indicator' : 'شاخص') + ' | ' + (isEn() ? 'Value' : 'مقدار') + ' |');
      md.push('|---|---|---|');
      results.slice(0, 8).forEach((r, i) => md.push(`| ${i + 1} | ${r.def.label} | ${fmtValue(r.def.id, r.value, results)} |`));
      md.push('');
    }
    const blocks = buildBlocks(model);
    blocks.forEach(b => {
      if (b.type === 'text') {
        md.push('## ' + b.title);
        md.push('');
        md.push(b.section.body);
        md.push('');
      } else if (b.type === 'table' || b.type === 'userChart' && b.item.type === 'table') {
        let res = b.type === 'table' ? b.res : chartBuilder.build(b.item);
        if (res && res.ok && res.labels) {
          md.push('## ' + (b.title || b.item.title));
          md.push('');
          md.push('| ' + (b.item ? (b.item.catCol || '') : (res.def.groupBy || 'Group')) + ' | Count | Value |');
          md.push('|---|---|---|');
          res.labels.forEach((l, i) => md.push(`| ${l} | ${res.counts[i]} | ${res.values[i]} |`));
          md.push('');
        }
      } else if (b.type === 'chart') {
        md.push('## ' + b.title);
        md.push('');
        md.push(`*[Chart: ${b.res.def.label} — see PDF/HTML output]*`);
        md.push('');
      } else if (b.type === 'userChart') {
        md.push('## ' + b.item.title);
        md.push('');
        md.push(`*[Chart (${b.item.type}): ${b.item.catCol || ''} / ${b.item.valCol || ''} — see PDF/HTML output]*`);
        md.push('');
      }
    });
    if (model.gen && model.gen.meta.disclaimer) {
      md.push('---');
      md.push('');
      md.push('*' + model.gen.meta.disclaimer + '*');
    }
    return md.join('\n');
  }

  /* ---------- Word / Google Docs (HTML در قالب doc) ---------- */
  function buildWordHTML() {
    const model = buildModel();
    if (!model) return null;
    const f = F();
    const blocks = buildBlocks(model);
    const c = colors();
    const bodyParts = [];
    bodyParts.push(`<h1>${Utils.esc(model.meta.title)}</h1>`);
    if (model.label) bodyParts.push(`<p><b>[${Utils.esc(model.label)}]</b></p>`);
    bodyParts.push(`<p>${Utils.esc(model.meta.org ? model.meta.org + ' — ' : '')}${model.meta.date} | ${model.meta.sourceName} | ${model.meta.rowCount} ${uiLang().records}</p><hr>`);
    const results = f.calc.results.filter(r => r.ok && r.value !== undefined && r.table === undefined);
    if (results.length) {
      bodyParts.push('<h2>KPI</h2><ul>' + results.slice(0, 8).map(r => `<li><b>${Utils.esc(r.def.label)}:</b> ${fmtValue(r.def.id, r.value, results)}</li>`).join('') + '</ul>');
    }
    blocks.forEach(b => {
      if (b.type === 'text') {
        bodyParts.push(`<h2>${Utils.esc(b.title)}</h2><p>${Utils.esc(b.section.body).replace(/\n/g, '<br>')}</p>`);
      } else if (b.type === 'table') {
        bodyParts.push(`<h3>${Utils.esc(b.title)}</h3>` + tableHTML(b.res).replace(/ class="rp-table"/g, ' border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse"'));
      } else if (b.type === 'userChart' && b.item.type === 'table') {
        const res = chartBuilder.build(b.item);
        if (res.ok) {
          const rows = res.labels.map((l, i) => `<tr><td>${Utils.esc(l)}</td><td>${res.counts[i]}</td><td>${res.values[i]}</td></tr>`).join('');
          bodyParts.push(`<h3>${Utils.esc(b.item.title)}</h3><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse"><tr><th>${Utils.esc(b.item.catCol || '')}</th><th>Count</th><th>Value</th></tr>${rows}</table>`);
        }
      } else if (b.type === 'chart') {
        bodyParts.push(`<h3>${Utils.esc(b.title)}</h3><p>[نمودار: ${Utils.esc(b.res.def.label)} — در خروجی PDF/HTML قابل مشاهده است]</p>`);
      } else if (b.type === 'userChart') {
        bodyParts.push(`<h3>${Utils.esc(b.item.title)}</h3><p>[نمودار (${b.item.type}) — در خروجی PDF/HTML قابل مشاهده است]</p>`);
      } else if (b.type === 'kpi') {
        bodyParts.push(kpiCards(model));
      }
    });
    if (model.gen && model.gen.meta.disclaimer) bodyParts.push(`<hr><p><i>${Utils.esc(model.gen.meta.disclaimer)}</i></p>`);
    const logo = (f.report.branding && f.report.branding.logo && !f.report.branding.logo.startsWith('data:image/svg')) ? `<p><img src="${f.report.branding.logo}" style="max-height:70px"></p>` : '';
    const font = paperFontFamily();
    return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="${f.report.lang}" dir="${isEn() ? 'ltr' : 'rtl'}">
<head><meta charset="UTF-8"><title>${Utils.esc(model.meta.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>body{font-family:${font};font-size:12.5px;line-height:1.9;${isEn() ? '' : 'text-align:right;'}}h1{color:${c[0]};}h2,h3{color:#1f2937;border-inline-start:none;}table{font-size:11.5px;}td,th{border:1px solid #ccc;padding:4px 8px;}</style>
</head><body>${logo}${bodyParts.join('\n')}</body></html>`;
  }

  /* ---------- خروجی HTML مستقل ---------- */
  async function buildStandaloneHTMLAsync() {
    const model = buildModel();
    if (!model) return null;
    const pages = buildPages(model);
    const total = pages.length;
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-12000px;top:0;width:820px;';
    stage.innerHTML = pages.map((p, i) => paperHTML(model, p, i + 1, total)).join('');
    document.body.appendChild(stage);
    _noAnim = true;
    afterMountCharts(model, stage);
    await new Promise(r => setTimeout(r, 450));
    const canvases = stage.querySelectorAll('canvas');
    canvases.forEach(cv => {
      try {
        const img = document.createElement('img');
        img.src = cv.toDataURL('image/png', 1);
        img.style.width = '100%';
        cv.replaceWith(img);
      } catch (e) { /* ignore */ }
    });
    destroyCharts();
    _noAnim = false;
    const inner = stage.innerHTML;
    const vars = paperVars();
    stage.remove();
    const c = colors();
    const html = `<!DOCTYPE html>
<html lang="${F().report.lang}" dir="${isEn() ? 'ltr' : 'rtl'}"><head><meta charset="UTF-8"><title>${Utils.esc(model.meta.title)}</title>
<style>
body{font-family:${paperFontFamily()};background:#eef1f6;margin:0;padding:24px;}
.paper{${vars}margin:0 auto 26px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.14);position:relative;font-size:13px;line-height:2;color:#1f2937;}
.rp-label-plain{font-size:11.5px;color:#64748b;font-weight:700;}
.rp-label-plain span{color:#94a3b8;font-weight:400;}
.rp-header{border-bottom:2.4px solid ${c[0]};padding-bottom:17px;margin-bottom:21px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px;}
.rp-header-main{display:flex;align-items:center;gap:12px;}
.rp-logo{max-height:52px;max-width:150px;object-fit:contain;}
.rp-org{font-size:12px;color:#64748b;}
.rp-title{font-size:22.5px;font-weight:800;color:#16233b;margin:3px 0 7px;}
.rp-subtitle{font-size:12.5px;color:#64748b;}
.rp-meta{text-align:left;font-size:11.5px;color:#64748b;line-height:1.9;}
h3.rp-sec{font-size:15.5px;margin:26px 0 11px;padding-inline-start:11px;border-inline-start:4px solid ${c[0]};color:#16233b;}
p.rp-text{font-size:12.8px;color:#374151;text-align:justify;white-space:pre-wrap;}
.rp-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:11px;margin:14px 0;}
.rp-kpi{background:#f1f5fd;border:1px solid #dbe6fb;border-radius:9px;padding:12px 10px;text-align:center;}
.rp-kpi .k{font-size:10.8px;color:#64748b;margin-bottom:3px;}.rp-kpi .v{font-size:17px;font-weight:800;color:#2258c9;}.rp-kpi .m{font-size:9.5px;color:#94a3b8;}
table.rp-table{width:100%;border-collapse:collapse;font-size:11.6px;margin:12px 0;}
table.rp-table th{background:#16233b;color:#fff;padding:7px 9px;text-align:right;border:1px solid #16233b;}
table.rp-table td{border:1px solid #d7dee9;padding:6px 9px;}
table.rp-table tbody tr:nth-child(even){background:#f6f8fc;}
.chart-box{border:1px solid #dbe2ec;border-radius:9px;padding:14px;margin:14px 0;}
.chart-title{font-size:13.5px;font-weight:700;margin-bottom:10px;}
.chart-canvas-wrap{height:265px;position:relative;}
.rp-footer{position:absolute;bottom:calc(var(--pb,66px) - 11mm);inset-inline:62px;border-top:1px solid #dbe2ec;padding-top:9px;display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8;}
@media print{body{background:#fff;padding:0}@page{margin:0}.paper{box-shadow:none;margin:0;page-break-after:always;break-after:page;transform:none!important}}
</style></head><body>
${inner}
</body></html>`;
    return html;
  }

  function buildStandaloneHTML() {
    return buildStandaloneHTMLAsync();
  }

  /* ---------- کپی متن ساده گزارش (برای جای‌گذاری در Google Docs) ---------- */
  function buildPlainText() {
    const model = buildModel();
    if (!model) return null;
    const blocks = buildBlocks(model);
    const parts = [model.meta.title + (model.label ? ` [${model.label}]` : ''), ''];
    blocks.forEach(b => {
      if (b.type === 'text') { parts.push(b.title, b.section.body, ''); }
      else if (b.type === 'table') {
        parts.push(b.title || 'جدول');
        if (b.res && b.res.table) {
          b.res.table.slice(0, 12).forEach(r => parts.push(`• ${r.label}: ${r.value === null ? '—' : fmtNum(r.value)} (${r.count})`));
        }
        parts.push('');
      } else if (b.type === 'kpi') {
        const results = F().calc.results.filter(r => r.ok && r.value !== undefined && r.table === undefined);
        results.slice(0, 8).forEach(r => parts.push(`• ${r.def.label}: ${fmtValue(r.def.id, r.value, results)}`));
        parts.push('');
      }
    });
    return parts.join('\n');
  }

  return {
    buildModel, renderPreview, zoom, getZoom, buildPrintDOM, buildStandaloneHTML,
    buildMarkdown, buildWordHTML, buildPlainText, destroyCharts, getCalcResult, tableHTML,
    colors, paperFontFamily, getBlockTitles
  };

  /* نقشه کلید بلوک → عنوان (برای نمایش شکست‌های دستی در UI) */
  function getBlockTitles() {
    const m = buildModel();
    if (!m) return {};
    const out = {};
    buildBlocks(m).forEach(b => {
      out[b.key] = b.title || (b.type === 'kpi' ? 'شاخص‌های کلیدی عملکرد' : b.type === 'userChart' ? (b.item && b.item.title) : b.type);
    });
    return out;
  }
})();
