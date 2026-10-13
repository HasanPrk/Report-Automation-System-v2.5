/* ═══════════════════════════════════════════════════════════
   duplicateManager — تشخیص و مدیریت رکوردهای تکراری
   مشاهده گروه‌ها → انتخاب سیاست نگهداری → تأیید → اجرا (قابل واگرد)
   ═══════════════════════════════════════════════════════════ */
'use strict';

const duplicateManager = (function () {
  const F = () => Store.state.flow;

  function startCleaning() { return dataCleaner.startCleaning(); }

  /**
   * config: { mode: 'exact'|'keys', keyCols: [ci...], norm: {trim, persian, caseInsensitive} }
   * خروجی: { groups: [{id, rowIdxs: [ri...], keep: ri, rows: [{ri, row}]}], totalDupes }
   */
  function find(config) {
    const work = startCleaning();
    const norm = config.norm || { trim: true, persian: true, caseInsensitive: true };
    const keyOf = (row) => {
      let cells;
      if (config.mode === 'exact') cells = row.map((v, i) => v);
      else cells = config.keyCols.map(ci => row[ci]);
      return JSON.stringify(cells.map(v => {
        let s = String(v == null ? '' : v);
        if (norm.persian) s = s.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
        if (norm.trim) s = s.trim().replace(/\s{2,}/g, ' ');
        if (norm.caseInsensitive) s = s.toLowerCase();
        return s;
      }));
    };
    const map = new Map();
    work.rows.forEach((row, ri) => {
      const k = keyOf(row);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ri);
    });
    const groups = [];
    map.forEach((rowIdxs, k) => {
      if (rowIdxs.length > 1) groups.push({ id: groups.length + 1, rowIdxs, keep: null, rows: rowIdxs.map(ri => ({ ri, row: work.rows[ri] })) });
    });
    groups.forEach(g => { g.keep = defaultKeep(g, 'mostComplete'); });
    const totalDupes = groups.reduce((s, g) => s + g.rowIdxs.length - 1, 0);
    F().dupes.scanned = true;
    F().dupes.config = config;
    F().dupes.groups = groups;
    return { groups, totalDupes, scanned: work.rows.length };
  }

  function defaultKeep(group, policy) {
    if (policy === 'first') return group.rowIdxs[0];
    if (policy === 'last') return group.rowIdxs[group.rowIdxs.length - 1];
    // mostComplete: رکورد با کمترین سلول خالی؛ در تساوی، اولین
    let best = group.rowIdxs[0], bestEmpty = Infinity;
    group.rowIdxs.forEach(ri => {
      const row = group.rows.find(x => x.ri === ri).row;
      const empty = row.filter(v => String(v == null ? '' : v).trim() === '').length;
      if (empty < bestEmpty) { bestEmpty = empty; best = ri; }
    });
    return best;
  }

  /**
   * اعمال حذف تکراری‌ها
   * keepPolicy: 'first'|'last'|'mostComplete'
   * manualKeeps: {groupId: ri} انتخاب دستی کاربر (اولویت دارد)
   */
  function apply(keepPolicy, manualKeeps) {
    const f = F();
    const work = startCleaning();
    const groups = f.dupes.groups || [];
    if (!groups.length) return { ok: false, error: 'گروه تکراری‌ای برای حذف وجود ندارد. ابتدا جستجو را اجرا کنید.' };
    const toRemove = [];
    groups.forEach(g => {
      const keep = (manualKeeps && manualKeeps[g.id] != null) ? manualKeeps[g.id] : defaultKeep(g, keepPolicy);
      g.keep = keep;
      g.rowIdxs.forEach(ri => { if (ri !== keep) toRemove.push(ri); });
    });
    if (!toRemove.length) return { ok: false, error: 'رکوردی برای حذف انتخاب نشده است.' };
    const removeSet = new Set(toRemove);
    const inverse = { cells: [], removedRows: [] };
    toRemove.sort((a, b) => b - a).forEach(ri => {
      inverse.removedRows.push({ r: ri, row: work.rows[ri].slice() });
    });
    for (let ri = work.rows.length - 1; ri >= 0; ri--) {
      if (removeSet.has(ri)) work.rows.splice(ri, 1);
    }
    inverse.removedRows.sort((a, b) => a.r - b.r);
    const before = work.rows.length + toRemove.length;
    /* ثبت در موتور Undo سراسری — واگرد/اجرای مجدد از هر جای نرم‌افزار */
    /* نسخه ۲٫۴: مرجع work در زمان واگرد/اجرای مجدد از F() حل می‌شود (پرش گام، f.work را با کلون تازه عوض می‌کند) */
    const entry = {
      label: 'حذف رکوردهای تکراری',
      scope: 'clean',
      undo() {
        inverse.removedRows.forEach(x => { F().work.rows.splice(x.r, 0, x.row); });
        F().clean.log.push({ opId: '__undo', title: 'واگرد: حذف رکوردهای تکراری', at: new Date().toISOString(), changes: -1 });
        Store.emit('clean-undone');
      },
      redo() {
        const w = F().work;
        applyRedoInverse(w, inverse);
        /* ثبت مجدد عملیات مؤثر در گزارش تغییرات (هماهنگ با ناوبری گام‌ها — نسخه ۲٫۴) */
        F().clean.log.push({
          opId: '__dupes', title: 'حذف رکوردهای تکراری', params: { redoInverse: inverse }, at: new Date().toISOString(),
          changes: inverse.removedRows.length, rowsBefore: w.rows.length + inverse.removedRows.length, rowsAfter: w.rows.length,
          summary: `اجرای مجدد حذف ${Utils.fmtInt(inverse.removedRows.length)} رکورد تکراری`
        });
        F().clean.log.push({ opId: '__redo', title: 'اجرای مجدد: حذف رکوردهای تکراری', at: new Date().toISOString(), changes: -1 });
        Store.emit('clean-redone');
      }
    };
    if (typeof UndoManager !== 'undefined') UndoManager.push(entry);
    f.dupes.removedTotal += toRemove.length;
    f.clean.log.push({
      opId: '__dupes', title: 'حذف رکوردهای تکراری', params: { redoInverse: inverse }, at: new Date().toISOString(),
      changes: toRemove.length, rowsBefore: before, rowsAfter: work.rows.length,
      summary: `${Utils.fmtInt(toRemove.length)} رکورد تکراری از ${Utils.fmtInt(groups.length)} گروه حذف شد (سیاست: ${policyFa(keepPolicy)})`
    });
    /* ثبت گام در ناوبری «گام‌های اعمال‌شده» — با inverse برای بازپخش (نسخه ۲٫۴) */
    if (typeof dataCleaner !== 'undefined' && dataCleaner.recordStep) {
      dataCleaner.recordStep('حذف رکوردهای تکراری', '__dupes', { redoInverse: inverse }, work.rows.length, toRemove.length, `${Utils.fmtInt(toRemove.length)} رکورد حذف شد`);
    }
    f.dupes.groups = []; // پس از حذف، گروه‌ها منقضی می‌شوند
    Store.emit('dupes-applied');
    return { ok: true, removed: toRemove.length, rowsBefore: before, rowsAfter: work.rows.length };
  }

  /* اجرای مجدد حذف با نگاشت ذخیره‌شده ردیف‌ها */
  function applyRedoInverse(work, inv) {
    if (inv.removedRows && inv.removedRows.length) {
      inv.removedRows.slice().sort((a, b) => b.r - a.r).forEach(x => { work.rows.splice(x.r, 1); });
    }
  }

  function policyFa(p) {
    return { first: 'نگه‌داشتن اولین رکورد', last: 'نگه‌داشتن آخرین رکورد', mostComplete: 'نگه‌داشتن کامل‌ترین رکورد' }[p] || p;
  }

  return { find, apply, defaultKeep, policyFa };
})();
