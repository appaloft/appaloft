import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DependencyResourceSourceModeValue,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
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
      eventBus,
      logger,
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
