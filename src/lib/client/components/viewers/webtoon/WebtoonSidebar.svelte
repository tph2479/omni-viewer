<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { WebtoonViewerContext } from './webtoonViewer.svelte.ts';
	import { WEBTOON_CONTEXT_KEY } from './webtoonViewer.svelte.ts';
	import { X } from 'lucide-svelte';

	const ctrl = getContext<WebtoonViewerContext>(WEBTOON_CONTEXT_KEY);
	let s = $derived(ctrl.state);

    let tocWidth = $state(320);
	let isResizingToc = $state(false);

	function startResizingToc(e: MouseEvent) {
		e.preventDefault();
		isResizingToc = true;
		
		const moveHandler = (moveEvent: MouseEvent) => {
			if (!isResizingToc) return;
			// Constrain between 200px and 80% screen width
			const newWidth = Math.max(200, Math.min(window.innerWidth * 0.8, moveEvent.clientX));
			tocWidth = newWidth;
		};

		const stopHandler = () => {
			isResizingToc = false;
			window.removeEventListener('mousemove', moveHandler);
			window.removeEventListener('mouseup', stopHandler);
		};

		window.addEventListener('mousemove', moveHandler);
		window.addEventListener('mouseup', stopHandler);
	}

	let tocScrollContainer: HTMLElement | undefined = $state();
	let tocScrollTop = $state(0);
	const ITEM_HEIGHT = 44;
	let visibleSiblings = $derived.by(() => {
		const start = Math.floor(tocScrollTop / ITEM_HEIGHT);
		const buffer = 20;
		const startIdx = Math.max(0, start - buffer);
		const endIdx = Math.min(s.siblings.length, start + buffer + 20);
		return s.siblings.slice(startIdx, endIdx).map((item, i) => ({
			item,
			index: startIdx + i
		}));
	});

	// Auto-scroll TOC to current item
	$effect(() => {
		if (s.isTocOpen && tocScrollContainer && s.currentIndex !== -1) {
			const containerHeight = tocScrollContainer.clientHeight || 500;
			const targetScroll = Math.max(0, (s.currentIndex * ITEM_HEIGHT) - (containerHeight / 2) + (ITEM_HEIGHT / 2));
			
			// Focus the TOC for keyboard scrolling
			tocScrollContainer.focus();
			
			// Update both virtual state and physical scroll
			tocScrollTop = targetScroll;
			tick().then(() => {
				if (tocScrollContainer) {
					// Use 'instant' behavior to avoid delayed animation
					tocScrollContainer.scrollTo({ top: targetScroll, behavior: 'instant' });
				}
			});
		}
	});
</script>

<!-- TOC Menu -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
    class="fixed inset-y-0 left-0 bg-zinc-900 border-r border-white/10 z-[320] shadow-[20px_0_50px_rgba(0,0,0,0.5)] transition-transform duration-300 flex flex-col {s.isTocOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full shadow-none pointer-events-none'}"
    style="width: {tocWidth}px;"
    onclick={(e) => e.stopPropagation()}
>
    <!-- Resize Handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
        class="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary-500/30 transition-colors z-[321]"
        onmousedown={startResizingToc}
    ></div>
    <div class="p-6 border-b border-white/10 space-y-4 relative">
        <div class="flex items-center justify-between">
            <h3 class="text-white font-black uppercase tracking-widest text-sm">Chapters</h3>
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-black text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded-full border border-primary-500/20">{s.siblings.length} Items</span>
                <button 
                    class="btn btn-ghost btn-circle btn-xs text-white/40 hover:text-white"
                    onclick={(e) => { 
                        (e.currentTarget as HTMLElement).blur();
                        s.isTocOpen = false;
                        s.webtoonScrollContainer?.focus();
                    }}
                >
                    <X class="h-4 w-4" />
                </button>
            </div>
        </div>
    </div>
    
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div 
        bind:this={tocScrollContainer}
        tabindex="0"
        role="region"
        aria-label="Table of Contents"
        class="flex-1 overflow-y-auto p-2 custom-scrollbar relative focus:outline-none"
        onscroll={(e) => tocScrollTop = e.currentTarget.scrollTop}
    >
        <div style="height: {s.siblings.length * ITEM_HEIGHT}px; width: 100%; position: relative;">
            {#each visibleSiblings as {item, index}}
            <button 
                style="top: {index * ITEM_HEIGHT}px; height: {ITEM_HEIGHT}px;"
                title={item.name}
                onclick={(e) => { (e.currentTarget as HTMLElement).blur(); ctrl.goToIndex(index); s.webtoonScrollContainer?.focus(); }}
                class="absolute left-0 right-0 text-left px-3 rounded-xl transition-all duration-200 flex items-center gap-3 group
                        {index === s.currentIndex 
                            ? 'bg-primary-500/20 border border-primary-500/30 text-primary-400' 
                            : 'hover:bg-white/5 text-zinc-400 hover:text-white border border-transparent'}"
                >
                    <span class="text-[10px] font-black opacity-30 w-6">{index + 1}</span>
                    <span class="text-xs font-bold truncate flex-1">{item.name}</span>
                    {#if index === s.currentIndex}
                        <div class="w-1.5 h-1.5 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
                    {/if}
                </button>
            {/each}
        </div>
    </div>
</div>

	<!-- Click outside backdrop for TOC -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div 
		class="fixed inset-0 z-[315] bg-black/40 transition-opacity duration-300 {s.isTocOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}" 
		onclick={() => {
			s.isTocOpen = false;
			s.webtoonScrollContainer?.focus();
		}}
	></div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 10px;
	}
</style>
