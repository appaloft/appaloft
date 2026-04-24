import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  ArchiveReason,
  CreatedAt,
  DescriptionText,
  type DomainEvent,
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
  CreateEnvironmentUseCase,
  RenameProjectUseCase,
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
  type: "project-renamed" | "project-archived",
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
