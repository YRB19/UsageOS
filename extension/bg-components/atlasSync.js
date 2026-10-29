/**
 * atlasSync.js - everything between the extension and the UsageOS backend.
 *
 * What it does
 *   - reportUsage(api, usageData): called by ClaudeAPI.getUsageData() every time the tracker
 *     reads authoritative usage from claude.ai (after a message, on the 3-minute heartbeat, when
 *     the popup opens). Builds a snapshot and POSTs it to /api/v1/sync.
 *   - Skips snapshots identical to the last one sent (with a keep-alive, so the dashboard still
 *     sees the account as alive), so the heartbeat doesn't fill the history with duplicates.
 *   - Never throws into the caller and never blocks the tracker: a down server only means the
 *     snapshot goes into an offline queue that the heartbeat flushes later.
 *   - Per-account notes (shown in the claude.ai sidebar): read and write through the backend,
 *     with a local pending copy so an edit is never lost while the server is unreachable or the
 *     account has not synced yet.
 *
 * Settings (atlasUrl / atlasApiKey) are read from storage on every request, never cached, so a
 * key saved in Options applies to the very next send. A 401/403 pauses sending for a minute
 * instead of hammering the server with a bad key.
 */

import { getStorageValue, setStorageValue, RawLog } from './utils.js';

async function Log(...args) {
	await RawLog('atlasSync', ...args);
}

const QUEUE_KEY = 'atlasSync_offlineQueue';
const PAUSED_UNTIL_KEY = 'atlasSync_pausedUntil';
const LAST_SENT_KEY = 'atlasSync_lastSent';
const STATUS_KEY = 'atlasSync_status';
const PENDING_NOTES_KEY = 'atlasSync_pendingNotes';

const MAX_QUEUE_SIZE = 200;
const REQUEST_TIMEOUT_MS = 8000;
const AUTH_PAUSE_MS = 60 * 1000;
// An unchanged snapshot is still re-sent this often. The dashboard's "last updated" and the
// history chart both rely on seeing the account check in.
const KEEPALIVE_MS = 10 * 60 * 1000;
const ACCOUNTS_CACHE_MS = 60 * 1000;

// UsageData limit key -> backend limit key. fable_weekly is not in the backend schema yet; the
// backend ignores unknown fields, so it is harmless to send and starts working once it is added.
const LIMIT_KEY_MAP = {
	session: 'session',
	weekly: 'weekly',
	sonnetWeekly: 'sonnet_weekly',
	opusWeekly: 'opus_weekly',
	fableWeekly: 'fable_weekly'
};

class AtlasSync {
	constructor() {
		this._accounts = null;        // { fetchedAt, byOrg: { orgId -> account } }
		this._chains = new Map();     // orgId -> promise: snapshots for one account go out in order
		this._flushing = null;
		this._resumeTimer = null;
	}

	//#region Settings

	static async getSettings() {
		return {
			url: await getStorageValue('atlasUrl', ''),
			apiKey: await getStorageValue('atlasApiKey', '')
		};
	}

	static async saveSettings(url, apiKey) {
		await setStorageValue('atlasUrl', AtlasSync.normalizeUrl(url));
		await setStorageValue('atlasApiKey', (apiKey || '').trim());
	}

	static normalizeUrl(url) {
		return (url || '').trim().replace(/\/+$/, '');
	}

	// Fresh storage read on every call; there is deliberately no cached copy of the key.
	async _getAuth() {
		const { url, apiKey } = await AtlasSync.getSettings();
		return { baseUrl: AtlasSync.normalizeUrl(url) || null, apiKey: (apiKey || '').trim() || null };
	}

	async isConfigured() {
		const { baseUrl, apiKey } = await this._getAuth();
		return !!(baseUrl && apiKey);
	}

	//#endregion

	//#region Reporting usage

	// Fire-and-forget entry point for the tracker. Safe to call on every usage read.
	reportUsage(api, usageData) {
		const orgId = api?.orgId;
		if (!orgId || !usageData) return;
		const previous = this._chains.get(orgId) || Promise.resolve();
		const next = previous
			.then(() => this._report(api, usageData))
			.catch(error => Log('warn', 'reportUsage failed:', error));
		this._chains.set(orgId, next);
		next.finally(() => { if (this._chains.get(orgId) === next) this._chains.delete(orgId); });
	}

