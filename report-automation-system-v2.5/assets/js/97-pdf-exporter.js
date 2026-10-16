/* ═══════════════════════════════════════════════════════════
   pdfExporter — خروجی‌های گزارش: PDF (چاپ مرورگر)، HTML مستقل،
   Word/Google Docs (doc)، Markdown و کپی متن
   ═══════════════════════════════════════════════════════════ */
'use strict';

const pdfExporter = (function () {
  const F = () => Store.state.flow;

  let _printing = false;

  function baseName(custom) {
    const f = F();
    const out = f.report.output || {};
    const fallback = `گزارش-${((f.report.meta && f.report.meta.title) || 'مدیریتی').replace(/[\\/:*?"<>|]/g, '-')}-${Utils.todayJalali().replace(/\//g, '.')}`;
    let name = (custom || out.fileName || fallback).trim();
    name = name.replace(/\.(pdf|html?|docx?|md|txt)$/i, '');
    return name || fallback;
  }

  /**
   * خروجی PDF:
   * ۱) ساخت نسخه تازه گزارش در #print-root
   * ۲) تنظیم عنوان سند به نام فایل
   * ۳) چاپ مرورگر — کاربر «ذخیره به PDF» را انتخاب می‌کند
   */
  async function exportPdf(customName) {
    if (_printing) return { ok: false, error: 'عملیات چاپ در حال اجراست.' };
    const f = F();
    if (!f.report.renderedAt) return { ok: false, error: 'ابتدا پیش‌نمایش گزارش را باز کنید.' };
    const printRoot = document.getElementById('print-root');
    printRoot.classList.add('print-prep');
    const built = reportRenderer.buildPrintDOM(printRoot);
    if (!built) {
      printRoot.classList.remove('print-prep');
      return { ok: false, error: 'ساخت نسخه چاپی گزارش ناموفق بود.' };
    }

    const fileName = baseName(customName) + '.pdf';
    f.report.fileName = fileName;

    const prevTitle = document.title;
    document.title = fileName;

    _printing = true;
    await new Promise(r => setTimeout(r, 650));

    return new Promise((resolve) => {
      const done = (ok, error) => {
        _printing = false;
        document.title = prevTitle;
        printRoot.classList.remove('print-prep');
        setTimeout(() => { printRoot.innerHTML = ''; reportRenderer.destroyCharts(); }, 400);
        if (ok) {
          f.report.exportedAt = new Date().toISOString();
          WorkflowManager.refresh();
          resolve({ ok: true, fileName: f.report.fileName, pageCount: built.pageCount });
        } else {
          resolve({ ok: false, error: error || 'چاپ لغو شد.' });
        }
      };

      const after = () => done(true);

      window.addEventListener('afterprint', after, { once: true });
      try {
        window.print();
        setTimeout(() => {
          window.removeEventListener('afterprint', after);
          done(true, null);
        }, 4000);
      } catch (err) {
        done(false, 'اجرای چاپ ناموفق بود: ' + err.message);
      }
    });
  }

  /* خروجی HTML مستقل گزارش */
  async function exportStandaloneHtml(customName) {
    const html = await reportRenderer.buildStandaloneHTML();
    if (!html) return { ok: false, error: 'گزارشی برای خروجی گرفتن وجود ندارد.' };
    const name = baseName(customName) + '.html';
    Utils.downloadFile(name, html, 'text/html;charset=utf-8');
    F().report.exportedAt = new Date().toISOString();
    return { ok: true, fileName: name };
  }

  /* خروجی Word / Google Docs (docx-سازگار: HTML با نشانه‌های Word) */
  async function exportWord(customName) {
    const html = reportRenderer.buildWordHTML();
    if (!html) return { ok: false, error: 'گزارشی برای خروجی گرفتن وجود ندارد.' };
    const name = baseName(customName) + '.doc';
    Utils.downloadFile(name, html, 'application/msword;charset=utf-8');
    F().report.exportedAt = new Date().toISOString();
    return { ok: true, fileName: name };
  }

  /* خروجی Markdown */
  async function exportMarkdown(customName) {
    const md = reportRenderer.buildMarkdown();
    if (!md) return { ok: false, error: 'گزارشی برای خروجی گرفتن وجود ندارد.' };
    const name = baseName(customName) + '.md';
    Utils.downloadFile(name, md, 'text/markdown;charset=utf-8');
    F().report.exportedAt = new Date().toISOString();
    return { ok: true, fileName: name };
  }

  /* کپی متن ساده گزارش برای جای‌گذاری مستقیم در Google Docs */
  async function copyPlainText() {
    const txt = reportRenderer.buildPlainText();
    if (!txt) return { ok: false, error: 'گزارشی برای کپی وجود ندارد.' };
    try {
      await navigator.clipboard.writeText(txt);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'مرورگر اجازه دسترسی به حافظه موقت نداد.' };
    }
  }

  return { exportPdf, exportStandaloneHtml, exportWord, exportMarkdown, copyPlainText };
})();
