<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from "../utils.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		"border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/35 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 rounded-[calc(var(--radius-lg)-2px)] border bg-card px-3 py-2 text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.38)] transition-colors hover:border-ring/30 focus-visible:ring-2 aria-invalid:ring-2 md:text-sm placeholder:text-muted-foreground/75 flex field-sizing-content min-h-24 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	bind:value
	{...restProps}
></textarea>
