<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import WebtoonReader from './components/WebtoonReader.svelte';
	import ImageModal from './components/ImageModal.svelte';
	import VideoModal from './components/VideoModal.svelte';
	import FolderPicker from './components/FolderPicker.svelte';
	import GalleryToolbar from './components/GalleryToolbar.svelte';
	import GalleryGrid from './components/GalleryGrid.svelte';
	import type { ImageFile } from './components/utils';

	// ── Core state ────────────────────────────────────────────────────────────
	let folderPath = $state('C:\\Users');
	let isFolderSelected = $state(false);
	let isLoading = $state(false);
	let errorMsg = $state('');

	let loadedImages: ImageFile[] = $state([]);
	let totalImagesCount = $state(0);
	let totalVideosCount = $state(0);
	let totalMedia = $state(0);
	let currentPage = $state(0);
	const PAGE_SIZE = 30;
	let hasMore = $state(false);

	let currentSort = $state('date_desc');
	
	/** Persistent drives list loaded ONCE on start */
	let availableDrives = $state<any[]>([]);

	// ── Modal / view state ────────────────────────────────────────────────────
	let isImageModalOpen = $state(false);
	let isVideoModalOpen = $state(false);
	let selectedImageIndex = $state(0);
	let isWebtoonMode = $state(false);
	let isFolderPickerOpen = $state(false);
	let isDrivesLoading = $state(false);
	let isNoImagesPopupOpen = $state(false);
	let noImagesPopupTimer: any = null;

	let webtoonCbzPath = $state('');
	let pendingFile = $state<{ path: string, type: 'media' | 'cbz' } | null>(null);
	let lastOpenedFolder = $state<string | null>(null);
	let lastOpenedFile = $state<string | null>(null);

	/** Track page number for each folder to remember when going back/down */
	let folderPageHistory: Record<string, number> = $state({});

	/** The path actually fed to WebtoonReader */
	const webtoonActivePath = $derived(webtoonCbzPath || folderPath);

	let isPinned = $state(true);
	let showHeader = $state(true);

	$effect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (isPinned) return;
			
			// Chỉ hiện khi chuột nằm ở vùng 10% trên cùng của màn hình
			if (e.clientY < window.innerHeight * 0.1) {
				showHeader = true;
			} else {
				showHeader = false;
			}
		};

		window.addEventListener('mousemove', handleMouseMove);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
		};
	});

	$effect(() => {
		if (isPinned) {
			showHeader = true;
		}
	});

	// Track the current file being viewed to highlight it when modal closes
	$effect(() => {
		if (isImageModalOpen || isVideoModalOpen) {
			const item = loadedImages[selectedImageIndex];
			if (item) lastOpenedFile = item.path;
		} else if (isWebtoonMode && webtoonCbzPath) {
			lastOpenedFile = webtoonCbzPath;
		}
	});

	// Trigger highlight when modals are closed
	let wasModalOpen = false;
	$effect(() => {
		const isAnyModalOpen = isImageModalOpen || isVideoModalOpen || isWebtoonMode;
		if (wasModalOpen && !isAnyModalOpen && lastOpenedFile) {
			const targetId = `item-${lastOpenedFile.replace(/[^a-zA-Z0-9]/g, '-')}`;
			tick().then(() => {
				const el = document.getElementById(targetId);
				if (el) {
					el.scrollIntoView({ behavior: 'instant', block: 'center' });
					el.classList.add('ring-[1.5px]', 'ring-primary', 'z-10');
					setTimeout(() => {
						el.classList.remove('ring-[1.5px]', 'ring-primary', 'z-10');
					}, 2500);
				}
			});
			lastOpenedFile = null;
		}
		wasModalOpen = isAnyModalOpen;
	});

	async function refreshDrives() {
		isDrivesLoading = true;
		try {
			const res = await fetch('/api/directories?path=');
			const data = await res.json();
			if (res.ok) availableDrives = data.directories;
		} catch (e) {
			console.error('Failed to load drives:', e);
		} finally {
			isDrivesLoading = false;
		}
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(async () => {
		const saved = localStorage.getItem('hello-last-path');
		if (saved) folderPath = saved;

		const savedHistory = sessionStorage.getItem('hello-folder-history');
		if (savedHistory) {
			try {
				folderPageHistory = JSON.parse(savedHistory);
			} catch (e) {
				console.error('Failed to parse folder history');
			}
		}

		// Load drives ONCE on startup
		await refreshDrives();

		// Auto load last folder if exists
		if (folderPath && folderPath !== 'C:\\Users') {
			const savedPage = folderPageHistory[folderPath] || 0;
			loadFolder(true, savedPage);
		}
	});

	// Handle orientation change for responsive grid
	function handleOrientationChange() {
		window.dispatchEvent(new Event('resize'));
	}

	onMount(() => {
		window.addEventListener('orientationchange', handleOrientationChange);
		return () => {
			window.removeEventListener('orientationchange', handleOrientationChange);
		};
	});

	onDestroy(() => {
		loadedImages = [];
		totalImagesCount = 0;
		totalVideosCount = 0;
		currentPage = 0;
		hasMore = false;
		isFolderSelected = false;
	});

	// ── Data loading ──────────────────────────────────────────────────────────
	async function loadFolder(reset = true, pageToLoad = 0, append = false) {
		if (!folderPath.trim()) {
			errorMsg = 'Please enter a directory path.';
			return;
		}

		isLoading = true;
		errorMsg = '';
		const targetId = lastOpenedFolder ? `item-${lastOpenedFolder.replace(/[^a-zA-Z0-9]/g, '-')}` : null;

		if (reset) {
			currentPage = pageToLoad;
			hasMore = false;
			loadedImages = [];
		} else {
			currentPage = pageToLoad;
			if (!append) loadedImages = [];
		}

		try {
			// Scroll to top by default if not targeting an item
			if (typeof window !== 'undefined' && !append && !targetId) {
				const scrollContainer = document.querySelector('.drawer-content');
				if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'instant' });
				else window.scrollTo({ top: 0, behavior: 'instant' });
			}

			const res = await fetch(
				`/api/gallery?folder=${encodeURIComponent(folderPath)}&page=${currentPage}&limit=${PAGE_SIZE}&sort=${currentSort}`
			);
			const data = await res.json();

			if (!res.ok) throw new Error(data.message || 'Error fetching data from server.');

			loadedImages = append ? [...loadedImages, ...data.images] : data.images;

			if (reset) {
				isFolderSelected = true;
				if (folderPath.length === 2 && folderPath[1] === ':') {
					folderPath += '\\';
				} else if (folderPath.length > 3 && (folderPath.endsWith('\\') || folderPath.endsWith('/'))) {
					folderPath = folderPath.slice(0, -1);
				}
				localStorage.setItem('hello-last-path', folderPath);
			}

			totalImagesCount = data.totalImages;
			totalVideosCount = data.totalVideos;
			totalMedia = data.total;
			hasMore = data.hasMore;

			// Save current state to history
			folderPageHistory[folderPath] = currentPage;
			sessionStorage.setItem('hello-folder-history', JSON.stringify(folderPageHistory));

			// Logic cuộn về vị trí cũ
			if (targetId) {
				tick().then(() => {
					const el = document.getElementById(targetId);
					if (el) {
						el.scrollIntoView({ behavior: 'instant', block: 'center' });
						// Static prominent highlight (disappears after 2.5s)
						el.classList.add('ring-[1.5px]', 'ring-primary', 'z-10');
						setTimeout(() => {
							el.classList.remove('ring-[1.5px]', 'ring-primary', 'z-10');
						}, 2500);
					}
					lastOpenedFolder = null; // Clear after use
				});
			}

			// ... rest of pendingFile logic ...
			if (pendingFile) {
				if (pendingFile.type === 'cbz') {
					openCbzInWebtoon(pendingFile.path);
				} else {
					const idx = loadedImages.findIndex((img) => img.path === pendingFile!.path);
					if (idx !== -1) openModal(idx);
				}
				pendingFile = null;
			}
		} catch (e: any) {
			errorMsg = e.message;
			if (reset) isFolderSelected = false;
		} finally {
			isLoading = false;
		}
	}

	function openModal(index: number) {
		const img = loadedImages[index];
		if (!img) return;
		
		selectedImageIndex = index;
		if (img.isVideo) {
			isVideoModalOpen = true;
		} else {
			isImageModalOpen = true;
		}
	}

	function openDir(dirPath: string, isGoingUp = false) {
		if (isGoingUp) {
			lastOpenedFolder = folderPath;
		} else {
			lastOpenedFolder = null;
		}
		
		folderPath = dirPath;
		localStorage.setItem('hello-last-path', dirPath);
		
		// Restore page if it exists in history
		const savedPage = folderPageHistory[dirPath] || 0;
		loadFolder(true, savedPage);
	}

	function openCbzInWebtoon(cbzPath: string) {
		webtoonCbzPath = cbzPath;
		isWebtoonMode = true;
	}

	async function handleOpenWebtoon() {
		if (webtoonCbzPath) {
			isWebtoonMode = true;
			return;
		}

		isLoading = true;
		try {
			const res = await fetch(`/api/gallery?folder=${encodeURIComponent(folderPath)}&page=0&limit=1&imagesOnly=true`);
			const data = await res.json();
			if (data.total > 0) {
				isWebtoonMode = true;
			} else {
				isNoImagesPopupOpen = true;
				if (noImagesPopupTimer) clearTimeout(noImagesPopupTimer);
				noImagesPopupTimer = setTimeout(() => {
					isNoImagesPopupOpen = false;
					noImagesPopupTimer = null;
				}, 3000);
			}
		} catch (e) {
			console.error(e);
		} finally {
			isLoading = false;
		}
	}

	function handleWebtoonClose() {
		webtoonCbzPath = '';
	}
