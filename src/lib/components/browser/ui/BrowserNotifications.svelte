<script lang="ts">
    import { toaster } from "$lib/stores/ui/toaster";
    import { Portal, Toast } from "@skeletonlabs/skeleton-svelte";
</script>

<Portal>
    <Toast.Group
        {toaster}
        class="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-2 items-end pointer-events-none"
    >
        {#snippet children(toast)}
            <Toast
                {toast}
                class="pointer-events-auto flex items-center gap-3.5 w-80 px-4 py-3.5
                    bg-surface-100 dark:bg-surface-900
                    border border-surface-200 dark:border-surface-800
                    rounded-xl shadow-xl"
            >
                <!-- Type indicator bar -->
                <span
                    class="w-1 self-stretch rounded-xl shrink-0"
                    style="background-color: {toast.type === 'success'
                        ? 'var(--color-success-500)'
                        : toast.type === 'error'
                        ? 'var(--color-error-500)'
                        : toast.type === 'warning'
                        ? 'var(--color-warning-500)'
                        : 'var(--color-primary-500)'};"
                ></span>
                <div class="flex flex-col flex-1 min-w-0 gap-0.5">
                    {#if toast.title}
                        <div class="text-sm font-semibold text-surface-900 dark:text-surface-50 leading-tight">
                            {toast.title}
                        </div>
                    {/if}
                    {#if toast.description}
                        <div class="text-xs text-surface-500 dark:text-surface-400 leading-tight">
                            {toast.description}
                        </div>
                    {/if}
                </div>
                <Toast.CloseTrigger class="btn-icon shrink-0 size-6 rounded-xl text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors text-xs">
                    ✕
                </Toast.CloseTrigger>
            </Toast>
        {/snippet}
    </Toast.Group>
</Portal>
