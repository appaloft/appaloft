import { type InspectRuntimeUsageResponse, type RuntimeUsageScope } from "@appaloft/contracts";
import { queryOptions } from "@tanstack/svelte-query";

import { orpcClient } from "$lib/orpc";

export function runtimeUsageQueryKey(scope: RuntimeUsageScope): readonly string[] {
  switch (scope.kind) {
    case "server":
      return ["runtime-usage", scope.kind, scope.serverId];
    case "project":
      return ["runtime-usage", scope.kind, scope.projectId];
    case "environment":
      return ["runtime-usage", scope.kind, scope.environmentId];
    case "resource":
      return ["runtime-usage", scope.kind, scope.resourceId];
    case "deployment":
      return ["runtime-usage", scope.kind, scope.deploymentId];
  }
}

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

export function formatRuntimeUsageBytes(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let size = Math.max(0, value);
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}
