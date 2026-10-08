/**
 * atlasSync.js
 * Handles all communication between the extension and the UsageOS backend.
 * Non-blocking: sync failures are queued and retried, never block the UI.
 *
 * Auth settings (atlasUrl / atlasApiKey) are read from storage on EVERY request —
 * never cached on the instance — so a key saved in Options takes effect on the
 * next send, not the next worker restart. A 401/403 pauses sending entirely
 * instead of hammering the endpoint.
 */

import { getStorageValue, setStorageValue, RawLog } from './utils.js';

async function Log(...args) {
    await RawLog('atlasSync', ...args);
}

const OFFLINE_QUEUE_KEY = 'atlasSync_offlineQueue';  // chrome.storage.local
const PAUSED_UNTIL_KEY  = 'atlasSync_pausedUntil';   // chrome.storage.local
const MAX_QUEUE_SIZE    = 200;
const SYNC_TIMEOUT_MS   = 8000;
const SYNC_INTERVAL_MS  = 5 * 60 * 1000;
const AUTH_PAUSE_MS     = 60 * 1000;

const LIMIT_KEY_MAP = {
    session:      'session',
    weekly:       'weekly',
    sonnetWeekly: 'sonnet_weekly',
    opusWeekly:   'opus_weekly'
};

class AtlasSync {
    constructor() {
        this._ready = false;
        this._accountsCache = null; // { orgId → { id, ... } }
        this._resumeTimer = null;
        this._enqueueChain = Promise.resolve();
        this._flushInFlight = false;
    }

    // Settings are deliberately NOT cached here: _getAuth() reads storage per request.
    // Kept for API compatibility (background.js calls init(true) after saving settings).
    async init(force = false) {
        this._ready = true;
    }

    static async getSettings() {
        const url    = await getStorageValue('atlasUrl', '');
        const apiKey = await getStorageValue('atlasApiKey', '');
        return { url, apiKey };
    }

    static async saveSettings(url, apiKey) {
        await setStorageValue('atlasUrl', url?.trim() || '');
        await setStorageValue('atlasApiKey', apiKey?.trim() || '');
    }

    async isConfigured() {
        const { baseUrl, apiKey } = await this._getAuth();
        return !!(baseUrl && apiKey);
    }

    // Fresh read from chrome.storage on every call. No module/instance copy.
    async _getAuth() {
        const { url, apiKey } = await AtlasSync.getSettings();
        const baseUrl = (url || '').trim().replace(/\/$/, '') || null;
        const key     = (apiKey || '').trim() || null;
        return { baseUrl, apiKey: key };
    }

    async sync(orgId, email, usageData) {
        await this.init();
        const payload = this._buildPayload(orgId, email, usageData);

        if (await this._isPaused()) {
            await this._logAttempt('/api/v1/sync', 'paused', orgId, 'queued');
            await this._enqueue(payload);
            return { ok: false, reason: 'paused' };
        }

        // Empty key: queue the payload, never send it.
        const { apiKey } = await this._getAuth();
        if (!apiKey) {
            await this._logAttempt('/api/v1/sync', 'no-key', orgId, 'queued');
            await this._enqueue(payload);
            return { ok: false, reason: 'not_configured' };
        }

        try {
            const result = await this._post('/api/v1/sync', payload);
            await this._logAttempt('/api/v1/sync', 200, orgId, 'sent');
            await this._flushQueue();
            await Log(`Synced ${email || orgId} -> account_id ${result.account_id}`);
            return { ok: true, account_id: result.account_id };
        } catch (err) {
            await this._enqueue(payload);
            if (err.status === 401 || err.status === 403) {
                await this._logAttempt('/api/v1/sync', err.status, orgId, 'queued(auth-paused)');
                await this._pause(err.status);
                return { ok: false, reason: 'auth_rejected', status: err.status };
            }
            await this._logAttempt('/api/v1/sync', err.status || 'net', orgId, 'queued');
            await Log('warn', `Sync failed (queued): ${err.message}`);
            return { ok: false, reason: 'queued', error: err.message };
        }
    }

