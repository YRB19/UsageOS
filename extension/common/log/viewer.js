// viewer.js (claude-ext-common)
// The debug-log viewer (viewer.html): shows the extension's chrome.storage.local 'debug_logs', written
// by common/log/logger.js. Opened in a tab, or in an in-page overlay by openDebugLogs(). An extension
// page can't see claude.ai's localStorage, so the UI language comes from the ?lang= parameter.
'use strict';

pinLocale(new URLSearchParams(location.search).get('lang') || navigator.language);

const storage = (globalThis.browser ?? globalThis.chrome).storage.local;
const els = Object.fromEntries(['title', 'search', 'level', 'sender', 'copy', 'clear', 'count', 'logs']
	.map(id => [id, document.getElementById(id)]));

document.title = localize('shared.logs.title');
els.title.textContent = localize('shared.logs.title');
els.search.placeholder = localize('shared.search_placeholder');
els.level.options[0].textContent = localize('shared.logs.all_levels');
els.copy.textContent = localize('shared.logs.copy');
els.clear.textContent = localize('shared.logs.clear');

let entries = [];

// Older entries (from before the shared logger) have a locale time string instead of an ISO timestamp.
function formatTime(timestamp) {
	const date = new Date(timestamp);
	if (isNaN(date)) return String(timestamp ?? '');
	return date.toLocaleString(currentLocale(), {
		month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
		fractionalSecondDigits: 3, hour12: false,
	});
}

function filtered() {
	const query = els.search.value.trim().toLowerCase();
	const level = els.level.value;
	const sender = els.sender.value;
	return entries.filter(e =>
		(!level || e.level === level) &&
		(!sender || e.sender === sender) &&
		(!query || `${e.sender} ${e.message}`.toLowerCase().includes(query)));
}

function updateSenders() {
	const current = els.sender.value;
	const senders = [...new Set(entries.map(e => e.sender))].sort();
	els.sender.replaceChildren(new Option(localize('shared.logs.all_sources'), ''), ...senders.map(s => new Option(s, s)));
	els.sender.value = senders.includes(current) ? current : '';
}

function render() {
	const shown = filtered();
	const atBottom = els.logs.scrollHeight - els.logs.scrollTop - els.logs.clientHeight < 40;

	if (!shown.length) {
		const empty = document.createElement('div');
		empty.className = 'empty';
		empty.textContent = localize('shared.logs.empty');
		els.logs.replaceChildren(empty);
	} else {
		els.logs.replaceChildren(...shown.map(e => {
			const line = document.createElement('div');
			line.className = 'line';
			line.dataset.level = e.level || 'debug';
			const time = document.createElement('span');
			time.className = 'time';
			time.textContent = formatTime(e.timestamp);
			const sender = document.createElement('span');
			sender.className = 'sender';
			sender.textContent = e.sender;
			const message = document.createElement('span');
			message.className = 'message';
			message.textContent = e.message;
			line.append(time, sender, message);
			return line;
		}));
	}
	els.count.textContent = localize('shared.logs.count', { shown: shown.length, total: entries.length });
	// Follow new entries, unless the user has scrolled up to read something.
	if (atBottom) els.logs.scrollTop = els.logs.scrollHeight;
}

async function load() {
	const { debug_logs: logs = [] } = await storage.get('debug_logs');
	if (logs.length === entries.length && logs.at(-1)?.timestamp === entries.at(-1)?.timestamp) return;
	entries = logs;
	updateSenders();
	render();
}

els.search.addEventListener('input', render);
els.level.addEventListener('change', render);
els.sender.addEventListener('change', render);

els.copy.addEventListener('click', async () => {
	const text = filtered().map(e => `${e.timestamp} [${e.level}] [${e.sender}] ${e.message}`).join('\n');
	await navigator.clipboard.writeText(text);
	els.copy.textContent = localize('shared.logs.copied');
	setTimeout(() => { els.copy.textContent = localize('shared.logs.copy'); }, 1500);
});

// Through the background, which owns debug_logs (common/log/logger.js): a direct write could race an
// append in progress and bring the old entries back. Direct only if no background answers.
els.clear.addEventListener('click', async () => {
	try {
		await (globalThis.browser ?? globalThis.chrome).runtime.sendMessage({ type: 'CLAUDE_EXT_LOG_CLEAR' });
	} catch (e) {
		await storage.set({ debug_logs: [], debug_logs_cleared_at: new Date().toISOString() });
	}
	entries = [];
	updateSenders();
	render();
});

// The logger flushes about once a second; re-read while the page is visible.
load();
setInterval(() => { if (!document.hidden) load(); }, 2000);
