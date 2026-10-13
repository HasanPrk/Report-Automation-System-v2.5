/* ═══════════════════════════════════════════════════════════
   authUI — حساب کاربری محلی: ثبت‌نام، تأیید ایمیل، ورود، خروج
   و مدیریت امن API Key (نگهداری رمزنگاری‌شده سمت سرور)
   • اگر سرور محلی در دسترس نباشد (اجرا با file://)، برنامه به‌طور
     کامل بدون حساب کار می‌کند (AI خاموش/نمایشی) و وضعیت شفاف اعلام می‌شود.
   • هیچ رمز/کد/کلیدی در console یا localStorage نوشته نمی‌شود.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const authClient = (function () {
  const S = { user: null, serverOk: null, checking: false };
  const listeners = [];

  async function api(method, path, body) {
    const r = await fetch(path, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body ? {} : {}),
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    });
    let data = {};
    try { data = await r.json(); } catch (e) { /* پاسخ غیرJSON */ }
    return { status: r.status, ok: r.ok, data };
  }

  async function probe() {
    try {
      const r = await fetch('/api/health', { credentials: 'same-origin' });
      S.serverOk = r.ok;
    } catch (e) { S.serverOk = false; }
    return S.serverOk;
  }

  async function restore() {
    S.checking = true;
    try {
      const ok = await probe();
      if (!ok) { S.user = null; return null; }
      const res = await api('GET', '/api/auth/me');
      S.user = res.ok ? res.data.user : null;
    } finally { S.checking = false; notify(); }
    return S.user;
  }

  function notify() { listeners.forEach(fn => { try { fn(S); } catch (e) { console.error('auth listener', e); } }); }
  function subscribe(fn) { listeners.push(fn); }

  return {
    S, api, probe, restore, subscribe,
    register: (email, p1, p2) => api('POST', '/api/auth/register', { email, password: p1, password2: p2 }),
    verify: (email, code) => api('POST', '/api/auth/verify', { email, code }),
    resend: (email) => api('POST', '/api/auth/resend', { email }),
    login: (email, password) => api('POST', '/api/auth/login', { email, password }),
    logout: () => api('POST', '/api/auth/logout', {}),
    me: () => api('GET', '/api/auth/me'),
    saveKey: (key) => api('POST', '/api/user/apikey/save', { key }),
    deleteKey: () => api('POST', '/api/user/apikey/delete', {}),
    testKey: (endpoint, model) => api('POST', '/api/user/apikey/test', { endpoint, model }),
    changePassword: (cur, n1, n2) => api('POST', '/api/auth/change-password', { currentPassword: cur, newPassword: n1, newPassword2: n2 }),
    resetPassword: (email, rec, n1, n2) => api('POST', '/api/auth/reset-password', { email, recoveryCode: rec, newPassword: n1, newPassword2: n2 })
  };
})();

