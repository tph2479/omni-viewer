<script lang="ts">
	import "../app.css";
	import { onMount } from 'svelte';

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
			await fetch('/api/image', { method: 'DELETE' });
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
		<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label> 
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
				<button
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-lg' : 'w-full px-3'}"
					data-tip={isSidebarCollapsed ? "Import" : ""}
					onmousedown={(e) => e.preventDefault()}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
					<span class="{isMounted ? 'transition-opacity duration-300' : ''} whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						Import
					</span>
				</button>
			</li>
			
			<!-- Bottom Tools docked at the bottom via mt-auto -->
			<li class="w-full mt-auto border-t border-base-200/50 pt-2">
				<button
					onclick={toggleTheme}
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-xl' : 'px-3 flex items-center'} cursor-pointer hover:bg-primary/10 transition-all duration-200 outline-none focus:outline-none group"
					data-tip={isSidebarCollapsed ? (isLightMode ? "Light Mode" : "Dark Mode") : (isLightMode ? "Light Mode" : "Dark Mode")}
					onmousedown={(e) => e.preventDefault()}
				>
					<span class="shrink-0 w-5 h-5 {isSidebarCollapsed ? '' : 'mr-1.5'} group-hover:scale-110 transition-transform relative">
						<svg class="theme-icon-light fill-current absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.65,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/></svg>
						<svg class="theme-icon-dark fill-current absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"/></svg>
					</span>
					<span class="whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						{isLightMode ? 'Light' : 'Dark'}
					</span>
				</button>
			</li>

			<li class="w-full">
				<button 
					onclick={clearThumbnailCache} 
					disabled={isClearingCache}
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-xl' : 'px-3 flex items-center'} hover:bg-error/10 transition-all duration-200 outline-none focus:outline-none group"
					data-tip={isSidebarCollapsed ? "Clear Thumb Cache" : ""}
					onmousedown={(e) => e.preventDefault()}
				>
					<span class="shrink-0 w-5 h-5 {isSidebarCollapsed ? '' : 'mr-1.5'} group-hover:scale-110 group-hover:text-error transition-all flex items-center justify-center">
						{#if isClearingCache}
							<span class="loading loading-spinner loading-sm w-5 h-5"></span>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
						{/if}
					</span>
					<span class="whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						Clear Cache
					</span>
				</button>
			</li>

			<li class="w-full">
				<button
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-xl' : 'px-3 flex items-center'} cursor-pointer hover:bg-primary/10 transition-all duration-200 outline-none focus:outline-none group"
					data-tip={isSidebarCollapsed ? "Settings" : ""}
					onmousedown={(e) => e.preventDefault()}
				>
					<span class="shrink-0 w-5 h-5 {isSidebarCollapsed ? '' : 'mr-1.5'} group-hover:scale-110 transition-transform">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
					</span>
					<span class="whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						Settings
					</span>
				</button>
			</li>

			<li class="w-full">
				<button 
					onclick={toggleSidebar} 
					class="py-2 w-full {isSidebarCollapsed ? 'tooltip tooltip-right flex justify-center px-0 rounded-xl' : 'px-3 flex items-center'} hover:bg-primary/10 transition-all duration-200 outline-none focus:outline-none group"
					data-tip={isSidebarCollapsed ? "Expand Menu" : ""}
					onmousedown={(e) => e.preventDefault()}
				>
					<span class="shrink-0 w-5 h-5 {isSidebarCollapsed ? '' : 'mr-1.5'} group-hover:scale-110 transition-transform flex items-center justify-center">
						{#if isSidebarCollapsed}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
						{/if}
					</span>
					<span class="whitespace-nowrap ml-1.5 text-sm font-medium {isSidebarCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto inline'}">
						{isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
					</span>
				</button>
			</li>
		</ul>

	</div>

	<!-- Content box -->
	<div class="drawer-content flex flex-col flex-1 min-w-0 h-full overflow-y-auto">
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
