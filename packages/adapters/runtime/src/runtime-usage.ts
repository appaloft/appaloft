import {
  type ExecutionContext,
  type RuntimeArtifactUsage,
  type RuntimeTargetAppaloftContainerCapacity,
  type RuntimeTargetAppaloftWorkspaceCapacity,
  type RuntimeTargetCapacityInspection,
  type RuntimeTargetCapacityInspector,
  type RuntimeTargetCapacityWarning,
  type RuntimeUsageInspection,
  type RuntimeUsageInspector,
  type RuntimeUsageInspectorInput,
  type RuntimeUsageRollup,
  type RuntimeUsageScope,
  type RuntimeUsageSourceError,
  type RuntimeUsageTotals,
  type RuntimeUsageWarning,
} from "@appaloft/application";
import { domainError, err, ok, type DeploymentTargetState, type Result } from "@appaloft/core";

export type RuntimeUsageServerResolver = (
  context: ExecutionContext,
  serverId: string,
) => Promise<Result<DeploymentTargetState>>;

function sumCapacity(items: Array<{ size?: number; used?: number; available?: number }>): {
  size: number;
  used: number;
  available: number;
} {
  const totals = { size: 0, used: 0, available: 0 };
  for (const item of items) {
    totals.size += item.size ?? 0;
    totals.used += item.used ?? 0;
    totals.available += item.available ?? 0;
  }
  return totals;
}

function sumInodes(items: Array<{ used?: number; free?: number }>): {
  used: number;
  free: number;
} {
  const totals = { used: 0, free: 0 };
  for (const item of items) {
    totals.used += item.used ?? 0;
    totals.free += item.free ?? 0;
  }
  return totals;
}

function totalsFromCapacity(capacity: RuntimeTargetCapacityInspection): RuntimeUsageTotals {
  const disk = sumCapacity(capacity.disk);
  const inodes = sumInodes(capacity.inodes);

  return {
    cpu: {
      ...(capacity.cpu.logicalCores === null ? {} : { logicalCores: capacity.cpu.logicalCores }),
      ...(capacity.cpu.loadAverage1m === null ? {} : { loadAverage1m: capacity.cpu.loadAverage1m }),
      ...(capacity.cpu.loadAverage5m === null ? {} : { loadAverage5m: capacity.cpu.loadAverage5m }),
      ...(capacity.cpu.loadAverage15m === null
        ? {}
        : { loadAverage15m: capacity.cpu.loadAverage15m }),
    },
    memory: {
      ...(capacity.memory.total === null ? {} : { totalBytes: capacity.memory.total }),
      ...(capacity.memory.used === null ? {} : { usedBytes: capacity.memory.used }),
      ...(capacity.memory.available === null ? {} : { availableBytes: capacity.memory.available }),
    },
    disk: {
      totalBytes: disk.size,
      usedBytes: disk.used,
      availableBytes: disk.available,
      attributedBytes:
        (capacity.appaloftRuntime.runtimeRoot.size ?? 0) +
        (capacity.appaloftRuntime.stateRoot.size ?? 0) +
        (capacity.appaloftRuntime.sourceWorkspace.size ?? 0),
    },
    inode: {
      used: inodes.used,
      available: inodes.free,
      total: inodes.used + inodes.free,
    },
    docker: {
      imageBytes: capacity.docker.imagesSize,
      buildCacheBytes: capacity.docker.buildCacheSize,
      containerWritableBytes: capacity.docker.containersSize,
    },
  };
}

function warningFromCapacityWarning(input: RuntimeTargetCapacityWarning): RuntimeUsageWarning {
  const code =
    input.code === "docker-unavailable" || input.code === "timeout"
      ? input.code
      : input.code === "unsupported-provider"
        ? "unsupported-provider"
        : "partial-diagnostic";

  const resource =
    input.resource === "appaloft-runtime"
      ? "disk"
      : input.resource === "cpu" ||
          input.resource === "memory" ||
          input.resource === "disk" ||
          input.resource === "inode" ||
          input.resource === "docker"
        ? input.resource
        : undefined;

  return {
    code,
    message: input.message,
    ...(resource ? { resource } : {}),
  };
}

function sourceErrorsFromWarnings(
  warnings: RuntimeTargetCapacityWarning[],
): RuntimeUsageSourceError[] {
  return warnings
    .filter((warning) =>
      ["docker-unavailable", "timeout", "unsupported-provider"].includes(warning.code),
    )
    .map((warning) => ({
      source: warning.code === "docker-unavailable" ? "docker" : "runtime-target",
      code: warning.code,
      message: warning.message,
      retriable: warning.code !== "unsupported-provider",
    }));
}

