/**
 * atlasSync.js
 * Handles all communication between the extension and the UsageOS backend.
 * Non-blocking: sync failures are queued and retried, never block the UI.
 */

import { getStorageValue, setStorageValue, RawLog } from './utils.js';

async function Log(...args) {
    await RawLog('atlasSync', ...args);
}

const OFFLINE_QUEUE_KEY = 'atlasSync_offlineQueue';
const MAX_QUEUE_SIZE    = 100;
const SYNC_TIMEOUT_MS   = 8000;
const SYNC_INTERVAL_MS  = 5 * 60 * 1000;

const LIMIT_KEY_MAP = {
    session:      'session',
    weekly:       'weekly',
    sonnetWeekly: 'sonnet_weekly',
    opusWeekly:   'opus_weekly'
};

class AtlasSync {
    constructor() {
        this._baseUrl = null;
        this._apiKey  = null;
        this._ready   = false;
        this._initPromise = null;
        this._accountsCache = null; // { orgId → { id, ... } }
    }

    async init(force = false) {
        if (this._ready && !force) return;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            const { url, apiKey } = await AtlasSync.getSettings();
            this._baseUrl = url?.replace(/\/$/, '') || null;
            this._apiKey  = apiKey || null;
            this._ready   = true;
        })();

        await this._initPromise;
        this._initPromise = null;
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

    isConfigured() {
        return !!(this._baseUrl && this._apiKey);
    }

    async sync(orgId, email, usageData) {
        await this.init();
        if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

        const payload = this._buildPayload(orgId, email, usageData);

        try {
            const result = await this._post('/api/v1/sync', payload);
            await this._flushQueue();
            await Log(`Synced ${email || orgId} -> account_id ${result.account_id}`);
            return { ok: true, account_id: result.account_id };
        } catch (err) {
            await Log('warn', `Sync failed (queued): ${err.message}`);
            await this._enqueue(payload);
            return { ok: false, reason: 'queued', error: err.message };
        }
    }

    async testConnection() {
        await this.init(true);
        if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

        try {
            const data = await this._get('/api/v1/health');
            return { ok: true, data };
        } catch (err) {
            return { ok: false, reason: err.message };
        }
    }

    async flushOnStartup() {
        await this.init();
        if (!this.isConfigured()) return;
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

    async _post(path, body) {
        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), SYNC_TIMEOUT_MS);
        try {
            const resp = await fetch(`${this._baseUrl}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this._apiKey}`
                },
                body: JSON.stringify(body),
                signal: ac.signal
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
            return resp.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    async _put(path, body) {
        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), SYNC_TIMEOUT_MS);
        try {
            const resp = await fetch(`${this._baseUrl}${path}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this._apiKey}`
                },
                body: JSON.stringify(body),
                signal: ac.signal
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
            return resp.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    async _get(path) {
        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), SYNC_TIMEOUT_MS);
        try {
            const resp = await fetch(`${this._baseUrl}${path}`, {
                headers: { 'Authorization': `Bearer ${this._apiKey}` },
                signal: ac.signal
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
            return resp.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    async getAccountHistory(orgId) {
        await this.init();
        if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

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
            return { ok: false, reason: err.message };
        }
    }

    async getAllAccountsFromBackend() {
        await this.init();
        if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

        try {
            const accounts = await this._get('/api/v1/accounts');
            // Cache accounts by orgId for note saves (orgId → { id, ... })
            this._accountsCache = {};
            for (const acc of accounts) {
                if (acc.org_id) this._accountsCache[acc.org_id] = acc;
            }
            return { ok: true, data: accounts };
        } catch (err) {
            return { ok: false, reason: err.message };
        }
    }

    async putNote(orgId, content) {
        await this.init();
        if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

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
            return { ok: false, reason: err.message };
        }
    }

    async _enqueue(payload) {
        const queue = (await getStorageValue(OFFLINE_QUEUE_KEY, [])) || [];
        queue.push({ payload, queuedAt: Date.now() });
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

export const atlasSync = new AtlasSync();
export { AtlasSync };

setInterval(async () => {
    await atlasSync.init();
    if (atlasSync.isConfigured()) {
        await atlasSync.flushOnStartup();
    }
}, SYNC_INTERVAL_MS);