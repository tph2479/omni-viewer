<script lang="ts">
	import WebtoonReader from './WebtoonReader.svelte';
	import ImageModal from './ImageModal.svelte';
	import VideoModal from './VideoModal.svelte';
	import AudioModal from './AudioModal.svelte';
	import PdfReader from './PdfReader.svelte';
	import FolderPicker from './FolderPicker.svelte';
	import type { ImageFile } from '../utils/utils';
	import { AlertTriangle } from 'lucide-svelte';

	let {
		mediaType = $bindable(),
		isWebtoonMode = $bindable(),
		webtoonActivePath,
		handleWebtoonClose,

		isImageModalOpen = $bindable(),
		selectedImageIndex = $bindable(),
		loadedImages = $bindable(),
		totalImagesCount,
		hasMore,
		currentPage,
		loadFolder,

		isPdfReaderOpen = $bindable(),
		selectedPdfPath = $bindable(),

		isVideoModalOpen = $bindable(),
		totalVideosCount,

		isAudioModalOpen = $bindable(),
		totalAudioCount,

		isCoverMode = $bindable(),
		coverFolders = $bindable(),
		isFolderPickerOpen = $bindable(),
		folderPath = $bindable(),
		availableDrives,
		isDrivesLoading,
		refreshDrives,
		folderPageHistory,
		onOpenFile,

		isNoImagesPopupOpen = $bindable(),
		noImagesPopupTimer = $bindable(),

		isGrouped,
		onSwitchToPagination
	}: {
		mediaType: 'all' | 'images' | 'videos' | 'audio' | 'ebook';
		isWebtoonMode: boolean;
		webtoonActivePath: string;
		handleWebtoonClose: () => void;

		isImageModalOpen: boolean;
		selectedImageIndex: number;
		loadedImages: ImageFile[];
		totalImagesCount: number;
		hasMore: boolean;
		currentPage: number;
		loadFolder: (reset: boolean, pageToLoad: number, append?: boolean) => Promise<void>;

		isPdfReaderOpen: boolean;
		selectedPdfPath: string;

		isVideoModalOpen: boolean;
		totalVideosCount: number;

		isAudioModalOpen: boolean;
		totalAudioCount: number;

		isCoverMode: boolean;
		coverFolders: any[];
		isFolderPickerOpen: boolean;
		folderPath: string;
		availableDrives: any[];
		isDrivesLoading: boolean;
		refreshDrives: () => Promise<void>;
		folderPageHistory: Record<string, number>;
		onOpenFile: (path: string, type: 'media' | 'cbz' | 'pdf') => void;

		isNoImagesPopupOpen: boolean;
		noImagesPopupTimer: any;

		isGrouped: boolean;
		onSwitchToPagination: () => Promise<void>;
	} = $props();
</script>

{#if isWebtoonMode}
	<WebtoonReader
		bind:isWebtoonMode
		folderPath={webtoonActivePath}
		onCloseCallback={handleWebtoonClose}
	/>
{/if}

{#if isImageModalOpen && loadedImages.length > selectedImageIndex}
	<ImageModal
		bind:isModalOpen={isImageModalOpen}
		bind:selectedImageIndex
		{loadedImages}
		totalImages={totalImagesCount}
		{hasMore}
		{currentPage}
		{loadFolder}
		{isGrouped}
		{onSwitchToPagination}
	/>
{/if}

{#if isPdfReaderOpen}
	<PdfReader
		bind:isPdfMode={isPdfReaderOpen}
		pdfPath={selectedPdfPath}
		onCloseCallback={() => selectedPdfPath = ''}
	/>
{/if}

{#if isVideoModalOpen && loadedImages.length > selectedImageIndex}
	<VideoModal
		bind:isModalOpen={isVideoModalOpen}
		bind:selectedImageIndex
		{loadedImages}
		totalImages={totalVideosCount}
		{hasMore}
		{currentPage}
		{loadFolder}
		{isGrouped}
		{onSwitchToPagination}
		onSwitchToAudio={() => { isVideoModalOpen = false; isAudioModalOpen = true; }}
	/>
{/if}

{#if isAudioModalOpen && loadedImages.length > selectedImageIndex}
	<AudioModal
		bind:isModalOpen={isAudioModalOpen}
		bind:selectedImageIndex
		{loadedImages}
		totalImages={totalAudioCount}
		{hasMore}
		{currentPage}
		{loadFolder}
		{isGrouped}
		{onSwitchToPagination}
		onSwitchToVideo={() => { isAudioModalOpen = false; isVideoModalOpen = true; }}
	/>
{/if}

{#if isFolderPickerOpen}
	<FolderPicker
		bind:isFolderPickerOpen
		bind:folderPath
		{availableDrives}
		{isDrivesLoading}
		onRefreshDrives={refreshDrives}
		onSelect={() => {
			const savedPage = folderPageHistory[folderPath] || 0;
			mediaType = 'all';
			isCoverMode = false;
			coverFolders = [];
			loadFolder(true, savedPage);
		}}
		onOpenFile={(path, type) => {
			onOpenFile(path, type);
		}}
	/>
{/if}

<!-- No Images Popup (Toast style) -->
{#if isNoImagesPopupOpen}
	<div class="fixed bottom-6 right-6 z-[1000] animate-in slide-in-from-right-10 fade-in duration-300">
		<button
			class="bg-base-100 border border-base-content/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] rounded-2xl p-5 flex items-center gap-4 max-w-sm cursor-pointer hover:bg-base-100/90 transition-colors ring-1 ring-base-content/5 text-left w-full"
			aria-label="Dismiss notification"
			onclick={() => { isNoImagesPopupOpen = false; if (noImagesPopupTimer) { clearTimeout(noImagesPopupTimer); noImagesPopupTimer = null; } }}
		>
			<div class="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
				<AlertTriangle class="h-6 w-6 text-warning" />
			</div>
			<div class="flex flex-col text-left">
				<h3 class="font-black text-sm uppercase tracking-tight text-base-content/90">No Images Found</h3>
				<p class="text-[11px] opacity-60 font-bold uppercase tracking-widest leading-none mt-1">Directory has no compatible media</p>
			</div>
		</button>
	</div>
{/if}
