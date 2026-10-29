# UsageOS Tracker (browser extension)

The browser half of UsageOS. It reads your claude.ai usage for whichever account you are signed in to and sends it to your self-hosted UsageOS backend. Based on [lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension) 6.1.4 (GPL-3.0).

## Install (Chrome / Brave / Edge)
1. `chrome://extensions`, turn on **Developer mode**, **Load unpacked**, pick this folder.
2. Extension icon, **Server**: enter the server URL and the `ATLAS_API_KEY`, press **Save** (Chrome asks to allow access to your server; accept), then **Test Connection**.
3. Open claude.ai in each account and send a message. It appears on your dashboard.

After changing code, press the reload icon on the extension card.

## What syncs, and when
Every time the tracker reads usage (after a message, every 3 minutes while a claude.ai tab is open, when you open the popup) it sends a snapshot. Unchanged snapshots are skipped, except a keep-alive every 10 minutes. If the server is down, snapshots are queued and retried automatically. The Options page shows the sync status.

## Sidebar notes
The **Notes** box in the claude.ai sidebar is stored per account on your server (same text as the web dashboard and the Telegram `note` command). Edits made while the server is unreachable are kept on the device and uploaded later.

## Differences from upstream
- Added: server sync (`bg-components/atlasSync.js`), Options page, local dashboard, Notes.
- Removed: Ko-fi/donation, Desktop and QoL promotions, rate/update cards, bug-report link.

## Build files
`content-components/ui_dataclasses.js` is generated: `node scripts/build-dataclasses.js`. `manifest.json` must be a copy of `manifest_chrome.json`.
