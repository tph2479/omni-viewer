<script lang="ts">
    import { Link, Image, Video, Music, Loader2 } from "lucide-svelte";
    import { toaster } from "$lib/stores/ui/toaster";

    let url = $state("");
    let mediaType = $state<"image" | "video" | "audio">("image");
    let isLoading = $state(false);
    let result = $state<{ success: boolean; message: string; filePath?: string } | null>(null);

    const mediaOptions = [
        { value: "image", label: "Ảnh", icon: Image, description: "gallery-dl" },
        { value: "video", label: "Video", icon: Video, description: "yt-dlp" },
        { value: "audio", label: "Audio", icon: Music, description: "yt-dlp" },
    ];

    async function handleSubmit() {
        if (!url.trim()) {
            toaster.create({
                type: "error",
                title: "Lỗi",
                description: "Vui lòng nhập link",
            });
            return;
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            toaster.create({
                type: "error",
                title: "Lỗi",
                description: "Link không hợp lệ",
            });
            return;
        }

        isLoading = true;
        result = null;

        try {
            const response = await fetch("/api/getlink", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, type: mediaType }),
            });

            const data = await response.json();

            if (response.ok) {
                result = { success: true, message: data.message, filePath: data.filePath };
                toaster.create({
                    type: "success",
                    title: "Thành công",
                    description: data.message,
                });
                url = "";
            } else {
                result = { success: false, message: data.error || "Có lỗi xảy ra" };
                toaster.create({
                    type: "error",
                    title: "Lỗi",
                    description: data.error || "Có lỗi xảy ra",
                });
            }
        } catch (e) {
            result = { success: false, message: "Không thể kết nối đến server" };
            toaster.create({
                type: "error",
                title: "Lỗi",
                description: "Không thể kết nối đến server",
            });
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
    <div class="space-y-2">
        <h1 class="h2 flex items-center gap-3">
            <Link class="size-8" />
            Get Link
        </h1>
        <p class="text-surface-500 dark:text-surface-400">
            Tải ảnh, video, audio từ link trực tiếp vào thư viện của bạn
        </p>
    </div>

    <!-- Form nhập link -->
    <div class="card preset-outlined p-4 space-y-4">
        <!-- URL Input -->
        <div class="space-y-2">
            <label class="font-medium">Link tải</label>
            <div class="card preset-outlined flex items-center w-full overflow-hidden shadow-none">
                <input
                    type="text"
                    class="flex-1 h-10 px-4 bg-transparent border-none outline-none ring-0
                           text-sm font-medium tracking-tight
                           text-surface-700 dark:text-surface-200"
                    bind:value={url}
                    placeholder="Dán link vào đây..."
                    onkeydown={(e) => e.key === "Enter" && handleSubmit()}
                    disabled={isLoading}
                />
            </div>
        </div>

        <!-- Loại media -->
        <div class="space-y-2">
            <label class="font-medium">Loại nội dung</label>
            <div class="grid grid-cols-3 gap-2">
                {#each mediaOptions as option}
                    <button
                        type="button"
                        class="btn flex flex-col items-center gap-1 py-3 h-auto transition-all
                               {mediaType === option.value
                                   ? 'preset-filled-primary'
                                   : 'preset-tonal-surface'}"
                        onclick={() => (mediaType = option.value as "image" | "video" | "audio")}
                        disabled={isLoading}
                    >
                        <svelte:component this={option.icon} class="size-5" />
                        <span class="text-sm font-medium">{option.label}</span>
                        <span class="text-xs opacity-60">{option.description}</span>
                    </button>
                {/each}
            </div>
        </div>

        <!-- Nút tải -->
        <button
            type="button"
            class="btn preset-filled-primary w-full h-12 transition-all disabled:opacity-50"
            onclick={handleSubmit}
            disabled={isLoading || !url.trim()}
        >
            {#if isLoading}
                <Loader2 class="size-5 animate-spin" />
                <span>Đang xử lý...</span>
            {:else}
                <Link class="size-5" />
                <span>Tải xuống</span>
            {/if}
        </button>
    </div>

    <!-- Kết quả -->
    {#if result}
        <div class="card preset-outlined p-4 space-y-2">
            <div class="flex items-center gap-2">
                {#if result.success}
                    <div class="size-2 rounded-full bg-success-500"></div>
                {:else}
                    <div class="size-2 rounded-full bg-error-500"></div>
                {/if}
                <p class="font-medium">{result.success ? "Thành công" : "Lỗi"}</p>
            </div>
            <p class="text-sm text-surface-500 dark:text-surface-400">{result.message}</p>
            {#if result.filePath}
                <p class="text-xs text-surface-400 dark:text-surface-500 font-mono">
                    Đã lưu vào: {result.filePath}
                </p>
            {/if}
        </div>
    {/if}

    <!-- Thông tin thư mục -->
    <div class="card preset-outlined p-4 space-y-3">
        <h3 class="font-medium">Cấu trúc thư mục</h3>
        <div class="space-y-2 text-sm">
            <div class="flex items-center gap-2">
                <Image class="size-4 text-surface-400" />
                <span class="text-surface-500 dark:text-surface-400">Images/</span>
                <span class="text-xs opacity-60">- gallery-dl (gdl.exe)</span>
            </div>
            <div class="flex items-center gap-2">
                <Video class="size-4 text-surface-400" />
                <span class="text-surface-500 dark:text-surface-400">Videos/</span>
                <span class="text-xs opacity-60">- yt-dlp</span>
            </div>
            <div class="flex items-center gap-2">
                <Music class="size-4 text-surface-400" />
                <span class="text-surface-500 dark:text-surface-400">Music/</span>
                <span class="text-xs opacity-60">- yt-dlp audio</span>
            </div>
        </div>
        <p class="text-xs text-surface-400 dark:text-surface-500">
            File tải về sẽ tự động được lưu vào thư mục tương ứng trong thư viện media của bạn.
        </p>
    </div>
</div>
