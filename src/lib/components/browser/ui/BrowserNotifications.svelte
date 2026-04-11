<script lang="ts">
    import { toaster } from "$lib/stores/ui/toaster";
    import { Portal, Toast } from "@skeletonlabs/skeleton-svelte";
</script>

<Portal>
    <Toast.Group
        {toaster}
        class="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 items-end pointer-events-none"
    >
        {#snippet children(toast)}
            <Toast
                {toast}
                class="pointer-events-auto flex items-center gap-4 w-96 px-4 py-4
                    bg-surface-50 dark:bg-surface-900
                    border border-surface-200 dark:border-surface-700
                    rounded-xl shadow-lg"
            >
                <!-- Type color bar -->
                <span
                    class="w-1 self-stretch rounded-full shrink-0"
                    style="background-color: {toast.type === 'success'
                        ? 'var(--color-success-500)'
                        : toast.type === 'error'
                        ? 'var(--color-error-500)'
                        : toast.type === 'warning'
                        ? 'var(--color-warning-500)'
                        : 'var(--color-primary-500)'};"
                ></span>
                <div class="flex flex-col flex-1 min-w-0 gap-1">
                    {#if toast.title}
                        <div class="text-base font-semibold text-surface-900 dark:text-surface-50 leading-tight">
                            {toast.title}
                        </div>
                    {/if}
                    {#if toast.description}
                        <div class="text-sm text-surface-500 dark:text-surface-400 leading-snug">
                            {toast.description}
                        </div>
                    {/if}
                </div>
                <Toast.CloseTrigger class="btn-icon shrink-0 size-7 rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors text-sm">
                    ✕
                </Toast.CloseTrigger>
            </Toast>
        {/snippet}
    </Toast.Group>
</Portal>
