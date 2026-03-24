<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	let { currentExclusiveType, onExit }: { currentExclusiveType: string; onExit: () => void } = $props();
</script>

<div class="mb-4 flex items-center justify-between bg-base-200/50 backdrop-blur-md px-4 py-3 rounded-2xl border border-base-content/10 shadow-sm animate-in fade-in slide-in-from-top-2">
	<div class="flex items-center gap-3">
		<button class="btn btn-sm btn-circle btn-ghost" onclick={onExit} aria-label="Back to Group View">
			<ArrowLeft class="w-5 h-5 text-base-content" />
		</button>
		<span class="font-bold tracking-tight uppercase text-sm text-base-content/80">Viewing: <span class="text-primary">{currentExclusiveType}</span></span>
	</div>
</div>