function labelEvidence(
  key: string,
  value: string | undefined,
): RuntimeArtifactUsage["evidence"][number][] {
  return value ? [{ source: "label", key }] : [];
}

function containerOwnership(
  container: RuntimeTargetAppaloftContainerCapacity,
): RuntimeArtifactUsage["ownership"] {
  return container.deploymentId &&
    container.projectId &&
    container.environmentId &&
    container.resourceId &&
    container.destinationId
    ? "attributed"
    : container.deploymentId || container.resourceId
      ? "partially-attributed"
      : "unknown";
}

function artifactFromContainer(
  serverId: string,
  inspectedAt: string,
  container: RuntimeTargetAppaloftContainerCapacity,
): RuntimeArtifactUsage {
  const ownership = containerOwnership(container);
  return {
    kind: container.running ? "active-runtime" : "rollback-candidate",
    ownership,
    serverId: container.serverId ?? serverId,
    ...(container.projectId ? { projectId: container.projectId } : {}),
    ...(container.environmentId ? { environmentId: container.environmentId } : {}),
    ...(container.resourceId ? { resourceId: container.resourceId } : {}),
    ...(container.deploymentId ? { deploymentId: container.deploymentId } : {}),
    ...(container.destinationId ? { destinationId: container.destinationId } : {}),
    runtimeId: container.id,
    ...(container.writableBytes === null ? {} : { bytes: container.writableBytes }),
    observedAt: inspectedAt,
    evidence: [
      ...labelEvidence("appaloft.deployment-id", container.deploymentId),
      ...labelEvidence("appaloft.project-id", container.projectId),
      ...labelEvidence("appaloft.environment-id", container.environmentId),
      ...labelEvidence("appaloft.resource-id", container.resourceId),
      ...labelEvidence("appaloft.destination-id", container.destinationId),
    ],
    reclaimable: container.running ? "no" : "unknown",
    ...(container.running ? { reclaimBlockedReason: "active-runtime" } : {}),
    warnings:
      ownership === "attributed"
        ? []
        : [
            {
              code: "ownership-unproven",
              message: "Appaloft container ownership labels are incomplete.",
              resource: "ownership",
            },
          ],
  };
}

function artifactFromWorkspace(
  serverId: string,
  inspectedAt: string,
  workspace: RuntimeTargetAppaloftWorkspaceCapacity,
): RuntimeArtifactUsage {
  return {
    kind: "source-workspace",
    ownership: "partially-attributed",
    serverId,
    deploymentId: workspace.deploymentId,
    ...(workspace.bytes === null ? {} : { bytes: workspace.bytes }),
    observedAt: inspectedAt,
    evidence: [
      {
        source: "workspace-metadata",
        key: "servers.capacity.inspect:sourceWorkspace",
      },
    ],
    reclaimable: workspace.activeMarker || workspace.rollbackCandidateMarker ? "no" : "unknown",
    ...(workspace.activeMarker
      ? { reclaimBlockedReason: "active-runtime" as const }
      : workspace.rollbackCandidateMarker
        ? { reclaimBlockedReason: "rollback-candidate" as const }
        : {}),
    warnings: [],
  };
}

function totalsFromArtifacts(artifacts: RuntimeArtifactUsage[]): RuntimeUsageTotals {
  const attributedBytes = artifacts.reduce((sum, artifact) => sum + (artifact.bytes ?? 0), 0);
  const containerWritableBytes = artifacts
    .filter((artifact) => artifact.kind === "active-runtime" || artifact.kind === "rollback-candidate")
    .reduce((sum, artifact) => sum + (artifact.bytes ?? 0), 0);

  return {
    ...(attributedBytes > 0 ? { disk: { attributedBytes } } : {}),
    ...(containerWritableBytes > 0 ? { docker: { containerWritableBytes } } : {}),
  };
}

function rollupOwnership(artifacts: RuntimeArtifactUsage[]): RuntimeUsageRollup["ownership"] {
  if (artifacts.length === 0) {
    return "unknown";
  }

  return artifacts.every((artifact) => artifact.ownership === "attributed")
    ? "attributed"
    : "partially-attributed";
}

function rollupForArtifacts(
  scope: RuntimeUsageScope,
  artifacts: RuntimeArtifactUsage[],
): RuntimeUsageRollup {
  const activeArtifact = artifacts.find((artifact) => artifact.kind === "active-runtime");
  return {
    scope,
    ownership: rollupOwnership(artifacts),
    totals: totalsFromArtifacts(artifacts),
    ...(activeArtifact?.deploymentId ? { currentDeploymentId: activeArtifact.deploymentId } : {}),
    ...(activeArtifact?.runtimeId ? { currentRuntimeId: activeArtifact.runtimeId } : {}),
    artifactCount: artifacts.length,
    warnings: artifacts.flatMap((artifact) => artifact.warnings),
  };
}

