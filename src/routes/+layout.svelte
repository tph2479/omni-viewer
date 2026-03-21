<script lang="ts">
	import "../app.css";
	import { onMount } from 'svelte';
	import { cacheVersion } from '$lib/stores/cache.svelte';

	let { children } = $props();
	
	let isSidebarCollapsed = $state(true);
	let isLightMode = $state(false);
	let isMounted = $state(false);
	let userHasSetPreference = $state(false);

	if (typeof document !== 'undefined') {
		isLightMode = document.documentElement.getAttribute('data-theme') === 'corporate';
	}

	onMount(() => {
		isMounted = true;
		const sidebar = localStorage.getItem('hello-sidebar-collapsed');
		if (sidebar !== null) {
			isSidebarCollapsed = sidebar === 'true';
		}

		const savedTheme = localStorage.getItem('hello-theme');
		userHasSetPreference = savedTheme !== null;

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleSystemChange = (e: MediaQueryListEvent) => {
			if (!userHasSetPreference) {
				isLightMode = !e.matches;
				document.documentElement.setAttribute('data-theme', e.matches ? 'business' : 'corporate');
			}
		};
		mediaQuery.addEventListener('change', handleSystemChange);
		handleSystemChange({ matches: mediaQuery.matches } as MediaQueryListEvent);

		return () => mediaQuery.removeEventListener('change', handleSystemChange);
	});

	$effect(() => {
		if (!isMounted) return;
		localStorage.setItem('hello-sidebar-collapsed', String(isSidebarCollapsed));
	});

	function toggleTheme() {
		isLightMode = !isLightMode;
		userHasSetPreference = true;
		localStorage.setItem('hello-theme', isLightMode ? 'light' : 'dark');
		document.documentElement.setAttribute('data-theme', isLightMode ? 'corporate' : 'business');
	}

	function toggleSidebar() {
		isSidebarCollapsed = !isSidebarCollapsed;
	}

	let isClearingCache = $state(false);

	async function clearThumbnailCache() {
		if (isClearingCache) return;
		isClearingCache = true;
		try {
			await fetch('/api/media', { method: 'DELETE' });
			cacheVersion.refresh();
			localStorage.removeItem('hello-theme');
			userHasSetPreference = false;
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			isLightMode = !prefersDark;
			isSidebarCollapsed = true;
			document.documentElement.setAttribute('data-theme', prefersDark ? 'business' : 'corporate');
		} catch (e) {
			console.error(e);
		} finally {
			isClearingCache = false;
		}
	}
