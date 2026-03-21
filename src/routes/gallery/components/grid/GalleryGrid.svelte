<script lang="ts">
	import { isVideoFile, isZipFile, isCbzFile, isPdfFile, isEpubFile, handleImageError, formatBytes, formatDate, type ImageFile } from '../utils/utils';
	import FileCard from './FileCard.svelte';
	let {
		loadedImages = $bindable(),
		isGrouped = false,
		groupedData = null,
		totalImages,
		currentPage,
		hasMore,
		isLoading,
		PAGE_SIZE,
		onOpenModal,
		onOpenCbz,
		onOpenDir,
		onLoadPage,
		onOpenGroup
	}: {
		loadedImages: ImageFile[];
		isGrouped?: boolean;
		groupedData?: any;
		totalImages: number;
		currentPage: number;
		hasMore: boolean;
		isLoading: boolean;
		PAGE_SIZE: number;
		onOpenModal: (index: number, items?: ImageFile[]) => void;
		onOpenCbz: (path: string) => void;
		onOpenDir: (path: string) => void;
		onLoadPage: (page: number) => void;
		onOpenGroup?: (type: string) => void;
	} = $props();

	const totalPages = $derived(Math.ceil(totalImages / PAGE_SIZE));
</script>


{#if loadedImages.length === 0 && !isGrouped}
	{#if isLoading}
		<!-- Skeleton Loading Grid -->
		<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4 pb-6 animate-pulse">
			{#each Array.from({ length: 12 }) as _}
				<div class="flex flex-col gap-2">
					<div class="aspect-square bg-base-300 rounded-2xl w-full"></div>
					<div class="h-3 bg-base-300 rounded-full w-2/3 mx-auto"></div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="flex-1 flex flex-col items-center justify-center opacity-60 bg-base-200/50 rounded-xl border-2 border-dashed border-base-300 p-6 text-center">
			<p class="text-lg font-medium">No files found in this directory</p>
			<p class="text-xs mt-2 text-center">Supported formats: JPG, PNG, WEBP, GIF, MP4, WEBM, MP3, WAV, CBZ, PDF, EPUB</p>
		</div>
	{/if}
{:else}


{#if isGrouped && groupedData}
	<div class="flex flex-col gap-5 pb-6">
		{#each ['folders', 'images', 'cbz', 'pdf', 'epub', 'audio', 'videos'] as groupKey}
			{#if groupedData[groupKey] && groupedData[groupKey].items.length > 0}
				{@const groupInfo = groupedData[groupKey]}
				<div class="flex flex-col gap-2">
					<div class="flex items-center gap-2 ml-1">
						<h2 class="text-base font-black tracking-tight uppercase text-base-content/80">{groupKey}</h2>
						<span class="badge badge-primary badge-sm font-bold opacity-80">{groupInfo.total}</span>
					</div>
					<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4">
						{#each groupInfo.items as img, i}
							<FileCard {img} index={i} {onOpenDir} {onOpenCbz} onOpenModal={(idx) => onOpenModal(idx, groupInfo.items)} />
						{/each}
						
						{#if groupInfo.total > 11}
							<button
								class="relative aspect-square rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:ring-2 hover:ring-primary/50 transition-all duration-300 cursor-pointer border border-primary/20 bg-primary/5 flex flex-col items-center justify-center group w-full"
								onclick={() => onOpenGroup?.(groupKey)}
							>
								<div class="bg-primary/20 p-4 rounded-full group-hover:bg-primary/30 transition-colors group-hover:scale-110 duration-300">
									<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
									</svg>
								</div>
								<span class="mt-3 font-bold text-xs text-primary/80 uppercase tracking-widest">View All</span>
							</button>
						{/if}
					</div>
				</div>
			{/if}
		{/each}
	</div>
{:else}
	<!-- Thumbnail Grid -->
	<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4 pb-10">
		{#each loadedImages as _, i}
			<FileCard bind:img={loadedImages[i]} index={i} {onOpenDir} {onOpenCbz} {onOpenModal} />
		{/each}
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="flex flex-wrap justify-center items-center gap-2 mt-2 mb-10 w-full">
			<button
				onclick={() => onLoadPage(currentPage - 1)}
				class="btn btn-sm btn-outline btn-square shadow-sm"
				disabled={currentPage === 0 || isLoading}
				aria-label="Previous page"
				onmousedown={(e) => e.preventDefault()}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
			</button>

			<div class="flex items-center gap-1 font-mono text-sm">
				{#each Array.from({ length: totalPages }) as _, i}
					{#if i === 0 || i === totalPages - 1 || Math.abs(i - currentPage) <= 2}
						<button
							onclick={() => onLoadPage(i)}
							class="btn btn-sm shadow-sm {currentPage === i ? 'btn-primary' : 'btn-ghost'}"
							disabled={isLoading}
							onmousedown={(e) => e.preventDefault()}
						>
							{i + 1}
						</button>
					{:else if Math.abs(i - currentPage) === 3}
						<span class="opacity-50 px-1">...</span>
					{/if}
				{/each}
			</div>

			<button
				onclick={() => onLoadPage(currentPage + 1)}
				class="btn btn-sm btn-outline btn-square shadow-sm"
				disabled={!hasMore || isLoading}
				aria-label="Next page"
				onmousedown={(e) => e.preventDefault()}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
			</button>
		</div>
	{/if}
{/if}
{/if}
