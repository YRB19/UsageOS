/**
 * forkHooks.js  —  UsageOS' entire footprint inside the extension's service worker.
 *
 * Fork-owned: lives in extension-overlay/files/ and is copied over a pristine upstream
 * export on every sync. Upstream never touches it. background.js reaches it through two
 * one-line hooks declared in extension-overlay/hooks.json:
 *     import { forkSyncUsage } from './bg-components/forkHooks.js';   (top of file)
 *     await forkSyncUsage(api, orgId, usageData);                      (end of the authoritative pass)
 * Everything else happens as a side effect of importing this module.
 */
import { StoredMap, getStorageValue, setStorageValue, RawLog, messageRegistry } from './utils.js';
import { serverSync, ServerSync } from './serverSync.js';

async function Log(...args) {
	await RawLog('fork', ...args);
}

const accountEmailCache = new StoredMap('accountEmails');
const DAY = 24 * 60 * 60 * 1000;

/**
 * Best-effort account email. Claude's /account_profile has no email field for most
 * accounts, so personal-tier orgs ("{email}'s Organization") are parsed from the org name,
 * with a DOM-scraped value as last resort. Never caches a failed lookup.
 */
export async function getAccountEmail(api) {
	const cacheKey = api.orgId || 'default';
	const cached = await accountEmailCache.get(cacheKey);
	if (cached) return cached;

	try {
		const p = await api.getRequest('/account_profile');
		const email = p?.email_address || p?.email || p?.account?.email_address || p?.account?.email
			|| p?.memberships?.[0]?.account?.email_address || null;
		if (email) { await accountEmailCache.set(cacheKey, email, DAY); return email; }
	} catch (error) {
		await Log('warn', 'getAccountEmail: /account_profile failed:', error);
	}

	try {
		const org = await api.getOrgInfo();
		const suffix = "'s Organization";
		if (org?.name?.endsWith(suffix)) {
			const email = org.name.slice(0, -suffix.length);
			const parts = email.split('@');
			if (parts.length === 2 && parts[0] && parts[1].includes('.')) {
				await accountEmailCache.set(cacheKey, email, DAY);
				return email;
			}
		}
	} catch (error) {
		await Log('warn', 'getAccountEmail: org-name parse failed:', error);
	}

	try {
		const key = `accountEmail_${api.orgId}`;
		const stored = (await browser.storage.local.get(key))[key];
		if (stored) { await accountEmailCache.set(cacheKey, stored, DAY); return stored; }
	} catch (error) {
		await Log('warn', 'getAccountEmail: stored DOM email read failed:', error);
	}

	await Log('warn', 'getAccountEmail: all methods failed for org:', api.orgId);
	return null; // not cached: retry next time
}

/** Called by the hook in background.js. Must never throw into the upstream code path. */
export async function forkSyncUsage(api, orgId, usageData) {
	try {
		const email = await getAccountEmail(api);
		serverSync.sync(orgId, email, usageData).catch(() => {});
	} catch (err) {
		await Log('warn', 'server sync error:', err);
	}
}

// ---- message handlers used by options / popup / dashboard / the notes widget ----
messageRegistry.register('serverSaveSettings', async (message) => {
	await ServerSync.saveSettings(message.url, message.apiKey);
	await serverSync.init(true);
	return true;
});
messageRegistry.register('serverTestConnection', () => serverSync.testConnection());
messageRegistry.register('getAccountHistory', async ({ orgId }) =>
	orgId ? serverSync.getAccountHistory(orgId) : { ok: false, reason: 'missing_orgId' });
messageRegistry.register('getAllAccountsFromBackend', () => serverSync.getAllAccountsFromBackend());
messageRegistry.register('putNote', async ({ orgId, content }) =>
	orgId ? serverSync.putNote(orgId, content) : { ok: false, reason: 'missing_orgId' });

async function readSynced(key) {
	try { return (await browser.storage.sync.get(key))[key] || ''; }
	catch { return await getStorageValue(key, ''); }
}
async function writeSynced(key, value) {
	try { await browser.storage.sync.set({ [key]: value }); }
	catch { await setStorageValue(key, value); }
}
messageRegistry.register('getAccountNote', async ({ orgId }) => orgId ? readSynced(`accountNote_${orgId}`) : '');
messageRegistry.register('setAccountNote', async ({ orgId, note }) => orgId ? (await writeSynced(`accountNote_${orgId}`, note), true) : false);
messageRegistry.register('getAccountNickname', async ({ orgId }) => orgId ? readSynced(`accountNickname_${orgId}`) : '');
messageRegistry.register('setAccountNickname', async ({ orgId, nickname }) => orgId ? (await writeSynced(`accountNickname_${orgId}`, nickname), true) : false);

// Retry anything queued while the server was unreachable.
serverSync.flushOnStartup().catch(() => {});
