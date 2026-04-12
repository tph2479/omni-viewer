<script lang="ts">
	import { getContext } from 'svelte';
	import { X } from 'lucide-svelte';
	import { EPUB_CONTEXT_KEY, type EpubViewerContext } from './epubViewer.svelte.ts';

	const ctrl = getContext<EpubViewerContext>(EPUB_CONTEXT_KEY);
	const { ui, book, reading } = ctrl;

	let tocListEl = $state<HTMLElement>();

	$effect(() => {
		if (ui.isTocOpen) {
			requestAnimationFrame(() => {
				const activeBtn = tocListEl?.querySelector('.toc-item.active');
				activeBtn?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			});
		}
	});
</script>

{#if ui.isTocOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="drawer-backdrop"
		onclick={() => (ui.isTocOpen = false)}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') ui.isTocOpen = false;
		}}
		role="button"
		tabindex="-1"
		aria-label="Close Table of Contents"
	></div>
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

<style>
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
	:global(.dark) .toc-drawer {
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
	:global(.dark) .toc-item.active {
		color: oklch(62.99% 0.18 255.56deg);
	}
	.toc-sub { padding-left: 2rem; opacity: 0.75; }
</style>
