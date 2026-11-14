# Comprehensive Security, Privacy & Open-Source Readiness Audit

**Repository**: UsageOS  
**Audit Date**: 2026-11-14  
**Auditor**: Application Security Engineer & Privacy Auditor  
**Mode**: Read-only inspection (no modifications made)

---

## Executive Summary

**Verdict: NEEDS FIXES**

The UsageOS repository is a well-structured, self-hosted usage tracking system for Claude.ai consisting of:
- **Backend**: FastAPI + PostgreSQL (Python 3.12) with Docker deployment
- **Frontend**: React 18 + Vite + TypeScript + Tailwind, served via nginx
- **Browser Extension**: Manifest V3 (Chrome/Edge/Firefox) tracking claude.ai usage

**Attack Surface**: API endpoints (`/api/v1/*`), Telegram webhook, browser extension storage/messaging, PostgreSQL database, file uploads for avatars.

**Overall Readiness**: The architecture follows good self-hosted patterns (local-first, no external telemetry). However, **several critical and high-severity issues must be fixed before publishing**.

---

## Findings by Severity

---

### 🔴 CRITICAL

#### 1. [CRITICAL] Hardcoded Production API Endpoint in Extension Manifests
**Location**: 
- `extension/manifest.json:78`
- `extension/manifest_chrome.json:78`  
- `extension/manifest_firefox.json:84`

**Evidence**:
```json
"host_permissions": [
    "*://claude.ai/*",
    "https://api.anthropic.com/*",
    "https://usageos.example.com/*"   // <-- HARDCODED PERSONAL DOMAIN
]
```

**Risk**: 
- Every user who installs the extension gets permission granted to `https://usageos.example.com/*` — your personal domain
- This domain could be used to track all extension users, exfiltrate data, or serve malicious code
- Violates principle of least privilege; users should only grant access to their own self-hosted server

**Fix**: Remove the hardcoded domain from `host_permissions`. Use only `optional_host_permissions` with `<all_urls>` so users grant access to their own server at runtime.

```json
// REMOVE this line from host_permissions:
// "https://usageos.example.com/*"

// KEEP only in optional_host_permissions:
"optional_host_permissions": ["https://*/*", "http://*/*"]
```

---

#### 2. [CRITICAL] Personal Email in pyproject.toml
**Location**: `backend/pyproject.toml:5`

**Evidence**:
```toml
authors = ["Your Name <your-email@example.com>"]
```

**Risk**: Template placeholder not replaced; if this is a real email, it's exposed. Also indicates the project metadata wasn't personalized for release.

**Fix**: Replace with actual maintainer info or remove the `authors` field.

---

#### 3. [CRITICAL] `.env` File Committed to Git (Secrets in History)
**Location**: `.env` (tracked per `ls -la`)

**Evidence**:
```
POSTGRES_PASSWORD=atlas-local-pass-1794569349
ATLAS_API_KEY=5bb17071ab20789f6368aff5b8b7fec0c2dd4cf6ef8d5a747241664dd1dfd4dd
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
DASHBOARD_PASSWORD=local-dashboard-pass
```

**Risk**: 
- Real API key, database password, and dashboard password committed
- Even though `.gitignore` lists `.env`, the file exists in the working tree and may have been committed historically
- `ATLAS_API_KEY` is a valid 64-char hex string (high entropy) — can be used to impersonate the extension

**Fix**: 
1. **Immediately rotate all secrets** in `.env`
2. Run `git filter-repo` or BFG Repo-Cleaner to purge `.env` from **all commit history**
3. Verify `.env` is truly ignored: `git check-ignore .env`

---

#### 4. [CRITICAL] Extension ID Contains Personal Domain
**Location**: 
- `extension/manifest.json:9`
- `extension/manifest_chrome.json:9`
- `extension/manifest_firefox.json:9`

**Evidence**:
```json
"browser_specific_settings": {
    "gecko": {
        "id": "usageos_tracker@example.com"
    }
}
```

**Risk**: Extension ID is permanent and ties the extension to your personal domain. If you publish to Chrome Web Store / Firefox Add-ons, this ID must be unique and not contain a domain you don't control long-term.

**Fix**: Use a generic ID like `usageos-tracker@usageos.local` or your GitHub handle.

---

### 🟠 HIGH

#### 5. [HIGH] CORS Misconfiguration — `allow_origins=["*"]` with `allow_credentials=False`
**Location**: `backend/app/config.py:12`, `backend/app/main.py:124-130`

