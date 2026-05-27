import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";

import {
  createExecutionContext,
  type DeploymentReadModel,
  type DeploymentSummary,
  type EnvironmentReadModel,
  type ExecutionContext,
  InspectRuntimeUsageQuery,
  InspectRuntimeUsageQueryHandler,
  type ProjectReadModel,
  type ResourceReadModel,
  type RuntimeUsageInspection,
  RuntimeUsageInspectionQueryService,
  type RuntimeUsageInspector,
  type RuntimeUsageInspectorInput,
} from "../src";

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_runtime_usage",
    entrypoint: "system",
  });
}

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

function inspection(input: RuntimeUsageInspectorInput): RuntimeUsageInspection {
  return {
    schemaVersion: "runtime-usage.inspect/v1",
    scope: input.scope,
    generatedAt: "2026-01-01T00:00:00.000Z",
    observedAt: "2026-01-01T00:00:00.000Z",
    freshness: "live",
    partial: false,
    totals: {
      cpu: {
        logicalCores: 4,
        loadAverage1m: 0.42,
      },
      memory: {
        totalBytes: 8_589_934_592,
        usedBytes: 2_147_483_648,
      },
      disk: {
        totalBytes: 107_374_182_400,
        usedBytes: 21_474_836_480,
        attributedBytes: 1_048_576,
      },
      docker: {
        imageBytes: 524_288,
        buildCacheBytes: 262_144,
      },
    },
    byProject: [
      {
        scope: { kind: "project", projectId: "prj_usage" },
        ownership: "attributed",
        totals: {
          disk: { attributedBytes: 1_048_576 },
        },
        artifactCount: 2,
        warnings: [],
      },
    ],
    byEnvironment: [
      {
        scope: { kind: "environment", environmentId: "env_prod" },
        ownership: "attributed",
        totals: {
          disk: { attributedBytes: 1_048_576 },
        },
        artifactCount: 2,
        warnings: [],
      },
    ],
    byResource: [
      {
        scope: { kind: "resource", resourceId: "res_api" },
        ownership: "attributed",
        totals: {
          memory: { containerUsedBytes: 67_108_864 },
          disk: { attributedBytes: 786_432 },
        },
        currentDeploymentId: "dep_current",
        currentRuntimeId: "runtime_current",
        artifactCount: 1,
        warnings: [],
      },
    ],
    byDeployment: [
      {
        scope: { kind: "deployment", deploymentId: "dep_current" },
        ownership: "attributed",
        totals: {
          memory: { containerUsedBytes: 67_108_864 },
          disk: { attributedBytes: 786_432 },
        },
        currentDeploymentId: "dep_current",
        currentRuntimeId: "runtime_current",
        artifactCount: 1,
        warnings: [],
      },
    ],
    artifacts: input.includeArtifacts
      ? [
          {
            kind: "active-runtime",
            ownership: "attributed",
            serverId: "srv_primary",
            projectId: "prj_usage",
            environmentId: "env_prod",
            resourceId: "res_api",
            deploymentId: "dep_current",
            runtimeId: "runtime_current",
            bytes: 786_432,
            evidence: [
              {
                source: "label",
                key: "appaloft.resource_id",
              },
              {
                source: "deployment-snapshot",
                key: "dep_current",
              },
            ],
            reclaimable: "no",
            reclaimBlockedReason: "active-runtime",
            warnings: [],
          },
          {
            kind: "volume",
            ownership: "unknown",
            bytes: 262_144,
            evidence: [],
            reclaimable: "no",
            reclaimBlockedReason: "volume-excluded",
            warnings: [
              {
                code: "ownership-unproven",
                message: "Volume ownership is not safely proven.",
                resource: "disk",
              },
            ],
          },
        ]
      : [],
    warnings: input.includeWarnings
      ? [
          {
            code: "missing-metric-source",
            message: "Network counters are unavailable.",
            resource: "network",
          },
        ]
      : [],
    sourceErrors: [],
  };
}

class RecordingRuntimeUsageInspector implements RuntimeUsageInspector {
  readonly inputs: RuntimeUsageInspectorInput[] = [];

  constructor(
    private readonly behavior:
      | "ok"
      | "partial"
      | "unattributed"
      | "workspace"
      | "err"
      | "throw" = "ok",
  ) {}

