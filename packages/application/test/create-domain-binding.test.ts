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
  DomainDnsObservationStatusValue,
  type DomainEvent,
  EdgeProxyKindValue,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  HostAddress,
  MessageText,
  ok,
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
  ResourceServiceKindValue,
  ResourceServiceName,
  type Result,
  RoutePathPrefix,
  TlsModeValue,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertDomainBindingSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
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
} from "@appaloft/testkit";
import {
  createDefaultConnectorDefinitions,
  createExecutionContext,
  type ExecutionContext,
  FakeDnsConnectorProviderAdapter,
  InMemoryConnectorConnectionStore,
  InMemoryConnectorProviderAdapterRegistry,
  InMemoryConnectorRegistry,
  ListConnectionsQueryService,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  PlanConnectorCapabilityQueryService,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type RepositoryContext,
  StaticDnsProviderDiscoveryPort,
  toRepositoryContext,
} from "../src";
import { CreateDomainBindingCommand } from "../src/operations/domain-bindings/create-domain-binding.command";
import {
  CreateDomainBindingUseCase,
  InspectDomainBindingDnsReadinessQueryService,
  ListDomainBindingsQueryService,
  PlanDomainBindingDnsQueryService,
} from "../src/use-cases";

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

describe("CreateDomainBindingCommand input", () => {
  test("DOMAIN-BINDING-VARIANT-001 accepts resource-scoped bindings without server and destination", () => {
    const serverlessStaticArtifactInput = {
      projectId: "prj_static",
      environmentId: "env_static",
      resourceId: "res_static",
      domainName: "www.example.com",
      pathPrefix: "/",
      proxyKind: "traefik",
      tlsMode: "auto",
    } as unknown as Parameters<typeof CreateDomainBindingCommand.create>[0];

    const command = CreateDomainBindingCommand.create(serverlessStaticArtifactInput);

    expect(command.isOk()).toBe(true);
    expect(command._unsafeUnwrap().serverId).toBeUndefined();
    expect(command._unsafeUnwrap().destinationId).toBeUndefined();
  });

  test("ROUTE-TLS-ENTRY-023 accepts a compose service route target", () => {
    const command = CreateDomainBindingCommand.create({
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      domainName: "app.example.com",
      pathPrefix: "/api",
      proxyKind: "traefik",
      tlsMode: "auto",
      targetServiceName: "api",
    });

    expect(command.isOk()).toBe(true);
    expect(command._unsafeUnwrap().targetServiceName).toBe("api");
  });
});

class RecordingProcessAttemptRecorder implements ProcessAttemptRecorder {
  readonly records: ProcessAttemptRecord[] = [];

  async record(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.records.push(attempt);
    return ok(attempt);
  }
}

class DenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.quota",
          kind: "quota",
          reason: "test-operation-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.quota",
        kind: "quota",
      },
      reason: "test-operation-denied",
    };
  }
}

async function seedRoutingContext(input?: {
  environmentProjectId?: string;
  resourceEnvironmentId?: string;
  resourceProjectId?: string;
  destinationServerId?: string;
  resourceDestinationId?: string;
  guard?: OperationGuardPort;
  serviceNames?: Array<"web" | "api">;
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
  const processAttemptRecorder = new RecordingProcessAttemptRecorder();

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
    projectId: ProjectId.rehydrate(input?.resourceProjectId ?? "prj_demo"),
    environmentId: EnvironmentId.rehydrate(input?.resourceEnvironmentId ?? "env_demo"),
    destinationId: DestinationId.rehydrate(input?.resourceDestinationId ?? "dst_demo"),
    name: ResourceName.rehydrate("web"),
    kind: ResourceKindValue.rehydrate(input?.serviceNames ? "compose-stack" : "application"),
    ...(input?.serviceNames
      ? {
          services: input.serviceNames.map((name) => ({
            name: ResourceServiceName.rehydrate(name),
            kind: ResourceServiceKindValue.rehydrate(name),
          })),
        }
      : {}),
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
    processAttemptRecorder,
    input?.guard,
  );

  return {
    context,
    repositoryContext,
    domainBindings,
    eventBus,
    processAttemptRecorder,
    useCase,
    readModel: new MemoryDomainBindingReadModel(domainBindings),
  };
}

