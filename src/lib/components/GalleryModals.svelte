<script lang="ts">
	import WebtoonReader from './viewers/webtoon/WebtoonViewer.svelte';
	import ImageModal from './viewers/image/ImageViewer.svelte';
	import VideoModal from './viewers/video/VideoPlayer.svelte';
	import AudioModal from './viewers/audio/AudioPlayer.svelte';
	import PdfReader from './viewers/pdf/PdfViewer.svelte';
	import FolderPicker from './FolderPicker.svelte';
    import { browserStore as s } from '$lib/stores/browser.svelte';
</script>

{#if s.modal.webtoon.open}
	<WebtoonReader
		bind:isWebtoonMode={s.modal.webtoon.open}
		folderPath={s.modal.webtoonActivePath}
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
		currentPage={s.pagination.page}
		loadFolder={s.ui.loadFolder}
		isGrouped={s.content.isGrouped}
		onSwitchToPagination={s.ui.continueToPagination}
	/>
{/if}

{#if s.modal.pdf.open}
	<PdfReader
		bind:isPdfMode={s.modal.pdf.open}
		pdfPath={s.modal.pdf.path}
		onCloseCallback={() => s.modal.pdf.path = ''}
	/>
{/if}

{#if s.modal.video.open && s.content.items.length > s.modal.image.index}
	<VideoModal
		bind:isModalOpen={s.modal.video.open}
		bind:selectedImageIndex={s.modal.image.index}
		loadedImages={s.content.items}
		totalImages={s.content.totals.videos}
		hasMore={s.pagination.hasMore}
		currentPage={s.pagination.page}
		loadFolder={s.ui.loadFolder}
		isGrouped={s.content.isGrouped}
		onSwitchToPagination={s.ui.continueToPagination}
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
		currentPage={s.pagination.page}
		loadFolder={s.ui.loadFolder}
		isGrouped={s.content.isGrouped}
		onSwitchToPagination={s.ui.continueToPagination}
		onSwitchToVideo={() => { s.modal.audio.open = false; s.modal.video.open = true; }}
	/>
{/if}

{#if s.modal.picker.open}
	<FolderPicker
		bind:isFolderPickerOpen={s.modal.picker.open}
		bind:folderPath={s.folder.path}
		availableDrives={s.ui.drives}
		isDrivesLoading={s.ui.drivesLoading}
		onRefreshDrives={s.ui.refreshDrives}
		onSelect={() => {
			const savedPage = s.folder.pageHistory[s.folder.path] || 0;
			s.pagination.type = 'all';
			s.cover.enabled = false;
			s.ui.loadFolder(true, savedPage);
		}}
		onOpenFile={(path, type) => {
			s.ui.pendingFile = { path, type };
		}}
	/>
{/if}
