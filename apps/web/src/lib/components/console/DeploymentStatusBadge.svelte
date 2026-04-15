<script lang="ts">
  import type { DeploymentSummary } from "@yundu/contracts";

  import { Badge } from "$lib/components/ui/badge";
  import { deploymentStatusLabel } from "$lib/console/utils";

  type Props = {
    status?: DeploymentSummary["status"];
    class?: string;
  };

  let { status, class: className = "" }: Props = $props();

  const tone = $derived.by(() => {
    switch (status) {
      case "succeeded":
        return "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
      case "failed":
      case "canceled":
      case "rolled-back":
        return "border-transparent bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
      case "created":
      case "planning":
      case "planned":
      case "running":
        return "border-transparent bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300";
      default:
        return "border-border bg-muted text-muted-foreground";
    }
  });
</script>

<Badge class={[tone, className]} variant="outline">
  {deploymentStatusLabel(status)}
</Badge>
