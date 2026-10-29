// cards.js (claude-ext-common)
// Draggable floating cards, plus the version-update ("what's new") and rate-reminder cards built on
// them. ISOLATED world only: needs chrome.runtime. Classic script, no IIFE: everything
// is a global of the loading world. Needs localize() (common/i18n) loaded first.
//
// Styled with claude.ai's own classes plus inline styles only. The page DOM is shared with every
// other extension, so injecting a stylesheet here would let two versions of this file fight over it.

const CARD_ACCENT = '#2c84db';
const KOFI_URL = 'https://ko-fi.com/R6R14IUBY';

// Paths of the shared images, relative to the extension root. They must be web-accessible.
const CARD_ASSETS = {
	kofi: 'common/assets/kofi-button.png',
	rate: 'common/assets/rate-badge.png',
};

// Firefox exposes window.chrome to extensions too, so only the user agent tells them apart.
function isChromeBrowser() {
	return !navigator.userAgent.includes('Firefox');
}

// Pointer-driven dragging (mouse, touch, pen), kept inside the viewport. Returns a cleanup function.
function makeDraggable(element, dragHandle = null) {
	let isDragging = false;
	let initialX;
	let initialY;
	let pointerId = null;

	const dragElement = dragHandle || element;

	function handleDragStart(e) {
		if (isDragging) return;
		isDragging = true;
		pointerId = e.pointerId;
		dragElement.setPointerCapture(e.pointerId);
		initialX = e.clientX - element.offsetLeft;
		initialY = e.clientY - element.offsetTop;
		dragElement.style.cursor = 'grabbing';
		// Prevent text selection during drag
		e.preventDefault();
	}

	function handleDragMove(e) {
		if (!isDragging || e.pointerId !== pointerId) return;
		e.preventDefault();
		const maxX = window.innerWidth - element.offsetWidth;
		const maxY = window.innerHeight - element.offsetHeight;
		const x = Math.min(Math.max(0, e.clientX - initialX), maxX);
		const y = Math.min(Math.max(0, e.clientY - initialY), maxY);
		element.style.left = `${x}px`;
		element.style.top = `${y}px`;
		element.style.right = 'auto';
		element.style.bottom = 'auto';
	}

	function handleDragEnd(e) {
		if (e.pointerId !== pointerId) return;
		isDragging = false;
		pointerId = null;
		dragElement.style.cursor = dragHandle ? 'move' : 'grab';
		dragElement.releasePointerCapture(e.pointerId);
	}

	dragElement.addEventListener('pointerdown', handleDragStart);
	dragElement.addEventListener('pointermove', handleDragMove);
	dragElement.addEventListener('pointerup', handleDragEnd);
	dragElement.addEventListener('pointercancel', handleDragEnd);
	dragElement.style.cursor = dragHandle ? 'move' : 'grab';
	// Prevent touch scrolling when dragging
	dragElement.style.touchAction = 'none';

	return () => {
		dragElement.removeEventListener('pointerdown', handleDragStart);
		dragElement.removeEventListener('pointermove', handleDragMove);
		dragElement.removeEventListener('pointerup', handleDragEnd);
		dragElement.removeEventListener('pointercancel', handleDragEnd);
	};
}

// A small draggable card, top-right by default. Build it with the add* methods, then show().
// stackOrder: where it goes among the cards on the page, lower first (see restackCards).
class FloatingCard {
	constructor({ stackOrder = 0 } = {}) {
		this.header = null;
		this.element = document.createElement('div');
		this.element.setAttribute('data-claude-ext-card', String(stackOrder));
		this.element.className = 'bg-bg-100 border border-border-400 text-text-000';
		Object.assign(this.element.style, {
			position: 'fixed',
			padding: '12px',
			borderRadius: '8px',
			zIndex: '10000',
			fontSize: '14px',
			boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
			maxWidth: '280px',
			textAlign: 'center',
		});
	}

	// The title row, which is also the drag handle.
	addHeader(text) {
		const header = document.createElement('div');
		header.className = 'border-b border-border-400';
		Object.assign(header.style, { fontWeight: 'bold', paddingBottom: '8px', marginBottom: '8px', paddingRight: '20px' });
		header.textContent = text;
		this.element.appendChild(header);
		this.header = header;
		return header;
	}

	addText(text, { bold = false } = {}) {
		const div = document.createElement('div');
		div.style.marginBottom = '8px';
		if (bold) div.style.fontWeight = 'bold';
		div.textContent = text;
		this.element.appendChild(div);
		return div;
	}

