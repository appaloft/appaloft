import {
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  ResourceByIdSpec,
  type ResourceHealthCheckPolicyState,
  ResourceId,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  type ResourceNetworkProfileState,
  type ResourceRuntimeProfileState,
  type ResourceSourceBindingState,
  type ResourceState,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type CommandBus } from "../../cqrs";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DependencyResourceReadModel,
  type EnvironmentDuplicateDeferredDecisionSummary,
  type EnvironmentDuplicateProfileApplyResult,
  type EnvironmentReadModel,
  type ResourceDependencyBindingReadModel,
  type ResourceDependencyBindingSummary,
  type ResourceReadModel,
  type ResourceRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { ProvisionDependencyResourceCommand } from "../dependency-resources/provision-dependency-resource.command";
import { BindResourceDependencyCommand } from "../resources/bind-resource-dependency.command";
import { CreateResourceCommand } from "../resources/create-resource.command";
import { type CreateResourceCommandInput } from "../resources/create-resource.schema";
import { CloneEnvironmentCommand } from "./clone-environment.command";
import {
  type DuplicateEnvironmentProfileCommandInput,
  type DuplicateEnvironmentProfileDependencyDecision,
  type DuplicateEnvironmentProfileResourceDecision,
} from "./duplicate-environment-profile.schema";

