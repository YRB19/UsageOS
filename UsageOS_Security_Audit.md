# UsageOS: Security & Personal-Data Audit (pre-open-source)

**Date:** 2026-11-14 · **Scope:** the uploaded `UsageOS.zip` (full working tree **and** the 75-commit `.git` history), plus review of the OpenCode `SECURITY_AUDIT.md`.
**Method:** read every backend router, auth, models, Dockerfiles, compose files, nginx config, extension manifests/background/sync/bridges/dashboard, frontend sinks; scanned the whole git history for secrets and personal strings; ran `pip-audit` and `npm audit`; wrote small tests for two suspected issues.

> **Do not commit the old `SECURITY_AUDIT.md`.** It prints your local `.env` values (DB password, `ATLAS_API_KEY`, dashboard password) in cleartext, and several of its findings are wrong (see Part 5).

---

## Part 1 — Verdict

**Not ready to publish yet, but close.** No real secrets, tokens, private keys or personal file paths are in the tracked files or anywhere in git history. The blockers are:

1. Your **personal domain, email and real name** are in the manifests and in git history/commit metadata.
2. The **Telegram webhook has no authentication**, and `SECURITY.md` / `DEPLOY.md` tell users to set a `TELEGRAM_WEBHOOK_SECRET` that **the code never reads**.
3. The **Telegram bot token is written to your logs** on every notification (verified).
4. **30 known vulnerabilities** in the pinned Python dependencies (Starlette, python-multipart, python-dotenv).
5. The repo on GitHub is **missing files that are only in your working tree** (see 2.9).

---

## Part 2 — Personal data: exactly where it is (you change these)

| # | What | Where | Replace with |
|---|------|-------|--------------|
| P1 | Your domain `usageos.example.com` in `host_permissions` | `extension/manifest.json:78`, `extension/manifest_chrome.json:78`, `extension/manifest_firefox.json:84` | **Delete the line.** Safe to remove: `options.js` already calls `permissions.request()` for whatever server URL the user enters. Remember to drop the trailing comma on the previous line. |
| P2 | Extension ID `usageos_tracker@example.com` | line 9 of all three manifests | `"id": "usageos-tracker@YOUR-DOMAIN-OR-GITHUB-HANDLE"` (must be unique if you publish to Firefox Add-ons; permanent once published). Also: `manifest.json` / `manifest_chrome.json` don't need the `browser_specific_settings` block at all. |
| P3 | Gmail address + real name in **74 commits** (`YRB19 <yrb1907@gmail.com>`) and `Rishit Babbar <…noreply>` in 1 | git commit metadata (history) | Use your GitHub noreply address (see 2.8). |
| P4 | `authors = ["Your Name <your-email@example.com>"]` | **history only**, commit `6845d4b` (already removed from the tree) | This names a *different real person* (looks AI-invented) and your domain. Gets purged by the history rewrite in 2.8. |
| P5 | Your domain in old docs/placeholders | **history only**: commits `25cdfde`, `2b4c79c`, `4132622`, `43ccbd9`, `8fa449d`, `9064419` | Purged by the history rewrite in 2.8. |
| P6 | GitHub handle `YRB19` | `README.md:84,182`, `README-dev.md:94`, `DEPLOY.md:10` | Fine, this is a public handle and the repo URL. Only change if you rename the repo. |
| P7 | Local `.env` with real-looking values | in the zip root; **never committed** (verified: `git log --all -- .env` is empty, and `.gitignore` covers it) | Don't zip/share the folder with `.env` inside. If these local values are reused anywhere real, rotate them. |
| P8 | Leftover Ko-fi link of the *upstream author* (`https://ko-fi.com/R6R14IUBY`) | `extension/common/ui/cards.js:10` | Delete the constant. Your README says donation UI was removed, but the dead code still ships. |
| P9 | `lugia19@lugia19.com` contact + Ko-fi in vendored upstream files | history `05acfd2` (removed from tree) | Nothing to do; attribution to lugia19 is correct and required by GPL. |

**Checked and clean:** no `/Users/…`, `/home/rishit`, `~/services`, cloudflared paths, hostnames, phone numbers, tokens (Telegram-shaped, 64-hex, `sk-…`, `ghp_…`, `AKIA…`, `BEGIN … PRIVATE KEY`) in tracked files or any commit. `seed_demo.py` uses only `example.com`-style fake addresses. `.git/config` has no embedded credentials. No hooks, tags or stashes.

