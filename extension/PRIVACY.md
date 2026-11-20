# UsageOS Tracker: what data goes where

The [UsageOS extension](README.md) reads usage and account information from claude.ai while you are signed in. You choose the UsageOS server it connects to.

- **Usage snapshots:** The extension sends the provider, organization ID, account email and subscription tier when available, usage percentages, reset times, and the snapshot timestamp to your configured server. The server stores usage history. Snapshots do not include Claude conversation text, attachments, or session cookies. If the server is unavailable, pending snapshots may be queued in browser storage. See [`serverSync.js`](bg-components/serverSync.js).
- **Notes:** Notes you explicitly save through the extension are sent to your UsageOS server and stored there.
- **Optional Anthropic token counting:** If you configure an Anthropic API key for token counting, the extension can send relevant message text or file content to Anthropic's token counting endpoint. This is separate from sync to your UsageOS server. The key for connecting the extension to UsageOS is a different credential. See [`tokenManagement.js`](bg-components/tokenManagement.js).
- **Optional Telegram:** If you configure the bot and link a chat, your server sends messages to Telegram using the chat ID. This can include account names and reset information, and bot commands can send note text through Telegram. See the [Telegram setup and commands](../README.md#5-optional-telegram-alerts).
