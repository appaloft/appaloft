<script lang="ts">
  import type { ResourceHealthOverall } from "@appaloft/contracts";

  type Props = {
    status?: ResourceHealthOverall;
    class?: string;
  };

  let { status = "unknown", class: className = "" }: Props = $props();

  const tone = $derived.by(() => {
    switch (status) {
      case "healthy":
        return "bg-emerald-600";
      case "degraded":
      case "starting":
        return "bg-amber-500";
      case "unhealthy":
      case "stopped":
        return "bg-destructive";
      case "not-deployed":
      case "unknown":
        return "bg-muted-foreground/60";
    }
  });
</script>

<span aria-hidden="true" class={["inline-flex size-2 rounded-full", tone, className]}></span>
