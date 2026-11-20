/**
 * fork_notes.js — per-account notes box, mounted into the usage sidebar section.
 * Fork-owned content script, loaded just before usage_ui.js (see manifest-overlay.json).
 * usage_ui.js reaches it through one hook:  content.appendChild(window.UsageOSNotes.create())
 * Relies only on globals upstream has always provided to content scripts:
 * sendBackgroundMessage() (content_utils.js) and getActiveOrgId() (common/claude/page.js).
 */
(function () {
	const say = (...a) => { try { (typeof Log === 'function' ? Log : console.log)('UsageOSNotes:', ...a); } catch { /* ignore */ } };

	function create() {
		const wrap = document.createElement('div');
		wrap.className = 'ut-notes-container';

		const label = document.createElement('div');
		label.className = 'ut-notes-label';
		label.textContent = 'Notes';

		const box = document.createElement('textarea');
		box.className = 'ut-notes-textarea';
		box.disabled = true;
		box.placeholder = 'Notes unavailable — account not yet synced';

		wrap.append(label, box);

		let accountId = null, timer = null;

		async function load() {
			const orgId = typeof getActiveOrgId === 'function' ? getActiveOrgId() : null;
			if (!orgId) { box.placeholder = 'Notes unavailable — no active account'; return; }
			try {
				const res = await sendBackgroundMessage({ type: 'getAllAccountsFromBackend' });
				const acct = res?.ok ? (res.data || []).find(a => a.org_id === orgId) : null;
				if (!acct) { box.placeholder = 'Notes unavailable — account not yet synced'; return; }
				accountId = acct.id;
				box.value = acct.note || '';
				box.disabled = false;
				box.placeholder = 'Add notes for this account...';
			} catch (err) {
				say('load failed', err);
				box.placeholder = 'Failed to load notes';
			}
		}

		async function save() {
			if (box.disabled || !accountId) return;
			try {
				const res = await sendBackgroundMessage({ type: 'putNote', orgId: getActiveOrgId(), content: box.value });
				if (!res?.ok) say('save failed', res?.reason);
			} catch (err) { say('save failed', err); }
		}

		box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 800); });
		load();
		return wrap;
	}

	window.UsageOSNotes = { create };
})();
