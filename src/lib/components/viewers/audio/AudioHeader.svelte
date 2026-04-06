<script lang="ts">
	import { getContext } from 'svelte';
	import type { AudioViewerContext } from './audioPlayer.svelte.ts';
	import { AUDIO_CONTEXT_KEY } from './audioPlayer.svelte.ts';
	import { X } from 'lucide-svelte';

	const ctrl = getContext<AudioViewerContext>(AUDIO_CONTEXT_KEY);
	let s = $derived(ctrl.state);
</script>

<div class="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-surface-200 dark:border-surface-700/50">
    <div class="w-10"></div>
    <div class="flex items-center gap-2">
        <span class="badge badge-sm variant-filled-primary font-bold text-[10px] tracking-widest uppercase">
            {ctrl.extension}
        </span>
    </div>

    <button
        class="btn btn-sm btn-ghost text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100"
        onclick={ctrl.close}
    >
        <X class="w-5 h-5" />
    </button>
</div>
