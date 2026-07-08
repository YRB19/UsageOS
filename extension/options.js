import { AtlasSync } from './bg-components/atlasSync.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function showStatus(id, msg, type = 'ok') {
	const el = document.getElementById(id);
	if (!el) { console.error('[Options] Status element not found:', id); return; }
	el.textContent = msg;
	el.className = `status show ${type}`;
	setTimeout(() => el.classList.remove('show'), 4000);
}

async function send(type, payload = {}) {
	try {
		return await chrome.runtime.sendMessage({ type, ...payload });
	} catch (err) {
		console.error('[Options] sendMessage failed for', type, err);
		return null;
	}
}

// ─── ATLAS settings ─────────────────────────────────────────────────────────

async function loadAtlasSettings() {
	try {
		const { url, apiKey } = await AtlasSync.getSettings();
		const urlEl    = document.getElementById('atlas-url');
		const keyEl   = document.getElementById('atlas-key');
		if (urlEl)  urlEl.value = url || '';
		if (keyEl) keyEl.value = apiKey || '';
		console.log('[Options] Loaded ATLAS settings:', { url, hasKey: !!apiKey });
	} catch (err) {
		console.error('[Options] Failed to load ATLAS settings:', err);
	}
}

document.getElementById('save-atlas').addEventListener('click', async () => {
	const url    = document.getElementById('atlas-url').value.trim();
	const apiKey = document.getElementById('atlas-key').value.trim();

	if (url && !url.startsWith('http')) {
		showStatus('atlas-status', 'URL must start with http:// or https://', 'err');
		return;
	}

	await AtlasSync.saveSettings(url, apiKey);
	showStatus('atlas-status', 'Settings saved.', 'ok');
});

document.getElementById('test-atlas').addEventListener('click', async () => {
	console.log('[Options] Test connection clicked');
	showStatus('atlas-status', 'Testing…', 'info');

	// Save current inputs before testing
	const url    = document.getElementById('atlas-url').value.trim();
	const apiKey = document.getElementById('atlas-key').value.trim();
	console.log('[Options] Saving before test:', { url, hasKey: !!apiKey });
	await AtlasSync.saveSettings(url, apiKey);

	// Call testConnection directly — avoids the background message round-trip
	// which can silently fail if the SW is asleep or the message port closes.
	console.log('[Options] Calling AtlasSync.testConnection() directly...');
	try {
		const result = await AtlasSync.testConnection();
		console.log('[Options] testConnection result:', result);

		if (result?.ok) {
			const accts = result.data?.accounts ?? '?';
			showStatus('atlas-status', `✓ Connected — ${accts} account(s) tracked`, 'ok');
		} else {
			showStatus('atlas-status', `✗ ${result?.reason || 'Unknown error'}`, 'err');
		}
	} catch (err) {
		console.error('[Options] testConnection threw:', err);
		showStatus('atlas-status', `✗ ${err.message || 'Exception'}`, 'err');
	}
});

// ─── Anthropic API key ────────────────────────────────────────────────────────

async function loadAnthropicKey() {
	try {
		const key = await send('getAPIKey');
		if (key) {
			const el = document.getElementById('anthropic-key');
			if (el) el.value = key;
		}
	} catch (err) {
		console.error('[Options] Failed to load API key:', err);
	}
}

document.getElementById('save-anthropic').addEventListener('click', async () => {
	const key = document.getElementById('anthropic-key').value.trim();
	const ok  = await send('setAPIKey', { newKey: key });
	showStatus('anthropic-status', ok ? 'API key saved.' : 'Invalid key — check it and try again.', ok ? 'ok' : 'err');
});

document.getElementById('clear-anthropic').addEventListener('click', async () => {
	await send('setAPIKey', { newKey: '' });
	document.getElementById('anthropic-key').value = '';
	showStatus('anthropic-status', 'API key cleared.', 'ok');
});

// ─── Notifications toggle ──────────────────────────────────────────────────

async function loadNotifSetting() {
	try {
		const enabled = await send('getResetNotifEnabled');
		const el = document.getElementById('reset-notif');
		if (el) el.checked = !!enabled;
	} catch (err) {
		console.error('[Options] Failed to load notif setting:', err);
	}
}

document.getElementById('reset-notif').addEventListener('change', async (e) => {
	await send('setResetNotifEnabled', { value: e.target.checked });
});

// ─── Boot ──────────────────────────────────────────────────────────────────

// Don't use top-level await — wrap in an async IIFE so one failure doesn't kill the page.
(async () => {
	console.log('[Options] Booting options page...');
	await loadAtlasSettings();
	await loadAnthropicKey();
	await loadNotifSetting();
	console.log('[Options] Boot complete. Click handlers registered.');
})();
