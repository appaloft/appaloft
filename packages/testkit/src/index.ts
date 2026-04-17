import {
  type AppLogger,
  type CertificateProviderIssueInput,
  type CertificateProviderIssueResult,
  type CertificateProviderPort,
  type CertificateReadModel,
  type CertificateRepository,
  type CertificateRetryCandidate,
  type CertificateRetryCandidateReader,
  type CertificateSecretStore,
  type CertificateSummary,
  type Clock,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentRepository,
  type DeploymentSummary,
  type DestinationRepository,
  type DomainBindingReadModel,
  type DomainBindingRepository,
  type DomainBindingSummary,
  type DomainRouteBindingCandidate,
  type DomainRouteBindingReader,
  type DomainRouteFailureCandidate,
  type DomainRouteFailureCandidateReader,
  type EnvironmentReadModel,
  type EnvironmentRepository,
  type EnvironmentSummary,
  type EventBus,
  type ExecutionContext,
  type IdGenerator,
  type ProjectReadModel,
  type ProjectRepository,
  projectResourceAccessSummary,
  type RepositoryContext,
  type ResourceReadModel,
  type ResourceRepository,
  type ResourceSummary,
  type ServerReadModel,
  type ServerRepository,
} from "@appaloft/application";
import {
  ActiveDomainBindingByOwnerAndRouteSpec,
  Certificate,
  CertificateByAttemptIdempotencyKeySpec,
  CertificateByDomainBindingIdSpec,
  CertificateByIdSpec,
  type CertificateMutationSpec,
  type CertificateSelectionSpec,
  Deployment,
  DeploymentByIdSpec,
  type DeploymentMutationSpec,
  type DeploymentSelectionSpec,
  DeploymentTarget,
  DeploymentTargetByIdSpec,
  DeploymentTargetByProviderAndHostSpec,
  type DeploymentTargetMutationSpec,
  type DeploymentTargetSelectionSpec,
  Destination,
  DestinationByIdSpec,
  DestinationByServerAndNameSpec,
  type DestinationMutationSpec,
  type DestinationSelectionSpec,
  DomainBinding,
  DomainBindingByIdempotencyKeySpec,
  DomainBindingByIdSpec,
  type DomainBindingMutationSpec,
  type DomainBindingSelectionSpec,
  type DomainError,
  Environment,
  EnvironmentByIdSpec,
  EnvironmentByProjectAndNameSpec,
  type EnvironmentMutationSpec,
  type EnvironmentSelectionSpec,
  LatestDeploymentSpec,
  ok,
  Project,
  ProjectByIdSpec,
  ProjectBySlugSpec,
  type ProjectMutationSpec,
  type ProjectSelectionSpec,
  Resource,
  ResourceByEnvironmentAndSlugSpec,
  ResourceByIdSpec,
  type ResourceMutationSpec,
  type ResourceSelectionSpec,
  type Result,
} from "@appaloft/core";

export class FixedClock implements Clock {
  constructor(private value = "2026-01-01T00:00:00.000Z") {}

  now(): string {
    return this.value;
  }

  set(value: string): void {
    this.value = value;
  }
}

export class SequenceIdGenerator implements IdGenerator {
  private sequence = 0;

  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${String(this.sequence).padStart(4, "0")}`;
  }
}

export class CapturedEventBus implements EventBus {
  readonly events: unknown[] = [];

  async publish(context: ExecutionContext, events: unknown[]): Promise<void> {
    void context;
    this.events.push(...events);
  }
}

export class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

export class FakeCertificateProvider implements CertificateProviderPort {
  readonly inputs: CertificateProviderIssueInput[] = [];

  constructor(private result: Result<CertificateProviderIssueResult, DomainError>) {}

  setResult(result: Result<CertificateProviderIssueResult, DomainError>): void {
    this.result = result;
  }

  async issue(
    context: ExecutionContext,
    input: CertificateProviderIssueInput,
  ): Promise<Result<CertificateProviderIssueResult, DomainError>> {
    void context;
    this.inputs.push(input);
    return this.result;
  }
}

export class FakeCertificateSecretStore implements CertificateSecretStore {
  readonly stored: CertificateProviderIssueResult[] = [];

  constructor(private secretRefPrefix = "secret") {}

  async store(
    context: ExecutionContext,
    material: CertificateProviderIssueResult,
  ): Promise<Result<{ secretRef: string }, DomainError>> {
    void context;
    this.stored.push(material);
    return ok({
      secretRef: `${this.secretRefPrefix}://${material.certificateId}/${material.attemptId}`,
    });
  }
}

export class MemoryProjectRepository implements ProjectRepository {
  readonly items = new Map<string, Project>();

