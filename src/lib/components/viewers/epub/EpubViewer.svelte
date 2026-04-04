<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { createEpubViewerState, FONT_OPTIONS, FONT_SIZE_OPTIONS, CONTENT_WIDTH_OPTIONS } from './epubViewer.svelte.ts';
	import {
		Menu,
		X,
		Search,
		Sun,
		Moon,
		ChevronLeft,
		ChevronRight,
	} from 'lucide-svelte';

	let { filePath, onClose }: { filePath: string; onClose?: () => void } = $props();
	// Note: filePath is intentionally captured once at mount — re-opening needs destroy+reinit

	// ── Controller ──────────────────────────────────────────────────────
	const ctrl = createEpubViewerState(untrack(() => filePath));
	const { ui, book, reading, settings, search } = ctrl;

	// ── DOM refs ────────────────────────────────────────────────────────
	let containerEl: HTMLElement;
	let searchInputEl: HTMLInputElement = $state(undefined as unknown as HTMLInputElement);
	let tocListEl: HTMLElement;

	// ── Auto-scroll TOC to current chapter ──────────────────────────────
	$effect(() => {
		if (ui.isTocOpen) {
			requestAnimationFrame(() => {
				const activeBtn = tocListEl?.querySelector('.toc-item.active');
				activeBtn?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			});
		}
	});

	// ── Lifecycle ───────────────────────────────────────────────────────
	onMount(() => ctrl.init(containerEl));
	onDestroy(() => ctrl.destroy());

	// ── Keyboard shortcut ────────────────────────────────────────────────
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			ui.isSearchOpen = !ui.isSearchOpen;
			if (ui.isSearchOpen) setTimeout(() => searchInputEl?.focus(), 50);
		}
		if (e.key === 'Tab') {
			e.preventDefault();
			ui.isTocOpen = !ui.isTocOpen;
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
				onclick={() => (ui.isTocOpen = !ui.isTocOpen)}
				title="Table of Contents"
				aria-label="Toggle TOC"
			>
				<Menu size={16} />
			</button>

			<!-- Chapter navigation -->
			<button
				class="icon-btn"
				onclick={() => ctrl.prevChapter()}
				title="Previous chapter"
				aria-label="Previous chapter"
			>
				<ChevronLeft size={16} />
			</button>
			<button
				class="icon-btn"
				onclick={() => ctrl.nextChapter()}
				title="Next chapter"
				aria-label="Next chapter"
			>
				<ChevronRight size={16} />
			</button>

			{#if book.title}
				<span class="book-title">{book.title}</span>
			{/if}
		</div>

		<!-- Right group -->
		<div class="toolbar-group">
			<!-- Font picker -->
			<label class="select-wrapper" title="Font family">
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
			<label class="select-wrapper" title="Font size">
				<select
					value={settings.fontSize}
					onchange={(e) => ctrl.setFontSize(Number((e.target as HTMLSelectElement).value))}
				>
					{#each FONT_SIZE_OPTIONS as size (size)}
						<option value={size}>{size}px</option>
					{/each}
				</select>
			</label>

			<!-- Content width -->
			<label class="select-wrapper" title="Content width">
				<select
					value={settings.contentWidth}
					onchange={(e) => ctrl.setContentWidth((e.target as HTMLSelectElement).value)}
				>
					{#each CONTENT_WIDTH_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>

			<!-- Search toggle -->
			<button
				class="icon-btn"
				class:active={ui.isSearchOpen}
				onclick={() => {
					ui.isSearchOpen = !ui.isSearchOpen;
					if (ui.isSearchOpen) setTimeout(() => searchInputEl?.focus(), 50);
				}}
				title="Search (Ctrl+F)"
				aria-label="Toggle search"
			>
				<Search size={16} />
			</button>

			<!-- Dark / Light toggle -->
			<button
				class="icon-btn"
				onclick={ctrl.toggleDark}
				title={settings.isDark ? 'Light mode' : 'Dark mode'}
				aria-label="Toggle dark mode"
			>
				{#if settings.isDark}
					<Sun size={16} />
				{:else}
					<Moon size={16} />
				{/if}
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
				<input
					bind:this={searchInputEl}
					bind:value={search.query}
					placeholder="Search in book…"
					aria-label="Search query"
				/>
				<button type="submit" disabled={search.isSearching}>
					{search.isSearching ? '…' : 'Go'}
				</button>
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
				<ol class="search-results">
					{#each search.results as result, i (result.cfi)}
						<li class:selected={i === search.currentIndex}>
							<button
								onclick={() => {
									search.currentIndex = i;
									ctrl.goTo(result.cfi);
								}}
							>
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html result.excerpt}
							</button>
						</li>
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
		{#if reading.currentTocLabel}
			<span class="toc-label">{reading.currentTocLabel}</span>
		{/if}
		<span class="fraction">{Math.round(reading.fraction * 100)}%</span>
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
		padding: 0.3rem 0.5rem;
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
	.select-wrapper select {
		background: transparent;
		border: 1px solid oklch(71.22% 0 none);
		border-radius: 6px;
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		color: inherit;
		cursor: pointer;
	}
	.select-wrapper select option {
		background: oklch(100% 0 none);
		color: oklch(18.22% 0 none);
	}
	.dark .select-wrapper select {
		border-color: oklch(44.95% 0 none);
		color: oklch(100% 0 none);
	}
	.dark .select-wrapper select option {
		background: oklch(32.5% 0 none);
		color: oklch(100% 0 none);
	}

	/* ── Progress bar ─────────────────────────────── */
	.progress-bar-track {
		height: 3px;
		background: oklch(80.78% 0 none);
		position: relative;
		flex-shrink: 0;
		outline: none;
		tabindex: -1;
	}
	.dark .progress-bar-track {
		background: oklch(38.67% 0 none);
	}
	.progress-bar-fill {
		height: 100%;
		background: oklch(57.05% 0.21 258.14deg);
		transition: width 0.4s ease;
	}

	/* ── Status bar ───────────────────────────────── */
	.status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.25rem 1rem;
		font-size: 0.75rem;
		opacity: 0.6;
		flex-shrink: 0;
		outline: none;
		tabindex: -1;
	}
	.toc-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 70%;
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
		right: 0;
		bottom: 0;
		width: clamp(280px, 35%, 380px);
		background: oklch(100% 0 none);
		z-index: 70;
		display: flex;
		flex-direction: column;
		box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
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
		padding: 0.4rem 0.6rem;
		border: 1px solid oklch(71.22% 0 none);
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font-size: 0.875rem;
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
	.sr-only {
		position: absolute;
		width: 1px; height: 1px;
		padding: 0; margin: -1px;
		overflow: hidden;
		clip: rect(0,0,0,0);
		white-space: nowrap;
		border: 0;
	}

	/* ── Responsive ───────────────────────────────── */
	@media (max-width: 640px) {
		.toolbar {
			flex-wrap: wrap;
			gap: 0.25rem;
			padding: 0.4rem 0.5rem;
		}
		.toolbar-group {
			gap: 0.25rem;
		}
		.book-title {
			display: none;
		}
		.select-wrapper {
			display: none;
		}
		.icon-btn {
			width: 28px;
			height: 28px;
		}
	}
</style>
