import {
  domainError,
  EnvironmentByIdSpec,
  EnvironmentByProjectAndNameSpec,
  EnvironmentId,
  EnvironmentName,
  err,
  ok,
  ProjectId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DependencyResourceReadModel,
  type DependencyResourceSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type EnvironmentDuplicateDependencyCandidate,
  type EnvironmentDuplicateDomainRouteCandidate,
  type EnvironmentDuplicatePlanSummary,
  type EnvironmentDuplicateResourceCandidate,
  type EnvironmentDuplicateStorageDecisionCandidate,
  type EnvironmentDuplicateVariableCandidate,
  type EnvironmentReadModel,
  type ResourceDependencyBindingReadModel,
  type ResourceDependencyBindingSummary,
  type ResourceReadModel,
  type StorageVolumeReadModel,
  type StorageVolumeSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PlanDuplicateEnvironmentQueryInput } from "./plan-duplicate-environment.query";

@injectable()
export class PlanDuplicateEnvironmentQueryService {
  constructor(
    @inject(tokens.environmentReadModel)
    private readonly environmentReadModel: EnvironmentReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.dependencyResourceReadModel)
    private readonly dependencyResourceReadModel: DependencyResourceReadModel,
    @inject(tokens.resourceDependencyBindingReadModel)
    private readonly resourceDependencyBindingReadModel: ResourceDependencyBindingReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.domainBindingReadModel, { isOptional: true })
    private readonly domainBindingReadModel?: DomainBindingReadModel,
    @inject(tokens.storageVolumeReadModel, { isOptional: true })
    private readonly storageVolumeReadModel?: StorageVolumeReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: PlanDuplicateEnvironmentQueryInput,
  ): Promise<Result<EnvironmentDuplicatePlanSummary>> {
    const repositoryContext = toRepositoryContext(context);

    return safeTry(
      async function* (this: PlanDuplicateEnvironmentQueryService) {
        const sourceEnvironmentId = yield* EnvironmentId.create(input.environmentId);
        const sourceEnvironment = await this.environmentReadModel.findOne(
          repositoryContext,
          EnvironmentByIdSpec.create(sourceEnvironmentId),
        );
        if (!sourceEnvironment) {
          return err(domainError.notFound("environment", input.environmentId));
        }

        const targetProjectId = input.targetProjectId ?? sourceEnvironment.projectId;
        const targetName = yield* EnvironmentName.create(input.targetName);
        const existingTargetByName = await this.environmentReadModel.findOne(
          repositoryContext,
          EnvironmentByProjectAndNameSpec.create(ProjectId.rehydrate(targetProjectId), targetName),
        );
        const existingTargetById = input.targetEnvironmentId
          ? await this.environmentReadModel.findOne(
              repositoryContext,
              EnvironmentByIdSpec.create(EnvironmentId.rehydrate(input.targetEnvironmentId)),
            )
          : null;

        const resources = await this.resourceReadModel.list(repositoryContext, {
          projectId: sourceEnvironment.projectId,
          environmentId: sourceEnvironment.id,
          includePreviewResources: false,
          limit: 500,
        });
        const dependencyResources = await this.dependencyResourceReadModel.list(repositoryContext, {
          projectId: sourceEnvironment.projectId,
          environmentId: sourceEnvironment.id,
          limit: 500,
        });
        const dependencyBindingsResult = await collectDependencyBindings(
          this.resourceDependencyBindingReadModel,
          repositoryContext,
          resources.map((resource) => resource.id),
        );
        if (dependencyBindingsResult.isErr()) {
          return err(dependencyBindingsResult.error);
        }
        const dependencyBindings = dependencyBindingsResult.value;
        const domainRoutes = this.domainBindingReadModel
          ? await collectDomainRoutes(
              this.domainBindingReadModel,
              repositoryContext,
              sourceEnvironment.projectId,
              sourceEnvironment.id,
              resources.map((resource) => resource.id),
            )
          : [];
        const storageDecisions = this.storageVolumeReadModel
          ? await collectStorageDecisions(
              this.storageVolumeReadModel,
              repositoryContext,
              sourceEnvironment.projectId,
              sourceEnvironment.id,
              resources.map((resource) => resource.id),
            )
          : [];

        const targetConflict =
          Boolean(existingTargetByName) && existingTargetByName?.id !== input.targetEnvironmentId;
        const warnings = [
          ...(targetConflict
            ? [
                {
                  code: "target_environment_name_conflict",
                  message: "Target environment name already exists in the target project.",
                },
              ]
            : []),
          ...(existingTargetById && existingTargetById.projectId !== targetProjectId
            ? [
                {
                  code: "target_environment_project_mismatch",
                  message: "Target environment id belongs to a different project.",
                },
              ]
            : []),
        ];

        return ok({
          schemaVersion: "environments.duplicate-plan/v1" as const,
          sourceEnvironment,
          target: {
            projectId: targetProjectId,
            name: targetName.value,
            ...(input.targetEnvironmentId ? { environmentId: input.targetEnvironmentId } : {}),
            ...(existingTargetByName
              ? {
                  existingEnvironmentId: existingTargetByName.id,
                  existingLifecycleStatus: existingTargetByName.lifecycleStatus,
                }
              : {}),
            conflict: targetConflict,
          },
          variableCandidates: sourceEnvironment.maskedVariables.map(
            (variable): EnvironmentDuplicateVariableCandidate => ({
              key: variable.key,
              scope: variable.scope,
              exposure: variable.exposure,
              kind: variable.kind,
              isSecret: variable.isSecret,
              maskedValue: variable.value,
              decisionHint: "copy",
            }),
          ),
          resourceCandidates: resources.map(
            (resource): EnvironmentDuplicateResourceCandidate => ({
              resourceId: resource.id,
              name: resource.name,
              slug: resource.slug,
              kind: resource.kind,
              services: resource.services,
              ...(resource.networkProfile ? { networkProfile: resource.networkProfile } : {}),
              ...(resource.accessProfile ? { accessProfile: resource.accessProfile } : {}),
              decisionHint: "recreate-resource",
            }),
          ),
          dependencyCandidates: dependencyResources.map(toDependencyCandidate),
          dependencyBindingCandidates: dependencyBindings.map((binding) => ({
            bindingId: binding.id,
            resourceId: binding.resourceId,
            dependencyResourceId: binding.dependencyResourceId,
            kind: binding.kind,
            target: binding.target,
            decisionHint: "rebind-after-dependency-decision" as const,
          })),
          domainRouteCandidates: domainRoutes.map(toDomainRouteCandidate),
          storageDecisionCandidates: storageDecisions.map(toStorageDecisionCandidate),
          warnings,
          generatedAt: this.clock.now(),
        });
      }.bind(this),
    );
  }
}

