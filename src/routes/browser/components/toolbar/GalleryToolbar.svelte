<script lang="ts">
	import type { ImageFile } from '../utils/utils';

	let {
		folderPath = $bindable(),
		currentSort = $bindable(),
		mediaType = $bindable(),
		isLoading,
		isFolderSelected,
		isGrouped = false,
		loadedImages,
		totalItems,
		totalImages = 0,
		totalVideos = 0,
		totalAudio = 0,
		totalEbook = 0,
		onLoad,
		onOpenPicker,
		onOpenWebtoon,
		onGoUp
	}: {
		folderPath: string;
		currentSort: string;
		isLoading: boolean;
		isFolderSelected: boolean;
		isGrouped?: boolean;
		loadedImages: ImageFile[];
		totalItems: number;
		totalImages?: number;
		totalVideos?: number;
		totalAudio?: number;
		totalEbook?: number;
		onLoad: () => void;
		onOpenPicker: () => void;
		onOpenWebtoon: () => void;
		onGoUp: (dir: string) => void;
		mediaType: 'all' | 'images' | 'videos' | 'audio' | 'ebook';
	} = $props();

	const parentPath = $derived.by(() => {
		if (!folderPath) return null;

		// Normalize separators and trim trailing slashes
		const normalized = folderPath.replace(/\\/g, '/').replace(/\/+$/, '');

		// If it's already a drive root (e.g., "C:"), don't go up
		if (/^[a-zA-Z]:$/.test(normalized)) return null;

		const parts = normalized.split('/');
		if (parts.length <= 1) return null;

		const parent = parts.slice(0, -1).join('\\');

		// If the resulting parent is just a drive letter "C:", return "C:\" for consistency
		if (/^[a-zA-Z]:$/.test(parent)) {
			return parent + '\\';
		}

		return parent;
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') onLoad();
		if (e.key === 'Escape') (e.target as HTMLElement)?.blur();
	}
</script>

<div class="flex flex-row items-center gap-2 sm:gap-3 w-full overflow-x-auto no-scrollbar py-1.5 min-h-[48px] flex-wrap sm:flex-nowrap">
	<!-- Select Folder (hidden on mobile) -->
	<button onclick={onOpenPicker} class="hidden sm:block btn btn-sm btn-ghost rounded-lg font-bold shrink-0 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-primary" onmousedown={(e) => e.preventDefault()}>
		Select
	</button>

	<!-- Up Button -->
	<button
		onclick={() => parentPath && onGoUp(parentPath)}
		disabled={!parentPath || isLoading}
		class="btn btn-sm btn-ghost btn-square rounded-lg border border-primary shadow-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/20"
		title="Up one level"
		onmousedown={(e) => e.preventDefault()}
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
		</svg>
	</button>

	<!-- Address Input (opens picker on mobile) -->
	<div class="flex-1 w-full sm:min-w-[300px]">
		<input
			type="text"
			bind:value={folderPath}
			onkeydown={handleKeydown}
			placeholder="Tap to browse..."
			onclick={() => { if (typeof window !== 'undefined' && window.innerWidth < 640) onOpenPicker(); }}
			readonly={typeof window !== 'undefined' && window.innerWidth < 640}
			class="input input-sm input-bordered rounded-lg w-full font-semibold text-sm tracking-tight shadow-inner focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer sm:cursor-text"
		/>
	</div>

	<!-- Load Button -->
	<button onclick={onLoad} class="btn btn-sm btn-ghost rounded-lg shadow-md px-3 font-bold shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/20 border border-primary" disabled={isLoading} onmousedown={(e) => e.preventDefault()}>
		{#if isLoading}
			<span class="loading loading-spinner loading-sm"></span>
		{:else}
			<span class="hidden xs:inline">Refresh</span>
			<span class="xs:hidden">↻</span>
		{/if}
	</button>

	{#if isFolderSelected}
		<button
			class="btn btn-sm btn-ghost rounded-lg shadow-sm font-bold gap-1 sm:gap-2 shrink-0 border border-primary"
			onclick={onOpenWebtoon}
			disabled={loadedImages.length === 0 && !isGrouped}
			onmousedown={(e) => e.preventDefault()}
			title="Webtoon / Cover View"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
			</svg>
		</button>

		<!-- Media Type Select -->
		<select
			class="select select-bordered select-sm rounded-lg font-bold w-fit shrink-0 border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
			bind:value={mediaType}
			onchange={onLoad}
		>
			<option value="all">All-{totalItems}</option>
			<option value="images">Images-{totalImages}</option>
			<option value="videos">Videos-{totalVideos}</option>
			<option value="audio">Audio-{totalAudio}</option>
			<option value="ebook">Ebook-{totalEbook}</option>
		</select>

		<!-- Sort Select -->
		<!-- Mobile: icon only -->
		<select
			class="sm:hidden select select-bordered select-sm rounded-lg font-bold w-fit min-w-[40px] shrink-0 border-primary text-center appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all [&::-ms-expand]:hidden"
			bind:value={currentSort}
			onchange={onLoad}
		>
			<option value="date_desc">↓</option>
			<option value="date_asc">↑</option>
			<option value="name_asc">A</option>
			<option value="name_desc">Z</option>
		</select>
		<!-- Desktop: full text -->
		<select
			class="hidden sm:block select select-bordered select-sm rounded-lg font-bold w-fit shrink-0 pr-8 border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
			bind:value={currentSort}
			onchange={onLoad}
		>
			<option value="date_desc">Newest</option>
			<option value="date_asc">Oldest</option>
			<option value="name_asc">A-Z</option>
			<option value="name_desc">Z-A</option>
		</select>
	{/if}
</div>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

</style>
