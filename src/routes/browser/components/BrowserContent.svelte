<script lang="ts">
    import EmptyState from "$lib/components/EmptyState.svelte";
    import BrowserView from "$lib/components/browser/BrowserView.svelte";
    import { browserStore as s } from "$lib/stores/browser.svelte";

    let wasModalOpen = $state(false);

    $effect(() => {
        const isAnyModalOpen =
            s.modal.image.open ||
            s.modal.video.open ||
            s.modal.webtoon.open ||
            s.modal.audio.open ||
            s.modal.pdf.open;
        if (wasModalOpen && !isAnyModalOpen && s.ui.lastOpenedFile) {
            s.ui.highlightedPath = s.ui.lastOpenedFile;
            s.ui.lastOpenedFile = null;
            setTimeout(() => {
                const el = document.getElementById(
                    `item-${s.ui.highlightedPath?.replace(/[^a-zA-Z0-9]/g, "-")}`,
                );
                if (el)
                    el.scrollIntoView({ behavior: "instant", block: "center" });
            }, 0);
            setTimeout(() => {
                s.ui.highlightedPath = null;
            }, 2500);
        }
        wasModalOpen = isAnyModalOpen;
    });
</script>

<div class="flex-1 flex flex-col">
    {#if !s.folder.isSelected && !s.ui.isLoading}
        <EmptyState onOpenPicker={() => (s.modal.folderPicker.open = true)} />
    {:else if s.folder.isSelected}
        <BrowserView highlightedPath={s.ui.highlightedPath} />
    {/if}
</div>