</script>

<div class="flex flex-col relative w-full min-h-full">
	<!-- Sticky Header -->
	<header 
		class="sticky top-[56px] lg:top-0 z-40 lg:z-[50] bg-base-100 backdrop-blur-md px-4 border-b py-1 border-base-content/10 shadow-md transition-transform duration-300 pt-[6px] lg:pt-[2px] {showHeader ? 'translate-y-0' : '-translate-y-full'}"
	>
		<div class="flex flex-row items-center gap-4">
			<div class="flex-1">
				<GalleryToolbar
					bind:folderPath
					bind:currentSort
					{isLoading}
					{isFolderSelected}
					{loadedImages}
					totalItems={totalMedia}
					onLoad={() => {
						const savedPage = folderPageHistory[folderPath] || 0;
						loadFolder(true, savedPage);
					}}
					onOpenPicker={() => (isFolderPickerOpen = true)}
					onOpenWebtoon={handleOpenWebtoon}
					onGoUp={(path) => openDir(path, true)}
				/>
			</div>

			<button
				onclick={() => {
					isPinned = !isPinned;
				}}
				class="btn btn-ghost btn-xs px-1 hover:bg-primary/20 shrink-0"
				title={isPinned ? "Unpin Header" : "Pin Header (Always Show)"}
				onmousedown={(e) => e.preventDefault()}
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 {isPinned ? 'text-primary' : 'opacity-30'}" fill="currentColor" viewBox="0 0 24 24">
					<path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
				</svg>
			</button>
		</div>
	</header>

	<div class="p-4 sm:p-6 flex-1 flex flex-col">
		<!-- Error banner -->
		{#if errorMsg}
			<div class="alert alert-error shadow-sm mb-6 flex-row text-xs py-2 rounded-xl w-full">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
				<span class="font-bold tracking-tight uppercase">{errorMsg}</span>
			</div>
		{/if}

		<!-- Views -->
		{#if !isFolderSelected && !isLoading && !errorMsg}
			<div class="flex-1 flex flex-col items-center justify-center opacity-60 bg-base-200/30 rounded-3xl border-2 border-dashed border-base-content/10 p-10 text-center animate-in fade-in duration-700 h-full min-h-[400px]">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
				<p class="text-lg font-black mb-1 text-base-content uppercase tracking-tighter">Ready to Explorer</p>
				<p class="text-xs max-w-sm mb-8 opacity-70 font-bold uppercase tracking-widest leading-relaxed">Please select a directory to index your media library.</p>
				<button class="btn btn-primary rounded-2xl px-10 font-black uppercase tracking-widest" onclick={() => (isFolderPickerOpen = true)}>Open Picker</button>
			</div>
		{:else if isFolderSelected}
			<GalleryGrid
				{loadedImages}
				totalImages={totalMedia}
				{currentPage}
				{hasMore}
				{isLoading}
				{PAGE_SIZE}
				onOpenModal={openModal}
				onOpenCbz={openCbzInWebtoon}
				onOpenDir={openDir}
				onLoadPage={(page) => loadFolder(false, page)}
			/>
		{/if}
	</div>
</div>

<!-- Modals -->
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
			loadFolder(true, savedPage);
		}}
		onOpenFile={(path, type) => {
			pendingFile = { path, type };
		}}
	/>
{/if}

<!-- No Images Popup (Toast style) -->
{#if isNoImagesPopupOpen}
	<div class="fixed bottom-6 right-6 z-[1000] animate-in slide-in-from-right-10 fade-in duration-300">
		<div 
			class="bg-base-100 border border-base-content/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] rounded-2xl p-5 flex items-center gap-4 max-w-sm cursor-pointer hover:bg-base-100/90 transition-colors ring-1 ring-base-content/5"
			onclick={() => { isNoImagesPopupOpen = false; if (noImagesPopupTimer) { clearTimeout(noImagesPopupTimer); noImagesPopupTimer = null; } }}
		>
			<div class="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
			</div>
			<div class="flex flex-col text-left">
				<h3 class="font-black text-sm uppercase tracking-tight text-base-content/90">No Images Found</h3>
				<p class="text-[11px] opacity-60 font-bold uppercase tracking-widest leading-none mt-1">Directory has no compatible media</p>
			</div>
		</div>
	</div>
{/if}
