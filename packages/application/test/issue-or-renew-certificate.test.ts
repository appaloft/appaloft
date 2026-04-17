import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CertificateByIdSpec,
  CertificateId,
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  type DomainEvent,
  domainError,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  err,
  HostAddress,
  ok,
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
  FakeCertificateProvider,
  FakeCertificateSecretStore,
  FixedClock,
  MemoryCertificateReadModel,
  MemoryCertificateRepository,
  MemoryCertificateRetryCandidateReader,
  MemoryDestinationRepository,
  MemoryDomainBindingRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";
import { createExecutionContext, type ExecutionContext, toRepositoryContext } from "../src";
import {
  CertificateRetryScheduler,
  ConfirmDomainBindingOwnershipUseCase,
  CreateDomainBindingUseCase,
  IssueCertificateOnCertificateRequestedHandler,
  IssueOrRenewCertificateUseCase,
  ListCertificatesQueryService,
} from "../src/use-cases";

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_certificate_issue_test",
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

class StaticCertificateRetryCandidateReader {
  constructor(
    private readonly candidates: Awaited<
      ReturnType<MemoryCertificateRetryCandidateReader["listDueRetries"]>
    >,
  ) {}

  async listDueRetries() {
    return this.candidates;
  }
}

async function seedCertificateContext(input?: { tlsMode?: "auto" | "disabled" }) {
  const context = createTestContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const resources = new MemoryResourceRepository();
  const servers = new MemoryServerRepository();
  const destinations = new MemoryDestinationRepository();
  const domainBindings = new MemoryDomainBindingRepository();
  const certificates = new MemoryCertificateRepository();
  const certificateProviderSelectionPolicy = {
    async select() {
      return ok({
        providerKey: "acme",
        challengeType: "http-01",
      });
    },
  };
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

  const createDomainBindingUseCase = new CreateDomainBindingUseCase(
    projects,
    environments,
    resources,
    servers,
    destinations,
    domainBindings,
    clock,
    idGenerator,
    eventBus,
    logger,
  );
  const confirmDomainBindingUseCase = new ConfirmDomainBindingOwnershipUseCase(
    domainBindings,
    clock,
    eventBus,
    logger,
  );
  const issueUseCase = new IssueOrRenewCertificateUseCase(
    domainBindings,
    certificates,
    certificateProviderSelectionPolicy,
    clock,
    idGenerator,
    eventBus,
    logger,
  );

  const created = await createDomainBindingUseCase.execute(context, {
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_demo",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    domainName: "secure.example.com",
    proxyKind: "traefik",
    tlsMode: input?.tlsMode ?? "auto",
  });
  expect(created.isOk()).toBe(true);
  const domainBindingId = created._unsafeUnwrap().id;

  const confirmed = await confirmDomainBindingUseCase.execute(context, {
    domainBindingId,
  });
  expect(confirmed.isOk()).toBe(true);

  return {
    certificates,
    context,
    domainBindings,
    domainBindingId,
    eventBus,
    clock,
    issueUseCase,
    logger,
    readModel: new MemoryCertificateReadModel(certificates),
    repositoryContext,
  };
}

async function recordRetryableProviderFailure(
  seed: Awaited<ReturnType<typeof seedCertificateContext>>,
) {
  const requested = await seed.issueUseCase.execute(seed.context, {
    domainBindingId: seed.domainBindingId,
    reason: "issue",
  });
  expect(requested.isOk()).toBe(true);
  const requestedEvent = eventsByType(seed.eventBus.events, "certificate-requested")[0];
  if (!requestedEvent) {
    throw new Error("certificate-requested event was not published");
  }

  const provider = new FakeCertificateProvider(
    err(
      domainError.certificateProviderUnavailable(
        "Certificate provider is unavailable",
        {
          phase: "provider-request",
          providerKey: "acme",
        },
        true,
      ),
    ),
  );
  const handler = new IssueCertificateOnCertificateRequestedHandler(
    seed.certificates,
    provider,
    new FakeCertificateSecretStore(),
    seed.clock,
    seed.eventBus,
    seed.logger,
  );
  const handled = await handler.handle(seed.context, requestedEvent);
  expect(handled.isOk()).toBe(true);

  return requested._unsafeUnwrap();
}

