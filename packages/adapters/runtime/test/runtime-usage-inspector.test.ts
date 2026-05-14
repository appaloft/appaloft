import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  PortNumber,
  ProviderKey,
  TargetKindValue,
  domainError,
  err,
  ok,
  type DeploymentTargetState,
  type Result,
} from "@appaloft/core";
import {
  type ExecutionContext,
  type RuntimeTargetCapacityInspection,
  type RuntimeTargetCapacityInspector,
} from "@appaloft/application";
import {
  RuntimeUsageCapacityInspectorAdapter,
  translateCapacityInspectionToRuntimeUsage,
} from "../src/runtime-usage";

function server(overrides: { providerKey?: string } = {}): DeploymentTargetState {
  return {
    id: DeploymentTargetId.rehydrate("srv_capacity"),
    name: DeploymentTargetName.rehydrate("capacity"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate(overrides.providerKey ?? "generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  };
}

function context(): ExecutionContext {
  return {
    requestId: "req_runtime_usage_adapter_test",
    entrypoint: "system",
    locale: "en-US",
    t: (key) => key,
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  };
}

function capacityInspection(): RuntimeTargetCapacityInspection {
  return {
    schemaVersion: "servers.capacity.inspect/v1",
    server: {
      id: "srv_capacity",
      name: "capacity",
      host: "203.0.113.10",
      port: 22,
      providerKey: "generic-ssh",
      targetKind: "single-server",
    },
    inspectedAt: "2026-01-01T00:00:00.000Z",
    disk: [
      {
        path: "/",
        mount: "/",
        size: 100_000,
        used: 50_000,
        available: 50_000,
        usePercent: 50,
      },
      {
        path: "/var/lib/docker",
        mount: "/var/lib/docker",
        size: 200_000,
        used: 150_000,
        available: 50_000,
        usePercent: 75,
      },
    ],
    inodes: [
      {
        path: "/",
        mount: "/",
        used: 100,
        free: 900,
        usePercent: 10,
      },
    ],
    docker: {
      imagesSize: 60_000,
      reclaimableImagesSize: 20_000,
      buildCacheSize: 30_000,
      reclaimableBuildCacheSize: 10_000,
      containersSize: 8_000,
      volumesSize: 7_000,
    },
    memory: {
      total: 1_000_000,
      available: 250_000,
      used: 750_000,
      usePercent: 75,
    },
    cpu: {
      logicalCores: 4,
      loadAverage1m: 0.1,
      loadAverage5m: 0.2,
      loadAverage15m: 0.3,
    },
    appaloftRuntime: {
      runtimeRoot: {
        path: "/var/lib/appaloft/runtime",
        size: 40_000,
        detectable: true,
      },
      stateRoot: {
        path: "/var/lib/appaloft/runtime/state",
        size: 5_000,
        detectable: true,
      },
      sourceWorkspace: {
        path: "/var/lib/appaloft/runtime/ssh-deployments",
        size: 12_000,
        detectable: true,
      },
    },
    appaloftContainers: [],
    appaloftWorkspaces: [],
    safeReclaimableEstimate: {
      stoppedContainersSize: 1_000,
      danglingImagesSize: 20_000,
      oldBuildCacheSize: 10_000,
      oldPreviewWorkspaceCandidatesSize: 0,
      total: 31_000,
    },
    warnings: [],
    partial: false,
  };
}

class RecordingCapacityInspector implements RuntimeTargetCapacityInspector {
  readonly inputs: Array<{ server: DeploymentTargetState; profile?: "full" | "attribution" }> = [];

  constructor(private readonly result: Result<RuntimeTargetCapacityInspection>) {}

  async inspect(
    _context: ExecutionContext,
    input: { server: DeploymentTargetState; profile?: "full" | "attribution" },
  ): Promise<Result<RuntimeTargetCapacityInspection>> {
    this.inputs.push(input);
    return this.result;
  }
}

describe("runtime usage capacity inspector adapter", () => {
  test("[RT-USAGE-001] delegates to read-only capacity inspection and does not render prune commands", async () => {
    const capacityInspector = new RecordingCapacityInspector(ok(capacityInspection()));
    const adapter = new RuntimeUsageCapacityInspectorAdapter(
      async () => ok(server()),
      capacityInspector,
    );

    const result = await adapter.inspect(context(), {
      scope: { kind: "server", serverId: "srv_capacity" },
      mode: "current",
      includeArtifacts: true,
      includeWarnings: true,
    });

    expect(result.isOk()).toBe(true);
    expect(capacityInspector.inputs).toHaveLength(1);
    expect(capacityInspector.inputs[0]?.server.id.value).toBe("srv_capacity");
    expect(capacityInspector.inputs[0]?.profile).toBe("full");
    expect(result._unsafeUnwrap().schemaVersion).toBe("runtime-usage.inspect/v1");
  });

  test("[RT-USAGE-002][RT-USAGE-004] uses bounded capacity attribution for scope rollup reads", async () => {
    const capacityInspector = new RecordingCapacityInspector(ok(capacityInspection()));
    const adapter = new RuntimeUsageCapacityInspectorAdapter(
      async () => ok(server()),
      capacityInspector,
    );

    const result = await adapter.inspect(context(), {
      scope: { kind: "server", serverId: "srv_capacity" },
      mode: "current",
      includeArtifacts: true,
      includeWarnings: true,
      collectionProfile: "attribution",
    });

    expect(result.isOk()).toBe(true);
    expect(capacityInspector.inputs).toHaveLength(1);
    expect(capacityInspector.inputs[0]?.server.id.value).toBe("srv_capacity");
    expect(capacityInspector.inputs[0]?.profile).toBe("attribution");
  });

  test("[RT-USAGE-004] converts unsupported capacity inspection into partial usage output", async () => {
    const capacityInspector = new RecordingCapacityInspector(
      err(
        domainError.runtimeTargetUnsupported("capacity unsupported", {
          phase: "runtime-target-capacity",
          serverId: "srv_capacity",
          providerKey: "unsupported-provider",
          missingCapability: "runtime.capacity",
        }),
      ),
    );
    const adapter = new RuntimeUsageCapacityInspectorAdapter(
      async () => ok(server({ providerKey: "unsupported-provider" })),
      capacityInspector,
    );

    const result = await adapter.inspect(context(), {
      scope: { kind: "server", serverId: "srv_capacity" },
      mode: "current",
      includeArtifacts: true,
      includeWarnings: true,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      freshness: "unknown",
      partial: true,
      warnings: [
        {
          code: "unsupported-provider",
        },
      ],
      sourceErrors: [
        {
          source: "runtime-target",
          code: "runtime_target_unsupported",
          retriable: false,
        },
      ],
    });
  });

  test("[RT-USAGE-004] translates Docker unavailable and timeout capacity warnings", () => {
    const capacity = capacityInspection();
    capacity.partial = true;
    capacity.warnings = [
      {
        code: "docker-unavailable",
        message: "docker command is unavailable",
        resource: "docker",
      },
      {
        code: "timeout",
        message: "capacity diagnostic timed out",
        resource: "appaloft-runtime",
      },
    ];

    const result = translateCapacityInspectionToRuntimeUsage({
      capacity,
      query: {
        scope: { kind: "server", serverId: "srv_capacity" },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      },
    });

    expect(result.partial).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "docker-unavailable",
      "timeout",
    ]);
    expect(result.sourceErrors).toEqual([
      {
        source: "docker",
        code: "docker-unavailable",
        message: "docker command is unavailable",
        retriable: true,
      },
      {
        source: "runtime-target",
        code: "timeout",
        message: "capacity diagnostic timed out",
        retriable: true,
      },
    ]);
  });

  test("[RT-USAGE-005] translates capacity disk classes and keeps volumes non-reclaimable", () => {
    const result = translateCapacityInspectionToRuntimeUsage({
      capacity: capacityInspection(),
      query: {
        scope: { kind: "server", serverId: "srv_capacity" },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      },
    });

    expect(result.totals).toMatchObject({
      disk: {
        totalBytes: 300_000,
        usedBytes: 200_000,
        availableBytes: 100_000,
        attributedBytes: 57_000,
      },
      docker: {
        imageBytes: 60_000,
        buildCacheBytes: 30_000,
        containerWritableBytes: 8_000,
      },
    });
    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
      "active-runtime",
      "appaloft-state-root",
      "source-workspace",
      "docker-image",
      "docker-build-cache",
      "volume",
    ]);
    expect(result.artifacts.find((artifact) => artifact.kind === "volume")).toMatchObject({
      ownership: "unknown",
      reclaimable: "no",
      reclaimBlockedReason: "volume-excluded",
    });
  });

  test("[RT-USAGE-002][RT-USAGE-003][RT-USAGE-006] translates Appaloft container labels into ownership rollups", () => {
    const capacity = capacityInspection();
    capacity.appaloftContainers = [
      {
        id: "container123",
        name: "app-api",
        running: true,
        status: "running",
        writableBytes: 4096,
        deploymentId: "dep_current",
        projectId: "prj_usage",
        environmentId: "env_prod",
        resourceId: "res_api",
        serverId: "srv_capacity",
        destinationId: "dst_primary",
      },
    ];

    const result = translateCapacityInspectionToRuntimeUsage({
      capacity,
      query: {
        scope: { kind: "server", serverId: "srv_capacity" },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      },
    });

    expect(result.artifacts).toContainEqual(
      expect.objectContaining({
        kind: "active-runtime",
        ownership: "attributed",
        projectId: "prj_usage",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_current",
        destinationId: "dst_primary",
        runtimeId: "container123",
        bytes: 4096,
      }),
    );
    expect(result.byResource).toContainEqual(
      expect.objectContaining({
        scope: { kind: "resource", resourceId: "res_api" },
        ownership: "attributed",
        currentDeploymentId: "dep_current",
        currentRuntimeId: "container123",
        artifactCount: 1,
      }),
    );
    expect(result.byDeployment).toContainEqual(
      expect.objectContaining({
        scope: { kind: "deployment", deploymentId: "dep_current" },
        ownership: "attributed",
      }),
    );
  });

  test("[RT-USAGE-002][RT-USAGE-003] keeps ownership rollups when artifact details are hidden", () => {
    const capacity = capacityInspection();
    capacity.appaloftContainers = [
      {
        id: "container123",
        name: "app-api",
        running: true,
        status: "running",
        writableBytes: 4096,
        deploymentId: "dep_current",
        projectId: "prj_usage",
        environmentId: "env_prod",
        resourceId: "res_api",
        serverId: "srv_capacity",
        destinationId: "dst_primary",
      },
    ];

    const result = translateCapacityInspectionToRuntimeUsage({
      capacity,
      query: {
        scope: { kind: "server", serverId: "srv_capacity" },
        mode: "current",
        includeArtifacts: false,
        includeWarnings: true,
      },
    });

    expect(result.artifacts).toEqual([]);
    expect(result.byResource).toContainEqual(
      expect.objectContaining({
        scope: { kind: "resource", resourceId: "res_api" },
        ownership: "attributed",
        artifactCount: 1,
      }),
    );
  });

  test("[RT-USAGE-002][RT-USAGE-005] translates source workspace metadata into attributed disk artifacts", () => {
    const capacity = capacityInspection();
    capacity.appaloftWorkspaces = [
      {
        deploymentId: "dep_current",
        path: "/var/lib/appaloft/runtime/ssh-deployments/dep_current",
        bytes: 8192,
        activeMarker: false,
        rollbackCandidateMarker: true,
      },
    ];

    const result = translateCapacityInspectionToRuntimeUsage({
      capacity,
      query: {
        scope: { kind: "server", serverId: "srv_capacity" },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      },
    });

    expect(result.artifacts).toContainEqual(
      expect.objectContaining({
        kind: "source-workspace",
        ownership: "partially-attributed",
        serverId: "srv_capacity",
        deploymentId: "dep_current",
        bytes: 8192,
        reclaimable: "no",
        reclaimBlockedReason: "rollback-candidate",
      }),
    );
    expect(result.byDeployment).toContainEqual(
      expect.objectContaining({
        scope: { kind: "deployment", deploymentId: "dep_current" },
        ownership: "partially-attributed",
        artifactCount: 1,
      }),
    );
  });

  test("[RT-USAGE-008] rejects non-server scopes until read-model resolution is implemented", async () => {
    const adapter = new RuntimeUsageCapacityInspectorAdapter(
      async () => ok(server()),
      new RecordingCapacityInspector(ok(capacityInspection())),
    );

    const result = await adapter.inspect(context(), {
      scope: { kind: "resource", resourceId: "res_api" },
      mode: "current",
      includeArtifacts: true,
      includeWarnings: true,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      category: "user",
      code: "validation_error",
      details: {
        phase: "runtime-usage-inspection",
        scopeKind: "resource",
      },
    });
  });
});
