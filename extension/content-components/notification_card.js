'use strict';

// Settings modal for the tracker's in-page UI.

// ======== Settings modal ========

// A titled block of settings. Heavier than the control labels, so the blocks read as groups.
function settingsSection(title) {
	const section = document.createElement('div');
	section.style.marginBottom = '14px';

	const heading = document.createElement('div');
	heading.className = 'text-sm text-text-100 select-none';
	heading.style.fontWeight = '600';
	heading.style.marginBottom = '6px';
	heading.textContent = title;
	section.appendChild(heading);
	return section;
}

// Adds a labelled switch to a section and returns its checkbox input.
function settingsToggle(section, label, checked, onChange = null) {
	const { container, input } = createClaudeToggle(label, checked, onChange);
	container.classList.add('text-sm');
	container.style.marginBottom = '6px';
	section.appendChild(container);
	return input;
}

// Nothing here persists until Save. Every control holds its value in the DOM, so Cancel discards
// (the modal is rebuilt from storage on each open), and Save commits the lot and reloads: the
// reload re-applies everything, instead of each control patching the live UI itself.
async function showSettingsModal() {
	const [apiKey, resetEnabled, resetThreshold, extraAgainstLimit, stored, sidebarPrefs] = await Promise.all([
		sendBackgroundMessage({ type: 'getAPIKey' }),
		sendBackgroundMessage({ type: 'getResetNotifEnabled' }),
		sendBackgroundMessage({ type: 'getResetNotifThreshold' }),
		sendBackgroundMessage({ type: 'getExtraUsageAgainstLimit' }),
		browser.storage.local.get(LENGTH_DISPLAY_KEY),
		getSidebarDisplayPrefs(),
	]);

	// Flex rather than grid: each column takes only the width its content needs, and the right
	// column wraps below the left once the modal gets too narrow (phones).
	const columns = document.createElement('div');
	columns.style.display = 'flex';
	columns.style.flexWrap = 'wrap';
	columns.style.gap = '0 28px';
	columns.style.alignItems = 'flex-start';

	const leftColumn = document.createElement('div');
	leftColumn.style.flex = '1 1 240px';
	const rightColumn = document.createElement('div');
	rightColumn.style.flex = '1 1 200px';
	columns.append(leftColumn, rightColumn);

	// API key
	const apiSection = settingsSection(localize('card.section_api_key'));
	// Not localized on purpose: it's the literal key prefix, the same in every language. It also
	// doubles as the "no key set" tell - a password field with a value renders dots.
	const apiKeyInput = createClaudeInput({ type: 'password', placeholder: 'sk-ant-...', value: apiKey || '' });
	apiKeyInput.classList.add('text-sm');
	apiSection.appendChild(apiKeyInput);
	leftColumn.appendChild(apiSection);

	// Reset notifications: the switch, then the usage % at which the notification gets armed
	const resetSection = settingsSection(localize('card.reset_notif_toggle'));
	const thresholdRow = document.createElement('div');
	thresholdRow.className = 'flex items-center gap-2 text-sm';

	const thresholdLabel = document.createElement('label');
	thresholdLabel.htmlFor = 'ut-reset-notif-threshold';
	thresholdLabel.style.whiteSpace = 'nowrap';
	thresholdLabel.textContent = localize('card.reset_notif_threshold');

	const thresholdInput = createClaudeInput({ type: 'number', value: resetThreshold ?? 100 });
	thresholdInput.id = 'ut-reset-notif-threshold';
	thresholdInput.min = '1';
	thresholdInput.max = '100';
	thresholdInput.step = '1';
	thresholdInput.classList.add('text-sm');
	thresholdInput.style.width = '72px';
	// Clamped as you type for immediate feedback; persisted on Save.
	thresholdInput.addEventListener('change', () => {
		const n = Number(thresholdInput.value);
		thresholdInput.value = Number.isFinite(n) ? Math.min(100, Math.max(1, Math.round(n))) : 100;
	});

	const thresholdSuffix = document.createElement('span');
	thresholdSuffix.textContent = '%';
	thresholdRow.append(thresholdLabel, thresholdInput, thresholdSuffix);

	// The threshold only means anything while notifications are on
	const setThresholdEnabled = (enabled) => {
		thresholdInput.disabled = !enabled;
		thresholdRow.style.opacity = enabled ? '1' : '0.5';
	};
	const resetToggle = settingsToggle(resetSection, localize('card.reset_notif_enabled'), resetEnabled === true, setThresholdEnabled);
	setThresholdEnabled(resetToggle.checked);
	resetSection.appendChild(thresholdRow);
	leftColumn.appendChild(resetSection);

	// Language (shared with every extension using claude-ext-common)
	const langSection = settingsSection(localize('card.section_language'));
	const langSelect = createLanguageSelect();
	langSelect.classList.add('text-sm');
	langSection.appendChild(langSelect);
	leftColumn.appendChild(langSection);

	// Sidebar display: one switch per bar this account actually has. Built
	// from the live usage data, united with the stored keys so a bar hidden before its data loaded
	// still has a way back on.
	const sidebarSection = settingsSection(localize('card.section_sidebar_display'));
	const sidebarBoxes = new Map();
	const limitKeys = [...new Set([
		...usageUI.availableLimitKeys(),
		...Object.keys(sidebarPrefs),
	])];
	for (const key of limitKeys) {
		// Reuse the sidebar's own labels, minus their trailing colon (French writes " :").
		const label = (usageUI.usageSection?.getLimitLabel(key) ?? key).replace(/\s*[:：]\s*$/, '');
		sidebarBoxes.set(key, settingsToggle(sidebarSection, label, isSidebarItemVisible(sidebarPrefs, key)));
	}
	rightColumn.appendChild(sidebarSection);

	// Extra usage: measured against the monthly spend limit (issue #96, the default for new installs)
	// or against what can actually be spent (the legacy behaviour, pinned for older installs).
	const extraSection = settingsSection(localize('card.section_extra_usage'));
	const extraAgainstLimitBox = settingsToggle(extraSection, localize('card.extra_usage_against_limit'), extraAgainstLimit === true);
	rightColumn.appendChild(extraSection);

	// Conversation stats (issue #66). On means shown; the stored flag is the inverse, so a missing
	// key reads as the default "shown".
	const lengthSection = settingsSection(localize('card.section_length_display'));
	const lengthDisplayBox = settingsToggle(lengthSection, localize('card.length_display_show'), stored[LENGTH_DISPLAY_KEY] !== true);
	rightColumn.appendChild(lengthSection);

	const modal = new ClaudeModal(localize('card.settings_title'), columns);
	modal.modal.style.maxWidth = '640px';

	// Leaves the settings open underneath; the viewer is an overlay above it.
	modal.addButton(localize('shared.view_debug_logs'), 'secondary', () => { openDebugLogs(); return false; });
	modal.addCancel();
	modal.addConfirm(localize('card.save'), async () => {
		// The key is the only setting that can fail, and validating it hits the network, so only
		// touch it when it actually changed.
		if (apiKeyInput.value !== (apiKey || '')) {
			const ok = await sendBackgroundMessage({ type: 'setAPIKey', newKey: apiKeyInput.value });
			if (!ok) {
				const errorMsg = document.createElement('div');
				errorMsg.className = 'text-sm';
				errorMsg.style.color = RED_WARNING;
				errorMsg.style.marginTop = '4px';
				errorMsg.textContent = apiKeyInput.value.startsWith('sk-ant')
					? localize('card.api_key_inactive')
					: localize('card.api_key_invalid');
				apiKeyInput.after(errorMsg);
				setTimeout(() => errorMsg.remove(), 3000);
				return false; // keep the modal open, and write nothing else
			}
		}

		// Merged over the stored object, so prefs for bars not listed this session survive.
		const newSidebarPrefs = { ...sidebarPrefs };
		for (const [key, box] of sidebarBoxes) newSidebarPrefs[key] = box.checked;

		setLanguageOverride(langSelect.value);
		await Promise.all([
			sendBackgroundMessage({ type: 'setResetNotifEnabled', value: resetToggle.checked }),
			sendBackgroundMessage({ type: 'setResetNotifThreshold', value: Number(thresholdInput.value) }),
			sendBackgroundMessage({ type: 'setExtraUsageAgainstLimit', value: extraAgainstLimitBox.checked }),
			browser.storage.local.set({ [LENGTH_DISPLAY_KEY]: !lengthDisplayBox.checked }),
			setSidebarDisplayPrefs(newSidebarPrefs),
		]);

		location.reload();
	});
	modal.show();
}

document.addEventListener('ut:toggleSettings', () => {
	showSettingsModal().catch(error => Log('error', 'Failed to open settings:', error));
});
