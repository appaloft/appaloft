import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetLifecycleStatusValue,
  DeploymentTargetName,
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
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  type Result,
  TargetKindValue,
  UpsertDeploymentTargetSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FakeDependencyResourceSecretStore,
  FakeManagedDependencyProvider,
  FixedClock,
  MemoryDependencyResourceDeleteSafetyReader,
  MemoryDependencyResourceReadModel,
  MemoryDependencyResourceRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import {
  createExecutionContext,
  type ExecutionContext,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type RepositoryContext,
  toRepositoryContext,
} from "../src";
import { ListDependencyResourcesQuery, ShowDependencyResourceQuery } from "../src/messages";
import {
  DeleteDependencyResourceUseCase,
  ImportDependencyResourceUseCase,
  ListDependencyResourcesQueryService,
  ProvisionDependencyResourceUseCase,
  RenameDependencyResourceUseCase,
  ShowDependencyResourceQueryService,
} from "../src/use-cases";

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_dependency_resource_lifecycle_test",
    entrypoint: "system",
  });
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

function singleServerTarget() {
  return DeploymentTarget.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("Demo server"),
    providerKey: ProviderKey.rehydrate("local-shell"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

async function createHarness() {
  const context = createContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const dependencyResources = new MemoryDependencyResourceRepository();
  const dependencyResourceSecretStore = new FakeDependencyResourceSecretStore();
  const servers = new MemoryServerRepository();
  const deleteSafetyReader = new MemoryDependencyResourceDeleteSafetyReader();
  const readModel = new MemoryDependencyResourceReadModel(dependencyResources, deleteSafetyReader);
  const eventBus = new CapturedEventBus();
  const managedDependencyProvider = new FakeManagedDependencyProvider();
  const logger = new NoopLogger();
  const idGenerator = new SequenceIdGenerator();
  const processAttemptRecorder = new RecordingProcessAttemptRecorder();

  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("Production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  const server = singleServerTarget();
  await servers.upsert(
    repositoryContext,
    server,
    UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
  );

  const importDependency = new ImportDependencyResourceUseCase(
    projects,
    environments,
    dependencyResources,
    dependencyResourceSecretStore,
    clock,
    idGenerator,
    eventBus,
    logger,
    undefined,
  );
  const provisionDependency = new ProvisionDependencyResourceUseCase(
    projects,
    environments,
    servers,
    dependencyResources,
    dependencyResourceSecretStore,
    clock,
    idGenerator,
    eventBus,
    logger,
    managedDependencyProvider,
    processAttemptRecorder,
  );

  return {
    context,
    deleteDependencyResource: new DeleteDependencyResourceUseCase(
      dependencyResources,
      deleteSafetyReader,
      clock,
      idGenerator,
      eventBus,
      logger,
      managedDependencyProvider,
      processAttemptRecorder,
    ),
    deleteSafetyReader,
    dependencyResources,
    dependencyResourceSecretStore,
    environments,
    eventBus,
    idGenerator,
    logger,
    managedDependencyProvider,
    projects,
    servers,
    importDependencyResource: importDependency,
    listDependencyResources: new ListDependencyResourcesQueryService(readModel, clock),
    provisionDependencyResource: provisionDependency,
    processAttemptRecorder,
    readModel,
    renameDependencyResource: new RenameDependencyResourceUseCase(
      dependencyResources,
      clock,
      eventBus,
      logger,
    ),
    repositoryContext,
    showDependencyResource: new ShowDependencyResourceQueryService(readModel, clock),
  };
}

describe("Postgres dependency resource lifecycle use cases", () => {
  test("[DEP-RES-PG-PROVISION-001] [DEP-RES-PG-NATIVE-001] [DEP-RES-PG-NATIVE-002] [DEP-BIND-SECRET-RESOLVE-003] [PROC-DELIVERY-001] provisions managed Postgres through provider realization", async () => {
    const {
      context,
      eventBus,
      managedDependencyProvider,
      processAttemptRecorder,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();

    const result = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });

    expect(result.isOk()).toBe(true);
    expect(managedDependencyProvider.realized).toContainEqual(
      expect.objectContaining({
        dependencyResourceId: result._unsafeUnwrap().id,
        providerKey: "appaloft-managed-postgres",
      }),
    );
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: "dependency-resource-created",
        aggregateId: result._unsafeUnwrap().id,
      }),
    );
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: "dependency-resource-realized",
        aggregateId: result._unsafeUnwrap().id,
      }),
    );
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: result._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      lifecycleStatus: "ready",
      bindingReadiness: { status: "ready" },
      providerRealization: {
        status: "ready",
        providerResourceHandle: `pg/${result._unsafeUnwrap().id}`,
      },
      connection: {
        maskedConnection: expect.stringContaining("********"),
      },
    });
    expect(processAttemptRecorder.records).toEqual([
      {
        id: "dpr_0002",
        kind: "system",
        status: "running",
        operationKey: "dependency-resources.provision",
        dedupeKey: `dependency-resource-realization:${result._unsafeUnwrap().id}:dpr_0002`,
        correlationId: "req_dependency_resource_lifecycle_test",
        requestId: "req_dependency_resource_lifecycle_test",
        phase: "dependency-resource-realization",
        step: "pending",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          dependencyResourceId: result._unsafeUnwrap().id,
          dependencyKind: "postgres",
          providerKey: "appaloft-managed-postgres",
          providerManaged: true,
          realizationStatus: "pending",
        },
      },
      {
        id: "dpr_0002",
        kind: "system",
        status: "succeeded",
        operationKey: "dependency-resources.provision",
        dedupeKey: `dependency-resource-realization:${result._unsafeUnwrap().id}:dpr_0002`,
        correlationId: "req_dependency_resource_lifecycle_test",
        requestId: "req_dependency_resource_lifecycle_test",
        phase: "dependency-resource-realization",
        step: "ready",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          dependencyResourceId: result._unsafeUnwrap().id,
          dependencyKind: "postgres",
          providerKey: "appaloft-managed-postgres",
          providerManaged: true,
          realizationStatus: "ready",
        },
      },
    ]);
  });

  test("[DEP-BIND-SECRET-RESOLVE-006] repeated targeted provision reconciles the managed connection secret", async () => {
    const {
      context,
      dependencyResourceSecretStore,
      managedDependencyProvider,
      provisionDependencyResource,
    } = await createHarness();
    managedDependencyProvider.setRealizationResult(
      ok({
        providerResourceHandle: "docker-single-server:v1:postgres:srv_demo:appaloft-postgres-rsi_1",
        endpoint: {
          host: "appaloft-postgres-rsi_1",
          port: 5432,
          databaseName: "main_db",
          maskedConnection: "postgres://app:********@appaloft-postgres-rsi_1:5432/main_db",
        },
        connectionSecretValue: "postgres://app:recovered@appaloft-postgres-rsi_1:5432/main_db",
        realizedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const first = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
      serverId: "srv_demo",
    });
    const second = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
      serverId: "srv_demo",
    });

    expect(second._unsafeUnwrap().id).toBe(first._unsafeUnwrap().id);
    expect(managedDependencyProvider.realized).toHaveLength(2);
    expect(dependencyResourceSecretStore.stored).toHaveLength(2);
    expect(dependencyResourceSecretStore.stored.at(-1)?.secretValue).toContain("recovered");
  });

  test("[DEP-RES-IMPORT-AUTHZ-001] import can be denied before secret storage and persistence", async () => {
    const {
      context,
      dependencyResourceSecretStore,
      dependencyResources,
      environments,
      eventBus,
      idGenerator,
      logger,
      projects,
    } = await createHarness();
    const guard = new DenyingOperationGuardPort();
    const readModel = new MemoryDependencyResourceReadModel(dependencyResources);
    const useCase = new ImportDependencyResourceUseCase(
      projects,
      environments,
      dependencyResources,
      dependencyResourceSecretStore,
      new FixedClock("2026-01-01T00:00:00.000Z"),
      idGenerator,
      eventBus,
      logger,
      guard,
      readModel,
    );

    const result = await useCase.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Imported DB",
      connectionUrl: "postgres://app:super-secret@db.example.test:5432/main",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "dependency-resources.import",
        organizationId: "org_self_hosted",
        projectId: "prj_demo",
        environmentId: "env_demo",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toEqual([
      expect.objectContaining({
        operationKey: "dependency-resources.import",
        organizationId: "org_self_hosted",
        resourceRefs: {
          projectId: "prj_demo",
          environmentId: "env_demo",
        },
        contextAttributes: expect.objectContaining({
          estimatedFieldCount: 4,
          estimatedInputBytes: expect.any(Number),
          estimatedItemCount: 1,
          estimatedNestingDepth: 1,
          estimatedSecretCount: 1,
          estimatedWriteUnits: 2,
          currentEnvironmentDependencyResourceCount: 0,
          currentProjectDependencyResourceCount: 0,
        }),
      }),
    ]);
    expect(dependencyResourceSecretStore.stored).toHaveLength(0);
    expect(eventBus.events).toHaveLength(0);
    expect(dependencyResources.items).toHaveLength(0);
  });

  test("[DEP-RES-PROVISION-AUTHZ-002] provision estimates provider cost before persistence/provider calls", async () => {
    const {
      context,
      dependencyResourceSecretStore,
      dependencyResources,
      environments,
      eventBus,
      idGenerator,
      logger,
      managedDependencyProvider,
      processAttemptRecorder,
      projects,
      servers,
    } = await createHarness();
    const guard = new DenyingOperationGuardPort();
    const readModel = new MemoryDependencyResourceReadModel(dependencyResources);
    const useCase = new ProvisionDependencyResourceUseCase(
      projects,
      environments,
      servers,
      dependencyResources,
      dependencyResourceSecretStore,
      new FixedClock("2026-01-01T00:00:00.000Z"),
      idGenerator,
      eventBus,
      logger,
      managedDependencyProvider,
      processAttemptRecorder,
      guard,
      readModel,
    );

    const result = await useCase.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "dependency-resources.provision",
        organizationId: "org_self_hosted",
        projectId: "prj_demo",
        environmentId: "env_demo",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toEqual([
      expect.objectContaining({
        operationKey: "dependency-resources.provision",
        organizationId: "org_self_hosted",
        resourceRefs: {
          projectId: "prj_demo",
          environmentId: "env_demo",
        },
        contextAttributes: expect.objectContaining({
          estimatedExternalProviderCalls: 1,
          estimatedSecretCount: 1,
          estimatedWriteUnits: 3,
          currentEnvironmentDependencyResourceCount: 0,
          currentProjectDependencyResourceCount: 0,
        }),
      }),
    ]);
    expect(managedDependencyProvider.realized).toHaveLength(0);
    expect(dependencyResourceSecretStore.stored).toHaveLength(0);
    expect(processAttemptRecorder.records).toHaveLength(0);
    expect(eventBus.events).toHaveLength(0);
    expect(dependencyResources.items).toHaveLength(0);
  });

  test("[DEP-BIND-SECRET-RESOLVE-003] keeps managed Postgres binding ready for resolvable Appaloft-owned refs", async () => {
    const {
      context,
      dependencyResourceSecretStore,
      managedDependencyProvider,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    const secretRef = "appaloft://dependency-resources/rsi_0001/connection";
    await dependencyResourceSecretStore.storeConnection(context, {
      dependencyResourceId: "rsi_0001",
      projectId: "prj_demo",
      environmentId: "env_demo",
      kind: "postgres",
      purpose: "connection",
      secretValue: "postgres://app:super-secret@main-db.postgres.internal:5432/main_db",
      storedAt: "2026-01-01T00:00:00.000Z",
    });
    managedDependencyProvider.setRealizationResult(
      ok({
        providerResourceHandle: "pg/rsi_0001",
        endpoint: {
          host: "main-db.postgres.internal",
          port: 5432,
          databaseName: "main_db",
          maskedConnection: "postgres://app:********@main-db.postgres.internal:5432/main_db",
        },
        secretRef,
        realizedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const result = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });

    expect(result.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: result._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      lifecycleStatus: "ready",
      bindingReadiness: { status: "ready" },
      connection: {
        secretRef,
        maskedConnection: expect.stringContaining("********"),
      },
    });
    expect(JSON.stringify(shown._unsafeUnwrap().dependencyResource)).not.toContain("super-secret");
  });

  test("[DEP-BIND-SECRET-RESOLVE-003] blocks managed Postgres binding readiness for unresolved Appaloft-owned refs", async () => {
    const {
      context,
      managedDependencyProvider,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    const secretRef = "appaloft://dependency-resources/rsi_0001/connection";
    managedDependencyProvider.setRealizationResult(
      ok({
        providerResourceHandle: "pg/rsi_0001",
        endpoint: {
          host: "main-db.postgres.internal",
          port: 5432,
          databaseName: "main_db",
          maskedConnection: "postgres://app:********@main-db.postgres.internal:5432/main_db",
        },
        secretRef,
        realizedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const result = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });

    expect(result.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: result._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      lifecycleStatus: "ready",
      providerRealization: { status: "ready" },
      bindingReadiness: {
        status: "blocked",
        reason: "dependency_runtime_secret_unresolved",
      },
      connection: {
        secretRef,
        maskedConnection: expect.stringContaining("********"),
      },
    });
  });

  test("[CLOUD-DEP-PROV-CAPABILITY-052] provisions managed Postgres with dependency capabilities on the resource state", async () => {
    const {
      context,
      managedDependencyProvider,
      provisionDependencyResource,
      repositoryContext,
      dependencyResources,
      showDependencyResource,
    } = await createHarness();
    managedDependencyProvider.setRealizationResult(
      ok({
        providerResourceHandle: "pg/rsi_0001",
        endpoint: {
          host: "main-db.postgres.internal",
          port: 5432,
          databaseName: "main_db",
          maskedConnection: "postgres://app:********@main-db.postgres.internal:5432/main_db",
        },
        secretRef: "secret://dependency/postgres/rsi_0001",
        capabilityReadbacks: [
          {
            type: "postgres-extension",
            name: "vector",
            required: true,
            status: "satisfied",
            evidence: ["postgres-extension-installed:vector"],
            version: "0.7.4",
            checkedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        realizedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const result = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Vector DB",
      capabilities: [{ type: "postgres-extension", name: "vector", required: true }],
    });

    expect(result.isOk()).toBe(true);
    const id = result._unsafeUnwrap().id;
    expect(managedDependencyProvider.realized[0]?.capabilities).toEqual([
      { type: "postgres-extension", name: "vector", required: true },
    ]);
    const persisted = await dependencyResources.findOne(
      repositoryContext,
      ResourceInstanceByIdSpec.create(ResourceInstanceId.rehydrate(id)),
    );
    expect(persisted?.toState().desiredCapabilities).toMatchObject([
      { type: "postgres-extension", name: "vector", required: true },
    ]);
    expect(persisted?.toState().capabilityReadbacks).toMatchObject([
      {
        type: "postgres-extension",
        name: "vector",
        required: true,
        status: "satisfied",
        evidence: ["postgres-extension-installed:vector"],
        version: "0.7.4",
      },
    ]);

    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: id })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      desiredCapabilities: [{ type: "postgres-extension", name: "vector", required: true }],
      capabilityReadbacks: [
        {
          type: "postgres-extension",
          name: "vector",
          required: true,
          status: "satisfied",
          evidence: ["postgres-extension-installed:vector"],
          version: "0.7.4",
          checkedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      bindingReadiness: { status: "ready" },
    });
  });

  test("[DEP-RES-PG-NATIVE-003] [PROC-DELIVERY-004] provider realization failure keeps provision accepted and blocks binding readiness", async () => {
    const {
      context,
      managedDependencyProvider,
      processAttemptRecorder,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    managedDependencyProvider.setRealizationResult(
      err(
        domainError.provider("Managed Postgres unavailable with secret token output", {
          phase: "dependency-resource-realization",
          providerKey: "appaloft-managed-postgres",
        }),
      ),
    );

    const result = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });

    expect(result.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: result._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      lifecycleStatus: "degraded",
      bindingReadiness: { status: "blocked" },
      providerRealization: {
        status: "failed",
        failureCode: "provider_error",
      },
    });
    expect(processAttemptRecorder.records.at(-1)).toMatchObject({
      id: "dpr_0002",
      kind: "system",
      status: "failed",
      operationKey: "dependency-resources.provision",
      phase: "dependency-resource-realization",
      step: "failed",
      projectId: "prj_demo",
      errorCode: "provider_error",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: {
        dependencyResourceId: result._unsafeUnwrap().id,
        dependencyKind: "postgres",
        providerKey: "appaloft-managed-postgres",
        providerManaged: true,
        realizationStatus: "failed",
      },
    });
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("secret token output");
  });

  test("[DEP-RES-PG-NATIVE-008] passes single-server target to managed Postgres provider", async () => {
    const { context, managedDependencyProvider, provisionDependencyResource } =
      await createHarness();

    const result = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
      serverId: "srv_demo",
    });

    expect(result.isOk()).toBe(true);
    expect(managedDependencyProvider.realized[0]?.target).toMatchObject({
      serverId: "srv_demo",
      providerKey: "local-shell",
      targetKind: "single-server",
      host: "127.0.0.1",
      port: 22,
    });
  });

  test("[DEP-RES-PG-NATIVE-007] rejects unsupported managed Postgres provider before persistence", async () => {
    const {
      context,
      managedDependencyProvider,
      provisionDependencyResource,
      listDependencyResources,
    } = await createHarness();
    managedDependencyProvider.setSupportedProviderKeys([]);

    const result = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });
    const list = await listDependencyResources.execute(
      context,
      ListDependencyResourcesQuery.create({ projectId: "prj_demo" })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_capability_unsupported",
      details: {
        phase: "dependency-resource-realization-admission",
      },
    });
    expect(list._unsafeUnwrap().items).toEqual([]);
  });

  test("[DEP-RES-PG-IMPORT-001] [DEP-RES-PG-READ-002] imports external Postgres with masked read model", async () => {
    const { context, importDependencyResource, showDependencyResource } = await createHarness();

    const created = await importDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "External DB",
      connectionUrl:
        "postgres://app:super-secret@db.example.com:5432/app?sslmode=require&token=hidden",
      secretRef: "secret://dependency/postgres/external-db",
    });

    expect(created.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: created._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );

    const detail = JSON.stringify(shown._unsafeUnwrap());
    expect(detail).toContain("********");
    expect(detail).toContain("db.example.com");
    expect(detail).not.toContain("super-secret");
    expect(detail).not.toContain("hidden");
  });

  test("[DEP-BIND-SECRET-RESOLVE-001] stores imported Postgres connection value behind safe ref", async () => {
    const {
      context,
      dependencyResourceSecretStore,
      importDependencyResource,
      showDependencyResource,
    } = await createHarness();

    const connectionUrl =
      "postgres://app:super-secret@db.example.com:5432/app?sslmode=require&token=hidden";
    const created = await importDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "External DB",
      connectionUrl,
    });

    expect(created.isOk()).toBe(true);
    const createdId = created._unsafeUnwrap().id;
    expect(dependencyResourceSecretStore.stored).toContainEqual(
      expect.objectContaining({
        dependencyResourceId: createdId,
        projectId: "prj_demo",
        environmentId: "env_demo",
        kind: "postgres",
        purpose: "connection",
        secretValue: connectionUrl,
      }),
    );
    const resolved = await dependencyResourceSecretStore.resolve(context, {
      secretRef: `appaloft://dependency-resources/${createdId}/connection`,
    });
    expect(resolved._unsafeUnwrap()).toMatchObject({
      secretRef: `appaloft://dependency-resources/${createdId}/connection`,
      secretValue: connectionUrl,
    });

    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: createdId })._unsafeUnwrap(),
    );
    const detail = JSON.stringify(shown._unsafeUnwrap());
    expect(detail).toContain(`appaloft://dependency-resources/${createdId}/connection`);
    expect(detail).not.toContain("super-secret");
    expect(detail).not.toContain("hidden");
  });

  test("[DEP-RES-PG-VALIDATION-001] rejects invalid Postgres endpoint input", async () => {
    const { context, importDependencyResource } = await createHarness();

    const result = await importDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Broken",
      connectionUrl: "not-a-url",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "dependency-resource-validation",
      },
    });
  });

  test("[DEP-RES-PG-READ-001] list/show include readiness and backup metadata", async () => {
    const { context, importDependencyResource, listDependencyResources, showDependencyResource } =
      await createHarness();
    const created = (
      await importDependencyResource.execute(context, {
        kind: "postgres",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External DB",
        connectionUrl: "postgres://app:secret@db.example.com:5432/app",
        backupRelationship: {
          retentionRequired: true,
          reason: "Retained by future backup set",
        },
      })
    )._unsafeUnwrap();

    const list = await listDependencyResources.execute(
      context,
      ListDependencyResourcesQuery.create({ projectId: "prj_demo" })._unsafeUnwrap(),
    );
    const show = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );

    expect(list._unsafeUnwrap().items[0]).toMatchObject({
      bindingReadiness: {
        status: "not-implemented",
      },
      backupRelationship: {
        retentionRequired: true,
      },
    });
    expect(show._unsafeUnwrap().dependencyResource.connection?.maskedConnection).toContain(
      "********",
    );
  });

  test("[DEP-RES-PG-RENAME-001] renames dependency resource without changing connection metadata", async () => {
    const { context, importDependencyResource, renameDependencyResource, showDependencyResource } =
      await createHarness();
    const created = (
      await importDependencyResource.execute(context, {
        kind: "postgres",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External DB",
        connectionUrl: "postgres://app:secret@db.example.com:5432/app",
      })
    )._unsafeUnwrap();

    const renamed = await renameDependencyResource.execute(context, {
      dependencyResourceId: created.id,
      name: "Primary DB",
    });

    expect(renamed.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      name: "Primary DB",
      slug: "primary-db",
      connection: {
        host: "db.example.com",
      },
    });
  });

  test("[DEP-RES-PG-DELETE-001] imported external delete tombstones Appaloft record only", async () => {
    const { context, deleteDependencyResource, importDependencyResource, showDependencyResource } =
      await createHarness();
    const created = (
      await importDependencyResource.execute(context, {
        kind: "postgres",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External DB",
        connectionUrl: "postgres://app:secret@db.example.com:5432/app",
      })
    )._unsafeUnwrap();

    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(deleted.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );
    expect(shown.isErr()).toBe(true);
    expect(shown._unsafeUnwrapErr().code).toBe("not_found");
  });

  test("[DEP-RES-PG-NATIVE-005] [PROC-DELIVERY-001] deletes realized managed Postgres through provider cleanup", async () => {
    const {
      context,
      deleteDependencyResource,
      managedDependencyProvider,
      processAttemptRecorder,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    const created = (
      await provisionDependencyResource.execute(context, {
        kind: "postgres",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main DB",
      })
    )._unsafeUnwrap();

    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(deleted.isOk()).toBe(true);
    void managedDependencyProvider;
    expect(managedDependencyProvider.deleted).toContainEqual(
      expect.objectContaining({
        dependencyResourceId: created.id,
        kind: "postgres",
        providerResourceHandle: `pg/${created.id}`,
      }),
    );
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );
    expect(shown.isErr()).toBe(true);
    expect(shown._unsafeUnwrapErr().code).toBe("not_found");
    expect(processAttemptRecorder.records.slice(-2)).toEqual([
      {
        id: "dpd_0003",
        kind: "system",
        status: "running",
        operationKey: "dependency-resources.delete",
        dedupeKey: `dependency-resource-provider-delete:${created.id}:dpd_0003`,
        correlationId: "req_dependency_resource_lifecycle_test",
        requestId: "req_dependency_resource_lifecycle_test",
        phase: "dependency-resource-provider-delete",
        step: "delete-pending",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          dependencyResourceId: created.id,
          dependencyKind: "postgres",
          providerKey: "appaloft-managed-postgres",
          providerManaged: true,
          realizationStatus: "delete-pending",
        },
      },
      {
        id: "dpd_0003",
        kind: "system",
        status: "succeeded",
        operationKey: "dependency-resources.delete",
        dedupeKey: `dependency-resource-provider-delete:${created.id}:dpd_0003`,
        correlationId: "req_dependency_resource_lifecycle_test",
        requestId: "req_dependency_resource_lifecycle_test",
        phase: "dependency-resource-provider-delete",
        step: "deleted",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          dependencyResourceId: created.id,
          dependencyKind: "postgres",
          providerKey: "appaloft-managed-postgres",
          providerManaged: true,
          realizationStatus: "deleted",
        },
      },
    ]);
  });

  test("[DEP-RES-PG-NATIVE-005] deletes managed Postgres state when provider artifact is already gone", async () => {
    const {
      context,
      deleteDependencyResource,
      managedDependencyProvider,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    const created = (
      await provisionDependencyResource.execute(context, {
        kind: "postgres",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Missing Artifact DB",
      })
    )._unsafeUnwrap();
    managedDependencyProvider.setDeleteResult(
      err(domainError.notFound("managed_dependency_artifact", `postgres/${created.id}`)),
    );

    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(deleted.isOk()).toBe(true);
    expect(managedDependencyProvider.deleted).toContainEqual(
      expect.objectContaining({
        dependencyResourceId: created.id,
        kind: "postgres",
      }),
    );
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );
    expect(shown.isErr()).toBe(true);
    expect(shown._unsafeUnwrapErr().code).toBe("not_found");
  });

  test("[DEP-RES-PG-NATIVE-006] retries delete-pending managed Postgres cleanup", async () => {
    const {
      context,
      deleteDependencyResource,
      managedDependencyProvider,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    const created = (
      await provisionDependencyResource.execute(context, {
        kind: "postgres",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Retry Delete DB",
      })
    )._unsafeUnwrap();
    managedDependencyProvider.setDeleteResult(
      err(
        domainError.provider("Delete failed", {
          phase: "dependency-resource-provider-delete",
          providerKey: "appaloft-managed-postgres",
        }),
      ),
    );

    const failedDelete = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });
    managedDependencyProvider.setDeleteResult(
      err(domainError.notFound("managed_dependency_artifact", `postgres/${created.id}`)),
    );
    const retriedDelete = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(failedDelete.isErr()).toBe(true);
    expect(retriedDelete.isOk()).toBe(true);
    expect(managedDependencyProvider.deleted).toHaveLength(2);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );
    expect(shown.isErr()).toBe(true);
    expect(shown._unsafeUnwrapErr().code).toBe("not_found");
  });

  test("[DEP-RES-PG-DELETE-002] blocks bound dependency delete", async () => {
    const { context, deleteDependencyResource, deleteSafetyReader, importDependencyResource } =
      await createHarness();
    const created = (
      await importDependencyResource.execute(context, {
        kind: "postgres",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External DB",
        connectionUrl: "postgres://app:secret@db.example.com:5432/app",
      })
    )._unsafeUnwrap();
    deleteSafetyReader.setBlockers(created.id, [{ kind: "resource-binding", count: 1 }]);

    const result = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_resource_delete_blocked",
      details: {
        phase: "dependency-resource-delete-safety",
      },
    });
  });

  test("[DEP-RES-PG-NATIVE-005] [PROC-DELIVERY-004] records managed Postgres provider delete failure safely", async () => {
    const {
      context,
      deleteDependencyResource,
      managedDependencyProvider,
      processAttemptRecorder,
      provisionDependencyResource,
    } = await createHarness();
    const created = (
      await provisionDependencyResource.execute(context, {
        kind: "postgres",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Failing Delete DB",
      })
    )._unsafeUnwrap();
    managedDependencyProvider.setDeleteResult(
      err(
        domainError.provider("Delete failed with secret token output", {
          phase: "dependency-resource-provider-delete",
          providerKey: "appaloft-managed-postgres",
        }),
      ),
    );

    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(deleted.isErr()).toBe(true);
    expect(deleted._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      details: {
        phase: "dependency-resource-provider-delete",
      },
    });
    expect(processAttemptRecorder.records.at(-1)).toMatchObject({
      id: "dpd_0003",
      kind: "system",
      status: "failed",
      operationKey: "dependency-resources.delete",
      phase: "dependency-resource-provider-delete",
      step: "delete-pending",
      projectId: "prj_demo",
      errorCode: "provider_error",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: {
        dependencyResourceId: created.id,
        dependencyKind: "postgres",
        providerKey: "appaloft-managed-postgres",
        providerManaged: true,
        realizationStatus: "delete-pending",
      },
    });
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("secret token output");
  });

  test("[DEP-RES-REDIS-PROVISION-001] [DEP-RES-REDIS-NATIVE-001] [DEP-RES-REDIS-NATIVE-002] [PROC-DELIVERY-001] provisions managed Redis through provider realization", async () => {
    const {
      context,
      eventBus,
      managedDependencyProvider,
      processAttemptRecorder,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();

    const result = await provisionDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main Cache",
    });

    expect(result.isOk()).toBe(true);
    expect(managedDependencyProvider.realized).toContainEqual(
      expect.objectContaining({
        dependencyResourceId: result._unsafeUnwrap().id,
        providerKey: "appaloft-managed-redis",
      }),
    );
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: "dependency-resource-created",
        aggregateId: result._unsafeUnwrap().id,
      }),
    );
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: "dependency-resource-realized",
        aggregateId: result._unsafeUnwrap().id,
      }),
    );
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: result._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      lifecycleStatus: "ready",
      bindingReadiness: { status: "ready" },
      providerRealization: {
        status: "ready",
        providerResourceHandle: `redis/${result._unsafeUnwrap().id}`,
      },
      connection: {
        maskedConnection: expect.stringContaining("********"),
      },
    });
    expect(processAttemptRecorder.records).toEqual([
      {
        id: "dpr_0002",
        kind: "system",
        status: "running",
        operationKey: "dependency-resources.provision",
        dedupeKey: `dependency-resource-realization:${result._unsafeUnwrap().id}:dpr_0002`,
        correlationId: "req_dependency_resource_lifecycle_test",
        requestId: "req_dependency_resource_lifecycle_test",
        phase: "dependency-resource-realization",
        step: "pending",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          dependencyResourceId: result._unsafeUnwrap().id,
          dependencyKind: "redis",
          providerKey: "appaloft-managed-redis",
          providerManaged: true,
          realizationStatus: "pending",
        },
      },
      {
        id: "dpr_0002",
        kind: "system",
        status: "succeeded",
        operationKey: "dependency-resources.provision",
        dedupeKey: `dependency-resource-realization:${result._unsafeUnwrap().id}:dpr_0002`,
        correlationId: "req_dependency_resource_lifecycle_test",
        requestId: "req_dependency_resource_lifecycle_test",
        phase: "dependency-resource-realization",
        step: "ready",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          dependencyResourceId: result._unsafeUnwrap().id,
          dependencyKind: "redis",
          providerKey: "appaloft-managed-redis",
          providerManaged: true,
          realizationStatus: "ready",
        },
      },
    ]);
  });

  test("[DEP-RES-REDIS-NATIVE-002] keeps managed Redis binding ready for resolvable Appaloft-owned refs", async () => {
    const {
      context,
      dependencyResourceSecretStore,
      managedDependencyProvider,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    const secretRef = "appaloft://dependency-resources/rsi_0001/connection";
    await dependencyResourceSecretStore.storeConnection(context, {
      dependencyResourceId: "rsi_0001",
      projectId: "prj_demo",
      environmentId: "env_demo",
      kind: "redis",
      purpose: "connection",
      secretValue: "redis://:super-secret@main-cache.redis.internal:6379/0",
      storedAt: "2026-01-01T00:00:00.000Z",
    });
    managedDependencyProvider.setRealizationResult(
      ok({
        providerResourceHandle: "redis/rsi_0001",
        endpoint: {
          host: "main-cache.redis.internal",
          port: 6379,
          maskedConnection: "redis://:********@main-cache.redis.internal:6379/0",
        },
        secretRef,
        realizedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const result = await provisionDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main Cache",
    });

    expect(result.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: result._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      lifecycleStatus: "ready",
      bindingReadiness: { status: "ready" },
      connection: {
        secretRef,
        maskedConnection: expect.stringContaining("********"),
      },
    });
    expect(JSON.stringify(shown._unsafeUnwrap().dependencyResource)).not.toContain("super-secret");
  });

  test("[DEP-RES-REDIS-NATIVE-002] stores provider-returned Redis connection value before readiness", async () => {
    const {
      context,
      dependencyResourceSecretStore,
      managedDependencyProvider,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    managedDependencyProvider.setRealizationResult(
      ok({
        providerResourceHandle: "redis/rsi_0001",
        endpoint: {
          host: "main-cache.redis.internal",
          port: 6379,
          maskedConnection: "redis://:********@main-cache.redis.internal:6379/0",
        },
        connectionSecretValue: "redis://:super-secret@main-cache.redis.internal:6379/0",
        realizedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const result = await provisionDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main Cache",
    });

    expect(result.isOk()).toBe(true);
    const dependencyResourceId = result._unsafeUnwrap().id;
    const secretRef = `appaloft://dependency-resources/${dependencyResourceId}/connection`;
    expect(dependencyResourceSecretStore.stored).toContainEqual(
      expect.objectContaining({
        dependencyResourceId,
        projectId: "prj_demo",
        environmentId: "env_demo",
        kind: "redis",
        purpose: "connection",
        secretValue: "redis://:super-secret@main-cache.redis.internal:6379/0",
      }),
    );
    const resolved = await dependencyResourceSecretStore.resolve(context, { secretRef });
    expect(resolved._unsafeUnwrap().secretValue).toBe(
      "redis://:super-secret@main-cache.redis.internal:6379/0",
    );
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      lifecycleStatus: "ready",
      bindingReadiness: { status: "ready" },
      connection: {
        secretRef,
        maskedConnection: "redis://:********@main-cache.redis.internal:6379/0",
      },
    });
    expect(JSON.stringify(shown._unsafeUnwrap().dependencyResource)).not.toContain("super-secret");
  });

  test("[DEP-RES-REDIS-NATIVE-003] [PROC-DELIVERY-004] provider realization failure keeps Redis provision accepted and blocks binding readiness", async () => {
    const {
      context,
      managedDependencyProvider,
      processAttemptRecorder,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    managedDependencyProvider.setRealizationResult(
      err(
        domainError.provider("Managed Redis unavailable with secret token output", {
          phase: "dependency-resource-realization",
          providerKey: "appaloft-managed-redis",
        }),
      ),
    );

    const result = await provisionDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main Cache",
    });

    expect(result.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: result._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().dependencyResource).toMatchObject({
      lifecycleStatus: "degraded",
      bindingReadiness: { status: "blocked" },
      providerRealization: {
        status: "failed",
        failureCode: "provider_error",
      },
    });
    expect(processAttemptRecorder.records.at(-1)).toMatchObject({
      id: "dpr_0002",
      kind: "system",
      status: "failed",
      operationKey: "dependency-resources.provision",
      phase: "dependency-resource-realization",
      step: "failed",
      projectId: "prj_demo",
      errorCode: "provider_error",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: {
        dependencyResourceId: result._unsafeUnwrap().id,
        dependencyKind: "redis",
        providerKey: "appaloft-managed-redis",
        providerManaged: true,
        realizationStatus: "failed",
      },
    });
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("secret token output");
  });

  test("[DEP-RES-REDIS-NATIVE-009] passes single-server target to managed Redis provider", async () => {
    const { context, managedDependencyProvider, provisionDependencyResource } =
      await createHarness();

    const result = await provisionDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main Cache",
      serverId: "srv_demo",
    });

    expect(result.isOk()).toBe(true);
    expect(managedDependencyProvider.realized[0]?.target).toMatchObject({
      serverId: "srv_demo",
      providerKey: "local-shell",
      targetKind: "single-server",
      host: "127.0.0.1",
      port: 22,
    });
  });

  test("[DEP-RES-REDIS-NATIVE-008] rejects unsupported managed Redis provider before persistence", async () => {
    const {
      context,
      listDependencyResources,
      managedDependencyProvider,
      provisionDependencyResource,
    } = await createHarness();
    managedDependencyProvider.setSupportedProviderKeys([]);

    const result = await provisionDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main Cache",
    });
    const list = await listDependencyResources.execute(
      context,
      ListDependencyResourcesQuery.create({ projectId: "prj_demo" })._unsafeUnwrap(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_capability_unsupported",
      details: {
        phase: "dependency-resource-realization-admission",
      },
    });
    expect(list._unsafeUnwrap().items).toEqual([]);
  });

  test("[DEP-RES-REDIS-NATIVE-006] [PROC-DELIVERY-001] deletes realized managed Redis through provider cleanup", async () => {
    const {
      context,
      deleteDependencyResource,
      managedDependencyProvider,
      processAttemptRecorder,
      provisionDependencyResource,
      showDependencyResource,
    } = await createHarness();
    const created = (
      await provisionDependencyResource.execute(context, {
        kind: "redis",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main Cache",
      })
    )._unsafeUnwrap();

    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(deleted.isOk()).toBe(true);
    void managedDependencyProvider;
    expect(managedDependencyProvider.deleted).toContainEqual(
      expect.objectContaining({
        dependencyResourceId: created.id,
        kind: "redis",
        providerResourceHandle: `redis/${created.id}`,
      }),
    );
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: created.id })._unsafeUnwrap(),
    );
    expect(shown.isErr()).toBe(true);
    expect(shown._unsafeUnwrapErr().code).toBe("not_found");
    expect(processAttemptRecorder.records.slice(-2)).toEqual([
      {
        id: "dpd_0003",
        kind: "system",
        status: "running",
        operationKey: "dependency-resources.delete",
        dedupeKey: `dependency-resource-provider-delete:${created.id}:dpd_0003`,
        correlationId: "req_dependency_resource_lifecycle_test",
        requestId: "req_dependency_resource_lifecycle_test",
        phase: "dependency-resource-provider-delete",
        step: "delete-pending",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          dependencyResourceId: created.id,
          dependencyKind: "redis",
          providerKey: "appaloft-managed-redis",
          providerManaged: true,
          realizationStatus: "delete-pending",
        },
      },
      {
        id: "dpd_0003",
        kind: "system",
        status: "succeeded",
        operationKey: "dependency-resources.delete",
        dedupeKey: `dependency-resource-provider-delete:${created.id}:dpd_0003`,
        correlationId: "req_dependency_resource_lifecycle_test",
        requestId: "req_dependency_resource_lifecycle_test",
        phase: "dependency-resource-provider-delete",
        step: "deleted",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          dependencyResourceId: created.id,
          dependencyKind: "redis",
          providerKey: "appaloft-managed-redis",
          providerManaged: true,
          realizationStatus: "deleted",
        },
      },
    ]);
  });

  test("[DEP-RES-REDIS-NATIVE-007] blocks protected realized managed Redis delete before provider cleanup", async () => {
    const {
      context,
      deleteDependencyResource,
      deleteSafetyReader,
      managedDependencyProvider,
      provisionDependencyResource,
    } = await createHarness();
    const bound = (
      await provisionDependencyResource.execute(context, {
        kind: "redis",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Bound Cache",
      })
    )._unsafeUnwrap();
    const retained = (
      await provisionDependencyResource.execute(context, {
        kind: "redis",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Retained Cache",
        backupRelationship: {
          retentionRequired: true,
          reason: "Retained by restore point",
        },
      })
    )._unsafeUnwrap();
    const referenced = (
      await provisionDependencyResource.execute(context, {
        kind: "redis",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Referenced Cache",
      })
    )._unsafeUnwrap();
    deleteSafetyReader.setBlockers(bound.id, [{ kind: "resource-binding", count: 1 }]);
    deleteSafetyReader.setBlockers(referenced.id, [
      { kind: "deployment-snapshot-reference", count: 1 },
    ]);

    const boundDelete = await deleteDependencyResource.execute(context, {
      dependencyResourceId: bound.id,
    });
    const retainedDelete = await deleteDependencyResource.execute(context, {
      dependencyResourceId: retained.id,
    });
    const referencedDelete = await deleteDependencyResource.execute(context, {
      dependencyResourceId: referenced.id,
    });

    expect(boundDelete.isErr()).toBe(true);
    expect(boundDelete._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_resource_delete_blocked",
      details: {
        phase: "dependency-resource-delete-safety",
        deletionBlockers: expect.stringContaining("resource-binding"),
      },
    });
    expect(retainedDelete.isErr()).toBe(true);
    expect(retainedDelete._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_resource_delete_blocked",
      details: {
        phase: "dependency-resource-delete-safety",
        deletionBlockers: expect.stringContaining("backup-relationship"),
      },
    });
    expect(referencedDelete.isErr()).toBe(true);
    expect(referencedDelete._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_resource_delete_blocked",
      details: {
        phase: "dependency-resource-delete-safety",
        deletionBlockers: expect.stringContaining("deployment-snapshot-reference"),
      },
    });
    void managedDependencyProvider;
    expect(managedDependencyProvider.deleted).toEqual([]);
  });

  test("[DEP-RES-REDIS-IMPORT-001] [DEP-RES-REDIS-READ-002] imports external Redis with masked read model", async () => {
    const { context, importDependencyResource, showDependencyResource } = await createHarness();

    const created = await importDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "External Cache",
      connectionUrl: "rediss://default:super-secret@cache.example.com:6380/0?token=hidden",
      secretRef: "secret://dependency/redis/external-cache",
    });

    expect(created.isOk()).toBe(true);
    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({
        dependencyResourceId: created._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );

    const detail = JSON.stringify(shown._unsafeUnwrap());
    expect(detail).toContain("********");
    expect(detail).toContain("cache.example.com");
    expect(detail).toContain('"kind":"redis"');
    expect(detail).not.toContain("super-secret");
    expect(detail).not.toContain("hidden");
  });

  test("[DEP-BIND-SECRET-RESOLVE-002] stores imported Redis connection value behind safe ref", async () => {
    const {
      context,
      dependencyResourceSecretStore,
      importDependencyResource,
      showDependencyResource,
    } = await createHarness();

    const connectionUrl = "rediss://default:super-secret@cache.example.com:6380/0?token=hidden";
    const created = await importDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "External Cache",
      connectionUrl,
    });

    expect(created.isOk()).toBe(true);
    const createdId = created._unsafeUnwrap().id;
    expect(dependencyResourceSecretStore.stored).toContainEqual(
      expect.objectContaining({
        dependencyResourceId: createdId,
        projectId: "prj_demo",
        environmentId: "env_demo",
        kind: "redis",
        purpose: "connection",
        secretValue: connectionUrl,
      }),
    );
    const resolved = await dependencyResourceSecretStore.resolve(context, {
      secretRef: `appaloft://dependency-resources/${createdId}/connection`,
    });
    expect(resolved._unsafeUnwrap()).toMatchObject({
      secretRef: `appaloft://dependency-resources/${createdId}/connection`,
      secretValue: connectionUrl,
    });

    const shown = await showDependencyResource.execute(
      context,
      ShowDependencyResourceQuery.create({ dependencyResourceId: createdId })._unsafeUnwrap(),
    );
    const detail = JSON.stringify(shown._unsafeUnwrap());
    expect(detail).toContain(`appaloft://dependency-resources/${createdId}/connection`);
    expect(detail).not.toContain("super-secret");
    expect(detail).not.toContain("hidden");
  });

  test("[DEP-RES-REDIS-VALIDATION-001] rejects invalid Redis endpoint input", async () => {
    const { context, importDependencyResource } = await createHarness();

    const result = await importDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Broken Cache",
      connectionUrl: "https://cache.example.com",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "dependency-resource-validation",
      },
    });
  });

  test("[DEP-RES-REDIS-READ-001] [DEP-RES-REDIS-RENAME-001] lists and renames Redis resources", async () => {
    const { context, importDependencyResource, listDependencyResources, renameDependencyResource } =
      await createHarness();
    const created = (
      await importDependencyResource.execute(context, {
        kind: "redis",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External Cache",
        connectionUrl: "redis://default:secret@cache.example.com:6379/0",
      })
    )._unsafeUnwrap();

    const renamed = await renameDependencyResource.execute(context, {
      dependencyResourceId: created.id,
      name: "Primary Cache",
    });
    const list = await listDependencyResources.execute(
      context,
      ListDependencyResourcesQuery.create({ projectId: "prj_demo", kind: "redis" })._unsafeUnwrap(),
    );

    expect(renamed.isOk()).toBe(true);
    expect(list._unsafeUnwrap().items).toContainEqual(
      expect.objectContaining({
        id: created.id,
        kind: "redis",
        name: "Primary Cache",
        slug: "primary-cache",
      }),
    );
  });

  test("[DEP-RES-REDIS-DELETE-001] [DEP-RES-REDIS-DELETE-002] deletes only unblocked Redis records", async () => {
    const { context, deleteDependencyResource, deleteSafetyReader, importDependencyResource } =
      await createHarness();
    const created = (
      await importDependencyResource.execute(context, {
        kind: "redis",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External Cache",
        connectionUrl: "redis://default:secret@cache.example.com:6379/0",
      })
    )._unsafeUnwrap();
    deleteSafetyReader.setBlockers(created.id, [{ kind: "resource-binding", count: 1 }]);

    const blocked = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });
    deleteSafetyReader.setBlockers(created.id, []);
    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId: created.id,
    });

    expect(blocked.isErr()).toBe(true);
    expect(blocked._unsafeUnwrapErr().code).toBe("dependency_resource_delete_blocked");
    expect(deleted.isOk()).toBe(true);
  });
});
