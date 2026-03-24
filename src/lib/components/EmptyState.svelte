<script lang="ts">
    import { FolderSearch } from "lucide-svelte";

    let { onOpenPicker }: { onOpenPicker: () => void } = $props();
</script>

<div
    class="flex-1 flex flex-col items-center justify-center
           bg-surface-50-800 border border-surface-200-800
           rounded-2xl p-8 shadow-inner
           text-center animate-in fade-in zoom-in-95 duration-700 h-full"
>
    <div class="relative mb-6">
        <FolderSearch
            size={80}
            strokeWidth={1}
            class="opacity-20 text-surface-900-50-token"
        />

        <div
            class="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 rounded-full animate-ping opacity-50"
        ></div>
    </div>

    <h2
        class="text-xl font-black mb-1 text-surface-900-50-token uppercase tracking-tighter"
    >
        Ready to Explore
    </h2>

    <p
        class="text-[11px] max-w-xs mb-10 opacity-60 font-bold uppercase tracking-[0.2em] leading-relaxed text-surface-900-50-token"
    >
        Please select a directory to index your media library.
    </p>

    <button
        class="btn variant-filled-primary rounded-container-token px-12 py-4 font-black uppercase tracking-widest shadow-xl shadow-primary-500/20 hover:variant-ghost-primary transition-all active:scale-95"
        onclick={onOpenPicker}
    >
        <span>Open Picker</span>
    </button>
</div>