	async _report(api, usageData) {
		// With no server configured there is nothing to do, and queueing for a server nobody set
		// up would only grow a pile of stale snapshots. Saving the settings triggers a fresh read.
		if (!(await this.isConfigured())) return;

		let email = null;
		try {
			email = await api.getAccountEmail();
		} catch (error) {
			await Log('warn', 'Could not resolve account email:', error);
		}

		const payload = this._buildPayload(api.orgId, email, usageData);
		const sig = this._signature(payload);

		const lastSent = (await getStorageValue(LAST_SENT_KEY, {})) || {};
		const last = lastSent[api.orgId];
		if (last && last.sig === sig && Date.now() - last.at < KEEPALIVE_MS) return;

		await this._deliver(payload, sig);
	}

	_buildPayload(orgId, email, usageData) {
		const raw = usageData?.toJSON ? usageData.toJSON() : (usageData || {});
		const limits = {};
		for (const [jsKey, backendKey] of Object.entries(LIMIT_KEY_MAP)) {
			const limit = raw.limits?.[jsKey];
			limits[backendKey] = limit ? {
				usage_pct: Number.isFinite(limit.percentage) ? limit.percentage : null,
				resets_at: limit.resetsAt ? new Date(limit.resetsAt).toISOString() : null
			} : null;
		}
		return {
			provider: 'claude',
			email: email || null,
			org_id: orgId,
			subscription_tier: raw.subscriptionTier || null,
			limits,
			timestamp: new Date().toISOString()
		};
	}

	// Everything that matters about a snapshot except when it was taken.
	_signature(payload) {
		const { timestamp, ...rest } = payload;
		return JSON.stringify(rest);
	}

	async _deliver(payload, sig) {
		if (await this._isPaused()) {
			await this._enqueue(payload, sig);
			return { ok: false, reason: 'paused' };
		}

		try {
			const result = await this._request('POST', '/api/v1/sync', payload);
			await this._markSent(payload.org_id, sig);
			await this._recordStatus({ lastOkAt: Date.now(), lastError: null });
			await this._clearBadge();
			await Log(`Synced ${payload.email || payload.org_id} -> account ${result?.account_id}`);
			this._accounts = null; // a first sync creates the account; let the next lookup see it
			// A send just worked, so the server is reachable: push anything that was waiting.
			this.flush().catch(() => { });
			return { ok: true, account_id: result?.account_id };
		} catch (error) {
			if (this._isPermanentRejection(error)) {
				await Log('error', `Server rejected the snapshot (HTTP ${error.status}); dropping it:`, error.message);
				await this._recordStatus({ lastError: `HTTP ${error.status}`, lastErrorAt: Date.now() });
				return { ok: false, reason: 'rejected', status: error.status };
			}
			await this._enqueue(payload, sig);
			if (error.status === 401 || error.status === 403) {
				await this._pause(error.status);
				return { ok: false, reason: 'auth_rejected', status: error.status };
			}
			await this._recordStatus({ lastError: error.message, lastErrorAt: Date.now() });
			await Log('warn', `Sync failed, queued: ${error.message}`);
			return { ok: false, reason: 'queued', error: error.message };
		}
	}

	// A 4xx that is not about credentials, timing or rate limits means this exact payload will
	// never be accepted. Retrying it would block every snapshot queued behind it forever.
	_isPermanentRejection(error) {
		const s = error?.status;
		return s >= 400 && s < 500 && ![401, 403, 408, 425, 429].includes(s);
	}

	async _markSent(orgId, sig) {
		const lastSent = (await getStorageValue(LAST_SENT_KEY, {})) || {};
		lastSent[orgId] = { sig, at: Date.now() };
		await setStorageValue(LAST_SENT_KEY, lastSent);
	}

	// Forget what was sent, so the next usage read goes out even if nothing changed. Used after
	// the server settings change, so a freshly configured server gets its accounts right away.
	async resetDedupe() {
		await setStorageValue(LAST_SENT_KEY, {});
	}

	//#endregion

	//#region Offline queue (storage.local, survives worker restarts)

