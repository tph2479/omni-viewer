/**
 * EPUB Viewer Controller
 * Engine: foliate-js (https://github.com/johnfactotum/foliate-js)
 *
 * State is grouped into 4 logical buckets:
 *   ui       — panel/sidebar open states, loading, error
 *   book     — metadata from the opened book (toc, title, author, cover)
 *   reading  — current position / progress while reading
 *   settings — user preferences (font, size, spacing, dark mode)
 *   search   — query + results
 */

/** Context key for accessing the epub controller in child components. */
export const EPUB_CONTEXT_KEY = Symbol('epub-context');
export type EpubViewerContext = ReturnType<typeof createEpubViewerState>;

// ─── Types ───────────────────────────────────────────────────────────────────

export type TocItem = {
	label: string;
	href: string;
	subitems?: TocItem[];
};

export type SearchResult = {
	cfi: string;
	excerpt: string;
	index: number;
	label?: string;
};

export type FontOption = {
	label: string;
	value: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

export const FONT_OPTIONS: FontOption[] = [
	{ label: 'System Default', value: 'inherit' },
	{ label: 'Georgia', value: 'Georgia, serif' },
	{ label: 'Merriweather', value: '"Merriweather", Georgia, serif' },
	{ label: 'Inter', value: '"Inter", system-ui, sans-serif' },
	{ label: 'Source Serif', value: '"Source Serif 4", Georgia, serif' },
];

export const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
export const CONTENT_WIDTH_OPTIONS = [
	{ label: '50%', value: '50' },
	{ label: '60%', value: '60' },
	{ label: '70%', value: '70' },
	{ label: '80%', value: '80' },
	{ label: '90%', value: '90' },
	{ label: '100%', value: '100' },
];

export const LINE_SPACING_OPTIONS = [
	{ label: '1.0', value: '1.0' },
	{ label: '1.2', value: '1.2' },
	{ label: '1.4', value: '1.4' },
	{ label: '1.6', value: '1.6' },
	{ label: '1.8', value: '1.8' },
	{ label: '2.0', value: '2.0' },
];

// ─── Controller ──────────────────────────────────────────────────────────────

export function createEpubViewerState(filePath: string) {
	// ── UI state ──────────────────────────────────────────────────────────────
	const ui = $state({
		isLoading: false,
		errorMsg: '',
		isTocOpen: false,
		isSearchOpen: false,
		isThemeMenuOpen: false,
		isControlsVisible: false,
		controlsHideTimer: null as ReturnType<typeof setTimeout> | null,
		isMobile: typeof window !== 'undefined' && window.innerWidth <= 640,
	});

	// ── Book metadata (populated after open) ─────────────────────────────────
	const book = $state({
		title: '',
		author: '',
		coverUrl: '',
		toc: [] as TocItem[],
	});

	// ── Reading progress ──────────────────────────────────────────────────────
	const reading = $state({
		fraction: 0,
		currentTocLabel: '',
	});

	// ── User settings ─────────────────────────────────────────────────────────
	const settings = $state({
		isDark: false,
		theme: 'system' as 'system' | 'sepia' | 'black',
		fontFamily: 'inherit',
		fontSize: 18,
		lineSpacing: '1.6',
		contentWidthDesktop: '60',
		contentWidthMobile: '100',
		get contentWidth() {
			return ui.isMobile ? this.contentWidthMobile : this.contentWidthDesktop;
		},
		set contentWidth(val: string) {
			if (ui.isMobile) this.contentWidthMobile = val;
			else this.contentWidthDesktop = val;
		}
	});

	function initThemeSync() {
		if (typeof document === 'undefined') return;
		const mode = document.documentElement.getAttribute('data-mode');
		settings.isDark = mode === 'dark';
	}

	$effect(() => {
		initThemeSync();
		const observer = new MutationObserver((mutations) => {
			for (const mut of mutations) {
				if (mut.attributeName === 'data-mode') {
					settings.isDark = document.documentElement.getAttribute('data-mode') === 'dark';
					applyStyles();
				}
			}
		});
		observer.observe(document.documentElement, { attributes: true });
		return () => observer.disconnect();
	});

	// ── Search ────────────────────────────────────────────────────────────────
	const search = $state({
		query: '',
		results: [] as SearchResult[],
		currentIndex: -1,
		isSearching: false,
		progress: 0, // 0-1 while searching
	});

	let searchAbortController: AbortController | null = null;

	// ── Internal references (not reactive) ────────────────────────────────────
	let viewEl: HTMLElement | null = null; // foliate-view DOM element
	let lastScrollTime = 0;
	const SCROLL_COOLDOWN = 600; // ms to prevent rapid skipping
	let containerEl: HTMLElement | null = null; // wrapper div
	let metadataLoaded = false; // guard against re-reading on every relocate

	// ─── Helpers ──────────────────────────────────────────────────────────────

	/** CSS injected into the book renderer on every settings change */
	function buildReaderCSS() {
		let bg = '#ffffff';
		let fg = '#1a1a1a';
		let linkColor = '#5755d9';

		const effectiveTheme = settings.theme === 'system' 
			? (settings.isDark ? 'dark' : 'light') 
			: settings.theme;

		if (effectiveTheme === 'dark') {
			bg = '#333333';
			fg = '#eeeeee';
			linkColor = '#9b99ff';
		} else if (effectiveTheme === 'black') {
			bg = '#000000';
			fg = '#ffffff';
			linkColor = '#9b99ff';
		} else if (effectiveTheme === 'sepia') {
			bg = '#f4ecd8';
			fg = '#5b4636';
			linkColor = '#8b5a2b';
		}

		const isDefaultTheme = effectiveTheme === 'light';
		// Nuclear approach: target tags with high specificity if not in light mode
		const textTags = 'p, span, div, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, table, tr, td, th, article, section, header, footer, main, caption, em, strong, i, b, u, s, del, ins, q';
		const chainedTags = textTags.split(', ').map(t => `html body ${t}`).join(', ');
		
		// Target pseudo-elements for common block tags (p, div, li) to catch drop caps/initial lines
		const pseudoTags = ['p', 'div', 'li', 'span'].map(t => `html body ${t}::first-letter, html body ${t}::first-line`).join(', ');

		const aggressiveOverrides = isDefaultTheme ? '' : `
			${chainedTags} {
				color: ${fg} !important;
				background-color: transparent !important;
			}
			${pseudoTags} {
				color: inherit !important;
				background-color: transparent !important;
			}
			html body a, html body a *, html body :link, html body :visited {
				color: ${linkColor} !important;
				background-color: transparent !important;
			}
			html body mark, html body mark * {
				color: #000000 !important;
				background-color: #ffff00 !important; 
			}
		`;

		return `
			html {
				margin: 0 !important;
				padding: 0 !important;
				width: 100% !important;
				box-sizing: border-box !important;
			}
			body {
				background: ${bg} !important;
				color: ${fg} !important;
				font-family: ${settings.fontFamily};
				font-size: ${settings.fontSize}px !important;
				padding-left: 1.5rem !important;
				padding-right: 1.5rem !important;
				box-sizing: border-box !important;
			}
			p, li, blockquote, dd, div {
				line-height: ${Number(settings.lineSpacing)} !important;
				text-align: justify;
			}
			a { color: ${linkColor}; }
			img { max-width: 100%; height: auto; }
			pre { white-space: pre-wrap !important; }
			${aggressiveOverrides}
		`;
	}

	/** Apply current CSS + flow to the renderer */
	function applyStyles() {
		if (!viewEl) return;

		viewEl.style.width = '100%';
		viewEl.style.margin = '0';

		const renderer = (viewEl as any).renderer;
		if (!renderer) return;
		renderer.setStyles?.(buildReaderCSS());
		renderer.setAttribute('flow', 'scrolled');

		// Use foliate's native max-inline-size attribute to control content width.
		// This sets the columnWidth used in scrolled mode and lets foliate handle
		// both the body max-width AND iframe height calculation properly.
		const pct = Number(settings.contentWidth);
		const containerWidth = containerEl?.getBoundingClientRect().width ?? window.innerWidth;
		const maxWidth = Math.round(containerWidth * pct / 100);
		renderer.setAttribute('max-inline-size', `${maxWidth}px`);
		// Remove foliate's default 7% gap and 48px margin so only our body
		// padding (1.5rem each side) provides spacing.
		renderer.setAttribute('gap', '0%');
		renderer.setAttribute('margin', '0px');
	}

	function setupResizeHandler() {
		let timer: ReturnType<typeof setTimeout>;
		const handler = () => {
			ui.isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
			clearTimeout(timer);
			timer = setTimeout(() => applyStyles(), 100);
		};
		window.addEventListener('resize', handler);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('resize', handler);
		};
	}

	// ─── Core: init + open ────────────────────────────────────────────────────

	/**
	 * Call this once inside `onMount` with the wrapper div element.
	 * It imports view.js (registers the custom element) and opens the book.
	 */
	async function init(el: HTMLElement) {
		containerEl = el;
		ui.isLoading = true;
		ui.errorMsg = '';

		try {
			initThemeSync();
			await import('$lib/vendor/foliate-js/view.js');

			viewEl = document.createElement('foliate-view');
			viewEl.style.cssText = 'width:100%; height:100%; display:block; margin:0; padding:0; border:none;';
			containerEl.appendChild(viewEl);

			viewEl.addEventListener('load', onLoad);
			viewEl.addEventListener('relocate', onRelocate);

			const url = `/api/ebook?path=${encodeURIComponent(filePath)}`;
			const res = await fetch(url);
			if (!res.ok) throw new Error(`Failed to load ebook (Status: ${res.status})`);
			const blob = await res.blob();
			
			// Foliate-js uses file extension/mimetype to determine the format.
			// Passing our API url string breaks this because the URL pathname has no extension.
			// We manually construct a File object with a generic name but correct extension.
			let ext = filePath.split('.').pop()?.toLowerCase();
			if (!['epub', 'cbz', 'pdf', 'fb2', 'mobi'].includes(ext ?? '')) ext = 'epub';
			const bookFile = new File([blob], 'book.' + ext, { type: blob.type });

			await (viewEl as any).open(bookFile);
			await (viewEl as any).init({ lastLocation: null, showTextStart: true });

			// Set scrolled flow + initial styles right away
			(viewEl as any).renderer?.setAttribute('flow', 'scrolled');
			applyStyles();
		} catch (e: any) {
			console.error('EPUB open error:', e);
			ui.errorMsg = e?.message ?? 'Failed to open EPUB';
		} finally {
			ui.isLoading = false;
		}
	}

	// Track documents that already have listeners
	const capturedDocs = new WeakSet<Document>();

	function setupIframeKeyboardCapture() {
		const renderer = (viewEl as any).renderer;
		if (!renderer) return;

		const contents = renderer.getContents?.();
		if (!contents?.length) return;

		for (const c of contents) {
			if (!c?.doc || capturedDocs.has(c.doc)) continue;
			capturedDocs.add(c.doc);

			c.doc.addEventListener('keydown', (e: Event) => {
				const ke = e as KeyboardEvent;
				const isShortcut =
					ke.key === 'Escape' ||
					ke.key === 'Tab' ||
					ke.key === 'ArrowLeft' ||
					ke.key === 'ArrowRight' ||
					ke.key === 'ArrowUp' ||
					ke.key === 'ArrowDown' ||
					(ke.key === ' ' && !ke.ctrlKey && !ke.metaKey) ||
					ke.key === 'PageDown' ||
					ke.key === 'PageUp';

				if (isShortcut) {
					e.stopPropagation();
					e.preventDefault();
					window.dispatchEvent(new KeyboardEvent('keydown', {
						key: ke.key,
						code: ke.code,
						ctrlKey: ke.ctrlKey,
						metaKey: ke.metaKey,
						shiftKey: ke.shiftKey,
						bubbles: true,
						cancelable: true,
					}));
				}
			}, true);
		}
	}

	// ─── Event handlers (book events) ─────────────────────────────────────────

	function onLoad() {
		applyStyles();
		setupIframeKeyboardCapture();
		setupIframeWheelCapture();
		cleanupResize = setupResizeHandler();
	}

	// Track iframe docs already captured for wheel events
	const capturedWheelDocs = new WeakSet<Document>();

	function setupIframeWheelCapture() {
		const renderer = (viewEl as any)?.renderer;
		if (!renderer) return;
		const contents = renderer.getContents?.();
		if (!contents?.length) {
			// Fallback: try querySelector for a single iframe
			const doc = viewEl?.querySelector('iframe')?.contentDocument;
			if (doc && !capturedWheelDocs.has(doc)) {
				capturedWheelDocs.add(doc);
				doc.addEventListener('wheel', handleWheel, { passive: true });
			}
			return;
		}
		for (const c of contents) {
			if (!c?.doc || capturedWheelDocs.has(c.doc)) continue;
			capturedWheelDocs.add(c.doc);
			c.doc.addEventListener('wheel', handleWheel, { passive: true });
		}
	}

	function handleWheel(e: WheelEvent) {
		const view = viewEl as any;
		const renderer = view?.renderer;
		if (!renderer) return;

		const now = Date.now();
		if (now - lastScrollTime < SCROLL_COOLDOWN) return;

		// Ignore very small scroll movements (touchpads etc)
		if (Math.abs(e.deltaY) < 40) return;

		// Since we use 'scrolled' mode, we only advance section if at the very end/start
		const atSectionBottom = renderer.viewSize - renderer.end <= 20;
		const atSectionTop = renderer.start <= 20;

		if (e.deltaY > 0 && atSectionBottom) {
			view.next();
			lastScrollTime = now;
		} else if (e.deltaY < 0 && atSectionTop) {
			view.prev();
			lastScrollTime = now;
		}
	}

	function onRelocate(e: Event) {
		const { fraction, tocItem } = (e as CustomEvent).detail ?? {};
		reading.fraction = fraction ?? 0;
		reading.currentTocLabel = tocItem?.label ?? '';

		// Populate book metadata + TOC on very first relocate only.
		// Bug fix: previously used `if (!book.title)` which re-ran on every relocate
		// for books with empty/missing titles, causing redundant metadata reads.
		if (!metadataLoaded) {
			metadataLoaded = true;
			const b = (viewEl as any)?.book;
			if (b) {
				book.title = resolveLanguageMap(b.metadata?.title) ?? '';
				book.author = resolveContributor(b.metadata?.author) ?? '';
				book.toc = (b.toc ?? []) as TocItem[];

				// Cover (async, non-blocking)
				b.getCover?.()?.then((blob: Blob | null) => {
					if (blob) book.coverUrl = URL.createObjectURL(blob);
				});
			}
		}
	}

	// ─── Navigation ──────────────────────────────────────────────────────────

	function goTo(target: string | number) {
		(viewEl as any)?.goTo(target);
	}

	function goToFraction(frac: number) {
		(viewEl as any)?.goToFraction(frac);
	}

	function nextChapter() {
		const view = viewEl as any;
		const renderer = view?.renderer;
		if (!renderer) return;
		
		const contents = renderer.getContents?.();
		if (!contents?.length) return;
		
		const currentIndex = contents[0].index;
		view.goTo(currentIndex + 1);
	}

	function prevChapter() {
		const view = viewEl as any;
		const renderer = view?.renderer;
		if (!renderer) return;
		
		const contents = renderer.getContents?.();
		if (!contents?.length) return;
		
		const currentIndex = contents[0].index;
		if (currentIndex > 0) {
			view.goTo(currentIndex - 1);
		}
	}

	// ─── Settings: font, size, spacing, dark mode ─────────────────────────────

	function setFont(fontValue: string) {
		settings.fontFamily = fontValue;
		applyStyles();
	}

	function setFontSize(px: number) {
		settings.fontSize = Math.max(12, Math.min(32, px));
		applyStyles();
	}

	function setLineSpacing(val: string) {
		settings.lineSpacing = val;
		applyStyles();
	}

	function setContentWidth(val: string) {
		settings.contentWidth = val;
		applyStyles();
	}

	function setTheme(t: 'system' | 'sepia' | 'black') {
		settings.theme = t;
		// Sync isDark flag based on chosen theme or system status
		if (t === 'system') {
			const mode = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-mode') : 'light';
			settings.isDark = (mode === 'dark');
		} else {
			settings.isDark = (t === 'black');
		}
		applyStyles();
	}

	function toggleDark() {
		const next: Record<string, 'system' | 'sepia' | 'black'> = {
			'system': 'sepia',
			'sepia': 'black',
			'black': 'system'
		};
		setTheme(next[settings.theme] || 'system');
	}

	// ─── Search ───────────────────────────────────────────────────────────────

	function handlePageKey(key: string, shiftKey = false) {
		const renderer = (viewEl as any)?.renderer;
		if (!renderer) return;
		if (key === 'PageDown' || key === 'ArrowRight' || key === 'ArrowDown' || key === ' ') {
			if (key === ' ' && shiftKey) {
				renderer.prev();
			} else if (key === 'ArrowRight' || key === 'ArrowDown') {
				renderer.next(40);
			} else {
				renderer.next();
			}
		} else if (key === 'PageUp' || key === 'ArrowLeft' || key === 'ArrowUp') {
			if (key === 'ArrowLeft' || key === 'ArrowUp') {
				renderer.prev(40);
			} else {
				renderer.prev();
			}
		}
	}

	async function runSearch(query: string) {
		if (!viewEl || !query.trim()) return;

		// Bug fix: abort any in-flight search before starting a new one, to prevent
		// zombie generators from writing stale results into the new results array.
		if (searchAbortController) {
			searchAbortController.abort();
			searchAbortController = null;
		}

		// Smart Re-search: If query is same and we have results, just filter out passed sections
		if (query === search.query && search.results.length > 0) {
			const currentIndex = (viewEl as any).renderer.getContents()?.[0]?.index ?? 0;
			const newResults = search.results.filter(r => r.index >= currentIndex);
			
			if (newResults.length > 0 && newResults.length < search.results.length) {
				search.results = newResults;
				search.currentIndex = -1;
				return; // Instant update
			}
		}

		search.query = query;
		search.results = [];
		search.currentIndex = -1;
		search.isSearching = true;
		search.progress = 0;

		searchAbortController = new AbortController();

		try {
			const currentIndex = (viewEl as any).renderer.getContents()?.[0]?.index ?? 0;
			const iter = (viewEl as any).search({ query, startIndex: currentIndex });
			for await (const result of iter) {
				if (searchAbortController.signal.aborted) break;
				if (result === 'done') break;
				if (result.progress != null) {
					search.progress = result.progress;
					continue;
				}
				if (result.subitems) {
					const label = result.label ?? '';
					for (const sub of result.subitems) {
						const exc = sub.excerpt;
						const excerptHtml = typeof exc === 'string'
							? exc
							: `${exc.pre ?? ''}<mark>${exc.match ?? ''}</mark>${exc.post ?? ''}`;
						search.results.push({
							cfi: sub.cfi,
							excerpt: excerptHtml,
							index: sub.index,
							label,
						});
					}
				}
			}
			if (search.results.length > 0) {
				search.currentIndex = 0;
				goTo(search.results[0].cfi);
			}
		} catch (e) {
			console.error('Search error:', e);
		} finally {
			search.isSearching = false;
			searchAbortController = null;
		}
	}

	function clearSearch() {
		if (searchAbortController) {
			searchAbortController.abort();
		}
		(viewEl as any)?.clearSearch();
		search.query = '';
		search.results = [];
		search.currentIndex = -1;
		search.isSearching = false;
		search.progress = 0;
	}

	function stopSearch() {
		searchAbortController?.abort();
		search.isSearching = false;
		search.progress = 0;
	}

	function nextSearchResult() {
		if (!search.results.length) return;
		search.currentIndex = (search.currentIndex + 1) % search.results.length;
		goTo(search.results[search.currentIndex].cfi);
	}

	function prevSearchResult() {
		if (!search.results.length) return;
		search.currentIndex =
			(search.currentIndex - 1 + search.results.length) % search.results.length;
		goTo(search.results[search.currentIndex].cfi);
	}

	// ─── UI helpers ──────────────────────────────────────────────────────────

	function showControls() {
		ui.isControlsVisible = true;
		if (ui.controlsHideTimer) clearTimeout(ui.controlsHideTimer);
		ui.controlsHideTimer = setTimeout(() => {
			if (!ui.isTocOpen && !ui.isSearchOpen) {
				ui.isControlsVisible = false;
			}
			ui.controlsHideTimer = null;
		}, 2500);
	}

	let cleanupResize: (() => void) | null = null;

	// ─── Cleanup ──────────────────────────────────────────────────────────────

	function destroy() {
		clearSearch();
		if (ui.controlsHideTimer) clearTimeout(ui.controlsHideTimer);
		if (book.coverUrl) URL.revokeObjectURL(book.coverUrl);
		cleanupResize?.();
		cleanupResize = null;
		metadataLoaded = false;
		(viewEl as any)?.close?.();
		viewEl?.remove();
		viewEl = null;
		containerEl = null;
	}

	// ─── Utilities ────────────────────────────────────────────────────────────

	function resolveLanguageMap(x: any): string {
		if (!x) return '';
		if (typeof x === 'string') return x;
		const keys = Object.keys(x);
		return keys.length ? x[keys[0]] : '';
	}

	function resolveContributor(x: any): string {
		if (!x) return '';
		if (typeof x === 'string') return x;
		if (Array.isArray(x)) return x.map(resolveContributor).join(', ');
		return resolveLanguageMap(x?.name);
	}

	// ─── Public API ──────────────────────────────────────────────────────────

	return {
		// Grouped state (reactive)
		ui,
		book,
		reading,
		settings,
		search,

		// Lifecycle
		init,
		destroy,

		// Navigation
		goTo,
		goToFraction,
		nextChapter,
		prevChapter,

		// Settings
		setFont,
		setFontSize,
		setLineSpacing,
		setContentWidth,
		setTheme,
		toggleDark,

		// Search
		runSearch,
		clearSearch,
		nextSearchResult,
		prevSearchResult,
		stopSearch,
		handlePageKey,

		// UI
		showControls,
	};
}