  async upsert(
    context: RepositoryContext,
    project: Project,
    spec: ProjectMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(project.toState().id.value, Project.rehydrate(project.toState()));
  }

  async findOne(context: RepositoryContext, spec: ProjectSelectionSpec): Promise<Project | null> {
    void context;
    if (spec instanceof ProjectByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof ProjectBySlugSpec) {
      for (const project of this.items.values()) {
        if (project.toState().slug.equals(spec.slug)) {
          return project;
        }
      }
    }

    return null;
  }
}

export class MemoryProjectReadModel implements ProjectReadModel {
  constructor(private readonly repository: MemoryProjectRepository) {}

  async list(context: RepositoryContext) {
    void context;
    return [...this.repository.items.values()].map((project) => {
      const state = project.toState();
      return {
        id: state.id.value,
        name: state.name.value,
        slug: state.slug.value,
        ...(state.description ? { description: state.description.value } : {}),
        createdAt: state.createdAt.value,
      };
    });
  }
}

export class MemoryServerRepository implements ServerRepository {
  readonly items = new Map<string, DeploymentTarget>();

  async upsert(
    context: RepositoryContext,
    server: DeploymentTarget,
    spec: DeploymentTargetMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(server.toState().id.value, DeploymentTarget.rehydrate(server.toState()));
  }

  async findOne(
    context: RepositoryContext,
    spec: DeploymentTargetSelectionSpec,
  ): Promise<DeploymentTarget | null> {
    void context;
    if (spec instanceof DeploymentTargetByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof DeploymentTargetByProviderAndHostSpec) {
      for (const server of this.items.values()) {
        const state = server.toState();
        if (state.providerKey.equals(spec.providerKey) && state.host.equals(spec.host)) {
          return server;
        }
      }
    }

    return null;
  }
}

export class MemoryServerReadModel implements ServerReadModel {
  constructor(private readonly repository: MemoryServerRepository) {}

  async list(context: RepositoryContext) {
    void context;
    return [...this.repository.items.values()].map((server) => {
      const state = server.toState();
      return {
        id: state.id.value,
        name: state.name.value,
        host: state.host.value,
        port: state.port.value,
        providerKey: state.providerKey.value,
        createdAt: state.createdAt.value,
      };
    });
  }
}

export class MemoryDestinationRepository implements DestinationRepository {
  readonly items = new Map<string, Destination>();

  async upsert(
    context: RepositoryContext,
    destination: Destination,
    spec: DestinationMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(destination.toState().id.value, Destination.rehydrate(destination.toState()));
  }

  async findOne(
    context: RepositoryContext,
    spec: DestinationSelectionSpec,
  ): Promise<Destination | null> {
    void context;
    if (spec instanceof DestinationByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof DestinationByServerAndNameSpec) {
      for (const destination of this.items.values()) {
        const state = destination.toState();
        if (state.serverId.equals(spec.serverId) && state.name.equals(spec.name)) {
          return destination;
        }
      }
    }

    return null;
  }
}

export class MemoryEnvironmentRepository implements EnvironmentRepository {
  readonly items = new Map<string, Environment>();

  async upsert(
    context: RepositoryContext,
    environment: Environment,
    spec: EnvironmentMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(environment.toState().id.value, Environment.rehydrate(environment.toState()));
  }

  async findOne(
    context: RepositoryContext,
    spec: EnvironmentSelectionSpec,
  ): Promise<Environment | null> {
    void context;
    if (spec instanceof EnvironmentByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof EnvironmentByProjectAndNameSpec) {
      for (const environment of this.items.values()) {
        const state = environment.toState();
        if (state.projectId.equals(spec.projectId) && state.name.equals(spec.name)) {
          return environment;
        }
      }
    }

    return null;
  }
}

export class MemoryEnvironmentReadModel implements EnvironmentReadModel {
  constructor(
    private readonly repository: MemoryEnvironmentRepository,
    private readonly secretMask = "****",
  ) {}

  async list(context: RepositoryContext, projectId?: string) {
    void context;
    return [...this.repository.items.values()]
      .map((environment) => environment.toState())
      .filter((environment) => (projectId ? environment.projectId.value === projectId : true))
      .map(
        (environment): EnvironmentSummary => ({
          id: environment.id.value,
          projectId: environment.projectId.value,
          name: environment.name.value,
          kind: environment.kind.value,
          createdAt: environment.createdAt.value,
          ...(environment.parentEnvironmentId
            ? { parentEnvironmentId: environment.parentEnvironmentId.value }
            : {}),
          maskedVariables: environment.variables.map((variable) => ({
            key: variable.key,
            value: variable.isSecret ? this.secretMask : variable.value,
            scope: variable.scope as EnvironmentSummary["maskedVariables"][number]["scope"],
            exposure:
              variable.exposure as EnvironmentSummary["maskedVariables"][number]["exposure"],
            isSecret: variable.isSecret,
            kind: variable.kind as EnvironmentSummary["maskedVariables"][number]["kind"],
          })),
        }),
      );
  }