type StorageAttachmentDecision = StorageVolumeSummary["attachments"][number] & {
  storageVolumeId: string;
  storageVolumeName: string;
  storageVolumeKind: StorageVolumeSummary["kind"];
};

async function collectDomainRoutes(
  readModel: DomainBindingReadModel,
  context: ReturnType<typeof toRepositoryContext>,
  projectId: string,
  environmentId: string,
  resourceIds: string[],
): Promise<DomainBindingSummary[]> {
  const routes: DomainBindingSummary[] = [];
  for (const resourceId of resourceIds) {
    routes.push(
      ...(await readModel.list(context, {
        projectId,
        environmentId,
        resourceId,
        limit: 500,
      })),
    );
  }
  return routes;
}

async function collectStorageDecisions(
  readModel: StorageVolumeReadModel,
  context: ReturnType<typeof toRepositoryContext>,
  projectId: string,
  environmentId: string,
  resourceIds: string[],
): Promise<StorageAttachmentDecision[]> {
  const resourceIdSet = new Set(resourceIds);
  const volumes = await readModel.list(context, {
    projectId,
    environmentId,
  });
  return volumes.flatMap((volume) =>
    volume.attachments
      .filter((attachment) => resourceIdSet.has(attachment.resourceId))
      .map((attachment) => ({
        ...attachment,
        storageVolumeId: volume.id,
        storageVolumeName: volume.name,
        storageVolumeKind: volume.kind,
      })),
  );
}

