"""
Lebanon Sports Hub -- Flask Backend
Start: python App.py
API base: http://localhost:5000/api

EMAIL SETUP (required for password reset & approval emails):
  1. Enable 2-Step Verification on your Gmail account.
  2. Go to: Google Account → Security → App Passwords
  3. Create an App Password for "Mail".
  4. Create a file named  .env  next to this script with:
       MAIL_PASSWORD=xxxx xxxx xxxx xxxx
  5. Run:  pip install python-dotenv
"""

from flask import Flask, request, jsonify, session
from flask_cors import CORS
from collections import defaultdict
import mysql.connector
from werkzeug.security import generate_password_hash, check_password_hash
import os
import re
import secrets
import requests
from mysql.connector import errorcode
import random
import string
from datetime import datetime, timedelta
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

# Load .env file if present (pip install python-dotenv)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed -- use real env vars instead















def chat_proxy():
    """
    Proxies messages to the Anthropic API.
    The API key lives here on the server -- never sent to the browser.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
 
        messages    = data.get('messages', [])
        system      = data.get('system', '')
        max_tokens  = data.get('max_tokens', 800)
 
        anthropic_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if not anthropic_key:
            return jsonify({'error': 'AI service not configured'}), 503
 
        response = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'Content-Type':         'application/json',
                'x-api-key':            anthropic_key,
                'anthropic-version':    '2023-06-01',
            },
            json={
                'model':      'claude-haiku-4-5-20251001',   # cheapest model, perfect for chatbot
                'max_tokens': max_tokens,
                'system':     system,
                'messages':   messages,
            },
            timeout=30
        )
 
        if not response.ok:
            return jsonify({'error': 'AI service error'}), response.status_code
 
        return jsonify(response.json()), 200
 
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Request timed out'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500
 











app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "lsh_secret_2026")
# CURRENT — too loose, fails with credentials in some browsers
CORS(app, supports_credentials=True)

# ── Simple in-memory rate limiter ────────────────────────────
import time as _time
_rate_store = defaultdict(list)

def rate_limit(key, max_requests, window_seconds):
    now = _time.time()
    _rate_store[key] = [t for t in _rate_store[key] if now - t < window_seconds]
    if len(_rate_store[key]) >= max_requests:
        return False
    _rate_store[key].append(now)
    return True

def get_client_ip():
    return request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown').split(',')[0].strip()

# FIXED — explicitly whitelist all local origins
CORS(app,
     supports_credentials=True,
     origins=[
         "http://localhost:5000",
         "http://127.0.0.1:5000",
         "http://localhost:3000",
         "http://localhost:5500",   # VS Code Live Server
         "http://localhost:8080",
         "null",                    # file:// protocol
         "https://files-tawny-seven.vercel.app",
     ])


# -- Email config (set these as env vars or fill directly) -------------------
MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "tamernasr1717@gmail.com")
MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")   # Gmail App Password

# -- In-memory password-reset store  {email: {code, expires}} ----------------
# Codes expire after 10 minutes. Cleared after successful reset.
_reset_codes: dict = {}

# -- In-memory notification store  {user_id: [notif_dict, -]} -----------------
_user_notifications: dict = {}

def add_user_notification(user_id: int, notif_type: str, title: str, message: str):
    """Push a notification for a specific user (by user_id)."""
    if user_id not in _user_notifications:
        _user_notifications[user_id] = []
    _user_notifications[user_id].append({
        "id":         ''.join(random.choices(string.ascii_lowercase + string.digits, k=8)),
        "type":       notif_type,   # "approved" | "rejected" | "info"
        "title":      title,
        "message":    message,
        "created_at": datetime.now().isoformat(),
        "read":       False,
    })


def send_status_email(to_email: str, full_name: str, status: str):
    """Email a user when their account is approved or rejected by an admin."""
    approved = status == "approved"
    color    = "#10b981" if approved else "#ef4444"
    icon     = "OK" if approved else "X"
    heading  = "Account Approved!" if approved else "Registration Not Approved"
    body_msg = (
        "Great news! Your account on Lebanon Sports Hub has been <strong>approved</strong>. "
        "You can now sign in and start exploring our events."
        if approved else
        "Unfortunately, your registration on Lebanon Sports Hub was <strong>not approved</strong> "
        "at this time. Please contact our support team for more information."
    )
    cta_text = "Sign In Now" if approved else "Contact Support"
    cta_href = "http://localhost:5000" if approved else "mailto:tamernasr1717@gmail.com"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#1a56db,#3b82f6);
                     padding:32px 40px;text-align:center">
            <div style="font-size:2rem;margin-bottom:8px"></div>
            <h1 style="color:#ffffff;font-size:1.3rem;font-weight:800;margin:0">Lebanon Sports Hub</h1>
            <p style="color:rgba(255,255,255,.75);font-size:.85rem;margin:6px 0 0">Account Status Update</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px">
            <div style="text-align:center;font-size:2.5rem;margin-bottom:16px">{icon}</div>
            <h2 style="color:{color};text-align:center;font-size:1.4rem;margin:0 0 16px">{heading}</h2>
            <p style="color:#374151;font-size:.95rem;margin:0 0 16px">Hi <strong>{full_name}</strong>,</p>
            <p style="color:#374151;font-size:.95rem;line-height:1.7;margin:0 0 28px">{body_msg}</p>
            <div style="text-align:center">
              <a href="{cta_href}"
                 style="display:inline-block;background:{color};color:#fff;
                        padding:12px 32px;border-radius:8px;font-weight:700;
                        font-size:.95rem;text-decoration:none">{cta_text}</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;
                     padding:20px 40px;text-align:center">
            <p style="color:#9ca3af;font-size:.75rem;margin:0">
              © 2026 Lebanon Sports Hub. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Lebanon Sports Hub -- {heading}"
    msg["From"]    = f"Lebanon Sports Hub <{MAIL_USERNAME}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html"))

    if not MAIL_PASSWORD:
        print(f"\n[DEV] Status email for {to_email}: {heading}\n")
        return

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
        server.login(MAIL_USERNAME, MAIL_PASSWORD)
        server.sendmail(MAIL_USERNAME, to_email, msg.as_string())


def send_reset_email(to_email: str, code: str):
    """Send a styled HTML email with the 6-digit reset code via Gmail SMTP."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Lebanon Sports Hub -- Password Reset Code"
    msg["From"]    = f"Lebanon Sports Hub <{MAIL_USERNAME}>"
    msg["To"]      = to_email

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a56db,#3b82f6);
                     padding:32px 40px;text-align:center">
            <div style="font-size:2rem;margin-bottom:8px"></div>
            <h1 style="color:#ffffff;font-size:1.3rem;font-weight:800;margin:0;
                       letter-spacing:-.02em">Lebanon Sports Hub</h1>
            <p style="color:rgba(255,255,255,.75);font-size:.85rem;margin:6px 0 0">
              Password Reset Request
            </p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px">
            <p style="color:#374151;font-size:.95rem;margin:0 0 20px">Hi there,</p>
            <p style="color:#374151;font-size:.95rem;margin:0 0 28px;line-height:1.6">
              We received a request to reset your password. Use the verification
              code below. It expires in <strong>10 minutes</strong>.
            </p>
            <!-- Code box -->
            <div style="background:#eff6ff;border:2px dashed #93c5fd;border-radius:12px;
                        padding:24px;text-align:center;margin-bottom:28px">
              <p style="color:#6b7280;font-size:.78rem;font-weight:600;
                        text-transform:uppercase;letter-spacing:.1em;margin:0 0 10px">
                Verification Code
              </p>
              <div style="font-size:2.8rem;font-weight:900;letter-spacing:.3em;
                          color:#1a56db;font-family:monospace">
                {code}
              </div>
            </div>
            <p style="color:#9ca3af;font-size:.82rem;line-height:1.6;margin:0 0 8px">
              ! If you didn't request this, please ignore this email -- your
              password will not change.
            </p>
            <p style="color:#9ca3af;font-size:.82rem;line-height:1.6;margin:0">
              🔒 Resetting your password will unlink any connected Google account.
              You can re-link Google after signing back in.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;
                     padding:20px 40px;text-align:center">
            <p style="color:#9ca3af;font-size:.75rem;margin:0">
              © 2026 Lebanon Sports Hub. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""
    msg.attach(MIMEText(html, "html"))

    if not MAIL_PASSWORD:
        # No credentials set -- print code to console for dev/testing
        print(f"\n[DEV] Reset code for {to_email}: {code}\n")
        return

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
        server.login(MAIL_USERNAME, MAIL_PASSWORD)
        server.sendmail(MAIL_USERNAME, to_email, msg.as_string())

