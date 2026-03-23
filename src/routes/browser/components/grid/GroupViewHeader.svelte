<script lang="ts">
	let { currentExclusiveType, onExit }: { currentExclusiveType: string; onExit: () => void } = $props();
</script>

<div class="mb-4 flex items-center justify-between bg-base-200/50 backdrop-blur-md px-4 py-3 rounded-2xl border border-base-content/10 shadow-sm animate-in fade-in slide-in-from-top-2">
	<div class="flex items-center gap-3">
		<button class="btn btn-sm btn-circle btn-ghost" onclick={onExit} aria-label="Back to Group View">
			<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-base-content" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
		</button>
		<span class="font-bold tracking-tight uppercase text-sm text-base-content/80">Viewing: <span class="text-primary">{currentExclusiveType}</span></span>
	</div>
</div>