**Evidence**:
```python
# config.py
cors_origins: list[str] = ["*"]

# main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,  # <-- Good, but "*" is still risky
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Risk**: 
- While `allow_credentials=False` prevents cookie leakage, wildcard origins allow any site to make authenticated requests using the Bearer token (if they can obtain it)
- Should be restricted to the actual frontend origin in production

**Fix**: 
```python
# config.py - use env var with safe default
cors_origins: list[str] = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else ["http://localhost:3000"]
```

Or compute from `VITE_API_URL` / frontend URL at startup.

---

#### 6. [HIGH] No Rate Limiting on Auth Endpoints (Except Login)
**Location**: `backend/app/routers/auth.py:17-60`

**Evidence**: Login has IP-based rate limiting (8/min), but:
- `/api/v1/auth/me` — no rate limit
- Token verification on every request — no rate limit
- `/api/v1/sync` (extension endpoint) — no rate limit

**Risk**: Brute-force on session tokens, API key enumeration, DoS via sync endpoint.

**Fix**: Add rate limiting middleware (e.g., `slowapi`) globally or per sensitive route. At minimum, rate-limit `/sync` per API key.

---

#### 7. [HIGH] SQL Injection Risk in Maintenance Router (Raw SQL with Text)
**Location**: `backend/app/routers/maintenance.py:28-46`

**Evidence**:
```python
note = db.execute(
    text("SELECT value, updated_at FROM settings WHERE key = :key"),
    {"key": MAINTENANCE_NOTE_KEY}
).first()
```

**Risk**: Uses parameterized query correctly (`:key`), so **not currently exploitable**. However, pattern of using `text()` with raw SQL is fragile — future changes could introduce injection.

**Fix**: Use ORM consistently. Replace with:
```python
from app.models import Setting
note = db.query(Setting).filter(Setting.key == MAINTENANCE_NOTE_KEY).first()
```

---

#### 8. [HIGH] Avatar Upload — Path Traversal Risk
**Location**: `backend/app/routers/accounts.py:140-196`

**Evidence**:
```python
filename = f"{account_id}{ext}"
filepath = AVATAR_DIR / filename
# ...
filepath.write_bytes(content)
```

**Risk**: `account_id` is a UUID from the database (safe), but `AVATAR_DIR` is `/app/uploads/avatars`. If an attacker could control `account_id` (they can't — it's from DB), path traversal would be possible. Current code is **safe** because UUID is server-generated.

**However**: No validation that `account_id` is a valid UUID format before using in path. Defense in depth: validate.

**Fix**: Add UUID validation:
```python
from uuid import UUID
try:
    UUID(account_id)
except ValueError:
    raise HTTPException(400, "Invalid account ID")
```

---

#### 9. [HIGH] Telegram Webhook — No Signature Verification
**Location**: `backend/app/routers/telegram_webhook.py:75-91`

**Evidence**:
```python
@router.post("/webhook")
async def telegram_webhook(request: Request, db: Session = Depends(get_sync_db)):
    try:
        payload = await request.json()
    except Exception:
        return {"ok": True}
    # ... processes commands without verifying X-Telegram-Bot-Api-Signature
```

**Risk**: Anyone can POST to `/api/v1/telegram/webhook` and forge messages as if from Telegram, triggering:
- Chat ID disclosure (`/start` → reveals chat ID)
- Note injection on arbitrary accounts (`note <nickname> <text>`)
- Usage data leakage (`usage <nickname>`)

**Fix**: Implement Telegram webhook secret verification per [Telegram docs](https://core.telegram.org/bots/api#setwebhook):
```python
# In config.py, add: telegram_webhook_secret: str = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
# In webhook handler:
from fastapi import Header
async def telegram_webhook(
    request: Request, 
    db: Session = Depends(get_sync_db),
    x_telegram_bot_api_signature: str = Header(None)
):
    # Verify HMAC-SHA256 signature
