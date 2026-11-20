// components.js (claude-ext-common)
// claude.ai-styled UI kit: CLAUDE_CLASSES, ClaudeModal, alert/confirm/prompt helpers and the
// createClaude* control factories. Classic script, no IIFE: everything is a global of the
// loading world. Needs localize() (common/i18n) loaded first.

const CLAUDE_CLASSES = {
	// Buttons
	ICON_BTN: 'inline-flex items-center justify-center relative shrink-0 ring-offset-2 ring-offset-bg-300 ring-accent-200 focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:drop-shadow-none text-text-200 border-transparent transition-colors active:bg-bg-400 h-9 w-9 rounded-md active:scale-95',
	ICON_BTN_MSG: 'inline-flex items-center justify-center relative shrink-0 can-focus select-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:drop-shadow-none border-transparent transition font-base duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] h-6 w-6 rounded !text-muted active:scale-95 group/btn',
	BTN_PRIMARY: 'inline-flex items-center justify-center px-4 py-2 font-base-bold bg-fill-primary text-on-primary rounded hover:bg-fill-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[5rem] h-9',
	BTN_SECONDARY: 'inline-flex items-center justify-center px-4 py-2 hover:bg-fill-ghost-hover rounded transition-colors min-w-[5rem] h-9 text-text-000 font-base-bold border-0.5 border-border-200',

	// Modal
	MODAL_BACKDROP: 'fixed inset-0 flex items-center justify-center z-50',
	MODAL_CONTAINER: 'bg-bg-100 rounded-lg p-6 shadow-xl max-w-md w-full mx-4 border border-border-300',
	MODAL_HEADING: 'text-lg font-semibold mb-4 text-text-100',

	// Form elements
	INPUT: 'w-full p-2 rounded bg-bg-200 text-text-100 border border-border-300 hover:border-border-200',
	SELECT: 'w-full p-2 rounded bg-bg-200 text-text-100 border border-border-300 hover:border-border-200 cursor-pointer',
	CHECKBOX: 'mr-2 rounded border-border-300 accent-clay-emphasized',
	LABEL: 'block text-sm font-medium text-text-200 mb-1',

	// Text
	TEXT_SM: 'text-sm text-text-400 sm:text-[0.75rem]',
	TEXT_MUTED: 'text-sm text-text-400',

	// Tooltip
	TOOLTIP_WRAPPER: 'fixed left-0 top-0 z-tooltip pointer-events-none',
	TOOLTIP_CONTENT: 'px-2 rounded-[6px] bg-[var(--cds-tooltip-bg)] text-[var(--cds-tooltip-fg)] text-[13px]/[18px] shadow-sm dark:shadow-panel-sm inline-flex items-center gap-2',

	// Layout helpers
	FLEX_CENTER: 'flex items-center justify-center',
	FLEX_BETWEEN: 'flex items-center justify-between',
	FLEX_GAP_2: 'flex items-center gap-2',

	// List components
	LIST_CONTAINER: 'space-y-2 overflow-y-auto',
	LIST_ITEM: 'p-3 rounded bg-bg-200 border border-border-300 hover:bg-bg-300 cursor-pointer transition-colors',
};

const claudeUiStyles = document.createElement('style');
claudeUiStyles.textContent = `
	@keyframes claude-modal-spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
	.claude-modal-spinner {
		animation: claude-modal-spin 1s linear infinite;
	}

	/* claude.ai's Tailwind build purged the space-y-* utilities, but we still use
	   them in list/stack layouts. Re-provide the sizes we rely on. Matches
	   Tailwind's own output (--spacing is 0.25rem). */
	.space-y-1 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.25rem; }
	.space-y-2 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.5rem; }
	.space-y-3 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.75rem; }
	.space-y-4 > :not([hidden]) ~ :not([hidden]) { margin-top: 1rem; }
`;
if (document.head) document.head.appendChild(claudeUiStyles);

// Component creators
class ClaudeModal {
	// Visible modals, in show order. Escape only ever dismisses the topmost one,
	// so an alert stacked on a prompt doesn't also cancel the prompt.
	static _openStack = [];

	constructor(title = '', content = '', dismissible = true) {
		this.config = { title, content, dismissible };
		this.isVisible = false;
		this.buttons = [];

		this._buildModal();
		this._attachEventListeners();
	}

