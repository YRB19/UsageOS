/* global browser */
'use strict';

const LIMIT_KEYS = ['session', 'weekly', 'sonnetWeekly', 'opusWeekly', 'fableWeekly'];
const LIMIT_LABELS = {
	session: 'Session (5h)',
	weekly: 'Weekly (All Models)',
	sonnetWeekly: 'Weekly (Sonnet)',
	opusWeekly: 'Weekly (Opus)',
	fableWeekly: 'Weekly (Fable)'
};

let accountsData = [];
let notesDebounceTimers = {};

document.addEventListener('DOMContentLoaded', initDashboard);

async function initDashboard() {
	document.getElementById('refresh-btn').addEventListener('click', loadAccounts);
	document.getElementById('open-options').addEventListener('click', () => {
		browser.runtime.openOptionsPage();
	});
	await loadAccounts();
	await loadAllNicknames();
	startCountdownTimers();
}

async function loadAccounts() {
	const main = document.getElementById('main-content');
	main.innerHTML = `
		<div class="loading-state">
			<span class="loading-spinner"></span> Loading accounts...
		</div>
	`;

	try {
		const response = await browser.runtime.sendMessage({ type: 'getPopupUsageData' });
		accountsData = response || [];
		renderAccounts();
		await loadAllNicknames();
	} catch (err) {
		main.innerHTML = `
			<div class="error-state">
				<h2>Failed to load accounts</h2>
				<p>${err.message}</p>
				<button class="btn btn-primary" id="retry-btn">Retry</button>
			</div>
		`;
		document.getElementById('retry-btn').addEventListener('click', loadAccounts);
	}
}

function renderAccounts() {
	const main = document.getElementById('main-content');

	if (!accountsData.length) {
		main.innerHTML = `
			<div class="empty-state">
				<div class="empty-state-icon">📭</div>
				<h2>No accounts found</h2>
				<p>Open Claude.ai in your browser to start tracking usage.</p>
				<button class="btn btn-primary" id="refresh-btn-empty">Refresh</button>
			</div>
		`;
		document.getElementById('refresh-btn-empty').addEventListener('click', loadAccounts);
		return;
	}

	main.innerHTML = '<div class="accounts-grid" id="accounts-grid"></div>';
	const grid = document.getElementById('accounts-grid');

	for (const account of accountsData) {
		const card = createAccountCard(account);
		grid.appendChild(card);
	}
}

function createAccountCard(account) {
	const card = document.createElement('div');
	card.className = `account-card${account.error ? ' unavailable' : ''}`;
	card.dataset.orgId = account.orgId;

	if (account.error) {
		card.innerHTML = createUnavailableAccountHTML(account);
		return card;
	}

	const nickname = getNickname(account.orgId) || '';
	const email = account.email || 'Unknown email';
	const usageData = account.usageData;
	const orgName = account.orgName || account.orgId;

	card.innerHTML = `
		<div class="account-header">
			<div class="account-avatar">${escapeHtml(getInitials(orgName))}</div>
			<div class="account-info">
				<div class="account-name-row">
					<h3 class="account-nickname" data-org-id="${account.orgId}" data-has-nickname="${nickname ? 'true' : 'false'}">${escapeHtml(nickname || orgName)}</h3>
					<span class="status-badge ${getStatusClass(usageData)}">
						<span class="status-dot"></span> ${getStatusText(usageData)}
					</span>
				</div>
				<p class="account-email">${escapeHtml(email)}</p>
			</div>
		</div>
		${createUsageHTML(usageData)}
		${createNotesHTML(account.orgId)}
	`;

	attachCardListeners(card, account.orgId, orgName, nickname);
	return card;
}

