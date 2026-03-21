<script lang="ts">
	import { onDestroy } from 'svelte';
	import { isVideoFile, isZipFile, isCbzFile, isPdfFile, isEpubFile, handleImageError, formatBytes, formatDate, type ImageFile } from './utils';

	let {
		loadedImages,
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
		onOpenModal: (index: number) => void;
		onOpenCbz: (path: string) => void;
		onOpenDir: (path: string) => void;
		onLoadPage: (page: number) => void;
		onOpenGroup?: (type: string) => void;
	} = $props();

	const totalPages = $derived(Math.ceil(totalImages / PAGE_SIZE));

	function handleCardClick(img: ImageFile, index: number) {
		if (img.isDir) { onOpenDir(img.path); return; }
		if (img.isCbz) { onOpenCbz(img.path); return; }
		if (img.isPdf) { onOpenModal(index); return; }
		onOpenModal(index);
	}

	let hoverTimers = new Map<string, any>();

	function handleMouseEnter(img: ImageFile) {
		if (img.isDir || img.isCbz || (img.width && img.height)) return;
		
		// Debounce hover to avoid fetching if just passing through
		const timer = setTimeout(() => {
			fetch(`/api/media?path=${encodeURIComponent(img.path)}&metadata=true`)
				.then(res => res.json())
				.then(data => {
					// Update the object directly - since it's state in +page.svelte, it will propagate
					img.size = data.size;
					img.lastModified = data.lastModified;
					img.width = data.width;
					img.height = data.height;
				})
				.catch(() => {});
		}, 150);
		
		hoverTimers.set(img.path, timer);
	}

	function handleMouseLeave(img: ImageFile) {
		if (hoverTimers.has(img.path)) {
			clearTimeout(hoverTimers.get(img.path));
			hoverTimers.delete(img.path);
		}
	}

	onDestroy(() => {
		for (const timer of hoverTimers.values()) clearTimeout(timer);
		hoverTimers.clear();
	});
</script>

