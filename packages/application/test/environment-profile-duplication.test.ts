import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type EnvironmentReadModel, type ResourceReadModel } from "../src";
import {
  type DependencyResourceReadModel,
  type ResourceDependencyBindingReadModel,
} from "../src/ports";
import { PlanDuplicateEnvironmentQueryService } from "../src/use-cases";

const sourceEnvironment = {
  id: "env_prod",
  projectId: "prj_demo",
  name: "production",
  kind: "production",
  lifecycleStatus: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  maskedVariables: [
    {
      key: "DATABASE_URL",
      value: "****",
      scope: "environment",
      exposure: "runtime",
      isSecret: true,
      kind: "secret",
    },
  ],
} satisfies Awaited<ReturnType<EnvironmentReadModel["findOne"]>>;

function specName(spec: unknown): string {
  return spec && typeof spec === "object" ? spec.constructor.name : "";
}

function createEnvironmentReadModel(input?: {
  existingTarget?: Awaited<ReturnType<EnvironmentReadModel["findOne"]>>;
}): EnvironmentReadModel {
  return {
    async count() {
      return 1;
    },
    async list() {
      return [sourceEnvironment];
    },
    async findOne(_context, spec) {
      if (specName(spec) === "EnvironmentByIdSpec") {
        return (spec as unknown as { id: { value: string } }).id.value === sourceEnvironment.id
          ? sourceEnvironment
          : null;
      }

      if (specName(spec) === "EnvironmentByProjectAndNameSpec") {
        return input?.existingTarget ?? null;
      }

      return null;
    },
  };
}

const resourceReadModel = {
  async count() {
    return 1;
  },
  async list() {
    return [
      {
        id: "res_web",
        projectId: "prj_demo",
        environmentId: "env_prod",
        destinationId: "dst_demo",
        name: "Web",
        slug: "web",
        kind: "application",
        createdAt: "2026-01-01T00:00:01.000Z",
        services: [{ name: "web", kind: "web" }],
        networkProfile: {
          internalPort: 3000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        },
        deploymentCount: 1,
      },
    ];
  },
  async findOne() {
    return null;
  },
} satisfies ResourceReadModel;

const dependencyResourceReadModel = {
  async count() {
    return 2;
  },
  async list() {
    return [
      {
        id: "rsi_pg",
        projectId: "prj_demo",
        environmentId: "env_prod",
        name: "Main DB",
        slug: "main-db",
        kind: "postgres",
        sourceMode: "appaloft-managed",
        providerKey: "appaloft-managed-postgres",
        providerManaged: true,
        lifecycleStatus: "ready",
        desiredCapabilities: [],
        capabilityReadbacks: [],
        bindingReadiness: { status: "ready" },
        createdAt: "2026-01-01T00:00:02.000Z",
      },
      {
        id: "rsi_external_pg",
        projectId: "prj_demo",
        environmentId: "env_prod",
        name: "External DB",
        slug: "external-db",
        kind: "postgres",
        sourceMode: "imported-external",
        providerKey: "external-postgres",
        providerManaged: false,
        lifecycleStatus: "ready",
        desiredCapabilities: [],
        capabilityReadbacks: [],
        bindingReadiness: { status: "ready" },
        createdAt: "2026-01-01T00:00:03.000Z",
      },
    ];
  },
  async findOne() {
    return null;
  },
} satisfies DependencyResourceReadModel;

const bindingReadModel = {
  async list() {
    return ok([
      {
        id: "rbind_pg",
        projectId: "prj_demo",
        environmentId: "env_prod",
        resourceId: "res_web",
        dependencyResourceId: "rsi_pg",
        dependencyResourceName: "Main DB",
        dependencyResourceSlug: "main-db",
        kind: "postgres",
        sourceMode: "appaloft-managed",
        providerKey: "appaloft-managed-postgres",
        providerManaged: true,
        lifecycleStatus: "ready",
        target: {
          targetName: "DATABASE_URL",
          scope: "environment",
          injectionMode: "env",
          secretRef: "secret://dependency/postgres/rsi_pg",
        },
        bindingReadiness: { status: "ready" },
        snapshotReadiness: { status: "ready" },
        status: "active",
        createdAt: "2026-01-01T00:00:04.000Z",
      },
    ]);
  },
  async findOne() {
    return ok(null);
  },
} satisfies ResourceDependencyBindingReadModel;

function createQueryService(input?: {
  environmentReadModel?: EnvironmentReadModel;
}): PlanDuplicateEnvironmentQueryService {
  return new PlanDuplicateEnvironmentQueryService(
    input?.environmentReadModel ?? createEnvironmentReadModel(),
    resourceReadModel,
    dependencyResourceReadModel,
    bindingReadModel,
    new FixedClock("2026-01-01T00:00:10.000Z"),
  );
}

describe("environment profile duplication plan query", () => {
  test("[ENV-PROFILE-DUP-001] [ENV-PROFILE-DUP-003] builds a plan with dependency decisions", async () => {
    const queryService = createQueryService();
    const result = await queryService.execute(
      createExecutionContext({ requestId: "req_env_duplicate_plan", entrypoint: "system" }),
      {
        environmentId: "env_prod",
        targetName: "staging",
      },
    );

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan).toMatchObject({
      schemaVersion: "environments.duplicate-plan/v1",
      sourceEnvironment: { id: "env_prod", name: "production" },
      target: { projectId: "prj_demo", name: "staging", conflict: false },
      generatedAt: "2026-01-01T00:00:10.000Z",
    });
    expect(plan.variableCandidates).toEqual([
      expect.objectContaining({
        key: "DATABASE_URL",
        maskedValue: "****",
        decisionHint: "copy",
      }),
    ]);
    expect(plan.resourceCandidates).toEqual([
      expect.objectContaining({
        resourceId: "res_web",
        decisionHint: "recreate-resource",
      }),
    ]);
    expect(plan.dependencyCandidates).toEqual([
      expect.objectContaining({
        dependencyResourceId: "rsi_pg",
        decisionHint: "create-new-managed",
      }),
      expect.objectContaining({
        dependencyResourceId: "rsi_external_pg",
        decisionHint: "bind-existing",
      }),
    ]);
    expect(plan.dependencyBindingCandidates).toEqual([
      expect.objectContaining({
        bindingId: "rbind_pg",
        decisionHint: "rebind-after-dependency-decision",
      }),
    ]);
    expect(JSON.stringify(plan)).not.toContain("super-secret");
  });

  test("[ENV-PROFILE-DUP-002] reports target name conflicts without mutating", async () => {
    const queryService = createQueryService({
      environmentReadModel: createEnvironmentReadModel({
        existingTarget: {
          ...sourceEnvironment,
          id: "env_staging",
          name: "staging",
        },
      }),
    });
    const result = await queryService.execute(
      createExecutionContext({ requestId: "req_env_duplicate_conflict", entrypoint: "system" }),
      {
        environmentId: "env_prod",
        targetName: "staging",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().target).toMatchObject({
      existingEnvironmentId: "env_staging",
      existingLifecycleStatus: "active",
      conflict: true,
    });
    expect(result._unsafeUnwrap().warnings).toEqual([
      expect.objectContaining({ code: "target_environment_name_conflict" }),
    ]);
  });

  test("[ENV-PROFILE-DUP-010] returns not_found for a missing source environment", async () => {
    const result = await createQueryService().execute(
      createExecutionContext({ requestId: "req_env_duplicate_missing", entrypoint: "system" }),
      {
        environmentId: "env_missing",
        targetName: "staging",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        entity: "environment",
        id: "env_missing",
      },
    });
  });
});
