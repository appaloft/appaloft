<script lang="ts">
  import { browser } from "$app/environment";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";

  import { orpcClient } from "$lib/orpc";
  import SidebarResourceStatus from "./SidebarResourceStatus.svelte";

  type Props = {
    resourceId: string;
    class?: string;
  };

  let { resourceId, class: className = "" }: Props = $props();

  const healthQuery = createQuery(() =>
    queryOptions({
      queryKey: ["resources", "health", resourceId, "compact"],
      queryFn: () =>
        orpcClient.resources.health({
          resourceId,
          includeChecks: false,
        }),
      enabled: browser && resourceId.length > 0,
      staleTime: 5_000,
    }),
  );
  const status = $derived(healthQuery.data?.overall ?? "unknown");
</script>

<SidebarResourceStatus {status} class={className} />
