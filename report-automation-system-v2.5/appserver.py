#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
appserver — لایه API محلی «گزارش‌ساز هوشمند» (نسخه ۲٫۵)
═══════════════════════════════════════════════════════════════
امکانات:
  • احراز هویت محلی با SQLite (بدون هیچ سرویس ابری/بیرونی)
      - ثبت‌نام با ایمیل (شناسه کاربری) و رمز عبور
      - هش رمز با scrypt (salt تصادفی) و مقایسه constant-time
      - تأیید مالکیت ایمیل با کد یک‌بارمصرف (OTP)
          * اگر SMTP در متغیرهای محیطی تنظیم شده باشد، کد ایمیلی ارسال می‌شود.
          * در «حالت محلی» (بدون SMTP) کد مستقیماً در رابط کاربری نمایش
            داده می‌شود — شفاف و با برچسب «حالت محلی»؛ مناسب سیستم شخصی.
      - نشست امن با توکن تصادفی (کوکی HttpOnly + SameSite=Lax)
      - کد بازیابی یک‌بارمصرف هنگام ثبت‌نام (جایگزین ایمیل بازیابی)
      - محدودیت نرخ (Rate Limiting) برای ثبت‌نام/ورود/کد/بازیابی
  • نگهداری امن API Key هوش مصنوعی:
      - کلید هرگز به مرورگر برنمی‌گردد؛ فقط وضعیت و بخش ماسک‌شده
      - رمزنگاری سمت سرور با کلید اصلیِ جدا از دیتابیس
        (فایل data/secrets/master.key با دسترسی 600)
      - پراکسی AI: درخواست مدل زبانی از سمت سرور با کلید ذخیره‌شده
  • سرو استاتیک همان برنامه (سازگار با رفتار قبلی run.py)

امنیت:
  • سرور فقط روی 127.0.0.1 گوش می‌دهد.
  • همه کوئری‌ها parameterized هستند.
  • هیچ رمز/کد/توکنی در لاگ‌ها نوشته نمی‌شود.
  • همه درخواست‌های تغییر وضعیت باید سربرگ X-Requested-With داشته باشند.
═══════════════════════════════════════════════════════════════
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import threading
import time
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formataddr

APP_VERSION = '2.5.0'
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, 'data')
SECRETS_DIR = os.path.join(DATA_DIR, 'secrets')
DB_PATH = os.path.join(DATA_DIR, 'app.db')
MASTER_KEY_PATH = os.path.join(SECRETS_DIR, 'master.key')

SESSION_COOKIE = 'ras_session'
SESSION_TTL_HOURS = 24 * 7          # یک هفته
OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SEC = 60
MAX_LOGIN_FAILURES = 5
LOGIN_LOCK_MINUTES = 5
MAX_BODY_BYTES = 2 * 1024 * 1024    # ۲ مگابایت

EMAIL_RE = re.compile(r'^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')

_db_lock = threading.RLock()
_conn = None


# ══════════════════════════════════════════════════════════════
#  دیتابیس
# ══════════════════════════════════════════════════════════════
def init_db():
    global _conn
    os.makedirs(DATA_DIR, exist_ok=True)
    _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    with _db_lock:
        _conn.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            recovery_code_hash TEXT,
            verified INTEGER NOT NULL DEFAULT 0,
            failed_logins INTEGER NOT NULL DEFAULT 0,
            locked_until TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            csrf TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS otp_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            purpose TEXT NOT NULL DEFAULT 'verify',
            attempts INTEGER NOT NULL DEFAULT 0,
            consumed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS api_keys (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            enc TEXT NOT NULL,
            hint TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'saved',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)
        _conn.commit()


def q(sql, params=(), fetch=False):
    with _db_lock:
        cur = _conn.execute(sql, params)
        rows = cur.fetchall() if fetch else None
        _conn.commit()
        return rows if fetch else cur


def now_utc():
    return datetime.utcnow()


def iso(dt):
    return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def parse_iso(s):
    return datetime.strptime(s, '%Y-%m-%dT%H:%M:%S.%fZ')


