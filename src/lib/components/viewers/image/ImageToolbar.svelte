<script lang="ts">
	import { getContext } from 'svelte';
	import { formatBytes, formatDateTime } from '$lib/utils/formatters';
	import type { ImageViewerContext } from './imageViewer.svelte.ts';
	import { IMAGE_CONTEXT_KEY } from './imageViewer.svelte.ts';

	const imgState = getContext<ImageViewerContext>(IMAGE_CONTEXT_KEY);
</script>

<!-- TOP BACKGROUND SHADOW (Full Width) -->
<div class="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none transition-opacity duration-300 {imgState.infoVisible ? 'opacity-100' : 'opacity-0'} z-[110]"></div>

<!-- Toolbar (Top) -->
<div class="absolute top-0 w-full p-4 flex justify-between items-start z-[110] bg-transparent pointer-events-none transition-all duration-300 {imgState.infoVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}">
	<!-- TOP LEFT: Info Area -->
	<div
		class="text-white/90 pointer-events-auto flex flex-col max-w-full pr-12"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		onmouseenter={() => (imgState.isHoveringInfo = true)}
		onmouseleave={() => (imgState.isHoveringInfo = false)}
		role="presentation"
	>
		{#if imgState.currentItem}
			<p
				class="select-text text-white font-black text-lg sm:text-2xl tracking-tight leading-tight image-title-scroll"
				style="mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);"
			>
				<span class="px-2 py-0.5 -mx-2 rounded-lg">
					{imgState.currentImageIndexDisplay} / {imgState.totalImages} —
					{imgState.currentItem.name}
				</span>
			</p>
			{#if imgState.currentMetadata}
				<p class="select-text text-white/50 text-[10px] sm:text-xs font-mono mt-1">
					<span class="px-1 rounded-sm">
						{formatBytes(imgState.currentMetadata.size)}
						{#if imgState.naturalWidth > 0 && imgState.naturalHeight > 0}
							• {imgState.naturalWidth} x {imgState.naturalHeight}
						{:else if imgState.currentMetadata.width && imgState.currentMetadata.height}
							• {imgState.currentMetadata.width} x {imgState.currentMetadata.height}
						{/if}
						• {formatDateTime(imgState.currentMetadata.lastModified)}
					</span>
				</p>
			{:else}
				<div class="flex items-center gap-2 mt-2">
					<span class="w-[10px] h-[10px] border-2 border-white/20 border-t-white/60 rounded-full animate-spin opacity-20"></span>
					<span class="text-white/20 text-[10px] font-mono italic">Loading details...</span>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	/* Scrollable title - hidden scrollbar */
	:global(.image-title-scroll) {
		overflow-x: auto;
		white-space: nowrap;
		/* Hide scrollbar for all browsers */
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* IE/Edge */
	}
	:global(.image-title-scroll::-webkit-scrollbar) {
		display: none; /* Chrome/Safari/Opera */
	}
</style>
