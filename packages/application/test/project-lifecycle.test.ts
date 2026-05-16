import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  ArchiveReason,
  CreatedAt,
  DescriptionText,
  type DomainEvent,
  ok,
  Project,
  ProjectByIdSpec,
  ProjectId,
  ProjectLifecycleStatusValue,
  ProjectName,
  ProjectSlug,
  UpsertProjectSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryEnvironmentRepository,
  MemoryProjectReadModel,
  MemoryProjectRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src";
import {
  ArchiveProjectUseCase,
  CheckProjectDeleteSafetyQueryService,
  CreateEnvironmentUseCase,
  DeleteProjectUseCase,
  RenameProjectUseCase,
  RestoreProjectUseCase,
  SetProjectDescriptionUseCase,
  ShowProjectQueryService,
} from "../src/use-cases";

function projectFixture(input?: {
  id?: string;
  name?: string;
  slug?: string;
  lifecycleStatus?: "active" | "archived";
  archivedAt?: string;
  archiveReason?: string;
}): Project {
  return Project.rehydrate({
    id: ProjectId.rehydrate(input?.id ?? "prj_demo"),
    name: ProjectName.rehydrate(input?.name ?? "Demo Project"),
    slug: ProjectSlug.rehydrate(input?.slug ?? "demo-project"),
    description: DescriptionText.rehydrate("Demo project"),
    lifecycleStatus: ProjectLifecycleStatusValue.rehydrate(input?.lifecycleStatus ?? "active"),
    ...(input?.archivedAt ? { archivedAt: ArchivedAt.rehydrate(input.archivedAt) } : {}),
    ...(input?.archiveReason
      ? { archiveReason: ArchiveReason.rehydrate(input.archiveReason) }
      : {}),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function projectEvent(
  events: unknown[],
  type:
    | "project-renamed"
    | "project-description-set"
    | "project-archived"
    | "project-restored"
    | "project-deleted",
): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === type,
  );

  if (!event) {
    throw new Error(`${type} event was not captured`);
  }

  return event;
}

class FakeProjectDeletionBlockerReader {
  constructor(
    private readonly blockers: Array<{
      kind: "environment" | "resource" | "deployment-history" | "audit-retention";
      relatedEntityId?: string;
      relatedEntityType?: string;
      count?: number;
    }> = [],
  ) {}

  async findBlockers() {
    return ok(this.blockers);
  }
}

async function createHarness(projectsInput: Project[] = [projectFixture()]) {
  const context = createExecutionContext({
    requestId: "req_project_lifecycle_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const projects = new MemoryProjectRepository();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const logger = new NoopLogger();

  for (const project of projectsInput) {
    await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  }

  return {
    clock,
    context,
    eventBus,
    logger,
    projects,
    projectReadModel: new MemoryProjectReadModel(projects),
    repositoryContext,
  };
}

describe("project lifecycle operations", () => {
  test("[PROJ-LIFE-SHOW-001] shows a project by id with lifecycle metadata", async () => {
    const { context, projectReadModel } = await createHarness([
      projectFixture({
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
        archiveReason: "Retired",
      }),
    ]);
    const service = new ShowProjectQueryService(projectReadModel);

    const result = await service.execute(context, { projectId: "prj_demo" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      id: "prj_demo",
      lifecycleStatus: "archived",
      archivedAt: "2026-01-01T00:00:05.000Z",
      archiveReason: "Retired",
    });
  });

  test("[PROJ-LIFE-RENAME-001] renames an active project and publishes project-renamed", async () => {
    const { clock, context, eventBus, logger, projects, repositoryContext } = await createHarness();
    const useCase = new RenameProjectUseCase(projects, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      name: "Customer API",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo")),
    );
    expect(persisted?.toState().name.value).toBe("Customer API");
    expect(persisted?.toState().slug.value).toBe("customer-api");

    const event = projectEvent(eventBus.events, "project-renamed");
    expect(event.aggregateId).toBe("prj_demo");
    expect(event.payload).toMatchObject({
      projectId: "prj_demo",
      previousName: "Demo Project",
      nextName: "Customer API",
      previousSlug: "demo-project",
      nextSlug: "customer-api",
      renamedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[PROJ-LIFE-RENAME-003] rejects a rename that would reuse another project slug", async () => {
    const { clock, context, eventBus, logger, projects } = await createHarness([
      projectFixture(),
      projectFixture({
        id: "prj_other",
        name: "Customer API",
        slug: "customer-api",
      }),
    ]);
    const useCase = new RenameProjectUseCase(projects, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      name: "Customer API",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "project_slug_conflict",
      details: {
        phase: "project-admission",
        projectId: "prj_demo",
        projectSlug: "customer-api",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[PROJ-LIFE-DESC-001][PROJ-LIFE-EVT-003] sets project description metadata only", async () => {
    const { clock, context, eventBus, logger, projects, repositoryContext } = await createHarness();
    const useCase = new SetProjectDescriptionUseCase(projects, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      description: "Customer API workspace",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo")),
    );
    const state = persisted?.toState();
    expect(state?.description?.value).toBe("Customer API workspace");
    expect(state?.name.value).toBe("Demo Project");
    expect(state?.slug.value).toBe("demo-project");
    expect(state?.lifecycleStatus.value).toBe("active");

    const event = projectEvent(eventBus.events, "project-description-set");
    expect(event.aggregateId).toBe("prj_demo");
    expect(event.payload).toMatchObject({
      projectId: "prj_demo",
      projectSlug: "demo-project",
      previousDescription: "Demo project",
      nextDescription: "Customer API workspace",
      changedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[PROJ-LIFE-DESC-002][PROJ-LIFE-DESC-003] clears descriptions idempotently", async () => {
    const { clock, context, eventBus, logger, projects, repositoryContext } = await createHarness();
    const useCase = new SetProjectDescriptionUseCase(projects, clock, eventBus, logger);

    const first = await useCase.execute(context, {
      projectId: "prj_demo",
      description: "",
    });
    const second = await useCase.execute(context, {
      projectId: "prj_demo",
      description: "",
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    const persisted = await projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo")),
    );
    expect(persisted?.toState().description).toBeUndefined();
    expect(
      eventBus.events.filter(
        (event): event is DomainEvent =>
          Boolean(event) &&
          typeof event === "object" &&
          (event as { type?: unknown }).type === "project-description-set",
      ),
    ).toHaveLength(1);
  });

  test("[PROJ-LIFE-DESC-004] rejects description changes after archive", async () => {
    const { clock, context, eventBus, logger, projects } = await createHarness([
      projectFixture({
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
      }),
    ]);
    const useCase = new SetProjectDescriptionUseCase(projects, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      description: "Should not persist",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "project_archived",
      details: {
        commandName: "projects.set-description",
        lifecycleStatus: "archived",
        projectId: "prj_demo",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[PROJ-LIFE-ARCHIVE-001] archives an active project and publishes project-archived", async () => {
    const { clock, context, eventBus, logger, projects, repositoryContext } = await createHarness();
    const useCase = new ArchiveProjectUseCase(projects, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      reason: "Retired after migration",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("archived");
    expect(state?.archivedAt?.value).toBe("2026-01-01T00:00:10.000Z");
    expect(state?.archiveReason?.value).toBe("Retired after migration");

    const event = projectEvent(eventBus.events, "project-archived");
    expect(event.aggregateId).toBe("prj_demo");
    expect(event.payload).toMatchObject({
      projectId: "prj_demo",
      projectSlug: "demo-project",
      archivedAt: "2026-01-01T00:00:10.000Z",
      reason: "Retired after migration",
    });
  });

  test("[PROJ-LIFE-ARCHIVE-002] treats an already archived project as idempotent", async () => {
    const { clock, context, eventBus, logger, projects, repositoryContext } = await createHarness([
      projectFixture({
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
        archiveReason: "Existing reason",
      }),
    ]);
    const useCase = new ArchiveProjectUseCase(projects, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      reason: "New reason must not overwrite",
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    const persisted = await projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo")),
    );
    expect(persisted?.toState().archivedAt?.value).toBe("2026-01-01T00:00:05.000Z");
    expect(persisted?.toState().archiveReason?.value).toBe("Existing reason");
  });

  test("[PROJ-LIFE-RESTORE-001][PROJ-LIFE-EVT-004] restores an archived project and publishes project-restored", async () => {
    const { clock, context, eventBus, logger, projects, repositoryContext } = await createHarness([
      projectFixture({
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
        archiveReason: "Existing reason",
      }),
    ]);
    const useCase = new RestoreProjectUseCase(projects, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("active");
    expect(state?.archivedAt).toBeUndefined();
    expect(state?.archiveReason).toBeUndefined();

    const event = projectEvent(eventBus.events, "project-restored");
    expect(event.aggregateId).toBe("prj_demo");
    expect(event.payload).toMatchObject({
      projectId: "prj_demo",
      projectSlug: "demo-project",
      restoredAt: "2026-01-01T00:00:10.000Z",
      previousArchivedAt: "2026-01-01T00:00:05.000Z",
      previousArchiveReason: "Existing reason",
    });
  });

  test("[PROJ-LIFE-RESTORE-002] treats an already active project as idempotent", async () => {
    const { clock, context, eventBus, logger, projects, repositoryContext } = await createHarness();
    const useCase = new RestoreProjectUseCase(projects, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    const persisted = await projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("active");
  });

  test("[PROJ-LIFE-DELETE-CHECK-001] active project delete-check returns active-project blocker", async () => {
    const { clock, context, projectReadModel } = await createHarness();
    const service = new CheckProjectDeleteSafetyQueryService(
      projectReadModel,
      new FakeProjectDeletionBlockerReader(),
      clock,
    );

    const result = await service.execute(context, { projectId: "prj_demo" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "projects.delete-check/v1",
      projectId: "prj_demo",
      lifecycleStatus: "active",
      eligible: false,
      blockers: [
        {
          kind: "active-project",
          relatedEntityId: "prj_demo",
          relatedEntityType: "project",
          count: 1,
        },
      ],
      checkedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[PROJ-LIFE-DELETE-CHECK-002] archived project delete-check reports retained blockers", async () => {
    const { clock, context, projectReadModel } = await createHarness([
      projectFixture({
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
      }),
    ]);
    const service = new CheckProjectDeleteSafetyQueryService(
      projectReadModel,
      new FakeProjectDeletionBlockerReader([
        {
          kind: "resource",
          relatedEntityId: "res_demo",
          relatedEntityType: "resource",
          count: 1,
        },
      ]),
      clock,
    );

    const result = await service.execute(context, { projectId: "prj_demo" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "projects.delete-check/v1",
      projectId: "prj_demo",
      lifecycleStatus: "archived",
      eligible: false,
      blockers: [
        {
          kind: "resource",
          relatedEntityId: "res_demo",
          relatedEntityType: "resource",
          count: 1,
        },
      ],
    });
  });

  test("[PROJ-LIFE-DELETE-001][PROJ-LIFE-EVT-005] deletes an archived project with matching confirmation and no blockers", async () => {
    const { clock, context, eventBus, logger, projects, projectReadModel, repositoryContext } =
      await createHarness([
        projectFixture({
          lifecycleStatus: "archived",
          archivedAt: "2026-01-01T00:00:05.000Z",
          archiveReason: "Retired",
        }),
      ]);
    const useCase = new DeleteProjectUseCase(
      projects,
      new FakeProjectDeletionBlockerReader(),
      clock,
      eventBus,
      logger,
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      confirmation: { projectId: "prj_demo" },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("deleted");
    expect(persisted?.toState().deletedAt?.value).toBe("2026-01-01T00:00:10.000Z");
    await expect(
      projectReadModel.findOne(
        repositoryContext,
        ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo")),
      ),
    ).resolves.toBeNull();

    const event = projectEvent(eventBus.events, "project-deleted");
    expect(event.aggregateId).toBe("prj_demo");
    expect(event.payload).toMatchObject({
      projectId: "prj_demo",
      projectSlug: "demo-project",
      deletedAt: "2026-01-01T00:00:10.000Z",
      archivedAt: "2026-01-01T00:00:05.000Z",
      archiveReason: "Retired",
    });
  });

  test("[PROJ-LIFE-DELETE-002] rejects project delete when blockers remain", async () => {
    const { clock, context, eventBus, logger, projects } = await createHarness([
      projectFixture({
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
      }),
    ]);
    const useCase = new DeleteProjectUseCase(
      projects,
      new FakeProjectDeletionBlockerReader([
        {
          kind: "deployment-history",
          relatedEntityId: "dep_demo",
          relatedEntityType: "deployment",
          count: 1,
        },
      ]),
      clock,
      eventBus,
      logger,
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      confirmation: { projectId: "prj_demo" },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "project_delete_blocked",
      details: {
        lifecycleStatus: "archived",
        phase: "project-lifecycle-guard",
        projectId: "prj_demo",
        deletionBlockers: ["deployment-history"],
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[PROJ-LIFE-DELETE-003] rejects active project delete before blocker reads", async () => {
    const { clock, context, eventBus, logger, projects } = await createHarness();
    const useCase = new DeleteProjectUseCase(
      projects,
      new FakeProjectDeletionBlockerReader(),
      clock,
      eventBus,
      logger,
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      confirmation: { projectId: "prj_demo" },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "project_delete_blocked",
      details: {
        lifecycleStatus: "active",
        phase: "project-lifecycle-guard",
        projectId: "prj_demo",
        deletionBlockers: ["active-project"],
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[PROJ-LIFE-MUTATION-GUARD-001] rejects project mutations after archive", async () => {
    const { clock, context, eventBus, logger, projects } = await createHarness([
      projectFixture({
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
      }),
    ]);
    const useCase = new RenameProjectUseCase(projects, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      name: "Customer API",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "project_archived",
      details: {
        commandName: "projects.rename",
        lifecycleStatus: "archived",
        projectId: "prj_demo",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[PROJ-LIFE-MUTATION-GUARD-002] rejects environment creation after project archive", async () => {
    const { clock, context, eventBus, logger, projects } = await createHarness([
      projectFixture({
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
      }),
    ]);
    const useCase = new CreateEnvironmentUseCase(
      projects,
      new MemoryEnvironmentRepository(),
      clock,
      new SequenceIdGenerator(),
      eventBus,
      logger,
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      name: "Production",
      kind: "production",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "project_archived",
      details: {
        commandName: "environments.create",
        lifecycleStatus: "archived",
        projectId: "prj_demo",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });
});