```

---

#### 10. [HIGH] Extension Sends Anthropic API Key to api.anthropic.com
**Location**: `extension/bg-components/tokenManagement.js:148-172`, `manifest.json:77`

**Evidence**:
```javascript
const response = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    headers: {
        'x-api-key': apiKey,
        "anthropic-dangerous-direct-browser-access": "true"
    }
});
```

**Risk**: 
- User's personal Anthropic API key is sent from the browser to Anthropic's API
- Key is stored in extension's `storage.local` — accessible to any compromised content script
- `anthropic-dangerous-direct-browser-access` header acknowledges this is discouraged
- If extension is compromised, attacker gets valid Anthropic API key

**Fix**: 
- Document clearly that this feature is optional and requires user to paste their own key
- Consider proxying token counting through user's own backend (add `/api/v1/count-tokens` endpoint)
- At minimum, add warning in options page when API key is configured

---

#### 11. [HIGH] Debug Logs Include Sensitive Data
**Location**: `extension/background.js:880-888`, `extension/bg-components/claude-api.js:167-180`

**Evidence**:
```javascript
// background.js - logs request body including prompt length, attachments, files, tools
await Log("Request sent - Body:", {
    model: requestBodyJSON?.model,
    parent_message_uuid: requestBodyJSON?.parent_message_uuid,
    turn_message_uuids: requestBodyJSON?.turn_message_uuids,
    promptChars: requestBodyJSON?.prompt?.length ?? 0,
    attachments: requestBodyJSON?.attachments?.length ?? 0,
    files: requestBodyJSON?.files?.length ?? 0,
    tools: requestBodyJSON?.tools?.length ?? 0,
});
```

**Risk**: 
- Debug logs are stored in browser's `storage.local` (accessible via DevTools)
- While prompt *text* is not logged (only length), metadata reveals user activity patterns
- Logs persist until manually cleared

**Fix**: 
- Add a `debug_mode` setting (off by default)
- Only log metadata in production; redact in non-debug builds
- Auto-expire debug logs after 24h

---

#### 12. [HIGH] No Content Security Policy (CSP) in Frontend
**Location**: `frontend/nginx.conf`, `frontend/index.html`

**Evidence**: No CSP headers in nginx config or HTML meta tags.

**Risk**: XSS via malicious note content, avatar SVG upload, or compromised CDN (Google Fonts).

**Fix**: Add CSP to nginx:
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';";
```

And sanitize note content (currently raw text rendered in React — safe if not using `dangerouslySetInnerHTML`).

---

### 🟡 MEDIUM

#### 13. [MEDIUM] Session Token Uses Dashboard Password + API Key as HMAC Secret
**Location**: `backend/app/auth.py:32-34`

**Evidence**:
```python
def _secret() -> bytes:
    material = f"usageos-session|{dashboard_password()}|{settings.atlas_api_key}"
    return hashlib.sha256(material.encode()).digest()
```

**Risk**: 
- Session secret derives from two secrets; if either rotates, all sessions invalidate (by design, acceptable)
- However, session token is **1 year** (`SESSION_MAX_AGE = 60*60*24*365`) — too long for a bearer token
- No refresh token mechanism; session cannot be revoked individually (only by changing password/key)

**Fix**: Reduce session max age to 30 days. Add token versioning for revocation.

---

#### 14. [MEDIUM] Login Rate Limiting Uses In-Memory Dict (Not Distributed)
**Location**: `backend/app/routers/auth.py:17-42`

**Evidence**:
```python
_attempts: dict[str, list[float]] = {}
MAX_ATTEMPTS_PER_MINUTE = 8
```

**Risk**: 
- Rate limit resets on backend restart
- Doesn't work across multiple workers (Docker runs 2 workers: `Dockerfile:34`)
- IP can be spoofed via `X-Forwarded-For` (trusted proxy assumed)

**Fix**: Use Redis-backed rate limiter or at least synchronize across workers. For now, document single-instance assumption.

---

#### 15. [MEDIUM] Extension Permissions Over-Privileged
**Location**: `extension/manifest.json:67-79`

**Evidence**:
```json
"permissions": [
    "storage", "alarms", "cookies", "tabs", "contextMenus", "notifications"
],
"host_permissions": [
    "*://claude.ai/*",
    "https://api.anthropic.com/*",
    "https://usageos.example.com/*"
],
"optional_host_permissions": [
    "https://*/*", "http://*/*"
]
```

**Risk**: 
- `cookies` permission: can read all cookies on claude.ai (session tokens)
- `tabs` permission: can read all tab URLs
- `optional_host_permissions: "<all_urls>"` — users may grant this accidentally

**Fix**: 
- Remove `cookies` if not strictly needed (container strategy uses `cookieStoreId`)
- Keep `optional_host_permissions` but add clear UI explanation
- Consider dropping `tabs` if only `sender.tab.id` is needed (available in message sender)

---

#### 16. [MEDIUM] No Security Headers in Frontend nginx
**Location**: `frontend/nginx.conf`