	async _enqueue(payload, sig) {
		// Serialized, otherwise two concurrent failures read-modify-write the same array and one
		// of them is lost.
		this._queueLock = (this._queueLock || Promise.resolve()).then(async () => {
			const queue = (await getStorageValue(QUEUE_KEY, [])) || [];
			const tail = queue[queue.length - 1];
			if (tail && tail.payload.org_id === payload.org_id && this._signature(tail.payload) === sig) {
				tail.payload.timestamp = payload.timestamp; // same reading again: keep one entry
			} else {
				queue.push({ payload, queuedAt: Date.now() });
			}
			if (queue.length > MAX_QUEUE_SIZE) queue.splice(0, queue.length - MAX_QUEUE_SIZE);
			await setStorageValue(QUEUE_KEY, queue);
		}).catch(error => Log('warn', 'enqueue failed:', error));
		return this._queueLock;
	}

	// Pushes queued snapshots and pending notes. Called from the heartbeat alarm, on worker
	// start-up, and after any successful send. One run at a time.
	async flush() {
		if (this._flushing) return this._flushing;
		this._flushing = this._flush().finally(() => { this._flushing = null; });
		return this._flushing;
	}

	async _flush() {
		if (!(await this.isConfigured()) || (await this._isPaused())) return;

		const queue = (await getStorageValue(QUEUE_KEY, [])) || [];
		const remaining = queue.slice();
		let authFailed = false;

		while (remaining.length) {
			const item = remaining[0];
			try {
				await this._request('POST', '/api/v1/sync', item.payload);
				remaining.shift();
				await this._markSent(item.payload.org_id, this._signature(item.payload));
			} catch (error) {
				if (this._isPermanentRejection(error)) {
					remaining.shift();
					await Log('error', `Dropping queued snapshot the server refuses (HTTP ${error.status})`);
					continue;
				}
				if (error.status === 401 || error.status === 403) authFailed = true;
				break; // network or server trouble: keep this and the rest for the next flush
			}
		}

		if (remaining.length !== queue.length) {
			// Re-read: snapshots may have been queued while we were sending. Keep those too.
			await this._queueLock;
			const current = (await getStorageValue(QUEUE_KEY, [])) || [];
			const sent = queue.length - remaining.length;
			await setStorageValue(QUEUE_KEY, current.slice(sent));
			this._accounts = null;
			if (!remaining.length) {
				await this._recordStatus({ lastOkAt: Date.now(), lastError: null });
				await this._clearBadge();
			}
		}

		if (authFailed) await this._pause(401);
		else await this._flushPendingNotes();
	}

	//#endregion

	//#region Requests

	// The single send path. Non-2xx errors carry .status; 0 means network, timeout or not configured.
	async _request(method, path, body, override = null) {
		const auth = override || await this._getAuth();
		const baseUrl = override?.baseUrl ?? auth.baseUrl;
		const apiKey = auth.apiKey;
		if (!baseUrl || (!apiKey && !override?.noAuth)) {
			const error = new Error('not_configured');
			error.status = 0;
			throw error;
		}

		const headers = {};
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
		if (body !== undefined) headers['Content-Type'] = 'application/json';

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(`${baseUrl}${path}`, {
				method,
				headers,
				body: body !== undefined ? JSON.stringify(body) : undefined,
				signal: controller.signal
			});
			if (!response.ok) {
				const error = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
				error.status = response.status;
				throw error;
			}
			return await response.json();
		} catch (error) {
			if (error?.name === 'AbortError') {
				const timeout = new Error(`timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
				timeout.status = 0;
				throw timeout;
			}
			if (error && error.status === undefined) error.status = 0;
			throw error;
		} finally {
			clearTimeout(timer);
		}
	}

	_get(path) { return this._request('GET', path); }
	_put(path, body) { return this._request('PUT', path, body); }

	// Checks the pieces separately so the Options page can say which one is wrong: the address
	// (/health needs no key), then the key (an authenticated, read-only route that writes nothing).
	// `candidate` lets Options test values before they are saved.
	async testConnection(candidate = null) {
		const baseUrl = AtlasSync.normalizeUrl(candidate?.url) || (await this._getAuth()).baseUrl;
		const apiKey = (candidate?.apiKey || '').trim() || (await this._getAuth()).apiKey;
		if (!baseUrl) return { ok: false, reason: 'not_configured', message: 'Enter the server URL first.' };

		try {
			await this._request('GET', '/api/v1/health', undefined, { baseUrl, apiKey: null, noAuth: true });
		} catch (error) {
			return {
				ok: false, reason: 'unreachable', status: error.status || 0,
				message: error.status
					? `The server answered HTTP ${error.status} at ${baseUrl}/api/v1/health. Check the URL and your reverse proxy.`
					: `Could not reach ${baseUrl} (${error.message}). Check the URL, that the server is up, and that this extension was granted access to it.`
			};
		}

		if (!apiKey) return { ok: false, reason: 'not_configured', message: 'Server reachable. Enter the API key.' };

		try {
			await this._request('GET', '/api/v1/sync/connection-test', undefined, { baseUrl, apiKey });
			return { ok: true, message: 'Connected. The server is reachable and the API key is accepted.' };
		} catch (error) {
			if (error.status === 401 || error.status === 403) {
				return { ok: false, reason: 'bad_key', status: error.status, message: `The server rejected the API key (HTTP ${error.status}). It must match ATLAS_API_KEY in the server's .env.` };
			}
			return { ok: false, reason: 'error', status: error.status || 0, message: `Authenticated check failed: ${error.message}` };
		}
	}

