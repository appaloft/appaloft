import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  ArchiveReason,
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  type DomainEvent,
  EdgeProxyKindValue,
  Environment,
  EnvironmentByIdSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentLifecycleStatusValue,
  EnvironmentName,
  HostAddress,
  LockedAt,
  LockReason,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryDestinationRepository,
  MemoryEnvironmentReadModel,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src";
import {
  ArchiveEnvironmentUseCase,
  CreateResourceUseCase,
  DeploymentContextResolver,
  LockEnvironmentUseCase,
  PromoteEnvironmentUseCase,
  SetEnvironmentVariableUseCase,
  ShowEnvironmentQueryService,
  UnlockEnvironmentUseCase,
  UnsetEnvironmentVariableUseCase,
} from "../src/use-cases";

function environmentFixture(input?: {
  id?: string;
  lifecycleStatus?: "active" | "locked" | "archived";
  lockedAt?: string;
  lockReason?: string;
  archivedAt?: string;
  archiveReason?: string;
}): Environment {
  const active = Environment.create({
    id: EnvironmentId.rehydrate(input?.id ?? "env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  if (input?.lifecycleStatus === "locked") {
    return Environment.rehydrate({
      ...active.toState(),
      lifecycleStatus: EnvironmentLifecycleStatusValue.rehydrate("locked"),
      lockedAt: LockedAt.rehydrate(input.lockedAt ?? "2026-01-01T00:00:05.000Z"),
      lockReason: LockReason.rehydrate(input.lockReason ?? "Change freeze"),
    });
  }

  if (input?.lifecycleStatus !== "archived") {
    return active;
  }

  return Environment.rehydrate({
    ...active.toState(),
    lifecycleStatus: EnvironmentLifecycleStatusValue.rehydrate("archived"),
    archivedAt: ArchivedAt.rehydrate(input.archivedAt ?? "2026-01-01T00:00:05.000Z"),
    archiveReason: ArchiveReason.rehydrate(input.archiveReason ?? "Retired"),
  });
}

function projectFixture(): Project {
  return Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function serverFixture(): DeploymentTarget {
  return DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("Demo server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("local-shell"),
    edgeProxyKind: EdgeProxyKindValue.rehydrate("traefik"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function destinationFixture(): Destination {
  return Destination.register({
    id: DestinationId.rehydrate("dst_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function resourceFixture(): Resource {
  return Resource.create({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    name: ResourceName.rehydrate("Web"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function lifecycleEvent(events: unknown[], type: string): DomainEvent {
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

function archivedEvent(events: unknown[]): DomainEvent {
  return lifecycleEvent(events, "environment-archived");
}

async function createHarness(environment = environmentFixture()) {
  const context = createExecutionContext({
    requestId: "req_archive_environment_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const servers = new MemoryServerRepository();
  const destinations = new MemoryDestinationRepository();
  const resources = new MemoryResourceRepository();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const logger = new NoopLogger();

  const project = projectFixture();
  const server = serverFixture();
  const destination = destinationFixture();
  const resource = resourceFixture();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await servers.upsert(
    repositoryContext,
    server,
    UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
  );
  await destinations.upsert(
    repositoryContext,
    destination,
    UpsertDestinationSpec.fromDestination(destination),
  );
  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  return {
    clock,
    context,
    destinations,
    environments,
    eventBus,
    logger,
    projects,
    repositoryContext,
    resources,
    servers,
  };
}

describe("environment archive operations", () => {
  test("[ENV-LIFE-ARCHIVE-001] archives an active environment and publishes environment-archived", async () => {
    const { clock, context, environments, eventBus, logger, repositoryContext } =
      await createHarness();
    const useCase = new ArchiveEnvironmentUseCase(environments, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
      reason: "Retired after migration",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await environments.findOne(
      repositoryContext,
      EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("archived");
    expect(state?.archivedAt?.value).toBe("2026-01-01T00:00:10.000Z");
    expect(state?.archiveReason?.value).toBe("Retired after migration");

    const event = archivedEvent(eventBus.events);
    expect(event.aggregateId).toBe("env_demo");
    expect(event.payload).toMatchObject({
      environmentId: "env_demo",
      projectId: "prj_demo",
      environmentName: "production",
      environmentKind: "production",
      archivedAt: "2026-01-01T00:00:10.000Z",
      reason: "Retired after migration",
    });
  });

  test("[ENV-LIFE-ARCHIVE-002] treats an already archived environment as idempotent", async () => {
    const { clock, context, environments, eventBus, logger, repositoryContext } =
      await createHarness(
        environmentFixture({
          lifecycleStatus: "archived",
          archivedAt: "2026-01-01T00:00:05.000Z",
          archiveReason: "Existing reason",
        }),
      );
    const useCase = new ArchiveEnvironmentUseCase(environments, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
      reason: "New reason must not overwrite",
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    const persisted = await environments.findOne(
      repositoryContext,
      EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
    );
    expect(persisted?.toState().archivedAt?.value).toBe("2026-01-01T00:00:05.000Z");
    expect(persisted?.toState().archiveReason?.value).toBe("Existing reason");
  });

  test("[ENV-LIFE-LOCK-001] [ENV-LIFE-LOCK-003] locks an active environment and publishes environment-locked", async () => {
    const { clock, context, environments, eventBus, logger, repositoryContext } =
      await createHarness();
    const useCase = new LockEnvironmentUseCase(environments, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
      reason: "Change freeze",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await environments.findOne(
      repositoryContext,
      EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("locked");
    expect(state?.lockedAt?.value).toBe("2026-01-01T00:00:10.000Z");
    expect(state?.lockReason?.value).toBe("Change freeze");

    const event = lifecycleEvent(eventBus.events, "environment-locked");
    expect(event.aggregateId).toBe("env_demo");
    expect(event.payload).toMatchObject({
      environmentId: "env_demo",
      projectId: "prj_demo",
      environmentName: "production",
      environmentKind: "production",
      lockedAt: "2026-01-01T00:00:10.000Z",
      reason: "Change freeze",
    });
  });

  test("[ENV-LIFE-LOCK-002] treats an already locked environment as idempotent", async () => {
    const { clock, context, environments, eventBus, logger, repositoryContext } =
      await createHarness(
        environmentFixture({
          lifecycleStatus: "locked",
          lockedAt: "2026-01-01T00:00:05.000Z",
          lockReason: "Existing freeze",
        }),
      );
    const useCase = new LockEnvironmentUseCase(environments, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
      reason: "New reason must not overwrite",
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    const persisted = await environments.findOne(
      repositoryContext,
      EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("locked");
    expect(persisted?.toState().lockedAt?.value).toBe("2026-01-01T00:00:05.000Z");
    expect(persisted?.toState().lockReason?.value).toBe("Existing freeze");
  });

  test("[ENV-LIFE-UNLOCK-001] [ENV-LIFE-UNLOCK-003] unlocks a locked environment and publishes environment-unlocked", async () => {
    const { clock, context, environments, eventBus, logger, repositoryContext } =
      await createHarness(
        environmentFixture({
          lifecycleStatus: "locked",
          lockedAt: "2026-01-01T00:00:05.000Z",
          lockReason: "Change freeze",
        }),
      );
    const useCase = new UnlockEnvironmentUseCase(environments, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await environments.findOne(
      repositoryContext,
      EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("active");
    expect(state?.lockedAt).toBeUndefined();
    expect(state?.lockReason).toBeUndefined();

    const event = lifecycleEvent(eventBus.events, "environment-unlocked");
    expect(event.aggregateId).toBe("env_demo");
    expect(event.payload).toMatchObject({
      environmentId: "env_demo",
      projectId: "prj_demo",
      environmentName: "production",
      environmentKind: "production",
      lockedAt: "2026-01-01T00:00:05.000Z",
      unlockedAt: "2026-01-01T00:00:10.000Z",
      reason: "Change freeze",
    });
  });

  test("[ENV-LIFE-UNLOCK-002] treats an active environment unlock as idempotent", async () => {
    const { clock, context, environments, eventBus, logger, repositoryContext } =
      await createHarness();
    const useCase = new UnlockEnvironmentUseCase(environments, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    const persisted = await environments.findOne(
      repositoryContext,
      EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("active");
  });

  test("[ENV-LIFE-ARCHIVE-004] archives a locked environment and clears lock metadata", async () => {
    const { clock, context, environments, eventBus, logger, repositoryContext } =
      await createHarness(
        environmentFixture({
          lifecycleStatus: "locked",
          lockedAt: "2026-01-01T00:00:05.000Z",
          lockReason: "Change freeze",
        }),
      );
    const useCase = new ArchiveEnvironmentUseCase(environments, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
      reason: "Retired while locked",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await environments.findOne(
      repositoryContext,
      EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("archived");
    expect(state?.lockedAt).toBeUndefined();
    expect(state?.lockReason).toBeUndefined();
    expect(state?.archiveReason?.value).toBe("Retired while locked");
    expect(lifecycleEvent(eventBus.events, "environment-archived").payload).toMatchObject({
      archivedAt: "2026-01-01T00:00:10.000Z",
      reason: "Retired while locked",
    });
  });

  test("[ENV-LIFE-READ-001] exposes lifecycle metadata through the environment read model", async () => {
    const { context, environments } = await createHarness(
      environmentFixture({
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
        archiveReason: "Existing reason",
      }),
    );
    const service = new ShowEnvironmentQueryService(new MemoryEnvironmentReadModel(environments));

    const result = await service.execute(context, "env_demo");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      id: "env_demo",
      lifecycleStatus: "archived",
      archivedAt: "2026-01-01T00:00:05.000Z",
      archiveReason: "Existing reason",
    });
  });

  test("[ENV-LIFE-READ-002] exposes locked metadata through the environment read model", async () => {
    const { context, environments } = await createHarness(
      environmentFixture({
        lifecycleStatus: "locked",
        lockedAt: "2026-01-01T00:00:05.000Z",
        lockReason: "Change freeze",
      }),
    );
    const service = new ShowEnvironmentQueryService(new MemoryEnvironmentReadModel(environments));

    const result = await service.execute(context, "env_demo");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      id: "env_demo",
      lifecycleStatus: "locked",
      lockedAt: "2026-01-01T00:00:05.000Z",
      lockReason: "Change freeze",
    });
  });

  test("[ENV-LIFE-GUARD-001] rejects variable writes after archive", async () => {
    const { clock, context, environments, eventBus, logger } = await createHarness(
      environmentFixture({ lifecycleStatus: "archived" }),
    );
    const useCase = new SetEnvironmentVariableUseCase(environments, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
      key: "APP_PORT",
      value: "3000",
      kind: "plain-config",
      exposure: "runtime",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "environment_archived",
      details: {
        commandName: "environments.set-variable",
        environmentId: "env_demo",
        lifecycleStatus: "archived",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[ENV-LIFE-GUARD-002] rejects variable removals after archive", async () => {
    const { clock, context, environments, eventBus, logger } = await createHarness(
      environmentFixture({ lifecycleStatus: "archived" }),
    );
    const useCase = new UnsetEnvironmentVariableUseCase(environments, clock, eventBus, logger);

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
      key: "APP_PORT",
      exposure: "runtime",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "environment_archived",
      details: {
        commandName: "environments.unset-variable",
        environmentId: "env_demo",
        lifecycleStatus: "archived",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[ENV-LIFE-GUARD-003] rejects promotion from an archived environment", async () => {
    const { clock, context, environments, eventBus, logger } = await createHarness(
      environmentFixture({ lifecycleStatus: "archived" }),
    );
    const useCase = new PromoteEnvironmentUseCase(
      environments,
      clock,
      new SequenceIdGenerator(),
      eventBus,
      logger,
    );

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
      targetName: "production-next",
      targetKind: "production",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "environment_archived",
      details: {
        commandName: "environments.promote",
        environmentId: "env_demo",
      },
    });
    expect(environments.items.has("env_0001")).toBe(false);
    expect(eventBus.events).toHaveLength(0);
  });

  test("[ENV-LIFE-GUARD-004] rejects resource creation in an archived environment", async () => {
    const { clock, context, destinations, environments, eventBus, logger, projects, resources } =
      await createHarness(environmentFixture({ lifecycleStatus: "archived" }));
    const useCase = new CreateResourceUseCase(
      projects,
      environments,
      destinations,
      resources,
      clock,
      new SequenceIdGenerator(),
      eventBus,
      logger,
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      destinationId: "dst_demo",
      name: "Worker",
      kind: "worker",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "environment_archived",
      details: {
        commandName: "resources.create",
        environmentId: "env_demo",
      },
    });
    expect(resources.items.has("res_0001")).toBe(false);
  });

  test("[ENV-LIFE-GUARD-005] rejects deployment admission in an archived environment", async () => {
    const { context, destinations, environments, projects, resources, servers } =
      await createHarness(environmentFixture({ lifecycleStatus: "archived" }));
    const resolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );

    const result = await resolver.resolve(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_web",
      serverId: "srv_demo",
      destinationId: "dst_demo",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "environment_archived",
      details: {
        commandName: "deployments.create",
        environmentId: "env_demo",
      },
    });
  });

  test("[ENV-LIFE-GUARD-006] rejects variable writes and removals while locked", async () => {
    const { clock, context, environments, eventBus, logger } = await createHarness(
      environmentFixture({ lifecycleStatus: "locked" }),
    );
    const setUseCase = new SetEnvironmentVariableUseCase(environments, clock, eventBus, logger);
    const unsetUseCase = new UnsetEnvironmentVariableUseCase(environments, clock, eventBus, logger);

    const setResult = await setUseCase.execute(context, {
      environmentId: "env_demo",
      key: "APP_PORT",
      value: "3000",
      kind: "plain-config",
      exposure: "runtime",
    });
    const unsetResult = await unsetUseCase.execute(context, {
      environmentId: "env_demo",
      key: "APP_PORT",
      exposure: "runtime",
    });

    expect(setResult.isErr()).toBe(true);
    expect(setResult._unsafeUnwrapErr()).toMatchObject({
      code: "environment_locked",
      details: {
        commandName: "environments.set-variable",
        environmentId: "env_demo",
        lifecycleStatus: "locked",
      },
    });
    expect(unsetResult.isErr()).toBe(true);
    expect(unsetResult._unsafeUnwrapErr()).toMatchObject({
      code: "environment_locked",
      details: {
        commandName: "environments.unset-variable",
        environmentId: "env_demo",
        lifecycleStatus: "locked",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[ENV-LIFE-GUARD-007] rejects promotion from a locked environment", async () => {
    const { clock, context, environments, eventBus, logger } = await createHarness(
      environmentFixture({ lifecycleStatus: "locked" }),
    );
    const useCase = new PromoteEnvironmentUseCase(
      environments,
      clock,
      new SequenceIdGenerator(),
      eventBus,
      logger,
    );

    const result = await useCase.execute(context, {
      environmentId: "env_demo",
      targetName: "production-next",
      targetKind: "production",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "environment_locked",
      details: {
        commandName: "environments.promote",
        environmentId: "env_demo",
      },
    });
    expect(environments.items.has("env_0001")).toBe(false);
    expect(eventBus.events).toHaveLength(0);
  });

  test("[ENV-LIFE-GUARD-008] rejects resource creation in a locked environment", async () => {
    const { clock, context, destinations, environments, eventBus, logger, projects, resources } =
      await createHarness(environmentFixture({ lifecycleStatus: "locked" }));
    const useCase = new CreateResourceUseCase(
      projects,
      environments,
      destinations,
      resources,
      clock,
      new SequenceIdGenerator(),
      eventBus,
      logger,
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      destinationId: "dst_demo",
      name: "Worker",
      kind: "worker",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "environment_locked",
      details: {
        commandName: "resources.create",
        environmentId: "env_demo",
      },
    });
    expect(resources.items.has("res_0001")).toBe(false);
  });

  test("[ENV-LIFE-GUARD-009] rejects deployment admission in a locked environment", async () => {
    const { context, destinations, environments, projects, resources, servers } =
      await createHarness(environmentFixture({ lifecycleStatus: "locked" }));
    const resolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );

    const result = await resolver.resolve(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_web",
      serverId: "srv_demo",
      destinationId: "dst_demo",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "environment_locked",
      details: {
        commandName: "deployments.create",
        environmentId: "env_demo",
      },
    });
  });

  test("[ENV-LIFE-LOCK-004] rejects lock and unlock for archived environments", async () => {
    const { clock, context, environments, eventBus, logger } = await createHarness(
      environmentFixture({ lifecycleStatus: "archived" }),
    );
    const lockUseCase = new LockEnvironmentUseCase(environments, clock, eventBus, logger);
    const unlockUseCase = new UnlockEnvironmentUseCase(environments, clock, eventBus, logger);

    const lockResult = await lockUseCase.execute(context, {
      environmentId: "env_demo",
      reason: "Change freeze",
    });
    const unlockResult = await unlockUseCase.execute(context, {
      environmentId: "env_demo",
    });

    expect(lockResult.isErr()).toBe(true);
    expect(lockResult._unsafeUnwrapErr()).toMatchObject({
      code: "environment_archived",
      details: {
        commandName: "environments.lock",
        environmentId: "env_demo",
      },
    });
    expect(unlockResult.isErr()).toBe(true);
    expect(unlockResult._unsafeUnwrapErr()).toMatchObject({
      code: "environment_archived",
      details: {
        commandName: "environments.unlock",
        environmentId: "env_demo",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });
});