  async findById(context: RepositoryContext, id: string) {
    const environments = await this.list(context);
    return environments.find((environment) => environment.id === id) ?? null;
  }
}

export class MemoryResourceRepository implements ResourceRepository {
  readonly items = new Map<string, Resource>();

  async upsert(
    context: RepositoryContext,
    resource: Resource,
    spec: ResourceMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(resource.toState().id.value, Resource.rehydrate(resource.toState()));
  }

  async findOne(context: RepositoryContext, spec: ResourceSelectionSpec): Promise<Resource | null> {
    void context;
    if (spec instanceof ResourceByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof ResourceByEnvironmentAndSlugSpec) {
      for (const resource of this.items.values()) {
        const state = resource.toState();
        if (
          state.projectId.equals(spec.projectId) &&
          state.environmentId.equals(spec.environmentId) &&
          state.slug.equals(spec.slug)
        ) {
          return resource;
        }
      }
    }

    return null;
  }
}

export class MemoryResourceReadModel implements ResourceReadModel {
  constructor(
    private readonly repository: MemoryResourceRepository,
    private readonly deployments?: MemoryDeploymentRepository,
    private readonly domainBindings?: { items: Map<string, DomainBinding> },
  ) {}

  async list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ) {
    void context;
    return [...this.repository.items.values()]
      .map((resource) => resource.toState())
      .filter((resource) =>
        input?.projectId ? resource.projectId.value === input.projectId : true,
      )
      .filter((resource) =>
        input?.environmentId ? resource.environmentId.value === input.environmentId : true,
      )
      .map((resource): ResourceSummary => {
        const deployments = [...(this.deployments?.items.values() ?? [])]
          .map((deployment) => deployment.toState())
          .filter((deployment) => deployment.resourceId.equals(resource.id))
          .sort((left, right) => right.createdAt.value.localeCompare(left.createdAt.value));
        const domainBindings = [...(this.domainBindings?.items.values() ?? [])]
          .map((domainBinding) => domainBinding.toState())
          .filter((domainBinding) => domainBinding.resourceId.equals(resource.id))
          .sort((left, right) => right.createdAt.value.localeCompare(left.createdAt.value));
        const lastDeployment = deployments[0];
        const accessSummary = projectResourceAccessSummary(
          deployments.map((deployment) => ({
            id: deployment.id.value,
            status: deployment.status.value,
            createdAt: deployment.createdAt.value,
            runtimePlan: {
              execution: {
                ...(deployment.runtimePlan.execution.accessRoutes.length > 0
                  ? {
                      accessRoutes: deployment.runtimePlan.execution.accessRoutes.map((route) => ({
                        proxyKind: route.proxyKind,
                        domains: route.domains,
                        pathPrefix: route.pathPrefix,
                        tlsMode: route.tlsMode,
                        ...(typeof route.targetPort === "number"
                          ? { targetPort: route.targetPort }
                          : {}),
                      })),
                    }
                  : {}),
                ...(deployment.runtimePlan.execution.metadata
                  ? { metadata: deployment.runtimePlan.execution.metadata }
                  : {}),
              },
            },
          })),
          domainBindings.map((domainBinding) => ({
            id: domainBinding.id.value,
            status: domainBinding.status.value,
            createdAt: domainBinding.createdAt.value,
            domainName: domainBinding.domainName.value,
            pathPrefix: domainBinding.pathPrefix.value,
            proxyKind: domainBinding.proxyKind.value,
            tlsMode: domainBinding.tlsMode.value,
          })),
        );

        return {
          id: resource.id.value,
          projectId: resource.projectId.value,
          environmentId: resource.environmentId.value,
          ...(resource.destinationId ? { destinationId: resource.destinationId.value } : {}),
          name: resource.name.value,
          slug: resource.slug.value,
          kind: resource.kind.value,
          ...(resource.description ? { description: resource.description.value } : {}),
          services: resource.services.map((service) => ({
            name: service.name.value,
            kind: service.kind.value,
          })),
          ...(resource.networkProfile
            ? {
                networkProfile: {
                  internalPort: resource.networkProfile.internalPort.value,
                  upstreamProtocol: resource.networkProfile.upstreamProtocol.value,
                  exposureMode: resource.networkProfile.exposureMode.value,
                  ...(resource.networkProfile.targetServiceName
                    ? { targetServiceName: resource.networkProfile.targetServiceName.value }
                    : {}),
                  ...(resource.networkProfile.hostPort
                    ? { hostPort: resource.networkProfile.hostPort.value }
                    : {}),
                },
              }
            : {}),
          deploymentCount: deployments.length,
          ...(lastDeployment
            ? {
                lastDeploymentId: lastDeployment.id.value,
                lastDeploymentStatus: lastDeployment.status.value,
              }
            : {}),
          ...(accessSummary ? { accessSummary } : {}),
          createdAt: resource.createdAt.value,
        };
      });
  }
}

