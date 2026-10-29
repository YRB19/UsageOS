// i18n-core.js (claude-ext-common)
// UI localization shared by the claude.ai extensions. Classic script, no IIFE: everything below is a
// global of the loading world. Load it after the string tables, which register themselves with
//   Object.assign((globalThis.CLAUDE_EXT_I18N ??= {})['<lang>'] ??= {}, { ... })
// so common/i18n/<lang>.js and each extension's own tables merge into one lookup table per language.
//
// The language is resolved synchronously from claude.ai's localStorage. Every extension on the page
// shares that origin, so they all see the same keys and always agree on the language:
//   1. claude_ext_language      - user override, set from any extension's language picker
//   2. claude_ext_locale_cache  - the claude.ai account locale, see refreshAccountLocale()
//   3. navigator.language
// A language change always reloads the page; nothing re-renders live.
//
// Contexts without claude.ai's localStorage (an extension's popup or background) can't resolve the
// language themselves: have a content script store currentLocale() somewhere they can read, and
// call translate(locale, key, vars) there instead of localize().

const I18N_LOCALES = ['en', 'fr', 'de', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'es'];

// Deliberately untranslated: each language is shown in its own script.
const LANGUAGE_NATIVE_NAMES = {
	'en': 'English',
	'fr': 'Français',
	'de': 'Deutsch',
	'hi': 'हिन्दी',
	'id': 'Bahasa Indonesia',
	'it': 'Italiano',
	'ja': '日本語',
	'ko': '한국어',
	'pt-BR': 'Português (Brasil)',
	'es': 'Español',
};

const I18N_OVERRIDE_KEY = 'claude_ext_language';
// Also written, in the same {locale, expiry} format, by account-locale-watcher.js.
const ACCOUNT_LOCALE_CACHE_KEY = 'claude_ext_locale_cache';
const ACCOUNT_LOCALE_TTL = 24 * 60 * 60 * 1000;
// How long a refresh in progress holds off other refreshes (other worlds, other extensions).
const ACCOUNT_LOCALE_CLAIM = 60 * 1000;

// The locales claude.ai itself offers, in the form /api/account_profile reports them.
const ACCOUNT_LOCALES = ['en-US', 'de-DE', 'fr-FR', 'ko-KR', 'ja-JP', 'es-419', 'es-ES', 'it-IT', 'hi-IN', 'pt-BR', 'id-ID'];

// Map any language tag (en-US, es-419, pt, ...) to one of I18N_LOCALES. Falls back to 'en'.
function normalizeLocale(raw) {
	if (!raw || typeof raw !== 'string') return 'en';
	const lower = raw.toLowerCase().trim();
	const exact = I18N_LOCALES.find(l => l.toLowerCase() === lower);
	if (exact) return exact;
	const base = lower.split('-')[0];
	if (base === 'pt') return 'pt-BR';
	return I18N_LOCALES.find(l => l === base) || 'en';
}

// {locale, expiry}, or null. locale is whatever the account reported (or null while a first
// refresh is in flight); normalizeLocale()/accountLocale() decide what to make of it.
function _readAccountLocaleCache() {
	try {
		const cached = JSON.parse(localStorage.getItem(ACCOUNT_LOCALE_CACHE_KEY));
		if (cached && typeof cached.expiry === 'number') return cached;
	} catch (e) { /* no storage, or bad JSON */ }
	return null;
}

function _writeAccountLocaleCache(locale, ttl) {
	try {
		localStorage.setItem(ACCOUNT_LOCALE_CACHE_KEY, JSON.stringify({ locale, expiry: Date.now() + ttl }));
	} catch (e) { /* storage blocked */ }
}

// Record the account locale as the account reports it (e.g. from GET /api/account_profile).
function writeAccountLocale(locale) {
	if (locale && typeof locale === 'string') _writeAccountLocaleCache(locale, ACCOUNT_LOCALE_TTL);
}

