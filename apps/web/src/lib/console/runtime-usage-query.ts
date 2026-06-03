import {
  type InspectRuntimeUsageResponse,
  type RuntimeMonitoringRollupResponse,
  type RuntimeMonitoringSamplesResponse,
  type RuntimeMonitoringThresholdsResponse,
  type RuntimeUsageScope,
} from "@appaloft/contracts";
import { queryOptions } from "@tanstack/svelte-query";

import { orpcClient } from "$lib/orpc";

import { runtimeMonitoringScopeQueryKey, runtimeUsageQueryKey } from "./runtime-usage";

const retainedSampleWindowMs = 60 * 60 * 1000;

function recentRetainedSampleWindow(): { from: string; to: string } {
  const to = new Date();
  return {
    from: new Date(to.getTime() - retainedSampleWindowMs).toISOString(),
    to: to.toISOString(),
  };
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
    staleTime: 2_000,
    refetchInterval: 5_000,
  });
}

export function runtimeMonitoringSamplesQueryOptions(scope: RuntimeUsageScope, enabled: boolean) {
  return queryOptions<RuntimeMonitoringSamplesResponse>({
    queryKey: [...runtimeMonitoringScopeQueryKey("runtime-monitoring-samples", scope), "last-hour"],
    queryFn: () =>
      orpcClient.runtimeMonitoring.samples({
        scope,
        window: recentRetainedSampleWindow(),
        signals: ["cpu", "memory", "disk"],
        limit: 60,
      }),
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function runtimeMonitoringRollupQueryOptions(scope: RuntimeUsageScope, enabled: boolean) {
  return queryOptions<RuntimeMonitoringRollupResponse>({
    queryKey: [...runtimeMonitoringScopeQueryKey("runtime-monitoring-rollup", scope), "last-hour"],
    queryFn: () =>
      orpcClient.runtimeMonitoring.rollup({
        scope,
        window: recentRetainedSampleWindow(),
        bucket: "minute",
        signals: ["cpu", "memory", "disk"],
        includeDeploymentMarkers: true,
      }),
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function runtimeMonitoringThresholdsQueryOptions(
  scope: RuntimeUsageScope,
  enabled: boolean,
) {
  return queryOptions<RuntimeMonitoringThresholdsResponse>({
    queryKey: runtimeMonitoringScopeQueryKey("runtime-monitoring-thresholds", scope),
    queryFn: () =>
      orpcClient.runtimeMonitoring.thresholdShow({
        scope,
      }),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
