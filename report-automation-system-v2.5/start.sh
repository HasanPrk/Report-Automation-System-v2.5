#!/bin/bash
# اجرای سرور محلی «گزارش‌ساز هوشمند سازمانی»
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  python3 run.py "$@"
elif command -v python >/dev/null 2>&1; then
  python run.py "$@"
else
  echo "Python یافت نشد — فایل index.html را مستقیماً در مرورگر باز کنید."
  exit 1
fi