describe("CreateDomainBindingUseCase", () => {
  test("ROUTE-TLS-ENTRY-023 persists and publishes a validated compose service target", async () => {
    const { context, domainBindings, eventBus, repositoryContext, useCase } =
      await seedRoutingContext({ serviceNames: ["web", "api"] });

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "app.example.com",
      pathPrefix: "/api",
      proxyKind: "traefik",
      tlsMode: "auto",
      targetServiceName: "api",
    });

    expect(result.isOk()).toBe(true);
    const id = result._unsafeUnwrap().id;
    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(id)),
    );
    expect(persisted?.toState().targetServiceName?.value).toBe("api");
    expect(domainBindingRequestedEvent(eventBus.events).payload).toMatchObject({
      domainBindingId: id,
      targetServiceName: "api",
    });

    const rejected = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "admin.example.com",
      proxyKind: "traefik",
      targetServiceName: "admin",
    });
    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr().details).toMatchObject({
      phase: "domain-binding-admission",
      targetServiceName: "admin",
    });
  });

  test("DOMAIN-BINDING-VARIANT-001 creates resource-scoped bindings for route-provider backed resources", async () => {
    const {
      context,
      domainBindings,
      eventBus,
      processAttemptRecorder,
      repositoryContext,
      useCase,
    } = await seedRoutingContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      domainName: "static.example.com",
      proxyKind: "traefik",
      tlsMode: "auto",
    });

    expect(result.isOk()).toBe(true);
    const id = result._unsafeUnwrap().id;
    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(id)),
    );
    const persistedState = persisted?.toState();
    expect(persistedState?.serverId).toBeUndefined();
    expect(persistedState?.destinationId).toBeUndefined();
    expect(persistedState?.dnsObservation?.expectedTargets.map((target) => target.value)).toEqual([
      "Route provider target for resource res_demo",
    ]);

    const event = domainBindingRequestedEvent(eventBus.events);
    expect(event.payload).toMatchObject({
      domainBindingId: id,
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      domainName: "static.example.com",
    });
    expect(event.payload).not.toHaveProperty("serverId");
    expect(event.payload).not.toHaveProperty("destinationId");
    expect(processAttemptRecorder.records[0]).toMatchObject({
      projectId: "prj_demo",
      resourceId: "res_demo",
      domainBindingId: id,
      safeDetails: {
        dnsExpectedTargets: "Route provider target for resource res_demo",
      },
    });
    expect(processAttemptRecorder.records[0]).not.toHaveProperty("serverId");
  });

  test("ROUTE-TLS-EVT-013 ROUTE-TLS-READMODEL-008 PROC-DELIVERY-001 accepts a binding and exposes pending DNS observation", async () => {
    const {
      context,
      domainBindings,
      eventBus,
      processAttemptRecorder,
      repositoryContext,
      useCase,
    } = await seedRoutingContext();

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
    expect(persistedState?.dnsObservation?.status.value).toBe("pending");
    expect(persistedState?.dnsObservation?.expectedTargets.map((target) => target.value)).toEqual([
      "127.0.0.1",
    ]);
    expect(persistedState?.dnsObservation?.observedTargets.map((target) => target.value)).toEqual(
      [],
    );

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
    expect(processAttemptRecorder.records).toHaveLength(1);
    expect(processAttemptRecorder.records[0]).toMatchObject({
      id: "dva_0002",
      kind: "route-realization",
      status: "pending",
      operationKey: "domain-bindings.create",
      dedupeKey: `domain-binding-verification:${id}:dva_0002`,
      correlationId: "req_domain_binding_test",
      requestId: "req_domain_binding_test",
      phase: "domain-verification",
      step: "verification-requested",
      projectId: "prj_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      domainBindingId: id,
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nextActions: ["no-action"],
      safeDetails: {
        domainName: "www.example.com",
        proxyKind: "traefik",
        tlsMode: "auto",
        certificatePolicy: "auto",
        expectedTarget: "Manual verification required for www.example.com",
        dnsExpectedTargets: "127.0.0.1",
      },
    });
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("BEGIN PRIVATE KEY");
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("provider raw payload");

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
    expect(processAttemptRecorder.records).toHaveLength(1);
  });

  test("[CLOUD-CONN-DNS-003][APP-CONN-004] plans DNS records from a domain binding through a connector", async () => {
    const { context, readModel, useCase } = await seedRoutingContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "WWW.Example.COM",
      proxyKind: "traefik",
      tlsMode: "auto",
    });

    expect(result.isOk()).toBe(true);
    const service = new PlanDomainBindingDnsQueryService(
      readModel,
      new PlanConnectorCapabilityQueryService(
        new InMemoryConnectorRegistry(
          createDefaultConnectorDefinitions({
            cloudflareDns: {
              configured: true,
            },
          }),
        ),
        new InMemoryConnectorProviderAdapterRegistry([
          new FakeDnsConnectorProviderAdapter({
            connectorKey: "cloudflare-dns",
            providerTitle: "Cloudflare DNS",
          }),
        ]),
      ),
    );

    const plan = await service.execute(context, {
      domainBindingId: result._unsafeUnwrap().id,
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.plan",
      zoneName: "example.com",
    });

    expect(plan.isOk()).toBe(true);
    const preview = plan._unsafeUnwrap();
    expect(preview.connectorKey).toBe("cloudflare-dns");
    expect(preview.capabilityKey).toBe("dns.records.plan");
    expect(preview.providerPlan?.dnsRecords).toMatchObject({
      zoneName: "example.com",
      records: [
        {
          name: "www.example.com",
          type: "A",
          value: "127.0.0.1",
          purpose: "domain-routing",
        },
      ],
      conflicts: [],
    });
    expect(preview.effects.map((effect) => effect.kind)).toContain("dns.record.upsert");
    expect(JSON.stringify(preview)).not.toContain("token");
    expect(JSON.stringify(preview)).not.toContain("secret");
  });

  test("[CLOUD-CONN-WEB-017][APP-CONN-014] plans an accepted DNS apply capability from a domain binding", async () => {
    const { context, readModel, useCase } = await seedRoutingContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "app.example.com",
      proxyKind: "traefik",
      tlsMode: "auto",
    });

    expect(result.isOk()).toBe(true);
    const service = new PlanDomainBindingDnsQueryService(
      readModel,
      new PlanConnectorCapabilityQueryService(
        new InMemoryConnectorRegistry(
          createDefaultConnectorDefinitions({
            cloudflareDns: {
              configured: true,
            },
          }),
        ),
        new InMemoryConnectorProviderAdapterRegistry([
          new FakeDnsConnectorProviderAdapter({
            connectorKey: "cloudflare-dns",
            providerTitle: "Cloudflare DNS",
          }),
        ]),
      ),
    );

    const plan = await service.execute(context, {
      domainBindingId: result._unsafeUnwrap().id,
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      zoneName: "example.com",
    });

    expect(plan.isOk()).toBe(true);
    const preview = plan._unsafeUnwrap();
    expect(preview.connectorKey).toBe("cloudflare-dns");
    expect(preview.capabilityKey).toBe("dns.records.apply");
    expect(preview.requiresExplicitAcceptance).toBe(true);
    expect(preview.providerPlan?.dnsRecords?.records).toEqual([
      {
        name: "app.example.com",
        type: "A",
        value: "127.0.0.1",
        purpose: "domain-routing",
      },
    ]);
    expect(preview.effects.map((effect) => effect.kind)).toContain("dns.record.upsert");
  });

  test("[APP-CONN-019] blocks DNS apply readiness when no connected DNS zone covers the binding", async () => {
    const { context, readModel, useCase } = await seedRoutingContext();
    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "pocketbase.appalofttest.xyz",
      proxyKind: "traefik",
      tlsMode: "auto",
    });
    expect(result.isOk()).toBe(true);

    const connectorRegistry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: { configured: true },
      }),
    );
    const service = new InspectDomainBindingDnsReadinessQueryService(
      readModel,
      new ListConnectionsQueryService(new InMemoryConnectorConnectionStore()),
      new InMemoryConnectorProviderAdapterRegistry([]),
      new PlanConnectorCapabilityQueryService(
        connectorRegistry,
        new InMemoryConnectorProviderAdapterRegistry([]),
      ),
      connectorRegistry,
      new StaticDnsProviderDiscoveryPort({
        "pocketbase.appalofttest.xyz": {
          baseDomain: "appalofttest.xyz",
          nameservers: ["marge.ns.cloudflare.com", "theo.ns.cloudflare.com"],
        },
      }),
    );

    const readiness = await service.execute(context, {
      domainBindingId: result._unsafeUnwrap().id,
      pathPrefix: "/",
      capabilityKey: "dns.records.apply",
    });

    expect(readiness.isOk()).toBe(true);
    expect(readiness._unsafeUnwrap()).toMatchObject({
      zoneMatch: { status: "no-dns-connections" },
      providerDiscovery: {
        status: "detected",
        providerId: "cloudflare",
        providerTitle: "Cloudflare DNS",
        recommendedConnectorKey: "cloudflare-dns",
      },
      conflict: { status: "available" },
      plan: { status: "blocked" },
      actions: {
        canApplyDns: false,
        canConnectProvider: true,
        canShowManualDns: true,
        reason: "dns-zone-not-connected",
      },
    });
  });

  test("[APP-CONN-019] recommends manual DNS when detected provider has no connector", async () => {
    const { context, readModel, useCase } = await seedRoutingContext();
    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      proxyKind: "traefik",
      tlsMode: "auto",
    });
    expect(result.isOk()).toBe(true);

    const connectorRegistry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: { configured: true },
      }),
    );
    const service = new InspectDomainBindingDnsReadinessQueryService(
      readModel,
      new ListConnectionsQueryService(new InMemoryConnectorConnectionStore()),
      new InMemoryConnectorProviderAdapterRegistry([]),
      new PlanConnectorCapabilityQueryService(
        connectorRegistry,
        new InMemoryConnectorProviderAdapterRegistry([]),
      ),
      connectorRegistry,
      new StaticDnsProviderDiscoveryPort({
        "www.example.com": {
          baseDomain: "example.com",
          nameservers: ["ns17.domaincontrol.com", "ns18.domaincontrol.com"],
        },
      }),
    );

    const readiness = await service.execute(context, {
      domainBindingId: result._unsafeUnwrap().id,
      pathPrefix: "/",
      capabilityKey: "dns.records.apply",
    });

    expect(readiness.isOk()).toBe(true);
    expect(readiness._unsafeUnwrap()).toMatchObject({
      providerDiscovery: {
        status: "detected",
        providerId: "godaddy",
        providerTitle: "GoDaddy DNS",
      },
      selectedConnector: { source: "none" },
      actions: {
        canApplyDns: false,
        canConnectProvider: false,
        canShowManualDns: true,
      },
      plan: {
        status: "blocked",
        message:
          "GoDaddy DNS was detected, but automatic DNS is not available for this provider yet.",
      },
    });
  });

  test("[APP-CONN-019] reports when the authorized provider account does not own the detected zone", async () => {
    const { context, readModel, useCase } = await seedRoutingContext();
    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "pocketbase.appalofttest.xyz",
      proxyKind: "traefik",
      tlsMode: "auto",
    });
    expect(result.isOk()).toBe(true);

    const adapterRegistry = new InMemoryConnectorProviderAdapterRegistry([
      new FakeDnsConnectorProviderAdapter({
        connectorKey: "cloudflare-dns",
        providerTitle: "Cloudflare DNS",
        zones: [{ name: "other-zone.example" }],
      }),
    ]);
    const connectorRegistry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: { configured: true },
      }),
    );
    const service = new InspectDomainBindingDnsReadinessQueryService(
      readModel,
      new ListConnectionsQueryService(
        new InMemoryConnectorConnectionStore([
          {
            id: "conn_cloudflare_dns_org",
            connectorKey: "cloudflare-dns",
            providerKey: "cloudflare",
            category: "dns",
            owner: { scope: "organization", id: "org_demo" },
            displayName: "Cloudflare DNS",
            status: "connected",
            capabilities: ["dns.records.plan", "dns.records.apply"],
            credentialGrant: {
              kind: "persistent-provider-credential",
              storage: "secret-ref",
              redacted: true,
              externalAccountId: "acct_demo",
            },
            providerResources: [],
            diagnostics: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
      adapterRegistry,
      new PlanConnectorCapabilityQueryService(connectorRegistry, adapterRegistry),
      connectorRegistry,
      new StaticDnsProviderDiscoveryPort({
        "pocketbase.appalofttest.xyz": {
          baseDomain: "appalofttest.xyz",
          nameservers: ["marge.ns.cloudflare.com"],
        },
      }),
    );

    const readiness = await service.execute(context, {
      domainBindingId: result._unsafeUnwrap().id,
      pathPrefix: "/",
      capabilityKey: "dns.records.apply",
    });

    expect(readiness.isOk()).toBe(true);
    expect(readiness._unsafeUnwrap()).toMatchObject({
      providerDiscovery: {
        status: "detected",
        providerId: "cloudflare",
        recommendedConnectorKey: "cloudflare-dns",
      },
      zoneMatch: { status: "no-matching-zone" },
      selectedConnector: {
        connectorKey: "cloudflare-dns",
        title: "Cloudflare DNS",
        source: "detected-provider",
      },
      actions: {
        canApplyDns: false,
        canConnectProvider: true,
      },
      plan: {
        status: "blocked",
        message: "The authorized Cloudflare DNS account does not include appalofttest.xyz.",
      },
    });
  });

  test("[APP-CONN-019] matches the longest authorized DNS zone before generating an apply plan", async () => {
    const { context, readModel, useCase } = await seedRoutingContext();
    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "api.bar.example.com",
      proxyKind: "traefik",
      tlsMode: "auto",
    });
    expect(result.isOk()).toBe(true);

    const adapterRegistry = new InMemoryConnectorProviderAdapterRegistry([
      new FakeDnsConnectorProviderAdapter({
        connectorKey: "cloudflare-dns",
        providerTitle: "Cloudflare DNS",
        zones: [{ name: "example.com" }, { name: "bar.example.com" }],
      }),
    ]);
    const connectorRegistry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: { configured: true },
      }),
    );
    const service = new InspectDomainBindingDnsReadinessQueryService(
      readModel,
      new ListConnectionsQueryService(
        new InMemoryConnectorConnectionStore([
          {
            id: "conn_cloudflare_dns_org",
            connectorKey: "cloudflare-dns",
            providerKey: "cloudflare",
            category: "dns",
            owner: { scope: "organization", id: "org_demo" },
            displayName: "Cloudflare DNS",
            status: "connected",
            capabilities: ["dns.records.plan", "dns.records.apply"],
            credentialGrant: {
              kind: "persistent-provider-credential",
              storage: "secret-ref",
              redacted: true,
              externalAccountId: "acct_demo",
            },
            providerResources: [],
            diagnostics: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
      adapterRegistry,
      new PlanConnectorCapabilityQueryService(connectorRegistry, adapterRegistry),
    );

    const readiness = await service.execute(context, {
      domainBindingId: result._unsafeUnwrap().id,
      pathPrefix: "/",
      capabilityKey: "dns.records.apply",
    });

    expect(readiness.isOk()).toBe(true);
    const payload = readiness._unsafeUnwrap();
    expect(payload.zoneMatch).toMatchObject({
      status: "matched",
      connectorKey: "cloudflare-dns",
      connectionId: "conn_cloudflare_dns_org",
      zoneName: "bar.example.com",
    });
    expect(payload.actions.canApplyDns).toBe(true);
    expect(payload.plan.preview?.providerPlan?.dnsRecords?.zoneName).toBe("bar.example.com");
  });

  test("[APP-CONN-019] reports current-owner domain route conflicts before DNS apply", async () => {
    const { context, readModel, useCase } = await seedRoutingContext();
    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "api.example.com",
      proxyKind: "traefik",
      tlsMode: "auto",
    });
    expect(result.isOk()).toBe(true);

    const adapterRegistry = new InMemoryConnectorProviderAdapterRegistry([
      new FakeDnsConnectorProviderAdapter({
        connectorKey: "cloudflare-dns",
        providerTitle: "Cloudflare DNS",
        zones: [{ name: "example.com" }],
      }),
    ]);
    const service = new InspectDomainBindingDnsReadinessQueryService(
      readModel,
      new ListConnectionsQueryService(
        new InMemoryConnectorConnectionStore([
          {
            id: "conn_cloudflare_dns_org",
            connectorKey: "cloudflare-dns",
            providerKey: "cloudflare",
            category: "dns",
            owner: { scope: "organization", id: "org_demo" },
            displayName: "Cloudflare DNS",
            status: "connected",
            capabilities: ["dns.records.plan", "dns.records.apply"],
            credentialGrant: {
              kind: "persistent-provider-credential",
              storage: "secret-ref",
              redacted: true,
            },
            providerResources: [],
            diagnostics: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
      adapterRegistry,
      new PlanConnectorCapabilityQueryService(
        new InMemoryConnectorRegistry(
          createDefaultConnectorDefinitions({
            cloudflareDns: { configured: true },
          }),
        ),
        adapterRegistry,
      ),
    );

    const readiness = await service.execute(context, {
      resourceId: "res_other",
      domainName: "api.example.com",
      pathPrefix: "/",
      capabilityKey: "dns.records.apply",
      records: [
        {
          name: "api.example.com",
          type: "CNAME",
          value: "res-other.example.net",
          purpose: "domain-routing",
        },
      ],
    });

    expect(readiness.isOk()).toBe(true);
    expect(readiness._unsafeUnwrap()).toMatchObject({
      zoneMatch: { status: "matched", zoneName: "example.com" },
      conflict: {
        status: "conflict",
        conflictingDomainBindingId: result._unsafeUnwrap().id,
        conflictingResourceId: "res_demo",
      },
      plan: { status: "blocked" },
      actions: {
        canApplyDns: false,
        reason: "domain-binding-conflict",
      },
    });
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

  test("[ROUTE-TLS-ENTRY-016] accepts a canonical redirect binding to an existing served binding", async () => {
    const { context, domainBindings, eventBus, readModel, repositoryContext, useCase } =
      await seedRoutingContext();

    const canonical = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "example.com",
      proxyKind: "traefik",
      tlsMode: "auto",
    });
    expect(canonical.isOk()).toBe(true);

    const redirect = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      proxyKind: "traefik",
      tlsMode: "auto",
      redirectTo: "example.com",
      redirectStatus: 308,
    });

    expect(redirect.isOk()).toBe(true);
    const redirectId = redirect._unsafeUnwrap().id;
    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(redirectId)),
    );
    const persistedState = persisted?.toState();
    expect(persistedState?.redirectTo?.value).toBe("example.com");
    expect(persistedState?.redirectStatus?.value).toBe(308);

    const event = domainBindingRequestedEvent(eventBus.events.slice(1));
    expect(event.payload).toMatchObject({
      domainBindingId: redirectId,
      domainName: "www.example.com",
      redirectTo: "example.com",
      redirectStatus: 308,
    });

    const listed = await new ListDomainBindingsQueryService(readModel).execute(context, {
      resourceId: "res_demo",
    });
    expect(listed.items.find((item) => item.id === redirectId)).toMatchObject({
      domainName: "www.example.com",
      redirectTo: "example.com",
      redirectStatus: 308,
    });
  });

  test("[DOMAIN-BINDING-GUARD-001] create binding can be denied before persistence and verification attempt side effects", async () => {
    const guard = new DenyingOperationGuardPort();
    const {
      context,
      domainBindings,
      eventBus,
      processAttemptRecorder,
      repositoryContext,
      useCase,
    } = await seedRoutingContext({ guard });

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

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "domain-bindings.create",
        organizationId: "org_self_hosted",
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "domain-bindings.create",
      organizationId: "org_self_hosted",
      resourceRefs: {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
      },
    });
    expect(
      await domainBindings.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(DomainBindingId.rehydrate("dmb_0001")),
      ),
    ).toBeNull();
    expect(eventBus.events).toHaveLength(0);
    expect(processAttemptRecorder.records).toHaveLength(0);
  });

  test("[ROUTE-TLS-ENTRY-017] rejects a canonical redirect binding without an existing served target", async () => {
    const { context, eventBus, useCase } = await seedRoutingContext();

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName: "www.example.com",
      proxyKind: "traefik",
      redirectTo: "example.com",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("validation_error");
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "domain-binding-admission",
      redirectTo: "example.com",
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[DMBH-CONTEXT-002] rejects domain binding owner context mismatches", async () => {
    const cases = [
      {
        name: "environment project",
        seed: { environmentProjectId: "prj_other" },
        detail: "environmentId",
      },
      {
        name: "resource project",
        seed: { resourceProjectId: "prj_other" },
        detail: "resourceId",
      },
      {
        name: "resource environment",
        seed: { resourceEnvironmentId: "env_other" },
        detail: "environmentId",
      },
      {
        name: "resource destination",
        seed: { resourceDestinationId: "dst_other" },
        detail: "resourceDestinationId",
      },
      {
        name: "destination server",
        seed: { destinationServerId: "srv_other" },
        detail: "destinationId",
      },
    ] as const;

    for (const testCase of cases) {
      const { context, eventBus, useCase } = await seedRoutingContext(testCase.seed);

      const result = await useCase.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        domainName: `${testCase.name.replaceAll(" ", "-")}.example.com`,
        proxyKind: "traefik",
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("domain_binding_context_mismatch");
      expect(result._unsafeUnwrapErr().details?.phase).toBe("context-resolution");
      expect(result._unsafeUnwrapErr().details?.[testCase.detail]).toBeDefined();
      expect(eventBus.events).toHaveLength(0);
    }
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

  test("ROUTE-TLS-READMODEL-008 lists accepted domain bindings with pending DNS observation", async () => {
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
      dnsObservation: {
        status: "pending",
        expectedTargets: ["127.0.0.1"],
        observedTargets: [],
        checkedAt: "2026-01-01T00:00:00.000Z",
      },
      verificationAttemptCount: 1,
    });
  });

  test("ROUTE-TLS-READMODEL-008 bounds domain binding list results", async () => {
    const { context, readModel, useCase } = await seedRoutingContext();

    for (const domainName of ["one.example.com", "two.example.com"]) {
      const result = await useCase.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        domainName,
        proxyKind: "traefik",
      });
      expect(result.isOk()).toBe(true);
    }

    const queryService = new ListDomainBindingsQueryService(readModel);
    const listed = await queryService.execute(context, {
      projectId: "prj_demo",
      limit: 1,
    });

    expect(listed.items).toHaveLength(1);
  });

  test("ROUTE-TLS-READMODEL-009 lists matched DNS observation without confirming ownership", async () => {
    const { context, domainBindings, readModel, repositoryContext, useCase } =
      await seedRoutingContext();

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

    const id = result._unsafeUnwrap().id;
    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(id)),
    );
    expect(persisted).toBeTruthy();

    persisted
      ?.recordDnsObservation({
        status: DomainDnsObservationStatusValue.rehydrate("matched"),
        observedTargets: [MessageText.rehydrate("127.0.0.1")],
        checkedAt: CreatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
        message: MessageText.rehydrate("Public DNS matches expected Appaloft edge target"),
      })
      ._unsafeUnwrap();

    if (persisted) {
      await domainBindings.upsert(
        repositoryContext,
        persisted,
        UpsertDomainBindingSpec.fromDomainBinding(persisted),
      );
    }

    const queryService = new ListDomainBindingsQueryService(readModel);
    const listed = await queryService.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    });

    expect(listed.items[0]).toMatchObject({
      domainName: "www.example.com",
      status: "pending_verification",
      dnsObservation: {
        status: "matched",
        expectedTargets: ["127.0.0.1"],
        observedTargets: ["127.0.0.1"],
        checkedAt: "2026-01-01T00:01:00.000Z",
        message: "Public DNS matches expected Appaloft edge target",
      },
    });
  });
});