export class MemoryDeploymentRepository implements DeploymentRepository {
  readonly items = new Map<string, Deployment>();

  async upsert(
    context: RepositoryContext,
    deployment: Deployment,
    spec: DeploymentMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(deployment.toState().id.value, Deployment.rehydrate(deployment.toState()));
  }

  async findOne(
    context: RepositoryContext,
    spec: DeploymentSelectionSpec,
  ): Promise<Deployment | null> {
    void context;
    if (spec instanceof DeploymentByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof LatestDeploymentSpec) {
      return (
        [...this.items.values()]
          .filter((deployment) => deployment.toState().resourceId.equals(spec.resourceId))
          .sort((left, right) =>
            right.toState().createdAt.value.localeCompare(left.toState().createdAt.value),
          )[0] ?? null
      );
    }

    return null;
  }
}

export class MemoryDomainBindingRepository implements DomainBindingRepository {
  readonly items = new Map<string, DomainBinding>();

  async upsert(
    context: RepositoryContext,
    domainBinding: DomainBinding,
    spec: DomainBindingMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(
      domainBinding.toState().id.value,
      DomainBinding.rehydrate(domainBinding.toState()),
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: DomainBindingSelectionSpec,
  ): Promise<DomainBinding | null> {
    void context;
    if (spec instanceof DomainBindingByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof DomainBindingByIdempotencyKeySpec) {
      for (const domainBinding of this.items.values()) {
        if (spec.isSatisfiedBy(domainBinding)) {
          return domainBinding;
        }
      }
    }

    if (spec instanceof ActiveDomainBindingByOwnerAndRouteSpec) {
      for (const domainBinding of this.items.values()) {
        if (spec.isSatisfiedBy(domainBinding)) {
          return domainBinding;
        }
      }
    }

    return null;
  }
}

export class MemoryDomainBindingReadModel implements DomainBindingReadModel {
  constructor(private readonly repository: MemoryDomainBindingRepository) {}

  async list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      resourceId?: string;
    },
  ) {
    void context;
    return [...this.repository.items.values()]
      .map((domainBinding) => domainBinding.toState())
      .filter((domainBinding) =>
        input?.projectId ? domainBinding.projectId.value === input.projectId : true,
      )
      .filter((domainBinding) =>
        input?.environmentId ? domainBinding.environmentId.value === input.environmentId : true,
      )
      .filter((domainBinding) =>
        input?.resourceId ? domainBinding.resourceId.value === input.resourceId : true,
      )
      .map(
        (domainBinding): DomainBindingSummary => ({
          id: domainBinding.id.value,
          projectId: domainBinding.projectId.value,
          environmentId: domainBinding.environmentId.value,
          resourceId: domainBinding.resourceId.value,
          serverId: domainBinding.serverId.value,
          destinationId: domainBinding.destinationId.value,
          domainName: domainBinding.domainName.value,
          pathPrefix: domainBinding.pathPrefix.value,
          proxyKind: domainBinding.proxyKind.value,
          tlsMode: domainBinding.tlsMode.value,
          certificatePolicy: domainBinding.certificatePolicy.value,
          status: domainBinding.status.value,
          ...(domainBinding.dnsObservation
            ? {
                dnsObservation: {
                  status: domainBinding.dnsObservation.status.value,
                  expectedTargets: domainBinding.dnsObservation.expectedTargets.map(
                    (target) => target.value,
                  ),
                  observedTargets: domainBinding.dnsObservation.observedTargets.map(
                    (target) => target.value,
                  ),
                  ...(domainBinding.dnsObservation.checkedAt
                    ? { checkedAt: domainBinding.dnsObservation.checkedAt.value }
                    : {}),
                  ...(domainBinding.dnsObservation.message
                    ? { message: domainBinding.dnsObservation.message.value }
                    : {}),
                },
              }
            : {}),
          ...(domainBinding.routeFailure
            ? {
                routeFailure: {
                  deploymentId: domainBinding.routeFailure.deploymentId.value,
                  failedAt: domainBinding.routeFailure.failedAt.value,
                  errorCode: domainBinding.routeFailure.errorCode.value,
                  failurePhase: domainBinding.routeFailure.failurePhase.value,
                  retriable: domainBinding.routeFailure.retriable,
                  ...(domainBinding.routeFailure.errorMessage
                    ? { errorMessage: domainBinding.routeFailure.errorMessage.value }
                    : {}),
                },
              }
            : {}),
          verificationAttemptCount: domainBinding.verificationAttempts.length,
          createdAt: domainBinding.createdAt.value,
        }),
      );
  }
}

