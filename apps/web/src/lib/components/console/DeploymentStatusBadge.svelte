<script lang="ts">
  import type { DeploymentSummary } from "@appaloft/contracts";

  import { Badge } from "$lib/components/ui/badge";
  import { deploymentStatusLabel } from "$lib/console/utils";

  type Props = {
    status?: DeploymentSummary["status"];
    class?: string;
  };

  let { status, class: className = "" }: Props = $props();

  const inFlight = $derived(
    status === "created" ||
      status === "planning" ||
      status === "planned" ||
      status === "running" ||
      status === "cancel-requested",
  );
  const tone = $derived.by(() => {
    switch (status) {
      case "succeeded":
        return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-300";
      case "failed":
      case "canceled":
      case "rolled-back":
        return "border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-300";
      case "created":
      case "planning":
      case "planned":
      case "running":
      case "cancel-requested":
        return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-300";
      default:
        return "border-border bg-muted text-muted-foreground";
    }
  });
</script>

<Badge class={["inline-flex items-center gap-1.5", tone, className]} variant="outline">
  {#if inFlight}
    <span class="relative flex size-2 shrink-0" aria-hidden="true" data-deployment-running-signal>
      <span
        class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70 motion-reduce:animate-none"
      ></span>
      <span class="relative inline-flex size-2 rounded-full bg-amber-500"></span>
    </span>
  {/if}
  {deploymentStatusLabel(status)}
</Badge>
