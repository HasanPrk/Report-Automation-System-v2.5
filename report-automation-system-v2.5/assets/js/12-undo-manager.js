/* ═══════════════════════════════════════════════════════════
   UndoManager — موتور واگرد/اجرای مجدد سراسری نرم‌افزار
   • برای «تمام بخش‌ها» کار می‌کند: دریافت داده، پاک‌سازی، تکراری‌ها،
     قالب، محاسبات، نمودارها، گزارش و تنظیمات
   • تا ۳۰ مرحله واگرد با شورتکات‌های استاندارد (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
   • دو مکانیزم: عملیاتی (inverse-based برای داده) و اسنپ‌شات (برای وضعیت‌های کوچک)
   ═══════════════════════════════════════════════════════════ */
'use strict';

const UndoManager = (function () {
  const MAX_STEPS = 30;

  let undoStack = [];
  let redoStack = [];
  const listeners = [];

  function subscribe(fn) { listeners.push(fn); }
  function notify() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error('undo listener', e); } }); }

  /** ثبت یک عملیات جدید — پس از هر عملیات جدید، زنجیره redo پاک می‌شود */
  function push(entry) {
    if (!entry || typeof entry.undo !== 'function') return;
    undoStack.push({
      label: entry.label || 'عملیات',
      scope: entry.scope || 'app',
      undo: entry.undo,
      redo: entry.redo || null
    });
    if (undoStack.length > MAX_STEPS) undoStack.shift();
    redoStack = [];
    notify();
  }

  function undo() {
    const e = undoStack.pop();
    if (!e) return { ok: false, error: 'عملیاتی برای واگرد وجود ندارد.' };
    try {
      e.undo();
      if (e.redo) redoStack.push(e);
      notify();
      return { ok: true, label: e.label };
    } catch (err) {
      console.error('undo error', err);
      return { ok: false, error: 'واگرد ناموفق: ' + (err && err.message ? err.message : err) };
    }
  }

  function redo() {
    const e = redoStack.pop();
    if (!e) return { ok: false, error: 'عملیاتی برای اجرای مجدد وجود ندارد.' };
    try {
      e.redo();
      undoStack.push(e);
      notify();
      return { ok: true, label: e.label };
    } catch (err) {
      console.error('redo error', err);
      return { ok: false, error: 'اجرای مجدد ناموفق: ' + (err && err.message ? err.message : err) };
    }
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }
  function topUndoLabel() { return undoStack.length ? undoStack[undoStack.length - 1].label : null; }
  function topRedoLabel() { return redoStack.length ? redoStack[redoStack.length - 1].label : null; }
  function undoCount() { return undoStack.length; }
  function clear() { undoStack = []; redoStack = []; notify(); }

  /**
   * اسنپ‌شات کلیدهای مشخصی از flow — برای بخش‌های با وضعیت کوچک
   * نمونه: UndoManager.runWithSnapshot('افزودن نمودار', ['charts'], () => { ...تغییرات... })
   * کلیدهای حجیم (raw/work/active) را فقط در عملیات import استفاده کنید.
   */
  function runWithSnapshot(label, keys, mutateFn) {
    const f = Store.state.flow;
    const before = {};
    keys.forEach(k => { before[k] = Utils.deepClone(f[k]); });
    let result;
    try { result = mutateFn(); }
    catch (err) { throw err; }
    const after = {};
    keys.forEach(k => { after[k] = Utils.deepClone(f[k]); });
    push({
      label,
      undo() { keys.forEach(k => { f[k] = Utils.deepClone(before[k]); }); },
      redo() { keys.forEach(k => { f[k] = Utils.deepClone(after[k]); }); }
    });
    return result;
  }

  /** ثبت دستی اسنپ‌شات «قبل از تغییر» — کلیدها را قبل از جهش کپی می‌کند و commit بعد از جهش صدا زده می‌شود */
  function snapshotBefore(label, keys) {
    const f = Store.state.flow;
    const before = {};
    keys.forEach(k => { before[k] = Utils.deepClone(f[k]); });
    let committed = false;
    return {
      commit() {
        if (committed) return;
        committed = true;
        const after = {};
        keys.forEach(k => { after[k] = Utils.deepClone(f[k]); });
        push({
          label,
          undo() { keys.forEach(k => { f[k] = Utils.deepClone(before[k]); }); },
          redo() { keys.forEach(k => { f[k] = Utils.deepClone(after[k]); }); }
        });
      },
      abort() { committed = true; }
    };
  }

  /* ---------- شورتکات‌های استاندارد کیبورد ---------- */
  function isEditableTarget(t) {
    if (!t) return false;
    const tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }

  function wireShortcuts() {
    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const key = (e.key || '').toLowerCase();
      // داخل فیلدهای متنی، واگردِ متن توسط خود مرورگر انجام شود
      if (isEditableTarget(e.target) && key === 'z' && !e.shiftKey) return;
      if (isEditableTarget(e.target) && key === 'y') return;
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const r = undo();
        if (r.ok) afterUndoRedoUI(r.label + ' واگرد شد'); else UIKit.toast('info', 'واگرد', r.error);
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        const r = redo();
        if (r.ok) afterUndoRedoUI(r.label + ' دوباره اجرا شد'); else UIKit.toast('info', 'اجرای مجدد', r.error);
      }
    });
  }

  function afterUndoRedoUI(msg) {
    try {
      UI.U.dupFound = null;
      UI.showView(Store.state.ui.view);
      WorkflowManager.refresh();
      uiShell.refreshUndoRedo();
      UIKit.toast('success', 'انجام شد', msg);
    } catch (err) { console.error('undo UI refresh', err); }
  }

  function init() { wireShortcuts(); }

  return { MAX_STEPS, push, undo, redo, canUndo, canRedo, topUndoLabel, topRedoLabel, undoCount, clear, runWithSnapshot, snapshotBefore, subscribe, init };
})();
