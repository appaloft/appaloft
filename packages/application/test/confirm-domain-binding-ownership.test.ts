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
  createExecutionContext,
  type DomainOwnershipVerificationResult,
  type DomainOwnershipVerifier,
  type DomainRouteFailureCandidate,
  type DomainRouteFailureCandidateReader,
  type ExecutionContext,
  toRepositoryContext,
} from "../src";
import {
  ConfirmDomainBindingOwnershipUseCase,
  CreateDomainBindingUseCase,
  ListDomainBindingsQueryService,
  MarkDomainReadyOnCertificateIssuedHandler,
  MarkDomainReadyOnDomainBoundHandler,
  MarkDomainRouteFailedOnDeploymentFinishedHandler,
} from "../src/use-cases";

class StaticDomainRouteFailureCandidateReader implements DomainRouteFailureCandidateReader {
  constructor(private readonly domainBindingIds: string[]) {}

  async listAffectedBindings(
    context: Parameters<DomainRouteFailureCandidateReader["listAffectedBindings"]>[0],
    input: Parameters<DomainRouteFailureCandidateReader["listAffectedBindings"]>[1],
  ): Promise<DomainRouteFailureCandidate[]> {
    void context;
    void input;
    return this.domainBindingIds.map((domainBindingId) => ({
      domainBindingId,
    }));
  }
}

class StaticDomainOwnershipVerifier implements DomainOwnershipVerifier {
  readonly calls: Array<{
    domainName: string;
    expectedTargets: string[];
  }> = [];

  constructor(
    private readonly result: DomainOwnershipVerificationResult = {
      status: "matched",
      observedTargets: ["127.0.0.1"],
      message: "Observed expected target",
    },
  ) {}

  async verifyDns(
    context: Parameters<DomainOwnershipVerifier["verifyDns"]>[0],
    input: Parameters<DomainOwnershipVerifier["verifyDns"]>[1],
  ): Promise<DomainOwnershipVerificationResult> {
    void context;
    this.calls.push({
      domainName: input.domainName,
      expectedTargets: [...input.expectedTargets],
    });
    return this.result;
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_domain_binding_confirm_test",
    entrypoint: "system",
  });
}

function eventsByType(events: unknown[], type: string): DomainEvent[] {
  return events.filter((candidate): candidate is DomainEvent => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    return (candidate as { type?: unknown }).type === type;
  });
}

