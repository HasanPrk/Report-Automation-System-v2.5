/* ═══════════════════════════════════════════════════════════
   uiJoin — رابط ترکیب (Merge/Join) جدول‌ها در مرحله دریافت داده
   • تفاوت روشن Append (چینش ردیف‌ها) و Join (اتصال ستونی با کلید)
   • پیش‌نمایش پیش از تأیید: نام ستون‌ها، تعداد ردیف‌ها، کلیدها،
     تعداد تخمینی ردیف خروجی + هشدارها
   • نسخه ۲٫۴: انتخاب ستون‌های جدول ۲ (مشابه Power Query) — پس از زدن Join،
     کاربر مشخص می‌کند از جدول دوم چه ستون‌هایی برداشته شود؛ ستون‌های کلیدی
     همیشه حفظ می‌شوند و انتخاب پیش‌فرض «همه ستون‌ها» است.
   • لغو کامل عملیات؛ داده اصلی هرگز جهش نمی‌کند
   ═══════════════════════════════════════════════════════════ */
'use strict';

const uiJoin = (function () {
  const { icon, esc } = Utils;

  /* tables: [{id, name, sheet, dataset}] — حداقل ۲ مورد */
  function openDialog(tables, onConfirm) {
    if (!tables || tables.length < 2) {
      UIKit.toast('warning', 'ترکیب جدول‌ها', 'برای Join حداقل دو جدول انتخاب کنید.');
      return;
    }
    const S = {
      leftIdx: 0,
      rightIdx: tables.length > 1 ? 1 : 0,
      type: 'left',
      pairs: [{ a: '', b: '' }],
      norm: true,
      lastPreview: null,
      includeAll: true,   /* نسخه ۲٫۴: همه ستون‌های جدول ۲؟ */
      includeB: []        /* در غیر این صورت فهرست نام ستون‌های انتخابی */
    };

    const m = UIKit.modal({
      title: 'ترکیب جدول‌ها (Merge / Join)',
      size: 'lg',
      body: `<div id="uj-body"></div>`,
      footer: `<button class="btn btn-primary" data-uj-ok disabled>${icon('checkCircle')}اعمال Join</button>
               <button class="btn btn-ghost" data-uj-cancel>انصراف</button>`
    });
    const okBtn = m.overlay.querySelector('[data-uj-ok]');
    m.overlay.querySelector('[data-uj-cancel]').addEventListener('click', () => m.close());

    const dsOf = i => tables[i].dataset;
    const nameOf = i => `${tables[i].name} — شیت «${tables[i].sheet}»`;

    function renderBody() {
      const body = m.overlay.querySelector('#uj-body');
      const dsA = dsOf(S.leftIdx), dsB = dsOf(S.rightIdx);
      const pairsValid = S.type === 'cross' || S.pairs.some(p => p.a && p.b);
      const pv = pairsValid ? joinEngine.preview(dsA, dsB, S.type, S.pairs.filter(p => p.a && p.b), { normalizeFa: S.norm, normalizeDigits: S.norm }) : null;
      S.lastPreview = pv;

      const pairRows = S.type === 'cross' ? '' : S.pairs.map((p, i) => `
        <div class="uj-pair" style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <select class="select" data-pa="${i}" style="flex:1">
            <option value="">— کلید در جدول ۱ —</option>
            ${dsA.columns.map(c => `<option value="${esc(c.name)}" ${p.a === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
          <span class="text-soft">⟷</span>
          <select class="select" data-pb="${i}" style="flex:1">
            <option value="">— کلید در جدول ۲ —</option>
            ${dsB.columns.map(c => `<option value="${esc(c.name)}" ${p.b === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-ghost" data-pdel="${i}" title="حذف این جفت‌کلید" ${S.pairs.length <= 1 ? 'disabled' : ''}>${icon('x', 13)}</button>
        </div>`).join('');

      body.innerHTML = `
        <div class="banner banner-info">${icon('info')}<div><b>Append یا Join؟</b>
          Append ردیف‌های جدول‌ها را زیر هم می‌چیند (نیازمند ساختار ستونی سازگار). Join ستون‌های دو جدول را بر اساس کلید(های) مشترک کنار هم می‌گذارد.</div></div>

        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label>جدول ۱ (چپ)</label>
            <select class="select" data-uj-left>
              ${tables.map((t, i) => `<option value="${i}" ${i === S.leftIdx ? 'selected' : ''}>${esc(nameOf(i))} — ${Utils.fmtInt(t.dataset.rows.length)}×${Utils.fmtInt(t.dataset.columns.length)}</option>`).join('')}
            </select></div>
          <div class="field"><label>جدول ۲ (راست)</label>
            <select class="select" data-uj-right>
              ${tables.map((t, i) => `<option value="${i}" ${i === S.rightIdx ? 'selected' : ''}>${esc(nameOf(i))} — ${Utils.fmtInt(t.dataset.rows.length)}×${Utils.fmtInt(t.dataset.columns.length)}</option>`).join('')}
            </select></div>
        </div>

        <div class="field"><label>نوع Join</label>
          <div class="ai-mode-opts">
            ${Object.entries(joinEngine.JOIN_TYPES).map(([k, v]) => `
              <label class="ai-mode-opt ${S.type === k ? 'selected' : ''}">
                <input type="radio" name="uj-type" value="${k}" ${S.type === k ? 'checked' : ''}>
                <div><b>${esc(v.label)}</b><small>${esc(v.hint)}${k === 'cross' ? ` خروجی: ${Utils.fmtInt(dsA.rows.length * dsB.rows.length)} ردیف.` : ''}</small></div>
              </label>`).join('')}
          </div>
        </div>

        ${S.type !== 'cross' ? `
        <div class="field"><label>کلید(های) مشترک — تطبیق ستون جدول ۱ با جدول ۲</label>
          ${pairRows}
          <button class="btn btn-sm btn-secondary" data-padd>${icon('plus', 13)}افزودن جفت‌کلید (برای Join چندستونی)</button>
          <div class="checkbox-row" style="margin-top:8px">
            <label><input type="checkbox" data-uj-norm ${S.norm ? 'checked' : ''}> نرمال‌سازی مقایسه کلیدها (فاصله‌ها، ی/ک عربی و ارقام فارسی/عربی)</label>
          </div>
        </div>
        ${includeBHTML(dsB)}` : `<div class="banner banner-warning">${icon('alert')}<div>Cross Join کلید لازم ندارد؛ هر ردیف جدول ۱ با هر ردیف جدول ۲ جفت می‌شود.</div></div>`}

        <div class="field"><label>پیش‌نمایش نتیجه</label>
          ${pv ? previewHTML(dsA, dsB, pv) : '<div class="banner banner-warning">' + icon('alert') + '<div>برای مشاهده پیش‌نمایش، جفت‌کلید(ها) را انتخاب کنید.</div></div>'}
        </div>`;

      /* رویدادها */
      body.querySelector('[data-uj-left]').addEventListener('change', e => {
        S.leftIdx = +e.target.value;
        if (S.rightIdx === S.leftIdx) S.rightIdx = (S.leftIdx + 1) % tables.length;
        autoDetectKeys(); renderBody();
      });
      body.querySelector('[data-uj-right]').addEventListener('change', e => {
        S.rightIdx = +e.target.value;
        if (S.rightIdx === S.leftIdx) S.leftIdx = (S.rightIdx + 1) % tables.length;
        autoDetectKeys(); renderBody();
      });
      body.querySelectorAll('input[name="uj-type"]').forEach(r => r.addEventListener('change', () => {
        S.type = r.value; renderBody();
      }));
      body.querySelectorAll('[data-pa]').forEach(sel => sel.addEventListener('change', () => { S.pairs[+sel.dataset.pa].a = sel.value; renderBody(); }));
      body.querySelectorAll('[data-pb]').forEach(sel => sel.addEventListener('change', () => { S.pairs[+sel.dataset.pb].b = sel.value; renderBody(); }));
      const padd = body.querySelector('[data-padd]');
      if (padd) padd.addEventListener('click', () => { S.pairs.push({ a: '', b: '' }); renderBody(); });
      body.querySelectorAll('[data-pdel]').forEach(b => b.addEventListener('click', () => { S.pairs.splice(+b.dataset.pdel, 1); renderBody(); }));
      const norm = body.querySelector('[data-uj-norm]');
      if (norm) norm.addEventListener('change', () => { S.norm = norm.checked; renderBody(); });
      /* انتخاب ستون‌های جدول ۲ (نسخه ۲٫۴) */
      const incAll = body.querySelector('[data-uj-incall]');
      if (incAll) incAll.addEventListener('change', () => {
        S.includeAll = incAll.checked;
        if (S.includeAll) S.includeB = [];
        else {
          const keyB = new Set(S.pairs.filter(p => p.a && p.b).map(p => p.b));
          S.includeB = dsB.columns.filter(c => keyB.has(c.name)).map(c => c.name);
        }
        renderBody();
      });
      body.querySelectorAll('[data-uj-inc]').forEach(cb => cb.addEventListener('change', () => {
        const nm = cb.dataset.ujInc;
        if (cb.checked) { if (!S.includeB.includes(nm)) S.includeB.push(nm); }
        else S.includeB = S.includeB.filter(x => x !== nm);
        const lbl = body.querySelector('#uj-inc-count');
        if (lbl) lbl.textContent = joinEngine.includeBLabel(dsB, S.includeB);
      }));

      okBtn.disabled = !pv;
      if (pv && (pv.missingPairs.length || (!pv.outRows && pv.type === 'inner'))) {
        okBtn.disabled = true;
      }
    }

    function autoDetectKeys() {
      /* تشخیص خودکار جفت‌کلید با نام یکسان */
      const a = dsOf(S.leftIdx), b = dsOf(S.rightIdx);
      const namesB = new Set(b.columns.map(c => c.name));
      const shared = a.columns.filter(c => namesB.has(c.name));
      S.pairs = shared.length ? shared.slice(0, 3).map(c => ({ a: c.name, b: c.name })) : [{ a: '', b: '' }];
    }

    /* ---------- انتخاب ستون‌های جدول ۲ (مشابه Power Query — نسخه ۲٫۴) ---------- */
    function includeBHTML(dsB) {
      const keyB = new Set(S.pairs.filter(p => p.a && p.b).map(p => p.b));
      return `
      <div class="field uj-include">
        <label>${icon('columns', 13)} ستون‌هایی که از جدول ۲ برداشته می‌شود <span class="text-muted small" id="uj-inc-count">${joinEngine.includeBLabel(dsB, S.includeAll ? null : S.includeB)}</span></label>
        <div class="checkbox-row" style="margin-bottom:6px">
          <label><input type="checkbox" data-uj-incall ${S.includeAll ? 'checked' : ''}> همه ستون‌های جدول ۲ (پیش‌فرض)</label>
        </div>
        ${S.includeAll ? '' : `
        <div class="uj-inc-list">
          ${dsB.columns.map(c => {
            const isKey = keyB.has(c.name);
            const checked = isKey || S.includeB.includes(c.name);
            return `<label class="checkbox-row uj-inc-item ${isKey ? 'is-key' : ''}" title="${isKey ? 'ستون کلیدی — همیشه حفظ می‌شود' : ''}">
              <input type="checkbox" data-uj-inc="${esc(c.name)}" ${checked ? 'checked' : ''} ${isKey ? 'disabled' : ''}>
              <span>${esc(c.name)}</span>${isKey ? '<small class="badge badge-info">کلید</small>' : ''}<small class="text-muted">${Utils.typeFa(c.type)}</small>
            </label>`;
          }).join('')}
        </div>
        <span class="field-help">مشابه Power Query: فقط ستون‌های علامت‌خورده به خروجی Join اضافه می‌شوند. ستون‌های کلیدی برای صحت Join همیشه نگه داشته می‌شوند.</span>`}
      </div>`;
    }

    function previewHTML(dsA, dsB, pv) {
      let h = `<div class="grid-stats" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
        <div class="stat-card accent-primary"><span class="stat-label">ردیف جدول ۱</span><span class="stat-value">${Utils.fmtInt(pv.rowsA)}</span></div>
        <div class="stat-card accent-primary"><span class="stat-label">ردیف جدول ۲</span><span class="stat-value">${Utils.fmtInt(pv.rowsB)}</span></div>
        <div class="stat-card accent-success"><span class="stat-label">ردیف خروجی</span><span class="stat-value">${Utils.fmtInt(pv.outRows)}</span></div>
        <div class="stat-card accent-info"><span class="stat-label">مطابق</span><span class="stat-value">${Utils.fmtInt(pv.matchedA)}</span></div>
        <div class="stat-card ${pv.unmatchedA || pv.unmatchedB ? 'accent-warning' : 'accent-success'}"><span class="stat-label">بدون تطابق</span><span class="stat-value">${Utils.fmtInt(pv.unmatchedA)} / ${Utils.fmtInt(pv.unmatchedB)}</span></div>
      </div>`;
      if (pv.warnings.length) {
        h += `<div class="banner banner-warning">${icon('alert')}<div>${pv.warnings.map(w => esc(w)).join('<br>')}</div></div>`;
      }
      /* نام ستون‌های خروجی — با درنظرگرفتن انتخاب ستون‌های جدول ۲ */
      const pr = joinEngine.resolvePairs(dsA, dsB, S.pairs.filter(p => p.a && p.b));
      if (S.type !== 'cross' && pr.length) {
        const sfx = ' (جدول ۲)';
        const used = new Set(dsA.columns.map(c => c.name));
        const keyB = new Set(pr.map(p => p.b));
        const sel = (!S.includeAll && S.includeB.length) ? new Set(S.includeB) : null;
        const outCols = dsA.columns.map(c => ({ n: c.name, side: '۱' }));
        dsA.columns.forEach(c => used.add(c.name));
        dsB.columns.forEach(c => {
          if (sel && !sel.has(c.name) && !keyB.has(c.name)) return;
          const nm = used.has(c.name) ? c.name + sfx : c.name;
          outCols.push({ n: nm, side: '۲' });
        });
        h += `<div class="field" style="margin-top:8px"><label>ستون‌های خروجی (${Utils.fmtInt(outCols.length)})</label>
          <div class="flex flex-wrap">${outCols.map(c => `<span class="badge badge-${c.side === '۱' ? 'info' : 'neutral'}" title="از جدول ${c.side}">${esc(c.n)}</span>`).join('')}</div></div>`;
      }
      return h;
    }

    okBtn.addEventListener('click', () => {
      try {
        const dsA = dsOf(S.leftIdx), dsB = dsOf(S.rightIdx);
        const pairs = S.type === 'cross' ? [] : S.pairs.filter(p => p.a && p.b);
        const res = joinEngine.join(dsA, dsB, S.type, pairs, { normalizeFa: S.norm, normalizeDigits: S.norm, suffixB: ' (جدول ۲)', includeB: S.includeAll ? null : S.includeB.slice() });
        res.dataset.meta.sourceNote = `Join(${joinEngine.JOIN_TYPES[S.type].label}) «${nameOf(S.leftIdx)}» با «${nameOf(S.rightIdx)}» — ${joinEngine.includeBLabel(dsB, S.includeAll ? null : S.includeB)}`;
        m.close();
        UIKit.toast('success', 'Join اعمال شد', `${Utils.fmtInt(res.dataset.rows.length)} ردیف خروجی ساخته شد.`);
        onConfirm(res.dataset);
      } catch (err) {
        UIKit.toast('error', 'Join ناموفق', err.message);
      }
    });

    autoDetectKeys();
    renderBody();
  }

  return { openDialog };
})();