    // Authenticated, read-only endpoint: GET /api/v1/sync/connection-test enforces
    // verify_api_key (backend sync.py) and returns [] without writing anything.
    async testConnection() {
        await this.init(true);
        const { baseUrl, apiKey } = await this._getAuth();
        if (!baseUrl || !apiKey) return { ok: false, reason: 'not_configured', status: 0 };

        try {
            const data = await this._get('/api/v1/sync/connection-test');
            return { ok: true, status: 200, data };
        } catch (err) {
            return {
                ok: false,
                status: err.status || 0,
                reason: err.status ? `HTTP ${err.status}` : err.message
            };
        }
    }

    async flushOnStartup() {
        await this.init();
        if (!(await this.isConfigured())) return;
        await this._flushQueue();
    }

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
            provider: 'claude',
            email: email || null,
            org_id: orgId,
            subscription_tier: raw.subscriptionTier || null,
            limits,
            timestamp: new Date().toISOString()
        };
    }

    // Single send path. Reads auth from storage per call; refuses to fetch with an
    // empty key. Non-2xx errors carry .status (0 = network/timeout/not_configured).
    async _request(method, path, body) {
        const { baseUrl, apiKey } = await this._getAuth();
        if (!baseUrl || !apiKey) {
            const err = new Error('not_configured');
            err.status = 0;
            throw err;
        }

        const headers = { 'Authorization': `Bearer ${apiKey}` };
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), SYNC_TIMEOUT_MS);
        try {
            const resp = await fetch(`${baseUrl}${path}`, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: ac.signal
            });
            if (!resp.ok) {
                const err = new Error(`HTTP ${resp.status} ${resp.statusText}`);
                err.status = resp.status;
                throw err;
            }
            return await resp.json();
        } catch (err) {
            if (err?.name === 'AbortError') {
                const t = new Error(`timeout after ${SYNC_TIMEOUT_MS}ms`);
                t.status = 0;
                throw t;
            }
            if (err && err.status === undefined) err.status = 0;
            throw err;
        } finally {
            clearTimeout(timeout);
        }
    }

    async _post(path, body)  { return this._request('POST', path, body); }
    async _put(path, body)   { return this._request('PUT', path, body); }
    async _get(path)         { return this._request('GET', path); }

    async getAccountHistory(orgId) {
        await this.init();
        if (!(await this.isConfigured())) return { ok: false, reason: 'not_configured' };

        try {
            // First, get all accounts to find the UUID for this orgId
            const accounts = await this._get('/api/v1/accounts');
            const account = accounts.find(a => a.org_id === orgId);
            if (!account) {
                return { ok: false, reason: 'account_not_found' };
            }
            // Fetch full history (limit=0 means all)
            const history = await this._get(`/api/v1/accounts/${account.id}/sync-history?limit=0`);
            return { ok: true, data: history };
        } catch (err) {
            return { ok: false, reason: err.message, status: err.status || 0 };
        }
    }

    async getAllAccountsFromBackend() {
        await this.init();
        if (!(await this.isConfigured())) return { ok: false, reason: 'not_configured' };

        try {
            const accounts = await this._get('/api/v1/accounts');
            // Cache accounts by orgId for note saves (orgId → { id, ... })
            this._accountsCache = {};
            for (const acc of accounts) {
                if (acc.org_id) this._accountsCache[acc.org_id] = acc;
            }
            return { ok: true, data: accounts };
        } catch (err) {
            return { ok: false, reason: err.message, status: err.status || 0 };
        }
    }

    async putNote(orgId, content) {
        await this.init();
        if (!(await this.isConfigured())) return { ok: false, reason: 'not_configured' };

        // Ensure we have the accounts cache
        if (!this._accountsCache || !this._accountsCache[orgId]) {
            await this.getAllAccountsFromBackend();
        }
        const account = this._accountsCache?.[orgId];
        if (!account) return { ok: false, reason: 'account_not_found' };

        try {
            const result = await this._put(`/api/v1/accounts/${account.id}/note`, { content });
            return { ok: true, data: result };
        } catch (err) {
            return { ok: false, reason: err.message, status: err.status || 0 };
        }
    }

    // ── Offline queue (chrome.storage.local, survives worker restarts) ──────────

    async _enqueue(payload) {
        // Serialize: concurrent sync() calls would otherwise read-modify-write the
        // same array and drop each other's entries.
        this._enqueueChain = this._enqueueChain.then(async () => {
            const queue = (await getStorageValue(OFFLINE_QUEUE_KEY, [])) || [];
            queue.push({ payload, queuedAt: Date.now() });
            if (queue.length > MAX_QUEUE_SIZE) queue.splice(0, queue.length - MAX_QUEUE_SIZE);
            await setStorageValue(OFFLINE_QUEUE_KEY, queue);
        }).catch(err => Log('warn', 'enqueue failed:', err));
        return this._enqueueChain;
    }

    async _flushQueue() {
        if (this._flushInFlight) return;
        if (await this._isPaused()) return;
        const { apiKey } = await this._getAuth();
        if (!apiKey) return; // empty key: never send

        const queue = (await getStorageValue(OFFLINE_QUEUE_KEY, [])) || [];
        if (!queue.length) return;

        this._flushInFlight = true;
        const remaining = queue.slice();
        try {
            while (remaining.length) {
                const item = remaining[0];
                try {
                    await this._post('/api/v1/sync', item.payload);
                    remaining.shift();
                    await this._logAttempt('/api/v1/sync', 200, item.payload?.org_id, 'sent');
                    await Log(`Flushed queued payload for ${item.payload?.email}`);
                } catch (err) {
                    if (err.status === 401 || err.status === 403) {
                        // Auth rejected: stop the loop, keep everything queued, pause.
                        await this._logAttempt('/api/v1/sync', err.status, item.payload?.org_id, 'queued(auth-paused)');
                        await setStorageValue(OFFLINE_QUEUE_KEY, remaining);
                        await this._pause(err.status);
                        return;
                    }
                    // Network/server error: keep this and the rest, retry on next cycle.
                    await this._logAttempt('/api/v1/sync', err.status || 'net', item.payload?.org_id, 'queued');
                    break;
                }
            }
            await setStorageValue(OFFLINE_QUEUE_KEY, remaining);
        } finally {
            this._flushInFlight = false;
        }
    }

    // ── 401/403 pause ───────────────────────────────────────────────────────────

    async _isPaused() {
        const until = await getStorageValue(PAUSED_UNTIL_KEY, 0);
        return until > Date.now();
    }

    async _pause(status) {
        await setStorageValue(PAUSED_UNTIL_KEY, Date.now() + AUTH_PAUSE_MS);
        await this._setBadge('!');
        await Log('warn', `API key rejected (${status}), check Options`);
        if (this._resumeTimer) clearTimeout(this._resumeTimer);
        this._resumeTimer = setTimeout(() => {
            this._resume('pause expired').catch(() => {});
        }, AUTH_PAUSE_MS);
    }

    async _resume(reason) {
        if (this._resumeTimer) {
            clearTimeout(this._resumeTimer);
            this._resumeTimer = null;
        }
        const wasPaused = (await getStorageValue(PAUSED_UNTIL_KEY, 0)) > 0;
        await setStorageValue(PAUSED_UNTIL_KEY, 0);
        await this._setBadge('');
        if (wasPaused) await Log(`Sync resumed (${reason})`);
        await this._flushQueue();
    }

    async _setBadge(text) {
        try {
            const action = globalThis.browser?.action ?? globalThis.browser?.browserAction
                ?? globalThis.chrome?.action ?? globalThis.chrome?.browserAction;
            if (!action?.setBadgeText) return; // Electron / no action API
            if (text) await action.setBadgeBackgroundColor?.({ color: '#d93025' });
            await action.setBadgeText({ text });
        } catch {
            // Badge is cosmetic; never break a send over it.
        }
    }

    async _logAttempt(path, status, orgId, outcome) {
        const org = String(orgId ?? '').slice(0, 8) || '-';
        await Log(`${path} status=${status} org=${org} ${outcome}`);
    }
}

export const atlasSync = new AtlasSync();
export { AtlasSync };

// Resume when the key or server URL changes in Options — no need to wait out the 60s.
try {
    browser.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.atlasUrl || changes.atlasApiKey) {
            atlasSync._resume('settings changed').catch(() => {});
        }
    });
} catch {
    // storage.onChanged unavailable (Electron shim) — the 60s timer still resumes.
}

setInterval(async () => {
    await atlasSync.init();
    if (await atlasSync.isConfigured()) {
        await atlasSync.flushOnStartup();
    }
}, SYNC_INTERVAL_MS);