function createUnavailableAccountHTML(account) {
	const orgName = account.orgName || account.orgId;
	const email = account.email || 'Unknown email';
	return `
		<div class="account-header">
			<div class="account-avatar">${escapeHtml(getInitials(orgName))}</div>
			<div class="account-info">
				<div class="account-name-row">
					<h3 class="account-nickname">${escapeHtml(orgName)}</h3>
					<span class="status-badge gray">
						<span class="status-dot"></span> Unavailable
					</span>
				</div>
				<p class="account-email">${escapeHtml(email)}</p>
			</div>
		</div>
		<div style="color: var(--text-muted); font-size: 13px; padding: 12px; background: var(--bg-tertiary); border-radius: 6px;">
			${escapeHtml(account.error)}
		</div>
	`;
}

function createUsageHTML(usageData) {
	if (!usageData || !usageData.limits) {
		return '<div class="usage-section"><h4>Usage</h4><p style="color: var(--text-muted);">No usage data available</p></div>';
	}

	const activeLimits = Object.entries(usageData.limits)
		.filter(([_, limit]) => limit !== null)
		.map(([key, limit]) => ({ key, ...limit }));

	if (activeLimits.length === 0) {
		return '<div class="usage-section"><h4>Usage</h4><p style="color: var(--text-muted);">No active limits</p></div>';
	}

	let html = '<div class="usage-section"><h4>Usage Limits</h4>';
	for (const limit of activeLimits) {
		html += createLimitRowHTML(limit);
	}
	html += '</div>';
	return html;
}

function createLimitRowHTML(limit) {
	const pct = limit.percentage ?? 0;
	const pctClass = getPercentageClass(pct);
	const label = LIMIT_LABELS[limit.key] || limit.key;
	const resetHtml = limit.resetsAt
		? `<div class="limit-reset" data-resets-at="${limit.resetsAt}">${formatResetTime(limit.resetsAt)}</div>`
		: '';

	return `
		<div class="limit-row">
			<div class="limit-header">
				<span class="limit-label">${escapeHtml(label)}</span>
				<span class="limit-percentage ${pctClass}">${pct.toFixed(0)}%</span>
			</div>
			<div class="progress-track">
				<div class="progress-bar ${pctClass}" style="width: ${Math.min(pct, 100)}%"></div>
			</div>
			${resetHtml}
		</div>
	`;
}

function createNotesHTML(orgId) {
	let note = '';
	try {
		note = localStorage.getItem(`usageos_note_${orgId}`) || '';
	} catch (e) {
		note = '';
	}

	return `
		<div class="notes-section">
			<label class="notes-label">Notes</label>
			<textarea class="notes-textarea" data-org-id="${orgId}" placeholder="Add notes for this account... (auto-saves)">${escapeHtml(note)}</textarea>
			<div class="notes-saved-indicator" data-org-id="${orgId}">Saved</div>
		</div>
	`;
}

function attachCardListeners(card, orgId, orgName, currentNickname) {
	const nicknameEl = card.querySelector('.account-nickname');
	if (nicknameEl) {
		nicknameEl.addEventListener('click', () => startEditingNickname(nicknameEl, orgId, orgName));
	}

	const notesTextarea = card.querySelector('.notes-textarea');
	if (notesTextarea) {
		notesTextarea.addEventListener('input', () => scheduleNoteSave(orgId, notesTextarea));
	}
}

function startEditingNickname(nicknameEl, orgId, orgName) {
	const currentNickname = nicknameEl.dataset.hasNickname === 'true' ? nicknameEl.textContent : '';
	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'account-nickname-input';
	input.value = currentNickname;
	input.placeholder = orgName;
	input.dataset.orgId = orgId;

	const finish = async () => {
		const newNickname = input.value.trim();
		input.remove();
		nicknameEl.style.display = '';

		if (newNickname) {
			nicknameEl.textContent = newNickname;
			nicknameEl.dataset.hasNickname = 'true';
		} else {
			nicknameEl.textContent = orgName;
			nicknameEl.dataset.hasNickname = 'false';
		}
		await saveNickname(orgId, newNickname);
	};

	nicknameEl.style.display = 'none';
	nicknameEl.parentNode.insertBefore(input, nicknameEl.nextSibling);
	input.focus();
	input.select();

	input.addEventListener('blur', finish);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') finish();
		if (e.key === 'Escape') {
			input.remove();
			nicknameEl.style.display = '';
		}
	});
}

