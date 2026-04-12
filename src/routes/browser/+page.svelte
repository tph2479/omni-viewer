<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import BrowserHeader from "./components/BrowserHeader.svelte";
    import BrowserContent from "./components/BrowserContent.svelte";

    import { browserStore as s } from "$lib/client/stores/browser/index.svelte";

    const { data } = $props();

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    onMount(async () => {
        const saved = localStorage.getItem("last-path");
        if (data.urlPath) {
            s.folder.path = data.urlPath;
        } else if (saved) {
            s.folder.path = saved;
        } else if (data.defaultPath) {
            s.folder.path = data.defaultPath;
        }

        // Load folder history before loading
        const savedHistory = sessionStorage.getItem("folder-history");
        if (savedHistory) {
            try {
                s.folder.pageHistory = JSON.parse(savedHistory);
            } catch (e) {
                console.error("Failed to parse folder history");
            }
        }

        // Start loading drives in parallel (always)
        const drivesPromise = s.actions.refreshDrives();

        if (s.folder.path) {
            s.folder.path = s.folder.normalize(s.folder.path);
            const savedPage = s.folder.pageHistory[s.folder.path] || 0;
            await s.actions.loadFolder(true, savedPage);
        } else {
            // No path saved — wait for drives and use first one
            await drivesPromise;
            if (s.ui.availableDrives.length > 0) {
                s.folder.path = s.folder.normalize(s.ui.availableDrives[0].path);
                await s.actions.loadFolder(true, 0);
            }
        }
    });

    // Handle orientation change for responsive grid
    function handleOrientationChange() {
        window.dispatchEvent(new Event("resize"));
    }

    onMount(() => {
        window.addEventListener("orientationchange", handleOrientationChange);
        return () => {
            window.removeEventListener(
                "orientationchange",
                handleOrientationChange,
            );
        };
    });

    onDestroy(() => {
        s.reset();
    });
</script>

<div class="flex flex-col relative w-full min-h-full">
    <BrowserHeader />
    <BrowserContent />
</div>
