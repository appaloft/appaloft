import {
  type Deployment,
  DeploymentByIdSpec,
  DeploymentId,
  type DomainError,
  domainError,
  err,
  LatestDeploymentSpec,
  ok,
  ResourceId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";
import { createCoordinationOwner, mutationCoordinationPolicies } from "../../mutation-coordination";
import {
  type DeploymentReadModel,
  type DeploymentRepository,
  type DeploymentSummary,
  type ExecutionBackend,
  type MutationCoordinator,
  ServerAppliedRouteStateBySourceFingerprintSpec,
  ServerAppliedRouteStateByTargetSpec,
  type ServerAppliedRouteStateRepository,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkDependencyProvenanceEntry,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type SourceLinkScheduledTaskProvenanceEntry,
  type SourceLinkStorageProvenanceEntry,
} from "../../ports";
import { tokens } from "../../tokens";
import { type DeleteDependencyResourceUseCase } from "../dependency-resources/delete-dependency-resource.use-case";
import { type DetachResourceStorageUseCase } from "../resources/detach-resource-storage.use-case";
import { type UnbindResourceDependencyUseCase } from "../resources/unbind-resource-dependency.use-case";
import { type DeleteScheduledTaskUseCase } from "../scheduled-tasks/delete-scheduled-task.use-case";
import { type DeleteStorageVolumeUseCase } from "../storage-volumes/delete-storage-volume.use-case";
import { type CleanupPreviewCommandInput } from "./cleanup-preview.command";
import { previewLifecycleScope } from "./deployment-mutation-scopes";

export interface CleanupPreviewResult {
  sourceFingerprint: string;
  status: "cleaned" | "already-clean";
  cleanedRuntime: boolean;
  removedServerAppliedRoute: boolean;
  removedSourceLink: boolean;
  removedDependencyBindings?: number;
  deletedDependencyResources?: number;
  removedStorageAttachments?: number;
  deletedStorageVolumes?: number;
  deletedScheduledTasks?: number;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  deploymentId?: string;
}

type CleanupDetails = Record<string, string | number | boolean | null | undefined>;

function withPreviewCleanupDetails(error: DomainError, details: CleanupDetails): DomainError {
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean | null>;

  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      ...safeDetails,
      phase: "preview-cleanup",
    },
  };
}

function previewCleanupInfraError(
  message: string,
  error: unknown,
  details: CleanupDetails,
): DomainError {
  return withPreviewCleanupDetails(
    domainError.infra(message, {
      errorMessage: error instanceof Error ? error.message : String(error),
    }),
    details,
  );
}

function deploymentSourceFingerprint(summary: DeploymentSummary): string | undefined {
  const metadata = summary.runtimePlan.execution.metadata ?? {};

  return metadata["access.sourceFingerprint"] ?? metadata["context.sourceFingerprint"];
}

function deploymentRuntimeSourceFingerprint(deployment: Deployment): string | undefined {
  const metadata = deployment.toState().runtimePlan.execution.metadata ?? {};

  return metadata["access.sourceFingerprint"] ?? metadata["context.sourceFingerprint"];
}

function cleanupStageFromError(error: DomainError, fallback: string): string {
  const cleanupStage = error.details?.cleanupStage;
  return typeof cleanupStage === "string" ? cleanupStage : fallback;
}

function isNotFoundError(error: DomainError): boolean {
  return error.code === "not_found";
}

function previewDependencyProvenanceEntries(input: {
  sourceLink: SourceLinkRecord;
  sourceFingerprint: string;
}): SourceLinkDependencyProvenanceEntry[] {
  const provenance = input.sourceLink.dependencyProvenance;
  if (
    provenance?.schemaVersion !== "source-link.dependency-provenance/v1" ||
    provenance.source !== "repository-config" ||
    provenance.sourceFingerprint !== input.sourceFingerprint
  ) {
    return [];
  }

  return provenance.entries.filter(
    (entry) =>
      entry.source === "managed" &&
      entry.lifecycle === "ephemeral" &&
      entry.resourceId === input.sourceLink.resourceId &&
      entry.dependencyResourceId.trim().length > 0 &&
      entry.bindingId.trim().length > 0,
  );
}

