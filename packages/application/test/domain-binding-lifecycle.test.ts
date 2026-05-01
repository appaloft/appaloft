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
  MemoryResourceReadModel,
  MemoryResourceRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";
import {
  type CertificateReadModel,
  type CertificateSummary,
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../src";
import {
  CheckDomainBindingDeleteSafetyQueryService,
  ConfigureDomainBindingRouteUseCase,
  CreateDomainBindingUseCase,
  DeleteDomainBindingUseCase,
  RetryDomainBindingVerificationUseCase,
  ShowDomainBindingQueryService,
} from "../src/use-cases";

class StaticCertificateReadModel implements CertificateReadModel {
  constructor(private readonly certificates: CertificateSummary[] = []) {}

  async list(
    context: RepositoryContext,
    input?: {
      domainBindingId?: string;
    },
  ): Promise<CertificateSummary[]> {
    void context;
    return this.certificates.filter((certificate) =>
      input?.domainBindingId ? certificate.domainBindingId === input.domainBindingId : true,
    );
  }

  async findOne(
    context: RepositoryContext,
    input: {
      certificateId: string;
    },
  ): Promise<CertificateSummary | null> {
    void context;
    return this.certificates.find((certificate) => certificate.id === input.certificateId) ?? null;
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_domain_binding_lifecycle_test",
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

function activeCertificate(input: {
  certificateId: string;
  domainBindingId: string;
}): CertificateSummary {
  return {
    id: input.certificateId,
    domainBindingId: input.domainBindingId,
    domainName: "www.example.com",
    status: "active",
    source: "managed",
    providerKey: "fake-acme",
    challengeType: "http-01",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

async function seedRoutingContext() {
  const context = createTestContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const idGenerator = new SequenceIdGenerator();
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
    idGenerator,
    eventBus,
    logger,
  );
  const createBinding = async (domainName: string) => {
    const created = await createUseCase.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domainName,
      proxyKind: "traefik",
      tlsMode: "auto",
    });
    expect(created.isOk()).toBe(true);
    return created._unsafeUnwrap().id;
  };

  return {
    clock,
    context,
    domainBindings,
    eventBus,
    idGenerator,
    logger,
    repositoryContext,
    resourceReadModel: new MemoryResourceReadModel(resources, undefined, domainBindings),
    domainBindingReadModel: new MemoryDomainBindingReadModel(domainBindings),
    createBinding,
  };
}

describe("Domain binding lifecycle", () => {
  test("ROUTE-TLS-CMD-021 configures canonical redirect route explicitly", async () => {
    const seed = await seedRoutingContext();
    const targetId = await seed.createBinding("app.example.com");
    const sourceId = await seed.createBinding("www.example.com");
    const useCase = new ConfigureDomainBindingRouteUseCase(
      seed.domainBindings,
      seed.clock,
      seed.eventBus,
      seed.logger,
    );

    const result = await useCase.execute(seed.context, {
      domainBindingId: sourceId,
      redirectTo: "app.example.com",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().id).toBe(sourceId);

    const source = await seed.domainBindings.findOne(
      seed.repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(sourceId)),
    );
    const target = await seed.domainBindings.findOne(
      seed.repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(targetId)),
    );

    expect(source?.toState().redirectTo?.value).toBe("app.example.com");
    expect(source?.toState().redirectStatus?.value).toBe(308);
    expect(target?.toState().redirectTo).toBeUndefined();
    expect(eventsByType(seed.eventBus.events, "domain-binding-route-configured")).toHaveLength(1);
  });

  test("ROUTE-TLS-READMODEL-011 shows route readiness and delete safety from shared read models", async () => {
    const seed = await seedRoutingContext();
    const domainBindingId = await seed.createBinding("www.example.com");
    const certificateReadModel = new StaticCertificateReadModel([
      activeCertificate({ certificateId: "crt_active", domainBindingId }),
    ]);
    const show = new ShowDomainBindingQueryService(
      seed.domainBindingReadModel,
      certificateReadModel,
      seed.resourceReadModel,
    );
    const deleteCheck = new CheckDomainBindingDeleteSafetyQueryService(
      seed.domainBindingReadModel,
      certificateReadModel,
    );

    const detail = await show.execute(seed.context, { domainBindingId });
    const safety = await deleteCheck.execute(seed.context, { domainBindingId });

    expect(detail.isOk()).toBe(true);
    expect(detail._unsafeUnwrap().binding.id).toBe(domainBindingId);
    expect(detail._unsafeUnwrap().routeReadiness.status).toBe("pending");
    expect(detail._unsafeUnwrap().routeReadiness.routeBehavior).toBe("serve");
    expect(detail._unsafeUnwrap().deleteSafety.safeToDelete).toBe(false);
    expect(safety.isOk()).toBe(true);
    expect(safety._unsafeUnwrap()).toMatchObject({
      domainBindingId,
      safeToDelete: false,
      preservesGeneratedAccess: true,
      preservesDeploymentSnapshots: true,
      preservesServerAppliedRouteAudit: true,
    });
  });

  test("ROUTE-TLS-CMD-022 deletes only when no blocking certificate state exists", async () => {
    const seed = await seedRoutingContext();
    const domainBindingId = await seed.createBinding("www.example.com");
    const blocked = new DeleteDomainBindingUseCase(
      seed.domainBindings,
      new StaticCertificateReadModel([
        activeCertificate({ certificateId: "crt_active", domainBindingId }),
      ]),
      seed.clock,
      seed.eventBus,
      seed.logger,
    );

    const blockedResult = await blocked.execute(seed.context, {
      domainBindingId,
      confirmation: { domainBindingId },
    });
    expect(blockedResult.isErr()).toBe(true);
    expect(blockedResult._unsafeUnwrapErr().code).toBe("conflict");

    const allowed = new DeleteDomainBindingUseCase(
      seed.domainBindings,
      new StaticCertificateReadModel(),
      seed.clock,
      seed.eventBus,
      seed.logger,
    );
    const deleted = await allowed.execute(seed.context, {
      domainBindingId,
      confirmation: { domainBindingId },
    });

    expect(deleted.isOk()).toBe(true);
    const persisted = await seed.domainBindings.findOne(
      seed.repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(domainBindingId)),
    );
    expect(persisted?.toState().status.value).toBe("deleted");
    expect(eventsByType(seed.eventBus.events, "domain-binding-deleted")).toHaveLength(1);
  });

  test("ROUTE-TLS-CMD-023 retries ownership verification without certificate lifecycle side effects", async () => {
    const seed = await seedRoutingContext();
    const domainBindingId = await seed.createBinding("www.example.com");
    const useCase = new RetryDomainBindingVerificationUseCase(
      seed.domainBindings,
      seed.idGenerator,
      seed.clock,
      seed.eventBus,
      seed.logger,
    );

    const result = await useCase.execute(seed.context, { domainBindingId });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().verificationAttemptId).toBe("dva_0003");
    const persisted = await seed.domainBindings.findOne(
      seed.repositoryContext,
      DomainBindingByIdSpec.create(DomainBindingId.rehydrate(domainBindingId)),
    );
    expect(persisted?.toState().status.value).toBe("pending_verification");
    expect(persisted?.toState().verificationAttempts).toHaveLength(2);
    expect(eventsByType(seed.eventBus.events, "domain-binding-verification-retried")).toHaveLength(
      1,
    );
    expect(eventsByType(seed.eventBus.events, "certificate-requested")).toHaveLength(0);
  });
});
