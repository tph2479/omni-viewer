<script lang="ts">
	import { getContext } from 'svelte';
	import type { WebtoonViewerContext } from './webtoonViewer.svelte.ts';
	import { WEBTOON_CONTEXT_KEY } from './webtoonViewer.svelte.ts';
	import { ZoomIn, ZoomOut, Hash } from 'lucide-svelte';

	const ctrl = getContext<WebtoonViewerContext>(WEBTOON_CONTEXT_KEY);
	let s = $derived(ctrl.state);
</script>

<!-- Side Controls -->
<div class="fixed top-24 right-4 sm:right-6 bottom-4 flex flex-col items-end gap-2 z-[310] pointer-events-none transition-all duration-300 {s.controlsVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}">
	<div class="flex flex-col items-end gap-2 pointer-events-auto h-full">
		<button 
			aria-label="Zoom In" 
			class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all" 
			onclick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); ctrl.setWebtoonZoom(Math.min(500, s.webtoonZoomLevel * 1.15)); s.webtoonScrollContainer?.focus(); }} 
			onmousedown={(e) => e.preventDefault()}
		>
			<ZoomIn class="h-5 w-5" />
		</button>
		<span class="py-1 px-2 text-[10px] font-mono font-black text-white text-center bg-zinc-900 rounded-xl border border-white/10 shadow-xl select-none" aria-label="Current Zoom">
			{Math.round(s.webtoonZoomLevel * 100)}%
		</span>
		<button 
			aria-label="Zoom Out" 
			class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all" 
			onclick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).blur(); ctrl.setWebtoonZoom(Math.max(0.001, s.webtoonZoomLevel / 1.15)); s.webtoonScrollContainer?.focus(); }} 
			onmousedown={(e) => e.preventDefault()}
		>
			<ZoomOut class="h-5 w-5" />
		</button>

		<div class="flex-1 flex flex-col items-center gap-2 mt-1 w-10 relative">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={s.seekBarElement}
				class="flex-1 w-full bg-zinc-900 rounded-xl border border-white/10 shadow-xl overflow-hidden cursor-pointer group hover:bg-zinc-800 transition-colors relative"
				onmousedown={ctrl.handleSeekBarMouseDown}
			>
				<div class="absolute top-0 left-0 w-full transition-all duration-75 ease-out origin-top z-10 pointer-events-none" style="height: {s.smoothPercent}%; background-color: white;"></div>
				{#if s.isDraggingSeek && s.hasMoved}
					<div class="absolute top-0 left-0 w-full bg-white/30 origin-top z-20 pointer-events-none" style="height: {s.previewPercent}%"></div>
				{/if}
				<span class="absolute inset-0 flex items-center justify-center z-30 pointer-events-none text-sm font-mono font-black mix-blend-difference select-none">
					{Math.round(s.isDraggingSeek && s.hasMoved ? s.previewPercent : s.smoothPercent)}%
				</span>
			</div>
			<div class="flex flex-col items-center gap-2 mt-auto">
				<div class="relative">
					<button
						aria-label="Edit Page Number"
						class="btn rounded-xl w-10 h-10 min-h-0 p-0 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl pointer-events-auto transition-all flex items-center justify-center"
						onclick={(e) => { e.stopPropagation(); s.isJumpPopupOpen = !s.isJumpPopupOpen; s.webtoonScrollContainer?.focus(); }}
						onmousedown={(e) => e.preventDefault()}
					>
						<Hash class="h-5 w-5" />
					</button>

					<!-- Jump Popup -->
					{#if s.isJumpPopupOpen}
						<div class="absolute right-full top-0 mr-2 h-10 bg-zinc-900 px-3 rounded-xl border border-white/10 shadow-xl pointer-events-auto flex items-center gap-1.5 font-mono font-black text-[11px] focus:outline-none animate-in fade-in slide-in-from-right-4 duration-200 whitespace-nowrap">
							<span
								role="textbox"
								aria-label="Page number"
								tabindex="0"
								contenteditable="true"
								inputmode="numeric"
								class="text-white focus:outline-none bg-zinc-800 rounded-lg px-2 py-0.5 transition-colors min-w-[2ch] text-center"
								onfocus={(e) => {
									s.isEditingPage = true;
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
										ctrl.handlePageInput(e.currentTarget.innerText);
										s.isJumpPopupOpen = false;
										e.currentTarget.blur();
									}
									if (e.key === 'Escape') {
										e.preventDefault();
										e.currentTarget.blur();
									}
									e.stopPropagation();
								}}
								onblur={(e) => {
									s.isEditingPage = false;
									setTimeout(() => {
										if (!s.isEditingPage) {
											s.isJumpPopupOpen = false;
											s.webtoonScrollContainer?.focus();
										}
									}, 100);
									e.currentTarget.innerText = String(s.currentImageIndex + 1);
								}}
							>
								{s.currentImageIndex + 1}
							</span>
							<span class="text-white/40 ml-2 select-none">/ {s.totalImages}</span>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