async function collectDependencyBindings(
  readModel: ResourceDependencyBindingReadModel,
  context: ReturnType<typeof toRepositoryContext>,
  resourceIds: string[],
): Promise<Result<ResourceDependencyBindingSummary[]>> {
  const bindings: ResourceDependencyBindingSummary[] = [];
  for (const resourceId of resourceIds) {
    const result = await readModel.list(context, { resourceId });
    if (result.isErr()) {
      return result;
    }
    bindings.push(...result.value.filter((binding) => binding.status === "active"));
  }
  return ok(bindings);
}

function toDomainRouteCandidate(
  binding: DomainBindingSummary,
): EnvironmentDuplicateDomainRouteCandidate {
  return {
    domainBindingId: binding.id,
    resourceId: binding.resourceId,
    domainName: binding.domainName,
    pathPrefix: binding.pathPrefix,
    proxyKind: binding.proxyKind,
    tlsMode: binding.tlsMode,
    ...(binding.redirectTo ? { redirectTo: binding.redirectTo } : {}),
    ...(binding.redirectStatus ? { redirectStatus: binding.redirectStatus } : {}),
    status: binding.status,
    decisionHint: "defer",
    reasons: [
      "Custom domains are environment-specific and must not be copied into the target environment without an explicit route decision.",
    ],
  };
}

function toStorageDecisionCandidate(
  attachment: StorageAttachmentDecision,
): EnvironmentDuplicateStorageDecisionCandidate {
  return {
    storageVolumeId: attachment.storageVolumeId,
    storageVolumeName: attachment.storageVolumeName,
    storageVolumeKind: attachment.storageVolumeKind,
    resourceId: attachment.resourceId,
    attachmentId: attachment.attachmentId,
    destinationPath: attachment.destinationPath,
    mountMode: attachment.mountMode,
    ...(attachment.dataFormat ? { dataFormat: attachment.dataFormat } : {}),
    ...(attachment.applicationDataLabel
      ? { applicationDataLabel: attachment.applicationDataLabel }
      : {}),
    decisionHint: "defer",
    reasons: [
      "Storage volume data is environment-specific and must not be copied without an explicit empty, restore, import, or defer decision.",
    ],
  };
}

function toDependencyCandidate(
  dependency: DependencyResourceSummary,
): EnvironmentDuplicateDependencyCandidate {
  if (dependency.sourceMode === "imported-external") {
    return {
      dependencyResourceId: dependency.id,
      name: dependency.name,
      slug: dependency.slug,
      kind: dependency.kind,
      sourceMode: dependency.sourceMode,
      providerKey: dependency.providerKey,
      providerManaged: dependency.providerManaged,
      lifecycleStatus: dependency.lifecycleStatus,
      desiredCapabilities: dependency.desiredCapabilities,
      decisionHint: "bind-existing",
      reasons: [
        "Imported external dependencies are usually rebound unless the user imports another target dependency.",
      ],
    };
  }

  return {
    dependencyResourceId: dependency.id,
    name: dependency.name,
    slug: dependency.slug,
    kind: dependency.kind,
    sourceMode: dependency.sourceMode,
    providerKey: dependency.providerKey,
    providerManaged: dependency.providerManaged,
    lifecycleStatus: dependency.lifecycleStatus,
    desiredCapabilities: dependency.desiredCapabilities,
    decisionHint: dependency.providerManaged ? "create-new-managed" : "reuse-source",
    reasons: dependency.providerManaged
      ? [
          "Provider-managed dependencies should default to an explicit new managed instance decision.",
        ]
      : ["Unmanaged dependencies can be reused unless the target profile supplies an override."],
  };
}
