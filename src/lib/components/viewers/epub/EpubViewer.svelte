<script lang="ts">
	import { onMount, onDestroy, setContext, untrack } from 'svelte';
	import { createEpubViewerState, EPUB_CONTEXT_KEY } from './epubViewer.svelte.ts';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import EpubToolbar from './EpubToolbar.svelte';
	import EpubSidebar from './EpubSidebar.svelte';
	import EpubSearch from './EpubSearch.svelte';

	let { filePath, onClose }: { filePath: string; onClose?: () => void } = $props();
	// Note: filePath is intentionally captured once at mount — re-opening needs destroy+reinit

	// ── Controller ──────────────────────────────────────────────────────
	const ctrl = createEpubViewerState(untrack(() => filePath));
	const { ui, book, reading, settings } = ctrl;

	// Share state with child components via context
	setContext(EPUB_CONTEXT_KEY, ctrl);

	// ── DOM refs ────────────────────────────────────────────────────────
	let containerEl: HTMLElement;

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
</script>

<svelte:window onkeydown={onKeydown} />

<!-- ── Root wrapper ────────────────────────────────────────────────────── -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="epub-root"
	class:dark={settings.isDark}
	onmousemove={ctrl.showControls}
	onclick={() => containerEl?.focus()}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') containerEl?.focus();
	}}
	role="application"
	tabindex="-1"
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

	<!-- ── Toolbar ─────────────────────────────────────────────────────── -->
	<EpubToolbar {onClose} />

	<!-- ── TOC Drawer – rendered via context ──────────────────────────── -->
	<EpubSidebar />

	<!-- ── Search Panel – rendered via context ────────────────────────── -->
	<EpubSearch />

	<!-- ── Book renderer ────────────────────────────────────────────────── -->
	<div bind:this={containerEl} class="reader-container"></div>

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
	/* ── Base ──────────────────────────────────── */
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
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.hide-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.status-bar-nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
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
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.icon-btn:hover {
		background: oklch(57.05% 0.21 258.14deg / 0.15);
		border-color: oklch(57.05% 0.21 258.14deg / 0.3);
	}
	.fraction {
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.toc-label {
		white-space: nowrap;
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.status-bar {
			padding: 0.1rem 0.4rem;
		}
	}
</style>
