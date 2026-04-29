import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { DeploymentByIdSpec, ResourceByIdSpec, type Result } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type toRepositoryContext } from "../src";
import { DeploymentRecoveryReadinessQuery } from "../src/messages";
import {
  type DeploymentReadModel,
  type DeploymentRecoveryReadiness,
  type DeploymentSummary,
  type ResourceReadModel,
  type ResourceSummary,
} from "../src/ports";
import { DeploymentRecoveryReadinessQueryService } from "../src/use-cases";

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:10.000Z";
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployments: DeploymentSummary[] = []) {}

  async list(
    _context: ReturnType<typeof toRepositoryContext>,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ): Promise<DeploymentSummary[]> {
    return this.deployments
      .filter((deployment) => (input?.projectId ? deployment.projectId === input.projectId : true))
      .filter((deployment) =>
        input?.resourceId ? deployment.resourceId === input.resourceId : true,
      );
  }

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: Parameters<DeploymentReadModel["findOne"]>[1],
  ): Promise<DeploymentSummary | null> {
    if (spec instanceof DeploymentByIdSpec) {
      return this.deployments.find((deployment) => deployment.id === spec.id.value) ?? null;
    }
    return null;
  }

  async findLogs(): Promise<DeploymentSummary["logs"]> {
    return [];
  }
}

class StaticResourceReadModel implements ResourceReadModel {
  constructor(private readonly resources: ResourceSummary[] = []) {}

  async list(): Promise<ResourceSummary[]> {
    return this.resources;
  }

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: Parameters<ResourceReadModel["findOne"]>[1],
  ): Promise<ResourceSummary | null> {
    if (spec instanceof ResourceByIdSpec) {
      return this.resources.find((resource) => resource.id === spec.id.value) ?? null;
    }
    return null;
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_deployment_recovery_readiness_test",
    entrypoint: "system",
  });
}

function resourceSummary(overrides?: Partial<ResourceSummary>): ResourceSummary {
  return {
    id: "res_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    destinationId: "dst_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    services: [
      {
        name: "web",
        kind: "web",
      },
    ],
    deploymentCount: 1,
    lastDeploymentId: "dep_failed",
    lastDeploymentStatus: "failed",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(overrides?: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: "dep_failed",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    status: "failed",
    sourceCommitSha: "abcdef1234567890",
    runtimePlan: {
      id: "rplan_demo",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web.git",
        displayName: "acme/web",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "host-process-runtime",
      execution: {
        kind: "host-process",
        port: 3000,
      },
      target: {
        kind: "single-server",
        providerKey: "local-shell",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["detect", "plan", "deploy", "verify"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "project", "environment", "deployment"],
      variables: [],
    },
    logs: [],
    createdAt: "2026-01-01T00:00:05.000Z",
    startedAt: "2026-01-01T00:00:06.000Z",
    finishedAt: "2026-01-01T00:00:09.000Z",
    logCount: 0,
    ...overrides,
  };
}

function createService(input?: {
  deployments?: DeploymentSummary[];
  resources?: ResourceSummary[];
}) {
  return new DeploymentRecoveryReadinessQueryService(
    new StaticDeploymentReadModel(input?.deployments ?? [deploymentSummary()]),
    new StaticResourceReadModel(input?.resources ?? [resourceSummary()]),
    new FixedClock(),
  );
}

function createQuery(
  input?: Partial<Parameters<typeof DeploymentRecoveryReadinessQuery.create>[0]>,
) {
  return DeploymentRecoveryReadinessQuery.create({
    deploymentId: "dep_failed",
    ...input,
  })._unsafeUnwrap();
}

function unwrap(result: Result<DeploymentRecoveryReadiness>): DeploymentRecoveryReadiness {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

describe("DeploymentRecoveryReadinessQueryService", () => {
  test("[DEP-RECOVERY-READINESS-001] reports retry facts for failed attempts without activating retry command", async () => {
    const readiness = unwrap(await createService().execute(createTestContext(), createQuery()));

    expect(readiness.schemaVersion).toBe("deployments.recovery-readiness/v1");
    expect(readiness.deploymentId).toBe("dep_failed");
    expect(readiness.retryable).toBe(true);
    expect(readiness.retry).toMatchObject({
      allowed: false,
      commandActive: false,
      targetOperation: "deployments.retry",
    });
    expect(readiness.retry.reasons.map((reason) => reason.code)).toContain(
      "recovery-command-not-active",
    );
    expect(readiness.recommendedActions).toContainEqual(
      expect.objectContaining({
        targetOperation: "deployments.retry",
        blockedReasonCode: "recovery-command-not-active",
      }),
    );
  });

  test("[DEP-RECOVERY-READINESS-002] blocks recovery actions while the inspected deployment is active", async () => {
    const activeDeployment = deploymentSummary({
      status: "running",
    });
    delete activeDeployment.finishedAt;

    const readiness = unwrap(
      await createService({
        deployments: [activeDeployment],
      }).execute(createTestContext(), createQuery()),
    );

    expect(readiness.retryable).toBe(false);
    expect(readiness.retry.reasons.map((reason) => reason.code)).toContain("attempt-not-terminal");
    expect(readiness.redeployable).toBe(false);
    expect(readiness.redeploy.reasons.map((reason) => reason.code)).toContain(
      "resource-runtime-busy",
    );
  });

  test("[DEP-RECOVERY-READINESS-006] returns rollback-ready retained successful candidates", async () => {
    const readiness = unwrap(
      await createService({
        deployments: [
          deploymentSummary(),
          deploymentSummary({
            id: "dep_success",
            status: "succeeded",
            finishedAt: "2026-01-01T00:00:04.000Z",
            runtimePlan: {
              ...deploymentSummary().runtimePlan,
              runtimeArtifact: {
                kind: "image",
                intent: "build-image",
                image: "registry.example.com/acme/web@sha256:demo",
              },
            },
          }),
        ],
      }).execute(createTestContext(), createQuery()),
    );

    expect(readiness.rollbackReady).toBe(true);
    expect(readiness.rollbackCandidateCount).toBe(1);
    expect(readiness.rollback.recommendedCandidateId).toBe("dep_success");
    expect(readiness.rollback.candidates).toEqual([
      expect.objectContaining({
        deploymentId: "dep_success",
        rollbackReady: true,
        artifactSummary: "registry.example.com/acme/web@sha256:demo",
      }),
    ]);
  });

  test("[DEP-RECOVERY-READINESS-007] keeps successful candidates blocked when artifact identity is missing", async () => {
    const readiness = unwrap(
      await createService({
        deployments: [
          deploymentSummary(),
          deploymentSummary({
            id: "dep_success_without_artifact",
            status: "succeeded",
            finishedAt: "2026-01-01T00:00:04.000Z",
          }),
        ],
      }).execute(createTestContext(), createQuery()),
    );

    expect(readiness.rollbackReady).toBe(false);
    expect(readiness.rollbackCandidateCount).toBe(1);
    expect(readiness.rollback.candidates[0]?.reasons.map((reason) => reason.code)).toContain(
      "runtime-artifact-missing",
    );
  });

  test("[DEP-RECOVERY-READINESS-011] returns not_found when the deployment does not exist", async () => {
    const result = await createService({
      deployments: [],
    }).execute(createTestContext(), createQuery());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        queryName: "deployments.recovery-readiness",
        phase: "deployment-resolution",
        deploymentId: "dep_failed",
      },
    });
  });
});