	_buildModal() {
		this.backdrop = document.createElement('div');
		this.backdrop.className = CLAUDE_CLASSES.MODAL_BACKDROP;
		this.backdrop.style.position = 'fixed';
		this.backdrop.style.inset = '0';
		this.backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		this.backdrop.style.display = 'none';
		this.backdrop.style.zIndex = '50';
		this.backdrop.style.display = 'none';

		this.modal = document.createElement('div');
		this.modal.className = CLAUDE_CLASSES.MODAL_CONTAINER;
		this.modal.setAttribute('role', 'dialog');
		this.modal.setAttribute('aria-modal', 'true');
		// Cap height and lay out as a column so a tall body scrolls instead of overflowing the viewport.
		// (Inline styles rather than Tailwind arbitrary-value classes, which may not exist in claude.ai's CSS.)
		this.modal.style.maxHeight = '90vh';
		this.modal.style.display = 'flex';
		this.modal.style.flexDirection = 'column';

		this.titleElement = document.createElement('h2');
		this.titleElement.id = 'modal-title';
		this.titleElement.className = CLAUDE_CLASSES.MODAL_HEADING;
		this.modal.setAttribute('aria-labelledby', 'modal-title');
		this.modal.appendChild(this.titleElement);
		this._updateTitle(this.config.title);

		this.contentDiv = document.createElement('div');
		this.contentDiv.className = 'mb-4';
		// Only the body scrolls; title and buttons stay pinned. min-height:0 lets the flex child shrink.
		this.contentDiv.style.flex = '1 1 auto';
		this.contentDiv.style.minHeight = '0';
		this.contentDiv.style.overflowY = 'auto';
		this._setContent(this.config.content);
		this.modal.appendChild(this.contentDiv);

		this.buttonContainer = document.createElement('div');
		this.buttonContainer.className = 'flex justify-end gap-2';
		this.modal.appendChild(this.buttonContainer);

		this.backdrop.appendChild(this.modal);
	}

	_setContent(content) {
		this.contentDiv.innerHTML = '';
		if (!content) return;

		if (typeof content === 'string') {
			this.contentDiv.innerHTML = content;
		} else if (content instanceof HTMLElement) {
			this.contentDiv.appendChild(content);
		}
	}

	_updateTitle(title) {
		if (title) {
			this.titleElement.textContent = title;
			this.titleElement.style.display = '';
		} else {
			this.titleElement.style.display = 'none';
		}
	}

	// Escape / backdrop click. Behaves exactly like clicking Cancel, so a modal
	// whose caller waits on its Cancel handler can't be left hanging.
	dismiss() {
		if (this.dismissButton) {
			this.dismissButton.click();
		} else {
			this.destroy();
		}
	}

	_attachEventListeners() {
		// Track where the mousedown occurred
		let mouseDownOnBackdrop = false;

		this.backdrop.addEventListener('mousedown', (e) => {
			// Only set flag if mousedown is directly on backdrop (not modal)
			mouseDownOnBackdrop = e.target === this.backdrop;
		});

		this.backdrop.addEventListener('mouseup', (e) => {
			// Only close if both mousedown AND mouseup were on backdrop
			if (mouseDownOnBackdrop && e.target === this.backdrop && this.config.dismissible) {
				this.dismiss();
			}
			// Reset flag
			mouseDownOnBackdrop = false;
		});
	}

	addButton(text, variant = 'primary', onClick = null, closeOnClick = true) {
		const button = createClaudeButton(text, variant);

		button.onclick = async () => {
			try {
				let shouldClose = closeOnClick;

				if (onClick) {
					let result = onClick(button, this);
					if (result instanceof Promise) {
						result = await result;
					}
					if (result === false) {
						shouldClose = false;
					}
				}

				if (shouldClose) {
					this.destroy();
				}
			} catch (error) {
				(globalThis.createLogger?.('UI') ?? console).error('Modal button handler error:', error);
			}
		};

		this.buttonContainer.appendChild(button);
		this.buttons.push(button);

		return button;
	}

	addCancel(text = localize('shared.cancel'), onClick = null) {
		this.dismissButton = this.addButton(text, 'secondary', onClick, true);
		return this.dismissButton;
	}

	addConfirm(text = localize('shared.confirm'), onClick = null, closeOnClick = true) {
		return this.addButton(text, 'primary', onClick, closeOnClick);
	}

	clearButtons() {
		this.buttons.forEach(btn => btn.remove());
		this.buttons = [];
		return this;
	}

	show() {
		if (this.isVisible) return this;

		this.backdrop.style.display = 'flex';
		document.body.appendChild(this.backdrop);
		ClaudeModal._openStack.push(this);
		this.isVisible = true;

		// Steal focus
		this.backdrop.setAttribute('tabindex', '-1');
		this.backdrop.focus();

		return this;
	}

	hide() {
		if (!this.isVisible) return this;

		this.backdrop.style.display = 'none';
		ClaudeModal._openStack.splice(ClaudeModal._openStack.indexOf(this), 1);
		this.isVisible = false;

		return this;
	}

	destroy() {
		this.hide();
		this.backdrop.remove();
	}

	setContent(content) {
		this._setContent(content);
		return this;
	}

	setTitle(title) {
		this.config.title = title;
		this._updateTitle(title);
		return this;
	}
}

document.addEventListener('keydown', (e) => {
	if (e.key !== 'Escape') return;
	const top = ClaudeModal._openStack.at(-1);
	if (top?.config.dismissible) top.dismiss();
});

function createLoadingContent(text) {
	const div = document.createElement('div');
	div.className = 'flex items-start gap-3'; // Changed from items-center to items-start

	// Split on newlines and create proper line breaks
	const lines = text.split('\n');
	const textContent = document.createElement('div');
	textContent.className = 'text-text-200';

	lines.forEach((line, index) => {
		const span = document.createElement('span');
		span.textContent = line;
		textContent.appendChild(span);
		if (index < lines.length - 1) {
			textContent.appendChild(document.createElement('br'));
		}
	});

	div.innerHTML = `
		<div class="claude-modal-spinner rounded-full h-5 w-5 border-2 border-border-300 flex-shrink-0" style="border-top-color: #2c84db"></div>
	`;
	div.appendChild(textContent);

	return div;
}

