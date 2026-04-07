<script lang="ts">
    import GalleryToolbar from "$lib/components/browser/ui/GalleryToolbar.svelte";
    import { browserStore as s } from "$lib/stores/browser/index.svelte";

    const toolbarActions = $derived({
        onLoad: async () => {
            await s.actions.refreshDrives(true);
            const savedPage = s.folder.pageHistory[s.folder.path] || 0;
            s.actions.loadFolder(true, savedPage);
        },
        onOpenPicker: () => {
            s.actions.refreshDrives();
            s.modal.folderPicker.open = true;
        },
        onOpenWebtoon: s.actions.handleOpenWebtoon,
        onToggleCoverMode: s.actions.handleToggleCoverMode,
        onGoUp: async (path: string) => {
            if (path === "EXIT_EXCLUSIVE") {
                s.actions.handleExitGroupView();
                return;
            }
            s.actions.openDir(path, true);
        },
    });
</script>

<header
    class="sticky top-0 z-100 bg-surface-100 dark:bg-surface-900 px-0 py-0 shadow-md h-14 w-full"
>
    <div class="flex flex-row items-center min-h-full overflow-visible">
        <GalleryToolbar
            folder={{
                path: s.folder.path,
                isFolderSelected: s.folder.isSelected,
                isGrouped: s.content.isGrouped,
                isCoverMode: s.cover.enabled,
                exclusiveType: s.ui.exclusiveType,
                items: s.content.items,
                onPathChange: (v) => (s.folder.path = v),
            }}

            stats={{
                items: s.cover.enabled ? (s.cover.savedState?.counts?.media ?? s.content.totals.media) : s.content.totals.media,
                images: s.cover.enabled 
                    ? (s.cover.savedState?.counts?.images ?? s.content.totals.images) 
                    : s.content.totals.images,
                videos: s.cover.enabled 
                    ? (s.cover.savedState?.counts?.videos ?? s.content.totals.videos) 
                    : s.content.totals.videos,
                audio: s.cover.enabled 
                    ? (s.cover.savedState?.counts?.audio ?? s.content.totals.audio) 
                    : s.content.totals.audio,
                ebook: s.cover.enabled 
                    ? (s.cover.savedState?.counts?.ebook ?? s.content.totals.ebook) 
                    : s.content.totals.ebook,
            }}
            sort={{ current: s.pagination.sort, onChange: s.actions.setSort }}
            filter={{ type: s.pagination.mediaType, onChange: s.actions.setMediaType }}
            actions={toolbarActions}
            isLoading={s.ui.isLoading}
        />
    </div>
</header>
