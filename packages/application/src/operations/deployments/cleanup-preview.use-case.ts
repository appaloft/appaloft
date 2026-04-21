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
import {
  type DeploymentReadModel,
  type DeploymentRepository,
  type DeploymentSummary,
  type ExecutionBackend,
  type ServerAppliedRouteStateStore,
  type SourceLinkStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CleanupPreviewCommandInput } from "./cleanup-preview.command";

export interface CleanupPreviewResult {
  sourceFingerprint: string;
  status: "cleaned" | "already-clean";
  cleanedRuntime: boolean;
  removedServerAppliedRoute: boolean;
  removedSourceLink: boolean;
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

@injectable()
export class CleanupPreviewUseCase {
  constructor(
    @inject(tokens.sourceLinkStore)
    private readonly sourceLinkStore: SourceLinkStore,
    @inject(tokens.serverAppliedRouteDesiredStateReader)
    private readonly serverAppliedRouteStateStore: ServerAppliedRouteStateStore,
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.executionBackend)
    private readonly executionBackend: ExecutionBackend,
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
    const { executionBackend, serverAppliedRouteStateStore, sourceLinkStore } = this;
    const findDeploymentById = this.findDeploymentById.bind(this);
    const findLatestDeploymentForResource = this.findLatestDeploymentForResource.bind(this);
    const listProjectDeployments = this.listProjectDeployments.bind(this);
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const sourceLink = yield* await sourceLinkStore.read(input.sourceFingerprint).then((result) =>
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
        });
      }

      const resourceId = yield* ResourceId.create(sourceLink.resourceId);
      const latestDeployment = yield* await findLatestDeploymentForResource(repositoryContext, {
        resourceId,
        sourceFingerprint: input.sourceFingerprint,
      });
      const runtimeCleanupCandidates = new Map<string, Deployment>();

      if (latestDeployment) {
        runtimeCleanupCandidates.set(latestDeployment.toState().id.value, latestDeployment);
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
              cleanupStage: "runtime-cleanup",
              resourceId: candidateState.resourceId.value,
              deploymentId: candidateState.id.value,
            }),
          ),
        );
        cleanedRuntime = true;
      }

      const removedLinkedServerAppliedRoute = sourceLink.serverId
        ? yield* await serverAppliedRouteStateStore
            .deleteDesired({
              projectId: sourceLink.projectId,
              environmentId: sourceLink.environmentId,
              resourceId: sourceLink.resourceId,
              serverId: sourceLink.serverId,
              ...(sourceLink.destinationId ? { destinationId: sourceLink.destinationId } : {}),
            })
            .then((result) =>
              result.mapErr((error) =>
                withPreviewCleanupDetails(error, {
                  sourceFingerprint: input.sourceFingerprint,
                  cleanupStage: "server-applied-route-delete",
                  resourceId: sourceLink.resourceId,
                  serverId: sourceLink.serverId,
                  ...(sourceLink.destinationId ? { destinationId: sourceLink.destinationId } : {}),
                }),
              ),
            )
        : false;

      const removedScopedServerAppliedRouteCount = yield* await serverAppliedRouteStateStore
        .deleteDesiredBySourceFingerprint(input.sourceFingerprint)
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

      const removedSourceLink = yield* await sourceLinkStore
        .unlink(input.sourceFingerprint)
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
          cleanedRuntime || removedServerAppliedRoute || removedSourceLink
            ? ("cleaned" as const)
            : ("already-clean" as const),
        cleanedRuntime,
        removedServerAppliedRoute,
        removedSourceLink,
        projectId: sourceLink.projectId,
        environmentId: sourceLink.environmentId,
        resourceId: sourceLink.resourceId,
        ...(sourceLink.serverId ? { serverId: sourceLink.serverId } : {}),
        ...(sourceLink.destinationId ? { destinationId: sourceLink.destinationId } : {}),
        ...(deploymentId ? { deploymentId } : {}),
      });
    });
  }
}
