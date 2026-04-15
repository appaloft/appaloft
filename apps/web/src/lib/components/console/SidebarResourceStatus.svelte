<script lang="ts">
  import type { DeploymentSummary } from "@yundu/contracts";

  import { deploymentStatusLabel } from "$lib/console/utils";

  type Props = {
    status?: DeploymentSummary["status"];
    class?: string;
  };

  let { status, class: className = "" }: Props = $props();

  const tone = $derived.by(() => {
    switch (status) {
      case "succeeded":
        return "text-emerald-700 dark:text-emerald-300";
      case "failed":
      case "canceled":
      case "rolled-back":
        return "text-red-700 dark:text-red-300";
      case "created":
      case "planning":
      case "planned":
      case "running":
        return "text-sky-700 dark:text-sky-300";
      default:
        return "text-muted-foreground/70";
    }
  });
</script>

<span class={["max-w-[4.25rem] shrink-0 truncate text-[0.6875rem] leading-4", tone, className]}>
  {deploymentStatusLabel(status)}
</span>