function groupedRollups(
  artifacts: RuntimeArtifactUsage[],
  scopeForArtifact: (artifact: RuntimeArtifactUsage) => RuntimeUsageScope | null,
): RuntimeUsageRollup[] {
  const groups = new Map<string, { scope: RuntimeUsageScope; artifacts: RuntimeArtifactUsage[] }>();
  for (const artifact of artifacts) {
    const scope = scopeForArtifact(artifact);
    if (!scope) {
      continue;
    }
    const key = `${scope.kind}:${scopeId(scope)}`;
    const group = groups.get(key) ?? { scope, artifacts: [] };
    group.artifacts.push(artifact);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => rollupForArtifacts(group.scope, group.artifacts));
}

function scopeId(scope: RuntimeUsageScope): string {
  switch (scope.kind) {
    case "server":
      return scope.serverId;
    case "project":
      return scope.projectId;
    case "environment":
      return scope.environmentId;
    case "resource":
      return scope.resourceId;
    case "deployment":
      return scope.deploymentId;
  }
}

function usageArtifactsFromCapacity(
  capacity: RuntimeTargetCapacityInspection,
): RuntimeArtifactUsage[] {
  const artifacts: RuntimeArtifactUsage[] = [];
  const runtimeRootSize = capacity.appaloftRuntime.runtimeRoot.size;
  const stateRootSize = capacity.appaloftRuntime.stateRoot.size;
  const sourceWorkspaceSize = capacity.appaloftRuntime.sourceWorkspace.size;

  artifacts.push({
    kind: "active-runtime",
    ownership: capacity.appaloftRuntime.runtimeRoot.detectable ? "partially-attributed" : "unknown",
    serverId: capacity.server.id,
    ...(runtimeRootSize === null ? {} : { bytes: runtimeRootSize }),
    evidence: capacity.appaloftRuntime.runtimeRoot.detectable
      ? [{ source: "read-model", key: "servers.capacity.inspect:runtimeRoot" }]
      : [],
    reclaimable: "no",
    reclaimBlockedReason: "active-runtime",
    warnings: [],
  });

  artifacts.push({
    kind: "appaloft-state-root",
    ownership: capacity.appaloftRuntime.stateRoot.detectable ? "partially-attributed" : "unknown",
    serverId: capacity.server.id,
    ...(stateRootSize === null ? {} : { bytes: stateRootSize }),
    evidence: capacity.appaloftRuntime.stateRoot.detectable
      ? [{ source: "read-model", key: "servers.capacity.inspect:stateRoot" }]
      : [],
    reclaimable: "no",
    reclaimBlockedReason: "state-root-excluded",
    warnings: [],
  });

  artifacts.push({
    kind: "source-workspace",
    ownership: capacity.appaloftRuntime.sourceWorkspace.detectable
      ? "partially-attributed"
      : "unknown",
    serverId: capacity.server.id,
    ...(sourceWorkspaceSize === null ? {} : { bytes: sourceWorkspaceSize }),
    evidence: capacity.appaloftRuntime.sourceWorkspace.detectable
      ? [{ source: "read-model", key: "servers.capacity.inspect:sourceWorkspace" }]
      : [],
    reclaimable: "unknown",
    warnings: [],
  });

  for (const container of capacity.appaloftContainers) {
    artifacts.push(artifactFromContainer(capacity.server.id, capacity.inspectedAt, container));
  }

  for (const workspace of capacity.appaloftWorkspaces) {
    artifacts.push(artifactFromWorkspace(capacity.server.id, capacity.inspectedAt, workspace));
  }

  artifacts.push({
    kind: "docker-image",
    ownership: "unknown",
    serverId: capacity.server.id,
    bytes: capacity.docker.imagesSize,
    evidence: [],
    reclaimable: capacity.docker.reclaimableImagesSize > 0 ? "unknown" : "no",
    warnings: [],
  });

  artifacts.push({
    kind: "docker-build-cache",
    ownership: "unknown",
    serverId: capacity.server.id,
    bytes: capacity.docker.buildCacheSize,
    evidence: [],
    reclaimable: capacity.docker.reclaimableBuildCacheSize > 0 ? "unknown" : "no",
    warnings: [],
  });

  artifacts.push({
    kind: "volume",
    ownership: "unknown",
    serverId: capacity.server.id,
    bytes: capacity.docker.volumesSize,
    evidence: [],
    reclaimable: "no",
    reclaimBlockedReason: "volume-excluded",
    warnings: [
      {
        code: "ownership-unproven",
        message: "Docker volume ownership is not safely proven.",
        resource: "disk",
      },
    ],
  });

  return artifacts;
}

