/* ═══════════════════════════════════════════════════════════
   aiService — واسط تولید متن گزارش
   حالت‌ها: demo (نمایشی قاعده‌مند) | manual (خاموش — نگارش دستی کاربر) | live (اتصال با API Key کاربر)
   زبان گزارش: فارسی (fa) یا انگلیسی (en) — قاعده: هیچ عددی جعل نمی‌شود.
   پرامپت سفارشی کاربر: در demo به‌صورت جهت‌دهی سبک اعمال و شفاف اعلام می‌شود؛
   در live عیناً به مدل ارسال می‌شود.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const aiService = (function () {
  const F = () => Store.state.flow;

  const DEFAULT_PROMPT_FA = 'شما یک تحلیلگر ارشد کسب‌وکار هستید. بر اساس داده‌های ارسالی، یک گزارش مدیریتی رسمی، روان و قابل اقدام به زبان فارسی بنویسید. اعداد را دقیقاً مطابق داده‌ها بیاورید، از حدس و عدد جعلی پرهیز کنید، برای هر بخش ۳ تا ۵ جمله تحلیلی بنویسید و در پایان پیشنهادهای عملیاتی اولویت‌بندی‌شده ارائه دهید.';
  const DEFAULT_PROMPT_EN = 'You are a senior business analyst. Based on the provided data, write a formal, fluent and actionable management report. Use the exact figures from the data, avoid invented numbers, write 3-5 analytical sentences per section, and end with prioritized operational recommendations.';

  function info() {
    const f = F();
    const mode = f.ai.mode || 'demo';
    const cfg = f.ai.config || {};
    return {
      mode,
      hasKey: !!(cfg.apiKey && cfg.endpoint),
      providerName:
        mode === 'live' ? `اتصال زنده: ${cfg.model || 'مدل زبانی'}` :
        mode === 'manual' ? 'هوش مصنوعی خاموش — نگارش دستی' :
        'موتور متن نمایشی (Demo AI)',
      note:
        mode === 'live' ? `متن‌ها با فراخوانی واقعی مدل «${cfg.model || ''}» تولید می‌شوند. کلید API فقط در حافظه همین نشست نگهداری می‌شود و ذخیره نمی‌گردد.` :
        mode === 'manual' ? 'هوش مصنوعی غیرفعال است؛ متن هر بخش را خودتان می‌نویسید.' :
        'این حالت برای آزمایش جریان کاری است و پاسخ واقعی مدل هوش مصنوعی نیست؛ متن‌ها به‌صورت قاعده‌مند از نتایج واقعی محاسبات شما ساخته می‌شوند.'
    };
  }

  function isAiOff() { return (F().ai.mode || 'demo') === 'manual'; }
  function isLive() { return (F().ai.mode || 'demo') === 'live'; }
  function lang() { return F().report.lang || 'fa'; }
  function customPrompt() { return F().ai.customPrompt || ''; }
  function defaultPrompt() { return lang() === 'en' ? DEFAULT_PROMPT_EN : DEFAULT_PROMPT_FA; }

  /* ---------- تحلیل پرامپت کاربر برای حالت نمایشی (شفاف و محدود) ---------- */
  function promptHints() {
    const p = customPrompt();
    if (!p) return { length: 'normal', tone: 'formal', focus: [] };
    const hints = { length: 'normal', tone: 'formal', focus: [] };
    if (/کوتاه|خلاصه|موجز|brief|concise/i.test(p)) hints.length = 'short';
    if (/مفصل|بلند|جامع|detailed|comprehensive/i.test(p)) hints.length = 'long';
    if (/دوستانه|ساده|سلیس|friendly|simple/i.test(p)) hints.tone = 'friendly';
    if (/رسمی|اداری|formal/i.test(p)) hints.tone = 'formal';
    // کلمات کلیدی تمرکز: بعد از «تمرکز» یا واژه‌های مهم لاتین/فارسی طولانی
    const m = p.match(/تمرکز\s+بر\s+([^.,\n]+)/);
    if (m) hints.focus = m[1].trim().split(/\s+و\s+|,/).map(s => s.trim()).filter(Boolean);
    return hints;
  }

  /* ---------- زمینه مشترک ---------- */
  function buildContext() {
    const f = F();
    const ds = f.active;
    const tpl = templateManager.get(f.templates.selectedId);
    const spec = tpl ? templateManager.effectiveSpec(tpl, ds) : null;
    const results = (f.calc.results || []).filter(r => r.ok);
    const scalar = {};
    results.forEach(r => { if (r.ok && r.value !== undefined && r.table === undefined) scalar[r.def.id] = r.value; });
    const tables = results.filter(r => r.ok && r.table);
    const periods = results.filter(r => r.ok && r.series);

    let dateRange = null;
    if (ds) {
      const dateCol = ds.columns.findIndex(c => c.type === 'date' || /تاریخ|date/i.test(c.name));
      if (dateCol >= 0) {
        let min = null, max = null;
        ds.rows.forEach(row => {
          const pv = Utils.parseDateValue(row[dateCol]);
          if (!pv.valid) return;
          if (min === null || pv.serial < min.serial) min = pv;
          if (max === null || pv.serial > max.serial) max = pv;
        });
        if (min && max) dateRange = { from: Utils.jString(min), to: Utils.jString(max) };
      }
    }

    return {
      f, ds, tpl, spec, results, scalar, tables, periods, dateRange,
      profile: f.profile,
      cleanLog: f.clean.log.filter(l => l.opId !== '__undo'),
      sourceName: f.source ? f.source.name : '—',
      rowsBefore: f.clean.rowsBefore || (f.raw ? f.raw.rows.length : 0),
      rowsAfter: ds ? ds.rows.length : 0,
      removedDupes: f.dupes.removedTotal || 0,
      calcOps: f.clean.log.filter(l => l.opId !== '__undo').length
    };
  }

  /* ---------- محتوایی که به سرویس AI ارسال می‌شود (پیش‌نمایش شفاف) ---------- */
  function getPayloadPreview() {
    const ctx = buildContext();
    const ds = ctx.ds;
    if (!ds) return '{}';
    const payload = {
      reportLanguage: lang(),
      customPrompt: customPrompt() || null,
      dataset: { rowCount: ds.rows.length, columnCount: ds.columns.length, columns: ds.columns.map(c => ({ name: c.name, type: c.type })) },
      quality: ctx.profile ? { score: ctx.profile.score, grade: ctx.profile.grade, highIssues: Object.values(ctx.profile.checks).filter(c => c.severity === 'high').map(c => c.name) } : null,
      calculationResults: ctx.results.map(r => {
        if (r.table) return { id: r.def.id, label: r.def.label, type: 'table', rows: r.table.slice(0, 10) };
        if (r.series) return { id: r.def.id, label: r.def.label, type: 'series', series: r.series };
        return { id: r.def.id, label: r.def.label, type: 'scalar', value: r.value, meta: r.meta };
      }),
      note: 'تنها آمارهای تجمیع‌شده و نتایج محاسبات ارسال می‌شوند؛ داده خام هرگز به سرویس خارجی ارسال نمی‌شود.'
    };
    return JSON.stringify(payload, null, 2);
  }

  /* ---------- ابزار قالب‌بندی ---------- */
  const pick = (arr, avoid) => {
    if (arr.length === 1) return arr[0];
    let c = arr[Math.floor(Math.random() * arr.length)];
    let guard = 0;
    while (avoid && c === avoid && guard++ < 5) c = arr[Math.floor(Math.random() * arr.length)];
    return c;
  };

  /* قالب‌بندی عددی بر اساس زبان گزارش */
  function money(v) {
    const n = Math.round(v);
    return lang() === 'en' ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) : Utils.nf(n, { maximumFractionDigits: 0 });
  }
  function num(v) {
    return lang() === 'en' ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v) : Utils.nf(v);
  }
  function intFa(v) { return lang() === 'en' ? String(v) : Utils.faDig(v); }

  function topBottomFromTable(res) {
    if (!res || !res.table || !res.table.length) return null;
    const t = res.table.filter(x => x.value !== null && x.value !== undefined);
    if (!t.length) return null;
    const total = t.reduce((s, x) => s + (x.value || 0), 0);
    const top = t[0], bottom = t[t.length - 1];
    return { top, bottom, total, topPct: total ? (top.value / total) * 100 : null, count: t.length };
  }

  function applyHints(text, hints) {
    // اعمال جهت‌دهی سبک پرامپت در حالت نمایشی
    let out = text;
    if (hints.length === 'short') {
      const sents = out.split(/\n|(?<=\.)\s+(?=[A-Zآ-ی])/).filter(Boolean);
      out = sents.slice(0, Math.max(2, Math.ceil(sents.length * 0.6))).join('\n');
    } else if (hints.length === 'long') {
      out += hints.tone === 'friendly'
        ? '\n\nبرای شفافیت بیشتر: این تحلیل با زبانی ساده تنظیم شده تا برای همه ذی‌نفعان قابل فهم باشد؛ جزئیات فنی در جدول‌ها و نمودارهای گزارش آمده است.'
        : '\n\nتفصیل تکمیلی: جزئیات محاسباتی، بازه داده و مبنای هر شاخص در جدول‌ها و نمودارهای همین گزارش درج شده و قابل ردیابی به نتایج موتور محاسبات است.';
    }
    if (hints.focus && hints.focus.length) {
      out += '\n\nتمرکز ویژه درخواستی شما: ' + hints.focus.map(k => '«' + k + '»').join('، ') + ' — در نمودارها و تفکیک‌های گزارش می‌توانید این محورها را پیگیری کنید.';
    }
    return out;
  }

  /* ═══════════ مولدهای فارسی ═══════════ */
  const GENERATORS_FA = {

    summary(ctx) {
      const s = ctx.scalar;
      const parts = [];
      parts.push(pick([
        `در بازه بررسی‌شده، مجموعاً ${num(s.count_rows)} رکورد از منبع «${ctx.sourceName}» پردازش و تحلیل شد.`,
        `این گزارش بر مبنای تحلیل ${num(s.count_rows)} رکورد واردشده از «${ctx.sourceName}» تهیه شده است.`
      ]));
      if (s.total_revenue !== undefined) {
        parts.push(pick([
          `مجموع ${ctx.results.find(r => r.def.id === 'total_revenue').def.label} برابر ${money(s.total_revenue)} بود و میانگین هر رکورد ${money(s.avg_order)} به ثبت رسید.`,
          `${ctx.results.find(r => r.def.id === 'total_revenue').def.label} در مجموع ${money(s.total_revenue)} بود که میانگین هر رکورد ${money(s.avg_order)} است.`
        ]));
      }
      const tb = ctx.tables.length ? topBottomFromTable(ctx.tables[0]) : null;
      if (tb && tb.topPct !== null) {
        parts.push(pick([
          `بالاترین سهم به «${tb.top.label}» با ${Utils.fmtPct(tb.topPct)} از کل تعلق دارد.`,
          `«${tb.top.label}» با سهم ${Utils.fmtPct(tb.topPct)}، بزرگ‌ترین واحد در این تفکیک است.`
        ]));
      }
      if (ctx.profile) {
        parts.push(pick([
          `کیفیت داده پس از پاک‌سازی در وضعیت «${ctx.profile.grade}» (امتیاز ${Utils.faDig(ctx.profile.score)} از ۱۰۰) ارزیابی شد.`,
          `امتیاز کیفیت مجموعه داده تحلیل‌شده ${Utils.faDig(ctx.profile.score)} از ۱۰۰ (وضعیت ${ctx.profile.grade}) است.`
        ]));
      }
      return parts.join(' ');
    },

    objective(ctx) {
      const parts = [
        `هدف این گزارش، ارائه تصویری روشن و مبتنی بر داده از عملکرد دوره بررسی‌شده برای تصمیم‌گیری مدیریتی است.`,
        `محدوده تحلیل شامل ${num(ctx.ds.rows.length)} رکورد و ${Utils.faDig(ctx.ds.columns.length)} ستون از منبع «${ctx.sourceName}» است${ctx.dateRange ? ` در بازه زمانی ${Utils.faDig(ctx.dateRange.from)} تا ${Utils.faDig(ctx.dateRange.to)}` : ''}.`,
        `محاسبات بر اساس قالب «${ctx.tpl ? ctx.tpl.name : '—'}» و تعاریف تأییدشده موتور محاسبات اجرا شده و متن تحلیلی صرفاً بر مبنای همین نتایج تولید شده است.`
      ];
      return parts.join(' ');
    },

    data_source(ctx) {
      const parts = [
        `منبع داده: «${ctx.sourceName}».`,
        ctx.profile
          ? `پیش از تحلیل، کیفیت داده بررسی شد و امتیاز ${Utils.faDig(ctx.profile.score)} از ۱۰۰ (وضعیت ${ctx.profile.grade}) دریافت کرد.`
          : 'بررسی رسمی کیفیت داده برای این مجموعه اجرا نشده است.',
        ctx.calcOps
          ? `${Utils.faDig(ctx.calcOps)} عملیات پاک‌سازی اجرا شد و تعداد رکوردها از ${num(ctx.rowsBefore)} به ${num(ctx.rowsAfter)} رسید.`
          : 'هیچ عملیات پاک‌سازی روی داده اجرا نشده است.',
        ctx.removedDupes ? `${num(ctx.removedDupes)} رکورد تکراری حذف شد.` : ''
      ].filter(Boolean);
      return parts.join(' ');
    },

    findings(ctx) {
      if (!ctx.tables.length) {
        return 'به دلیل نبود ستون طبقه‌ای مناسب، تفکیک عملکردی قابل ارائه نیست؛ شاخص‌های کلی در بخش شاخص‌های کلیدی ارائه شده‌اند.';
      }
      const res = ctx.tables[0];
      const tb = topBottomFromTable(res);
      if (!tb) return 'داده کافی برای استخراج نتایج تفکیکی وجود ندارد.';
      const total = tb.total || 1;
      const lines = [`نتایج اصلی به تفکیک «${res.def.groupBy || res.def.label}»:`];
      res.table.slice(0, 5).forEach((row, i) => {
        const pctv = row.value !== null && total ? Utils.fmtPct((row.value / total) * 100) : '—';
        lines.push(`• ${Utils.faDig(i + 1)}. «${row.label}» با ${money(row.value)} (${pctv} از مجموع، ${num(row.count)} رکورد)`);
      });
      if (ctx.tables.length > 1) {
        const res2 = ctx.tables[1];
        const tb2 = topBottomFromTable(res2);
        if (tb2) lines.push('', `در تفکیک «${res2.def.groupBy || res2.def.label}» نیز «${tb2.top.label}» با ${money(tb2.top.value)} در صدر قرار دارد.`);
      }
      return lines.join('\n');
    },

    trends(ctx) {
      const p = ctx.periods[0];
      if (!p || !p.series || p.series.length < 2) {
        return 'با داده فعلی، تحلیل روند زمانی معناداری امکان‌پذیر نیست' + (p && p.meta && p.meta.warnings ? ' (' + p.meta.warnings.join('؛ ') + ')' : '') + '.';
      }
      const sorted = p.series.slice().sort((a, b) => b.value - a.value);
      const hi = sorted[0], lo = sorted[sorted.length - 1];
      const parts = [
        `بررسی روند ${p.def.label} در ${Utils.faDig(p.series.length)} ماه نشان می‌دهد «${hi.label}» با ${money(hi.value)} بالاترین و «${lo.label}» با ${money(lo.value)} پایین‌ترین سطح را داشته است.`
      ];
      if (p.previous) {
        const dir = p.deltaAbs > 0 ? 'رشد' : p.deltaAbs < 0 ? 'کاهش' : 'ثبات';
        const pctTxt = p.deltaPct !== null ? ` (${Utils.fmtPct(Math.abs(p.deltaPct))})` : '';
        parts.push(pick([
          `در آخرین مقایسه، «${p.current.label}» نسبت به «${p.previous.label}» ${dir} ${money(Math.abs(p.deltaAbs))}${pctTxt} داشته است.`,
          `مقایسه «${p.current.label}» با «${p.previous.label}» ${dir} به مقدار ${money(Math.abs(p.deltaAbs))}${pctTxt} را نشان می‌دهد.`
        ]));
      }
      return parts.join(' ');
    },

    comparisons(ctx) {
      const p = ctx.periods[0];
      if (!p || !p.previous) {
        return 'برای مقایسه دوره‌ای، دست‌کم دو ماه داده معتبر لازم است؛ در داده فعلی این شرط برقرار نیست.';
      }
      const dir = p.deltaAbs > 0 ? 'افزایش' : p.deltaAbs < 0 ? 'کاهش' : 'بدون تغییر';
      const pctTxt = p.deltaPct !== null ? `معادل ${Utils.fmtPct(Math.abs(p.deltaPct))}` : '';
      return `مقایسه دو دوره اخیر: ${p.def.label} در «${p.current.label}» به ${money(p.current.value)} رسید که نسبت به «${p.previous.label}» (${money(p.previous.value)}) ${dir} ${pctTxt} است. این مقایسه بر پایه همان داده پاک‌سازی‌شده و بدون در نظر گرفتن عوامل بیرونی است و بیانگر رابطه علّی نیست.`;
    },

    anomalies(ctx) {
      if (!ctx.profile) return 'بررسی کیفیت رسمی اجرا نشده؛ برای شناسایی ناهنجاری‌ها، مرحله «بررسی کیفیت» را اجرا کنید.';
      const c = ctx.profile.checks;
      const lines = [];
      if (c.outliers && c.outliers.issueCount) lines.push(`• ${num(c.outliers.issueCount)} مقدار پرت آماری شناسایی شد؛ مقادیر پرت لزوماً خطا نیستند اما در جمع‌ها اثر می‌گذارند.`);
      if (c.invalidDates && c.invalidDates.issueCount) lines.push(`• ${num(c.invalidDates.issueCount)} تاریخ نامعتبر یا خارج از بازه مشاهده شد که در پاک‌سازی مدیریت شد.`);
      if (c.crossColumn && c.crossColumn.issueCount) lines.push(`• ${num(c.crossColumn.issueCount)} رکورد نقض‌کننده قواعد منطقی بین ستون‌ها بود.`);
      if (c.missing && c.missing.extra && c.missing.extra.totalMissing) lines.push(`• ${num(c.missing.extra.totalMissing)} سلول خالی در داده اولیه وجود داشت.`);
      if (!lines.length) lines.push('• ناهنجاری قابل توجهی در بررسی کیفیت شناسایی نشد.');
      lines.push('', 'یادآوری: موارد فوق از پروفایل داده اولیه استخراج شده‌اند؛ پس از پاک‌سازی، بخشی از آن‌ها اصلاح یا حذف شده‌اند.');
      return lines.join('\n');
    },

    interpretation(ctx) {
      const tb = ctx.tables.length ? topBottomFromTable(ctx.tables[0]) : null;
      const parts = [];
      if (tb && tb.count > 1) {
        parts.push(pick([
          `تمرکز عملکرد بر «${tb.top.label}» و فاصله نسبی «${tb.bottom.label}» از آن مشاهده می‌شود؛ این یک مشاهده آماری است و به‌تنهایی دلیلی بر رابطه علّی نیست.`,
          `الگوی داده‌ها نشان می‌دهد بخش عمده فعالیت متوجه «${tb.top.label}» است (${Utils.fmtPct(tb.topPct)} از مجموع)؛ تمرکز بر عوامل این تمرکز برای برنامه‌ریزی بعدی ارزشمند است.`
        ]));
        if (tb.topPct !== null && tb.topPct > 60) {
          parts.push('سهم بالای یک واحد، ریسک تمرکز را افزایش می‌دهد و تنوع‌بخشی به منابع درآمدی قابل بررسی است.');
        }
      } else {
        parts.push('تفسیر تفکیکی به دلیل نبود ستون طبقه‌ای مناسب ارائه نمی‌شود؛ شاخص‌های کلی قابل اتکا هستند.');
      }
      if (ctx.scalar.avg_order !== undefined && ctx.scalar.median_revenue !== undefined) {
        const skew = ctx.scalar.avg_order > ctx.scalar.median_revenue * 1.3;
        parts.push(skew
          ? 'بالاتر بودن میانگین نسبت به میانه نشان می‌دهد چند رکورد بزرگ، میانگین را بالا برده‌اند؛ برای تصمیم‌گیری، میانه نمای بهینه‌تری می‌دهد.'
          : 'نزدیکی میانگین و میانه نشان می‌دهد توزیع داده‌ها نسبتاً متوازن است و میانگین شاخص قابل اتکایی است.');
      }
      return parts.join(' ');
    },

    recommendations(ctx) {
      const recs = [];
      const tb = ctx.tables.length ? topBottomFromTable(ctx.tables[0]) : null;
      if (tb) {
        recs.push(`با توجه به سهم ${Utils.fmtPct(tb.topPct)}‌ای «${tb.top.label}»، بازبینی تخصیص منابع و برنامه فروش این حوزه در اولویت قرار گیرد.`);
        if (tb.bottom && tb.bottom.value !== null && tb.bottom.value < (tb.total / tb.count) * 0.4) {
          recs.push(`عملکرد «${tb.bottom.label}» پایین‌تر از میانگین واحدهاست؛ بررسی دلایل (پوشش بازار، قیمت‌گذاری یا موجودی) توصیه می‌شود.`);
        }
      }
      const p = ctx.periods[0];
      if (p && p.previous && p.deltaAbs !== 0) {
        recs.push(`${p.deltaAbs > 0 ? 'رشد' : 'کاهش'} ${Utils.fmtPct(Math.abs(p.deltaPct || 0))}‌ای ماه اخیر نسبت به ماه قبل، ضرورت تحلیل ریشه‌ای در جلسه عملیاتی را نشان می‌دهد.`);
      }
      if (ctx.profile && ctx.profile.checks.missing && ctx.profile.checks.missing.extra && ctx.profile.checks.missing.extra.totalMissing) {
        recs.push(`اصلاح فرایند ثبت داده برای کاهش ${num(ctx.profile.checks.missing.extra.totalMissing)} مقدار گمشده شناسایی‌شده، دقت گزارش‌های بعدی را بالا می‌برد.`);
      }
      if (ctx.profile && ctx.profile.score < 75) {
        recs.push('امتیاز کیفیت داده پایین‌تر از حد مطلوب است؛ اجرای دوره‌ای پاک‌سازی و تعریف قواعد ثبت استاندارد پیشنهاد می‌شود.');
      }
      if (!recs.length) recs.push('با داده فعلی، پیشنهاد عملیاتی مشخصی قابل استخراج نیست؛ تکمیل داده‌های تفکیکی (مانند کانال فروش یا دسته محصول) برای تحلیل عمیق‌تر لازم است.');
      return recs.map((r, i) => `${Utils.faDig(i + 1)}. ${r}`).join('\n');
    },

    limitations(ctx) {
      const parts = [
        `این تحلیل بر مبنای ${num(ctx.ds.rows.length)} رکورد تولید شده است${ctx.ds.rows.length < 30 ? '؛ حجم نمونه برای استنباط آماری محدود است و یافته‌ها باید با احتیاط تعمیم داده شوند' : ''}.`
      ];
      if (!ctx.periods.length || !ctx.periods[0].series || ctx.periods[0].series.length < 2) {
        parts.push('داده زمانی کافی برای تحلیل روند و مقایسه دوره‌ای وجود ندارد.');
      }
      if (!ctx.tables.length) {
        parts.push('ستون طبقه‌ای مناسبی برای تفکیک عملکرد یافت نشد؛ تحلیل فقط در سطح کلی است.');
      }
      if (ctx.profile) {
        parts.push(`کیفیت داده در سطح «${ctx.profile.grade}» است و نتایج تا حدی به کیفیت داده اولیه وابسته است.`);
      }
      if ((F().ai.mode || 'demo') === 'demo') {
        parts.push('این متن در حالت نمایشی AI (Demo) و صرفاً از نتایج واقعی محاسبات همین سامانه تولید شده است؛ پاسخ مدل زبانی واقعی نیست و جایگزین تحلیل تخصصی انسانی نیست.');
      }
      return parts.join(' ');
    },

    conclusion(ctx) {
      const parts = [pick([
        'در مجموع، داده پاک‌سازی‌شده تصویر قابل اتکایی از عملکرد دوره ارائه می‌دهد.',
        'جمع‌بندی گزارش بر مبنای شاخص‌های محاسبه‌شده روی داده تأییدشده انجام شده است.'
      ])];
      if (ctx.scalar.total_revenue !== undefined) parts.push(`مجموع ${money(ctx.scalar.total_revenue)} و میانگین ${money(ctx.scalar.avg_order)} در ${num(ctx.scalar.count_rows)} رکورد، مبنای عددی این جمع‌بندی است.`);
      const tb = ctx.tables.length ? topBottomFromTable(ctx.tables[0]) : null;
      if (tb) parts.push(`«${tb.top.label}» بزرگ‌ترین سهم را دارد و پایش ماهانه آن توصیه می‌شود.`);
      parts.push('برای تصمیم نهایی، این گزارش در کنار دانش تجاری سازمان و داده‌های تکمیلی بررسی شود.');
      return parts.join(' ');
    }
  };

  /* ═══════════ مولدهای انگلیسی ═══════════ */
  const GENERATORS_EN = {
    summary(ctx) {
      const s = ctx.scalar;
      const parts = [];
      parts.push(pick([
        `In total, ${num(s.count_rows)} records from “${ctx.sourceName}” were processed and analyzed for this reporting period.`,
        `This report is based on the analysis of ${num(s.count_rows)} records imported from “${ctx.sourceName}”.`
      ]));
      if (s.total_revenue !== undefined) {
        parts.push(`The total of “${(ctx.results.find(r => r.def.id === 'total_revenue') || {}).def.label || 'revenue'}” reached ${money(s.total_revenue)}, with an average of ${money(s.avg_order)} per record.`);
      }
      const tb = ctx.tables.length ? topBottomFromTable(ctx.tables[0]) : null;
      if (tb && tb.topPct !== null) {
        parts.push(`“${tb.top.label}” holds the largest share with ${tb.topPct.toFixed(1)}% of the total.`);
      }
      if (ctx.profile) {
        parts.push(`Data quality after cleansing was assessed as “${ctx.profile.grade}” (score ${ctx.profile.score}/100).`);
      }
      return parts.join(' ');
    },
    objective(ctx) {
      return [
        'The objective of this report is to provide a clear, data-driven view of performance during the reviewed period to support management decisions.',
        `The analysis scope covers ${num(ctx.ds.rows.length)} records and ${ctx.ds.columns.length} columns from “${ctx.sourceName}”${ctx.dateRange ? ` spanning ${ctx.dateRange.from} to ${ctx.dateRange.to}` : ''}.`,
        `Calculations were executed through the approved calculation engine using the “${ctx.tpl ? ctx.tpl.name : '—'}” template; all narrative figures derive strictly from these results.`
      ].join(' ');
    },
    data_source(ctx) {
      const parts = [
        `Data source: “${ctx.sourceName}”.`,
        ctx.profile
          ? `Data quality was assessed before analysis and scored ${ctx.profile.score}/100 (“${ctx.profile.grade}”).`
          : 'No formal data quality check was run for this dataset.',
        ctx.calcOps
          ? `${ctx.calcOps} cleansing operations were applied; record count changed from ${num(ctx.rowsBefore)} to ${num(ctx.rowsAfter)}.`
          : 'No cleansing operations were applied to the data.',
        ctx.removedDupes ? `${num(ctx.removedDupes)} duplicate records were removed.` : ''
      ].filter(Boolean);
      return parts.join(' ');
    },
    findings(ctx) {
      if (!ctx.tables.length) return 'No suitable categorical column is available for a breakdown; overall indicators are presented in the KPI section.';
      const res = ctx.tables[0];
      const tb = topBottomFromTable(res);
      if (!tb) return 'Insufficient data for a breakdown analysis.';
      const total = tb.total || 1;
      const lines = [`Key results by “${res.def.groupBy || res.def.label}”:`];
      res.table.slice(0, 5).forEach((row, i) => {
        const pctv = row.value !== null && total ? ((row.value / total) * 100).toFixed(1) + '%' : '—';
        lines.push(`• ${i + 1}. “${row.label}” with ${money(row.value)} (${pctv} of total, ${num(row.count)} records)`);
      });
      if (ctx.tables.length > 1) {
        const res2 = ctx.tables[1];
        const tb2 = topBottomFromTable(res2);
        if (tb2) lines.push('', `In the “${res2.def.groupBy || res2.def.label}” breakdown, “${tb2.top.label}” also leads with ${money(tb2.top.value)}.`);
      }
      return lines.join('\n');
    },
    trends(ctx) {
      const p = ctx.periods[0];
      if (!p || !p.series || p.series.length < 2) {
        return 'The current data does not support a meaningful time-series analysis.';
      }
      const sorted = p.series.slice().sort((a, b) => b.value - a.value);
      const hi = sorted[0], lo = sorted[sorted.length - 1];
      const parts = [
        `The ${p.def.label} trend over ${p.series.length} months shows “${hi.label}” as the peak (${money(hi.value)}) and “${lo.label}” as the lowest point (${money(lo.value)}).`
      ];
      if (p.previous) {
        const dir = p.deltaAbs > 0 ? 'growth' : p.deltaAbs < 0 ? 'a decline' : 'no change';
        const pctTxt = p.deltaPct !== null ? ` (${Math.abs(p.deltaPct).toFixed(1)}%)` : '';
        parts.push(`In the latest comparison, “${p.current.label}” shows ${dir} of ${money(Math.abs(p.deltaAbs))}${pctTxt} versus “${p.previous.label}”.`);
      }
      return parts.join(' ');
    },
    comparisons(ctx) {
      const p = ctx.periods[0];
      if (!p || !p.previous) return 'Period-over-period comparison requires at least two months of valid data, which is not available in the current dataset.';
      const dir = p.deltaAbs > 0 ? 'an increase' : p.deltaAbs < 0 ? 'a decrease' : 'no change';
      const pctTxt = p.deltaPct !== null ? ` (${Math.abs(p.deltaPct).toFixed(1)}%)` : '';
      return `Latest period comparison: ${p.def.label} reached ${money(p.current.value)} in “${p.current.label}” versus “${p.previous.label}” (${money(p.previous.value)}) — ${dir}${pctTxt}. This comparison is based on the same cleansed data and does not imply causality.`;
    },
    anomalies(ctx) {
      if (!ctx.profile) return 'No formal quality check was run; execute the “Data Quality” step to identify anomalies.';
      const c = ctx.profile.checks;
      const lines = [];
      if (c.outliers && c.outliers.issueCount) lines.push(`• ${num(c.outliers.issueCount)} statistical outliers were detected; outliers are not necessarily errors but affect aggregates.`);
      if (c.invalidDates && c.invalidDates.issueCount) lines.push(`• ${num(c.invalidDates.issueCount)} invalid or out-of-range dates were observed and handled during cleansing.`);
      if (c.crossColumn && c.crossColumn.issueCount) lines.push(`• ${num(c.crossColumn.issueCount)} records violated cross-column logical rules.`);
      if (c.missing && c.missing.extra && c.missing.extra.totalMissing) lines.push(`• ${num(c.missing.extra.totalMissing)} empty cells existed in the raw data.`);
      if (!lines.length) lines.push('• No significant anomalies were identified in the quality check.');
      lines.push('', 'Note: the above are extracted from the raw-data profile; after cleansing, some were corrected or removed.');
      return lines.join('\n');
    },
    interpretation(ctx) {
      const tb = ctx.tables.length ? topBottomFromTable(ctx.tables[0]) : null;
      const parts = [];
      if (tb && tb.count > 1) {
        parts.push(`Performance is concentrated in “${tb.top.label}” (${tb.topPct.toFixed(1)}% of total) with a relative gap to “${tb.bottom.label}”; this is a statistical observation, not a causal claim.`);
        if (tb.topPct !== null && tb.topPct > 60) {
          parts.push('A high single-unit share increases concentration risk; diversifying revenue sources is worth reviewing.');
        }
      } else {
        parts.push('No categorical breakdown is available; overall indicators remain the most reliable view.');
      }
      if (ctx.scalar.avg_order !== undefined && ctx.scalar.median_revenue !== undefined) {
        const skew = ctx.scalar.avg_order > ctx.scalar.median_revenue * 1.3;
        parts.push(skew
          ? 'The mean exceeding the median indicates a few large records pull the average up; the median offers a more robust view for decisions.'
          : 'The closeness of mean and median indicates a fairly balanced distribution; the mean is a reliable indicator here.');
      }
      return parts.join(' ');
    },
    recommendations(ctx) {
      const recs = [];
      const tb = ctx.tables.length ? topBottomFromTable(ctx.tables[0]) : null;
      if (tb) {
        recs.push(`Given “${tb.top.label}”’s ${tb.topPct.toFixed(1)}% share, reviewing resource allocation and the sales plan for this segment should be prioritized.`);
        if (tb.bottom && tb.bottom.value !== null && tb.bottom.value < (tb.total / tb.count) * 0.4) {
          recs.push(`“${tb.bottom.label}” underperforms the unit average; investigate causes (market coverage, pricing, or inventory).`);
        }
      }
      const p = ctx.periods[0];
      if (p && p.previous && p.deltaAbs !== 0) {
        recs.push(`The ${Math.abs(p.deltaPct || 0).toFixed(1)}% ${p.deltaAbs > 0 ? 'growth' : 'decline'} of the latest month calls for root-cause analysis in the operational meeting.`);
      }
      if (ctx.profile && ctx.profile.checks.missing && ctx.profile.checks.missing.extra && ctx.profile.checks.missing.extra.totalMissing) {
        recs.push(`Fixing the data-entry process to reduce the ${num(ctx.profile.checks.missing.extra.totalMissing)} missing values will improve future report accuracy.`);
      }
      if (ctx.profile && ctx.profile.score < 75) {
        recs.push('The data quality score is below the desirable threshold; periodic cleansing and standard data-entry rules are recommended.');
      }
      if (!recs.length) recs.push('No specific operational recommendation can be derived from the current data; enriching categorical fields (e.g., sales channel or product category) is required for deeper analysis.');
      return recs.map((r, i) => `${i + 1}. ${r}`).join('\n');
    },
    limitations(ctx) {
      const parts = [
        `This analysis is based on ${num(ctx.ds.rows.length)} records${ctx.ds.rows.length < 30 ? '; the sample size is limited for statistical inference and findings should be generalized cautiously' : ''}.`
      ];
      if (!ctx.periods.length || !ctx.periods[0].series || ctx.periods[0].series.length < 2) {
        parts.push('There is insufficient time-series data for trend and period comparison.');
      }
      if (!ctx.tables.length) {
        parts.push('No suitable categorical column was found; the analysis remains at the aggregate level only.');
      }
      if (ctx.profile) {
        parts.push(`Data quality is at the “${ctx.profile.grade}” level; results partly depend on raw data quality.`);
      }
      if ((F().ai.mode || 'demo') === 'demo') {
        parts.push('This text was produced by the Demo AI mode strictly from the actual calculation results of this application; it is not a real LLM response and does not replace expert human analysis.');
      }
      return parts.join(' ');
    },
    conclusion(ctx) {
      const parts = [pick([
        'Overall, the cleansed data provides a reliable picture of the period’s performance.',
        'The report’s conclusion is grounded in the calculated indicators on the approved dataset.'
      ])];
      if (ctx.scalar.total_revenue !== undefined) parts.push(`A total of ${money(ctx.scalar.total_revenue)} and an average of ${money(ctx.scalar.avg_order)} across ${num(ctx.scalar.count_rows)} records form the numerical basis of this conclusion.`);
      const tb = ctx.tables.length ? topBottomFromTable(ctx.tables[0]) : null;
      if (tb) parts.push(`“${tb.top.label}” holds the largest share and monthly monitoring is recommended.`);
      parts.push('For the final decision, review this report alongside the organization’s business knowledge and complementary data.');
      return parts.join(' ');
    }
  };

  function generators() { return lang() === 'en' ? GENERATORS_EN : GENERATORS_FA; }

  /* ═══════════ اتصال زنده (OpenAI-compatible Chat Completions + Anthropic) ═══════════
     نسخه ۲٫۵ — رفع خطای CORS:
     مسیر اصلی همیشه «پراکسی سرور محلی» است (همان سروری که برنامه را سرو می‌کند و
     هم‌مبدأ است). کلید ذخیره‌شده سمت سرور خوانده می‌شود؛ اگر کاربر کلید نشست وارد
     کرده باشد، کلید فقط برای همین فراخوانی روی HTTP محلی (127.0.0.1) به پراکسی
     داده می‌شود. بنابراین درخواستِ مدل زبانی هرگز مستقیم از مرورگر ارسال نمی‌شود
     و محدودیت CORS سرویس‌های بیرونی دیگر مانع اتصال نیست.
     مسیر مستقیم از مرورگر فقط زمانی استفاده می‌شود که سرور محلی در دسترس نباشد
     (اجرای برنامه به‌صورت file:// بدون سرور). */
  function normalizeEndpoint(endpoint) {
    let e = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!e) return null;
    if (!/^https?:\/\//i.test(e)) return null;
    if (/\/(chat\/completions|messages|completions)$/i.test(e)) return e;
    return e + '/chat/completions';
  }

  function hasServerProxy() {
    return typeof authClient !== 'undefined' && authClient.S && authClient.S.serverOk === true;
  }

  function buildLiveMessages(userMessage, systemMessage) {
    return [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ];
  }

  async function proxyChat(cfg, messages, temperature) {
    const body = {
      endpoint: cfg.endpoint,
      model: cfg.model || 'gpt-4o-mini',
      temperature: temperature != null ? temperature : 0.4,
      messages
    };
    const sessionKey = cfg.apiKey ? String(cfg.apiKey) : '';
    if (sessionKey) body.apiKey = sessionKey;
    const res = await authClient.api('POST', '/api/ai/chat', body);
    if (res.ok && res.data && res.data.content) return String(res.data.content).trim();
    if (res.status === 401 || res.status === 403) {
      throw new Error('نشست سرور منقضی شده است؛ دوباره وارد حساب شوید (کلید ذخیره‌شده سمت سرور باقی است).');
    }
    throw new Error(res.data && res.data.error ? res.data.error : 'پراکسی AI ناموفق بود.');
  }

  async function liveChat(userMessage, systemMessage) {
    const f = F();
    const cfg = Object.assign({}, f.ai.config || {});
    if (!cfg.endpoint) throw new Error('آدرس سرویس (Endpoint) تنظیم نشده است.');
    const norm = normalizeEndpoint(cfg.endpoint);
    if (!norm) throw new Error('آدرس سرویس نامعتبر است؛ باید با http:// یا https:// شروع شود.');
    cfg.endpoint = norm;
    const messages = buildLiveMessages(userMessage, systemMessage);

    /* مسیر ۱ (اصلی): پراکسی سرور محلی — هم با حساب و هم با کلید نشست */
    if (hasServerProxy()) {
      try {
        return await proxyChat(cfg, messages);
      } catch (err) {
        /* اگر کلید نشست داریم و سرور پراکسی واقعاً خطای شبکه داد، مستقیم امتحان می‌کنیم؛
           خطاهای منطقی (کلید نامعتبر، مدل اشتباه و…) را دست‌نخورده به کاربر نشان می‌دهیم. */
        if (cfg.apiKey && /پراکسی|fetch|network|Failed/i.test(err.message || '')) {
          UIKit.toast('warning', 'پراکسی سرور در دسترس نبود', 'درخواست مستقیماً از مرورگر ارسال می‌شود (ممکن است با محدودیت CORS مواجه شود).');
          return directChat(userMessage, systemMessage, cfg);
        }
        throw err;
      }
    }

    /* مسیر ۲: بدون سرور (file://) — فقط مستقیم از مرورگر */
    if (!cfg.apiKey) {
      throw new Error('اتصال زنده نیازمند کلید API است؛ برنامه را با سرور محلی (run.py) اجرا کنید یا کلید نشست را در «وضعیت AI» وارد کنید.');
    }
    UIKit.toast('warning', 'سرور محلی در دسترس نیست', 'درخواست مستقیماً از مرورگر ارسال شد؛ اگر سرویس CORS را نپذیرد خطا می‌دهد.');
    return directChat(userMessage, systemMessage, cfg);
  }

  async function directChat(userMessage, systemMessage, cfg) {
    let res;
    try {
      res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({
          model: cfg.model || 'gpt-4o-mini',
          temperature: 0.4,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
          ]
        })
      });
    } catch (err) {
      throw new Error('ارتباط مستقیم با سرویس ناموفق بود (احتمالاً محدودیت CORS سرویس یا قطعی شبکه): ' + err.message +
        ' — برای اتصال مطمئن، برنامه را با سرور محلی (run.py) اجرا کنید تا درخواست‌ها از پراکسی سرور ارسال شوند.');
    }
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = (j.error && j.error.message) || JSON.stringify(j).slice(0, 200); } catch (e) { /* ignore */ }
      throw new Error(`پاسخ سرویس ناموفق بود (کد ${res.status}). ${detail}`);
    }
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('پاسخ مدل خالی بود یا ساختار آن قابل خواندن نبود.');
    return text.trim();
  }

  /* تست سریع اتصال از پنجره «وضعیت AI» (نسخه ۲٫۵) — حداقلی و کم‌هزینه */
  async function testLive(testCfg) {
    const cfg = Object.assign({}, (F().ai.config || {}), testCfg || {});
    if (!cfg.endpoint) return { ok: false, message: 'آدرس سرویس (Endpoint) خالی است.' };
    const norm = normalizeEndpoint(cfg.endpoint);
    if (!norm) return { ok: false, message: 'آدرس سرویس نامعتبر است؛ باید با http:// یا https:// شروع شود (مثال: https://api.openai.com/v1).' };
    cfg.endpoint = norm;
    if (!cfg.model) cfg.model = 'gpt-4o-mini';
    const sessionKey = cfg.apiKey ? String(cfg.apiKey) : '';
    if (!sessionKey && !(hasServerProxy() && typeof authClient !== 'undefined' && authClient.S.user && authClient.S.user.apiKey && authClient.S.user.apiKey.exists)) {
      return { ok: false, message: 'کلید API را وارد کنید (یا در حساب، کلید امن ذخیره کرده باشید).' };
    }
    if (hasServerProxy()) {
      try {
        const testBody = {
          endpoint: cfg.endpoint, model: cfg.model, temperature: 0,
          messages: [{ role: 'user', content: 'پاسخ کوتاه: OK' }]
        };
        if (sessionKey) testBody.apiKey = sessionKey;   /* نسخه ۲٫۵: کلید نشست هم به پراکسی داده شود */
        const r = await authClient.api('POST', '/api/ai/chat', testBody);
        if (r.ok && r.data && r.data.content) {
          return { ok: true, message: `اتصال موفق بود — مدل «${cfg.model}» پاسخ داد (مسیر: پراکسی امن سرور).` };
        }
        return { ok: false, message: (r.data && r.data.error) ? String(r.data.error) : `پاسخ سرور: کد ${r.status}` };
      } catch (err) {
        return { ok: false, message: 'پراکسی سرور در دسترس نبود: ' + err.message };
      }
    }
    try {
      const t0 = Date.now();
      const txt = await directChat('پاسخ کوتاه: OK', 'فقط بنویس OK', cfg);
      return { ok: true, message: `اتصال مستقیم موفق بود (${((Date.now() - t0) / 1000).toFixed(1)} ثانیه) — مدل پاسخ داد: ${String(txt).slice(0, 40)}` };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  function systemPromptFor(roleTitle) {
    const L = lang();
    const base = (L === 'en' ? DEFAULT_PROMPT_EN : DEFAULT_PROMPT_FA);
    const custom = customPrompt();
    const langLine = L === 'en' ? 'Write the output in English.' : 'پاسخ را حتماً به زبان فارسی بنویس.';
    return [base, custom ? `User's custom instructions (highest priority): ${custom}` : '', langLine, `Now write ONLY the section titled "${roleTitle}". Return plain text without markdown headings.`].filter(Boolean).join('\n\n');
  }

  function payloadForModel(ctx) {
    const ds = ctx.ds;
    return JSON.stringify({
      dataset: { rowCount: ds.rows.length, columns: ds.columns.map(c => ({ name: c.name, type: c.type })) },
      quality: ctx.profile ? { score: ctx.profile.score, grade: ctx.profile.grade } : null,
      calculationResults: ctx.results.filter(r => r.ok).map(r => {
        if (r.table) return { id: r.def.id, label: r.def.label, type: 'table', rows: r.table.slice(0, 10) };
        if (r.series) return { id: r.def.id, label: r.def.label, type: 'series', series: r.series };
        return { id: r.def.id, label: r.def.label, type: 'scalar', value: r.value };
      }),
      periodRange: ctx.dateRange
    }, null, 1);
  }

  /* ---------- تولید گزارش کامل ---------- */
  async function generate(onProgress) {
    const ctx = buildContext();
    if (!ctx.ds) throw new Error('مجموعه داده فعالی وجود ندارد.');
    if (!ctx.f.calc.ranAt) throw new Error('ابتدا محاسبات را اجرا کنید.');
    const tpl = ctx.tpl;
    if (!tpl) throw new Error('قالب گزارش انتخاب نشده است.');
    const mode = F().ai.mode || 'demo';
    if (mode === 'manual') throw new Error('هوش مصنوعی خاموش است. متن بخش‌ها را در ادیتور هر بخش بنویسید و ذخیره کنید.');

    const G = generators();
    const textSections = tpl.structure.filter(s => s.type === 'text' && s.role && G[s.role]);
    const hints = promptHints();
    const sections = [];
    for (let i = 0; i < textSections.length; i++) {
      const sec = textSections[i];
      if (onProgress) onProgress(i, textSections.length, sec.title);
      let body;
      if (mode === 'live') {
        try {
          body = await liveChat(
            'Report data payload (JSON):\n' + payloadForModel(ctx),
            systemPromptFor(sec.title)
          );
        } catch (err) {
          body = `تولید این بخش با خطا مواجه شد: ${err.message}`;
        }
      } else {
        await new Promise(r => setTimeout(r, 140));
        try { body = applyHints(G[sec.role](ctx), hints); }
        catch (err) {
          console.error('demo gen error', sec.role, err);
          body = 'تولید این بخش با خطا مواجه شد؛ لطفاً بخش را بازتولید کنید.';
        }
      }
      sections.push({
        id: sec.id, title: sec.title, role: sec.role,
        body, status: 'draft',
        provider: mode === 'live' ? (F().ai.config.model || 'live-model') : 'demo',
        generatedAt: new Date().toISOString()
      });
    }
    const generated = {
      sections,
      meta: {
        provider: mode === 'live' ? 'live' : 'demo',
        providerName: info().providerName,
        lang: lang(),
        customPrompt: customPrompt() || null,
        generatedAt: new Date().toISOString(),
        disclaimer: mode === 'live'
          ? 'متن‌ها با فراخوانی مدل زبانی متصل توسط خودتان تولید شده‌اند؛ صحت تحلیل نهایی را شما تأیید می‌کنید.'
          : 'متن‌ها در حالت نمایشی و به‌صورت قاعده‌مند از نتایج واقعی محاسبات تولید شده‌اند؛ پاسخ مستقیم مدل هوش مصنوعی نیستند.'
      }
    };
    F().ai.generated = generated;
    Store.emit('ai-generated');
    return generated;
  }

  async function regenerateSection(sectionId) {
    const gen = F().ai.generated;
    if (!gen) throw new Error('گزارشی برای بازتولید وجود ندارد.');
    const sec = gen.sections.find(s => s.id === sectionId);
    if (!sec) throw new Error('بخش موردنظر یافت نشد.');
    if (isAiOff()) throw new Error('هوش مصنوعی خاموش است؛ متن را دستی ویرایش کنید.');
    const ctx = buildContext();
    const G = generators();
    const g = G[sec.role];
    const mode = F().ai.mode || 'demo';
    if (mode === 'live') {
      sec.body = await liveChat(
        'Report data payload (JSON):\n' + payloadForModel(ctx) + `\n\nCurrent draft of this section (rewrite and improve it):\n${sec.body}`,
        systemPromptFor(sec.title)
      );
    } else {
      if (!g) throw new Error('این بخش قابل بازتولید خودکار نیست.');
      await new Promise(r => setTimeout(r, 150));
      sec.body = applyHints(g(ctx), promptHints());
    }
    sec.generatedAt = new Date().toISOString();
    sec.status = 'draft';
    sec.regenerated = true;
    Store.emit('ai-section');
    return sec;
  }

  function updateSectionBody(sectionId, body) {
    const gen = F().ai.generated;
    if (!gen) return;
    const sec = gen.sections.find(s => s.id === sectionId);
    if (sec) { sec.body = body; sec.editedByUser = true; Store.emit('ai-section'); }
  }

  function setSectionStatus(sectionId, status) {
    const gen = F().ai.generated;
    if (!gen) return;
    const sec = gen.sections.find(s => s.id === sectionId);
    if (sec) { sec.status = status; Store.emit('ai-section'); }
  }

  function addContextNote(note) {
    const gen = F().ai.generated;
    if (!gen || !note.trim()) return;
    const sec = gen.sections.find(s => s.role === 'interpretation') || gen.sections[0];
    sec.body += `\n\nیادداشت کاربر: ${note.trim()}`;
    sec.editedByUser = true;
    Store.emit('ai-section');
  }

  /* افزودن/حذف بخش دستی */
  /* نسخه ۲٫۴: در حالت «AI خاموش»، اسکلت بخش‌های متن از ساختار قالب ساخته می‌شود
     تا کاربر بلافاصله و بدون تولید AI، متن هر بخش را دستی بنویسد و ویرایش کند. */
  function ensureManualDraft() {
    const f = F();
    if ((f.ai.mode || 'demo') !== 'manual') return null;
    if (f.ai.generated && f.ai.generated.sections && f.ai.generated.sections.length) return f.ai.generated;
    const tpl = templateManager.get(f.templates.selectedId);
    if (!tpl) return null;
    const sections = tpl.structure.filter(s => s.type === 'text').map(s => ({
      id: Utils.uid('sec'),
      title: s.title,
      role: s.role || 'manual',
      body: '',
      status: 'draft',
      provider: 'user',
      generatedAt: new Date().toISOString(),
      editedByUser: false
    }));
    f.ai.generated = {
      sections,
      meta: {
        provider: 'user', providerName: 'نگارش دستی — بدون هوش مصنوعی',
        lang: f.report.lang || 'fa',
        customPrompt: null,
        generatedAt: new Date().toISOString(),
        disclaimer: 'متن این گزارش به‌صورت دستی توسط شما نگارش یافته است.'
      }
    };
    Store.emit('ai-generated');
    return f.ai.generated;
  }

  function addManualSection(title, body) {
    const gen = F().ai.generated;
    if (!gen) return null;
    const sec = { id: Utils.uid('sec'), title: title || 'بخش جدید', role: 'manual', body: body || '', status: 'draft', provider: 'user', generatedAt: new Date().toISOString(), editedByUser: true };
    gen.sections.push(sec);
    Store.emit('ai-section');
    return sec;
  }
  function removeSection(sectionId) {
    const gen = F().ai.generated;
    if (!gen) return;
    gen.sections = gen.sections.filter(s => s.id !== sectionId);
    Store.emit('ai-section');
  }
  function moveSection(sectionId, dir) {
    const gen = F().ai.generated;
    if (!gen) return;
    const i = gen.sections.findIndex(s => s.id === sectionId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= gen.sections.length) return;
    const arr = gen.sections;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    Store.emit('ai-section');
  }

  /* پاک‌کردن متن «همه بخش‌های گزارش» (نسخه ۲٫۵) — با قابلیت واگرد
     ساختار بخش‌ها و ترتیب‌شان حفظ می‌شود؛ فقط متن‌ها خالی و وضعیت‌ها پیش‌نویس می‌شوند. */
  function clearAllSectionBodies() {
    const gen = F().ai.generated;
    if (!gen || !gen.sections || !gen.sections.length) return { ok: false, cleared: 0 };
    const snapshot = gen.sections.map(s => ({ id: s.id, body: s.body, status: s.status, editedByUser: !!s.editedByUser }));
    let cleared = 0;
    gen.sections.forEach(s => {
      if (s.body && s.body.trim()) cleared++;
      s.body = '';
      s.status = 'draft';
      s.editedByUser = false;
    });
    UndoManager.push({
      label: 'پاک‌کردن تمام متن‌های گزارش',
      undo() {
        const g = F().ai.generated;
        if (!g) return;
        snapshot.forEach(b => {
          const s = g.sections.find(x => x.id === b.id);
          if (s) { s.body = b.body; s.status = b.status; s.editedByUser = b.editedByUser; }
        });
        Store.emit('ai-section');
      },
      redo() {
        const g = F().ai.generated;
        if (!g) return;
        g.sections.forEach(s => { s.body = ''; s.status = 'draft'; s.editedByUser = false; });
        Store.emit('ai-section');
      }
    });
    Store.emit('ai-section');
    return { ok: true, cleared };
  }

  return {
    info, generate, regenerateSection, updateSectionBody, setSectionStatus, addContextNote,
    getPayloadPreview, buildContext, isAiOff, isLive, lang, customPrompt, defaultPrompt,
    addManualSection, removeSection, moveSection, ensureManualDraft,
    testLive, normalizeEndpoint, clearAllSectionBodies
  };
})();