# -- DB config ------------------------------------------------------------------
DB_CONFIG = {
    "host":             os.environ.get("DB_HOST", "localhost"),
    "port":             int(os.environ.get("DB_PORT", 3306)),
    "user":             os.environ.get("DB_USER", "root"),
    "password":         os.environ.get("DB_PASSWORD", "taml7677"),
    "database":         os.environ.get("DB_NAME", "SportsFinalyearproject"),
    "autocommit":       False,
    "ssl_disabled":     os.environ.get("DB_HOST", "localhost") == "localhost",
    "ssl_verify_cert":  False,
    "ssl_verify_identity": False,
}


def get_db():
    return mysql.connector.connect(**DB_CONFIG)

# In-memory verification tokens: {token: {email, full_name, password_hash, phone, sport_interest, expires}}
_verification_tokens = {}

def _clean_expired_tokens():
    now = datetime.utcnow()  # ✅ Correct
    expired = [k for k, v in _verification_tokens.items() if v["expires"] < now]
    for k in expired:
        del _verification_tokens[k]


@app.route("/")
def index():
    return jsonify({
        "project": "Lebanon Sports Hub",
        "status":  "running",
        "endpoints": [
            "GET  /api/events",
            "GET  /api/events/<id>",
            "GET  /api/sports",
            "GET  /api/venues",
            "POST /api/register",
            "POST /api/login",
            "POST /api/logout",
            "POST /api/forgot-password",
            "POST /api/verify-reset-code",
            "POST /api/reset-password",
            "POST /api/admin/login",
            "GET  /api/admin/members",
            "GET  /api/admin/registrations",
            "GET  /api/admin/activity",
        ]
    })