function createLoadingModal(text = localize('shared.loading')) {
	return new ClaudeModal('', createLoadingContent(text), false);
}

function showClaudeConfirm(title, message) {
	return new Promise((resolve) => {
		const messageEl = document.createElement('p');
		messageEl.className = 'text-text-100';
		messageEl.style.whiteSpace = 'pre-line';
		messageEl.textContent = message;

		const modal = new ClaudeModal(title, messageEl);

		modal.addCancel(localize('shared.cancel'), () => {
			resolve(false);
		});

		modal.addConfirm(localize('shared.confirm'), () => {
			resolve(true);
		});

		modal.show();
	});
}

// Three-option modal for more complex choices
// options = { left: {text, variant?}, middle: {text, variant?}, right: {text, variant?} }
// Returns 'left', 'middle', or 'right'
function showClaudeThreeOption(title, message, options) {
	return new Promise((resolve) => {
		const messageEl = document.createElement('p');
		messageEl.className = 'text-text-100';
		messageEl.style.whiteSpace = 'pre-line';
		messageEl.textContent = message;

		const modal = new ClaudeModal(title, messageEl, false); // Not dismissible

		modal.addButton(options.left.text, options.left.variant || 'secondary', () => resolve('left'));
		modal.addButton(options.middle.text, options.middle.variant || 'secondary', () => resolve('middle'));
		modal.addButton(options.right.text, options.right.variant || 'primary', () => resolve('right'));

		modal.show();
	});
}


// Full-featured prompt with all options
function showClaudePrompt(title, message, placeholder = '', defaultValue = '', onValidate = null) {
	return new Promise((resolve, reject) => {
		const contentDiv = document.createElement('div');

		if (message) {
			const label = document.createElement('label');
			label.className = CLAUDE_CLASSES.LABEL;
			label.textContent = message;
			contentDiv.appendChild(label);
		}

		const input = createClaudeInput({
			type: 'text',
			placeholder: placeholder,
			value: defaultValue,
		});
		contentDiv.appendChild(input);

		const modal = new ClaudeModal(title, contentDiv);

		modal.addCancel(localize('shared.cancel'), () => {
			reject(new Error('User cancelled'));
		});

		modal.addConfirm(localize('shared.ok'), async (btn, modal) => {
			const value = input.value.trim();

			// Run validation if provided
			if (onValidate) {
				const validationResult = await onValidate(value);
				if (validationResult !== true) {
					// Show error message if validation failed
					if (typeof validationResult === 'string') {
						showClaudeAlert(localize('shared.validation_error'), validationResult);
					}
					return false; // Keep modal open
				}
			}

			resolve(value);
			return true; // Close modal
		});

		modal.show();

		// Focus the input
		setTimeout(() => input.focus(), 100);

		// Allow Enter key to submit
		input.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				const confirmBtn = modal.buttons[modal.buttons.length - 1];
				if (confirmBtn) confirmBtn.click();
			}
		});
	});
}

// Full-featured alert with customization
function showClaudeAlert(title, message, buttonText = localize('shared.ok')) {
	return new Promise((resolve) => {
		const contentDiv = document.createElement('div');
		contentDiv.className = 'text-text-200';

		if (typeof message === 'string') {
			contentDiv.textContent = message;
		} else if (message instanceof HTMLElement) {
			contentDiv.appendChild(message);
		}

		const modal = new ClaudeModal(title, contentDiv);
		// Its only button is the acknowledgement, so dismissing counts as clicking it.
		modal.dismissButton = modal.addButton(buttonText, 'primary', () => {
			resolve();
		});
		modal.show();
	});
}

function createClaudeButton(content, variant = 'primary', onClick = null, contentIsHTML = false) {
	const button = document.createElement('button');

	switch (variant) {
		case 'primary':
			button.className = CLAUDE_CLASSES.BTN_PRIMARY;
			break;
		case 'secondary':
			button.className = CLAUDE_CLASSES.BTN_SECONDARY;
			break;
		case 'icon': case 'icon-message':
			if (variant === 'icon') {
				button.className = CLAUDE_CLASSES.ICON_BTN;
			} else {
				button.className = CLAUDE_CLASSES.ICON_BTN_MSG;
			}
			contentIsHTML = true;

			// Add hover effect directly
			button.addEventListener('mouseenter', () => {
				button.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
			});
			button.addEventListener('mouseleave', () => {
				button.style.backgroundColor = '';
			});
			break;
		default:
			button.className = CLAUDE_CLASSES.BTN_PRIMARY;
	}

	if (contentIsHTML) {
		button.innerHTML = content;
	} else {
		button.textContent = content;
	}

	if (variant === 'icon-message') {
		// Native message action buttons are 24x24 with 16px icons
		button.querySelectorAll('svg').forEach(svg => {
			svg.setAttribute('width', '16');
			svg.setAttribute('height', '16');
		});
	}

	if (onClick) button.onclick = onClick;
	return button;
}