	addLink(text, href) {
		const link = document.createElement('a');
		link.href = href;
		link.target = '_blank';
		link.className = 'hover:underline';
		Object.assign(link.style, { display: 'block', marginBottom: '8px', color: CARD_ACCENT, textDecoration: 'none' });
		link.textContent = text;
		this.element.appendChild(link);
		return link;
	}

	// A scrollable bullet list under a bold title, e.g. patch notes.
	addList(title, items) {
		const box = document.createElement('div');
		box.className = 'bg-bg-000';
		Object.assign(box.style, { padding: '8px', borderRadius: '4px', overflowY: 'auto', maxHeight: '150px', textAlign: 'left', marginBottom: '8px' });

		const heading = document.createElement('div');
		Object.assign(heading.style, { fontWeight: 'bold', marginBottom: '4px' });
		heading.textContent = title;
		box.appendChild(heading);

		const list = document.createElement('ul');
		Object.assign(list.style, { paddingLeft: '12px', margin: '0', listStyleType: 'disc' });
		for (const text of items) {
			const item = document.createElement('li');
			Object.assign(item.style, { marginBottom: '3px', paddingLeft: '3px' });
			item.textContent = text;
			list.appendChild(item);
		}
		box.appendChild(list);
		this.element.appendChild(box);
		return box;
	}

	// An image link; imagePath is relative to the extension root and must be web-accessible.
	addImageButton(href, imagePath, alt) {
		const link = document.createElement('a');
		link.href = href;
		link.target = '_blank';
		Object.assign(link.style, { display: 'block', textAlign: 'center', marginTop: '10px' });

		const img = document.createElement('img');
		img.src = chrome.runtime.getURL(imagePath);
		// The real size of every card image, so the space is reserved before it loads (claude.ai's
		// CSS scales it down to the card width): show() measures the card to stack and clamp it.
		img.width = 580;
		img.height = 146;
		img.style.border = '0';
		img.style.display = 'inline-block';
		img.alt = alt;
		link.appendChild(img);

		this.element.appendChild(link);
		return link;
	}

	addKofiButton() {
		return this.addImageButton(KOFI_URL, CARD_ASSETS.kofi, localize('shared.notif.kofi_alt'));
	}

	addCloseButton() {
		const closeButton = document.createElement('button');
		closeButton.className = 'hover:bg-bg-300';
		Object.assign(closeButton.style, {
			position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none',
			fontSize: '18px', lineHeight: '1', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
			color: CARD_ACCENT,
		});
		closeButton.textContent = '×';
		closeButton.addEventListener('click', () => this.remove());
		this.element.appendChild(closeButton);
		return closeButton;
	}

	// Adds the close button and makes the header (or the whole card) the drag handle.
	finish() {
		this.addCloseButton();
		this.cleanup = makeDraggable(this.element, this.header);
		return this;
	}

	// Top-right. In the desktop app, mount in the content pane (below its toolbar) so cards don't
	// cover the window controls; the mount must be a positioning context for top/right to apply.
	// The viewport can later shrink (window resize, phone rotation, on-screen keyboard): the card is
	// then pulled back up, so it stays reachable.
	show() {
		const desktopMount = document.querySelector('.dframe-content-inner');
		const mount = desktopMount || document.body;
		this.element.style.right = '20px';
		if (desktopMount) {
			if (getComputedStyle(desktopMount).position === 'static') {
				desktopMount.style.position = 'relative';
			}
			this.element.style.position = 'absolute';
		}
		mount.appendChild(this.element);
		restackCards(mount);
		// A stacked card is laid out again with the stack; a dragged one is only pulled up, so it otherwise
		// stays where it was put.
		this.keepInView = () => {
			if (!this.element.style.left) {
				restackCards(mount);
				return;
			}
			this.element.style.top = `${Math.max(0, Math.min(this.element.offsetTop, maxCardTop(mount, this.element)))}px`;
		};
		window.addEventListener('resize', this.keepInView);
	}

	remove() {
		if (this.cleanup) this.cleanup();
		if (this.keepInView) window.removeEventListener('resize', this.keepInView);
		const mount = this.element.parentElement;
		this.element.remove();
		if (mount) restackCards(mount); // the cards below move up into the room it leaves
	}
}

// How much of a card stays visible under the next one when the stack has to overlap: its header.
const CARD_HEADER_PEEK = 40;

// The lowest top that keeps a card in view. The mount can be taller than the viewport.
function maxCardTop(mount, card) {
	const mountTop = mount === document.body ? 0 : mount.getBoundingClientRect().top;
	return window.innerHeight - mountTop - card.offsetHeight - 10;
}

