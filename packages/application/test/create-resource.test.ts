import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
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
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  HostAddress,
  ok,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  ResourceByIdSpec,
  ResourceId,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
} from "@yundu/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryDestinationRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceReadModel,
  MemoryResourceRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@yundu/testkit";
import { createExecutionContext, type ExecutionContext, toRepositoryContext } from "../src";
import { CreateResourceCommand } from "../src/messages";
import { type DefaultAccessDomainProvider } from "../src/ports";
import { CreateResourceUseCase, ListResourcesQueryService } from "../src/use-cases";

class DisabledDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  async generate() {
    return ok({
      kind: "disabled" as const,
      reason: "test-disabled",
    });
  }
}

class StaticDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  async generate() {
    return ok({
      kind: "generated" as const,
      domain: {
        hostname: "web-demo.203.0.113.10.example.test",
        scheme: "http" as const,
        providerKey: "test-provider",
      },
    });
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_resource_create_test",
    entrypoint: "system",
  });
}

function resourceCreatedEvent(events: unknown[]): DomainEvent {
  const event = events.find((candidate): candidate is DomainEvent => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    return (candidate as { type?: unknown }).type === "resource-created";
  });

  if (!event) {
    throw new Error("resource-created event was not captured");
  }

  return event;
}

async function seedResourceContext(input?: { environmentProjectId?: string }) {
  const context = createTestContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const destinations = new MemoryDestinationRepository();
  const resources = new MemoryResourceRepository();
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();

  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate(input?.environmentProjectId ?? "prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const destination = Destination.register({
    id: DestinationId.rehydrate("dst_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await destinations.upsert(
    repositoryContext,
    destination,
    UpsertDestinationSpec.fromDestination(destination),
  );

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

  return {
    context,
    destinations,
    eventBus,
    repositoryContext,
    resources,
    useCase,
    readModel: new MemoryResourceReadModel(resources),
  };
}

describe("CreateResourceUseCase", () => {
  test("rejects runtimeProfile.port at command schema boundary", () => {
    const command = CreateResourceCommand.create({
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "web",
      kind: "application",
      runtimeProfile: {
        strategy: "auto",
        port: 3000,
      },
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    } as never);

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("creates a durable resource profile and publishes resource-created", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } =
      await seedResourceContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      destinationId: "dst_demo",
      name: "Web API",
      kind: "application",
      description: "Primary web API",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web-api.git",
        displayName: "acme/web-api",
      },
      runtimeProfile: {
        strategy: "workspace-commands",
        installCommand: "bun install",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        healthCheckPath: "/health",
      },
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });

    expect(result.isOk()).toBe(true);
    const id = result._unsafeUnwrap().id;
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate(id)),
    );
    const persistedState = persisted?.toState();

    expect(persistedState?.name.value).toBe("Web API");
    expect(persistedState?.slug.value).toBe("web-api");
    expect(persistedState?.kind.value).toBe("application");
    expect(persistedState?.destinationId?.value).toBe("dst_demo");
    expect(persistedState?.sourceBinding?.kind.value).toBe("git-public");
    expect(persistedState?.sourceBinding?.locator.value).toBe(
      "https://github.com/acme/web-api.git",
    );
    expect(persistedState?.runtimeProfile?.strategy.value).toBe("workspace-commands");
    expect(persistedState?.runtimeProfile?.startCommand?.value).toBe("bun run start");
    expect(persistedState?.networkProfile?.internalPort.value).toBe(3000);
    expect(persistedState?.networkProfile?.upstreamProtocol.value).toBe("http");
    expect(persistedState?.networkProfile?.exposureMode.value).toBe("reverse-proxy");

    const event = resourceCreatedEvent(eventBus.events);
    expect(event.aggregateId).toBe(id);
    expect(event.payload).toMatchObject({
      resourceId: id,
      projectId: "prj_demo",
      environmentId: "env_demo",
      destinationId: "dst_demo",
      name: "Web API",
      slug: "web-api",
      kind: "application",
      sourceBinding: {
        kind: "git-public",
        locator: "https://github.com/acme/web-api.git",
        displayName: "acme/web-api",
      },
      runtimeProfile: {
        strategy: "workspace-commands",
        installCommand: "bun install",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        healthCheckPath: "/health",
      },
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  test("rejects environment and project context mismatch", async () => {
    const { context, eventBus, useCase } = await seedResourceContext({
      environmentProjectId: "prj_other",
    });

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "web",
      kind: "application",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("resource_context_mismatch");
    expect(result._unsafeUnwrapErr().details?.phase).toBe("context-resolution");
    expect(eventBus.events).toHaveLength(0);
  });

  test("rejects duplicate resource slug in the project environment", async () => {
    const { context, eventBus, useCase } = await seedResourceContext();

    const first = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "web",
      kind: "application",
    });
    expect(first.isOk()).toBe(true);

    const second = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Web",
      kind: "worker",
    });

    expect(second.isErr()).toBe(true);
    expect(second._unsafeUnwrapErr().code).toBe("resource_slug_conflict");
    expect(second._unsafeUnwrapErr().details?.phase).toBe("resource-admission");
    expect(eventBus.events).toHaveLength(1);
  });

  test("rejects multiple services for non-compose resources", async () => {
    const { context, eventBus, useCase } = await seedResourceContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "web",
      kind: "application",
      services: [
        { name: "web", kind: "web" },
        { name: "worker", kind: "worker" },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("invariant_violation");
    expect(result._unsafeUnwrapErr().details?.phase).toBe("resource-admission");
    expect(eventBus.events).toHaveLength(0);
  });

  test("lists created resources through the read model query service", async () => {
    const { context, readModel, useCase } = await seedResourceContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "worker",
      kind: "worker",
    });
    expect(result.isOk()).toBe(true);

    const queryService = new ListResourcesQueryService(
      readModel,
      new MemoryDestinationRepository(),
      new MemoryServerRepository(),
      new DisabledDefaultAccessDomainProvider(),
    );
    const listed = await queryService.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
    });

    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      id: result._unsafeUnwrap().id,
      name: "worker",
      slug: "worker",
      kind: "worker",
      deploymentCount: 0,
    });
  });

  test("lists planned generated access route before the first deployment", async () => {
    const { context, destinations, readModel, repositoryContext, useCase } =
      await seedResourceContext();
    const servers = new MemoryServerRepository();
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_demo"),
      name: DeploymentTargetName.rehydrate("demo"),
      host: HostAddress.rehydrate("203.0.113.10"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      edgeProxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    await servers.upsert(
      repositoryContext,
      server,
      UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      destinationId: "dst_demo",
      name: "web",
      kind: "application",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });
    expect(result.isOk()).toBe(true);

    const queryService = new ListResourcesQueryService(
      readModel,
      destinations,
      servers,
      new StaticDefaultAccessDomainProvider(),
    );
    const listed = await queryService.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
    });

    expect(listed.items[0]?.accessSummary?.plannedGeneratedAccessRoute).toEqual({
      url: "http://web-demo.203.0.113.10.example.test",
      hostname: "web-demo.203.0.113.10.example.test",
      scheme: "http",
      providerKey: "test-provider",
      pathPrefix: "/",
      proxyKind: "traefik",
      targetPort: 3000,
    });
  });
});