# -- Helper ---------------------------------------------------------------------
def log_action(cursor, admin_id, action, target_type=None, target_id=None):
    cursor.execute(
        "INSERT INTO activity_log (admin_id, action, target_type, target_id) "
        "VALUES (%s,%s,%s,%s)",
        (admin_id, action, target_type, target_id),
    )


# ------------------------------------------------------------------------------
#  AUTH -- USERS
# ------------------------------------------------------------------------------

@app.route("/api/check-status", methods=["GET"])
def check_status():
    email = request.args.get("email", "")
    if not email:
        return jsonify({"error": "email required"}), 400
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("SELECT status FROM users WHERE email=%s", (email,))
    row = cur.fetchone()
    cur.close(); db.close()
    if not row:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"status": row["status"]})


@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json()
    required = ("full_name", "email", "password")
    if not all(data.get(k) for k in required):
        return jsonify({"error": "full_name, email and password are required"}), 400

    email = data["email"].strip().lower()
    full_name = data["full_name"].strip()
    password = data["password"]

    # Basic email format validation
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"error": "Invalid email address format"}), 400

    # Password strength check
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    # Check if email already exists (verified or pending verification)
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("SELECT id, status FROM users WHERE email=%s", (email,))
    existing = cur.fetchone()
    cur.close(); db.close()

    if existing:
        return jsonify({"error": "This email is already registered. Try signing in or reset your password."}), 409

    # Check if already pending verification
    _clean_expired_tokens()
    already_pending = any(v["email"] == email for v in _verification_tokens.values())
    if already_pending:
        return jsonify({"error": "A verification email was already sent to this address. Please check your inbox."}), 409

    # Generate verification token
    token = secrets.token_urlsafe(32)
    pw_hash = generate_password_hash(password)

    _verification_tokens[token] = {
        "email": email,
        "full_name": full_name,
        "password_hash": pw_hash,
        "phone": data.get("phone", ""),
        "sport_interest": data.get("sport_interest", ""),
      "expires": datetime.utcnow() + timedelta(hours=24),
    }

    # Send verification email
    try:
        send_verification_email(email, full_name, token)
    except Exception as e:
        del _verification_tokens[token]
        print(f"Email send error: {e}")
        return jsonify({"error": "Failed to send verification email. Please check your email address."}), 500

    return jsonify({
        "message": f"Verification email sent to {email}. Please check your inbox and click the link to complete registration.",
        "email": email
    }), 200


@app.route("/api/verify-email", methods=["GET"])
def verify_email():
    token = request.args.get("token", "")
    _clean_expired_tokens()

    if token not in _verification_tokens:
        return """<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px;background:#f3f4f6;">
        <div style="background:#fff;border-radius:12px;padding:40px;max-width:480px;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <div style="font-size:48px;margin-bottom:16px;">X</div>
        <h2 style="color:#dc2626;">Link Expired or Invalid</h2>
        <p style="color:#6b7280;">This verification link has expired or already been used. Please register again.</p>
        <a href="https://files-tawny-seven.vercel.app" style="display:inline-block;margin-top:20px;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;">Back to App</a>
        </div></body></html>""", 400

    data = _verification_tokens.pop(token)

    # Insert user into DB
    db = get_db(); cur = db.cursor()
    try:
        cur.execute(
            "INSERT INTO users (full_name, email, password_hash, phone, sport_interest) "
            "VALUES (%s,%s,%s,%s,%s)",
            (data["full_name"], data["email"], data["password_hash"],
             data.get("phone"), data.get("sport_interest")),
        )
        db.commit()
    except mysql.connector.IntegrityError:
        cur.close(); db.close()
        return """<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px;background:#f3f4f6;">
        <div style="background:#fff;border-radius:12px;padding:40px;max-width:480px;margin:0 auto;">
        <div style="font-size:48px;">!</div>
        <h2 style="color:#f59e0b;">Already Registered</h2>
        <p style="color:#6b7280;">This email is already registered. Try signing in.</p>
        <a href="https://files-tawny-seven.vercel.app" style="display:inline-block;margin-top:20px;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;">Sign In</a>
        </div></body></html>""", 409
    finally:
        cur.close(); db.close()

    name_safe = data["full_name"].replace("<","&lt;").replace(">","&gt;")
    return (
        '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px;background:#f3f4f6;">'
        '<div style="background:#fff;border-radius:12px;padding:40px;max-width:480px;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,.08);">'
        '<div style="font-size:48px;margin-bottom:16px;">OK</div>'
        '<h2 style="color:#16a34a;">Email Verified!</h2>'
        '<p style="color:#374151;">Your email has been verified successfully, <strong>' + name_safe + '</strong>!</p>'
        '<p style="color:#6b7280;font-size:14px;">Your account is now pending admin approval. You will receive another email once approved.</p>'
        '<a href="https://files-tawny-seven.vercel.app" style="display:inline-block;margin-top:24px;background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Go to Lebanon Sports Hub</a>'
        '</div></body></html>'
    )


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM users WHERE email=%s", (data.get("email"),))
    user = cur.fetchone()
    cur.close(); db.close()
    if not user or not check_password_hash(user["password_hash"], data.get("password", "")):
        return jsonify({"error": "Invalid credentials"}), 401
    if user["status"] != "approved":
        return jsonify({
            "error": f"Account is {user['status']}. Contact admin.",
            "status": user["status"],
            "name": user["full_name"]
        }), 403
    session["user_id"] = user["id"]
    return jsonify({"message": "Login successful", "user": {
        "id": user["id"], "full_name": user["full_name"],
        "email": user["email"], "sport_interest": user["sport_interest"],
    }})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"})


