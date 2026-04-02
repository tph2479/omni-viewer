<script lang="ts">
    import { Cog } from "lucide-svelte";
</script>

<div
    class="h-full flex flex-col items-center justify-center text-center max-w-3xl mx-auto py-12"
>
    <div class="mb-8 flex flex-col items-center gap-6">
        <div class="animate-bounce" style="color: var(--color-primary-400);">
            <Cog size="128" />
        </div>

        <div class="space-y-2">
            <h1
                class="text-3xl lg:text-4xl uppercase tracking-tight text-surface-700 dark:text-surface-50"
            >
                Media Station is under construction
            </h1>
            <h2 class="text-surface-500 uppercase">
                Please come back later...
            </h2>
        </div>
    </div>
</div>
