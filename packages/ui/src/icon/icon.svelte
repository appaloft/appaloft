<script lang="ts" module>
  import type { Component } from "svelte";
  import type { SVGAttributes } from "svelte/elements";

  export type IconSize = "xs" | "sm" | "md" | "lg";

  export type IconProps = SVGAttributes<SVGSVGElement> & {
    icon: Component<SVGAttributes<SVGSVGElement>>;
    label?: string;
    decorative?: boolean;
    size?: IconSize;
  };
</script>

<script lang="ts">
  import { cn } from "../utils.js";

  const sizeClasses: Record<IconSize, string> = {
    xs: "size-3",
    sm: "size-3.5",
    md: "size-4",
    lg: "size-5",
  };

  let {
    icon: IconComponent,
    label,
    decorative = !label,
    size = "md",
    class: className,
    ...restProps
  }: IconProps = $props();
</script>

<IconComponent
  data-slot="icon"
  class={cn("shrink-0", sizeClasses[size], className)}
  aria-hidden={decorative ? true : undefined}
  aria-label={decorative ? undefined : label}
  role={decorative ? undefined : "img"}
  focusable="false"
  {...restProps}
/>