function scheduleNoteSave(orgId, textarea) {
	clearTimeout(notesDebounceTimers[orgId]);
	notesDebounceTimers[orgId] = setTimeout(() => saveNote(orgId, textarea), 600);
}

async function saveNote(orgId, textarea) {
	const note = textarea.value;
	try {
		await browser.storage.local.set({ [`usageos_note_${orgId}`]: note });
		showSavedIndicator(orgId);
	} catch (e) {
		localStorage.setItem(`usageos_note_${orgId}`, note);
		showSavedIndicator(orgId);
	}
}

function showSavedIndicator(orgId) {
	const indicator = document.querySelector(`.notes-saved-indicator[data-org-id="${orgId}"]`);
	if (indicator) {
		indicator.classList.add('visible');
		setTimeout(() => indicator.classList.remove('visible'), 2000);
	}
}

async function saveNickname(orgId, nickname) {
	try {
		await browser.storage.sync.set({ [`accountNickname_${orgId}`]: nickname });
	} catch (e) {
		try {
			await browser.storage.local.set({ [`accountNickname_${orgId}`]: nickname });
		} catch (e2) {
			localStorage.setItem(`accountNickname_${orgId}`, nickname);
		}
	}
}

async function loadAllNicknames() {
	for (const account of accountsData) {
		if (account.error) continue;
		let nickname = '';
		try {
			const result = await browser.storage.sync.get(`accountNickname_${account.orgId}`);
			nickname = result[`accountNickname_${account.orgId}`] || '';
		} catch (e) {
			try {
				const result = await browser.storage.local.get(`accountNickname_${account.orgId}`);
				nickname = result[`accountNickname_${account.orgId}`] || '';
			} catch (e2) {
				nickname = localStorage.getItem(`accountNickname_${account.orgId}`) || '';
			}
		}
		const nicknameEl = document.querySelector(`.account-nickname[data-org-id="${account.orgId}"]`);
		if (nicknameEl && nickname) {
			nicknameEl.textContent = nickname;
			nicknameEl.dataset.hasNickname = 'true';
		}
	}
}

function getStatusClass(usageData) {
	if (!usageData || !usageData.limits) return 'gray';
	const maxPct = Math.max(...Object.values(usageData.limits)
		.filter(l => l !== null)
		.map(l => l.percentage ?? 0), 0);
	if (maxPct >= 100) return 'red';
	if (maxPct >= 80) return 'amber';
	return 'green';
}

function getStatusText(usageData) {
	if (!usageData || !usageData.limits) return 'Unknown';
	const maxPct = Math.max(...Object.values(usageData.limits)
		.filter(l => l !== null)
		.map(l => l.percentage ?? 0), 0);
	if (maxPct >= 100) return 'At Limit';
	if (maxPct >= 80) return 'High Usage';
	return 'Normal';
}

function getPercentageClass(pct) {
	if (pct >= 100) return 'red';
	if (pct >= 80) return 'amber';
	return 'green';
}

function getInitials(name) {
	return name
		.split(/\s+/)
		.map(w => w[0])
		.slice(0, 2)
		.join('')
		.toUpperCase() || '?';
}

function getNickname(orgId) {
	return localStorage.getItem(`accountNickname_${orgId}`) || '';
}

function formatResetTime(timestamp) {
	const diff = timestamp - Date.now();
	if (diff <= 0) return 'Resetting...';
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
	if (hours >= 24) {
		const days = Math.floor(hours / 24);
		const remHours = hours % 24;
		return `${days}d ${remHours}h`;
	}
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

function startCountdownTimers() {
	setInterval(() => {
		document.querySelectorAll('[data-resets-at]').forEach(el => {
			const resetsAt = parseInt(el.dataset.resetsAt);
			if (resetsAt) el.textContent = formatResetTime(resetsAt);
		});
	}, 30000);
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}