</script>

	<div class="drawer lg:drawer-open flex h-screen w-full overflow-hidden">
	<input id="main-drawer" type="checkbox" class="drawer-toggle" />
	
	<!-- Sidebar -->
	<div class="drawer-side z-[100] lg:z-10 border-r border-base-300 h-full fixed lg:static {isSidebarCollapsed ? 'lg:w-16' : 'lg:w-64'}">
		<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay lg:hidden"></label> 
		<ul class="menu bg-base-100 text-base-content min-h-full sm:w-16 {isMounted ? 'transition-all duration-300 ease-in-out' : ''} flex flex-col gap-0.5 overflow-visible {isSidebarCollapsed ? 'lg:w-16 pt-5 px-0 pb-2' : 'lg:w-64 pt-5 px-1.5 pb-2'}">
			
			<!-- Logo Header -->
			<div class="flex items-center mb-4 whitespace-nowrap w-full {isSidebarCollapsed ? 'justify-center' : 'justify-between px-1.5'}">
				<!-- Box Logo và Tên -->
				<div class="flex items-center gap-2 overflow-hidden {isSidebarCollapsed ? 'justify-center' : ''}">
					<div class="text-primary font-black text-xl cursor-pointer leading-none">
						MS
					</div>
					<h2 class="text-xl font-black text-base-content tracking-tight {isMounted ? 'transition-opacity duration-300' : ''} {isSidebarCollapsed ? 'opacity-0 hidden' : 'opacity-100 block'} leading-none">Media Station</h2>
				</div>
			</div>
			
			<li class="menu-title mt-1.5 {isMounted ? 'transition-opacity duration-300' : ''} whitespace-nowrap {isSidebarCollapsed ? 'opacity-0 h-0 p-0 m-0 overflow-hidden' : 'opacity-100 h-auto text-[10px] uppercase font-black tracking-widest text-base-content/40'}"><span>Navigation</span></li>
			
			<li class="mt-1 w-full">
				<a class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-lg' : 'px-3'}" data-tip={isSidebarCollapsed ? "Home" : ""} href="/">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
					<span class="{isMounted ? 'transition-opacity duration-300' : ''} whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">Home</span>
				</a>
			</li>
			
			<li class="mt-1 w-full">
				<a class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-lg' : 'w-full px-3'}" data-tip={isSidebarCollapsed ? "Browse" : ""} href="/gallery">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
					<span class="{isMounted ? 'transition-opacity duration-300' : ''} whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">Browse</span>
				</a>
			</li>

			<li class="mt-1 w-full">
				<a
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-lg' : 'w-full px-3'}"
					data-tip={isSidebarCollapsed ? "Import" : ""}
					href="/import"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
					<span class="{isMounted ? 'transition-opacity duration-300' : ''} whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						Import
					</span>
				</a>
			</li>
			
			<!-- Bottom Tools docked at the bottom via mt-auto -->
			<li class="w-full mt-auto border-t border-base-200/50 pt-2">
				<button
					onclick={toggleTheme}
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-lg' : 'px-3 flex items-center'} cursor-pointer hover:bg-primary/10 transition-all duration-200 outline-none focus:outline-none group"
					data-tip={isSidebarCollapsed ? (isLightMode ? "Light Mode" : "Dark Mode") : (isLightMode ? "Light Mode" : "Dark Mode")}
					onmousedown={(e) => e.preventDefault()}
				>
					<span class="shrink-0 w-5 h-5 group-hover:scale-110 transition-transform relative">
						<svg class="theme-icon-light stroke-current fill-none absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M22 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
						<svg class="theme-icon-dark stroke-current fill-none absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
					</span>
					<span class="{isMounted ? 'transition-opacity duration-300' : ''} whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						{isLightMode ? 'Light' : 'Dark'}
					</span>
				</button>
			</li>

			<li class="w-full">
				<button 
					onclick={clearThumbnailCache} 
					disabled={isClearingCache}
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-lg' : 'px-3 flex items-center'} hover:bg-error/10 transition-all duration-200 outline-none focus:outline-none group"
					data-tip={isSidebarCollapsed ? "Clear Thumb Cache" : ""}
					onmousedown={(e) => e.preventDefault()}
				>
					<span class="shrink-0 w-5 h-5 group-hover:scale-110 group-hover:text-error transition-all flex items-center justify-center">
						{#if isClearingCache}
							<span class="loading loading-spinner loading-sm w-5 h-5"></span>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
						{/if}
					</span>
					<span class="{isMounted ? 'transition-opacity duration-300' : ''} whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						Clear Cache
					</span>
				</button>
			</li>

			<li class="w-full">
				<a
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-lg' : 'px-3 flex items-center'} cursor-pointer hover:bg-primary/10 transition-all duration-200 outline-none focus:outline-none group"
					data-tip={isSidebarCollapsed ? "Settings" : ""}
					href="/settings"
				>
					<span class="shrink-0 w-5 h-5 group-hover:scale-110 transition-transform">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
					</span>
					<span class="{isMounted ? 'transition-opacity duration-300' : ''} whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						Settings
					</span>
				</a>
			</li>

			<li class="w-full">
				<button 
					onclick={toggleSidebar} 
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-lg' : 'px-3 flex items-center'} hover:bg-primary/10 transition-all duration-200 outline-none focus:outline-none group"
					data-tip={isSidebarCollapsed ? "Expand Menu" : ""}
					onmousedown={(e) => e.preventDefault()}
				>
					<span class="shrink-0 w-5 h-5 group-hover:scale-110 transition-transform flex items-center justify-center">
						{#if isSidebarCollapsed}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
						{/if}
					</span>
					<span class="{isMounted ? 'transition-opacity duration-300' : ''} whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						{isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
					</span>
				</button>
			</li>
		</ul>

	</div>

	<!-- Content box -->
	<div class="drawer-content flex flex-col flex-1 min-w-0 h-full overflow-y-auto" style="scrollbar-gutter: stable">
		<!-- Navbar (Chỉ hiện trên Mobile) -->
		<div class="w-full navbar bg-base-100 lg:hidden shadow-sm sticky top-0 z-[200]">
			<div class="flex-none">
				<label for="main-drawer" aria-label="open sidebar" class="btn btn-square btn-ghost">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-6 h-6 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
				</label>
			</div>
			<div class="flex-1 px-2 mx-2 text-xl font-bold">HelloSvelte</div>
		</div>
		
		<!-- Main area -->
		<main class="flex-1 bg-base-100 shadow-inner min-h-full">
			{@render children()}
		</main>
	</div> 
</div>
