<script lang="ts">
  import { CircleHelp } from "@lucide/svelte";
  import { docsHelpTooltipKeyForHref } from "$lib/console/docs-help";
  import { t } from "$lib/i18n";
  import * as Tooltip from "$lib/components/ui/tooltip";

  type Props = {
    href: string;
    ariaLabel: string;
    tooltipLabel?: string;
    className?: string;
  };

  let { href, ariaLabel, tooltipLabel, className = "" }: Props = $props();

  const tooltipKey = $derived(docsHelpTooltipKeyForHref(href));
  const resolvedTooltipLabel = $derived(tooltipLabel ?? (tooltipKey ? $t(tooltipKey) : ariaLabel));
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <a
        class={`inline-flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-xs transition hover:border-ring/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${className}`}
        {href}
        target="_blank"
        rel="external noreferrer"
        aria-label={ariaLabel}
        {...props}
      >
        <CircleHelp class="size-3.5" />
      </a>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content side="top" align="center" sideOffset={6}>
    {resolvedTooltipLabel}
  </Tooltip.Content>
</Tooltip.Root>
