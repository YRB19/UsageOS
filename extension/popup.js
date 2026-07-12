/* global UsageData, isPeakHours, localize, setLocaleOverride */
'use strict';
let CONFIG;
const GREEN = '#22c55e';
const AMBER = '#ff8906';
const RED = '#f25f4c';
const MUTED = '#a7a9be';
const WARNING_THRESHOLD = 0.9;

const LIMIT_LABEL_KEYS = {
	session: 'usage.label_session',
	weekly: 'usage.label_weekly',
	sonnetWeekly: 'usage.label_sonnet_weekly',
	opusWeekly: 'usage.label_opus_weekly',
	fableWeekly: 'usage.label_fable_weekly',
	extraUsage: 'usage.label_extra'
};

function getPercentageClass(pct) {
	if (pct >= 100) return 'red';
	if (pct >= 80) return 'amber';
	return 'green';
}

function getBarColor(pct) {
	if (pct >= 100) return RED;
	if (pct >= 80) return AMBER;
	return GREEN;
}

function createProgressBar(percentage) {
	const track = document.createElement('div');
	track.className = 'popup-progress-track';

	const bar = document.createElement('div');
	bar.className = `popup-progress-bar ${getPercentageClass(percentage)}`;
	bar.style.width = `${Math.min(percentage, 100)}%`;

	track.appendChild(bar);
	return track;
}

function formatResetTime(timestamp) {
	if (!timestamp) return '';
	const diff = timestamp - Date.now();
	if (diff <= 0) return `<span style="color: ${GREEN}">${localize('common.resetting')}</span>`;

	const hours = Math.floor(diff / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

	if (hours >= 24) {
		const days = Math.floor(hours / 24);
		const remainingHours = hours % 24;
		return localize('time.dh', { d: days, h: remainingHours });
	}
	if (hours === 0) return localize('time.m', { m: minutes });
	return localize('time.hm', { h: hours, m: minutes });
}

function createLimitRow(key, limit) {
	const row = document.createElement('div');
	row.className = 'popup-limit-row';

	const topLine = document.createElement('div');
	topLine.className = 'popup-limit-top';

	const label = document.createElement('span');
	label.className = 'popup-limit-label';
	label.textContent = LIMIT_LABEL_KEYS[key] ? localize(LIMIT_LABEL_KEYS[key]) : key;

	const pct = document.createElement('span');
	pct.className = `popup-limit-pct ${getPercentageClass(limit.percentage)}`;
	pct.textContent = `${limit.percentage.toFixed(0)}%`;

	const resetTime = document.createElement('div');
	resetTime.className = 'popup-limit-reset';
	resetTime.dataset.resetsAt = limit.resetsAt || '';
	resetTime.innerHTML = formatResetTime(limit.resetsAt);

	topLine.appendChild(label);
	topLine.appendChild(pct);

	row.appendChild(topLine);
	row.appendChild(createProgressBar(limit.percentage));
	row.appendChild(resetTime);

	return row;
}

function renderOrgUsage(orgResult, showLabel) {
	const wrapper = document.createElement('div');
	wrapper.className = 'popup-org-section';

	if (showLabel) {
		const header = document.createElement('div');
		header.className = 'popup-org-header';
		header.textContent = orgResult.orgName || orgResult.orgId.substring(0, 12) + '...';
		wrapper.appendChild(header);
	}

	const usageData = new UsageData(orgResult.usageData);
	const activeLimits = usageData.getActiveLimits();

	if (activeLimits.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'popup-empty';
		empty.textContent = localize('popup.no_active_limits');
		wrapper.appendChild(empty);
		return wrapper;
	}

	for (const limit of activeLimits) {
		wrapper.appendChild(createLimitRow(limit.key, limit));
	}

	const hasMaxedLimit = activeLimits.some(l => l.percentage >= 100);
	if (hasMaxedLimit && usageData.hasExtraUsage()) {
		const effectiveTotal = usageData.getExtraUsageEffectiveTotal();
		const used = usageData.extraUsage.usedCredits;
		const pct = effectiveTotal > 0 ? (used / effectiveTotal) * 100 : 0;
		const row = createLimitRow('extraUsage', { percentage: pct, resetsAt: null });
		wrapper.appendChild(row);
	}

	return wrapper;
}

function renderOrgUnavailable(orgResult, showLabel, message) {
	const wrapper = document.createElement('div');
	wrapper.className = 'popup-org-section';

	if (showLabel) {
		const header = document.createElement('div');
		header.className = 'popup-org-header';
		header.textContent = orgResult.orgName || orgResult.orgId.substring(0, 12) + '...';
		wrapper.appendChild(header);
	}

	const msg = document.createElement('div');
	msg.className = 'popup-empty';
	msg.textContent = message;
	wrapper.appendChild(msg);

	return wrapper;
}

function applyStaticLocalization() {
	const loadingEl = document.querySelector('#usage-container .popup-loading');
	if (loadingEl) loadingEl.textContent = localize('popup.loading');
	const helpEl = document.getElementById('popup-help');
	if (helpEl) helpEl.textContent = localize('popup.help');
	const debugEl = document.getElementById('debug');
	if (debugEl) debugEl.textContent = localize('common.debug_logs');
	const donateEl = document.getElementById('donate');
	if (donateEl) donateEl.textContent = localize('popup.donate');
}

async function loadUsageData() {
	const container = document.getElementById('usage-container');

	const stored = await browser.storage.local.get('lastLang');
	setLocaleOverride(stored.lastLang || 'en');
	applyStaticLocalization();

	try {
		CONFIG = await chrome.runtime.sendMessage({ type: 'getConfig' });
		const results = await chrome.runtime.sendMessage({ type: 'getPopupUsageData' });

		if (!results || results.length === 0) {
			container.innerHTML = `<div class="popup-empty">${localize('popup.no_data')}</div>`;
			return;
		}

		container.innerHTML = '';
		const showOrgLabels = results.length > 1;
		const { isBrave } = await browser.storage.local.get('isBrave');
		const unavailableMsg = localize(isBrave ? 'popup.org_no_tab' : 'popup.org_unavailable');

		for (const orgResult of results) {
			container.appendChild(orgResult.error
				? renderOrgUnavailable(orgResult, showOrgLabels, unavailableMsg)
				: renderOrgUsage(orgResult, showOrgLabels));
		}

		setInterval(() => {
			document.querySelectorAll('[data-resets-at]').forEach(el => {
				const resetsAt = parseInt(el.dataset.resetsAt);
				if (resetsAt) el.innerHTML = formatResetTime(resetsAt);
			});
		}, 30000);
	} catch (error) {
		console.error('Error loading usage data in popup:', error);
		container.innerHTML = '<div class="popup-error">Failed to load usage data.</div>';
	}
}

document.getElementById('debug').addEventListener('click', () => {
	chrome.tabs.create({ url: chrome.runtime.getURL('debug.html') });
	window.close();
});

document.getElementById('donate').addEventListener('click', () => {
	chrome.tabs.create({ url: 'https://ko-fi.com/lugia19' });
	window.close();
});

document.getElementById('open-dashboard').addEventListener('click', () => {
	chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
	window.close();
});

loadUsageData();