### 2.8 How to clean the history (do this BEFORE making the repo public)

Easiest and safest for a first open-source project: publish a **fresh single-commit history** (75 commits include AI-experiment churn, the old `VITE_API_KEY` approach, and your identity).

```bash
cd UsageOS
git config user.name  "YOUR NAME OR HANDLE"
git config user.email "YOUR-ID+YRB19@users.noreply.github.com"   # GitHub → Settings → Emails shows your exact one
git checkout --orphan clean-main
git add -A            # review `git status` first! .env must NOT appear
git commit -m "Initial public release"
git branch -M main
git push --force origin main      # only while the repo is still private
```

Also: GitHub → Settings → Emails → tick **"Keep my email addresses private"** and **"Block command line pushes that expose my email"**.
If you prefer to keep history, use `git filter-repo --mailmap` (rewrite author) and `--replace-text` (strip `example.com`), but the orphan commit is simpler and leaves nothing behind. Note that old commits stay reachable via forks/clones/PR refs once public, so rewrite while the repo is private.

### 2.9 Working tree vs. what's pushed
`git status` shows **untracked: `LICENSE`, `SECURITY.md`, `README-dev.md`, `docker-compose.proxy.yml`, `seed_demo.py`** and modified `.env.example`, `.gitignore`, `DEPLOY.md`, `README.md`, `docker-compose.yml`. GitHub currently has none of the new versions. A GPL project with no committed `LICENSE` file is not actually licensed. Commit them.

---

## Part 3 — Security findings (verified against the code)

Severity reflects a self-hosted deployment that may be exposed to the internet through a tunnel/proxy.

### HIGH

**H1. Telegram webhook is unauthenticated, and any Telegram user can drive it**
`backend/app/routers/telegram_webhook.py:75` (`POST /api/v1/telegram/webhook`)
- No secret-token check. Anyone who finds the URL can POST fake updates. Separately, **Telegram bots are public**: any Telegram user who finds the bot's username can message it, and the handler never checks that the sender's chat is one you own.
- `note <nickname> <text>` (line 105) overwrites the note on **any** account for **any** sender, then echoes the text (HTML-parsed) to the owner's real chat (line 140). That is a phishing/spam channel into your Telegram, and the injected text is re-sent in every future reset alert.
- **Personal-data leak:** line 123 / 127 reply to the *sender* with account nicknames/emails (`Multiple accounts match … {names}`), so a stranger can enumerate your Claude account emails by guessing letters. (The `usage` command is correctly gated to linked chats; `note` is not.)
- **The docs promise a protection that doesn't exist:** `SECURITY.md:17` and `DEPLOY.md:54,59` reference `TELEGRAM_WEBHOOK_SECRET`; a repo-wide grep finds it in **no** `.py`, compose or `.env.example` file.