# ------------------------------------------------------------------------------
#  PASSWORD RESET  (3-step: request code - verify - reset)
# ------------------------------------------------------------------------------

def send_verification_email(to_email: str, full_name: str, token: str):
    """Send email verification link."""
    base_url = os.environ.get("FRONTEND_URL", "https://files-tawny-seven.vercel.app")
    verify_link = f"{base_url}/api/verify-email?token={token}"
    html = f"""
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <tr><td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px 40px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">Lebanon Sports Hub</h1>
        <p style="color:rgba(255,255,255,.85);margin:8px 0 0;font-size:14px;">Verify Your Email Address</p>
      </td></tr>
      <tr><td style="padding:36px 40px;">
        <p style="font-size:16px;color:#111;">Hi <strong>{full_name}</strong>,</p>
        <p style="color:#374151;line-height:1.6;">Thanks for registering! Please verify your email address to complete your registration.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="{verify_link}" style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold;">Verify My Email</a>
        </div>
        <p style="color:#6b7280;font-size:13px;">This link expires in <strong>24 hours</strong>. If you did not create this account, ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;text-align:center;">Lebanon Sports Hub - Connecting Lebanon through Sport</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Lebanon Sports Hub -- Verify Your Email"
    msg["From"]    = f"Lebanon Sports Hub <{MAIL_USERNAME}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html"))

    if not MAIL_PASSWORD:
        print(f"\n[DEV] Verification email for {to_email}: {verify_link}\n")
        return

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
        server.login(MAIL_USERNAME, MAIL_PASSWORD)
        server.sendmail(MAIL_USERNAME, to_email, msg.as_string())


@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    """Step 1 -- generate a 6-digit code and email it to the user."""
    data  = request.get_json() or {}
    email = data.get("email", "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required"}), 400

    # Confirm the account exists
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("SELECT id FROM users WHERE email=%s", (email,))
    user = cur.fetchone()
    cur.close(); db.close()

    if not user:
        return jsonify({"error": "No account found with this email address"}), 404

    # Generate & store code (overwrites any previous request for this email)
    code = "".join(random.choices(string.digits, k=6))
    _reset_codes[email] = {
        "code":    code,
        "expires": datetime.now() + timedelta(minutes=10),
    }

    try:
        send_reset_email(email, code)
    except Exception as e:
        return jsonify({"error": f"Could not send email: {str(e)}"}), 500

    return jsonify({"message": "Verification code sent to your email"}), 200


@app.route("/api/verify-reset-code", methods=["POST"])
def verify_reset_code():
    """Step 2 -- check the code before letting the user set a new password."""
    data  = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    code  = data.get("code",  "").strip()

    entry = _reset_codes.get(email)
    if not entry:
        return jsonify({"error": "No reset request found. Please request a new code."}), 400
    if datetime.now() > entry["expires"]:
        _reset_codes.pop(email, None)
        return jsonify({"error": "Code has expired. Please request a new one."}), 400
    if entry["code"] != code:
        return jsonify({"error": "Invalid code. Please try again."}), 400

    return jsonify({"message": "Code verified"}), 200


@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    """Step 3 -- verify code one final time, then update the password."""
    data         = request.get_json() or {}
    email        = data.get("email",        "").strip().lower()
    code         = data.get("code",         "").strip()
    new_password = data.get("new_password", "")
    unlink_google = data.get("unlink_google", False)

    # Re-verify code
    entry = _reset_codes.get(email)
    if not entry:
        return jsonify({"error": "No reset request found. Please start over."}), 400
    if datetime.now() > entry["expires"]:
        _reset_codes.pop(email, None)
        return jsonify({"error": "Code has expired. Please start over."}), 400
    if entry["code"] != code:
        return jsonify({"error": "Invalid code. Please start over."}), 400

    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    pw_hash = generate_password_hash(new_password)
    db = get_db(); cur = db.cursor()
    try:
        if unlink_google:
            # Try to clear google_id column if it exists; fall back gracefully
            try:
                cur.execute(
                    "UPDATE users SET password_hash=%s, google_id=NULL WHERE email=%s",
                    (pw_hash, email),
                )
            except Exception:
                cur.execute(
                    "UPDATE users SET password_hash=%s WHERE email=%s",
                    (pw_hash, email),
                )
        else:
            cur.execute(
                "UPDATE users SET password_hash=%s WHERE email=%s",
                (pw_hash, email),
            )

        if cur.rowcount == 0:
            return jsonify({"error": "User not found"}), 404

        db.commit()
        _reset_codes.pop(email, None)   # Invalidate code after successful reset
        return jsonify({"message": "Password reset successfully"}), 200

    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()


# ------------------------------------------------------------------------------
#  AUTH -- ADMIN
# ------------------------------------------------------------------------------

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json()
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM admins WHERE email=%s", (data.get("email"),))
    admin = cur.fetchone()
    cur.close(); db.close()
    if not admin or not check_password_hash(admin["password_hash"], data.get("password", "")):
        return jsonify({"error": "Invalid admin credentials"}), 401
    session["admin_id"] = admin["id"]
    return jsonify({"message": "Admin login successful",
                    "admin": {"id": admin["id"], "full_name": admin["full_name"]}})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_id", None)
    return jsonify({"message": "Admin logged out"})


def admin_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if "admin_id" not in session:
            return jsonify({"error": "Admin authentication required"}), 401
        return f(*args, **kwargs)
    return decorated


# ------------------------------------------------------------------------------
#  EVENTS
# ------------------------------------------------------------------------------

@app.route("/api/events", methods=["GET"])
def get_events():
    db = get_db(); cur = db.cursor(dictionary=True)
    for col_sql in [
        "ALTER TABLE events ADD COLUMN price DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE events ADD COLUMN venue_city VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE events ADD COLUMN venue_name_text VARCHAR(255) DEFAULT NULL",
    ]:
        try: cur.execute(col_sql); db.commit()
        except Exception: pass
    cur.execute("""
        SELECT e.*,
               COALESCE(e.venue_city, v.city)  AS venue_city,
               COALESCE(e.venue_name_text, v.name) AS venue_name
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE e.status != 'cancelled'
        ORDER BY e.event_date ASC
    """)
    events = cur.fetchall()
    cur.close(); db.close()
    for ev in events:
        if ev.get("event_date"): ev["event_date"] = str(ev["event_date"])
        if ev.get("event_time"): ev["event_time"] = str(ev["event_time"])
    return jsonify(events)


@app.route("/api/admin/events-list", methods=["GET"])
def admin_events_list():
    """Admin-only endpoint to list ALL events including cancelled."""
    db = get_db(); cur = db.cursor(dictionary=True)
    for col_sql in [
        "ALTER TABLE events ADD COLUMN price DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE events ADD COLUMN venue_city VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE events ADD COLUMN venue_name_text VARCHAR(255) DEFAULT NULL",
    ]:
        try: cur.execute(col_sql); db.commit()
        except Exception: pass
    cur.execute("""
        SELECT e.*,
               COALESCE(e.venue_city, v.city) AS venue_city,
               COALESCE(e.venue_name_text, v.name) AS venue_name
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        ORDER BY e.created_at DESC
    """)
    events = cur.fetchall()
    cur.close(); db.close()
    for ev in events:
        if ev.get("event_date"): ev["event_date"] = str(ev["event_date"])
        if ev.get("event_time"): ev["event_time"] = str(ev["event_time"])
    return jsonify(events)


@app.route("/api/events/<int:event_id>", methods=["GET"])
def get_event(event_id):
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT e.*, v.name AS venue_name, v.address AS venue_address,
               v.city AS venue_city, v.latitude, v.longitude
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE e.id = %s
    """, (event_id,))
    event = cur.fetchone()
    cur.close(); db.close()
    if not event:
        return jsonify({"error": "Event not found"}), 404
    if event.get("event_date"): event["event_date"] = str(event["event_date"])
    if event.get("event_time"): event["event_time"] = str(event["event_time"])
    return jsonify(event)


