import {
  CreatedAt,
  type DependencyResourceBindingReadinessState,
  DependencyResourceProviderFailureCode,
  DependencyResourceProviderRealizationAttemptId,
  DependencyResourceProviderRealizationStatusValue,
  DependencyResourceProviderResourceHandle,
  DependencyResourceSecretRef,
  DependencyResourceSourceModeValue,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DescriptionText,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  OccurredAt,
  ok,
  ProjectByIdSpec,
  ProjectId,
  ProviderKey,
  ResourceInstance,
  ResourceInstanceByEnvironmentAndSlugSpec,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  ResourceInstanceSlug,
  type Result,
  safeTry,
  UpsertResourceInstanceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type DependencyResourceReadModel,
  type DependencyResourceRepository,
  type DependencyResourceSecretStore,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type ManagedDependencyProviderPort,
  type ManagedDependencyResourceKind,
  type ManagedDependencySingleServerTarget,
  type OperationGuardPort,
  type ProcessAttemptRecorder,
  type ProjectRepository,
  type ServerRepository,
} from "../../ports";
import { NoopProcessAttemptRecorder } from "../../process-attempt-journal";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ProvisionDependencyResourceCommandInput } from "./provision-dependency-resource.command";

const appaloftOwnedDependencySecretRefPrefix = "appaloft://dependency-resources/";
const provisionDependencyResourceOperation = "dependency-resources.provision";
const provisionDependencyResourceOperationEntry = findOperationCatalogEntryByKey(
  provisionDependencyResourceOperation,
);
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

function blockedBindingReadiness(reason: string): DependencyResourceBindingReadinessState {
  return {
    status: "blocked",
    reason: DescriptionText.rehydrate(reason),
  };
}

function isAppaloftOwnedDependencySecretRef(secretRef: string): boolean {
  return secretRef.startsWith(appaloftOwnedDependencySecretRefPrefix);
}

function isProviderOwnedDependencySecretRef(secretRef: string): boolean {
  return secretRef.startsWith("secret://");
}

function defaultManagedProviderKey(kind: ManagedDependencyResourceKind): string {
  return `appaloft-managed-${kind}`;
}

async function resolveManagedDependencyBindingReadiness(input: {
  context: ExecutionContext;
  dependencyResourceSecretStore: DependencyResourceSecretStore;
  secretRef?: string;
  secretRefValid: boolean;
}): Promise<DependencyResourceBindingReadinessState> {
  if (!input.secretRef) {
    return blockedBindingReadiness("dependency_runtime_secret_ref_missing");
  }
  if (!input.secretRefValid) {
    return blockedBindingReadiness("dependency_runtime_secret_ref_invalid");
  }
  if (isAppaloftOwnedDependencySecretRef(input.secretRef)) {
    const resolved = await input.dependencyResourceSecretStore.resolve(input.context, {
      secretRef: input.secretRef,
    });
    return resolved.isOk()
      ? { status: "ready" }
      : blockedBindingReadiness("dependency_runtime_secret_unresolved");
  }
  if (isProviderOwnedDependencySecretRef(input.secretRef)) {
    return { status: "ready" };
  }
  return blockedBindingReadiness("dependency_runtime_secret_ref_unsupported");
}

