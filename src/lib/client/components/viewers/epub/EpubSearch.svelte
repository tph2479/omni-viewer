<script lang="ts">
	import { getContext } from 'svelte';
	import { ChevronLeft, ChevronRight, X } from 'lucide-svelte';
	import { EPUB_CONTEXT_KEY, type EpubViewerContext, type SearchResult } from './epubViewer.svelte.ts';

	const ctrl = getContext<EpubViewerContext>(EPUB_CONTEXT_KEY);
	const { ui, search } = ctrl;

	let searchInputEl: HTMLInputElement = $state(undefined as unknown as HTMLInputElement);
	let searchResultsEl = $state<HTMLElement>();

	// Auto-scroll search results list to the active match
	$effect(() => {
		if (ui.isSearchOpen && search.currentIndex >= 0 && searchResultsEl) {
			requestAnimationFrame(() => {
				const selected = searchResultsEl?.querySelector('li.selected');
				selected?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			});
		}
	});

	// Group results by chapter label
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

	export function focusInput() {
		setTimeout(() => searchInputEl?.focus(), 50);
	}

	async function handleSearchSubmit(e: SubmitEvent) {
		e.preventDefault();
		await ctrl.runSearch(search.query);
	}
</script>

{#if ui.isSearchOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="drawer-backdrop"
		onclick={() => (ui.isSearchOpen = false)}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') ui.isSearchOpen = false;
		}}
		role="button"
		tabindex="-1"
		aria-label="Close search"
	></div>
	<div class="search-panel">
		<div class="search-header">
			<span class="search-title">Search</span>
			<button class="icon-btn" onclick={() => (ui.isSearchOpen = false)} aria-label="Close search">
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
				<button type="button" onclick={ctrl.stopSearch} class="stop-btn">Stop</button>
			{:else}
				<button type="submit">Search</button>
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

<style>
	.drawer-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		z-index: 60;
	}
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
	:global(.dark) .search-panel {
		background: oklch(25.62% 0 none);
	}
	@keyframes slide-in {
		from { transform: translateX(-100%); }
		to { transform: translateX(0); }
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
	.clear-query-btn:hover { opacity: 1; }
	:global(.dark) .search-form input { border-color: oklch(44.95% 0 none); }
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
	.stop-btn {
		color: #ef4444;
		border-color: #ef4444;
	}
	.stop-btn:hover { background: #ef44441a; }
	:global(.dark) .search-form button { border-color: oklch(44.95% 0 none); }
	.icon-btn {
		background: none;
		border: 1px solid transparent;
		border-radius: 6px;
		padding: 0;
		cursor: pointer;
		color: inherit;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
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
	:global(.dark) .search-meta .clear-btn { border-color: oklch(44.95% 0 none); }
	.search-results {
		list-style: none;
		margin: 0;
		padding: 0.5rem 0;
		overflow-y: auto;
		flex: 1;
	}
	.search-results li { border-bottom: 1px solid oklch(98% 0 none); }
	:global(.dark) .search-results li { border-bottom-color: oklch(32.5% 0 none); }
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
	:global(.dark) .search-chapter-header {
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
</style>
