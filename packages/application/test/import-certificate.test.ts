import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  Certificate,
  CertificateAttemptId,
  CertificateByDomainBindingIdSpec,
  CertificateByIdSpec,
  CertificateChallengeTypeValue,
  CertificateExpiresAtValue,
  CertificateFingerprintValue,
  CertificateId,
  CertificateIssuedAtValue,
  CertificateIssueReasonValue,
  CertificateSecretRefValue,
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
  PublicDomainName,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  type Result,
  UpsertCertificateSpec,
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
  PassThroughMutationCoordinator,
  SequenceIdGenerator,
} from "@appaloft/testkit";
import {
  type CertificateMaterializer,
  type CertificateRouteActivator,
  ConfigureDomainBindingCertificatePolicyUseCase,
  ConfirmDomainBindingOwnershipUseCase,
  CreateDomainBindingUseCase,
  createExecutionContext,
  type DomainOwnershipVerificationResult,
  type DomainOwnershipVerifier,
  type ExecutionContext,
  ImportCertificateUseCase,
  ListCertificatesQueryService,
  type MutationCoordinator,
  type MutationCoordinatorRunExclusiveInput,
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

  constructor(protected readonly steps: string[]) {}

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

class FlakyFinalizeCertificateRouteActivator extends SuccessfulCertificateRouteActivator {
  private finalizeAttempts = 0;

  override async finalize(
    _context: Parameters<CertificateRouteActivator["finalize"]>[0],
    _input: Parameters<CertificateRouteActivator["finalize"]>[1],
  ): ReturnType<CertificateRouteActivator["finalize"]> {
    this.finalizeAttempts += 1;
    this.steps.push("finalize");
    return this.finalizeAttempts === 1
      ? err(
          domainError.certificateRouteReconciliationFailed(
            "Previous certificate material could not be retired",
            { phase: "certificate-route-finalization" },
          ),
        )
      : ok(undefined);
  }
}

class CapturingMutationCoordinator implements MutationCoordinator {
  readonly calls: MutationCoordinatorRunExclusiveInput<unknown>[] = [];

  async runExclusive<T>(input: MutationCoordinatorRunExclusiveInput<T>): Promise<Result<T>> {
    this.calls.push(input as MutationCoordinatorRunExclusiveInput<unknown>);
    return input.work();
  }
}

class LeaseLosingMutationCoordinator implements MutationCoordinator {
  async runExclusive<T>(input: MutationCoordinatorRunExclusiveInput<T>): Promise<Result<T>> {
    let assertions = 0;
    return input.work({
      assertOwned: async () => {
        assertions += 1;
        return assertions === 1
          ? ok(undefined)
          : err(
              domainError.conflict("Certificate mutation lease was replaced", {
                phase: "operation-coordination",
                causeCode: "coordination_lease_lost",
              }),
            );
      },
    });
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

  test("[CERT-RECON-CONC-002] lease loss after validation prevents certificate writes and events", async () => {
    const seed = await seedImportContext();
    const eventsBefore = seed.eventBus.events.length;
    const result = await new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new FakeCertificateMaterialValidator(ok(createValidationResult())),
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
      undefined,
      undefined,
      new LeaseLosingMutationCoordinator(),
    ).execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });

    expect(result.isErr()).toBe(true);
    expect(
      await seed.certificates.findOne(
        seed.repositoryContext,
        CertificateByDomainBindingIdSpec.create(DomainBindingId.rehydrate(seed.domainBindingId)),
      ),
    ).toBeNull();
    expect(seed.eventBus.events).toHaveLength(eventsBefore);
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
    const coordinator = new CapturingMutationCoordinator();
    const useCase = new ReconcileDomainCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new SuccessfulCertificateMaterializer(steps),
      activator,
      new MatchingTlsCertificateObserver(steps),
      coordinator,
      seed.clock,
      seed.eventBus,
      seed.logger,
    );
    const reconciled = await useCase.execute(seed.context, event);

    expect(reconciled.isOk()).toBe(true);
    expect(coordinator.calls[0]).toMatchObject({
      policy: expect.objectContaining({
        operationKey: "domain-bindings.reconcile-certificate",
        scopeKind: "domain-binding",
      }),
      scope: { kind: "domain-binding", key: seed.domainBindingId },
    });
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
      new PassThroughMutationCoordinator(),
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
      new PassThroughMutationCoordinator(),
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

  test("[CERT-RECON-CONC-002] lease loss after materialization prevents route activation", async () => {
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

    const result = await new ReconcileDomainCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new SuccessfulCertificateMaterializer(steps),
      new SuccessfulCertificateRouteActivator(steps),
      new MatchingTlsCertificateObserver(steps),
      new LeaseLosingMutationCoordinator(),
      seed.clock,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, event);

    expect(result.isErr()).toBe(true);
    expect(steps).toEqual(["materialize"]);
  });

  test("[ROUTE-TLS-EVT-022] rejects a delayed imported event after the binding switches to auto policy", async () => {
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
    expect(
      (
        await new ConfigureDomainBindingCertificatePolicyUseCase(
          seed.domainBindings,
          seed.clock,
          seed.eventBus,
          seed.logger,
        ).execute(seed.context, {
          domainBindingId: seed.domainBindingId,
          certificatePolicy: "auto",
        })
      ).isOk(),
    ).toBe(true);
    const steps: string[] = [];

    const result = await new ReconcileDomainCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new SuccessfulCertificateMaterializer(steps),
      new SuccessfulCertificateRouteActivator(steps),
      new MatchingTlsCertificateObserver(steps),
      new PassThroughMutationCoordinator(),
      seed.clock,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, event);

    expect(result.isErr()).toBe(true);
    expect(steps).toEqual([]);
  });

  test("[CERT-RECON-CONC-001] certificate policy writers share the binding reconciliation scope", async () => {
    const seed = await seedImportContext();
    const coordinator = new CapturingMutationCoordinator();
    const result = await new ConfigureDomainBindingCertificatePolicyUseCase(
      seed.domainBindings,
      seed.clock,
      seed.eventBus,
      seed.logger,
      coordinator,
    ).execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificatePolicy: "auto",
    });

    expect(result.isOk()).toBe(true);
    expect(coordinator.calls[0]).toMatchObject({
      policy: expect.objectContaining({
        operationKey: "domain-bindings.configure-certificate-policy",
        scopeKind: "domain-binding",
      }),
      scope: { kind: "domain-binding", key: seed.domainBindingId },
    });
  });

  test("[CERT-RECON-CONC-001] import and revoke writers share the binding reconciliation scope", async () => {
    const seed = await seedImportContext();
    const importCoordinator = new CapturingMutationCoordinator();
    const imported = await new ImportCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new FakeCertificateMaterialValidator(ok(createValidationResult())),
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
      undefined,
      undefined,
      importCoordinator,
    ).execute(seed.context, {
      domainBindingId: seed.domainBindingId,
      certificateChain: "leaf-chain",
      privateKey: "leaf-key",
    });
    expect(imported.isOk()).toBe(true);
    expect(importCoordinator.calls[0]).toMatchObject({
      policy: expect.objectContaining({ operationKey: "certificates.import" }),
      scope: { kind: "domain-binding", key: seed.domainBindingId },
    });

    const revokeCoordinator = new CapturingMutationCoordinator();
    const revoked = await new RevokeCertificateUseCase(
      seed.certificates,
      new FakeCertificateProvider(err(domainError.validation("provider should not be called"))),
      new FakeCertificateSecretStore(),
      seed.clock,
      seed.idGenerator,
      seed.eventBus,
      seed.logger,
      undefined,
      revokeCoordinator,
    ).execute(seed.context, { certificateId: imported._unsafeUnwrap().certificateId });
    expect(revoked.isOk()).toBe(true);
    expect(revokeCoordinator.calls[0]).toMatchObject({
      policy: expect.objectContaining({ operationKey: "certificates.revoke" }),
      scope: { kind: "domain-binding", key: seed.domainBindingId },
    });
  });

  test("[ROUTE-TLS-EVT-022] rejects a delayed managed-issued event after the binding switches to manual policy", async () => {
    const seed = await seedImportContext();
    const policyUseCase = new ConfigureDomainBindingCertificatePolicyUseCase(
      seed.domainBindings,
      seed.clock,
      seed.eventBus,
      seed.logger,
    );
    expect(
      (
        await policyUseCase.execute(seed.context, {
          domainBindingId: seed.domainBindingId,
          certificatePolicy: "auto",
        })
      ).isOk(),
    ).toBe(true);
    const certificate = Certificate.request({
      id: CertificateId.rehydrate("crt_managed_delayed"),
      domainBindingId: DomainBindingId.rehydrate(seed.domainBindingId),
      domainName: PublicDomainName.rehydrate("manual.example.test"),
      attemptId: CertificateAttemptId.rehydrate("cat_managed_delayed"),
      reason: CertificateIssueReasonValue.rehydrate("issue"),
      providerKey: ProviderKey.rehydrate("acme"),
      challengeType: CertificateChallengeTypeValue.rehydrate("http-01"),
      requestedAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    certificate
      .markIssued({
        attemptId: CertificateAttemptId.rehydrate("cat_managed_delayed"),
        issuedAt: CertificateIssuedAtValue.rehydrate("2026-01-01T00:00:00.000Z"),
        expiresAt: CertificateExpiresAtValue.rehydrate("2026-06-01T00:00:00.000Z"),
        secretRef: CertificateSecretRefValue.rehydrate("secret://managed/delayed"),
        fingerprint: CertificateFingerprintValue.rehydrate("sha256:managed-delayed"),
      })
      ._unsafeUnwrap();
    const event = eventsByType(certificate.pullDomainEvents(), "certificate-issued")[0];
    if (!event) throw new Error("certificate-issued event was not captured");
    await seed.certificates.upsert(
      seed.repositoryContext,
      certificate,
      UpsertCertificateSpec.fromCertificate(certificate),
    );
    expect(
      (
        await policyUseCase.execute(seed.context, {
          domainBindingId: seed.domainBindingId,
          certificatePolicy: "manual",
        })
      ).isOk(),
    ).toBe(true);
    const steps: string[] = [];

    const result = await new ReconcileDomainCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new SuccessfulCertificateMaterializer(steps),
      new SuccessfulCertificateRouteActivator(steps),
      new MatchingTlsCertificateObserver(steps),
      new PassThroughMutationCoordinator(),
      seed.clock,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, event);

    expect(result.isErr()).toBe(true);
    expect(steps).toEqual([]);
  });

  test("[ROUTE-TLS-EVT-023] rejects a delayed event for a revoked certificate", async () => {
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
    const event = eventsByType(seed.eventBus.events, "certificate-imported")[0];
    if (!event) throw new Error("certificate-imported event was not captured");
    expect(
      (
        await new RevokeCertificateUseCase(
          seed.certificates,
          new FakeCertificateProvider(err(domainError.validation("provider should not be called"))),
          new FakeCertificateSecretStore(),
          seed.clock,
          seed.idGenerator,
          seed.eventBus,
          seed.logger,
        ).execute(seed.context, {
          certificateId: imported._unsafeUnwrap().certificateId,
        })
      ).isOk(),
    ).toBe(true);
    const steps: string[] = [];

    const result = await new ReconcileDomainCertificateUseCase(
      seed.domainBindings,
      seed.certificates,
      new SuccessfulCertificateMaterializer(steps),
      new SuccessfulCertificateRouteActivator(steps),
      new MatchingTlsCertificateObserver(steps),
      new PassThroughMutationCoordinator(),
      seed.clock,
      seed.eventBus,
      seed.logger,
    ).execute(seed.context, event);

    expect(result.isErr()).toBe(true);
    expect(steps).toEqual([]);
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
      new PassThroughMutationCoordinator(),
      seed.clock,
      seed.eventBus,
      seed.logger,
    );
    expect((await useCase.execute(seed.context, event)).isOk()).toBe(true);
    expect((await useCase.execute(seed.context, event)).isOk()).toBe(true);

    expect(steps).toEqual([
      "materialize",
      "activate",
      "observe:manual.example.test",
      "finalize",
      "finalize",
    ]);
    expect(eventsByType(seed.eventBus.events, "domain-ready")).toHaveLength(1);
  });

  test("[ROUTE-TLS-EVT-020] retries deferred backup retirement on idempotent event delivery", async () => {
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
      new FlakyFinalizeCertificateRouteActivator(steps),
      new MatchingTlsCertificateObserver(steps),
      new PassThroughMutationCoordinator(),
      seed.clock,
      seed.eventBus,
      seed.logger,
    );

    expect((await useCase.execute(seed.context, event)).isErr()).toBe(true);
    expect((await useCase.execute(seed.context, event)).isOk()).toBe(true);
    expect(steps).toEqual([
      "materialize",
      "activate",
      "observe:manual.example.test",
      "finalize",
      "finalize",
    ]);
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
          new PassThroughMutationCoordinator(),
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
          new PassThroughMutationCoordinator(),
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
    expect(persisted?.toState().activeCertificateProof?.certificateId.value).toBe(
      replacementEvent.aggregateId,
    );
    expect(persisted?.toState().activeCertificateProof?.fingerprint.value).toBe(
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
