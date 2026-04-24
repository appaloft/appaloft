import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  ProjectId,
  Resource,
  ResourceByIdSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  UpdatedAt,
  UpsertEnvironmentSpec,
  UpsertResourceSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryEnvironmentRepository,
  MemoryResourceRepository,
  NoopLogger,
} from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src";
import {
  ResourceEffectiveConfigQueryService,
  SetResourceVariableUseCase,
  UnsetResourceVariableUseCase,
} from "../src/use-cases";

function environmentFixture(): Environment {
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  environment
    .setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate("postgres://environment"),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("environment"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:01.000Z"),
    })
    ._unsafeUnwrap();
  environment
    .setVariable({
      key: ConfigKey.rehydrate("PUBLIC_BASE_URL"),
      value: ConfigValueText.rehydrate("https://env.example.test"),
      kind: VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate("build-time"),
      scope: ConfigScopeValue.rehydrate("environment"),
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:02.000Z"),
    })
    ._unsafeUnwrap();

  return environment;
}

function resourceFixture(): Resource {
  return Resource.create({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    kind: ResourceKindValue.rehydrate("application"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function archivedResourceFixture(): Resource {
  const resource = resourceFixture();
  resource
    .archive({
      archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:05.000Z"),
    })
    ._unsafeUnwrap();
  return resource;
}

async function createHarness(input?: { environment?: Environment; resource?: Resource }) {
  const context = createExecutionContext({
    requestId: "req_resource_config_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const environments = new MemoryEnvironmentRepository();
  const resources = new MemoryResourceRepository();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const logger = new NoopLogger();
  const environment = input?.environment ?? environmentFixture();
  const resource = input?.resource ?? resourceFixture();

  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  return {
    context,
    repositoryContext,
    environments,
    resources,
    eventBus,
    setVariableUseCase: new SetResourceVariableUseCase(resources, clock, eventBus, logger),
    unsetVariableUseCase: new UnsetResourceVariableUseCase(resources, clock, eventBus, logger),
    effectiveConfigQueryService: new ResourceEffectiveConfigQueryService(
      resources,
      environments,
      clock,
    ),
  };
}

describe("resource config operations", () => {
  test("[RES-PROFILE-CONFIG-001] stores a runtime resource variable and publishes resource-variable-set", async () => {
    const { context, eventBus, repositoryContext, resources, setVariableUseCase } =
      await createHarness();

    const result = await setVariableUseCase.execute(context, {
      resourceId: "res_web",
      key: "APP_PORT",
      value: "3100",
      kind: "plain-config",
      exposure: "runtime",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(
      persisted
        ?.toState()
        .variables.toState()
        .map((entry) => ({
          key: entry.key.value,
          value: entry.value.value,
          kind: entry.kind.value,
          exposure: entry.exposure.value,
          scope: entry.scope.value,
          isSecret: entry.isSecret,
        })),
    ).toEqual([
      {
        key: "APP_PORT",
        value: "3100",
        kind: "plain-config",
        exposure: "runtime",
        scope: "resource",
        isSecret: false,
      },
    ]);
    expect(eventBus.events).toEqual([
      expect.objectContaining({
        type: "resource-variable-set",
        aggregateId: "res_web",
        payload: expect.objectContaining({
          variableKey: "APP_PORT",
          variableExposure: "runtime",
          variableKind: "plain-config",
          isSecret: false,
        }),
      }),
    ]);
  });

  test("[RES-PROFILE-CONFIG-002] [RES-PROFILE-CONFIG-009] [RES-PROFILE-CONFIG-010] [RES-PROFILE-CONFIG-011] masks secrets and resolves resource precedence in effective config", async () => {
    const { context, effectiveConfigQueryService, setVariableUseCase } = await createHarness();

    const setResult = await setVariableUseCase.execute(context, {
      resourceId: "res_web",
      key: "DATABASE_URL",
      value: "postgres://resource",
      kind: "secret",
      exposure: "runtime",
      isSecret: true,
    });
    expect(setResult.isOk()).toBe(true);

    const queryResult = await effectiveConfigQueryService.execute(context, {
      resourceId: "res_web",
    });

    expect(queryResult.isOk()).toBe(true);
    const effectiveConfig = queryResult._unsafeUnwrap();
    expect(effectiveConfig.schemaVersion).toBe("resources.effective-config/v1");
    expect(effectiveConfig.precedence).toEqual([
      "defaults",
      "system",
      "organization",
      "project",
      "environment",
      "resource",
      "deployment",
    ]);
    expect(effectiveConfig.ownedEntries).toEqual([
      expect.objectContaining({
        key: "DATABASE_URL",
        value: "****",
        scope: "resource",
        exposure: "runtime",
        kind: "secret",
        isSecret: true,
      }),
    ]);
    expect(effectiveConfig.effectiveEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "DATABASE_URL",
          value: "****",
          scope: "resource",
          exposure: "runtime",
          kind: "secret",
          isSecret: true,
        }),
        expect.objectContaining({
          key: "PUBLIC_BASE_URL",
          value: "https://env.example.test",
          scope: "environment",
          exposure: "build-time",
          kind: "plain-config",
          isSecret: false,
        }),
      ]),
    );
  });

  test("[RES-PROFILE-CONFIG-003] rejects build-time secret variables", async () => {
    const { context, eventBus, setVariableUseCase } = await createHarness();

    const result = await setVariableUseCase.execute(context, {
      resourceId: "res_web",
      key: "PUBLIC_API_BASE_URL",
      value: "https://api.example.test",
      kind: "secret",
      exposure: "build-time",
      isSecret: true,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-CONFIG-004] rejects build-time variables without PUBLIC_ or VITE_ prefixes", async () => {
    const { context, eventBus, setVariableUseCase } = await createHarness();

    const result = await setVariableUseCase.execute(context, {
      resourceId: "res_web",
      key: "API_BASE_URL",
      value: "https://api.example.test",
      kind: "plain-config",
      exposure: "build-time",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-CONFIG-005] rejects setting resource variables for archived resources", async () => {
    const { context, eventBus, setVariableUseCase } = await createHarness({
      resource: archivedResourceFixture(),
    });

    const result = await setVariableUseCase.execute(context, {
      resourceId: "res_web",
      key: "APP_PORT",
      value: "3100",
      kind: "plain-config",
      exposure: "runtime",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_archived",
      details: {
        commandName: "resources.set-variable",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-CONFIG-006] removes a resource-owned variable and publishes resource-variable-unset", async () => {
    const resource = resourceFixture();
    resource
      .setVariable({
        key: ConfigKey.rehydrate("APP_PORT"),
        value: ConfigValueText.rehydrate("3100"),
        kind: VariableKindValue.rehydrate("plain-config"),
        exposure: VariableExposureValue.rehydrate("runtime"),
        updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:04.000Z"),
      })
      ._unsafeUnwrap();

    const { context, eventBus, repositoryContext, resources, unsetVariableUseCase } =
      await createHarness({
        resource,
      });

    const result = await unsetVariableUseCase.execute(context, {
      resourceId: "res_web",
      key: "APP_PORT",
      exposure: "runtime",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(persisted?.toState().variables).toHaveLength(0);
    expect(eventBus.events).toEqual([
      expect.objectContaining({
        type: "resource-variable-unset",
        aggregateId: "res_web",
        payload: expect.objectContaining({
          variableKey: "APP_PORT",
          variableExposure: "runtime",
        }),
      }),
    ]);
  });

  test("[RES-PROFILE-CONFIG-007] returns not_found when unsetting a missing resource variable identity", async () => {
    const { context, eventBus, unsetVariableUseCase } = await createHarness();

    const result = await unsetVariableUseCase.execute(context, {
      resourceId: "res_web",
      key: "APP_PORT",
      exposure: "runtime",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        entity: "environment_variable",
        id: "APP_PORT:resource",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-CONFIG-008] rejects unsetting resource variables for archived resources", async () => {
    const { context, eventBus, unsetVariableUseCase } = await createHarness({
      resource: archivedResourceFixture(),
    });

    const result = await unsetVariableUseCase.execute(context, {
      resourceId: "res_web",
      key: "APP_PORT",
      exposure: "runtime",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_archived",
      details: {
        commandName: "resources.unset-variable",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });
});
