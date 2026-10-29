'use strict';

let statusEl;

document.addEventListener('DOMContentLoaded', () => {
	statusEl = document.getElementById('status');
	document.getElementById('save-btn').addEventListener('click', saveSettings);
	document.getElementById('test-btn').addEventListener('click', testConnection);
	document.getElementById('toggle-key').addEventListener('click', toggleKeyVisibility);
	loadSettings();
	refreshSyncStatus();
	setInterval(refreshSyncStatus, 5000);
});

function showStatus(message, type) {
	statusEl.textContent = message;
	statusEl.className = `status visible ${type}`;
}

function hideStatus() {
	statusEl.className = 'status';
}

function toggleKeyVisibility() {
	const input = document.getElementById('api-key');
	const btn = document.getElementById('toggle-key');
	const show = input.type === 'password';
	input.type = show ? 'text' : 'password';
	btn.innerHTML = show ? '&#128064;' : '&#128065;';
}

async function loadSettings() {
	const { atlasUrl, atlasApiKey } = await browser.storage.local.get(['atlasUrl', 'atlasApiKey']);
	document.getElementById('server-url').value = atlasUrl || '';
	document.getElementById('api-key').value = atlasApiKey || '';
}

function readForm() {
	return {
		url: document.getElementById('server-url').value.trim().replace(/\/+$/, ''),
		apiKey: document.getElementById('api-key').value.trim()
	};
}

// The extension can only contact a server it has been granted access to. Must run straight from a
// click (a user gesture), so it is the first thing awaited in the handlers below.
async function ensureHostAccess(url) {
	let origin;
	try {
		origin = new URL(url).origin;
	} catch {
		return { ok: false, message: 'That is not a valid URL. Include https://, e.g. https://usageos.example.com' };
	}
	const origins = [`${origin}/*`];
	try {
		if (await browser.permissions.contains({ origins })) return { ok: true };
		const granted = await browser.permissions.request({ origins });
		return granted ? { ok: true } : { ok: false, message: `Access to ${origin} was not granted, so the extension cannot send data there.` };
	} catch (err) {
		return { ok: false, message: `Could not request access to ${origin}: ${err.message}` };
	}
}

async function saveSettings() {
	const { url, apiKey } = readForm();
	if (!url || !apiKey) {
		showStatus('Please fill in both fields', 'error');
		return;
	}
	const access = await ensureHostAccess(url);
	if (!access.ok) {
		showStatus(access.message, 'error');
		return;
	}
	try {
		await browser.runtime.sendMessage({ type: 'atlasSaveSettings', url, apiKey });
		showStatus('Settings saved. Open claude.ai and send a message (or wait up to 3 minutes) for the account to appear.', 'success');
		setTimeout(hideStatus, 6000);
		refreshSyncStatus();
	} catch (err) {
		showStatus(`Save failed: ${err.message}`, 'error');
	}
}

// Tests whatever is in the form, saved or not.
async function testConnection() {
	const { url, apiKey } = readForm();
	if (!url) {
		showStatus('Enter the server URL first', 'error');
		return;
	}
	const access = await ensureHostAccess(url);
	if (!access.ok) {
		showStatus(access.message, 'error');
		return;
	}
	showStatus('Testing connection...', 'info');
	try {
		const result = await browser.runtime.sendMessage({ type: 'atlasTestConnection', url, apiKey });
		showStatus(result?.message || 'No answer from the extension background.', result?.ok ? 'success' : 'error');
	} catch (err) {
		showStatus(`Connection failed: ${err.message}`, 'error');
	}
}

function ago(timestamp) {
	const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
	if (seconds < 60) return `${seconds}s ago`;
	if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
	return `${Math.round(seconds / 3600)} h ago`;
}

async function refreshSyncStatus() {
	const el = document.getElementById('sync-status');
	try {
		const s = await browser.runtime.sendMessage({ type: 'atlasGetStatus' });
		if (!s?.configured) {
			el.textContent = 'Sync status: not configured.';
			return;
		}
		const parts = [];
		parts.push(s.lastOkAt ? `last successful sync ${ago(s.lastOkAt)}` : 'no successful sync yet');
		if (s.queued) parts.push(`${s.queued} waiting to be sent`);
		if (s.paused) parts.push('paused: the server rejected the API key');
		if (!s.permitted) parts.push('extension has no access to the server yet, press Save');
		if (s.lastError && !s.lastOkAt) parts.push(`last error: ${s.lastError}`);
		el.textContent = `Sync status: ${parts.join('; ')}.`;
	} catch {
		el.textContent = '';
	}
}
