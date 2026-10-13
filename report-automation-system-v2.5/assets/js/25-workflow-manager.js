/* ═══════════════════════════════════════════════════════════
   WorkflowManager — مدیریت مراحل گردش کار و نقشه سفر کنار صفحه
   • داشبورد و تاریخچه از نقشه سفر حذف شدند؛
     دکمه بزرگ «انتقال به داشبورد» دقیقا بالای مرحله دریافت داده قرار می‌گیرد
     (بدون هیچ شماره/نشان عددی کنار آن) و تاریخچه فقط از سربرگ در دسترس است
   • طبق دستورالعمل v2.3: دکمه تکراری «پشتیبان‌گیری» از پایین نقشه سفر حذف شد
     (نسخه اصلی در ریبون سربرگ موجود است) و دکمه‌های قبلی/بعدی پایین صفحه حذف شدند
   ═══════════════════════════════════════════════════════════ */
'use strict';

const WorkflowManager = (function () {
  const F = () => Store.state.flow;

  /* مراحل اصلی ۱ تا ۹ — داشبورد و تاریخچه دیگر جزو نقشه سفر نیستند */
  const STEPS = [
    { id: 'import', num: '1', label: 'دریافت داده', icon: 'upload' },
    { id: 'quality', num: '2', label: 'بررسی کیفیت', icon: 'shield' },
    { id: 'clean', num: '3', label: 'پاک‌سازی و تکرار', icon: 'broom' },
    { id: 'template', num: '4', label: 'قالب گزارش', icon: 'fileText' },
    { id: 'calc', num: '5', label: 'محاسبات', icon: 'calc' },
    { id: 'charts', num: '6', label: 'نمودار تعاملی', icon: 'grid' },
    { id: 'ai', num: '7', label: 'تولید گزارش', icon: 'sparkles' },
    { id: 'preview', num: '8', label: 'پیش‌نمایش', icon: 'eye' },
    { id: 'export', num: '9', label: 'خروجی گزارش', icon: 'download' }
  ];

  /* برچسب نماهای کمکی (خارج از نقشه سفر) */
  const AUX_LABELS = { dashboard: 'داشبورد', history: 'تاریخچه' };

  /* ترتیب مراحل برای محاسبات داخلی و پیشرفت (داشبورد نقطه شروع است) */
  const MAIN_ORDER = ['dashboard', 'import', 'quality', 'clean', 'template', 'calc', 'charts', 'ai', 'preview', 'export'];

  /* آیا ورود به هر مرحله مجاز است؟ — خروجی: {ok, reason} */
  function canEnter(stepId) {
    const f = F();
    switch (stepId) {
      case 'dashboard':
      case 'history':
      case 'import':
        return { ok: true };
      case 'quality':
        if (!f.raw) return { ok: false, reason: 'ابتدا یک منبع داده وارد کنید.' };
        return { ok: true };
      case 'clean':
        if (!f.raw) return { ok: false, reason: 'ابتدا داده وارد کنید.' };
        if (!f.profile) return { ok: false, reason: 'برای پاک‌سازی، ابتدا بررسی کیفیت را اجرا کنید تا مشکلات شناسایی شوند.' };
        return { ok: true };
      case 'template':
        if (!f.active) return { ok: false, reason: 'ابتدا مجموعه داده را در مرحله پاک‌سازی تأیید کنید.' };
        return { ok: true };
      case 'calc':
        if (!f.active) return { ok: false, reason: 'ابتدا مجموعه داده فعال را آماده کنید.' };
        if (!f.templates.selectedId) return { ok: false, reason: 'برای اجرای محاسبات، ابتدا قالب گزارش را انتخاب کنید.' };
        return { ok: true };
      case 'charts':
        if (!f.active) return { ok: false, reason: 'برای ساخت نمودار تعاملی، ابتدا مجموعه داده فعال را آماده کنید.' };
        return { ok: true };
      case 'ai':
        if (!f.calc.ranAt) return { ok: false, reason: 'ابتدا محاسبات را اجرا کنید تا ورودی گزارش آماده شود.' };
        return { ok: true };
      case 'preview':
        if (!f.ai.generated) return { ok: false, reason: 'ابتدا متن گزارش را تولید کنید یا به‌صورت دستی بنویسید.' };
        return { ok: true };
      case 'export':
        if (!f.report.renderedAt) return { ok: false, reason: 'ابتدا پیش‌نمایش گزارش را مشاهده کنید.' };
        return { ok: true };
      default:
        return { ok: true };
    }
  }

  /* وضعیت هر مرحله: locked | available | active | done — وضعیت از «معیار واقعی تکمیل» استخراج می‌شود */
  function statusOf(stepId) {
    const f = F();
    const view = Store.state.ui.view;
    switch (stepId) {
      case 'dashboard': case 'history': return null;
      case 'import': return f.raw ? 'done' : null;   /* تکمیل مرحله ۱ بر اساس داده واقعی */
      case 'quality': return f.profile ? 'done' : null;
      case 'clean': return f.clean.confirmed ? 'done' : null;
      case 'template': return f.templates.selectedId ? 'done' : null;
      case 'calc': return f.calc.ranAt ? 'done' : null;
      case 'charts': return (f.charts && f.charts.items && f.charts.items.length) ? 'done' : null;
      case 'ai': return f.ai.generated ? 'done' : null;
      case 'preview': return f.report.renderedAt ? 'done' : null;
      case 'export': return f.report.exportedAt ? 'done' : null;
    }
    return null;
  }

  /* ---------- رندر نوار افقی ابزارک (حذف شد — نقشه سفر یکتا فقط سمت راست/بالا) ----------
     این تابع برای سازگاری با فراخوانی‌های قدیمی، ریل را رندر می‌کند. */
  function renderStepper() { renderRail(); }

  /* ---------- نقشه سفر عمودی (ستون کنار صفحه) ----------
     داشبورد: دکمه بزرگ بالای مرحله ۱ (بدون شماره)
     تاریخچه: حذف شد (از سربرگ و داشبورد در دسترس است) */
  function renderRail() {
    const rail = document.getElementById('journey-rail');
    if (!rail) return;
    const view = Store.state.ui.view;
    let h = `<button class="jr-home-btn ${view === 'dashboard' ? 'is-active' : ''}" data-step="dashboard" title="انتقال به داشبورد">
              ${Utils.icon('home', 18)}<span>انتقال به داشبورد</span>
            </button>`;
    h += '<ol class="jr-steps">';
    STEPS.forEach((s) => {
      const st = statusOf(s.id);
      const guard = canEnter(s.id);
      const cls = ['jr-step'];
      if (view === s.id) cls.push('is-active');
      else if (st === 'done') cls.push('is-done');
      else if (!guard.ok) cls.push('is-locked');
      const numHtml = st === 'done' && view !== s.id ? Utils.icon('check', 12) : Utils.esc(s.num);
      const title = (!guard.ok) ? ` — ${guard.reason}` : '';
      h += `<li class="${cls.join(' ')}" data-step="${s.id}" title="${Utils.esc(s.label + title)}">
              <span class="jr-line" aria-hidden="true"></span>
              <span class="jr-num">${numHtml}</span>
              <span class="jr-label">${Utils.icon(s.icon, 13)} ${Utils.esc(s.label)}</span>
            </li>`;
    });
    h += '</ol>';
    const prog = progressPct();
    h += `<div class="jr-progress"><div class="progress"><div style="width:${prog}%"></div></div>
            <span class="jr-progress-label">${Utils.fmtPct(prog, 0)}</span></div>`;
    rail.innerHTML = h;
  }

  function goto(stepId) {
    const guard = canEnter(stepId);
    if (!guard.ok) {
      UIKit.toast('warning', 'مرحله در دسترس نیست', guard.reason);
      return false;
    }
    Store.state.ui.view = stepId;
    UI.showView(stepId);
    renderStepper();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }

  function refresh() { renderStepper(); }

  /* ---------- ناوبری برنامه‌ای (برای شورتکات‌ها و فراخوانی داخلی) ---------- */
  function indexOfCurrent() {
    return MAIN_ORDER.indexOf(Store.state.ui.view);
  }
  function prevStep() {
    const i = indexOfCurrent();
    if (i <= 0) return null;
    return MAIN_ORDER[i - 1];
  }
  function nextStep() {
    const i = indexOfCurrent();
    if (i < 0 || i >= MAIN_ORDER.length - 1) return null;
    return MAIN_ORDER[i + 1];
  }
  function goPrev() { const s = prevStep(); if (s) goto(s); }
  function goNext() {
    const s = nextStep();
    if (!s) return;
    const guard = canEnter(s);
    if (!guard.ok) { UIKit.toast('warning', 'مرحله بعد در دسترس نیست', guard.reason); return; }
    goto(s);
  }
  function stepLabel(id) {
    const s = STEPS.find(x => x.id === id);
    if (s) return s.label;
    return AUX_LABELS[id] || id;
  }

  /* پیشرفت کلی گردش کار (۰ تا ۱۰۰) — مرحله نمودارها اختیاری است */
  function progressPct() {
    const f = F();
    const done = [
      !!f.raw, !!f.profile, !!f.clean.confirmed, !!f.templates.selectedId,
      !!f.calc.ranAt, !!f.ai.generated, !!f.report.renderedAt, !!f.report.exportedAt
    ].filter(Boolean).length;
    return Math.round((done / 8) * 100);
  }

  return { STEPS, MAIN_ORDER, canEnter, statusOf, renderStepper, renderRail, goto, refresh, progressPct, prevStep, nextStep, goPrev, goNext, stepLabel };
})();