@app.route("/api/admin/events", methods=["POST"])
@admin_required
def create_event():
    data = request.get_json()
    if not data.get("title") or not data.get("event_date"):
        return jsonify({"error": "title and event_date are required"}), 400
    db = get_db(); cur = db.cursor()

    # Ensure extra columns exist
    for col_sql in [
        "ALTER TABLE events ADD COLUMN price DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE events ADD COLUMN venue_city VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE events ADD COLUMN venue_name_text VARCHAR(255) DEFAULT NULL",
    ]:
        try: cur.execute(col_sql); db.commit()
        except Exception: pass

    try:
        cur.execute("""
            INSERT INTO events
              (title, description, sport_category, venue_id, event_date, event_time,
               max_participants, status, image_url, created_by, price, venue_city, venue_name_text)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            data["title"], data.get("description"), data.get("sport_category"),
            None, data["event_date"], data.get("event_time"),
            data.get("max_participants", 50), data.get("status", "upcoming"),
            data.get("image_url"), session["admin_id"],
            data.get("price", 0), data.get("venue_city", "Beirut"),
            data.get("venue_name", "")
        ))
        event_id = cur.lastrowid
        log_action(cur, session["admin_id"], f"Created event '{data['title']}'", "event", event_id)
        db.commit(); cur.close(); db.close()
        return jsonify({"message": "Event created", "id": event_id}), 201
    except Exception as ex:
        cur.close(); db.close()
        return jsonify({"error": str(ex)}), 500


@app.route("/api/admin/events/<int:event_id>", methods=["PUT"])
@admin_required
def update_event(event_id):
    data = request.get_json()
    db = get_db(); cur = db.cursor()
    for col_sql in [
        "ALTER TABLE events ADD COLUMN price DECIMAL(10,2) DEFAULT 0",
        "ALTER TABLE events ADD COLUMN venue_city VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE events ADD COLUMN venue_name_text VARCHAR(255) DEFAULT NULL",
    ]:
        try: cur.execute(col_sql); db.commit()
        except Exception: pass
    try:
        cur.execute("""
            UPDATE events SET title=%s, description=%s, sport_category=%s,
              event_date=%s, event_time=%s, max_participants=%s,
              status=%s, image_url=%s, price=%s, venue_city=%s, venue_name_text=%s
            WHERE id=%s
        """, (
            data.get("title"), data.get("description"), data.get("sport_category"),
            data.get("event_date"), data.get("event_time"),
            data.get("max_participants"), data.get("status"), data.get("image_url"),
            data.get("price", 0), data.get("venue_city", "Beirut"),
            data.get("venue_name", ""), event_id,
        ))
        log_action(cur, session["admin_id"], f"Updated event id={event_id}", "event", event_id)
        db.commit(); cur.close(); db.close()
        return jsonify({"message": "Event updated"})
    except Exception as ex:
        cur.close(); db.close()
        return jsonify({"error": str(ex)}), 500


@app.route("/api/admin/events/<int:event_id>", methods=["DELETE"])
@admin_required
def delete_event(event_id):
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("SELECT title FROM events WHERE id=%s", (event_id,))
    ev = cur.fetchone()
    cur2 = db.cursor()
    cur2.execute("DELETE FROM events WHERE id=%s", (event_id,))
    if ev:
        log_action(cur2, session["admin_id"], f"Deleted event '{ev['title']}'", "event", event_id)
    db.commit(); cur.close(); cur2.close(); db.close()
    return jsonify({"message": "Event deleted"})


# ------------------------------------------------------------------------------
#  EVENT REGISTRATIONS
# ------------------------------------------------------------------------------

@app.route("/api/register-for-event", methods=["POST"])
def register_for_frontend_event():
    """Register for a hardcoded frontend event (ev-001, ev-002, …)."""
    data = request.get_json()
    user_id = session.get("user_id")
    event_ref   = data.get("event_ref")
    event_title = data.get("event_title", "")
    role = data.get("role", "spectator")
    if role not in ("spectator", "participant"):
        role = "spectator"

    if not event_ref:
        return jsonify({"error": "event_ref is required"}), 400

    db = get_db(); cur = db.cursor(dictionary=True)
    try:
        cur.execute("ALTER TABLE event_registrations ADD COLUMN role VARCHAR(20) DEFAULT 'spectator'")
        db.commit()
    except Exception:
        pass

    # Prevent duplicate registration
    if user_id:
        cur.execute(
            "SELECT id FROM event_registrations WHERE user_id=%s AND event_ref=%s",
            (user_id, event_ref),
        )
        if cur.fetchone():
            cur.close(); db.close()
            return jsonify({"error": "Already registered for this event"}), 409

    cur2 = db.cursor()
    cur2.execute("""
        INSERT INTO event_registrations
          (event_ref, event_title, user_id, guest_name, guest_email, guest_phone, role)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
    """, (event_ref, event_title, user_id,
          data.get("name"), data.get("email"), data.get("phone"), role))
    db.commit(); cur.close(); cur2.close(); db.close()
    return jsonify({"message": "Registration submitted. Awaiting approval.", "role": role}), 201


@app.route("/api/events/<int:event_id>/register", methods=["POST"])
def register_for_event(event_id):
    data = request.get_json()
    user_id = session.get("user_id")
    db = get_db(); cur = db.cursor(dictionary=True)

    cur.execute("SELECT max_participants FROM events WHERE id=%s", (event_id,))
    event = cur.fetchone()
    if not event:
        cur.close(); db.close()
        return jsonify({"error": "Event not found"}), 404
    cur.execute(
        "SELECT COUNT(*) AS cnt FROM event_registrations WHERE event_id=%s AND status='approved'",
        (event_id,),
    )
    count = cur.fetchone()["cnt"]
    if count >= event["max_participants"]:
        cur.close(); db.close()
        return jsonify({"error": "Event is fully booked"}), 409

    cur2 = db.cursor()
    cur2.execute("""
        INSERT INTO event_registrations
          (event_id, user_id, guest_name, guest_email, guest_phone)
        VALUES (%s,%s,%s,%s,%s)
    """, (event_id, user_id, data.get("name"), data.get("email"), data.get("phone")))
    db.commit(); cur.close(); cur2.close(); db.close()
    return jsonify({"message": "Registration submitted. Awaiting approval.", "role": role}), 201


@app.route("/api/my-registrations", methods=["GET"])
def my_registrations():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT r.id, r.event_ref, r.event_title,
               r.event_id, r.status, r.registered_at,
               COALESCE(r.event_title, e.title) AS display_title
        FROM event_registrations r
        LEFT JOIN events e ON r.event_id = e.id
        WHERE r.user_id = %s
        ORDER BY r.registered_at DESC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close(); db.close()
    for r in rows:
        if r.get("registered_at"): r["registered_at"] = str(r["registered_at"])
    return jsonify(rows)


@app.route("/api/admin/registrations", methods=["GET"])
@admin_required
def get_registrations():
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT r.*,
               COALESCE(r.event_title, e.title) AS event_title,
               u.full_name AS user_full_name,
               u.email AS user_email_addr
        FROM event_registrations r
        LEFT JOIN events e ON r.event_id = e.id
        LEFT JOIN users  u ON r.user_id  = u.id
        ORDER BY r.registered_at DESC
    """)
    rows = cur.fetchall()
    cur.close(); db.close()
    for r in rows:
        if r.get("registered_at"): r["registered_at"] = str(r["registered_at"])
    return jsonify(rows)


