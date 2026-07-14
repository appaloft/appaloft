<script lang="ts">
	import { cn, type WithElementRef } from "../utils.js";
	import { Skeleton } from "../skeleton/index.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		showIcon = false,
		name = "sidebar-menu-item",
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		showIcon?: boolean;
		/** Unique boneyard bone name when multiple menu skeletons are on screen. */
		name?: string;
	} = $props();
</script>

<div bind:this={ref} data-slot="sidebar-menu-skeleton" data-sidebar="menu-skeleton" {...restProps}>
	<Skeleton
		{name}
		loading={true}
		animate="pulse"
		class={cn("h-8 rounded-md", className)}
	>
		{#snippet fixture()}
			<div class="flex h-8 items-center gap-2 rounded-md px-2">
				{#if showIcon}
					<span class="size-4 shrink-0 rounded-md bg-transparent" data-sidebar="menu-skeleton-icon"></span>
				{/if}
				<span class="h-4 min-w-0 flex-1 text-sm">Project name</span>
			</div>
		{/snippet}
		<div class="flex h-8 items-center gap-2 rounded-md px-2" aria-hidden="true">
			{#if showIcon}
				<span class="size-4 shrink-0 rounded-md bg-transparent" data-sidebar="menu-skeleton-icon"></span>
			{/if}
			<span class="h-4 min-w-0 flex-1 text-sm text-transparent">Project name</span>
		</div>
		{@render children?.()}
	</Skeleton>
</div>
