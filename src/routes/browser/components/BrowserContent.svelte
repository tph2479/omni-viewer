<script lang="ts">
    import BrowserView from "$lib/client/components/browser/BrowserView.svelte";
    import { browserStore as s } from "$lib/client/stores/browser/index.svelte";

    let wasModalOpen = $state(false);

    $effect(() => {
        const idx = s.modal.image.index;
        if (s.modal.image.open || s.modal.video.open || s.modal.audio.open) {
            const item = s.content.items[idx];
            if (item) {
                s.ui.lastOpenedFile = item.path;
            }
        }
    });

    $effect(() => {
        const isAnyModalOpen = s.modal.isAnyOpen;
        if (wasModalOpen && !isAnyModalOpen && s.ui.lastOpenedFile) {
            s.ui.highlightedPath = s.ui.lastOpenedFile;
            s.ui.lastOpenedFile = null;
            setTimeout(() => {
                if (!s.ui.highlightedPath) return;
                const el = document.getElementById(
                    `item-${s.ui.highlightedPath.replace(/[^a-zA-Z0-9]/g, "-")}`,
                );
                if (el) {
                    el.scrollIntoView({ behavior: "instant", block: "center" });
                    setTimeout(() => {
                        s.ui.highlightedPath = null;
                    }, 2500);
                } else {
                    s.ui.highlightedPath = null;
                }
            }, 0);
        }
        wasModalOpen = isAnyModalOpen;
    });
</script>

<div class="flex-1 flex flex-col">
    <BrowserView highlightedPath={s.ui.highlightedPath} />
</div>
