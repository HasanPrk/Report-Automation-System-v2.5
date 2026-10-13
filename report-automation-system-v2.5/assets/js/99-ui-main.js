/* ═══════════════════════════════════════════════════════════
   UI — هسته رابط کاربری: راه‌اندازی، ناوبری، داشبورد
   ═══════════════════════════════════════════════════════════ */
'use strict';

const UI = (function () {
  const { icon, esc } = Utils;
  const U = {
    importTab: 'file',
    pending: null,            // مجموعه داده در انتظار تأیید
    pendingWorkbook: null,
    pendingSheets: null,
    pendingFileName: '',
    cleanOpenOp: null,
    dupConfig: { mode: 'exact', keyCols: [], norm: { trim: true, persian: true, caseInsensitive: true } },
    dupFound: null,
    dupKeep: 'mostComplete',
    dupManual: {},
    templateTab: 'builtin',
    reportMetaInputs: {},
    qualityRan: false
  };

  const _views = {};
  function registerView(id, fn) { _views[id] = fn; }

  function showView(id) {
    document.querySelectorAll('#main .view').forEach(v => { v.hidden = true; });
    /* ریبون ثانویه فقط برای نمای پیش‌نمایش نمایش داده می‌شود؛
       نمای پیش‌نمایش خودش محتوای آن را پر و نمایش می‌دهد */
    const sr = document.getElementById('sub-ribbon');
    if (sr) sr.hidden = true;
    const el = document.getElementById('view-' + id);
    if (!el) return;
    el.hidden = false;
    if (_views[id]) {
      try { _views[id](el); }
      catch (err) {
        console.error('view render error', id, err);
        el.innerHTML = `<div class="banner banner-danger">${icon('alert')}<div>خطا در نمایش این بخش: ${esc(err.message)}</div></div>`;
      }
    }
  }

  /* ---------- راه‌اندازی ---------- */
  function init() {
    Store.applyTheme();
    // رویدادهای سربرگ
    document.getElementById('theme-toggle').addEventListener('click', () => Store.toggleTheme());
    document.getElementById('brand-home').addEventListener('click', () => WorkflowManager.goto('dashboard'));
    // نوار گردش کار و ریل سمت راست: کلیک با delegation
    // (نوار افقی تکراری حذف شد — نقشه سفر یکتا: ریل سمت راست / نوار موبایل)
    const rail = document.getElementById('journey-rail');
    if (rail) rail.addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (b && b.dataset.step) WorkflowManager.goto(b.dataset.step);
    });
    // نشان وضعیت AI توسط uiShell مدیریت می‌شود (پنجره پیکربندی)
    Store.subscribe(() => WorkflowManager.renderStepper());
    WorkflowManager.renderStepper();
    showView(Store.state.ui.view || 'dashboard');
  }

  /* ---------- سرصفحه استاندارد بخش‌ها ---------- */
  function viewHead(title, icon_, hint) {
    return `<div class="panel-title"><h2>${icon(icon_)}${esc(title)}</h2>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  }

  return { U, registerView, showView, init, viewHead };
})();

/* ═══════════════════════════════════════════════════════════
   نمای داشبورد
   ═══════════════════════════════════════════════════════════ */
(function () {
  const { icon, esc } = Utils;

  UI.registerView('dashboard', function (el) {
    const f = Store.state.flow;
    const hist = Store.state.history;
    const reportsCount = hist.length;
    const processedRows = hist.reduce((s, h) => s + (h.rowsAfter || 0), 0) || (f.raw ? f.raw.rows.length : 0);
    const lastErrors = f.profile ? Object.values(f.profile.checks).filter(c => c.severity === 'high' && c.issueCount > 0).length : 0;
    const lastEntry = hist[0];
    const prog = WorkflowManager.progressPct();

    el.innerHTML = `
      <div class="panel">
        ${UI.viewHead('داشبورد اصلی', 'home', 'نمای کلی فرایند گزارش‌نویسی')}
        <div class="grid-stats">
          <div class="stat-card accent-primary">
            <span class="stat-label">وضعیت آخرین فرایند</span>
            <span class="stat-value">${lastEntry ? esc(lastEntry.status || 'تکمیل‌شده') : (f.raw ? 'در حال پیشرفت' : 'بدون فرایند فعال')}</span>
            <span class="stat-note">${lastEntry ? esc(lastEntry.title || '') : prog > 0 ? `پیشرفت فعلی: ${Utils.fmtPct(prog, 0)}` : 'برای شروع، داده وارد کنید'}</span>
          </div>
          <div class="stat-card accent-success">
            <span class="stat-label">گزارش‌های تولیدشده</span>
            <span class="stat-value">${Utils.fmtInt(reportsCount)}</span>
            <span class="stat-note">از ابتدای استفاده (ذخیره محلی مرورگر)</span>
          </div>
          <div class="stat-card accent-info">
            <span class="stat-label">ردیف‌های پردازش‌شده</span>
            <span class="stat-value">${Utils.fmtInt(processedRows)}</span>
            <span class="stat-note">مجموع ردیف‌های پاک‌سازی‌شده و تحلیل‌شده</span>
          </div>
          <div class="stat-card ${lastErrors ? 'accent-danger' : 'accent-warning'}">
            <span class="stat-label">خطاهای شناسایی‌شده</span>
            <span class="stat-value">${Utils.fmtInt(lastErrors)}</span>
            <span class="stat-note">${f.profile ? 'بررسی‌های بحرانی در آخرین تحلیل کیفیت' : 'هنوز بررسی کیفیت اجرا نشده'}</span>
          </div>
        </div>
        <div class="flex" style="gap:12px;flex-wrap:wrap">
          <button class="btn btn-primary btn-lg" id="btn-new-report">${icon('zap')}شروع گزارش جدید</button>
          <button class="btn btn-secondary" id="btn-go-history">${icon('clock')}تاریخچه عملیات</button>
        </div>
      </div>

      <div class="panel">
        ${UI.viewHead('نقشه سفر تولید گزارش', 'layers')}
        <div class="steps-note">
          ${WorkflowManager.STEPS.filter(s => !['dashboard', 'history'].includes(s.id)).map(s => `<div><b>${esc(s.label)}</b> — ${stepHint(s.id)}</div>`).join('')}
        </div>
        <div class="mt-2">
          <div class="progress-bar-row"><div class="progress"><div style="width:${prog}%"></div></div><span class="progress-label">${Utils.fmtPct(prog, 0)}</span></div>
        </div>
      </div>

      <div class="panel">
        ${UI.viewHead('راهنمای سریع و آزمایش', 'info')}
        <div class="grid-2">
          <div>
            <p class="text-soft" style="font-size:13.2px">برای آزمایش سریع کامل سامانه، فایل داده نمونه (شامل مشکلات عمدی کیفیت داده) را از پوشه <span class="code-inline">samples</span> بارگذاری کنید:</p>
            <ul class="info-list mt-1">
              <li><span class="code-inline">sample-sales-data.csv</span> — داده فروش فارسی با ۱۵۳ ردیف</li>
              <li><span class="code-inline">sample-sales-data.xlsx</span> — همان داده در قالب Excel دو برگی</li>
            </ul>
          </div>
          <div class="method-box">
            <b>حریم خصوصی:</b> تمام پردازش‌ها فقط در مرورگر شما انجام می‌شود. داده‌های شما به هیچ سروری ارسال نمی‌شوند و پس از بستن مرورگر پاک می‌شوند (به‌جز خلاصه تاریخچه در حافظه محلی مرورگر).
          </div>
        </div>
      </div>`;

    el.querySelector('#btn-new-report').addEventListener('click', () => {
      const f2 = Store.state.flow;
      const hasWork = f2.raw || f2.profile || f2.calc.ranAt;
      const start = () => { Store.resetFlow(true); WorkflowManager.refresh(); WorkflowManager.goto('import'); UIKit.toast('info', 'فرایند جدید', 'فرایند گزارش‌نویسی جدید آغاز شد؛ مرحله ۱: دریافت داده.'); };
      if (hasWork) {
        UIKit.confirmBox({
          title: 'شروع فرایند جدید',
          message: 'فرایند فعلی پاک می‌شود و داده‌های واردشده از حافظه حذف خواهند شد. قالب‌های بارگذاری‌شده و تاریخچه حفظ می‌شوند. ادامه می‌دهید؟',
          danger: true, confirmText: 'بله، فرایند جدید',
          onConfirm: start
        });
      } else start();
    });
    el.querySelector('#btn-go-history').addEventListener('click', () => WorkflowManager.goto('history'));
  });

  function stepHint(id) {
    const hints = {
      import: 'بارگذاری Excel، CSV یا لینک Google Sheets و مشاهده پیش‌نمایش',
      quality: 'اجرای ۱۰ بررسی کیفیت با نقشه سفر ۶ مرحله‌ای و امتیاز شفاف',
      clean: 'پاک‌سازی مشکلات (تاریخ‌ها، نوع داده، غلط املایی)، مدیریت تکراری‌ها و تأیید مجموعه داده',
      template: 'انتخاب قالب داخلی یا بارگذاری قالب سفارشی Word/Google Docs با نگاشت فیلدها',
      calc: 'اجرای محاسبات درون‌برنامه‌ای، از فایل داده یا ترکیبی',
      charts: 'ساخت نمودارهای تعاملی به‌صورت drag & drop (شبیه Power BI) و درج در گزارش',
      ai: 'تولید متن تحلیلی با هوش مصنوعی، برچسب گزارش، زبان، لوگو، پالت رنگ و پرامپت سفارشی',
      preview: 'مشاهده زنده گزارش با تنظیم اندازه/مارجین صفحه و شکست صفحه با درگ',
      export: 'دریافت خروجی PDF/HTML/Word/Markdown با نام فایل و فونت دلخواه + خروجی‌های جانبی داده'
    };
    return hints[id] || '';
  }
})();