async function seedRoutingContext(input?: {
  domainName?: string;
  tlsMode?: "auto" | "disabled";
  domainOwnershipVerifier?: DomainOwnershipVerifier;
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
  const domainOwnershipVerifier =
    input?.domainOwnershipVerifier ?? new StaticDomainOwnershipVerifier();

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
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const resource = Resource.create({
    id: ResourceId.rehydrate("res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
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

  const createUseCase = new CreateDomainBindingUseCase(
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
  const confirmUseCase = new ConfirmDomainBindingOwnershipUseCase(
    domainBindings,
    domainOwnershipVerifier,
    clock,
    eventBus,
    logger,
  );

  const created = await createUseCase.execute(context, {
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_demo",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    domainName: input?.domainName ?? "www.example.com",
    proxyKind: "traefik",
    tlsMode: input?.tlsMode ?? "auto",
  });
  expect(created.isOk()).toBe(true);

  return {
    context,
    repositoryContext,
    domainBindings,
    eventBus,
    clock,
    logger,
    confirmUseCase,
    domainBindingId: created._unsafeUnwrap().id,
    readModel: new MemoryDomainBindingReadModel(domainBindings),
  };
}

describe("ConfirmDomainBindingOwnershipUseCase", () => {
  test("[ROUTE-TLS-CMD-007] confirms manual ownership override and publishes domain-bound", async () => {
    const domainOwnershipVerifier = new StaticDomainOwnershipVerifier({
      status: "mismatch",
      observedTargets: ["203.0.113.10"],
      message: "Wrong target",
    });
    const {
      confirmUseCase,
      context,
      domainBindingId,
      domainBindings,
      eventBus,
      repositoryContext,
    } = await seedRoutingContext({ domainOwnershipVerifier });

    const result = await confirmUseCase.execute(context, {
      domainBindingId,
      verificationMode: "manual",
      confirmedBy: "operator",
      evidence: "DNS target checked",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      id: domainBindingId,
      verificationAttemptId: "dva_0002",
    });

    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(domainBindingId)),
    );
    const persistedState = persisted?.toState();
    expect(persistedState?.status.value).toBe("bound");
    expect(persistedState?.verificationAttempts[0]?.status.value).toBe("verified");
    expect(domainOwnershipVerifier.calls).toHaveLength(0);

    const domainBoundEvents = eventsByType(eventBus.events, "domain-bound");
    expect(domainBoundEvents).toHaveLength(1);
    expect(domainBoundEvents[0]?.payload).toMatchObject({
      domainBindingId,
      domainName: "www.example.com",
      pathPrefix: "/",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      tlsMode: "auto",
      certificatePolicy: "auto",
      verificationAttemptId: "dva_0002",
      correlationId: "req_domain_binding_confirm_test",
    });
  });

  test("[ROUTE-TLS-CMD-016] confirms DNS ownership when resolver observes expected target", async () => {
    const domainOwnershipVerifier = new StaticDomainOwnershipVerifier({
      status: "matched",
      observedTargets: ["127.0.0.1"],
      message: "Expected target observed",
    });
    const {
      confirmUseCase,
      context,
      domainBindingId,
      domainBindings,
      eventBus,
      repositoryContext,
    } = await seedRoutingContext({
      domainName: "dns-ok.example.com",
      domainOwnershipVerifier,
    });

    const result = await confirmUseCase.execute(context, {
      domainBindingId,
    });

    expect(result.isOk()).toBe(true);
    expect(domainOwnershipVerifier.calls).toEqual([
      {
        domainName: "dns-ok.example.com",
        expectedTargets: ["127.0.0.1"],
      },
    ]);

    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(domainBindingId)),
    );
    const persistedState = persisted?.toState();
    expect(persistedState?.status.value).toBe("bound");
    expect(persistedState?.verificationAttempts[0]?.status.value).toBe("verified");
    expect(persistedState?.dnsObservation?.status.value).toBe("matched");
    expect(persistedState?.dnsObservation?.checkedAt?.value).toBe("2026-01-01T00:00:00.000Z");
    expect(persistedState?.dnsObservation?.message?.value).toBe("Expected target observed");
    expect(persistedState?.dnsObservation?.observedTargets.map((target) => target.value)).toEqual([
      "127.0.0.1",
    ]);
    expect(eventsByType(eventBus.events, "domain-bound")).toHaveLength(1);
  });

  test("[ROUTE-TLS-CMD-017] blocks DNS ownership confirmation when resolver observes wrong target", async () => {
    const domainOwnershipVerifier = new StaticDomainOwnershipVerifier({
      status: "mismatch",
      observedTargets: ["203.0.113.10"],
      message: "Wrong target observed",
    });
    const {
      confirmUseCase,
      context,
      domainBindingId,
      domainBindings,
      eventBus,
      repositoryContext,
    } = await seedRoutingContext({
      domainName: "dns-mismatch.example.com",
      domainOwnershipVerifier,
    });

    const result = await confirmUseCase.execute(context, {
      domainBindingId,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "domain_ownership_unverified",
      retryable: false,
      details: {
        phase: "domain-verification",
        domainBindingId,
        domainName: "dns-mismatch.example.com",
      },
    });
    expect(eventsByType(eventBus.events, "domain-bound")).toHaveLength(0);

    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(domainBindingId)),
    );
    const persistedState = persisted?.toState();
    expect(persistedState?.status.value).toBe("pending_verification");
    expect(persistedState?.verificationAttempts[0]?.status.value).toBe("pending");
    expect(persistedState?.dnsObservation?.status.value).toBe("mismatch");
    expect(persistedState?.dnsObservation?.observedTargets.map((target) => target.value)).toEqual([
      "203.0.113.10",
    ]);
  });

  test("[ROUTE-TLS-CMD-018] records lookup failure without publishing domain-bound", async () => {
    const domainOwnershipVerifier = new StaticDomainOwnershipVerifier({
      status: "lookup_failed",
      observedTargets: [],
      message: "Resolver unavailable",
    });
    const {
      confirmUseCase,
      context,
      domainBindingId,
      domainBindings,
      eventBus,
      repositoryContext,
    } = await seedRoutingContext({
      domainName: "dns-failure.example.com",
      domainOwnershipVerifier,
    });

    const result = await confirmUseCase.execute(context, {
      domainBindingId,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "dns_lookup_failed",
      retryable: true,
      details: {
        phase: "domain-verification",
        domainBindingId,
        domainName: "dns-failure.example.com",
      },
    });
    expect(eventsByType(eventBus.events, "domain-bound")).toHaveLength(0);

    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(domainBindingId)),
    );
    const persistedState = persisted?.toState();
    expect(persistedState?.status.value).toBe("pending_verification");
    expect(persistedState?.verificationAttempts[0]?.status.value).toBe("pending");
    expect(persistedState?.dnsObservation?.status.value).toBe("lookup_failed");
    expect(persistedState?.dnsObservation?.message?.value).toBe("Resolver unavailable");
  });

  test("[ROUTE-TLS-CMD-010] repeated confirmation for the same verified attempt is idempotent", async () => {
    const { confirmUseCase, context, domainBindingId, eventBus } = await seedRoutingContext();

    const first = await confirmUseCase.execute(context, {
      domainBindingId,
      verificationAttemptId: "dva_0002",
    });
    expect(first.isOk()).toBe(true);

    const repeated = await confirmUseCase.execute(context, {
      domainBindingId,
      verificationAttemptId: "dva_0002",
    });

    expect(repeated.isOk()).toBe(true);
    expect(repeated._unsafeUnwrap()).toEqual({
      id: domainBindingId,
      verificationAttemptId: "dva_0002",
    });
    expect(eventsByType(eventBus.events, "domain-bound")).toHaveLength(1);
  });

  test("[ROUTE-TLS-CMD-008] missing binding returns not_found for domain-verification", async () => {
    const { confirmUseCase, context, eventBus } = await seedRoutingContext();

    const result = await confirmUseCase.execute(context, {
      domainBindingId: "dmb_missing",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("not_found");
    expect(result._unsafeUnwrapErr().details?.phase).toBe("domain-verification");
    expect(eventsByType(eventBus.events, "domain-bound")).toHaveLength(0);
  });

  test("[ROUTE-TLS-CMD-009] wrong attempt id returns domain_verification_not_pending", async () => {
    const { confirmUseCase, context, domainBindingId, eventBus } = await seedRoutingContext();

    const result = await confirmUseCase.execute(context, {
      domainBindingId,
      verificationAttemptId: "dva_other",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("domain_verification_not_pending");
    expect(result._unsafeUnwrapErr().details?.phase).toBe("domain-verification");
    expect(eventsByType(eventBus.events, "domain-bound")).toHaveLength(0);
  });

  test("[ROUTE-TLS-ENTRY-007] read model shows bound after ownership confirmation", async () => {
    const { confirmUseCase, context, domainBindingId, readModel } = await seedRoutingContext();

    const result = await confirmUseCase.execute(context, { domainBindingId });
    expect(result.isOk()).toBe(true);

    const queryService = new ListDomainBindingsQueryService(readModel);
    const listed = await queryService.execute(context, { resourceId: "res_demo" });

    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      id: domainBindingId,
      status: "bound",
      verificationAttemptCount: 1,
    });
  });

  test("[ROUTE-TLS-EVT-004][ROUTE-TLS-READMODEL-001] domain-bound with TLS disabled marks binding ready and publishes domain-ready", async () => {
    const {
      clock,
      confirmUseCase,
      context,
      domainBindingId,
      domainBindings,
      eventBus,
      logger,
      readModel,
      repositoryContext,
    } = await seedRoutingContext({
      domainName: "ready.example.com",
      tlsMode: "disabled",
    });

    const result = await confirmUseCase.execute(context, { domainBindingId });
    expect(result.isOk()).toBe(true);

    const domainBoundEvent = eventsByType(eventBus.events, "domain-bound")[0];
    expect(domainBoundEvent).toBeDefined();
    if (!domainBoundEvent) {
      throw new Error("domain-bound event was not captured");
    }

    const handler = new MarkDomainReadyOnDomainBoundHandler(
      domainBindings,
      clock,
      eventBus,
      logger,
    );
    const handled = await handler.handle(context, domainBoundEvent);

    expect(handled.isOk()).toBe(true);

    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(domainBindingId)),
    );
    expect(persisted?.toState().status.value).toBe("ready");

    const domainReadyEvents = eventsByType(eventBus.events, "domain-ready");
    expect(domainReadyEvents).toHaveLength(1);
    expect(domainReadyEvents[0]?.payload).toMatchObject({
      domainBindingId,
      domainName: "ready.example.com",
      pathPrefix: "/",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      tlsMode: "disabled",
      readyAt: "2026-01-01T00:00:00.000Z",
      correlationId: "req_domain_binding_confirm_test",
    });

    const queryService = new ListDomainBindingsQueryService(readModel);
    const listed = await queryService.execute(context, { resourceId: "res_demo" });
    expect(listed.items[0]).toMatchObject({
      id: domainBindingId,
      status: "ready",
      verificationAttemptCount: 1,
    });
  });

  test("[ROUTE-TLS-EVT-008] certificate-issued marks TLS-auto binding ready and publishes domain-ready", async () => {
    const {
      clock,
      confirmUseCase,
      context,
      domainBindingId,
      domainBindings,
      eventBus,
      logger,
      readModel,
      repositoryContext,
    } = await seedRoutingContext({
      domainName: "secure.example.com",
      tlsMode: "auto",
    });

    const result = await confirmUseCase.execute(context, { domainBindingId });
    expect(result.isOk()).toBe(true);

    const handler = new MarkDomainReadyOnCertificateIssuedHandler(
      domainBindings,
      clock,
      eventBus,
      logger,
    );
    const handled = await handler.handle(context, {
      type: "certificate-issued",
      aggregateId: "crt_demo",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: {
        certificateId: "crt_demo",
        domainBindingId,
        domainName: "secure.example.com",
        attemptId: "cat_demo",
        issuedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-04-01T00:00:00.000Z",
        providerKey: "acme",
        correlationId: "req_certificate_issued_test",
        causationId: "cat_demo",
      },
    });

    expect(handled.isOk()).toBe(true);

    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(domainBindingId)),
    );
    expect(persisted?.toState().status.value).toBe("ready");

    const domainReadyEvents = eventsByType(eventBus.events, "domain-ready");
    expect(domainReadyEvents).toHaveLength(1);
    expect(domainReadyEvents[0]?.payload).toMatchObject({
      domainBindingId,
      domainName: "secure.example.com",
      pathPrefix: "/",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      tlsMode: "auto",
      certificatePolicy: "auto",
      readyAt: "2026-01-01T00:00:00.000Z",
      correlationId: "req_domain_binding_confirm_test",
      causationId: "cat_demo",
    });

    const listed = await new ListDomainBindingsQueryService(readModel).execute(context, {
      resourceId: "res_demo",
    });
    expect(listed.items[0]).toMatchObject({
      id: domainBindingId,
      status: "ready",
      verificationAttemptCount: 1,
    });
  });

  test("[ROUTE-TLS-EVT-012][ROUTE-TLS-READMODEL-007] deployment route failure marks active binding not_ready", async () => {
    const {
      confirmUseCase,
      context,
      domainBindingId,
      domainBindings,
      eventBus,
      logger,
      readModel,
      repositoryContext,
    } = await seedRoutingContext({
      domainName: "route-failure.example.com",
      tlsMode: "auto",
    });

    const confirmed = await confirmUseCase.execute(context, { domainBindingId });
    expect(confirmed.isOk()).toBe(true);

    const handler = new MarkDomainRouteFailedOnDeploymentFinishedHandler(
      domainBindings,
      new StaticDomainRouteFailureCandidateReader([domainBindingId]),
      eventBus,
      logger,
    );
    const deploymentFinishedEvent: DomainEvent = {
      type: "deployment.finished",
      aggregateId: "dep_route_failed",
      occurredAt: "2026-01-01T00:05:00.000Z",
      payload: {
        status: "failed",
        exitCode: 1,
        retryable: true,
        errorCode: "proxy_reload_failed",
        failurePhase: "proxy-reload",
        errorMessage: "Proxy reload failed",
      },
    };

    const handled = await handler.handle(context, deploymentFinishedEvent);
    expect(handled.isOk()).toBe(true);

    const persisted = await domainBindings.findOne(
      repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(domainBindingId)),
    );
    expect(persisted?.toState().status.value).toBe("not_ready");
    expect(persisted?.toState().routeFailure).toMatchObject({
      retriable: true,
    });
    expect(persisted?.toState().routeFailure?.deploymentId.value).toBe("dep_route_failed");
    expect(persisted?.toState().routeFailure?.failurePhase.value).toBe("proxy-reload");
    expect(persisted?.toState().routeFailure?.errorCode.value).toBe("proxy_reload_failed");
    expect(persisted?.toState().routeFailure?.errorMessage?.value).toBe("Proxy reload failed");

    const routeFailureEvents = eventsByType(eventBus.events, "domain-route-realization-failed");
    expect(routeFailureEvents).toHaveLength(1);
    expect(routeFailureEvents[0]?.payload).toMatchObject({
      domainBindingId,
      domainName: "route-failure.example.com",
      pathPrefix: "/",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      deploymentId: "dep_route_failed",
      failedAt: "2026-01-01T00:05:00.000Z",
      errorCode: "proxy_reload_failed",
      failurePhase: "proxy-reload",
      retriable: true,
      errorMessage: "Proxy reload failed",
      correlationId: "req_domain_binding_confirm_test",
      causationId: "dep_route_failed",
    });

    const repeated = await handler.handle(context, deploymentFinishedEvent);
    expect(repeated.isOk()).toBe(true);
    expect(eventsByType(eventBus.events, "domain-route-realization-failed")).toHaveLength(1);

    const listed = await new ListDomainBindingsQueryService(readModel).execute(context, {
      resourceId: "res_demo",
    });
    expect(listed.items[0]).toMatchObject({
      id: domainBindingId,
      status: "not_ready",
      routeFailure: {
        deploymentId: "dep_route_failed",
        failedAt: "2026-01-01T00:05:00.000Z",
        errorCode: "proxy_reload_failed",
        failurePhase: "proxy-reload",
        retriable: true,
        errorMessage: "Proxy reload failed",
      },
    });
  });
});