@injectable()
export class ProvisionDependencyResourceUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
    @inject(tokens.dependencyResourceSecretStore)
    private readonly dependencyResourceSecretStore: DependencyResourceSecretStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.managedDependencyProvider)
    private readonly managedDependencyProvider: ManagedDependencyProviderPort,
    @inject(tokens.processAttemptRecorder)
    private readonly processAttemptRecorder: ProcessAttemptRecorder = new NoopProcessAttemptRecorder(),
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
    @inject(tokens.dependencyResourceReadModel, { isOptional: true })
    private readonly dependencyResourceReadModel?: DependencyResourceReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ProvisionDependencyResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      dependencyResourceReadModel,
      dependencyResourceRepository,
      dependencyResourceSecretStore,
      environmentRepository,
      eventBus,
      idGenerator,
      logger,
      managedDependencyProvider,
      operationGuardPort,
      processAttemptRecorder,
      projectRepository,
      serverRepository,
    } = this;

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const name = yield* ResourceInstanceName.create(input.name);
      const slug = yield* ResourceInstanceSlug.fromName(name);
      const kind = ResourceInstanceKindValue.rehydrate(input.kind);
      const providerKey = yield* ProviderKey.create(
        input.providerKey ?? defaultManagedProviderKey(input.kind),
      );
      const createdAt = yield* CreatedAt.create(clock.now());
      const attemptedAt = yield* OccurredAt.create(clock.now());
      const description = DescriptionText.fromOptional(input.description);
      if (!managedDependencyProvider.supports(providerKey.value, input.kind)) {
        return err(
          domainError.providerCapabilityUnsupported(
            "Provider does not support managed dependency realization",
            {
              phase: "dependency-resource-realization-admission",
              providerKey: providerKey.value,
              dependencyKind: input.kind,
              operation: provisionDependencyResourceOperation,
            },
          ),
        );
      }

      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );
      if (!project) {
        return err(domainError.notFound("project", projectId.value));
      }
      const projectState = project.toState();
      if (provisionDependencyResourceOperationEntry) {
        const checked = await checkOperationGuards({
          context,
          entry: provisionDependencyResourceOperationEntry,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          ...(projectState.organizationId
            ? { organizationId: projectState.organizationId.value }
            : {}),
          resourceRefs: {
            projectId: projectId.value,
            environmentId: environmentId.value,
            ...(input.serverId ? { serverId: input.serverId } : {}),
          },
          contextAttributes: {
            estimatedExternalProviderCalls: 1,
            estimatedSecretCount: 1,
            estimatedWriteUnits: 3,
            ...(dependencyResourceReadModel
              ? {
                  currentEnvironmentDependencyResourceCount:
                    await dependencyResourceReadModel.count(repositoryContext, {
                      environmentId: environmentId.value,
                      projectId: projectId.value,
                    }),
                  currentProjectDependencyResourceCount: await dependencyResourceReadModel.count(
                    repositoryContext,
                    {
                      projectId: projectId.value,
                    },
                  ),
                }
              : {}),
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }
      yield* project.ensureCanAcceptMutation(provisionDependencyResourceOperation);

      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );
      if (!environment) {
        return err(domainError.notFound("environment", environmentId.value));
      }
      if (!environment.toState().projectId.equals(projectId)) {
        return err(
          domainError.resourceContextMismatch("Environment does not belong to project", {
            phase: "context-resolution",
            projectId: projectId.value,
            environmentId: environmentId.value,
          }),
        );
      }

      const realizationTargetResult = input.serverId
        ? await resolveSingleServerTarget({
            context,
            serverRepository,
            serverId: input.serverId,
            operation: provisionDependencyResourceOperation,
          })
        : ok(undefined);
      const realizationTarget = yield* realizationTargetResult;

      const existing = await dependencyResourceRepository.findOne(
        repositoryContext,
        ResourceInstanceByEnvironmentAndSlugSpec.create(projectId, environmentId, kind, slug),
      );
      if (existing && existing.toState().status.value !== "deleted") {
        return err(
          domainError.conflict("dependency_resource_slug_conflict", {
            phase: "dependency-resource-validation",
            projectId: projectId.value,
            environmentId: environmentId.value,
            slug: slug.value,
          }),
        );
      }

      const dependencyResourceId = ResourceInstanceId.rehydrate(idGenerator.next("rsi"));
      const realizationAttemptId = DependencyResourceProviderRealizationAttemptId.rehydrate(
        idGenerator.next("dpr"),
      );
      const dependencyResource = yield* ResourceInstance.createDependencyResource({
        id: dependencyResourceId,
        projectId,
        environmentId,
        name,
        kind,
        sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
        providerKey,
        providerManaged: true,
        providerRealization: {
          status: DependencyResourceProviderRealizationStatusValue.pending(),
          attemptId: realizationAttemptId,
          attemptedAt,
        },
        ...(description ? { description } : {}),
        ...(input.backupRelationship
          ? {
              backupRelationship: {
                retentionRequired: input.backupRelationship.retentionRequired,
                ...(input.backupRelationship.reason
                  ? { reason: DescriptionText.rehydrate(input.backupRelationship.reason) }
                  : {}),
              },
            }
          : {}),
        createdAt,
      });

      await dependencyResourceRepository.upsert(
        repositoryContext,
        dependencyResource,
        UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
      );
      await recordManagedDependencyRealizationProcessAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        context,
        dependencyResource,
      });
      await publishDomainEventsAndReturn(context, eventBus, logger, dependencyResource, undefined);

      const realization = await managedDependencyProvider.realize(context, {
        dependencyResourceId: dependencyResourceId.value,
        projectId: projectId.value,
        environmentId: environmentId.value,
        kind: input.kind,
        providerKey: providerKey.value,
        name: name.value,
        slug: slug.value,
        attemptId: realizationAttemptId.value,
        requestedAt: attemptedAt.value,
        ...(realizationTarget ? { target: realizationTarget } : {}),
      });
      if (realization.isOk()) {
        const realizedAt = yield* OccurredAt.create(realization.value.realizedAt);
        const providerResourceHandle = yield* DependencyResourceProviderResourceHandle.create(
          realization.value.providerResourceHandle,
        );
        let realizedSecretRef = realization.value.secretRef;
        let secretStoreFailureMessage: string | undefined;
        if (realization.value.connectionSecretValue) {
          const storedConnection = await dependencyResourceSecretStore.storeConnection(context, {
            dependencyResourceId: dependencyResourceId.value,
            projectId: projectId.value,
            environmentId: environmentId.value,
            kind: input.kind,
            purpose: "connection",
            secretValue: realization.value.connectionSecretValue,
            storedAt: realizedAt.value,
          });
          if (storedConnection.isErr()) {
            secretStoreFailureMessage = storedConnection.error.message;
          } else {
            realizedSecretRef = storedConnection.value.secretRef;
          }
        }
        const connectionSecretRef = realizedSecretRef
          ? DependencyResourceSecretRef.create(realizedSecretRef)
          : undefined;
        const bindingReadiness = await resolveManagedDependencyBindingReadiness({
          context,
          dependencyResourceSecretStore,
          ...(realizedSecretRef ? { secretRef: realizedSecretRef } : {}),
          secretRefValid: connectionSecretRef ? connectionSecretRef.isOk() : false,
        });
        if (secretStoreFailureMessage) {
          const failureCode = yield* DependencyResourceProviderFailureCode.create(
            "dependency_secret_store_error",
          );
          yield* dependencyResource.markProviderRealizationFailed({
            attemptId: realizationAttemptId,
            failureCode,
            failureMessage: DescriptionText.rehydrate(secretStoreFailureMessage),
            failedAt: realizedAt,
          });
        } else {
          yield* dependencyResource.markProviderRealized({
            attemptId: realizationAttemptId,
            providerResourceHandle,
            endpoint: realization.value.endpoint,
            ...(connectionSecretRef?.isOk()
              ? { connectionSecretRef: connectionSecretRef.value }
              : {}),
            bindingReadiness,
            realizedAt,
          });
        }
      } else {
        const failedAt = yield* OccurredAt.create(clock.now());
        const failureCode = yield* DependencyResourceProviderFailureCode.create(
          realization.error.code,
        );
        yield* dependencyResource.markProviderRealizationFailed({
          attemptId: realizationAttemptId,
          failureCode,
          failureMessage: DescriptionText.rehydrate(realization.error.message),
          failedAt,
        });
      }

      await dependencyResourceRepository.upsert(
        repositoryContext,
        dependencyResource,
        UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
      );
      await recordManagedDependencyRealizationProcessAttempt({
        recorder: processAttemptRecorder,
        repositoryContext,
        context,
        dependencyResource,
      });
      await publishDomainEventsAndReturn(context, eventBus, logger, dependencyResource, undefined);

      return ok({ id: dependencyResource.toState().id.value });
    });
  }
}

