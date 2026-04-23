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
  class={`inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground ${className}`}
  {href}
  target="_blank"
  rel="external noreferrer"
  aria-label={ariaLabel}
  title={ariaLabel}
>
  <CircleHelp class="size-3.5" />
</a>
