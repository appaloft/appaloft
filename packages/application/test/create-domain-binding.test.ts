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
  DomainBindingByIdSpec,
  DomainBindingId,
  type DomainEvent,
  EdgeProxyKindValue,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  HostAddress,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  PublicDomainName,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  RoutePathPrefix,
  TlsModeValue,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@yundu/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryDestinationRepository,
  MemoryDomainBindingReadModel,
  MemoryDomainBindingRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@yundu/testkit";
import { createExecutionContext, type ExecutionContext, toRepositoryContext } from "../src";
import { CreateDomainBindingUseCase, ListDomainBindingsQueryService } from "../src/use-cases";

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_domain_binding_test",
    entrypoint: "system",
  });
}

function domainBindingRequestedEvent(events: unknown[]): DomainEvent {
  const event = events.find((candidate): candidate is DomainEvent => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    return (candidate as { type?: unknown }).type === "domain-binding-requested";
  });

  if (!event) {
    throw new Error("domain-binding-requested event was not captured");
  }

  return event;
}

async function seedRoutingContext(input?: {
  destinationServerId?: string;
  resourceDestinationId?: string;
}) {
  const context = createTestContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const resources = new MemoryResourceRepository();
  const servers = new MemoryServerRepository();
  const destinations = new MemoryDestinationRepository();
  const domainBindings = new MemoryDomainBindingRepository();
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();

  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const server = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("demo-server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const destination = Destination.register({
    id: DestinationId.rehydrate("dst_demo"),
    serverId: DeploymentTargetId.rehydrate(input?.destinationServerId ?? "srv_demo"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const resource = Resource.create({
    id: ResourceId.rehydrate("res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    destinationId: DestinationId.rehydrate(input?.resourceDestinationId ?? "dst_demo"),
    name: ResourceName.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();

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

  const useCase = new CreateDomainBindingUseCase(
    projects,
    environments,
    resources,
    servers,
    destinations,
    domainBindings,
    clock,
    new SequenceIdGenerator(),
    eventBus,
    logger,
  );

  return {
    context,
    repositoryContext,
    domainBindings,
    eventBus,
    useCase,
    readModel: new MemoryDomainBindingReadModel(domainBindings),
  };
}

describe("CreateDomainBindingUseCase", () => {
  test("accepts a durable domain binding request and publishes domain-binding-requested", async () => {
    const { context, domainBindings, eventBus, repositoryContext, useCase } =
      await seedRoutingContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "WWW.Example.COM",
      proxyKind: "traefik",
      tlsMode: "auto",
      idempotencyKey: "domain-bindings.create:test",
    });

    expect(result.isOk()).toBe(true);
    const id = result._unsafeUnwrap().id;
    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(id)),
    );
    const persistedState = persisted?.toState();
    expect(persistedState?.domainName.value).toBe("www.example.com");
    expect(persistedState?.pathPrefix.value).toBe("/");
    expect(persistedState?.status.value).toBe("pending_verification");
    expect(persistedState?.verificationAttempts[0]?.id.value).toBe("dva_0002");

    const event = domainBindingRequestedEvent(eventBus.events);
    expect(event.aggregateId).toBe(id);
    expect(event.payload).toMatchObject({
      domainBindingId: id,
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      pathPrefix: "/",
      proxyKind: "traefik",
      tlsMode: "auto",
      certificatePolicy: "auto",
      verificationAttemptId: "dva_0002",
      correlationId: "req_domain_binding_test",
    });

    const repeated = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      proxyKind: "traefik",
      idempotencyKey: "domain-bindings.create:test",
    });
    expect(repeated.isOk()).toBe(true);
    expect(repeated._unsafeUnwrap().id).toBe(id);
  });

  test("rejects proxyKind none for durable domain bindings", async () => {
    const { context, eventBus, useCase } = await seedRoutingContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      proxyKind: "none",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("domain_binding_proxy_required");
    expect(result._unsafeUnwrapErr().details?.phase).toBe("domain-binding-admission");
    expect(eventBus.events).toHaveLength(0);
  });

  test("rejects duplicate active domain and path in the owner scope", async () => {
    const { context, eventBus, useCase } = await seedRoutingContext();

    const first = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      proxyKind: "traefik",
    });
    expect(first.isOk()).toBe(true);

    const second = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      proxyKind: "caddy",
    });

    expect(second.isErr()).toBe(true);
    expect(second._unsafeUnwrapErr().code).toBe("conflict");
    expect(second._unsafeUnwrapErr().details?.phase).toBe("domain-binding-admission");
    expect(eventBus.events).toHaveLength(1);
  });

  test("rejects destination and server context mismatch", async () => {
    const { context, eventBus, useCase } = await seedRoutingContext({
      destinationServerId: "srv_other",
    });

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      proxyKind: "traefik",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("domain_binding_context_mismatch");
    expect(result._unsafeUnwrapErr().details?.phase).toBe("context-resolution");
    expect(eventBus.events).toHaveLength(0);
  });

  test("keeps domain value validation on the command admission path", async () => {
    const { context, eventBus, useCase } = await seedRoutingContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "https://www.example.com/app",
      proxyKind: "traefik",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("validation_error");
    expect(eventBus.events).toHaveLength(0);

    expect(PublicDomainName.create("www.example.com").isOk()).toBe(true);
    expect(RoutePathPrefix.create("/").isOk()).toBe(true);
    expect(EdgeProxyKindValue.create("traefik").isOk()).toBe(true);
    expect(TlsModeValue.create("auto").isOk()).toBe(true);
  });

  test("lists accepted domain bindings through the read model query service", async () => {
    const { context, readModel, useCase } = await seedRoutingContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      proxyKind: "traefik",
    });
    expect(result.isOk()).toBe(true);

    const queryService = new ListDomainBindingsQueryService(readModel);
    const listed = await queryService.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    });

    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      domainName: "www.example.com",
      pathPrefix: "/",
      proxyKind: "traefik",
      status: "pending_verification",
      verificationAttemptCount: 1,
    });
  });
});
