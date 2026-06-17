import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DestinationId,
  EnvironmentId,
  ok,
  PortNumber,
  ProjectId,
  Resource,
  ResourceExposureModeValue,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  ResourceServiceKindValue,
  ResourceServiceName,
  RuntimePlanStrategyValue,
} from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import {
  type Command as AppCommand,
  CloneEnvironmentCommand,
  type CommandBus,
  CreateResourceCommand,
  createExecutionContext,
  type EnvironmentReadModel,
  type ResourceReadModel,
} from "../src";
import {
  type DependencyResourceReadModel,
  type ResourceDependencyBindingReadModel,
  type ResourceRepository,
} from "../src/ports";
import {
  DuplicateEnvironmentProfileUseCase,
  PlanDuplicateEnvironmentQueryService,
} from "../src/use-cases";

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

function createSourceResource() {
  return Resource.create({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_prod"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    name: ResourceName.rehydrate("Web"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [
      {
        name: ResourceServiceName.rehydrate("web"),
        kind: ResourceServiceKindValue.rehydrate("web"),
      },
    ],
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("workspace-commands"),
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(3000),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:01.000Z"),
  })._unsafeUnwrap();
}

function createResourceRepository(): ResourceRepository {
  const sourceResource = createSourceResource();
  return {
    async findOne(_context, spec) {
      if (specName(spec) !== "ResourceByIdSpec") {
        return null;
      }
      return (spec as unknown as { id: { value: string } }).id.value === "res_web"
        ? sourceResource
        : null;
    },
    async upsert() {},
  };
}

function createCommandBus(commands: AppCommand<unknown>[]): CommandBus {
  return {
    async execute<T>(_context: unknown, command: AppCommand<T>) {
      commands.push(command as AppCommand<unknown>);
      if (command instanceof CloneEnvironmentCommand) {
        return ok({ id: "env_staging" } as T);
      }
      if (command instanceof CreateResourceCommand) {
        return ok({ id: "res_web_staging" } as T);
      }
      return ok({} as T);
    },
  } as CommandBus;
}

function createApplyUseCase(commands: AppCommand<unknown>[] = []) {
  return new DuplicateEnvironmentProfileUseCase(
    createCommandBus(commands),
    createEnvironmentReadModel(),
    resourceReadModel,
    createResourceRepository(),
    dependencyResourceReadModel,
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

describe("environment profile duplication apply command", () => {
  test("[ENV-PROFILE-DUP-002] rejects missing dependency decisions before mutation", async () => {
    const commands: AppCommand<unknown>[] = [];
    const result = await createApplyUseCase(commands).execute(
      createExecutionContext({
        requestId: "req_env_duplicate_apply_missing",
        entrypoint: "system",
      }),
      {
        environmentId: "env_prod",
        targetName: "staging",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(commands).toHaveLength(0);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "environment-profile-duplication-admission",
        missingDependencyResourceIds: ["rsi_pg", "rsi_external_pg"],
      },
    });
  });

  test("[ENV-PROFILE-DUP-003] [ENV-PROFILE-DUP-004] dispatches reviewed clone and resource shape commands", async () => {
    const commands: AppCommand<unknown>[] = [];
    const result = await createApplyUseCase(commands).execute(
      createExecutionContext({ requestId: "req_env_duplicate_apply", entrypoint: "system" }),
      {
        environmentId: "env_prod",
        targetName: "staging",
        dependencyDecisions: [
          { dependencyResourceId: "rsi_pg", decision: "create-new-managed" },
          {
            dependencyResourceId: "rsi_external_pg",
            decision: "bind-existing",
            targetDependencyResourceId: "rsi_external_pg_staging",
          },
        ],
      },
    );

    expect(result.isOk()).toBe(true);
    expect(commands).toHaveLength(2);
    expect(commands[0]).toBeInstanceOf(CloneEnvironmentCommand);
    expect(commands[0]).toMatchObject({
      environmentId: "env_prod",
      targetName: "staging",
    });
    expect(commands[1]).toBeInstanceOf(CreateResourceCommand);
    expect(commands[1]).toMatchObject({
      projectId: "prj_demo",
      environmentId: "env_staging",
      destinationId: "dst_demo",
      name: "Web",
      kind: "application",
      services: [{ name: "web", kind: "web" }],
      runtimeProfile: { strategy: "workspace-commands" },
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "environments.duplicate-profile/v1",
      sourceEnvironmentId: "env_prod",
      targetEnvironmentId: "env_staging",
      copiedResources: [
        {
          sourceResourceId: "res_web",
          targetResourceId: "res_web_staging",
          name: "Web",
          slug: "web",
        },
      ],
      deferredDecisions: [
        expect.objectContaining({
          kind: "dependency",
          sourceId: "rsi_pg",
          decision: "create-new-managed",
        }),
        expect.objectContaining({
          kind: "dependency",
          sourceId: "rsi_external_pg",
          decision: "bind-existing",
        }),
      ],
      generatedAt: "2026-01-01T00:00:10.000Z",
    });
  });
});