@app.route("/api/admin/registrations/<int:reg_id>/<action>", methods=["POST"])
@admin_required
def update_registration(reg_id, action):
    if action not in ("approve", "reject"):
        return jsonify({"error": "action must be approve or reject"}), 400
    status = "approved" if action == "approve" else "rejected"
    db = get_db()

    # -- Fetch registration + user info BEFORE updating -------------------------
    cur_info = db.cursor(dictionary=True)
    cur_info.execute("""
        SELECT r.user_id, r.event_title, r.event_ref,
               u.full_name, u.email
        FROM event_registrations r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.id = %s
    """, (reg_id,))
    reg_info = cur_info.fetchone()
    cur_info.close()

    cur = db.cursor()
    cur.execute("UPDATE event_registrations SET status=%s WHERE id=%s", (status, reg_id))
    log_action(cur, session["admin_id"], f"{action.capitalize()}d registration id={reg_id}",
               "registration", reg_id)
    db.commit(); cur.close(); db.close()

    # -- Push in-app notification to the user -----------------------------------
    if reg_info and reg_info.get("user_id"):
        event_name = reg_info.get("event_title") or reg_info.get("event_ref") or "the event"
        if status == "approved":
            add_user_notification(
                reg_info["user_id"],
                "event_approved",
                "Event Registration Approved 🎉",
                f"Your registration for \"{event_name}\" has been approved! You're all set.",
            )
        else:
            add_user_notification(
                reg_info["user_id"],
                "event_rejected",
                "Event Registration Not Approved",
                f"Your registration for \"{event_name}\" was not approved by the admin.",
            )

    return jsonify({"message": f"Registration {status}"})


