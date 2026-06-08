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

export const runtimeMonitoringRefreshIntervalMs = 15_000;

export type RuntimeMonitoringTimeRangeId = "15m" | "1h" | "6h" | "24h";

export const runtimeMonitoringTimeRangeOptions: readonly RuntimeMonitoringTimeRangeId[] = [
  "15m",
  "1h",
  "6h",
  "24h",
];

function runtimeMonitoringTimeRangeMs(timeRange: RuntimeMonitoringTimeRangeId): number {
  switch (timeRange) {
    case "15m":
      return 15 * 60 * 1000;
    case "1h":
      return 60 * 60 * 1000;
    case "6h":
      return 6 * 60 * 60 * 1000;
    case "24h":
      return 24 * 60 * 60 * 1000;
  }
}

function runtimeMonitoringBucket(timeRange: RuntimeMonitoringTimeRangeId) {
  switch (timeRange) {
    case "15m":
    case "1h":
      return "minute" as const;
    case "6h":
      return "five-minute" as const;
    case "24h":
      return "hour" as const;
  }
}

function runtimeMonitoringSampleLimit(timeRange: RuntimeMonitoringTimeRangeId): number {
  const minuteCount = Math.ceil(runtimeMonitoringTimeRangeMs(timeRange) / (60 * 1000));
  return Math.min(720, Math.max(60, minuteCount + 1));
}

function recentRetainedSampleWindow(timeRange: RuntimeMonitoringTimeRangeId): {
  from: string;
  to: string;
} {
  const to = new Date();
  return {
    from: new Date(to.getTime() - runtimeMonitoringTimeRangeMs(timeRange)).toISOString(),
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
  });
}

export function runtimeMonitoringSamplesQueryOptions(
  scope: RuntimeUsageScope,
  enabled: boolean,
  timeRange: RuntimeMonitoringTimeRangeId = "1h",
) {
  return queryOptions<RuntimeMonitoringSamplesResponse>({
    queryKey: [...runtimeMonitoringScopeQueryKey("runtime-monitoring-samples", scope), timeRange],
    queryFn: () =>
      orpcClient.runtimeMonitoring.samples({
        scope,
        window: recentRetainedSampleWindow(timeRange),
        signals: ["cpu", "memory", "disk"],
        limit: runtimeMonitoringSampleLimit(timeRange),
      }),
    enabled,
    staleTime: 10_000,
    refetchInterval: runtimeMonitoringRefreshIntervalMs,
  });
}

export function runtimeMonitoringRollupQueryOptions(
  scope: RuntimeUsageScope,
  enabled: boolean,
  timeRange: RuntimeMonitoringTimeRangeId = "1h",
) {
  return queryOptions<RuntimeMonitoringRollupResponse>({
    queryKey: [...runtimeMonitoringScopeQueryKey("runtime-monitoring-rollup", scope), timeRange],
    queryFn: () =>
      orpcClient.runtimeMonitoring.rollup({
        scope,
        window: recentRetainedSampleWindow(timeRange),
        bucket: runtimeMonitoringBucket(timeRange),
        signals: ["cpu", "memory", "disk"],
        includeDeploymentMarkers: true,
      }),
    enabled,
    staleTime: 10_000,
    refetchInterval: runtimeMonitoringRefreshIntervalMs,
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