async function resolveSingleServerTarget(input: {
  context: ExecutionContext;
  serverRepository: ServerRepository;
  serverId: string;
  operation: string;
}): Promise<Result<ManagedDependencySingleServerTarget>> {
  const serverId = DeploymentTargetId.rehydrate(input.serverId);
  const server = await input.serverRepository.findOne(
    toRepositoryContext(input.context),
    DeploymentTargetByIdSpec.create(serverId),
  );
  if (!server) {
    return err(domainError.notFound("server", input.serverId));
  }
  const lifecycleGuard = server.ensureCanAcceptNewWork(input.operation);
  if (lifecycleGuard.isErr()) {
    return err(lifecycleGuard.error);
  }
  const state = server.toState();
  if (state.targetKind.value !== "single-server") {
    return err(
      domainError.providerCapabilityUnsupported("Managed dependency target must be single-server", {
        phase: "dependency-resource-realization-admission",
        serverId: input.serverId,
        targetKind: state.targetKind.value,
        operation: input.operation,
      }),
    );
  }
  const providerKey = state.providerKey.value;
  if (providerKey !== "local-shell" && providerKey !== "generic-ssh") {
    return err(
      domainError.providerCapabilityUnsupported(
        "Managed dependency target must use local-shell or generic-ssh",
        {
          phase: "dependency-resource-realization-admission",
          serverId: input.serverId,
          providerKey,
          operation: input.operation,
        },
      ),
    );
  }
  return ok({
    serverId: state.id.value,
    providerKey,
    targetKind: "single-server",
    host: state.host.value,
    port: state.port.value,
    ...(state.credential?.username ? { username: state.credential.username.value } : {}),
    ...(state.credential?.privateKey ? { privateKey: state.credential.privateKey.value } : {}),
  });
}

