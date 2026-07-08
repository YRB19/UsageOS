import { AtlasSync } from './bg-components/atlasSync.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function showStatus(id, msg, type = 'ok') {
	const el = document.getElementById(id);
	el.textContent = msg;
	el.className = `status show ${type}`;
	setTimeout(() => el.classList.remove('show'), 4000);
}

async function send(type, payload = {}) {
	return chrome.runtime.sendMessage({ type, ...payload });
}

// ─── ATLAS settings ─────────────────────────────────────────────────────────

async function loadAtlasSettings() {
	const { url, apiKey } = await AtlasSync.getSettings();
	document.getElementById('atlas-url').value = url || '';
	document.getElementById('atlas-key').value = apiKey || '';
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
	showStatus('atlas-status', 'Testing…', 'info');

	// Save current inputs before testing
	const url    = document.getElementById('atlas-url').value.trim();
	const apiKey = document.getElementById('atlas-key').value.trim();
	await AtlasSync.saveSettings(url, apiKey);

	const result = await send('atlasTestConnection');

	if (result?.ok) {
		const accts = result.data?.accounts ?? '?';
		showStatus('atlas-status', `✓ Connected — ${accts} account(s) tracked`, 'ok');
	} else {
		showStatus('atlas-status', `✗ ${result?.reason || 'Unknown error'}`, 'err');
	}
});

// ─── Anthropic API key ────────────────────────────────────────────────────────

async function loadAnthropicKey() {
	const key = await send('getAPIKey');
	if (key) document.getElementById('anthropic-key').value = key;
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
	const enabled = await send('getResetNotifEnabled');
	document.getElementById('reset-notif').checked = !!enabled;
}

document.getElementById('reset-notif').addEventListener('change', async (e) => {
	await send('setResetNotifEnabled', { value: e.target.checked });
});

// ─── Boot ──────────────────────────────────────────────────────────────────

await loadAtlasSettings();
await loadAnthropicKey();
await loadNotifSetting();