  async inspect(
    _context: ExecutionContext,
    input: RuntimeUsageInspectorInput,
  ): Promise<Result<RuntimeUsageInspection>> {
    this.inputs.push(input);

    if (this.behavior === "throw") {
      throw new Error("adapter exploded");
    }

    if (this.behavior === "err") {
      return err(domainError.infra("runtime usage unavailable"));
    }

    const output = inspection(input);
    if (this.behavior === "unattributed") {
      return ok({
        ...output,
        byProject: [],
        byEnvironment: [],
        byResource: [],
        byDeployment: [],
        artifacts: [],
      });
    }

    if (this.behavior === "workspace") {
      return ok({
        ...output,
        byProject: [],
        byEnvironment: [],
        byResource: [],
        byDeployment: [
          {
            scope: { kind: "deployment", deploymentId: "dep_current" },
            ownership: "partially-attributed",
            totals: {
              disk: { attributedBytes: 8192 },
            },
            artifactCount: 1,
            warnings: [],
          },
        ],
        artifacts: input.includeArtifacts
          ? [
              {
                kind: "source-workspace",
                ownership: "partially-attributed",
                serverId: "srv_primary",
                deploymentId: "dep_current",
                bytes: 8192,
                evidence: [
                  {
                    source: "workspace-metadata",
                    key: "servers.capacity.inspect:sourceWorkspace",
                  },
                ],
                reclaimable: "unknown",
                warnings: [],
              },
            ]
          : [],
      });
    }

    if (this.behavior === "partial") {
      return ok({
        ...output,
        freshness: "unknown",
        partial: true,
        warnings: [
          ...output.warnings,
          {
            code: "docker-unavailable",
            message: "Docker is unavailable.",
            resource: "docker",
          },
        ],
        sourceErrors: [
          {
            source: "docker",
            code: "docker-unavailable",
            message: "Docker is unavailable.",
            retriable: true,
          },
        ],
      });
    }

    return ok(output);
  }
}

function deploymentSummary(): DeploymentSummary {
  return {
    id: "dep_current",
    projectId: "prj_usage",
    environmentId: "env_prod",
    resourceId: "res_api",
    serverId: "srv_primary",
    destinationId: "dst_primary",
    status: "succeeded",
    runtimePlan: {
      id: "plan_current",
      source: {
        kind: "remote-git",
        locator: "https://example.com/repo.git",
        displayName: "repo",
      },
      buildStrategy: "dockerfile",
      packagingMode: "all-in-one-docker",
      execution: {
        kind: "docker-container",
        metadata: {
          containerName: "appaloft-dep_current",
        },
      },
      target: {
        kind: "single-server",
        providerKey: "generic-ssh",
        serverIds: ["srv_primary"],
      },
      detectSummary: "detected",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: [],
    },
    environmentSnapshot: {
      id: "snap_env",
      environmentId: "env_prod",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: [],
      variables: [],
    },
    logs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    logCount: 0,
  };
}