async function recordManagedDependencyRealizationProcessAttempt(input: {
  recorder: ProcessAttemptRecorder;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  context: ExecutionContext;
  dependencyResource: ResourceInstance;
}): Promise<void> {
  const state = input.dependencyResource.toState();
  const realization = state.providerRealization;
  if (!realization) {
    return;
  }
  const realizationStatus = realization.status.value;
  const status =
    realizationStatus === "pending"
      ? "running"
      : realizationStatus === "failed"
        ? "failed"
        : "succeeded";
  const result = await input.recorder.record(input.repositoryContext, {
    id: realization.attemptId.value,
    kind: "system",
    status,
    operationKey: provisionDependencyResourceOperation,
    dedupeKey: `dependency-resource-realization:${state.id.value}:${realization.attemptId.value}`,
    correlationId: input.context.requestId,
    requestId: input.context.requestId,
    phase: "dependency-resource-realization",
    step: realizationStatus,
    ...(state.projectId ? { projectId: state.projectId.value } : {}),
    startedAt: realization.attemptedAt.value,
    updatedAt:
      realization.realizedAt?.value ?? realization.failedAt?.value ?? realization.attemptedAt.value,
    ...(status !== "running"
      ? {
          finishedAt:
            realization.realizedAt?.value ??
            realization.failedAt?.value ??
            realization.attemptedAt.value,
        }
      : {}),
    ...(realization.failureCode
      ? {
          errorCode: realization.failureCode.value,
          errorCategory: "async-processing",
          retriable: true,
        }
      : {}),
    nextActions: status === "failed" ? ["diagnostic", "manual-review"] : ["no-action"],
    safeDetails: {
      dependencyResourceId: state.id.value,
      dependencyKind: state.kind.value,
      providerKey: state.providerKey.value,
      providerManaged: state.providerManaged === true,
      realizationStatus,
    },
  });

  void result;
}