// Refetch the account locale once the cache has expired. Deliberately not on every load: right
// after a language change the GET can briefly still return the old locale, while the PUT watcher
// has already written the new one. Call it from one world only.
async function refreshAccountLocale() {
	const cached = _readAccountLocaleCache();
	if (cached && Date.now() < cached.expiry) return;
	// Claim the refresh first, so the other extension's content script doesn't fetch it too.
	_writeAccountLocaleCache(cached?.locale ?? null, ACCOUNT_LOCALE_CLAIM);
	try {
		const response = await fetch('/api/account_profile');
		if (response.ok) writeAccountLocale((await response.json()).locale);
	} catch (e) {
		(globalThis.createLogger?.('i18n') ?? console).error('Failed to fetch account locale:', e);
	}
}

// The account locale in claude.ai's own form (en-US, ja-JP, ...), e.g. for completion requests.
// Unlike currentLocale() this ignores the extension language override.
function accountLocale() {
	const cached = _readAccountLocaleCache()?.locale;
	if (ACCOUNT_LOCALES.includes(cached)) return cached;
	const browser = globalThis.navigator?.language;
	return ACCOUNT_LOCALES.includes(browser) ? browser : 'en-US';
}

function getLanguageOverride() {
	try {
		return localStorage.getItem(I18N_OVERRIDE_KEY) || '';
	} catch (e) {
		return '';
	}
}

// '' clears the override (follow the account language). The caller reloads the page.
function setLanguageOverride(value) {
	try {
		if (value) localStorage.setItem(I18N_OVERRIDE_KEY, normalizeLocale(value));
		else localStorage.removeItem(I18N_OVERRIDE_KEY);
	} catch (e) { /* storage blocked - the account language stays in effect */ }
}

function _resolveLocale() {
	const override = getLanguageOverride();
	if (override) return normalizeLocale(override);
	// Expiry deliberately ignored: an expired entry is still a better guess than navigator.language,
	// and refreshAccountLocale() updates it for the next load.
	const cached = _readAccountLocaleCache()?.locale;
	return normalizeLocale(cached || globalThis.navigator?.language);
}

let _i18nLocale = null;

// Resolved on first use rather than at load, so a context without claude.ai's localStorage (a
// background script importing this file for translate()) never touches it.
function currentLocale() {
	return _i18nLocale ??= _resolveLocale();
}

// For contexts that can't see claude.ai's localStorage (an extension popup): use the locale a
// content script stored for them, so localize() works there too.
function pinLocale(locale) {
	_i18nLocale = normalizeLocale(locale);
	_numberFormat = null;
}

function _lookup(locale, key, vars) {
	const tables = globalThis.CLAUDE_EXT_I18N || {};
	let str = tables[locale]?.[key] ?? tables.en?.[key] ?? key;
	if (vars) {
		// Function replace, so a '$' in a value is never read as a replacement pattern.
		str = str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
	}
	return str;
}

/**
 * Look up a UI string for an explicit locale. Falls back to English, then to the key itself.
 * @param {string} locale - Any language tag, normalized with normalizeLocale()
 * @param {string} key - Dotted key, e.g. 'shared.cancel'
 * @param {Object} [vars] - Values for {name} placeholders
 */
function translate(locale, key, vars) {
	return _lookup(normalizeLocale(locale), key, vars);
}

// Look up a UI string in the current language.
function localize(key, vars) {
	return _lookup(currentLocale(), key, vars);
}

let _numberFormat = null;
function fmtNum(n) {
	return (_numberFormat ??= new Intl.NumberFormat(currentLocale())).format(Number(n));
}

// Declarations above are only globals in a classic script. Publish the public ones explicitly as
// well, so an ES module (a background service worker) can use this file through a side-effect
// import. Keep this list in sync with the public functions above.
Object.assign(globalThis, {
	I18N_LOCALES, LANGUAGE_NATIVE_NAMES, normalizeLocale, writeAccountLocale, refreshAccountLocale,
	accountLocale, getLanguageOverride, setLanguageOverride, currentLocale, pinLocale, translate,
	localize, fmtNum,
});
