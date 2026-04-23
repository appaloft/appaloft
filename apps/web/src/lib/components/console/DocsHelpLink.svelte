<script lang="ts">
  import { CircleHelp } from "@lucide/svelte";

  type Props = {
    href: string;
    ariaLabel: string;
    className?: string;
  };

  let { href, ariaLabel, className = "" }: Props = $props();
</script>

<a
  class={`inline-flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-xs transition hover:border-ring/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${className}`}
  {href}
  target="_blank"
  rel="external noreferrer"
  aria-label={ariaLabel}
  title={ariaLabel}
>
  <CircleHelp class="size-3.5" />
</a>
