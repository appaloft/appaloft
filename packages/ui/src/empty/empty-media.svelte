<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> = $props();
</script>

<div
	bind:this={ref}
	data-slot="empty-media"
	class={cn("mb-1 flex size-28 items-center justify-center text-muted-foreground", className)}
	{...restProps}
>
	{@render children?.()}
</div>
