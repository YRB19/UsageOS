# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found, how to reproduce it, and what you think the impact is. You will get a reply as soon as the maintainer can; this is a small volunteer project, so please allow a few days.

## What counts

Examples: bypassing the dashboard login or the API key check, reading or changing another account's data, leaking secrets, or injecting content through notes or Telegram messages.

## Running UsageOS safely

- Serve it over HTTPS only if it is reachable from the internet.
- Keep `.env` private and never commit it.
- Use long random values for `SERVER_API_KEY`, `DASHBOARD_PASSWORD` and `TELEGRAM_WEBHOOK_SECRET`.
- See DEPLOY.md for how to rotate each secret.
