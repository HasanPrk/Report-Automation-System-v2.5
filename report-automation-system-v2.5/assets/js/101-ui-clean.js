/* ═══════════════════════════════════════════════════════════
   نمای مرحله ۳ — مرکز پاک‌سازی و حذف رکوردهای تکراری (نسخه ۲٫۴)
   • ناوبری «گام‌های اعمال‌شده» دقیقا شبیه Power Query (جایگزین
     «گزارش تغییرات و واگرد» انتهای بخش شد)
   • ویرایش دستی موردی سلول‌ها داخل پیش‌نمایش تک‌تک عملیات‌ها
     (کادر مستقل برای هر سلول — مستقل از هم)
   ═══════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { icon, esc } = Utils;

  UI.registerView('clean', function (el) {
    const f = Store.state.flow;
    if (!f.raw) { el.innerHTML = UIKit.emptyState('alert', 'داده‌ای وارد نشده است', 'ابتدا داده وارد کنید.'); return; }
    if (!f.profile) { el.innerHTML = UIKit.emptyState('shield', 'بررسی کیفیت اجرا نشده است', 'برای پاک‌سازی هدفمند، ابتدا بررسی کیفیت را اجرا کنید.', `<button class="btn btn-primary" onclick="WorkflowManager.goto('quality')">رفتن به بررسی کیفیت</button>`); return; }

    dataCleaner.startCleaning();
    UI.U.typoMapping = null;

    el.innerHTML = `
      <div class="panel clean-panel">
        ${UI.viewHead('مرحله ۳ — مرکز پاک‌سازی و حذف موارد تکراری', 'broom',
          `${Utils.fmtInt(f.work.rows.length)} ردیف کاری (اولیه: ${Utils.fmtInt(f.clean.rowsBefore)})`)}
        ${cleanJourney()}
        <div class="clean-layout">
          <!-- ═════ ناوبری گام‌های اعمال‌شده (شبیه Power Query) ═════ -->
          <aside class="steps-rail" id="steps-rail" aria-label="گام‌های اعمال‌شده"></aside>
          <div class="clean-main">
            <div id="ops-area"></div>
            <div class="panel-sub clean-inner-panel" id="dup-panel">
              <div class="panel-sub-title">${icon('copy', 15)} حذف رکوردهای تکراری <span class="hint">هیچ رکوردی بدون مشاهده و تأیید شما حذف نمی‌شود</span></div>
              <div id="dup-area"></div>
            </div>
            <div class="panel-sub clean-inner-panel">
              <div class="panel-sub-title">${icon('checkCircle', 15)} تأیید نهایی مجموعه داده</div>
              ${UIKit.banner('info', '', 'پس از تأیید، این نسخه به‌عنوان «مجموعه داده فعال» برای محاسبات و گزارش استفاده می‌شود. داده خام برای مقایسه حفظ می‌شود.')}
              <div class="flex" style="gap:10px;flex-wrap:wrap">
                <button class="btn btn-success btn-lg" id="confirm-clean">${icon('checkCircle')}تأیید مجموعه داده پاک‌سازی‌شده (${Utils.fmtInt(f.work.rows.length)} ردیف)</button>
                <button class="btn btn-ghost" id="use-raw">${icon('x')}ادامه با داده خام بدون پاک‌سازی</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    renderOps();
    renderDups();
    renderStepsRail();

    el.querySelector('#confirm-clean').addEventListener('click', () => {
      UIKit.confirmBox({
        title: 'تأیید نهایی',
        message: `مجموعه داده کاری با <b>${Utils.fmtInt(f.work.rows.length)} ردیف</b> به‌عنوان مجموعه داده فعال ثبت می‌شود. ادامه؟`,
        confirmText: 'تأیید و ادامه',
        onConfirm: () => {
          dataCleaner.confirmCleaned();
          WorkflowManager.refresh();
          UIKit.toast('success', 'مجموعه داده فعال ثبت شد', `${Utils.fmtInt(f.active.rows.length)} ردیف آماده محاسبات است.`);
          WorkflowManager.goto('template');
        }
      });
    });

    el.querySelector('#use-raw').addEventListener('click', () => {
      UIKit.confirmBox({
        title: 'ادامه با داده خام',
        message: 'بدون هیچ پاک‌سازی، داده خام به‌عنوان مجموعه فعال ثبت می‌شود. مشکلات کیفیت در نتایج محاسبات باقی می‌مانند. مطمئنید؟',
        danger: true, confirmText: 'بله، با داده خام',
        onConfirm: () => {
          dataCleaner.useRaw();
          WorkflowManager.refresh();
          WorkflowManager.goto('template');
        }
      });
    });

    /* ---------- نقشه سفر پاک‌سازی ---------- */
    function cleanJourney() {
      const steps = ['مرور مشکلات', 'انتخاب عملیات', 'پیش‌نمایش تغییرات', 'تأیید عملیات', 'اجرا', 'ناوبری گام‌ها', 'تأیید نهایی'];
      const appliedCount = f.clean.log.filter(l => l.opId !== '__undo' && l.opId !== '__redo').length;
      let cur = 1;
      if (appliedCount > 0) cur = 5;
      if (f.clean.confirmed) cur = 7;
      return `<div class="q-stages mb-2">${steps.map((s, i) => {
        const st = i + 1 < cur ? 'state-ok' : i + 1 === cur ? 'state-running' : '';
        return `<div class="q-stage ${st}"><div class="qs-head"><span class="qs-num">${Utils.faDig(i + 1)}</span><span class="qs-title">${esc(s)}</span></div></div>`;
      }).join('')}</div>`;
    }

    /* ═════════ ناوبری «گام‌های اعمال‌شده» — دقیقا شبیه Power Query ═════════
       هر گام قابل کلیک است؛ پرش به هر گام = بازگشت به همان نقطه و حذف گام‌های
       بعدی؛ دکمه حذف هر گام هم مثل Remove Step عمل می‌کند. */
    function renderStepsRail() {
      const rail = el.querySelector('#steps-rail');
      if (!rail) return;
      const steps = dataCleaner.stepsList();
      const active = dataCleaner.activeStepIndex();
      const isMid = active < steps.length - 1;
      rail.innerHTML = `
        <div class="sr-head">${icon('history', 14)} <b>گام‌های اعمال‌شده</b>
          <span class="badge badge-neutral">${Utils.faDig(steps.length)}</span></div>
        <p class="small text-muted sr-hint">شبیه Power Query: برای اصلاح یک اشتباه، روی گام مربوطه کلیک کنید؛ گام‌های بعد از آن حذف و تغییرات از همان‌جا اعمال می‌شود. برای حذف یک گام، آن را انتخاب و کلید ⌫ (Backspace) را بزنید یا از دکمه سطل زباله استفاده کنید.</p>
        <ol class="sr-list">
          ${steps.map((s, i) => {
            const cls = ['sr-step'];
            if (i === active) cls.push('is-active');
            else if (i < active) cls.push('is-past');
            else if (i > active) cls.push('is-future');
            return `<li class="${cls.join(' ')}" data-step-idx="${i}" tabindex="0" title="${esc(s.summary || s.title)} — ${esc(new Date(s.at).toLocaleString('fa-IR'))}">
              <span class="sr-line" aria-hidden="true"></span>
              <span class="sr-ico">${i === 0 ? icon('database', 12) : icon('check', 11)}</span>
              <span class="sr-body">
                <span class="sr-title">${esc(s.title)}</span>
                <span class="sr-meta">${Utils.fmtInt(s.rows)} ردیف${s.changes ? ' • ' + Utils.fmtInt(s.changes) + ' تغییر' : ''}</span>
              </span>
              ${i === 0 ? '' : `<button class="icon-btn btn-sm-icon sr-del" data-step-del="${i}" title="حذف این گام و گام‌های بعدی (Remove Step)">${icon('trash', 11)}</button>`}
            </li>`;
          }).join('')}
        </ol>
        ${isMid ? `<div class="banner banner-warning sr-mid-note">${icon('alert')}<div>شما در میانه مسیر هستید (گام ${Utils.faDig(active + 1)} از ${Utils.faDig(steps.length)}). اعمال عملیات جدید، گام‌های بعدی را حذف می‌کند.</div></div>` : ''}
        <div class="sr-foot small text-muted">${icon('info', 11)} واگرد/اجرای مجدد سریع هم از دکمه‌های سربرگ (Ctrl+Z / Ctrl+Y) در دسترس است.</div>`;

      rail.querySelectorAll('.sr-step').forEach(li => {
        li.addEventListener('click', (e) => {
          if (e.target.closest('[data-step-del]')) return;
          const idx = +li.dataset.stepIdx;
          const stepsNow = dataCleaner.stepsList();
          const activeNow = dataCleaner.activeStepIndex();
          if (idx === activeNow) return;
          const removed = stepsNow.length - idx - 1;
          const doJump = () => {
            const r = dataCleaner.jumpToStep(idx);
            if (!r.ok) { UIKit.toast('error', 'پرش ناموفق', r.error); return; }
            if (r.unchanged) return;
            UI.showView('clean');
            UIKit.toast('success', 'به گام منتقل شدید', r.removed ? `${Utils.fmtInt(r.removed)} گام بعدی حذف شد؛ از «${r.title}» ادامه دهید.` : `داده به وضعیت «${r.title}» بازگشت.`);
          };
          if (removed > 0) {
            UIKit.confirmBox({
              title: 'بازگشت به گام قبلی',
              message: `با رفتن به گام «<b>${esc(stepsNow[idx].title)}</b>»، ${Utils.fmtInt(removed)} گام بعدی حذف می‌شود (مثل Power Query) و می‌توانید از همین نقطه مسیر را دوباره بسازید. ادامه می‌دهید؟`,
              confirmText: 'بله، به این گام برو',
              onConfirm: doJump
            });
          } else doJump();
        });
      });
      rail.querySelectorAll('[data-step-del]').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = +b.dataset.stepDel;
        const stepsNow = dataCleaner.stepsList();
        UIKit.confirmBox({
          title: 'حذف گام',
          message: `گام «<b>${esc(stepsNow[idx].title)}</b>» و گام‌های بعد از آن حذف می‌شوند و داده به وضعیت گام قبلی برمی‌گردد. ادامه؟`,
          danger: true, confirmText: 'حذف گام',
          onConfirm: () => {
            const r = dataCleaner.deleteStep(idx);
            if (!r.ok) { UIKit.toast('error', 'حذف ناموفق', r.error); return; }
            UI.showView('clean');
            UIKit.toast('success', 'گام حذف شد', `${Utils.fmtInt(r.removed)} گام حذف و داده به وضعیت قبل از آن بازگشت.`);
          }
        });
      }));
      /* حذف گام با کلید Backspace روی گام انتخاب‌شده (طبق راهنمای rail — نسخه ۲٫۴) */
      rail.querySelectorAll('.sr-step').forEach(li => li.addEventListener('keydown', (e) => {
        if (e.key !== 'Backspace') return;
        const idx = +li.dataset.stepIdx;
        if (idx <= 0) return;   /* گام پایه قابل حذف نیست */
        e.preventDefault();
        const del = li.querySelector('[data-step-del]');
        if (del) del.click();
      }));
    }

    /* ---------- کارت‌های عملیات پاک‌سازی ---------- */
    function renderOps() {
      const area = el.querySelector('#ops-area');
      const ops = dataCleaner.listOps();
      area.innerHTML = `<div class="panel-sub clean-inner-panel">
        <div class="panel-sub-title">${icon('settings', 15)} عملیات پاک‌سازی <span class="hint">عملیات پیشنهادی بر اساس مشکلات شناسایی‌شده علامت‌گذاری شده‌اند — برای هر عملیات: پیکربندی ← پیش‌نمایش ← (ویرایش دستی موردی سلول‌ها) ← اعمال</span></div>
        <div id="ops-list">${ops.map(op => opCard(op)).join('')}</div>
      </div>`;

      ops.forEach(op => {
        const card = area.querySelector(`[data-op="${op.id}"]`);
        if (!card) return;
        const chk = card.querySelector('.oc-check input');
        chk.addEventListener('change', () => card.classList.toggle('checked', chk.checked));
        const pbtn = card.querySelector('.btn-preview');
        const abtn = card.querySelector('.btn-apply');
        const cfgBox = card.querySelector('.op-config');
        buildConfigUI(op.id, cfgBox);
        pbtn.addEventListener('click', () => {
          const params = readConfig(op.id, cfgBox);
          const res = dataCleaner.previewOp(op.id, params);
          const out = card.querySelector('.preview-out');
          card._customCells = null;   /* هدف‌گذاری جدید */
          card._manualEdits = null;   /* ویرایش‌های دستی موردی جدید */
          card._targetRows = null;
          if (!res.ok) { out.innerHTML = UIKit.banner('danger', 'خطا در پیش‌نمایش', esc(res.error)); abtn.disabled = true; return; }
          if (op.id === 'fixTypos') {
            renderTypoMappingEditor(op, cfgBox, res);
            if (!res.affected) {
              out.innerHTML = UIKit.banner('success', 'غلط املایی یافت نشد', 'با این حساسیت، هیچ مقدار مشابه مشکوکی برای اصلاح یافت نشد.');
              abtn.disabled = true;
              return;
            }
            out.innerHTML = UIKit.banner('warning', `${Utils.fmtInt(res.affected)} سلول اصلاح می‌شود — نگاشت زیر را بازبینی و در صورت نیاز ویرایش کنید`, diffTable(res.diffs));
            renderPerCellEditor(out, res, card);
            abtn.disabled = false;
            return;
          }
          if (!res.affected && !(res.manualAffected > 0)) {
            out.innerHTML = UIKit.banner('success', 'تغییری لازم نیست', 'با تنظیمات فعلی، هیچ سلولی به‌صورت خودکار تغییر نمی‌کند. اگر می‌خواهید سلول‌های مشخصی را دستی اصلاح کنید، از «ویرایش دستی موردی سلول‌ها» زیر استفاده کنید (سطر دلخواه + ستون + مقدار).');
            renderPerCellEditor(out, res, card, { abtn });
            return;
          }
          out.innerHTML = UIKit.banner('warning', `${Utils.fmtInt(res.affected)} سلول/ردیف تحت تأثیر قرار می‌گیرد`, diffTable(res.diffs) + (res.note ? `<div class="op-note mt-1">${esc(res.note)}</div>` : '') + (res.errors && res.errors.length ? `<div class="banner banner-danger mt-1">${icon('alert')}<div><b>${Utils.fmtInt(res.errors.length)} سلول به‌دلیل مقدار نامعتبر نادیده گرفته می‌شود:</b><br>${res.errors.slice(0, 6).map(e => `ردیف ${Utils.faDig(e.r + 1)}، ستون «${esc(e.col)}»: ${esc(e.msg)}`).join('<br>')}${res.errors.length > 6 ? '<br>…' : ''}</div></div>` : ''));
          /* ویرایش دستی موردی سلول‌ها — برای تک‌تک عملیات‌ها (نسخه ۲٫۴) */
          renderPerCellEditor(out, res, card, { abtn });
          /* هدف‌گذاری سلول‌ها برای «مقدار دلخواه» مشترک */
          renderCellTargeter(out, res, (picked) => { card._customCells = picked; });
          /* هدف‌گذاری رکوردها برای قاعده اختصاصی */
          if (res.rowTargetable) {
            const rt = document.createElement('div');
            rt.className = 'cell-targeter';
            rt.innerHTML = `<div class="ct-head">${icon('target', 13)} <b>محدودسازی رکوردها (اختیاری)</b>
              <span class="small text-muted">شماره رکوردهای موردنظر را وارد کنید (مثل: 3،7,10-15). خالی بماند = همه رکوردها.</span>
              <input class="input" data-rows-target placeholder="مثلاً: 3,7,10-15" style="max-width:260px">`;
            out.appendChild(rt);
            rt.querySelector('[data-rows-target]').addEventListener('input', (e) => { card._targetRows = e.target.value; });
          }
          abtn.disabled = false;
        });
        abtn.addEventListener('click', () => {
          const params = readConfig(op.id, cfgBox);
          /* ویرایش‌های دستی موردی — همیشه مستقیم از DOM خوانده می‌شود (نسخه ۲٫۴) */
          const mceBox = card.querySelector('.manual-cell-editor');
          if (mceBox) {
            const edits = [];
            mceBox.querySelectorAll('[data-mce-val]').forEach(i2 => {
              if (i2.value !== '') {
                const [r, c] = i2.dataset.mceVal.split(':').map(Number);
                edits.push({ r, c, value: i2.value });
              }
            });
            if (edits.length) params.manualEdits = edits;
          } else if (card._manualEdits && card._manualEdits.length) {
            params.manualEdits = card._manualEdits;
          }
          const res = dataCleaner.applyOp(op.id, params);
          if (!res.ok) { UIKit.toast('error', 'اجرا ناموفق', res.error); return; }
          abtn.disabled = true;
          card.querySelector('.preview-out').innerHTML = UIKit.banner('success', 'عملیات اجرا شد', esc(res.summary) + `<div class="mt-1 small">ردیف‌ها: ${Utils.fmtInt(res.rowsBefore)} ← ${Utils.fmtInt(res.rowsAfter)}${res.manualApplied ? ` — ${Utils.fmtInt(res.manualApplied)} ویرایش دستی موردی` : ''}</div>`);
          renderStepsRail();
          WorkflowManager.refresh();
          UIKit.toast('success', 'عملیات اعمال شد', res.summary);
        });
      });
    }

    function opCard(op) {
      return `<div class="op-card" data-op="${op.id}">
        <div class="op-card-head">
          <label class="oc-check checkbox-row" style="padding:6px 9px;margin:0">
            <input type="checkbox" ${op.recommended ? 'checked' : ''}>
          </label>
          <div class="oc-title">${icon(op.icon || 'settings', 16)} <span>${esc(op.title)} ${op.recommended ? UIKit.badge('primary', 'پیشنهاد سیستم') : ''}
            <small>${esc(op.desc)}</small></span>
          </div>
          <div class="oc-actions flex" style="gap:7px">
            <button class="btn btn-sm btn-secondary btn-preview">${icon('eye')}پیش‌نمایش</button>
            <button class="btn btn-sm btn-primary btn-apply" disabled>${icon('check')}اعمال</button>
          </div>
        </div>
        <div class="op-card-body">
          <div class="op-config"></div>
          <div class="preview-out"></div>
        </div>
      </div>`;
    }

    /* ═════════ ویرایش دستی موردی سلول‌ها (نسخه ۲٫۴) ═════════
       برای هر سلولِ تحت تأثیر، کاربر می‌تواند مقدار مستقل وارد کند؛ سلول‌هایی
       که مقدار دستی دارند، دقیقا همان مقدار می‌گیرند (مستقل از بقیه) و بقیه
       طبق منطق خود عملیات اصلاح می‌شوند. اعتبارسنجی نوع ستون اعمال می‌شود. */
    function renderPerCellEditor(container, res, card, opts) {
      const cells = (res.affectedCells || []).slice();
      const abtn = opts && opts.abtn;
      if (!cells.length && !abtn) return;
      const work = f.work;
      const box = document.createElement('div');
      box.className = 'cell-targeter manual-cell-editor';
      box.innerHTML = `
        <div class="ct-head">${icon('edit', 13)} <b>ویرایش دستی موردی سلول‌ها (اختیاری — مستقل از هم)</b>
          <span class="small text-muted">برای هر سلول که می‌خواهید مقدار دلخواه خودتان را بگذارید، در کادر «مقدار دستی» بنویسید؛ سلول‌های بدون مقدار دستی، طبق منطق خود عملیات اصلاح می‌شوند. مقادیر نامعتبر با خطا رد می‌شوند.</span>
        </div>
        ${cells.length ? `<div class="ct-list mce-list">
          ${cells.slice(0, 200).map(c => mceRowHTML(work, c)).join('')}
          ${cells.length > 200 ? `<div class="table-meta"><span>نمایش ۲۰۰ سلول اول از ${Utils.fmtInt(cells.length)}</span></div>` : ''}
        </div>` : ''}
        <div class="mce-add-row">
          <span class="small text-muted">افزودن سلول دلخواه:</span>
          <input class="input" data-mce-add-r type="number" min="1" placeholder="شماره ردیف" style="max-width:110px">
          <select class="input" data-mce-add-c style="max-width:190px">${work.columns.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('')}</select>
          <button class="btn btn-sm btn-secondary" data-mce-add-btn>${icon('plus', 12)} افزودن</button>
        </div>`;
      container.appendChild(box);

      function mceRowHTML(w, c) {
        const colName = w.columns[c.c] ? w.columns[c.c].name : ('ستون ' + Utils.faDig(c.c + 1));
        const val = w.rows[c.r] ? w.rows[c.r][c.c] : '';
        return `<div class="mce-row" data-mce="${c.r}:${c.c}">
          <span class="ct-rc">ردیف ${Utils.faDig(c.r + 1)}</span>
          <span class="ct-col">${esc(colName)}</span>
          <span class="ct-val" title="${esc(String(val))}">${esc(String(val)) || '<span class="text-muted">(خالی)</span>'}</span>
          <span class="mce-arrow">${icon('arrowLeft', 12)}</span>
          <input class="input" data-mce-val="${c.r}:${c.c}" placeholder="مقدار دستی این سلول…">
        </div>`;
      }

      const syncEdits = () => {
        const edits = [];
        box.querySelectorAll('[data-mce-val]').forEach(inp => {
          if (inp.value !== '') {
            const [r, c] = inp.dataset.mceVal.split(':').map(Number);
            edits.push({ r, c, value: inp.value });
          }
        });
        card._manualEdits = edits.length ? edits : null;
        const cnt = box.querySelector('.mce-count');
        if (cnt) cnt.textContent = edits.length ? `${Utils.faDig(edits.length)} سلول با مقدار دستی` : 'بدون مقدار دستی';
        /* اگر کاربر ویرایش دستی دارد، دکمه اعمال حتی بدون تغییر خودکار فعال بماند */
        if (abtn && edits.length) abtn.disabled = false;
      };
      box.addEventListener('input', Utils.debounce(syncEdits, 250));
      /* افزودن سلول دلخواه (خارج از لیست سلول‌های تحت تأثیر) — نسخه ۲٫۴ */
      const addBtn = box.querySelector('[data-mce-add-btn]');
      if (addBtn) addBtn.addEventListener('click', () => {
        const rInp = box.querySelector('[data-mce-add-r]');
        const cSel = box.querySelector('[data-mce-add-c]');
        const r = parseInt(rInp.value, 10) - 1;
        const c = parseInt(cSel.value, 10);
        if (isNaN(r) || r < 0 || r >= work.rows.length) { UIKit.toast('error', 'ردیف نامعتبر', `شماره ردیف باید بین ۱ تا ${Utils.faDig(work.rows.length)} باشد.`); return; }
        if (box.querySelector(`[data-mce="${r}:${c}"]`)) { UIKit.toast('error', 'تکراری', 'این سلول قبلاً به فهرست ویرایش دستی اضافه شده است.'); return; }
        let list = box.querySelector('.mce-list');
        if (!list) {
          list = document.createElement('div');
          list.className = 'ct-list mce-list';
          box.insertBefore(list, box.querySelector('.mce-add-row'));
        }
        const rowHtml = document.createElement('div');
        rowHtml.innerHTML = mceRowHTML(work, { r, c });
        const rowEl = rowHtml.firstElementChild;
        list.appendChild(rowEl);
        syncEdits();
        rInp.value = '';
        const inp = rowEl.querySelector('[data-mce-val]');
        if (inp) inp.focus();
      });
      const counter = document.createElement('div');
      counter.className = 'mce-count-row small text-muted';
      counter.innerHTML = `<span class="mce-count">بدون مقدار دستی</span>`;
      box.appendChild(counter);
    }

    /* ---------- انتخاب‌گر سلول‌های هدف برای «مقدار دلخواه» مشترک ----------
       کاربر مشخص می‌کند جایگزینی با مقدار دلخواه دقیقاً برای کدام ردیف/سلول باشد؛
       سلول‌های خارج از انتخاب، به خالی تبدیل می‌شوند (یا دست‌نخورده می‌مانند بسته به عملیات) */
    function renderCellTargeter(container, res, onTargets) {
      const cells = res.affectedCells || [];
      if (!cells.length || !res.customTargetable) return;
      const work = f.work;
      const box = document.createElement('div');
      box.className = 'cell-targeter';
      box.innerHTML = `
        <div class="ct-head">${icon('target', 13)} <b>هدف‌گذاری سلول‌ها برای «مقدار دلخواه»</b>
          <span class="small text-muted">مشخص کنید تغییر مقدار دلخواه برای کدام رکورد و سلول اعمال شود؛ بقیه به خالی تبدیل می‌شوند.</span>
        </div>
        <div class="ct-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-ct-all>انتخاب همه (${Utils.fmtInt(cells.length)})</button>
          <button type="button" class="btn btn-sm btn-ghost" data-ct-none>هیچ‌کدام</button>
        </div>
        <div class="ct-list">
          ${cells.map(c => {
            const colName = work.columns[c.c] ? work.columns[c.c].name : ('ستون ' + Utils.faDig(c.c + 1));
            const val = work.rows[c.r] ? work.rows[c.r][c.c] : '';
            return `<label class="ct-cell"><input type="checkbox" data-ct="${c.r}:${c.c}" checked>
              <span class="ct-rc">ردیف ${Utils.faDig(c.r + 1)}</span>
              <span class="ct-col">${esc(colName)}</span>
              <span class="ct-val" title="${esc(String(val))}">${esc(String(val))}</span></label>`;
          }).join('')}
        </div>`;
      container.appendChild(box);
      const syncTargets = () => {
        const picked = [];
        box.querySelectorAll('[data-ct]').forEach(cb => { if (cb.checked) { const [r, c] = cb.dataset.ct.split(':').map(Number); picked.push({ r, c }); } });
        if (typeof onTargets === 'function') onTargets(picked);
      };
      box.addEventListener('change', syncTargets);
      box.querySelector('[data-ct-all]').addEventListener('click', () => { box.querySelectorAll('[data-ct]').forEach(cb => { cb.checked = true; }); syncTargets(); });
      box.querySelector('[data-ct-none]').addEventListener('click', () => { box.querySelectorAll('[data-ct]').forEach(cb => { cb.checked = false; }); syncTargets(); });
      syncTargets();
    }

    function diffTable(diffs) {
      if (!diffs || !diffs.length) return '<span class="text-muted">نمونه‌ای برای نمایش نیست.</span>';
      return `<div class="preview-diff"><table class="data-table"><thead><tr><th>ردیف</th><th>ستون</th><th>قبل</th><th></th><th>بعد</th></tr></thead><tbody>
        ${diffs.map(d => `<tr><td class="mono">${esc(String(d.row))}</td><td>${esc(d.col)}</td><td class="mono">${esc(String(d.before))}</td><td class="text-muted">${icon('arrowLeft', 13)}</td><td class="mono text-success">${esc(String(d.after))}</td></tr>`).join('')}
      </tbody></table></div>
      ${diffs.length >= 10 ? '<div class="table-meta"><span>نمایش ۱۰ تغییر اول</span></div>' : ''}`;
    }

    /* ---------- ویرایشگر نگاشت غلط املایی ---------- */
    function renderTypoMappingEditor(op, cfgBox, res) {
      const box = cfgBox.querySelector('[data-typo-mapping]');
      const note = cfgBox.querySelector('[data-typo-note]');
      if (!box) return;
      if (!res.mapping || !Object.keys(res.mapping).length) {
        if (note) note.textContent = 'نگاشتی برای اصلاح یافت نشد.';
        box.innerHTML = '';
        UI.U.typoMapping = null;
        return;
      }
      if (note) note.textContent = 'شکل صحیح پیشنهادی (پرتکرارترین مقدار هر گروه) قابل ویرایش است؛ تغییر هر خانه در اجرا اعمال می‌شود.';
      box.innerHTML = Object.keys(res.mapping).map(colName => `
        <div class="mb-2"><b class="small">${esc(colName)}:</b>
        ${Object.entries(res.mapping[colName]).map(([variant, canonical]) => `
          <div class="map-row mt-1">
            <span class="ph-name typo-bad">${esc(variant)}</span><span class="map-arrow">${icon('arrowLeft', 14)}</span>
            <input class="input" data-typo-map="${esc(colName)}" data-variant="${esc(variant)}" value="${esc(canonical)}">
          </div>`).join('')}</div>`).join('');
      // ذخیره نگاشت ویرایش‌شده
      UI.U.typoMapping = res.mapping;
      box.querySelectorAll('[data-typo-map]').forEach(inp => {
        inp.addEventListener('input', () => {
          const col = inp.dataset.typoMap, variant = inp.dataset.variant;
          if (UI.U.typoMapping && UI.U.typoMapping[col]) UI.U.typoMapping[col][variant] = inp.value;
        });
      });
    }

    /* ---------- رابط پیکربندی هر عملیات ---------- */
    function buildConfigUI(opId, box) {
      const work = f.work;
      if (opId === 'trimText') {
        box.innerHTML = `<label class="checkbox-row checked"><input type="checkbox" checked data-c="persian"><div class="cb-text">تبدیل «همه نویسه‌های عربی» به فارسی (ي، ك، ة، أ، إ، ى، ؤ، ارقام عربی، کشیده، اعراب و…)</div></label>
          <label class="checkbox-row checked mt-1"><input type="checkbox" checked data-c="collapse"><div class="cb-text">ادغام فاصله‌های تکراری داخل متن</div></label>`;
      } else if (opId === 'unifyDates') {
        box.innerHTML = `<div class="form-row">
          <div class="field"><label>قالب هدف</label><select class="select" data-c="target"><option value="jalali" selected>شمسی یکدست (۱۴۰۳/۰۵/۱۲)</option><option value="iso">میلادی ISO</option></select></div>
          <div class="field"><label>تاریخ نامعتبر</label>
            <select class="select" data-c="invalidAction">
              <option value="empty" selected>تبدیل به خالی</option>
              <option value="custom">جایگزینی با مقدار دلخواه</option>
            </select>
            <span class="field-help">با «تبدیل به خالی»، سلول تاریخ نامعتبر خالی می‌ماند. با «مقدار دلخواه»، پس از پیش‌نمایش می‌توانید برای هر سلول مقدار مستقل وارد کنید (ویرایش دستی موردی).</span>
          </div>
          <div class="field" data-custom-wrap style="display:none"><label>مقدار دلخواه مشترک</label>
            <input class="input" data-c="invalidValue" placeholder="مثلاً: نامشخص">
          </div>
        </div>`;
        const sel = box.querySelector('[data-c="invalidAction"]');
        const wrap = box.querySelector('[data-custom-wrap]');
        const sync = () => { wrap.style.display = sel.value === 'custom' ? 'flex' : 'none'; };
        sel.addEventListener('change', sync); sync();
      } else if (opId === 'coerceTypes') {
        box.innerHTML = `<p class="op-note">برای هر ستون، نوع غالب تشخیص داده می‌شود؛ مقادیر ناسازگار در صورت امکان به نوع درست تبدیل می‌شوند. برای مقادیر غیرقابل تبدیل، روش را انتخاب کنید:</p>
          <div class="form-row">
            <div class="field"><label>مقادیر غیرقابل تبدیل</label>
              <select class="select" data-c="fillAction">
                <option value="empty" selected>تبدیل به خالی</option>
                <option value="custom">جایگزینی با مقدار دلخواه</option>
              </select>
              <span class="field-help">با «مقدار دلخواه» پس از پیش‌نمایش، برای هر سلول می‌توانید مقدار مستقل وارد کنید (ویرایش دستی موردی).</span>
            </div>
            <div class="field" data-custom-wrap style="display:none"><label>مقدار دلخواه مشترک</label>
              <input class="input" data-c="fillValue" placeholder="مثلاً: 0 یا نامشخص">
            </div>
          </div>`;
        const sel = box.querySelector('[data-c="fillAction"]');
        const wrap = box.querySelector('[data-custom-wrap]');
        const sync = () => { wrap.style.display = sel.value === 'custom' ? 'flex' : 'none'; };
        sel.addEventListener('change', sync); sync();
      } else if (opId === 'standardizeIdentifiers') {
        const cands = dataCleaner.identifierCandidates();
        if (!cands.length) { box.innerHTML = '<p class="op-note">ستونی با مقادیر موبایل/کارت/کد ملی شناسایی نشد. (برای دقت بیشتر، ابتدا عملیات «حذف فاصله‌ها» را اجرا کنید.)</p>'; return; }
        box.innerHTML = `<p class="op-note">ستون‌های شناسه ایرانی تشخیص داده شدند. قالب مقادیر خودکار اصلاح می‌شود (+۹۸←۰، افزودن صفر ابتدای کد ملی، قالب ۴رقمی کارت) و اعتبارسنجی رسمی انجام می‌گیرد:</p>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>ستون</th><th>نوع شناسه</th><th>منطبق</th><th>قابل اصلاح</th><th>نامعتبر</th><th>مقادیر نامعتبر</th></tr></thead><tbody>
          ${cands.map(c => `<tr>
            <td>${esc(c.colName)}</td><td>${esc(c.kindFa)}</td><td>${Utils.fmtInt(c.matched)}</td><td>${Utils.fmtInt(c.fixable)}</td><td>${Utils.fmtInt(c.invalid)}</td>
            <td><select class="select" data-idn-col="${esc(c.colName)}" data-idn-kind="${c.kind}">
              <option value="keep" selected>رها کردن (فقط علامت‌گذاری)</option>
              <option value="empty">تبدیل به خالی</option>
              <option value="custom">جایگزینی با مقدار دلخواه</option>
            </select></td>
          </tr>`).join('')}
          </tbody></table></div>
          <div class="field mt-1" data-custom-wrap style="display:none"><label>مقدار دلخواه مشترک برای مقادیر نامعتبر</label>
            <input class="input" data-c="invalidValue" placeholder="مثلاً: نامعتبر">
            <span class="field-help">پس از پیش‌نمایش، می‌توانید برای هر شماره اشتباه، مقدار مستقل و دلخواه خود را در بخش «ویرایش دستی موردی سلول‌ها» وارد کنید.</span>
          </div>`;
        const sel = box.querySelector('[data-idn-col]');
        const wrap = box.querySelector('[data-custom-wrap]');
        if (sel && wrap) {
          const sync = () => { wrap.style.display = Array.from(box.querySelectorAll('[data-idn-col]')).some(s => s.value === 'custom') ? 'flex' : 'none'; };
          box.querySelectorAll('[data-idn-col]').forEach(s => s.addEventListener('change', sync));
          sync();
        }
      } else if (opId === 'unifyCategories') {
        const mapping = dataCleaner.categoryMappings();
        const keys = Object.keys(mapping);
        if (!keys.length) { box.innerHTML = '<p class="op-note">نگاشتی برای یکسان‌سازی یافت نشد (یا این عملیات قبلاً اجرا شده است).</p>'; return; }
        box.innerHTML = keys.map(colName => `
          <div class="mb-2"><b class="small">${esc(colName)}:</b>
          ${Object.entries(mapping[colName]).map(([variant, canonical]) => `
            <div class="map-row mt-1">
              <span class="ph-name">${esc(variant)}</span><span class="map-arrow">${icon('arrowLeft', 14)}</span>
              <input class="input" data-map="${esc(colName)}" data-variant="${esc(variant)}" value="${esc(canonical)}">
            </div>`).join('')}</div>`).join('');
      } else if (opId === 'fixNumericRange') {
        const cands = dataCleaner.rangeCandidates();
        if (!cands.length) { box.innerHTML = '<p class="op-note">ستون مبلغ/تعدادی با مقدار منفی یافت نشد.</p>'; return; }
        box.innerHTML = cands.map(c => `<div class="form-row">
          <div class="field"><label>${esc(c.colName)} (${Utils.fmtInt(c.negatives)} مقدار منفی)</label>
            <select class="select" data-col="${esc(c.colName)}">
              <option value="empty" selected>تبدیل به خالی</option>
              <option value="custom">جایگزینی با مقدار دلخواه</option>
              <option value="dropRow">حذف کل ردیف</option>
            </select>
            <span class="field-help">با «مقدار دلخواه» پس از پیش‌نمایش، برای هر سلول می‌توانید مقدار مستقل وارد کنید (ویرایش دستی موردی).</span>
          </div>
          <div class="field" data-custom-wrap style="display:none"><label>مقدار دلخواه مشترک برای ${esc(c.colName)}</label>
            <input class="input" data-custom-value="${esc(c.colName)}" placeholder="مثلاً: 0">
          </div>
        </div>`).join('');
        box.querySelectorAll('select[data-col]').forEach(sel => {
          const wrap = sel.closest('.form-row').querySelector('[data-custom-wrap]');
          sel.addEventListener('change', () => { wrap.style.display = sel.value === 'custom' ? 'flex' : 'none'; });
        });
      } else if (opId === 'fillMissing') {
        const cands = dataCleaner.fillCandidates();
        if (!cands.length) { box.innerHTML = '<p class="op-note">سلول خالی‌ای باقی نمانده است.</p>'; return; }
        box.innerHTML = `<p class="op-note">برای هر ستون روش اصلاح را انتخاب کنید. پیش‌فرض «رها کردن» است — هیچ مقداری بدون انتخاب شما پر نمی‌شود.</p>
          <div class="table-wrap" style="max-height:340px"><table class="data-table"><thead><tr><th>ستون</th><th>نوع</th><th>گمشده</th><th>روش</th><th>مقدار دلخواه</th></tr></thead><tbody>
          ${cands.map(c => `<tr>
            <td>${esc(c.colName)}</td><td>${c.type}</td><td>${Utils.fmtInt(c.missing)}</td>
            <td><select class="select" data-fill-col="${esc(c.colName)}" style="min-width:150px">
              <option value="leave" ${c.suggested.method === 'leave' ? 'selected' : ''}>رها کردن</option>
              <option value="median" ${c.suggested.method === 'median' ? 'selected' : ''}>میانه</option>
              <option value="mean" ${c.suggested.method === 'mean' ? 'selected' : ''}>میانگین</option>
              <option value="mode" ${c.suggested.method === 'mode' ? 'selected' : ''}>مقدار پرتکرار</option>
              <option value="custom">مقدار دلخواه</option>
              <option value="dropRow">حذف ردیف‌های دارای خالی</option>
            </select></td>
            <td><input class="input" data-fill-custom="${esc(c.colName)}" style="min-width:110px" placeholder="—"></td>
          </tr>`).join('')}
          </tbody></table></div>`;
      } else if (opId === 'removeSparseRows') {
        box.innerHTML = `<div class="form-row"><div class="field"><label>آستانه خالی‌بودن ردیف (نسبت سلول‌های خالی)</label>
          <select class="select" data-c="threshold"><option value="0.6" selected>۶۰٪ و بیشتر</option><option value="0.5">۵۰٪ و بیشتر</option><option value="0.8">۸۰٪ و بیشتر</option></select></div></div>`;
      } else if (opId === 'markInvalid') {
        box.innerHTML = `<div class="form-row">
          <label class="checkbox-row"><input type="checkbox" checked data-c="markCross"><div class="cb-text">علامت‌گذاری نقض‌کنندگان قواعد منطقی</div></label>
          <label class="checkbox-row"><input type="checkbox" checked data-c="markSparse"><div class="cb-text">علامت‌گذاری رکوردهای ناقص</div></label>
          <div class="field"><label>نام ستون وضعیت</label><input class="input" data-c="statusCol" value="وضعیت داده"></div>
        </div>`;
      } else if (opId === 'customRule') {
        box.innerHTML = `<div class="form-row">
          <div class="field"><label>ستون هدف</label><select class="select" data-c="colName"><option value="">— همه ستون‌ها —</option>${work.columns.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>جستجو</label><input class="input" data-c="find" placeholder="متن یا الگو"></div>
          <div class="field"><label>جایگزین</label><input class="input" data-c="replace"></div>
          <div class="field"><label>محدود به رکوردها (اختیاری)</label><input class="input" data-c="targetRows" placeholder="مثل: 3,7,10-15 — خالی = همه"></div>
          <label class="checkbox-row" style="align-self:end"><input type="checkbox" data-c="regex"><div class="cb-text">عبارت باقاعده (Regex)</div></label>
        </div>`;
      } else if (opId === 'fixTypos') {
        box.innerHTML = `<div class="form-row">
          <div class="field"><label>حساسیت تشخیص غلط املایی</label>
            <select class="select" data-c="sensitivity">
              <option value="low">کم — فقط غلط‌های تک‌نویسه‌ای (مطمئن‌تر)</option>
              <option value="medium" selected>متوسط — تا دو نویسه متفاوت</option>
              <option value="high">زیاد — شامل کلمات کوتاه‌تر</option>
            </select>
            <span class="field-help">مقادیر مشابه هر ستون بر اساس فاصله ویرایشی و فراوانی مقایسه می‌شوند؛ مقدار پرتکرار به‌عنوان شکل صحیح پیشنهاد می‌شود و نگاشت پیش از اجرا قابل ویرایش است.</span>
          </div>
        </div>
        <p class="op-note" data-typo-note>پیش‌نمایش نگاشت پس از زدن «پیش‌نمایش» اینجا نمایش داده می‌شود.</p>
        <div data-typo-mapping></div>`;
        const sensSel = box.querySelector('[data-c="sensitivity"]');
        if (sensSel) sensSel.addEventListener('change', () => { UI.U.typoMapping = null; });
      }
    }

    function readConfig(opId, box) {
      const val = (sel, attr) => box.querySelector(sel) ? box.querySelector(sel).value : undefined;
      const checked = (sel) => box.querySelector(sel) ? box.querySelector(sel).checked : false;
      const card = box.closest('.op-card');
      const customCells = (card && card._customCells) ? card._customCells : null;
      const targetRowsCard = (card && card._targetRows != null && card._targetRows !== '') ? card._targetRows : null;
      if (opId === 'trimText') return { persian: checked('[data-c="persian"]'), collapse: checked('[data-c="collapse"]') };
      if (opId === 'unifyDates') return { target: val('[data-c="target"]', 'value'), invalidAction: val('[data-c="invalidAction"]', 'value') || 'empty', invalidValue: val('[data-c="invalidValue"]', 'value') || '', customCells };
      if (opId === 'coerceTypes') return { fillAction: val('[data-c="fillAction"]', 'value') || 'empty', fillValue: val('[data-c="fillValue"]', 'value') || '', customCells };
      if (opId === 'standardizeIdentifiers') {
        const columns = [];
        box.querySelectorAll('[data-idn-col]').forEach(s => {
          columns.push({ colName: s.dataset.idnCol, kind: s.dataset.idnKind, action: s.value });
        });
        return { columns, invalidAction: 'keep', invalidValue: val('[data-c="invalidValue"]', 'value') || '', customCells };
      }
      if (opId === 'unifyCategories') {
        const mapping = {};
        box.querySelectorAll('[data-map]').forEach(inp => {
          const col = inp.dataset.map, variant = inp.dataset.variant;
          mapping[col] = mapping[col] || {};
          mapping[col][variant] = inp.value;
        });
        return { mapping };
      }
      if (opId === 'fixNumericRange') {
        const columns = [];
        box.querySelectorAll('select[data-col]').forEach(s => {
          const customInput = box.querySelector(`[data-custom-value="${s.dataset.col}"]`);
          columns.push({ colName: s.dataset.col, action: s.value, value: customInput ? customInput.value : '' });
        });
        return { columns, customCells };
      }
      if (opId === 'fillMissing') {
        const columns = [];
        box.querySelectorAll('select[data-fill-col]').forEach(s => {
          const col = s.dataset.fillCol;
          const custom = box.querySelector(`[data-fill-custom="${col}"]`);
          columns.push({ colName: col, method: s.value, value: custom ? custom.value : '' });
        });
        return { columns, customCells };
      }
      if (opId === 'removeSparseRows') return { threshold: parseFloat(val('[data-c="threshold"]', 'value')) || 0.6 };
      if (opId === 'markInvalid') return { markCross: checked('[data-c="markCross"]'), markSparse: checked('[data-c="markSparse"]'), statusCol: val('[data-c="statusCol"]', 'value') || 'وضعیت داده' };
      if (opId === 'customRule') return { colName: val('[data-c="colName"]', 'value'), find: val('[data-c="find"]', 'value'), replace: val('[data-c="replace"]', 'value') || '', regex: checked('[data-c="regex"]'), allColumns: !val('[data-c="colName"]', 'value'), targetRows: (val('[data-c="targetRows"]', 'value') || targetRowsCard) };
      if (opId === 'fixTypos') {
        // نگاشت ویرایش‌شده کاربر در بخش پیش‌نمایش اولویت دارد
        const mapping = UI.U.typoMapping || null;
        return { mapping, sensitivity: val('[data-c="sensitivity"]', 'value') || 'medium' };
      }
      return {};
    }

    /* ---------- بخش تکراری‌ها ---------- */
    function renderDups() {
      const area = el.querySelector('#dup-area');
      const work = f.work;
      const exactInfo = f.profile.checks.duplicates;
      area.innerHTML = `
        <div class="form-row mb-2">
          <label class="checkbox-row"><input type="radio" name="dup-mode" value="exact" ${UI.U.dupConfig.mode === 'exact' ? 'checked' : ''}><div class="cb-text"><b>رکوردهای کاملاً یکسان</b><small>هر ${Utils.fmtInt(exactInfo.extra.exactGroups || 0)} گروه شناسایی شد در بررسی اولیه</small></div></label>
          <label class="checkbox-row"><input type="radio" name="dup-mode" value="keys" ${UI.U.dupConfig.mode === 'keys' ? 'checked' : ''}><div class="cb-text"><b>بر اساس ستون‌های کلیدی</b><small>تکرار را خودتان تعریف می‌کنید</small></div></label>
        </div>
        <div id="dup-keys" style="display:${UI.U.dupConfig.mode === 'keys' ? 'block' : 'none'}">
          <div class="field"><label>ستون‌های کلیدی (انتخاب چندگانه)</label>
            <div class="flex flex-wrap">
              ${work.columns.map((c, i) => `<label class="checkbox-row" style="padding:5px 10px"><input type="checkbox" data-keycol="${i}" ${UI.U.dupConfig.keyCols.includes(i) ? 'checked' : ''}><div class="cb-text">${esc(c.name)}</div></label>`).join('')}
            </div>
          </div>
          <div class="flex flex-wrap mb-2" style="gap:14px">
            <label class="flex" style="gap:5px"><input type="checkbox" id="dup-trim" checked> حذف فاصله در مقایسه</label>
            <label class="flex" style="gap:5px"><input type="checkbox" id="dup-persian" checked> یکسان‌سازی ي/ی و ك/ک</label>
            <label class="flex" style="gap:5px"><input type="checkbox" id="dup-case" checked> بدون حساسیت به بزرگی/کوچکی</label>
          </div>
        </div>
        <button class="btn btn-primary" id="dup-find">${icon('search')}شناسایی گروه‌های تکراری</button>
        <div id="dup-groups" class="mt-2"></div>`;

      area.querySelectorAll('input[name="dup-mode"]').forEach(r => r.addEventListener('change', () => {
        UI.U.dupConfig.mode = r.value;
        renderDups();
      }));
      area.querySelectorAll('[data-keycol]').forEach(cb => cb.addEventListener('change', () => {
        const i = +cb.dataset.keycol;
        if (cb.checked) { if (!UI.U.dupConfig.keyCols.includes(i)) UI.U.dupConfig.keyCols.push(i); }
        else UI.U.dupConfig.keyCols = UI.U.dupConfig.keyCols.filter(x => x !== i);
      }));
      area.querySelector('#dup-find').addEventListener('click', () => {
        const mode = UI.U.dupConfig.mode;
        const cfg = { mode, keyCols: UI.U.dupConfig.keyCols, norm: { trim: area.querySelector('#dup-trim').checked, persian: area.querySelector('#dup-persian').checked, caseInsensitive: area.querySelector('#dup-case').checked } };
        if (mode === 'keys' && !cfg.keyCols.length) { UIKit.toast('warning', 'ستون کلیدی انتخاب نشده', 'حداقل یک ستون برای تشخیص تکرار انتخاب کنید.'); return; }
        const res = duplicateManager.find(cfg);
        UI.U.dupFound = res;
        UI.U.dupManual = {};
        renderGroups(res);
        if (!res.totalDupes) UIKit.toast('info', 'نتیجه جستجو', 'با این تعریف، تکراری‌ای یافت نشد.');
        else UIKit.toast('success', 'گروه‌ها شناسایی شد', `${Utils.fmtInt(res.groups.length)} گروه با ${Utils.fmtInt(res.totalDupes)} رکورد تکراری.`);
      });

      if (UI.U.dupFound) renderGroups(UI.U.dupFound);
    }

    function renderGroups(res) {
      const box = el.querySelector('#dup-groups');
      if (!res || !res.groups.length) { box.innerHTML = UIKit.banner('success', '', 'تکراری‌ای با این تعریف یافت نشد.'); return; }
      const work = f.work;
      const colNames = work.columns.map(c => c.name);
      const keyCols = f.dupes.config && f.dupes.config.mode === 'keys' ? f.dupes.config.keyCols : null;
      box.innerHTML = `
        ${UIKit.banner('warning', `${Utils.fmtInt(res.groups.length)} گروه تکراری — ${Utils.fmtInt(res.totalDupes)} رکورد اضافی`, 'برای هر گروه، رکورد نگهداشته‌شده مشخص شده است. می‌توانید دستی تغییر دهید.')}
        <div class="form-row mb-2">
          <div class="field"><label>سیاست نگهداری رکورد</label>
            <select class="select" id="dup-keep">
              <option value="first">اولین رکورد گروه</option>
              <option value="last">آخرین رکورد گروه</option>
              <option value="mostComplete" selected>کامل‌ترین رکورد (کمترین مقدار خالی)</option>
            </select></div>
          <div class="field" style="align-self:end"><button class="btn btn-danger" id="dup-apply">${icon('trash')}حذف تکراری‌ها (${Utils.fmtInt(res.totalDupes)} رکورد)</button></div>
        </div>
        <div style="max-height:420px;overflow:auto">
        ${res.groups.slice(0, 30).map(g => dupGroupTable(g, colNames, keyCols)).join('')}
        ${res.groups.length > 30 ? `<div class="table-meta"><span>نمایش ۳۰ گروه از ${Utils.fmtInt(res.groups.length)}</span></div>` : ''}
        </div>`;

      box.querySelector('#dup-keep').addEventListener('change', (e) => { UI.U.dupKeep = e.target.value; });
      box.querySelectorAll('[data-keep]').forEach(r => r.addEventListener('change', () => { UI.U.dupManual[r.dataset.group] = +r.dataset.keep; }));
      box.querySelector('#dup-apply').addEventListener('click', () => {
        UIKit.confirmBox({
          title: 'حذف رکوردهای تکراری',
          message: `${Utils.fmtInt(res.totalDupes)} رکورد از ${Utils.fmtInt(res.groups.length)} گروه حذف می‌شود و فقط رکورد انتخابی هر گروه می‌ماند. این عملیات قابل واگرد است و به‌عنوان یک گام در «گام‌های اعمال‌شده» ثبت می‌شود.`,
          danger: true, confirmText: 'حذف تکراری‌ها',
          onConfirm: () => {
            const r2 = duplicateManager.apply(UI.U.dupKeep, UI.U.dupManual);
            if (!r2.ok) { UIKit.toast('error', 'حذف ناموفق', r2.error); return; }
            UI.U.dupFound = null;
            renderDups();
            renderStepsRail();
            UIKit.toast('success', 'تکراری‌ها حذف شد', `ردیف‌ها: ${Utils.fmtInt(r2.rowsBefore)} ← ${Utils.fmtInt(r2.rowsAfter)}`);
            WorkflowManager.refresh();
          }
        });
      });
    }

    function dupGroupTable(g, colNames, keyCols) {
      const cols = keyCols || colNames.map((_, i) => i);
      const showNames = keyCols ? cols.map(i => colNames[i]) : colNames.slice(0, 6);
      const showIdx = keyCols ? cols : colNames.map((_, i) => i).slice(0, 6);
      return `<div class="dup-group">
        <div class="dup-group-head"><b>گروه ${Utils.faDig(g.id)}</b><span class="badge badge-warning">${Utils.fmtInt(g.rowIdxs.length)} رکورد</span><span class="text-muted small">ردیف‌ها: ${g.rowIdxs.map(r => Utils.fmtInt(r + 1)).join('، ')}</span></div>
        <table><thead><tr><th>نگهداری</th>${showNames.map(n => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>
          ${g.rows.map(rw => `<tr class="${g.keep === rw.ri ? 'keeper-row' : ''}">
            <td><label class="flex" style="gap:4px;font-size:11.5px"><input type="radio" name="dupkeep-${g.id}" data-keep="${rw.ri}" data-group="${g.id}" ${g.keep === rw.ri ? 'checked' : ''}>ردیف ${Utils.fmtInt(rw.ri + 1)}</label></td>
            ${showIdx.map(ci => `<td class="mono" title="${esc(String(rw.row[ci]))}">${esc(String(rw.row[ci]).slice(0, 26))}</td>`).join('')}
          </tr>`).join('')}
        </tbody></table>
      </div>`;
    }
  });
})();
