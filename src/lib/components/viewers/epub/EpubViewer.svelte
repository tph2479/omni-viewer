<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { createEpubViewerState, FONT_OPTIONS, FONT_SIZE_OPTIONS, CONTENT_WIDTH_OPTIONS, LINE_SPACING_OPTIONS, type SearchResult } from './epubViewer.svelte.ts';
	import {
		Menu,
		X,
		Search,
		Sun,
		Moon,
		ChevronLeft,
		ChevronRight,
		Type,
		ALargeSmall,
		MoveHorizontal,
		MoveVertical,
		Palette,
	} from 'lucide-svelte';

	let { filePath, onClose }: { filePath: string; onClose?: () => void } = $props();
	// Note: filePath is intentionally captured once at mount — re-opening needs destroy+reinit

	// ── Controller ──────────────────────────────────────────────────────
	const ctrl = createEpubViewerState(untrack(() => filePath));
	const { ui, book, reading, settings, search } = ctrl;

	// ── DOM refs ────────────────────────────────────────────────────────
	let containerEl: HTMLElement;
	let searchInputEl: HTMLInputElement = $state(undefined as unknown as HTMLInputElement);
	let tocListEl = $state<HTMLElement>();
	let searchResultsEl = $state<HTMLElement>();

	$effect(() => {
		if (ui.isTocOpen) {
			requestAnimationFrame(() => {
				const activeBtn = tocListEl?.querySelector('.toc-item.active');
				activeBtn?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			});
		}
	});

	// ── Auto-scroll Search to current match ─────────────────────────────
	$effect(() => {
		if (ui.isSearchOpen && search.currentIndex >= 0 && searchResultsEl) {
			requestAnimationFrame(() => {
				const selected = searchResultsEl?.querySelector('li.selected');
				selected?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			});
		}
	});

	// ── Grouped Search Results ──────────────────────────────────────────
	const groupedSearch = $derived.by(() => {
		const groups: { label: string; items: { result: SearchResult; originalIndex: number }[] }[] = [];
		let currentGroup: { label: string; items: { result: SearchResult; originalIndex: number }[] } | null = null;

		search.results.forEach((result, i) => {
			const label = result.label || '';
			if (!currentGroup || currentGroup.label !== label) {
				currentGroup = { label, items: [] };
				groups.push(currentGroup);
			}
			currentGroup.items.push({ result, originalIndex: i });
		});

		return groups;
	});

	// ── Lifecycle ───────────────────────────────────────────────────────
	onMount(() => ctrl.init(containerEl));
	onDestroy(() => ctrl.destroy());

	// ── Keyboard shortcut ────────────────────────────────────────────────
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			if (ui.isSearchOpen) {
				ui.isSearchOpen = false;
			} else {
				ui.isSearchOpen = true;
				ui.isTocOpen = false;
				setTimeout(() => searchInputEl?.focus(), 50);
			}
		}
		if (e.key === 'Tab') {
			if (ui.isSearchOpen) return;
			e.preventDefault();
			ui.isTocOpen = !ui.isTocOpen;
			if (ui.isTocOpen) ui.isSearchOpen = false;
		}
		if (e.key === 'Escape') {
			if (ui.isSearchOpen) {
				ui.isSearchOpen = false;
				e.preventDefault();
			} else if (ui.isTocOpen) {
				ui.isTocOpen = false;
				e.preventDefault();
			} else {
				onClose?.();
			}
		}
		if (['PageDown', 'PageUp', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) {
			if (e.key === ' ' && (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA')) return;
			ctrl.handlePageKey(e.key, e.shiftKey);
			e.preventDefault();
		}
	}

	async function handleSearchSubmit(e: SubmitEvent) {
		e.preventDefault();
		await ctrl.runSearch(search.query);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- ── Root wrapper ────────────────────────────────────────────────────── -->
<div
	class="epub-root"
	class:dark={settings.isDark}
	onmousemove={ctrl.showControls}
	onclick={() => containerEl?.focus()}
	role="application"
	aria-label="EPUB Reader"
>
	<!-- ── Loading overlay ──────────────────────────────────────────────── -->
	{#if ui.isLoading}
		<div class="loading-overlay">
			<div class="spinner"></div>
			<p>Opening book…</p>
		</div>
	{/if}

	<!-- ── Error state ──────────────────────────────────────────────────── -->
	{#if ui.errorMsg}
		<div class="error-overlay">
			<p>⚠ {ui.errorMsg}</p>
		</div>
	{/if}

	<!-- ── TOC Drawer ───────────────────────────────────────────────────── -->
	{#if ui.isTocOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="drawer-backdrop" onclick={() => (ui.isTocOpen = false)}></div>
		<aside class="toc-drawer" aria-label="Table of Contents">
			<div class="toc-header">
				<h3>Contents</h3>
				<button onclick={() => (ui.isTocOpen = false)} aria-label="Close TOC">
					<X size={18} />
				</button>
			</div>
			<nav class="toc-list" bind:this={tocListEl}>
				{#each book.toc as item (item.href)}
					<button
						class="toc-item"
						class:active={reading.currentTocLabel === item.label}
						onclick={() => {
							ctrl.goTo(item.href);
							ui.isTocOpen = false;
						}}
					>
						{item.label}
					</button>
					{#if item.subitems}
						{#each item.subitems as sub (sub.href)}
							<button
								class="toc-item toc-sub"
								onclick={() => {
									ctrl.goTo(sub.href);
									ui.isTocOpen = false;
								}}
							>
								{sub.label}
							</button>
						{/each}
					{/if}
				{/each}
			</nav>
		</aside>
	{/if}

	<!-- ── Floating toolbar ─────────────────────────────────────────────── -->
	<header class="toolbar" class:visible={ui.isControlsVisible || ui.isTocOpen || ui.isSearchOpen}>
		<!-- Left group -->
		<div class="toolbar-group">
			<!-- TOC toggle -->
			<button
				class="icon-btn"
				class:active={ui.isTocOpen}
				onclick={() => {
					ui.isTocOpen = !ui.isTocOpen;
					if (ui.isTocOpen) ui.isSearchOpen = false;
				}}
				title="Table of Contents"
				aria-label="Toggle TOC"
			>
				<Menu size={16} />
			</button>

			{#if book.title}
				<span class="book-title">{book.title}</span>
			{/if}
		</div>

		<!-- Right group -->
		<div class="toolbar-group">
			<!-- Font picker -->
			<label class="select-icon-wrapper" title="Font family">
				<span class="select-icon"><Type size={14} /></span>
				<select
					value={settings.fontFamily}
					onchange={(e) => ctrl.setFont((e.target as HTMLSelectElement).value)}
				>
					{#each FONT_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>

			<!-- Font size -->
			<label class="select-icon-wrapper" title="Font size">
				<span class="select-icon"><ALargeSmall size={16} /></span>
				<select
					value={settings.fontSize}
					onchange={(e) => ctrl.setFontSize(Number((e.target as HTMLSelectElement).value))}
				>
					{#each FONT_SIZE_OPTIONS as size (size)}
						<option value={size}>{size}px</option>
					{/each}
				</select>
			</label>

			<!-- Line spacing -->
			<label class="select-icon-wrapper" title="Line spacing">
				<span class="select-icon"><MoveVertical size={16} /></span>
				<select
					value={settings.lineSpacing}
					onchange={(e) => ctrl.setLineSpacing((e.target as HTMLSelectElement).value)}
				>
					{#each LINE_SPACING_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>

			<!-- Content width -->
			<label class="select-icon-wrapper" title="Content width">
				<span class="select-icon"><MoveHorizontal size={16} /></span>
				<select
					value={settings.contentWidth}
					onchange={(e) => ctrl.setContentWidth((e.target as HTMLSelectElement).value)}
				>
					{#each CONTENT_WIDTH_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>

			<!-- Theme picker -->
			<div class="theme-picker-container" class:expanded={ui.isThemeMenuOpen}>
				<button 
					class="icon-btn theme-toggle" 
					class:active={ui.isThemeMenuOpen}
					onclick={() => ui.isThemeMenuOpen = !ui.isThemeMenuOpen}
					title="Change theme"
				>
					<Palette size={16} />
				</button>
				<div class="theme-drawer">
					<button 
						class="theme-btn system" 
						class:active={settings.theme === 'system'} 
						onclick={() => {
							ctrl.setTheme('system');
							ui.isThemeMenuOpen = false;
						}}
						title="System theme"
					></button>
					<button 
						class="theme-btn sepia" 
						class:active={settings.theme === 'sepia'} 
						onclick={() => {
							ctrl.setTheme('sepia');
							ui.isThemeMenuOpen = false;
						}}
						title="Sepia theme"
					></button>
					<button 
						class="theme-btn black" 
						class:active={settings.theme === 'black'} 
						onclick={() => {
							ctrl.setTheme('black');
							ui.isThemeMenuOpen = false;
						}}
						title="Black theme"
					></button>
				</div>
			</div>

			<!-- Search toggle -->
			<button
				class="icon-btn"
				class:active={ui.isSearchOpen}
				onclick={() => {
					ui.isSearchOpen = !ui.isSearchOpen;
					if (ui.isSearchOpen) {
						ui.isTocOpen = false;
						setTimeout(() => searchInputEl?.focus(), 50);
					}
				}}
				title="Search (Ctrl+F)"
				aria-label="Toggle search"
			>
				<Search size={16} />
			</button>

			<!-- Close button -->
			<button
				class="icon-btn"
				onclick={() => onClose?.()}
				title="Close"
				aria-label="Close"
			>
				<X size={16} />
			</button>
		</div>
	</header>

	<!-- ── Search panel ─────────────────────────────────────────────────── -->
	{#if ui.isSearchOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="drawer-backdrop" onclick={() => (ui.isSearchOpen = false)}></div>
		<div class="search-panel">
			<div class="search-header">
				<span class="search-title">Search</span>
				<button class="icon-btn" onclick={() => ui.isSearchOpen = false} aria-label="Close search">
					<X size={16} />
				</button>
			</div>
			<form onsubmit={handleSearchSubmit} class="search-form">
				<div class="search-input-wrapper">
					<input
						bind:this={searchInputEl}
						bind:value={search.query}
						placeholder="Search in book…"
						aria-label="Search query"
					/>
					{#if search.query}
						<button 
							type="button" 
							class="clear-query-btn" 
							onclick={() => { search.query = ''; searchInputEl?.focus(); }}
							aria-label="Clear query"
						>
							<X size={14} />
						</button>
					{/if}
				</div>
				{#if search.isSearching}
					<button type="button" onclick={ctrl.stopSearch} class="stop-btn">
						Stop
					</button>
				{:else}
					<button type="submit">
						Search
					</button>
				{/if}
			</form>

			{#if search.isSearching}
				<div class="search-progress">
					<div class="search-progress-bar" style="width:{search.progress * 100}%"></div>
				</div>
			{/if}

			{#if search.results.length > 0}
				<div class="search-meta">
					<button onclick={ctrl.prevSearchResult} aria-label="Previous result">
						<ChevronLeft size={18} />
					</button>
					<span>{search.currentIndex + 1} / {search.results.length}</span>
					<button onclick={ctrl.nextSearchResult} aria-label="Next result">
						<ChevronRight size={18} />
					</button>
					<button onclick={ctrl.clearSearch} aria-label="Clear results" class="clear-btn">Clear</button>
				</div>
				<ol class="search-results" bind:this={searchResultsEl}>
					{#each groupedSearch as group}
						{#if group.label && (groupedSearch.length > 1 || group.label !== '')}
							<li class="search-chapter-header">{group.label}</li>
						{/if}
						{#each group.items as { result, originalIndex }}
							<li class:selected={originalIndex === search.currentIndex}>
								<button
									onclick={() => {
										search.currentIndex = originalIndex;
										ctrl.goTo(result.cfi);
										ui.isSearchOpen = false;
									}}
								>
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									<div class="search-excerpt">{@html result.excerpt}</div>
								</button>
							</li>
						{/each}
					{/each}
				</ol>
			{:else if !search.isSearching && search.query}
				<p class="search-empty">No results found.</p>
			{/if}
		</div>
	{/if}

	<!-- ── Book renderer ────────────────────────────────────────────────── -->
	<div 
		bind:this={containerEl} 
		class="reader-container"
	></div>

	<!-- ── Reading progress bar ─────────────────────────────────────────── -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="progress-bar-track" tabindex="-1">
		<div class="progress-bar-fill" style="width:{reading.fraction * 100}%"></div>
	</div>

	<!-- ── Status bar ───────────────────────────────────────────────────── -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="status-bar" tabindex="-1">
		<div class="status-bar-left">
			<span class="fraction">{Math.round(reading.fraction * 100)}%</span>
			<div class="status-bar-nav">
				<button
					class="icon-btn"
					onclick={() => ctrl.prevChapter()}
					title="Previous chapter"
					aria-label="Previous chapter"
				>
					<ChevronLeft size={20} />
				</button>
				<button
					class="icon-btn"
					onclick={() => ctrl.nextChapter()}
					title="Next chapter"
					aria-label="Next chapter"
				>
					<ChevronRight size={20} />
				</button>
			</div>
		</div>

		<div class="status-bar-center hide-scrollbar">
			{#if reading.currentTocLabel}
				<span class="toc-label">{reading.currentTocLabel}</span>
			{/if}
		</div>
	</div>
</div>

<style>
	/* ── Base ──────────────────────────────────────── */
	.epub-root {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: oklch(100% 0 none);
		color: oklch(18.22% 0 none);
		transition: background 0.3s, color 0.3s;
	}
	.epub-root.dark {
		background: oklch(32.5% 0 none);
		color: oklch(100% 0 none);
	}

	/* ── Reader container (fills remaining height) ── */
	.reader-container {
		flex: 1;
		overflow: hidden;
		position: relative;
	}
	@media (max-width: 640px) {
		.reader-container {
			overflow-x: auto;
		}
	}

	/* ── Loading / Error ────────────────────────────── */
	.loading-overlay,
	.error-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 100;
		background: inherit;
		gap: 1rem;
	}
	.spinner {
		width: 36px;
		height: 36px;
		border: 3px solid oklch(80.78% 0 none);
		border-top-color: oklch(57.05% 0.21 258.14deg);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ── Toolbar ──────────────────────────────────── */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		gap: 0.5rem;
		background: oklch(100% 0 none / 0.92);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid oklch(80.78% 0 none);
		z-index: 50;
	}
	.dark .toolbar {
		background: oklch(32.5% 0 none / 0.92);
		border-bottom-color: oklch(38.67% 0 none);
	}
	.toolbar.visible {
		opacity: 1;
		transform: translateY(0);
	}
	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.book-title {
		font-size: 0.85rem;
		opacity: 0.6;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.icon-btn {
		background: none;
		border: 1px solid transparent;
		border-radius: 6px;
		padding: 0;
		cursor: pointer;
		font-size: 1rem;
		color: inherit;
		transition: background 0.15s, border-color 0.15s;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.icon-btn:hover,
	.icon-btn.active {
		background: oklch(57.05% 0.21 258.14deg / 0.15);
		border-color: oklch(57.05% 0.21 258.14deg / 0.3);
	}
	/* ── Select with icon wrapper ────────────────── */
	.select-icon-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
	}
	.select-icon {
		display: none;
	}
	.select-icon-wrapper select {
		background: transparent;
		border: 1px solid oklch(71.22% 0 none);
		border-radius: 6px;
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		color: inherit;
		cursor: pointer;
	}
	.select-icon-wrapper select option {
		background: oklch(100% 0 none);
		color: oklch(18.22% 0 none);
	}
	.dark .select-icon-wrapper select {
		border-color: oklch(44.95% 0 none);
		color: oklch(100% 0 none);
	}
	.dark .select-icon-wrapper select option {
		background: oklch(32.5% 0 none);
		color: oklch(100% 0 none);
	}

	/* ── Theme picker ────────────────────────────── */
	.theme-picker-container {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		overflow: hidden;
	}
	.theme-drawer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 0;
		opacity: 0;
		visibility: hidden;
		transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, visibility 0.3s;
		pointer-events: none;
	}
	.theme-picker-container.expanded .theme-drawer {
		width: 80px; /* Adjust based on 3 buttons */
		opacity: 1;
		visibility: visible;
		pointer-events: auto;
	}
	.theme-btn {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		padding: 0;
		transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.15s;
	}
	.theme-btn:hover {
		transform: scale(1.25);
	}
	.theme-btn.active {
		border-color: oklch(57.05% 0.21 258.14deg);
		transform: scale(1.1);
	}
	.theme-btn.system { 
		background: linear-gradient(135deg, #fff 50%, #333 50%); 
		border-color: oklch(80.78% 0 none); 
	}
	.theme-btn.sepia { background: #f4ecd8; }
	.theme-btn.black { background: #000; }
	.theme-btn.active { border-color: oklch(57.05% 0.21 258.14deg); }

	/* ── Progress bar ─────────────────────────────── */
	.progress-bar-track {
		height: 3px;
		background: oklch(80.78% 0 none);
		position: relative;
		flex-shrink: 0;
		outline: none;
	}
	.dark .progress-bar-track {
		background: oklch(38.67% 0 none);
	}
	.progress-bar-fill {
		height: 100%;
		background: oklch(0% 0 none); /* Black in light mode */
		transition: width 0.4s ease;
	}
	.dark .progress-bar-fill {
		background: oklch(100% 0 none); /* White in dark mode */
	}

	/* ── Status bar ───────────────────────────────── */
	.status-bar {
		display: flex;
		align-items: center;
		padding: 0.15rem 0.5rem;
		font-size: 0.75rem;
		opacity: 0.8;
		flex-shrink: 0;
		outline: none;
	}
	.status-bar-left {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-right: 1rem;
	}
	.status-bar-center {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		display: flex;
		align-items: center;
	}
	/* Hide scrollbar but allow scrolling */
	.hide-scrollbar {
		-ms-overflow-style: none;  /* IE and Edge */
		scrollbar-width: none;  /* Firefox */
	}
	.hide-scrollbar::-webkit-scrollbar {
		display: none; /* Chrome, Safari and Opera */
	}
	.status-bar-nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.status-bar .icon-btn {
		width: 24px;
		height: 24px;
		opacity: 1;
	}
	.fraction {
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.status-bar .icon-btn:hover {
		opacity: 1;
	}
	.toc-label {
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* ── TOC Drawer ───────────────────────────────── */
	.drawer-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		z-index: 60;
	}
	.toc-drawer {
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		width: clamp(240px, 30%, 320px);
		background: oklch(100% 0 none);
		z-index: 70;
		display: flex;
		flex-direction: column;
		box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
		animation: slide-in 0.2s ease;
	}
	.dark .toc-drawer {
		background: oklch(25.62% 0 none);
	}
	@keyframes slide-in {
		from { transform: translateX(-100%); }
		to { transform: translateX(0); }
	}
	.toc-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid oklch(80.78% 0 none);
		flex-shrink: 0;
	}
	.toc-header h3 { margin: 0; font-size: 1rem; }
	.toc-header button {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		color: inherit;
		opacity: 0.6;
	}
	.toc-list {
		overflow-y: auto;
		flex: 1;
		padding: 0.5rem 0;
	}
	.toc-item {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 0.5rem 1rem;
		cursor: pointer;
		color: inherit;
		font-size: 0.875rem;
		line-height: 1.4;
		transition: background 0.15s;
	}
	.toc-item:hover { background: oklch(57.05% 0.21 258.14deg / 0.1); }
	.toc-item.active {
		background: oklch(57.05% 0.21 258.14deg / 0.2);
		font-weight: 600;
		color: oklch(51.64% 0.18 257.83deg);
	}
	.dark .toc-item.active {
		color: oklch(62.99% 0.18 255.56deg);
	}
	.toc-sub { padding-left: 2rem; opacity: 0.75; }

	/* ── Search panel ─────────────────────────────── */
	.search-panel {
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		width: clamp(280px, 35%, 380px);
		background: oklch(100% 0 none);
		z-index: 70;
		display: flex;
		flex-direction: column;
		box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
		animation: slide-in 0.2s ease;
	}
	.dark .search-panel {
		background: oklch(25.62% 0 none);
	}
	.search-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid oklch(80.78% 0 none);
		flex-shrink: 0;
	}
	.search-title {
		font-weight: 600;
		font-size: 0.9rem;
	}
	.search-form {
		display: flex;
		gap: 0.4rem;
		padding: 1rem;
		border-bottom: 1px solid oklch(80.78% 0 none);
		flex-shrink: 0;
	}
	.search-form input {
		flex: 1;
		width: 100%;
		padding: 0.4rem 0.6rem;
		padding-right: 2rem;
		border: 1px solid oklch(71.22% 0 none);
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font-size: 0.875rem;
	}
	.search-input-wrapper {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
	}
	.clear-query-btn {
		position: absolute;
		right: 0.4rem;
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		opacity: 0.5;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.2rem;
		transition: opacity 0.15s;
	}
	.clear-query-btn:hover {
		opacity: 1;
	}
	.dark .search-form input { border-color: oklch(44.95% 0 none); }
	.search-form button {
		padding: 0.4rem 0.6rem;
		border: 1px solid oklch(71.22% 0 none);
		border-radius: 6px;
		background: none;
		color: inherit;
		cursor: pointer;
		font-size: 0.875rem;
		transition: all 0.2s;
	}
	.search-form .stop-btn {
		color: #ef4444;
		border-color: #ef4444;
	}
	.search-form .stop-btn:hover {
		background: #ef44441a;
	}
	.dark .search-form button { border-color: oklch(44.95% 0 none); }
	.search-progress {
		height: 3px;
		background: oklch(80.78% 0 none);
		flex-shrink: 0;
	}
	.search-progress-bar {
		height: 100%;
		background: oklch(57.05% 0.21 258.14deg);
		transition: width 0.2s linear;
	}
	.search-meta {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		border-bottom: 1px solid oklch(80.78% 0 none);
		flex-shrink: 0;
	}
	.search-meta button {
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		font-size: 1.1rem;
	}
	.search-meta .clear-btn {
		font-size: 0.8rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid oklch(71.22% 0 none);
		border-radius: 4px;
	}
	.dark .search-meta .clear-btn {
		border-color: oklch(44.95% 0 none);
	}
	.search-results {
		list-style: none;
		margin: 0;
		padding: 0.5rem 0;
		overflow-y: auto;
		flex: 1;
	}
	.search-results li { border-bottom: 1px solid oklch(98% 0 none); }
	.dark .search-results li { border-bottom-color: oklch(32.5% 0 none); }
	
	.search-chapter-header {
		padding: 0.5rem 1rem;
		background: oklch(98% 0 none);
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(50% 0 none);
		position: sticky;
		top: 0;
		z-index: 5;
		border-bottom: 1px solid oklch(90% 0 none);
	}
	.dark .search-chapter-header {
		background: oklch(30% 0 none);
		color: oklch(70% 0 none);
		border-bottom-color: oklch(40% 0 none);
	}

	.search-results li.selected button {
		background: oklch(57.05% 0.21 258.14deg / 0.15);
	}
	.search-results button {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 0.6rem 1rem;
		cursor: pointer;
		color: inherit;
		font-size: 0.8rem;
		line-height: 1.5;
		transition: background 0.15s;
	}
	.search-results button:hover { background: oklch(57.05% 0.21 258.14deg / 0.1); }
	.search-empty {
		padding: 1rem;
		opacity: 0.5;
		font-size: 0.875rem;
		text-align: center;
	}

	/* ── Utility ──────────────────────────────────── */

	/* ── Responsive ───────────────────────────────── */
	@media (max-width: 640px) {
		.toolbar {
			flex-wrap: wrap;
			gap: 0.25rem;
			padding: 0.4rem 0.5rem;
		}
		.toolbar-group {
			gap: 0.25rem;
			flex-wrap: wrap;
			justify-content: center;
		}
		.status-bar {
			padding: 0.1rem 0.4rem;
		}
		.book-title {
			display: none;
		}
		.select-icon-wrapper {
			position: relative;
			width: 32px;
			height: 28px;
			justify-content: center;
			border: 1px solid transparent;
			border-radius: 6px;
			transition: background 0.15s, border-color 0.15s;
		}
		.select-icon-wrapper:hover,
		.select-icon-wrapper:active {
			background: oklch(57.05% 0.21 258.14deg / 0.15);
			border-color: oklch(57.05% 0.21 258.14deg / 0.3);
		}
		.select-icon {
			display: flex;
			align-items: center;
			justify-content: center;
			pointer-events: none;
			color: inherit;
		}
		.select-icon-wrapper select {
			position: absolute;
			inset: 0;
			opacity: 0;
			width: 100%;
			height: 100%;
			cursor: pointer;
			font-size: 16px; /* prevent iOS zoom */
		}
		.icon-btn {
			width: 28px;
			height: 28px;
		}
	}
</style>
