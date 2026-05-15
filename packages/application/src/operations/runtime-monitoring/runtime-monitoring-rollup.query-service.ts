import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type Clock,
  type RuntimeMonitoringBucket,
  type RuntimeMonitoringMarkerReadModel,
  type RuntimeMonitoringRollup,
  type RuntimeMonitoringSample,
  type RuntimeMonitoringSampleReadModel,
  type RuntimeMonitoringSeries,
  type RuntimeMonitoringSignal,
  type RuntimeUsageFreshness,
  type RuntimeUsageScope,
  type RuntimeUsageTotals,
} from "../../ports";
import { tokens } from "../../tokens";
import { bucketDurationMs } from "./runtime-monitoring.schema";
import { type RuntimeMonitoringRollupQuery } from "./runtime-monitoring-rollup.query";

const allSignals: RuntimeMonitoringSignal[] = [
  "cpu",
  "memory",
  "disk",
  "inode",
  "docker",
  "network",
];

function withRuntimeMonitoringRollupDetails(error: DomainError): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "runtime-monitoring.rollup",
    },
  };
}

function scopeKey(scope: RuntimeUsageScope): string {
  switch (scope.kind) {
    case "server":
      return `${scope.kind}:${scope.serverId}`;
    case "project":
      return `${scope.kind}:${scope.projectId}`;
    case "environment":
      return `${scope.kind}:${scope.environmentId}`;
    case "resource":
      return `${scope.kind}:${scope.resourceId}`;
    case "deployment":
      return `${scope.kind}:${scope.deploymentId}`;
  }
}

function sumOptional(left: number | undefined, right: number | undefined): number | undefined {
  return left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0);
}

function mergeTotals(left: RuntimeUsageTotals, right: RuntimeUsageTotals): RuntimeUsageTotals {
  const merged: RuntimeUsageTotals = {};

  if (left.cpu || right.cpu) {
    const cpu: NonNullable<RuntimeUsageTotals["cpu"]> = {};
    const logicalCores = left.cpu?.logicalCores ?? right.cpu?.logicalCores;
    const loadAverage1m = sumOptional(left.cpu?.loadAverage1m, right.cpu?.loadAverage1m);
    const loadAverage5m = sumOptional(left.cpu?.loadAverage5m, right.cpu?.loadAverage5m);
    const loadAverage15m = sumOptional(left.cpu?.loadAverage15m, right.cpu?.loadAverage15m);
    const containerCpuPercent = sumOptional(
      left.cpu?.containerCpuPercent,
      right.cpu?.containerCpuPercent,
    );
    if (logicalCores !== undefined) {
      cpu.logicalCores = logicalCores;
    }
    if (loadAverage1m !== undefined) {
      cpu.loadAverage1m = loadAverage1m;
    }
    if (loadAverage5m !== undefined) {
      cpu.loadAverage5m = loadAverage5m;
    }
    if (loadAverage15m !== undefined) {
      cpu.loadAverage15m = loadAverage15m;
    }
    if (containerCpuPercent !== undefined) {
      cpu.containerCpuPercent = containerCpuPercent;
    }
    merged.cpu = cpu;
  }

  if (left.memory || right.memory) {
    const memory: NonNullable<RuntimeUsageTotals["memory"]> = {};
    const totalBytes = left.memory?.totalBytes ?? right.memory?.totalBytes;
    const usedBytes = sumOptional(left.memory?.usedBytes, right.memory?.usedBytes);
    const availableBytes = sumOptional(left.memory?.availableBytes, right.memory?.availableBytes);
    const containerUsedBytes = sumOptional(
      left.memory?.containerUsedBytes,
      right.memory?.containerUsedBytes,
    );
    if (totalBytes !== undefined) {
      memory.totalBytes = totalBytes;
    }
    if (usedBytes !== undefined) {
      memory.usedBytes = usedBytes;
    }
    if (availableBytes !== undefined) {
      memory.availableBytes = availableBytes;
    }
    if (containerUsedBytes !== undefined) {
      memory.containerUsedBytes = containerUsedBytes;
    }
    merged.memory = memory;
  }

  if (left.disk || right.disk) {
    const disk: NonNullable<RuntimeUsageTotals["disk"]> = {};
    const totalBytes = left.disk?.totalBytes ?? right.disk?.totalBytes;
    const usedBytes = sumOptional(left.disk?.usedBytes, right.disk?.usedBytes);
    const availableBytes = sumOptional(left.disk?.availableBytes, right.disk?.availableBytes);
    const attributedBytes = sumOptional(left.disk?.attributedBytes, right.disk?.attributedBytes);
    if (totalBytes !== undefined) {
      disk.totalBytes = totalBytes;
    }
    if (usedBytes !== undefined) {
      disk.usedBytes = usedBytes;
    }
    if (availableBytes !== undefined) {
      disk.availableBytes = availableBytes;
    }
    if (attributedBytes !== undefined) {
      disk.attributedBytes = attributedBytes;
    }
    merged.disk = disk;
  }

  if (left.inode || right.inode) {
    const inode: NonNullable<RuntimeUsageTotals["inode"]> = {};
    const total = left.inode?.total ?? right.inode?.total;
    const used = sumOptional(left.inode?.used, right.inode?.used);
    const available = sumOptional(left.inode?.available, right.inode?.available);
    if (total !== undefined) {
      inode.total = total;
    }
    if (used !== undefined) {
      inode.used = used;
    }
    if (available !== undefined) {
      inode.available = available;
    }
    merged.inode = inode;
  }

  if (left.docker || right.docker) {
    const docker: NonNullable<RuntimeUsageTotals["docker"]> = {};
    const imageBytes = sumOptional(left.docker?.imageBytes, right.docker?.imageBytes);
    const buildCacheBytes = sumOptional(
      left.docker?.buildCacheBytes,
      right.docker?.buildCacheBytes,
    );
    const containerWritableBytes = sumOptional(
      left.docker?.containerWritableBytes,
      right.docker?.containerWritableBytes,
    );
    if (imageBytes !== undefined) {
      docker.imageBytes = imageBytes;
    }
    if (buildCacheBytes !== undefined) {
      docker.buildCacheBytes = buildCacheBytes;
    }
    if (containerWritableBytes !== undefined) {
      docker.containerWritableBytes = containerWritableBytes;
    }
    merged.docker = docker;
  }

  if (left.network || right.network) {
    const network: NonNullable<RuntimeUsageTotals["network"]> = {};
    const rxBytes = sumOptional(left.network?.rxBytes, right.network?.rxBytes);
    const txBytes = sumOptional(left.network?.txBytes, right.network?.txBytes);
    if (rxBytes !== undefined) {
      network.rxBytes = rxBytes;
    }
    if (txBytes !== undefined) {
      network.txBytes = txBytes;
    }
    merged.network = network;
  }

  return merged;
}

