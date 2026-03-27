<script lang="ts">
    import { FolderOpen, Plus } from "lucide-svelte";

    let { onOpenPicker }: { onOpenPicker: () => void } = $props();
</script>

<div
    class="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-700 h-full py-12 px-4"
>
    <!-- Icon with soft glow -->
    <div class="relative group mb-8">
        <div
            class="absolute inset-0 bg-primary-500/20 blur-3xl rounded-full scale-150 group-hover:bg-primary-500/30 transition-all duration-500"
        ></div>
        <div
            class="relative bg-surface-100 dark:bg-surface-800 p-8 rounded-[2.5rem] border border-surface-200 dark:border-surface-700 shadow-2xl"
        >
            <FolderOpen size={64} strokeWidth={1.5} class="text-primary-500" />
        </div>
    </div>

    <div class="max-w-md space-y-3 mb-10">
        <h1
            class="text-3xl md:text-4xl font-black tracking-tight text-surface-900 dark:text-surface-50"
        >
            No Library Selected
        </h1>
        <p
            class="text-surface-600 dark:text-surface-400 text-lg font-medium leading-relaxed"
        >
            Please select a directory to index your media library and start
            browsing your collection.
        </p>
    </div>
</div>