export class MemoryDomainRouteBindingReader implements DomainRouteBindingReader {
  constructor(private readonly domainBindings: MemoryDomainBindingRepository) {}

  async listDeployableBindings(
    context: RepositoryContext,
    input: {
      projectId: string;
      environmentId: string;
      resourceId: string;
      serverId: string;
      destinationId: string;
    },
  ): Promise<DomainRouteBindingCandidate[]> {
    void context;
    return [...this.domainBindings.items.values()]
      .map((domainBinding) => domainBinding.toState())
      .filter((domainBinding) => domainBinding.projectId.value === input.projectId)
      .filter((domainBinding) => domainBinding.environmentId.value === input.environmentId)
      .filter((domainBinding) => domainBinding.resourceId.value === input.resourceId)
      .filter((domainBinding) => domainBinding.serverId.value === input.serverId)
      .filter((domainBinding) => domainBinding.destinationId.value === input.destinationId)
      .filter(
        (domainBinding) =>
          domainBinding.status.value === "bound" ||
          domainBinding.status.value === "certificate_pending" ||
          domainBinding.status.value === "ready" ||
          domainBinding.status.value === "not_ready",
      )
      .sort((left, right) => right.createdAt.value.localeCompare(left.createdAt.value))
      .map((domainBinding) => ({
        id: domainBinding.id.value,
        domainName: domainBinding.domainName.value,
        pathPrefix: domainBinding.pathPrefix.value,
        proxyKind: domainBinding.proxyKind.value,
        tlsMode: domainBinding.tlsMode.value,
        status: domainBinding.status.value,
        createdAt: domainBinding.createdAt.value,
      }));
  }
}

export class MemoryDomainRouteFailureCandidateReader implements DomainRouteFailureCandidateReader {
  constructor(
    private readonly deployments: MemoryDeploymentRepository,
    private readonly domainBindings: MemoryDomainBindingRepository,
  ) {}

  async listAffectedBindings(
    context: RepositoryContext,
    input: { deploymentId: string },
  ): Promise<DomainRouteFailureCandidate[]> {
    void context;
    const deployment = this.deployments.items.get(input.deploymentId)?.toState();

    if (!deployment) {
      return [];
    }

    const candidates: DomainRouteFailureCandidate[] = [];

    for (const domainBinding of this.domainBindings.items.values()) {
      const state = domainBinding.toState();
      if (
        state.projectId.equals(deployment.projectId) &&
        state.environmentId.equals(deployment.environmentId) &&
        state.resourceId.equals(deployment.resourceId) &&
        state.serverId.equals(deployment.serverId) &&
        state.destinationId.equals(deployment.destinationId) &&
        (state.status.value === "bound" ||
          state.status.value === "certificate_pending" ||
          state.status.value === "ready" ||
          state.status.value === "not_ready")
      ) {
        candidates.push({
          domainBindingId: state.id.value,
        });
      }
    }

    return candidates;
  }
}

export class MemoryCertificateRepository implements CertificateRepository {
  readonly items = new Map<string, Certificate>();

  async upsert(
    context: RepositoryContext,
    certificate: Certificate,
    spec: CertificateMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(certificate.toState().id.value, Certificate.rehydrate(certificate.toState()));
  }

  async findOne(
    context: RepositoryContext,
    spec: CertificateSelectionSpec,
  ): Promise<Certificate | null> {
    void context;
    if (spec instanceof CertificateByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof CertificateByDomainBindingIdSpec) {
      for (const certificate of this.items.values()) {
        if (spec.isSatisfiedBy(certificate)) {
          return certificate;
        }
      }
    }

    if (spec instanceof CertificateByAttemptIdempotencyKeySpec) {
      for (const certificate of this.items.values()) {
        if (spec.isSatisfiedBy(certificate)) {
          return certificate;
        }
      }
    }

    return null;
  }
}