# ------------------------------------------------------------------------------
#  MEMBERS (admin)
# ------------------------------------------------------------------------------

@app.route("/api/admin/members", methods=["GET"])
@admin_required
def get_members():
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute(
        "SELECT id, full_name, email, phone, sport_interest, status, created_at "
        "FROM users ORDER BY created_at DESC"
    )
    members = cur.fetchall()
    cur.close(); db.close()
    for m in members:
        if m.get("created_at"): m["created_at"] = str(m["created_at"])
    return jsonify(members)


@app.route("/api/admin/members/<int:user_id>/<action>", methods=["POST"])
@admin_required
def update_member(user_id, action):
    if action not in ("approve", "reject"):
        return jsonify({"error": "action must be approve or reject"}), 400
    status = "approved" if action == "approve" else "rejected"
    db = get_db(); cur = db.cursor(dictionary=True)

    # Fetch user details before updating so we can notify them
    cur.execute("SELECT id, full_name, email FROM users WHERE id=%s", (user_id,))
    target_user = cur.fetchone()

    cur2 = db.cursor()
    cur2.execute("UPDATE users SET status=%s WHERE id=%s", (status, user_id))
    log_action(cur2, session["admin_id"], f"{action.capitalize()}d member id={user_id}",
               "user", user_id)
    db.commit(); cur.close(); cur2.close(); db.close()

    # -- Push in-app notification ----------------------------------------------
    if target_user:
        if status == "approved":
            add_user_notification(
                user_id,
                "approved",
                "Account Approved 🎉",
                "Your registration has been approved! You can now sign in and explore events.",
            )
        else:
            add_user_notification(
                user_id,
                "rejected",
                "Registration Not Approved",
                "Your registration was not approved. Please contact our support team for more information.",
            )
        # -- Send email notification (non-blocking) ----------------------------
        try:
            send_status_email(target_user["email"], target_user["full_name"], status)
        except Exception as e:
            print(f"[WARN] Could not send status email to {target_user['email']}: {e}")

    return jsonify({"message": f"Member {status}"})


