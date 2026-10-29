// bridge-isolated.js (claude-ext-common)
// The ISOLATED-world half of ClaudeExtBridge (the MAIN half is bridge-main.js; same API names):
//
//   ClaudeExtBridge.sendBackgroundMessage(app, message)  -> Promise of the background's reply
//   ClaudeExtBridge.serve(app, { handlers, background }) answer the MAIN half for this app
//
// sendBackgroundMessage is runtime.sendMessage, retried while the background is still waking up.
//
// serve() is the security boundary. Page scripts share the MAIN world and can post bridge messages
// too, so it only runs the handlers it was given, and only forwards a MAIN-world background message
// whose `type` is in its `background` allow-list. Everything else gets an error back. If MAIN code
// sends during page load, the script calling serve() must load at document_start.
//
// Each extension has its own ISOLATED world, so nothing here is shared with the other one; the
// VERSION guard just makes loading it twice harmless.
(function () {
	'use strict';

	const VERSION = 1;

	const existing = globalThis.ClaudeExtBridge;
	if (existing && (existing.VERSION ?? 0) >= VERSION) return;
	const bridge = existing ?? (globalThis.ClaudeExtBridge = {});
	bridge.VERSION = VERSION;

	const CHANNEL = 'CLAUDE_EXT_BRIDGE'; // must match bridge-main.js
	const BACKGROUND = '__background';
	const RETRIES = 10;
	const RETRY_DELAY_MS = 200;
	const api = globalThis.browser ?? globalThis.chrome;

	bridge.sendBackgroundMessage = async function (app, message) {
		for (let attempt = 1; ; attempt++) {
			try {
				return await api.runtime.sendMessage(message);
			} catch (e) {
				if (attempt >= RETRIES || !String(e?.message).includes('Receiving end does not exist')) throw e;
				await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
			}
		}
	};

	const served = new Map(); // app -> { handlers, background: Set }

	bridge.serve = function (app, { handlers = {}, background = [] } = {}) {
		let service = served.get(app);
		if (!service) {
			service = { handlers: {}, background: new Set() };
			served.set(app, service);
			window.addEventListener('message', (event) => answer(app, service, event));
		}
		Object.assign(service.handlers, handlers);
		for (const type of background) service.background.add(type);
	};

	async function answer(app, service, event) {
		const data = event.data;
		if (event.source !== window || event.origin !== window.location.origin) return;
		if (data?.channel !== CHANNEL || data.app !== app || typeof data.type !== 'string' || 'reply' in data || 'error' in data) return;
		const respond = (result) => window.postMessage({ channel: CHANNEL, app, id: data.id, ...result }, window.location.origin);
		try {
			let reply;
			if (data.type === BACKGROUND) {
				if (!service.background.has(data.data?.type)) throw new Error(`${data.data?.type} may not be sent to the background from the page`);
				reply = await bridge.sendBackgroundMessage(app, data.data);
			} else if (Object.prototype.hasOwnProperty.call(service.handlers, data.type)) {
				reply = await service.handlers[data.type](data.data);
			} else {
				throw new Error(`no handler for ${data.type}`);
			}
			respond({ reply: reply ?? null });
		} catch (e) {
			respond({ error: String(e?.message ?? e) });
		}
	}
})();
