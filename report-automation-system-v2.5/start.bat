@echo off
chcp 65001 > nul
title گزارش‌ساز هوشمند سازمانی — سرور محلی
cd /d "%~dp0"
echo ==============================================
echo   گزارش‌ساز هوشمند سازمانی - نسخه ۲٫۱٫۰
echo ==============================================
echo.
where python >nul 2>nul
if %errorlevel%==0 (
  python run.py
  goto :end
)
where py >nul 2>nul
if %errorlevel%==0 (
  py run.py
  goto :end
)
echo Python پیدا نشد!
echo لطفاً Python را از python.org نصب کنید یا فایل index.html را مستقیماً باز کنید.
pause
:end
pause
