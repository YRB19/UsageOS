import { atlasSync as AtlasSync } from './bg-components/atlasSync.js';

// NOTE: atlasSync.js exports a singleton instance (`atlasSync`), not the
// `AtlasSync` class. We alias the singleton import to `AtlasSync` so the
// rest of this file can keep calling AtlasSync.getSettings/saveSettings/testConnection.

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
	// Notify background service worker to drop its cached config so the
	// next sync() reads the freshly-saved settings.
	try {
		await chrome.runtime.sendMessage({ type: 'atlasRefreshSettings' });
	} catch (_) { /* background might be asleep */ }
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
		// Also poke the background so its singleton stays in sync
		await chrome.runtime.sendMessage({ type: 'atlasRefreshSettings' });
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

// ─── Notification settings ──────────────────────────────────────────────────

// Reset notifications
async function loadNotifSetting() {
	try {
		const enabled = await send('getResetNotifEnabled');
		const el = document.getElementById('reset-notif');
		if (el) el.checked = !!enabled;
	} catch (err) {
		console.error('[Options] Failed to load notif setting:', err);
	}
}

document.getElementById('reset-notif')?.addEventListener('change', async (e) => {
	await send('setResetNotifEnabled', { value: e.target.checked });
});

// Telegram
async function loadTelegramSettings() {
	try {
		const result = await send('getNotificationSettings');
		if (result?.telegram_enabled !== undefined) {
			const cb = document.getElementById('telegram-enabled');
			const fields = document.getElementById('telegram-fields');
			const chatId = document.getElementById('telegram-chat-id');
			const testBtn = document.getElementById('test-telegram');
			
			if (cb) cb.checked = result.telegram_enabled;
			if (fields) fields.style.display = result.telegram_enabled ? 'block' : 'none';
			if (chatId && result.telegram_chat_id) chatId.value = result.telegram_chat_id;
			if (chatId) chatId.disabled = !result.telegram_enabled;
			if (testBtn) testBtn.disabled = !result.telegram_enabled || !result.telegram_chat_id;
		}
	} catch (err) {
		console.error('[Options] Failed to load Telegram settings:', err);
	}
}

document.getElementById('telegram-enabled')?.addEventListener('change', async (e) => {
	const enabled = e.target.checked;
	const fields = document.getElementById('telegram-fields');
	const chatId = document.getElementById('telegram-chat-id');
	const testBtn = document.getElementById('test-telegram');
	
	if (fields) fields.style.display = enabled ? 'block' : 'none';
	if (chatId) chatId.disabled = !enabled;
	if (testBtn) testBtn.disabled = !enabled || !chatId?.value;
	
	await send('setNotificationSettings', { telegram_enabled: enabled });
});

document.getElementById('telegram-chat-id')?.addEventListener('input', async (e) => {
	const testBtn = document.getElementById('test-telegram');
	if (testBtn) testBtn.disabled = !e.target.value;
	await send('setNotificationSettings', { telegram_chat_id: e.target.value });
});

document.getElementById('test-telegram')?.addEventListener('click', async () => {
	const btn = document.getElementById('test-telegram');
	btn.disabled = true;
	btn.textContent = 'Sending...';
	
	try {
		await send('testNotification', { channel: 'telegram' });
		showStatus('atlas-status', '✓ Telegram test sent', 'ok');
	} catch (err) {
		showStatus('atlas-status', `✗ Telegram test failed: ${err.message}`, 'err');
	} finally {
		btn.disabled = false;
		btn.textContent = 'Test Telegram';
	}
});

// WhatsApp
async function loadWhatsAppSettings() {
	try {
		const result = await send('getNotificationSettings');
		if (result?.whatsapp_enabled !== undefined) {
			const cb = document.getElementById('whatsapp-enabled');
			const fields = document.getElementById('whatsapp-fields');
			const number = document.getElementById('whatsapp-number');
			const testBtn = document.getElementById('test-whatsapp');
			
			if (cb) cb.checked = result.whatsapp_enabled;
			if (fields) fields.style.display = result.whatsapp_enabled ? 'block' : 'none';
			if (number && result.whatsapp_number) number.value = result.whatsapp_number;
			if (number) number.disabled = !result.whatsapp_enabled;
			if (testBtn) testBtn.disabled = !result.whatsapp_enabled || !number?.value;
		}
	} catch (err) {
		console.error('[Options] Failed to load WhatsApp settings:', err);
	}
}

document.getElementById('whatsapp-enabled')?.addEventListener('change', async (e) => {
	const enabled = e.target.checked;
	const fields = document.getElementById('whatsapp-fields');
	const number = document.getElementById('whatsapp-number');
	const testBtn = document.getElementById('test-whatsapp');
	
	if (fields) fields.style.display = enabled ? 'block' : 'none';
	if (number) number.disabled = !enabled;
	if (testBtn) testBtn.disabled = !enabled || !number?.value;
	
	await send('setNotificationSettings', { whatsapp_enabled: enabled });
});

document.getElementById('whatsapp-number')?.addEventListener('input', async (e) => {
	const testBtn = document.getElementById('test-whatsapp');
	if (testBtn) testBtn.disabled = !e.target.value;
	await send('setNotificationSettings', { whatsapp_number: e.target.value });
});

document.getElementById('test-whatsapp')?.addEventListener('click', async () => {
	const btn = document.getElementById('test-whatsapp');
	btn.disabled = true;
	btn.textContent = 'Sending...';
	
	try {
		await send('testNotification', { channel: 'whatsapp' });
		showStatus('atlas-status', '✓ WhatsApp test sent', 'ok');
	} catch (err) {
		showStatus('atlas-status', `✗ WhatsApp test failed: ${err.message}`, 'err');
	} finally {
		btn.disabled = false;
		btn.textContent = 'Test WhatsApp';
	}
});

// Threshold
async function loadThresholdSetting() {
	try {
		const result = await send('getNotificationSettings');
		const thresholdEl = document.getElementById('notify-threshold');
		const thresholdVal = document.getElementById('threshold-value');
		
		if (thresholdEl && result?.notify_threshold !== undefined) {
			thresholdEl.value = Math.round((result.notify_threshold || 0.9) * 100);
			if (thresholdVal) thresholdVal.textContent = `${thresholdEl.value}%`;
		}
	} catch (err) {
		console.error('[Options] Failed to load threshold setting:', err);
	}
}

document.getElementById('notify-threshold')?.addEventListener('input', async (e) => {
	const val = parseInt(e.target.value, 10);
	const thresholdVal = document.getElementById('threshold-value');
	if (thresholdVal) thresholdVal.textContent = `${val}%`;
	await send('setNotificationSettings', { notify_threshold: val / 100 });
});

// ─── Boot ────────────────────────────────────────────────────────────────

// Don't use top-level await — wrap in an async IIFE so one failure doesn't kill the page.
(async () => {
	console.log('[Options] Booting options page...');
	await loadAtlasSettings();
	await loadAnthropicKey();
	await loadNotifSetting();
	await loadTelegramSettings();
	await loadWhatsAppSettings();
	await loadThresholdSetting();
	console.log('[Options] Boot complete. Click handlers registered.');
})();