# ------------------------------------------------------------------------------
#  IN-APP NOTIFICATIONS
# ------------------------------------------------------------------------------

@app.route("/api/my-notifications", methods=["GET"])
def get_my_notifications():
    """Return all notifications for the currently logged-in user."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify([]), 200
    notifs = list(_user_notifications.get(user_id, []))
    # Return newest first
    notifs.sort(key=lambda n: n["created_at"], reverse=True)
    return jsonify(notifs)


@app.route("/api/my-notifications/read", methods=["POST"])
def mark_notifications_read():
    """Mark all notifications as read for the current user."""
    user_id = session.get("user_id")
    if user_id and user_id in _user_notifications:
        for n in _user_notifications[user_id]:
            n["read"] = True
    return jsonify({"message": "Marked as read"})


@app.route("/api/my-notifications/clear", methods=["POST"])
def clear_notifications():
    """Delete all notifications for the current user."""
    user_id = session.get("user_id")
    if user_id:
        _user_notifications[user_id] = []
    return jsonify({"message": "Cleared"})


# ------------------------------------------------------------------------------
#  SPORTS CATEGORIES & VENUES (public)
# ------------------------------------------------------------------------------

@app.route("/api/sports", methods=["GET"])
def get_sports():
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM sports_categories ORDER BY name")
    data = cur.fetchall()
    cur.close(); db.close()
    return jsonify(data)


@app.route("/api/venues", methods=["GET"])
def get_venues():
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM venues ORDER BY name")
    data = cur.fetchall()
    cur.close(); db.close()
    for v in data:
        if v.get("latitude"):  v["latitude"]  = float(v["latitude"])
        if v.get("longitude"): v["longitude"] = float(v["longitude"])
    return jsonify(data)


# ------------------------------------------------------------------------------
#  ACTIVITY LOG (admin)
# ------------------------------------------------------------------------------

@app.route("/api/admin/activity", methods=["GET"])
@admin_required
def get_activity():
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT l.*, a.full_name AS admin_name
        FROM activity_log l
        LEFT JOIN admins a ON l.admin_id = a.id
        ORDER BY l.created_at DESC
        LIMIT 50
    """)
    rows = cur.fetchall()
    cur.close(); db.close()
    for r in rows:
        if r.get("created_at"): r["created_at"] = str(r["created_at"])
    return jsonify(rows)


# ------------------------------------------------------------------------------
#  ONE-TIME HELPER -- set real admin password hash
# ------------------------------------------------------------------------------

def set_admin_password(email, plain_password):
    pw_hash = generate_password_hash(plain_password)
    db = get_db(); cur = db.cursor()
    cur.execute("UPDATE admins SET password_hash=%s WHERE email=%s", (pw_hash, email))
    db.commit(); cur.close(); db.close()
    print(f"Password updated for {email}")




@app.route("/api/gemini-chat", methods=["POST"])
def gemini_chat():
    """Proxy to Gemini API -- keeps API key server-side."""
    data = request.get_json() or {}
    user_message = data.get("message", "").strip()
    if not user_message:
        return jsonify({"error": "message is required"}), 400

    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        return jsonify({"error": "Gemini API not configured"}), 503

    system_prompt = (
        "You are SportBot, the AI assistant for Lebanon Sports Hub -- a platform for sports events "
        "across Lebanon's 8 mohafazat (Beirut, Mount Lebanon, North Lebanon, South Lebanon, "
        "Nabatieh, Bekaa, Baalbek-Hermel, Akkar). "
        "Help users find events, answer app questions (registration, map, profile, events). "
        "Be friendly, concise, use emojis. Keep answers under 150 words. "
        "Respond in the same language the user writes in."
    )

    payload = {
        "contents": [{"parts": [{"text": system_prompt + "\n\nUser: " + user_message}]}],
        "generationConfig": {"maxOutputTokens": 200, "temperature": 0.7}
    }

    gemini_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + gemini_key

    try:
        resp = requests.post(gemini_url, json=payload, timeout=10)
        result = resp.json()
        if resp.ok:
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            return jsonify({"reply": text})
        else:
            error = result.get("error", {}).get("message", "Gemini error")
            return jsonify({"error": error}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    try:
        set_admin_password("tamernasr1717@gmail.com", "TAML7677")
    except Exception as e:
        print(f"Note: Could not auto-set admin password: {e}")
    print("Starting Lebanon Sports Hub API on http://localhost:5000")
    app.run(debug=True, port=5000)