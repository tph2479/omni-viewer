<script lang="ts">
	import { isVideoFile, isZipFile, isCbzFile, isPdfFile, isEpubFile, handleImageError, formatBytes, formatDate, type ImageFile } from '../utils/utils';
	import { cacheVersion } from '$lib/stores/cache.svelte';
	import { lazyThumbnail } from '../utils/thumbnailLoader';
	import FileCard from './FileCard.svelte';

	type CoverFolder = { name: string; path: string; coverPath: string };

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
		onOpenGroup,
		coverFolders = [],
		coverFoldersTotal = 0,
		coverFoldersPage = 0,
		coverFoldersHasMore = false,
		isCoverMode = false,
		onExitCoverMode,
		onCoverFolderClick,
		onLoadCoverPage
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
		coverFolders?: CoverFolder[];
		coverFoldersTotal?: number;
		coverFoldersPage?: number;
		coverFoldersHasMore?: boolean;
		isCoverMode?: boolean;
		onExitCoverMode?: () => void;
		onCoverFolderClick?: (path: string) => void;
		onLoadCoverPage?: (page: number) => void;
	} = $props();

	const totalPages = $derived(Math.ceil(totalImages / PAGE_SIZE));
	const totalCoverPages = $derived(Math.ceil(coverFoldersTotal / PAGE_SIZE));
</script>


{#if isCoverMode && coverFolders.length > 0}
	<!-- Cover Folder Browsing Mode -->
	<div class="flex items-center gap-3 mb-4">
		<button
			class="btn btn-sm btn-ghost rounded-lg gap-1 border border-primary/30"
			onclick={() => onExitCoverMode?.()}
			onmousedown={(e) => e.preventDefault()}
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
			</svg>
			Back
		</button>
		<h2 class="text-base font-black tracking-tight uppercase text-base-content/80">Cover Folders</h2>
		<span class="badge badge-primary badge-sm font-bold opacity-80">{coverFoldersTotal}</span>
	</div>

	<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4 pb-10">
		{#each coverFolders as folder}
			<div class="group flex flex-col">
				<button
					class="relative aspect-square bg-base-300 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:ring-2 hover:ring-teal-500/50 transition-all duration-300 cursor-pointer border-2 border-teal-500/20 hover:border-teal-500/40 w-full"
					onclick={() => onCoverFolderClick?.(folder.path)}
				>
					<img
						use:lazyThumbnail={`/api/media?path=${encodeURIComponent(folder.coverPath)}&thumbnail=true&v=${cacheVersion.value}`}
						decoding="async"
						alt={folder.name}
						class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
					/>
					<!-- Folder badge -->
					<div class="absolute top-2 left-2 z-20">
						<div class="bg-teal-600/90 px-2 py-0.5 rounded shadow-lg group-hover:bg-teal-600 transition-colors flex items-center gap-1">
							<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
								<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
							</svg>
							<span class="text-[9px] font-black text-white tracking-widest uppercase">FOLDER</span>
						</div>
					</div>
					<!-- Bottom gradient overlay -->
					<div class="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent"></div>
				</button>
				<div class="flex flex-col items-center mt-auto pt-1">
					<p
						class="text-[10px] sm:text-[11px] font-bold truncate text-center px-1 text-base-content/60 group-hover:text-teal-500 transition-colors duration-300 w-full"
						title={folder.name}
					>
						{folder.name}
					</p>
				</div>
			</div>
		{/each}
	</div>

	<!-- Cover Folder Pagination -->
	{#if totalCoverPages > 1}
		<div class="flex flex-wrap justify-center items-center gap-2 mt-2 mb-10 w-full">
			<button
				onclick={() => onLoadCoverPage?.(coverFoldersPage - 1)}
				class="btn btn-sm btn-outline btn-square shadow-sm"
				disabled={coverFoldersPage === 0 || isLoading}
				aria-label="Previous page"
				onmousedown={(e) => e.preventDefault()}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
			</button>
			<div class="flex items-center gap-1 font-mono text-sm">
				{#each Array.from({ length: totalCoverPages }) as _, i}
					{#if i === 0 || i === totalCoverPages - 1 || Math.abs(i - coverFoldersPage) <= 2}
						<button
							onclick={() => onLoadCoverPage?.(i)}
							class="btn btn-sm shadow-sm {coverFoldersPage === i ? 'btn-primary' : 'btn-ghost'}"
							disabled={isLoading}
							onmousedown={(e) => e.preventDefault()}
						>
							{i + 1}
						</button>
					{:else if Math.abs(i - coverFoldersPage) === 3}
						<span class="opacity-50 px-1">...</span>
					{/if}
				{/each}
			</div>
			<button
				onclick={() => onLoadCoverPage?.(coverFoldersPage + 1)}
				class="btn btn-sm btn-outline btn-square shadow-sm"
				disabled={!coverFoldersHasMore || isLoading}
				aria-label="Next page"
				onmousedown={(e) => e.preventDefault()}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
			</button>
		</div>
	{/if}
{:else if loadedImages.length === 0 && !isGrouped}
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
		<div class="flex-1 flex flex-col items-center justify-center opacity-60 bg-base-200/30 rounded-3xl border-2 border-dashed border-base-content/10 p-10 text-center min-h-[300px]">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-14 w-14 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
			</svg>
			<p class="text-base font-black uppercase tracking-tight mb-2 text-base-content">No files found</p>
			<p class="text-[11px] font-bold uppercase tracking-widest opacity-50 mb-4">This directory contains no supported media</p>
			<div class="flex flex-wrap justify-center gap-1.5 max-w-sm">
				{#each ['JPG','PNG','WEBP','AVIF','GIF','BMP','HEIC'] as fmt}
					<span class="badge badge-sm font-black opacity-60 bg-success/10 text-success border-success/20">{fmt}</span>
				{/each}
				{#each ['MP4','WEBM','MKV','AVI','MOV','FLV','M4V'] as fmt}
					<span class="badge badge-sm font-black opacity-60 bg-info/10 text-info border-info/20">{fmt}</span>
				{/each}
				{#each ['MP3','WAV','FLAC','OGG','M4A','AAC','OPUS'] as fmt}
					<span class="badge badge-sm font-black opacity-60 bg-warning/10 text-warning border-warning/20">{fmt}</span>
				{/each}
				{#each ['CBZ','PDF','EPUB'] as fmt}
					<span class="badge badge-sm font-black opacity-60 bg-error/10 text-error border-error/20">{fmt}</span>
				{/each}
			</div>
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
