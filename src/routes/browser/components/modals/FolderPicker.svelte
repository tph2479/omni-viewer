<script lang="ts">
	import { untrack } from 'svelte';
	import { FolderOpen, ChevronLeft, RotateCw, HardDrive, Folder, FileText, X } from 'lucide-svelte';
	type DirectoryEntry = { name: string; path: string; isDir?: boolean; isCbz?: boolean; isMedia?: boolean };

	let {
		isFolderPickerOpen = $bindable(),
		folderPath = $bindable(),
		availableDrives = $bindable([]),
		isDrivesLoading,
		onRefreshDrives,
		onSelect,
		onOpenFile
	}: {
		isFolderPickerOpen: boolean;
		folderPath: string;
		availableDrives: DirectoryEntry[];
		isDrivesLoading: boolean;
		onRefreshDrives?: () => Promise<void>;
		onSelect: () => void;
		onOpenFile?: (path: string, type: 'media' | 'cbz') => void;
	} = $props();

	let pickerCurrentPath = $state('This PC');
	let pickerParentPath = $state<string | null>(null);
	let pickerDirectories: DirectoryEntry[] = $state([]);
	let isPickerLoading = $state(false);
	let pickerError = $state('');
	let pickerSummary = $state<{ count: number; sizeBytes: number; types: string[] } | null>(null);
	let dialogEl: HTMLDivElement;

	async function loadPickerData(pathQuery = '', force = false) {
		// Optimization: If going to "This PC" levels and we already have drives, use them without re-scanning
		if (!force && (pathQuery === '' || pathQuery === 'This PC') && availableDrives.length > 0) {
			pickerCurrentPath = 'This PC';
			pickerParentPath = null;
			pickerDirectories = availableDrives;
			pickerSummary = null;
			return;
		}

		isPickerLoading = true;
		pickerError = '';
		try {
			const res = await fetch(`/api/file?action=directories&path=${encodeURIComponent(pathQuery)}`);
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || 'Error fetching directories');

			pickerCurrentPath = data.currentPath || 'This PC';
			pickerParentPath = data.parentPath;
			pickerDirectories = data.directories;
			pickerSummary = data.summary || null;
		} catch (e: any) {
			pickerError = e.message;
		} finally {
			isPickerLoading = false;
		}
	}

	let wasOpen = false;
	$effect(() => {
		if (isFolderPickerOpen && !wasOpen) {
			untrack(() => {
				let target = folderPath.trim();
				if (target.length === 2 && target.endsWith(':')) {
					target += '\\';
				}
				loadPickerData(target).catch(() => loadPickerData(''));
				setTimeout(() => dialogEl?.focus(), 50);
			});
		}
		wasOpen = isFolderPickerOpen;
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	function close() { isFolderPickerOpen = false; wasOpen = false; }

	function confirm() {
		if (pickerCurrentPath === 'This PC' || pickerCurrentPath === '') return;
		let target = pickerCurrentPath;
		if (target.length > 3 && (target.endsWith('\\') || target.endsWith('/'))) {
			target = target.slice(0, -1);
		}
		folderPath = target;
		isFolderPickerOpen = false;
		onSelect();
	}

	function handleEntryClick(dir: DirectoryEntry) {
		if (dir.isDir === false && !dir.isCbz && !dir.isMedia) return;
		if (dir.isDir !== false) {
			loadPickerData(dir.path);
			return;
		}

		if (dir.isCbz) {
			folderPath = dir.path;
			isFolderPickerOpen = false;
			onOpenFile?.(dir.path, 'cbz');
			onSelect();
			return;
		}

		if (dir.isMedia) {
			folderPath = pickerCurrentPath;
			isFolderPickerOpen = false;
			onOpenFile?.(dir.path, 'media');
			onSelect();
			return;
		}
	}

	function entryStyle(dir: DirectoryEntry, isThisPC: boolean) {
		if (isThisPC) return { color: 'text-info', icon: 'drive' };
		if (dir.isDir) return { color: 'text-primary', icon: 'folder' };
		if (dir.isCbz) return { color: 'text-warning', icon: 'archive' };
		if (dir.isMedia) return { color: 'text-success', icon: 'media' };
		return { color: 'opacity-40', icon: 'file' };
	}
</script>

<div
	role="dialog"
	aria-modal="true"
	aria-label="Select Directory"
	tabindex="-1"
	class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm grid place-items-center p-4 animate-in fade-in duration-200 outline-none"
	onclick={close}
	onkeydown={handleKeydown}
	bind:this={dialogEl}
>
	<div
		role="presentation"
		class="bg-base-100 w-[580px] h-[620px] max-w-[95vw] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto border border-base-content/10 relative"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="px-6 py-4 flex justify-between items-center bg-base-200/50 border-b border-base-content/5">
			<div class="flex items-center gap-3">
				<FolderOpen class="h-6 w-6 text-primary" />
				<h3 class="font-black text-lg tracking-tight uppercase leading-none">Explorer</h3>
			</div>
			<button class="btn btn-sm btn-circle btn-ghost" onclick={close}><X class="h-4 w-4" /></button>
		</div>

		<!-- Path Address Bar -->
		<div class="px-6 py-3 flex gap-2 items-center bg-base-200 border-b border-base-content/5">
			<button
					class="btn btn-sm btn-square btn-ghost"
					aria-label="Go to parent directory"
					disabled={pickerParentPath === null}
					onclick={() => { if (pickerParentPath !== null) loadPickerData(pickerParentPath); }}
				>
				<ChevronLeft class="h-5 w-5" />
			</button>

			<div class="flex-1 bg-base-100 px-4 py-2 rounded-xl text-sm font-bold border border-base-content/10 truncate opacity-70" title={pickerCurrentPath}>
				{pickerCurrentPath}
			</div>

			<button
				class="btn btn-sm btn-square btn-ghost {isPickerLoading || isDrivesLoading ? 'loading' : ''}"
				title="Refresh All"
				onclick={() => {
					loadPickerData(pickerCurrentPath, true);
					onRefreshDrives?.();
				}}
			>
				{#if !isPickerLoading && !isDrivesLoading}
					<RotateCw class="h-4 w-4" />
				{/if}
			</button>
		</div>

		<!-- List Section -->
		<div class="flex-1 overflow-y-auto p-2 bg-base-100 custom-scrollbar">
			{#if isPickerLoading}
				<div class="flex flex-col justify-center items-center h-full gap-4 opacity-50 py-10">
					<span class="loading loading-ring loading-md"></span>
					<p class="font-bold text-[10px] uppercase tracking-widest">Reading</p>
				</div>
			{:else if pickerError}
				<div class="alert alert-error rounded-xl m-4 text-xs">
					<span class="font-bold uppercase tracking-tight">{pickerError}</span>
				</div>
			{:else if pickerDirectories.length === 0}
				<div class="flex flex-col justify-center items-center h-full opacity-20 py-20">
					<p class="font-black text-xs uppercase tracking-widest italic">Directory empty</p>
				</div>
			{:else}
				<ul class="menu menu-sm w-full font-bold">
					{#each pickerDirectories as dir}
						{@const isThisPC = pickerCurrentPath === 'This PC'}
						{@const style = entryStyle(dir, isThisPC)}
						<li>
							<button
												class="flex gap-4 py-3 rounded-xl transition-all w-full text-left {style.color} {isPickerLoading ? 'pointer-events-none opacity-50' : 'hover:bg-primary/5 active:scale-[0.98]'}"
												onclick={() => handleEntryClick(dir)}
											>
								{#if style.icon === 'drive'}
									<HardDrive class="h-5 w-5" />
								{:else if style.icon === 'folder'}
									<Folder class="h-6 w-6" />
								{:else}
									<FileText class="h-5 w-5" />
								{/if}
								<span class="truncate text-base-content">{dir.name}</span>
								{#if dir.isCbz}
									<div class="badge badge-warning badge-xs font-black p-2 ml-auto">CBZ</div>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Compact DaisyUI Footer -->
		<div class="px-6 py-5 bg-base-200 border-t border-base-content/5 flex justify-between items-center">
			<!-- Persistent Drive Quick Selector -->
			<div class="flex gap-1.5 overflow-x-auto no-scrollbar max-w-[65%] items-center py-1.5 px-0.5">
				{#each availableDrives as drive}
					{@const isActive = pickerCurrentPath.startsWith(drive.path)}
					<button
						class="btn btn-xs h-9 w-10 px-0 rounded-xl border-none relative transition-all duration-200 {isActive ? 'btn-primary shadow-lg shadow-primary/30 z-10' : 'bg-base-100 hover:bg-base-300'}"
						disabled={isPickerLoading}
						onclick={() => loadPickerData(drive.path)}
						title={drive.name}
					>
						<span class="font-black uppercase tracking-tight">{drive.name.replace('\\', '').replace(':', '')}</span>
					</button>
				{/each}
			</div>

			<div class="flex gap-2">
				<button class="btn btn-sm btn-ghost px-4 rounded-xl font-bold" onclick={close}>Cancel</button>
				<button
					class="btn btn-sm btn-primary px-6 rounded-xl font-black uppercase text-[11px] tracking-widest"
					disabled={pickerCurrentPath === 'This PC' || pickerCurrentPath === '' || isPickerLoading || !!pickerError}
					onclick={confirm}
				>
					Select
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar { width: 4px; }
	.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }

	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.no-scrollbar::-webkit-scrollbar { display: none; }
</style>