// Both extensions show cards (often together, right after an update) and share the DOM, so every
// card in the mount is laid out as one stack: by stackOrder, then in the order they appeared. It runs
// on every show(), because the other extension's card may well appear first. Never past the bottom,
// where a card couldn't be reached or closed: out of room, it overlaps the lower end of the stack.
// Dragged cards (they get a left) keep their place and leave the stack.
function restackCards(mount) {
	const minTop = mount === document.body ? 20 : 40;
	const cards = [...mount.querySelectorAll(':scope > [data-claude-ext-card]')]
		.filter((card) => !card.style.left)
		.sort((a, b) => (Number(a.getAttribute('data-claude-ext-card')) || 0) - (Number(b.getAttribute('data-claude-ext-card')) || 0));
	let top = minTop;
	let prevTop = -Infinity;
	cards.forEach((card, i) => {
		// Pulled up to stay in view, but never over the previous card's header (its title and close
		// button): if the stack is taller than the viewport, the lower end of a card may go off-screen
		// instead, and closing any card makes room.
		const cardTop = Math.max(minTop, prevTop + CARD_HEADER_PEEK, Math.min(top, maxCardTop(mount, card)));
		card.style.top = `${cardTop}px`;
		prevTop = cardTop;
		// Paint in stack order too, so where cards overlap, each covers only the end of the one above.
		card.style.zIndex = String(10000 + i);
		top = card.offsetTop + card.offsetHeight + 10;
	});
}

// update_patchnotes.txt in the extension root (web-accessible): one highlight per non-empty line.
async function readPatchNotes() {
	try {
		const response = await fetch(chrome.runtime.getURL('update_patchnotes.txt'));
		if (!response.ok) return [];
		return (await response.text()).split('\n').map(line => line.trim()).filter(Boolean);
	} catch (error) {
		(globalThis.createLogger?.('Cards') ?? console).error('Failed to load patch notes:', error);
		return [];
	}
}

/**
 * Show the version-update card after an update, and the rate reminder once, rateDelayDays after the
 * first run. Nothing is shown on a fresh install.
 * @param {Object} opts
 * @param {string} opts.name - Extension name for the card titles
 * @param {string} opts.releasesUrl - Full release notes
 * @param {{chrome: string, firefox: string}} opts.storeUrls - Store pages for the rate reminder
 * @param {{get: (name: string) => Promise<any>, set: (name: string, value: any) => Promise<void>}} opts.storage
 *   Persists 'previousVersion', 'rateReminderTime' and 'rateReminderShown' wherever the extension likes.
 * @param {number} [opts.rateDelayDays=8]
 * @param {number} [opts.stackOrder=0] - Where these cards go among other cards on the page, lower
 *   first (see restackCards)
 * @param {(card: FloatingCard, kind: 'version'|'rate') => void} [opts.decorate] - Add extra content
 *   to a card before it is finished and shown
 */
async function initNotificationCards({ name, releasesUrl, storeUrls, storage, rateDelayDays = 8, stackOrder = 0, decorate = null }) {
	// Let the page (and any other extension's UI) settle first.
	await new Promise(resolve => setTimeout(resolve, 1000));

	const currentVersion = chrome.runtime.getManifest().version;
	const [previousVersion, rateReminderTime, rateReminderShown] = await Promise.all(
		['previousVersion', 'rateReminderTime', 'rateReminderShown'].map(key => storage.get(key)));
	if (previousVersion !== currentVersion) {
		await storage.set('previousVersion', currentVersion);
		// No previous version: a fresh install, nothing to announce.
		if (previousVersion) {
			const card = new FloatingCard({ stackOrder });
			card.addHeader(name);
			card.addText(localize('shared.notif.updated_to', { version: currentVersion }));
			const highlights = await readPatchNotes();
			if (highlights.length) card.addList(localize('shared.notif.whats_new'), highlights);
			card.addLink(localize('shared.notif.view_release_notes'), releasesUrl);
			card.addKofiButton();
			decorate?.(card, 'version');
			card.finish().show();
		}
	}

	if (!rateReminderTime) {
		await storage.set('rateReminderTime', Date.now() + rateDelayDays * 24 * 60 * 60 * 1000);
	} else if (!rateReminderShown && Date.now() >= rateReminderTime) {
		await storage.set('rateReminderShown', true);
		const card = new FloatingCard({ stackOrder });
		card.addHeader(name);
		card.addText(localize('shared.notif.enjoying', { name }));
		card.addText(localize('shared.notif.consider_rating'), { bold: true });
		card.addImageButton(isChromeBrowser() ? storeUrls.chrome : storeUrls.firefox, CARD_ASSETS.rate, localize('shared.notif.rate_alt'));
		decorate?.(card, 'rate');
		card.finish().show();
	}
}
