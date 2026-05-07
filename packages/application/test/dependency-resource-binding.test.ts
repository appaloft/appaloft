import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeletedAt,
  DependencyResourceProviderFailureCode,
  DependencyResourceProviderRealizationAttemptId,
  DependencyResourceProviderRealizationStatusValue,
  DependencyResourceProviderResourceHandle,
  DependencyResourceSecretRef,
  DependencyResourceSourceModeValue,
  DescriptionText,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  OccurredAt,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceId,
  ResourceInstance,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  ResourceKindValue,
  ResourceName,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceInstanceSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FakeDependencyBindingSecretStore,
  FakeManagedPostgresProvider,
  FakeManagedRedisProvider,
  FixedClock,
  MemoryDependencyResourceDeleteSafetyReader,
  MemoryDependencyResourceReadModel,
  MemoryDependencyResourceRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceDependencyBindingReadModel,
  MemoryResourceDependencyBindingRepository,
  MemoryResourceRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import { createExecutionContext, type ExecutionContext, toRepositoryContext } from "../src";
import {
  ListResourceDependencyBindingsQuery,
  RotateResourceDependencyBindingSecretCommand,
  ShowResourceDependencyBindingQuery,
} from "../src/messages";
import {
  BindResourceDependencyUseCase,
  DeleteDependencyResourceUseCase,
  ListResourceDependencyBindingsQueryService,
  RotateResourceDependencyBindingSecretUseCase,
  ShowResourceDependencyBindingQueryService,
  UnbindResourceDependencyUseCase,
} from "../src/use-cases";

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_dependency_resource_binding_test",
    entrypoint: "system",
  });
}

