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
let chartInstance = null;
let nicknameCache = {};

document.addEventListener('DOMContentLoaded', initDashboard);

async function initDashboard() {
	loadChartJS().then(() => {
		document.getElementById('refresh-btn').addEventListener('click', loadAccounts);
		document.getElementById('open-options').addEventListener('click', () => {
			browser.runtime.openOptionsPage();
		});
		document.getElementById('back-btn').addEventListener('click', showListView);
		loadAccounts();
		loadAllNicknames();
		startCountdownTimers();
	});
}

function loadChartJS() {
	if (window.Chart) return Promise.resolve();
	// Chart.js is already loaded via <script src="lib/chart.umd.min.js"> in HTML
	return Promise.resolve();
}

async function loadAccounts() {
	const listView = document.getElementById('list-view');
	listView.innerHTML = `
		<div class="accounts-grid" id="accounts-grid">
			<div class="loading-state">
				<span class="loading-spinner"></span> Loading accounts...
			</div>
		</div>
	`;

	try {
		let response = await browser.runtime.sendMessage({ type: 'getPopupUsageData' });
		console.log('[Dashboard] getPopupUsageData response:', response);
		
		// Fallback: if popup usage data fails (e.g., no active tabs), try direct backend fetch
		if (!response || !response.length) {
			console.log('[Dashboard] Falling back to getAllAccountsFromBackend');
			const fallback = await browser.runtime.sendMessage({ type: 'getAllAccountsFromBackend' });
			console.log('[Dashboard] Fallback response:', fallback);
			if (fallback.ok && fallback.data) {
				// Convert backend format to popup format
				response = fallback.data.map(acc => ({
					orgId: acc.org_id,
					orgName: acc.nickname || acc.email,
					email: acc.email,
					usageData: {
						limits: (acc.limits || []).reduce((obj, lim) => {
							obj[lim.limit_type] = {
								percentage: lim.usage_pct,
								resetsAt: lim.resets_at ? new Date(lim.resets_at).getTime() : null
							};
							return obj;
						}, {})
					},
					subscriptionTier: acc.subscription_tier
				}));
				console.log('[Dashboard] Converted response:', response);
			}
		}
		
		accountsData = response || [];
		console.log('[Dashboard] Final accountsData:', accountsData);
		renderAccounts();
		await loadAllNicknames();
	} catch (err) {
		console.error('[Dashboard] loadAccounts error:', err);
		const listView = document.getElementById('list-view');
		listView.innerHTML = `
			<div class="accounts-grid" id="accounts-grid">
				<div class="error-state">
					<h2>Failed to load accounts</h2>
					<p>${escapeHtml(err.message)}</p>
					<button class="btn btn-primary" id="retry-btn">Retry</button>
				</div>
			</div>
		`;
		document.getElementById('retry-btn').addEventListener('click', loadAccounts);
	}
}

function renderAccounts() {
	const grid = document.getElementById('accounts-grid');
	console.log('[Dashboard] renderAccounts called, accountsData:', accountsData);
	if (!grid) {
		console.error('[Dashboard] accounts-grid element not found!');
		return;
	}

	if (!accountsData.length) {
		grid.innerHTML = `
			<div class="empty-state">
				<div class="empty-state-icon">&#9889;</div>
				<h2>No accounts found</h2>
				<p>Open Claude.ai in your browser to start tracking usage.</p>
				<button class="btn btn-primary" id="refresh-btn-empty">Refresh</button>
			</div>
		`;
		document.getElementById('refresh-btn-empty').addEventListener('click', loadAccounts);
		return;
	}

	grid.innerHTML = '';
	for (let i = 0; i < accountsData.length; i++) {
		const card = createAccountCard(accountsData[i]);
		card.style.animationDelay = `${i * 0.05}s`;
		grid.appendChild(card);
	}
	console.log('[Dashboard] Rendered', accountsData.length, 'cards');
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
			<div class="account-avatar" style="background: ${getAccountColor(account.orgId)}">${escapeHtml(getInitials(orgName))}</div>
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

	// Make card clickable for detail view (except on nickname/notes)
	card.addEventListener('click', (e) => {
		const target = e.target.closest('.account-nickname, .account-nickname-input, .notes-textarea');
		if (!target) {
			showDetailView(account);
		}
	});

	attachCardListeners(card, account.orgId, orgName, nickname);
	return card;
}