{#snippet fileCard(img: ImageFile, i: number)}
			<div class="group flex flex-col">
				<button
					id="item-{img.path.replace(/[^a-zA-Z0-9]/g, '-')}"
					class="relative aspect-square bg-base-300 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:ring-2 hover:ring-primary/50 transition-all duration-300 cursor-pointer border border-base-content/10 w-full"
					onclick={() => handleCardClick(img, i)}
				>
					{#if img.isDir}
						<!-- Folder card -->
						<div class="absolute inset-0 flex flex-col items-center justify-center bg-base-200/40 group-hover:bg-base-200/60 transition-colors">
							<svg xmlns="http://www.w3.org/2000/svg" class="w-1/2 h-1/2 text-base-content/40 drop-shadow-lg group-hover:scale-110 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24">
								<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
							</svg>
						</div>
					{:else if isZipFile(img.name)}
						<!-- Zip Icon (No thumbnail per user request) -->
						<div class="absolute inset-0 flex flex-col items-center justify-center bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
							<svg xmlns="http://www.w3.org/2000/svg" class="w-1/2 h-1/2 text-amber-600 drop-shadow-lg group-hover:scale-110 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24">
								<path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 2l-2 2H4V6h5.17l2 2H14z"/>
							</svg>
						</div>
						<div class="absolute top-2 left-2 z-20 bg-amber-600 text-white text-[9px] font-black tracking-widest px-2 py-0.5 rounded shadow-lg uppercase">ZIP</div>
					{:else if isCbzFile(img.name)}
						<!-- CBZ cover -->
						<img
							src={`/api/ebook?path=${encodeURIComponent(img.path)}&cover=true`}
							loading="lazy"
							decoding="async"
							fetchpriority={i < 12 ? 'high' : 'auto'}
							alt={img.name}
							class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out"
							onerror={(e) => {
								const target = e.currentTarget as HTMLImageElement;
								target.style.display = 'none';
								const fallback = target.nextElementSibling as HTMLElement;
								if (fallback) fallback.style.display = 'flex';
							}}
						/>
						<div class="absolute top-2 left-2 z-20 bg-amber-500 text-white text-[9px] font-black tracking-widest px-2 py-0.5 rounded shadow-lg uppercase">CBZ</div>
						<!-- Fallback Icon for CBZ (Hidden by default, shown on error) -->
						<div class="hidden absolute inset-0 w-full h-full flex-col items-center justify-center bg-amber-500/10 transition-colors">
							<svg xmlns="http://www.w3.org/2000/svg" class="w-1/2 h-1/2 text-amber-500 opacity-50" fill="currentColor" viewBox="0 0 24 24">
								<path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 2l-2 2H4V6h5.17l2 2H14z"/>
							</svg>
						</div>
					{:else if isVideoFile(img.name)}
						<img
							src={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true`}
							loading="lazy"
							decoding="async"
							fetchpriority={i < 12 ? 'high' : 'auto'}
							alt={img.name}
							class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out"
						/>
						<div class="absolute top-2 left-2 z-20">
							<div class="bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/20 shadow-lg">
								<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
									<path d="M8 5v14l11-7z"/>
								</svg>
							</div>
						</div>
					{:else if img.isAudio}
						<div class="absolute inset-0 flex flex-col items-center justify-center bg-primary/5 transition-colors group-hover:bg-primary/10">
							<svg xmlns="http://www.w3.org/2000/svg" class="w-1/4 h-1/4 text-primary opacity-20 group-hover:opacity-40 transition-all duration-500 group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
								<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
							</svg>
						</div>
						<img
							src={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true`}
							loading="lazy"
							decoding="async"
							fetchpriority="auto"
							alt={img.name}
							class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out z-10"
							onerror={(e) => {
								const target = e.currentTarget as HTMLImageElement;
								target.style.display = 'none';
							}}
						/>
						<div class="absolute top-2 left-2 z-20">
							<div class="bg-primary/80 backdrop-blur-md p-1.5 rounded-lg border border-white/20 shadow-lg group-hover:bg-primary transition-colors">
								<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
									<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
								</svg>
							</div>
						</div>
					{:else if isPdfFile(img.name) || img.isPdf}
						<div class="absolute inset-0 flex flex-col items-center justify-center bg-red-500/5 transition-colors group-hover:bg-red-500/10">
							<svg xmlns="http://www.w3.org/2000/svg" class="w-1/3 h-1/3 text-red-600 opacity-20 group-hover:opacity-40 transition-all duration-500 group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
								<path d="M11.363 2c4.155 0 2.637 6 2.637 6s6-1.518 6 2.638v11.362c0 .552-.448 1-1 1h-13c-.552 0-1-.448-1-1v-19c0-.552.448-1 1-1h6.363zm4.137 17H8.5v-1h7v1zm0-2H8.5v-1h7v1zm0-2H8.5v-1h7v1zM15 2l5 5h-5V2z"/>
							</svg>
						</div>
						<div class="absolute top-2 left-2 z-20">
							<div class="bg-red-600/80 backdrop-blur-md px-2 py-0.5 rounded shadow-lg group-hover:bg-red-600 transition-colors">
								<span class="text-[9px] font-black text-white tracking-widest uppercase">PDF</span>
							</div>
						</div>
					{:else if isEpubFile(img.name) || img.isEpub}
						<div class="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/5 transition-colors group-hover:bg-emerald-500/10">
							<svg xmlns="http://www.w3.org/2000/svg" class="w-1/3 h-1/3 text-emerald-600 opacity-20 group-hover:opacity-40 transition-all duration-500 group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
								<path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20s3.4.45 4.75 1.45c1.35-1 3.3-1.45 4.75-1.45s3.4.45 4.75 1.45c.1 0 .15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zM9.5 18c-1.2-.55-2.65-.85-4-.85s-2.8.3-4 .85V7.15c1.2-.55 2.65-.85 4-.85s2.8.3 4 .85V18zm11 0c-1.2-.55-2.65-.85-4-.85s-2.8.3-4 .85V7.15c1.2-.55 2.65-.85 4-.85s2.8.3 4 .85V18z"/>
							</svg>
						</div>
						<div class="absolute top-2 left-2 z-20">
							<div class="bg-emerald-600/80 backdrop-blur-md px-2 py-0.5 rounded shadow-lg group-hover:bg-emerald-600 transition-colors">
								<span class="text-[9px] font-black text-white tracking-widest uppercase">EPUB</span>
							</div>
						</div>
					{:else}
						<img
							src={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true`}
							loading="lazy"
							decoding="async"
							fetchpriority={i < 12 ? 'high' : 'auto'}
							alt={img.name}
							class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out"
							onerror={(e) => handleImageError(e, img.path)}
						/>
					{/if}
				</button>
				<div class="flex flex-col items-center mt-auto pt-1">
					<p 
						class="text-[10px] sm:text-[11px] font-bold truncate text-center px-1 text-base-content/60 group-hover:text-primary transition-colors duration-300 w-full cursor-help" 
						title={img.name}
						onmouseenter={() => handleMouseEnter(img)}
						onmouseleave={() => handleMouseLeave(img)}
					>
						{img.name}
					</p>
					{#if img.width && img.height}
						<div class="text-[9px] font-mono font-black text-primary/50 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-2px] group-hover:translate-y-0">
							{img.width}x{img.height} • {formatBytes(img.size)}
						</div>
					{/if}
				</div>
			</div>
{/snippet}

{#if loadedImages.length === 0 && !isGrouped}
	{#if isLoading}
		<!-- Skeleton Loading Grid -->
		<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 sm:gap-4 pb-6 animate-pulse">
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
					<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 sm:gap-4">
						{#each groupInfo.items as img, i}
							{@render fileCard(img, i)}
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
	<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 sm:gap-4 pb-10">
		{#each loadedImages as img, i}
			{@render fileCard(img, i)}
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
