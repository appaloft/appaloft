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
	data-slot="empty"
	class={cn("flex min-h-64 flex-col items-center justify-center gap-6 rounded-lg p-6 text-center md:p-10", className)}
	{...restProps}
>
	{@render children?.()}
</div>
