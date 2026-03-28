<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import BrowserHeader from "./components/BrowserHeader.svelte";
    import BrowserContent from "./components/BrowserContent.svelte";

    import { browserStore as s } from "$lib/stores/browser.svelte";

    const { data } = $props();

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    onMount(async () => {
        const saved = localStorage.getItem("last-path");
        if (saved) {
            s.folder.path = saved;
        } else if (data.defaultPath) {
            s.folder.path = data.defaultPath;
        }

        const savedHistory = sessionStorage.getItem("folder-history");
        if (savedHistory) {
            try {
                s.folder.pageHistory = JSON.parse(savedHistory);
            } catch (e) {
                console.error("Failed to parse folder history");
            }
        }

        // Auto load last folder if exists
        if (s.folder.path) {
            s.folder.path = s.folder.normalize(s.folder.path);
            const savedPage = s.folder.pageHistory[s.folder.path] || 0;
            s.ui.loadFolder(true, savedPage);
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