function queryService(
  inspector: RuntimeUsageInspector,
  overrides: {
    projectReadModel?: ProjectReadModel;
    environmentReadModel?: EnvironmentReadModel;
    resourceReadModel?: ResourceReadModel;
    deploymentReadModel?: DeploymentReadModel;
  } = {},
): RuntimeUsageInspectionQueryService {
  const deployment = deploymentSummary();
  const projectReadModel =
    overrides.projectReadModel ??
    ({
      count: async () => 1,
      list: async () => [],
      findOne: async () => ({
        id: "prj_usage",
        name: "Usage",
        slug: "usage",
        lifecycleStatus: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    } satisfies ProjectReadModel);
  const environmentReadModel =
    overrides.environmentReadModel ??
    ({
      count: async () => 1,
      list: async () => [],
      findOne: async () => ({
        id: "env_prod",
        projectId: "prj_usage",
        name: "Production",
        kind: "production",
        lifecycleStatus: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        maskedVariables: [],
      }),
    } satisfies EnvironmentReadModel);
  const resourceReadModel =
    overrides.resourceReadModel ??
    ({
      count: async () => 1,
      list: async () => [
        {
          id: "res_api",
          projectId: "prj_usage",
          environmentId: "env_prod",
          name: "API",
          slug: "api",
          kind: "application",
          createdAt: "2026-01-01T00:00:00.000Z",
          services: [],
          deploymentCount: 1,
        },
      ],
      findOne: async () => ({
        id: "res_api",
        projectId: "prj_usage",
        environmentId: "env_prod",
        name: "API",
        slug: "api",
        kind: "application",
        createdAt: "2026-01-01T00:00:00.000Z",
        services: [],
        deploymentCount: 1,
      }),
    } satisfies ResourceReadModel);
  const deploymentReadModel =
    overrides.deploymentReadModel ??
    ({
      count: async () => 1,
      list: async () => [deployment],
      findOne: async () => deployment,
      findLogs: async () => [],
    } satisfies DeploymentReadModel);

  return new RuntimeUsageInspectionQueryService(
    inspector,
    projectReadModel,
    environmentReadModel,
    resourceReadModel,
    deploymentReadModel,
  );
}

describe("runtime-usage.inspect query", () => {
  test("[RT-USAGE-001][RT-USAGE-008] parses a read-only current-scope query with shared defaults", () => {
    const query = unwrap(
      InspectRuntimeUsageQuery.create({
        scope: { kind: "server", serverId: "srv_primary" },
      }),
    );

    expect(query.input).toEqual({
      scope: { kind: "server", serverId: "srv_primary" },
      mode: "current",
      includeArtifacts: true,
      includeWarnings: true,
    });
  });

  test("[RT-USAGE-002][RT-USAGE-003][RT-USAGE-005][RT-USAGE-006] delegates to the inspector and returns conservative attribution", async () => {
    const inspector = new RecordingRuntimeUsageInspector();
    const service = queryService(inspector);
    const query = unwrap(
      InspectRuntimeUsageQuery.create({
        scope: { kind: "server", serverId: "srv_primary" },
        includeArtifacts: true,
      }),
    );

    const result = await service.execute(createTestContext(), query);

    expect(result.isOk()).toBe(true);
    expect(inspector.inputs).toEqual([
      {
        scope: { kind: "server", serverId: "srv_primary" },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      },
    ]);

    const output = result._unsafeUnwrap();
    expect(output.byResource[0]).toMatchObject({
      currentDeploymentId: "dep_current",
      currentRuntimeId: "runtime_current",
      ownership: "attributed",
    });
    expect(output.artifacts.map((artifact) => artifact.kind)).toEqual(["active-runtime", "volume"]);
    expect(output.artifacts[0]?.evidence.map((entry) => entry.source)).toEqual([
      "label",
      "deployment-snapshot",
    ]);
    expect(output.artifacts[1]).toMatchObject({
      kind: "volume",
      ownership: "unknown",
      reclaimable: "no",
      reclaimBlockedReason: "volume-excluded",
    });
  });

  test("[RT-USAGE-004] returns partial freshness and source errors without whole-query failure", async () => {
    const service = queryService(new RecordingRuntimeUsageInspector("partial"));
    const query = unwrap(
      InspectRuntimeUsageQuery.create({
        scope: { kind: "server", serverId: "srv_primary" },
      }),
    );

    const result = await service.execute(createTestContext(), query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      freshness: "unknown",
      partial: true,
      sourceErrors: [
        {
          source: "docker",
          code: "docker-unavailable",
          retriable: true,
        },
      ],
    });
  });

  test("[RT-USAGE-001] handler dispatches a query service and exposes no command-bus dependency", async () => {
    const inspector = new RecordingRuntimeUsageInspector();
    const handler = new InspectRuntimeUsageQueryHandler(queryService(inspector));
    const query = unwrap(
      InspectRuntimeUsageQuery.create({
        scope: { kind: "server", serverId: "srv_primary" },
      }),
    );

    const result = await handler.handle(createTestContext(), query);

    expect(result.isOk()).toBe(true);
    expect(inspector.inputs).toHaveLength(1);
    expect(inspector.inputs[0]?.scope).toEqual({ kind: "server", serverId: "srv_primary" });
  });

  test("[RT-USAGE-004] converts unexpected inspector throws into structured infrastructure errors", async () => {
    const service = queryService(new RecordingRuntimeUsageInspector("throw"));
    const query = unwrap(
      InspectRuntimeUsageQuery.create({
        scope: { kind: "environment", environmentId: "env_prod" },
      }),
    );

    const result = await service.execute(createTestContext(), query);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      category: "infra",
      details: {
        queryName: "runtime-usage.inspect",
        phase: "runtime-usage-inspection",
        scopeKind: "environment",
        scopeId: "env_prod",
        reason: "adapter exploded",
      },
    });
  });

  test("[RT-USAGE-008] rejects unsupported inspect modes before dispatch", () => {
    const query = InspectRuntimeUsageQuery.create({
      scope: { kind: "server", serverId: "srv_primary" },
      mode: "historical" as "current",
    });

    expect(query.isErr()).toBe(true);
  });

  test("[RT-USAGE-003][RT-USAGE-006] resolves resource scope through read models without guessing attribution totals", async () => {
    const inspector = new RecordingRuntimeUsageInspector("unattributed");
    const service = queryService(inspector);
    const query = unwrap(
      InspectRuntimeUsageQuery.create({
        scope: { kind: "resource", resourceId: "res_api" },
      }),
    );

    const result = await service.execute(createTestContext(), query);

    expect(result.isOk()).toBe(true);
    expect(inspector.inputs).toEqual([
      {
        scope: { kind: "server", serverId: "srv_primary" },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
        collectionProfile: "attribution",
      },
    ]);
    const output = result._unsafeUnwrap();
    expect(output).toMatchObject({
      scope: { kind: "resource", resourceId: "res_api" },
      partial: true,
      totals: {},
      byResource: [
        {
          scope: { kind: "resource", resourceId: "res_api" },
          ownership: "unknown",
          currentDeploymentId: "dep_current",
        },
      ],
      sourceErrors: [
        {
          source: "read-model",
          code: "runtime_usage_scope_attribution_incomplete",
          retriable: false,
        },
      ],
    });
    expect(output.warnings).toContainEqual(
      expect.objectContaining({
        code: "missing-metric-source",
        resource: "ownership",
      }),
    );
  });

  test("[RT-USAGE-002][RT-USAGE-003][RT-USAGE-006] attributes resource scope from Appaloft ownership evidence", async () => {
    const inspector = new RecordingRuntimeUsageInspector();
    const service = queryService(inspector);
    const query = unwrap(
      InspectRuntimeUsageQuery.create({
        scope: { kind: "resource", resourceId: "res_api" },
      }),
    );

    const result = await service.execute(createTestContext(), query);

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output).toMatchObject({
      scope: { kind: "resource", resourceId: "res_api" },
      partial: false,
      totals: {
        disk: { attributedBytes: 786_432 },
        docker: { containerWritableBytes: 786_432 },
      },
      byProject: [
        {
          scope: { kind: "project", projectId: "prj_usage" },
          ownership: "attributed",
          artifactCount: 1,
        },
      ],
      byEnvironment: [
        {
          scope: { kind: "environment", environmentId: "env_prod" },
          ownership: "attributed",
          artifactCount: 1,
        },
      ],
      byResource: [
        {
          scope: { kind: "resource", resourceId: "res_api" },
          ownership: "attributed",
          currentDeploymentId: "dep_current",
          currentRuntimeId: "runtime_current",
          artifactCount: 1,
        },
      ],
      byDeployment: [
        {
          scope: { kind: "deployment", deploymentId: "dep_current" },
          ownership: "attributed",
          currentDeploymentId: "dep_current",
          currentRuntimeId: "runtime_current",
          artifactCount: 1,
        },
      ],
    });
    expect(output.sourceErrors).toEqual([]);
    expect(output.artifacts).toHaveLength(1);
    expect(output.artifacts[0]?.evidence.map((entry) => entry.source)).toContain("label");
  });

  test("[RT-USAGE-002][RT-USAGE-003] preserves scope rollups when artifact details are hidden", async () => {
    const inspector = new RecordingRuntimeUsageInspector();
    const service = queryService(inspector);
    const query = unwrap(
      InspectRuntimeUsageQuery.create({
        scope: { kind: "resource", resourceId: "res_api" },
        includeArtifacts: false,
      }),
    );

    const result = await service.execute(createTestContext(), query);

    expect(result.isOk()).toBe(true);
    expect(inspector.inputs).toEqual([
      {
        scope: { kind: "server", serverId: "srv_primary" },
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
        collectionProfile: "attribution",
      },
    ]);
    const output = result._unsafeUnwrap();
    expect(output.artifacts).toEqual([]);
    expect(output.byResource).toContainEqual(
      expect.objectContaining({
        scope: { kind: "resource", resourceId: "res_api" },
        ownership: "attributed",
        artifactCount: 1,
      }),
    );
    expect(output.totals).toEqual({
      disk: { attributedBytes: 786_432 },
      docker: { containerWritableBytes: 786_432 },
    });
  });

  test("[RT-USAGE-002][RT-USAGE-003][RT-USAGE-005] enriches workspace metadata from deployment read models", async () => {
    const inspector = new RecordingRuntimeUsageInspector("workspace");
    const service = queryService(inspector);
    const query = unwrap(
      InspectRuntimeUsageQuery.create({
        scope: { kind: "resource", resourceId: "res_api" },
      }),
    );

    const result = await service.execute(createTestContext(), query);

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output.totals).toEqual({
      disk: { attributedBytes: 8192 },
    });
    expect(output.byResource).toContainEqual(
      expect.objectContaining({
        scope: { kind: "resource", resourceId: "res_api" },
        ownership: "attributed",
        artifactCount: 1,
      }),
    );
    expect(output.byDeployment).toContainEqual(
      expect.objectContaining({
        scope: { kind: "deployment", deploymentId: "dep_current" },
        ownership: "attributed",
        artifactCount: 1,
      }),
    );
    expect(output.artifacts).toContainEqual(
      expect.objectContaining({
        kind: "source-workspace",
        ownership: "attributed",
        projectId: "prj_usage",
        environmentId: "env_prod",
        resourceId: "res_api",
        deploymentId: "dep_current",
        destinationId: "dst_primary",
        runtimeId: "appaloft-dep_current",
      }),
    );
    expect(output.artifacts[0]?.evidence.map((entry) => entry.source)).toEqual([
      "workspace-metadata",
      "deployment-snapshot",
      "runtime-identity",
    ]);
  });
});
