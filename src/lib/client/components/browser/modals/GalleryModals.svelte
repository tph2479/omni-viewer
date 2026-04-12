<script lang="ts">
	import WebtoonReader from '../../viewers/webtoon/WebtoonViewer.svelte';
	import ImageModal from '../../viewers/image/ImageViewer.svelte';
	import VideoModal from '../../viewers/video/VideoPlayer.svelte';
	import AudioModal from '../../viewers/audio/AudioPlayer.svelte';
	import PdfReader from '../../viewers/pdf/PdfViewer.svelte';
	import EpubViewer from '../../viewers/epub/EpubViewer.svelte';
	import FolderPicker from './FolderPicker.svelte';
    import { browserStore as s } from '$lib/client/stores/browser/index.svelte';
</script>

{#if s.modal.webtoon.open}
	<WebtoonReader
		bind:isWebtoonMode={s.modal.webtoon.open}
		folderPath={s.modal.webtoon.archivePath || s.folder.path}
		onCloseCallback={() => { s.modal.webtoon.archivePath = ""; }}
	/>
{/if}

{#if s.modal.image.open}
	<ImageModal
		bind:isModalOpen={s.modal.image.open}
		bind:selectedImageIndex={s.modal.image.index}
		loadedImages={s.content.items}
		totalImages={s.content.isGrouped ? s.content.items.length : s.content.totals.images}
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
		onCloseCallback={() => { s.modal.pdf.path = ""; }}
	/>
{/if}

{#if s.modal.epub.open}
    <div class="fixed inset-0 z-[1000] bg-surface-100 dark:bg-surface-900 overflow-hidden flex flex-col">
        <EpubViewer
            filePath={s.modal.epub.path}
            onClose={() => { s.modal.closeAll(); s.modal.epub.path = ""; }}
        />
    </div>
{/if}

{#if s.modal.video.open}
	<VideoModal
		bind:isModalOpen={s.modal.video.open}
		bind:selectedImageIndex={s.modal.image.index}
		loadedImages={s.content.items}
		totalImages={s.content.isGrouped ? s.content.items.length : s.content.totals.videos}
		hasMore={s.pagination.hasMore}
		currentPage={s.pagination.currentPage}
		loadFolder={s.actions.loadFolder}
		isGrouped={s.content.isGrouped}
		onSwitchToPagination={s.actions.handleSwitchToPaginationToContinue}
		onSwitchToAudio={() => { s.modal.video.open = false; s.modal.audio.open = true; }}
	/>
{/if}

{#if s.modal.audio.open}
	<AudioModal
		bind:isModalOpen={s.modal.audio.open}
		bind:selectedImageIndex={s.modal.image.index}
		loadedImages={s.content.items}
		totalImages={s.content.isGrouped ? s.content.items.length : s.content.totals.audio}
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
		onSelect={(path: string) => {
			s.actions.closePicker();
			s.actions.openDir(path);
		}}
		onOpenFile={(path, type) => {
			s.ui.pendingFile = { path, type };
		}}
	/>
{/if}


