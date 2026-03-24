<script lang="ts">
	import { onDestroy } from 'svelte';
	import { isVideoFile, isZipFile, isCbzFile, isPdfFile, isEpubFile, handleImageError, formatBytes, type ImageFile } from '../utils/utils';
	import { cacheVersion } from '$lib/stores/cache.svelte';
	import { lazyThumbnail } from '../utils/thumbnailLoader';
	import { Folder, FileArchive, FileText, FileVideo, FileAudio, File, Play } from 'lucide-svelte';

	let {
		img = $bindable(),
		index,
		onOpenDir,
		onOpenCbz,
		onOpenModal
	}: {
		img: ImageFile;
		index: number;
		onOpenDir: (path: string) => void;
		onOpenCbz: (path: string) => void;
		onOpenModal: (index: number) => void;
	} = $props();

	function handleCardClick() {
		if (img.isDir) { onOpenDir(img.path); return; }
		if (img.isCbz) { onOpenCbz(img.path); return; }
		if (img.isPdf) { onOpenModal(index); return; }
		onOpenModal(index);
	}

	let hoverTimer: any = null;

	function handleMouseEnter() {
		if (img.isDir || img.isCbz || (img.width && img.height)) return;
		
		hoverTimer = setTimeout(() => {
			fetch(`/api/media?path=${encodeURIComponent(img.path)}&metadata=true`)
				.then(res => res.json())
				.then(data => {
					img.size = data.size;
					img.lastModified = data.lastModified;
					img.width = data.width;
					img.height = data.height;
				})
				.catch(() => {});
		}, 150);
	}

	function handleMouseLeave() {
		if (hoverTimer) {
			clearTimeout(hoverTimer);
			hoverTimer = null;
		}
	}

	onDestroy(() => {
		if (hoverTimer) clearTimeout(hoverTimer);
	});
</script>

<div class="group flex flex-col">
	<button
		id="item-{img.path.replace(/[^a-zA-Z0-9]/g, '-')}"
		class="relative aspect-square bg-base-300 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:ring-2 hover:ring-primary/50 transition-all duration-300 cursor-pointer border border-base-content/10 w-full"
		onclick={handleCardClick}
	>
		{#if img.isDir}
			<!-- Folder card -->
			<div class="absolute inset-0 flex flex-col items-center justify-center bg-base-200/40 group-hover:bg-base-200/60 transition-colors">
				<Folder class="w-1/2 h-1/2 text-base-content/40 transition-transform duration-300" />
			</div>
		{:else if isZipFile(img.name)}
			<!-- Zip Icon (No thumbnail per user request) -->
			<div class="absolute inset-0 flex flex-col items-center justify-center bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
				<FileArchive class="w-1/2 h-1/2 text-amber-600 transition-transform duration-300" />
			</div>
			<div class="absolute top-2 left-2 z-20 bg-amber-600 text-white text-[9px] font-black tracking-widest px-2 py-0.5 rounded shadow-lg uppercase">ZIP</div>
		{:else if isCbzFile(img.name)}
			<!-- CBZ cover -->
			<img
				use:lazyThumbnail={`/api/ebook?path=${encodeURIComponent(img.path)}&cover=true&v=${cacheVersion.value}`}
				decoding="async"
				fetchpriority={index < 12 ? 'high' : 'auto'}
				alt={img.name}
				class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out"
			/>
			<div class="absolute top-2 left-2 z-20 bg-amber-500 text-white text-[9px] font-black tracking-widest px-2 py-0.5 rounded shadow-lg uppercase">CBZ</div>
			<!-- Fallback Icon for CBZ (Hidden by default, shown on error) -->
			<div class="hidden absolute inset-0 w-full h-full flex-col items-center justify-center bg-amber-500/10 transition-colors">
				<FileArchive class="w-1/2 h-1/2 text-amber-500 opacity-50" />
			</div>
		{:else if isVideoFile(img.name)}
			<img
				use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
				decoding="async"
				fetchpriority={index < 12 ? 'high' : 'auto'}
				alt={img.name}
				class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out"
			/>
			<div class="absolute top-2 left-2 z-20">
				<div class="bg-black/60 p-1.5 rounded-lg border border-white/20 shadow-lg">
					<Play class="w-4 h-4 text-white" />
				</div>
			</div>
		{:else if img.isAudio}
			<div class="absolute inset-0 flex flex-col items-center justify-center bg-primary/5 transition-colors group-hover:bg-primary/10">
				<FileAudio class="w-1/4 h-1/4 text-primary opacity-20 transition-all duration-500" />
			</div>
			<img
				use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
				decoding="async"
				fetchpriority="auto"
				alt={img.name}
				class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out z-10"
			/>
			<div class="absolute top-2 left-2 z-20">
				<div class="bg-primary/80 p-1.5 rounded-lg border border-white/20 shadow-lg group-hover:bg-primary transition-colors">
					<FileAudio class="w-4 h-4 text-white" />
				</div>
			</div>
		{:else if isPdfFile(img.name) || img.isPdf}
			<div class="absolute inset-0 flex flex-col items-center justify-center bg-red-500/5 transition-colors group-hover:bg-red-500/10">
				<FileText class="w-1/3 h-1/3 text-red-600 opacity-20 transition-all duration-500" />
			</div>
			<div class="absolute top-2 left-2 z-20">
				<div class="bg-red-600/90 px-2 py-0.5 rounded shadow-lg group-hover:bg-red-600 transition-colors">
					<span class="text-[9px] font-black text-white tracking-widest uppercase">PDF</span>
				</div>
			</div>
		{:else if isEpubFile(img.name) || img.isEpub}
			<div class="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/5 transition-colors group-hover:bg-emerald-500/10">
				<FileText class="w-1/3 h-1/3 text-emerald-600 opacity-20 transition-all duration-500" />
			</div>
			<div class="absolute top-2 left-2 z-20">
				<div class="bg-emerald-600/90 px-2 py-0.5 rounded shadow-lg group-hover:bg-emerald-600 transition-colors">
					<span class="text-[9px] font-black text-white tracking-widest uppercase">EPUB</span>
				</div>
			</div>
		{:else}
			<img
				use:lazyThumbnail={`/api/media?path=${encodeURIComponent(img.path)}&thumbnail=true&v=${cacheVersion.value}`}
				decoding="async"
				fetchpriority={index < 12 ? 'high' : 'auto'}
				alt={img.name}
				class="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-700 ease-out"
			/>
		{/if}
	</button>
	<div class="flex flex-col items-center mt-auto pt-1">
		<p 
			class="text-[10px] sm:text-[11px] font-bold truncate text-center px-1 text-base-content/60 group-hover:text-primary transition-colors duration-300 w-full cursor-help" 
			title={img.name}
			onmouseenter={handleMouseEnter}
			onmouseleave={handleMouseLeave}
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
