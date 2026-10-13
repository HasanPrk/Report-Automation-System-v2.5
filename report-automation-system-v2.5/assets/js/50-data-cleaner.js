/* ═══════════════════════════════════════════════════════════
   dataCleaner — مرکز پاک‌سازی داده
   هر عملیات: پیش‌نمایش → تأیید → اجرا → گزارش تغییرات → قابل واگرد
   هیچ مقداری بدون اطلاع کاربر جایگزین نمی‌شود.
   نسخه ۲٫۴:
   • ویرایش دستی سلول‌ها از فهرست عملیات مستقل حذف شد؛ همین قابلیت
     به‌صورت «ویرایش موردی مستقل» داخل پیش‌نمایش تک‌تک عملیات‌ها قرار گرفت
     (پارامتر manualEdits: [{r,c,value}] — اعتبارسنجی نوع ستون)
   • موتور «گام‌های اعمال‌شده» شبیه Power Query: هر عملیات یک گام با
     اسنپ‌شات داده ثبت می‌کند؛ کاربر می‌تواند به هر گام برگردد، گام‌های بعدی
     را حذف کند و از همان‌جا مسیر جدید بسازد (Applied Steps Navigation)
   ═══════════════════════════════════════════════════════════ */
'use strict';

const dataCleaner = (function () {
  const F = () => Store.state.flow;

  /* ---------- شروع جلسه پاک‌سازی ---------- */
  function startCleaning() {
    const f = F();
    if (!f.raw) throw new Error('داده‌ای برای پاک‌سازی وجود ندارد.');
    if (!f.work) {
      f.work = Utils.deepClone({ columns: f.raw.columns, rows: f.raw.rows });
      f.clean.started = true;
      f.clean.rowsBefore = f.raw.rows.length;
    }
    /* ناوبری گام‌ها (شبیه Power Query) — گام پایه = داده اولیه */
    if (!f.clean.steps || !f.clean.steps.length) {
      f.clean.steps = [{
        id: 'base', opId: null, title: 'داده اولیه (منبع)', at: f.clean.started ? new Date().toISOString() : new Date().toISOString(),
        rows: f.work.rows.length, changes: 0, summary: 'منبع داده پس از دریافت — نقطه بازگشت اول',
        snapshot: Utils.deepClone({ columns: f.work.columns, rows: f.work.rows })
      }];
      f.clean.stepActive = 0;
    }
    return f.work;
  }

  /* ═════════ ناوبری «گام‌های اعمال‌شده» — دقیقا شبیه Power Query ═════════
     هر عملیات یک گام با اسنپ‌شات می‌سازد؛ کلیک روی هر گام = بازگشت به همان
     وضعیت (گام‌های بعدی حذف می‌شوند و مسیر از همان‌جا ادامه می‌یابد).
     حداکثر ۲۵ گام — قدیمی‌ترین گام‌های میانی بدون اسنپ‌شات با بازپخش مجدد
     عملیات از نزدیک‌ترین اسنپ‌شات قبلی بازسازی می‌شوند. */
  const MAX_STEPS = 25;
  const MAX_SNAPSHOTS = 12;

  function stepsList() {
    startCleaning();
    try { reconcileSteps(); } catch (e) { /* ignore */ }
    return F().clean.steps.slice();
  }
  function activeStepIndex() {
    const f = F();
    return (f.clean.stepActive == null) ? f.clean.steps.length - 1 : f.clean.stepActive;
  }

  function recordStep(title, opId, params, rowsAfter, changes, summary) {
    const f = F();
    const steps = f.clean.steps || (f.clean.steps = []);
    /* اگر در میانه مسیر هستیم (بعد از jump)، گام‌های بعدی و log مربوط به آنها حذف می‌شوند */
    if (activeStepIndex() < steps.length - 1) {
      truncateSteps(activeStepIndex());
      truncateLogToOps(activeStepIndex());
    }
    const snapCount = steps.filter(s => s.snapshot).length;
    const step = {
      id: 'st' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      opId: opId || null, title, params: params ? JSON.parse(JSON.stringify(params)) : null,
      at: new Date().toISOString(), rows: rowsAfter, changes: changes || 0, summary: summary || '',
      snapshot: snapCount < MAX_SNAPSHOTS ? Utils.deepClone({ columns: F().work.columns, rows: F().work.rows }) : null
    };
    steps.push(step);
    if (steps.length > MAX_STEPS) {
      /* قدیمی‌ترین گام میانی حذف می‌شود؛ گام پایه (index 0) همیشه می‌ماند */
      steps.splice(1, 1);
    }
    f.clean.stepActive = steps.length - 1;
    return step;
  }

  /* حذف گام‌های بعد از ایندکس داده‌شده (مثل حذف گام در Power Query) */
  function truncateSteps(idx) {
    const f = F();
    if (!f.clean.steps) return;
    f.clean.steps = f.clean.steps.slice(0, idx + 1);
    f.clean.effOps = idx;
  }

  /* برش گزارش تغییرات به n عملیات مؤثر اول — برای هماهنگی گام‌ها با log */
  function truncateLogToOps(n) {
    const f = F();
    const log = f.clean.log || [];
    const out = [];
    let seen = 0;
    for (const l of log) {
      const real = l.opId !== '__undo' && l.opId !== '__redo';
      if (real) {
        if (seen >= n) break;
        seen++;
      }
      out.push(l);
    }
    f.clean.log = out;
  }

  function countRealOps() {
    return (F().clean.log || []).filter(l => l.opId !== '__undo' && l.opId !== '__redo').length;
  }

  /* بازپخش عملیات‌ها از نزدیک‌ترین اسنپ‌شات قبل از ایندکس هدف */
  function replayTo(targetIdx) {
    const f = F();
    const steps = f.clean.steps;
    let from = targetIdx;
    while (from > 0 && !steps[from].snapshot) from--;
    const snap = steps[from].snapshot;
    f.work = Utils.deepClone({ columns: snap.columns, rows: snap.rows });
    for (let i = from + 1; i <= targetIdx; i++) {
      const st = steps[i];
      if (st.opId === '__dupes') {
        /* حذف تکراری‌ها: با inverse ذخیره‌شده بازپخش می‌شود */
        if (st.params && st.params.redoInverse) applyRedoInverse(f.work, st.params.redoInverse);
        continue;
      }
      if (st.opId && OPS[st.opId]) {
        const op = OPS[st.opId];
        const r = op.apply(f.work, st.params || {});
        if (!r.ok) throw new Error(r.error || 'بازپخش گام ناموفق بود.');
        continue;
      }
      /* گام بدون اسنپ‌شات و بدون عملیات قابل بازپخش — تا همین نقطه پیش می‌رویم */
      f.clean.stepActive = i - 1;
      return;
    }
    f.clean.stepActive = targetIdx;
  }

  /* هماهنگ‌سازی ناوبری گام‌ها با واگرد/اجرای مجدد سراسری (نسخه ۲٫۴):
     شمارنده effOps = تعداد عملیات مؤثر فعلی؛ چون Undo/Redo فقط انتهای زنجیره
     را تغییر می‌دهند، عملیات‌های مؤثر همیشه «پیشوند» عملیات‌های ثبت‌شده در log
     هستند — گام‌ها با همان تعداد هم‌تراز می‌شوند. */
  function reconcileSteps() {
    const f = F();
    if (!f.clean || !f.clean.steps || !f.clean.steps.length) return;
    if (f.clean.effOps == null) f.clean.effOps = countRealOps();
    const eff = Math.max(0, Math.min(f.clean.effOps, countRealOps()));
    const steps = f.clean.steps;
    if (steps.length - 1 > eff) {
      /* واگرد: گام‌های بعد از وضعیت فعلی حذف می‌شوند (وضعیت work را خود واگرد درست کرده) */
      truncateSteps(eff);
      truncateLogToOps(eff);
    } else if (steps.length - 1 < eff) {
      /* اجرای مجدد: گام‌های بازگردیده از log بازسازی می‌شوند (بدون اسنپ‌شات)؛
         نسخه ۲٫۴: گام «__dupes» با redoInverse ذخیره‌شده در log بازسازی می‌شود تا بازپخش بعدی متوقف نماند */
      const realOps = (f.clean.log || []).filter(l => l.opId !== '__undo' && l.opId !== '__redo');
      for (let i = steps.length; i <= eff; i++) {
        const l = realOps[i - 1] || {};
        steps.push({
          id: 'st-r' + i + '-' + Math.random().toString(36).slice(2, 5),
          opId: l.opId || null,
          title: l.title || 'گام',
          params: l.params || null,
          at: l.at || new Date().toISOString(),
          rows: l.rowsAfter || 0, changes: l.changes || 0, summary: l.summary || '',
          snapshot: null
        });
      }
      f.clean.stepActive = eff;
    }
  }

  Store.subscribe((evt) => {
    if (evt === 'clean-undone' || evt === 'clean-redone') {
      try {
        const f = F();
        if (f.clean && f.clean.effOps != null) f.clean.effOps = Math.max(0, f.clean.effOps + (evt === 'clean-undone' ? -1 : 1));
        reconcileSteps();
      } catch (e) { console.error('steps reconcile', e); }
    }
  });

  /** پرش به گام k — گام‌های بعد از k حذف و داده به وضعیت همان گام برمی‌گردد.
      عملیات جدید پس از این پرش، از همین نقطه ادامه می‌یابد (رفتار Power Query). */
  function jumpToStep(idx) {
    const f = F();
    startCleaning();
    const steps = f.clean.steps;
    if (idx < 0 || idx >= steps.length) return { ok: false, error: 'گام نامعتبر است.' };
    if (idx === activeStepIndex()) return { ok: true, unchanged: true };
    const snap = (typeof UndoManager !== 'undefined') ? UndoManager.snapshotBefore('رفتن به گام «' + steps[idx].title + '»', ['work', 'clean']) : null;
    try {
      replayTo(idx);
      /* گام‌های بعد از مقصد و log مربوط به آنها حذف می‌شوند (رفتار Power Query) */
      const removed = steps.length - idx - 1;
      truncateSteps(idx);
      truncateLogToOps(idx);
      if (snap) snap.commit();
      Store.emit('clean-jump');
      return { ok: true, title: steps[idx].title, removed };
    } catch (err) {
      if (snap) snap.abort();
      return { ok: false, error: err.message };
    }
  }

  /** حذف یک گام (Remove Step در Power Query): این گام و گام‌های بعدی آن حذف و
      داده به وضعیت گام قبلی برمی‌گردد — چون هر گام به وضعیت دادهِ لحظه اجرا وابسته است،
      حذف گام میانی بدون به‌هم‌ریختگی گام‌های وابسته، فقط همراه حذف زنجیره بعدی معتبر می‌ماند. */
  function deleteStep(idx) {
    const f = F();
    startCleaning();
    const steps = f.clean.steps;
    if (idx <= 0 || idx >= steps.length) return { ok: false, error: 'گام پایه قابل حذف نیست.' };
    const snap = (typeof UndoManager !== 'undefined') ? UndoManager.snapshotBefore('حذف گام «' + steps[idx].title + '»', ['work', 'clean']) : null;
    try {
      const removed = steps.length - idx;
      truncateSteps(idx - 1);
      truncateLogToOps(idx - 1);
      replayTo(idx - 1);
      if (snap) snap.commit();
      Store.emit('clean-jump');
      return { ok: true, removed };
    } catch (err) {
      if (snap) snap.abort();
      return { ok: false, error: err.message };
    }
  }

  /* ---------- فهرست عملیات پیشنهادی بر اساس پروفایل ----------
     نسخه ۲٫۴: «ویرایش دستی سلول‌ها» به‌عنوان عملیات مستقل حذف شد؛
     قابلیت ویرایش دستی موردی، داخل پیش‌نمایش تک‌تک عملیات‌ها قرار گرفت. */
  function listOps() {
    const f = F();
    const c = f.profile ? f.profile.checks : {};
    const has = (id) => c[id] && c[id].issueCount > 0;
    return [
      { id: 'trimText', title: 'حذف فاصله‌های اضافی و یکسان‌سازی نویسه‌ها', desc: 'فاصله ابتدا/انتهای متن، فاصله‌های تکراری و تبدیل «همه نویسه‌های عربی» به فارسی (ي، ك، ة، أ، إ، ى، ؤ، ارقام عربی، کشیده و اعراب و…)', icon: 'broom', recommended: has('whitespace') },
      { id: 'unifyDates', title: 'یکسان‌سازی قالب تاریخ‌ها (شمسی)', desc: 'تبدیل همه تاریخ‌های معتبر به قالب یکدست شمسی مثل ۱۴۰۳/۰۵/۱۲؛ تاریخ‌های نامعتبر با روش انتخابی شما (تبدیل به خالی یا جایگزینی با مقدار دلخواه برای سلول‌های مشخص) اصلاح می‌شوند', icon: 'clock', recommended: has('invalidDates') },
      { id: 'coerceTypes', title: 'یکسان‌سازی نوع داده ستون‌ها', desc: 'تبدیل مقادیر ناسازگار با نوع غالب هر ستون؛ مقادیر قابل تبدیل اصلاح و مقادیر غیرقابل تبدیل با خالی یا مقدار دلخواه شما (برای سلول‌های انتخابی) جایگذاری می‌شوند', icon: 'layers', recommended: has('typeConsistency') },
      { id: 'standardizeIdentifiers', title: 'استانداردسازی شناسه‌های ایرانی (موبایل/کارت/کد ملی)', desc: 'تشخیص خودکار ستون‌های شماره موبایل، شماره کارت بانکی و کد ملی بر اساس استاندارد؛ اصلاح خودکار قالب (+۹۸، صفر ابتدای کد ملی، قالب ۴رقمی کارت) و اعتبارسنجی (الگوریتم کد ملی و Luhn)', icon: 'idCard', recommended: identifierCandidates().length > 0 },
      { id: 'unifyCategories', title: 'یکسان‌سازی دسته‌بندی‌های ناسازگار', desc: 'اعمال نگاشت یکسان‌سازی مقادیر مشابه (مثل «فروش آنلاین» و «آنلاین»)', icon: 'filter', recommended: has('categories') },
      { id: 'fixNumericRange', title: 'اصلاح مقادیر عددی نامعتبر', desc: 'مدیریت مقادیر منفی در ستون‌های مبلغ/تعداد با روش انتخابی شما: تبدیل به خالی، حذف ردیف یا مقدار دلخواه (برای سلول‌های مشخص)', icon: 'alert', recommended: has('numericRange') },
      { id: 'fillMissing', title: 'اصلاح مقادیر گمشده', desc: 'برای هر ستون جداگانه روش را انتخاب کنید: رها کردن، حذف ردیف، میانگین، میانه، مقدار پرتکرار یا مقدار دلخواه (برای سلول‌های مشخص)', icon: 'edit', recommended: has('missing') },
      { id: 'removeSparseRows', title: 'حذف رکوردهای تقریباً خالی', desc: 'حذف ردیف‌هایی که بخش بزرگی از سلول‌هایشان خالی است', icon: 'trash', recommended: (c.structural && c.structural.extra && c.structural.extra.sparseCount > 0) },
      { id: 'markInvalid', title: 'علامت‌گذاری رکوردهای نامعتبر', desc: 'افزودن ستون «وضعیت داده» و علامت‌گذاری رکوردهای نقض‌کننده قواعد منطقی یا ناقص', icon: 'shield', recommended: has('crossColumn') },
      { id: 'customRule', title: 'قاعده اختصاصی جایگزینی', desc: 'تعریف قانون خودتان: جستجو و جایگزینی در یک ستون یا همه ستون‌ها (با پشتیبانی عبارت باقاعده)', icon: 'settings', recommended: false },
      { id: 'fixTypos', title: 'اصلاح خودکار غلط‌های املایی', desc: 'شناسایی خودکار مقادیر با غلط املایی مشابه (مثل «آذربایجام شرقی» → «آذربایجان شرقی») و یکسان‌سازی با نگاشت قابل ویرایش شما', icon: 'sparkles', recommended: has('categories') || has('whitespace') }
    ];
  }

  /* ---------- پیش‌نمایش و اجرای عملیات ---------- */
  function previewOp(opId, params) {
    const work = startCleaning();
    const op = OPS[opId];
    if (!op) return { ok: false, error: 'عملیات ناشناخته' };
    try {
      const res = { ok: true, ...op.preview(work, params || {}) };
      /* اعتبارسنجی ویرایش‌های دستی موردی (نسخه ۲٫۴) */
      if (res.ok && params && params.manualEdits && params.manualEdits.length) {
        const errors = res.errors || [];
        let affected = 0;
        params.manualEdits.forEach(me => {
          const row = work.rows[me.r]; const col = work.columns[me.c];
          if (!row || !col) return;
          const oldVal = String(row[me.c] == null ? '' : row[me.c]);
          const nv = String(me.value == null ? '' : me.value);
          if (nv === oldVal) return;
          const err = validateForColumn(nv, col);
          if (err) errors.push({ r: me.r, c: me.c, col: col.name, msg: err });
          else affected++;
        });
        res.errors = errors;
        res.manualAffected = affected;
      }
      return res;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /* اعمال ویرایش‌های دستی موردی بعد از منطق خود عملیات — با ثبت inverse */
  function applyManualEdits(work, edits, inverse) {
    let applied = 0, skipped = 0;
    (edits || []).forEach(me => {
      const row = work.rows[me.r]; const col = work.columns[me.c];
      if (!row || !col) return;
      const nv = String(me.value == null ? '' : me.value);
      const oldVal = String(row[me.c] == null ? '' : row[me.c]);
      if (nv === oldVal) return;
      if (validateForColumn(nv, col)) { skipped++; return; }   /* نامعتبر بی‌صدا اعمال نمی‌شود */
      inverse.cells.push({ r: me.r, c: me.c, before: row[me.c] });
      row[me.c] = nv;
      applied++;
    });
    return { applied, skipped };
  }

  function applyOp(opId, params) {
    const f = F();
    const work = startCleaning();
    const op = OPS[opId];
    if (!op) return { ok: false, error: 'عملیات ناشناخته' };
    const res = op.apply(work, params || {});
    if (!res.ok) return res;
    /* ویرایش‌های دستی موردی کاربر (نسخه ۲٫۴) — پس از منطق خود عملیات */
    let manualInfo = { applied: 0, skipped: 0 };
    if (params && params.manualEdits && params.manualEdits.length) {
      manualInfo = applyManualEdits(work, params.manualEdits, res.inverse);
    }
    /* ثبت در موتور Undo سراسری (تا ۳۰ مرحله، قابل اجرای مجدد از هر جای نرم‌افزار) */
    let currentInverse = res.inverse;
    /* نسخه ۲٫۴: مرجع work در زمان اجرای واگرد/اجرای مجدد از F() حل می‌شود؛
       چون پرش به گام یا واگردِ اسنپ‌شات، f.work را با کلون تازه جایگزین می‌کند —
       بستن `work` در کلوژر باعث تغییر یک شیء جدا‌شده و واگرایی بی‌صدا می‌شد. */
    const entry = {
      label: 'پاک‌سازی: ' + op.title,
      scope: 'clean',
      undo() {
        const w = F().work;
        applyInverse(w, currentInverse);
        F().clean.log.push({ opId: '__undo', title: `واگرد: ${op.title}`, at: new Date().toISOString(), changes: -1 });
        Store.emit('clean-undone');
      },
      redo() {
        const w = F().work;
        let r2changes = 0, r2summary = '';
        if (opId === '__dupes') {
          applyRedoInverse(w, currentInverse);
        } else {
          const r2 = op.apply(w, params || {});
          if (!r2.ok) throw new Error(r2.error || 'اجرای مجدد ناموفق بود.');
          if (params && params.manualEdits && params.manualEdits.length) applyManualEdits(w, params.manualEdits, r2.inverse);
          currentInverse = r2.inverse;
          r2changes = r2.changes || 0;
          r2summary = r2.summary || '';
        }
        /* ثبت مجدد عملیات مؤثر در گزارش تغییرات (هماهنگ با ناوبری گام‌ها — نسخه ۲٫۴) */
        F().clean.log.push({
          opId, title: op.title, params, at: new Date().toISOString(),
          changes: r2changes, rowsBefore: w.rows.length, rowsAfter: w.rows.length,
          summary: r2summary
        });
        F().clean.log.push({ opId: '__redo', title: `اجرای مجدد: ${op.title}`, at: new Date().toISOString(), changes: -1 });
        Store.emit('clean-redone');
      }
    };
    if (typeof UndoManager !== 'undefined') UndoManager.push(entry);
    f.clean.log.push({
      opId, title: op.title, params, at: new Date().toISOString(),
      changes: res.changes + manualInfo.applied, rowsBefore: res.rowsBefore, rowsAfter: res.rowsAfter,
      summary: res.summary + (manualInfo.applied ? ` + ${Utils.fmtInt(manualInfo.applied)} ویرایش دستی موردی` : '')
    });
    /* ثبت گام در ناوبری «گام‌های اعمال‌شده» (شبیه Power Query — نسخه ۲٫۴) */
    recordStep(op.title, opId, params, res.rowsAfter, res.changes + manualInfo.applied, res.summary);
    f.clean.effOps = countRealOps();
    Store.emit('clean-applied');
    return Object.assign({}, res, {
      manualApplied: manualInfo.applied,
      manualSkipped: manualInfo.skipped,
      summary: res.summary + (manualInfo.applied ? ` + ${Utils.fmtInt(manualInfo.applied)} ویرایش دستی موردی` : '')
    });
  }

  function undoLast() {
    if (typeof UndoManager !== 'undefined') return UndoManager.undo();
    return { ok: false, error: 'موتور واگرد در دسترس نیست.' };
  }

  function redoLast() {
    if (typeof UndoManager !== 'undefined') return UndoManager.redo();
    return { ok: false, error: 'موتور اجرای مجدد در دسترس نیست.' };
  }

  /* اجرای مجدد مستقیم یک inverse ذخیره‌شده (برای عملیات‌های غیرقابل بازتولید مثل حذف تکراری) */
  function applyRedoInverse(work, inv) {
    inv.cells.forEach(c => { work.rows[c.r][c.c] = c.after !== undefined ? c.after : work.rows[c.r][c.c]; });
    if (inv.removedRows && inv.removedRows.length) {
      inv.removedRows.slice().sort((a, b) => b.r - a.r).forEach(x => { work.rows.splice(x.r, 1); });
    }
  }

  function canUndo() { return typeof UndoManager !== 'undefined' ? UndoManager.canUndo() : false; }
  function canRedo() { return typeof UndoManager !== 'undefined' ? UndoManager.canRedo() : false; }

  /* تبدیل «3,7,12» به مجموعه شماره رکوردها (صفر-مبنا) برای محدودسازی قاعده اختصاصی */
  function parseRowTargets(input) {
    if (input === null || input === undefined || String(input).trim() === '') return null;
    const set = new Set();
    String(input).split(/[,،\s]+/).forEach(t => {
      t = t.trim();
      const m = t.match(/^(\d+)-(\d+)$/); /* بازه مثل 5-10 */
      if (m) { for (let i = +m[1]; i <= +m[2]; i++) if (i > 0) set.add(i - 1); return; }
      const n = parseInt(Utils.normalizeDigits(t), 10);
      if (n > 0) set.add(n - 1);
    });
    return set.size ? set : null;
  }

  /* ---------- کاندیدهای ستون‌های شناسه ایرانی ---------- */
  function identifierCandidates() {
    const work = startCleaning();
    const out = [];
    const KIND_FA = { mobile: 'شماره موبایل', card: 'شماره کارت بانکی', nationalId: 'کد ملی' };
    work.columns.forEach((c, ci) => {
      if (c.type === 'number' || c.type === 'date' || c.type === 'boolean') return;
      const counts = { mobile: 0, card: 0, nationalId: 0, fixable: 0, invalid: 0 };
      let nonEmpty = 0;
      work.rows.forEach(r => {
        const v = r[ci];
        if (String(v == null ? '' : v).trim() === '') return;
        nonEmpty++;
        const kind = Utils.detectIdentifier(v);
        if (!kind) { counts.invalid++; return; }
        counts[kind]++;
        const fx = Utils.fixIdentifier(v, kind);
        if (fx.fixed) counts.fixable++;
      });
      const kinds = ['mobile', 'card', 'nationalId'].filter(k => counts[k] > 0);
      const dominant = kinds.sort((a, b) => counts[b] - counts[a])[0];
      if (dominant && nonEmpty > 0 && counts[dominant] / nonEmpty >= 0.6) {
        out.push({ ci, colName: c.name, kind: dominant, kindFa: KIND_FA[dominant], matched: counts[dominant], fixable: counts.fixable, invalid: counts.invalid, nonEmpty });
      }
    });
    return out;
  }

  function applyInverse(work, inv) {
    inv.cells.forEach(c => { work.rows[c.r][c.c] = c.before; });
    if (inv.addedCol != null) {
      if (inv.colWasNew) work.columns.splice(inv.addedCol, 1), work.rows.forEach(r => r.splice(inv.addedCol, 1));
    }
    if (inv.removedRows && inv.removedRows.length) {
      inv.removedRows.sort((a, b) => a.r - b.r).forEach(x => {
        work.rows.splice(x.r, 0, x.row);
      });
    }
  }

  /* ---------- کاندیدهای پیکربندی ---------- */
  function fillCandidates() {
    const work = startCleaning();
    const out = [];
    work.columns.forEach((c, ci) => {
      const missing = work.rows.filter(r => String(r[ci] == null ? '' : r[ci]).trim() === '').length;
      if (!missing) return;
      let suggested = { method: 'leave', value: '' };
      if (c.type === 'number') suggested = { method: 'median', value: '' };
      else if (c.type === 'text') suggested = { method: 'mode', value: '' };
      out.push({ ci, colName: c.name, type: c.type, missing, suggested });
    });
    return out;
  }

  function rangeCandidates() {
    const work = startCleaning();
    const out = [];
    work.columns.forEach((c, ci) => {
      if (c.type !== 'number' && c.type !== 'mixed') return;
      if (!(/قیمت|مبلغ|هزینه|درآمد|تعداد|count|qty|price|amount/i.test(c.name))) return;
      let negatives = 0;
      work.rows.forEach(r => {
        const n = Utils.parseNum(r[ci]);
        if (n !== null && n < 0) negatives++;
      });
      if (negatives) out.push({ ci, colName: c.name, negatives });
    });
    return out;
  }

  function categoryMappings() {
    const f = F();
    if (!f.profile || !f.profile.checks.categories) return {};
    const perCol = (f.profile.checks.categories.extra && f.profile.checks.categories.extra.perCol) || [];
    const mapping = {};
    perCol.forEach(pc => {
      mapping[pc.name] = {};
      pc.groups.forEach(g => {
        g.variants.forEach(v => { mapping[pc.name][v] = g.canonical; });
      });
    });
    // نگاشت نسبت به نسخه کاری ممکن است اندکی جابه‌جا شده باشد؛ فقط مقادیر موجود نگه داشته می‌شود
    return mapping;
  }

  /* ═══════════ پیاده‌سازی عملیات ═══════════ */

  /* آیا سلول در فهرست هدف‌گذاری «مقدار دلخواه» انتخاب شده است؟
     customCells: آرایه {r,c} — اگر خالی/نامشخص باشد همه سلول‌های متأثر هدف قرار می‌گیرند */
  function cellInTargets(r, c, customCells) {
    if (!customCells || !customCells.length) return true;
    return customCells.some(t => t.r === r && t.c === c);
  }

  /* اعتبارسنجی مقدار جدید متناسب با نوع ستون — برای ویرایش دستی سلول‌ها
     خروجی: پیام خطا (رشته) یا null در صورت معتبر بودن. داده نامعتبر بی‌صدا اصلاح نمی‌شود. */
  function validateForColumn(val, col) {
    const s = String(val == null ? '' : val).trim();
    if (s === '') return null; /* خالی کردن سلول همیشه مجاز است (تبدیل به خالی) */
    const t = col && col.type;
    if (t === 'number') {
      if (Utils.parseNum(s) === null) return 'مقدار باید عدد باشد.';
      return null;
    }
    if (t === 'date') {
      const pv = Utils.parseDateValue(s);
      if (!pv.valid) return 'تاریخ معتبر شمسی/میلادی نیست (مثل ۱۴۰۳/۰۵/۱۲).';
      return null;
    }
    if (t === 'boolean') {
      if (!/^(true|false|yes|no|بله|خیر|1|0)$/i.test(s)) return 'مقدار منطقی معتبر نیست (بله/خیر).';
      return null;
    }
    if (t === 'identifier') {
      const det = Utils.detectIdentifier ? Utils.detectIdentifier(s) : null;
      if (det && det.kind && !det.valid) return `${det.kindFa || 'شناسه'} از الگوریتم اعتبارسنجی رد شد.`;
      return null;
    }
    return null; /* متن/مختلط: هر مقداری پذیرفته می‌شود */
  }

  const OPS = {

    trimText: {
      title: 'حذف فاصله‌های اضافی و یکسان‌سازی نویسه‌ها',
      defaultParams: { collapse: true, persian: true },
      preview(work, p) {
        const diffs = []; const affectedCells = [];
        let affected = 0;
        work.rows.forEach((row, ri) => {
          row.forEach((v, ci) => {
            if (typeof v !== 'string' || !v.trim()) return;
            let nv = v;
            if (p.persian) nv = Utils.normalizeArabic(nv);
            nv = nv.trim();
            if (p.collapse) nv = nv.replace(/\s{2,}/g, ' ');
            if (nv !== v) {
              affected++; affectedCells.push({ r: ri, c: ci });
              if (diffs.length < 10) diffs.push({ row: ri + 1, col: work.columns[ci].name, before: JSON.stringify(v), after: JSON.stringify(nv) });
            }
          });
        });
        return { affected, diffs, affectedCells, affectedRows: new Set(diffs.map(d => d.row)).size };
      },
      apply(work, p) {
        const inverse = { cells: [], removedRows: [] };
        let changes = 0;
        work.rows.forEach((row, ri) => {
          row.forEach((v, ci) => {
            if (typeof v !== 'string' || !v.trim()) return;
            let nv = v;
            if (p.persian) nv = Utils.normalizeArabic(nv);
            nv = nv.trim();
            if (p.collapse) nv = nv.replace(/\s{2,}/g, ' ');
            if (nv !== v) {
              inverse.cells.push({ r: ri, c: ci, before: v });
              row[ci] = nv;
              changes++;
            }
          });
        });
        return { ok: true, changes, rowsBefore: work.rows.length, rowsAfter: work.rows.length, inverse, summary: `${Utils.fmtInt(changes)} سلول متنی یکسان‌سازی شد (همه نویسه‌های عربی به فارسی تبدیل شدند)` };
      }
    },

    unifyDates: {
      title: 'یکسان‌سازی قالب تاریخ‌ها (شمسی)',
      defaultParams: { target: 'jalali', invalidAction: 'empty', invalidValue: '', customCells: null },
      preview(work, p) {
        const diffs = []; const affectedCells = []; let converted = 0, invalidated = 0;
        work.columns.forEach((c, ci) => {
          if (!isDateColName(c.name, c.type)) return;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (typeof v !== 'string' || !v.trim()) return;
            const pv = Utils.parseDateValue(v);
            if (pv.valid) {
              const nv = p.target === 'iso' ? gIso(pv.serial) : Utils.jString({ jy: pv.jy, jm: pv.jm, jd: pv.jd });
              if (nv !== v) { converted++; if (diffs.length < 10) diffs.push({ row: ri + 1, col: c.name, before: v, after: nv }); }
            } else if (pv.isDate && p.invalidAction) {
              invalidated++; affectedCells.push({ r: ri, c: ci });
              const targeted = cellInTargets(ri, ci, p.customCells);
              const after = p.invalidAction === 'custom'
                ? (targeted ? `«${p.invalidValue || '—'}» (مقدار دلخواه)` : '(خالی)')
                : '(خالی — نامعتبر)';
              if (diffs.length < 10) diffs.push({ row: ri + 1, col: c.name, before: v, after });
            }
          });
        });
        return { affected: converted + invalidated, diffs, affectedCells, customTargetable: p.invalidAction === 'custom' };
      },
      apply(work, p) {
        const inverse = { cells: [], removedRows: [] };
        let converted = 0, invalidated = 0, customed = 0;
        work.columns.forEach((c, ci) => {
          if (!isDateColName(c.name, c.type)) return;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (typeof v !== 'string' || !v.trim()) return;
            const pv = Utils.parseDateValue(v);
            if (pv.valid) {
              const nv = p.target === 'iso' ? gIso(pv.serial) : Utils.jString({ jy: pv.jy, jm: pv.jm, jd: pv.jd });
              if (nv !== v) { inverse.cells.push({ r: ri, c: ci, before: v }); row[ci] = nv; converted++; }
            } else if (pv.isDate && p.invalidAction) {
              inverse.cells.push({ r: ri, c: ci, before: v });
              if (p.invalidAction === 'custom' && cellInTargets(ri, ci, p.customCells)) {
                row[ci] = String(p.invalidValue == null ? '' : p.invalidValue);
                customed++;
              } else {
                row[ci] = ''; /* تبدیل به خالی — سلول با چیزی پر نمی‌شود */
              }
              invalidated++;
            }
          });
        });
        return {
          ok: true, changes: converted + invalidated, rowsBefore: work.rows.length, rowsAfter: work.rows.length,
          inverse, summary: `${Utils.fmtInt(converted)} تاریخ یکدست شد، ${Utils.fmtInt(invalidated - customed)} تاریخ نامعتبر به خالی تبدیل شد، ${Utils.fmtInt(customed)} سلول با مقدار دلخواه جایگزین شد`
        };
      }
    },

    coerceTypes: {
      title: 'یکسان‌سازی نوع داده ستون‌ها',
      defaultParams: { fillAction: 'empty', fillValue: '', customCells: null },
      preview(work, p) {
        const diffs = []; const affectedCells = []; let affected = 0;
        work.columns.forEach((c, ci) => {
          const dominant = dominantType(work, ci);
          if (!dominant) return;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (String(v == null ? '' : v).trim() === '') return;
            const t = Utils.classifyValue(v);
            if (t === dominant) return;
            const nv = coerce(v, dominant);
            const targeted = cellInTargets(ri, ci, p.customCells);
            const shown = (nv === '' && p.fillAction === 'custom')
              ? (targeted ? `«${p.fillValue || '—'}» (مقدار دلخواه)` : '(خالی)')
              : nv;
            affected++; affectedCells.push({ r: ri, c: ci });
            if (diffs.length < 10) diffs.push({ row: ri + 1, col: c.name, before: v, after: shown === '' ? '(خالی)' : shown });
          });
        });
        return { affected, diffs, affectedCells, customTargetable: p.fillAction === 'custom' };
      },
      apply(work, p) {
        const inverse = { cells: [], removedRows: [] };
        let changes = 0, customed = 0;
        const perCol = [];
        work.columns.forEach((c, ci) => {
          const dominant = dominantType(work, ci);
          if (!dominant) return;
          let colCh = 0;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (String(v == null ? '' : v).trim() === '') return;
            if (Utils.classifyValue(v) === dominant) return;
            inverse.cells.push({ r: ri, c: ci, before: v });
            let nv = coerce(v, dominant);
            if (nv === '' && p.fillAction === 'custom' && cellInTargets(ri, ci, p.customCells)) {
              nv = String(p.fillValue == null ? '' : p.fillValue);
              customed++;
            }
            row[ci] = nv;
            colCh++; changes++;
          });
          perCol.push({ name: c.name, target: dominant, changed: colCh });
          c.type = dominant;
        });
        return {
          ok: true, changes, rowsBefore: work.rows.length, rowsAfter: work.rows.length, inverse,
          summary: `نوع ستون‌ها یکسان شد (${perCol.filter(p => p.changed).map(p => `«${p.name}» → ${typeFa(p.target)}`).join('، ') || 'بدون تغییر'}) — ${Utils.fmtInt(customed)} سلول با مقدار دلخواه، بقیه به خالی تبدیل شدند`
        };
      }
    },

    unifyCategories: {
      title: 'یکسان‌سازی دسته‌بندی‌های ناسازگار',
      defaultParams: {},
      preview(work, p) {
        const mapping = (p && p.mapping) || categoryMappings();
        const diffs = []; let affected = 0;
        Object.keys(mapping).forEach(colName => {
          const ci = work.columns.findIndex(c => c.name === colName);
          if (ci < 0) return;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (typeof v !== 'string' || mapping[colName][v] === undefined) return;
            const nv = mapping[colName][v];
            if (nv !== v) { affected++; if (diffs.length < 10) diffs.push({ row: ri + 1, col: colName, before: v, after: nv }); }
          });
        });
        return { affected, diffs };
      },
      apply(work, p) {
        const mapping = (p && p.mapping) || categoryMappings();
        const inverse = { cells: [], removedRows: [] };
        let changes = 0; const perCol = {};
        Object.keys(mapping).forEach(colName => {
          const ci = work.columns.findIndex(c => c.name === colName);
          if (ci < 0) return;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (typeof v !== 'string' || mapping[colName][v] === undefined) return;
            const nv = mapping[colName][v];
            if (nv !== v) {
              inverse.cells.push({ r: ri, c: ci, before: v });
              row[ci] = nv; changes++;
              perCol[colName] = (perCol[colName] || 0) + 1;
            }
          });
        });
        return {
          ok: true, changes, rowsBefore: work.rows.length, rowsAfter: work.rows.length, inverse,
          summary: `${Utils.fmtInt(changes)} مقدار طبقه‌ای یکسان شد${Object.keys(perCol).length ? ' (' + Object.keys(perCol).map(k => `«${k}»: ${Utils.fmtInt(perCol[k])}`).join('، ') + ')' : ''}`
        };
      }
    },

    fixNumericRange: {
      title: 'اصلاح مقادیر عددی نامعتبر',
      defaultParams: {},
      preview(work, p) {
        const cfg = (p && p.columns) || [];
        const diffs = []; const affectedCells = []; let affected = 0;
        cfg.forEach(cfgCol => {
          const ci = work.columns.findIndex(c => c.name === cfgCol.colName);
          if (ci < 0) return;
          work.rows.forEach((row, ri) => {
            const n = Utils.parseNum(row[ci]);
            if (n === null || n >= 0) return;
            affected++; affectedCells.push({ r: ri, c: ci });
            const targeted = cellInTargets(ri, ci, p.customCells);
            const after = cfgCol.action === 'dropRow' ? '(حذف ردیف)'
              : cfgCol.action === 'custom' ? (targeted ? `«${cfgCol.value || '—'}» (مقدار دلخواه)` : '(خالی)') : '(خالی)';
            if (diffs.length < 10) diffs.push({ row: ri + 1, col: cfgCol.colName, before: row[ci], after });
          });
        });
        return { affected, diffs, affectedCells, customTargetable: cfg.some(c => c.action === 'custom') };
      },
      apply(work, p) {
        const cfg = (p && p.columns) || [];
        const inverse = { cells: [], removedRows: [] };
        let changes = 0, dropped = 0, customed = 0, emptied = 0;
        cfg.forEach(cfgCol => {
          const ci = work.columns.findIndex(c => c.name === cfgCol.colName);
          if (ci < 0) return;
          for (let ri = work.rows.length - 1; ri >= 0; ri--) {
            const n = Utils.parseNum(work.rows[ri][ci]);
            if (n === null || n >= 0) continue;
            if (cfgCol.action === 'dropRow') {
              inverse.removedRows.push({ r: ri, row: work.rows[ri].slice() });
              work.rows.splice(ri, 1);
              dropped++;
            } else {
              inverse.cells.push({ r: ri, c: ci, before: work.rows[ri][ci] });
              if (cfgCol.action === 'custom' && cellInTargets(ri, ci, p.customCells)) {
                work.rows[ri][ci] = String(cfgCol.value == null ? '' : cfgCol.value);
                customed++;
              } else {
                work.rows[ri][ci] = ''; /* تبدیل به خالی */
                emptied++;
              }
            }
            changes++;
          }
        });
        inverse.removedRows.reverse();
        return {
          ok: true, changes, rowsBefore: work.rows.length + dropped, rowsAfter: work.rows.length, inverse,
          summary: `${Utils.fmtInt(emptied)} مقدار به خالی تبدیل شد، ${Utils.fmtInt(customed)} سلول با مقدار دلخواه جایگزین شد، ${Utils.fmtInt(dropped)} ردیف حذف شد`
        };
      }
    },

    fillMissing: {
      title: 'اصلاح مقادیر گمشده',
      defaultParams: {},
      preview(work, p) {
        const cfg = (p && p.columns) || [];
        const diffs = []; const affectedCells = []; let affected = 0;
        cfg.forEach(cfgCol => {
          if (!cfgCol.method || cfgCol.method === 'leave') return;
          const ci = work.columns.findIndex(c => c.name === cfgCol.colName);
          if (ci < 0) return;
          const fillVal = computeFillValue(work, ci, cfgCol);
          if (cfgCol.method === 'dropRow') {
            const cnt = work.rows.filter(r => String(r[ci] == null ? '' : r[ci]).trim() === '').length;
            affected += cnt;
            if (diffs.length < 10) diffs.push({ row: '—', col: cfgCol.colName, before: 'ردیف‌های دارای مقدار خالی', after: `حذف ${Utils.fmtInt(cnt)} ردیف` });
            return;
          }
          work.rows.forEach((row, ri) => {
            if (String(row[ci] == null ? '' : row[ci]).trim() !== '') return;
            if (cfgCol.method === 'custom') affectedCells.push({ r: ri, c: ci });
            const targeted = cellInTargets(ri, ci, p.customCells);
            affected++;
            if (diffs.length < 10) diffs.push({ row: ri + 1, col: cfgCol.colName, before: 'خالی', after: fillVal === '' ? '(همچنان خالی)' : (cfgCol.method === 'custom' && !targeted ? '(همچنان خالی — خارج از هدف‌گذاری)' : fillVal) });
          });
        });
        return { affected, diffs, affectedCells, customTargetable: cfg.some(c => c.method === 'custom') };
      },
      apply(work, p) {
        const cfg = (p && p.columns) || [];
        const inverse = { cells: [], removedRows: [] };
        let filled = 0, dropped = 0, customed = 0;
        const perCol = {};
        cfg.forEach(cfgCol => {
          if (!cfgCol.method || cfgCol.method === 'leave') return;
          const ci = work.columns.findIndex(c => c.name === cfgCol.colName);
          if (ci < 0) return;
          if (cfgCol.method === 'dropRow') {
            let d = 0;
            for (let ri = work.rows.length - 1; ri >= 0; ri--) {
              if (String(work.rows[ri][ci] == null ? '' : work.rows[ri][ci]).trim() === '') {
                inverse.removedRows.push({ r: ri, row: work.rows[ri].slice() });
                work.rows.splice(ri, 1);
                dropped++; d++;
              }
            }
            inverse.removedRows.reverse();
            perCol[cfgCol.colName] = `حذف ${Utils.fmtInt(d)} ردیف`;
            return;
          }
          const fillVal = computeFillValue(work, ci, cfgCol);
          let cnt = 0;
          work.rows.forEach((row, ri) => {
            if (String(row[ci] == null ? '' : row[ci]).trim() !== '') return;
            if (cfgCol.method === 'custom' && !cellInTargets(ri, ci, p.customCells)) return; /* خارج از سلول‌های هدف */
            inverse.cells.push({ r: ri, c: ci, before: '' });
            row[ci] = fillVal;
            cnt++; filled++;
            if (cfgCol.method === 'custom') customed++;
          });
          perCol[cfgCol.colName] = `پر کردن ${Utils.fmtInt(cnt)} سلول${fillVal !== '' ? ` با «${fillVal}»` : ''}`;
        });
        const summaryParts = Object.entries(perCol).map(([k, v]) => `«${k}»: ${v}`);
        return {
          ok: true, changes: filled + dropped, rowsBefore: work.rows.length + dropped, rowsAfter: work.rows.length,
          inverse, summary: (summaryParts.join('؛ ') || 'تغییری اعمال نشد (همه روش‌ها «رها کردن» بودند)') + (customed ? ` — ${Utils.fmtInt(customed)} سلول بر اساس هدف‌گذاری شما` : '')
        };
      }
    },

    removeSparseRows: {
      title: 'حذف رکوردهای تقریباً خالی',
      defaultParams: { threshold: 0.6 },
      preview(work, p) {
        const th = p.threshold || 0.6;
        const idxs = [];
        work.rows.forEach((row, ri) => {
          const empty = row.filter(v => String(v == null ? '' : v).trim() === '').length;
          if (empty / row.length >= th) idxs.push(ri + 1);
        });
        return { affected: idxs.length, diffs: idxs.slice(0, 10).map(r => ({ row: r, col: 'کل ردیف', before: 'ردیف ناقص', after: 'حذف' })) };
      },
      apply(work, p) {
        const th = p.threshold || 0.6;
        const inverse = { cells: [], removedRows: [] };
        for (let ri = work.rows.length - 1; ri >= 0; ri--) {
          const empty = work.rows[ri].filter(v => String(v == null ? '' : v).trim() === '').length;
          if (empty / work.rows[ri].length >= th) {
            inverse.removedRows.push({ r: ri, row: work.rows[ri].slice() });
            work.rows.splice(ri, 1);
          }
        }
        inverse.removedRows.reverse();
        const n = inverse.removedRows.length;
        return { ok: true, changes: n, rowsBefore: work.rows.length + n, rowsAfter: work.rows.length, inverse, summary: `${Utils.fmtInt(n)} ردیف ناقص حذف شد` };
      }
    },

    markInvalid: {
      title: 'علامت‌گذاری رکوردهای نامعتبر',
      defaultParams: { markCross: true, markSparse: true, statusCol: 'وضعیت داده' },
      preview(work, p) {
        const { rows: flagged, colNew } = flagPlan(work, p);
        return {
          affected: flagged.length,
          diffs: flagged.slice(0, 10).map(x => ({ row: x.r + 1, col: p.statusCol, before: x.before, after: x.after })),
          extraNote: colNew ? `ستون جدید «${p.statusCol}» به جدول اضافه می‌شود` : `ستون موجود «${p.statusCol}» به‌روزرسانی می‌شود`
        };
      },
      apply(work, p) {
        const { rows: flagged, colIdx, colNew } = flagPlan(work, p);
        const inverse = { cells: [], removedRows: [], addedCol: colIdx, colWasNew: colNew };
        flagged.forEach(x => {
          inverse.cells.push({ r: x.r, c: colIdx, before: x.before });
          work.rows[x.r][colIdx] = x.after;
        });
        return {
          ok: true, changes: flagged.length, rowsBefore: work.rows.length, rowsAfter: work.rows.length,
          inverse, summary: `${Utils.fmtInt(flagged.length)} رکورد در ستون «${p.statusCol}» علامت‌گذاری شد${colNew ? ' (ستون جدید اضافه شد)' : ''}`
        };
      }
    },

    customRule: {
      title: 'قاعده اختصاصی جایگزینی',
      defaultParams: { colName: '', find: '', replace: '', regex: false, allColumns: false, targetRows: null },
      preview(work, p) {
        const diffs = []; const affectedCells = [];
        let affected = 0;
        const rows = parseRowTargets(p.targetRows);
        const cols = p.allColumns ? work.columns.map((c, i) => i) : [work.columns.findIndex(c => c.name === p.colName)].filter(i => i >= 0);
        let re = null;
        try {
          re = p.regex ? new RegExp(p.find, 'g') : null;
        } catch (e) { return { affected: 0, diffs, error: 'عبارت باقاعده نامعتبر است: ' + e.message }; }
        work.rows.forEach((row, ri) => {
          if (rows && !rows.has(ri)) return; /* محدود به رکوردهای انتخابی */
          cols.forEach(ci => {
            const v = row[ci];
            if (typeof v !== 'string' || !v) return;
            const nv = p.regex ? v.replace(new RegExp(p.find, 'g'), p.replace) : v.split(p.find).join(p.replace);
            if (nv !== v) { affected++; affectedCells.push({ r: ri, c: ci }); if (diffs.length < 10) diffs.push({ row: ri + 1, col: work.columns[ci].name, before: v, after: nv }); }
          });
        });
        return { affected, diffs, affectedCells, rowTargetable: true };
      },
      apply(work, p) {
        const inverse = { cells: [], removedRows: [] };
        let changes = 0;
        const rows = parseRowTargets(p.targetRows);
        const cols = p.allColumns ? work.columns.map((c, i) => i) : [work.columns.findIndex(c => c.name === p.colName)].filter(i => i >= 0);
        work.rows.forEach((row, ri) => {
          if (rows && !rows.has(ri)) return;
          cols.forEach(ci => {
            const v = row[ci];
            if (typeof v !== 'string' || !v) return;
            const nv = p.regex ? v.replace(new RegExp(p.find, 'g'), p.replace) : v.split(p.find).join(p.replace);
            if (nv !== v) { inverse.cells.push({ r: ri, c: ci, before: v }); row[ci] = nv; changes++; }
          });
        });
        return {
          ok: true, changes, rowsBefore: work.rows.length, rowsAfter: work.rows.length, inverse,
          summary: `قاعده جایگزینی روی ${Utils.fmtInt(changes)} سلول اعمال شد${rows ? ` (محدود به ${Utils.fmtInt(rows.size)} رکورد انتخابی)` : ''}`
        };
      }
    },

    standardizeIdentifiers: {
      title: 'استانداردسازی شناسه‌های ایرانی (موبایل/کارت/کد ملی)',
      defaultParams: { columns: [], invalidValue: '', customCells: null },
      preview(work, p) {
        const cfg = (p && p.columns) || [];
        const diffs = []; const affectedCells = []; let affected = 0;
        cfg.forEach(cfgCol => {
          const ci = work.columns.findIndex(c => c.name === cfgCol.colName);
          if (ci < 0) return;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (String(v == null ? '' : v).trim() === '') return;
            const fx = Utils.fixIdentifier(v, cfgCol.kind);
            if (fx.fixed) {
              affected++; affectedCells.push({ r: ri, c: ci });
              if (diffs.length < 10) diffs.push({ row: ri + 1, col: cfgCol.colName, before: String(v), after: fx.value + (fx.valid ? '' : ' ⚠ نامعتبر') });
            } else if (!fx.valid && cfgCol.action && cfgCol.action !== 'keep') {
              affected++; affectedCells.push({ r: ri, c: ci });
              const targeted = cellInTargets(ri, ci, p.customCells);
              if (diffs.length < 10) diffs.push({ row: ri + 1, col: cfgCol.colName, before: String(v), after: cfgCol.action === 'custom' ? (targeted ? `«${p.invalidValue || '—'}» (مقدار دلخواه)` : '(خالی)') : '(خالی — نامعتبر)' });
            }
          });
        });
        return { affected, diffs, affectedCells, note: 'مقادیر نامعتبر (رد نشدن از الگوریتم اعتبارسنجی) با روش انتخابی شما برای هر ستون مدیریت می‌شوند.', customTargetable: cfg.some(c => c.action === 'custom') };
      },
      apply(work, p) {
        const cfg = (p && p.columns) || [];
        const inverse = { cells: [], removedRows: [] };
        let fixedCount = 0, invalidated = 0, customed = 0;
        const perCol = {};
        cfg.forEach(cfgCol => {
          const ci = work.columns.findIndex(c => c.name === cfgCol.colName);
          if (ci < 0) return;
          let cFixed = 0, cInvalid = 0;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (String(v == null ? '' : v).trim() === '') return;
            const fx = Utils.fixIdentifier(v, cfgCol.kind);
            if (fx.fixed) {
              inverse.cells.push({ r: ri, c: ci, before: v });
              row[ci] = fx.value;
              fixedCount++; cFixed++;
            }
            if (!fx.valid && cfgCol.action && cfgCol.action !== 'keep') {
              inverse.cells.push({ r: ri, c: ci, before: row[ci] });
              if (cfgCol.action === 'custom' && cellInTargets(ri, ci, p.customCells)) {
                row[ci] = String(p.invalidValue == null ? '' : p.invalidValue);
                customed++;
              } else if (cfgCol.action === 'custom') {
                row[ci] = ''; /* خارج از هدف‌گذاری → خالی */
              } else {
                row[ci] = ''; /* تبدیل به خالی */
              }
              invalidated++; cInvalid++;
            }
          });
          if (cFixed || cInvalid) perCol[cfgCol.colName] = `${Utils.fmtInt(cFixed)} اصلاح قالب، ${Utils.fmtInt(cInvalid)} نامعتبر`;
        });
        const parts = Object.entries(perCol).map(([k, v]) => `«${k}»: ${v}`);
        return {
          ok: true, changes: fixedCount + invalidated, rowsBefore: work.rows.length, rowsAfter: work.rows.length, inverse,
          summary: `${Utils.fmtInt(fixedCount)} مقدار استانداردسازی شد، ${Utils.fmtInt(invalidated)} مقدار نامعتبر مدیریت شد (${Utils.fmtInt(customed)} با مقدار دلخواه)${parts.length ? ' — ' + parts.join('؛ ') : ''}`
        };
      }
    },

    fixTypos: {
      title: 'اصلاح خودکار غلط‌های املایی',
      defaultParams: { mapping: null, sensitivity: 'medium' },
      preview(work, p) {
        const mapping = (p && p.mapping) || typoMappings(work, p && p.sensitivity);
        const diffs = []; const affectedCells = []; let affected = 0;
        Object.keys(mapping).forEach(colName => {
          const ci = work.columns.findIndex(c => c.name === colName);
          if (ci < 0) return;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (typeof v !== 'string' || !v.trim()) return;
            const nv = mapping[colName][v];
            if (nv !== undefined && nv !== v) {
              affected++; affectedCells.push({ r: ri, c: ci });
              if (diffs.length < 12) diffs.push({ row: ri + 1, col: colName, before: v, after: nv });
            }
          });
        });
        return { affected, diffs, affectedCells, mapping, mappingCount: Object.keys(mapping).reduce((s, k) => s + Object.keys(mapping[k]).length, 0) };
      },
      apply(work, p) {
        const mapping = (p && p.mapping) || typoMappings(work, p && p.sensitivity);
        const inverse = { cells: [], removedRows: [] };
        let changes = 0; const perCol = {};
        Object.keys(mapping).forEach(colName => {
          const ci = work.columns.findIndex(c => c.name === colName);
          if (ci < 0) return;
          work.rows.forEach((row, ri) => {
            const v = row[ci];
            if (typeof v !== 'string' || !v.trim()) return;
            const nv = mapping[colName][v];
            if (nv !== undefined && nv !== v) {
              inverse.cells.push({ r: ri, c: ci, before: v });
              row[ci] = nv; changes++;
              perCol[colName] = (perCol[colName] || 0) + 1;
            }
          });
        });
        return {
          ok: true, changes, rowsBefore: work.rows.length, rowsAfter: work.rows.length, inverse,
          summary: `${Utils.fmtInt(changes)} مقدار دارای غلط املایی اصلاح شد${Object.keys(perCol).length ? ' (' + Object.keys(perCol).map(k => `«${k}»: ${Utils.fmtInt(perCol[k])}`).join('، ') + ')' : ''}`
        };
      }
    }
  };

  /* ═══════════ تشخیص غلط املایی (فاصله ویرایشی + فراوانی) ═══════════ */
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  const TYPO_SENSITIVITY = { low: { maxDist: 1, minLen: 5 }, medium: { maxDist: 2, minLen: 4 }, high: { maxDist: 2, minLen: 3 } };

  /**
   * ساخت نگاشت اصلاح خودکار برای ستون‌های متنی:
   * مقادیر یکتای هر ستون مقایسه زوجی می‌شوند؛ زوج‌هایی با فاصله ویرایشی کم
   * گروه می‌شوند و مقدار پرتکرار به‌عنوان شکل صحیح (canonical) انتخاب می‌شود.
   * گاردهای ایمنی: ستون‌های شناسه/کد حذف می‌شوند؛ ستون‌های با مقادیر تقریباً یکتا
   * (شبیه شناسه) حذف می‌شوند؛ فقط وقتی نگاشت ساخته می‌شود که فراوانی شکل غلط
   * به‌طور قطعی کمتر از شکل صحیح باشد (جلوگیری از ادغام شناسه‌ها و مقادیر مشروع).
   */
  function typoMappings(work, sensitivity) {
    const sens = TYPO_SENSITIVITY[sensitivity || 'medium'] || TYPO_SENSITIVITY.medium;
    const mapping = {};
    const MAX_DISTINCT = 250;
    const ID_LIKE = /شناسه|کد|ردیف|شماره|\bid\b|code|serial|number/i;
    work.columns.forEach((c, ci) => {
      if (c.type !== 'text' && c.type !== 'mixed') return;
      if (ID_LIKE.test(c.name)) return;
      const freq = new Map();
      let nonEmpty = 0;
      work.rows.forEach(r => {
        const v = r[ci];
        if (typeof v !== 'string' || !v.trim()) return;
        nonEmpty++;
        const k = Utils.normalizeFa(v);
        if (!k) return;
        if (!freq.has(k)) freq.set(k, { display: v.trim(), count: 0 });
        freq.get(k).count++;
      });
      const items = [...freq.values()];
      if (items.length < 2 || items.length > MAX_DISTINCT) return;
      // ستون‌های با مقادیر تقریباً یکتا (شبیه شناسه/کد) اصلاح نمی‌شوند
      if (items.length > Math.max(20, nonEmpty * 0.5)) return;
      // مرتب‌سازی نزولی بر اساس فراوانی — کانونی = پرتکرارترین
      items.sort((a, b) => b.count - a.count || a.display.localeCompare(b.display, 'fa'));
      const colMap = {};
      const assigned = new Set();
      for (let i = 0; i < items.length; i++) {
        const canon = items[i];
        if (assigned.has(canon.display)) continue;
        for (let j = i + 1; j < items.length; j++) {
          const variant = items[j];
          if (assigned.has(variant.display)) continue;
          // شرط قطعی: شکل غلط باید به‌طور قطعی کم‌فراوانی‌تر از شکل صحیح باشد
          if (variant.count >= canon.count) continue;
          const a = canon.display, b = variant.display;
          if (a.length < sens.minLen || b.length < sens.minLen) continue;
          // شرط طول مشابه برای جلوگیری از ادغام کلمات کوتاه متفاوت
          if (Math.abs(a.length - b.length) > sens.maxDist) continue;
          const d = levenshtein(a, b);
          if (d <= sens.maxDist) {
            colMap[variant.display] = canon.display;
            assigned.add(variant.display);
          }
        }
      }
      if (Object.keys(colMap).length) mapping[c.name] = colMap;
    });
    return mapping;
  }
  function isDateColName(name, type) {
    return type === 'date' || /تاریخ|date/i.test(name);
  }
  function dominantType(work, ci) {
    const counts = {};
    let nonEmpty = 0;
    work.rows.forEach(r => {
      const t = Utils.classifyValue(r[ci]);
      if (t === 'empty') return;
      nonEmpty++;
      counts[t] = (counts[t] || 0) + 1;
    });
    if (nonEmpty === 0) return null;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return (top[1] / nonEmpty >= 0.6) ? top[0] : 'text';
  }
  function coerce(v, target) {
    if (target === 'identifier') {
      /* شناسه‌های ایرانی (موبایل/کارت/کد ملی) به‌صورت متن استاندارد نگه داشته می‌شوند */
      const fx = Utils.fixIdentifier(v);
      return fx.value != null ? String(fx.value) : String(v).trim();
    }
    if (target === 'number') { const n = Utils.parseNum(v); return n === null ? '' : n; }
    if (target === 'boolean') { const b = Utils.parseBool(v); return b === null ? '' : (b ? 'بله' : 'خیر'); }
    if (target === 'date') { const pv = Utils.parseDateValue(v); return pv.valid ? Utils.jString(pv) : ''; }
    return String(v).trim();
  }
  function typeFa(t) {
    return { number: 'عدد', date: 'تاریخ', boolean: 'منطقی', text: 'متن', identifier: 'شناسه' }[t] || t;
  }
  function gIso(serial) {
    const g = Utils.d2g(serial);
    return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  }
  function computeFillValue(work, ci, cfgCol) {
    const vals = work.rows.map(r => r[ci]).filter(v => String(v == null ? '' : v).trim() !== '');
    switch (cfgCol.method) {
      case 'mean': {
        const nums = vals.map(v => Utils.parseNum(v)).filter(n => n !== null);
        if (!nums.length) return '';
        const m = nums.reduce((a, b) => a + b, 0) / nums.length;
        return Math.round(m * 100) / 100;
      }
      case 'median': {
        const nums = vals.map(v => Utils.parseNum(v)).filter(n => n !== null).sort((a, b) => a - b);
        if (!nums.length) return '';
        const mid = Math.floor(nums.length / 2);
        const m = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
        return Math.round(m * 100) / 100;
      }
      case 'mode': {
        const freq = new Map();
        vals.forEach(v => { const k = String(v).trim(); freq.set(k, (freq.get(k) || 0) + 1); });
        let best = '', bn = 0;
        freq.forEach((n, k) => { if (n > bn) { bn = n; best = k; } });
        return best;
      }
      case 'custom': return cfgCol.value == null ? '' : cfgCol.value;
      default: return '';
    }
  }
  function flagPlan(work, p) {
    const statusCol = p.statusCol || 'وضعیت داده';
    let colIdx = work.columns.findIndex(c => c.name === statusCol);
    let colNew = false;
    if (colIdx < 0) { work.columns.push({ name: statusCol, type: 'text', emptyCount: 0 }); work.rows.forEach(r => r.push('')); colIdx = work.columns.length - 1; colNew = true; }
    const flagged = [];
    work.rows.forEach((row, ri) => {
      const reasons = [];
      if (p.markCross && Store.state.flow.profile && Store.state.flow.profile.checks.crossColumn) {
        // نقض قواعد منطقی را با مقایسه دوباره محاسبه می‌کنیم (نسبت به داده کاری)
      }
      if (p.markSparse) {
        const empty = row.filter(v => String(v == null ? '' : v).trim() === '').length;
        if (empty / row.length >= 0.6) reasons.push('ناقص');
      }
      if (p.markCross && Store.state.flow.profile) {
        const cc = Store.state.flow.profile.checks.crossColumn;
        if (cc && cc.samples && cc.samples.length) {
          // نمونه‌های پروفایل شماره ردیف دارند؛ با داده کاری ممکن است جابه‌جا شده باشند — فقط تطابق مستقیم
        }
      }
      if (reasons.length) {
        flagged.push({ r: ri, before: row[colIdx], after: 'مشکوک: ' + reasons.join('، ') });
      }
    });
    return { rows: flagged, colIdx, colNew };
  }

  /* ---------- تأیید نهایی ---------- */
  function confirmCleaned() {
    const f = F();
    startCleaning();
    const snap = (typeof UndoManager !== 'undefined') ? UndoManager.snapshotBefore('تأیید مجموعه داده پاک‌سازی‌شده', ['active', 'clean']) : null;
    f.active = Utils.deepClone({ columns: f.work.columns, rows: f.work.rows });
    f.active.label = 'داده پاک‌سازی‌شده';
    f.active.cleaned = true;
    f.active.rowCount = f.active.rows.length;
    f.clean.confirmed = true;
    if (snap) snap.commit();
    Store.emit('clean-confirmed');
    return f.active;
  }

  function useRaw() {
    const f = F();
    const snap = (typeof UndoManager !== 'undefined') ? UndoManager.snapshotBefore('ادامه با داده خام', ['active', 'clean']) : null;
    f.active = Utils.deepClone({ columns: f.raw.columns, rows: f.raw.rows });
    f.active.label = 'داده خام (بدون پاک‌سازی)';
    f.active.cleaned = false;
    f.active.rowCount = f.active.rows.length;
    f.clean.confirmed = true; // برای عبور از مرحله
    if (snap) snap.commit();
    Store.emit('clean-confirmed');
    return f.active;
  }

  return {
    startCleaning, listOps, previewOp, applyOp, undoLast, redoLast, canUndo, canRedo,
    fillCandidates, rangeCandidates, categoryMappings, typoMappings, identifierCandidates,
    confirmCleaned, useRaw,
    stepsList, recordStep, jumpToStep, deleteStep, activeStepIndex
  };
})();
