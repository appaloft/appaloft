import {
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type CommandBus } from "../../cqrs";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type EnvironmentDuplicateDeferredDecisionSummary,
  type EnvironmentProfileDecisionRepository,
  type EnvironmentProfileSyncResult,
  type EnvironmentReadModel,
  type ResourceDependencyBindingReadModel,
  type ResourceDependencyBindingSummary,
  type ResourceReadModel,
  type ResourceRepository,
  type ResourceSummary,
  type StorageVolumeReadModel,
  type StorageVolumeSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { CreateResourceCommand } from "../resources/create-resource.command";
import {
  createResourceInputFromSource,
  deferredResourceProfileDecisions,
} from "./environment-profile-resource-shape";
import { type SyncEnvironmentProfileCommandInput } from "./sync-environment-profile.command";

@injectable()
export class SyncEnvironmentProfileUseCase {
  constructor(
    @inject(tokens.commandBus)
    private readonly commandBus: Pick<CommandBus, "execute">,
    @inject(tokens.environmentReadModel)
    private readonly environmentReadModel: EnvironmentReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.resourceDependencyBindingReadModel)
    private readonly resourceDependencyBindingReadModel: ResourceDependencyBindingReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.environmentProfileDecisionRepository, { isOptional: true })
    private readonly environmentProfileDecisionRepository?: EnvironmentProfileDecisionRepository,
    @inject(tokens.domainBindingReadModel, { isOptional: true })
    private readonly domainBindingReadModel?: DomainBindingReadModel,
    @inject(tokens.storageVolumeReadModel, { isOptional: true })
    private readonly storageVolumeReadModel?: StorageVolumeReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: SyncEnvironmentProfileCommandInput,
  ): Promise<Result<EnvironmentProfileSyncResult>> {
    const {
      clock,
      commandBus,
      domainBindingReadModel,
      environmentProfileDecisionRepository,
      environmentReadModel,
      resourceDependencyBindingReadModel,
      resourceReadModel,
      resourceRepository,
      storageVolumeReadModel,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const sourceEnvironmentId = yield* EnvironmentId.create(input.environmentId);
      const targetEnvironmentId = yield* EnvironmentId.create(input.targetEnvironmentId);
      const sourceEnvironment = await environmentReadModel.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(sourceEnvironmentId),
      );
      if (!sourceEnvironment) {
        return err(domainError.notFound("environment", input.environmentId));
      }
      const targetEnvironment = await environmentReadModel.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(targetEnvironmentId),
      );
      if (!targetEnvironment) {
        return err(domainError.notFound("environment", input.targetEnvironmentId));
      }
      if (sourceEnvironment.projectId !== targetEnvironment.projectId) {
        return err(
          domainError.validation("Environment profile sync requires environments in one project", {
            phase: "environment-profile-sync-admission",
            sourceEnvironmentId: sourceEnvironment.id,
            targetEnvironmentId: targetEnvironment.id,
          }),
        );
      }

      const sourceResources = await resourceReadModel.list(repositoryContext, {
        projectId: sourceEnvironment.projectId,
        environmentId: sourceEnvironment.id,
        includePreviewResources: false,
        limit: 500,
      });
      const targetResources = await resourceReadModel.list(repositoryContext, {
        projectId: targetEnvironment.projectId,
        environmentId: targetEnvironment.id,
        includePreviewResources: false,
        limit: 500,
      });
      const sourceResourceById = new Map(
        sourceResources.map((resource) => [resource.id, resource]),
      );
      const targetResourceBySlug = new Map(
        targetResources.map((resource) => [resource.slug, resource]),
      );
      const syncedResources: EnvironmentProfileSyncResult["syncedResources"] = [];
      const skippedResources: EnvironmentProfileSyncResult["skippedResources"] = [];
      const deferredDecisions: EnvironmentDuplicateDeferredDecisionSummary[] = [];
      const pendingDecisions: PendingEnvironmentProfileDecision[] = [];

      for (const sourceResourceId of input.resourceIds) {
        const sourceResourceSummary = sourceResourceById.get(sourceResourceId);
        if (!sourceResourceSummary) {
          return err(domainError.notFound("resource", sourceResourceId));
        }
        const existingTargetResource = targetResourceBySlug.get(sourceResourceSummary.slug);
        if (existingTargetResource) {
          skippedResources.push({
            sourceResourceId,
            targetResourceId: existingTargetResource.id,
            name: sourceResourceSummary.name,
            slug: sourceResourceSummary.slug,
            reason: "target-resource-exists",
          });
          continue;
        }

        const resourceId = yield* ResourceId.create(sourceResourceId);
        const sourceResource = await resourceRepository.findOne(
          repositoryContext,
          ResourceByIdSpec.create(resourceId),
        );
        if (!sourceResource) {
          return err(domainError.notFound("resource", sourceResourceId));
        }

        const sourceState = sourceResource.toState();
        const createCommand = yield* CreateResourceCommand.create(
          createResourceInputFromSource(sourceState, targetEnvironment.id),
        );
        const createResult = yield* await commandBus.execute(context, createCommand);
        syncedResources.push({
          sourceResourceId,
          targetResourceId: createResult.id,
          name: sourceResourceSummary.name,
          slug: sourceResourceSummary.slug,
          action: "created",
        });

        const resourceProfileDeferredDecisions = deferredResourceProfileDecisions(sourceState);
        deferredDecisions.push(...resourceProfileDeferredDecisions);
        pendingDecisions.push(
          ...resourceProfileDeferredDecisions.map((decision) => ({
            ...decision,
            projectId: sourceEnvironment.projectId,
            environmentId: targetEnvironment.id,
            resourceId: createResult.id,
            sourceEnvironmentId: sourceEnvironment.id,
            sourceResourceId: sourceState.id.value,
          })),
        );

        const sourceBindings = yield* await resourceDependencyBindingReadModel.list(
          repositoryContext,
          { resourceId: sourceResourceId },
        );
        const dependencyDecisions = sourceBindings
          .filter((binding) => binding.status === "active")
          .map(dependencyBindingDeferredDecision);
        deferredDecisions.push(...dependencyDecisions);
        pendingDecisions.push(
          ...dependencyDecisions.map((decision) => ({
            ...decision,
            projectId: sourceEnvironment.projectId,
            environmentId: targetEnvironment.id,
            resourceId: createResult.id,
            sourceEnvironmentId: sourceEnvironment.id,
            sourceResourceId,
          })),
        );

        const routeDecisions = domainBindingReadModel
          ? (
              await domainBindingReadModel.list(repositoryContext, {
                projectId: sourceEnvironment.projectId,
                environmentId: sourceEnvironment.id,
                resourceId: sourceResourceId,
                limit: 500,
              })
            ).map(domainRouteDeferredDecision)
          : [];
        deferredDecisions.push(...routeDecisions);
        pendingDecisions.push(
          ...routeDecisions.map((decision) => ({
            ...decision,
            projectId: sourceEnvironment.projectId,
            environmentId: targetEnvironment.id,
            resourceId: createResult.id,
            sourceEnvironmentId: sourceEnvironment.id,
            sourceResourceId,
          })),
        );

        const storageDecisions = storageVolumeReadModel
          ? (
              await collectStorageAttachments(
                storageVolumeReadModel,
                repositoryContext,
                sourceEnvironment.projectId,
                sourceEnvironment.id,
                sourceResourceId,
              )
            ).map(storageDeferredDecision)
          : [];
        deferredDecisions.push(...storageDecisions);
        pendingDecisions.push(
          ...storageDecisions.map((decision) => ({
            ...decision,
            projectId: sourceEnvironment.projectId,
            environmentId: targetEnvironment.id,
            resourceId: createResult.id,
            sourceEnvironmentId: sourceEnvironment.id,
            sourceResourceId,
          })),
        );
      }

      if (environmentProfileDecisionRepository) {
        for (const pendingDecision of pendingDecisions) {
          await environmentProfileDecisionRepository.recordPending(repositoryContext, {
            id: pendingDecisionId(pendingDecision),
            projectId: pendingDecision.projectId,
            environmentId: pendingDecision.environmentId,
            kind: pendingDecision.kind,
            sourceId: pendingDecision.sourceId,
            reason: pendingDecision.reason,
            createdAt: clock.now(),
            ...(pendingDecision.resourceId ? { resourceId: pendingDecision.resourceId } : {}),
            ...(pendingDecision.sourceEnvironmentId
              ? { sourceEnvironmentId: pendingDecision.sourceEnvironmentId }
              : {}),
            ...(pendingDecision.sourceResourceId
              ? { sourceResourceId: pendingDecision.sourceResourceId }
              : {}),
            ...(pendingDecision.decision ? { decision: pendingDecision.decision } : {}),
          });
        }
      }

      return ok({
        schemaVersion: "environments.sync-profile/v1" as const,
        sourceEnvironmentId: sourceEnvironment.id,
        targetEnvironmentId: targetEnvironment.id,
        syncedResources,
        skippedResources,
        deferredDecisions,
        warnings: deferredDecisions.length
          ? [
              {
                code: "environment_profile_sync_deferred_decisions",
                message:
                  "Some synced profile shape requires follow-up decisions before deployment.",
              },
            ]
          : [],
        generatedAt: clock.now(),
      });
    });
  }
}