	//#endregion

	//#region Accounts, history, notes

	async _accountFor(orgId, { refresh = false } = {}) {
		const stale = !this._accounts || Date.now() - this._accounts.fetchedAt > ACCOUNTS_CACHE_MS;
		if (refresh || stale || !this._accounts.byOrg[orgId]) await this._loadAccounts();
		return this._accounts?.byOrg[orgId] || null;
	}

	async _loadAccounts() {
		const accounts = await this._get('/api/v1/accounts');
		const byOrg = {};
		for (const account of accounts) if (account.org_id) byOrg[account.org_id] = account;
		this._accounts = { fetchedAt: Date.now(), byOrg };
		return accounts;
	}

	async getAllAccountsFromBackend() {
		if (!(await this.isConfigured())) return { ok: false, reason: 'not_configured' };
		try {
			return { ok: true, data: await this._loadAccounts() };
		} catch (error) {
			return { ok: false, reason: error.message, status: error.status || 0 };
		}
	}

	async getAccountHistory(orgId) {
		if (!(await this.isConfigured())) return { ok: false, reason: 'not_configured' };
		try {
			const account = await this._accountFor(orgId);
			if (!account) return { ok: false, reason: 'account_not_found' };
			return { ok: true, data: await this._get(`/api/v1/accounts/${account.id}/sync-history?limit=0`) };
		} catch (error) {
			return { ok: false, reason: error.message, status: error.status || 0 };
		}
	}

	// The sidebar note for an account. A locally pending edit wins over the server copy: it is
	// newer by definition, and is pushed here if the server can be reached now.
	async getNote(orgId) {
		if (!(await this.isConfigured())) return { ok: false, reason: 'not_configured' };

		const pending = await this._getPendingNote(orgId);
		if (pending !== undefined) {
			const pushed = await this._pushNote(orgId, pending);
			return { ok: true, content: pending, pending: !pushed.ok, synced: pushed.reason !== 'account_not_found' };
		}

		try {
			const account = await this._accountFor(orgId);
			if (!account) return { ok: true, content: '', synced: false };
			const note = await this._get(`/api/v1/accounts/${account.id}/note`);
			return { ok: true, content: note?.content || '', synced: true };
		} catch (error) {
			return { ok: false, reason: error.message, status: error.status || 0 };
		}
	}

	// Saves a note. The edit is written locally first and removed again once the server has it,
	// so it survives the server being down, the account not having synced yet, or a closed tab.
	async putNote(orgId, content) {
		if (!(await this.isConfigured())) return { ok: false, reason: 'not_configured' };
		await this._setPendingNote(orgId, content);
		const pushed = await this._pushNote(orgId, content);
		return pushed.ok ? { ok: true } : { ok: false, pending: true, reason: pushed.reason };
	}

	async _pushNote(orgId, content) {
		try {
			const account = await this._accountFor(orgId);
			if (!account) return { ok: false, reason: 'account_not_found' };
			await this._put(`/api/v1/accounts/${account.id}/note`, { content });
			// Only clear the pending copy if it was not edited again while we were sending.
			if ((await this._getPendingNote(orgId)) === content) await this._setPendingNote(orgId, undefined);
			return { ok: true };
		} catch (error) {
			return { ok: false, reason: error.message, status: error.status || 0 };
		}
	}