function totalsForSignal(
  totals: RuntimeUsageTotals,
  signal: RuntimeMonitoringSignal,
): RuntimeUsageTotals {
  switch (signal) {
    case "cpu":
      return totals.cpu ? { cpu: totals.cpu } : {};
    case "memory":
      return totals.memory ? { memory: totals.memory } : {};
    case "disk":
      return totals.disk ? { disk: totals.disk } : {};
    case "inode":
      return totals.inode ? { inode: totals.inode } : {};
    case "docker":
      return totals.docker ? { docker: totals.docker } : {};
    case "network":
      return totals.network ? { network: totals.network } : {};
  }
}

function windowFreshness(samples: RuntimeMonitoringSample[]): RuntimeUsageFreshness {
  if (samples.length === 0) {
    return "unknown";
  }
  if (samples.some((sample) => sample.freshness === "recent-sample")) {
    return "recent-sample";
  }
  if (samples.some((sample) => sample.freshness === "live")) {
    return "live";
  }
  if (samples.some((sample) => sample.freshness === "stale")) {
    return "stale";
  }
  return "unknown";
}

function seriesForSamples(input: {
  bucket: RuntimeMonitoringBucket;
  from: string;
  samples: RuntimeMonitoringSample[];
  signals: RuntimeMonitoringSignal[];
}): RuntimeMonitoringSeries[] {
  const bucketMs = bucketDurationMs(input.bucket);
  const fromMs = Date.parse(input.from);
  return input.signals.map((signal) => {
    const buckets = new Map<
      string,
      { from: string; to: string; sampleCount: number; totals: RuntimeUsageTotals }
    >();
    for (const sample of input.samples) {
      const sampleMs = Date.parse(sample.observedAt);
      const offset = Math.max(0, Math.floor((sampleMs - fromMs) / bucketMs));
      const bucketStartMs = fromMs + offset * bucketMs;
      const bucketEndMs = bucketStartMs + bucketMs;
      const key = new Date(bucketStartMs).toISOString();
      const current = buckets.get(key) ?? {
        from: key,
        to: new Date(bucketEndMs).toISOString(),
        sampleCount: 0,
        totals: {},
      };
      buckets.set(key, {
        ...current,
        sampleCount: current.sampleCount + 1,
        totals: mergeTotals(current.totals, totalsForSignal(sample.totals, signal)),
      });
    }

    return {
      signal,
      points: [...buckets.values()].sort((left, right) => left.from.localeCompare(right.from)),
    };
  });
}