type RepositoryContext = ReturnType<typeof toRepositoryContext>;

type StorageAttachmentDecision = StorageVolumeSummary["attachments"][number] & {
  storageVolumeId: string;
  storageVolumeName: string;
};

type PendingEnvironmentProfileDecision = EnvironmentDuplicateDeferredDecisionSummary & {
  projectId: string;
  environmentId: string;
  resourceId?: string;
  sourceEnvironmentId?: string;
  sourceResourceId?: string;
};

function pendingDecisionId(input: PendingEnvironmentProfileDecision): string {
  const resourcePart = input.resourceId ? `${input.resourceId}_` : "";
  return `epd_${input.environmentId}_${resourcePart}${input.kind}_${input.sourceId}`;
}

async function collectStorageAttachments(
  readModel: StorageVolumeReadModel,
  context: RepositoryContext,
  projectId: string,
  environmentId: string,
  resourceId: string,
): Promise<StorageAttachmentDecision[]> {
  const volumes = await readModel.list(context, {
    projectId,
    environmentId,
  });
  return volumes.flatMap((volume) =>
    volume.attachments
      .filter((attachment) => attachment.resourceId === resourceId)
      .map((attachment) => ({
        ...attachment,
        storageVolumeId: volume.id,
        storageVolumeName: volume.name,
      })),
  );
}

function dependencyBindingDeferredDecision(
  binding: ResourceDependencyBindingSummary,
): EnvironmentDuplicateDeferredDecisionSummary {
  return {
    kind: "dependency-binding",
    sourceId: binding.id,
    decision: "defer",
    reason:
      "Profile sync stages resource shape only; dependency binding requires an explicit target decision.",
  };
}

function domainRouteDeferredDecision(
  binding: DomainBindingSummary,
): EnvironmentDuplicateDeferredDecisionSummary {
  return {
    kind: "route",
    sourceId: binding.id,
    decision: "defer",
    reason:
      "Profile sync does not copy environment-specific custom domains without an explicit route decision.",
  };
}

function storageDeferredDecision(
  attachment: StorageAttachmentDecision,
): EnvironmentDuplicateDeferredDecisionSummary {
  return {
    kind: "storage",
    sourceId: attachment.attachmentId,
    decision: "defer",
    reason: `Storage data for ${attachment.storageVolumeName} at ${attachment.destinationPath} requires an explicit empty, restore, import, or defer decision before deployment.`,
  };
}
