# UsageOS extension overlay

`extension/` is **generated**: it is lugia19's extension at a given release, plus the small set of
things below. Don't edit files in `extension/` by hand - the next sync will overwrite them. Edit the overlay.

| What | Where | How it reaches `extension/` |
|---|---|---|
| Fork-owned files (server sync, options, dashboard, popup, notes widget, `forkHooks.js`) | `extension-overlay/files/` | copied over upstream verbatim |
| Edits inside upstream files (3 one-liners) | `extension-overlay/hooks.json` | inserted next to an anchor; must match exactly once |
| Branding, permissions, content-script list | `extension-overlay/manifest-overlay.json` | applied to every `manifest_*.json` |
| Notes widget styling | `extension-overlay/fork-styles.css` | appended to `tracker-styles.css` |

## Update to the newest upstream release
```bash
python3 scripts/sync_extension.py            # or: --to v6.2.0
```
It exports upstream (including the `common` submodule), applies the overlay, regenerates build-time files,
runs `scripts/check_extension.py`, and only then replaces `extension/` (the previous copy is kept in
`extension.prev/`). Then: `chrome://extensions` -> reload the card -> reload claude.ai tabs.
The GitHub Action in `.github/workflows/sync-upstream.yml` does the same weekly and opens a PR.
(An unpacked extension can't update itself - merge the PR, `git pull`, click reload.)

## When a sync fails
It fails *before* touching `extension/`, naming the cause:
* `HOOK FAILURES [bg-sync-usage] ...` - upstream rewrote the code a hook is anchored to. Open
  that function in upstream's `background.js`, pick a nearby line, add it as another entry in the hook's
  `anchors` list (tried in order, each must match exactly once). The hook's job: call
  `forkSyncUsage(api, orgId, usageData)` once usage has been computed for a processed message.
* `manifest overlay: ... not found` - upstream restructured its content scripts; adjust `manifest-overlay.json`.
* `fork UI sends message type 'X' but no background handler registers it` - a handler in
  `forkHooks.js` is missing, or upstream renamed a message the popup relies on (`getPopupUsageData`).
* `global function ... no longer defined` - `fork_notes.js` needs `sendBackgroundMessage` / `getActiveOrgId`.

## Adding a modification
Prefer a new file in `files/` plus (at most) a one-line hook, over editing upstream code. Every extra line
you put inside an upstream file is a line that can stop matching later.

## Licence
Upstream is GPL-3.0; this derivative stays GPL-3.0 (keep `extension/LICENSE`).