async function createHarness() {
  const context = createContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const resources = new MemoryResourceRepository();
  const dependencyResources = new MemoryDependencyResourceRepository();
  const bindings = new MemoryResourceDependencyBindingRepository();
  const deleteSafetyReader = new MemoryDependencyResourceDeleteSafetyReader(bindings);
  const bindingReadModel = new MemoryResourceDependencyBindingReadModel(
    bindings,
    dependencyResources,
  );
  const dependencyReadModel = new MemoryDependencyResourceReadModel(
    dependencyResources,
    deleteSafetyReader,
  );
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();
  const idGenerator = new SequenceIdGenerator();
  const bindingSecretStore = new FakeDependencyBindingSecretStore("secret");
  const managedPostgresProvider = new FakeManagedPostgresProvider();
  const managedRedisProvider = new FakeManagedRedisProvider();
  const createdAt = CreatedAt.rehydrate(clock.now());

  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt,
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("Production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt,
  })._unsafeUnwrap();
  const resource = Resource.create({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    kind: ResourceKindValue.rehydrate("application"),
    createdAt,
  })._unsafeUnwrap();
  const dependencyResource = ResourceInstance.createPostgresDependencyResource({
    id: ResourceInstanceId.rehydrate("rsi_pg"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceInstanceName.rehydrate("External DB"),
    kind: ResourceInstanceKindValue.rehydrate("postgres"),
    sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
    providerKey: ProviderKey.rehydrate("external-postgres"),
    endpoint: {
      host: "db.example.com",
      port: 5432,
      databaseName: "app",
      maskedConnection: "postgres://app:********@db.example.com:5432/app",
    },
    providerManaged: false,
    createdAt,
  })._unsafeUnwrap();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));
  await dependencyResources.upsert(
    repositoryContext,
    dependencyResource,
    UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
  );

  return {
    bindDependency: new BindResourceDependencyUseCase(
      resources,
      dependencyResources,
      bindings,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    bindingReadModel,
    bindings,
    context,
    deleteDependencyResource: new DeleteDependencyResourceUseCase(
      dependencyResources,
      deleteSafetyReader,
      clock,
      idGenerator,
      eventBus,
      logger,
      managedPostgresProvider,
      managedRedisProvider,
    ),
    dependencyReadModel,
    dependencyResources,
    eventBus,
    listBindings: new ListResourceDependencyBindingsQueryService(bindingReadModel, clock),
    repositoryContext,
    resources,
    rotateBindingSecret: new RotateResourceDependencyBindingSecretUseCase(
      bindings,
      bindingSecretStore,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    bindingSecretStore,
    showBinding: new ShowResourceDependencyBindingQueryService(bindingReadModel, clock),
    unbindDependency: new UnbindResourceDependencyUseCase(bindings, clock, eventBus, logger),
  };
}

describe("Dependency resource binding use cases", () => {
  test("[DEP-BIND-PG-BIND-001] binds Postgres dependency resource to Resource", async () => {
    const { bindDependency, context, eventBus } = await createHarness();

    const result = await bindDependency.execute(context, {
      resourceId: "res_web",
      dependencyResourceId: "rsi_pg",
      targetName: "DATABASE_URL",
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: "resource-dependency-bound",
        aggregateId: result._unsafeUnwrap().id,
      }),
    );
  });

  test("[DEP-BIND-REDIS-BIND-001] binds imported Redis dependency resource to Resource", async () => {
    const { bindDependency, context, dependencyResources, listBindings, repositoryContext } =
      await createHarness();
    const importedRedis = ResourceInstance.createRedisDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_redis"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: ResourceInstanceName.rehydrate("External Redis"),
      kind: ResourceInstanceKindValue.rehydrate("redis"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
      providerKey: ProviderKey.rehydrate("external-redis"),
      providerManaged: false,
      endpoint: {
        host: "redis.example.com",
        port: 6379,
        databaseName: "0",
        maskedConnection: "redis://:********@redis.example.com:6379/0",
      },
      connectionSecretRef: DependencyResourceSecretRef.rehydrate(
        "appaloft://dependency-resources/rsi_redis/connection",
      ),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    await dependencyResources.upsert(
      repositoryContext,
      importedRedis,
      UpsertResourceInstanceSpec.fromResourceInstance(importedRedis),
    );

    const result = await bindDependency.execute(context, {
      resourceId: "res_web",
      dependencyResourceId: "rsi_redis",
      targetName: "REDIS_URL",
    });
    const list = await listBindings.execute(
      context,
      ListResourceDependencyBindingsQuery.create({ resourceId: "res_web" })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(list._unsafeUnwrap().items).toContainEqual(
      expect.objectContaining({
        dependencyResourceId: "rsi_redis",
        kind: "redis",
        target: expect.objectContaining({
          targetName: "REDIS_URL",
          secretRef: "appaloft://dependency-resources/rsi_redis/connection",
        }),
        connection: expect.objectContaining({
          maskedConnection: "redis://:********@redis.example.com:6379/0",
        }),
        snapshotReadiness: {
          status: "ready",
        },
      }),
    );
  });

  test("[DEP-BIND-PG-BIND-004] rejects duplicate active binding target", async () => {
    const { bindDependency, context } = await createHarness();
    await bindDependency
      .execute(context, {
        resourceId: "res_web",
        dependencyResourceId: "rsi_pg",
        targetName: "DATABASE_URL",
      })
      .then((result) => result._unsafeUnwrap());

    const duplicate = await bindDependency.execute(context, {
      resourceId: "res_web",
      dependencyResourceId: "rsi_pg",
      targetName: "DATABASE_URL",
    });

    expect(duplicate.isErr()).toBe(true);
    expect(duplicate._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        phase: "resource-dependency-binding",
      },
    });
  });

  test("[DEP-BIND-PG-BIND-002] rejects cross-environment binding", async () => {
    const { bindDependency, context, dependencyResources, repositoryContext } =
      await createHarness();
    const crossEnvironmentDependency = ResourceInstance.createPostgresDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_other_env"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_other"),
      name: ResourceInstanceName.rehydrate("Other DB"),
      kind: ResourceInstanceKindValue.rehydrate("postgres"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
      providerKey: ProviderKey.rehydrate("external-postgres"),
      endpoint: {
        host: "db.example.com",
        port: 5432,
        databaseName: "other",
        maskedConnection: "postgres://app:********@db.example.com:5432/other",
      },
      providerManaged: false,
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    await dependencyResources.upsert(
      repositoryContext,
      crossEnvironmentDependency,
      UpsertResourceInstanceSpec.fromResourceInstance(crossEnvironmentDependency),
    );

    const rejected = await bindDependency.execute(context, {
      resourceId: "res_web",
      dependencyResourceId: "rsi_other_env",
      targetName: "DATABASE_URL",
    });

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "resource_dependency_binding_context_mismatch",
      details: {
        phase: "resource-dependency-binding",
      },
    });
  });

  test("[DEP-BIND-PG-BIND-003] rejects missing binding participants", async () => {
    const { bindDependency, context } = await createHarness();

    const rejected = await bindDependency.execute(context, {
      resourceId: "res_web",
      dependencyResourceId: "rsi_missing",
      targetName: "DATABASE_URL",
    });

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        entity: "dependency_resource",
        id: "rsi_missing",
      },
    });
  });

  test("[DEP-RES-PG-NATIVE-004] rejects binding pending managed Postgres realization", async () => {
    const { bindDependency, context, dependencyResources, repositoryContext } =
      await createHarness();
    const pendingManaged = ResourceInstance.createPostgresDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_pending_pg"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: ResourceInstanceName.rehydrate("Pending DB"),
      kind: ResourceInstanceKindValue.rehydrate("postgres"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-postgres"),
      providerManaged: true,
      providerRealization: {
        status: DependencyResourceProviderRealizationStatusValue.pending(),
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_pending"),
        attemptedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    await dependencyResources.upsert(
      repositoryContext,
      pendingManaged,
      UpsertResourceInstanceSpec.fromResourceInstance(pendingManaged),
    );

    const rejected = await bindDependency.execute(context, {
      resourceId: "res_web",
      dependencyResourceId: "rsi_pending_pg",
      targetName: "DATABASE_URL",
    });

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-dependency-binding",
      },
    });
  });

  test("[DEP-RES-REDIS-NATIVE-004] rejects binding pending managed Redis realization", async () => {
    const { bindDependency, context, dependencyResources, repositoryContext } =
      await createHarness();
    const pendingManaged = ResourceInstance.createRedisDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_pending_redis"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: ResourceInstanceName.rehydrate("Pending Cache"),
      kind: ResourceInstanceKindValue.rehydrate("redis"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-redis"),
      providerManaged: true,
      providerRealization: {
        status: DependencyResourceProviderRealizationStatusValue.pending(),
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_pending_redis"),
        attemptedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    await dependencyResources.upsert(
      repositoryContext,
      pendingManaged,
      UpsertResourceInstanceSpec.fromResourceInstance(pendingManaged),
    );

    const rejected = await bindDependency.execute(context, {
      resourceId: "res_web",
      dependencyResourceId: "rsi_pending_redis",
      targetName: "REDIS_URL",
    });

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-dependency-binding",
      },
    });
  });

  test("[DEP-RES-REDIS-NATIVE-004] rejects binding unavailable managed Redis realizations", async () => {
    const { bindDependency, context, dependencyResources, listBindings, repositoryContext } =
      await createHarness();
    const baseInput = {
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      kind: ResourceInstanceKindValue.rehydrate("redis"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-redis"),
      providerManaged: true,
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    };
    const failedManaged = ResourceInstance.createRedisDependencyResource({
      ...baseInput,
      id: ResourceInstanceId.rehydrate("rsi_failed_redis"),
      name: ResourceInstanceName.rehydrate("Failed Cache"),
      providerRealization: {
        status: DependencyResourceProviderRealizationStatusValue.pending(),
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_failed_redis"),
        attemptedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
      },
    })._unsafeUnwrap();
    failedManaged
      .markProviderRealizationFailed({
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_failed_redis"),
        failureCode: DependencyResourceProviderFailureCode.rehydrate("provider_error"),
        failureMessage: DescriptionText.rehydrate("Provider failed"),
        failedAt: OccurredAt.rehydrate("2026-01-01T00:01:00.000Z"),
      })
      ._unsafeUnwrap();

    const unresolvedManaged = ResourceInstance.createRedisDependencyResource({
      ...baseInput,
      id: ResourceInstanceId.rehydrate("rsi_unresolved_redis"),
      name: ResourceInstanceName.rehydrate("Unresolved Cache"),
      providerRealization: {
        status: DependencyResourceProviderRealizationStatusValue.pending(),
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_unresolved_redis"),
        attemptedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
      },
    })._unsafeUnwrap();
    unresolvedManaged
      .markProviderRealized({
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_unresolved_redis"),
        providerResourceHandle: DependencyResourceProviderResourceHandle.rehydrate(
          "redis/rsi_unresolved_redis",
        ),
        endpoint: {
          host: "unresolved-cache.redis.internal",
          port: 6379,
          databaseName: "0",
          maskedConnection: "redis://:********@unresolved-cache.redis.internal:6379/0",
        },
        connectionSecretRef: DependencyResourceSecretRef.rehydrate(
          "appaloft://dependency-resources/rsi_unresolved_redis/connection",
        ),
        bindingReadiness: {
          status: "blocked",
          reason: DescriptionText.rehydrate("dependency_runtime_secret_unresolved"),
        },
        realizedAt: OccurredAt.rehydrate("2026-01-01T00:01:00.000Z"),
      })
      ._unsafeUnwrap();

    const deletedManaged = ResourceInstance.createRedisDependencyResource({
      ...baseInput,
      id: ResourceInstanceId.rehydrate("rsi_deleted_redis"),
      name: ResourceInstanceName.rehydrate("Deleted Cache"),
      providerRealization: {
        status: DependencyResourceProviderRealizationStatusValue.pending(),
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_deleted_redis"),
        attemptedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
      },
    })._unsafeUnwrap();
    deletedManaged
      .markProviderRealized({
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_deleted_redis"),
        providerResourceHandle:
          DependencyResourceProviderResourceHandle.rehydrate("redis/rsi_deleted_redis"),
        endpoint: {
          host: "deleted-cache.redis.internal",
          port: 6379,
          databaseName: "0",
          maskedConnection: "redis://:********@deleted-cache.redis.internal:6379/0",
        },
        connectionSecretRef: DependencyResourceSecretRef.rehydrate(
          "secret://dependency/redis/rsi_deleted_redis",
        ),
        bindingReadiness: { status: "ready" },
        realizedAt: OccurredAt.rehydrate("2026-01-01T00:01:00.000Z"),
      })
      ._unsafeUnwrap();
    deletedManaged
      .delete({
        deletedAt: DeletedAt.rehydrate("2026-01-01T00:02:00.000Z"),
        blockers: [],
        allowProviderManaged: true,
      })
      ._unsafeUnwrap();

    for (const dependencyResource of [failedManaged, unresolvedManaged, deletedManaged]) {
      await dependencyResources.upsert(
        repositoryContext,
        dependencyResource,
        UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
      );
    }

    for (const dependencyResourceId of [
      "rsi_failed_redis",
      "rsi_unresolved_redis",
      "rsi_deleted_redis",
    ]) {
      const rejected = await bindDependency.execute(context, {
        resourceId: "res_web",
        dependencyResourceId,
        targetName: "REDIS_URL",
      });

      expect(rejected.isErr()).toBe(true);
      expect(["validation_error", "not_found"]).toContain(rejected._unsafeUnwrapErr().code);
    }

    const list = await listBindings.execute(
      context,
      ListResourceDependencyBindingsQuery.create({ resourceId: "res_web" })._unsafeUnwrap(),
    );
    expect(list._unsafeUnwrap().items).toHaveLength(0);
  });

  test("[DEP-RES-REDIS-NATIVE-005] binds realized managed Redis dependency", async () => {
    const { bindDependency, context, dependencyResources, listBindings, repositoryContext } =
      await createHarness();
    const realizedManaged = ResourceInstance.createRedisDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_ready_redis"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: ResourceInstanceName.rehydrate("Ready Cache"),
      kind: ResourceInstanceKindValue.rehydrate("redis"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-redis"),
      providerManaged: true,
      providerRealization: {
        status: DependencyResourceProviderRealizationStatusValue.pending(),
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_ready_redis"),
        attemptedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    realizedManaged
      .markProviderRealized({
        attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_ready_redis"),
        providerResourceHandle:
          DependencyResourceProviderResourceHandle.rehydrate("redis/rsi_ready_redis"),
        endpoint: {
          host: "ready-cache.redis.internal",
          port: 6379,
          databaseName: "0",
          maskedConnection: "redis://:********@ready-cache.redis.internal:6379/0",
        },
        connectionSecretRef: DependencyResourceSecretRef.rehydrate(
          "secret://dependency/redis/rsi_ready_redis",
        ),
        bindingReadiness: { status: "ready" },
        realizedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })
      ._unsafeUnwrap();
    await dependencyResources.upsert(
      repositoryContext,
      realizedManaged,
      UpsertResourceInstanceSpec.fromResourceInstance(realizedManaged),
    );

    const result = await bindDependency.execute(context, {
      resourceId: "res_web",
      dependencyResourceId: "rsi_ready_redis",
      targetName: "REDIS_URL",
    });
    const list = await listBindings.execute(
      context,
      ListResourceDependencyBindingsQuery.create({ resourceId: "res_web" })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(list._unsafeUnwrap().items).toContainEqual(
      expect.objectContaining({
        dependencyResourceId: "rsi_ready_redis",
        kind: "redis",
        target: expect.objectContaining({
          targetName: "REDIS_URL",
          secretRef: "secret://dependency/redis/rsi_ready_redis",
        }),
        connection: expect.objectContaining({
          maskedConnection: "redis://:********@ready-cache.redis.internal:6379/0",
        }),
        snapshotReadiness: {
          status: "ready",
        },
      }),
    );
  });

  test("[DEP-BIND-PG-READ-001] [DEP-BIND-PG-READ-002] list/show return masked safe summaries", async () => {
    const { bindDependency, context, listBindings, showBinding } = await createHarness();
    const created = (
      await bindDependency.execute(context, {
        resourceId: "res_web",
        dependencyResourceId: "rsi_pg",
        targetName: "DATABASE_URL",
      })
    )._unsafeUnwrap();

    const list = await listBindings.execute(
      context,
      ListResourceDependencyBindingsQuery.create({ resourceId: "res_web" })._unsafeUnwrap(),
    );
    const show = await showBinding.execute(
      context,
      ShowResourceDependencyBindingQuery.create({
        resourceId: "res_web",
        bindingId: created.id,
      })._unsafeUnwrap(),
    );

    expect(list._unsafeUnwrap().items[0]).toMatchObject({
      dependencyResourceId: "rsi_pg",
      target: {
        targetName: "DATABASE_URL",
      },
      connection: {
        maskedConnection: "postgres://app:********@db.example.com:5432/app",
      },
      snapshotReadiness: {
        status: "ready",
      },
    });
    const detail = JSON.stringify(show._unsafeUnwrap());
    expect(detail).toContain("********");
    expect(detail).not.toContain("super-secret");
  });

  test("[DEP-BIND-PG-UNBIND-001] [DEP-BIND-PG-DELETE-002] unbind does not delete dependency resource", async () => {
    const {
      bindDependency,
      context,
      deleteDependencyResource,
      dependencyResources,
      repositoryContext,
      unbindDependency,
    } = await createHarness();
    const created = (
      await bindDependency.execute(context, {
        resourceId: "res_web",
        dependencyResourceId: "rsi_pg",
        targetName: "DATABASE_URL",
      })
    )._unsafeUnwrap();

    const result = await unbindDependency.execute(context, {
      resourceId: "res_web",
      bindingId: created.id,
    });

    expect(result.isOk()).toBe(true);
    expect(dependencyResources.items.get("rsi_pg")?.toState().status.value).toBe("ready");

    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId: "rsi_pg",
    });

    expect(deleted.isOk()).toBe(true);
    expect(dependencyResources.items.get("rsi_pg")?.toState().status.value).toBe("deleted");
    expect(repositoryContext).toBeDefined();
  });

  test("[DEP-BIND-PG-DELETE-001] blocks dependency resource delete by active binding metadata", async () => {
    const { bindDependency, context, deleteDependencyResource } = await createHarness();
    await bindDependency
      .execute(context, {
        resourceId: "res_web",
        dependencyResourceId: "rsi_pg",
        targetName: "DATABASE_URL",
      })
      .then((result) => result._unsafeUnwrap());

    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId: "rsi_pg",
    });

    expect(deleted.isErr()).toBe(true);
    expect(deleted._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_resource_delete_blocked",
      details: {
        phase: "dependency-resource-delete-safety",
        deletionBlockers: "resource-binding",
      },
    });
  });

  test("[DEP-BIND-ROTATE-001] rotates active binding secret reference", async () => {
    const { bindDependency, context, eventBus, rotateBindingSecret, showBinding } =
      await createHarness();
    const created = (
      await bindDependency.execute(context, {
        resourceId: "res_web",
        dependencyResourceId: "rsi_pg",
        targetName: "DATABASE_URL",
      })
    )._unsafeUnwrap();

    const rotated = await rotateBindingSecret.execute(context, {
      resourceId: "res_web",
      bindingId: created.id,
      secretRef: "secret://dependency-binding/rbd_pg/current",
      confirmHistoricalSnapshotsRemainUnchanged: true,
    });
    const show = await showBinding.execute(
      context,
      ShowResourceDependencyBindingQuery.create({
        resourceId: "res_web",
        bindingId: created.id,
      })._unsafeUnwrap(),
    );

    expect(rotated.isOk()).toBe(true);
    expect(rotated._unsafeUnwrap()).toMatchObject({
      id: created.id,
      rotatedAt: "2026-01-01T00:00:00.000Z",
      secretVersion: "rbsv_0002",
    });
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: "resource-dependency-binding-secret-rotated",
        aggregateId: created.id,
      }),
    );
    expect(show._unsafeUnwrap().binding).toMatchObject({
      id: created.id,
      target: {
        secretRef: "secret://dependency-binding/rbd_pg/current",
      },
      secretRotation: {
        secretRef: "secret://dependency-binding/rbd_pg/current",
        secretVersion: "rbsv_0002",
        rotatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  test("[DEP-BIND-ROTATE-002] rejects removed binding secret rotation", async () => {
    const { bindDependency, context, rotateBindingSecret, unbindDependency } =
      await createHarness();
    const created = (
      await bindDependency.execute(context, {
        resourceId: "res_web",
        dependencyResourceId: "rsi_pg",
        targetName: "DATABASE_URL",
      })
    )._unsafeUnwrap();
    await unbindDependency.execute(context, {
      resourceId: "res_web",
      bindingId: created.id,
    });

    const rejected = await rotateBindingSecret.execute(context, {
      resourceId: "res_web",
      bindingId: created.id,
      secretRef: "secret://dependency-binding/rbd_pg/new",
      confirmHistoricalSnapshotsRemainUnchanged: true,
    });

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "resource_dependency_binding_rotation_blocked",
      details: {
        phase: "resource-dependency-binding-secret-rotation",
        blockerReasonCode: "binding_not_active",
      },
    });
  });

  test("[DEP-BIND-ROTATE-003] stores secret value through secret store without leaking raw value", async () => {
    const { bindDependency, bindingSecretStore, context, rotateBindingSecret, showBinding } =
      await createHarness();
    const created = (
      await bindDependency.execute(context, {
        resourceId: "res_web",
        dependencyResourceId: "rsi_pg",
        targetName: "DATABASE_URL",
      })
    )._unsafeUnwrap();

    const rotated = await rotateBindingSecret.execute(context, {
      resourceId: "res_web",
      bindingId: created.id,
      secretValue: "postgres://app:super-secret@db.example.com/app",
      confirmHistoricalSnapshotsRemainUnchanged: true,
    });
    const show = await showBinding.execute(
      context,
      ShowResourceDependencyBindingQuery.create({
        resourceId: "res_web",
        bindingId: created.id,
      })._unsafeUnwrap(),
    );

    expect(rotated.isOk()).toBe(true);
    expect(bindingSecretStore.stored).toHaveLength(1);
    const detail = JSON.stringify(show._unsafeUnwrap());
    expect(detail).toContain("secret://");
    expect(detail).not.toContain("super-secret");
    expect(detail).not.toContain("postgres://app:super-secret");
  });

  test("[DEP-BIND-ROTATE-006] command validates one secret input and historical snapshot acknowledgement", () => {
    const accepted = RotateResourceDependencyBindingSecretCommand.create({
      resourceId: "res_web",
      bindingId: "rbd_pg",
      secretRef: "secret://dependency-binding/rbd_pg/current",
      confirmHistoricalSnapshotsRemainUnchanged: true,
    });
    const missingAcknowledgement = RotateResourceDependencyBindingSecretCommand.create({
      resourceId: "res_web",
      bindingId: "rbd_pg",
      secretRef: "secret://dependency-binding/rbd_pg/current",
      confirmHistoricalSnapshotsRemainUnchanged: false as true,
    });
    const ambiguousSecretInput = RotateResourceDependencyBindingSecretCommand.create({
      resourceId: "res_web",
      bindingId: "rbd_pg",
      secretRef: "secret://dependency-binding/rbd_pg/current",
      secretValue: "raw-secret",
      confirmHistoricalSnapshotsRemainUnchanged: true,
    });

    expect(accepted.isOk()).toBe(true);
    expect(missingAcknowledgement.isErr()).toBe(true);
    expect(ambiguousSecretInput.isErr()).toBe(true);
  });
});