function previewStorageProvenanceEntries(input: {
  sourceLink: SourceLinkRecord;
  sourceFingerprint: string;
}): SourceLinkStorageProvenanceEntry[] {
  const provenance = input.sourceLink.storageProvenance;
  if (
    provenance?.schemaVersion !== "source-link.storage-provenance/v1" ||
    provenance.source !== "repository-config" ||
    provenance.sourceFingerprint !== input.sourceFingerprint
  ) {
    return [];
  }

  return provenance.entries.filter(
    (entry) =>
      entry.source === "managed" &&
      entry.lifecycle === "ephemeral" &&
      entry.resourceId === input.sourceLink.resourceId &&
      entry.storageVolumeId.trim().length > 0 &&
      entry.attachmentId.trim().length > 0,
  );
}

function previewScheduledTaskProvenanceEntries(input: {
  sourceLink: SourceLinkRecord;
  sourceFingerprint: string;
}): SourceLinkScheduledTaskProvenanceEntry[] {
  const provenance = input.sourceLink.scheduledTaskProvenance;
  if (
    provenance?.schemaVersion !== "source-link.scheduled-task-provenance/v1" ||
    provenance.source !== "repository-config" ||
    provenance.sourceFingerprint !== input.sourceFingerprint
  ) {
    return [];
  }

  return provenance.entries.filter(
    (entry) =>
      entry.source === "repository-config" &&
      entry.lifecycle === "ephemeral" &&
      entry.resourceId === input.sourceLink.resourceId &&
      entry.taskId.trim().length > 0,
  );
}

const missingUnbindResourceDependencyUseCase: Pick<UnbindResourceDependencyUseCase, "execute"> = {
  async execute() {
    return err(
      domainError.infra("Resource dependency unbind use case is not registered", {
        phase: "preview-cleanup",
        cleanupStage: "dependency-unbind",
      }),
    );
  },
};

const missingDeleteDependencyResourceUseCase: Pick<DeleteDependencyResourceUseCase, "execute"> = {
  async execute() {
    return err(
      domainError.infra("Dependency resource delete use case is not registered", {
        phase: "preview-cleanup",
        cleanupStage: "dependency-delete",
      }),
    );
  },
};

const missingDetachResourceStorageUseCase: Pick<DetachResourceStorageUseCase, "execute"> = {
  async execute() {
    return err(
      domainError.infra("Resource storage detach use case is not registered", {
        phase: "preview-cleanup",
        cleanupStage: "storage-detach",
      }),
    );
  },
};

const missingDeleteStorageVolumeUseCase: Pick<DeleteStorageVolumeUseCase, "execute"> = {
  async execute() {
    return err(
      domainError.infra("Storage volume delete use case is not registered", {
        phase: "preview-cleanup",
        cleanupStage: "storage-delete",
      }),
    );
  },
};

const missingDeleteScheduledTaskUseCase: Pick<DeleteScheduledTaskUseCase, "execute"> = {
  async execute() {
    return err(
      domainError.infra("Scheduled task delete use case is not registered", {
        phase: "preview-cleanup",
        cleanupStage: "scheduled-task-delete",
      }),
    );
  },
};

