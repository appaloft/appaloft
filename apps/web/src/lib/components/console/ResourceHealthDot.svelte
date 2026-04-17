<script lang="ts">
  import { browser } from "$app/environment";
  import type { ResourceHealthOverall } from "@appaloft/contracts";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";

  import { orpcClient } from "$lib/orpc";
  import ResourceStatusDot from "./ResourceStatusDot.svelte";

  type ResourceHealthViewStatus = ResourceHealthOverall | "loading";

  type Props = {
    resourceId: string;
    class?: string;
  };

  let { resourceId, class: className = "" }: Props = $props();

  const healthQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources", "health", resourceId, "compact", "live"],
      queryFn: () =>
        orpcClient.resources.health({
          resourceId,
          mode: "live",
          includeChecks: false,
          includePublicAccessProbe: true,
        }),
      enabled: browser && resourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const status = $derived.by((): ResourceHealthViewStatus => {
    if (
      healthQuery.isPending ||
      (healthQuery.isFetching && healthQuery.data?.overall === "unknown")
    ) {
      return "loading";
    }

    return healthQuery.data?.overall ?? "unknown";
  });
</script>

<ResourceStatusDot {status} class={className} />
