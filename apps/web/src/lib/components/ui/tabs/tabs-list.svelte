<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  export const tabsListVariants = tv({
    base: "bg-muted text-muted-foreground inline-flex h-8 w-fit items-center justify-center rounded-lg p-0.5",
    variants: {
      variant: {
        default: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  });

  export type TabsListVariant = VariantProps<typeof tabsListVariants>["variant"];
</script>

<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    variant = "default",
    ...restProps
  }: TabsPrimitive.ListProps & {
    variant?: TabsListVariant;
  } = $props();
</script>

<TabsPrimitive.List
  bind:ref
  data-slot="tabs-list"
  class={cn(tabsListVariants({ variant }), className)}
  {...restProps}
/>
