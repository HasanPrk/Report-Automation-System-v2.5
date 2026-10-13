/* ═══════════════════════════════════════════════════════════
   نماهای مرحله ۷ (تولید گزارش)، ۸ (پیش‌نمایش)، ۹ (خروجی) و تاریخچه
   شامل: برچسب، زبان، لوگو، پالت رنگی، پرامپت سفارشی، تفکیک بخش‌ها،
   تنظیمات صفحه و شکست صفحه drag & drop، خروجی چندفرمته و خروجی‌های جانبی
   ═══════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { icon, esc } = Utils;

  /* ═════════ برچسب گزارش ═════════
     نسخه ۲٫۴: گزینه‌های متن ساده «تهیه‌کننده» و «نام سازمان» — مقدار از مشخصات
     گزارش برداشته و بدون رنگ/کادر روی کاغذ رندر می‌شود */
  const LABELS = [
    { id: 'none', label: 'بدون برچسب', cls: 'neutral' },
    { id: 'prepared', label: 'تهیه‌کننده (متن ساده)', cls: 'neutral' },
    { id: 'org', label: 'نام سازمان (متن ساده)', cls: 'neutral' },
    { id: 'public', label: 'عمومی', cls: 'success' },
    { id: 'internal', label: 'داخلی', cls: 'info' },
    { id: 'confidential', label: 'محرمانه', cls: 'danger' },
    { id: 'custom', label: 'موضوع دلخواه…', cls: 'warning' }
  ];

  /* ═════════ پالت‌های پیش‌فرض ═════════ */
  const PALETTES = chartBuilder.PALETTES;

  /* ═════════ مرحله ۷: تولید گزارش ═════════ */
  UI.registerView('ai', function (el) {
    const f = Store.state.flow;
    if (!f.calc.ranAt) { el.innerHTML = UIKit.emptyState('calc', 'محاسبات اجرا نشده است', 'برای تولید گزارش، ابتدا محاسبات را اجرا کنید.', `<button class="btn btn-primary" onclick="WorkflowManager.goto('calc')">رفتن به محاسبات</button>`); return; }
    const aiInfo = aiService.info();
    const meta = f.report.meta || {};
    /* نسخه ۲٫۴: در حالت AI خاموش، اسکلت بخش‌ها فوراً ساخته می‌شود تا نگارش
       دستی و ویرایش از همان لحظه فعال باشد (بدون نیاز به تولید هوش مصنوعی) */
    if (aiService.isAiOff()) aiService.ensureManualDraft();

    el.innerHTML = `
      <div class="panel">
        ${UI.viewHead('مرحله ۷ — تولید گزارش با هوش مصنوعی', 'sparkles', aiInfo.providerName)}
        <div class="ai-status-note banner-${aiInfo.mode === 'live' ? 'success' : aiInfo.mode === 'manual' ? 'neutral' : 'info'}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border);margin-bottom:10px;font-size:12.4px">
          ${aiInfo.mode === 'live' ? icon('zap', 14) : aiInfo.mode === 'manual' ? icon('lock', 14) : icon('sparkles', 14)}
          <span><b>${esc(aiInfo.providerName)}</b> — ${esc(aiInfo.note)} برای تغییر، روی نشان وضعیت AI در سربرگ کلیک کنید.</span>
        </div>

        <div class="grid-2">
          <div>
            <h3 class="mb-1" style="font-size:14px;font-weight:700">مشخصات گزارش</h3>
            <div class="form-row">
              <div class="field"><label>عنوان گزارش *</label><input class="input" id="rm-title" value="${esc(meta.title || 'گزارش عملکرد فروش')}"></div>
              <div class="field"><label>نام سازمان</label><input class="input" id="rm-org" placeholder="اختیاری" value="${esc(meta.org || '')}"></div>
              <div class="field"><label>دوره گزارش</label><input class="input" id="rm-period" placeholder="مثلاً: سال ۱۴۰۳" value="${esc(meta.period || '')}"></div>
              <div class="field"><label>تهیه‌کننده</label><input class="input" id="rm-prep" placeholder="اختیاری" value="${esc(meta.preparedBy || '')}"></div>
            </div>
            <div class="form-row">
              <div class="field"><label>برچسب گزارش</label>
                <select class="select" id="rm-label">
                  ${LABELS.map(l => `<option value="${l.id}" ${(f.report.label || 'none') === l.id ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}
                </select>
              </div>
              <div class="field" id="rm-label-custom-wrap" style="display:${f.report.label === 'custom' ? 'block' : 'none'}">
                <label>موضوع برچسب دلخواه</label><input class="input" id="rm-label-custom" value="${esc(f.report.customLabel || '')}" placeholder="مثلاً: ویژه هیئت‌مدیره">
              </div>
              <div class="field"><label>زبان گزارش (متن تولیدی AI)</label>
                <select class="select" id="rm-lang">
                  <option value="fa" ${f.report.lang === 'fa' ? 'selected' : ''}>فارسی</option>
                  <option value="en" ${f.report.lang === 'en' ? 'selected' : ''}>English</option>
                </select>
              </div>
            </div>
            <div class="flex mt-2" style="gap:10px;flex-wrap:wrap">
              <button class="btn btn-primary btn-lg" id="gen-report" ${aiService.isAiOff() ? 'disabled title="هوش مصنوعی خاموش است"' : ''}>${icon('zap')}${f.ai.generated ? 'بازتولید کل گزارش' : 'تولید گزارش'} (${Utils.faDig(templateStructureTextCount())} بخش متنی)</button>
              <button class="btn btn-secondary btn-lg" id="gen-default-prompt" ${aiService.isAiOff() ? 'disabled' : ''} title="تولید با پرامپت پیش‌فرض سیستم">${icon('sparkles')}تولید با پرامپت پیش‌فرض</button>
            </div>
            <div id="gen-progress" class="mt-2"></div>
          </div>

          <div>
            ${aiService.isAiOff() ? `
            <div class="banner banner-neutral" style="margin-bottom:10px">${icon('lock')}<div><b>هوش مصنوعی خاموش است — تولید گزارش دستی فعال است.</b> گزینه‌های تولید با AI غیرفعال شده‌اند؛ در بخش «اجزای گزارش» پایین صفحه، متن هر بخش را بنویسید، ویرایش کنید و ترتیب‌بندی کنید. ساختار بخش‌ها از قالب انتخابی ساخته شده است.</div></div>
            <div class="flex" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
              <button class="btn btn-secondary btn-sm" id="btn-manual-rebuild">${icon('refresh')}بازسازی ساختار بخش‌های دستی از قالب</button>
            </div>` : `
            <div class="field"><label>پرامپت سفارشی شما برای شخصی‌سازی متن گزارش</label>
              <textarea class="textarea" id="rm-prompt" style="min-height:96px" placeholder="مثلاً: لحن رسمی اداری، گزارش کوتاه، تمرکز بر رشد فروش شهر تهران">${esc(f.ai.customPrompt || '')}</textarea>
              <span class="field-help">${aiService.isLive() ? 'این پرامپت عیناً همراه داده‌ها به مدل ارسال می‌شود.' : 'در حالت نمایشی، جهت‌دهی‌های ساده (لحن، طول، تمرکز) از این متن شناسایی و اعمال می‌شود و محتوای آن در پیش‌نمایش داده ارسالی شفاف است.'}</span>
            </div>
            <div class="flex" style="gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm btn-ghost" id="btn-default-prompt">${icon('refresh')}درج پرامپت پیش‌فرض سیستم</button>
              <button class="btn btn-sm btn-ghost" id="btn-clear-prompt">${icon('x')}پاک‌کردن پرامپت</button>
            </div>`}

            <div class="divider"></div>
            <h3 class="mb-1" style="font-size:14px;font-weight:700">${icon('eye')} هویت بصری گزارش</h3>
            <div class="form-row">
              <div class="field">
                <label>لوگوی سازمان (PNG، JPG، WebP، SVG — حداکثر ۲ مگابایت)</label>
                <div class="upload-box" id="logo-upload-box" tabindex="0" role="button" aria-label="انتخاب فایل لوگو">
                  <span class="ub-icon">${icon('upload', 18)}</span>
                  <span class="ub-text"><b>انتخاب فایل لوگو</b><small>فایل را اینجا رها کنید یا کلیک کنید</small></span>
                  <input type="file" id="brand-logo" accept=".png,.jpg,.jpeg,.webp,.svg">
                </div>
              </div>
              <div class="field"><label>وضعیت لوگو</label>
                <div class="flex" style="gap:8px;align-items:center">
                  <span id="logo-preview" class="logo-preview">${f.report.branding.logo ? `<img src="${f.report.branding.logo}" alt="لوگو">` : '<small class="text-muted">بارگذاری نشده</small>'}</span>
                  ${f.report.branding.logo ? `<button class="btn btn-sm btn-ghost" id="logo-remove" style="color:var(--danger)">${icon('trash')}حذف لوگو</button>` : ''}
                </div>
              </div>
            </div>
            <div class="field"><label>پالت رنگی گزارش</label>
              <div class="palette-row" id="palette-row">
                ${Object.entries(PALETTES).map(([id, p]) => `
                  <button class="palette-chip ${f.report.branding.paletteId === id ? 'selected' : ''}" data-pal="${id}" title="${esc(p.name)}">
                    <span class="pc-name">${esc(p.name)}</span>
                    <span class="pc-swatches">${p.colors.slice(0, 6).map(c => `<i style="background:${c}"></i>`).join('')}</span>
                  </button>`).join('')}
              </div>
              <div class="form-row mt-1">
                <div class="field">
                  <label>پالت سفارشی (JSON یا فایل متنی کدهای رنگ)</label>
                  <div class="upload-box upload-box-compact" id="pal-upload-box" tabindex="0" role="button" aria-label="انتخاب فایل پالت رنگی">
                    <span class="ub-icon">${icon('palette', 16)}</span>
                    <span class="ub-text"><b>انتخاب فایل پالت</b><small>.json / .txt / .csv</small></span>
                    <input type="file" id="pal-upload" accept=".json,.txt,.csv">
                  </div>
                </div>
                <div class="field"><label>افزودن رنگ دلخواه</label>
                  <div class="flex" style="gap:6px">
                    <input type="color" id="pal-pick" value="#2f6fed" style="width:46px;height:38px;padding:2px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface)">
                    <button class="btn btn-secondary" id="pal-add">${icon('plus')}افزودن</button>
                  </div>
                </div>
              </div>
              <div class="flex flex-wrap" id="custom-colors">${(f.report.branding.customColors || []).map((c, i) => `<span class="cc-chip" title="${esc(c)}"><i style="background:${esc(c)}"></i>${esc(c)}<button data-cc-del="${i}">${icon('x', 11)}</button></span>`).join('') || '<small class="text-muted">پالت سفارشی خالی است — رنگ دلخواه اضافه کنید یا فایل پالت بارگذاری کنید.</small>'}</div>
            </div>
          </div>
        </div>
      </div>

      <div id="sections-area"></div>`;

    /* ---------- رویدادها ---------- */
    const labelSel = el.querySelector('#rm-label');
    labelSel.addEventListener('change', () => {
      f.report.label = labelSel.value;
      el.querySelector('#rm-label-custom-wrap').style.display = labelSel.value === 'custom' ? 'block' : 'none';
    });

    el.querySelector('#rm-lang').addEventListener('change', (e) => {
      f.report.lang = e.target.value;
      UIKit.toast('info', 'زبان گزارش تغییر کرد', e.target.value === 'en' ? 'متن تولیدی و قالب گزارش انگلیسی خواهد بود.' : 'متن تولیدی و قالب گزارش فارسی خواهد بود.');
    });

    /* کادر پرامپت فقط در حالت نمایشی/فعال رندر می‌شود — در حالت خاموش وجود ندارد */
    const promptBox = el.querySelector('#btn-default-prompt');
    const clearBtn = el.querySelector('#btn-clear-prompt');
    if (promptBox) promptBox.addEventListener('click', () => {
      el.querySelector('#rm-prompt').value = aiService.defaultPrompt();
      f.ai.customPrompt = el.querySelector('#rm-prompt').value;
      UIKit.toast('info', 'پرامپت پیش‌فرض درج شد', 'می‌توانید آن را ویرایش کنید.');
    });
    if (clearBtn) clearBtn.addEventListener('click', () => {
      el.querySelector('#rm-prompt').value = '';
      f.ai.customPrompt = '';
    });
    const promptInput = el.querySelector('#rm-prompt');
    if (promptInput) promptInput.addEventListener('input', (e) => { f.ai.customPrompt = e.target.value; });

    /* لوگو — کادر آپلود (نسخه ۲٫۴) */
    const logoBox = el.querySelector('#logo-upload-box');
    if (logoBox) {
      const logoInput = logoBox.querySelector('#brand-logo');
      logoBox.addEventListener('click', () => logoInput.click());
      logoBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logoInput.click(); } });
      logoBox.addEventListener('dragover', (e) => { e.preventDefault(); logoBox.classList.add('dragover'); });
      logoBox.addEventListener('dragleave', () => logoBox.classList.remove('dragover'));
      logoBox.addEventListener('drop', (e) => {
        e.preventDefault(); logoBox.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
          logoInput.files = e.dataTransfer.files;
          logoInput.dispatchEvent(new Event('change'));
        }
      });
    }
    el.querySelector('#brand-logo').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name)) { UIKit.toast('error', 'فرمت نامعتبر', 'فرمت‌های مجاز: PNG، JPG، WebP، SVG'); return; }
      if (file.size > 2 * 1024 * 1024) { UIKit.toast('error', 'حجم زیاد', 'حجم لوگو باید کمتر از ۲ مگابایت باشد.'); return; }
      const rd = new FileReader();
      rd.onload = () => {
        f.report.branding.logo = rd.result;
        UI.showView('ai');
        UIKit.toast('success', 'لوگو ثبت شد', 'لوگو در سربرگ گزارش و خروجی‌ها نمایش داده می‌شود.');
      };
      rd.readAsDataURL(file);
    });
    const logoRemove = el.querySelector('#logo-remove');
    if (logoRemove) logoRemove.addEventListener('click', () => { f.report.branding.logo = ''; UI.showView('ai'); });

    /* پالت */
    el.querySelector('#palette-row').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pal]');
      if (!b) return;
      f.report.branding.paletteId = b.dataset.pal;
      f.report.branding.customColors = [];
      UI.showView('ai');
      UIKit.toast('success', 'پالت انتخاب شد', `پالت «${esc(PALETTES[b.dataset.pal].name)}» برای نمودارها و رنگ‌های گزارش اعمال می‌شود.`);
    });
    /* پالت — کادر آپلود با درگ‌اندروپ (نسخه ۲٫۴) */
    const palBox = el.querySelector('#pal-upload-box');
    if (palBox) {
      const palInput = palBox.querySelector('#pal-upload');
      palBox.addEventListener('click', () => palInput.click());
      palBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); palInput.click(); } });
      palBox.addEventListener('dragover', (e) => { e.preventDefault(); palBox.classList.add('dragover'); });
      palBox.addEventListener('dragleave', () => palBox.classList.remove('dragover'));
      palBox.addEventListener('drop', (e) => {
        e.preventDefault(); palBox.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
          try { palInput.files = e.dataTransfer.files; } catch (err) { /* ignore */ }
          palInput.dispatchEvent(new Event('change'));
        }
      });
    }
    el.querySelector('#pal-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          let colors = [];
          const text = String(rd.result);
          if (/\.json$/i.test(file.name)) {
            const j = JSON.parse(text);
            colors = (j.colors || j.palette || (Array.isArray(j) ? j : [])).filter(Boolean);
          } else {
            colors = text.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
          }
          colors = colors.map(c => String(c).trim()).filter(c => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)).slice(0, 12);
          if (colors.length < 2) throw new Error('حداقل دو رنگ معتبر در فایل یافت نشد.');
          f.report.branding.customColors = colors;
          f.report.branding.paletteId = 'custom:branding';
          UI.showView('ai');
          UIKit.toast('success', 'پالت سفارشی ثبت شد', `${Utils.fmtInt(colors.length)} رنگ از فایل خوانده شد.`);
        } catch (err) { UIKit.toast('error', 'خطا در پالت', err.message); }
      };
      rd.readAsText(file);
    });
    el.querySelector('#pal-add').addEventListener('click', () => {
      const c = el.querySelector('#pal-pick').value;
      const list = f.report.branding.customColors = f.report.branding.customColors || [];
      if (!list.includes(c)) list.push(c);
      f.report.branding.paletteId = 'custom:branding';
      UI.showView('ai');
    });
    el.querySelector('#custom-colors').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cc-del]');
      if (!b) return;
      f.report.branding.customColors.splice(+b.dataset.ccDel, 1);
      UI.showView('ai');
    });

    /* تولید گزارش */
    const saveMeta = () => {
      f.report.meta = {
        title: el.querySelector('#rm-title').value.trim() || 'گزارش مدیریتی',
        org: el.querySelector('#rm-org').value.trim(),
        period: el.querySelector('#rm-period').value.trim(),
        preparedBy: el.querySelector('#rm-prep').value.trim()
      };
      f.report.label = labelSel.value;
      f.report.customLabel = el.querySelector('#rm-label-custom') ? el.querySelector('#rm-label-custom').value.trim() : '';
      const promptEl = el.querySelector('#rm-prompt');
      f.ai.customPrompt = promptEl ? promptEl.value : (f.ai.customPrompt || '');
    };

    const doGenerate = async (useDefault) => {
      saveMeta();
      if (useDefault) f.ai.customPrompt = '';
      const prog = el.querySelector('#gen-progress');
      prog.innerHTML = UIKit.spinner(aiService.isLive() ? 'در حال فراخوانی مدل زبانی… (هر بخش جداگانه تولید می‌شود)' : 'در حال تولید متن گزارش…');
      try {
        const gen = await aiService.generate((i, n, title) => {
          prog.innerHTML = `<div class="progress-bar-row"><div class="progress"><div style="width:${Math.round(((i + 1) / n) * 100)}%"></div></div><span class="progress-label">${Utils.fmtPct(((i + 1) / n) * 100, 0)}</span></div><div class="text-muted small mt-1">${esc(title)}</div>`;
        });
        prog.innerHTML = UIKit.banner('success', 'گزارش تولید شد', `${Utils.fmtInt(gen.sections.length)} بخش متنی ساخته شد. بخش‌ها را بازبینی، ویرایش یا تأیید کنید.`);
        renderSections();
        WorkflowManager.refresh();
        UIKit.toast('success', 'گزارش تولید شد', 'به بخش‌ها نگاه کنید و برای هر بخش تصمیم بگیرید.');
      } catch (err) {
        prog.innerHTML = UIKit.banner('danger', 'تولید ناموفق', esc(err.message));
      }
    };

    el.querySelector('#gen-report').addEventListener('click', () => doGenerate(false));
    const gdp = el.querySelector('#gen-default-prompt');
    if (gdp) gdp.addEventListener('click', () => doGenerate(true));

    /* بازسازی اسکلت دستی (نسخه ۲٫۴ — فقط حالت AI خاموش) */
    const rebuildBtn = el.querySelector('#btn-manual-rebuild');
    if (rebuildBtn) rebuildBtn.addEventListener('click', () => {
      UIKit.confirmBox({
        title: 'بازسازی ساختار دستی',
        message: 'بخش‌های متنی فعلی حذف و از ساختار قالب انتخابی از نو ساخته می‌شوند (متن‌های نوشته‌شده پاک می‌شوند). ادامه می‌دهید؟',
        danger: true, confirmText: 'بازسازی کن',
        onConfirm: () => {
          f.ai.generated = null;
          aiService.ensureManualDraft();
          UI.showView('ai');
          UIKit.toast('success', 'ساختار بازسازی شد', 'بخش‌های متنی از قالب ساخته شدند؛ با دکمه «ویرایش» هر بخش را بنویسید.');
        }
      });
    });

    function templateStructureTextCount() {
      const tpl = templateManager.get(f.templates.selectedId);
      return tpl ? tpl.structure.filter(s => s.type === 'text' && s.role).length : 0;
    }

    /* ---------- تفکیک بخش‌های گزارش — همیشه نمایان (پیش و پس از تولید متن) ---------- */
    if (!UI.U.asOpenSections) UI.U.asOpenSections = new Set();
    function renderSections() {
      const area = el.querySelector('#sections-area');
      const gen = f.ai.generated;
      if (!gen) {
        /* حالت خالی: ساختار بخش‌ها و ابزارهای ویرایش/ترتیب از ابتدا در دسترس است */
        const tpl = templateManager.get(f.templates.selectedId);
        const structure = tpl ? tpl.structure.filter(s => ['text', 'chart', 'table', 'kpi'].includes(s.type)) : [];
        area.innerHTML = `
          <div class="panel">
            ${UI.viewHead('اجزای گزارش — ویرایش دستی، بازتولید هوش مصنوعی و ترتیب بخش‌ها', 'edit', 'از ابتدا در دسترس است — حتی قبل از تولید متن')}
            <div class="banner banner-info">${icon('info')}<div>هنوز متنی تولید نشده است. می‌توانید با «تولید گزارش» متن بخش‌ها را بسازید، یا هوش مصنوعی را خاموش کنید و پس از اولین تولید، هر بخش را جداگانه بنویسید/ویرایش و ترتیب‌بندی کنید. ساختار فعلی قالب:</div></div>
            <div class="steps-note">
              ${structure.map(s => `<div><b>${esc(s.title)}</b> — ${esc(s.type === 'text' ? 'متن تحلیلی' : s.type === 'chart' ? 'نمودار' : s.type === 'table' ? 'جدول' : 'کارت شاخص')}</div>`).join('') || '<div>قالبی انتخاب نشده است.</div>'}
            </div>
          </div>`;
        return;
      }
      const manual = aiService.isAiOff();
      area.innerHTML = `
        <div class="panel">
          ${UI.viewHead('اجزای گزارش — ویرایش دستی، بازتولید هوش مصنوعی و ترتیب بخش‌ها', 'edit', 'هر بخش به‌صورت مستقل قابل ویرایش/بازتولید/جابه‌جایی است')}
          ${manual ? UIKit.banner('info', '', 'چون هوش مصنوعی خاموش است، متن هر بخش را در کادر بنویسید و «ذخیره» بزنید.') : ''}
          ${gen.sections.map((sec, idx) => `
            <div class="ai-section ${sec.status === 'approved' ? 'sec-approved' : ''}" data-sec="${sec.id}">
              <div class="ai-section-head">
                <span class="as-title">${esc(sec.title)}</span>
                <span class="ai-section-status">${sec.editedByUser ? 'ویرایش‌شده توسط کاربر • ' : ''}${esc(new Date(sec.generatedAt).toLocaleTimeString('fa-IR'))} • ${esc(sec.provider === 'demo' ? 'Demo AI' : sec.provider === 'user' ? 'کاربر' : sec.provider)}</span>
                ${sec.status === 'approved' ? UIKit.badge('success', 'تأییدشده') : sec.status === 'rejected' ? UIKit.badge('danger', 'ردشده') : UIKit.badge('neutral', 'پیش‌نویس')}
                <div class="as-actions">
                  ${!manual ? `<button class="btn btn-sm btn-ghost" data-act="regen" data-id="${sec.id}" title="بازتولید فقط این بخش توسط هوش مصنوعی">${icon('refresh')}بازتولید AI</button>` : ''}
                  <button class="btn btn-sm btn-secondary" data-act="edit" data-id="${sec.id}">${icon('edit')}ویرایش</button>
                  <button class="btn btn-sm btn-success" data-act="approve" data-id="${sec.id}">${icon('checkCircle')}تأیید</button>
                  <button class="btn btn-sm btn-ghost" data-act="reject" data-id="${sec.id}" style="color:var(--danger)">${icon('xCircle')}رد</button>
                  <button class="btn btn-sm btn-ghost" data-act="up" data-id="${sec.id}" title="انتقال به عقب" ${idx === 0 ? 'disabled' : ''}>${icon('arrowRight', 13)}</button>
                  <button class="btn btn-sm btn-ghost" data-act="down" data-id="${sec.id}" title="انتقال به جلو" ${idx === gen.sections.length - 1 ? 'disabled' : ''}>${icon('arrowLeft', 13)}</button>
                  <button class="btn btn-sm btn-ghost" data-act="del" data-id="${sec.id}" title="حذف بخش" style="color:var(--danger)">${icon('trash', 13)}</button>
                </div>
              </div>
              <div class="ai-section-body">
                <div class="as-text" style="display:${UI.U.asOpenSections.has(sec.id) ? 'none' : 'block'}">${esc(sec.body) || '<i class="text-muted">(خالی — برای نگارش، دکمه ویرایش را بزنید)</i>'}</div>
                <textarea class="textarea" style="display:${UI.U.asOpenSections.has(sec.id) ? 'block' : 'none'}">${esc(sec.body)}</textarea>
              </div>
            </div>`).join('')}
          <div class="divider"></div>
          <div class="form-row">
            <div class="field"><label>عنوان بخش جدید</label><input class="input" id="new-sec-title" placeholder="مثلاً: تحلیل بازار رقابتی"></div>
            <div class="field" style="align-self:end"><button class="btn btn-secondary" id="add-section">${icon('plus')}افزودن بخش دستی</button></div>
          </div>
          <div class="field"><label>افزودن یادداشت زمینه‌ای (به بخش تفسیر مدیریتی اضافه می‌شود)</label>
            <textarea class="textarea" id="ctx-note" style="min-height:70px" placeholder="مثلاً: در این ماه تعطیلات رسمی بیشتری داشتیم"></textarea>
          </div>
          <div class="flex" style="gap:10px;flex-wrap:wrap">
            <button class="btn btn-secondary" id="add-note">${icon('plus')}افزودن یادداشت</button>
            <button class="btn btn-ghost" id="clear-all-text" style="color:var(--danger)" title="پاک‌کردن متن همه بخش‌های گزارش (ساختار حفظ می‌شود)">${icon('trash', 13)}پاک‌کردن تمام متن‌های گزارش</button>
            <button class="btn btn-primary" id="go-preview">${icon('eye')}ادامه به پیش‌نمایش زنده</button>
          </div>
        </div>`;

      area.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.id, act = b.dataset.act;
        if (act === 'regen') {
          b.disabled = true;
          try { await aiService.regenerateSection(id); UI.showView('ai'); UI.U.asOpenSections.delete(id); UI.showView('ai'); UIKit.toast('success', 'بخش بازتولید شد', ''); }
          catch (err) { UIKit.toast('error', 'خطا', err.message); b.disabled = false; }
        } else if (act === 'approve') {
          aiService.setSectionStatus(id, 'approved');
          const sec = f.ai.generated.sections.find(s => s.id === id);
          const ta = b.closest('.ai-section').querySelector('textarea');
          aiService.updateSectionBody(id, ta.value);
          UI.showView('ai');
          UIKit.toast('success', 'بخش تأیید شد', '');
        } else if (act === 'reject') {
          aiService.setSectionStatus(id, 'rejected');
          UI.showView('ai');
          UIKit.toast('info', 'بخش رد شد', 'رد فقط وضعیت را علامت می‌زند؛ برای حذف کامل از دکمه حذف استفاده کنید.');
        } else if (act === 'up') { aiService.moveSection(id, -1); UI.showView('ai'); }
        else if (act === 'down') { aiService.moveSection(id, +1); UI.showView('ai'); }
        else if (act === 'del') {
          UIKit.confirmBox({ title: 'حذف بخش', message: 'این بخش از گزارش حذف شود؟ این عمل بازگشت‌پذیر نیست.', danger: true, confirmText: 'حذف', onConfirm: () => { aiService.removeSection(id); UI.showView('ai'); } });
        } else if (act === 'edit') {
          const wrap = b.closest('.ai-section');
          const ta = wrap.querySelector('textarea');
          const div = wrap.querySelector('.as-text');
          const editing = ta.style.display !== 'none';
          if (editing) {
            aiService.updateSectionBody(id, ta.value);
            div.textContent = ta.value;
            if (!ta.value.trim()) div.innerHTML = '<i class="text-muted">(خالی — برای نگارش، دکمه ویرایش را بزنید)</i>';
            ta.style.display = 'none'; div.style.display = 'block';
            UI.U.asOpenSections.delete(id);
            b.innerHTML = icon('edit') + 'ویرایش';
            UIKit.toast('success', 'ویرایش ذخیره شد', 'تغییر در پیش‌نمایش نیز اعمال می‌شود.');
          } else {
            ta.style.display = 'block'; div.style.display = 'none';
            UI.U.asOpenSections.add(id);
            b.innerHTML = icon('save') + 'ذخیره';
            ta.focus();
          }
        }
      }));

      area.querySelector('#add-section').addEventListener('click', () => {
        const title = area.querySelector('#new-sec-title').value.trim() || 'بخش جدید';
        aiService.addManualSection(title, '');
        UI.showView('ai');
        UIKit.toast('success', 'بخش اضافه شد', 'دکمه ویرایش را بزنید و متن را بنویسید.');
      });
      area.querySelector('#add-note').addEventListener('click', () => {
        const note = area.querySelector('#ctx-note').value;
        if (!note.trim()) { UIKit.toast('warning', 'یادداشت خالی است', ''); return; }
        aiService.addContextNote(note);
        area.querySelector('#ctx-note').value = '';
        UI.showView('ai');
        UIKit.toast('success', 'یادداشت اضافه شد', '');
      });
      area.querySelector('#go-preview').addEventListener('click', () => WorkflowManager.goto('preview'));

      /* نسخه ۲٫۵: پاک‌کردن متن «همه» بخش‌های گزارش با پیام اخطار (بدون حذف ساختار) */
      area.querySelector('#clear-all-text').addEventListener('click', () => {
        const gen = f.ai.generated;
        const hasAny = gen && gen.sections && gen.sections.some(s => (s.body || '').trim());
        if (!hasAny) { UIKit.toast('info', 'متنی برای پاک‌کردن وجود ندارد', 'متن همه بخش‌ها همین حالا خالی است.'); return; }
        const n = gen.sections.filter(s => (s.body || '').trim()).length;
        UIKit.confirmBox({
          title: 'پاک‌کردن تمام متن‌های گزارش',
          message: `آیا از پاک‌کردن مطمئن هستید؟ متن ${Utils.fmtInt(n)} بخش نوشته‌شده در اجزای گزارش پاک می‌شود و وضعیت همه بخش‌ها به «پیش‌نویس» بازمی‌گردد. ساختار بخش‌ها و ترتیب‌شان حفظ می‌شود؛ در صورت پشیمانی می‌توانید بلافاصله با «واگرد» (Ctrl+Z) همه متن‌ها را بازگردانید.`,
          danger: true, confirmText: 'بله، همه را پاک کن',
          onConfirm: () => {
            const r = aiService.clearAllSectionBodies();
            if (r && r.ok) {
              if (UI.U.asOpenSections) UI.U.asOpenSections.clear();
              UI.showView('ai');
              UIKit.toast('success', 'تمام متن‌ها پاک شد', `${Utils.fmtInt(r.cleared)} بخش پاک‌سازی شد. بازگرداندن با واگرد (Ctrl+Z).`);
            } else {
              UIKit.toast('info', 'متنی پاک نشد', 'همه بخش‌ها خالی بودند.');
            }
          }
        });
      });
    }

    /* رندر اولیه بخش اجزای گزارش — همیشه نمایان، حتی قبل از تولید متن */
    renderSections();
  });

  /* ═════════ مرحله ۸: پیش‌نمایش زنده ═════════ */
  const PAGE_SIZES = {
    A4: { w: 210, h: 297, label: 'A4 (۲۱۰×۲۹۷)' },
    A5: { w: 148, h: 210, label: 'A5 (۱۴۸×۲۱۰)' },
    A3: { w: 297, h: 420, label: 'A3 (۲۹۷×۴۲۰)' },
    Letter: { w: 216, h: 279, label: 'Letter (۲۱۶×۲۷۹)' },
    Legal: { w: 216, h: 356, label: 'Legal (۲۱۶×۳۵۶)' },
    custom: { w: 210, h: 297, label: 'سفارشی' }
  };

  UI.registerView('preview', function (el) {
    const f = Store.state.flow;
    if (!f.ai.generated) { el.innerHTML = UIKit.emptyState('sparkles', 'متن گزارش تولید نشده است', 'ابتدا در مرحله ۷ گزارش را تولید کنید یا بنویسید.', `<button class="btn btn-primary" onclick="WorkflowManager.goto('ai')">رفتن به تولید گزارش</button>`); return; }
    const ps = f.report.pageSetup;

    /* بدنه صفحه پیش‌نمایش فقط کاغذها — کنترل‌ها در «ریبون ثانویه» زیر ریبون اصلی رندر می‌شوند
       (طبق دستورالعمل ۴.۶-ح: ریبون ثانویه بالای ناحیه پیش‌نمایش است و هرگز روی صفحه گزارش نمی‌افتد) */
    el.innerHTML = `
      <div class="pv-break-hint ${f.report.breakEdit ? '' : 'hidden'}" id="break-hint">
        ${icon('info', 14)} حالت شکست صفحه فعال است: دستگیره «شکست» را بکشید و بین دو بخش رها کنید، یا با کلیک روی نشانگر بین بخش‌ها، شکست درج/حذف کنید. شکست‌ها در چاپ و خروجی‌ها اعمال می‌شوند.
      </div>
      <div class="paper-stage" id="paper-stage"></div>
      <div class="pv-breaks-list" id="pv-breaks-list"></div>`;

    /* ---------- ریبون ثانویه تنظیمات پیش‌نمایش ---------- */
    const ribbon = document.getElementById('sub-ribbon');
    if (!ribbon) return;
    ribbon.innerHTML = `
      <div class="srb-group">
        <span class="srb-title">${icon('fileText', 13)} کاغذ</span>
        <select class="select srb-select" id="pv-size" title="اندازه کاغذ">
          ${Object.entries(PAGE_SIZES).map(([k, v]) => `<option value="${k}" ${ps.size === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
        </select>
        <div class="srb-seg" role="group" aria-label="جهت صفحه">
          <button class="srb-seg-btn ${ps.orientation !== 'landscape' ? 'is-active' : ''}" id="pv-orient-p" title="جهت عمودی (Portrait)">${icon('fileText', 12)}عمودی</button>
          <button class="srb-seg-btn ${ps.orientation === 'landscape' ? 'is-active' : ''}" id="pv-orient-l" title="جهت افقی (Landscape)">${icon('columns', 12)}افقی</button>
        </div>
      </div>
      <div class="srb-group">
        <span class="srb-title">${icon('tag', 13)} برچسب گزارش</span>
        <select class="select srb-select" id="pv-label" title="برچسب گزارش — متن ساده کنار مشخصات گزارش">
          ${LABELS.map(l => `<option value="${l.id}" ${(f.report.label || 'none') === l.id ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}
        </select>
      </div>
      <div class="srb-group">
        <span class="srb-title">${icon('columns', 13)} حاشیه (mm)</span>
        <input type="number" class="input srb-num" id="pv-mt" value="${ps.margins.t}" min="0" max="60" step="1" title="حاشیه بالا">
        <input type="number" class="input srb-num" id="pv-mr" value="${ps.margins.r}" min="0" max="60" step="1" title="حاشیه راست">
        <input type="number" class="input srb-num" id="pv-mb" value="${ps.margins.b}" min="0" max="60" step="1" title="حاشیه پایین">
        <input type="number" class="input srb-num" id="pv-ml" value="${ps.margins.l}" min="0" max="60" step="1" title="حاشیه چپ">
        <button class="btn btn-sm btn-ghost" id="pv-margins-default" title="بازگشت به A4 استاندارد (۲۰/۱۸/۲۲/۱۸)">${icon('refresh', 12)}پیش‌فرض</button>
      </div>
      <div class="srb-group">
        <span class="srb-title">${icon('search', 13)} نمایش</span>
        <button class="icon-btn" id="z-out" title="کوچک‌نمایی">${icon('minus')}</button>
        <span class="zoom-level" id="z-level">۸۵٪</span>
        <button class="icon-btn" id="z-in" title="بزرگ‌نمایی">${icon('plus')}</button>
        <button class="btn btn-sm ${f.report.breakEdit ? 'btn-primary' : 'btn-secondary'}" id="pv-break-mode" title="درج/حذف شکست صفحه دستی">${icon('scissors', 12)}${f.report.breakEdit ? 'خروج از حالت شکست' : 'شکست صفحه'}</button>
      </div>
      <div class="srb-group">
        <span class="srb-title">${icon('download', 13)} خروجی</span>
        <button class="btn btn-sm btn-secondary" id="pv-refresh" title="بازسازی پیش‌نمایش از آخرین وضعیت">${icon('refresh', 12)}به‌روزرسانی</button>
        <button class="btn btn-sm btn-ghost" id="pv-export-html">HTML</button>
        <button class="btn btn-sm btn-ghost" id="pv-export-doc">Word</button>
        <button class="btn btn-sm btn-ghost" id="pv-export-md">MD</button>
        <button class="btn btn-sm btn-ghost" id="pv-export-copy" title="کپی متن برای چسباندن در Google Docs">${icon('copy', 12)}کپی متن</button>
        <button class="btn btn-sm btn-primary" id="pv-go-export" title="رفتن به مرحله خروجی گزارش">${icon('printer', 12)}خروجی کامل</button>
      </div>`;
    ribbon.hidden = false;

    const stage = el.querySelector('#paper-stage');
    reportRenderer.renderPreview(stage);
    updateZoomLabel();
    renderBreaksList();

    /* تنظیمات صفحه — اعمال فوری با اعتبارسنجی (کنترل‌ها در ریبون ثانویه) */
    const rb = (id) => document.getElementById(id);
    const applyPageSetup = () => {
      const size = rb('pv-size').value;
      ps.size = size;
      if (size !== 'custom') { ps.custom = { w: PAGE_SIZES[size].w, h: PAGE_SIZES[size].h }; }
      ['t', 'r', 'b', 'l'].forEach(k => {
        const inp = rb('pv-m' + k);
        let v = parseFloat(inp.value);
        if (isNaN(v) || v < 0) { v = 0; inp.value = 0; }        /* جلوگیری از مقدار منفی/نامعتبر */
        if (v > 60) { v = 60; inp.value = 60; }
        ps.margins[k] = v;
      });
      Store.savePrefs();
      reportRenderer.renderPreview(stage);
      updateZoomLabel();
    };
    const setOrientation = (o) => {
      if (ps.orientation !== o) {
        ps.orientation = o;
        Store.savePrefs();
        reportRenderer.renderPreview(stage);
        UIKit.toast('info', o === 'landscape' ? 'جهت افقی اعمال شد' : 'جهت عمودی اعمال شد',
          'ابعاد کاغذ و چاپ بر اساس جهت جدید تنظیم شد.');
      }
      rb('pv-orient-p').classList.toggle('is-active', o !== 'landscape');
      rb('pv-orient-l').classList.toggle('is-active', o === 'landscape');
    };
    rb('pv-size').addEventListener('change', () => {
      const size = rb('pv-size').value;
      if (size === 'custom') {
        const w = prompt('عرض صفحه (میلی‌متر):', ps.custom.w);
        if (!w) return;
        const h = prompt('ارتفاع صفحه (میلی‌متر):', ps.custom.h);
        if (!h) return;
        ps.custom = { w: Math.max(50, +w || 210), h: Math.max(50, +h || 297) };
      }
      applyPageSetup();
    });
    rb('pv-orient-p').addEventListener('click', () => setOrientation('portrait'));
    rb('pv-orient-l').addEventListener('click', () => setOrientation('landscape'));
    /* برچسب گزارش — منوی کشویی ساده (نسخه ۲٫۴) */
    rb('pv-label').addEventListener('change', () => {
      f.report.label = rb('pv-label').value;
      reportRenderer.renderPreview(stage);
      UIKit.toast('info', 'برچسب گزارش تغییر کرد', f.report.label === 'none' ? 'برچسب از گزارش حذف شد.' : 'برچسب به‌صورت متن ساده در سربرگ گزارش اعمال شد.');
    });
    rb('pv-mt').addEventListener('change', applyPageSetup);
    rb('pv-mr').addEventListener('change', applyPageSetup);
    rb('pv-mb').addEventListener('change', applyPageSetup);
    rb('pv-ml').addEventListener('change', applyPageSetup);
    rb('pv-margins-default').addEventListener('click', () => {
      ps.margins = { t: 20, r: 18, b: 22, l: 18 };
      ps.size = 'A4';
      ps.orientation = 'portrait';
      rb('pv-size').value = 'A4';
      rb('pv-mt').value = 20; rb('pv-mr').value = 18;
      rb('pv-mb').value = 22; rb('pv-ml').value = 18;
      rb('pv-orient-p').classList.add('is-active');
      rb('pv-orient-l').classList.remove('is-active');
      applyPageSetup();
      UIKit.toast('info', 'تنظیمات استاندارد اعمال شد', 'A4 عمودی با مارجین ۲۰/۱۸/۲۲/۱۸ میلی‌متر.');
    });

    /* شکست صفحه */
    rb('pv-break-mode').addEventListener('click', () => {
      f.report.breakEdit = !f.report.breakEdit;
      UI.showView('preview');
    });

    /* خروجی سریع از پیش‌نمایش */
    rb('pv-export-html').addEventListener('click', async () => {
      const r = await pdfExporter.exportStandaloneHtml();
      if (r.ok) { UIKit.toast('success', 'دانلود انجام شد', r.fileName); recordHistory('html'); }
      else UIKit.toast('error', 'خطا', r.error);
    });
    rb('pv-export-doc').addEventListener('click', async () => {
      const r = await pdfExporter.exportWord();
      if (r.ok) { UIKit.toast('success', 'دانلود انجام شد', r.fileName + ' — این فایل در Word و Google Docs باز/بارگذاری می‌شود.'); recordHistory('doc'); }
      else UIKit.toast('error', 'خطا', r.error);
    });
    rb('pv-export-md').addEventListener('click', async () => {
      const r = await pdfExporter.exportMarkdown();
      if (r.ok) { UIKit.toast('success', 'دانلود انجام شد', r.fileName); recordHistory('md'); }
      else UIKit.toast('error', 'خطا', r.error);
    });
    rb('pv-export-copy').addEventListener('click', async () => {
      const r = await pdfExporter.copyPlainText();
      if (r.ok) UIKit.toast('success', 'کپی شد', 'متن گزارش در حافظه موقت است؛ در Google Docs با Ctrl+V جای‌گذاری کنید.');
      else UIKit.toast('error', 'کپی ناموفق', r.error);
    });

    rb('pv-refresh').addEventListener('click', () => {
      reportRenderer.renderPreview(stage);
      updateZoomLabel();
      renderBreaksList();
      UIKit.toast('success', 'پیش‌نمایش به‌روزرسانی شد', 'گزارش از آخرین وضعیت داده، محاسبات و متن‌ها بازسازی شد.');
    });
    rb('z-in').addEventListener('click', () => { reportRenderer.zoom(stage, +1); updateZoomLabel(); });
    rb('z-out').addEventListener('click', () => { reportRenderer.zoom(stage, -1); updateZoomLabel(); });
    rb('pv-go-export').addEventListener('click', () => WorkflowManager.goto('export'));

    function updateZoomLabel() {
      const zl = document.getElementById('z-level');
      if (zl) zl.textContent = Utils.fmtPct(reportRenderer.getZoom() * 100, 0);
    }

    function renderBreaksList() {
      const list = el.querySelector('#pv-breaks-list');
      if (!list) return;
      const breaks = f.report.breaks || [];
      if (!breaks.length) { list.innerHTML = '<small class="text-muted">شکست صفحه دستی‌ای درج نشده است.</small>'; return; }
      const titles = reportRenderer.getBlockTitles();
      list.innerHTML = `<b class="small">شکست‌های دستی (${Utils.fmtInt(breaks.length)}):</b> ` +
        breaks.map(bk => `<span class="badge badge-warning">قبل از: ${esc(titles[bk] || bk)} <button data-brk-del="${esc(bk)}" title="حذف شکست">${icon('x', 10)}</button></span>`).join(' ');
      list.querySelectorAll('[data-brk-del]').forEach(b => b.addEventListener('click', () => {
        f.report.breaks = f.report.breaks.filter(x => x !== b.dataset.brkDel);
        reportRenderer.renderPreview(stage);
        renderBreaksList();
      }));
    }

    function recordHistory(fmt) {
      recordReportHistory(fmt);
    }
  });

  /* ثبت تاریخچه با اسنپ‌شات گزارش */
  function recordReportHistory(format) {
    const f = Store.state.flow;
    const tpl = templateManager.get(f.templates.selectedId);
    const gen = f.ai.generated;
    Store.addHistoryEntry({
      title: (f.report.meta && f.report.meta.title) || 'گزارش مدیریتی',
      templateName: tpl ? tpl.name : '—',
      sourceName: f.source ? f.source.name : '—',
      rowsAfter: f.active ? f.active.rows.length : 0,
      rowsBefore: f.clean.rowsBefore || (f.raw ? f.raw.rows.length : 0),
      qualityScore: f.profile ? f.profile.score : null,
      removedDupes: f.dupes.removedTotal || 0,
      cleanOps: f.clean.log.filter(l => l.opId !== '__undo').length,
      calcCount: (f.calc.results || []).filter(r => r.ok).length,
      chartsCount: (f.charts.items || []).filter(c => c.opts.includeInReport).length,
      aiMode: gen ? gen.meta.provider : '—',
      label: f.report.label || 'none',
      lang: f.report.lang || 'fa',
      format: format || '—',
      sectionsSnapshot: gen ? gen.sections.map(s => ({ title: s.title, body: s.body })) : [],
      status: 'تکمیل‌شده'
    });
  }

  /* ═════════ مرحله ۹: خروجی گزارش ═════════ */
  UI.registerView('export', function (el) {
    const f = Store.state.flow;
    if (!f.report.renderedAt) { el.innerHTML = UIKit.emptyState('eye', 'پیش‌نمایشی ساخته نشده است', 'ابتدا پیش‌نمایش گزارش را باز کنید.', `<button class="btn btn-primary" onclick="WorkflowManager.goto('preview')">رفتن به پیش‌نمایش</button>`); return; }
    const out = f.report.output;
    const suggestedName = `گزارش-${((f.report.meta && f.report.meta.title) || 'مدیریتی').replace(/[\\/:*?"<>|]/g, '-')}-${Utils.todayJalali().replace(/\//g, '.')}`;
    if (!out.fileName) out.fileName = suggestedName;

    el.innerHTML = `
      <div class="panel">
        ${UI.viewHead('مرحله ۹ — تنظیمات خروجی و دریافت فایل', 'printer')}
        <div class="grid-2">
          <div>
            <h3 class="mb-1" style="font-size:14.5px;font-weight:800">${icon('settings')} تنظیمات خروجی</h3>
            <div class="form-row">
              <div class="field"><label>نام فایل</label><input class="input" id="out-name" value="${esc(out.fileName)}" dir="auto"></div>
              <div class="field"><label>پسوند / فرمت خروجی</label>
                <select class="select" id="out-ext">
                  <option value="pdf" ${out.ext === 'pdf' ? 'selected' : ''}>PDF (چاپ مرورگر)</option>
                  <option value="html" ${out.ext === 'html' ? 'selected' : ''}>HTML مستقل</option>
                  <option value="doc" ${out.ext === 'doc' ? 'selected' : ''}>Word / Google Docs (doc)</option>
                  <option value="md" ${out.ext === 'md' ? 'selected' : ''}>Markdown</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="field"><label>فونت متن فارسی</label>
                <select class="select" id="out-font-fa">
                  <option value="Vazirmatn FD" ${out.fontFa === 'Vazirmatn FD' ? 'selected' : ''}>Vazirmatn FD (داخلی)</option>
                  <option value="IranYekan" ${out.fontFa === 'IranYekan' ? 'selected' : ''}>IranYekan</option>
                  <option value="B Nazanin" ${out.fontFa === 'B Nazanin' ? 'selected' : ''}>B Nazanin</option>
                </select>
              </div>
              <div class="field"><label>فونت متن انگلیسی</label>
                <select class="select" id="out-font-en">
                  <option value="Arial" ${out.fontEn === 'Arial' ? 'selected' : ''}>Arial</option>
                  <option value="Times New Roman" ${out.fontEn === 'Times New Roman' ? 'selected' : ''}>Times New Roman</option>
                  <option value="Calibri" ${out.fontEn === 'Calibri' ? 'selected' : ''}>Calibri</option>
                </select>
              </div>
            </div>
            <p class="field-help">فونت Vazirmatn FD به‌صورت داخلی همراه سامانه است. IranYekan و B Nazanin در صورت نصب بودن روی سیستم شما استفاده می‌شوند؛ در غیر این صورت خودکار به فونت داخلی بازمی‌گردند. فونت انگلیسی برای بخش‌های لاتین متن و گزارش‌های انگلیسی اعمال می‌شود.</p>
            <button class="btn btn-primary btn-lg btn-block mt-2" id="do-export">${icon('download')}تولید و دریافت خروجی</button>
            <div id="export-status" class="mt-2"></div>
          </div>

          <div>
            <h3 class="mb-1" style="font-size:14.5px;font-weight:800">${icon('table')} خروجی‌های جانبی (داده پاک‌سازی‌شده)</h3>
            <p class="small text-soft mb-2">مجموعه داده تأییدشده (${f.active ? Utils.fmtInt(f.active.rows.length) : 0} ردیف) را در قالب‌های زیر دریافت کنید:</p>
            <div class="flex" style="gap:8px;flex-wrap:wrap">
              <button class="btn btn-secondary" id="side-csv">${icon('download')}CSV</button>
              <button class="btn btn-secondary" id="side-xlsx">${icon('download')}Excel (xlsx)</button>
              <button class="btn btn-secondary" id="side-copy">${icon('copy')}کپی برای چسباندن در Google Sheets</button>
              <a class="btn btn-ghost" href="https://sheets.new" target="_blank" rel="noopener">${icon('link')}بازکردن برگه جدید Google Sheets</a>
            </div>
            <div id="side-status" class="mt-2"></div>
            <div class="method-box mt-2">
              <b>راهنمای Google Sheets:</b> دکمه «کپی» داده را به‌صورت جدول در حافظه موقت می‌گذارد؛ در برگه جدید Google Sheets با Ctrl+V جای‌گذاری کنید. یا فایل CSV/xlsx را از مسیر File → Import وارد کنید.
            </div>
            <div class="method-box mt-1">
              <b>روش PDF:</b> خروجی PDF از موتور چاپ مرورگر ساخته می‌شود — بهترین پشتیبانی فارسی/RTL. در پنجره چاپ «Save as PDF» را انتخاب و «Background graphics» را فعال کنید. اندازه کاغذ و مارجین از تنظیمات مرحله پیش‌نمایش پیروی می‌کنند.
            </div>
          </div>
        </div>
      </div>`;

    const syncOut = () => {
      out.fileName = el.querySelector('#out-name').value.trim() || suggestedName;
      out.ext = el.querySelector('#out-ext').value;
      out.fontFa = el.querySelector('#out-font-fa').value;
      out.fontEn = el.querySelector('#out-font-en').value;
      Store.savePrefs();
    };
    el.querySelectorAll('#out-name,#out-ext,#out-font-fa,#out-font-en').forEach(i => i.addEventListener('change', syncOut));

    el.querySelector('#do-export').addEventListener('click', async () => {
      syncOut();
      const status = el.querySelector('#export-status');
      const base = out.fileName.replace(/\.(pdf|html?|docx?|md|txt)$/i, '');
      try {
        if (out.ext === 'pdf') {
          status.innerHTML = UIKit.spinner('آماده‌سازی نسخه چاپی… پنجره چاپ باز می‌شود.');
          const r = await pdfExporter.exportPdf(base);
          if (r.ok) {
            status.innerHTML = UIKit.banner('success', 'PDF آماده شد', `نام فایل: ${esc(r.fileName)} — ${Utils.fmtInt(r.pageCount)} صفحه. اگر پنجره چاپ باز نشد، از کلید Ctrl+P استفاده کنید.`);
            recordReportHistory('pdf');
          } else status.innerHTML = UIKit.banner('warning', 'خروجی انجام نشد', esc(r.error || ''));
        } else if (out.ext === 'html') {
          const r = await pdfExporter.exportStandaloneHtml(base);
          if (r.ok) { status.innerHTML = UIKit.banner('success', 'نسخه HTML دانلود شد', esc(r.fileName)); recordReportHistory('html'); }
          else status.innerHTML = UIKit.banner('danger', 'خطا', esc(r.error || ''));
        } else if (out.ext === 'doc') {
          const r = await pdfExporter.exportWord(base);
          if (r.ok) { status.innerHTML = UIKit.banner('success', 'فایل Word/Google Docs دانلود شد', esc(r.fileName) + ' — در Word باز کنید یا در Google Docs از File → Open → Upload بارگذاری کنید.'); recordReportHistory('doc'); }
          else status.innerHTML = UIKit.banner('danger', 'خطا', esc(r.error || ''));
        } else if (out.ext === 'md') {
          const r = await pdfExporter.exportMarkdown(base);
          if (r.ok) { status.innerHTML = UIKit.banner('success', 'فایل Markdown دانلود شد', esc(r.fileName)); recordReportHistory('md'); }
          else status.innerHTML = UIKit.banner('danger', 'خطا', esc(r.error || ''));
        }
        WorkflowManager.refresh();
      } catch (err) {
        status.innerHTML = UIKit.banner('danger', 'خطای غیرمنتظره', esc(err.message));
      }
    });

    /* خروجی‌های جانبی */
    el.querySelector('#side-csv').addEventListener('click', () => {
      if (!f.active) return;
      exportCleanedData('csv', el.querySelector('#side-status'));
    });
    el.querySelector('#side-xlsx').addEventListener('click', () => {
      if (!f.active) return;
      exportCleanedData('xlsx', el.querySelector('#side-status'));
    });
    el.querySelector('#side-copy').addEventListener('click', async () => {
      if (!f.active) return;
      const tsv = [f.active.columns.map(c => c.name).join('\t')]
        .concat(f.active.rows.map(r => r.map(v => String(v == null ? '' : v).replace(/\t|\n/g, ' ')).join('\t')))
        .join('\n');
      try {
        await navigator.clipboard.writeText(tsv);
        el.querySelector('#side-status').innerHTML = UIKit.banner('success', 'کپی شد', 'داده در حافظه موقت است؛ در Google Sheets با Ctrl+V جای‌گذاری کنید.');
      } catch (err) {
        el.querySelector('#side-status').innerHTML = UIKit.banner('danger', 'کپی ناموفق', 'مرورگر اجازه دسترسی به حافظه موقت نداد. از دکمه‌های CSV یا Excel استفاده کنید.');
      }
    });

    function exportCleanedData(kind, statusBox) {
      const ds = f.active;
      const name = `داده-پاک‌سازی‌شده-${Utils.todayJalali().replace(/\//g, '.')}`;
      if (kind === 'csv') {
        const csv = '\uFEFF' + [ds.columns.map(c => c.name).join(',')]
          .concat(ds.rows.map(r => r.map(v => {
            const s = String(v == null ? '' : v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          }).join(',')))
          .join('\n');
        Utils.downloadFile(name + '.csv', csv, 'text/csv;charset=utf-8');
        statusBox.innerHTML = UIKit.banner('success', 'CSV دانلود شد', name + '.csv');
      } else {
        const aoa = [ds.columns.map(c => c.name)].concat(ds.rows);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'داده پاک‌سازی‌شده');
        XLSX.writeFile(wb, name + '.xlsx');
        statusBox.innerHTML = UIKit.banner('success', 'Excel دانلود شد', name + '.xlsx');
      }
    }
  });

  /* ═════════ تاریخچه ═════════ */
  UI.registerView('history', function (el) {
    const hist = Store.state.history;
    el.innerHTML = `
      <div class="panel">
        ${UI.viewHead('تاریخچه گزارش‌ها و عملیات', 'clock', `${Utils.fmtInt(hist.length)} مورد ذخیره‌شده`)}
        ${UIKit.banner('info', 'ذخیره‌سازی محلی و حریم خصوصی', 'تاریخچه فقط در حافظه محلی مرورگر (localStorage) نگهداری می‌شود و شامل <b>اطلاعات خلاصه و متن بخش‌های گزارش</b> است — داده خام رکوردها هرگز ذخیره نمی‌شود. پاک‌کردن داده‌های مرورگر، تاریخچه را حذف می‌کند.')}
        ${hist.length ? `<div class="flex mb-2"><button class="btn btn-sm btn-ghost" id="clear-hist" style="color:var(--danger)">${icon('trash')}پاک‌کردن کل تاریخچه</button></div>` : ''}
        <div id="hist-list">
          ${hist.length ? hist.map(h => `
            <div class="hist-item">
              <div class="hi-main">
                <div class="hi-title">${esc(h.title)} ${labelBadge(h.label)}</div>
                <div class="hi-sub">${esc(new Date(h.createdAt).toLocaleString('fa-IR'))} • قالب: ${esc(h.templateName)} • منبع: ${esc(h.sourceName)}${h.format ? ' • فرمت: ' + esc(h.format) : ''}${h.lang ? ' • زبان: ' + (h.lang === 'en' ? 'English' : 'فارسی') : ''}</div>
              </div>
              <div class="hi-stats">
                ${h.qualityScore !== null && h.qualityScore !== undefined ? UIKit.badge(h.qualityScore >= 75 ? 'success' : 'warning', 'کیفیت: ' + Utils.fmtInt(h.qualityScore)) : ''}
                ${UIKit.badge('neutral', Utils.fmtInt(h.rowsAfter) + ' ردیف')}
                ${h.removedDupes ? UIKit.badge('warning', Utils.fmtInt(h.removedDupes) + ' تکراری حذف‌شده') : ''}
                ${UIKit.badge('info', Utils.fmtInt(h.calcCount || 0) + ' شاخص')}
                ${h.chartsCount ? UIKit.badge('primary', Utils.fmtInt(h.chartsCount) + ' نمودار') : ''}
                ${UIKit.badge('neutral', h.aiMode === 'demo' ? 'Demo AI' : h.aiMode === 'live' ? 'AI زنده' : h.aiMode === 'user' ? 'نگارش دستی' : h.aiMode)}
              </div>
              <div class="hi-actions">
                <button class="btn btn-sm btn-secondary" data-view="${h.id}">${icon('eye')}جزئیات و متن گزارش</button>
                <button class="btn btn-sm btn-ghost" data-del="${h.id}" style="color:var(--danger)">${icon('trash')}</button>
              </div>
            </div>`).join('') : UIKit.emptyState('clock', 'تاریخچه خالی است', 'پس از تکمیل اولین گزارش و دریافت خروجی، خلاصه و متن آن اینجا ثبت می‌شود.')}
        </div>
      </div>`;

    el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
      const h = hist.find(x => x.id === b.dataset.view);
      if (!h) return;
      const sections = (h.sectionsSnapshot || []).map(s => `<h4 style="margin:14px 0 6px;font-size:13.5px">${esc(s.title)}</h4><p style="white-space:pre-wrap;font-size:12.8px;line-height:2;color:var(--text-soft)">${esc(s.body)}</p>`).join('');
      UIKit.modal({
        title: 'گزارش: ' + h.title, size: 'lg',
        body: `<div class="small text-muted mb-2">${esc(new Date(h.createdAt).toLocaleString('fa-IR'))} — ${esc(h.templateName)}</div>
          ${sections || `<div class="code-block" style="max-height:420px">${esc(JSON.stringify(h, null, 2))}</div>`}`,
        footer: `<button class="btn btn-secondary" onclick="document.querySelector('#modal-root .modal-overlay').remove()">بستن</button>`
      });
    }));
    el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      UIKit.confirmBox({ title: 'حذف رکورد', message: 'این رکورد از تاریخچه حذف شود؟', danger: true, confirmText: 'حذف', onConfirm: () => { Store.deleteHistoryEntry(b.dataset.del); UI.showView('history'); } });
    }));
    const clearBtn = el.querySelector('#clear-hist');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      UIKit.confirmBox({ title: 'پاک‌کردن تاریخچه', message: 'کل تاریخچه پاک شود؟ این عمل بازگشت‌پذیر نیست.', danger: true, confirmText: 'پاک کردن', onConfirm: () => { Store.clearHistory(); UI.showView('history'); } });
    });
  });

  function labelBadge(labelId) {
    const l = LABELS.find(x => x.id === labelId);
    if (!l || l.id === 'none') return '';
    return `<span class="badge badge-${l.cls}">${esc(l.id === 'custom' ? 'برچسب دلخواه' : l.label)}</span>`;
  }
})();
