/* ═══════════════════════════════════════════════════════════
   UIKit — توست، مودال، تأیید عملیات، بنر، اجزای رابط مشترک
   ═══════════════════════════════════════════════════════════ */
'use strict';

const UIKit = (function () {
  const { icon, esc } = Utils;

  /* ---------- توست ---------- */
  function toast(type, title, msg, ms) {
    const wrap = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const ic = type === 'success' ? 'checkCircle' : type === 'error' ? 'xCircle' : type === 'warning' ? 'alert' : 'info';
    el.innerHTML = `${icon(ic)}<div class="grow"><b>${esc(title)}</b>${msg ? `<span class="t-msg">${esc(msg)}</span>` : ''}</div>`;
    wrap.appendChild(el);
    const life = ms || (type === 'error' ? 6500 : 3800);
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 260); }, life);
  }

  /* ---------- مودال ---------- */
  let _openStack = [];
  function modal(opts) {
    // opts: {title, body(html), footer(html), size:'lg', onClose}
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal${opts.size === 'lg' ? ' modal-lg' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(opts.title || '')}</h3>
          <button class="icon-btn" data-close aria-label="بستن">${icon('x')}</button></div>
        <div class="modal-body">${opts.body || ''}</div>
        ${opts.footer !== false ? `<div class="modal-foot">${opts.footer || ''}</div>` : ''}
      </div>`;
    root.appendChild(overlay);
    const close = () => {
      overlay.remove();
      _openStack = _openStack.filter(x => x !== close);
      if (opts.onClose) opts.onClose();
    };
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    const escHandler = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
    _openStack.push(close);
    return { overlay, close };
  }

  /** مودال تأیید عملیات (جایگزین confirm مرورگر) */
  function confirmBox(opts) {
    // opts: {title, message, danger, confirmText, cancelText, onConfirm}
    const m = modal({
      title: opts.title || 'تأیید عملیات',
      body: `<div class="flex" style="align-items:flex-start;gap:12px">
          <span style="color:${opts.danger ? 'var(--danger)' : 'var(--warning)'};flex-shrink:0;margin-top:2px">${icon(opts.danger ? 'alert' : 'info', 26)}</span>
          <div>${opts.message || ''}</div></div>`,
      footer: `
        <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(opts.confirmText || 'تأیید و اجرا')}</button>
        <button class="btn btn-ghost" data-cancel>${esc(opts.cancelText || 'انصراف')}</button>`,
      onClose: opts.onCancel
    });
    m.overlay.querySelector('[data-ok]').addEventListener('click', () => { m.close(); if (opts.onConfirm) opts.onConfirm(); });
    m.overlay.querySelector('[data-cancel]').addEventListener('click', () => m.close());
    return m;
  }

  /* ---------- اجزای رندر مشترک ---------- */
  function banner(type, title, body, actionsHtml) {
    const ic = type === 'success' ? 'checkCircle' : type === 'error' ? 'xCircle' : type === 'warning' ? 'alert' : 'info';
    return `<div class="banner banner-${type}">${icon(ic)}<div class="grow">
      ${title ? `<div class="banner-title">${esc(title)}</div>` : ''}
      <div class="banner-body">${body || ''}</div>
      ${actionsHtml ? `<div class="banner-actions">${actionsHtml}</div>` : ''}
    </div></div>`;
  }

  function badge(type, text) {
    return `<span class="badge badge-${type}">${text}</span>`;
  }

  function emptyState(iconName, title, desc, actionHtml) {
    return `<div class="empty-state">
      <div class="es-icon">${icon(iconName)}</div>
      <div class="es-title">${esc(title)}</div>
      <p>${desc || ''}</p>
      ${actionHtml ? `<div class="mt-2">${actionHtml}</div>` : ''}
    </div>`;
  }

  function spinner(text) {
    return `<div class="center" style="padding:26px 0"><span class="spinner spinner-lg"></span>
      <div class="mt-2 text-muted">${esc(text || 'در حال پردازش…')}</div></div>`;
  }

  /** دکمه برگشت به بالا برای صفحات طولانی */
  function severityBadge(sev) {
    const map = { high: ['danger', 'بحرانی'], medium: ['warning', 'هشدار'], low: ['info', 'جزئی'], ok: ['success', 'سالم'] };
    const m = map[sev] || ['neutral', '—'];
    return badge(m[0], m[1]);
  }

  return { toast, modal, confirmBox, banner, badge, emptyState, spinner, severityBadge };
})();