function createClaudeInput({ type = 'text', placeholder = '', value = '', onChange = null } = {}) {
	const input = document.createElement('input');
	input.type = type;
	input.className = CLAUDE_CLASSES.INPUT;
	input.placeholder = placeholder;
	input.value = value;

	if (onChange) {
		input.addEventListener('input', onChange);
	}

	return input;
}

function createClaudeSelect(options, selectedValue = '', onChange = null) {
	const select = document.createElement('select');
	select.className = CLAUDE_CLASSES.SELECT;

	options.forEach(option => {
		const optionEl = document.createElement('option');
		optionEl.value = option.value;
		optionEl.textContent = option.label;
		optionEl.selected = option.value === selectedValue;
		select.appendChild(optionEl);
	});

	if (onChange) {
		select.addEventListener('change', onChange);
	}

	select.populateOptions = function (newOptions, currentValue = '') {
		select.innerHTML = '';
		if (newOptions.length === 0) {
			const optionEl = document.createElement('option');
			optionEl.value = '';
			optionEl.textContent = localize('shared.none_available');
			select.appendChild(optionEl);
			select.disabled = true;
			return;
		}
		newOptions.forEach(option => {
			const optionEl = document.createElement('option');
			optionEl.value = option.value;
			optionEl.textContent = option.label;
			select.appendChild(optionEl);
		});
		select.disabled = false;
		select.value = currentValue || newOptions[0]?.value || '';
	};

	return select;
}

// Language picker select: Auto plus every UI language in its own script, preset to the current
// override. Save its value with setLanguageOverride() and reload the page.
// Show the extension's debug logs (common/log/viewer.html) in an overlay on the page. An overlay
// rather than a tab, because the desktop app can't open extension tabs. ISOLATED world only.
let _dismissDebugLogs = null;

function openDebugLogs() {
	_dismissDebugLogs?.();

	const overlay = document.createElement('div');
	// Per extension: the page DOM is shared, and each extension's viewer shows its own logs.
	overlay.id = `claude-ext-debug-logs-${chrome.runtime.id}`;
	Object.assign(overlay.style, {
		position: 'fixed', inset: '0', zIndex: '99999', background: 'rgba(0, 0, 0, 0.5)',
		display: 'flex', alignItems: 'center', justifyContent: 'center',
	});

	const frame = document.createElement('div');
	Object.assign(frame.style, { position: 'relative', width: '92vw', height: '90vh' });

	const iframe = document.createElement('iframe');
	iframe.src = chrome.runtime.getURL(`common/log/viewer.html?lang=${encodeURIComponent(currentLocale())}`);
	iframe.allow = 'clipboard-write';
	Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', borderRadius: '8px' });

	const close = document.createElement('button');
	close.textContent = '×';
	close.setAttribute('aria-label', localize('shared.close'));
	Object.assign(close.style, {
		position: 'absolute', top: '-14px', right: '-14px', width: '28px', height: '28px', borderRadius: '50%',
		border: 'none', background: '#2c84db', color: 'white', fontSize: '18px', lineHeight: '1', cursor: 'pointer',
	});

	const dismiss = () => {
		overlay.remove();
		document.removeEventListener('keydown', onKey, true);
		if (_dismissDebugLogs === dismiss) _dismissDebugLogs = null;
	};
	// Escape closes only the viewer, not a modal it was opened over (ClaudeModal listens for Escape too).
	// If something else already removed the overlay, just unhook and let the key through.
	const onKey = (e) => {
		if (e.key !== 'Escape') return;
		if (!overlay.isConnected) {
			dismiss();
			return;
		}
		e.stopImmediatePropagation();
		dismiss();
	};
	_dismissDebugLogs = dismiss;
	close.addEventListener('click', dismiss);
	overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
	document.addEventListener('keydown', onKey, true);

	frame.append(iframe, close);
	overlay.appendChild(frame);
	document.body.appendChild(overlay);
}

function createLanguageSelect() {
	const options = [
		{ value: '', label: localize('shared.lang_auto') },
		...I18N_LOCALES.map(l => ({ value: l, label: LANGUAGE_NATIVE_NAMES[l] })),
	];
	return createClaudeSelect(options, getLanguageOverride());
}

