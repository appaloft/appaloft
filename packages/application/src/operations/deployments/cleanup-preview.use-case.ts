import {
  type DomainError,
  LatestDeploymentSpec,
  ok,
  ResourceId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DeploymentRepository,
  type ExecutionBackend,
  ServerAppliedRouteStateByTargetSpec,
  type ServerAppliedRouteStateRepository,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRepository,
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

function withPreviewCleanupDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null | undefined>,
): DomainError {
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

@injectable()
export class CleanupPreviewUseCase {
  constructor(
    @inject(tokens.sourceLinkRepository)
    private readonly sourceLinkRepository: SourceLinkRepository,
    @inject(tokens.serverAppliedRouteStateRepository)
    private readonly serverAppliedRouteStateRepository: ServerAppliedRouteStateRepository,
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.executionBackend)
    private readonly executionBackend: ExecutionBackend,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CleanupPreviewCommandInput,
  ): Promise<Result<CleanupPreviewResult>> {
    const {
      deploymentRepository,
      executionBackend,
      serverAppliedRouteStateRepository,
      sourceLinkRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
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
        });
      }

      const resourceId = yield* ResourceId.create(sourceLink.resourceId);
      const latestDeployment = await deploymentRepository.findOne(
        repositoryContext,
        LatestDeploymentSpec.forResource(resourceId),
      );

      let deploymentId: string | undefined;
      let cleanedRuntime = false;
      if (latestDeployment) {
        deploymentId = latestDeployment.toState().id.value;
        yield* await executionBackend.cancel(context, latestDeployment).then((result) =>
          result.mapErr((error) =>
            withPreviewCleanupDetails(error, {
              sourceFingerprint: input.sourceFingerprint,
              cleanupStage: "runtime-cleanup",
              resourceId: sourceLink.resourceId,
              deploymentId,
            }),
          ),
        );
        cleanedRuntime = true;
      }

      const removedServerAppliedRoute = sourceLink.serverId
        ? yield* await serverAppliedRouteStateRepository
            .deleteOne(
              ServerAppliedRouteStateByTargetSpec.create({
                projectId: sourceLink.projectId,
                environmentId: sourceLink.environmentId,
                resourceId: sourceLink.resourceId,
                serverId: sourceLink.serverId,
                ...(sourceLink.destinationId ? { destinationId: sourceLink.destinationId } : {}),
              }),
            )
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
