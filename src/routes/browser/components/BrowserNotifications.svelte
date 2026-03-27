<script lang="ts">
    import { browserStore as s } from "$lib/stores/browser.svelte";
    import { AlertTriangle } from "lucide-svelte";
</script>

{#if s.ui.popup.open}
    <div class="fixed bottom-6 right-6 z-[1000] animate-in slide-in-from-right-10 fade-in duration-300">
        <button
            class="bg-base-100 border border-base-content/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] rounded-2xl p-5 flex items-center gap-4 max-w-sm cursor-pointer hover:bg-base-100/90 transition-colors ring-1 ring-base-content/5 text-left w-full"
            aria-label="Dismiss notification"
            onclick={() => { 
                s.ui.popup.open = false; 
                if (s.ui.popup.timer) { 
                    clearTimeout(s.ui.popup.timer); 
                    s.ui.popup.timer = null; 
                } 
            }}
        >
            <div class="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle class="h-6 w-6 text-warning" strokeWidth={1.5} />
            </div>
            <div class="flex flex-col text-left">
                <h3 class="font-black text-sm uppercase tracking-tight text-base-content/90">No Images Found</h3>
                <p class="text-[11px] opacity-60 font-bold uppercase tracking-widest leading-none mt-1">Directory has no compatible media</p>
            </div>
        </button>
    </div>
{/if}