function createClaudeSearchableSelect(options, selectedValue = '', onChange = null) {
	let currentOptions = [...options];
	let selectedVal = selectedValue;
	let isDisabled = false;
	let isOpen = false;
	let highlightedIndex = -1;
	let changeHandler = onChange;

	const wrapper = document.createElement('div');
	wrapper.style.position = 'relative';

	const display = document.createElement('div');
	display.className = CLAUDE_CLASSES.SELECT;
	display.style.display = 'flex';
	display.style.alignItems = 'center';
	display.style.justifyContent = 'space-between';
	display.style.userSelect = 'none';
	wrapper.appendChild(display);

	const displayText = document.createElement('span');
	displayText.style.overflow = 'hidden';
	displayText.style.textOverflow = 'ellipsis';
	displayText.style.whiteSpace = 'nowrap';
	displayText.style.flex = '1';
	display.appendChild(displayText);

	const chevron = document.createElement('span');
	chevron.textContent = '▾';
	chevron.style.marginLeft = '8px';
	chevron.style.flexShrink = '0';
	display.appendChild(chevron);

	const dropdown = document.createElement('div');
	dropdown.style.cssText = 'position:fixed; z-index:100; display:none; border:1px solid; border-radius:0.375rem; overflow:hidden;';
	dropdown.className = 'bg-bg-200 border-border-300';

	const searchInput = document.createElement('input');
	searchInput.type = 'text';
	searchInput.placeholder = localize('shared.search_placeholder');
	searchInput.className = CLAUDE_CLASSES.INPUT;
	searchInput.style.borderRadius = '0';
	searchInput.style.borderLeft = 'none';
	searchInput.style.borderRight = 'none';
	searchInput.style.borderTop = 'none';
	dropdown.appendChild(searchInput);

	const optionsList = document.createElement('div');
	optionsList.style.cssText = 'max-height:200px; overflow-y:auto;';
	dropdown.appendChild(optionsList);

	function getSelectedLabel() {
		const opt = currentOptions.find(o => o.value === selectedVal);
		return opt ? opt.label : (currentOptions[0]?.label || '');
	}

	function updateDisplay() {
		displayText.textContent = getSelectedLabel();
		if (isDisabled) {
			display.style.opacity = '0.5';
			display.style.pointerEvents = 'none';
		} else {
			display.style.opacity = '';
			display.style.pointerEvents = '';
		}
	}

	function renderOptions(filter = '') {
		optionsList.innerHTML = '';
		const lower = filter.toLowerCase();
		const filtered = lower ? currentOptions.filter(o => o.label.toLowerCase().includes(lower)) : currentOptions;
		highlightedIndex = -1;

		filtered.forEach((opt, i) => {
			const item = document.createElement('div');
			item.textContent = opt.label;
			item.style.cssText = 'padding:6px 8px; cursor:pointer;';
			item.className = 'text-text-100';
			if (opt.value === selectedVal) {
				item.style.fontWeight = 'bold';
			}
			item.addEventListener('mouseenter', () => {
				highlightedIndex = i;
				updateHighlight();
			});
			item.addEventListener('mousedown', (e) => {
				e.preventDefault();
				selectOption(opt.value);
			});
			optionsList.appendChild(item);
		});
	}

	function updateHighlight() {
		const items = optionsList.children;
		for (let i = 0; i < items.length; i++) {
			if (i === highlightedIndex) {
				items[i].classList.add('bg-bg-400');
			} else {
				items[i].classList.remove('bg-bg-400');
			}
		}
	}

	function selectOption(val) {
		selectedVal = val;
		updateDisplay();
		closeDropdown();
		const event = new Event('change', { bubbles: true });
		wrapper.dispatchEvent(event);
		if (changeHandler) changeHandler(event);
	}

	function positionDropdown() {
		const rect = display.getBoundingClientRect();
		dropdown.style.top = rect.bottom + 2 + 'px';
		dropdown.style.left = rect.left + 'px';
		dropdown.style.width = rect.width + 'px';
	}

	function openDropdown() {
		if (isDisabled) return;
		isOpen = true;
		document.body.appendChild(dropdown);
		positionDropdown();
		dropdown.style.display = '';
		searchInput.value = '';
		renderOptions();
		searchInput.focus();
	}

	function closeDropdown() {
		isOpen = false;
		dropdown.style.display = 'none';
		if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
	}

	display.addEventListener('mousedown', (e) => {
		e.preventDefault();
		if (isOpen) closeDropdown();
		else openDropdown();
	});

	searchInput.addEventListener('input', () => {
		renderOptions(searchInput.value);
	});

	searchInput.addEventListener('keydown', (e) => {
		const lower = searchInput.value.toLowerCase();
		const filtered = lower ? currentOptions.filter(o => o.label.toLowerCase().includes(lower)) : currentOptions;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightedIndex = Math.min(highlightedIndex + 1, filtered.length - 1);
			updateHighlight();
			const items = optionsList.children;
			if (items[highlightedIndex]) items[highlightedIndex].scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, 0);
			updateHighlight();
			const items = optionsList.children;
			if (items[highlightedIndex]) items[highlightedIndex].scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
				selectOption(filtered[highlightedIndex].value);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			closeDropdown();
		}
	});

	document.addEventListener('mousedown', (e) => {
		if (isOpen && !wrapper.contains(e.target)) {
			closeDropdown();
		}
	});

	Object.defineProperty(wrapper, 'value', {
		get: () => selectedVal,
		set: (val) => {
			selectedVal = val;
			updateDisplay();
		}
	});

	Object.defineProperty(wrapper, 'disabled', {
		get: () => isDisabled,
		set: (val) => {
			isDisabled = val;
			updateDisplay();
		}
	});

	Object.defineProperty(wrapper, 'onchange', {
		set: (fn) => { changeHandler = fn; }
	});

	wrapper.populateOptions = function (newOptions, currentValue = '') {
		currentOptions = [...newOptions];
		if (newOptions.length === 0) {
			currentOptions = [{ value: '', label: localize('shared.none_available') }];
			isDisabled = true;
			selectedVal = '';
		} else {
			isDisabled = false;
			selectedVal = currentValue || newOptions[0]?.value || '';
		}
		updateDisplay();
		if (isOpen) {
			renderOptions(searchInput.value);
		}
	};

	updateDisplay();
	return wrapper;
}

