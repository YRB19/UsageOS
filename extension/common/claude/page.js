// page.js (claude-ext-common)
// What claude.ai page we're on and which org/conversation/project it belongs to. Classic script, no
// IIFE: plain globals of the loading world, so (per the README) only one extension may load it into
// MAIN. Reads only the URL, the lastActiveOrg cookie and sessionStorage - never the DOM, whose
// structure differs between the web UI and the desktop app.

// The org the page is acting as, from claude.ai's lastActiveOrg cookie. Null when logged out.
function getActiveOrgId() {
	for (const cookie of document.cookie.split(';')) {
		const [name, value] = cookie.trim().split('=');
		if (name === 'lastActiveOrg' && value) return value;
	}
	return null;
}

// The conversation in the URL (/chat/<uuid>), or null. Deliberately excludes incognito chats, which
// have no /chat/ URL; see getIncognitoConversationId().
function getConversationId() {
	return location.pathname.match(/\/chat\/([^/?]+)/)?.[1] ?? null;
}

function isIncognito() {
	return new URLSearchParams(location.search).has('incognito');
}

// An incognito chat's temporary conversation, which claude.ai keeps in sessionStorage. Null outside
// incognito, or before the first message creates it.
function getIncognitoConversationId() {
	if (!isIncognito()) return null;
	try {
		return JSON.parse(sessionStorage.getItem('incognito_temporary_conversation_uuid'))?.uuid ?? null;
	} catch (e) {
		return null;
	}
}

function getProjectId() {
	return location.pathname.match(/\/project\/([^/?]+)/)?.[1] ?? null;
}

// ======== Page predicates ========

function isHomePage() {
	return location.pathname === '/new' || location.pathname === '/';
}

function isChatPage() {
	return location.pathname.startsWith('/chat/');
}

function isProjectPage() {
	return getProjectId() !== null;
}

// Claude Code: /code... on the web, /epitaxy... in the desktop app (its /code redirects there).
function isCodePage() {
	return /^\/(code|epitaxy)(\/|$)/.test(location.pathname);
}

// Any Cowork page: sessions (/cowork/cse_..., /cowork/local_...) but also e.g. /cowork/projects.
function isCoworkPage() {
	return location.pathname.startsWith('/cowork/');
}