Fix (the previous audit named a header that doesn't exist; the real one is `X-Telegram-Bot-Api-Secret-Token`):
```python
# config.py
telegram_webhook_secret: str = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")

# telegram_webhook.py
import hmac, html
from fastapi import Header, HTTPException

async def telegram_webhook(request: Request, db=Depends(get_sync_db),
        x_telegram_bot_api_secret_token: str = Header(default="")):
    secret = settings.telegram_webhook_secret
    if not secret or not hmac.compare_digest(x_telegram_bot_api_secret_token, secret):
        raise HTTPException(status_code=403)          # fail closed if no secret configured
```
Then also: (a) only allow `note` when `incoming_chat_id` equals that account's `telegram_chat_id` (or the default chat id in settings); (b) never list account names/emails in error replies; (c) wrap every interpolated value (`name`, `note_text`, `nickname_query`, `content`) in `html.escape()` in the webhook **and** in `main.py:91,97,93,99`; (d) add `TELEGRAM_WEBHOOK_SECRET` to `docker-compose.yml` (backend `environment:`), `.env.example` (`TELEGRAM_WEBHOOK_SECRET=replace-with-generated-secret`, generate with `openssl rand -hex 32`).

**H2. Telegram bot token is written to your logs (verified by test)**
`backend/app/main.py:20` sets root logging to INFO; `httpx` logs every request URL at INFO and the token is *in* the URL (`…/bot<TOKEN>/sendMessage`). My test printed the full URL with the token. Every alert puts the token in `docker compose logs`, and people paste logs into GitHub issues.
Fix, right after line 21 in `main.py`:
```python
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
```
Also `telegram_webhook.py:91` logs the full chat id and message text; log less (or at DEBUG). If your real bot token was ever run with the current code, **revoke it** via @BotFather `/revoke`.

**H3. Dependencies with known CVEs (30 total, `pip-audit`, 2026-11-14)**
- `starlette 0.38.6` (pulled in by `fastapi==0.115.0`): 7 advisories; fixes need Starlette ≥ 1.3.1. Relevant to you: you use `FileResponse` and file uploads.
- `python-multipart 0.0.12`: 7 advisories, fixed in 0.0.31 (it parses your avatar uploads).
- `python-dotenv 1.0.1`: 1 advisory, fixed in 1.2.2.
- **The Dockerfile pins versions by hand** (`backend/Dockerfile`, the `pip install` block) and never reads `requirements.txt`, so editing `requirements.txt` alone changes nothing. Make one source of truth: `COPY requirements.txt .` + `pip install -r requirements.txt`, bump `fastapi` to the latest release, then re-run `pip-audit -r requirements.txt` until clean.
- Frontend runtime deps: **0 vulnerabilities**. Dev-only: `vite ≤6.4.3`/`esbuild ≤0.24.2` (dev server exposure, doesn't ship to production).

### MEDIUM

**M1. Hardcoded personal domain + extension ID**, see P1/P2. Severity is medium (not "critical" as the old audit said): the extension only contacts the URL the user types, but the manifest asks every installer for standing permission to *your* domain, which is also an identity leak.

**M2. API key compare is not constant-time, and an empty key isn't rejected**
`backend/app/auth.py:22-23`: `token != settings.atlas_api_key`. The dashboard path (line ~63) correctly uses `hmac.compare_digest`; this one doesn't. Also, with `ATLAS_API_KEY=""`, `Authorization: Bearer ` could match an empty key. Docker is protected (`${ATLAS_API_KEY:?…}` in compose rejects empty), but the non-Docker path in README-dev isn't.
```python
if not settings.atlas_api_key or not hmac.compare_digest(token, settings.atlas_api_key): ...
```
and refuse to start (raise in `config.py`) if `ATLAS_API_KEY` is empty or shorter than ~32 chars.

**M3. Login rate limit is bypassable and sessions can't be revoked**
- `routers/auth.py:26` trusts the first `X-Forwarded-For` entry from the client, so an attacker can rotate that header to dodge the 8/min limit if requests reach nginx directly. Use the *last* hop your proxy appended (or `request.client.host` behind `--proxy-headers`). The counter is also per-process memory, and the backend runs `--workers 2`.
- `auth.py:13` session lifetime is **1 year**, stateless, and `logout` only deletes the cookie client-side (a stolen cookie keeps working until you change the password/key). Reduce to ~30 days and document "rotate `DASHBOARD_PASSWORD` to revoke all sessions".

**M4. Avatar upload trusts the client's declared MIME type**
`accounts.py:146`: only `file.content_type` is checked; a file's real bytes are never inspected. The public `GET /{account_id}/avatar` serves it with no `nosniff`. Not exploitable for traversal (I tested `..%2F` variants against the same route logic: all 404; the old audit's "path traversal" claim is wrong), but add: magic-byte check (PNG `\x89PNG`, JPEG `\xff\xd8\xff`, WEBP `RIFF…WEBP`), and response headers `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`. Also validate `account_id` as a UUID (`uuid.UUID(account_id)`), because malformed ids currently surface as HTTP 500s from Postgres.

**M5. No security headers / CSP in nginx; API docs publicly exposed**
`frontend/nginx.conf` has none. Add in the `server` block: `X-Content-Type-Options nosniff`, `X-Frame-Options DENY`, `Referrer-Policy strict-origin-when-cross-origin`, and a CSP (`default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`). The frontend bundles its fonts (`@fontsource`), so no Google Fonts allowance is needed there. FastAPI also serves `/docs` and `/openapi.json` unauthenticated: use `FastAPI(..., docs_url=None, redoc_url=None, openapi_url=None)` for production.

**M6. Extension: privacy/doc mismatches and transport safety**
- `options.js:44-60` accepts `http://` URLs: your API key would be sent in cleartext. Reject non-HTTPS except `localhost` / `127.0.0.1`.
- `options.html`, `popup.html`, `dashboard.html` load **Google Fonts** (a third-party request), contradicting `PRIVACY.md` ("Nothing is sent to … any third party"). Self-host Inter (`.woff2` in the extension) or drop it.
- `manifest*.json` `web_accessible_resources` uses `"matches": ["<all_urls>"]` and exposes `common/log/viewer.html`/`viewer.js`: any website can probe for your extension. Restrict to `https://claude.ai/*` and remove the log viewer from the list.
- `PRIVACY.md` says the optional Anthropic key is "used to count tokens". Be explicit that conversation **text and attached files are sent to api.anthropic.com** for that feature (`bg-components/tokenManagement.js`, `callMessageAPI` / `callFileAPI`), and that the key sits unencrypted in `storage.local`.
- `cookies` permission **is needed** (Firefox container logic reads `lastActiveOrg` and per-container cookies); the old audit's "remove it" advice is wrong. Cookie values are never sent to your server (verified).

**M7. Containers run as root; frontend build isn't reproducible**
- `backend/Dockerfile` is `python:3.12-slim` (Debian), so the old audit's Alpine `addgroup -S`/`adduser -S` commands would fail. Use:
  ```dockerfile
  RUN useradd -r -u 10001 app && chown -R app /app
  USER app
  ```
  (the `usageos_uploads` volume must be writable by that user).
- `frontend/` has **no lockfile** and the Dockerfile runs `npm install`: every build resolves whatever is newest. Commit `package-lock.json` and use `npm ci`.
- `docker-compose.yml` publishes the dashboard on `0.0.0.0:${USAGEOS_PORT}` over plain HTTP; the login password crosses the network unencrypted on a LAN. Either bind `127.0.0.1:` by default or say so loudly in the README.

### LOW / hardening

- **L1.** `backend/app/routers/notes.py` is a **dead, unauthenticated** duplicate of the notes routes (not mounted in `main.py`). Delete it so nobody mounts it by accident.
- **L2.** No `max_length` on `SyncPayload` fields, `NoteIn.content`, or `limit` query params (`accounts.py` `limit<=0` returns everything; `sync.py` `limit` unbounded). Add `Field(max_length=…)` / clamp like `alerts.py` already does.
- **L3.** Extension dashboard: `escapeHtml()` (`dashboard.js:775`) uses `textContent→innerHTML`, which does **not** escape `"`; and `data-org-id="${account.orgId}"` is unescaped. Not exploitable today (values come from your own claude.ai/server), but use a real attribute escaper.
- **L4.** `GET /api/v1/sync/connection-test` (used by `atlasSync.js` to test the key) has **no route of its own**; it works only because `/sync/{org_id}` swallows it and requires auth. Fine, but add an explicit `/sync/connection-test` returning `{"ok": true}` so it doesn't depend on that accident.
- **L5.** `CORS: ["*"]` (`config.py:12`) is low risk: `allow_credentials=False`, and the dashboard is same-origin. Still, make it configurable (`CORS_ORIGINS`, default empty/same-origin).
- **L6.** `backend/pyproject.toml` has the placeholder `Your Name <your-email@example.com>`, plus stale/unused deps (`python-jose`, `passlib`, and `fastapi ^0.110` vs the pinned 0.115). Set a real author or remove the field; delete unused deps (`python-jose` has its own CVEs).
- **L7.** `.github/workflows/` is empty. Add a CI workflow: `pip-audit`, `npm audit --omit=dev`, `gitleaks`.
- **L8.** `extension/.gitmodules` declares `common` as a submodule, but the files are vendored directly into the tree. Remove `.gitmodules` (or make it a real submodule), and confirm `claude-ext-common`'s license allows redistribution. Add a `THIRD_PARTY_NOTICES` for `lib/o200k_base.js` (2 MB tokenizer), `chart.umd.min.js`, `browser-polyfill.min.js`.
- **L9.** The scheduler runs in **both** uvicorn workers (`main.py` lifespan); the unique index stops duplicate sends, but a duplicate-loser silently drops its attempt. Fine, but one worker (or a lock) is cleaner.
- **L10.** A failed Telegram send (`main.py` `send_telegram_message` returns `False`) still leaves the `NotificationLog` row committed, so that alert is **never retried**. Not a security issue, but it affects reliability.

### Housekeeping before you zip/share the project folder
Delete (all are gitignored, so they won't be published, but they sit in your folder/zip): `.env`, `extension.zip`, `usageos-redesign.zip`, `extension-test-build.tar.gz`, `extension_backup_*/`, `.mypy_cache/`, `.ruff_cache/`, `backend/.pytest_cache/`, every `.DS_Store`, `opencode.json`, and the old `SECURITY_AUDIT.md`. I checked the zips and backups: no secrets or prefilled API keys inside.

---

## Part 4 — Placeholder cheat-sheet

| Where | Placeholder to use |
|-------|--------------------|
| Extension ID (3 manifests, line 9) | `usageos-tracker@YOUR-DOMAIN-OR-HANDLE` |
| Git author | `YOUR-ID+YRB19@users.noreply.github.com` |
| `.env.example` webhook secret (new) | `TELEGRAM_WEBHOOK_SECRET=replace-with-generated-secret` |
| `pyproject.toml` authors | `authors = ["USUAL HANDLE"]` or delete the line |
| Docs domain examples | `usageos.example.com` (already used in README/DEPLOY, keep) |
| Server URL placeholder in `options.html` | `https://usageos.example.com` (already so in `options.js`; make sure `options.html` matches) |

---

## Part 5 — Corrections to the OpenCode audit

| Its claim | Reality |
|-----------|---------|
| #3 CRITICAL "`.env` committed to git" | **False.** Never in history, and ignored. The real issue is that the audit *itself* leaks the local values. |
| #2 CRITICAL personal email in `pyproject.toml` | It's a `your-email@example.com` placeholder (LOW). The *real* exposure is in git history (P3/P4). |
| #9 webhook signature via `X-Telegram-Bot-Api-Signature` HMAC | That header doesn't exist; the real mechanism is `X-Telegram-Bot-Api-Secret-Token`. It also missed the sender allow-list and the email enumeration (H1). |
| #8 avatar path traversal | **Not reachable** (tested). Defence-in-depth only. |
| #7 SQL injection in maintenance router | Parameterised; not injectable. |
| #24 "unauthenticated debug endpoint `/sync/connection-test`" | No such separate route; it hits the authenticated `/sync/{org_id}`. |
| #21 personal machine paths in docs | None found. |
| #15 "remove `cookies` permission" | It is needed (Firefox containers). |
| #17 Alpine `adduser` commands | Wrong for `python:slim`. |
| #12 / #19 Google Fonts risk in the frontend | Frontend bundles its fonts; Google Fonts appear only in the **extension** pages (real, M6). |
| #22 GPL "requires" SPDX headers in every file | Recommended practice, not a requirement. Low priority. |
| #26 "HMAC comparison for secrets" | Only on the dashboard path; `/sync` uses `!=` (M2). |
| Missed entirely | H2 (token in logs), H3 (the 30 CVEs, Dockerfile pin drift), the docs-promise-vs-code mismatch, the uncommitted LICENSE, no lockfile, `http://` accepted for the key. |

---

## Part 6 — Suggested order of work

1. **Today:** H1 (webhook secret + allow-list + `html.escape`), H2 (silence httpx logs), bump dependencies (H3), M2.
2. Remove P1/P2/P8, fix `options.js` HTTPS check, restrict `web_accessible_resources`, drop Google Fonts (M6).
3. Commit the untracked files (LICENSE etc.), add `package-lock.json`, delete `notes.py`.
4. Rewrite history to a clean single commit (2.8) **while the repo is still private**; enable GitHub's email privacy settings.
5. Re-run: `pip-audit -r backend/requirements.txt`, `npm audit --omit=dev`, `git grep -nIiE 'rishit|yrb1907|gmail'`, `git log --all --format='%ae' | sort -u`.
6. Flip the repo to public. Enable GitHub **Private vulnerability reporting** (your `SECURITY.md` already tells people to use it) and secret scanning.

*Anything here that depends on environment facts I can't see (e.g. whether the real prod bot token ever ran the logging code, or whether prod reuses the local `.env` values) is flagged as "rotate if so"; rotate rather than guess.*