export function translateCapacityInspectionToRuntimeUsage(input: {
  capacity: RuntimeTargetCapacityInspection;
  query: RuntimeUsageInspectorInput;
  generatedAt?: string;
}): RuntimeUsageInspection {
  const warnings = input.query.includeWarnings
    ? input.capacity.warnings.map(warningFromCapacityWarning)
    : [];
  const artifacts = usageArtifactsFromCapacity(input.capacity);
  const attributedArtifacts = artifacts.filter(
    (artifact) =>
      artifact.ownership === "attributed" || artifact.ownership === "partially-attributed",
  );

  return {
    schemaVersion: "runtime-usage.inspect/v1",
    scope: input.query.scope,
    generatedAt: input.generatedAt ?? input.capacity.inspectedAt,
    observedAt: input.capacity.inspectedAt,
    freshness: "live",
    partial: input.capacity.partial,
    totals: totalsFromCapacity(input.capacity),
    byProject: groupedRollups(attributedArtifacts, (artifact) =>
      artifact.projectId ? { kind: "project", projectId: artifact.projectId } : null,
    ),
    byEnvironment: groupedRollups(attributedArtifacts, (artifact) =>
      artifact.environmentId ? { kind: "environment", environmentId: artifact.environmentId } : null,
    ),
    byResource: groupedRollups(attributedArtifacts, (artifact) =>
      artifact.resourceId ? { kind: "resource", resourceId: artifact.resourceId } : null,
    ),
    byDeployment: groupedRollups(attributedArtifacts, (artifact) =>
      artifact.deploymentId ? { kind: "deployment", deploymentId: artifact.deploymentId } : null,
    ),
    artifacts: input.query.includeArtifacts ? artifacts : [],
    warnings,
    sourceErrors: input.query.includeWarnings
      ? sourceErrorsFromWarnings(input.capacity.warnings)
      : [],
  };
}

function unsupportedScopeResult(input: RuntimeUsageInspectorInput): Result<RuntimeUsageInspection> {
  return err(
    domainError.validation("Runtime usage scope is not implemented by this adapter", {
      phase: "runtime-usage-inspection",
      scopeKind: input.scope.kind,
    }),
  );
}

function partialInspectionFromCapacityError(input: {
  query: RuntimeUsageInspectorInput;
  message: string;
  code: string;
}): RuntimeUsageInspection {
  const warning: RuntimeUsageWarning = {
    code: input.code === "runtime_target_unsupported" ? "unsupported-provider" : "partial-diagnostic",
    message: input.message,
    resource: "docker",
  };

  return {
    schemaVersion: "runtime-usage.inspect/v1",
    scope: input.query.scope,
    generatedAt: new Date().toISOString(),
    freshness: "unknown",
    partial: true,
    totals: {},
    byProject: [],
    byEnvironment: [],
    byResource: [],
    byDeployment: [],
    artifacts: [],
    warnings: input.query.includeWarnings ? [warning] : [],
    sourceErrors: input.query.includeWarnings
      ? [
          {
            source: "runtime-target",
            code: input.code,
            message: input.message,
            retriable: input.code !== "runtime_target_unsupported",
          },
        ]
      : [],
  };
}

export class RuntimeUsageCapacityInspectorAdapter implements RuntimeUsageInspector {
  constructor(
    private readonly serverResolver: RuntimeUsageServerResolver,
    private readonly capacityInspector: RuntimeTargetCapacityInspector,
  ) {}

  async inspect(
    context: ExecutionContext,
    input: RuntimeUsageInspectorInput,
  ): Promise<Result<RuntimeUsageInspection>> {
    if (input.scope.kind !== "server") {
      return unsupportedScopeResult(input);
    }

    const serverResult = await this.serverResolver(context, input.scope.serverId);
    if (serverResult.isErr()) {
      return err(serverResult.error);
    }

    const server = serverResult.value;
    const capacityResult = await this.capacityInspector.inspect(context, { server });
    if (capacityResult.isErr()) {
      const error = capacityResult.error;
      return ok(
        partialInspectionFromCapacityError({
          query: input,
          message: error.message,
          code: error.code,
        }),
      );
    }

    return ok(
      translateCapacityInspectionToRuntimeUsage({
        capacity: capacityResult.value,
        query: input,
      }),
    );
  }
}