	async _flushPendingNotes() {
		const pending = (await getStorageValue(PENDING_NOTES_KEY, {})) || {};
		for (const [orgId, content] of Object.entries(pending)) {
			const result = await this._pushNote(orgId, content);
			if (!result.ok && result.status === 0) break; // server unreachable: try again next flush
		}
	}

	async _getPendingNote(orgId) {
		const pending = (await getStorageValue(PENDING_NOTES_KEY, {})) || {};
		return Object.prototype.hasOwnProperty.call(pending, orgId) ? pending[orgId] : undefined;
	}

	async _setPendingNote(orgId, content) {
		this._noteLock = (this._noteLock || Promise.resolve()).then(async () => {
			const pending = (await getStorageValue(PENDING_NOTES_KEY, {})) || {};
			if (content === undefined) delete pending[orgId];
			else pending[orgId] = content;
			await setStorageValue(PENDING_NOTES_KEY, pending);
		}).catch(error => Log('warn', 'pending note write failed:', error));
		return this._noteLock;
	}

	//#endregion

	//#region Status, pause and badge

	// For the popup and the Options page.
	async getStatus() {
		const { baseUrl, apiKey } = await this._getAuth();
		const status = (await getStorageValue(STATUS_KEY, {})) || {};
		const queue = (await getStorageValue(QUEUE_KEY, [])) || [];
		let permitted = true;
		try {
			if (baseUrl && browser.permissions?.contains) {
				permitted = await browser.permissions.contains({ origins: [`${new URL(baseUrl).origin}/*`] });
			}
		} catch {
			permitted = false;
		}
		return {
			configured: !!(baseUrl && apiKey),
			url: baseUrl,
			permitted,
			paused: await this._isPaused(),
			queued: queue.length,
			lastOkAt: status.lastOkAt || null,
			lastError: status.lastError || null
		};
	}

	async _recordStatus(patch) {
		const status = (await getStorageValue(STATUS_KEY, {})) || {};
		await setStorageValue(STATUS_KEY, { ...status, ...patch });
	}

	async _isPaused() {
		return (await getStorageValue(PAUSED_UNTIL_KEY, 0)) > Date.now();
	}

	async _pause(status) {
		await setStorageValue(PAUSED_UNTIL_KEY, Date.now() + AUTH_PAUSE_MS);
		await this._recordStatus({ lastError: `API key rejected (HTTP ${status})`, lastErrorAt: Date.now() });
		await this._setBadge('!');
		await Log('warn', `API key rejected (HTTP ${status}); sending paused for a minute. Check the extension options.`);
		clearTimeout(this._resumeTimer);
		this._resumeTimer = setTimeout(() => this.resume('pause expired').catch(() => { }), AUTH_PAUSE_MS);
	}

	// Lifts a pause (the key or URL changed in Options, or the pause ran out) and retries.
	async resume(reason) {
		clearTimeout(this._resumeTimer);
		this._resumeTimer = null;
		const wasPaused = (await getStorageValue(PAUSED_UNTIL_KEY, 0)) > 0;
		await setStorageValue(PAUSED_UNTIL_KEY, 0);
		if (wasPaused) await Log(`Sync resumed (${reason})`);
		await this.flush();
	}

	async _clearBadge() {
		await this._setBadge('');
	}

	async _setBadge(text) {
		try {
			const action = globalThis.browser?.action ?? globalThis.browser?.browserAction
				?? globalThis.chrome?.action ?? globalThis.chrome?.browserAction;
			if (!action?.setBadgeText) return; // Electron has no action API
			if (text) await action.setBadgeBackgroundColor?.({ color: '#d93025' });
			await action.setBadgeText({ text });
		} catch {
			// The badge is cosmetic and must never break a send.
		}
	}

	//#endregion
}

export const atlasSync = new AtlasSync();
export { AtlasSync };

// A new key or URL in Options lifts any pause immediately instead of waiting out the minute.
try {
	browser.storage.onChanged.addListener((changes, area) => {
		if (area === 'local' && (changes.atlasUrl || changes.atlasApiKey)) {
			atlasSync.resume('settings changed').catch(() => { });
		}
	});
} catch {
	// storage.onChanged is missing on Electron; the pause simply runs out on its own.
}
