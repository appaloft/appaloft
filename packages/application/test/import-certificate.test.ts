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
  DomainBindingByIdSpec,
  DomainBindingId,
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
  type Result,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FakeCertificateMaterialValidator,
  FakeCertificateProvider,
  FakeCertificateSecretStore,
  FixedClock,
  MemoryCertificateReadModel,
  MemoryCertificateRepository,
  MemoryDestinationRepository,
  MemoryDomainBindingRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";
import {
  type CertificateMaterializer,
  type CertificateRouteActivator,
  ConfirmDomainBindingOwnershipUseCase,
  CreateDomainBindingUseCase,
  createExecutionContext,
  type DomainOwnershipVerificationResult,
  type DomainOwnershipVerifier,
  type ExecutionContext,
  ImportCertificateUseCase,
  ListCertificatesQueryService,
  MarkDomainReadyOnCertificateImportedHandler,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  ReconcileDomainCertificateUseCase,
  type RepositoryContext,
  RetryCertificateUseCase,
  RevokeCertificateUseCase,
  type TlsCertificateObserver,
  toRepositoryContext,
} from "../src";

function createTestContext() {
  return createExecutionContext({
    requestId: "req_certificate_import_test",
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

class StaticDomainOwnershipVerifier implements DomainOwnershipVerifier {
  async verifyDns(
    context: Parameters<DomainOwnershipVerifier["verifyDns"]>[0],
    input: Parameters<DomainOwnershipVerifier["verifyDns"]>[1],
  ): Promise<DomainOwnershipVerificationResult> {
    void context;
    void input;
    return {
      status: "matched",
      observedTargets: ["127.0.0.1"],
      message: "Observed expected target",
    };
  }
}

class FailingImportedSecretStore extends FakeCertificateSecretStore {
  async storeImported() {
    return err(
      domainError.certificateImportStorageFailed(
        "Certificate import storage failed",
        {
          phase: "certificate-import-storage",
        },
        true,
      ),
    );
  }
}

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

class SuccessfulCertificateMaterializer implements CertificateMaterializer {
  constructor(private readonly steps: string[]) {}

  async materialize(
    _context: Parameters<CertificateMaterializer["materialize"]>[0],
    input: Parameters<CertificateMaterializer["materialize"]>[1],
  ): ReturnType<CertificateMaterializer["materialize"]> {
    this.steps.push("materialize");
    return ok({
      certificateId: input.certificateId,
      certificateChain: "candidate-chain",
      privateKey: "candidate-key",
    });
  }
}

class SuccessfulCertificateRouteActivator implements CertificateRouteActivator {
  lastInput: Parameters<CertificateRouteActivator["activate"]>[1] | undefined;

  constructor(private readonly steps: string[]) {}

  async activate(
    _context: Parameters<CertificateRouteActivator["activate"]>[0],
    input: Parameters<CertificateRouteActivator["activate"]>[1],
  ): ReturnType<CertificateRouteActivator["activate"]> {
    this.steps.push("activate");
    this.lastInput = input;
    return ok({
      activationId: "activation_candidate",
      previousActivationId: "activation_previous",
    });
  }

  async rollback(
    _context: Parameters<CertificateRouteActivator["rollback"]>[0],
    _input: Parameters<CertificateRouteActivator["rollback"]>[1],
  ): ReturnType<CertificateRouteActivator["rollback"]> {
    this.steps.push("rollback");
    return ok(undefined);
  }

  async finalize(
    _context: Parameters<CertificateRouteActivator["finalize"]>[0],
    _input: Parameters<CertificateRouteActivator["finalize"]>[1],
  ): ReturnType<CertificateRouteActivator["finalize"]> {
    this.steps.push("finalize");
    return ok(undefined);
  }
}

class FailingCertificateRouteActivator implements CertificateRouteActivator {
  constructor(private readonly steps: string[]) {}

  async activate(): ReturnType<CertificateRouteActivator["activate"]> {
    this.steps.push("activate");
    return err(
      domainError.certificateRouteReconciliationFailed("Candidate route activation failed", {
        phase: "certificate-route-activation",
      }),
    );
  }

  async rollback(): ReturnType<CertificateRouteActivator["rollback"]> {
    this.steps.push("rollback");
    return ok(undefined);
  }

  async finalize(): ReturnType<CertificateRouteActivator["finalize"]> {
    this.steps.push("finalize");
    return ok(undefined);
  }
}

class MatchingTlsCertificateObserver implements TlsCertificateObserver {
  constructor(
    private readonly steps: string[],
    private readonly fingerprint = "sha256:manual-cert",
  ) {}

  async observe(
    _context: Parameters<TlsCertificateObserver["observe"]>[0],
    input: Parameters<TlsCertificateObserver["observe"]>[1],
  ): ReturnType<TlsCertificateObserver["observe"]> {
    this.steps.push(`observe:${input.serverName}`);
    return ok({
      fingerprint: this.fingerprint,
      subjectAlternativeNames: ["manual.example.test"],
      notBefore: "2025-12-01T00:00:00.000Z",
      expiresAt: "2026-06-01T00:00:00.000Z",
    });
  }
}

class MismatchingTlsCertificateObserver implements TlsCertificateObserver {
  constructor(private readonly steps: string[]) {}

  async observe(
    _context: Parameters<TlsCertificateObserver["observe"]>[0],
    input: Parameters<TlsCertificateObserver["observe"]>[1],
  ): ReturnType<TlsCertificateObserver["observe"]> {
    this.steps.push(`observe:${input.serverName}`);
    return ok({
      fingerprint: "sha256:unexpected-cert",
      subjectAlternativeNames: ["manual.example.test"],
      notBefore: "2025-12-01T00:00:00.000Z",
      expiresAt: "2026-06-01T00:00:00.000Z",
    });
  }
}

async function seedImportContext() {
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
    new StaticDomainOwnershipVerifier(),
    clock,
    eventBus,
    logger,
  );

  const created = await createDomainBindingUseCase.execute(context, {
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_demo",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    domainName: "manual.example.test",
    proxyKind: "traefik",
    tlsMode: "auto",
    certificatePolicy: "manual",
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
    idGenerator,
    logger,
    readModel: new MemoryCertificateReadModel(certificates),
    repositoryContext,
  };
}

function createValidationResult(
  overrides: Partial<{
    fingerprint: string;
    issuer: string;
    normalizedMaterialFingerprint: string;
  }> = {},
) {
  return {
    normalizedCertificateChain: "-----BEGIN CERTIFICATE-----\nmanual\n-----END CERTIFICATE-----",
    normalizedPrivateKey: "-----BEGIN PRIVATE KEY-----\nmanual\n-----END PRIVATE KEY-----",
    normalizedMaterialFingerprint:
      overrides.normalizedMaterialFingerprint ?? "sha256:manual-material",
    notBefore: "2025-12-01T00:00:00.000Z",
    expiresAt: "2026-06-01T00:00:00.000Z",
    subjectAlternativeNames: ["manual.example.test", "api.manual.example.test"],
    keyAlgorithm: "rsa",
    issuer: overrides.issuer ?? "CN=manual.example.test, O=Appaloft Test",
    fingerprint: overrides.fingerprint ?? "sha256:manual-cert",
  };
}

describe("ImportCertificateUseCase", () => {
  test("[CERT-IMPORT-CMD-001][CERT-IMPORT-CMD-014][CERT-IMPORT-READMODEL-001][PROC-DELIVERY-001] imports a valid manual certificate and publishes certificate-imported only", async () => {
    const seed = await seedImportContext();
    const validator = new FakeCertificateMaterialValidator(ok(createValidationResult()));
    const secretStore = new FakeCertificateSecretStore();
    const processAttemptRecorder = new RecordingProcessAttemptRecorder();
    const useCase = new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      validator,
      secretStore,
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
      processAttemptRecorder,
    );

    const result = await useCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      certificateId: "crt_0003",
      attemptId: "cat_0004",
    });
    expect(processAttemptRecorder.records).toEqual([
      expect.objectContaining({
        id: "cat_0004",
        kind: "certificate",
        status: "succeeded",
        operationKey: "certificates.import",
        dedupeKey: `certificate:${seed.domainBindingId}:cat_0004`,
        correlationId: "req_certificate_import_test",
        requestId: "req_certificate_import_test",
        phase: "certificate-import",
        step: "issued",
        projectId: "prj_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        domainBindingId: seed.domainBindingId,
        certificateId: "crt_0003",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:00.000Z",
        retriable: false,
        nextActions: ["no-action"],
        safeDetails: expect.objectContaining({
          providerKey: "manual-import",
          challengeType: "manual-import",
          reason: "issue",
          domainName: "manual.example.test",
          certificateSource: "imported",
          expiresAt: "2026-06-01T00:00:00.000Z",
        }),
      }),
    ]);
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("leaf-key");
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("BEGIN PRIVATE KEY");
    expect(secretStore.importedStored).toHaveLength(1);
    expect(eventsByType(seed.eventBus.events, "certificate-imported")).toHaveLength(1);
    expect(eventsByType(seed.eventBus.events, "certificate-issued")).toHaveLength(0);

    const persisted = await seed.certificates.findOne(
      seed.repositoryContext,
      CertificateByIdSpec.create(CertificateId.rehydrate("crt_0003")),
    );
    expect(persisted?.toState()).toMatchObject({
      source: expect.objectContaining({ value: "imported" }),
      status: expect.objectContaining({ value: "active" }),
    });

    const listed = await new ListCertificatesQueryService(seed.readModel).execute(seed.context, {
      domainBindingId: seed.domainBindingId,
    });
    expect(listed.items).toEqual([
      expect.objectContaining({
        id: "crt_0003",
        source: "imported",
        domainBindingId: seed.domainBindingId,
        domainName: "manual.example.test",
        status: "active",
        fingerprint: "sha256:manual-cert",
        notBefore: "2025-12-01T00:00:00.000Z",
        expiresAt: "2026-06-01T00:00:00.000Z",
        issuer: "CN=manual.example.test, O=Appaloft Test",
        keyAlgorithm: "rsa",
        subjectAlternativeNames: ["manual.example.test", "api.manual.example.test"],
        latestAttempt: expect.objectContaining({
          id: "cat_0004",
          status: "issued",
          reason: "issue",
        }),
      }),
    ]);
  });

  test("[CERT-IMPORT-CMD-011] returns the same certificate and attempt for a matching idempotency key", async () => {
    const seed = await seedImportContext();
    const validator = new FakeCertificateMaterialValidator(ok(createValidationResult()));
    const useCase = new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      validator,
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    );

    const first = await useCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
      idempotencyKey: "certificates.import:test",
    });
    const repeated = await useCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
      idempotencyKey: "certificates.import:test",
    });

    expect(first.isOk()).toBe(true);
    expect(repeated.isOk()).toBe(true);
    expect(repeated._unsafeUnwrap()).toEqual(first._unsafeUnwrap());
    expect(eventsByType(seed.eventBus.events, "certificate-imported")).toHaveLength(1);
  });

  test("[CERT-IMPORT-AUTHZ-001] import can be denied before validator, secret storage, and persistence", async () => {
    const seed = await seedImportContext();
    const validator = new FakeCertificateMaterialValidator(ok(createValidationResult()));
    const secretStore = new FakeCertificateSecretStore();
    const guard = new DenyingOperationGuardPort();
    const useCase = new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      validator,
      secretStore,
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
      undefined,
      guard,
    );

    const result = await useCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
      passphrase: "leaf-passphrase",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "certificates.import",
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toEqual([
      expect.objectContaining({
        operationKey: "certificates.import",
        resourceRefs: {
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          serverId: "srv_demo",
          domainBindingId: seed.domainBindingId,
        },
        contextAttributes: expect.objectContaining({
          estimatedFieldCount: 3,
          estimatedInputBytes: expect.any(Number),
          estimatedItemCount: 1,
          estimatedNestingDepth: 1,
          estimatedSecretCount: 3,
          estimatedWriteUnits: 3,
        }),
      }),
    ]);
    expect(validator.inputs).toHaveLength(0);
    expect(secretStore.importedStored).toHaveLength(0);
    expect(seed.certificates.items).toHaveLength(0);
    expect(eventsByType(seed.eventBus.events, "certificate-imported")).toHaveLength(0);
  });

  test("[CERT-IMPORT-CMD-012] rejects conflicting idempotency reuse for different material", async () => {
    const seed = await seedImportContext();
    const validator = new FakeCertificateMaterialValidator(ok(createValidationResult()));
    const useCase = new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      validator,
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    );

    const first = await useCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
      idempotencyKey: "certificates.import:test",
    });
    expect(first.isOk()).toBe(true);

    validator.setResult(
      ok(createValidationResult({ normalizedMaterialFingerprint: "sha256:other" })),
    );
    const repeated = await useCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain-2",
      privateKey: "leaf-key-2",
      idempotencyKey: "certificates.import:test",
    });

    expect(repeated.isErr()).toBe(true);
    expect(repeated._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: expect.objectContaining({
        phase: "certificate-admission",
      }),
    });
  });

  test("[CERT-IMPORT-CMD-013] returns certificate_import_storage_failed when imported secret storage fails", async () => {
    const seed = await seedImportContext();
    const useCase = new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new FakeCertificateMaterialValidator(ok(createValidationResult())),
      new FailingImportedSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    );

    const result = await useCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "certificate_import_storage_failed",
      retryable: true,
      details: expect.objectContaining({
        phase: "certificate-import-storage",
      }),
    });
    expect(eventsByType(seed.eventBus.events, "certificate-imported")).toHaveLength(0);
  });

  test("[ROUTE-TLS-EVT-009] certificate-imported keeps a manual binding bound until reconciliation proof", async () => {
    const seed = await seedImportContext();
    const handler = new MarkDomainReadyOnCertificateImportedHandler(
      seed.domainBindings,
      seed.logger,
    );

    const handled = await handler.handle(seed.context, {
      type: "certificate-imported",
      aggregateId: "crt_demo",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: {
        certificateId: "crt_demo",
        domainBindingId: seed.domainBindingId,
        domainName: "manual.example.test",
        attemptId: "cat_demo",
        importedAt: "2026-01-01T00:00:00.000Z",
        source: "imported",
        notBefore: "2025-12-01T00:00:00.000Z",
        expiresAt: "2026-06-01T00:00:00.000Z",
        subjectAlternativeNames: ["manual.example.test"],
        keyAlgorithm: "rsa",
        correlationId: "req_certificate_import_test",
        causationId: "cat_demo",
      },
    });

    expect(handled.isOk()).toBe(true);
    const domainReadyEvents = eventsByType(seed.eventBus.events, "domain-ready");
    expect(domainReadyEvents).toHaveLength(0);

    const persisted = await seed.domainBindings.findOne(
      toRepositoryContext(seed.context),
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(seed.domainBindingId)),
    );
    expect(persisted?.toState().status.value).toBe("bound");
  });

  test("[ROUTE-TLS-EVT-017][EDGE-PROXY-RELOAD-004A] imported certificate becomes ready only after activation and SNI proof", async () => {
    const seed = await seedImportContext();
    const imported = await new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new FakeCertificateMaterialValidator(ok(createValidationResult())),
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });
    expect(imported.isOk()).toBe(true);

    const event = eventsByType(seed.eventBus.events, "certificate-imported")[0];
    expect(event).toBeDefined();
    if (!event) throw new Error("certificate-imported event was not captured");

    const steps: string[] = [];
    const activator = new SuccessfulCertificateRouteActivator(steps);
    const useCase = new ReconcileDomainCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new SuccessfulCertificateMaterializer(steps),
      activator,
      new MatchingTlsCertificateObserver(steps),
      seed.clock,
      seed.eventBus,
      seed.logger,
    );
    const reconciled = await useCase.execute(seed.context, event);

    expect(reconciled.isOk()).toBe(true);
    expect(steps).toEqual(["materialize", "activate", "observe:manual.example.test", "finalize"]);
    expect(activator.lastInput).toMatchObject({
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainBindingId: seed.domainBindingId,
      certificateSource: "imported",
      domainName: "manual.example.test",
      pathPrefix: "/",
      proxyKind: "traefik",
    });
    expect(eventsByType(seed.eventBus.events, "domain-ready")).toHaveLength(1);
    const persisted = await seed.domainBindings.findOne(
      seed.repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(seed.domainBindingId)),
    );
    expect(persisted?.toState().status.value).toBe("ready");
  });

  test("[ROUTE-TLS-EVT-019][EDGE-PROXY-RELOAD-004C] fingerprint mismatch rolls back and does not publish domain-ready", async () => {
    const seed = await seedImportContext();
    await new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new FakeCertificateMaterialValidator(ok(createValidationResult())),
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });
    const event = eventsByType(seed.eventBus.events, "certificate-imported")[0];
    if (!event) throw new Error("certificate-imported event was not captured");

    const steps: string[] = [];
    const reconciled = await new ReconcileDomainCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new SuccessfulCertificateMaterializer(steps),
      new SuccessfulCertificateRouteActivator(steps),
      new MismatchingTlsCertificateObserver(steps),
      seed.clock,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, event);

    expect(reconciled.isErr()).toBe(true);
    expect(reconciled._unsafeUnwrapErr()).toMatchObject({
      code: "certificate_route_reconciliation_failed",
      retryable: true,
      details: expect.objectContaining({ phase: "tls-certificate-proof" }),
    });
    expect(steps).toEqual(["materialize", "activate", "observe:manual.example.test", "rollback"]);
    expect(eventsByType(seed.eventBus.events, "domain-ready")).toHaveLength(0);
  });

  test("[ROUTE-TLS-EVT-018][EDGE-PROXY-RELOAD-004C] activation failure preserves the current route and readiness", async () => {
    const seed = await seedImportContext();
    await new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new FakeCertificateMaterialValidator(ok(createValidationResult())),
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });
    const event = eventsByType(seed.eventBus.events, "certificate-imported")[0];
    if (!event) throw new Error("certificate-imported event was not captured");

    const steps: string[] = [];
    const reconciled = await new ReconcileDomainCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new SuccessfulCertificateMaterializer(steps),
      new FailingCertificateRouteActivator(steps),
      new MatchingTlsCertificateObserver(steps),
      seed.clock,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, event);

    expect(reconciled.isErr()).toBe(true);
    expect(steps).toEqual(["materialize", "activate"]);
    expect(eventsByType(seed.eventBus.events, "domain-ready")).toHaveLength(0);
    const persisted = await seed.domainBindings.findOne(
      seed.repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(seed.domainBindingId)),
    );
    expect(persisted?.toState().status.value).toBe("bound");
  });

  test("[ROUTE-TLS-EVT-020] repeated proven certificate reconciliation is idempotent", async () => {
    const seed = await seedImportContext();
    await new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new FakeCertificateMaterialValidator(ok(createValidationResult())),
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });
    const event = eventsByType(seed.eventBus.events, "certificate-imported")[0];
    if (!event) throw new Error("certificate-imported event was not captured");

    const steps: string[] = [];
    const useCase = new ReconcileDomainCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new SuccessfulCertificateMaterializer(steps),
      new SuccessfulCertificateRouteActivator(steps),
      new MatchingTlsCertificateObserver(steps),
      seed.clock,
      seed.eventBus,
      seed.logger,
    );
    expect((await useCase.execute(seed.context, event)).isOk()).toBe(true);
    expect((await useCase.execute(seed.context, event)).isOk()).toBe(true);

    expect(steps).toEqual(["materialize", "activate", "observe:manual.example.test", "finalize"]);
    expect(eventsByType(seed.eventBus.events, "domain-ready")).toHaveLength(1);
  });

  test("[ROUTE-TLS-EVT-021] a new certificate replaces the proven certificate on a ready binding", async () => {
    const seed = await seedImportContext();
    const validator = new FakeCertificateMaterialValidator(ok(createValidationResult()));
    const importUseCase = new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      validator,
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    );
    await importUseCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "first-chain",
      privateKey: "first-key",
    });
    const firstEvent = eventsByType(seed.eventBus.events, "certificate-imported")[0];
    if (!firstEvent) throw new Error("first certificate-imported event was not captured");

    const firstSteps: string[] = [];
    expect(
      (
        await new ReconcileDomainCertificateUseCase(
          seed.domainBindings,
          seed.certificates,
          new SuccessfulCertificateMaterializer(firstSteps),
          new SuccessfulCertificateRouteActivator(firstSteps),
          new MatchingTlsCertificateObserver(firstSteps),
          seed.clock,
          seed.eventBus,
          seed.logger,
        ).execute(seed.context, firstEvent)
      ).isOk(),
    ).toBe(true);

    validator.setResult(
      ok(
        createValidationResult({
          fingerprint: "sha256:replacement-cert",
          normalizedMaterialFingerprint: "sha256:replacement-material",
        }),
      ),
    );
    await importUseCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "replacement-chain",
      privateKey: "replacement-key",
    });
    const replacementEvent = eventsByType(seed.eventBus.events, "certificate-imported")[1];
    if (!replacementEvent)
      throw new Error("replacement certificate-imported event was not captured");

    const replacementSteps: string[] = [];
    expect(
      (
        await new ReconcileDomainCertificateUseCase(
          seed.domainBindings,
          seed.certificates,
          new SuccessfulCertificateMaterializer(replacementSteps),
          new SuccessfulCertificateRouteActivator(replacementSteps),
          new MatchingTlsCertificateObserver(replacementSteps, "sha256:replacement-cert"),
          seed.clock,
          seed.eventBus,
          seed.logger,
        ).execute(seed.context, replacementEvent)
      ).isOk(),
    ).toBe(true);
    expect(replacementSteps).toEqual([
      "materialize",
      "activate",
      "observe:manual.example.test",
      "finalize",
    ]);

    const persisted = await seed.domainBindings.findOne(
      seed.repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(seed.domainBindingId)),
    );
    expect(persisted?.toState().activeCertificateId?.value).toBe(replacementEvent.aggregateId);
    expect(persisted?.toState().activeCertificateFingerprint?.value).toBe(
      "sha256:replacement-cert",
    );
  });

  test("[ROUTE-TLS-CMD-025][CERT-IMPORT-CMD-014] rejects retry for imported certificates", async () => {
    const seed = await seedImportContext();
    const importUseCase = new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new FakeCertificateMaterialValidator(ok(createValidationResult())),
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    );
    const imported = await importUseCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });
    expect(imported.isOk()).toBe(true);

    const retryUseCase = new RetryCertificateUseCase(seed.certificates, {
      execute: async () => {
        throw new Error("imported certificate retry must not delegate to issue use case");
      },
    } as unknown as ConstructorParameters<typeof RetryCertificateUseCase>[1]);
    const retried = await retryUseCase.execute(seed.context, {
      certificateId: imported._unsafeUnwrap().certificateId,
    });

    expect(retried.isErr()).toBe(true);
    expect(retried._unsafeUnwrapErr().code).toBe("certificate_retry_not_allowed");
  });

  test("[ROUTE-TLS-CMD-027][ROUTE-TLS-CMD-028] revokes imported certificates locally without provider calls", async () => {
    const seed = await seedImportContext();
    const secretStore = new FakeCertificateSecretStore();
    const importUseCase = new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new FakeCertificateMaterialValidator(ok(createValidationResult())),
      secretStore,
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    );
    const imported = await importUseCase.execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });
    expect(imported.isOk()).toBe(true);

    const provider = new FakeCertificateProvider(
      err(
        domainError.certificateProviderUnavailable("Provider should not be called", {
          phase: "provider-request",
        }),
      ),
    );
    const revokeUseCase = new RevokeCertificateUseCase(
      seed.certificates,
      provider,
      secretStore,
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
    );
    const revoked = await revokeUseCase.execute(seed.context, {
      certificateId: imported._unsafeUnwrap().certificateId,
    });

    expect(revoked.isOk()).toBe(true);
    expect(provider.revokeInputs).toHaveLength(0);
    expect(secretStore.deactivated).toEqual([
      expect.objectContaining({
        certificateId: "crt_0003",
        reason: "revoked",
      }),
    ]);
    const persisted = await seed.certificates.findOne(
      seed.repositoryContext,
      CertificateByIdSpec.create(CertificateId.rehydrate("crt_0003")),
    );
    expect(persisted?.toState().source.value).toBe("imported");
    expect(persisted?.toState().status.value).toBe("revoked");
  });
});
