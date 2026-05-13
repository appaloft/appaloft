import { type InspectRuntimeUsageResponse, type RuntimeUsageScope } from "@appaloft/contracts";
import { queryOptions } from "@tanstack/svelte-query";

import { orpcClient } from "$lib/orpc";

import { runtimeUsageQueryKey } from "./runtime-usage";

export function runtimeUsageQueryOptions(scope: RuntimeUsageScope, enabled: boolean) {
  return queryOptions<InspectRuntimeUsageResponse>({
    queryKey: runtimeUsageQueryKey(scope),
    queryFn: () =>
      orpcClient.runtimeUsage.inspect({
        scope,
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      }),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