const authUI = (function () {
  const { icon, esc } = Utils;

  function init() {
    const btn = document.getElementById('btn-account');
    if (btn) btn.addEventListener('click', openAccount);
    authClient.subscribe(updateBadge);
    authClient.restore().then(updateBadge).catch(() => { });
  }

  function updateBadge() {
    const btn = document.getElementById('btn-account');
    const lbl = document.getElementById('account-label');
    if (!btn) return;
    const u = authClient.S.user;
    if (lbl) lbl.textContent = u ? u.email.split('@')[0] : 'ورود / ثبت‌نام';
    btn.title = u ? `حساب: ${u.email}` : 'ورود یا ثبت‌نام در سیستم محلی';
    btn.classList.toggle('logged-in', !!u);
  }

  /* ---------- پنجره اصلی حساب ---------- */
  function openAccount() {
    if (authClient.S.serverOk === null || authClient.S.checking) {
      authClient.restore().then(openAccountInner);
    } else openAccountInner();
  }

  function openAccountInner() {
    const u = authClient.S.user;
    if (u) openSettings(u);
    else openLoginRegister();
  }

  /* ---------- ورود / ثبت‌نام / تأیید ---------- */
  function openLoginRegister() {
    const m = UIKit.modal({
      title: 'حساب کاربری (سیستم محلی)',
      size: 'lg',
      body: `
        <div class="banner banner-info">${icon('info')}<div>حساب کاربری <b>فقط روی همین سیستم</b> ساخته می‌شود (پایگاه‌داده محلی SQLite). هدف: تأیید ایمیل با کد یک‌بارمصرف و نگهداری امن API Key هوش مصنوعی، بدون وابستگی به سرویس ابری. استفاده از نرم‌افزار در حالت‌های «AI خاموش» و «نمایشی» بدون حساب هم کامل است.</div></div>
        <div class="ai-mode-opts" style="margin-top:10px">
          <label class="ai-mode-opt selected" data-tab="login">
            <input type="radio" name="acc-tab" value="login" checked>
            <div><b>${icon('lock', 14)} ورود</b><small>با ایمیل و رمز عبور حساب تأییدشده.</small></div>
          </label>
          <label class="ai-mode-opt" data-tab="register">
            <input type="radio" name="acc-tab" value="register">
            <div><b>${icon('users', 14)} ثبت‌نام جدید</b><small>ایمیل + رمز + تکرار رمز، سپس تأیید با کد.</small></div>
          </label>
        </div>
        <div id="acc-server-state"></div>
        <div id="acc-pane"></div>`,
      footer: `<button class="btn btn-ghost" data-cancel>بستن</button>`
    });
    m.overlay.querySelector('[data-cancel]').addEventListener('click', () => m.close());
    const pane = m.overlay.querySelector('#acc-pane');
    const stateBox = m.overlay.querySelector('#acc-server-state');

    /* تب ورود/ثبت‌نام + نمایش وضعیت سرور محلی (توابع زیر hoist هستند) */
    m.overlay.querySelectorAll('input[name="acc-tab"]').forEach(r => r.addEventListener('change', () => {
      m.overlay.querySelectorAll('.ai-mode-opt[data-tab]').forEach(o => o.classList.toggle('selected', o.querySelector('input').checked));
      if (r.checked && r.value === 'register') renderRegister(); else renderLogin();
    }));
    serverState();
    renderLogin();

    function serverState() {
      stateBox.innerHTML = authClient.S.serverOk === false
        ? `<div class="banner banner-warning">${icon('alert')}<div>سرور محلی در دسترس نیست (احتمالاً برنامه با file:// باز شده است). برای استفاده از حساب کاربری، برنامه را با <span class="code-inline">python run.py</span> اجرا کنید. بقیه قابلیت‌ها بدون حساب کار می‌کنند.</div></div>`
        : '';
    }

    function renderLogin() {
      pane.innerHTML = `
        <div class="field"><label>ایمیل (شناسه کاربری)</label>
          <input class="input" id="lg-email" type="email" dir="ltr" autocomplete="username" placeholder="you@example.com"></div>
        <div class="field"><label>رمز عبور</label>
          <input class="input" id="lg-pass" type="password" dir="ltr" autocomplete="current-password"></div>
        <div id="lg-msg"></div>
        <div class="flex" style="gap:8px;flex-wrap:wrap;margin-top:6px">
          <button class="btn btn-primary" id="lg-do">${icon('lock', 14)}ورود</button>
          <button class="btn btn-ghost btn-sm" id="lg-forgot">فراموشی رمز؟</button>
        </div>`;
      pane.querySelector('#lg-do').addEventListener('click', doLogin);
      pane.querySelector('#lg-forgot').addEventListener('click', renderForgot);
      pane.querySelector('#lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    }

    async function doLogin() {
      const email = pane.querySelector('#lg-email').value.trim();
      const pass = pane.querySelector('#lg-pass').value;
      const msg = pane.querySelector('#lg-msg');
      if (!email || !pass) { msg.innerHTML = UIKit.banner('warning', '', 'ایمیل و رمز عبور را وارد کنید.'); return; }
      msg.innerHTML = UIKit.spinner('در حال بررسی…');
      const res = await authClient.login(email, pass);
      if (res.ok) {
        authClient.S.user = res.data.user;
        authClient.notify && authClient.notify();
        m.close();
        updateBadge();
        refreshAppAuth();
        UIKit.toast('success', 'خوش آمدید', `وارد حساب ${email} شدید.`);
      } else {
        const extra = res.status === 403 ? ' <button class="btn btn-sm btn-secondary" id="lg-verify-now">تأیید ایمیل الان</button>' : '';
        msg.innerHTML = UIKit.banner('danger', '', esc(res.data.error || 'ورود ناموفق بود.') + extra);
        const v = msg.querySelector('#lg-verify-now');
        if (v) v.addEventListener('click', () => { openVerify(email, null, m); });
      }
    }

    function renderRegister() {
      pane.innerHTML = `
        <div class="field"><label>ایمیل (شناسه کاربری — تأییدمالکیت با کد)</label>
          <input class="input" id="rg-email" type="email" dir="ltr" autocomplete="off" placeholder="you@example.com"></div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label>رمز عبور (حداقل ۸ نویسه)</label>
            <input class="input" id="rg-pass" type="password" dir="ltr" autocomplete="new-password"></div>
          <div class="field"><label>تکرار رمز عبور</label>
            <input class="input" id="rg-pass2" type="password" dir="ltr" autocomplete="new-password"></div>
        </div>
        <div id="rg-msg"></div>
        <button class="btn btn-primary" id="rg-do" style="margin-top:6px">${icon('users', 14)}ثبت‌نام و دریافت کد تأیید</button>`;
      pane.querySelector('#rg-do').addEventListener('click', doRegister);
    }

    async function doRegister() {
      const email = pane.querySelector('#rg-email').value.trim();
      const p1 = pane.querySelector('#rg-pass').value;
      const p2 = pane.querySelector('#rg-pass2').value;
      const msg = pane.querySelector('#rg-msg');
      if (!email || !p1) { msg.innerHTML = UIKit.banner('warning', '', 'ایمیل و رمز را وارد کنید.'); return; }
      if (p1 !== p2) { msg.innerHTML = UIKit.banner('warning', '', 'رمز و تکرار آن یکسان نیستند.'); return; }
      msg.innerHTML = UIKit.spinner('در حال ثبت‌نام…');
      const res = await authClient.register(email, p1, p2);
      if (res.ok) {
        openVerify(res.data.email, res.data.localCode, m);
      } else {
        msg.innerHTML = UIKit.banner('danger', '', esc(res.data.error || 'ثبت‌نام ناموفق بود.'));
      }
    }

    /* تأیید ایمیل با کد یک‌بارمصرف */
    function openVerify(email, localCode, parentModal) {
      if (parentModal) parentModal.close();
      const vm = UIKit.modal({
        title: 'تأیید ایمیل',
        body: `
          ${localCode ? `<div class="banner banner-warning">${icon('info')}<div><b>حالت محلی:</b> سرویس ایمیل تنظیم نشده است، بنابراین کد تأیید اینجا نمایش داده می‌شود (فقط روی سیستم خودتان). اگر بعداً متغیرهای SMTP را تنظیم کنید، کد به‌صورت ایمیلی ارسال می‌شود.</div></div>
          <div class="otp-code" dir="ltr">${esc(localCode)}</div>` : `<div class="banner banner-info">${icon('mail')}<div>کد تأیید ۶رقمی به <b dir="ltr">${esc(email)}</b> ارسال شد. آن را در فرم زیر وارد کنید.</div></div>`}
          <div class="field"><label>کد تأیید یک‌بارمصرف</label>
            <input class="input" id="vf-code" dir="ltr" inputmode="numeric" maxlength="6" placeholder="۰۰۰۰۰۰" style="letter-spacing:6px;text-align:center;font-size:20px"></div>
          <div id="vf-msg"></div>
          <div class="flex" style="gap:8px;margin-top:6px">
            <button class="btn btn-primary" id="vf-do">${icon('checkCircle', 14)}تأیید حساب</button>
            <button class="btn btn-ghost btn-sm" id="vf-resend" disabled>ارسال مجدد کد (۶۰)</button>
          </div>`,
        footer: `<button class="btn btn-ghost" data-cancel>بستن</button>`
      });
      vm.overlay.querySelector('[data-cancel]').addEventListener('click', () => vm.close());
      const msg = vm.overlay.querySelector('#vf-msg');
      const codeIn = vm.overlay.querySelector('#vf-code');
      const resendBtn = vm.overlay.querySelector('#vf-resend');
      codeIn.focus();

      /* شمارش معکوس ارسال مجدد */
      let left = 60;
      resendBtn.textContent = `ارسال مجدد کد (${Utils.faDig(left)})`;
      const timer = setInterval(() => {
        left--;
        if (left <= 0) { clearInterval(timer); resendBtn.disabled = false; resendBtn.textContent = 'ارسال مجدد کد'; }
        else resendBtn.textContent = `ارسال مجدد کد (${Utils.faDig(left)})`;
      }, 1000);

      resendBtn.addEventListener('click', async () => {
        const res = await authClient.resend(email);
        if (res.ok && res.data.localCode) {
          codeIn.insertAdjacentHTML('afterend', '');
          msg.innerHTML = `<div class="banner banner-warning">${icon('info')}<div><b>حالت محلی:</b> کد جدید: <span class="code-inline" dir="ltr">${esc(res.data.localCode)}</span></div></div>`;
        } else if (res.ok) {
          msg.innerHTML = UIKit.banner('success', '', 'کد جدید ارسال شد.');
        } else {
          msg.innerHTML = UIKit.banner('danger', '', esc(res.data.error || 'ارسال مجدد ناموفق بود.'));
        }
      });

      const doVerify = async () => {
        const code = codeIn.value.trim();
        if (!code) { msg.innerHTML = UIKit.banner('warning', '', 'کد را وارد کنید.'); return; }
        msg.innerHTML = UIKit.spinner('در حال بررسی کد…');
        const res = await authClient.verify(email, code);
        if (res.ok) {
          clearInterval(timer);
          vm.close(); /* بستن پنجره تأیید قبل از نمایش کد بازیابی */
          showRecoveryCode(email, res.data.recoveryCode);
        } else {
          msg.innerHTML = UIKit.banner('danger', '', esc(res.data.error || 'کد نادرست است.'));
        }
      };
      vm.overlay.querySelector('#vf-do').addEventListener('click', doVerify);
      codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') doVerify(); });
    }

    /* نمایش یک‌باره کد بازیابی */
    function showRecoveryCode(email, recoveryCode) {
      const rm = UIKit.modal({
        title: 'حساب تأیید شد ✓',
        body: `
          <div class="banner banner-success">${icon('checkCircle')}<div>ایمیل <b dir="ltr">${esc(email)}</b> تأیید و حساب فعال شد. اکنون می‌توانید وارد شوید.</div></div>
          <div class="field"><label>کد بازیابی حساب (فقط همین یک‌بار نمایش داده می‌شود)</label>
            <div class="otp-code" dir="ltr" style="font-size:17px">${esc(recoveryCode)}</div>
            <span class="field-help">این کد را در جای امنی ذخیره کنید. در صورت فراموشی رمز عبور، با همین کد می‌توانید رمز جدید بگذارید.</span></div>
          <div class="flex" style="gap:8px">
            <button class="btn btn-secondary btn-sm" id="rc-copy">${icon('clipboard', 13)}کپی کد</button>
          </div>`,
        footer: `<button class="btn btn-primary" data-done>${icon('lock', 14)}رفتن به ورود</button>
                 <button class="btn btn-ghost" data-close-btn>بستن</button>`
      });
      rm.overlay.querySelector('#rc-copy').addEventListener('click', () => {
        navigator.clipboard && navigator.clipboard.writeText(recoveryCode);
        UIKit.toast('success', 'کپی شد', 'کد بازیابی در کلیپ‌بورد کپی شد.');
      });
      rm.overlay.querySelector('[data-done]').addEventListener('click', () => { rm.close(); openLoginRegister(); });
      rm.overlay.querySelector('[data-close-btn]').addEventListener('click', () => rm.close());
    }

    /* بازیابی رمز با کد بازیابی */
    function renderForgot() {
      pane.innerHTML = `
        <div class="banner banner-info">${icon('info')}<div>رمز عبور جدید را با «کد بازیابی» که هنگام تأیید حساب دریافت کرده‌اید بازنشانی کنید. پس از بازیابی، همه نشست‌های فعال خاتمه می‌یابند و کد بازیابی جدید صادر می‌شود.</div></div>
        <div class="field"><label>ایمیل</label><input class="input" id="fp-email" type="email" dir="ltr"></div>
        <div class="field"><label>کد بازیابی</label><input class="input" id="fp-code" dir="ltr" style="letter-spacing:2px"></div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label>رمز جدید</label><input class="input" id="fp-p1" type="password" dir="ltr"></div>
          <div class="field"><label>تکرار رمز جدید</label><input class="input" id="fp-p2" type="password" dir="ltr"></div>
        </div>
        <div id="fp-msg"></div>
        <button class="btn btn-primary" id="fp-do" style="margin-top:6px">${icon('refresh', 14)}بازنشانی رمز</button>`;
      pane.querySelector('#fp-do').addEventListener('click', async () => {
        const g = id => pane.querySelector(id).value;
        const msg = pane.querySelector('#fp-msg');
        msg.innerHTML = UIKit.spinner('در حال بررسی…');
        const res = await authClient.resetPassword(g('#fp-email').trim(), g('#fp-code'), g('#fp-p1'), g('#fp-p2'));
        if (res.ok) {
          showRecoveryCode(g('#fp-email').trim(), res.data.recoveryCode);
        } else msg.innerHTML = UIKit.banner('danger', '', esc(res.data.error || 'بازیابی ناموفق بود.'));
      });
    }
  }

  /* ---------- تنظیمات حساب (کاربر واردشده) ---------- */
  function openSettings(u) {
      const key = u.apiKey || { exists: false };
      const m = UIKit.modal({
        title: 'حساب کاربری',
        size: 'lg',
        body: `
          <div class="grid-stats" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
            <div class="stat-card accent-primary"><span class="stat-label">حساب</span><span class="stat-value" style="font-size:14px" dir="ltr">${esc(u.email)}</span><span class="stat-note">تأییدشده ✓ — سیستم محلی</span></div>
            <div class="stat-card ${key.exists ? 'accent-success' : 'accent-warning'}"><span class="stat-label">کلید API هوش مصنوعی</span>
              <span class="stat-value">${key.exists ? 'ذخیره شده ✓' : 'ثبت نشده'}</span>
              <span class="stat-note">${key.exists ? `وضعیت: ${key.status === 'valid' ? 'معتبر' : key.status === 'invalid' ? 'نامعتبر/آزمایش‌نشده' : 'ذخیره‌شده'} — ${esc(key.hint)}` : 'برای حالت «هوش مصنوعی فعال» لازم است'}</span></div>
          </div>

          <div class="settings-group">
            <div class="settings-group-title">${icon('zap', 13)} کلید API هوش مصنوعی</div>
            <p class="text-soft" style="font-size:12.6px;margin:4px 0 8px">کلید به‌صورت رمزنگاری‌شده <b>سمت سرور محلی</b> ذخیره می‌شود و هرگز دوباره به مرورگر نشان داده نمی‌شود (فقط بخش ماسک‌شده). درخواست‌های AI از مسیر امن سرور با کلید شما ارسال می‌شوند.</p>
            <div class="field"><label>${key.exists ? 'جایگزینی کلید' : 'ثبت کلید'}</label>
              <input class="input" id="ak-key" type="password" dir="ltr" placeholder="sk-…" autocomplete="off">
              <span class="field-help">کلید فقط یک‌بار در این فرم تایپ می‌شود؛ پس از ذخیره، تنها وضعیت و بخش آخر آن نمایش داده می‌شود.</span></div>
            <div class="flex" style="gap:8px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" id="ak-save">${icon('save', 13)}ذخیره امن</button>
              ${key.exists ? `<button class="btn btn-secondary btn-sm" id="ak-test">${icon('shield', 13)}بررسی اعتبار</button>
              <button class="btn btn-ghost btn-sm" id="ak-del" style="color:var(--danger)">${icon('trash', 13)}حذف کلید</button>` : ''}
            </div>
            <div id="ak-msg" style="margin-top:8px"></div>
          </div>

          <div class="settings-group">
            <div class="settings-group-title">${icon('lock', 13)} امنیت حساب</div>
            <div class="flex" style="gap:8px;flex-wrap:wrap">
              <button class="btn btn-secondary btn-sm" id="ac-pass">${icon('refresh', 13)}تغییر رمز عبور</button>
              <button class="btn btn-danger btn-sm" id="ac-out">${icon('x', 13)}خروج از حساب</button>
            </div>
            <div id="ac-msg" style="margin-top:8px"></div>
          </div>`,
        footer: `<button class="btn btn-ghost" data-cancel>بستن</button>`
      });
      m.overlay.querySelector('[data-cancel]').addEventListener('click', () => m.close());
      const akMsg = m.overlay.querySelector('#ak-msg');
      const acMsg = m.overlay.querySelector('#ac-msg');

      m.overlay.querySelector('#ak-save').addEventListener('click', async () => {
        const key = m.overlay.querySelector('#ak-key').value.trim();
        if (!key) { akMsg.innerHTML = UIKit.banner('warning', '', 'کلید را وارد کنید.'); return; }
        akMsg.innerHTML = UIKit.spinner('در حال ذخیره امن…');
        const res = await authClient.saveKey(key);
        if (res.ok) {
          if (authClient.S.user) authClient.S.user.apiKey = res.data.apiKey;
          m.overlay.querySelector('#ak-key').value = '';
          akMsg.innerHTML = UIKit.banner('success', '', esc(res.data.message || 'ذخیره شد.'));
          authUI.updateBadge();
          authClient.notify();
          UIKit.toast('success', 'ذخیره شد', 'کلید API به‌صورت امن ذخیره شد.');
        } else akMsg.innerHTML = UIKit.banner('danger', '', esc(res.data.error || 'ذخیره ناموفق بود.'));
      });
      const tbtn = m.overlay.querySelector('#ak-test');
      if (tbtn) tbtn.addEventListener('click', async () => {
        const cfg = Store.state.flow.ai.config || {};
        akMsg.innerHTML = UIKit.spinner('در حال بررسی امن کلید…');
        const res = await authClient.testKey(cfg.endpoint || 'https://api.openai.com/v1/chat/completions', cfg.model || 'gpt-4o-mini');
        if (res.ok && authClient.S.user && res.data.status) authClient.S.user.apiKey.status = res.data.status;
        akMsg.innerHTML = res.ok
          ? UIKit.banner('success', '', esc(res.data.message))
          : UIKit.banner('danger', '', esc(res.data.message || res.data.error || 'بررسی ناموفق بود.'));
      });
      const dbtn = m.overlay.querySelector('#ak-del');
      if (dbtn) dbtn.addEventListener('click', () => {
        UIKit.confirmBox({
          title: 'حذف کلید API',
          message: 'کلید ذخیره‌شده حذف می‌شود و درخواست‌های AI تا ثبت کلید جدید ناموفق خواهند بود. متن گزارش‌ها و داده‌های شما حذف نمی‌شود. ادامه می‌دهید؟',
          danger: true, confirmText: 'بله، حذف کن',
          onConfirm: async () => {
            const res = await authClient.deleteKey();
            if (res.ok) {
              if (authClient.S.user) authClient.S.user.apiKey = res.data.apiKey;
              m.close();
              authClient.notify();
              UIKit.toast('success', 'حذف شد', 'کلید API حذف شد.');
              authUI.openAccount(); /* بازگشایی با وضعیت جدید */
            }
          }
        });
      });
      m.overlay.querySelector('#ac-pass').addEventListener('click', () => {
        acMsg.innerHTML = `
          <div class="form-row" style="display:grid;gap:8px">
            <div class="field"><label>رمز فعلی</label><input class="input" id="cp0" type="password" dir="ltr"></div>
            <div class="field"><label>رمز جدید</label><input class="input" id="cp1" type="password" dir="ltr"></div>
            <div class="field"><label>تکرار رمز جدید</label><input class="input" id="cp2" type="password" dir="ltr"></div>
            <button class="btn btn-primary btn-sm" id="cp-do">ثبت تغییر رمز</button>
          </div><div id="cp-msg"></div>`;
        acMsg.querySelector('#cp-do').addEventListener('click', async () => {
          const g = id => acMsg.querySelector(id).value;
          const r = await authClient.changePassword(g('#cp0'), g('#cp1'), g('#cp2'));
          const box = acMsg.querySelector('#cp-msg');
          box.innerHTML = r.ok ? UIKit.banner('success', '', esc(r.data.message)) : UIKit.banner('danger', '', esc(r.data.error || 'تغییر رمز ناموفق بود.'));
        });
      });
      m.overlay.querySelector('#ac-out').addEventListener('click', async () => {
        const res = await authClient.logout();
        if (res.ok) {
          authClient.S.user = null;
          m.close();
          updateBadge();
          refreshAppAuth();
          UIKit.toast('info', 'خروج انجام شد', 'نشست و اطلاعات حساب از رابط کاربری پاک شد.');
        }
      });
    }

  /* همگام‌سازی وضعیت AI پس از تغییر حساب */
  function refreshAppAuth() {
    try {
      uiShell.updateChip();
      if (Store.state.ui.view === 'ai') UI.showView('ai');
    } catch (e) { /* در راه‌اندازی اولیه UI موجود نیست */ }
  }

  return { init, openAccount, updateBadge, refreshAppAuth };
})();
