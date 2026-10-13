/* ═══════════════════════════════════════════════════════════
   نمای مرحله ۶ — استودیو نمودار تعاملی (رابط drag & drop شبیه Power BI)
   امکانات نسخه ۲٫۴:
   • چیپ فیلترهای فعال (Slicer + کلیک‌به‌فیلتر) همیشه نمایان + دکمه «حذف همه فیلترها»
     — دیگر هیچ‌وقت کاربر در فیلتری که نتیجه‌ای ندارد گیر نمی‌کند
   • Drill-down برای همه نمودارهای دسته‌ای (شبیه Power BI): کلیک روی عنصر
     با Drill فعال ← شکست سطح دوم همان دسته + breadcrumb بازگشت
   • نقشه ایران با مرز واقعی GeoJSON + Drill-down شهرستان‌ها
   • تغییر اندازه با درگ، Tooltip کامل، کلیک-فیلتر هوشمند (Slicer یا سراسری)
   ═══════════════════════════════════════════════════════════ */
'use strict';

(function () {
  const { icon, esc } = Utils;
  let _chartInstances = [];
  let _dragField = null;   // فیلد در حال درگ {col}
  let _selectedId = null;
  let _openFilterCol = null; // فیلتر باز در نوار فیلتر

  /* ---------- افزونه Data Label (بدون کتابخانه خارجی) ---------- */
  const dataLabelPlugin = {
    id: 'appDataLabels',
    afterDatasetsDraw(chart, args, pluginOpts) {
      const o = chart.options.plugins && chart.options.plugins.appDataLabels;
      if (!o || !o.display) return;
      const ctx = chart.ctx;
      const type = chart.config.type;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;
      const ds = chart.data.datasets[0];
      const total = (ds.data || []).reduce((s, v) => s + (+v || 0), 0);
      const pos = o.position || 'outside';
      ctx.save();
      ctx.font = `${o.size || 11}px 'Vazirmatn FD', Tahoma, sans-serif`;
      ctx.fillStyle = o.color || '#334155';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fmt = (v) => {
        if (o.showPct && total > 0 && (type === 'pie' || type === 'doughnut')) {
          return Utils.fmtPct((+v / total) * 100, o.pctDigits != null ? o.pctDigits : 1);
        }
        return Utils.nf(v);
      };
      if (type === 'pie' || type === 'doughnut') {
        meta.data.forEach((arc, i) => {
          const v = ds.data[i];
          if (v == null) return;
          const mid = arc.getProps(['startAngle', 'endAngle', 'outerRadius', 'x', 'y'], true);
          const ang = (mid.startAngle + mid.endAngle) / 2;
          const rIn = mid.outerRadius * (pos === 'inside' ? 0.68 : 1.14);
          const x = mid.x + Math.cos(ang) * rIn;
          const y = mid.y + Math.sin(ang) * rIn;
          ctx.textAlign = pos === 'inside' ? 'center' : (Math.cos(ang) > 0 ? 'left' : 'right');
          ctx.fillText(fmt(v), x, y);
        });
      } else if (type === 'line') {
        meta.data.forEach((p, i) => {
          const v = ds.data[i];
          if (v == null) return;
          const up = pos === 'bottom' ? 14 : -14;
          ctx.fillText(fmt(v), p.x, p.y + up);
        });
      } else if (type === 'radar') {
        /* راداری: برچسب روی رئوس */
        meta.data.forEach((p, i) => { ctx.fillText(fmt(ds.data[i]), p.x, p.y - 12); });
      } else {
        /* bar (ستونی/میله‌ای) */
        const horiz = chart.options.indexAxis === 'y';
        meta.data.forEach((bar, i) => {
          const v = ds.data[i];
          if (v == null) return;
          const pr = bar.getProps(['x', 'y', 'base', 'width', 'height'], true);
          if (horiz) {
            const isInside = pos === 'inside';
            const x = isInside ? pr.x - Math.abs(pr.x - pr.base) / 2 + 2 : Math.max(pr.x, pr.base) + 10;
            ctx.textAlign = isInside ? 'right' : 'left';
            ctx.fillText(fmt(v), x, pr.y);
          } else {
            const isInside = pos === 'inside';
            const y = isInside ? Math.max(pr.y, pr.base) - Math.abs(pr.y - pr.base) / 2 : Math.min(pr.y, pr.base) - 8;
            ctx.textBaseline = isInside ? 'bottom' : 'middle';
            ctx.fillText(fmt(v), pr.x, y);
          }
        });
      }
      ctx.restore();
    }
  };

  function destroyCharts() {
    _chartInstances.forEach(c => { try { c.destroy(); } catch (e) { /* ignore */ } });
    _chartInstances = [];
  }

  /* ═══════════ رندر نمای اصلی ═══════════ */
  UI.registerView('charts', function (el) {
    const f = Store.state.flow;
    if (!f.active) { el.innerHTML = UIKit.emptyState('alert', 'مجموعه داده فعالی وجود ندارد', 'ابتدا مرحله پاک‌سازی را تکمیل کنید.'); return; }
    if (!_selectedId && f.charts.items.length) _selectedId = f.charts.items[0].id;

    el.innerHTML = `
      <div class="panel charts-panel">
        ${UI.viewHead('مرحله ۶ — استودیو نمودارهای تعاملی', 'grid', 'فیلدها را روی نواحی بکشید و رها کنید (Drag & Drop)')}
        <div class="charts-filters" id="charts-filters">
          <div class="cf-head">
            <span class="cf-title">${icon('sliders', 14)}<b>Slicer — برش‌گر داده</b></span>
            <span class="cf-count">${slicerEngine.hasActive() ? Utils.faDig(slicerEngine.list().filter(s => slicerEngine.isActive(s)).length) + ' برش فعال' : 'بدون برش فعال'}</span>
            <span class="cf-rows" id="sl-rows-info"></span>
            ${slicerEngine.list().length ? `<button class="btn btn-sm btn-danger" id="cf-clear-all">${icon('eraser', 13)}حذف همه Slicerها</button>` : ''}
          </div>
          <div class="slicers-bar" id="slicers-bar"></div>
          <div class="sl-chips" id="sl-chips"></div>
          <div class="cf-bar" style="margin-top:8px">
            <button class="btn btn-sm btn-secondary" id="sl-add">${icon('plus', 13)}افزودن Slicer جدید</button>
            <span class="small text-muted">هر Slicer را می‌توانید به نمودارهای خاصی وصل کنید یا از آنها مستثنا کنید (مشابه Excel).</span>
          </div>
        </div>
        <div class="charts-layout">
          <!-- پنل بصری‌سازی و فیلدها (راست) -->
          <aside class="cb-side">
            <div class="cb-section">
              <div class="cb-sec-title">${icon('layers', 14)} بصری‌سازی</div>
              <div class="cb-visual-grid">
                ${Object.entries(chartBuilder.TYPE_META).map(([k, m]) => `
                  <button class="cb-visual ${isSelected(k)}" data-vtype="${k}" title="${esc(m.label)}">${visualIcon(m.icon, 20)}<span>${esc(m.label)}</span></button>`).join('')}
              </div>
            </div>
            <div class="cb-section">
              <div class="cb-sec-title">${icon('table', 14)} فیلدهای داده</div>
              <div class="cb-fields">
                ${f.active.columns.map(c => `
                  <div class="cb-field ${c.type === 'number' || c.type === 'mixed' ? 'is-numeric' : ''}" draggable="true" data-field="${esc(c.name)}" title="برای افزودن، بکشید یا دوبار کلیک کنید">
                    ${c.type === 'number' || c.type === 'mixed' ? '<span class="cb-fx">Σ</span>' : icon('tag', 12)}
                    <span>${esc(c.name)}</span>
                    <small>${Utils.typeFa(c.type)}</small>
                  </div>`).join('')}
              </div>
            </div>
            <div class="cb-section">
              <div class="cb-sec-title">${icon('settings', 14)} تنظیمات نمودار انتخابی</div>
              <div id="cb-settings"></div>
            </div>
          </aside>
          <!-- بوم نمودارها (مرکز) -->
          <div class="cb-canvas-wrap">
            <div class="cb-toolbar flex flex-between mb-2" style="flex-wrap:wrap;gap:8px">
              <div class="flex" style="gap:8px">
                <button class="btn btn-primary btn-sm" id="cb-add">${icon('plus')}نمودار جدید</button>
                ${FilterEngine.hasFilters() ? `<button class="btn btn-sm btn-danger" id="cb-clear-filters">${icon('eraser', 13)}حذف همه فیلترها (${Utils.faDig(FilterEngine.activeCount())})</button>` : ''}
              </div>
              <span class="text-muted small">برای فیلتر کردن کل نرم‌افزار، روی ستون‌ها/برش‌ها/استان‌ها کلیک کنید — فیلتر فعال همیشه به‌صورت چیپ بالای بوم نمایش داده می‌شود</span>
            </div>
            <div id="cb-canvas" class="cb-canvas"></div>
          </div>
        </div>
        <div class="flex mt-2" style="gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" id="cb-continue">${icon('arrowLeft')}ادامه به تولید گزارش</button>
        </div>
      </div>`;

    renderSlicers(el);
    renderCanvas();
    renderSettings();

    /* رویدادهای نوار Slicer */
    const fWrap = el.querySelector('#charts-filters');
    if (fWrap) {
      fWrap.addEventListener('click', (e) => {
        const clearAll = e.target.closest('#cf-clear-all');
        if (clearAll) { slicerEngine.clearAll(); UI.showView('charts'); return; }
        const addBtn = e.target.closest('#sl-add');
        if (addBtn) { openSlicerCreator(); return; }
        const del = e.target.closest('[data-sl-del]');
        if (del) { slicerEngine.remove(del.dataset.slDel); UI.showView('charts'); return; }
        const clr = e.target.closest('[data-sl-clear]');
        if (clr) { slicerEngine.clear(clr.dataset.slClear); UI.showView('charts'); return; }
        const cfg = e.target.closest('[data-sl-cfg]');
        if (cfg) { openSlicerConfig(cfg.dataset.slCfg); return; }
        const val = e.target.closest('[data-sl-val]');
        if (val) {
          const sl = slicerEngine.get(val.dataset.slId);
          if (sl) {
            const v = val.dataset.slVal;
            const i = sl.values.indexOf(v);
            if (i >= 0) sl.values.splice(i, 1); else sl.values.push(v);
            slicerEngine.notify();
            UI.showView('charts');
          }
        }
      });
      fWrap.addEventListener('change', (e) => {
        const minIn = e.target.closest('[data-sl-min]');
        const maxIn = e.target.closest('[data-sl-max]');
        if (minIn || maxIn) {
          const sl = slicerEngine.get((minIn || maxIn).dataset.slId);
          if (sl) {
            if (minIn) sl.min = minIn.value === '' ? null : Utils.parseNum(minIn.value);
            if (maxIn) sl.max = maxIn.value === '' ? null : Utils.parseNum(maxIn.value);
            slicerEngine.notify();
            UI.showView('charts');
          }
        }
      });
    }

    /* حذف همه فیلترهای کلیک‌به‌فیلتر (Fix قفل فیلتر — نسخه ۲٫۴) */
    const clearFiltersBtn = el.querySelector('#cb-clear-filters');
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', () => {
      FilterEngine.clearAll();
      UI.showView('charts');
      UIKit.toast('success', 'فیلترها حذف شد', 'نمایش همه نمودارها به حالت کامل بازگشت.');
    });

    el.querySelector('#cb-add').addEventListener('click', () => {
      UndoManager.runWithSnapshot('افزودن نمودار جدید', ['charts'], () => chartBuilder.add());
      const items = Store.state.flow.charts.items;
      _selectedId = items[items.length - 1].id;
      UI.showView('charts');
      WorkflowManager.refresh();
      UIKit.toast('info', 'نمودار جدید ساخته شد', 'نوع، فیلدها و تنظیمات را از پنل کنار تنظیم کنید.');
    });

    el.querySelector('#cb-continue').addEventListener('click', () => WorkflowManager.goto('ai'));

    /* رویدادهای پنل بصری‌سازی */
    el.querySelectorAll('[data-vtype]').forEach(b => b.addEventListener('click', () => {
      const it = chartBuilder.get(_selectedId);
      if (!it) { UIKit.toast('warning', 'نموداری انتخاب نشده', 'ابتدا یک نمودار بسازید یا انتخاب کنید.'); return; }
      UndoManager.runWithSnapshot('تغییر نوع نمودار', ['charts'], () => { it.type = b.dataset.vtype; });
      UI.showView('charts');
    }));

    /* درگ فیلدها */
    el.querySelectorAll('.cb-field').forEach(fd => {
      fd.addEventListener('dragstart', (e) => {
        _dragField = fd.dataset.field;
        e.dataTransfer.setData('text/plain', fd.dataset.field);
        e.dataTransfer.effectAllowed = 'copy';
      });
      fd.addEventListener('dblclick', () => {
        const it = chartBuilder.get(_selectedId);
        if (!it) return;
        UndoManager.runWithSnapshot('تخصیص فیلد', ['charts'], () => assignFieldSmart(it, fd.dataset.field));
        UI.showView('charts');
      });
    });

    function isSelected(type) {
      const it = chartBuilder.get(_selectedId);
      return it && it.type === type ? 'selected' : '';
    }
  });

  /* ═══════════ Slicerها — جایگزین فیلترهای داده (نسخه ۲٫۲) ═══════════ */
  function renderSlicers(el) {
    const bar = el.querySelector('#slicers-bar');
    const chips = el.querySelector('#sl-chips');
    const info = el.querySelector('#sl-rows-info');
    if (!bar) return;
    const sls = slicerEngine.list();
    const f = Store.state.flow;

    /* خلاصه تعداد ردیف هر نمودار پس از برش */
    const actives = sls.filter(s => slicerEngine.isActive(s));
    if (info) {
      if (!actives.length) info.textContent = `همه ${Utils.fmtInt(f.active.rows.length)} ردیف`;
      else {
        const counts = f.charts.items.map(it => `${it.title}: ${Utils.fmtInt(slicerEngine.countFor(it.id))}`).join(' — ');
        info.textContent = counts || `نمونه برش‌خورده: ${Utils.fmtInt(slicerEngine.countFor('')) } ردیف`;
      }
    }

    bar.innerHTML = sls.length ? sls.map(sl => {
      const active = slicerEngine.isActive(sl);
      let body = '';
      if (sl.kind === 'list') {
        const vals = slicerEngine.uniqueValues(sl.col);
        const sel = new Set(sl.values);
        body = `<div class="slicer-list">
          ${vals.slice(0, 100).map(v => `
            <label class="slicer-item ${sel.has(v.value) ? 'checked' : ''}" data-sl-val="${esc(v.value)}" data-sl-id="${sl.id}" title="کلیک: انتخاب/حذف مقدار">
              <span>${v.checked ? '' : ''}${esc(v.value)}</span><small class="cnt">${Utils.fmtInt(v.count)}</small>
            </label>`).join('') || '<div class="cf-empty">مقداری یافت نشد</div>'}
        </div>`;
      } else {
        body = `<div class="slicer-range">
          <input class="input" type="number" step="any" data-sl-min="${sl.id}" data-sl-id="${sl.id}" value="${sl.min != null ? sl.min : ''}" placeholder="از">
          <span>…</span>
          <input class="input" type="number" step="any" data-sl-max="${sl.id}" data-sl-id="${sl.id}" value="${sl.max != null ? sl.max : ''}" placeholder="تا">
        </div>`;
      }
      const conn = sl.exceptions.length
        ? `متصل به همه نمودارها به‌جز ${Utils.faDig(sl.exceptions.length)} مستثنا`
        : 'متصل به همه نمودارها';
      return `<div class="slicer-card" data-sl="${sl.id}">
        <div class="sl-head">${icon(active ? 'filter' : 'sliders', 13)}
          <span class="sl-field" title="${esc(sl.col)}">${esc(sl.col)}</span>
          <small class="badge badge-neutral">${sl.kind === 'list' ? 'دسته‌ای' : sl.kind === 'number' ? 'بازه عددی' : 'بازه تاریخ'}</small>
          <button class="icon-btn btn-sm-icon" data-sl-cfg="${sl.id}" title="اتصال نمودارها و مستثناها">${icon('settings', 12)}</button>
          <button class="icon-btn btn-sm-icon" data-sl-clear="${sl.id}" title="پاک کردن انتخاب این برش">${icon('eraser', 12)}</button>
          <button class="icon-btn btn-sm-icon" data-sl-del="${sl.id}" title="حذف Slicer" style="color:var(--danger)">${icon('x', 12)}</button>
        </div>
        ${body}
        <div class="slicer-foot">${icon('grid', 11)} ${conn}</div>
      </div>`;
    }).join('') : `<div class="small text-muted" style="padding:4px 2px">هنوز Slicer نساخته‌اید. با «افزودن Slicer جدید» فیلد دلخواه را انتخاب کنید؛ سپس با کلیک روی مقادیر، نمودارهای متصل بلافاصله به‌روزرسانی می‌شوند.</div>`;

    chips.innerHTML = (
      /* چیپ Slicerهای فعال */
      actives.map(sl => {
        const lbl = slicerEngine.chipLabel(sl);
        return `<span class="cf-chip">${icon('filter', 11)}<b>${esc(sl.col)}:</b> ${esc(lbl.text)}
          <button data-sl-clear="${sl.id}" title="پاک کردن">${icon('x', 11)}</button></span>`;
      }).concat(
      /* چیپ فیلترهای کلیک‌به‌فیلتر سراسری — همیشه قابل حذف (نسخه ۲٫۴) */
      FilterEngine.rulesSnapshot().map(r => {
        const lbl = FilterEngine.chipLabel(r.col);
        return `<span class="cf-chip fe-chip" title="فیلتر کلیک روی نمودار">${icon('search', 11)}<b>${esc(r.col)}:</b> ${esc(lbl ? lbl.text : r.values.join('، '))}
          <button data-fe-clear="${esc(r.col)}" title="حذف این فیلتر">${icon('x', 11)}</button></span>`;
      })
    )).join('');
    chips.querySelectorAll('[data-fe-clear]').forEach(b => b.addEventListener('click', () => {
      FilterEngine.clearRule(b.dataset.feClear);
      UI.showView('charts');
    }));
  }

  function openSlicerCreator() {
    const f = Store.state.flow;
    const cols = f.active.columns.filter(c => ['text', 'boolean', 'date', 'mixed', 'identifier', 'number'].includes(c.type));
    const m = UIKit.modal({
      title: 'افزودن Slicer (برش‌گر داده)',
      body: `
        <div class="field"><label>فیلد داده</label>
          <select class="select" id="sl-new-col">${cols.map(c => `<option value="${esc(c.name)}">${esc(c.name)} — ${Utils.typeFa(c.type)}</option>`).join('')}</select>
          <span class="field-help">برای فیلدهای عددی، Slicer به شکل «بازه عددی» و برای تاریخ‌ها «بازه تاریخ» ساخته می‌شود؛ بقیه فهرست چندانتخابی دارند.</span>
        </div>`,
      footer: `<button class="btn btn-primary" data-ok>${icon('plus', 13)}ساخت Slicer</button>
               <button class="btn btn-ghost" data-cancel>انصراف</button>`
    });
    m.overlay.querySelector('[data-ok]').addEventListener('click', () => {
      const col = m.overlay.querySelector('#sl-new-col').value;
      if (col) {
        slicerEngine.create(col);
        UIKit.toast('success', 'Slicer ساخته شد', `برش «${col}» به همه نمودارها متصل شد.`);
      }
      m.close();
      UI.showView('charts');
    });
    m.overlay.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  }

  function openSlicerConfig(id) {
    const sl = slicerEngine.get(id);
    if (!sl) return;
    const items = Store.state.flow.charts.items;
    const m = UIKit.modal({
      title: `پیکربندی Slicer: ${sl.col}`,
      body: `
        <div class="banner banner-info">${icon('info')}<div>پیش‌فرض: این برش روی <b>همه نمودارها</b> اثر می‌گذارد. نمودارهای مستثنا از فیلتر جدا می‌مانند و همیشه کل داده را نشان می‌دهند.</div></div>
        ${items.length ? `<div class="field"><label>نمودارهای مستثنا (از فیلتر این برش جدا می‌مانند)</label>
          <div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
          ${items.map(it => `
            <label class="slicer-item ${sl.exceptions.includes(it.id) ? 'checked' : ''}">
              <input type="checkbox" data-exc="${it.id}" ${sl.exceptions.includes(it.id) ? 'checked' : ''}>
              <span>${esc(it.title)}</span><small class="cnt">${esc(chartBuilder.TYPE_META[it.type] ? chartBuilder.TYPE_META[it.type].label : it.type)}</small>
            </label>`).join('')}
          </div></div>` : '<div class="banner banner-warning">' + Utils.icon('alert') + '<div>هنوز نموداری وجود ندارد؛ همه Slicerها روی نمودارهای آینده اعمال می‌شوند.</div></div>'}`,
      footer: `<button class="btn btn-primary" data-ok>ذخیره</button>
               <button class="btn btn-ghost" data-cancel>انصراف</button>`
    });
    m.overlay.querySelector('[data-ok]').addEventListener('click', () => {
      const exc = [];
      m.overlay.querySelectorAll('[data-exc]:checked').forEach(cb => exc.push(cb.dataset.exc));
      sl.exceptions = exc;
      slicerEngine.notify();
      m.close();
      UI.showView('charts');
      UIKit.toast('success', 'اتصال Slicer ذخیره شد', exc.length ? `${Utils.faDig(exc.length)} نمودار مستثنا شد.` : 'برش به همه نمودارها متصل است.');
    });
    m.overlay.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  }

  function typeFaLocal(t) { return Utils.typeFa(t); }

  function visualIcon(name, size) {
    const custom = {
      'bar-vertical': '<line x1="6" y1="20" x2="6" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="13"/>',
      'bar-horizontal': '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/>',
      'line-trend': '<polyline points="3 17 9 11 13 14 21 6"/><polyline points="15 6 21 6 21 12"/>',
      'area': '<path d="M3 20V10l6 4 6-8 6 6v8z"/>',
      'pie': '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
      'doughnut': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/>',
      'radar': '<polygon points="12 3 21 9 17.5 20 6.5 20 3 9"/><line x1="12" y1="3" x2="12" y2="20"/>',
      'scatter': '<circle cx="7" cy="7" r="1.6"/><circle cx="15" cy="10" r="1.6"/><circle cx="9" cy="16" r="1.6"/><circle cx="18" cy="17" r="1.6"/><circle cx="12" cy="4" r="1.6"/>',
      'map': '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
      'tag': '<path d="M20.6 13.4L12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${size}px;height:${size}px" aria-hidden="true">${custom[name] || custom['tag']}</svg>`;
  }

  /* تخصیص هوشمند فیلد با دوبار کلیک */
  function assignFieldSmart(it, colName) {
    const f = Store.state.flow;
    const col = f.active.columns.find(c => c.name === colName);
    if (!col) return;
    const numeric = col.type === 'number' || col.type === 'mixed';
    if (it.type === 'scatter') {
      if (!it.xCol) it.xCol = colName; else it.yCol = colName;
    } else if (numeric) it.valCol = colName;
    else it.catCol = colName;
  }

  /* ═══════════ بوم نمودارها ═══════════ */
  function renderCanvas() {
    const canvas = document.getElementById('cb-canvas');
    const f = Store.state.flow;
    destroyCharts();
    if (!f.charts.items.length) {
      canvas.innerHTML = UIKit.emptyState('grid', 'هنوز نموداری ساخته نشده است',
        'با دکمه «نمودار جدید» شروع کنید یا یکی از فیلدها را دوبار کلیک کنید.', '');
      return;
    }
    canvas.innerHTML = `<div class="cb-grid">${f.charts.items.map(it => cardHTML(it)).join('')}</div>`;

    f.charts.items.forEach(it => { mountCard(it); });
    wireCardEvents(canvas);
  }

  function cardHTML(it) {
    const meta = chartBuilder.TYPE_META[it.type] || {};
    const spanCls = it.opts.span === 2 ? 'span-2' : it.opts.span === 3 ? 'span-3' : '';
    return `<div class="cb-card ${spanCls}" data-id="${it.id}">
      <div class="cb-card-head" draggable="true" data-drag-card="${it.id}">
        <span class="cb-grab" title="جابه‌جایی با درگ">${icon('grip', 14)}</span>
        <input class="input cb-title-input" data-t="${it.id}" value="${esc(it.title)}" title="ویرایش عنوان نمودار">
        <span class="badge badge-neutral">${esc(meta.label || it.type)}</span>
        <button class="icon-btn btn-sm-icon" data-span="${it.id}" title="تغییر عرض کارت">${icon('columns', 13)}</button>
        <label class="cb-inc" title="نمایش این نمودار در گزارش نهایی"><input type="checkbox" data-inc="${it.id}" ${it.opts.includeInReport ? 'checked' : ''}> در گزارش</label>
        <div class="flex" style="gap:4px">
          <button class="icon-btn btn-sm-icon" data-up="${it.id}" title="انتقال به عقب">${icon('arrowRight', 13)}</button>
          <button class="icon-btn btn-sm-icon" data-down="${it.id}" title="انتقال به جلو">${icon('arrowLeft', 13)}</button>
          <button class="icon-btn btn-sm-icon" data-dup="${it.id}" title="تکثیر">${icon('copy', 13)}</button>
          <button class="icon-btn btn-sm-icon" data-edit="${it.id}" title="تنظیمات">${icon('settings', 13)}</button>
          <button class="icon-btn btn-sm-icon" data-del="${it.id}" title="حذف" style="color:var(--danger)">${icon('trash', 13)}</button>
        </div>
      </div>
      <div class="cb-card-zones" data-zones="${it.id}"></div>
      <div class="cb-card-body" style="height:${it.opts.height}px"><canvas id="cb-chart-${it.id}"></canvas><div class="cb-map-holder" data-map="${it.id}"></div><div class="cc-holder" data-custom="${it.id}" style="display:none;width:100%;height:100%"></div></div>
      <div class="cb-card-msg" data-msg="${it.id}"></div>
      <div class="cb-resize" data-resize="${it.id}" title="بکشید تا اندازه نمودار تغییر کند (رسم خودکار)">${icon('maximize', 12)}</div>
    </div>`;
  }

  function zonesHTML(it) {
    const isScatter = it.type === 'scatter';
    const isKpi = it.type === 'kpi';
    const isTextbox = it.type === 'textbox';
    const isGauge = it.type === 'gauge';
    const isHeat = it.type === 'heatmap';
    const needCat = !isScatter && !isKpi && !isTextbox && !isGauge;
    if (!it.drill) it.drill = { enabled: false, col2: '', active: null };   /* سازگاری داشبورد قدیمی */
    const drillSupported = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'radar', 'treemap', 'infographic', 'table'].includes(it.type);
    const drillCols = it.type === 'heatmap'
      ? []
      : Store.state.flow.active.columns.filter(c => c.name !== it.catCol && ['text', 'boolean', 'date', 'mixed', 'identifier'].includes(c.type));
    const drillOn = drillSupported && it.drill.enabled;
    return `
      ${needCat ? `<div class="cb-zone" data-zone="catCol" data-target="${it.id}" title="فیلد دسته‌ای را اینجا رها کنید">
        <span class="cb-zone-label">${icon('filter', 12)} ${isHeat ? 'سطر (بعد ۱)' : 'محور دسته'}</span>
        <span class="cb-zone-value">${esc(it.catCol || 'اینجا رها کنید')}</span></div>` : ''}
      ${isHeat ? `<div class="cb-zone" data-zone="catCol2" data-target="${it.id}" title="فیلد بعد دوم را اینجا رها کنید">
        <span class="cb-zone-label">${icon('columns', 12)} ستون (بعد ۲)</span>
        <span class="cb-zone-value">${esc(it.catCol2 || 'اینجا رها کنید')}</span></div>` : ''}
      ${isScatter ? `
        <div class="cb-zone" data-zone="xCol" data-target="${it.id}"><span class="cb-zone-label">محور X</span><span class="cb-zone-value">${esc(it.xCol || 'اینجا رها کنید')}</span></div>
        <div class="cb-zone" data-zone="yCol" data-target="${it.id}"><span class="cb-zone-label">محور Y</span><span class="cb-zone-value">${esc(it.yCol || 'اینجا رها کنید')}</span></div>`
        : (!isTextbox ? `<div class="cb-zone" data-zone="valCol" data-target="${it.id}" title="فیلد عددی را اینجا رها کنید">
        <span class="cb-zone-label">${icon('calc', 12)} ${isGauge ? 'شاخص' : 'محور مقدار'}</span>
        <span class="cb-zone-value">${esc(it.valCol || (isKpi || isGauge ? 'اینجا رها کنید' : 'اینجا رها کنید'))}</span></div>` : '')}
      ${!isScatter && !isTextbox ? `<div class="cb-zone-mini">
        <select class="select" data-agg="${it.id}">${Object.entries(chartBuilder.AGG_META).map(([k, v]) => `<option value="${k}" ${it.agg === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
        ${!isKpi && !isGauge ? `<select class="select" data-sort="${it.id}">
          <option value="value-desc" ${it.sort === 'value-desc' ? 'selected' : ''}>مرتب‌سازی: مقدار نزولی</option>
          <option value="value-asc" ${it.sort === 'value-asc' ? 'selected' : ''}>مقدار صعودی</option>
          <option value="label" ${it.sort === 'label' ? 'selected' : ''}>بر اساس برچسب</option>
          <option value="none" ${it.sort === 'none' ? 'selected' : ''}>ترتیب داده</option>
        </select>
        <select class="select" data-topn="${it.id}">${[0, 3, 5, 8, 10, 15].map(n => `<option value="${n}" ${it.topN === n ? 'selected' : ''}>${n === 0 ? 'همه موارد' : 'Top ' + Utils.faDig(n)}</option>`).join('')}</select>` : ''}
      </div>` : ''}
      ${drillSupported ? `
      <div class="cb-drill-row ${drillOn ? 'is-on' : ''}">
        <button type="button" class="btn btn-sm ${drillOn ? 'btn-primary' : 'btn-ghost'}" data-drill-toggle="${it.id}" title="Drill-down: کلیک روی عنصر نمودار، شکست سطح دوم همان دسته را نشان می‌دهد (شبیه Power BI)">${icon('grid', 12)}Drill-down</button>
        ${drillOn ? `
        <select class="select" data-drill-col="${it.id}" title="ستون سطح دوم Drill-down">
          <option value="">ستون سطح دوم…</option>
          ${drillCols.map(c => `<option value="${esc(c.name)}" ${it.drill.col2 === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        ${it.drill.active ? `<span class="cd-chip" title="سطح دوم فعال">${icon('grid', 11)} ${esc(it.catCol)}: <b>${esc(it.drill.active)}</b> ← ${esc(it.drill.col2)}
          <button data-drill-back="${it.id}" title="بازگشت به سطح اول">${icon('x', 10)}</button></span>`
        : `<span class="small text-muted">کلیک روی هر عنصر نمودار ← شکست سطح دوم</span>`}` : ''}
      </div>` : ''}`;
  }

  function mountCard(it) {
    const card = document.querySelector(`.cb-card[data-id="${it.id}"]`);
    if (!card) return;
    const zones = card.querySelector(`[data-zones="${it.id}"]`);
    zones.innerHTML = zonesHTML(it);

    // درگ روی نواحی
    zones.querySelectorAll('.cb-zone').forEach(z => {
      z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('drag-over'); });
      z.addEventListener('dragleave', () => z.classList.remove('drag-over'));
      z.addEventListener('drop', (e) => {
        e.preventDefault();
        z.classList.remove('drag-over');
        const fld = _dragField || e.dataTransfer.getData('text/plain');
        if (!fld) return;
        UndoManager.runWithSnapshot('تخصیص فیلد نمودار', ['charts'], () => {
          const target = chartBuilder.get(z.dataset.target);
          if (target) target[z.dataset.zone] = fld;
        });
        _dragField = null;
        UI.showView('charts');
      });
      z.addEventListener('click', () => { z.classList.add('zone-flash'); setTimeout(() => z.classList.remove('zone-flash'), 500); });
    });

    // مینی‌سلکت‌ها (تغییر فوری بدون بروزرسانی دستی)
    const aggSel = zones.querySelector(`[data-agg="${it.id}"]`);
    if (aggSel) aggSel.addEventListener('change', () => { UndoManager.runWithSnapshot('تغییر تجمیع نمودار', ['charts'], () => { it.agg = aggSel.value; }); drawCard(it); });
    const sortSel = zones.querySelector(`[data-sort="${it.id}"]`);
    if (sortSel) sortSel.addEventListener('change', () => { UndoManager.runWithSnapshot('تغییر مرتب‌سازی', ['charts'], () => { it.sort = sortSel.value; }); drawCard(it); });
    const topSel = zones.querySelector(`[data-topn="${it.id}"]`);
    if (topSel) topSel.addEventListener('change', () => { UndoManager.runWithSnapshot('تغییر TopN', ['charts'], () => { it.topN = +topSel.value; }); drawCard(it); });

    // Drill-down (نسخه ۲٫۴)
    if (!it.drill) it.drill = { enabled: false, col2: '', active: null };
    const dToggle = zones.querySelector(`[data-drill-toggle="${it.id}"]`);
    if (dToggle) dToggle.addEventListener('click', () => {
      UndoManager.runWithSnapshot('تغییر Drill-down نمودار', ['charts'], () => {
        it.drill.enabled = !it.drill.enabled;
        if (!it.drill.enabled) { it.drill.active = null; }
        else if (!it.drill.col2) {
          const cand = Store.state.flow.active.columns.find(c => c.name !== it.catCol && ['text', 'boolean', 'date', 'mixed', 'identifier'].includes(c.type));
          it.drill.col2 = cand ? cand.name : '';
        }
      });
      UI.showView('charts');
    });
    const dCol = zones.querySelector(`[data-drill-col="${it.id}"]`);
    if (dCol) dCol.addEventListener('change', () => {
      UndoManager.runWithSnapshot('تغییر ستون Drill-down', ['charts'], () => { it.drill.col2 = dCol.value; it.drill.active = null; });
      UI.showView('charts');
    });
    const dBack = zones.querySelector(`[data-drill-back="${it.id}"]`);
    if (dBack) dBack.addEventListener('click', () => {
      UndoManager.runWithSnapshot('بازگشت از Drill-down', ['charts'], () => { it.drill.active = null; });
      UI.showView('charts');
    });

    drawCard(it);
    wireResize(it, card);
  }

  /* ---------- تغییر اندازه با درگ از گوشه (رسم مجدد خودکار) ---------- */
  function wireResize(it, card) {
    const handle = card.querySelector(`[data-resize="${it.id}"]`);
    const body = card.querySelector('.cb-card-body');
    if (!handle || !body) return;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = body.offsetHeight;
      document.body.classList.add('resizing');
      const move = (ev) => {
        const h = Math.max(160, Math.min(900, startH + (startY - ev.clientY) * 0 + (ev.clientY - startY)));
        body.style.height = h + 'px';
        it.opts.height = Math.round(h);   // ذخیره — Chart.js به‌صورت خودکار دوباره رسم می‌کند
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing');
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    handle.addEventListener('dblclick', () => { it.opts.height = 280; body.style.height = '280px'; });
  }

  /* ---------- رسم نمودار یک کارت ---------- */
  function drawCard(it) {
    const cv = document.getElementById('cb-chart-' + it.id);
    const mapHolder = document.querySelector(`[data-map="${it.id}"]`);
    const ccHolder = document.querySelector(`[data-custom="${it.id}"]`);
    const msg = document.querySelector(`[data-msg="${it.id}"]`);
    if (!cv || !msg || !mapHolder || !ccHolder) return;
    const res = chartBuilder.build(it);
    if (!res.ok) {
      const hasFilter = (typeof FilterEngine !== 'undefined' && FilterEngine.hasFilters()) || (typeof slicerEngine !== 'undefined' && slicerEngine.hasActive());
      msg.innerHTML = `<div class="cb-empty">${icon('info', 15)} <div><b>نتیجه‌ای برای نمایش نیست</b><span>${esc(res.error)}</span>
        ${hasFilter ? `<div class="cb-empty-actions"><button class="btn btn-sm btn-secondary" data-clear-filters="${it.id}">${icon('eraser', 12)}حذف همه فیلترها</button></div>` : ''}
        ${it.drill && it.drill.active ? `<div class="cb-empty-actions"><button class="btn btn-sm btn-ghost" data-drill-back-empty="${it.id}">${icon('arrowRight', 12)}بازگشت از Drill-down (${esc(it.drill.active)})</button></div>` : ''}
      </div></div>`;
      const cf = msg.querySelector('[data-clear-filters]');
      if (cf) cf.addEventListener('click', () => { FilterEngine.clearAll(); slicerEngine.clearAll(); UI.showView('charts'); });
      const db = msg.querySelector('[data-drill-back-empty]');
      if (db) db.addEventListener('click', () => { it.drill.active = null; UI.showView('charts'); });
      cv.style.display = 'none';
      mapHolder.style.display = 'none';
      ccHolder.style.display = 'none';
      return;
    }
    msg.innerHTML = '';
    const colors = chartBuilder.paletteColors(it.opts.palette);
    const type = chartBuilder.chartJsType(it);
    const faFont = { family: "'Vazirmatn FD', Tahoma" };
    const hideAll = () => { cv.style.display = 'none'; mapHolder.style.display = 'none'; ccHolder.style.display = 'none'; };

    if (it.type === 'textbox') {
      hideAll();
      ccHolder.style.display = 'block';
      ccHolder.innerHTML = `<div class="cc-textbox"><textarea data-tb="${it.id}" placeholder="متن، یادداشت یا توضیح دلخواه برای داشبورد… (تغییرات بلافاصله ذخیره می‌شود)">${esc(it.opts.text || '')}</textarea></div>`;
      const ta = ccHolder.querySelector('textarea');
      ta.addEventListener('input', () => {
        it.opts.text = ta.value;
        /* متن کادر متن در تاریخچه ثبت نمی‌شود (ورودی زنده کاربر است) */
      });
      ta.addEventListener('blur', () => {
        UndoManager.runWithSnapshot('ویرایش کادر متن', ['charts'], () => { it.opts.text = ta.value; });
      });
      return;
    }

    if (it.type === 'gauge') {
      hideAll();
      ccHolder.style.display = 'flex';
      const o = it.opts;
      customCharts.gauge(ccHolder, {
        value: res.scalar,
        min: o.gaugeMin != null ? +o.gaugeMin : null,
        max: o.gaugeMax != null ? +o.gaugeMax : null,
        target: o.gaugeTarget != null ? +o.gaugeTarget : null,
        label: res.label
      }, { baseColor: colors[0], unit: o.igUnit || '' });
      return;
    }

    if (it.type === 'infographic') {
      hideAll();
      ccHolder.style.display = 'block';
      const data = res.labels.map((l, i) => ({ label: l, value: res.values[i] }));
      customCharts.infographic(ccHolder, data, { perIcon: +it.opts.perIcon || 0, colors, unit: it.opts.igUnit || '' });
      /* کلیک روی گروه → فیلتر کل نرم‌افزار */
      ccHolder.querySelectorAll('.cc-ig-label').forEach((lblEl, i) => {
        lblEl.style.cursor = 'pointer';
        lblEl.title = 'برای فیلتر کل نرم‌افزار کلیک کنید';
        lblEl.addEventListener('click', () => toggleCatFilter(it, res.labels[i]));
      });
      return;
    }

    if (it.type === 'treemap') {
      hideAll();
      ccHolder.style.display = 'block';
      const data = res.labels.map((l, i) => ({ label: l, value: res.values[i] }));
      customCharts.treemap(ccHolder, data, { colors, height: it.opts.height });
      ccHolder.querySelectorAll('.tm-cell').forEach(cell => {
        cell.addEventListener('click', () => toggleCatFilter(it, cell.dataset.tmLabel));
      });
      return;
    }

    if (it.type === 'heatmap') {
      hideAll();
      ccHolder.style.display = 'block';
      customCharts.heatmap(ccHolder, res.heat, { baseColor: colors[0] });
      if (res.heat.truncated) {
        msg.innerHTML = `<div class="cb-map-note">برای خوانایی، فقط ۲۵ دسته از هر بعد نمایش داده شد؛ با TopN یا Slicer محدود کنید.</div>`;
      }
      return;
    }

    if (it.type === 'kpi') {
      hideAll();
      msg.innerHTML = `<div class="cb-kpi"><div class="cb-kpi-label">${esc(res.label)}</div><div class="cb-kpi-value">${Utils.fmtCompact(res.scalar)}</div><div class="cb-kpi-sub">${esc(it.valCol || 'تعداد رکوردها')}${it.agg !== 'count' ? ' — ' + esc(chartBuilder.AGG_META[it.agg] ? chartBuilder.AGG_META[it.agg].label : it.agg) : ''}</div></div>`;
      return;
    }
    if (it.type === 'table') {
      hideAll();
      msg.innerHTML = `<div class="table-wrap" style="max-height:${Math.max(160, it.opts.height)}px"><table class="data-table"><thead><tr><th>${esc(it.catCol || 'گروه')}</th><th>تعداد</th><th>${esc(it.agg === 'count' ? 'تعداد' : it.valCol)}</th></tr></thead><tbody>
        ${res.labels.length ? res.labels.map((l, i) => `<tr class="cb-clickable-row" data-filter-col="${esc(it.catCol)}" data-filter-label="${esc(l)}" title="برای فیلتر کل نرم‌افزار کلیک کنید"><td>${esc(l)}</td><td>${Utils.fmtInt(res.counts[i])}</td><td class="mono">${Utils.nf(res.values[i])}</td></tr>`).join('')
          : '<tr><td colspan="3" class="center text-muted">نتیجه‌ای یافت نشد</td></tr>'}
      </tbody></table></div>`;
      return;
    }
    if (it.type === 'map') {
      hideAll();
      mapHolder.style.display = 'block';
      msg.innerHTML = res.unmatched ? `<div class="cb-map-note">${Utils.fmtInt(res.unmatched)} ردیف با نام ناحیه منطبق نشد — نمایش داده نشدند.</div>` : '';
      iranMap.render(mapHolder, {
        regions: res.regions,
        baseColor: colors[0],
        fmtValue: (v) => Utils.fmtCompact(v),
        fmtShare: (p) => Utils.fmtPct(p, 1),
        selectedKey: (FilterEngine.getRule(it.catCol) || [])[0] || null,
        onLevelChange: () => UI.showView('charts'),
        onRegionClick: (key, province) => {
          /* استان: فیلتر با نام استان — شهرستان: فیلتر با نام شهرستان در همان ستون */
          toggleCatFilter(it, key);
        }
      });
      return;
    }

    cv.style.display = 'block';
    mapHolder.style.display = 'none';
    ccHolder.style.display = 'none';
    let data, options;

    if (it.type === 'scatter') {
      data = { datasets: [{ label: it.title, data: res.points, backgroundColor: colors[0] + 'cc', pointRadius: 4.5 }] };
      options = scatterOptions(res.xLabel, res.yLabel, it, faFont);
    } else if (type === 'pie' || type === 'doughnut') {
      data = { labels: res.labels, datasets: [{ data: res.values, backgroundColor: res.labels.map((_, i) => colors[i % colors.length] + 'dd'), borderWidth: 1.5 }] };
      options = circularOptions(it, faFont);
    } else if (type === 'radar') {
      data = { labels: res.labels, datasets: [{ label: it.title, data: res.values, borderColor: colors[0], backgroundColor: colors[0] + '33', pointBackgroundColor: colors[0] }] };
      options = radarOptions(it, faFont);
    } else {
      const isHoriz = it.type === 'bar';
      const o = it.opts;
      const dsConf = {
        label: it.title, data: res.values,
        backgroundColor: it.type === 'line' || it.type === 'area' ? colors[0] + '22' : res.values.map((_, i) => colors[i % colors.length] + 'cc'),
        borderColor: colors[0],
        borderWidth: it.type === 'line' || it.type === 'area' ? (o.borderWidth || 2.4) : 0,
        borderRadius: it.type === 'line' || it.type === 'area' ? 0 : (o.cornerRadius != null ? o.cornerRadius : 6),
        fill: it.type === 'area', tension: .32,
        pointRadius: it.type === 'line' || it.type === 'area' ? 3.2 : undefined
      };
      data = { labels: res.labels, datasets: [dsConf] };
      options = axisOptions(isHoriz, it, faFont);
    }
    _chartInstances.push(new Chart(cv, { type: type, data, options, plugins: [dataLabelPlugin] }));
  }

  /* کلیک-فیلتر هوشمند + Drill-down (نسخه ۲٫۴):
     • اگر Drill-down برای این نمودار فعال باشد و هنوز در سطح اول هستیم،
       کلیک روی عنصر = شکست سطح دومِ همان دسته (شبیه Power BI) — بدون فیلتر سراسری
     • در سطح دوم یا وقتی Drill فعال نیست، کلیک = فیلتر کل نرم‌افزار
       (اگر برای این ستون Slicer باشد همان به‌روزرسانی می‌شود؛ وگرنه فیلتر سراسری) */
  function toggleCatFilter(it, label) {
    if (!it.drill) it.drill = { enabled: false, col2: '', active: null };
    /* نسخه ۲٫۴: نقشه ایران Drill-down مستقل خودش را دارد (شهرستان‌ها)؛
       حالت Drill عمومی نباید کلیک روی نقشه را بدزدد — همیشه فیلتر اعمال شود */
    if (it.type === 'map' && it.drill.active) it.drill.active = null;   /* پاک‌سازی حالت گیرکرده قبلی */
    if (it.type !== 'map' && it.drill.enabled && it.drill.col2 && !it.drill.active) {
      it.drill.active = String(label);
      UI.showView('charts');
      UIKit.toast('info', 'Drill-down انجام شد', `شکست «${label}» بر اساس ستون «${it.drill.col2}» نمایش داده شد. برای بازگشت، ✕ کنار breadcrumb را بزنید.`);
      return;
    }
    const sls = (typeof slicerEngine !== 'undefined') ? slicerEngine.list().filter(s => s.col === it.catCol && s.kind === 'list') : [];
    if (sls.length) {
      const sl = sls[0];
      const i = sl.values.indexOf(label);
      if (i >= 0) sl.values.splice(i, 1); else sl.values.push(label);
      slicerEngine.notify();
    } else {
      FilterEngine.toggleValue(it.catCol, label);
    }
    UI.showView('charts');
    /* نسخه ۲٫۴: هشدار «بدون داده» — کلیک روی دسته‌ای که ردیفی پشت آن نیست،
       حالت خالی نمایش می‌دهد؛ کاربر با توست و دکمه‌های حذف فیلتر گیر نمی‌کند */
    let rowsAfterFilter = null;
    try { rowsAfterFilter = slicerEngine.rowsFor(it.id); } catch (e) { rowsAfterFilter = FilterEngine.filteredRows(); }
    if (rowsAfterFilter && !rowsAfterFilter.length) {
      UIKit.toast('warning', 'داده‌ای برای این انتخاب وجود ندارد', `هیچ ردیفی برای «${label}» یافت نشد. کارت‌ها حالت خالی نشان می‌دهند؛ برای بازگشت، فیلتر را از چیپ بالای بوم یا دکمه «حذف همه فیلترها» بردارید.`);
      return;
    }
    UIKit.toast('info', 'فیلتر اعمال شد', `نمایش داده بر اساس «${label}» در ستون «${it.catCol}» تغییر کرد. حذف فیلتر از چیپ بالای بوم.`);
  }

  /* ---------- کلیک روی عناصر نمودار → فیلتر کل نرم‌افزار (هوشمند: Slicer یا سراسری) ---------- */
  function clickFilterHandler(evt, elements, chart, it) {
    if (!elements || !elements.length) return;
    const idx = elements[0].index;
    const label = chart.data.labels ? chart.data.labels[idx] : null;
    if (label == null) return;
    toggleCatFilter(it, label);
  }

  function baseOpts(faFont, it) {
    const labelPad = (it.opts.dataLabels && ['outside', 'top'].includes(it.opts.dataLabelsPos)) ? 26 : 8;
    /* فاصله عنوان نمودار از ناحیه رسم — تنظیم مستقل هر نمودار (نسخه ۲٫۲) */
    const titlePad = it.opts.titlePadTop != null ? +it.opts.titlePadTop : 6;
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      layout: { padding: { top: labelPad + titlePad, bottom: 2 } },
      onClick: (evt, elements, chart) => clickFilterHandler(evt, elements, chart, it),
      onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
      plugins: {
        legend: {
          display: !!it.opts.legend, rtl: true,
          position: it.opts.legendPos || 'top',
          labels: { font: faFont, boxWidth: 12 }
        },
        tooltip: {
          enabled: it.opts.tooltip !== false, rtl: true, titleFont: faFont, bodyFont: faFont,
          backgroundColor: 'rgba(15,23,42,.94)', padding: 11, cornerRadius: 9,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label || ''} ${Utils.fmtCompact(ctx.parsed.y !== undefined && ctx.parsed.y !== null ? ctx.parsed.y : (ctx.parsed.r !== undefined ? ctx.parsed.r : ctx.parsed))}`.trim()
          }
        },
        appDataLabels: {
          display: !!it.opts.dataLabels,
          position: it.opts.dataLabelsPos || 'outside',
          size: it.opts.dataLabelsSize || 11,
          color: it.opts.dataLabelsColor || '#334155',
          showPct: !!it.opts.dataLabelsShowPct,
          showValue: it.opts.dataLabelsShowValue !== false
        }
      }
    };
  }
  function axisOptions(isHoriz, it, faFont) {
    const o = baseOpts(faFont, it);
    const tickFont = { family: "'Vazirmatn FD', Tahoma", size: 10.5 };
    /* فاصله نام محور از برچسب‌ها/مقادیر — تنظیم مستقل (نسخه ۲٫۲) */
    const padX = it.opts.axisNamePadX != null ? +it.opts.axisNamePadX : 10;
    const padY = it.opts.axisNamePadY != null ? +it.opts.axisNamePadY : 6;
    o.scales = {
      x: {
        reverse: isHoriz,
        title: { display: !!(it.opts.axisTitleCat && !isHoriz) || !!(it.opts.axisTitleCat && isHoriz), text: it.opts.axisTitleCat || '', font: faFont, padding: padY },
        ticks: { font: tickFont, callback: function (v) { const lbl = this.getLabelForValue(v); return String(lbl).length > 18 ? String(lbl).slice(0, 17) + '…' : lbl; } },
        grid: { display: isHoriz && it.opts.gridlines }
      },
      y: {
        title: { display: !!(it.opts.axisTitleVal && !isHoriz), text: it.opts.axisTitleVal || '', font: faFont, padding: padX },
        ticks: { font: tickFont, callback: (v) => Utils.fmtCompact(v) },
        grid: { display: it.opts.gridlines, color: 'rgba(120,130,150,.14)' }
      }
    };
    if (isHoriz) {
      o.indexAxis = 'y';
      o.scales.x.title = { display: !!(it.opts.axisTitleVal), text: it.opts.axisTitleVal || '', font: faFont, padding: padX };
      o.scales.x.ticks.callback = (v) => Utils.fmtCompact(v);
      o.scales.y.title = { display: !!(it.opts.axisTitleCat), text: it.opts.axisTitleCat || '', font: faFont, padding: padY };
    }
    return o;
  }
  function circularOptions(it, faFont) {
    const o = baseOpts(faFont, it);
    o.plugins.legend.position = it.opts.legendPos || 'left';
    o.plugins.tooltip.callbacks = {
      label: (ctx) => ` ${ctx.label}: ${Utils.fmtCompact(ctx.parsed)} (${Utils.fmtPct((ctx.parsed / (ctx.dataset.data.reduce((s, v) => s + (+v || 0), 0) || 1)) * 100, 1)})`
    };
    return o;
  }
  function radarOptions(it, faFont) {
    const o = baseOpts(faFont, it);
    o.scales = { r: { ticks: { font: faFont, callback: (v) => Utils.fmtCompact(v) }, pointLabels: { font: faFont } } };
    return o;
  }
  function scatterOptions(xLabel, yLabel, it, faFont) {
    const o = baseOpts(faFont, it);
    o.scales = {
      x: { title: { display: true, text: xLabel, font: faFont }, ticks: { font: faFont } },
      y: { title: { display: true, text: yLabel, font: faFont }, ticks: { font: faFont, callback: (v) => Utils.fmtCompact(v) } }
    };
    return o;
  }

  /* رویدادهای کارت‌ها */
  function wireCardEvents(canvas) {
    canvas.querySelectorAll('[data-t]').forEach(inp => inp.addEventListener('change', () => {
      const it = chartBuilder.get(inp.dataset.t);
      if (it) {
        UndoManager.runWithSnapshot('ویرایش عنوان نمودار', ['charts'], () => { it.title = inp.value || it.title; });
        drawCard(it);
      }
    }));
    canvas.querySelectorAll('[data-inc]').forEach(cb => cb.addEventListener('change', () => {
      const it = chartBuilder.get(cb.dataset.inc);
      if (it) { it.opts.includeInReport = cb.checked; WorkflowManager.refresh(); }
    }));
    canvas.querySelectorAll('[data-span]').forEach(b => b.addEventListener('click', () => {
      const it = chartBuilder.get(b.dataset.span);
      if (!it) return;
      UndoManager.runWithSnapshot('تغییر عرض نمودار', ['charts'], () => { it.opts.span = it.opts.span >= 2 ? 1 : 2; });
      UI.showView('charts');
    }));
    canvas.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      UIKit.confirmBox({ title: 'حذف نمودار', message: 'این نمودار حذف شود؟ (قابل واگرد با Ctrl+Z)', danger: true, confirmText: 'حذف', onConfirm: () => { UndoManager.runWithSnapshot('حذف نمودار', ['charts'], () => chartBuilder.remove(b.dataset.del)); if (_selectedId === b.dataset.del) _selectedId = null; UI.showView('charts'); WorkflowManager.refresh(); } });
    }));
    canvas.querySelectorAll('[data-dup]').forEach(b => b.addEventListener('click', () => {
      UndoManager.runWithSnapshot('تکثیر نمودار', ['charts'], () => chartBuilder.duplicate(b.dataset.dup));
      const items = Store.state.flow.charts.items;
      const idx = items.findIndex(x => x.id === b.dataset.dup);
      if (idx >= 0) _selectedId = items[idx + 1].id;
      UI.showView('charts');
    }));
    canvas.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      _selectedId = b.dataset.edit;
      openChartSettingsModal(b.dataset.edit);
    }));
    canvas.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => { UndoManager.runWithSnapshot('جابه‌جایی نمودار', ['charts'], () => chartBuilder.move(b.dataset.up, -1)); UI.showView('charts'); }));
    canvas.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => { UndoManager.runWithSnapshot('جابه‌جایی نمودار', ['charts'], () => chartBuilder.move(b.dataset.down, +1)); UI.showView('charts'); }));

    // کلیک روی ردیف‌های جدول → فیلتر
    canvas.querySelectorAll('.cb-clickable-row').forEach(row => row.addEventListener('click', () => {
      FilterEngine.toggleValue(row.dataset.filterCol, row.dataset.filterLabel);
      UI.showView('charts');
    }));

    // درگ جابه‌جایی کارت‌ها
    let dragId = null;
    canvas.querySelectorAll('[data-drag-card]').forEach(h => {
      h.addEventListener('dragstart', (e) => { dragId = h.dataset.dragCard; e.dataTransfer.effectAllowed = 'move'; });
      h.addEventListener('dragend', () => { dragId = null; });
    });
    canvas.querySelectorAll('.cb-card').forEach(card => {
      card.addEventListener('dragover', (e) => {
        if (!dragId || dragId === card.dataset.id) return;
        e.preventDefault();
        card.classList.add('drop-target');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
      card.addEventListener('drop', (e) => {
        if (!dragId || dragId === card.dataset.id) return;
        e.preventDefault();
        card.classList.remove('drop-target');
        const f2 = Store.state.flow;
        const from = f2.charts.items.findIndex(x => x.id === dragId);
        const to = f2.charts.items.findIndex(x => x.id === card.dataset.id);
        if (from < 0 || to < 0) return;
        UndoManager.runWithSnapshot('جابه‌جایی کارت نمودار', ['charts'], () => {
          const [moved] = f2.charts.items.splice(from, 1);
          f2.charts.items.splice(to, 0, moved);
        });
        dragId = null;
        UI.showView('charts');
      });
    });
  }

  /* ═══════════ تنظیمات نمودار: خلاصه کنار + پنجره کامل تب‌دار (مطابق تصویر مرجع) ═══════════ */
  function renderSettings() {
    const box = document.getElementById('cb-settings');
    const it = chartBuilder.get(_selectedId);
    if (!it) { box.innerHTML = '<p class="text-muted small">نموداری انتخاب نشده است. یک نمودار بسازید یا روی ⚙ کارت کلیک کنید.</p>'; return; }
    _selectedId = it.id;
    box.innerHTML = `
      <p class="small" style="margin:2px 0 8px"><b>${esc(it.title)}</b> — ${esc(chartBuilder.TYPE_META[it.type] ? chartBuilder.TYPE_META[it.type].label : it.type)}</p>
      <button class="btn btn-secondary btn-sm" id="cbs-open-modal" style="width:100%">${icon('sliders', 13)}تنظیمات کامل این نمودار</button>
      <div class="small text-muted mt-1" style="line-height:1.7">${icon('info', 11)} تنظیمات هر نمودار <b>مستقل</b> است و روی نمودارهای دیگر اثر نمی‌گذارد. در پنجره تنظیمات کامل: عنوان، محورها، فاصله‌ها، برچسب‌ها، رنگ‌ها و گزینه‌های خاص همان نوع.</div>`;
    box.querySelector('#cbs-open-modal').addEventListener('click', () => openChartSettingsModal(it.id));
  }

  function openChartSettingsModal(chartId) {
    const f = Store.state.flow;
    const it = chartBuilder.get(chartId);
    if (!it) return;
    const cols = f.active.columns;
    const isCirc = it.type === 'pie' || it.type === 'doughnut';
    const hasAxis = ['column', 'bar', 'line', 'area', 'scatter'].includes(it.type);
    const numCols = cols.filter(c => c.type === 'number' || c.type === 'mixed');
    _selectedId = chartId;

    /* ---------- تب‌ها ---------- */
    const TABS = [
      { id: 'general', label: 'عمومی', icon: 'settings' },
      { id: 'axes', label: 'عنوان و محورها', icon: 'type' },
      { id: 'labels', label: 'برچسب‌ها', icon: 'tag' },
      { id: 'colors', label: 'رنگ‌ها و ظاهر', icon: 'palette' },
      { id: 'type', label: 'گزینه‌های نوع', icon: 'sparkles' }
    ];
    let curTab = 'general';

    const m = UIKit.modal({
      title: `تنظیمات نمودار: ${esc(it.title)}`,
      size: 'lg',
      body: `
        <div class="cbs-tabs" id="cbs-tabs">
          ${TABS.filter(t => t.id !== 'type' || ['infographic', 'gauge', 'textbox', 'heatmap', 'treemap', 'map'].includes(it.type)).map(t => `
            <button class="cbs-tab ${t.id === curTab ? 'active' : ''}" data-tab="${t.id}">${icon(t.icon, 13)}${t.label}</button>`).join('')}
        </div>
        <div class="cbs-body" id="cbs-body"></div>`,
      footer: `<button class="btn btn-primary" data-cbs-close>اعمال و بستن</button>
               <button class="btn btn-ghost" data-cbs-reset>بازنشانی پیش‌فرض‌ها</button>`
    });

    const body = m.overlay.querySelector('#cbs-body');

    function palCards() {
      const entries = Object.entries(chartBuilder.PALETTES).map(([k, p]) => [k, p]);
      entries.push(['custom:branding', { name: 'پالت سفارشی گزارش', colors: (f.report.branding.customColors || []).length ? f.report.branding.customColors : ['#94a3b8'] }]);
      return `<div class="pal-grid">${entries.map(([k, p]) => `
        <div class="pal-card ${it.opts.palette === k ? 'selected' : ''}" data-cbs-pal="${k}" role="button" tabindex="0">
          <div class="pal-name">${esc(p.name)}</div>
          <div class="pal-strip">${p.colors.slice(0, 8).map(c => `<span style="background:${c}"></span>`).join('')}</div>
        </div>`).join('')}</div>`;
    }

    function numRow(id, label, val, min, max, step, help) {
      return `<div class="field"><label>${label}</label>
        <div class="num-row">
          <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val != null ? val : 0}">
          <span class="num-val" id="${id}-val">${val != null ? Utils.faDig(val) : '—'}</span>
        </div>
        ${help ? `<span class="field-help">${help}</span>` : ''}</div>`;
    }

    function renderTab() {
      m.overlay.querySelectorAll('.cbs-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === curTab));
      let h = '';
      if (curTab === 'general') {
        h = `
        <div class="field"><label>عنوان نمودار</label><input class="input" id="cbs-title" value="${esc(it.title)}"></div>
        ${it.type !== 'scatter' && it.type !== 'textbox' ? `<div class="field"><label>ستون دسته‌بندی ${it.type === 'heatmap' ? '(سطر)' : ''}</label><select class="select" id="cbs-cat"><option value="">—</option>${cols.map(c => `<option value="${esc(c.name)}" ${it.catCol === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
        ${it.type === 'heatmap' ? `<div class="field"><label>ستون دوم (بعد ستونی)</label><select class="select" id="cbs-cat2"><option value="">—</option>${cols.map(c => `<option value="${esc(c.name)}" ${it.catCol2 === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><span class="field-help">برای نقشه حرارتی باید با ستون سطر متفاوت باشد.</span></div>` : ''}
        ${it.type !== 'scatter' && it.type !== 'textbox' ? `<div class="field"><label>ستون مقدار</label><select class="select" id="cbs-val"><option value="">—</option>${cols.map(c => `<option value="${esc(c.name)}" ${it.valCol === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
        ${it.type === 'scatter' ? `
          <div class="field"><label>محور X (عددی)</label><select class="select" id="cbs-x">${cols.map(c => `<option value="${esc(c.name)}" ${it.xCol === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>محور Y (عددی)</label><select class="select" id="cbs-y">${cols.map(c => `<option value="${esc(c.name)}" ${it.yCol === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
        <div class="form-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>ارتفاع (px)</label><select class="select" id="cbs-h">${[200, 260, 280, 340, 420].map(hh => `<option value="${hh}" ${it.opts.height === hh ? 'selected' : ''}>${Utils.faDig(hh)}</option>`).join('')}</select></div>
          <div class="field"><label>عرض کارت</label><select class="select" id="cbs-span">${[[1, 'یک‌ستون'], [2, 'دوستون (پهن)']].map(([k, l]) => `<option value="${k}" ${(it.opts.span || 1) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <label class="checkbox-row mt-1"><input type="checkbox" id="cbs-inc" ${it.opts.includeInReport ? 'checked' : ''}><div class="cb-text"><b>درج در گزارش نهایی</b></div></label>`;
      } else if (curTab === 'axes') {
        h = hasAxis ? `
        <div class="field"><label>عنوان محور دسته</label><input class="input" id="cbs-axcat" value="${esc(it.opts.axisTitleCat || '')}" placeholder="مثلاً: شهر"></div>
        <div class="field"><label>عنوان محور مقدار</label><input class="input" id="cbs-axval" value="${esc(it.opts.axisTitleVal || '')}" placeholder="مثلاً: مبلغ فروش (تومان)"></div>
        ${numRow('cbs-titlepad', 'فاصله عنوان نمودار از ناحیه رسم (px)', it.opts.titlePadTop, 0, 40, 1, 'این فاصله فقط همین نمودار را تحت تأثیر قرار می‌دهد و بلافاصله اعمال می‌شود.')}
        ${numRow('cbs-axpadx', 'فاصله نام محور مقدار از مقادیر (px)', it.opts.axisNamePadX, 0, 40, 1)}
        ${numRow('cbs-axpady', 'فاصله نام محور دسته از برچسب‌ها (px)', it.opts.axisNamePadY, 0, 40, 1)}
        <div class="form-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>راهنما (Legend)</label>
            <select class="select" id="cbs-legend"><option value="1" ${it.opts.legend ? 'selected' : ''}>نمایش</option><option value="0" ${!it.opts.legend ? 'selected' : ''}>پنهان</option></select></div>
          <div class="field"><label>موقعیت راهنما</label>
            <select class="select" id="cbs-legendpos">${[['top', 'بالا'], ['bottom', 'پایین'], ['left', 'چپ'], ['right', 'راست']].map(([k, l]) => `<option value="${k}" ${(it.opts.legendPos || 'top') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <label class="checkbox-row mt-1"><input type="checkbox" id="cbs-grid" ${it.opts.gridlines ? 'checked' : ''}><div class="cb-text">خطوط شبکه‌ای</div></label>
        <label class="checkbox-row mt-1"><input type="checkbox" id="cbs-tip" ${it.opts.tooltip !== false ? 'checked' : ''}><div class="cb-text">Tooltip (نمایش مقدار هنگام اشاره)</div></label>` :
          `<div class="banner banner-info">${icon('info')}<div>این نوع نمودار محور عددی ندارد. تنظیمات راهنما و Tooltip در تب «رنگ‌ها و ظاهر» است.</div></div>
          ${['pie', 'doughnut', 'column', 'bar', 'line', 'area'].includes(it.type) || it.type === 'map' || it.type === 'heatmap' ? `
          <div class="form-row" style="grid-template-columns:1fr 1fr">
            <div class="field"><label>راهنما (Legend)</label>
              <select class="select" id="cbs-legend"><option value="1" ${it.opts.legend ? 'selected' : ''}>نمایش</option><option value="0" ${!it.opts.legend ? 'selected' : ''}>پنهان</option></select></div>
            <div class="field"><label>موقعیت راهنما</label>
              <select class="select" id="cbs-legendpos">${[['top', 'بالا'], ['bottom', 'پایین'], ['left', 'چپ'], ['right', 'راست']].map(([k, l]) => `<option value="${k}" ${(it.opts.legendPos || 'top') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          </div>
          <label class="checkbox-row mt-1"><input type="checkbox" id="cbs-tip" ${it.opts.tooltip !== false ? 'checked' : ''}><div class="cb-text">Tooltip</div></label>` : ''}`;
      } else if (curTab === 'labels') {
        h = `
        <label class="checkbox-row"><input type="checkbox" id="cbs-dl" ${it.opts.dataLabels ? 'checked' : ''}><div class="cb-text">نمایش برچسب روی داده‌ها</div></label>
        <div class="form-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>موقعیت</label>
            <select class="select" id="cbs-dlpos">${chartBuilder.LABEL_POSITIONS.map(p => `<option value="${p.id}" ${(it.opts.dataLabelsPos || 'outside') === p.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
          <div class="field"><label>اندازه فونت</label>
            <select class="select" id="cbs-dlsize">${[9, 10, 11, 12, 14, 16].map(s => `<option value="${s}" ${(it.opts.dataLabelsSize || 11) === s ? 'selected' : ''}>${Utils.faDig(s)}</option>`).join('')}</select></div>
        </div>
        <div class="form-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>محتوا</label>
            <select class="select" id="cbs-dlmode">
              <option value="value" ${!it.opts.dataLabelsShowPct ? 'selected' : ''}>مقدار</option>
              ${isCirc ? `<option value="pct" ${it.opts.dataLabelsShowPct ? 'selected' : ''}>درصد</option>` : ''}
            </select></div>
          <div class="field"><label>رنگ متن</label>
            <select class="select" id="cbs-dlcolor">${[['#334155', 'سرمه‌ای'], ['#0f172a', 'مشکی'], ['#2f6fed', 'آبی'], ['#16a34a', 'سبز'], ['#d97706', 'کهربایی']].map(([c, n]) => `<option value="${c}" ${(it.opts.dataLabelsColor || '#334155') === c ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        </div>`;
      } else if (curTab === 'colors') {
        h = `
        <div class="field"><label>پالت رنگی — انتخاب مستقل برای همین نمودار</label>${palCards()}</div>`;
      } else if (curTab === 'type') {
        if (it.type === 'infographic') {
          h = `${numRow('cbs-pericon', 'هر آیکون چند واحد؟ (۰ = خودکار)', it.opts.perIcon || 0, 0, 10000, 1, 'مثلاً برای نمایش فروش به تفکیک جنسیت با آیکون انسان.')}
          <div class="field"><label>واحد نمایش کنار مقادیر</label><input class="input" id="cbs-igunit" value="${esc(it.opts.igUnit || '')}" placeholder="مثلاً: نفر، تومان"></div>`;
        } else if (it.type === 'gauge') {
          h = `
          <div class="form-row" style="grid-template-columns:1fr 1fr">
            <div class="field"><label>حداقل (خالی = ۰)</label><input class="input" type="number" step="any" id="cbs-gmin" value="${it.opts.gaugeMin != null ? it.opts.gaugeMin : ''}"></div>
            <div class="field"><label>حداکثر (خالی = خودکار)</label><input class="input" type="number" step="any" id="cbs-gmax" value="${it.opts.gaugeMax != null ? it.opts.gaugeMax : ''}"></div>
          </div>
          <div class="field"><label>خط هدف (اختیاری)</label><input class="input" type="number" step="any" id="cbs-gtarget" value="${it.opts.gaugeTarget != null ? it.opts.gaugeTarget : ''}" placeholder="مثلاً: 100000"></div>
          <div class="field"><label>واحد</label><input class="input" id="cbs-igunit" value="${esc(it.opts.igUnit || '')}"></div>`;
        } else if (it.type === 'textbox') {
          h = `<div class="field"><label>متن کادر</label><textarea class="textarea" id="cbs-tbtext" rows="6" placeholder="متن، یادداشت، منبع داده یا هر توضیح دلخواه…">${esc(it.opts.text || '')}</textarea>
            <span class="field-help">این متن در داشبورد و گزارش نهایی نمایش داده می‌شود.</span></div>`;
        } else if (it.type === 'map') {
          h = `<div class="banner banner-info">${icon('mapPin')}<div>نقشه ایران (نسخه ۲٫۵): Drill-down شهرستانی برای <b>هر ۳۱ استان</b> فعال است — کلیک روی هر استان، همه شهرستان‌های همان استان را داخل مرز واقعی نمایش می‌دهد (۴۷۸ شهرستان از داده مرجع). از پنل جزئیات، دکمه «فیلتر کل نرم‌افزار» بر اساس استان یا شهرستان فیلتر می‌کند و دکمه «بازگشت به سطح استان» به نمای کشوری برمی‌گردد.</div></div>`;
        } else {
          h = `<div class="banner banner-info">${icon('info')}<div>این نوع نمودار گزینه اختصاصی اضافه‌ای ندارد.</div></div>`;
        }
      }
      body.innerHTML = h;

      /* اسلایدرها: نمایش مقدار زنده */
      body.querySelectorAll('input[type="range"]').forEach(r => {
        const out = body.querySelector('#' + r.id + '-val');
        if (out) r.addEventListener('input', () => { out.textContent = Utils.faDig(r.value); });
      });
      /* کارت‌های پالت */
      body.querySelectorAll('[data-cbs-pal]').forEach(card => {
        card.addEventListener('click', () => {
          applyChange(() => { it.opts.palette = card.dataset.cbsPal; });
          renderTab();
        });
      });
    }

    function applyChange(fn, live) {
      if (live) {
        /* تغییرات زنده بدون بستن پنجره — بدون ورود به تاریخچه (تا هر حرکت اسلایدر یک رکورد نشود) */
        fn();
        const card = document.querySelector(`.cb-card[data-id="${it.id}"]`);
        if (card) {
          const cvv = card.querySelector('.cb-card-body');
          if (cvv) cvv.style.height = it.opts.height + 'px';
        }
        drawCard(it);
      } else {
        UndoManager.runWithSnapshot('تغییر تنظیمات نمودار', ['charts'], fn);
        drawCard(it);
        WorkflowManager.refresh();
      }
    }

    /* اعمال زنده تغییرات (بدون رفرش کامل صفحه) */
    body.addEventListener('input', (e) => {
      const id = e.target.id;
      const g = (sel) => body.querySelector(sel);
      const num = (sel, dflt) => { const v = g(sel); return v && v.value !== '' ? +v.value : dflt; };
      if (id === 'cbs-titlepadtop') { it.opts.titlePadTop = +e.target.value; applyChange(() => { }, true); }
      else if (id === 'cbs-axpadx') { it.opts.axisNamePadX = +e.target.value; applyChange(() => { }, true); }
      else if (id === 'cbs-axpady') { it.opts.axisNamePadY = +e.target.value; applyChange(() => { }, true); }
    });
    body.addEventListener('change', (e) => {
      const g = (sel) => body.querySelector(sel);
      /* هر فیلد فقط اگر در تب فعلی موجود باشد اعمال می‌شود */
      UndoManager.runWithSnapshot('تغییر تنظیمات نمودار', ['charts'], () => {
        if (g('#cbs-title')) it.title = g('#cbs-title').value || it.title;
        if (g('#cbs-cat')) it.catCol = g('#cbs-cat').value;
        if (g('#cbs-cat2')) it.catCol2 = g('#cbs-cat2').value;
        if (g('#cbs-val')) it.valCol = g('#cbs-val').value;
        if (g('#cbs-x')) it.xCol = g('#cbs-x').value;
        if (g('#cbs-y')) it.yCol = g('#cbs-y').value;
        if (g('#cbs-axcat')) it.opts.axisTitleCat = g('#cbs-axcat').value.trim();
        if (g('#cbs-axval')) it.opts.axisTitleVal = g('#cbs-axval').value.trim();
        if (g('#cbs-legend')) it.opts.legend = g('#cbs-legend').value === '1';
        if (g('#cbs-legendpos')) it.opts.legendPos = g('#cbs-legendpos').value;
        if (g('#cbs-grid')) it.opts.gridlines = g('#cbs-grid').checked;
        if (g('#cbs-tip')) it.opts.tooltip = g('#cbs-tip').checked;
        if (g('#cbs-dl')) it.opts.dataLabels = g('#cbs-dl').checked;
        if (g('#cbs-dlpos')) it.opts.dataLabelsPos = g('#cbs-dlpos').value;
        if (g('#cbs-dlsize')) it.opts.dataLabelsSize = +g('#cbs-dlsize').value;
        if (g('#cbs-dlcolor')) it.opts.dataLabelsColor = g('#cbs-dlcolor').value;
        if (g('#cbs-dlmode')) it.opts.dataLabelsShowPct = g('#cbs-dlmode').value === 'pct';
        if (g('#cbs-h')) {
          it.opts.height = +g('#cbs-h').value;
          const card = document.querySelector(`.cb-card[data-id="${it.id}"] .cb-card-body`);
          if (card) card.style.height = it.opts.height + 'px';
        }
        if (g('#cbs-span')) it.opts.span = +g('#cbs-span').value || 1;
        if (g('#cbs-inc')) it.opts.includeInReport = g('#cbs-inc').checked;
        if (g('#cbs-pericon')) it.opts.perIcon = +g('#cbs-pericon').value || 0;
        if (g('#cbs-igunit')) it.opts.igUnit = g('#cbs-igunit').value;
        if (g('#cbs-gmin')) it.opts.gaugeMin = g('#cbs-gmin').value === '' ? null : +g('#cbs-gmin').value;
        if (g('#cbs-gmax')) it.opts.gaugeMax = g('#cbs-gmax').value === '' ? null : +g('#cbs-gmax').value;
        if (g('#cbs-gtarget')) it.opts.gaugeTarget = g('#cbs-gtarget').value === '' ? null : +g('#cbs-gtarget').value;
        if (g('#cbs-tbtext')) it.opts.text = g('#cbs-tbtext').value;
      });
      drawCard(it);
      WorkflowManager.refresh();
      /* عنوان کارت هم به‌روز شود */
      const titleInp = document.querySelector(`[data-t="${it.id}"]`);
      if (titleInp) titleInp.value = it.title;
    });

    m.overlay.querySelectorAll('.cbs-tab').forEach(b => b.addEventListener('click', () => { curTab = b.dataset.tab; renderTab(); }));
    m.overlay.querySelector('[data-cbs-close]').addEventListener('click', () => { m.close(); UI.showView('charts'); });
    m.overlay.querySelector('[data-cbs-reset]').addEventListener('click', () => {
      UIKit.confirmBox({
        title: 'بازنشانی تنظیمات نمودار',
        message: 'همه تنظیمات ظاهری این نمودار به پیش‌فرض بازمی‌گردد (نوع و فیلدها حفظ می‌شود). ادامه می‌دهید؟',
        onConfirm: () => {
          UndoManager.runWithSnapshot('بازنشانی تنظیمات نمودار', ['charts'], () => {
            const keep = { type: it.type, title: it.title, catCol: it.catCol, catCol2: it.catCol2, valCol: it.valCol, xCol: it.xCol, yCol: it.yCol, agg: it.agg, sort: it.sort, topN: it.topN, id: it.id };
            const fresh = chartBuilder.defaultItem();
            Object.assign(it, keep, { opts: fresh.opts });
          });
          drawCard(it);
          m.close();
          UI.showView('charts');
          UIKit.toast('success', 'بازنشانی شد', 'تنظیمات ظاهری نمودار به پیش‌فرض بازگشت.');
        }
      });
    });

    renderTab();
  }
})();
