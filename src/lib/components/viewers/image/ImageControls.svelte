<script lang="ts">
	import { getContext } from 'svelte';
	import type { ImageViewerContext } from './imageViewer.svelte.ts';
	import { IMAGE_CONTEXT_KEY } from './imageViewer.svelte.ts';
	import {
		X,
		ChevronLeft,
		ChevronRight,
		Maximize2,
		RotateCw,
		Plus,
		Minus,
	} from "lucide-svelte";

	const imgState = getContext<ImageViewerContext>(IMAGE_CONTEXT_KEY);
</script>

<!-- RIGHT: Button Area (Vertically Centered) -->
<div class="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center z-[110] bg-transparent pointer-events-none transition-all duration-300 {imgState.rightControlsVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}">
	<div
		class="flex flex-col items-center gap-3 pointer-events-auto"
		onmouseenter={() => (imgState.isHoveringRightControls = true)}
		onmouseleave={() => (imgState.isHoveringRightControls = false)}
		role="presentation"
	>
		<!-- Close Button -->
		<button
			aria-label="Close"
			class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl bg-zinc-900/95 hover:bg-zinc-800 text-white border border-white/10 backdrop-blur-xl shadow-2xl transition-all hover:scale-110 mb-2 cursor-pointer"
			tabindex="-1"
			style="touch-action: manipulation;"
			onclick={(e) => {
				e.stopPropagation();
				imgState.closeModal();
			}}
			onpointerdown={(e) => e.preventDefault()}
		>
			<X class="h-6 w-6 sm:h-7 sm:w-7" />
		</button>

		<!-- Navigation Group -->
		<div class="flex flex-col bg-zinc-900/95 rounded-xl backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl w-12 sm:w-14 mb-3">
			<button
				aria-label="Previous"
				class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-transparent text-white border-b border-white/10 transition-colors hover:bg-white/5 cursor-pointer"
				tabindex="-1"
				style="touch-action: manipulation;"
				onclick={(e) => {
					e.stopPropagation();
					imgState.prevImage();
				}}
				onpointerdown={(e) => e.preventDefault()}
			>
				<ChevronLeft class="h-6 w-6 sm:h-7 sm:w-7" />
			</button>
			<button
				aria-label="Next"
				class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-transparent text-white border-none transition-colors hover:bg-white/5 cursor-pointer"
				tabindex="-1"
				style="touch-action: manipulation;"
				onclick={(e) => {
					e.stopPropagation();
					imgState.nextImage();
				}}
				onpointerdown={(e) => e.preventDefault()}
			>
				<ChevronRight class="h-6 w-6 sm:h-7 sm:w-7" />
			</button>
		</div>

		<!-- Zoom Modes -->
		<div class="flex flex-col bg-zinc-900/95 rounded-xl backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl w-12 sm:w-14 mb-3">
			<button
				aria-label="Fit Width"
				class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-transparent text-white border-b border-white/10 transition-colors hover:bg-white/5 cursor-pointer"
				tabindex="-1"
				style="touch-action: manipulation;"
				onclick={(e) => {
					e.stopPropagation();
					imgState.toggleFitWidth();
				}}
				onpointerdown={(e) => e.preventDefault()}
			>
				<Maximize2 class="h-6 w-6 sm:h-7 sm:w-7" />
			</button>
			<button
				aria-label="Toggle 1:1"
				class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-transparent text-white border-none font-black font-mono text-xs transition-colors hover:bg-white/5 cursor-pointer"
				tabindex="-1"
				style="touch-action: manipulation;"
				onclick={(e) => {
					e.stopPropagation();
					imgState.toggleZoom(e.clientX, e.clientY);
				}}
				onpointerdown={(e) => e.preventDefault()}
			>
				1:1
			</button>
			<button
				aria-label="Rotate"
				class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-transparent text-white border-t border-white/10 transition-colors hover:bg-white/5 cursor-pointer"
				tabindex="-1"
				style="touch-action: manipulation;"
				onclick={(e) => {
					e.stopPropagation();
					imgState.rotateImage();
				}}
				onpointerdown={(e) => e.preventDefault()}
			>
				<RotateCw class="h-6 w-6 sm:h-7 sm:w-7" />
			</button>
		</div>

		<!-- Zoom Controls -->
		<div class="flex flex-col bg-zinc-900/95 rounded-xl backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl w-12 sm:w-14">
			<button
				aria-label="Zoom In"
				class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-transparent text-white border-b border-white/10 transition-colors hover:bg-white/5 cursor-pointer"
				tabindex="-1"
				style="touch-action: manipulation;"
				onclick={(e) => {
					e.stopPropagation();
					imgState.performZoom(Math.min(500, imgState.zoomLevel * 1.35));
				}}
				onpointerdown={(e) => e.preventDefault()}
			>
				<Plus class="h-6 w-6 sm:h-7 sm:w-7" />
			</button>
			<button
				aria-label="Current Zoom"
				class="w-full py-2 sm:py-3 text-xs font-mono font-black text-white hover:bg-white/10 transition-colors bg-white/5 flex items-center justify-center tracking-tighter cursor-pointer"
				tabindex="-1"
				style="touch-action: manipulation;"
				onclick={(e) => {
					e.stopPropagation();
					imgState.resetAll();
				}}
				onpointerdown={(e) => e.preventDefault()}
			>
				{imgState.absoluteZoomPercent}%
			</button>
			<button
				aria-label="Zoom Out"
				class="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-transparent text-white border-t border-white/10 transition-colors hover:bg-white/5 cursor-pointer"
				tabindex="-1"
				style="touch-action: manipulation;"
				onclick={(e) => {
					e.stopPropagation();
					imgState.performZoom(Math.max(0.001, imgState.zoomLevel / 1.35));
				}}
				onpointerdown={(e) => e.preventDefault()}
			>
				<Minus class="h-6 w-6 sm:h-7 sm:w-7" />
			</button>
		</div>
	</div>
</div>