describe("IssueOrRenewCertificateUseCase", () => {
  test("[ROUTE-TLS-CMD-011][ROUTE-TLS-CMD-012] requests issuance with the injected default provider", async () => {
    const { certificates, context, domainBindingId, eventBus, issueUseCase, repositoryContext } =
      await seedCertificateContext();

    const result = await issueUseCase.execute(context, {
      domainBindingId,
      reason: "issue",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      certificateId: "crt_0003",
      attemptId: "cat_0004",
    });

    const persisted = await certificates.findOne(
      repositoryContext,
      CertificateByIdSpec.create(CertificateId.rehydrate("crt_0003")),
    );
    const persistedState = persisted?.toState();
    expect(persistedState?.status.value).toBe("pending");
    expect(persistedState?.providerKey.value).toBe("acme");
    expect(persistedState?.challengeType.value).toBe("http-01");
    expect(persistedState?.attempts[0]?.status.value).toBe("requested");
    expect(persistedState?.attempts[0]?.reason.value).toBe("issue");

    const certificateRequestedEvents = eventsByType(eventBus.events, "certificate-requested");
    expect(certificateRequestedEvents).toHaveLength(1);
    expect(certificateRequestedEvents[0]?.payload).toMatchObject({
      certificateId: "crt_0003",
      domainBindingId,
      domainName: "secure.example.com",
      attemptId: "cat_0004",
      reason: "issue",
      providerKey: "acme",
      challengeType: "http-01",
      requestedAt: "2026-01-01T00:00:00.000Z",
      correlationId: "req_certificate_issue_test",
    });
  });

  test("[ROUTE-TLS-READMODEL-004] lists the accepted certificate request", async () => {
    const { context, domainBindingId, issueUseCase, readModel } = await seedCertificateContext();

    const result = await issueUseCase.execute(context, {
      domainBindingId,
      reason: "issue",
    });
    expect(result.isOk()).toBe(true);

    const queryService = new ListCertificatesQueryService(readModel);
    const listed = await queryService.execute(context, { domainBindingId });

    expect(listed.items).toEqual([
      expect.objectContaining({
        id: "crt_0003",
        domainBindingId,
        domainName: "secure.example.com",
        status: "pending",
        providerKey: "acme",
        challengeType: "http-01",
        latestAttempt: expect.objectContaining({
          id: "cat_0004",
          status: "requested",
          reason: "issue",
        }),
      }),
    ]);
  });

  test("[ROUTE-TLS-CMD-013] rejects certificate issuance for a missing domain binding", async () => {
    const { context, eventBus, issueUseCase } = await seedCertificateContext();

    const result = await issueUseCase.execute(context, {
      domainBindingId: "dmb_missing",
      reason: "issue",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("not_found");
    expect(result._unsafeUnwrapErr().details?.phase).toBe("certificate-context-resolution");
    expect(eventsByType(eventBus.events, "certificate-requested")).toHaveLength(0);
  });

  test("[ROUTE-TLS-CMD-014] rejects certificate issuance when TLS is disabled", async () => {
    const { context, domainBindingId, eventBus, issueUseCase } = await seedCertificateContext({
      tlsMode: "disabled",
    });

    const result = await issueUseCase.execute(context, {
      domainBindingId,
      reason: "issue",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("certificate_not_allowed");
    expect(result._unsafeUnwrapErr().details?.phase).toBe("certificate-admission");
    expect(eventsByType(eventBus.events, "certificate-requested")).toHaveLength(0);
  });

  test("[ROUTE-TLS-CMD-015] returns the same attempt for a matching idempotency key", async () => {
    const { context, domainBindingId, eventBus, issueUseCase } = await seedCertificateContext();

    const first = await issueUseCase.execute(context, {
      domainBindingId,
      reason: "issue",
      idempotencyKey: "certificates.issue:test",
    });
    const repeated = await issueUseCase.execute(context, {
      domainBindingId,
      reason: "issue",
      idempotencyKey: "certificates.issue:test",
    });

    expect(first.isOk()).toBe(true);
    expect(repeated.isOk()).toBe(true);
    expect(repeated._unsafeUnwrap()).toEqual(first._unsafeUnwrap());
    expect(eventsByType(eventBus.events, "certificate-requested")).toHaveLength(1);
  });

  test("[ROUTE-TLS-EVT-005][ROUTE-TLS-READMODEL-005] handles certificate-requested success as an issued certificate", async () => {
    const {
      certificates,
      clock,
      context,
      domainBindingId,
      eventBus,
      issueUseCase,
      logger,
      readModel,
    } = await seedCertificateContext();
    const issuedAt = "2026-01-01T00:01:00.000Z";
    const expiresAt = "2026-04-01T00:01:00.000Z";

    const requested = await issueUseCase.execute(context, {
      domainBindingId,
      reason: "issue",
    });
    expect(requested.isOk()).toBe(true);
    const requestedEvent = eventsByType(eventBus.events, "certificate-requested")[0];
    if (!requestedEvent) {
      throw new Error("certificate-requested event was not published");
    }

    const provider = new FakeCertificateProvider(
      ok({
        certificateId: "crt_0003",
        attemptId: "cat_0004",
        domainBindingId,
        domainName: "secure.example.com",
        providerKey: "acme",
        issuedAt,
        expiresAt,
        fingerprint: "sha256:demo",
        certificatePem: "-----BEGIN CERTIFICATE-----\ndemo\n-----END CERTIFICATE-----",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----\ndemo\n-----END PRIVATE KEY-----",
      }),
    );
    const secretStore = new FakeCertificateSecretStore();
    const handler = new IssueCertificateOnCertificateRequestedHandler(
      certificates,
      provider,
      secretStore,
      clock,
      eventBus,
      logger,
    );

    const handled = await handler.handle(context, requestedEvent);

    expect(handled.isOk()).toBe(true);
    expect(provider.inputs).toHaveLength(1);
    expect(secretStore.stored).toHaveLength(1);
    const issuedEvents = eventsByType(eventBus.events, "certificate-issued");
    expect(issuedEvents).toHaveLength(1);
    expect(issuedEvents[0]?.payload).toMatchObject({
      certificateId: "crt_0003",
      domainBindingId,
      domainName: "secure.example.com",
      attemptId: "cat_0004",
      issuedAt,
      expiresAt,
      providerKey: "acme",
      fingerprint: "sha256:demo",
      correlationId: "req_certificate_issue_test",
    });

    const listed = await new ListCertificatesQueryService(readModel).execute(context, {
      domainBindingId,
    });
    expect(listed.items).toEqual([
      expect.objectContaining({
        id: "crt_0003",
        status: "active",
        expiresAt,
        fingerprint: "sha256:demo",
        latestAttempt: expect.objectContaining({
          id: "cat_0004",
          status: "issued",
          issuedAt,
          expiresAt,
        }),
      }),
    ]);
  });

  test("[ROUTE-TLS-EVT-006][ROUTE-TLS-READMODEL-005] records retryable provider failure from certificate-requested", async () => {
    const {
      certificates,
      clock,
      context,
      domainBindingId,
      eventBus,
      issueUseCase,
      logger,
      readModel,
    } = await seedCertificateContext();

    const requested = await issueUseCase.execute(context, {
      domainBindingId,
      reason: "issue",
    });
    expect(requested.isOk()).toBe(true);
    const requestedEvent = eventsByType(eventBus.events, "certificate-requested")[0];
    if (!requestedEvent) {
      throw new Error("certificate-requested event was not published");
    }

    const provider = new FakeCertificateProvider(
      err(
        domainError.certificateProviderUnavailable(
          "Certificate provider is unavailable",
          {
            phase: "provider-request",
            providerKey: "acme",
          },
          true,
        ),
      ),
    );
    const handler = new IssueCertificateOnCertificateRequestedHandler(
      certificates,
      provider,
      new FakeCertificateSecretStore(),
      clock,
      eventBus,
      logger,
    );

    const handled = await handler.handle(context, requestedEvent);

    expect(handled.isOk()).toBe(true);
    const failedEvents = eventsByType(eventBus.events, "certificate-issuance-failed");
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]?.payload).toMatchObject({
      certificateId: "crt_0003",
      domainBindingId,
      domainName: "secure.example.com",
      attemptId: "cat_0004",
      failedAt: "2026-01-01T00:00:00.000Z",
      errorCode: "certificate_provider_unavailable",
      failurePhase: "provider-request",
      retriable: true,
      providerKey: "acme",
      correlationId: "req_certificate_issue_test",
    });

    const listed = await new ListCertificatesQueryService(readModel).execute(context, {
      domainBindingId,
    });
    expect(listed.items).toEqual([
      expect.objectContaining({
        id: "crt_0003",
        status: "failed",
        latestAttempt: expect.objectContaining({
          id: "cat_0004",
          status: "retry_scheduled",
          failedAt: "2026-01-01T00:00:00.000Z",
          errorCode: "certificate_provider_unavailable",
          failurePhase: "provider-request",
          retriable: true,
        }),
      }),
    ]);
  });

  test("[ROUTE-TLS-SCHED-001] dispatches a due retry-scheduled attempt", async () => {
    const seed = await seedCertificateContext();
    const failedAttempt = await recordRetryableProviderFailure(seed);
    seed.clock.set("2026-01-01T00:05:00.000Z");

    const scheduler = new CertificateRetryScheduler(
      new MemoryCertificateRetryCandidateReader(seed.certificates),
      seed.issueUseCase,
      seed.clock,
      seed.logger,
    );
    const result = await scheduler.run(seed.context, {
      defaultRetryDelaySeconds: 300,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      scanned: 1,
      dispatched: [
        {
          certificateId: failedAttempt.certificateId,
          domainBindingId: seed.domainBindingId,
          previousAttemptId: failedAttempt.attemptId,
          nextAttemptId: "cat_0005",
        },
      ],
      failed: [],
    });

    const requestedEvents = eventsByType(seed.eventBus.events, "certificate-requested");
    expect(requestedEvents).toHaveLength(2);
    expect(requestedEvents[1]?.payload).toMatchObject({
      certificateId: failedAttempt.certificateId,
      domainBindingId: seed.domainBindingId,
      domainName: "secure.example.com",
      attemptId: "cat_0005",
      reason: "issue",
      providerKey: "acme",
      challengeType: "http-01",
      requestedAt: "2026-01-01T00:05:00.000Z",
      correlationId: "req_certificate_issue_test",
      causationId: failedAttempt.attemptId,
    });

    const persisted = await seed.certificates.findOne(
      seed.repositoryContext,
      CertificateByIdSpec.create(CertificateId.rehydrate(failedAttempt.certificateId)),
    );
    const attempts = persisted?.toState().attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts?.[1]?.status.value).toBe("requested");
  });

  test("[ROUTE-TLS-SCHED-002] skips a retry-scheduled attempt before the default delay elapses", async () => {
    const seed = await seedCertificateContext();
    await recordRetryableProviderFailure(seed);

    const scheduler = new CertificateRetryScheduler(
      new MemoryCertificateRetryCandidateReader(seed.certificates),
      seed.issueUseCase,
      seed.clock,
      seed.logger,
    );
    const result = await scheduler.run(seed.context, {
      defaultRetryDelaySeconds: 300,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      scanned: 0,
      dispatched: [],
      failed: [],
    });
    expect(eventsByType(seed.eventBus.events, "certificate-requested")).toHaveLength(1);
  });

  test("[ROUTE-TLS-SCHED-003] skips a historical retry failure when a newer attempt is in flight", async () => {
    const seed = await seedCertificateContext();
    const failedAttempt = await recordRetryableProviderFailure(seed);
    seed.clock.set("2026-01-01T00:05:00.000Z");

    const manualRetry = await seed.issueUseCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateId: failedAttempt.certificateId,
      reason: "issue",
      providerKey: "acme",
      challengeType: "http-01",
      idempotencyKey: "manual-retry",
    });
    expect(manualRetry.isOk()).toBe(true);

    const scheduler = new CertificateRetryScheduler(
      new MemoryCertificateRetryCandidateReader(seed.certificates),
      seed.issueUseCase,
      seed.clock,
      seed.logger,
    );
    const result = await scheduler.run(seed.context, {
      defaultRetryDelaySeconds: 300,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      scanned: 0,
      dispatched: [],
      failed: [],
    });
    expect(eventsByType(seed.eventBus.events, "certificate-requested")).toHaveLength(2);
  });

  test("[ROUTE-TLS-SCHED-004] uses a stable idempotency key for repeated scheduler ticks", async () => {
    const seed = await seedCertificateContext();
    await recordRetryableProviderFailure(seed);
    seed.clock.set("2026-01-01T00:05:00.000Z");
    const dueCandidates = await new MemoryCertificateRetryCandidateReader(
      seed.certificates,
    ).listDueRetries(seed.repositoryContext, {
      now: seed.clock.now(),
      defaultRetryDelaySeconds: 300,
      limit: 25,
    });
    const scheduler = new CertificateRetryScheduler(
      new StaticCertificateRetryCandidateReader(dueCandidates),
      seed.issueUseCase,
      seed.clock,
      seed.logger,
    );

    const first = await scheduler.run(seed.context, {
      defaultRetryDelaySeconds: 300,
    });
    const repeated = await scheduler.run(seed.context, {
      defaultRetryDelaySeconds: 300,
    });

    expect(first.isOk()).toBe(true);
    expect(repeated.isOk()).toBe(true);
    expect(first._unsafeUnwrap().dispatched[0]?.nextAttemptId).toBe("cat_0005");
    expect(repeated._unsafeUnwrap().dispatched[0]?.nextAttemptId).toBe("cat_0005");
    expect(eventsByType(seed.eventBus.events, "certificate-requested")).toHaveLength(2);
    const persisted = await seed.certificates.findOne(
      seed.repositoryContext,
      CertificateByIdSpec.create(CertificateId.rehydrate("crt_0003")),
    );
    expect(persisted?.toState().attempts).toHaveLength(2);
  });
});
