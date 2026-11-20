// account-locale-watcher.js (claude-ext-common)
// MAIN world, document_start. Watches for PUT /api/account_profile (claude.ai's language setting)
// and records the new locale in the shared cache that i18n-core.js reads, so the extension UI follows
// on the reload claude.ai does after a language change. Reading the request body rather than
// refetching avoids the brief window where GET /api/account_profile still returns the old locale.
//
// An IIFE with no globals, because every extension may load it into the same MAIN world. Loaded by
// more than one extension it simply wraps fetch more than once and writes the same value.
(function () {
	'use strict';

	// Must match ACCOUNT_LOCALE_CACHE_KEY / ACCOUNT_LOCALE_TTL in i18n-core.js.
	const CACHE_KEY = 'claude_ext_locale_cache';
	const TTL = 24 * 60 * 60 * 1000;

	const previousFetch = window.fetch;
	window.fetch = async function (...args) {
		const response = await previousFetch.apply(this, args);
		try {
			const [input, options] = args;
			const url = input instanceof Request ? input.url : String(input);
			const method = options?.method ?? (input instanceof Request ? input.method : 'GET');
			if (response.ok && method.toUpperCase() === 'PUT' && url.includes('/api/account_profile')
				&& typeof options?.body === 'string') {
				const locale = JSON.parse(options.body)?.locale;
				if (locale && typeof locale === 'string') {
					localStorage.setItem(CACHE_KEY, JSON.stringify({ locale, expiry: Date.now() + TTL }));
				}
			}
		} catch (e) { /* not JSON, or storage blocked - nothing to record */ }
		return response;
	};
})();
