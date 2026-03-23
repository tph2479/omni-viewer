<script lang="ts">
	let { onOpenPicker }: { onOpenPicker: () => void } = $props();
</script>

<div class="flex-1 flex flex-col items-center justify-center opacity-60 bg-base-200/30 rounded-3xl border-2 border-dashed border-base-content/10 p-10 text-center animate-in fade-in duration-700 h-full min-h-[400px]">
	<svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>
	<p class="text-lg font-black mb-1 text-base-content uppercase tracking-tighter">Ready to Explorer</p>
	<p class="text-xs max-w-sm mb-8 opacity-70 font-bold uppercase tracking-widest leading-relaxed">Please select a directory to index your media library.</p>
	<button class="btn btn-primary rounded-2xl px-10 font-black uppercase tracking-widest" onclick={onOpenPicker}>Open Picker</button>
</div>
