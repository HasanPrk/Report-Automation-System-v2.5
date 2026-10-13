#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سرور محلی «گزارش‌ساز هوشمند سازمانی» — نسخه ۲٫۵
این اسکریپت برنامه را روی یک سرور محلی اجرا و در مرورگر پیش‌فرض باز می‌کند.
از نسخه ۲٫۲ علاوه بر سرو استاتیک، API محلی احراز هویت (SQLite) و پراکسی
امن کلید هوش مصنوعی نیز روی همین آدرس ارائه می‌شود (فقط localhost).

اجرا:
    python run.py            → پورت پیش‌فرض ۸۵۸۶
    python run.py --port 8080
    python run.py --no-open  → بدون باز کردن خودکار مرورگر
"""
import argparse
import json
import os
import sys
import threading
import time
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8586
sys.path.insert(0, ROOT)

import appserver  # noqa: E402


class Handler(SimpleHTTPRequestHandler):
    """سرور فایل‌های استاتیک + API محلی، با پشتیبانی UTF-8 و MIME صحیح"""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.ttf': 'font/ttf',
        '.md': 'text/markdown; charset=utf-8',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---------- ابزار پاسخ JSON ----------
    def _send_json(self, status, data, set_cookie=None, clear_cookie=False):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        if set_cookie:
            name, value, max_age = set_cookie
            self.send_header(
                'Set-Cookie',
                f'{name}={value}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax')
        if clear_cookie:
            self.send_header('Set-Cookie',
                             f'{appserver.SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # ---------- مسیریابی API ----------
    def do_GET(self):
        if self.path.split('?', 1)[0].startswith('/api/'):
            appserver.handle_api(self, 'GET')
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split('?', 1)[0].startswith('/api/'):
            appserver.handle_api(self, 'POST')
            return
        self._send_json(404, {'ok': False, 'error': 'یافت نشد'})

    def end_headers(self):
        # جلوگیری از کش شدن حین توسعه
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        # هیچ‌گاه بدنه/سربرگ‌های حساس لاگ نمی‌شوند
        sys.stdout.write("  %s — %s\n" % (self.log_date_time_string(), fmt % args))


def main():
    parser = argparse.ArgumentParser(description='سرور محلی گزارش‌ساز هوشمند')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help='شماره پورت (پیش‌فرض ۸۵۸۶)')
    parser.add_argument('--no-open', action='store_true', help='باز نکردن خودکار مرورگر')
    args = parser.parse_args()

    os.chdir(ROOT)

    # راه‌اندازی لایه API (دیتابیس SQLite + کلید رمزنگاری)
    appserver.init_db()

    port = args.port
    while port < 65536:
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
            break
        except OSError:
            print(f"پورت {port} اشغال است؛ پورت {port + 1} امتحان می‌شود…")
            port += 1
    else:
        print('هیچ پورت آزادی پیدا نشد.')
        sys.exit(1)

    url = f'http://127.0.0.1:{port}/index.html'
    print('=' * 62)
    print('  گزارش‌ساز هوشمند سازمانی — نسخه ۲٫۵٫۰')
    print('=' * 62)
    print(f'  آدرس برنامه:   {url}')
    print(f'  API احراز هویت: {url.rsplit("/", 1)[0]}/api/  (فقط localhost)')
    print(f'  دیتابیس:        {appserver.DB_PATH}')
    smtp_ok = appserver.smtp_config() is not None
    print(f'  سرویس ایمیل:    {"تنظیم شده (ارسال واقعی کد تأیید)" if smtp_ok else "تنظیم نشده — حالت محلی (کد در صفحه نمایش داده می‌شود)"}')
    print('  برای توقف سرور: Ctrl+C')
    print('=' * 62)

    if not args.no_open:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    # پاک‌سازی دوره‌ای سبک نشست‌ها/کدهای منقضی
    def _prune():
        while True:
            time.sleep(1800)
            try:
                appserver.prune_sessions()
            except Exception:
                pass
    threading.Thread(target=_prune, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nسرور متوقف شد. خدانگهدار!')
        server.server_close()


if __name__ == '__main__':
    main()
