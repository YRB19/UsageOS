# Contributing to UsageOS

You can help by trying the quickstart on a clean setup, reporting confusing steps, reproducing a bug, or sending a patch.

## Report a bug or suggest a change

Check [existing issues](https://github.com/YRB19/UsageOS/issues) first. For a bug, include your UsageOS commit or release, browser and OS, reproduction steps, and what you expected versus what happened. If sync is involved, include the extension's **Test Connection** result or a redacted error. For usage display bugs, say which limit was affected (session, weekly, Sonnet, or Opus, if shown).

Use fictional data in screenshots. Remove API keys, bot tokens, cookies, account emails, organization IDs, chat IDs, and messages from any logs or screenshots. Report suspected vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Send a pull request

1. Pick a small issue or propose a fix. For substantial changes, discuss the scope in an issue first.
2. Fork the repo and use the [developer guide](README-dev.md) for setup. Use the [demo seed](README-dev.md#demo-data-and-screenshots) with a throwaway database if you need accounts to test with.
3. Verify what you changed. For the frontend, run `npm run build` in `frontend/` and include before/after screenshots if useful. For the extension, reload it in a Chromium browser, refresh the claude.ai tab, and exercise the changed behavior. For setup docs, follow the edited steps from a clean checkout where possible.
4. In the pull request, explain the problem, the change, and how you checked it. Link the issue if there is one.

Contributions use the project's [GPL-3.0 license](LICENSE). Preserve upstream attribution when changing the extension.
