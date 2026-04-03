<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { createEpubViewerState, FONT_OPTIONS } from './epubViewer.svelte.ts';

	let { filePath, onClose }: { filePath: string; onClose?: () => void } = $props();
	// Note: filePath is intentionally captured once at mount — re-opening needs destroy+reinit

	// ── Controller ──────────────────────────────────────────────────────
	const ctrl = createEpubViewerState(untrack(() => filePath));
	const { ui, book, reading, settings, search } = ctrl;

	// ── DOM refs ────────────────────────────────────────────────────────
	let containerEl: HTMLElement;
	let searchInputEl: HTMLInputElement = $state(undefined as unknown as HTMLInputElement);

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
	}

	async function handleSearchSubmit(e: SubmitEvent) {
		e.preventDefault();
		await ctrl.runSearch(search.query);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- ── Root wrapper ────────────────────────────────────────────────────── -->
<div
	class="epub-root"
	class:dark={settings.isDark}
	onmousemove={ctrl.showControls}
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
				<button onclick={() => (ui.isTocOpen = false)} aria-label="Close TOC">✕</button>
			</div>
			<nav class="toc-list">
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
				☰
			</button>

			{#if book.title}
				<span class="book-title">{book.title}</span>
			{/if}
		</div>

		<!-- Right group -->
		<div class="toolbar-group">
			<!-- Font picker -->
			<label class="select-wrapper" title="Font family">
				<span class="sr-only">Font</span>
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
			<div class="font-size-group" title="Font size">
				<button onclick={() => ctrl.setFontSize(settings.fontSize - 1)}>A−</button>
				<span>{settings.fontSize}px</span>
				<button onclick={() => ctrl.setFontSize(settings.fontSize + 1)}>A+</button>
			</div>

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
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
			</button>

			<!-- Dark / Light toggle -->
			<button
				class="icon-btn"
				onclick={ctrl.toggleDark}
				title={settings.isDark ? 'Light mode' : 'Dark mode'}
				aria-label="Toggle dark mode"
			>
				{settings.isDark ? '☀' : '🌙'}
			</button>

			<!-- Close button -->
			<button
				class="icon-btn"
				onclick={() => onClose?.()}
				title="Close"
				aria-label="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
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
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
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
					<button onclick={ctrl.prevSearchResult} aria-label="Previous result">‹</button>
					<span>{search.currentIndex + 1} / {search.results.length}</span>
					<button onclick={ctrl.nextSearchResult} aria-label="Next result">›</button>
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
	<div bind:this={containerEl} class="reader-container"></div>

	<!-- ── Reading progress bar ─────────────────────────────────────────── -->
	<div class="progress-bar-track">
		<div class="progress-bar-fill" style="width:{reading.fraction * 100}%"></div>
	</div>

	<!-- ── Status bar ───────────────────────────────────────────────────── -->
	<div class="status-bar" class:visible={ui.isControlsVisible}>
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
		background: #f8f4ef;
		color: #2c2825;
		transition: background 0.3s, color 0.3s;
	}
	.epub-root.dark {
		background: #1a1a2e;
		color: #d4cfc8;
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
		border: 3px solid rgba(0, 0, 0, 0.1);
		border-top-color: #7c6f64;
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
		background: rgba(248, 244, 239, 0.92);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
		/* opacity: 0;
		transform: translateY(-100%);
		transition: opacity 0.2s, transform 0.2s;
		z-index: 50; */
		z-index: 50;
	}
	.dark .toolbar {
		background: rgba(26, 26, 46, 0.92);
		border-bottom-color: rgba(255, 255, 255, 0.08);
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
		background: rgba(124, 111, 100, 0.15);
		border-color: rgba(124, 111, 100, 0.3);
	}
	.select-wrapper select {
		background: transparent;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 6px;
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		color: inherit;
		cursor: pointer;
	}
	.select-wrapper select option {
		background: #f8f4ef;
		color: #2c2825;
	}
	.dark .select-wrapper select {
		border-color: rgba(255, 255, 255, 0.15);
		color: #d4cfc8;
	}
	.dark .select-wrapper select option {
		background: #1a1a2e;
		color: #d4cfc8;
	}
	.font-size-group {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8rem;
	}
	.font-size-group span {
		min-width: 36px;
		text-align: center;
	}
	.font-size-group button {
		background: none;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 4px;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		color: inherit;
		font-size: 0.75rem;
	}
	.dark .font-size-group button {
		border-color: rgba(255, 255, 255, 0.15);
	}

	/* ── Progress bar ─────────────────────────────── */
	.progress-bar-track {
		height: 3px;
		background: rgba(0, 0, 0, 0.08);
		position: relative;
		flex-shrink: 0;
	}
	.dark .progress-bar-track {
		background: rgba(255, 255, 255, 0.08);
	}
	.progress-bar-fill {
		height: 100%;
		background: #7c6f64;
		transition: width 0.4s ease;
	}

	/* ── Status bar ───────────────────────────────── */
	.status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.25rem 1rem;
		font-size: 0.75rem;
		opacity: 0;
		transition: opacity 0.2s;
		flex-shrink: 0;
	}
	.status-bar.visible { opacity: 0.6; }
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
		background: #f8f4ef;
		z-index: 70;
		display: flex;
		flex-direction: column;
		box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
		animation: slide-in 0.2s ease;
	}
	.dark .toc-drawer {
		background: #1e1e35;
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
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
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
	.toc-item:hover { background: rgba(124, 111, 100, 0.1); }
	.toc-item.active { background: rgba(124, 111, 100, 0.2); font-weight: 600; }
	.toc-sub { padding-left: 2rem; opacity: 0.75; }

	/* ── Search panel ─────────────────────────────── */
	.search-panel {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: clamp(280px, 35%, 380px);
		background: #f8f4ef;
		z-index: 70;
		display: flex;
		flex-direction: column;
		box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
	}
	.dark .search-panel {
		background: #1e1e35;
	}
	.search-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
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
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		flex-shrink: 0;
	}
	.search-form input {
		flex: 1;
		padding: 0.4rem 0.6rem;
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font-size: 0.875rem;
	}
	.dark .search-form input { border-color: rgba(255, 255, 255, 0.2); }
	.search-form button {
		padding: 0.4rem 0.6rem;
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 6px;
		background: none;
		color: inherit;
		cursor: pointer;
		font-size: 0.875rem;
	}
	.dark .search-form button { border-color: rgba(255, 255, 255, 0.2); }
	.search-progress {
		height: 3px;
		background: rgba(0, 0, 0, 0.08);
		flex-shrink: 0;
	}
	.search-progress-bar {
		height: 100%;
		background: #7c6f64;
		transition: width 0.2s linear;
	}
	.search-meta {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
		flex-shrink: 0;
	}
	.search-meta button {
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		font-size: 1.1rem;
	}
	.search-results {
		list-style: none;
		margin: 0;
		padding: 0.5rem 0;
		overflow-y: auto;
		flex: 1;
	}
	.search-results li { border-bottom: 1px solid rgba(0, 0, 0, 0.06); }
	.search-results li.selected button { background: rgba(124, 111, 100, 0.15); }
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
	.search-results button:hover { background: rgba(124, 111, 100, 0.1); }
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