function retryAttemptIsDue(input: {
  failedAt?: string;
  requestedAt: string;
  retryAfter?: string;
  now: string;
  defaultRetryDelaySeconds: number;
}): boolean {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) {
    return false;
  }

  if (input.retryAfter) {
    const retryAfterMs = Date.parse(input.retryAfter);
    return Number.isFinite(retryAfterMs) && retryAfterMs <= nowMs;
  }

  const basisMs = Date.parse(input.failedAt ?? input.requestedAt);
  if (!Number.isFinite(basisMs)) {
    return false;
  }

  return basisMs + input.defaultRetryDelaySeconds * 1000 <= nowMs;
}

export class MemoryCertificateRetryCandidateReader implements CertificateRetryCandidateReader {
  constructor(private readonly repository: MemoryCertificateRepository) {}

  async listDueRetries(
    context: RepositoryContext,
    input: {
      now: string;
      defaultRetryDelaySeconds: number;
      limit: number;
    },
  ): Promise<CertificateRetryCandidate[]> {
    void context;
    const candidates: CertificateRetryCandidate[] = [];

    for (const certificate of this.repository.items.values()) {
      const state = certificate.toState();
      const latestAttempt = state.attempts[state.attempts.length - 1];

      if (!latestAttempt || latestAttempt.status.value !== "retry_scheduled") {
        continue;
      }

      const retryAfter = latestAttempt.retryAfter?.value;
      const failedAt = latestAttempt.failedAt?.value;
      if (
        !retryAttemptIsDue({
          now: input.now,
          defaultRetryDelaySeconds: input.defaultRetryDelaySeconds,
          requestedAt: latestAttempt.requestedAt.value,
          ...(failedAt ? { failedAt } : {}),
          ...(retryAfter ? { retryAfter } : {}),
        })
      ) {
        continue;
      }

      candidates.push({
        certificateId: state.id.value,
        domainBindingId: state.domainBindingId.value,
        domainName: state.domainName.value,
        attemptId: latestAttempt.id.value,
        reason: latestAttempt.reason.value,
        providerKey: latestAttempt.providerKey.value,
        challengeType: latestAttempt.challengeType.value,
        requestedAt: latestAttempt.requestedAt.value,
        ...(failedAt ? { failedAt } : {}),
        ...(retryAfter ? { retryAfter } : {}),
      });

      if (candidates.length >= input.limit) {
        break;
      }
    }

    return candidates;
  }
}

export class MemoryCertificateReadModel implements CertificateReadModel {
  constructor(private readonly repository: MemoryCertificateRepository) {}

  async list(
    context: RepositoryContext,
    input?: {
      domainBindingId?: string;
    },
  ): Promise<CertificateSummary[]> {
    void context;
    return [...this.repository.items.values()]
      .map((certificate) => certificate.toState())
      .filter((certificate) =>
        input?.domainBindingId ? certificate.domainBindingId.value === input.domainBindingId : true,
      )
      .map((certificate): CertificateSummary => {
        const latestAttempt = certificate.attempts[certificate.attempts.length - 1];

        return {
          id: certificate.id.value,
          domainBindingId: certificate.domainBindingId.value,
          domainName: certificate.domainName.value,
          status: certificate.status.value,
          providerKey: certificate.providerKey.value,
          challengeType: certificate.challengeType.value,
          ...(certificate.issuedAt ? { issuedAt: certificate.issuedAt.value } : {}),
          ...(certificate.expiresAt ? { expiresAt: certificate.expiresAt.value } : {}),
          ...(certificate.fingerprint ? { fingerprint: certificate.fingerprint.value } : {}),
          ...(latestAttempt
            ? {
                latestAttempt: {
                  id: latestAttempt.id.value,
                  status: latestAttempt.status.value,
                  reason: latestAttempt.reason.value,
                  providerKey: latestAttempt.providerKey.value,
                  challengeType: latestAttempt.challengeType.value,
                  requestedAt: latestAttempt.requestedAt.value,
                  ...(latestAttempt.issuedAt ? { issuedAt: latestAttempt.issuedAt.value } : {}),
                  ...(latestAttempt.expiresAt ? { expiresAt: latestAttempt.expiresAt.value } : {}),
                  ...(latestAttempt.failedAt ? { failedAt: latestAttempt.failedAt.value } : {}),
                  ...(latestAttempt.failureCode
                    ? { errorCode: latestAttempt.failureCode.value }
                    : {}),
                  ...(latestAttempt.failurePhase
                    ? { failurePhase: latestAttempt.failurePhase.value }
                    : {}),
                  ...(latestAttempt.failureMessage
                    ? { failureMessage: latestAttempt.failureMessage.value }
                    : {}),
                  ...(latestAttempt.retriable === undefined
                    ? {}
                    : { retriable: latestAttempt.retriable }),
                  ...(latestAttempt.retryAfter
                    ? { retryAfter: latestAttempt.retryAfter.value }
                    : {}),
                },
              }
            : {}),
          createdAt: certificate.createdAt.value,
        };
      });
  }
}