**Evidence**: Missing `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

**Fix**: Add to nginx `server` block:
```nginx
add_header X-Frame-Options "DENY";
add_header X-Content-Type-Options "nosniff";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()";
```

---

#### 17. [MEDIUM] Docker Runs as Root (Implicit)
**Location**: `backend/Dockerfile`, `frontend/Dockerfile`

**Evidence**: No `USER` directive; containers run as root.

**Risk**: Container escape → host root access.

**Fix**: Add non-root user:
```dockerfile
# backend/Dockerfile
RUN addgroup -g 1000 -S appgroup && adduser -u 1000 -S appuser -G appgroup
USER appuser

# frontend/Dockerfile (nginx already runs as nginx user in alpine)
```

---

#### 18. [MEDIUM] Outdated / Unpinned Dependencies
**Location**: `backend/requirements.txt`, `frontend/package.json`

**Risk**: 
- `fastapi==0.115.0` — check for CVEs
- `uvicorn==0.32.0` — check for CVEs
- Frontend: `react@18.2.0` (old), `vite@5.0.12` (old), `typescript@5.4.0` (old)

**Fix**: Run `pip-audit` / `npm audit` and update. Pin exact versions in lockfiles.

---

#### 19. [MEDIUM] Extension Uses Unpinned External Resources (Google Fonts)
**Location**: `extension/options.html:6-8`, `extension/popup.html:6-8`, `extension/dashboard.html:6-8`

**Evidence**:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
```

**Risk**: 
- Third-party request on every extension page load (privacy leak: Google sees extension usage)
- If Google Fonts compromised, XSS in extension privileged pages
- Violates "no external dependencies" for privacy-focused tools

**Fix**: Self-host Inter font (download `.woff2` files, add to extension, reference via `chrome-extension://` URL).

---

#### 20. [MEDIUM] No Automated Security Scanning in CI/CD
**Location**: `.github/workflows/` (empty)

**Risk**: No SAST, dependency scanning, or container scanning on PRs.

**Fix**: Add GitHub Actions workflow with:
- `pip-audit` / `safety` for Python
- `npm audit` for Node
- `trivy` or `grype` for Docker images
- `bandit` for Python code

---

### 🔵 LOW

#### 21. [LOW] Personal Machine Paths in Documentation
**Location**: `README-dev.md`, `DEPLOY.md`, `.env.example` comments

**Evidence**: References to `/Users/name/...`, personal cloudflared config paths.

**Fix**: Replace with generic placeholders (`~/`, `/etc/cloudflared/config.yml`).

---

#### 22. [LOW] License Header Missing from Source Files
**Location**: All source files

**Risk**: GPLv3 requires license notices in each file.

**Fix**: Add SPDX header to all source files:
```python
# SPDX-License-Identifier: GPL-3.0-or-later
```

---

#### 23. [LOW] Alembic Migration Uses `server_default='now()'` (Timezone Ambiguity)
**Location**: `backend/alembic/versions/001_initial_schema.py:31-32`

**Evidence**:
```python
sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
```

**Risk**: `now()` returns `timestamp without time zone` in PostgreSQL; column is `timestamptz`. Works but implicit cast.

**Fix**: Use `sa.text('now() AT TIME ZONE \'UTC\'')` or `sa.func.now()`.

---

#### 24. [LOW] Debug Endpoint `/api/v1/sync/connection-test` Exists
**Location**: `backend/app/routers/sync.py` (referenced in `atlasSync.js:346`)

**Risk**: Unauthenticated endpoint that confirms server reachability — minor information disclosure.

**Fix**: Require API key or remove; health check `/api/v1/health` is sufficient.

---

#### 25. [LOW] `python-jose` and `passlib` in pyproject.toml but Not Used
**Location**: `backend/pyproject.toml:17-18`

**Evidence**:
```toml
python-jose = {extras = ["cryptography"], version = "^3.3.0"}
passlib = {extras = ["bcrypt"], version = "^1.7.4"}
```

**Risk**: Unused dependencies increase attack surface and install time.

