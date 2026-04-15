<script lang="ts">
  import type { DeploymentSummary } from "@yundu/contracts";

  type Props = {
    status?: DeploymentSummary["status"];
    class?: string;
  };

  let { status, class: className = "" }: Props = $props();

  const tone = $derived.by(() => {
    switch (status) {
      case "succeeded":
        return "bg-emerald-600 dark:bg-emerald-400";
      case "failed":
      case "canceled":
      case "rolled-back":
        return "bg-red-500 dark:bg-red-400";
      case "created":
      case "planning":
      case "planned":
      case "running":
        return "bg-sky-500 dark:bg-sky-400";
      default:
        return "bg-muted-foreground/60";
    }
  });
</script>

<span aria-hidden="true" class={["inline-flex size-2 rounded-full", tone, className]}></span>
