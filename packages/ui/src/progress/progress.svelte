<script lang="ts" module>
	import { Progress as ProgressPrimitive } from "bits-ui";

	export type ProgressProps = ProgressPrimitive.RootProps;
</script>

<script lang="ts">
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		value = 0,
		max = 100,
		min = 0,
		child: _child,
		children: _children,
		"data-slot": dataSlot = "progress",
		...restProps
	}: ProgressProps = $props();

	const progressPercent = $derived(
		value === null
			? 100
			: Math.max(0, Math.min(100, (((value ?? min) - min) / Math.max(max - min, 1)) * 100))
	);
	const indicatorStyle = $derived(
		value === null ? undefined : `transform: translateX(-${100 - progressPercent}%);`
	);
</script>

<ProgressPrimitive.Root
	bind:ref
	{value}
	{max}
	{min}
	data-slot={dataSlot}
	class={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/12", className)}
	{...restProps}
>
	<div
		data-slot="progress-indicator"
		class={cn(
			"appaloft-progress-indicator h-full w-full flex-1 rounded-full bg-primary transition-transform duration-300 ease-out will-change-transform",
			value === null && "appaloft-progress-indicator-indeterminate"
		)}
		style={indicatorStyle}
	></div>
</ProgressPrimitive.Root>

<style>
	.appaloft-progress-indicator {
		position: relative;
		overflow: hidden;
	}

	.appaloft-progress-indicator::after {
		position: absolute;
		inset: 0;
		content: "";
		background: linear-gradient(90deg, transparent, rgb(255 255 255 / 48%), transparent);
		opacity: 0.72;
		transform: translateX(-100%);
		animation: appaloft-progress-shimmer 1.4s ease-in-out infinite;
	}

	.appaloft-progress-indicator-indeterminate {
		animation: appaloft-progress-indeterminate 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}

	@keyframes appaloft-progress-shimmer {
		0% {
			transform: translateX(-100%);
		}

		70%,
		100% {
			transform: translateX(100%);
		}
	}

	@keyframes appaloft-progress-indeterminate {
		0% {
			transform: translateX(-85%) scaleX(0.25);
		}

		50% {
			transform: translateX(-25%) scaleX(0.55);
		}

		100% {
			transform: translateX(85%) scaleX(0.25);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.appaloft-progress-indicator {
			transition: none;
		}

		.appaloft-progress-indicator::after,
		.appaloft-progress-indicator-indeterminate {
			animation: none;
		}
	}
</style>
