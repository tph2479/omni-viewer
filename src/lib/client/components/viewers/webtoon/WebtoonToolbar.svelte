<script lang="ts">
	import { getContext } from 'svelte';
	import type { WebtoonViewerContext } from './webtoonViewer.svelte.ts';
	import { WEBTOON_CONTEXT_KEY } from './webtoonViewer.svelte.ts';
	import { Minimize2, Scaling, Shrink, Expand, LayoutList, ChevronLeft, ChevronRight, X } from 'lucide-svelte';

	let { isFullscreen, toggleFullscreen, closeWebtoon } = $props<{
		isFullscreen: boolean;
		toggleFullscreen: () => void;
		closeWebtoon: () => void;
	}>();

	const ctrl = getContext<WebtoonViewerContext>(WEBTOON_CONTEXT_KEY);
	let s = $derived(ctrl.state);
</script>

<!-- Top Controls -->
<div class="fixed top-4 right-4 sm:right-6 pointer-events-none z-[310] transition-all duration-300 {s.controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}">
	<div class="flex items-center justify-end gap-2">
		<button 
			class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all" 
			aria-label="Toggle fit" 
			onclick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); ctrl.toggleWebtoonFit(); s.webtoonScrollContainer?.focus(); }}
		>
			{#if s.webtoonZoomLevel >= 0.99}
				<Minimize2 class="h-5 w-5 text-primary-400" />
			{:else}
				<Scaling class="h-5 w-5" />
			{/if}
		</button>

		<button 
			class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all" 
			aria-label="Toggle Fullscreen" 
			onclick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); toggleFullscreen(); s.webtoonScrollContainer?.focus(); }}
		>
			{#if isFullscreen}
				<Shrink class="h-5 w-5 text-primary-400" />
			{:else}
				<Expand class="h-5 w-5" />
			{/if}
		</button>

		<button 
			class="btn rounded-xl w-10 h-10 min-h-0 p-0 {s.isTocOpen ? 'bg-primary-500 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-white'} border border-white/10 shadow-xl pointer-events-auto transition-all" 
			aria-label="Table of Contents" 
			onclick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); s.isTocOpen = !s.isTocOpen; s.webtoonScrollContainer?.focus(); }}
		>
			<LayoutList class="h-5 w-5" />
		</button>

		<div class="h-8 w-[1px] bg-white/10 mx-1"></div>

		<button
			class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 hover:scale-105 text-white border border-white/20 shadow-xl pointer-events-auto transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100"
			aria-label="Previous Book"
			onclick={(e) => {
				e.stopPropagation();
				(e.currentTarget as HTMLElement).blur();
				ctrl.goToSibling(-1);
				s.webtoonScrollContainer?.focus();
			}}
			disabled={s.currentIndex <= 0}
		>
			<ChevronLeft class="h-5 w-5" />
		</button>

		{#if s.siblings.length > 0}
			<div class="btn px-3 h-10 min-h-0 flex items-center bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 rounded-xl shadow-xl pointer-events-auto tracking-tighter">
				<span
					role="textbox"
					aria-label="Chapter number"
					tabindex="0"
					contenteditable="true"
					inputmode="numeric"
					class="text-white focus:outline-none hover:bg-white/5 rounded px-1 transition-colors min-w-[1ch]"
					onfocus={(e) => {
						s.isEditingChapter = true;
						if (s.hideTimerId) {
							clearTimeout(s.hideTimerId);
							s.hideTimerId = null;
						}
						const range = document.createRange();
						range.selectNodeContents(e.currentTarget);
						const sel = window.getSelection();
						sel?.removeAllRanges();
						sel?.addRange(range);
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							ctrl.handleChapterJump(e.currentTarget.innerText);
							e.currentTarget.blur();
						}
						if (e.key === 'Escape') {
							e.preventDefault();
							e.currentTarget.blur();
						}
						e.stopPropagation();
					}}
					onblur={(e) => {
						s.isEditingChapter = false;
						e.currentTarget.innerText = String(s.currentIndex + 1);
						s.webtoonScrollContainer?.focus();
					}}
				>
					{s.currentIndex + 1}
				</span>
				<span class="opacity-50 mx-1.5 select-none">/</span>
				<span class="opacity-70 select-none">{s.siblings.length}</span>
			</div>
		{/if}

		<button
			class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 hover:scale-105 text-white border border-white/20 shadow-xl pointer-events-auto transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100"
			aria-label="Next Book"
			onclick={(e) => {
				e.stopPropagation();
				(e.currentTarget as HTMLElement).blur();
				ctrl.goToSibling(1);
				s.webtoonScrollContainer?.focus();
			}}
			disabled={s.currentIndex === -1 || s.currentIndex >= s.siblings.length - 1}
		>
			<ChevronRight class="h-5 w-5" />
		</button>
		<button
			aria-label="Close (ESC)"
			class="btn rounded-xl w-12 h-12 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all hover:scale-110"
			onclick={(e) => {
				e.stopPropagation();
				closeWebtoon();
			}}
		>
			<X class="h-6 w-6" />
		</button>
	</div>
</div>