@injectable()
export class DuplicateEnvironmentProfileUseCase {
  constructor(
    @inject(tokens.commandBus)
    private readonly commandBus: Pick<CommandBus, "execute">,
    @inject(tokens.environmentReadModel)
    private readonly environmentReadModel: EnvironmentReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.dependencyResourceReadModel)
    private readonly dependencyResourceReadModel: DependencyResourceReadModel,
    @inject(tokens.resourceDependencyBindingReadModel)
    private readonly resourceDependencyBindingReadModel: ResourceDependencyBindingReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DuplicateEnvironmentProfileCommandInput,
  ): Promise<Result<EnvironmentDuplicateProfileApplyResult>> {
    const {
      clock,
      commandBus,
      dependencyResourceReadModel,
      environmentReadModel,
      resourceReadModel,
      resourceRepository,
      resourceDependencyBindingReadModel,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const sourceEnvironmentId = yield* EnvironmentId.create(input.environmentId);
      const sourceEnvironment = await environmentReadModel.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(sourceEnvironmentId),
      );
      if (!sourceEnvironment) {
        return err(domainError.notFound("environment", input.environmentId));
      }

      const dependencyResources = await dependencyResourceReadModel.list(repositoryContext, {
        projectId: sourceEnvironment.projectId,
        environmentId: sourceEnvironment.id,
        limit: 500,
      });
      const requiredDependencies = input.dependencyKindsToRequire?.length
        ? dependencyResources.filter((dependency) =>
            input.dependencyKindsToRequire?.includes(dependency.kind),
          )
        : dependencyResources;
      const dependencyDecisions = new Map(
        (input.dependencyDecisions ?? []).map((decision) => [
          decision.dependencyResourceId,
          decision,
        ]),
      );
      const missingDependencyDecisionIds = requiredDependencies
        .filter((dependency) => !dependencyDecisions.has(dependency.id))
        .map((dependency) => dependency.id);

      if (missingDependencyDecisionIds.length > 0) {
        return err(
          domainError.validation("Environment profile dependency decisions are required", {
            phase: "environment-profile-duplication-admission",
            environmentId: sourceEnvironment.id,
            missingDependencyResourceIds: missingDependencyDecisionIds,
          }),
        );
      }

      const cloneCommand = yield* CloneEnvironmentCommand.create({
        environmentId: input.environmentId,
        targetName: input.targetName,
        ...(input.targetKind ? { targetKind: input.targetKind } : {}),
      });
      const cloneResult = yield* await commandBus.execute(context, cloneCommand);
      const targetEnvironmentId = cloneResult.id;

      const appliedDependencies: EnvironmentDuplicateProfileApplyResult["appliedDependencies"] = [];
      const dependencyTargetIds = new Map<string, string>();
      for (const dependency of requiredDependencies) {
        const decision = dependencyDecisions.get(dependency.id);
        if (!decision || decision.decision === "defer") {
          continue;
        }

        if (decision.decision === "create-new-managed") {
          const provisionCommand = yield* ProvisionDependencyResourceCommand.create({
            kind: dependency.kind,
            projectId: dependency.projectId,
            environmentId: targetEnvironmentId,
            name: dependency.name,
            providerKey: decision.providerKey ?? dependency.providerKey,
            ...(dependency.description ? { description: dependency.description } : {}),
            capabilities: dependency.desiredCapabilities,
            ...(dependency.backupRelationship
              ? { backupRelationship: dependency.backupRelationship }
              : {}),
          });
          const provisionResult = yield* await commandBus.execute(context, provisionCommand);
          dependencyTargetIds.set(dependency.id, provisionResult.id);
          appliedDependencies.push({
            sourceDependencyResourceId: dependency.id,
            targetDependencyResourceId: provisionResult.id,
            decision: decision.decision,
            kind: dependency.kind,
            name: dependency.name,
          });
          continue;
        }

        const targetDependencyResourceId =
          decision.decision === "bind-existing"
            ? decision.targetDependencyResourceId
            : dependency.id;
        if (!targetDependencyResourceId) {
          return err(
            domainError.validation("Dependency target decision is incomplete", {
              phase: "environment-profile-duplication-admission",
              dependencyResourceId: dependency.id,
              decision: decision.decision,
            }),
          );
        }

        if (decision.decision === "bind-existing") {
          const targetId = yield* ResourceInstanceId.create(targetDependencyResourceId);
          const targetDependency = await dependencyResourceReadModel.findOne(
            repositoryContext,
            ResourceInstanceByIdSpec.create(targetId),
          );
          if (!targetDependency) {
            return err(domainError.notFound("dependency-resource", targetDependencyResourceId));
          }
          if (targetDependency.projectId !== dependency.projectId) {
            return err(
              domainError.validation("Target dependency belongs to a different project", {
                phase: "environment-profile-duplication-admission",
                dependencyResourceId: dependency.id,
                targetDependencyResourceId,
              }),
            );
          }
        }

        dependencyTargetIds.set(dependency.id, targetDependencyResourceId);
        appliedDependencies.push({
          sourceDependencyResourceId: dependency.id,
          targetDependencyResourceId,
          decision: decision.decision,
          kind: dependency.kind,
          name: dependency.name,
        });
      }

      const resourceDecisions = new Map(
        (input.resourceDecisions ?? []).map((decision) => [decision.resourceId, decision]),
      );
      const sourceResources = await resourceReadModel.list(repositoryContext, {
        projectId: sourceEnvironment.projectId,
        environmentId: sourceEnvironment.id,
        includePreviewResources: false,
        limit: 500,
      });
      const copiedResources: EnvironmentDuplicateProfileApplyResult["copiedResources"] = [];
      const createdDependencyBindings: EnvironmentDuplicateProfileApplyResult["createdDependencyBindings"] =
        [];
      const deferredDecisions: EnvironmentDuplicateDeferredDecisionSummary[] = [];

      for (const resourceSummary of sourceResources) {
        const decision = resourceDecisions.get(resourceSummary.id);
        if (decision?.decision === "defer") {
          deferredDecisions.push(resourceDeferredDecision(resourceSummary.id, decision));
          continue;
        }

        const resourceId = yield* ResourceId.create(resourceSummary.id);
        const sourceResource = await resourceRepository.findOne(
          repositoryContext,
          ResourceByIdSpec.create(resourceId),
        );
        if (!sourceResource) {
          return err(domainError.notFound("resource", resourceSummary.id));
        }

        const sourceState = sourceResource.toState();
        const createInput = createResourceInputFromSource(sourceState, targetEnvironmentId);
        const createCommand = yield* CreateResourceCommand.create(createInput);
        const createResult = yield* await commandBus.execute(context, createCommand);
        copiedResources.push({
          sourceResourceId: resourceSummary.id,
          targetResourceId: createResult.id,
          name: resourceSummary.name,
          slug: resourceSummary.slug,
        });
        deferredDecisions.push(...deferredResourceProfileDecisions(sourceState));

        const bindings = yield* await resourceDependencyBindingReadModel.list(repositoryContext, {
          resourceId: resourceSummary.id,
        });
        for (const binding of bindings.filter((candidate) => candidate.status === "active")) {
          const targetDependencyResourceId = dependencyTargetIds.get(binding.dependencyResourceId);
          if (!targetDependencyResourceId) {
            deferredDecisions.push(dependencyBindingDeferredDecision(binding));
            continue;
          }

          const bindCommand = yield* BindResourceDependencyCommand.create({
            resourceId: createResult.id,
            dependencyResourceId: targetDependencyResourceId,
            targetName: binding.target.targetName,
            scope: binding.target.scope,
            injectionMode: binding.target.injectionMode,
          });
          const bindResult = yield* await commandBus.execute(context, bindCommand);
          createdDependencyBindings.push({
            sourceBindingId: binding.id,
            sourceResourceId: binding.resourceId,
            targetResourceId: createResult.id,
            sourceDependencyResourceId: binding.dependencyResourceId,
            targetDependencyResourceId,
            targetName: binding.target.targetName,
            scope: binding.target.scope,
            injectionMode: binding.target.injectionMode,
            bindingId: bindResult.id,
          });
        }
      }

      for (const dependency of requiredDependencies) {
        const decision = dependencyDecisions.get(dependency.id);
        if (!decision) {
          continue;
        }
        if (decision.decision === "defer") {
          deferredDecisions.push(dependencyDeferredDecision(dependency.id, decision));
        }
      }

      return ok({
        schemaVersion: "environments.duplicate-profile/v1" as const,
        sourceEnvironmentId: sourceEnvironment.id,
        targetEnvironmentId,
        copiedResources,
        appliedDependencies,
        createdDependencyBindings,
        deferredDecisions,
        warnings: deferredDecisions.length
          ? [
              {
                code: "environment_profile_apply_deferred_decisions",
                message: "Some environment profile decisions require follow-up before deployment.",
              },
            ]
          : [],
        generatedAt: clock.now(),
      });
    });
  }
}