function createClaudeCheckbox(labelText = '', checked = false, onChange = null) {
	const container = document.createElement('div');
	container.className = CLAUDE_CLASSES.FLEX_GAP_2;

	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.className = CLAUDE_CLASSES.CHECKBOX;
	checkbox.checked = checked;

	// Add aria-label for screen readers
	if (labelText) {
		checkbox.setAttribute('aria-label', labelText);
	}

	if (onChange) {
		checkbox.addEventListener('change', (e) => onChange(e.target.checked));
	}

	container.appendChild(checkbox);

	if (labelText) {
		const label = document.createElement('label');
		label.className = 'text-text-100 cursor-pointer select-none';
		label.textContent = labelText;
		label.onclick = () => checkbox.click();
		container.appendChild(label);
	}

	return { container, checkbox };
}

function createClaudeToggle(labelText = '', checked = false, onChange = null) {
	// Container for toggle + label
	const container = document.createElement('div');
	container.className = 'flex items-center gap-2';

	// Toggle wrapper
	const toggleWrapper = document.createElement('label');

	const toggleContainer = document.createElement('div');
	toggleContainer.className = 'group/switch relative select-none cursor-pointer inline-block';

	const input = document.createElement('input');
	input.type = 'checkbox';
	input.className = 'peer sr-only';
	input.role = 'switch';
	input.checked = checked;
	input.style.width = '36px';
	input.style.height = '20px';

	if (labelText) {
		input.setAttribute('aria-label', labelText);
	}


	const track = document.createElement('div');
	track.className = 'border-border-300 rounded-full bg-bg-500 transition-colors peer-disabled:opacity-50';
	track.style.width = '36px';
	track.style.height = '20px';

	const thumb = document.createElement('div');
	thumb.className = 'absolute flex items-center justify-center rounded-full bg-white transition-transform group-hover/switch:opacity-80';
	thumb.style.width = '16px';
	thumb.style.height = '16px';
	thumb.style.left = '2px';
	thumb.style.top = '2px';
	thumb.style.transform = checked ? 'translateX(16px)' : 'translateX(0)';

	const updateTrackColor = (on) => {
		track.style.backgroundColor = on ? '#2c84db' : '';
	};
	updateTrackColor(checked);

	input.addEventListener('change', (e) => {
		thumb.style.transform = e.target.checked ? 'translateX(16px)' : 'translateX(0)';
		updateTrackColor(e.target.checked);
		if (onChange) onChange(e.target.checked);
	});

	toggleContainer.appendChild(input);
	toggleContainer.appendChild(track);
	toggleContainer.appendChild(thumb);
	toggleContainer.style.transform = 'translateY(3px)'; // Slight vertical align
	toggleWrapper.appendChild(toggleContainer);

	container.appendChild(toggleWrapper);

	// Add label text if provided
	if (labelText) {
		const label = document.createElement('span');
		label.className = 'text-text-100 select-none cursor-pointer';
		label.textContent = labelText;
		label.onclick = () => input.click(); // Make label clickable
		container.appendChild(label);
	}

	return { container, input, toggle: toggleContainer };
}