@injectable()
export class CleanupPreviewUseCase {
  constructor(
    @inject(tokens.sourceLinkRepository)
    private readonly sourceLinkRepository: SourceLinkRepository,
    @inject(tokens.serverAppliedRouteStateRepository)
    private readonly serverAppliedRouteStateRepository: ServerAppliedRouteStateRepository,
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.executionBackend)
    private readonly executionBackend: ExecutionBackend,
    @inject(tokens.mutationCoordinator)
    private readonly mutationCoordinator: MutationCoordinator,
    @inject(tokens.unbindResourceDependencyUseCase)
    private readonly unbindResourceDependencyUseCase: Pick<
      UnbindResourceDependencyUseCase,
      "execute"
    > = missingUnbindResourceDependencyUseCase,
    @inject(tokens.deleteDependencyResourceUseCase)
    private readonly deleteDependencyResourceUseCase: Pick<
      DeleteDependencyResourceUseCase,
      "execute"
    > = missingDeleteDependencyResourceUseCase,
    @inject(tokens.detachResourceStorageUseCase)
    private readonly detachResourceStorageUseCase: Pick<
      DetachResourceStorageUseCase,
      "execute"
    > = missingDetachResourceStorageUseCase,
    @inject(tokens.deleteStorageVolumeUseCase)
    private readonly deleteStorageVolumeUseCase: Pick<
      DeleteStorageVolumeUseCase,
      "execute"
    > = missingDeleteStorageVolumeUseCase,
    @inject(tokens.deleteScheduledTaskUseCase)
    private readonly deleteScheduledTaskUseCase: Pick<
      DeleteScheduledTaskUseCase,
      "execute"
    > = missingDeleteScheduledTaskUseCase,
  ) {}

  private async findLatestDeploymentForResource(
    repositoryContext: RepositoryContext,
    input: {
      resourceId: ResourceId;
      sourceFingerprint: string;
    },
  ): Promise<Result<Deployment | null>> {
    try {
      return ok(
        await this.deploymentRepository.findOne(
          repositoryContext,
          LatestDeploymentSpec.forResource(input.resourceId),
        ),
      );
    } catch (error) {
      return err(
        previewCleanupInfraError("Linked preview deployment could not be read", error, {
          sourceFingerprint: input.sourceFingerprint,
          cleanupStage: "deployment-read",
          resourceId: input.resourceId.value,
        }),
      );
    }
  }

  private async findDeploymentById(
    repositoryContext: RepositoryContext,
    input: {
      deploymentId: string;
      sourceFingerprint: string;
    },
  ): Promise<Result<Deployment | null>> {
    try {
      return ok(
        await this.deploymentRepository.findOne(
          repositoryContext,
          DeploymentByIdSpec.create(DeploymentId.rehydrate(input.deploymentId)),
        ),
      );
    } catch (error) {
      return err(
        previewCleanupInfraError("Preview deployment could not be read", error, {
          sourceFingerprint: input.sourceFingerprint,
          cleanupStage: "deployment-read",
          deploymentId: input.deploymentId,
        }),
      );
    }
  }

  private async listProjectDeployments(
    repositoryContext: RepositoryContext,
    input: {
      projectId: string;
      sourceFingerprint: string;
    },
  ): Promise<Result<DeploymentSummary[]>> {
    try {
      return ok(
        await this.deploymentReadModel.list(repositoryContext, { projectId: input.projectId }),
      );
    } catch (error) {
      return err(
        previewCleanupInfraError("Preview deployments could not be listed", error, {
          sourceFingerprint: input.sourceFingerprint,
          cleanupStage: "deployment-list",
          projectId: input.projectId,
        }),
      );
    }
  }

  async execute(
    context: ExecutionContext,
    input: CleanupPreviewCommandInput,
  ): Promise<Result<CleanupPreviewResult>> {
    const {
      executionBackend,
      mutationCoordinator,
      serverAppliedRouteStateRepository,
      sourceLinkRepository,
      unbindResourceDependencyUseCase,
      deleteDependencyResourceUseCase,
      detachResourceStorageUseCase,
      deleteStorageVolumeUseCase,
      deleteScheduledTaskUseCase,
    } = this;
    const findDeploymentById = this.findDeploymentById.bind(this);
    const findLatestDeploymentForResource = this.findLatestDeploymentForResource.bind(this);
    const listProjectDeployments = this.listProjectDeployments.bind(this);
    const repositoryContext = toRepositoryContext(context);

    return mutationCoordinator.runExclusive({
      context,
      policy: mutationCoordinationPolicies.cleanupPreview,
      scope: previewLifecycleScope(input.sourceFingerprint),
      owner: createCoordinationOwner(context, "deployments.cleanup-preview"),
      work: async () =>
        safeTry(async function* () {
          const sourceLink = yield* await sourceLinkRepository
            .findOne(SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint))
            .then((result) =>
              result.mapErr((error) =>
                withPreviewCleanupDetails(error, {
                  sourceFingerprint: input.sourceFingerprint,
                  cleanupStage: "source-link-read",
                }),
              ),
            );

          if (!sourceLink) {
            return ok({
              sourceFingerprint: input.sourceFingerprint,
              status: "already-clean" as const,
              cleanedRuntime: false,
              removedServerAppliedRoute: false,
              removedSourceLink: false,
              removedDependencyBindings: 0,
              deletedDependencyResources: 0,
              removedStorageAttachments: 0,
              deletedStorageVolumes: 0,
              deletedScheduledTasks: 0,
            });
          }

          const resourceId = yield* ResourceId.create(sourceLink.resourceId);
          const latestDeployment = yield* await findLatestDeploymentForResource(repositoryContext, {
            resourceId,
            sourceFingerprint: input.sourceFingerprint,
          });
          const runtimeCleanupCandidates = new Map<string, Deployment>();

          if (latestDeployment) {
            const latestSourceFingerprint = deploymentRuntimeSourceFingerprint(latestDeployment);
            if (
              latestSourceFingerprint === input.sourceFingerprint ||
              latestSourceFingerprint === undefined
            ) {
              runtimeCleanupCandidates.set(latestDeployment.toState().id.value, latestDeployment);
            }
          }

          const previewDeployments = yield* await listProjectDeployments(repositoryContext, {
            projectId: sourceLink.projectId,
            sourceFingerprint: input.sourceFingerprint,
          });

          for (const previewDeployment of previewDeployments) {
            if (
              previewDeployment.projectId !== sourceLink.projectId ||
              previewDeployment.environmentId !== sourceLink.environmentId ||
              deploymentSourceFingerprint(previewDeployment) !== input.sourceFingerprint ||
              runtimeCleanupCandidates.has(previewDeployment.id)
            ) {
              continue;
            }

            const candidate = yield* await findDeploymentById(repositoryContext, {
              deploymentId: previewDeployment.id,
              sourceFingerprint: input.sourceFingerprint,
            });

            if (candidate) {
              runtimeCleanupCandidates.set(previewDeployment.id, candidate);
            }
          }

          let deploymentId: string | undefined;
          let cleanedRuntime = false;
          for (const runtimeCleanupCandidate of runtimeCleanupCandidates.values()) {
            const candidateState = runtimeCleanupCandidate.toState();
            deploymentId ??= candidateState.id.value;
            yield* await executionBackend.cancel(context, runtimeCleanupCandidate).then((result) =>
              result.mapErr((error) =>
                withPreviewCleanupDetails(error, {
                  sourceFingerprint: input.sourceFingerprint,
                  cleanupStage: cleanupStageFromError(error, "runtime-cleanup"),
                  resourceId: candidateState.resourceId.value,
                  deploymentId: candidateState.id.value,
                }),
              ),
            );
            cleanedRuntime = true;
          }

          let removedDependencyBindings = 0;
          let deletedDependencyResources = 0;
          for (const dependency of previewDependencyProvenanceEntries({
            sourceLink,
            sourceFingerprint: input.sourceFingerprint,
          })) {
            const unbindResult = await unbindResourceDependencyUseCase.execute(context, {
              resourceId: dependency.resourceId,
              bindingId: dependency.bindingId,
            });
            if (unbindResult.isErr() && !isNotFoundError(unbindResult.error)) {
              return err(
                withPreviewCleanupDetails(unbindResult.error, {
                  sourceFingerprint: input.sourceFingerprint,
                  cleanupStage: cleanupStageFromError(unbindResult.error, "dependency-unbind"),
                  resourceId: dependency.resourceId,
                  bindingId: dependency.bindingId,
                  dependencyResourceId: dependency.dependencyResourceId,
                  dependencyKey: dependency.key,
                }),
              );
            }
            if (unbindResult.isOk()) {
              removedDependencyBindings += 1;
            }

            const deleteResult = await deleteDependencyResourceUseCase.execute(context, {
              dependencyResourceId: dependency.dependencyResourceId,
            });
            if (deleteResult.isErr() && !isNotFoundError(deleteResult.error)) {
              return err(
                withPreviewCleanupDetails(deleteResult.error, {
                  sourceFingerprint: input.sourceFingerprint,
                  cleanupStage: cleanupStageFromError(deleteResult.error, "dependency-delete"),
                  resourceId: dependency.resourceId,
                  bindingId: dependency.bindingId,
                  dependencyResourceId: dependency.dependencyResourceId,
                  dependencyKey: dependency.key,
                }),
              );
            }
            if (deleteResult.isOk()) {
              deletedDependencyResources += 1;
            }
          }

          let removedStorageAttachments = 0;
          let deletedStorageVolumes = 0;
          for (const storage of previewStorageProvenanceEntries({
            sourceLink,
            sourceFingerprint: input.sourceFingerprint,
          })) {
            const detachResult = await detachResourceStorageUseCase.execute(context, {
              resourceId: storage.resourceId,
              attachmentId: storage.attachmentId,
            });
            if (detachResult.isErr() && !isNotFoundError(detachResult.error)) {
              return err(
                withPreviewCleanupDetails(detachResult.error, {
                  sourceFingerprint: input.sourceFingerprint,
                  cleanupStage: cleanupStageFromError(detachResult.error, "storage-detach"),
                  resourceId: storage.resourceId,
                  attachmentId: storage.attachmentId,
                  storageVolumeId: storage.storageVolumeId,
                  storageKey: storage.key,
                }),
              );
            }
            if (detachResult.isOk()) {
              removedStorageAttachments += 1;
            }

            const deleteResult = await deleteStorageVolumeUseCase.execute(context, {
              storageVolumeId: storage.storageVolumeId,
            });
            if (deleteResult.isErr() && !isNotFoundError(deleteResult.error)) {
              return err(
                withPreviewCleanupDetails(deleteResult.error, {
                  sourceFingerprint: input.sourceFingerprint,
                  cleanupStage: cleanupStageFromError(deleteResult.error, "storage-delete"),
                  resourceId: storage.resourceId,
                  attachmentId: storage.attachmentId,
                  storageVolumeId: storage.storageVolumeId,
                  storageKey: storage.key,
                }),
              );
            }
            if (deleteResult.isOk()) {
              deletedStorageVolumes += 1;
            }
          }

          let deletedScheduledTasks = 0;
          for (const task of previewScheduledTaskProvenanceEntries({
            sourceLink,
            sourceFingerprint: input.sourceFingerprint,
          })) {
            const deleteResult = await deleteScheduledTaskUseCase.execute(context, {
              resourceId: task.resourceId,
              taskId: task.taskId,
            });
            if (deleteResult.isErr() && !isNotFoundError(deleteResult.error)) {
              return err(
                withPreviewCleanupDetails(deleteResult.error, {
                  sourceFingerprint: input.sourceFingerprint,
                  cleanupStage: cleanupStageFromError(deleteResult.error, "scheduled-task-delete"),
                  resourceId: task.resourceId,
                  taskId: task.taskId,
                  taskKey: task.key,
                }),
              );
            }
            if (deleteResult.isOk()) {
              deletedScheduledTasks += 1;
            }
          }

          const removedLinkedServerAppliedRoute = sourceLink.serverId
            ? yield* await serverAppliedRouteStateRepository
                .deleteOne(
                  ServerAppliedRouteStateByTargetSpec.create({
                    projectId: sourceLink.projectId,
                    environmentId: sourceLink.environmentId,
                    resourceId: sourceLink.resourceId,
                    serverId: sourceLink.serverId,
                    ...(sourceLink.destinationId
                      ? { destinationId: sourceLink.destinationId }
                      : {}),
                  }),
                )
                .then((result) =>
                  result.mapErr((error) =>
                    withPreviewCleanupDetails(error, {
                      sourceFingerprint: input.sourceFingerprint,
                      cleanupStage: "server-applied-route-delete",
                      resourceId: sourceLink.resourceId,
                      serverId: sourceLink.serverId,
                      ...(sourceLink.destinationId
                        ? { destinationId: sourceLink.destinationId }
                        : {}),
                    }),
                  ),
                )
            : false;

          const removedScopedServerAppliedRouteCount =
            yield* await serverAppliedRouteStateRepository
              .deleteMany(
                ServerAppliedRouteStateBySourceFingerprintSpec.create(input.sourceFingerprint),
              )
              .then((result) =>
                result.mapErr((error) =>
                  withPreviewCleanupDetails(error, {
                    sourceFingerprint: input.sourceFingerprint,
                    cleanupStage: "server-applied-route-delete",
                  }),
                ),
              );

          const removedServerAppliedRoute =
            removedLinkedServerAppliedRoute || removedScopedServerAppliedRouteCount > 0;

          const removedSourceLink = yield* await sourceLinkRepository
            .deleteOne(SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint))
            .then((result) =>
              result.mapErr((error) =>
                withPreviewCleanupDetails(error, {
                  sourceFingerprint: input.sourceFingerprint,
                  cleanupStage: "source-link-delete",
                }),
              ),
            );

          return ok({
            sourceFingerprint: input.sourceFingerprint,
            status:
              cleanedRuntime ||
              removedDependencyBindings > 0 ||
              deletedDependencyResources > 0 ||
              removedStorageAttachments > 0 ||
              deletedStorageVolumes > 0 ||
              deletedScheduledTasks > 0 ||
              removedServerAppliedRoute ||
              removedSourceLink
                ? ("cleaned" as const)
                : ("already-clean" as const),
            cleanedRuntime,
            removedServerAppliedRoute,
            removedSourceLink,
            removedDependencyBindings,
            deletedDependencyResources,
            removedStorageAttachments,
            deletedStorageVolumes,
            deletedScheduledTasks,
            projectId: sourceLink.projectId,
            environmentId: sourceLink.environmentId,
            resourceId: sourceLink.resourceId,
            ...(sourceLink.serverId ? { serverId: sourceLink.serverId } : {}),
            ...(sourceLink.destinationId ? { destinationId: sourceLink.destinationId } : {}),
            ...(deploymentId ? { deploymentId } : {}),
          });
        }),
    });
  }
}
