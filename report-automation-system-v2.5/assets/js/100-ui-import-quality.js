/* ═══════════════════════════════════════════════════════════
   نماهای مرحله ۱ (دریافت داده) و مرحله ۲ (بررسی کیفیت)
   امکانات نسخه ۲٫۱:
   • تشخیص «همه شیت‌ها» و «همه جدول‌های داخل هر شیت» با انتخاب چک‌باکسی
   • ادغام جدول‌های انتخاب‌شده (مثلاً یک جدول از شیت محصول + یک جدول از شیت مشتری)
   • ستون‌های محاسباتی استخراج‌شده (تاریخ→ماه/سال/روز هفته/آخر هفته، تعداد×قیمت و…)
   ═══════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { icon, esc } = Utils;

  /* ═════════ مرحله ۱: دریافت داده ═════════ */
  UI.registerView('import', function (el) {
    const f = Store.state.flow;
    el.innerHTML = `
      <div class="panel">
        ${UI.viewHead('مرحله ۱ — دریافت داده', 'upload', 'پردازش کامل در مرورگر؛ بدون ارسال داده به بیرون')}
        <div id="import-status"></div>
        <div class="tabs" id="import-tabs">
          <button class="tab ${UI.U.importTab === 'file' ? 'active' : ''}" data-tab="file">${icon('file')}فایل Excel / CSV</button>
          <button class="tab ${UI.U.importTab === 'gsheet' ? 'active' : ''}" data-tab="gsheet">${icon('link')}لینک Google Sheets</button>
          <button class="tab ${UI.U.importTab === 'paste' ? 'active' : ''}" data-tab="paste">${icon('clipboard')}چسباندن داده</button>
        </div>
        <div id="import-tab-body"></div>
      </div>
      <div id="import-result"></div>`;

    el.querySelector('#import-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      UI.U.importTab = b.dataset.tab;
      UI.showView('import');
    });

    renderTabBody(el.querySelector('#import-tab-body'));
    renderImportedState(el.querySelector('#import-result'));

    function renderTabBody(body) {
      if (UI.U.importTab === 'file') {
        body.innerHTML = `
          <div class="dropzone" id="dz">
            <div class="dz-icon">${icon('upload')}</div>
            <div class="dz-title">فایل داده را اینجا رها کنید یا کلیک کنید</div>
            <div class="dz-sub">فرمت‌های پشتیبانی‌شده: .xlsx و .csv — حداکثر حجم: Excel ۱۲ مگابایت، CSV ۲۵ مگابایت — فایل چندبرگی و چندجدولی به‌طور کامل شناسایی می‌شود</div>
            <input type="file" id="file-input" accept=".xlsx,.xls,.csv">
          </div>`;
        const dz = body.querySelector('#dz');
        const fi = body.querySelector('#file-input');
        dz.addEventListener('click', () => fi.click());
        dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
        dz.addEventListener('drop', (e) => {
          e.preventDefault(); dz.classList.remove('dragover');
          if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
        fi.addEventListener('change', () => { if (fi.files.length) handleFile(fi.files[0]); fi.value = ''; });
      } else if (UI.U.importTab === 'gsheet') {
        body.innerHTML = `
          <div class="field">
            <label>لینک برگه Google Sheets</label>
            <input class="input" id="gs-url" placeholder="https://docs.google.com/spreadsheets/d/…" dir="ltr">
            <span class="field-help">برگه باید عمومی باشد («اشتراک‌گذاری ← هر کسی که لینک دارد») یا از «File ← Share ← Publish to web» منتشر شده باشد. دسترسی به شیت خصوصی در فاز دوم با Google Apps Script پشتیبانی می‌شود.</span>
          </div>
          <button class="btn btn-primary" id="gs-fetch">${icon('download')}دریافت داده از شیت</button>`;
        body.querySelector('#gs-fetch').addEventListener('click', async () => {
          const url = body.querySelector('#gs-url').value;
          const status = document.getElementById('import-status');
          status.innerHTML = UIKit.spinner('در حال دریافت داده از Google Sheets…');
          try {
            const res = await dataImporter.importGSheet(url);
            status.innerHTML = '';
            setPendingSingle(res.dataset, null, null, 'Google Sheets');
            renderImportedState(document.getElementById('import-result'));
            UIKit.toast('success', 'داده دریافت شد', `${Utils.fmtInt(res.dataset.rows.length)} ردیف از Google Sheets خوانده شد.`);
          } catch (err) {
            status.innerHTML = UIKit.banner('danger', 'دریافت ناموفق', esc(err.message));
            UIKit.toast('error', 'خطای دریافت', err.message);
          }
        });
      } else {
        body.innerHTML = `
          <div class="field">
            <label>متن داده (CSV یا TSV) — ردیف اول باید سرستون‌ها باشد</label>
            <textarea class="textarea" id="paste-area" style="min-height:180px" placeholder="نام,شهر,مبلغ&#10;علی,تهران,1200000"></textarea>
          </div>
          <button class="btn btn-primary" id="paste-go">${icon('check')}پردازش متن</button>`;
        body.querySelector('#paste-go').addEventListener('click', () => {
          try {
            const res = dataImporter.importPasted(document.getElementById('paste-area').value);
            setPendingSingle(res.dataset, null, null, 'داده چسبانده‌شده');
            renderImportedState(document.getElementById('import-result'));
            UIKit.toast('success', 'متن پردازش شد', `${Utils.fmtInt(res.dataset.rows.length)} ردیف شناسایی شد.`);
          } catch (err) {
            UIKit.toast('error', 'خطای پردازش', err.message);
          }
        });
      }
    }

    /* ---------- بارگذاری فایل: تشخیص همه شیت‌ها و همه جدول‌ها ---------- */
    async function handleFile(file) {
      const status = document.getElementById('import-status');
      try {
        status.innerHTML = UIKit.spinner(`در حال خواندن «${esc(file.name)}»…`);
        const info = dataImporter.validateFile(file);
        if (info.ext === 'csv') {
          const res = await dataImporter.importFile(file);
          setPendingSingle(res.dataset, null, null, file.name);
          status.innerHTML = '';
          renderImportedState(document.getElementById('import-result'));
          UIKit.toast('success', 'فایل CSV خوانده شد', `${Utils.fmtInt(res.dataset.rows.length)} ردیف و ${Utils.fmtInt(res.dataset.columns.length)} ستون.`);
          return;
        }
        /* Excel: بازکردن کامل و تشخیص جدول‌ها در همه شیت‌ها */
        const opened = await dataImporter.importFile(file);
        const wb = opened.workbook;
        const sheets = opened.sheets;
        if (!wb || !sheets) { setPendingSingle(opened.dataset, null, null, file.name); status.innerHTML = ''; renderImportedState(document.getElementById('import-result')); return; }
        const detected = tableDetector.detectWorkbook(wb, sheets, file.name);
        UI.U.pendingWorkbook = wb;
        UI.U.pendingSheets = sheets;
        UI.U.pendingFileName = file.name;
        UI.U.pendingDetected = detected;
        UI.U.pendingSel = new Set();
        detected.forEach((s, si) => s.tables.forEach((t, ti) => {
          const key = si + ':' + t.id;
          if (si === 0 && ti === 0) UI.U.pendingSel.add(key); /* پیش‌فرض: اولین جدول */
        }));
        status.innerHTML = '';
        UI.U.pending = null; /* تا انتخاب جدول‌ها، مجموعه نهایی ساخته نمی‌شود */
        UI.U.pendingActiveSheet = null;
        renderImportedState(document.getElementById('import-result'));
        const totalTables = detected.reduce((s, x) => s + x.tables.length, 0);
        UIKit.toast('info', 'فایل چندبخشی شناسایی شد', `${Utils.fmtInt(sheets.length)} شیت و ${Utils.fmtInt(totalTables)} جدول شناسایی شد؛ جدول‌های دلخواه را با چک‌باکس انتخاب کنید.`);
      } catch (err) {
        status.innerHTML = UIKit.banner('danger', 'خطا در بارگذاری', esc(err.message) +
          `<div class="banner-actions"><button class="btn btn-sm btn-secondary" onclick="document.getElementById('file-input').click()">انتخاب فایل دیگر</button></div>`);
        UIKit.toast('error', 'بارگذاری ناموفق', err.message);
      }
    }

    /* مسیرهای تک‌جدولی (CSV/چسباندن/Google Sheets) */
    function setPendingSingle(dataset, workbook, sheets, fileName) {
      UI.U.pending = dataset;
      UI.U.pendingWorkbook = workbook;
      UI.U.pendingSheets = sheets;
      UI.U.pendingFileName = fileName;
      UI.U.pendingActiveSheet = null;
      UI.U.pendingDetected = null;
      UI.U.pendingSel = null;
    }

    /* ---------- ساخت مجموعه از جدول‌های انتخابی ---------- */
    function pickedTables() {
      const det = UI.U.pendingDetected;
      const sel = UI.U.pendingSel;
      if (!det || !sel) return [];
      const picked = [];
      det.forEach((s, si) => s.tables.forEach(t => {
        if (sel.has(si + ':' + t.id)) picked.push(t);
      }));
      return picked;
    }
    function buildPendingFromSelection() {
      const det = UI.U.pendingDetected;
      const sel = UI.U.pendingSel;
      if (!det || !sel) return UI.U.pending;
      const picked = pickedTables();
      if (!picked.length) return null;
      if (picked.length === 1) return picked[0].dataset;
      /* حالت Join: نتیجه دیالوگ ترکیب (اگر اعمال شده باشد) */
      if ((UI.U.combineMode || 'append') === 'join' && UI.U.pendingJoin) return UI.U.pendingJoin.dataset;
      return tableDetector.mergeDatasets(picked);
    }

    /* ---------- بخش «اطلاعات داده واردشده» ---------- */
    function renderImportedState(res) {
      const det = UI.U.pendingDetected;
      const dsSingle = UI.U.pending;

      if (det) {
        /* حالت چندشیت/چندجدول */
        const totalTables = det.reduce((s, x) => s + x.tables.length, 0);
        const merged = buildPendingFromSelection();
        res.innerHTML = `
          <div class="panel">
            ${UI.viewHead('اطلاعات داده واردشده', 'table', 'همه شیت‌ها و جدول‌های شناسایی‌شده — هر جدول را که می‌خواهید با چک‌باکس انتخاب کنید')}
            <div class="grid-stats">
              <div class="stat-card accent-primary"><span class="stat-label">منبع</span><span class="stat-value" style="font-size:15px">${esc(UI.U.pendingFileName || 'فایل Excel')}</span><span class="stat-note">${Utils.fmtInt(det.length)} شیت — ${Utils.fmtInt(totalTables)} جدول شناسایی‌شده</span></div>
              <div class="stat-card ${merged ? 'accent-success' : 'accent-warning'}"><span class="stat-label">جدول‌های انتخابی</span><span class="stat-value">${Utils.fmtInt(UI.U.pendingSel.size)}</span><span class="stat-note">${merged ? Utils.fmtInt(merged.rows.length) + ' ردیف — ' + Utils.fmtInt(merged.columns.length) + ' ستون' : 'حداقل یک جدول انتخاب کنید'}</span></div>
              ${merged ? `<div class="stat-card ${merged.meta.emptyCells ? 'accent-warning' : 'accent-success'}"><span class="stat-label">سلول‌های خالی (ادغام)</span><span class="stat-value">${Utils.fmtInt(merged.meta.emptyCells)}</span><span class="stat-note">در مجموعه ادغام‌شده</span></div>
              <div class="stat-card ${merged.meta.dupEstimate ? 'accent-warning' : 'accent-success'}"><span class="stat-label">تکراری احتمالی (ادغام)</span><span class="stat-value">${Utils.fmtInt(merged.meta.dupEstimate)}</span><span class="stat-note">در مرحله پاک‌سازی مدیریت می‌شود</span></div>` : ''}
            </div>

            <div class="field">
              <label>${icon('layers', 13)} شیت‌ها و جدول‌ها — انتخاب با چک‌باکس</label>
              <div class="sheet-tree">
                ${det.map((s, si) => `
                  <div class="st-sheet">
                    <div class="st-sheet-head">${icon('database', 14)} شیت: <b>${esc(s.sheet)}</b>
                      <span class="badge badge-neutral">${s.tables.length ? Utils.faDig(s.tables.length) + ' جدول' : 'جدول معتبری یافت نشد'}</span></div>
                    ${s.tables.length ? s.tables.map(t => {
                      const key = si + ':' + t.id;
                      const checked = UI.U.pendingSel.has(key);
                      return `
                      <label class="st-table ${checked ? 'checked' : ''}" data-table-key="${key}">
                        <input type="checkbox" data-tsel="${key}" ${checked ? 'checked' : ''}>
                        <div class="st-t-info">
                          <b>${icon('table', 13)} ${esc(t.name)}</b>
                          <small>ردیف ${Utils.fmtInt(t.r1)}–${Utils.fmtInt(t.r2)}، ستون ${Utils.fmtInt(t.c1)}–${Utils.fmtInt(t.c2)} — ${Utils.fmtInt(t.rowCount)} ردیف × ${Utils.fmtInt(t.colCount)} ستون</small>
                          <div class="st-t-cols">${t.headers.slice(0, 8).map(h => `<span class="badge badge-neutral">${esc(String(h))}</span>`).join('')}${t.headers.length > 8 ? `<span class="badge badge-info">+${Utils.faDig(t.headers.length - 8)}</span>` : ''}</div>
                        </div>
                      </label>`;
                    }).join('') : '<div class="st-empty">در این شیت جدولی با ساختار معتبر (سرستون + داده) یافت نشد.</div>'}
                  </div>`).join('')}
              </div>
            </div>

            ${merged ? (function () {
              const picked = pickedTables();
              const mode = UI.U.combineMode || 'append';
              const multi = picked.length >= 2;
              let combine = '';
              if (multi) {
                combine = `
              <div class="field">
                <label>${icon('layers', 13)} روش ترکیب ${Utils.faDig(picked.length)} جدول انتخابی</label>
                <div class="ai-mode-opts">
                  <label class="ai-mode-opt ${mode === 'append' ? 'selected' : ''}">
                    <input type="radio" name="combine-mode" value="append" ${mode === 'append' ? 'checked' : ''}>
                    <div><b>${icon('layers', 14)} چینش ردیف‌ها (Append / Stack)</b><small>ردیف‌های جدول‌ها زیر هم قرار می‌گیرند؛ برای داده‌های هم‌ساختار (مثلاً فروش چند ماه).</small></div>
                  </label>
                  <label class="ai-mode-opt ${mode === 'join' ? 'selected' : ''}">
                    <input type="radio" name="combine-mode" value="join" ${mode === 'join' ? 'checked' : ''}>
                    <div><b>${icon('columns', 14)} ترکیب ستونی با کلید مشترک (Merge / Join)</b><small>ستون‌های دو جدول بر اساس کلید مشترک کنار هم می‌نشینند (مثلاً «فروشات» با «مشتریان» بر اساس کد مشتری).</small></div>
                  </label>
                </div>
                ${mode === 'join' ? (UI.U.pendingJoin ? `
                  <div class="banner banner-success">${icon('checkCircle')}<div>نتیجه Join آماده است: ${esc(UI.U.pendingJoin.dataset.meta.sourceNote)} — ${Utils.fmtInt(UI.U.pendingJoin.dataset.rows.length)} ردیف × ${Utils.fmtInt(UI.U.pendingJoin.dataset.columns.length)} ستون. برای تغییر پیکربندی دوباره دکمه پیکربندی را بزنید.</div></div>
                  <button class="btn btn-secondary btn-sm" id="open-join" style="margin-top:6px">${icon('edit', 13)}تغییر پیکربندی Join</button>` : `
                  <div class="banner banner-info">${icon('info')}<div>برای Join، جدول ۱ و جدول ۲، نوع Join و کلید(های) مشترک را در پنجره بعدی مشخص کنید. پیش‌نمایش نتیجه پیش از اعمال نمایش داده می‌شود.</div></div>
                  <button class="btn btn-secondary" id="open-join" style="margin-top:6px">${icon('columns', 14)}پیکربندی Join…</button>`) : ''}
              </div>`;
              }
              return `${combine}
              <div class="field">
                <label>پیش‌نمایش مجموعه ${mode === 'join' && UI.U.pendingJoin ? 'ترکیب‌شده (Join)' : 'ادغام‌شده (چینش)'} (${esc(merged.meta.sourceNote)}) — ۸ ردیف اول</label>
                ${Utils.htmlTable(merged.columns, merged.rows, { maxRows: 8, showRowIndex: true })}
              </div>
              <div class="flex" style="gap:10px;flex-wrap:wrap">
                <button class="btn btn-primary btn-lg" id="confirm-import" ${mode === 'join' && !UI.U.pendingJoin ? 'disabled title="ابتدا پیکربندی Join را انجام دهید"' : ''}>${icon('checkCircle')}تأیید ورود داده (${Utils.fmtInt(merged.rows.length)} ردیف)</button>
                <button class="btn btn-ghost" id="cancel-import">${icon('x')}انصراف و بارگذاری مجدد</button>
              </div>`;
            })() : `
              <div class="banner banner-warning">${icon('alert')}<div>هنوز جدولی انتخاب نشده است. حداقل یک جدول را با چک‌باکس انتخاب کنید تا پیش‌نمایش و تأیید فعال شود.</div></div>
              <div class="flex" style="gap:10px;flex-wrap:wrap;margin-top:10px">
                <button class="btn btn-ghost" id="cancel-import">${icon('x')}انصراف و بارگذاری مجدد</button>
              </div>`}
          </div>`;

        res.querySelectorAll('[data-tsel]').forEach(cb => cb.addEventListener('change', () => {
          if (cb.checked) UI.U.pendingSel.add(cb.dataset.tsel);
          else UI.U.pendingSel.delete(cb.dataset.tsel);
          UI.U.pendingJoin = null; /* با تغییر انتخاب، نتیجه Join قبلی باطل می‌شود */
          renderImportedState(res);
        }));
        /* روش ترکیب: Append در برابر Join */
        res.querySelectorAll('input[name="combine-mode"]').forEach(r => r.addEventListener('change', () => {
          UI.U.combineMode = r.value;
          if (r.value === 'append') UI.U.pendingJoin = null;
          renderImportedState(res);
        }));
        const oj = res.querySelector('#open-join');
        if (oj) oj.addEventListener('click', () => {
          const picked = pickedTables();
          if (picked.length < 2) { UIKit.toast('warning', 'ترکیب جدول‌ها', 'حداقل دو جدول انتخاب کنید.'); return; }
          uiJoin.openDialog(picked, (joined) => {
            UI.U.pendingJoin = { dataset: joined };
            renderImportedState(res);
          });
        });
        const ci = res.querySelector('#confirm-import');
        if (ci) ci.addEventListener('click', () => confirmImport(buildPendingFromSelection()));
        const cx = res.querySelector('#cancel-import');
        if (cx) cx.addEventListener('click', () => {
          UI.U.pending = null; UI.U.pendingWorkbook = null; UI.U.pendingSheets = null;
          UI.U.pendingDetected = null; UI.U.pendingSel = null;
          renderImportedState(res);
          UIKit.toast('info', 'انصراف', 'داده پیش‌نمایش پاک شد؛ می‌توانید فایل دیگری بارگذاری کنید.');
        });
        return;
      }

      /* حالت تک‌جدولی */
      const ds = dsSingle;
      if (!ds) { res.innerHTML = ''; renderDerivedPanel(res); return; }
      const colTypes = { number: 'عدد', text: 'متن', date: 'تاریخ', boolean: 'منطقی', mixed: 'مختلط', identifier: 'شناسه (موبایل/کارت/کد ملی)' };
      res.innerHTML = `
        <div class="panel">
          ${UI.viewHead('اطلاعات داده واردشده', 'table', 'پیش‌نمایش پیش از تأیید نهایی')}
          <div class="grid-stats">
            <div class="stat-card accent-primary"><span class="stat-label">منبع</span><span class="stat-value" style="font-size:15px">${esc(UI.U.pendingFileName || 'داده دستی')}</span><span class="stat-note">${esc(ds.meta.sourceNote || '')}</span></div>
            <div class="stat-card accent-success"><span class="stat-label">ردیف‌ها</span><span class="stat-value">${Utils.fmtInt(ds.rows.length)}</span></div>
            <div class="stat-card accent-info"><span class="stat-label">ستون‌ها</span><span class="stat-value">${Utils.fmtInt(ds.columns.length)}</span></div>
            <div class="stat-card ${ds.meta.emptyCells ? 'accent-warning' : 'accent-success'}"><span class="stat-label">سلول‌های خالی</span><span class="stat-value">${Utils.fmtInt(ds.meta.emptyCells)}</span></div>
            <div class="stat-card ${ds.meta.dupEstimate ? 'accent-warning' : 'accent-success'}"><span class="stat-label">رکورد تکراری احتمالی</span><span class="stat-value">${Utils.fmtInt(ds.meta.dupEstimate)}</span></div>
          </div>
          ${UI.U.pendingSheets && UI.U.pendingSheets.length > 1 ? `
            <div class="field">
              <label>انتخاب شیت (${Utils.fmtInt(UI.U.pendingSheets.length)} شیت)</label>
              <div class="flex flex-wrap" id="sheet-chips">
                ${UI.U.pendingSheets.map(s => `<button class="btn btn-sm ${s === UI.U.pendingActiveSheet ? 'btn-primary' : 'btn-secondary'}" data-sheet="${esc(s)}">${icon('database', 12)}${esc(s)}</button>`).join('')}
              </div>
            </div>` : ''}
          <div class="field">
            <label>ستون‌ها و نوع تشخیص‌داده‌شده</label>
            <div class="flex flex-wrap">
              ${ds.columns.map(c => `<span class="badge badge-${c.type === 'number' ? 'success' : c.type === 'date' ? 'info' : c.type === 'mixed' || c.type === 'identifier' ? 'warning' : 'neutral'}" title="نوع: ${colTypes[c.type] || c.type}">${esc(c.name)} — ${colTypes[c.type] || c.type}${c.emptyCount ? ` (${Utils.fmtInt(c.emptyCount)} خالی)` : ''}</span>`).join('')}
            </div>
          </div>
          <div class="field"><label>نمونه داده (۸ ردیف اول)</label>${Utils.htmlTable(ds.columns, ds.rows, { maxRows: 8, showRowIndex: true })}</div>
          <div class="flex" style="gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary btn-lg" id="confirm-import">${icon('checkCircle')}تأیید ورود داده</button>
            <button class="btn btn-ghost" id="cancel-import">${icon('x')}انصراف و بارگذاری مجدد</button>
          </div>
        </div>`;

      const chips = res.querySelector('#sheet-chips');
      if (chips) {
        chips.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-sheet]');
          if (!b || !UI.U.pendingWorkbook) return;
          try {
            const ds2 = dataImporter.extractSheet(UI.U.pendingWorkbook, b.dataset.sheet, UI.U.pendingFileName);
            setPendingSingle(ds2, UI.U.pendingWorkbook, UI.U.pendingSheets, UI.U.pendingFileName);
            UI.U.pendingActiveSheet = b.dataset.sheet;
            renderImportedState(res);
          } catch (err) { UIKit.toast('error', 'خطا در خواندن شیت', err.message); }
        });
      }
      res.querySelector('#confirm-import').addEventListener('click', () => confirmImport(ds));
      res.querySelector('#cancel-import').addEventListener('click', () => {
        UI.U.pending = null; UI.U.pendingWorkbook = null; UI.U.pendingSheets = null;
        UI.U.pendingDetected = null; UI.U.pendingSel = null;
        renderImportedState(res);
        UIKit.toast('info', 'انصراف', 'داده پیش‌نمایش پاک شد؛ می‌توانید فایل دیگری بارگذاری کنید.');
      });
      renderDerivedPanel(res);
    }

    /* ---------- تأیید ورود داده ----------
       نسخه ۲٫۴: تاریخچه واگرد با ورود داده جدید پاک می‌شود — واگرد هرگز
       از مرز «ورود داده» عبور نمی‌کند تا داده فعال هرگز به‌طور کامل از
       دست نرود (رفع باگ پاک‌شدن داده هنگام Ctrl+Z در پاک‌سازی). */
    function confirmImport(dataset) {
      if (!dataset) { UIKit.toast('warning', 'جدولی انتخاب نشده', 'حداقل یک جدول را انتخاب کنید.'); return; }
      const f2 = Store.state.flow;
      f2.raw = Utils.deepClone({ columns: dataset.columns, rows: dataset.rows });
      f2.source = {
        kind: UI.U.pendingDetected ? 'xlsx' : (UI.U.importTab === 'gsheet' ? 'gsheet' : (String(UI.U.pendingFileName || '').endsWith('.csv') ? 'csv' : 'xlsx')),
        name: UI.U.pendingFileName || 'داده دستی',
        importedAt: new Date().toISOString(),
        sheets: UI.U.pendingDetected ? UI.U.pendingSheets : UI.U.pendingSheets,
        activeSheet: UI.U.pendingActiveSheet,
        note: dataset.meta.sourceNote,
        tables: UI.U.pendingDetected ? Array.from(UI.U.pendingSel).length : null
      };
      f2.clean.rowsBefore = f2.raw.rows.length;
      f2.work = null; f2.active = null; f2.profile = null;
      f2.clean.started = false; f2.clean.confirmed = false; f2.clean.log = [];
      f2.clean.steps = null; f2.clean.stepActive = 0;   /* گام‌های داده قبلی منقضی می‌شوند */
      f2.derived = { defs: [], appliedAt: null };
      FilterEngine.clearAll();
      /* مرز ایمنی: واگرد/اجرای مجدد از نقطه ورود داده عبور نمی‌کند */
      if (typeof UndoManager !== 'undefined' && UndoManager.clear) UndoManager.clear();
      WorkflowManager.refresh();
      uiShell.refreshUndoRedo();
      UIKit.toast('success', 'داده وارد شد', 'اکنون به مرحله بررسی کیفیت بروید. برای اصلاح خطاها در پاک‌سازی از «گام‌های اعمال‌شده» یا واگرد سربرگ استفاده کنید.');
      WorkflowManager.goto('quality');
    }

    /* ═════════ ستون‌های محاسباتی استخراج‌شده ═════════ */
    function renderDerivedPanel(res) {
      const f2 = Store.state.flow;
      if (!f2.raw) return;
      const proposals = dataImporter.proposeDerived(f2.raw);
      if (!proposals.length) return;
      const holder = document.createElement('div');
      holder.innerHTML = `
        <div class="panel" id="derived-panel">
          ${UI.viewHead('ستون‌های محاسباتی استخراج‌شده', 'calc', 'نرم‌افزار از داده فایل شما، ستون‌های تحلیلی محاسبه می‌کند — هر چندتا را بخواهید انتخاب کنید')}
          <div class="steps-note">${icon('sparkles', 13)} <b>پیشنهادهای خودکار بر اساس ستون‌های شما:</b> از ستون تاریخ، اجزای آن (ماه، سال، روز هفته، آخر هفته و…) و از ترکیب «تعداد» و «قیمت»، مبلغ فروش محاسبه می‌شود.</div>
          <div class="derived-grid">
            ${proposals.map(p => `
              <label class="derived-item" data-derived="${esc(p.id)}">
                <input type="checkbox" data-dchk="${esc(p.id)}" ${f2.derived.defs.some(d => d.id === p.id) ? 'checked' : ''}>
                <div class="di-icon">${icon(p.icon || 'calc', 15)}</div>
                <div class="di-body">
                  <b>${esc(p.name)}</b>
                  <small>${esc(p.desc)}</small>
                </div>
              </label>`).join('')}
          </div>
          <div class="flex mt-2" style="gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" id="apply-derived">${icon('checkCircle')}افزودن ستون‌های انتخابی به داده</button>
            <button class="btn btn-secondary btn-sm" id="remove-derived" ${f2.derived.defs.length ? '' : 'disabled'}>${icon('trash')}حذف همه ستون‌های محاسباتی</button>
          </div>
          <div id="derived-status" class="mt-1"></div>
        </div>`;
      res.appendChild(holder);

      holder.querySelector('#apply-derived').addEventListener('click', () => {
        const chosen = proposals.filter(p => holder.querySelector(`[data-dchk="${CSS.escape(p.id)}"]`).checked);
        if (!chosen.length) { UIKit.toast('warning', 'انتخابی نیست', 'حداقل یک ستون محاسباتی را انتخاب کنید.'); return; }
        const snap = UndoManager.snapshotBefore('افزودن ستون‌های محاسباتی', ['raw', 'work', 'active', 'derived']);
        dataImporter.appendDerivedColumns(f2.raw, chosen);
        f2.derived = { defs: Utils.deepClone(chosen), appliedAt: new Date().toISOString() };
        if (f2.work) dataImporter.appendDerivedColumns(f2.work, chosen);
        if (f2.active) dataImporter.appendDerivedColumns(f2.active, chosen);
        snap.commit();
        holder.querySelector('#derived-status').innerHTML = UIKit.banner('success', 'ستون‌ها اضافه شدند', `${Utils.fmtInt(chosen.length)} ستون محاسباتی به داده اضافه شد و در همه مراحل (پاک‌سازی، محاسبات، نمودار) در دسترس است.`);
        UIKit.toast('success', 'ستون‌های محاسباتی اضافه شد', 'می‌توانید از آنها در نمودارها و گزارش استفاده کنید.');
        holder.querySelector('#remove-derived').disabled = false;
      });
      holder.querySelector('#remove-derived').addEventListener('click', () => {
        const snap = UndoManager.snapshotBefore('حذف ستون‌های محاسباتی', ['raw', 'work', 'active', 'derived']);
        const derivedNames = new Set(f2.derived.defs.map(d => d.name));
        ['raw', 'work', 'active'].forEach(k => {
          const ds = f2[k];
          if (!ds) return;
          const idxs = ds.columns.map((c, i) => c.derived || derivedNames.has(c.name) ? i : -1).filter(i => i >= 0);
          idxs.sort((a, b) => b - a).forEach(i => { ds.columns.splice(i, 1); ds.rows.forEach(r => r.splice(i, 1)); });
        });
        f2.derived = { defs: [], appliedAt: null };
        snap.commit();
        UI.showView('import');
        UIKit.toast('info', 'حذف شد', 'ستون‌های محاسباتی از داده حذف شدند.');
      });
    }
  });


  /* ═════════ مرحله ۲: بررسی کیفیت ═════════ */
  UI.registerView('quality', function (el) {
    const f = Store.state.flow;
    if (!f.raw) { el.innerHTML = UIKit.emptyState('alert', 'داده‌ای وارد نشده است', 'ابتدا در مرحله ۱ یک منبع داده وارد کنید.', `<button class="btn btn-primary" onclick="WorkflowManager.goto('import')">رفتن به دریافت داده</button>`); return; }

    el.innerHTML = `
      <div class="panel">
        ${UI.viewHead('مرحله ۲ — مرکز بررسی کیفیت داده', 'shield', '۱۰ بررسی الزامی روی ' + Utils.fmtInt(f.raw.rows.length) + ' ردیف')}
        <div id="quality-body"></div>
      </div>`;

    const body = el.querySelector('#quality-body');
    if (!f.profile) {
      body.innerHTML = `
        ${UIKit.banner('info', 'مرکز بررسی کیفیت داده', 'این مرکز کیفیت داده شما را در ۶ مرحله بررسی می‌کند: ساختار، مقادیر گمشده، اعتبار نوع، اعتبار مقادیر، سازگاری و مرور نهایی. برای هر بررسی، هدف، تعداد موارد مشکل‌دار، نمونه‌ها و پیشنهاد اصلاح نمایش داده می‌شود. هیچ تغییری در این مرحله روی داده اعمال نمی‌شود؛ تصمیم اصلاح با شما در مرحله بعدی است.')}
        <div class="q-stages" id="q-stages">${stagePills(null)}</div>
        <div class="center mt-3"><button class="btn btn-primary btn-lg" id="run-quality">${icon('play')}اجرای بررسی کیفیت</button></div>`;
      body.querySelector('#run-quality').addEventListener('click', runQuality);
    } else {
      renderResults(body);
    }

    function stagePills(currentRunning) {
      return dataProfiler.STAGES.map((s, i) => {
        const st = f.profile && f.profile.stages ? f.profile.stages[s.id] : (currentRunning === s.id ? 'running' : (currentRunning && i < dataProfiler.STAGES.findIndex(x => x.id === currentRunning) ? 'ok' : ''));
        const cls = st === 'running' ? 'state-running' : st === 'warn' ? 'state-warn' : st === 'ok' ? 'state-ok' : st === 'error' ? 'state-error' : '';
        const label = { running: 'در حال بررسی…', warn: 'دارای هشدار', ok: 'تکمیل‌شده', error: 'نیازمند اقدام' }[st] || 'انجام‌نشده';
        return `<div class="q-stage ${cls}"><div class="qs-head"><span class="qs-num">${Utils.faDig(i + 1)}</span><span class="qs-title">${esc(s.title)}</span></div><div class="qs-status">${label}</div></div>`;
      }).join('');
    }

    async function runQuality() {
      const btn = body.querySelector('#run-quality');
      btn.disabled = true;
      body.querySelector('#q-stages').innerHTML = stagePills('structure');
      f.profile = null;
      const profile = await dataProfiler.runAll(f.raw, (idx, sid, status) => {
        body.querySelector('#q-stages').innerHTML = stagePills(sid);
      });
      f.profile = profile;
      WorkflowManager.refresh();
      UIKit.toast('success', 'بررسی کیفیت کامل شد', `امتیاز: ${Utils.fmtInt(profile.score)} از ۱۰۰ — وضعیت: ${profile.grade}`);
      renderResults(body);
    }

    function renderResults(body) {
      const p = f.profile;
      const checks = p.checks;
      const order = ['structural', 'missing', 'typeConsistency', 'invalidDates', 'numericRange', 'outliers', 'whitespace', 'categories', 'crossColumn', 'duplicates'];
      const circumference = 2 * Math.PI * 52;
      const dash = (p.score / 100) * circumference;
      const scoreColor = p.score >= 90 ? 'var(--success)' : p.score >= 75 ? 'var(--info)' : p.score >= 60 ? 'var(--warning)' : 'var(--danger)';

      body.innerHTML = `
        <div class="q-stages">${stagePills(null)}</div>
        <div class="panel" style="box-shadow:none;background:var(--surface-2);margin:14px 0">
          <div class="score-ring-wrap">
            <div class="score-ring">
              <svg width="128" height="128">
                <circle cx="64" cy="64" r="52" fill="none" stroke="var(--border)" stroke-width="11"/>
                <circle cx="64" cy="64" r="52" fill="none" stroke="${scoreColor}" stroke-width="11" stroke-linecap="round"
                  stroke-dasharray="${dash} ${circumference}"/>
              </svg>
              <div class="score-num"><div><b>${Utils.faDig(p.score)}</b><small>از ۱۰۰</small></div></div>
            </div>
            <div class="score-desc">
              <div class="grade" style="color:${scoreColor}">وضعیت کلی: ${esc(p.grade)}</div>
              <p>این امتیاز از ترکیب وزنی ۱۰ بررسی کیفیت محاسبه شده است. جزئیات روش محاسبه در کادر پایین صفحه آمده است.</p>
              <div class="mt-2 flex" style="gap:10px;flex-wrap:wrap">
                <button class="btn btn-secondary btn-sm" id="rerun-quality">${icon('refresh')}اجرای مجدد بررسی</button>
                <button class="btn btn-primary" id="go-clean">${icon('broom')}ادامه به پاک‌سازی</button>
              </div>
            </div>
          </div>
          <div class="method-box mt-2"><b>روش محاسبه امتیاز:</b> ${esc(p.scoreMeta.formula)}. ${esc(p.scoreMeta.note)}</div>
        </div>
        <div id="checks-list">
          ${order.filter(id => checks[id]).map(id => checkCard(checks[id])).join('')}
        </div>`;

      body.querySelector('#rerun-quality').addEventListener('click', () => { f.profile = null; UI.showView('quality'); });
      body.querySelector('#go-clean').addEventListener('click', () => WorkflowManager.goto('clean'));

      // آکاردئون
      body.querySelectorAll('.q-check-head').forEach(h => {
        h.addEventListener('click', () => h.parentElement.classList.toggle('open'));
      });
      // باز کردن اولین بررسی مشکل‌دار
      const firstProblem = body.querySelector('.q-check.sev-high, .q-check.sev-medium');
      if (firstProblem) firstProblem.classList.add('open');
    }

    function checkCard(c) {
      const sevBadge = UIKit.severityBadge(c.severity);
      const pctTxt = c.issuePct > 0 ? Utils.fmtPct(c.issuePct) : '۰٪';
      const statRows = (c.extra && c.extra.perCol) ? c.extra.perCol.slice(0, 6).map(x =>
        `<span class="badge badge-neutral">${esc(x.name)}: ${Utils.fmtInt(x.count !== undefined ? x.count : (x.invalid !== undefined ? x.invalid : x.incompat))}</span>`).join('') : '';
      const samples = c.samples.length ? `
        <div class="table-wrap" style="max-height:220px"><table class="data-table"><thead><tr><th>ردیف</th><th>ستون</th><th>مقدار</th><th>توضیح</th></tr></thead><tbody>
          ${c.samples.map(s => `<tr><td class="mono">${esc(String(s.row))}</td><td>${esc(s.col)}</td><td class="mono" style="max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${esc(String(s.value))}">${esc(String(s.value))}</td><td class="text-soft">${esc(s.detail)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="text-muted">نمونه‌ای برای نمایش وجود ندارد.</p>';
      return `<div class="q-check sev-${c.severity === 'ok' ? 'ok' : c.severity}">
        <div class="q-check-head">
          <span class="qc-name">${esc(c.name)}</span>
          <div class="qc-meta">
            <span class="badge ${c.issueCount > 0 ? 'badge-danger' : 'badge-success'}">${c.issueCount > 0 ? Utils.fmtInt(c.issueCount) + ' مورد' : 'سالم'}</span>
            <span class="badge badge-neutral">${pctTxt} از رکوردها</span>
            ${sevBadge}
          </div>
          ${icon('chevronDown', 16)}
        </div>
        <div class="q-check-body">
          <div class="qc-purpose">${esc(c.purpose)}</div>
          <div class="qc-stats">
            <div class="qc-stat"><div class="k">رکوردهای بررسی‌شده</div><div class="v">${Utils.fmtInt(c.checkedCount)}</div></div>
            <div class="qc-stat"><div class="k">موارد مشکل‌دار</div><div class="v" style="color:${c.issueCount ? 'var(--danger)' : 'var(--success)'}">${Utils.fmtInt(c.issueCount)}</div></div>
            <div class="qc-stat"><div class="k">درصد درگیری</div><div class="v">${pctTxt}</div></div>
          </div>
          ${statRows ? `<div class="mb-1 flex flex-wrap" style="gap:6px">${statRows}</div>` : ''}
          ${samples}
          <div class="qc-suggestion">${icon('info')}<div><b>پیشنهاد اصلاح:</b> ${esc(c.suggestion)}</div></div>
        </div>
      </div>`;
    }
  });
})();
