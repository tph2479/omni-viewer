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

// ─── Types ───────────────────────────────────────────────────────────────────

export type TocItem = {
	label: string;
	href: string;
	subitems?: TocItem[];
};

export type SearchResult = {
	cfi: string;
	excerpt: string;
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

// ─── Controller ──────────────────────────────────────────────────────────────

export function createEpubViewerState(filePath: string) {
	// ── UI state ──────────────────────────────────────────────────────────────
	const ui = $state({
		isLoading: false,
		errorMsg: '',
		isTocOpen: false,
		isSearchOpen: false,
		isControlsVisible: false,
		controlsHideTimer: null as ReturnType<typeof setTimeout> | null,
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
		fontFamily: 'inherit',
		fontSize: 18,
		lineSpacing: 1.6,
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

	// ── Internal references (not reactive) ────────────────────────────────────
	let viewEl: HTMLElement | null = null; // foliate-view DOM element
	let containerEl: HTMLElement | null = null; // wrapper div

	// ─── Helpers ──────────────────────────────────────────────────────────────

	/** CSS injected into the book renderer on every settings change */
	function buildReaderCSS() {
		const bg = settings.isDark ? '#1a1a2e' : '#f8f4ef';
		const fg = settings.isDark ? '#d4cfc8' : '#2c2825';
		const linkColor = settings.isDark ? '#90caf9' : '#1565c0';

		return `
			:root {
				--epub-bg: ${bg};
				--epub-fg: ${fg};
			}
			html, body {
				background: ${bg} !important;
				color: ${fg} !important;
				font-family: ${settings.fontFamily};
				font-size: ${settings.fontSize}px !important;
			}
			p, li, blockquote, dd {
				line-height: ${settings.lineSpacing};
				text-align: justify;
			}
			a { color: ${linkColor}; }
			img { max-width: 100%; height: auto; }
			pre { white-space: pre-wrap !important; }
		`;
	}

	/** Apply current CSS + flow to the renderer */
	function applyStyles() {
		if (!viewEl) return;
		const renderer = (viewEl as any).renderer;
		if (!renderer) return;
		renderer.setStyles?.(buildReaderCSS());
		renderer.setAttribute('flow', 'scrolled');
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
			await import('$lib/foliate-js/view.js');

			viewEl = document.createElement('foliate-view');
			viewEl.style.cssText = 'width:100%; height:100%; display:block;';
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

	// ─── Event handlers (book events) ─────────────────────────────────────────

	function onLoad() {
		// Refresh styles each time a new section loads (e.g. after font change)
		applyStyles();
	}

	function onRelocate(e: Event) {
		const { fraction, tocItem } = (e as CustomEvent).detail ?? {};
		reading.fraction = fraction ?? 0;
		reading.currentTocLabel = tocItem?.label ?? '';

		// Populate book metadata + TOC on very first relocate
		if (!book.title) {
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

	// ─── Settings: font, size, spacing, dark mode ─────────────────────────────

	function setFont(fontValue: string) {
		settings.fontFamily = fontValue;
		applyStyles();
	}

	function setFontSize(px: number) {
		settings.fontSize = Math.max(12, Math.min(32, px));
		applyStyles();
	}

	function setLineSpacing(val: number) {
		settings.lineSpacing = val;
		applyStyles();
	}

	function toggleDark() {
		settings.isDark = !settings.isDark;
		applyStyles();
	}

	// ─── Search ───────────────────────────────────────────────────────────────

	async function runSearch(query: string) {
		if (!viewEl || !query.trim()) return;
		search.query = query;
		search.results = [];
		search.currentIndex = -1;
		search.isSearching = true;
		search.progress = 0;

		try {
			const iter = (viewEl as any).search({ query });
			for await (const result of iter) {
				if (result === 'done') break;
				if (result.progress != null) {
					search.progress = result.progress;
					continue;
				}
				// result has { subitems: [{cfi, excerpt}] } or { cfi, excerpt }
				if (result.subitems) {
					search.results.push(...result.subitems);
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
		}
	}

	function clearSearch() {
		(viewEl as any)?.clearSearch();
		search.results = [];
		search.query = '';
		search.currentIndex = -1;
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

	// ─── Cleanup ──────────────────────────────────────────────────────────────

	function destroy() {
		clearSearch();
		if (ui.controlsHideTimer) clearTimeout(ui.controlsHideTimer);
		if (book.coverUrl) URL.revokeObjectURL(book.coverUrl);
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

		// Settings
		setFont,
		setFontSize,
		setLineSpacing,
		toggleDark,

		// Search
		runSearch,
		clearSearch,
		nextSearchResult,
		prevSearchResult,

		// UI
		showControls,
	};
}
