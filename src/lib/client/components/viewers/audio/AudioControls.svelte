<script lang="ts">
	import { getContext } from 'svelte';
	import type { AudioViewerContext } from './audioPlayer.svelte.ts';
	import { AUDIO_CONTEXT_KEY } from './audioPlayer.svelte.ts';
    import { formatBytes } from '$lib/shared/utils/formatters';
	import {
        Play,
        Pause,
        Volume2,
        VolumeX,
        Repeat,
        SkipBack,
        SkipForward,
        ArrowBigRightDash,
        Video,
    } from "lucide-svelte";

	const ctrl = getContext<AudioViewerContext>(AUDIO_CONTEXT_KEY);
	let s = $derived(ctrl.state);

    let { children }: { children?: import('svelte').Snippet } = $props();

    let progress = $derived(
        s.duration ? (s.currentTime / s.duration) * 100 : 0,
    );

    let isDarkTheme = $derived.by(() => {
        if (typeof document === "undefined") return true;
        return document.documentElement.classList.contains("dark");
    });

    let seekbarBgColor = $derived(isDarkTheme ? "bg-surface-700" : "bg-surface-300");
    let seekbarFillColor = $derived(isDarkTheme ? "#fff" : "#000");
    let seekbarGlow = $derived(isDarkTheme ? "0 0 8px rgba(255,255,255,0.5)" : "0 0 6px rgba(0,0,0,0.3)");

    function handleSeek(e: Event) {
        const target = e.target as HTMLInputElement;
        if (s.audioPlayer) {
            s.audioPlayer.currentTime = Number(target.value);
        }
    }
</script>

<div class="flex flex-col md:flex-row items-center md:items-stretch gap-4 md:gap-10 w-full max-w-3xl">
    {@render children?.()}
    <div class="flex-1 flex flex-col min-w-0 w-full gap-3 md:gap-2">
        <!-- Title pushes to bottom on desktop via flex-1 -->
    <div class="flex-1 flex flex-col justify-end text-center md:text-left">
        <h1
            class="text-lg sm:text-xl md:text-2xl font-bold text-surface-900 dark:text-surface-100 leading-tight audio-title-scroll"
            style="mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);"
            title={ctrl.currentAudio?.name}
        >
            {ctrl.currentAudio?.name.replace(/\.[^/.]+$/, "")}
        </h1>
        <p class="text-surface-500 dark:text-surface-400 text-sm mt-1">
            {formatBytes(ctrl.currentAudio?.size || 0)} &bull; {ctrl.selectedImageIndexDisplay} of {ctrl.totalImages}
        </p>
    </div>
    <!-- Controls row -->
    <div class="flex items-center justify-center md:justify-end gap-2 sm:gap-3 shrink-0">
        <button
            class="btn btn-circle btn-ghost text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100"
            onclick={ctrl.prev}
        >
            <SkipBack class="w-5 h-5" />
        </button>

        <!-- Play/Pause -->
        <button
            class="btn btn-circle btn-primary w-14 h-14"
            onclick={ctrl.togglePlay}
        >
            {#if s.isPlaying}
                <Pause class="w-5 h-5" />
            {:else}
                <Play class="w-5 h-5" />
            {/if}
        </button>

        <!-- Next -->
        <button
            class="btn btn-circle btn-ghost text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100"
            onclick={ctrl.next}
        >
            <SkipForward class="w-5 h-5" />
        </button>

        <!-- Loop -->
        <button
            class="btn btn-circle btn-ghost {s.isLooping
                ? ''
                : 'text-surface-400 dark:text-surface-500'}"
            style={s.isLooping ? 'color: var(--color-primary-500);' : ''}
            onclick={() => (s.isLooping = !s.isLooping)}
            title="Loop"
        >
            <Repeat class="w-5 h-5" />
        </button>

        <!-- Auto Next -->
        <button
            class="btn btn-circle btn-ghost {s.isAutoNext
                ? ''
                : 'text-surface-400 dark:text-surface-500'}"
            style={s.isAutoNext ? 'color: var(--color-primary-500);' : ''}
            onclick={() => (s.isAutoNext = !s.isAutoNext)}
            title="Auto Next"
        >
            <ArrowBigRightDash class="w-5 h-5" />
        </button>

        <!-- Volume -->
        <button
            class="btn btn-circle btn-ghost text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100"
            onclick={ctrl.toggleMute}
        >
            {#if s.isMuted || s.volume === 0}
                <VolumeX class="w-5 h-5" />
            {:else}
                <Volume2 class="w-5 h-5" />
            {/if}
        </button>
    </div>
    </div>
</div>

<!-- Seek bar — full width of parent -->
<div class="w-full max-w-3xl space-y-1 mt-4 md:mt-0">
    <div
        class="relative h-2 rounded-full overflow-hidden {seekbarBgColor}"
    >
        <div
            class="absolute top-0 left-0 h-full transition-all rounded-full"
            style="width: {progress}%; background-color: {seekbarFillColor}; box-shadow: {seekbarGlow};"
        ></div>
        <input
            type="range"
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            min="0"
            max={s.duration || 100}
            value={s.currentTime}
            oninput={handleSeek}
        />
    </div>
    <div
        class="flex justify-between text-xs font-mono text-surface-500 dark:text-surface-400"
    >
        <span class="text-surface-700 dark:text-surface-300"
            >{ctrl.formatTime(s.currentTime)}</span
        >
        <span>{ctrl.formatTime(s.duration)}</span>
    </div>
</div>

<!-- Switch to Video (if applicable) -->
{#if ctrl.currentAudio?.mediaType === 'video' && ctrl.onSwitchToVideo}
    <button
        class="btn btn-sm variant-filled-primary mt-4"
        onclick={ctrl.onSwitchToVideo}
    >
        <Video class="w-5 h-5 mr-2" />
        Switch to Video
    </button>
{/if}
