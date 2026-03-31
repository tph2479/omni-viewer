<script lang="ts">
	import WebtoonReader from './viewers/webtoon/WebtoonViewer.svelte';
	import ImageModal from './viewers/image/ImageViewer.svelte';
	import VideoModal from './viewers/video/VideoPlayer.svelte';
	import AudioModal from './viewers/audio/AudioPlayer.svelte';
	import PdfReader from './viewers/pdf/PdfViewer.svelte';
	import EpubViewer from './viewers/epub/EpubViewer.svelte';
	import FolderPicker from './FolderPicker.svelte';
    import { browserStore as s } from '$lib/stores/browser.svelte';
</script>

{#if s.modal.webtoon.open}
	<WebtoonReader
		bind:isWebtoonMode={s.modal.webtoon.open}
		folderPath={s.modal.webtoon.cbzPath || s.folder.path}
		onCloseCallback={() => { s.modal.webtoon.cbzPath = ""; }}
	/>
{/if}

{#if s.modal.image.open && s.content.items.length > s.modal.image.index}
	<ImageModal
		bind:isModalOpen={s.modal.image.open}
		bind:selectedImageIndex={s.modal.image.index}
		loadedImages={s.content.items}
		totalImages={s.content.totals.images}
		hasMore={s.pagination.hasMore}
		currentPage={s.pagination.currentPage}
		loadFolder={s.actions.loadFolder}
		isGrouped={s.content.isGrouped}
		onSwitchToPagination={s.actions.handleSwitchToPaginationToContinue}
	/>
{/if}

{#if s.modal.pdf.open}
	<PdfReader
		bind:isPdfMode={s.modal.pdf.open}
		pdfPath={s.modal.pdf.path}
		onCloseCallback={() => s.modal.pdf.path = ''}
	/>
{/if}

{#if s.modal.epub.open}
    <!-- Container styled similarly to how PDF is fullscreen -->
    <div class="fixed inset-0 z-[1000] bg-surface-100 dark:bg-surface-900 overflow-hidden flex flex-col">
        <EpubViewer filePath={s.modal.epub.path} />
        <button 
            type="button" 
            class="absolute top-2 left-2 z-[60] bg-surface-200/50 hover:bg-surface-300 dark:bg-surface-800/50 dark:hover:bg-surface-700 p-2 rounded-full cursor-pointer backdrop-blur-sm"
            onclick={() => { s.modal.epub.open = false; s.modal.epub.path = ''; }}
            aria-label="Close EPUB Viewer"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
        </button>
    </div>
{/if}

{#if s.modal.video.open && s.content.items.length > s.modal.image.index}
	<VideoModal
		bind:isModalOpen={s.modal.video.open}
		bind:selectedImageIndex={s.modal.image.index}
		loadedImages={s.content.items}
		totalImages={s.content.totals.videos}
		hasMore={s.pagination.hasMore}
		currentPage={s.pagination.currentPage}
		loadFolder={s.actions.loadFolder}
		isGrouped={s.content.isGrouped}
		onSwitchToPagination={s.actions.handleSwitchToPaginationToContinue}
		onSwitchToAudio={() => { s.modal.video.open = false; s.modal.audio.open = true; }}
	/>
{/if}

{#if s.modal.audio.open && s.content.items.length > s.modal.image.index}
	<AudioModal
		bind:isModalOpen={s.modal.audio.open}
		bind:selectedImageIndex={s.modal.image.index}
		loadedImages={s.content.items}
		totalImages={s.content.totals.audio}
		hasMore={s.pagination.hasMore}
		currentPage={s.pagination.currentPage}
		loadFolder={s.actions.loadFolder}
		isGrouped={s.content.isGrouped}
		onSwitchToPagination={s.actions.handleSwitchToPaginationToContinue}
		onSwitchToVideo={() => { s.modal.audio.open = false; s.modal.video.open = true; }}
	/>
{/if}

{#if s.modal.folderPicker.open}
	<FolderPicker
		bind:isFolderPickerOpen={s.modal.folderPicker.open}
		bind:folderPath={s.folder.path}
		availableDrives={s.ui.availableDrives}
		isDrivesLoading={s.ui.isDrivesLoading}
		onRefreshDrives={s.actions.refreshDrives}
		onSelect={(path) => {
			s.actions.closePicker();
			s.actions.openDir(path);
		}}
		onOpenFile={(path, type) => {
			s.ui.pendingFile = { path, type };
		}}
	/>
{/if}

