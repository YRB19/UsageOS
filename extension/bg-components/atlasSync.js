/**
 * atlasSync.js
 * Handles all communication between the Claude extension and the ATLAS server.
 *
 * Design goals:
 *  - Never block the extension's main request pipeline
 *  - Survive server downtime via an offline queue (drained on next success)
 *  - Keep the payload shape provider-agnostic so OpenAI / Gemini slots in trivially
 */

import { getStorageValue, setStorageValue, RawLog } from './utils.js';

async function Log(...args) {
	await RawLog('atlasSync', ...args);
}

const OFFLINE_QUEUE_KEY = 'atlasSync_offlineQueue';
const MAX_QUEUE_SIZE    = 100;
const SYNC_TIMEOUT_MS  = 8000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // periodic background sync

// Limit key mapping: extension names → API snake_case
const LIMIT_KEY_MAP = {
	session:      'session',
	weekly:       'weekly',
	sonnetWeekly: 'sonnet_weekly',
	opusWeekly:   'opus_weekly'
};

class AtlasSync {
	constructor() {
		this._baseUrl    = null;
		this._apiKey     = null;
		this._ready      = false;
		this._initPromise = null;
	}

	// ─── Initialisation ──────────────────────────────────────────────────────────

	async init(force = false) {
		// Re-read settings whenever explicitly asked OR whenever the cached
		// config is missing/blank. Earlier code short-circuited on `_ready`
		// alone, which meant a sync() that ran *before* the user saved their
		// ATLAS settings would cache `_baseUrl=null, _apiKey=null, _ready=true`
		// — and every later sync() then bailed out at `isConfigured()` even
		// after they had saved. Settings reads are cheap (chrome.storage.local
		// is async but not network-bound), so always re-read if unconfigured.
		if (this._ready && !force && this._baseUrl && this._apiKey) return;
		if (this._initPromise)                                  return this._initPromise;

		this._initPromise = (async () => {
			const { url, apiKey } = await this.getSettings();
			this._baseUrl  = url?.replace(/\/$/, '') || null;
			this._apiKey   = apiKey || null;
			this._ready     = true;
		})();

		await this._initPromise;
		this._initPromise = null;
	}

	// ─── Settings (stored in chrome.storage.local) ────────────────────────────

	async getSettings() {
		const url    = await getStorageValue('atlasUrl',    '');
		const apiKey = await getStorageValue('atlasApiKey', '');
		return { url, apiKey };
	}

	async saveSettings(url, apiKey) {
		await setStorageValue('atlasUrl',    url?.trim()    || '');
		await setStorageValue('atlasApiKey', apiKey?.trim() || '');
	}

	isConfigured() {
		return !!(this._baseUrl && this._apiKey);
	}

	// ─── Public API ───────────────────────────────────────────────────────────

	/**
	 * Sync one account's current usage to ATLAS.
	 * Called after every message completion and on popup open.
	 *
	 * @param {string}   orgId      — Claude org UUID
	 * @param {string}   email      — account email (may be null on first run)
	 * @param {UsageData} usageData — current UsageData instance
	 */
	async sync(orgId, email, usageData) {
		await this.init();
		if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

		const payload = this._buildPayload(orgId, email, usageData);

		try {
			const result = await this._post('/api/v1/sync', payload);
			await this._flushQueue();                             // drain any backlog
			await Log(`Synced ${email || orgId} → account_id ${result.account_id}`);
			return { ok: true, account_id: result.account_id };
		} catch (err) {
			await Log('warn', `Sync failed (queued): ${err.message}`);
			await this._enqueue(payload);
			return { ok: false, reason: 'queued', error: err.message };
		}
	}

	/** Health-check — used by the options page "Test connection" button. */
	async testConnection() {
		await this.init(true);          // force re-read settings in case they just changed
		if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

		try {
			const data = await this._get('/api/v1/health');
			return { ok: true, data };
		} catch (err) {
			return { ok: false, reason: err.message };
		}
	}

	/** Called on service-worker startup to flush any payloads queued while offline. */
	async flushOnStartup() {
		await this.init();
		if (!this.isConfigured()) return;
		await this._flushQueue();
	}

	// ─── Payload builder ──────────────────────────────────────────────────────

	_buildPayload(orgId, email, usageData) {
		const raw    = usageData?.toJSON ? usageData.toJSON() : (usageData || {});
		const limits = {};

		for (const [jsKey, apiKey] of Object.entries(LIMIT_KEY_MAP)) {
			const limit = raw.limits?.[jsKey];
			limits[apiKey] = limit
				? {
					usage_pct: limit.percentage ?? null,
					resets_at: limit.resetsAt ? new Date(limit.resetsAt).toISOString() : null
				}
				: null;
		}

		return {
			provider:           'claude',
			email:              email || null,
			org_id:             orgId,
			subscription_tier:  raw.subscriptionTier || null,
			limits,
			timestamp:          new Date().toISOString()
		};
	}

	// ─── HTTP helpers ─────────────────────────────────────────────────────────

	async _post(path, body) {
		const ac      = new AbortController();
		const timeout = setTimeout(() => ac.abort(), SYNC_TIMEOUT_MS);
		try {
			const resp = await fetch(`${this._baseUrl}${path}`, {
				method:  'POST',
				headers: {
					'Content-Type':  'application/json',
					'Authorization': `Bearer ${this._apiKey}`
				},
				body:   JSON.stringify(body),
				signal: ac.signal
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
			return resp.json();
		} finally {
			clearTimeout(timeout);
		}
	}

	async _get(path) {
		const ac      = new AbortController();
		const timeout = setTimeout(() => ac.abort(), SYNC_TIMEOUT_MS);
		try {
			const resp = await fetch(`${this._baseUrl}${path}`, {
				headers: { 'Authorization': `Bearer ${this._apiKey}` },
				signal:  ac.signal
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
			return resp.json();
		} finally {
			clearTimeout(timeout);
		}
	}

	// ─── Offline queue ─────────────────────────────────────────────────────────

	async _enqueue(payload) {
		const queue = (await getStorageValue(OFFLINE_QUEUE_KEY, [])) || [];
		queue.push({ payload, queuedAt: Date.now() });
		// Drop oldest if over cap
		if (queue.length > MAX_QUEUE_SIZE) queue.splice(0, queue.length - MAX_QUEUE_SIZE);
		await setStorageValue(OFFLINE_QUEUE_KEY, queue);
	}

	async _flushQueue() {
		const queue = (await getStorageValue(OFFLINE_QUEUE_KEY, [])) || [];
		if (!queue.length) return;

		const remaining = [];
		for (const item of queue) {
			try {
				await this._post('/api/v1/sync', item.payload);
				await Log(`Flushed queued payload for ${item.payload?.email}`);
			} catch {
				remaining.push(item);
			}
		}
		await setStorageValue(OFFLINE_QUEUE_KEY, remaining);
	}
}

// Singleton — import this everywhere
export const atlasSync = new AtlasSync();

// ─── Periodic background sync ─────────────────────────────────────────────────
// Every SYNC_INTERVAL_MS, flush anything sitting in the offline queue.
// The per-message sync already pushes fresh data; this is just a safety net.
setInterval(async () => {
	await atlasSync.init();
	if (atlasSync.isConfigured()) {
		await atlasSync.flushOnStartup();
	}
}, SYNC_INTERVAL_MS);