function createResourceInputFromSource(
  source: ResourceState,
  targetEnvironmentId: string,
): CreateResourceCommandInput {
  return {
    projectId: source.projectId.value,
    environmentId: targetEnvironmentId,
    ...(source.destinationId ? { destinationId: source.destinationId.value } : {}),
    name: source.name.value,
    kind: source.kind.value,
    ...(source.description ? { description: source.description.value } : {}),
    ...(source.services.length
      ? {
          services: source.services.map((service) => ({
            name: service.name.value,
            kind: service.kind.value,
          })),
        }
      : {}),
    ...(source.sourceBinding ? { source: sourceBindingInput(source.sourceBinding) } : {}),
    ...(source.runtimeProfile
      ? { runtimeProfile: runtimeProfileInput(source.runtimeProfile) }
      : {}),
    ...(source.networkProfile
      ? { networkProfile: networkProfileInput(source.networkProfile) }
      : {}),
  };
}

function dependencyBindingDeferredDecision(
  binding: ResourceDependencyBindingSummary,
): EnvironmentDuplicateDeferredDecisionSummary {
  return {
    kind: "dependency-binding",
    sourceId: binding.id,
    decision: "defer",
    reason:
      "Dependency binding requires a non-deferred dependency target decision before it can be copied.",
  };
}

function sourceBindingInput(
  sourceBinding: ResourceSourceBindingState,
): NonNullable<CreateResourceCommandInput["source"]> {
  const versionReference = sourceBinding.versionReference?.toState();
  return {
    kind: sourceBinding.kind.value,
    locator: sourceBinding.locator.value,
    displayName: sourceBinding.displayName.value,
    ...(sourceBinding.gitRef ? { gitRef: sourceBinding.gitRef.value } : {}),
    ...(sourceBinding.commitSha ? { commitSha: sourceBinding.commitSha.value } : {}),
    ...(sourceBinding.baseDirectory ? { baseDirectory: sourceBinding.baseDirectory.value } : {}),
    ...(sourceBinding.originalLocator
      ? { originalLocator: sourceBinding.originalLocator.value }
      : {}),
    ...(sourceBinding.repositoryId ? { repositoryId: sourceBinding.repositoryId.value } : {}),
    ...(sourceBinding.repositoryFullName
      ? { repositoryFullName: sourceBinding.repositoryFullName.value }
      : {}),
    ...(sourceBinding.defaultBranch ? { defaultBranch: sourceBinding.defaultBranch.value } : {}),
    ...(sourceBinding.imageName ? { imageName: sourceBinding.imageName.value } : {}),
    ...(sourceBinding.imageTag ? { imageTag: sourceBinding.imageTag.value } : {}),
    ...(sourceBinding.imageDigest ? { imageDigest: sourceBinding.imageDigest.value } : {}),
    ...(versionReference
      ? {
          version: versionReference.value.value,
          versionKind: versionReference.referenceKind.value,
        }
      : {}),
    ...(sourceBinding.metadata ? { metadata: { ...sourceBinding.metadata } } : {}),
  };
}

function runtimeProfileInput(
  runtimeProfile: ResourceRuntimeProfileState,
): NonNullable<CreateResourceCommandInput["runtimeProfile"]> {
  return {
    strategy: runtimeProfile.strategy.value,
    ...(runtimeProfile.installCommand
      ? { installCommand: runtimeProfile.installCommand.value }
      : {}),
    ...(runtimeProfile.buildCommand ? { buildCommand: runtimeProfile.buildCommand.value } : {}),
    ...(runtimeProfile.startCommand ? { startCommand: runtimeProfile.startCommand.value } : {}),
    ...(runtimeProfile.runtimeName ? { runtimeName: runtimeProfile.runtimeName.value } : {}),
    ...(runtimeProfile.publishDirectory
      ? { publishDirectory: runtimeProfile.publishDirectory.value }
      : {}),
    ...(runtimeProfile.dockerfilePath
      ? { dockerfilePath: runtimeProfile.dockerfilePath.value }
      : {}),
    ...(runtimeProfile.dockerComposeFilePath
      ? { dockerComposeFilePath: runtimeProfile.dockerComposeFilePath.value }
      : {}),
    ...(runtimeProfile.buildTarget ? { buildTarget: runtimeProfile.buildTarget.value } : {}),
    ...(runtimeProfile.replicas ? { replicas: runtimeProfile.replicas.value } : {}),
    ...(runtimeProfile.healthCheckPath
      ? { healthCheckPath: runtimeProfile.healthCheckPath.value }
      : {}),
    ...(runtimeProfile.healthCheck && runtimeProfile.healthCheck.type.value === "http"
      ? { healthCheck: healthCheckInput(runtimeProfile.healthCheck) }
      : {}),
  };
}

