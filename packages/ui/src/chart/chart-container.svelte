<script lang="ts" module>
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../utils.js";

	export type ChartConfig = Record<
		string,
		{
			label?: string;
			color?: string;
		}
	>;

	export type ChartContainerProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		config?: ChartConfig;
		children?: Snippet;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		class: className,
		config = {},
		children,
		style,
		...restProps
	}: ChartContainerProps = $props();

	const chartVariables = $derived(
		Object.entries(config)
			.filter((entry): entry is [string, { label?: string; color: string }] =>
				Boolean(entry[1].color)
			)
			.map(([key, item]) => `--color-${key}: ${item.color}`)
			.join("; ")
	);
</script>

<div
	bind:this={ref}
	data-slot="chart"
	class={cn(
		"[&_.layerchart-axis]:text-xs [&_.layerchart-axis]:text-muted-foreground [&_.layerchart-grid-line]:stroke-border/70 [&_.layerchart-rule]:stroke-border [&_.layerchart-tooltip]:z-50 [&_.layerchart-tooltip]:rounded-md [&_.layerchart-tooltip]:border [&_.layerchart-tooltip]:border-border [&_.layerchart-tooltip]:bg-popover [&_.layerchart-tooltip]:p-2 [&_.layerchart-tooltip]:text-popover-foreground [&_.layerchart-tooltip]:shadow-md",
		className
	)}
	style={[chartVariables, style].filter(Boolean).join("; ")}
	{...restProps}
>
	{@render children?.()}
</div>