async function showDetailView(account) {
	const detailView = document.getElementById('detail-view');
	const listView = document.getElementById('list-view');

	// Show loading
	detailView.innerHTML = `
		<div class="detail-header">
			<button class="btn" id="back-btn">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
				Back
			</button>
			<div class="detail-account-info">
				<div class="detail-avatar" id="detail-avatar" style="background: ${getAccountColor(account.orgId)}">${escapeHtml(getInitials(account.orgName || account.orgId))}</div>
				<div>
					<h2 class="detail-nickname" id="detail-nickname">${escapeHtml(getNickname(account.orgId) || account.orgName || account.orgId)}</h2>
					<p class="detail-email" id="detail-email">${escapeHtml(account.email || 'Unknown')}</p>
				</div>
			</div>
	`;
	detailView.querySelector('#back-btn').addEventListener('click', showListView);

	detailView.classList.remove('hidden');
	document.getElementById('list-view').classList.add('hidden');

	// Show loading in detail content
	const detailContent = document.createElement('div');
	detailContent.className = 'detail-content';
	detailContent.innerHTML = `
		<div class="loading-state" style="padding: 60px 20px;">
			<span class="loading-spinner"></span> Loading history...
		</div>
	`;
	detailView.appendChild(detailContent);

	// Fetch history
	try {
		const response = await browser.runtime.sendMessage({
			type: 'getAccountHistory',
			orgId: account.orgId
		});

		if (!response || !response.data || !response.data.length) {
			detailView.querySelector('.detail-content').innerHTML = `
				<div class="loading-state" style="padding: 60px 20px; color: var(--muted);">
					No history data available for this account.
				</div>
			`;
			return;
		}

		renderDetailView(account, response.data);
	} catch (err) {
		console.error('Failed to load history:', err);
		detailView.querySelector('.detail-content').innerHTML = `
			<div class="error-state" style="padding: 60px 20px;">
				<h2>Failed to load history</h2>
				<p>${escapeHtml(err.message)}</p>
				<button class="btn btn-primary" onclick="showDetailView(${JSON.stringify(account).replace(/"/g, '"')})">Retry</button>
			</div>
		`;
	}
}

function renderDetailView(account, history) {
	const detailView = document.getElementById('detail-view');
	const nick = getNickname(account.orgId) || account.orgName || account.orgId;

	// Build stats cards from latest sync
	const latest = history[0];
	let statsHTML = '';
	if (latest && latest.limits) {
		const limitKeys = ['session', 'weekly', 'sonnet_weekly', 'opus_weekly'];
		for (const key of limitKeys) {
			const data = latest.limits[key];
			if (!data || data.usage_pct === null) continue;
			const pct = data.usage_pct;
			const pctClass = getPercentageClass(pct);
			const label = LIMIT_LABELS[key] || key.replace('_', ' ');
			const reset = data.resets_at ? `<div class="detail-stat-reset">resets in ${formatResetTime(new Date(data.resets_at).getTime())}</div>` : '';
			statsHTML += `
				<div class="detail-stat-card">
					<div class="detail-stat-label">${label}</div>
					<div class="detail-stat-value ${pctClass}">${pct.toFixed(1)}%</div>
					${reset}
				</div>
			`;
		}
	}

	// Prepare chart data
	const limitTypes = ['session', 'weekly', 'sonnet_weekly', 'opus_weekly'];
	const chartData = {};
	for (const type of limitTypes) {
		chartData[type] = history
			.filter(h => h.limits?.[type]?.usage_pct !== null && h.limits?.[type]?.usage_pct !== undefined)
			.map(h => ({
				time: h.timestamp,
				value: h.limits[type].usage_pct
			}))
			.reverse(); // Chart.js wants oldest first
	}

	const detailContent = detailView.querySelector('.detail-content');
	detailContent.innerHTML = `
		<div class="detail-stats" id="detail-stats">${statsHTML || '<div class="detail-stat-card"><div class="detail-stat-label">No data</div></div>'}</div>
		<div class="detail-chart-container">
			<canvas id="history-chart"></canvas>
		</div>
	`;

	// Render chart
	renderHistoryChart(chartData);
}