export class MemoryDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly repository: MemoryDeploymentRepository) {}

  async list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ) {
    void context;
    return [...this.repository.items.values()]
      .map((deployment) => deployment.toState())
      .filter((deployment) =>
        input?.projectId ? deployment.projectId.value === input.projectId : true,
      )
      .filter((deployment) =>
        input?.resourceId ? deployment.resourceId.value === input.resourceId : true,
      )
      .map(
        (deployment): DeploymentSummary => ({
          id: deployment.id.value,
          projectId: deployment.projectId.value,
          environmentId: deployment.environmentId.value,
          resourceId: deployment.resourceId.value,
          serverId: deployment.serverId.value,
          destinationId: deployment.destinationId.value,
          status: deployment.status.value,
          runtimePlan: {
            id: deployment.runtimePlan.id,
            source: {
              kind: deployment.runtimePlan.source.kind,
              locator: deployment.runtimePlan.source.locator,
              displayName: deployment.runtimePlan.source.displayName,
              ...(deployment.runtimePlan.source.inspection
                ? {
                    inspection: {
                      ...(deployment.runtimePlan.source.inspection.runtimeFamily
                        ? { runtimeFamily: deployment.runtimePlan.source.inspection.runtimeFamily }
                        : {}),
                      ...(deployment.runtimePlan.source.inspection.framework
                        ? { framework: deployment.runtimePlan.source.inspection.framework }
                        : {}),
                      ...(deployment.runtimePlan.source.inspection.packageManager
                        ? {
                            packageManager: deployment.runtimePlan.source.inspection.packageManager,
                          }
                        : {}),
                      ...(deployment.runtimePlan.source.inspection.runtimeVersion
                        ? {
                            runtimeVersion: deployment.runtimePlan.source.inspection.runtimeVersion,
                          }
                        : {}),
                      ...(deployment.runtimePlan.source.inspection.projectName
                        ? { projectName: deployment.runtimePlan.source.inspection.projectName }
                        : {}),
                      ...(deployment.runtimePlan.source.inspection.detectedFiles.length > 0
                        ? { detectedFiles: deployment.runtimePlan.source.inspection.detectedFiles }
                        : {}),
                      ...(deployment.runtimePlan.source.inspection.detectedScripts.length > 0
                        ? {
                            detectedScripts:
                              deployment.runtimePlan.source.inspection.detectedScripts,
                          }
                        : {}),
                      ...(deployment.runtimePlan.source.inspection.dockerfilePath
                        ? {
                            dockerfilePath: deployment.runtimePlan.source.inspection.dockerfilePath,
                          }
                        : {}),
                      ...(deployment.runtimePlan.source.inspection.composeFilePath
                        ? {
                            composeFilePath:
                              deployment.runtimePlan.source.inspection.composeFilePath,
                          }
                        : {}),
                      ...(deployment.runtimePlan.source.inspection.jarPath
                        ? { jarPath: deployment.runtimePlan.source.inspection.jarPath }
                        : {}),
                    },
                  }
                : {}),
              ...(deployment.runtimePlan.source.metadata
                ? { metadata: deployment.runtimePlan.source.metadata }
                : {}),
            },
            buildStrategy: deployment.runtimePlan.buildStrategy,
            packagingMode: deployment.runtimePlan.packagingMode,
            ...(deployment.runtimePlan.runtimeArtifact
              ? {
                  runtimeArtifact: {
                    kind: deployment.runtimePlan.runtimeArtifact.kind,
                    intent: deployment.runtimePlan.runtimeArtifact.intent,
                    ...(deployment.runtimePlan.runtimeArtifact.image
                      ? { image: deployment.runtimePlan.runtimeArtifact.image }
                      : {}),
                    ...(deployment.runtimePlan.runtimeArtifact.composeFile
                      ? { composeFile: deployment.runtimePlan.runtimeArtifact.composeFile }
                      : {}),
                    ...(deployment.runtimePlan.runtimeArtifact.metadata
                      ? { metadata: deployment.runtimePlan.runtimeArtifact.metadata }
                      : {}),
                  },
                }
              : {}),
            execution: {
              kind: deployment.runtimePlan.execution.kind,
              ...(deployment.runtimePlan.execution.workingDirectory
                ? { workingDirectory: deployment.runtimePlan.execution.workingDirectory }
                : {}),
              ...(deployment.runtimePlan.execution.installCommand
                ? { installCommand: deployment.runtimePlan.execution.installCommand }
                : {}),
              ...(deployment.runtimePlan.execution.buildCommand
                ? { buildCommand: deployment.runtimePlan.execution.buildCommand }
                : {}),
              ...(deployment.runtimePlan.execution.startCommand
                ? { startCommand: deployment.runtimePlan.execution.startCommand }
                : {}),
              ...(deployment.runtimePlan.execution.healthCheckPath
                ? { healthCheckPath: deployment.runtimePlan.execution.healthCheckPath }
                : {}),
              ...(typeof deployment.runtimePlan.execution.port === "number"
                ? { port: deployment.runtimePlan.execution.port }
                : {}),
              ...(deployment.runtimePlan.execution.image
                ? { image: deployment.runtimePlan.execution.image }
                : {}),
              ...(deployment.runtimePlan.execution.dockerfilePath
                ? { dockerfilePath: deployment.runtimePlan.execution.dockerfilePath }
                : {}),
              ...(deployment.runtimePlan.execution.composeFile
                ? { composeFile: deployment.runtimePlan.execution.composeFile }
                : {}),
              ...(deployment.runtimePlan.execution.accessRoutes.length > 0
                ? {
                    accessRoutes: deployment.runtimePlan.execution.accessRoutes.map((route) => ({
                      proxyKind: route.proxyKind,
                      domains: route.domains,
                      pathPrefix: route.pathPrefix,
                      tlsMode: route.tlsMode,
                      ...(typeof route.targetPort === "number"
                        ? { targetPort: route.targetPort }
                        : {}),
                    })),
                  }
                : {}),
              ...(deployment.runtimePlan.execution.verificationSteps.length > 0
                ? {
                    verificationSteps: deployment.runtimePlan.execution.verificationSteps.map(
                      (step) => ({
                        kind: step.kind,
                        label: step.label,
                      }),
                    ),
                  }
                : {}),
              ...(deployment.runtimePlan.execution.metadata
                ? { metadata: deployment.runtimePlan.execution.metadata }
                : {}),
            },
            target: {
              kind: deployment.runtimePlan.target.kind,
              providerKey: deployment.runtimePlan.target.providerKey,
              serverIds: [...deployment.runtimePlan.target.serverIds],
              ...(deployment.runtimePlan.target.metadata
                ? { metadata: deployment.runtimePlan.target.metadata }
                : {}),
            },
            detectSummary: deployment.runtimePlan.detectSummary,
            generatedAt: deployment.runtimePlan.generatedAt,
            steps: deployment.runtimePlan.steps,
          },
          environmentSnapshot: {
            id: deployment.environmentSnapshot.id,
            environmentId: deployment.environmentSnapshot.environmentId,
            createdAt: deployment.environmentSnapshot.createdAt,
            precedence: [...deployment.environmentSnapshot.precedence],
            variables: deployment.environmentSnapshot.variables.map((variable) => ({
              key: variable.key,
              value: variable.value,
              kind: variable.kind as DeploymentSummary["environmentSnapshot"]["variables"][number]["kind"],
              exposure:
                variable.exposure as DeploymentSummary["environmentSnapshot"]["variables"][number]["exposure"],
              scope:
                variable.scope as DeploymentSummary["environmentSnapshot"]["variables"][number]["scope"],
              isSecret: variable.isSecret,
            })),
          },
          createdAt: deployment.createdAt.value,
          ...(deployment.startedAt ? { startedAt: deployment.startedAt.value } : {}),
          ...(deployment.finishedAt ? { finishedAt: deployment.finishedAt.value } : {}),
          ...(deployment.rollbackOfDeploymentId
            ? { rollbackOfDeploymentId: deployment.rollbackOfDeploymentId.value }
            : {}),
          logs: deployment.logs.map((log) => ({
            timestamp: log.timestamp,
            source: log.source as DeploymentLogSummary["source"],
            phase: log.phase as DeploymentLogSummary["phase"],
            level: log.level as DeploymentLogSummary["level"],
            message: log.message,
          })),
          logCount: deployment.logs.length,
        }),
      );
  }

  async findLogs(context: RepositoryContext, id: string): Promise<DeploymentLogSummary[]> {
    void context;
    return (this.repository.items.get(id)?.toState().logs ?? []).map((log) => ({
      timestamp: log.timestamp,
      source: log.source as DeploymentLogSummary["source"],
      phase: log.phase as DeploymentLogSummary["phase"],
      level: log.level as DeploymentLogSummary["level"],
      message: log.message,
    }));
  }
}
