<script lang="ts">
    import { toaster } from "$lib/client/stores/ui/toaster";
    import { Portal, Toast } from "@skeletonlabs/skeleton-svelte";
    import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-svelte";

    const getToastConfig = (type: string | undefined) => {
        switch (type) {
            case 'success':
                return {
                    icon: CheckCircle2,
                    color: 'text-primary-600 dark:text-primary-400',
                    accent: 'bg-primary-500',
                    border: 'border-primary-500/20'
                };
            case 'error':
                return {
                    icon: AlertCircle,
                    color: 'text-error-600 dark:text-error-400',
                    accent: 'bg-error-500',
                    border: 'border-error-500/20'
                };
            case 'warning':
                return {
                    icon: AlertTriangle,
                    color: 'text-warning-600 dark:text-warning-400',
                    accent: 'bg-warning-500',
                    border: 'border-warning-500/20'
                };
            default:
                return {
                    icon: Info,
                    color: 'text-surface-600 dark:text-surface-400',
                    accent: 'bg-surface-500',
                    border: 'border-surface-200/50 dark:border-white/10'
                };
        }
    };
</script>

<Portal>
    <Toast.Group
        {toaster}
        class="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 items-end pointer-events-none"
    >
        {#snippet children(toast)}
            {@const config = getToastConfig(toast.type)}
            <Toast
                {toast}
                class="pointer-events-auto flex items-center gap-4 w-96 px-4 py-4
                    bg-white/90 dark:bg-surface-900/90 backdrop-blur-xl 
                    border border-surface-200/50 dark:border-white/10
                    rounded-2xl shadow-xl shadow-surface-900/5 dark:shadow-black/50 transition-all duration-300
                    overflow-hidden relative group"
            >
                <!-- Left accent border -->
                <div class="absolute left-0 top-0 bottom-0 w-1.5 {config.accent} opacity-70"></div>
                
                <!-- Background glow -->
                <div class="absolute -left-4 -top-4 w-24 h-24 {config.accent} opacity-[0.05] dark:opacity-[0.03] blur-3xl pointer-events-none"></div>

                <!-- Icon -->
                <div class="shrink-0 {config.color} bg-surface-100/50 dark:bg-white/5 p-2 rounded-xl border border-surface-200/50 dark:border-white/5">
                    <svelte:component this={config.icon} size={20} />
                </div>

                <!-- Content -->
                <div class="flex flex-col flex-1 min-w-0 gap-1">
                    {#if toast.title}
                        <div class="text-[13px] font-bold text-surface-900 dark:text-white leading-tight tracking-tight">
                            {toast.title}
                        </div>
                    {/if}
                    {#if toast.description}
                        <div class="text-xs text-surface-600 dark:text-surface-200 leading-snug font-medium opacity-90">
                            {toast.description}
                        </div>
                    {/if}
                </div>

                <!-- Close Button -->
                <Toast.CloseTrigger class="btn-icon shrink-0 size-8 rounded-xl text-surface-400 dark:text-white/30 hover:text-surface-900 dark:hover:text-white hover:bg-surface-100 dark:hover:bg-white/10 transition-all duration-200">
                    <X size={14} />
                </Toast.CloseTrigger>
            </Toast>
        {/snippet}
    </Toast.Group>
</Portal>