function renderHistoryChart(chartData) {
	const ctx = document.getElementById('history-chart');
	if (!ctx) return;

	if (chartInstance) {
		chartInstance.destroy();
	}

	const datasets = [];
	const colors = {
		session: '#ff8906',
		weekly: '#6366f1',
		sonnet_weekly: '#8b5cf6',
		opus_weekly: '#e53170'
	};

	const limitTypes = ['session', 'weekly', 'sonnet_weekly', 'opus_weekly'];
	const labels = ['Session (5h)', 'Weekly (All)', 'Weekly (Sonnet)', 'Weekly (Opus)'];

	// Collect all unique timestamps across all limit types
	const allTimes = new Set();
	for (const type of limitTypes) {
		for (const d of chartData[type] || []) {
			allTimes.add(d.time);
		}
	}

	// Sort timestamps and format labels
	const sortedTimes = Array.from(allTimes).sort();
	const timeLabels = sortedTimes.map(t => {
		const d = new Date(t);
		return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	});

	for (let i = 0; i < limitTypes.length; i++) {
		const type = limitTypes[i];
		const data = chartData[type] || [];
		if (data.length < 2) continue;

		// Map data points to the unified time labels
		const mappedData = sortedTimes.map(t => {
			const point = data.find(d => d.time === t);
			return point ? point.value : null;
		});

		datasets.push({
			label: labels[i],
			data: mappedData,
			borderColor: colors[type],
			backgroundColor: colors[type] + '20',
			borderWidth: 2,
			fill: false,
			tension: 0.3,
			pointRadius: 3,
			pointHoverRadius: 5
		});
	}

	if (datasets.length === 0) {
		ctx.parentElement.innerHTML = '<div class="loading-state" style="padding: 60px 20px; color: var(--muted);">Not enough data points for chart (need 2+ syncs)</div>';
		return;
	}

	chartInstance = new Chart(ctx, {
		type: 'line',
		data: { labels: timeLabels, datasets },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: 'index', intersect: false },
			plugins: {
				legend: {
					display: true,
					position: 'top',
					labels: {
						color: '#a7a9be',
						font: { family: 'Inter', size: 11 },
						padding: 16,
						usePointStyle: true,
						pointStyle: 'circle'
					}
				},
				tooltip: {
					backgroundColor: 'rgba(31, 41, 55, 0.9)',
					borderColor: 'rgba(55, 65, 81, 0.5)',
					borderWidth: 1,
					padding: 12,
					titleFont: { family: 'Inter', size: 12 },
					bodyFont: { family: 'Inter', size: 11 },
					callbacks: {
						label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`
					}
				}
			},
			scales: {
				x: {
					type: 'category',
					grid: { color: 'rgba(55, 65, 81, 0.3)' },
					ticks: { color: '#a7a9be', font: { family: 'Inter', size: 10 }, maxTicksLimit: 8 }
				},
				y: {
					min: 0,
					max: 100,
					grid: { color: 'rgba(55, 65, 81, 0.3)' },
					ticks: { color: '#a7a9be', font: { family: 'Inter', size: 10 }, callback: v => v + '%' }
				}
			},
			elements: {
				line: { borderWidth: 2 },
				point: { hitRadius: 10 }
			}
		}
	});
	}

function showListView() {
	document.getElementById('detail-view').classList.add('hidden');
	document.getElementById('list-view').classList.remove('hidden');
	if (chartInstance) {
		chartInstance.destroy();
		chartInstance = null;
	}
}

function createUnavailableAccountHTML(account) {
	const orgName = account.orgName || account.orgId;
	const email = account.email || 'Unknown email';
	return `
		<div class="account-header">
			<div class="account-avatar" style="background: var(--muted); opacity: 0.4">${escapeHtml(getInitials(orgName))}</div>
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
		<div style="color: var(--muted); font-size: 12px; padding: 12px; background: rgba(15,14,23,0.4); border-radius: 8px; border: 1px solid var(--border); opacity: 0.6;">
			${escapeHtml(account.error)}
		</div>
	`;
}

function createUsageHTML(usageData) {
	if (!usageData || !usageData.limits) {
		return '<div class="usage-section"><h4>Usage</h4><p style="color: var(--muted); opacity: 0.4; font-size: 12px;">No usage data available</p></div>';
	}

	const activeLimits = Object.entries(usageData.limits)
		.filter(([_, limit]) => limit !== null)
		.map(([key, limit]) => ({ key, ...limit }));

	if (activeLimits.length === 0) {
		return '<div class="usage-section"><h4>Usage</h4><p style="color: var(--muted); opacity: 0.4; font-size: 12px;">No active limits</p></div>';
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
		nicknameEl.addEventListener('click', (e) => {
			e.stopPropagation();
			startEditingNickname(nicknameEl, orgId, orgName);
		});
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

	let finished = false;
	const finish = async () => {
		if (finished) return;
		finished = true;
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
			if (!finished) {
				input.remove();
				nicknameEl.style.display = '';
				finished = true;
			}
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
	// Update cache immediately
	if (nickname) {
		nicknameCache[orgId] = nickname;
	} else {
		delete nicknameCache[orgId];
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
		// Populate cache for synchronous getNickname
		if (nickname) {
			nicknameCache[account.orgId] = nickname;
		}
		const nicknameEl = document.querySelector(`.account-nickname[data-org-id="${account.orgId}"]`);
		if (nicknameEl && nickname) {
			nicknameEl.textContent = nickname;
			nicknameEl.dataset.hasNickname = 'true';
		}
	}
}

const ACCOUNT_COLORS = ['#ff8906', '#f25f4c', '#e53170', '#6366f1', '#8b5cf6', '#22c55e', '#06b6d4', '#eab308'];

function getAccountColor(orgId) {
	let hash = 0;
	for (let i = 0; i < orgId.length; i++) {
		hash = orgId.charCodeAt(i) + ((hash << 5) - hash);
	}
	return ACCOUNT_COLORS[Math.abs(hash) % ACCOUNT_COLORS.length];
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
	return nicknameCache[orgId] || '';
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