function createClaudeSlider(label, defaultValue = 100, options = {}) {
	const {
		min = 0,
		max = 100,
		step = 25,
		showLabels = true,
		suffix = '%',
		leftLabel = null,
		rightLabel = null
	} = options;

	const container = document.createElement('div');
	container.className = 'space-y-2';
	container.style.paddingBottom = '1rem';

	// Label
	if (label) {
		const labelElement = document.createElement('label');
		labelElement.className = CLAUDE_CLASSES.LABEL;
		labelElement.textContent = label;
		container.appendChild(labelElement);
	}

	// Left/Right labels row (if provided)
	if (leftLabel || rightLabel) {
		const labelRow = document.createElement('div');
		labelRow.style.marginBottom = '-1rem';
		labelRow.className = 'flex justify-between text-sm text-text-500 pb-1';
		labelRow.innerHTML = `
		<span>${leftLabel || ''}</span>
		<span>${rightLabel || ''}</span>
	`;
		container.appendChild(labelRow);
	}

	// Slider wrapper
	const sliderWrapper = document.createElement('div');
	sliderWrapper.className = 'relative px-4 py-4 select-none';

	// Track
	const track = document.createElement('div');
	track.className = 'relative w-full h-2 bg-bg-300 rounded-lg cursor-pointer';

	// Filled track (progress)
	const fillTrack = document.createElement('div');
	fillTrack.className = 'absolute left-0 top-0 h-full rounded-lg pointer-events-none';
	fillTrack.style.backgroundColor = '#2c84db';

	// Thumb
	const thumb = document.createElement('div');
	thumb.className = 'absolute top-1/2 w-5 h-5 rounded-full border-2 border-white shadow-md cursor-grab active:cursor-grabbing';
	thumb.style.backgroundColor = '#2c84db';
	thumb.style.transform = 'translate(-50%, -50%)';
	thumb.style.transition = 'none';

	track.appendChild(fillTrack);
	track.appendChild(thumb);
	sliderWrapper.appendChild(track);

	// Hidden input for form compatibility
	const input = document.createElement('input');
	input.type = 'hidden';
	input.value = defaultValue;
	sliderWrapper.appendChild(input);

	// Tick marks and labels
	if (showLabels) {
		const ticksContainer = document.createElement('div');
		ticksContainer.className = 'relative w-full mt-3';

		for (let value = min; value <= max; value += step) {
			const percentage = ((value - min) / (max - min)) * 100;

			const tickWrapper = document.createElement('div');
			tickWrapper.className = 'absolute flex flex-col items-center cursor-pointer';
			tickWrapper.style.left = `${percentage}%`;
			tickWrapper.style.transform = 'translateX(-50%)';

			// Tick mark
			const tick = document.createElement('div');
			tick.className = 'w-0.5 h-2 bg-border-300 mb-1';
			tickWrapper.appendChild(tick);

			// Label
			const tickLabel = document.createElement('span');
			tickLabel.className = 'text-xs text-text-400 select-none whitespace-nowrap';
			tickLabel.textContent = `${value}${suffix}`;
			tickWrapper.appendChild(tickLabel);

			// Click on tick to set value
			tickWrapper.addEventListener('click', () => {
				setValue(value);
			});

			ticksContainer.appendChild(tickWrapper);
		}

		sliderWrapper.appendChild(ticksContainer);
	}

	container.appendChild(sliderWrapper);

	// State
	let currentValue = defaultValue;
	let isDragging = false;

	// Helper functions
	const snapToStep = (value) => {
		const steps = Math.round((value - min) / step);
		return Math.min(max, Math.max(min, min + steps * step));
	};

	const setValue = (value) => {
		currentValue = snapToStep(value);
		const percentage = ((currentValue - min) / (max - min)) * 100;
		thumb.style.left = `${percentage}%`;
		fillTrack.style.width = `${percentage}%`;
		input.value = currentValue;

		// Dispatch both input (for real-time) and change (for compatibility)
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	};

	const handleMove = (clientX) => {
		const rect = track.getBoundingClientRect();
		const percentage = ((clientX - rect.left) / rect.width) * 100;
		const value = min + (percentage / 100) * (max - min);
		setValue(value);
	};

	// Mouse events
	thumb.addEventListener('mousedown', (e) => {
		isDragging = true;
		thumb.style.transition = 'none';
		e.preventDefault();
	});

	track.addEventListener('mousedown', (e) => {
		if (e.target === track || e.target === fillTrack) {
			isDragging = true;
			thumb.style.transition = 'none';
			handleMove(e.clientX);
			e.preventDefault();
		}
	});

	document.addEventListener('mousemove', (e) => {
		if (isDragging) {
			handleMove(e.clientX);
		}
	});

	document.addEventListener('mouseup', () => {
		if (isDragging) {
			isDragging = false;
			thumb.style.transition = '';
		}
	});

	// Touch events
	thumb.addEventListener('touchstart', (e) => {
		isDragging = true;
		thumb.style.transition = 'none';
		e.preventDefault();
	});

	track.addEventListener('touchstart', (e) => {
		if (e.target === track || e.target === fillTrack) {
			isDragging = true;
			thumb.style.transition = 'none';
			handleMove(e.touches[0].clientX);
			e.preventDefault();
		}
	});

	document.addEventListener('touchmove', (e) => {
		if (isDragging) {
			handleMove(e.touches[0].clientX);
		}
	});

	document.addEventListener('touchend', () => {
		if (isDragging) {
			isDragging = false;
			thumb.style.transition = '';
		}
	});

	// Initialize
	setValue(defaultValue);

	// Add hover effect
	thumb.addEventListener('mouseenter', () => {
		if (!isDragging) {
			thumb.style.transform = 'translate(-50%, -50%) scale(1.1)';
		}
	});

	thumb.addEventListener('mouseleave', () => {
		if (!isDragging) {
			thumb.style.transform = 'translate(-50%, -50%)';
		}
	});

	return {
		container,
		input,
		setValue,
		getValue: () => currentValue
	};
}


let _tooltipPortal = null;
function getTooltipPortal() {
	if (_tooltipPortal && _tooltipPortal.isConnected) return _tooltipPortal;

	const existing = document.querySelector('.cds-root[data-cds-portal]');
	if (existing) {
		_tooltipPortal = existing;
		return _tooltipPortal;
	}

	const reference = document.querySelector('.cds-root');
	const portal = document.createElement('div');
	portal.className = 'cds-root pointer-events-auto';
	portal.setAttribute('data-cds-portal', '');
	if (reference) {
		for (const attr of ['data-density', 'data-mode', 'data-platform', 'data-font']) {
			const val = reference.getAttribute(attr);
			if (val) portal.setAttribute(attr, val);
		}
	}
	document.body.appendChild(portal);
	_tooltipPortal = portal;
	return _tooltipPortal;
}

