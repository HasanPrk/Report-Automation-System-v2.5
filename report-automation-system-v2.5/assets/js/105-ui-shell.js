/* ═══════════════════════════════════════════════════════════
   uiShell — پوسته برنامه: سربرگ، جست‌وجوی سراسری، Undo/Redo سراسری،
   پنجره وضعیت AI (خاموش/نمایشی/فعال + کلید API)، پشتیبان‌گیری
   (نوار قبلی/بعدی پایین صفحه طبق دستورالعمل v2.3 حذف شد —
   ناوبری مراحل فقط از نقشه سفر یکتای سمت راست انجام می‌شود)
   ═══════════════════════════════════════════════════════════ */
'use strict';

const uiShell = (function () {
  const { icon, esc } = Utils;

  /* ---------- نمایه جستجو ---------- */
  const SEARCH_INDEX = [
    { title: 'داشبورد', kw: 'داشبورد home شروع خانه', step: 'dashboard' },
    { title: 'مرحله ۱ — دریافت داده (Excel/CSV/Google Sheets)', kw: 'ورود داده فایل اکسل csv شیت بارگذاری import', step: 'import' },
    { title: 'مرحله ۲ — بررسی کیفیت داده', kw: 'کیفیت امتیاز بررسی پروفایل quality', step: 'quality' },
    { title: 'مرحله ۳ — پاک‌سازی، تاریخ‌ها، نوع داده، غلط املایی', kw: 'پاکسازی تمیز کردن تاریخ غلط املایی تکراری missing تاریخ‌ها عدد منفی', step: 'clean' },
    { title: 'مرحله ۴ — قالب گزارش و قالب سفارشی Word/Google Docs', kw: 'قالب word google docs docx آپلود template', step: 'template' },
    { title: 'مرحله ۵ — محاسبات (درون‌برنامه‌ای / فایل / ترکیبی)', kw: 'محاسبات جمع میانگین شاخص calc فایل', step: 'calc' },
    { title: 'مرحله ۶ — استودیو نمودار تعاملی (Drag & Drop)', kw: 'نمودار chart drag drop درگ انداخت ستونی خطی دایره‌ای', step: 'charts' },
    { title: 'مرحله ۷ — تولید گزارش، برچسب، زبان، لوگو، پالت رنگ', kw: 'گزارش هوش مصنوعی ai برچسب محرمانه زبان انگلیسی لوگو پالت رنگ پرامپت', step: 'ai' },
    { title: 'مرحله ۸ — پیش‌نمایش، اندازه و مارجین صفحه، شکست صفحه', kw: 'پیش‌نمایش صفحه a4 مارجین شکست break preview', step: 'preview' },
    { title: 'مرحله ۹ — خروجی (PDF/HTML/Word/Markdown) و خروجی‌های جانبی', kw: 'خروجی pdf ورد markdown csv excel google sheets فونت نام فایل', step: 'export' },
    { title: 'تاریخچه گزارش‌ها', kw: 'تاریخچه گزارش‌ها history', step: 'history' },
    { title: 'واگرد / اجرای مجدد (Undo / Redo)', kw: 'واگرد undo redo بازگردانی اجرای مجدد', action: 'undo' },
    { title: 'وضعیت هوش مصنوعی و کلید API', kw: 'هوش مصنوعی ai api key کلید خاموش روشن', action: 'ai' },
    { title: 'پشتیبان‌گیری از داده‌ها و گزارش‌ها', kw: 'پشتیبان backup بازیابی ذخیره', action: 'backup' },
    { title: 'حالت روز / شب', kw: 'شب روز تم dark light', action: 'theme' }
  ];

  function search(q) {
    q = Utils.normalizeFa(q || '').trim();
    if (!q) return [];
    const words = q.split(/\s+/);
    return SEARCH_INDEX.map(item => {
      const hay = Utils.normalizeFa(item.title + ' ' + item.kw);
      let score = 0;
      words.forEach(w => { if (hay.includes(w)) score += w.length > 2 ? 2 : 1; if (Utils.normalizeFa(item.title).includes(w)) score += 3; });
      return { item, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 7).map(x => x.item);
  }

  function runAction(item) {
    if (item.step) { WorkflowManager.goto(item.step); return; }
    if (item.action === 'undo') doGlobalUndo();
    else if (item.action === 'redo') doGlobalRedo();
    else if (item.action === 'ai') openAiConfig();
    else if (item.action === 'backup') openBackup();
    else if (item.action === 'theme') Store.toggleTheme();
  }

  /* ---------- Undo / Redo سراسری (تمام بخش‌های نرم‌افزار — تا ۳۰ مرحله) ---------- */
  function doGlobalUndo() {
    if (!UndoManager.canUndo()) { UIKit.toast('info', 'واگرد', 'عملیاتی برای واگرد وجود ندارد.'); return; }
    const r = UndoManager.undo();
    if (!r.ok) { UIKit.toast('error', 'واگرد ناموفق', r.error); return; }
    UI.U.dupFound = null;
    UI.showView(Store.state.ui.view);
    WorkflowManager.refresh();
    UIKit.toast('success', 'واگرد شد', `${r.label} به حالت قبل بازگشت.`);
  }
  function doGlobalRedo() {
    if (!UndoManager.canRedo()) { UIKit.toast('info', 'اجرای مجدد', 'عملیاتی برای اجرای مجدد وجود ندارد.'); return; }
    const r = UndoManager.redo();
    if (!r.ok) { UIKit.toast('error', 'اجرای مجدد ناموفق', r.error); return; }
    UI.U.dupFound = null;
    UI.showView(Store.state.ui.view);
    WorkflowManager.refresh();
    UIKit.toast('success', 'اجرای مجدد شد', `${r.label} دوباره اعمال شد.`);
  }
  function refreshUndoRedo() {
    const ub = document.getElementById('btn-undo-global');
    const rb = document.getElementById('btn-redo-global');
    const uc = document.getElementById('undo-count');
    if (ub) {
      ub.disabled = !UndoManager.canUndo();
      const lbl = UndoManager.topUndoLabel();
      ub.title = lbl ? `واگرد (Ctrl+Z) — ${lbl}` : 'واگرد آخرین عملیات (Ctrl+Z) — تا ۳۰ مرحله، در تمام بخش‌ها';
    }
    if (rb) {
      rb.disabled = !UndoManager.canRedo();
      const lbl = UndoManager.topRedoLabel();
      rb.title = lbl ? `اجرای مجدد (Ctrl+Y) — ${lbl}` : 'اجرای مجدد (Ctrl+Y)';
    }
    if (uc) uc.textContent = UndoManager.canUndo() ? Utils.faDig(Math.min(UndoManager.undoCount(), 30)) : '';
  }

  /* ---------- پنجره وضعیت AI (خاموش / روشن + کلید) ---------- */
  function openAiConfig() {
    const f = Store.state.flow;
    const cfg = f.ai.config;
    const mode = f.ai.mode || 'demo';
    const m = UIKit.modal({
      title: 'وضعیت هوش مصنوعی',
      body: `
        <div class="ai-mode-opts">
          <label class="ai-mode-opt ${mode === 'manual' ? 'selected' : ''}">
            <input type="radio" name="ai-mode" value="manual" ${mode === 'manual' ? 'checked' : ''}>
            <div><b>${icon('lock', 14)} خاموش</b><small>هوش مصنوعی غیرفعال می‌شود؛ متن گزارش را خودتان در هر بخش می‌نویسید.</small></div>
          </label>
          <label class="ai-mode-opt ${mode === 'demo' ? 'selected' : ''}">
            <input type="radio" name="ai-mode" value="demo" ${mode === 'demo' ? 'checked' : ''}>
            <div><b>${icon('sparkles', 14)} روشن — حالت نمایشی</b><small>متن‌ها به‌صورت قاعده‌مند از نتایج واقعی محاسبات ساخته می‌شوند؛ بدون کلید و بدون ارسال داده.</small></div>
          </label>
          <label class="ai-mode-opt ${mode === 'live' ? 'selected' : ''}">
            <input type="radio" name="ai-mode" value="live" ${mode === 'live' ? 'checked' : ''}>
            <div><b>${icon('zap', 14)} روشن — اتصال واقعی با کلید API</b><small>کلید API خود را وارد کنید تا متن گزارش با فراخوانی مدل زبانی واقعی تولید شود.</small></div>
          </label>
        </div>
        <div id="ai-live-box" style="display:${mode === 'live' ? 'block' : 'none'}" class="mt-2">
          <div id="ai-acct-status" style="margin-bottom:10px"></div>
          <div class="field"><label>آدرس سرویس (Endpoint — سازگار با OpenAI و Anthropic)</label>
            <input class="input" id="ai-endpoint" dir="ltr" value="${esc(cfg.endpoint || 'https://api.openai.com/v1/chat/completions')}" placeholder="https://api.openai.com/v1">
            <span class="field-help">آدرس پایه کافی است؛ پسوند «/chat/completions» در صورت نیاز خودکار اضافه می‌شود. نمونه‌ها: <span dir="ltr">https://api.openai.com/v1</span> — <span dir="ltr">https://openrouter.ai/api/v1</span> — <span dir="ltr">https://api.anthropic.com/v1/messages</span></span>
          </div>
          <div class="field"><label>نام مدل</label>
            <input class="input" id="ai-model" dir="ltr" value="${esc(cfg.model || 'gpt-4o-mini')}" placeholder="gpt-4o-mini">
          </div>
          <div class="field"><label>کلید API (نشست فعلی — اختیاری اگر کلید امن دارید)</label>
            <input class="input" id="ai-key" type="password" dir="ltr" value="" placeholder="sk-…" autocomplete="off">
            <span class="field-help">${cfg.apiKey ? 'کلید در این نشست ثبت شده است.' : 'کلید نشست فقط تا بستن مرورگر می‌ماند. برای نگهداری دائمی، وارد حساب شوید و «ذخیره امن» بزنید — کلید رمزنگاری‌شده سمت سرور نگهداری و به مرورگر برنمی‌گردد.'}</span>
          </div>
          <div class="flex" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
            <button type="button" class="btn btn-secondary btn-sm" id="ai-test-conn">${icon('zap', 13)}تست اتصال به سرویس</button>
            <span id="ai-test-result" class="small"></span>
          </div>
          <div class="banner banner-info" style="margin-bottom:0">${icon('info')}<div><b>بدون خطای CORS:</b> درخواست‌های مدل زبانی به‌صورت خودکار از «پراکسی امن سرور محلی» ارسال می‌شوند (هم با حساب کاربری و هم با کلید نشست)؛ کلید ذخیره‌شده هرگز به مرورگر برنمی‌گردد و کلید نشست فقط برای همان فراخوانی به سرور محلی شما داده می‌شود. ارسال مستقیم از مرورگر فقط زمانی رخ می‌دهد که سرور محلی در دسترس نباشد (اجرای بدون run.py).</div></div>
        </div>`,
      footer: `<button class="btn btn-primary" data-save>ذخیره وضعیت</button>
               <button class="btn btn-ghost" data-cancel>انصراف</button>`
    });
    /* وضعیت حساب کاربری در حالت live */
    const acctBox = m.overlay.querySelector('#ai-acct-status');
    function renderAcct() {
      const u = (typeof authClient !== 'undefined' && authClient.S) ? authClient.S.user : null;
      const serverOk = (typeof authClient !== 'undefined' && authClient.S) ? authClient.S.serverOk : null;
      if (!u) {
        acctBox.innerHTML = `<div class="banner banner-warning" style="margin:0">${icon('users')}<div>برای نگهداری دائمی کلید و ارسال امن از سرور، <b>وارد حساب شوید</b> (دکمه «ورود / ثبت‌نام» در سربرگ). بدون حساب هم می‌توانید کلید نشست را وارد کنید، اما پس از بستن مرورگر پاک می‌شود.</div></div>`;
      } else if (!u.apiKey || !u.apiKey.exists) {
        acctBox.innerHTML = `<div class="banner banner-info" style="margin:0">${icon('lock')}<div>وارد حساب <b dir="ltr">${esc(u.email)}</b> هستید اما کلید API ذخیره‌شده ندارید. کلید را در فرم پایین وارد کنید و در «تنظیمات حساب» گزینه ذخیره امن را بزنید.</div></div>`;
      } else {
        acctBox.innerHTML = `<div class="banner banner-success" style="margin:0">${icon('checkCircle')}<div>وارد حساب <b dir="ltr">${esc(u.email)}</b> هستید و کلید ذخیره‌شده (${esc(u.apiKey.hint)}) آماده استفاده از مسیر امن سرور است. نیازی به واردکردن دوباره کلید نیست.</div></div>`;
      }
      void serverOk;
    }
    renderAcct();
    if (typeof authClient !== 'undefined' && authClient.subscribe) authClient.subscribe(renderAcct);
    m.overlay.querySelectorAll('input[name="ai-mode"]').forEach(r => r.addEventListener('change', () => {
      m.overlay.querySelectorAll('.ai-mode-opt').forEach(o => o.classList.toggle('selected', o.querySelector('input').checked));
      m.overlay.querySelector('#ai-live-box').style.display = m.overlay.querySelector('input[name="ai-mode"]:checked').value === 'live' ? 'block' : 'none';
    }));
    /* نسخه ۲٫۵: تست زنده اتصال به سرویس (endpoint + model + key) از خود پنجره */
    const testBtn = m.overlay.querySelector('#ai-test-conn');
    const testOut = m.overlay.querySelector('#ai-test-result');
    if (testBtn) testBtn.addEventListener('click', async () => {
      const testCfg = {
        endpoint: m.overlay.querySelector('#ai-endpoint').value.trim(),
        model: m.overlay.querySelector('#ai-model').value.trim() || 'gpt-4o-mini',
        apiKey: m.overlay.querySelector('#ai-key').value.trim()
      };
      testBtn.disabled = true;
      testOut.textContent = 'در حال بررسی اتصال…';
      testOut.style.color = 'var(--text-faint)';
      try {
        const r = await aiService.testLive(testCfg);
        testOut.textContent = (r.ok ? '✓ ' : '✗ ') + r.message;
        testOut.style.color = r.ok ? 'var(--success)' : 'var(--danger)';
      } catch (err) {
        testOut.textContent = '✗ ' + (err.message || 'خطای نامشخص');
        testOut.style.color = 'var(--danger)';
      }
      testBtn.disabled = false;
    });
    m.overlay.querySelector('[data-save]').addEventListener('click', () => {
      const val = m.overlay.querySelector('input[name="ai-mode"]:checked').value;
      f.ai.mode = val;
      if (val === 'live') {
        const rawEndpoint = m.overlay.querySelector('#ai-endpoint').value.trim();
        const norm = aiService.normalizeEndpoint ? aiService.normalizeEndpoint(rawEndpoint) : rawEndpoint;
        if (!norm) {
          UIKit.toast('error', 'آدرس سرویس نامعتبر است', 'آدرس باید با http:// یا https:// شروع شود (مثال: https://api.openai.com/v1).');
          return;
        }
        cfg.endpoint = norm;
        cfg.model = m.overlay.querySelector('#ai-model').value.trim() || 'gpt-4o-mini';
        const keyInput = m.overlay.querySelector('#ai-key').value.trim();
        if (keyInput) cfg.apiKey = keyInput;
        const vaultUser = (typeof authClient !== 'undefined' && authClient.S && authClient.S.user && authClient.S.user.apiKey && authClient.S.user.apiKey.exists);
        if (!cfg.apiKey && !vaultUser) {
          UIKit.toast('warning', 'کلید API لازم است', 'برای اتصال واقعی، کلید API را وارد کنید (یا با کلید امن ذخیره‌شده در حساب وارد شوید — یا حالت نمایشی را انتخاب کنید).');
          return;
        }
      }
      m.close();
      updateChip();
      UI.showView(Store.state.ui.view);
      UIKit.toast('success', 'وضعیت AI ذخیره شد', aiService.info().providerName);
    });
    m.overlay.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  }

  function updateChip() {
    const chip = document.getElementById('ai-status-chip');
    const txt = document.getElementById('ai-status-text');
    if (!chip || !txt) return;
    const info = aiService.info();
    txt.textContent = info.mode === 'live' ? 'AI متصل' : info.mode === 'manual' ? 'AI خاموش' : 'حالت نمایشی AI';
    chip.classList.remove('demo', 'live');
    chip.classList.add(info.mode === 'live' ? 'live' : info.mode === 'manual' ? 'off' : 'demo');
    chip.title = info.note;
  }

  /* ---------- پشتیبان‌گیری ---------- */
  function openBackup() {
    const st = backupManager.statsSummary();
    const m = UIKit.modal({
      title: 'پشتیبان‌گیری از داده‌ها و گزارش‌ها',
      body: `
        ${UIKit.banner('info', 'محدوده پشتیبان', 'فایل پشتیبان شامل: داده خام، پروفایل کیفیت، داده پاک‌سازی‌شده، قالب‌های بارگذاری‌شده، محاسبات، نمودارهای استودیو، متن گزارش و بخش‌های آن، هویت بصری (لوگو/پالت)، تنظیمات صفحه و خروجی و تاریخچه گزارش‌ها است. <b>کلید API هرگز در پشتیبان ذخیره نمی‌شود.</b>')}
        <div class="grid-stats" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
          <div class="stat-card accent-primary"><span class="stat-label">داده خام</span><span class="stat-value">${st.hasData ? Utils.fmtInt(st.rows) + ' ردیف' : '—'}</span></div>
          <div class="stat-card accent-info"><span class="stat-label">قالب‌های سفارشی</span><span class="stat-value">${Utils.fmtInt(st.templates)}</span></div>
          <div class="stat-card accent-success"><span class="stat-label">نمودارها</span><span class="stat-value">${Utils.fmtInt(st.charts)}</span></div>
          <div class="stat-card accent-warning"><span class="stat-label">تاریخچه</span><span class="stat-value">${Utils.fmtInt(st.historyCount)}</span></div>
        </div>
        <div class="field"><label>بازیابی از فایل پشتیبان</label>
          <input type="file" class="input" id="backup-file" accept=".json">
          <span class="field-help">بازیابی، وضعیت فعلی گردش کار را جایگزین می‌کند. تاریخچه ادغام می‌شود.</span>
        </div>
        <div id="backup-status"></div>`,
      footer: `
        <button class="btn btn-primary" data-export>${icon('download')}دانلود نسخه پشتیبان</button>
        <button class="btn btn-secondary" data-import>${icon('upload')}بازیابی از فایل</button>
        <button class="btn btn-ghost" data-cancel>بستن</button>`
    });
    m.overlay.querySelector('[data-export]').addEventListener('click', () => {
      const name = backupManager.exportBackup();
      m.overlay.querySelector('#backup-status').innerHTML = UIKit.banner('success', 'پشتیبان دانلود شد', esc(name));
    });
    m.overlay.querySelector('[data-import]').addEventListener('click', () => {
      const fi = m.overlay.querySelector('#backup-file');
      const out = m.overlay.querySelector('#backup-status');
      if (!fi.files.length) { out.innerHTML = UIKit.banner('danger', '', 'فایل پشتیبان انتخاب نشده است.'); return; }
      const rd = new FileReader();
      rd.onload = () => {
        try {
          backupManager.importBackup(rd.result);
          m.close();
          UIKit.toast('success', 'بازیابی انجام شد', 'وضعیت گردش کار از پشتیبان بازگردانی شد.');
          UI.showView(Store.state.ui.view);
          WorkflowManager.refresh();
          updateChip();
        } catch (err) {
          out.innerHTML = UIKit.banner('danger', 'بازیابی ناموفق', esc(err.message));
        }
      };
      rd.readAsText(fi.files[0]);
    });
    m.overlay.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  }

  /* ---------- جستجوی سربرگ ---------- */
  function wireSearch() {
    const input = document.getElementById('global-search');
    const panel = document.getElementById('search-results');
    if (!input || !panel) return;
    const render = () => {
      const q = input.value;
      const items = search(q);
      if (!q.trim() || !items.length) {
        panel.innerHTML = q.trim() ? '<div class="sr-empty">نتیجه‌ای یافت نشد</div>' : '';
        panel.classList.remove('open');
        return;
      }
      panel.innerHTML = items.map((it, i) => `
        <button class="sr-item" data-i="${i}">${icon(it.step ? 'arrowLeft' : 'zap', 13)}<span>${esc(it.title)}</span></button>`).join('');
      panel.classList.add('open');
      panel._items = items;
    };
    input.addEventListener('input', Utils.debounce(render, 120));
    input.addEventListener('focus', () => { if (input.value.trim()) render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const items = panel._items || search(input.value);
        if (items.length) { runAction(items[0]); panel.classList.remove('open'); input.blur(); }
      } else if (e.key === 'Escape') { panel.classList.remove('open'); input.blur(); }
    });
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('.sr-item');
      if (!b || !panel._items) return;
      runAction(panel._items[+b.dataset.i]);
      panel.classList.remove('open');
      input.value = '';
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#global-search') && !e.target.closest('#search-results')) panel.classList.remove('open');
    });
  }

  function init() {
    // Undo/Redo سربرگ (سراسری — تمام بخش‌ها + شورتکات Ctrl+Z / Ctrl+Y)
    UndoManager.init();
    UndoManager.subscribe(refreshUndoRedo);
    const ub = document.getElementById('btn-undo-global');
    const rb = document.getElementById('btn-redo-global');
    if (ub) ub.addEventListener('click', doGlobalUndo);
    if (rb) rb.addEventListener('click', doGlobalRedo);

    // نشان AI → پنجره پیکربندی
    const chip = document.getElementById('ai-status-chip');
    if (chip) chip.addEventListener('click', openAiConfig);
    updateChip();

    // دکمه پشتیبان‌گیری سربرگ + ریل
    const bb = document.getElementById('btn-backup');
    if (bb) bb.addEventListener('click', openBackup);

    // دکمه تاریخچه سربرگ
    const hb = document.getElementById('btn-history-global');
    if (hb) hb.addEventListener('click', () => WorkflowManager.goto('history'));

    wireSearch();

    // به‌روزرسانی دکمه‌های undo/redo پس از هر تغییر
    Store.subscribe(() => { refreshUndoRedo(); });
    refreshUndoRedo();
  }

  return { init, openAiConfig, openBackup, updateChip, doGlobalUndo, doGlobalRedo, refreshUndoRedo };
})();
