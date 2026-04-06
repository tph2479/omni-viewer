<script lang="ts">
	import { getContext } from 'svelte';
	import {
		Menu,
		X,
		Search,
		Type,
		ALargeSmall,
		MoveHorizontal,
		MoveVertical,
		Palette,
	} from 'lucide-svelte';
	import {
		EPUB_CONTEXT_KEY,
		FONT_OPTIONS,
		FONT_SIZE_OPTIONS,
		CONTENT_WIDTH_OPTIONS,
		LINE_SPACING_OPTIONS,
		type EpubViewerContext,
	} from './epubViewer.svelte.ts';

	const ctrl = getContext<EpubViewerContext>(EPUB_CONTEXT_KEY);
	const { ui, book, settings } = ctrl;

	let { onClose }: { onClose?: () => void } = $props();

	let searchInputRef: HTMLInputElement | null = $state(null);

	function toggleSearch() {
		ui.isSearchOpen = !ui.isSearchOpen;
		if (ui.isSearchOpen) {
			ui.isTocOpen = false;
			setTimeout(() => searchInputRef?.focus(), 50);
		}
	}
</script>

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
				onclick={() => (ui.isThemeMenuOpen = !ui.isThemeMenuOpen)}
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
			onclick={toggleSearch}
			title="Search (Ctrl+F)"
			aria-label="Toggle search"
		>
			<Search size={16} />
		</button>

		<!-- Close button -->
		<button class="icon-btn" onclick={() => onClose?.()} title="Close" aria-label="Close">
			<X size={16} />
		</button>
	</div>
</header>

<style>
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
	:global(.dark) .toolbar {
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
	:global(.dark) .select-icon-wrapper select {
		border-color: oklch(44.95% 0 none);
		color: oklch(100% 0 none);
	}
	:global(.dark) .select-icon-wrapper select option {
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
		width: 80px;
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

	/* ── Responsive ─────────────────────────────── */
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
