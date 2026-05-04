import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  Project,
  ProjectId,
  ProjectName,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryDependencyResourceDeleteSafetyReader,
  MemoryDependencyResourceReadModel,
  MemoryDependencyResourceRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import { createExecutionContext, type ExecutionContext, toRepositoryContext } from "../src";
import { ListDependencyResourcesQuery, ShowDependencyResourceQuery } from "../src/messages";
import {
  DeleteDependencyResourceUseCase,
  ImportPostgresDependencyResourceUseCase,
  ListDependencyResourcesQueryService,
  ProvisionPostgresDependencyResourceUseCase,
  RenameDependencyResourceUseCase,
  ShowDependencyResourceQueryService,
} from "../src/use-cases";

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_dependency_resource_lifecycle_test",
    entrypoint: "system",
  });
}

async function createHarness() {
  const context = createContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const dependencyResources = new MemoryDependencyResourceRepository();
  const deleteSafetyReader = new MemoryDependencyResourceDeleteSafetyReader();
  const readModel = new MemoryDependencyResourceReadModel(dependencyResources, deleteSafetyReader);
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();
  const idGenerator = new SequenceIdGenerator();

  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("Production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );

  return {
    context,
    deleteDependencyResource: new DeleteDependencyResourceUseCase(
      dependencyResources,
      deleteSafetyReader,
      clock,
      eventBus,
      logger,
    ),
    deleteSafetyReader,
    dependencyResources,
    eventBus,
    importPostgres: new ImportPostgresDependencyResourceUseCase(
      projects,
      environments,
      dependencyResources,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    listDependencyResources: new ListDependencyResourcesQueryService(readModel, clock),
    provisionPostgres: new ProvisionPostgresDependencyResourceUseCase(
      projects,
      environments,
      dependencyResources,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    readModel,
    renameDependencyResource: new RenameDependencyResourceUseCase(
      dependencyResources,
      clock,
      eventBus,
      logger,
    ),
    repositoryContext,
    showDependencyResource: new ShowDependencyResourceQueryService(readModel, clock),
  };
}

describe("Postgres dependency resource lifecycle use cases", () => {
  test("[DEP-RES-PG-PROVISION-001] provisions managed Postgres metadata and emits event", async () => {
    const { context, eventBus, provisionPostgres } = await createHarness();

    const result = await provisionPostgres.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: "dependency-resource-created",
        aggregateId: result._unsafeUnwrap().id,
      }),
    );
  });

  test("[DEP-RES-PG-IMPORT-001] [DEP-RES-PG-READ-002] imports external Postgres with masked read model", async () => {
    const { context, importPostgres, showDependencyResource } = await createHarness();

    const created = await importPostgres.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "External DB",
      connectionUrl:
        "postgres://app:super-secret@db.example.com:5432/app?sslmode=require&token=hidden",
      secretRef: "secret://dependency/postgres/external-db",
    });

    expect(created.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: created._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );

    const detail = JSON.stringify(shown._unsafeUnwrap());
    expect(detail).toContain("********");
    expect(detail).toContain("db.example.com");
    expect(detail).not.toContain("super-secret");
    expect(detail).not.toContain("hidden");
  });

  test("[DEP-RES-PG-VALIDATION-001] rejects invalid Postgres endpoint input", async () => {
    const { context, importPostgres } = await createHarness();

    const result = await importPostgres.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Broken",
      connectionUrl: "not-a-url",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "dependency-resource-validation",
      },
    });
  });

  test("[DEP-RES-PG-READ-001] list/show include readiness and backup metadata", async () => {
    const { context, importPostgres, listDependencyResources, showDependencyResource } =
      await createHarness();
    const created = (
      await importPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External DB",
        connectionUrl: "postgres://app:secret@db.example.com:5432/app",
        backupRelationship: {
          retentionRequired: true,
          reason: "Retained by future backup set",
        },
      })
    )._unsafeUnwrap();

    const list = await listDependencyResources.execute(
      context,
      ListDependencyResourcesQuery.create({ projectId: "prj_demo" })._unsafeUnwrap(),
    );
    const show = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );

    expect(list._unsafeUnwrap().items[0]).toMatchObject({
      bindingReadiness: {
        status: "not-implemented",
      },
      backupRelationship: {
        retentionRequired: true,
      },
    });
    expect(show._unsafeUnwrap().dependencyResource.connection?.maskedConnection).toContain(
      "********",
    );
  });

  test("[DEP-RES-PG-RENAME-001] renames dependency resource without changing connection metadata", async () => {
    const { context, importPostgres, renameDependencyResource, showDependencyResource } =
      await createHarness();
    const created = (
      await importPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External DB",
        connectionUrl: "postgres://app:secret@db.example.com:5432/app",
      })
    )._unsafeUnwrap();

    const renamed = await renameDependencyResource.execute(context, {
      dependencyResourceId: created.id,
      name: "Primary DB",
    });

    expect(renamed.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      name: "Primary DB",
      slug: "primary-db",
      connection: {
        host: "db.example.com",
      },
    });
  });

  test("[DEP-RES-PG-DELETE-001] imported external delete tombstones Appaloft record only", async () => {
    const { context, deleteDependencyResource, importPostgres, showDependencyResource } =
      await createHarness();
    const created = (
      await importPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External DB",
        connectionUrl: "postgres://app:secret@db.example.com:5432/app",
      })
    )._unsafeUnwrap();

    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(deleted.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );
    expect(shown.isErr()).toBe(true);
    expect(shown._unsafeUnwrapErr().code).toBe("not_found");
  });

  test("[DEP-RES-PG-DELETE-002] blocks bound dependency delete", async () => {
    const { context, deleteDependencyResource, deleteSafetyReader, importPostgres } =
      await createHarness();
    const created = (
      await importPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External DB",
        connectionUrl: "postgres://app:secret@db.example.com:5432/app",
      })
    )._unsafeUnwrap();
    deleteSafetyReader.setBlockers(created.id, [{ kind: "resource-binding", count: 1 }]);

    const result = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_resource_delete_blocked",
      details: {
        phase: "dependency-resource-delete-safety",
      },
    });
  });
});