function contributorsForSamples(samples: RuntimeMonitoringSample[]) {
  const groups = new Map<
    string,
    { scope: RuntimeUsageScope; totals: RuntimeUsageTotals; sampleCount: number }
  >();

  for (const sample of samples) {
    const scope = sample.scopeEvidence.scope;
    const key = scopeKey(scope);
    const current = groups.get(key) ?? { scope, totals: {}, sampleCount: 0 };
    groups.set(key, {
      scope,
      totals: mergeTotals(current.totals, sample.totals),
      sampleCount: current.sampleCount + 1,
    });
  }

  return [...groups.values()].sort((left, right) => {
    const scoreDelta = contributionScore(right.totals) - contributionScore(left.totals);
    return scoreDelta === 0
      ? scopeKey(left.scope).localeCompare(scopeKey(right.scope))
      : scoreDelta;
  });
}

function contributionScore(totals: RuntimeUsageTotals): number {
  return (
    (totals.disk?.attributedBytes ?? totals.disk?.usedBytes ?? 0) +
    (totals.memory?.containerUsedBytes ?? totals.memory?.usedBytes ?? 0) +
    (totals.docker?.containerWritableBytes ?? 0) +
    (totals.docker?.imageBytes ?? 0) +
    (totals.docker?.buildCacheBytes ?? 0) +
    (totals.inode?.used ?? 0) +
    (totals.network?.rxBytes ?? 0) +
    (totals.network?.txBytes ?? 0) +
    (totals.cpu?.containerCpuPercent ?? totals.cpu?.loadAverage1m ?? 0)
  );
}

@injectable()
export class RuntimeMonitoringRollupQueryService {
  constructor(
    @inject(tokens.runtimeMonitoringSampleReadModel)
    private readonly sampleReadModel: RuntimeMonitoringSampleReadModel,
    @inject(tokens.runtimeMonitoringMarkerReadModel)
    private readonly markerReadModel: RuntimeMonitoringMarkerReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: RuntimeMonitoringRollupQuery,
  ): Promise<Result<RuntimeMonitoringRollup>> {
    const inputSignals = "signals" in query.input ? query.input.signals : undefined;
    const readResult = await this.sampleReadModel.listSamples(context, {
      scope: query.input.scope,
      window: query.input.window,
      limit: 720,
      ...(inputSignals ? { signals: inputSignals } : {}),
    });
    if (readResult.isErr()) {
      return err(withRuntimeMonitoringRollupDetails(readResult.error));
    }

    const markerResult = query.input.includeDeploymentMarkers
      ? await this.markerReadModel.listDeploymentMarkers(context, {
          scope: query.input.scope,
          window: query.input.window,
        })
      : ok([]);
    if (markerResult.isErr()) {
      return err(withRuntimeMonitoringRollupDetails(markerResult.error));
    }

    const read = readResult.value;
    const signals = inputSignals ?? allSignals;
    const partial =
      read.samples.length === 0 ||
      read.warnings.length > 0 ||
      read.sourceErrors.length > 0 ||
      read.samples.some((sample) => sample.partial);

    return ok({
      schemaVersion: "runtime-monitoring.rollup/v1",
      scope: query.input.scope,
      from: query.input.window.from,
      to: query.input.window.to,
      bucket: query.input.bucket,
      generatedAt: this.clock.now(),
      freshness: windowFreshness(read.samples),
      partial,
      retention: read.retention,
      series: seriesForSamples({
        bucket: query.input.bucket,
        from: query.input.window.from,
        samples: read.samples,
        signals,
      }),
      totals: read.samples.reduce((totals, sample) => mergeTotals(totals, sample.totals), {}),
      topContributors: query.input.includeTopContributors
        ? contributorsForSamples(read.samples)
        : [],
      deploymentMarkers: markerResult.value,
      warnings: read.warnings,
      sourceErrors: read.sourceErrors,
    });
  }
}
