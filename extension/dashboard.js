/* global UsageData, isPeakHours, localize, setLocaleOverride */
'use strict';

const LIMIT_LABEL_KEYS = {
	session: 'usage.label_session',
	weekly: 'usage.label_weekly',
	sonnetWeekly: 'usage.label_sonnet_weekly',
	opusWeekly: 'usage.label_opus_weekly'
};

const SHORT_LABELS = {
	session: 'Session',
	weekly: 'Weekly',
	sonnetWeekly: 'Sonnet',
	opusWeekly: 'Opus'
};

const WARNING_THRESHOLD = 0.9;
const noteSaveTimers = new Map(); // orgId -> timeout handle

function colorForPct(pct) {
	if (pct >= 100) return 'var(--red)';
	if (pct >= WARNING_THRESHOLD * 100) return 'var(--amber)';
	return 'var(--green)';
}

function formatResetTime(timestamp) {
	if (!timestamp) return '';
	const diff = timestamp - Date.now();
	if (diff <= 0) return 'Resetting…';

	const hours = Math.floor(diff / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

	const resetDate = new Date(timestamp);
	const timeStr = resetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

	if (hours >= 24) {
		const days = Math.floor(hours / 24);
		const remainingHours = hours % 24;
		return `Resets in ${days}d ${remainingHours}h · ${timeStr}`;
	}
	if (hours === 0) return `Resets in ${minutes}m · ${timeStr}`;
	return `Resets in ${hours}h ${minutes}m · ${timeStr}`;
}

function initials(text) {
	if (!text) return '?';
	const cleaned = text.replace(/@.*/, '');
	const parts = cleaned.split(/[.\s_-]+/).filter(Boolean);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	return cleaned.substring(0, 2).toUpperCase();
}

function overallStatus(activeLimits) {
	if (activeLimits.length === 0) return { label: 'No active limits', cls: 'badge-ok' };
	const maxPct = Math.max(...activeLimits.map(l => l.percentage));
	if (maxPct >= 100) return { label: 'Limit hit', cls: 'badge-maxed' };
	if (maxPct >= WARNING_THRESHOLD * 100) return { label: 'Near limit', cls: 'badge-warn' };
	return { label: 'Active', cls: 'badge-ok' };
}

function buildMeter(key, limit) {
	const wrap = document.createElement('div');

	const label = document.createElement('div');
	label.className = 'meter-label';
	const name = document.createElement('span');
	name.textContent = (LIMIT_LABEL_KEYS[key] && typeof localize === 'function')
		? (localize(LIMIT_LABEL_KEYS[key]) || SHORT_LABELS[key] || key)
		: (SHORT_LABELS[key] || key);
	const pct = document.createElement('span');
	pct.className = 'meter-pct';
	pct.textContent = `${limit.percentage.toFixed(0)}%`;
	pct.style.color = colorForPct(limit.percentage);
	label.appendChild(name);
	label.appendChild(pct);

	const track = document.createElement('div');
	track.className = 'bar-track';
	const fill = document.createElement('div');
	fill.className = 'bar-fill';
	fill.style.width = `${Math.min(limit.percentage, 100)}%`;
	fill.style.background = colorForPct(limit.percentage);
	track.appendChild(fill);

	const reset = document.createElement('div');
	reset.className = 'reset-text';
	reset.dataset.resetsAt = limit.resetsAt || '';
	reset.textContent = formatResetTime(limit.resetsAt);

	wrap.appendChild(label);
	wrap.appendChild(track);
	wrap.appendChild(reset);
	return wrap;
}

async function saveNote(orgId, note) {
	await chrome.runtime.sendMessage({ type: 'setAccountNote', orgId, note });
}

async function saveNickname(orgId, nickname) {
	await chrome.runtime.sendMessage({ type: 'setAccountNickname', orgId, nickname });
}

function debounceSave(map, key, fn) {
	if (map.has(key)) clearTimeout(map.get(key));
	const handle = setTimeout(fn, 600);
	map.set(key, handle);
}

async function buildAccountCard(orgResult) {
	const { orgId, orgName, email, usageData: usageJSON } = orgResult;
	const usageData = new UsageData(usageJSON);
	const activeLimits = usageData.getActiveLimits();

	const card = document.createElement('div');
	card.className = 'account-card';

	// --- top row ---
	const top = document.createElement('div');
	top.className = 'card-top';

	const avatar = document.createElement('div');
	avatar.className = 'avatar';
	avatar.textContent = initials(email || orgName || orgId);

	const meta = document.createElement('div');
	meta.className = 'card-meta';

	const nicknameInput = document.createElement('input');
	nicknameInput.className = 'nickname-input';
	nicknameInput.type = 'text';
	nicknameInput.placeholder = orgName || 'Account';
	const storedNickname = await chrome.runtime.sendMessage({ type: 'getAccountNickname', orgId });
	nicknameInput.value = storedNickname || '';
	nicknameInput.addEventListener('input', () => {
		debounceSave(noteSaveTimers, `nick_${orgId}`, () => saveNickname(orgId, nicknameInput.value));
	});

	const emailEl = document.createElement('div');
	emailEl.className = 'card-email';
	emailEl.textContent = email || orgName || orgId.substring(0, 16) + '…';

	meta.appendChild(nicknameInput);
	meta.appendChild(emailEl);

	const status = overallStatus(activeLimits);
	const badge = document.createElement('span');
	badge.className = `status-badge ${status.cls}`;
	badge.textContent = status.label;

	top.appendChild(avatar);
	top.appendChild(meta);
	top.appendChild(badge);
	card.appendChild(top);

	// --- meters ---
	if (activeLimits.length > 0) {
		const meters = document.createElement('div');
		meters.className = 'meters';
		for (const limit of activeLimits) {
			meters.appendChild(buildMeter(limit.key, limit));
		}
		card.appendChild(meters);
	} else {
		const empty = document.createElement('div');
		empty.className = 'dash-empty';
		empty.style.padding = '8px 0';
		empty.textContent = 'No active limits right now.';
		card.appendChild(empty);
	}

	// --- note area ---
	const noteArea = document.createElement('div');
	noteArea.className = 'note-area';

	const noteLabel = document.createElement('div');
	noteLabel.className = 'note-label';
	noteLabel.innerHTML = `📝 Note for when this resets <span class="note-saved" id="saved-${orgId}">Saved</span>`;

	const noteInput = document.createElement('textarea');
	noteInput.className = 'note-input';
	noteInput.placeholder = 'e.g. Continue the AI Palette GTM strategy, finish slide 7…';
	const storedNote = await chrome.runtime.sendMessage({ type: 'getAccountNote', orgId });
	noteInput.value = storedNote || '';

	noteInput.addEventListener('input', () => {
		debounceSave(noteSaveTimers, `note_${orgId}`, async () => {
			await saveNote(orgId, noteInput.value);
			const savedEl = document.getElementById(`saved-${orgId}`);
			if (savedEl) {
				savedEl.classList.add('show');
				setTimeout(() => savedEl.classList.remove('show'), 1500);
			}
		});
	});

	noteArea.appendChild(noteLabel);
	noteArea.appendChild(noteInput);
	card.appendChild(noteArea);

	return card;
}

async function loadDashboard() {
	const container = document.getElementById('accounts-container');

	try {
		const stored = await browser.storage.local.get('lastLang');
		if (typeof setLocaleOverride === 'function') setLocaleOverride(stored.lastLang || 'en');

		const results = await chrome.runtime.sendMessage({ type: 'getPopupUsageData' });

		if (!results || results.length === 0) {
			container.innerHTML = '<div class="dash-empty">No Claude accounts detected yet. Open claude.ai in a tab and send a message, then refresh.</div>';
			return;
		}

		const validResults = results.filter(r => !r.error);
		if (validResults.length === 0) {
			container.innerHTML = '<div class="dash-empty">Couldn\'t load account data. Try refreshing.</div>';
			return;
		}

		container.innerHTML = '';
		for (const orgResult of validResults) {
			container.appendChild(await buildAccountCard(orgResult));
		}

		// Live-update reset countdowns every 30s without a full reload
		setInterval(() => {
			document.querySelectorAll('[data-resets-at]').forEach(el => {
				const resetsAt = parseInt(el.dataset.resetsAt);
				if (resetsAt) el.textContent = formatResetTime(resetsAt);
			});
		}, 30000);
	} catch (error) {
		console.error('Error loading dashboard:', error);
		container.innerHTML = '<div class="dash-empty">Failed to load usage data.</div>';
	}
}

document.getElementById('refresh-btn').addEventListener('click', () => {
	document.getElementById('accounts-container').innerHTML = '<div class="dash-loading">Refreshing…</div>';
	loadDashboard();
});

document.getElementById('add-account-btn').addEventListener('click', () => {
	chrome.tabs.create({ url: 'https://claude.ai/login' });
});

loadDashboard();
