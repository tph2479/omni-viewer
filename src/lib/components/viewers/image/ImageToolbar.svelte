<script lang="ts">
  import { getContext } from 'svelte';
  import { formatBytes, formatDateTime } from '$lib/utils/formatters';
  import type { ImageViewerContext } from './imageViewer.svelte.ts';
  import { IMAGE_CONTEXT_KEY } from './imageViewer.svelte.ts';
  import { X } from 'lucide-svelte';

  const imgState = getContext<ImageViewerContext>(IMAGE_CONTEXT_KEY);

  // Dynamic masked logic
  let textContainer: HTMLElement | null = $state(null);
  let textElement: HTMLElement | null = $state(null);
  let shouldMask = $derived(false);

  $effect(() => {
    if (!textContainer || !textElement) return;

    const observer = new ResizeObserver(() => {
      if (!textContainer || !textElement) return;
      const containerWidth = textContainer.clientWidth;
      const textWidth = textElement.scrollWidth;
      // Nếu text rộng hơn container width * 0.8 thì masked
      shouldMask = textWidth > containerWidth * 0.8;
    });

    observer.observe(textContainer);
    observer.observe(textElement);

    return () => {
      observer.disconnect();
    };
  });
</script>

<!-- TOP BACKGROUND SHADOW (Full Width) -->
<div class="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none transition-opacity duration-300 {imgState.infoVisible ? 'opacity-100' : 'opacity-0'} z-[110]"></div>

<!-- Toolbar (Top) -->
<div class="absolute top-0 w-full p-4 flex justify-end items-center gap-3 z-[110] bg-transparent pointer-events-none transition-all duration-300 {imgState.infoVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}">
<!-- TOP RIGHT: Info Area -->
  <div
    class="text-white/90 pointer-events-auto flex flex-col max-w-full text-right flex-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    onmouseenter={() => (imgState.isHoveringInfo = true)}
    onmouseleave={() => (imgState.isHoveringInfo = false)}
    role="presentation"
  >
    {#if imgState.currentItem}
      <div
        class="flex-1 min-w-0 overflow-x-auto image-title-scroll text-right"
        style={shouldMask ? "mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);" : ""}
        bind:this={textContainer}
      >
        <p class="select-text text-white font-black text-lg sm:text-2xl tracking-tight leading-tight whitespace-nowrap inline-block" bind:this={textElement}>
          <span class="px-2 py-0.5 -mx-2 rounded-lg">
            {imgState.currentImageIndexDisplay} / {imgState.totalImages} —
            {imgState.currentItem.name}
          </span>
        </p>
      </div>
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

  <!-- Close Button - Same Row -->
  <button
    aria-label="Close"
    class="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-xl transition-all hover:scale-110 cursor-pointer pointer-events-auto flex-shrink-0"
    tabindex="-1"
    style="touch-action: manipulation;"
    onclick={(e) => {
      e.stopPropagation();
      imgState.closeModal();
    }}
    onpointerdown={(e) => e.preventDefault()}
  >
    <X class="h-6 w-6" />
  </button>
</div>

<style>
  /* Scrollable title - hidden scrollbar */
  :global(.image-title-scroll) {
    /* Hide scrollbar for all browsers */
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }
  :global(.image-title-scroll::-webkit-scrollbar) {
    display: none; /* Chrome/Safari/Opera */
  }
</style>
