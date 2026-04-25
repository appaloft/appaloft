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
  PromoteEnvironmentUseCase,
  SetEnvironmentVariableUseCase,
  ShowEnvironmentQueryService,
  UnsetEnvironmentVariableUseCase,
} from "../src/use-cases";

function environmentFixture(input?: {
  id?: string;
  lifecycleStatus?: "active" | "archived";
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

function archivedEvent(events: unknown[]): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "environment-archived",
  );

  if (!event) {
    throw new Error("environment-archived event was not captured");
  }

  return event;
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
});