# ══════════════════════════════════════════════════════════════
#  هش و رمزنگاری (فقط stdlib)
# ══════════════════════════════════════════════════════════════
def hash_password(password: str) -> str:
    """scrypt با salt تصادفی — خروجی: scrypt$N$r$p$salt$hash (همه base64url)"""
    salt = secrets.token_bytes(16)
    n, r, p = 2 ** 14, 8, 1
    dk = hashlib.scrypt(password.encode('utf-8'), salt=salt, n=n, r=r, p=1, dklen=64)
    b64 = lambda b: base64.urlsafe_b64encode(b).decode('ascii').rstrip('=')
    return f"scrypt${n}${r}${p}${b64(salt)}${b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    """مقایسه constant-time — در صورت فرمت ناشناخته False برمی‌گرداند"""
    try:
        algo, n, r, p, salt_b64, hash_b64 = stored.split('$')
        if algo != 'scrypt':
            return False
        pad = lambda s: s + '=' * (-len(s) % 4)
        salt = base64.urlsafe_b64decode(pad(salt_b64))
        expected = base64.urlsafe_b64decode(pad(hash_b64))
        dk = hashlib.scrypt(password.encode('utf-8'), salt=salt,
                            n=int(n), r=int(r), p=int(p), dklen=len(expected))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


def hash_code(code: str, purpose: str) -> str:
    """هش کدهای یک‌بارمصرف با کلید اصلی (HMAC-SHA256) — کد خام هرگز ذخیره نمی‌شود"""
    mac = hmac.new(master_key(), (purpose + ':' + code).encode('utf-8'), hashlib.sha256)
    return mac.hexdigest()


def load_or_create_master_key() -> bytes:
    """کلید اصلی رمزنگاری — خارج از دیتابیس، با دسترسی محدود"""
    os.makedirs(SECRETS_DIR, exist_ok=True)
    if os.path.exists(MASTER_KEY_PATH):
        with open(MASTER_KEY_PATH, 'rb') as f:
            key = f.read()
        if len(key) == 32:
            return key
    key = os.urandom(32)
    fd = os.open(MASTER_KEY_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(key)
    try:
        os.chmod(MASTER_KEY_PATH, 0o600)
    except OSError:
        pass
    return key


_MASTER_KEY = None


def master_key() -> bytes:
    global _MASTER_KEY
    if _MASTER_KEY is None:
        _MASTER_KEY = load_or_create_master_key()
    return _MASTER_KEY


def _derive(master: bytes, label: bytes) -> bytes:
    return hmac.new(master, label, hashlib.sha256).digest()


def encrypt_secret(plain: str) -> str:
    """
    رمزنگاری احراز هویت‌شده مبتنی بر HMAC-CTR (فقط stdlib):
      keystream = HMAC(enc_key, nonce ‖ counter)
      tag       = HMAC(mac_key, nonce ‖ ciphertext)   ← encrypt-then-MAC
    کلید رمزنگاری (master.key) هرگز کنار داده رمزشده (دیتابیس) ذخیره نمی‌شود.
    """
    enc_key = _derive(master_key(), b'api-key-enc')
    mac_key = _derive(master_key(), b'api-key-mac')
    nonce = os.urandom(16)
    data = plain.encode('utf-8')
    out = bytearray()
    counter = 0
    while len(out) < len(data):
        blk = hmac.new(enc_key, nonce + counter.to_bytes(8, 'big'), hashlib.sha256).digest()
        out.extend(blk)
        counter += 1
    ct = bytes(a ^ b for a, b in zip(data, bytes(out[:len(data)])))
    tag = hmac.new(mac_key, nonce + ct, hashlib.sha256).digest()
    b64 = lambda b: base64.urlsafe_b64encode(b).decode('ascii').rstrip('=')
    return f"v1.{b64(nonce)}.{b64(ct)}.{b64(tag)}"


def decrypt_secret(blob: str):
    try:
        v, nonce_b64, ct_b64, tag_b64 = blob.split('.')
        if v != 'v1':
            return None
        pad = lambda s: s + '=' * (-len(s) % 4)
        nonce = base64.urlsafe_b64decode(pad(nonce_b64))
        ct = base64.urlsafe_b64decode(pad(ct_b64))
        tag = base64.urlsafe_b64decode(pad(tag_b64))
        mac_key = _derive(master_key(), b'api-key-mac')
        expect = hmac.new(mac_key, nonce + ct, hashlib.sha256).digest()
        if not hmac.compare_digest(expect, tag):
            return None
        enc_key = _derive(master_key(), b'api-key-enc')
        out = bytearray()
        counter = 0
        while len(out) < len(ct):
            blk = hmac.new(enc_key, nonce + counter.to_bytes(8, 'big'), hashlib.sha256).digest()
            out.extend(blk)
            counter += 1
        return bytes(a ^ b for a, b in zip(ct, bytes(out[:len(ct)]))).decode('utf-8')
    except Exception:
        return None


def mask_key(key: str) -> str:
    tail = key[-4:] if len(key) >= 8 else '****'
    return f'{key[:3]}…{tail}' if len(key) >= 12 else f'…{tail}'


# ══════════════════════════════════════════════════════════════
#  محدودیت نرخ (Rate Limiting) — پنجره لغزان در حافظه
# ══════════════════════════════════════════════════════════════
_rl_lock = threading.Lock()
_rl_buckets = {}


def rate_limit(bucket: str, limit: int, window_sec: int) -> bool:
    """True = مجاز، False = عبور از سقف"""
    key = bucket
    now = time.time()
    with _rl_lock:
        lst = [t for t in _rl_buckets.get(key, []) if now - t < window_sec]
        if len(lst) >= limit:
            _rl_buckets[key] = lst
            return False
        lst.append(now)
        _rl_buckets[key] = lst
        return True


# ══════════════════════════════════════════════════════════════
#  ارسال ایمیل (اختیاری — فقط با تنظیمات محیطی)
# ══════════════════════════════════════════════════════════════
def smtp_config():
    host = os.environ.get('RAS_SMTP_HOST', '').strip()
    if not host:
        return None
    return {
        'host': host,
        'port': int(os.environ.get('RAS_SMTP_PORT', '587')),
        'user': os.environ.get('RAS_SMTP_USER', ''),
        'pass': os.environ.get('RAS_SMTP_PASS', ''),
        'from': os.environ.get('RAS_SMTP_FROM', os.environ.get('RAS_SMTP_USER', '')),
        'tls': os.environ.get('RAS_SMTP_TLS', '1') == '1',
    }


def send_email(to_email: str, subject: str, body: str) -> bool:
    cfg = smtp_config()
    if not cfg:
        return False
    try:
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['Subject'] = Header(subject, 'utf-8')
        msg['From'] = formataddr((str(Header('گزارش‌ساز هوشمند', 'utf-8')), cfg['from']))
        msg['To'] = to_email
        if cfg['tls']:
            srv = smtplib.SMTP(cfg['host'], cfg['port'], timeout=20)
            try:
                srv.starttls(context=ssl.create_default_context())
                if cfg['user']:
                    srv.login(cfg['user'], cfg['pass'])
                srv.sendmail(cfg['from'], [to_email], msg.as_string())
            finally:
                srv.quit()
        else:
            srv = smtplib.SMTP(cfg['host'], cfg['port'], timeout=20)
            try:
                if cfg['user']:
                    srv.login(cfg['user'], cfg['pass'])
                srv.sendmail(cfg['from'], [to_email], msg.as_string())
            finally:
                srv.quit()
        return True
    except Exception:
        # هیچ محتوای حساسی (کد/رمز) در پیام خطا یا لاگ قرار نمی‌گیرد
        return False


# ══════════════════════════════════════════════════════════════
#  OTP
# ══════════════════════════════════════════════════════════════
def issue_otp(email: str, purpose: str = 'verify'):
    """کد یک‌بارمصرف جدید؛ کدهای قبلی همان هدف بی‌اعتبار می‌شوند.
    خروجی: (code, delivered) — delivered=True یعنی ایمیل شد؛ در غیر این صورت حالت محلی."""
    # کدهای قبلی مصرف‌شده تلقی شوند
    q("UPDATE otp_codes SET consumed=1 WHERE email=? AND purpose=? AND consumed=0", (email, purpose))
    code = f"{secrets.randbelow(10 ** 6):06d}"
    expires = iso(now_utc() + timedelta(minutes=OTP_TTL_MINUTES))
    q("INSERT INTO otp_codes (email, code_hash, purpose, expires_at) VALUES (?,?,?,?)",
      (email, hash_code(code, purpose), purpose, expires))
    if smtp_config():
        subj = 'کد تأیید گزارش‌ساز هوشمند' if purpose == 'verify' else 'کد بازیابی گزارش‌ساز هوشمند'
        body = (f"کد یک‌بارمصرف شما:\n\n{code}\n\n"
                f"اعتبار: {OTP_TTL_MINUTES} دقیقه — این کد را با کسی به اشتراک نگذارید.")
        delivered = send_email(email, subj, body)
    else:
        delivered = False
    return code, delivered


def check_otp(email: str, code: str, purpose: str):
    """بررسی کد؛ خروجی: (ok, error_fa)"""
    rows = q("SELECT * FROM otp_codes WHERE email=? AND purpose=? AND consumed=0 ORDER BY id DESC LIMIT 1",
             (email, purpose), fetch=True)
    if not rows:
        return False, 'کد فعالی برای این ایمیل وجود ندارد؛ دوباره درخواست کد بدهید.'
    rec = rows[0]
    exp = parse_iso(rec['expires_at'])
    if now_utc() > exp:
        q("UPDATE otp_codes SET consumed=1 WHERE id=?", (rec['id'],))
        return False, 'کد منقضی شده است؛ کد جدید درخواست کنید.'
    if rec['attempts'] >= OTP_MAX_ATTEMPTS:
        q("UPDATE otp_codes SET consumed=1 WHERE id=?", (rec['id'],))
        return False, 'تعداد تلاش‌های ناموفق بیش از حد مجاز بود؛ کد جدید درخواست کنید.'
    ok = hmac.compare_digest(rec['code_hash'], hash_code(str(code).strip(), purpose))
    if not ok:
        q("UPDATE otp_codes SET attempts=attempts+1 WHERE id=?", (rec['id'],))
        left = OTP_MAX_ATTEMPTS - rec['attempts'] - 1
        return False, f'کد واردشده نادرست است. {left} تلاش باقی مانده.'
    q("UPDATE otp_codes SET consumed=1 WHERE id=?", (rec['id'],))
    return True, ''


# ══════════════════════════════════════════════════════════════
#  نشست‌ها
# ══════════════════════════════════════════════════════════════
def create_session(user_id: int):
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(16)
    expires = iso(now_utc() + timedelta(hours=SESSION_TTL_HOURS))
    q("INSERT INTO sessions (token, user_id, csrf, expires_at) VALUES (?,?,?,?)",
      (token, user_id, csrf, expires))
    return token, csrf


def get_session_user(cookie_token: str):
    if not cookie_token:
        return None
    rows = q("""SELECT u.id, u.email, u.verified, u.created_at, s.expires_at, s.csrf
                FROM sessions s JOIN users u ON u.id = s.user_id
                WHERE s.token=?""", (cookie_token,), fetch=True)
    if not rows:
        return None
    rec = rows[0]
    if now_utc() > parse_iso(rec['expires_at']):
        q("DELETE FROM sessions WHERE token=?", (cookie_token,))
        return None
    return dict(rec)


def destroy_session(token: str):
    q("DELETE FROM sessions WHERE token=?", (token,))


def prune_sessions():
    """پاک‌سازی نشست‌ها و کدهای منقضی (فراخوانی دوره‌ای سبک)"""
    cutoff = iso(now_utc() - timedelta(hours=1))
    otp_cut = iso(now_utc() - timedelta(hours=24))
    q("DELETE FROM sessions WHERE expires_at < ?", (cutoff,))
    q("DELETE FROM otp_codes WHERE expires_at < ?", (otp_cut,))


# ══════════════════════════════════════════════════════════════
#  پاسخ‌های HTTP
# ══════════════════════════════════════════════════════════════
class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class ApiResult:
    def __init__(self, data=None, status=200, set_cookie=None, clear_cookie=False):
        self.data = data or {}
        self.status = status
        self.set_cookie = set_cookie      # (name, value, max_age_seconds)
        self.clear_cookie = clear_cookie


def parse_body(handler):
    length = int(handler.headers.get('Content-Length') or 0)
    if length <= 0:
        return {}
    if length > MAX_BODY_BYTES:
        raise ApiError(413, 'حجم درخواست بیش از حد مجاز است.')
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode('utf-8'))
    except Exception:
        raise ApiError(400, 'بدنه درخواست JSON معتبر نیست.')


def require_fields(body, *names):
    for n in names:
        if n not in body or body[n] is None:
            raise ApiError(400, f'فیلد «{n}» الزامی است.')


# ══════════════════════════════════════════════════════════════
#  نقاط پایانی احراز هویت
# ══════════════════════════════════════════════════════════════
def get_client_key(handler):
    try:
        return handler.client_address[0] or 'local'
    except Exception:
        return 'local'


def user_public(u):
    key = q("SELECT hint, status, updated_at FROM api_keys WHERE user_id=?", (u['id'],), fetch=True)
    key_row = dict(key[0]) if key else None
    return {
        'id': u['id'],
        'email': u['email'],
        'verified': bool(u['verified']),
        'createdAt': u['created_at'],
        'apiKey': {
            'exists': bool(key_row),
            'hint': key_row['hint'] if key_row else '',
            'status': key_row['status'] if key_row else '',
            'updatedAt': key_row['updated_at'] if key_row else ''
        }
    }


def api_register(handler, body):
    ip = get_client_key(handler)
    if not rate_limit(f'reg:{ip}', 5, 300):
        raise ApiError(429, 'تلاش‌های ثبت‌نام زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.')
    require_fields(body, 'email', 'password', 'password2')
    email = str(body['email']).strip().lower()
    password = str(body['password'])
    password2 = str(body['password2'])
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise ApiError(400, 'قالب ایمیل معتبر نیست.')
    if len(password) < 8:
        raise ApiError(400, 'رمز عبور باید حداقل ۸ نویسه باشد.')
    if password != password2:
        raise ApiError(400, 'رمز عبور و تکرار آن یکسان نیستند.')
    existing = q("SELECT id, verified FROM users WHERE email=?", (email,), fetch=True)
    if existing:
        # پیام یکسان برای تأییدشده/تأییدنشده تا وضعیت حساب افشا نشود
        raise ApiError(409, 'این ایمیل قابل استفاده نیست؛ اگر حساب دارید وارد شوید.')
    pw_hash = hash_password(password)
    q("INSERT INTO users (email, password_hash) VALUES (?,?)", (email, pw_hash))
    code, delivered = issue_otp(email, 'verify')
    local_code = None if delivered else code   # حالت محلی: کد برای نمایش در UI
    return ApiResult({
        'ok': True,
        'email': email,
        'otpSent': delivered,
        'localMode': not delivered,
        'localCode': local_code,   # فقط در حالت محلی مقدار دارد
        'message': ('کد تأیید به ایمیل شما ارسال شد.' if delivered
                    else 'حالت محلی: کد تأیید در همین صفحه نمایش داده می‌شود (سرویس ایمیل تنظیم نشده است).')
    }, status=201)


def api_verify_email(handler, body):
    ip = get_client_key(handler)
    if not rate_limit(f'ver:{ip}', 10, 300):
        raise ApiError(429, 'تلاش‌های تأیید زیاد است؛ کمی بعد دوباره امتحان کنید.')
    require_fields(body, 'email', 'code')
    email = str(body['email']).strip().lower()
    rows = q("SELECT * FROM users WHERE email=?", (email,), fetch=True)
    if not rows:
        raise ApiError(400, 'کد یا ایمیل نادرست است.')
    ok, err = check_otp(email, str(body['code']), 'verify')
    if not ok:
        raise ApiError(400, err)
    q("UPDATE users SET verified=1 WHERE email=?", (email,))
    # کد بازیابی یک‌بارمصرف — نمایش یک‌بار در UI
    recovery = ''.join(secrets.choice('ABCDEFGHJKMNPQRSTUVWXYZ23456789') for _ in range(12))
    q("UPDATE users SET recovery_code_hash=? WHERE email=?",
      (hash_password(recovery), email))
    return ApiResult({'ok': True, 'recoveryCode': recovery,
                      'message': 'ایمیل تأیید شد. کد بازیابی را در جای امن نگه دارید؛ دوباره نمایش داده نمی‌شود.'})


def api_resend_otp(handler, body):
    ip = get_client_key(handler)
    require_fields(body, 'email')
    email = str(body['email']).strip().lower()
    if not EMAIL_RE.match(email):
        raise ApiError(400, 'قالب ایمیل معتبر نیست.')
    # سقف ارسال مجدد برای هر ایمیل + هر IP
    if not rate_limit(f'resend:{email}', 1, OTP_RESEND_COOLDOWN_SEC):
        raise ApiError(429, f'هر {OTP_RESEND_COOLDOWN_SEC} ثانیه یک‌بار می‌توانید کد جدید درخواست کنید.')
    if not rate_limit(f'resend-ip:{ip}', 10, 600):
        raise ApiError(429, 'تعداد درخواست کد زیاد است؛ کمی بعد دوباره امتحان کنید.')
    rows = q("SELECT id, verified FROM users WHERE email=?", (email,), fetch=True)
    if not rows:
        # پاسخ خنثی — افشای نبودن حساب
        return ApiResult({'ok': True, 'otpSent': smtp_config() is not None,
                          'localMode': smtp_config() is None, 'localCode': None,
                          'message': 'اگر حساب با این ایمیل وجود داشته باشد، کد جدید صادر می‌شود.'})
    code, delivered = issue_otp(email, 'verify')
    return ApiResult({'ok': True, 'otpSent': delivered, 'localMode': not delivered,
                      'localCode': (None if delivered else code),
                      'message': ('کد جدید ارسال شد.' if delivered else 'کد جدید در همین صفحه نمایش داده می‌شود.')})


def api_login(handler, body):
    ip = get_client_key(handler)
    if not rate_limit(f'login:{ip}', 15, 300):
        raise ApiError(429, 'تلاش‌های ورود زیاد است؛ چند دقیقه بعد دوباره امتحان کنید.')
    require_fields(body, 'email', 'password')
    email = str(body['email']).strip().lower()
    password = str(body['password'])
    rows = q("SELECT * FROM users WHERE email=?", (email,), fetch=True)
    generic_err = ApiError(401, 'ایمیل یا رمز عبور نادرست است.')
    if not rows:
        # مقایسه ساختگی برای یکسان‌سازی زمان پاسخ
        verify_password(password, hash_password('dummy-password-a1'))
        raise generic_err
    u = rows[0]
    if u['locked_until']:
        until = parse_iso(u['locked_until'])
        if now_utc() < until:
            raise ApiError(423, 'حساب موقتاً قفل شده است؛ چند دقیقه بعد دوباره امتحان کنید.')
        q("UPDATE users SET locked_until=NULL, failed_logins=0 WHERE id=?", (u['id'],))
    if not verify_password(password, u['password_hash']):
        failed = (u['failed_logins'] or 0) + 1
        if failed >= MAX_LOGIN_FAILURES:
            lock_until = iso(now_utc() + timedelta(minutes=LOGIN_LOCK_MINUTES))
            q("UPDATE users SET failed_logins=0, locked_until=? WHERE id=?", (lock_until, u['id']))
            raise ApiError(423, 'تلاش‌های ناموفق زیاد بود؛ حساب موقتاً قفل شد.')
        q("UPDATE users SET failed_logins=? WHERE id=?", (failed, u['id']))
        raise generic_err
    if not u['verified']:
        raise ApiError(403, 'ایمیل حساب تأیید نشده است؛ ابتدا کد تأیید را وارد کنید.')
    q("UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=?", (u['id'],))
    token, csrf = create_session(u['id'])
    prune_sessions()
    return ApiResult({'ok': True, 'user': user_public(u), 'csrf': csrf},
                     set_cookie=(SESSION_COOKIE, token, SESSION_TTL_HOURS * 3600))


def api_me(handler):
    u = get_session_user(handler._ras_cookie)
    if not u:
        raise ApiError(401, 'نشست فعالی وجود ندارد.')
    return ApiResult({'ok': True, 'user': user_public(u)})


def api_logout(handler, body):
    if handler._ras_cookie:
        destroy_session(handler._ras_cookie)
    return ApiResult({'ok': True}, clear_cookie=True)


def api_change_password(handler, body):
    """تغییر رمز با نشست فعال (نیازمند رمز فعلی)"""
    u = get_session_user(handler._ras_cookie)
    if not u:
        raise ApiError(401, 'برای تغییر رمز باید وارد حساب شوید.')
    require_fields(body, 'currentPassword', 'newPassword', 'newPassword2')
    rows = q("SELECT * FROM users WHERE id=?", (u['id'],), fetch=True)
    if not rows or not verify_password(str(body['currentPassword']), rows[0]['password_hash']):
        raise ApiError(401, 'رمز فعلی نادرست است.')
    newp = str(body['newPassword'])
    if len(newp) < 8:
        raise ApiError(400, 'رمز جدید باید حداقل ۸ نویسه باشد.')
    if newp != str(body['newPassword2']):
        raise ApiError(400, 'رمز جدید و تکرار آن یکسان نیستند.')
    q("UPDATE users SET password_hash=? WHERE id=?", (hash_password(newp), u['id']))
    # پایان دادن به سایر نشست‌ها
    q("DELETE FROM sessions WHERE user_id=? AND token<>?", (u['id'], handler._ras_cookie or ''))
    return ApiResult({'ok': True, 'message': 'رمز عبور تغییر کرد و سایر نشست‌ها خاتمه یافتند.'})


def api_reset_password(handler, body):
    """بازیابی رمز با کد بازیابی (بدون ایمیل بیرونی — مطابق معماری محلی)"""
    ip = get_client_key(handler)
    if not rate_limit(f'reset:{ip}', 5, 600):
        raise ApiError(429, 'تلاش‌های بازیابی زیاد است؛ کمی بعد دوباره امتحان کنید.')
    require_fields(body, 'email', 'recoveryCode', 'newPassword', 'newPassword2')
    email = str(body['email']).strip().lower()
    rows = q("SELECT * FROM users WHERE email=?", (email,), fetch=True)
    if not rows or not rows[0]['recovery_code_hash']:
        raise ApiError(400, 'ایمیل یا کد بازیابی نادرست است.')
    u = rows[0]
    if not verify_password(str(body['recoveryCode']).strip().upper(), u['recovery_code_hash']):
        raise ApiError(400, 'ایمیل یا کد بازیابی نادرست است.')
    newp = str(body['newPassword'])
    if len(newp) < 8:
        raise ApiError(400, 'رمز جدید باید حداقل ۸ نویسه باشد.')
    if newp != str(body['newPassword2']):
        raise ApiError(400, 'رمز جدید و تکرار آن یکسان نیستند.')
    new_recovery = ''.join(secrets.choice('ABCDEFGHJKMNPQRSTUVWXYZ23456789') for _ in range(12))
    q("UPDATE users SET password_hash=?, recovery_code_hash=?, failed_logins=0, locked_until=NULL WHERE id=?",
      (hash_password(newp), hash_password(new_recovery), u['id']))
    q("DELETE FROM sessions WHERE user_id=?", (u['id'],))
    return ApiResult({'ok': True, 'recoveryCode': new_recovery,
                      'message': 'رمز بازیابی شد. کد بازیابی جدید صادر شد؛ آن را در جای امن نگه دارید.'})


# ══════════════════════════════════════════════════════════════
#  مدیریت امن API Key + پراکسی AI
# ══════════════════════════════════════════════════════════════
def _require_user(handler):
    u = get_session_user(handler._ras_cookie)
    if not u:
        raise ApiError(401, 'برای این عملیات باید وارد حساب شوید.')
    if not u['verified']:
        raise ApiError(403, 'حساب شما تأیید نشده است.')
    return u


def api_key_get(handler):
    u = _require_user(handler)
    row = user_public(u)
    return ApiResult({'ok': True, 'apiKey': row['apiKey']})


def api_key_save(handler, body):
    u = _require_user(handler)
    require_fields(body, 'key')
    key = str(body['key']).strip()
    if len(key) < 8:
        raise ApiError(400, 'کلید API نامعتبر است (حداقل ۸ نویسه).')
    if not rate_limit(f'keysave:{u["id"]}', 10, 300):
        raise ApiError(429, 'تغییرات مکرر کلید؛ کمی صبر کنید.')
    enc = encrypt_secret(key)
    hint = mask_key(key)
    q("""INSERT INTO api_keys (user_id, enc, hint, status, updated_at) VALUES (?,?,?,'saved',?)
         ON CONFLICT(user_id) DO UPDATE SET enc=excluded.enc, hint=excluded.hint,
         status='saved', updated_at=excluded.updated_at""",
      (u['id'], enc, hint, iso(now_utc())))
    return ApiResult({'ok': True, 'message': 'کلید API به‌صورت امن (رمزنگاری‌شده سمت سرور) ذخیره شد.',
                      'apiKey': user_public(u)['apiKey']})


def api_key_delete(handler, body):
    u = _require_user(handler)
    q("DELETE FROM api_keys WHERE user_id=?", (u['id'],))
    return ApiResult({'ok': True, 'message': 'کلید API حذف شد.',
                      'apiKey': user_public(u)['apiKey']})


def api_key_test(handler, body):
    """بررسی امن اعتبار کلید با یک درخواست حداقلی به سرویس (بدون افشای کلید)"""
    u = _require_user(handler)
    rows = q("SELECT enc FROM api_keys WHERE user_id=?", (u['id'],), fetch=True)
    if not rows:
        raise ApiError(404, 'کلید ذخیره‌شده‌ای وجود ندارد.')
    key = decrypt_secret(rows[0]['enc'])
    if not key:
        q("UPDATE api_keys SET status='invalid' WHERE user_id=?", (u['id'],))
        raise ApiError(500, 'بازگشایی کلید ناموفق بود؛ کلید را دوباره ثبت کنید.')
    require_fields(body, 'endpoint', 'model')
    endpoint = _normalize_endpoint(str(body['endpoint']).strip())
    if not endpoint:
        raise ApiError(400, 'آدرس سرویس باید با http/https شروع شود.')
    model = str(body['model']).strip() or 'gpt-4o-mini'
    ok, err = _forward_chat(endpoint, key, model, [{'role': 'user', 'content': 'ping'}], timeout=20, max_tokens=1)
    status = 'valid' if ok else 'invalid'
    q("UPDATE api_keys SET status=? WHERE user_id=?", (status, u['id']))
    if ok:
        return ApiResult({'ok': True, 'status': status, 'message': 'کلید معتبر است و سرویس پاسخ داد.'})
    return ApiResult({'ok': False, 'status': status, 'message': f'بررسی کلید ناموفق بود: {err}'})


def _normalize_endpoint(endpoint):
    """نرمال‌سازی آدرس سرویس AI (نسخه ۲٫۵)
    کاربر ممکن است آدرس پایه را وارد کند؛ اگر نشانی به «chat/completions» ختم
    نشود و شبیه آدرس پایه باشد، پسوند استاندارد Chat Completions اضافه می‌شود."""
    e = str(endpoint or '').strip().rstrip('/')
    if not e:
        return None
    if not e.startswith('http://') and not e.startswith('https://'):
        return None
    if e.endswith('/chat/completions') or e.endswith('/messages') or e.endswith('/completions'):
        return e
    return e + '/chat/completions'


def _forward_chat(endpoint, api_key, model, messages, timeout=60, max_tokens=None, temperature=0.4):
    """فراخوانی سرویس مدل زبانی از سمت سرور — کلید هرگز لاگ نمی‌شود
    سازگار با: OpenAI Chat Completions (پیش‌فرض) و Anthropic Messages (تشخیص خودکار)"""
    import urllib.request
    import urllib.error
    endpoint = _normalize_endpoint(endpoint) or endpoint
    is_anthropic = ('anthropic' in endpoint.lower()) or endpoint.rstrip('/').endswith('/messages')
    if is_anthropic:
        system_parts = [m['content'] for m in messages if m.get('role') == 'system']
        chat_msgs = [{'role': m.get('role', 'user'), 'content': m.get('content', '')}
                     for m in messages if m.get('role') != 'system']
        payload = {
            'model': model,
            'max_tokens': max_tokens or 4096,
            'messages': chat_msgs or [{'role': 'user', 'content': ''}],
        }
        if system_parts:
            payload['system'] = '\n\n'.join(system_parts)
        if not max_tokens:
            payload['temperature'] = temperature
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
            'User-Agent': 'ras-local/2.5',
        }
    else:
        payload = {'model': model, 'temperature': temperature, 'messages': messages}
        if max_tokens:
            payload['max_tokens'] = max_tokens
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
            'User-Agent': 'ras-local/2.5',
        }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(endpoint, data=data, method='POST', headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            content = None
            choices = body.get('choices')
            if choices:
                msg = choices[0].get('message') or {}
                content = msg.get('content') or choices[0].get('text')
            elif body.get('content'):   # پاسخ Anthropic
                blocks = body.get('content')
                if isinstance(blocks, list):
                    content = '\n'.join(b.get('text', '') for b in blocks if isinstance(b, dict))
                else:
                    content = str(blocks)
            return True, (content or '')
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode('utf-8'))
            err = detail.get('error')
            msg = (err.get('message', '') if isinstance(err, dict) else str(err)) or str(detail)[:200]
        except Exception:
            msg = f'کد وضعیت {e.code}'
        return False, msg
    except Exception as e:
        return False, str(e)[:200]


def api_ai_chat(handler, body):
    """پراکسی AI (نسخه ۲٫۵) — دو مسیر:
    ۱) کاربر وارد حساب با کلید ذخیره‌شده: کلید از مخزن امن خوانده می‌شود و به مرورگر برنمی‌گردد.
    ۲) کلید نشست (بدون حساب یا بدون کلید ذخیره‌شده): کلید فقط برای همین فراخوانی
       روی HTTP محلی (127.0.0.1) به پراکسی داده می‌شود — راه‌حل قطعی CORS.
    آدرس سرویس نرمال‌سازی می‌شود (آدرس پایه + /chat/completions)."""
    require_fields(body, 'endpoint', 'model', 'messages')
    endpoint = _normalize_endpoint(str(body['endpoint']).strip())
    if not endpoint:
        raise ApiError(400, 'آدرس سرویس باید با http/https شروع شود.')
    model = str(body['model']).strip() or 'gpt-4o-mini'
    messages = body['messages']
    if not isinstance(messages, list) or not messages:
        raise ApiError(400, 'پیام‌ها نامعتبر است.')
    temperature = float(body.get('temperature', 0.4))

    u = get_session_user(handler._ras_cookie)
    key = None
    key_source = None
    if u and u.get('verified'):
        rows = q("SELECT enc FROM api_keys WHERE user_id=?", (u['id'],), fetch=True)
        if rows:
            key = decrypt_secret(rows[0]['enc'])
            if key:
                key_source = 'vault'
            else:
                raise ApiError(500, 'بازگشایی کلید ذخیره‌شده ناموفق بود؛ کلید را دوباره ثبت کنید.')
    if key is None:
        sess_key = str(body.get('apiKey') or '').strip()
        if not sess_key:
            raise ApiError(400, 'کلید API در دسترس نیست؛ کلید نشست را وارد کنید یا در حساب، کلید امن ذخیره کنید.')
        if len(sess_key) < 8:
            raise ApiError(400, 'کلید API واردشده کوتاه/نامعتبر است.')
        ip = get_client_key(handler)
        if not rate_limit(f'ai-anon:{ip}', 40, 300):
            raise ApiError(429, 'تعداد درخواست‌های AI زیاد است؛ کمی صبر کنید.')
        key = sess_key
        key_source = 'session'
    elif not rate_limit(f'ai:{u["id"]}', 60, 300):
        raise ApiError(429, 'تعداد درخواست‌های AI زیاد است؛ کمی صبر کنید.')

    ok, out = _forward_chat(endpoint, key, model, messages, temperature=temperature)
    if not ok:
        if key_source == 'vault':
            q("UPDATE api_keys SET status='invalid' WHERE user_id=?", (u['id'],))
        raise ApiError(502, f'سرویس هوش مصنوعی خطا داد: {out}')
    if key_source == 'vault':
        q("UPDATE api_keys SET status='valid' WHERE user_id=?", (u['id'],))
    return ApiResult({'ok': True, 'content': out, 'keySource': key_source})


# ══════════════════════════════════════════════════════════════
#  مسیریابی
# ══════════════════════════════════════════════════════════════
ROUTES_GET = {
    '/api/health': lambda h: ApiResult({
        'ok': True, 'version': APP_VERSION, 'service': 'ras-local-auth',
        'smtpConfigured': smtp_config() is not None
    }),
    '/api/auth/me': api_me,
    '/api/user/apikey': api_key_get,
}

ROUTES_POST = {
    '/api/auth/register': api_register,
    '/api/auth/verify': api_verify_email,
    '/api/auth/resend': api_resend_otp,
    '/api/auth/login': api_login,
    '/api/auth/logout': api_logout,
    '/api/auth/change-password': api_change_password,
    '/api/auth/reset-password': api_reset_password,
    '/api/user/apikey/save': api_key_save,
    '/api/user/apikey/delete': api_key_delete,
    '/api/user/apikey/test': api_key_test,
    '/api/ai/chat': api_ai_chat,
}


def parse_cookies(handler):
    header = handler.headers.get('Cookie') or ''
    out = ''
    for part in header.split(';'):
        if '=' in part:
            k, v = part.strip().split('=', 1)
            if k == SESSION_COOKIE:
                out = v
    return out


def handle_api(handler, method):
    path = handler.path.split('?', 1)[0]
    table = ROUTES_GET if method == 'GET' else ROUTES_POST
    fn = table.get(path)
    if not fn:
        handler._send_json(404, {'ok': False, 'error': 'مسیر API یافت نشد.'})
        return True
    try:
        # محافظت CSRF سبک: سربرگ سفارشی برای همه POSTها
        if method == 'POST':
            if handler.headers.get('X-Requested-With') != 'XMLHttpRequest':
                raise ApiError(403, 'درخواست نامعتبر است (سربرگ امنیتی missing).')
        handler._ras_cookie = parse_cookies(handler)
        handler._ras_body = parse_body(handler) if method == 'POST' else {}
        res = fn(handler, handler._ras_body) if method == 'POST' else fn(handler)
        handler._send_json(res.status, res.data, set_cookie=res.set_cookie, clear_cookie=res.clear_cookie)
    except ApiError as e:
        handler._send_json(e.status, {'ok': False, 'error': e.message})
    except Exception as e:
        # جزئیات داخلی افشا نمی‌شود
        handler._send_json(500, {'ok': False, 'error': 'خطای داخلی سرور.'})
        print(f'  [api] خطا در {path}: {type(e).__name__}')
    return True
