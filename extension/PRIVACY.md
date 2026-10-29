Privacy Policy for UsageOS Tracker

This extension is a fork of Claude Usage Tracker by lugia19 (GPL-3.0). It is self-hosted: it has no developer-operated server.

What the extension reads
- Usage figures from claude.ai for the account you are signed in to: percentages and reset times for the session and weekly limits, and your subscription tier.
- Your account email and organization ID, used to tell your accounts apart.
- Message text is read locally to estimate usage and is never sent to your UsageOS server.

Where data goes
- Only to the UsageOS server URL you enter in the extension options (your own server), authenticated with your API key.
- Sent per account: email, organization ID, subscription tier, limit percentages, reset times, timestamp, and the note you type in the sidebar.
- Optionally, an Anthropic API key you enter in the settings is used to count tokens through api.anthropic.com.
- Nothing is sent to the original author or any other third party.

Stored in your browser
- Server URL and API key, a queue of snapshots waiting to be sent, unsent notes, and caches.

Removing data
- Uninstalling the extension removes everything stored in the browser. Data on your server is deleted from your own database.