function createClaudeTooltip(element, tooltipText, deleteOnClick) {
	const tooltipId = `tooltip-${Math.random().toString(36).substring(2, 11)}`;

	// Link element to tooltip for screen readers
	element.setAttribute('aria-describedby', tooltipId);

	// Create tooltip wrapper
	const tooltipWrapper = document.createElement('div');
	tooltipWrapper.className = CLAUDE_CLASSES.TOOLTIP_WRAPPER;
	// Above ClaudeModal (its backdrop is z-50): claude.ai's z-tooltip is also 50, and the modal, added later,
	// would win the tie and hide every tooltip inside it.
	tooltipWrapper.style.zIndex = '60';
	tooltipWrapper.style.display = 'none';
	tooltipWrapper.setAttribute('data-cds', 'Tooltip');

	// Add tooltip content with the ID
	const tooltipContent = document.createElement('div');
	tooltipContent.id = tooltipId;
	tooltipContent.className = CLAUDE_CLASSES.TOOLTIP_CONTENT + ' tooltip-content';
	tooltipContent.setAttribute('data-open', '');
	tooltipContent.setAttribute('data-side', 'top');
	tooltipContent.setAttribute('data-align', 'center');
	// A newline in the text starts a new line, and long text wraps at 400px. A single line stays
	// exactly claude.ai's 24px pill.
	Object.assign(tooltipContent.style, {
		whiteSpace: 'pre-line', maxWidth: '400px', minHeight: '24px', paddingTop: '3px', paddingBottom: '3px',
		fontSize: '13px', lineHeight: '18px',
	});
	tooltipContent.innerHTML = `<span>${tooltipText}</span>`;
	tooltipWrapper.appendChild(tooltipContent);

	// Add hover events
	function checkTooltipParent() {
		if (!element.isConnected) {
			tooltipWrapper.remove();
			return;
		}
		if (tooltipWrapper.style.display !== 'none') {
			setTimeout(checkTooltipParent, 500);
		}
	}

	let pressTimer = null;
	let autoHideTimer = null;

	// Centered above the element and kept inside the viewport; below it if there's no room above.
	function showTooltip() {
		tooltipWrapper.style.display = 'block';
		const rect = element.getBoundingClientRect();
		const tooltipRect = tooltipWrapper.getBoundingClientRect();
		const centerX = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
		const x = Math.min(Math.max(8, centerX), window.innerWidth - tooltipRect.width - 8);
		const topY = rect.top - tooltipRect.height - 5;
		const y = topY < 0 ? rect.bottom + 5 : topY;
		tooltipWrapper.style.transform = `translate(${x}px, ${y}px)`;
		setTimeout(checkTooltipParent, 500);
	}

	function hideTooltip() {
		tooltipWrapper.style.display = 'none';
		clearTimeout(pressTimer);
		clearTimeout(autoHideTimer);
	}

	// Mouse and pen: hover. Touch has no hover, so a long press shows it for a few seconds instead.
	element.addEventListener('pointerenter', (e) => {
		if (e.pointerType !== 'touch') showTooltip();
	});
	element.addEventListener('pointerleave', (e) => {
		if (e.pointerType !== 'touch') hideTooltip();
	});
	element.addEventListener('pointerdown', (e) => {
		if (e.pointerType !== 'touch') return;
		clearTimeout(pressTimer);
		pressTimer = setTimeout(() => {
			showTooltip();
			clearTimeout(autoHideTimer);
			autoHideTimer = setTimeout(hideTooltip, 3000);
		}, 500);
	});
	element.addEventListener('pointerup', (e) => {
		if (e.pointerType === 'touch') clearTimeout(pressTimer);
	});
	element.addEventListener('pointercancel', hideTooltip);
	// No text selection or callout menu on a long press.
	element.style.webkitTouchCallout = 'none';
	element.style.userSelect = 'none';

	tooltipWrapper.addEventListener('mouseenter', () => {
		tooltipWrapper.style.display = 'none';
	});
	tooltipWrapper.addEventListener('pointerup', () => {
		tooltipWrapper.style.display = 'none';
	});

	// Handle click behavior
	const shouldHideOnClick = deleteOnClick === undefined
		? (element.onclick !== null)
		: deleteOnClick;

	if (shouldHideOnClick) {
		element.addEventListener('click', () => {
			tooltipWrapper.style.display = 'none';
		});
	}

	getTooltipPortal().appendChild(tooltipWrapper);

	// Clean up when element is removed
	const originalRemove = element.remove.bind(element);
	element.remove = () => {
		tooltipWrapper.remove();
		originalRemove();
	};

	// Create tooltip API object
	const tooltipAPI = {
		wrapper: tooltipWrapper,
		updateText: (newText) => {
			tooltipContent.innerHTML = `<span>${newText}</span>`;
		}
	};

	// Store tooltip on the element itself
	element.tooltip = tooltipAPI;

	// Still return it for convenience
	return tooltipAPI;
}


// Whether to use the mobile variants of our UI: a touch device with a narrow window. The same test
// Claude Usage Tracker uses, so the two extensions agree on it.
//
// Not orientation (innerHeight > innerWidth), which is what this used to be. On Android the on-screen
// keyboard shrinks the layout viewport, so opening it turned a phone "landscape" and flipped
// everything back to the desktop layout for as long as the user was typing. Neither input here moves
// when the keyboard opens. A narrow desktop window, which orientation used to catch, stays desktop
// and is handled by the button bar collapsing into its menu when the header runs out of width.
function isMobileLayout() {
	return matchMedia('(pointer: coarse)').matches && window.innerWidth < 768;
}
