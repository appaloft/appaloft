import { type InspectRuntimeUsageResponse, type RuntimeUsageScope } from "@appaloft/contracts";

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

export type RuntimeMonitoringSample = {
  observedAt: string;
  cpuLoadPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
};

function percent(used: number | undefined, total: number | undefined): number | null {
  if (
    used === undefined ||
    total === undefined ||
    !Number.isFinite(used) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null;
  }

  return Math.max(0, Math.min(100, (used / total) * 100));
}

export function runtimeMonitoringSampleFromUsage(
  usage: InspectRuntimeUsageResponse | null,
): RuntimeMonitoringSample | null {
  if (!usage) {
    return null;
  }

  const logicalCores = usage.totals.cpu?.logicalCores;
  const cpuLoadPercent =
    usage.totals.cpu?.loadAverage1m !== undefined &&
    logicalCores !== undefined &&
    Number.isFinite(usage.totals.cpu.loadAverage1m) &&
    Number.isFinite(logicalCores) &&
    logicalCores > 0
      ? Math.max(0, Math.min(100, (usage.totals.cpu.loadAverage1m / logicalCores) * 100))
      : null;

  return {
    observedAt: usage.observedAt ?? usage.generatedAt,
    cpuLoadPercent,
    memoryPercent: percent(usage.totals.memory?.usedBytes, usage.totals.memory?.totalBytes),
    diskPercent: percent(usage.totals.disk?.usedBytes, usage.totals.disk?.totalBytes),
  };
}

export function appendRuntimeMonitoringSample(
  samples: RuntimeMonitoringSample[],
  sample: RuntimeMonitoringSample,
  limit = 20,
): RuntimeMonitoringSample[] {
  const withoutDuplicate = samples.filter((item) => item.observedAt !== sample.observedAt);
  return [...withoutDuplicate, sample].slice(-limit);
}

export function formatRuntimeMonitoringPercent(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return `${Math.round(value)}%`;
}

export function runtimeMonitoringSparklinePoints(
  values: Array<number | null>,
  width = 160,
  height = 48,
): string {
  const indexedValues = values
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => point.value !== null);

  if (indexedValues.length < 2) {
    return "";
  }

  const maxIndex = Math.max(1, values.length - 1);
  return indexedValues
    .map(({ value, index }) => {
      const x = (index / maxIndex) * width;
      const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