function healthCheckInput(
  healthCheck: ResourceHealthCheckPolicyState,
): NonNullable<NonNullable<CreateResourceCommandInput["runtimeProfile"]>["healthCheck"]> {
  return {
    enabled: healthCheck.enabled,
    type: "http",
    intervalSeconds: healthCheck.intervalSeconds.value,
    timeoutSeconds: healthCheck.timeoutSeconds.value,
    retries: healthCheck.retries.value,
    startPeriodSeconds: healthCheck.startPeriodSeconds.value,
    ...(healthCheck.http
      ? {
          http: {
            method: healthCheck.http.method.value,
            scheme: healthCheck.http.scheme.value,
            host: healthCheck.http.host.value,
            ...(healthCheck.http.port ? { port: healthCheck.http.port.value } : {}),
            path: healthCheck.http.path.value,
            expectedStatusCode: healthCheck.http.expectedStatusCode.value,
            ...(healthCheck.http.expectedResponseText
              ? { expectedResponseText: healthCheck.http.expectedResponseText.value }
              : {}),
          },
        }
      : {}),
  };
}

function networkProfileInput(
  networkProfile: ResourceNetworkProfileState,
): NonNullable<CreateResourceCommandInput["networkProfile"]> {
  return {
    internalPort: networkProfile.internalPort.value,
    upstreamProtocol: networkProfile.upstreamProtocol.value,
    exposureMode: networkProfile.exposureMode.value,
    ...(networkProfile.targetServiceName
      ? { targetServiceName: networkProfile.targetServiceName.value }
      : {}),
    ...(networkProfile.hostPort ? { hostPort: networkProfile.hostPort.value } : {}),
  };
}

function deferredResourceProfileDecisions(
  source: ResourceState,
): EnvironmentDuplicateDeferredDecisionSummary[] {
  const decisions: EnvironmentDuplicateDeferredDecisionSummary[] = [];
  const sourceId = source.id.value;

  if (source.accessProfile) {
    decisions.push({
      kind: "access-profile",
      sourceId,
      decision: "defer",
      reason:
        "Resource access profile requires route/access apply support before it can be copied.",
    });
  }

  if (source.storageAttachments.length > 0) {
    decisions.push({
      kind: "storage",
      sourceId,
      decision: "defer",
      reason: "Storage attachments require explicit storage data and mount decisions.",
    });
  }

  if (source.variables.toState().length > 0) {
    decisions.push({
      kind: "resource-variable",
      sourceId,
      decision: "defer",
      reason: "Resource variables may contain secret material and must be reviewed before copying.",
    });
  }

  if (source.autoDeployPolicy) {
    decisions.push({
      kind: "auto-deploy-policy",
      sourceId,
      decision: "defer",
      reason: "Auto deploy policy requires explicit target branch and event policy confirmation.",
    });
  }

  if (source.runtimeProfile?.healthCheck?.type.value === "command") {
    decisions.push({
      kind: "runtime-health-check",
      sourceId,
      decision: "defer",
      reason: "Command health checks are not part of the create-resource apply surface yet.",
    });
  }

  return decisions;
}

function resourceDeferredDecision(
  resourceId: string,
  decision: DuplicateEnvironmentProfileResourceDecision,
): EnvironmentDuplicateDeferredDecisionSummary {
  return {
    kind: "resource",
    sourceId: resourceId,
    decision: decision.decision,
    reason: "Resource shape copy was deferred by the reviewed profile decision.",
  };
}

function dependencyDeferredDecision(
  dependencyResourceId: string,
  decision: DuplicateEnvironmentProfileDependencyDecision,
): EnvironmentDuplicateDeferredDecisionSummary {
  return {
    kind: "dependency",
    sourceId: dependencyResourceId,
    decision: decision.decision,
    reason:
      decision.decision === "defer"
        ? "Dependency binding was deferred and must be resolved before deployment."
        : "Dependency decision is accepted but requires a later provider or binding phase before deployment.",
  };
}
