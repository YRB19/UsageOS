// bridge-main.js (claude-ext-common)
// The MAIN-world half of ClaudeExtBridge (the ISOLATED half is bridge-isolated.js; same API names):
//
//   ClaudeExtBridge.sendBackgroundMessage(app, message)  -> Promise of the background's reply
//   ClaudeExtBridge.call(app, type, data)                -> Promise of an ISOLATED handler's reply
//
// The MAIN world has no extension APIs, so both post to the same app's ISOLATED world (matched by
// `app`: every extension's ISOLATED world hears the page's messages), where
// ClaudeExtBridge.serve() answers, forwarding background messages only if their type is
// allow-listed there.
//
// Two files rather than one that detects its world: Chrome injects a given file only once per page
// and run_at, across worlds. Both halves load at document_start, so one shared file would only reach
// one of them (it silently skipped MAIN).
//
// Both extensions load this into the shared MAIN world, so like net.js it's an IIFE publishing one
// versioned namespace: the NEWEST copy wins whatever the load order, and callers look members up at
// call time. Bump VERSION with every change; never break older callers.
(function () {
	'use strict';

	const VERSION = 1;

	const existing = globalThis.ClaudeExtBridge;
	if (existing && (existing.VERSION ?? 0) >= VERSION) return;
	const bridge = existing ?? (globalThis.ClaudeExtBridge = {});
	bridge.VERSION = VERSION;

	const CHANNEL = 'CLAUDE_EXT_BRIDGE'; // must match bridge-isolated.js
	const BACKGROUND = '__background';

	const pending = new Map(); // id -> { app, resolve, reject, timer }
	let nextId = 0;
	let listening = false;

	function listenForReplies() {
		if (listening) return;
		listening = true;
		window.addEventListener('message', (event) => {
			const data = event.data;
			if (event.source !== window || data?.channel !== CHANNEL || !('reply' in data || 'error' in data)) return;
			const call = pending.get(data.id);
			if (!call || call.app !== data.app) return;
			pending.delete(data.id);
			clearTimeout(call.timer);
			if ('error' in data) call.reject(new Error(data.error));
			else call.resolve(data.reply);
		});
	}

	bridge.call = function (app, type, data, { timeout = 10000 } = {}) {
		listenForReplies();
		const id = `${app}:${++nextId}:${Math.random().toString(36).slice(2)}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`ClaudeExtBridge: no answer to ${type} from ${app}`));
			}, timeout);
			pending.set(id, { app, resolve, reject, timer });
			window.postMessage({ channel: CHANNEL, app, id, type, data }, window.location.origin);
		});
	};

	bridge.sendBackgroundMessage = function (app, message, { timeout } = {}) {
		return bridge.call(app, BACKGROUND, message, { timeout });
	};
})();
