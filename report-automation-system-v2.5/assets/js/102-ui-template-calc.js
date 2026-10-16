/* ═══════════════════════════════════════════════════════════
   نماهای مرحله ۴ (قالب گزارش) و مرحله ۵ (محاسبات)
   ═══════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { icon, esc } = Utils;

  /* نسخه ۲٫۵: اتصال کادر آپلود زیبا (کلیک/درگ‌اند‌دراپ/نمایش فایل/حذف انتخاب)
     id: شناسه input فایل؛ فایل انتخاب‌شده در UI.U نگه داشته می‌شود تا با
     رندر مجدد نما از دست نرود و منطق پردازش (#tpl-html.files) بدون تغییر کار کند. */
  function wireUploadBox(scope, id) {
    const box = scope.querySelector('#' + id + '-box');
    const input = scope.querySelector('#' + id);
    if (!box || !input) return;
    const key = id === 'tpl-html' ? 'tplHtmlFile' : 'tplJsonFile';
    if (UI.U[key]) {
      try {
        const dt = new DataTransfer();
        dt.items.add(UI.U[key]);
        input.files = dt.files;
      } catch (e) { /* مرورگر قدیمی — بدون بازیابی */ }
    }
    box.addEventListener('click', (e) => {
      if (e.target.closest('.ub-clear')) return;
      if (e.target === input) return;   /* کلیک مستقیم روی input شفاف — خودش پنجره انتخاب را باز می‌کند */
      input.click();
    });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('dragover'); });
    box.addEventListener('dragleave', () => box.classList.remove('dragover'));
    box.addEventListener('drop', (e) => {
      e.preventDefault(); box.classList.remove('dragover');
      if (e.dataTransfer.files.length) { UI.U[key] = e.dataTransfer.files[0]; UI.showView('template'); }
    });
    input.addEventListener('change', () => {
      if (input.files.length) { UI.U[key] = input.files[0]; UI.showView('template'); }
    });
    const clearBtn = box.querySelector('.ub-clear');
    if (clearBtn) clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      UI.U[key] = null;
      UI.showView('template');
    });
  }

  /* ═════════ مرحله ۴: قالب گزارش ═════════ */
  UI.registerView('template', function (el) {
    const f = Store.state.flow;
    if (!f.active) { el.innerHTML = UIKit.emptyState('alert', 'مجموعه داده فعالی وجود ندارد', 'ابتدا مرحله پاک‌سازی را تکمیل کنید.'); return; }

    el.innerHTML = `
      <div class="panel">
        ${UI.viewHead('مرحله ۴ — مدیریت و انتخاب قالب گزارش', 'layers', `مجموعه فعال: ${Utils.fmtInt(f.active.rows.length)} ردیف`)}
        <div class="field tpl-lang-field">
          <label>${icon('type', 13)} زبان قالب گزارش</label>
          <div class="seg-lang" id="tpl-lang-switch" role="group" aria-label="زبان قالب گزارش">
            <button type="button" data-lang="fa" class="${(f.report.lang || 'fa') === 'fa' ? 'active' : ''}"><b>فا</b> فارسی</button>
            <button type="button" data-lang="en" class="${f.report.lang === 'en' ? 'active' : ''}"><b>EN</b> English</button>
          </div>
          <span class="field-help">این انتخاب، تنظیم واقعی قالب را تغییر می‌دهد: جهت صفحه (RTL/LTR)، فونت، تراز عنوان‌ها و جدول‌ها، قالب‌بندی اعداد و تاریخ و زبان متن تولیدی هوش مصنوعی. زبان در پیش‌نمایش و خروجی نهایی یکسان اعمال و در پشتیبان حفظ می‌شود.</span>
        </div>
        <div class="tabs" id="tpl-tabs">
          <button class="tab ${UI.U.templateTab === 'builtin' ? 'active' : ''}" data-t="builtin">${icon('grid')}قالب‌های آماده</button>
          <button class="tab ${UI.U.templateTab === 'custom' ? 'active' : ''}" data-t="custom">${icon('upload')}بارگذاری قالب سفارشی</button>
        </div>
        <div id="tpl-body"></div>
      </div>
      <div id="tpl-selected"></div>`;

    el.querySelector('#tpl-lang-switch').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang]');
      if (!b || f.report.lang === b.dataset.lang) return;
      UndoManager.runWithSnapshot('تغییر زبان قالب گزارش', ['report'], () => { f.report.lang = b.dataset.lang; });
      Store.savePrefs();
      UI.showView('template');
      UIKit.toast('success', 'زبان قالب تغییر کرد', b.dataset.lang === 'fa'
        ? 'قالب فارسی: جهت راست‌به‌چپ، فونت وزیرمتن و قالب‌بندی شمسی اعمال شد — در متن گزارش، پیش‌نمایش و خروجی نهایی.'
        : 'English template applied: LTR layout, Latin fonts and Western numerals across report text, preview and final export.');
    });

    el.querySelector('#tpl-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      UI.U.templateTab = b.dataset.t;
      UI.showView('template');
    });

    renderTab(el.querySelector('#tpl-body'));
    renderSelected(el.querySelector('#tpl-selected'));

    function renderTab(body) {
      const list = templateManager.list();
      if (UI.U.templateTab === 'builtin') {
        body.innerHTML = `<div class="grid-2">
          ${list.map(t => `
            <div class="panel" style="margin:0;${f.templates.selectedId === t.id ? 'border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-ring)' : ''}">
              <div class="flex-between mb-1">
                <h3 style="font-size:15px;font-weight:800">${esc(t.name)}</h3>
                ${t.kind === 'builtin' ? UIKit.badge('info', 'داخلی') : UIKit.badge('primary', 'سفارشی')}
              </div>
              <p class="text-soft small">${esc(t.description)}</p>
              <div class="flex mt-2" style="gap:8px;flex-wrap:wrap">
                <button class="btn btn-sm btn-primary" data-select="${t.id}">${f.templates.selectedId === t.id ? icon('checkCircle') + 'انتخاب‌شده' : icon('check') + 'انتخاب این قالب'}</button>
                <button class="btn btn-sm btn-secondary" data-preview="${t.id}">${icon('eye')}مشاهده ساختار</button>
                <button class="btn btn-sm btn-ghost" data-export="${t.id}">${icon('download')}خروجی تعریف</button>
                ${t.kind === 'custom' ? `<button class="btn btn-sm btn-ghost" data-del="${t.id}" style="color:var(--danger)">${icon('trash')}حذف</button>` : ''}
              </div>
            </div>`).join('')}
        </div>`;
        body.querySelectorAll('[data-select]').forEach(b => b.addEventListener('click', () => {
          const r = templateManager.select(b.dataset.select);
          if (!r.ok) { UIKit.toast('error', 'انتخاب ناموفق', r.error); return; }
          UIKit.toast('success', 'قالب انتخاب شد', r.compat.ok ? 'سازگار با داده فعلی است.' : 'با هشدار سازگاری — جدول زیر را ببینید.');
          UI.showView('template');
        }));
        body.querySelectorAll('[data-preview]').forEach(b => b.addEventListener('click', () => {
          const t = templateManager.get(b.dataset.preview);
          const spec = templateManager.effectiveSpec(t, f.active);
          UIKit.modal({
            title: 'ساختار قالب: ' + t.name, size: 'lg',
            body: `<b class="small">بخش‌های گزارش:</b><ol class="info-list">${t.structure.map(s => `<li><b>${esc(s.title)}</b> — نوع: ${secTypeFa(s.type)}${s.calcId ? ` • محاسبه: ${esc(s.calcId)}` : ''}</li>`).join('')}</ol>
              <hr class="divider"><b class="small">محاسبات این قالب روی داده شما (${Utils.fmtInt(spec.defs.length)} محاسبه):</b>
              <div class="table-wrap mt-1"><table class="data-table"><thead><tr><th>شاخص</th><th>عملیات</th><th>ستون</th><th>گروه‌بندی</th></tr></thead><tbody>
              ${spec.defs.map(d => `<tr><td>${esc(d.label)}</td><td>${esc(calculationEngine.OPS_META[d.op] ? calculationEngine.OPS_META[d.op].label : d.op)}${d.auto ? ' <span class="badge badge-neutral">ذخیره</span>' : ''}</td><td>${esc(d.column || '—')}</td><td>${esc(d.groupBy || d.dateColumn || '—')}</td></tr>`).join('')}
              </tbody></table></div>`,
            footer: `<button class="btn btn-secondary" onclick="document.querySelector('#modal-root .modal-overlay').remove()">بستن</button>`
          });
        }));
        body.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => { templateManager.exportTemplate(b.dataset.export); UIKit.toast('success', 'خروجی گرفته شد', 'فایل تعریف محاسبات دانلود شد.'); }));
        body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
          UIKit.confirmBox({ title: 'حذف قالب', message: 'این قالب سفارشی حذف شود؟', danger: true, confirmText: 'حذف', onConfirm: () => { templateManager.removeUploaded(b.dataset.del); UI.showView('template'); } });
        }));
      } else {
        /* نسخه ۲٫۵: کادرهای آپلود زیبا و کاربرپسند (هم‌سبک لوگوی مرحله ۷)
           — کلیک یا کشیدن فایل، نمایش نام فایل انتخاب‌شده و دکمه حذف انتخاب */
        const fHtmlSel = UI.U.tplHtmlFile ? UI.U.tplHtmlFile.name : '';
        const fJsonSel = UI.U.tplJsonFile ? UI.U.tplJsonFile.name : '';
        body.innerHTML = `
          ${UIKit.banner('info', 'قرارداد قالب سفارشی', 'قالب را می‌توانید به‌صورت فایل HTML یا سند Word یا Google Docs آماده کنید و در آن از جای‌نگهدارها استفاده کنید. انواع پشتیبانی‌شده: <span class="code-inline">{{report_title}}</span> و سایر اطلاعات متنی، <span class="code-inline">{{section:executive_summary}}</span> متن تحلیلی، <span class="code-inline">{{kpi:کلید محاسبه}}</span> کارت شاخص، <span class="code-inline">{{table:کلید}}</span> جدول و <span class="code-inline">{{chart:کلید}}</span> نمودار.<br><b>Word (.docx):</b> جای‌نگهدارها را مستقیم در متن سند بنویسید؛ سرصفحه‌های Word (Heading 1-3) به تیتر بخش تبدیل می‌شوند.<br><b>Google Docs:</b> از منوی File → Download نسخه <b>.docx</b> یا <b>.html</b> را دریافت و همین‌جا بارگذاری کنید. فایل JSON مشخصات محاسبات اختیاری است — نمونه: <span class="code-inline">samples/custom-template-example.html</span>')}
          <div class="form-row">
            <div class="field">
              <label>فایل قالب (HTML / Word docx / Google Docs) *</label>
              <div class="upload-box ${fHtmlSel ? 'has-file' : ''}" id="tpl-html-box" tabindex="0" role="button" aria-label="انتخاب فایل قالب">
                <span class="ub-icon">${icon('file', 18)}</span>
                <span class="ub-text">
                  ${fHtmlSel ? `<b class="ub-filename" dir="ltr">${esc(fHtmlSel)}</b><small>برای تغییر، فایل دیگر را انتخاب یا رها کنید</small>`
                             : `<b>انتخاب فایل قالب</b><small>فایل را اینجا رها کنید یا کلیک کنید — .html / .docx / .txt / .md</small>`}
                </span>
                ${fHtmlSel ? `<button type="button" class="ub-clear" id="tpl-html-clear" title="حذف انتخاب">${icon('x', 12)}</button>` : ''}
                <input type="file" id="tpl-html" accept=".html,.htm,.docx,.txt,.md">
              </div>
            </div>
            <div class="field">
              <label>فایل مشخصات JSON (اختیاری)</label>
              <div class="upload-box ${fJsonSel ? 'has-file' : ''}" id="tpl-json-box" tabindex="0" role="button" aria-label="انتخاب فایل مشخصات JSON">
                <span class="ub-icon">${icon('grid', 18)}</span>
                <span class="ub-text">
                  ${fJsonSel ? `<b class="ub-filename" dir="ltr">${esc(fJsonSel)}</b><small>مشخصات محاسبات قالب سفارشی</small>`
                             : `<b>انتخاب فایل JSON</b><small>اختیاری — فایل را اینجا رها کنید یا کلیک کنید</small>`}
                </span>
                ${fJsonSel ? `<button type="button" class="ub-clear" id="tpl-json-clear" title="حذف انتخاب">${icon('x', 12)}</button>` : ''}
                <input type="file" id="tpl-json" accept=".json">
              </div>
            </div>
          </div>
          <button class="btn btn-primary btn-lg" id="tpl-upload">${icon('upload')}بارگذاری و پردازش قالب</button>
          <div id="tpl-upload-out" class="mt-2"></div>`;
        wireUploadBox(body, 'tpl-html');
        wireUploadBox(body, 'tpl-json');
        body.querySelector('#tpl-upload').addEventListener('click', () => {
          const fHtml = body.querySelector('#tpl-html').files[0];
          const fJson = body.querySelector('#tpl-json').files[0];
          const out = body.querySelector('#tpl-upload-out');
          if (!fHtml) { out.innerHTML = UIKit.banner('danger', '', 'فایل قالب انتخاب نشده است.'); return; }
          const ext = (fHtml.name.split('.').pop() || '').toLowerCase();
          const proceedWithHtml = (htmlText, srcName) => {
            const afterJson = (jsonText) => {
              try {
                const t = templateManager.addUploaded(htmlText, jsonText, srcName);
                UI.U.tplHtmlFile = null; UI.U.tplJsonFile = null;   /* پاک‌سازی انتخاب پس از ثبت موفق (۲٫۵) */
                out.innerHTML = UIKit.banner('success', 'قالب ثبت شد', `نام: «${esc(t.name)}» — ${Utils.fmtInt(t.placeholders.length)} جای‌نگهدار شناسایی شد. از تب «قالب‌های آماده» آن را انتخاب کنید.`);
                UI.U.templateTab = 'builtin';
                setTimeout(() => UI.showView('template'), 900);
              } catch (err) { out.innerHTML = UIKit.banner('danger', 'خطا در قالب', esc(err.message).replace(/\n/g, '<br>')); }
            };
            if (fJson) {
              const rj = new FileReader();
              rj.onload = () => afterJson(rj.result);
              rj.onerror = () => afterJson(null);
              rj.readAsText(fJson);
            } else afterJson(null);
          };
          if (ext === 'docx') {
            out.innerHTML = UIKit.spinner('در حال استخراج متن سند Word…');
            templateManager.docxToHtmlTemplate(fHtml).then(html => {
              proceedWithHtml(html, fHtml.name.replace(/\.docx$/i, '.html'));
            }).catch(err => {
              out.innerHTML = UIKit.banner('danger', 'خطا در خواندن Word', esc(err.message));
            });
          } else {
            const rd = new FileReader();
            rd.onload = () => proceedWithHtml(rd.result, fHtml.name);
            rd.readAsText(fHtml);
          }
        });
      }
    }

    function secTypeFa(t) { return { text: 'متن تحلیلی', kpi: 'کارت شاخص', table: 'جدول', chart: 'نمودار' }[t] || t; }

    function renderSelected(box) {
      if (!f.templates.selectedId) { box.innerHTML = ''; return; }
      const t = templateManager.get(f.templates.selectedId);
      const compat = f.compat || templateManager.checkCompat(t, f.active);
      box.innerHTML = `
        <div class="panel">
          ${UI.viewHead('قالب فعال: ' + t.name, 'checkCircle')}
          ${compat.ok
            ? UIKit.banner('success', 'سازگار با داده فعلی', 'همه ستون‌های موردنیاز محاسبات قالب در مجموعه داده موجودند.')
            : UIKit.banner('danger', 'ناسازگاری با داده فعلی', compat.issues.map(i => '• ' + esc(i)).join('<br>'))}
          ${compat.notes && compat.notes.length ? UIKit.banner('warning', 'توجه', compat.notes.map(n => '• ' + esc(n)).join('<br>')) : ''}
          <div class="flex" style="gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" id="tpl-continue">${icon('arrowLeft')}ادامه به محاسبات</button>
          </div>
        </div>`;
      box.querySelector('#tpl-continue').addEventListener('click', () => {
        if (!compat.ok) { UIKit.toast('warning', 'قالب ناسازگار است', 'ابتدا ناسازگاری‌ها را برطرف کنید.'); return; }
        WorkflowManager.goto('calc');
      });
    }
  });

  /* ═════════ مرحله ۵: محاسبات ═════════ */
  UI.registerView('calc', function (el) {
    const f = Store.state.flow;
    if (!f.active) { el.innerHTML = UIKit.emptyState('alert', 'مجموعه داده فعالی وجود ندارد', ''); return; }
    if (!f.templates.selectedId) { el.innerHTML = UIKit.emptyState('layers', 'قالبی انتخاب نشده است', 'برای تعریف محاسبات، ابتدا قالب گزارش را انتخاب کنید.', `<button class="btn btn-primary" onclick="WorkflowManager.goto('template')">رفتن به قالب‌ها</button>`); return; }

    // بارگذاری تعاریف قالب (فقط بار اول)
    if (!f.calc.specLoaded) {
      const tpl = templateManager.get(f.templates.selectedId);
      const spec = templateManager.effectiveSpec(tpl, f.active);
      f.calc.defs = spec.defs.filter(d => !d.auto).map(d => Object.assign({}, d));
      f.calc.specLoaded = true;
    }

    el.innerHTML = `
      <div class="panel">
        ${UI.viewHead('مرحله ۵ — تنظیم و اجرای محاسبات', 'calc', '')}
        <div class="panel-sub">منبع محاسبات را انتخاب کنید: موتور درون‌برنامه‌ای، محاسبات تعریف‌شده در فایل داده، یا ترکیبی از هر دو. تعاریف از قالب انتخابی نیز بارگذاری شده‌اند.</div>
        <div class="calc-source-box">
          <label class="calc-source-option ${f.calc.sourceMode === 'app' ? 'checked' : ''}">
            <input type="radio" name="calc-source" value="app" ${f.calc.sourceMode === 'app' ? 'checked' : ''}>
            <div class="cso-body"><b>اجرای محاسبات درون نرم‌افزار</b><small>تعاریف قالب و محاسبات دلخواه شما با موتور محاسبات همین سامانه اجرا می‌شود.</small></div>
          </label>
          <label class="calc-source-option ${f.calc.sourceMode === 'file' ? 'checked' : ''}">
            <input type="radio" name="calc-source" value="file" ${f.calc.sourceMode === 'file' ? 'checked' : ''}>
            <div class="cso-body"><b>محاسبات از درون فایل داده</b><small>تعاریف محاسبات را از شیت «محاسبات/Calculations» فایل Excel یا فایل JSON مشخصات بارگذاری کنید.</small></div>
          </label>
          <label class="calc-source-option ${f.calc.sourceMode === 'both' ? 'checked' : ''}">
            <input type="radio" name="calc-source" value="both" ${f.calc.sourceMode === 'both' ? 'checked' : ''}>
            <div class="cso-body"><b>ترکیبی (دون‌برنامه‌ای + فایل)</b><small>هر دو مجموعه محاسبه با هم اجرا و کنار هم نمایش داده می‌شوند.</small></div>
          </label>
        </div>
        <div id="calc-file-area" style="display:${f.calc.sourceMode === 'app' ? 'none' : 'block'}"></div>
        <div class="divider"></div>
        <h3 style="font-size:14.5px;font-weight:800" class="mb-1">محاسبات موتور درون‌برنامه‌ای (${Utils.fmtInt(f.calc.defs.length)})</h3>
        <div id="defs-area"></div>
        <div class="flex mt-2" style="gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-lg" id="run-calc">${icon('play')}اجرای همه محاسبات</button>
          <button class="btn btn-secondary" id="toggle-add">${icon('plus')}افزودن محاسبه دلخواه</button>
        </div>
        <div id="add-form" style="display:none" class="mt-2 panel" style="background:var(--surface-2)"></div>
      </div>
      <div id="results-area"></div>`;

    // انتخاب منبع محاسبات
    el.querySelectorAll('input[name="calc-source"]').forEach(r => r.addEventListener('change', () => {
      f.calc.sourceMode = r.value;
      el.querySelectorAll('.calc-source-option').forEach(o => o.classList.toggle('checked', o.querySelector('input').checked));
      el.querySelector('#calc-file-area').style.display = r.value === 'app' ? 'none' : 'block';
      renderFileArea();
    }));

    renderFileArea();
    renderDefs();

    el.querySelector('#run-calc').addEventListener('click', () => {
      const defs = calculationEngine.activeDefs();
      if (!defs.length) { UIKit.toast('warning', 'محاسبه‌ای تعریف نشده', f.calc.sourceMode === 'file' ? 'ابتدا تعاریف محاسبات را از فایل بارگذاری کنید.' : 'حداقل یک محاسبه تعریف کنید.'); return; }
      const r = calculationEngine.runAll();
      if (r.errCount) UIKit.toast('warning', 'اجرا با خطا مواجه شد', `${Utils.fmtInt(r.okCount)} محاسبه موفق، ${Utils.fmtInt(r.errCount)} ناموفق — جزئیات زیر.`);
      else UIKit.toast('success', 'محاسبات اجرا شد', `${Utils.fmtInt(r.okCount)} محاسبه با موفقیت انجام شد.`);
      renderResults();
      WorkflowManager.refresh();
    });

    el.querySelector('#toggle-add').addEventListener('click', () => {
      const fm = el.querySelector('#add-form');
      fm.style.display = fm.style.display === 'none' ? 'block' : 'none';
      if (fm.style.display === 'block') renderAddForm(fm);
    });

    /* ---------- محاسبات از فایل داده ---------- */
    function renderFileArea() {
      const area = el.querySelector('#calc-file-area');
      if (!area) return;
      const fd = f.calc.fileDefs || [];
      area.innerHTML = `
        <div class="panel" style="background:var(--surface-2);margin-top:12px;box-shadow:none">
          <div class="form-row">
            <div class="field"><label>فایل تعاریف محاسبات (Excel شامل شیت «محاسبات/Calculations» یا JSON)</label>
              <input type="file" class="input" id="calc-file-input" accept=".xlsx,.xls,.json">
            </div>
            <div class="field" style="align-self:end"><button class="btn btn-primary" id="calc-file-load">${icon('upload')}بارگذاری تعاریف از فایل</button></div>
          </div>
          <span class="field-help">ساختار شیت محاسبات: سرستون‌های id، label، op، column، groupBy، dateColumn، filterCol، filterOp، filterValue — مقادیر مجاز op: ${Object.keys(calculationEngine.OPS_META).join('، ')}</span>
          <div id="calc-file-out" class="mt-2"></div>
          ${fd.length ? `<div class="mt-1"><b class="small">تعاریف بارگذاری‌شده از فایل (${Utils.fmtInt(fd.length)}) ${f.calc.fileSourceName ? '— منبع: ' + esc(f.calc.fileSourceName) : ''}:</b>
            <div class="table-wrap mt-1"><table class="data-table"><thead><tr><th>شاخص</th><th>عملیات</th><th>ستون</th><th>گروه/تاریخ</th><th>فیلتر</th><th></th></tr></thead><tbody>
            ${fd.map((d, i) => `<tr><td><b>${esc(d.label)}</b></td><td>${esc(calculationEngine.OPS_META[d.op] ? calculationEngine.OPS_META[d.op].label : d.op)}</td><td>${esc(d.column || '—')}</td><td>${esc(d.groupBy || d.dateColumn || '—')}</td><td>${d.filter ? esc(d.filter.col) + ' ' + filterFa(d.filter.op) + ' «' + esc(d.filter.value) + '»' : '—'}</td><td><button class="btn btn-sm btn-ghost" data-fdel="${i}" style="color:var(--danger)">${icon('trash')}</button></td></tr>`).join('')}
            </tbody></table></div></div>` : ''}
        </div>`;
      const loadBtn = area.querySelector('#calc-file-load');
      if (loadBtn) loadBtn.addEventListener('click', async () => {
        const fi = area.querySelector('#calc-file-input');
        const out = area.querySelector('#calc-file-out');
        if (!fi.files.length) { out.innerHTML = UIKit.banner('danger', '', 'فایلی انتخاب نشده است.'); return; }
        const file = fi.files[0];
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        try {
          let defs;
          if (ext === 'json') {
            defs = calculationEngine.defsFromJSON(await file.text());
          } else {
            const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const sheetName = wb.SheetNames.find(n => /^(محاسبات|calculations|calc|محاسبه)$/i.test(n.trim())) || wb.SheetNames[0];
            const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });
            defs = calculationEngine.defsFromMatrix(matrix);
            if (sheetName !== wb.SheetNames[0]) { /* شیت اختصاصی یافت شد */ }
          }
          calculationEngine.setFileDefs(defs, file.name);
          // اعتبارسنجی سریع
          const invalid = defs.filter(d => !calculationEngine.validateDef(d).ok).length;
          UIKit.toast('success', 'تعاریف بارگذاری شد', `${Utils.fmtInt(defs.length)} محاسبه از «${file.name}» خوانده شد${invalid ? ` (${Utils.fmtInt(invalid)} تعریف نامعتبر)` : ''}.`);
          UI.showView('calc');
        } catch (err) {
          out.innerHTML = UIKit.banner('danger', 'خطا در خواندن تعاریف', esc(err.message));
        }
      });
      area.querySelectorAll('[data-fdel]').forEach(b => b.addEventListener('click', () => {
        f.calc.fileDefs.splice(+b.dataset.fdel, 1);
        UI.showView('calc');
      }));
    }

    function renderAddForm(fm) {
      const ds = f.active;
      const numCols = ds.columns.filter(c => ['number', 'mixed'].includes(c.type));
      const allCols = ds.columns;
      fm.innerHTML = `
        <h3 class="mb-2" style="font-size:14.5px;font-weight:800">محاسبه جدید</h3>
        <div class="form-row">
          <div class="field"><label>نام شاخص *</label><input class="input" id="nd-label" placeholder="مثلاً: مجموع فروش تهران"></div>
          <div class="field"><label>نوع محاسبه *</label><select class="select" id="nd-op">
            ${Object.entries(calculationEngine.OPS_META).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}
          </select></div>
          <div class="field"><label>ستون مقدار</label><select class="select" id="nd-col"><option value="">—</option>${allCols.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>ستون گروه‌بندی</label><select class="select" id="nd-group"><option value="">—</option>${allCols.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>ستون تاریخ (برای تحلیل دوره‌ای)</label><select class="select" id="nd-date"><option value="">—</option>${allCols.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>فیلتر: ستون</label><select class="select" id="nd-fcol"><option value="">— بدون فیلتر —</option>${allCols.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>فیلتر: شرط</label><select class="select" id="nd-fop"><option value="eq">مساوی</option><option value="ne">نامساوی</option><option value="contains">شامل</option><option value="gt">بزرگ‌تر</option><option value="gte">بزرگ‌تر مساوی</option><option value="lt">کوچک‌تر</option><option value="lte">کوچک‌تر مساوی</option></select></div>
          <div class="field"><label>فیلتر: مقدار</label><input class="input" id="nd-fval"></div>
        </div>
        <button class="btn btn-primary" id="nd-add">${icon('plus')}افزودن به فهرست</button>`;
      fm.querySelector('#nd-add').addEventListener('click', () => {
        const def = {
          id: Utils.uid('calc'),
          label: fm.querySelector('#nd-label').value.trim(),
          op: fm.querySelector('#nd-op').value,
          column: fm.querySelector('#nd-col').value || null,
          groupBy: fm.querySelector('#nd-group').value || null,
          dateColumn: fm.querySelector('#nd-date').value || null,
          filter: fm.querySelector('#nd-fcol').value ? { col: fm.querySelector('#nd-fcol').value, op: fm.querySelector('#nd-fop').value, value: fm.querySelector('#nd-fval').value } : null
        };
        if (!def.label) { UIKit.toast('warning', 'نام شاخص لازم است', ''); return; }
        const v = calculationEngine.validateDef(def);
        if (!v.ok) { UIKit.toast('error', 'تعریف نامعتبر', v.error); return; }
        calculationEngine.addDef(def);
        renderDefs();
        UIKit.toast('success', 'محاسبه اضافه شد', 'برای مشاهده نتیجه، «اجرای همه محاسبات» را بزنید.');
        fm.style.display = 'none';
      });
    }

    function renderDefs() {
      const area = el.querySelector('#defs-area');
      if (!f.calc.defs.length) { area.innerHTML = '<p class="text-muted">محاسبه‌ای تعریف نشده است.</p>'; return; }
      area.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>شاخص</th><th>عملیات</th><th>ستون</th><th>گروه‌بندی / تاریخ</th><th>فیلتر</th><th></th></tr></thead><tbody>
        ${f.calc.defs.map(d => {
          const v = calculationEngine.validateDef(d);
          return `<tr>
            <td><b>${esc(d.label)}</b></td>
            <td>${esc(calculationEngine.OPS_META[d.op] ? calculationEngine.OPS_META[d.op].label : d.op)}</td>
            <td>${esc(d.column || '—')}</td>
            <td>${esc(d.groupBy || d.dateColumn || '—')}</td>
            <td>${d.filter ? `${esc(d.filter.col)} ${filterFa(d.filter.op)} «${esc(d.filter.value)}»` : '—'}</td>
            <td class="flex" style="gap:6px">
              ${v.ok ? UIKit.badge('success', 'معتبر') : UIKit.badge('danger', v.error)}
              <button class="btn btn-sm btn-ghost" data-rm="${d.id}" title="حذف" style="color:var(--danger)">${icon('trash')}</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
      area.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
        calculationEngine.removeDef(b.dataset.rm);
        renderDefs();
      }));
    }

    function filterFa(op) { return { eq: '=', ne: '≠', contains: 'شامل', gt: '>', gte: '≥', lt: '<', lte: '≤' }[op] || op; }

    function renderResults() {
      const area = el.querySelector('#results-area');
      const results = f.calc.results;
      if (!f.calc.ranAt) { area.innerHTML = ''; return; }
      const scalars = results.filter(r => r.ok && r.value !== undefined && r.table === undefined);
      const tables = results.filter(r => r.ok && r.table);
      const periods = results.filter(r => r.ok && r.series);
      const errors = results.filter(r => !r.ok);
      area.innerHTML = `
        <div class="panel">
          ${UI.viewHead('نتایج محاسبات', 'checkCircle', `اجرا: ${esc(new Date(f.calc.ranAt).toLocaleString('fa-IR'))}`)}
          <div class="kpi-grid">
            ${scalars.map(r => `<div class="kpi-card">
              <div class="kpi-label">${esc(r.def.label)}</div>
              <div class="kpi-value">${formatScalar(r)}</div>
              <div class="kpi-meta">${r.meta && r.meta.n !== undefined ? 'n=' + Utils.fmtInt(r.meta.n) : ''}${r.def.op === 'pctFiltered' && r.meta.outOf ? ' از ' + Utils.fmtInt(r.meta.outOf) : ''}</div>
            </div>`).join('')}
          </div>
          ${periods.map(p => `
            <div class="chart-box"><div class="chart-title">${esc(p.def.label)} — روند ماهانه</div>
              <div class="table-wrap" style="max-height:240px"><table class="data-table"><thead><tr><th>ماه</th><th>مقدار</th><th>تعداد رکورد</th></tr></thead><tbody>
              ${p.series.map(s => `<tr><td>${esc(s.label)}</td><td class="mono">${Utils.nf(s.value)}</td><td>${Utils.fmtInt(s.count)}</td></tr>`).join('')}
              </tbody></table></div>
              ${p.previous ? `<p class="mt-1 small">مقایسه دو دوره اخیر: ${p.current.label} نسبت به ${p.previous.label} ${p.deltaAbs > 0 ? 'رشد' : p.deltaAbs < 0 ? 'کاهش' : 'بدون تغییر'} ${p.deltaPct !== null ? '(' + Utils.fmtPct(Math.abs(p.deltaPct)) + ')' : ''}</p>` : ''}
            </div>`).join('')}
          ${tables.map(t => `
            <div class="chart-box"><div class="chart-title">${esc(t.def.label)}</div>
              <div class="table-wrap" style="max-height:300px"><table class="data-table"><thead><tr><th>${esc(t.def.groupBy || 'گروه')}</th><th>تعداد رکورد</th><th>مقدار</th><th>سهم</th></tr></thead><tbody>
              ${(() => { const total = t.table.reduce((s, x) => s + (x.value || 0), 0); return t.table.slice(0, 15).map(x => `<tr><td>${esc(x.label)}</td><td>${Utils.fmtInt(x.count)}</td><td class="mono">${x.value === null ? '—' : Utils.nf(x.value)}</td><td>${x.value !== null && total ? Utils.fmtPct((x.value / total) * 100) : '—'}</td></tr>`).join(''); })()}
              </tbody></table></div>
            </div>`).join('')}
          ${errors.length ? UIKit.banner('danger', 'محاسبات ناموفق', errors.map(e => `• <b>${esc(e.def.label)}</b>: ${esc(e.error)}`).join('<br>')) : ''}
          ${results.some(r => r.ok && r.meta && r.meta.warnings && r.meta.warnings.length) ? UIKit.banner('warning', 'هشدارهای محاسباتی', results.filter(r => r.ok && r.meta.warnings).flatMap(r => r.meta.warnings.map(w => `• <b>${esc(r.def.label)}:</b> ${esc(w)}`)).join('<br>')) : ''}
          <div class="flex mt-2"><button class="btn btn-primary" id="calc-continue">${icon('arrowLeft')}ادامه به تولید گزارش</button></div>
        </div>`;
      const cbtn = area.querySelector('#calc-continue');
      if (cbtn) cbtn.addEventListener('click', () => WorkflowManager.goto('ai'));
    }

    function formatScalar(r) {
      const v = r.value;
      if (v === null || v === undefined) return '—';
      if (r.def.op === 'pctFiltered') return Utils.fmtPct(v);
      if (['sum', 'mean', 'median', 'min', 'max'].includes(r.def.op)) {
        if (Math.abs(v) >= 1000) return Utils.nf(Math.round(v), { maximumFractionDigits: 0 });
        return Utils.nf(v);
      }
      return Utils.fmtInt(v);
    }
  });
})();
