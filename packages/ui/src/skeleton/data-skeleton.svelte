<script lang="ts">
	/**
	 * Granular boneyard wrapper for data-bound UI cells.
	 * Wrap values (numbers, titles, rows), not whole pages.
	 * `capture` is used for bone capture and as muted fallback until bones exist.
	 */
	import type { Snippet } from "svelte";
	import Skeleton from "boneyard-js/svelte";

	type Props = {
		name: string;
		loading: boolean;
		class?: string;
		fallbackClass?: string;
		children?: Snippet;
		capture?: Snippet;
	};

	let {
		name,
		loading,
		class: className = "",
		fallbackClass = "inline-block min-h-[1em] min-w-[2ch] animate-pulse rounded bg-muted/70",
		children,
		capture,
	}: Props = $props();
</script>

<Skeleton {name} {loading} animate="pulse" transition class={className}>
	{#snippet fallback()}
		{#if capture}
			<div class="animate-pulse rounded bg-muted/50 text-transparent select-none" aria-hidden="true">
				{@render capture()}
			</div>
		{:else}
			<span class={fallbackClass} aria-hidden="true"></span>
		{/if}
	{/snippet}
	{#snippet fixture()}
		{#if capture}
			{@render capture()}
		{:else}
			{@render children?.()}
		{/if}
	{/snippet}
	{@render children?.()}
</Skeleton>