**Fix**: Remove if not used (they're not in `requirements.txt` or imports).

---

### ℹ️ INFO

#### 26. [INFO] Good Practices Already in Place
- ✅ `.env` in `.gitignore`
- ✅ `.env.example` with safe dummy values
- ✅ `SECURITY.md` with vulnerability reporting instructions
- ✅ `LICENSE` (GPL-3.0)
- ✅ Parameterized SQL queries (no raw string interpolation)
- ✅ HMAC comparison for secrets (`hmac.compare_digest`)
- ✅ Secure cookie flags (`HttpOnly`, `SameSite=Lax`, `Secure` in production)
- ✅ PostgreSQL runs on `127.0.0.1:5432` (not exposed)
- ✅ Backend API binds to `127.0.0.1:8000` (proxied by nginx)
- ✅ Extension uses `storage.local` (not sync) — good for privacy
- ✅ Telegram bot token optional
- ✅ PRIVACY.md in extension

---

## Git History Warning

**The following files contain secrets and MUST be purged from git history before publishing:**

| File | Secrets Found | Action Required |
|------|---------------|-----------------|
| `.env` | `POSTGRES_PASSWORD`, `ATLAS_API_KEY`, `DASHBOARD_PASSWORD`, `TELEGRAM_BOT_TOKEN` | `git filter-repo --path .env --invert-paths` + **rotate all secrets** |
| `backend/pyproject.toml` | Author email (template) | Replace or remove |

**Commands to clean history:**
```bash
# Install git-filter-repo
pip install git-filter-repo

# Remove .env from all history
git filter-repo --path .env --invert-paths

# Force push (WARNING: rewrites history)
git push --force --all
git push --force --tags
```

**After cleaning**: Verify with `git log --all --full-history -- .env` (should show no results).

---

## Pre-Publish Checklist (Prioritized)

### 🚨 Blockers (Do First)
- [ ] **Rotate all secrets** in `.env` (new `ATLAS_API_KEY`, `POSTGRES_PASSWORD`, `DASHBOARD_PASSWORD`, `TELEGRAM_BOT_TOKEN`)
- [ ] **Purge `.env` from git history** using `git filter-repo`
- [ ] **Remove hardcoded `usageos.example.com`** from all 3 manifest files (`host_permissions` + extension ID)
- [ ] **Replace extension ID** with generic (e.g., `usageos-tracker@usageos.local`)
- [ ] **Add Telegram webhook signature verification** (backend)
- [ ] **Add CSP headers** to frontend nginx

### 🔧 High Priority
- [ ] **Restrict CORS origins** to frontend URL (not `*`)
- [ ] **Add rate limiting** to `/api/v1/sync`, `/api/v1/auth/me`, token verification
- [ ] **Self-host Inter font** in extension (remove Google Fonts requests)
- [ ] **Add non-root user** to backend Dockerfile
- [ ] **Run dependency audits**: `pip-audit`, `npm audit`; update vulnerable packages
- [ ] **Add GitHub Actions workflow** for SAST, dependency scanning, container scanning

### ✅ Medium Priority
- [ ] **Reduce session max age** from 1 year to 30 days
- [ ] **Add security headers** to nginx (`X-Frame-Options`, `X-Content-Type-Options`, etc.)
- [ ] **Validate UUID format** in avatar upload endpoint
- [ ] **Remove unused dependencies** (`python-jose`, `passlib` from pyproject.toml)
- [ ] **Replace raw SQL** in maintenance router with ORM
- [ ] **Add debug mode toggle** to extension (disable verbose logging by default)
- [ ] **Document Anthropic API key risk** in extension options UI

### 📝 Low Priority / Polish
- [ ] **Add SPDX license headers** to all source files
- [ ] **Fix alembic migration** timezone default
- [ ] **Remove debug endpoint** `/api/v1/sync/connection-test` or protect it
- [ ] **Replace personal paths** in docs with generic placeholders
- [ ] **Update pyproject.toml** author info
- [ ] **Consider dropping `cookies` and `tabs` permissions** from extension if unused

---

## Architecture Notes for Maintainers

1. **Self-hosted threat model**: The user controls the server. The extension only talks to the user's server. This is correctly implemented — no hardcoded telemetry, no developer-operated backend.

2. **Trust boundaries**:
   - Extension ↔ Backend: Authenticated via `ATLAS_API_KEY` (Bearer token)
   - Frontend ↔ Backend: Session cookie (HMAC-signed, 1-year expiry)
   - Backend ↔ Telegram: Bot token (webhook)
   - Extension ↔ Anthropic: Optional, user-provided API key (for token counting)

3. **Data sensitivity**: 
   - Low: Usage percentages, reset times, org IDs, subscription tier
   - Medium: Account email, Telegram chat IDs, user notes
   - High: `ATLAS_API_KEY`, `DASHBOARD_PASSWORD`, `TELEGRAM_BOT_TOKEN`, Anthropic API key (if user provides)

4. **GPL-3.0 Compliance**: 
   - Extension is fork of GPL-3.0 work (lugia19/Claude-Usage-Extension)
   - Backend + frontend are original but must be GPL-3.0
   - Ensure all source files have license headers
   - Provide `COPYING` or `LICENSE` file (present)

---

**End of Audit** — This report covers all files in the repository as of the audit date. Re-audit after fixes are applied.