import {
  CreatedAt,
  DeploymentTargetId,
  DestinationId,
  EnvironmentId,
  err,
  GitCommitShaText,
  GitRefText,
  ok,
  PreviewEnvironment,
  PreviewEnvironmentBySourceScopeSpec,
  PreviewEnvironmentExpiresAt,
  type PreviewEnvironmentExpiresAt as PreviewEnvironmentExpiresAtValue,
  PreviewEnvironmentId,
  PreviewEnvironmentProviderValue,
  PreviewPullRequestNumber,
  ProjectId,
  ResourceId,
  type Result,
  SourceBindingFingerprint,
  SourceRepositoryFullName,
  UpdatedAt,
  UpsertPreviewEnvironmentSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type PreviewEnvironmentRepository,
  type PreviewPolicyDecisionProjection,
  type PreviewPolicyDecisionRecorder,
  type SourceEventDeploymentDispatcher,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PreviewPolicyDecision, PreviewPolicyEvaluator } from "./preview-policy.evaluator";
import { type PreviewPolicyEvaluationInput } from "./preview-policy.schema";

export interface PreviewLifecycleDeployInput extends PreviewPolicyEvaluationInput {
  sourceEventId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  sourceBindingFingerprint: string;
  expiresAt?: string;
}

export type PreviewLifecycleDeployStatus = "blocked" | "dispatched" | "dispatch-failed";

export interface PreviewLifecycleDeployResult {
  status: PreviewLifecycleDeployStatus;
  policyDecision: PreviewPolicyDecision;
  previewEnvironmentId?: string;
  deploymentId?: string;
  errorCode?: string;
}

@injectable()
export class PreviewLifecycleService {
  private readonly previewPolicyEvaluator = new PreviewPolicyEvaluator();

  constructor(
    @inject(tokens.previewEnvironmentRepository)
    private readonly previewEnvironmentRepository: PreviewEnvironmentRepository,
    @inject(tokens.sourceEventDeploymentDispatcher)
    private readonly sourceEventDeploymentDispatcher: SourceEventDeploymentDispatcher,
    @inject(tokens.previewPolicyDecisionRecorder)
    private readonly previewPolicyDecisionRecorder: PreviewPolicyDecisionRecorder,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async deployFromPolicyEligibleEvent(
    context: ExecutionContext,
    input: PreviewLifecycleDeployInput,
  ): Promise<Result<PreviewLifecycleDeployResult>> {
    const policyDecision = this.previewPolicyEvaluator.evaluate(input);
    if (policyDecision.isErr()) {
      return err(policyDecision.error);
    }

    if (!policyDecision.value.deploymentEligible) {
      await this.recordPolicyDecision(context, input, policyDecision.value);
      return ok({
        status: "blocked",
        policyDecision: policyDecision.value,
      });
    }

    const previewEnvironment = await this.createOrUpdatePreviewEnvironment(context, input);
    if (previewEnvironment.isErr()) {
      return err(previewEnvironment.error);
    }

    const state = previewEnvironment.value.toState();
    const dispatch = await this.sourceEventDeploymentDispatcher.dispatch(context, {
      sourceEventId: input.sourceEventId,
      projectId: state.projectId.value,
      environmentId: state.environmentId.value,
      resourceId: state.resourceId.value,
      serverId: state.serverId.value,
      destinationId: state.destinationId.value,
    });

    if (dispatch.isErr()) {
      await this.recordPolicyDecision(context, input, policyDecision.value, {
        previewEnvironmentId: state.id.value,
      });
      return ok({
        status: "dispatch-failed",
        policyDecision: policyDecision.value,
        previewEnvironmentId: state.id.value,
        errorCode: dispatch.error.code,
      });
    }

    await this.recordPolicyDecision(context, input, policyDecision.value, {
      previewEnvironmentId: state.id.value,
      deploymentId: dispatch.value.deploymentId,
    });

    return ok({
      status: "dispatched",
      policyDecision: policyDecision.value,
      previewEnvironmentId: state.id.value,
      deploymentId: dispatch.value.deploymentId,
    });
  }

  private async recordPolicyDecision(
    context: ExecutionContext,
    input: PreviewLifecycleDeployInput,
    policyDecision: PreviewPolicyDecision,
    lifecycleResult?: {
      previewEnvironmentId?: string;
      deploymentId?: string;
    },
  ): Promise<void> {
    const safeDetails = policyDecision.safeDetails;
    const projection: PreviewPolicyDecisionProjection = {
      sourceEventId: input.sourceEventId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      provider: safeDetails.provider,
      eventKind: safeDetails.eventKind,
      eventAction: safeDetails.eventAction,
      repositoryFullName: safeDetails.repositoryFullName,
      headRepositoryFullName: safeDetails.headRepositoryFullName,
      pullRequestNumber: safeDetails.pullRequestNumber,
      headSha: safeDetails.headSha,
      baseRef: safeDetails.baseRef,
      fork: safeDetails.fork,
      secretBacked: safeDetails.secretBacked,
      requestedSecretScopeCount: safeDetails.requestedSecretScopeCount,
      status: policyDecision.status,
      phase: policyDecision.phase,
      deploymentEligible: policyDecision.deploymentEligible,
      evaluatedAt: this.clock.now(),
      ...(policyDecision.reasonCode ? { reasonCode: policyDecision.reasonCode } : {}),
      ...(lifecycleResult?.previewEnvironmentId
        ? { previewEnvironmentId: lifecycleResult.previewEnvironmentId }
        : {}),
      ...(lifecycleResult?.deploymentId ? { deploymentId: lifecycleResult.deploymentId } : {}),
    };

    await this.previewPolicyDecisionRecorder.record(toRepositoryContext(context), projection);
  }

  private async createOrUpdatePreviewEnvironment(
    context: ExecutionContext,
    input: PreviewLifecycleDeployInput,
  ): Promise<Result<PreviewEnvironment>> {
    const repositoryFullName = SourceRepositoryFullName.create(input.repositoryFullName);
    if (repositoryFullName.isErr()) return err(repositoryFullName.error);

    const headRepositoryFullName = SourceRepositoryFullName.create(input.headRepositoryFullName);
    if (headRepositoryFullName.isErr()) return err(headRepositoryFullName.error);

    const pullRequestNumber = PreviewPullRequestNumber.create(input.pullRequestNumber);
    if (pullRequestNumber.isErr()) return err(pullRequestNumber.error);

    const headSha = GitCommitShaText.create(input.headSha);
    if (headSha.isErr()) return err(headSha.error);

    const baseRef = GitRefText.create(input.baseRef);
    if (baseRef.isErr()) return err(baseRef.error);

    const sourceBindingFingerprint = SourceBindingFingerprint.create(
      input.sourceBindingFingerprint,
    );
    if (sourceBindingFingerprint.isErr()) return err(sourceBindingFingerprint.error);

    const projectId = ProjectId.create(input.projectId);
    if (projectId.isErr()) return err(projectId.error);

    const environmentId = EnvironmentId.create(input.environmentId);
    if (environmentId.isErr()) return err(environmentId.error);

    const resourceId = ResourceId.create(input.resourceId);
    if (resourceId.isErr()) return err(resourceId.error);

    const serverId = DeploymentTargetId.create(input.serverId);
    if (serverId.isErr()) return err(serverId.error);

    const destinationId = DestinationId.create(input.destinationId);
    if (destinationId.isErr()) return err(destinationId.error);

    let expiresAtValue: PreviewEnvironmentExpiresAtValue | undefined;
    if (input.expiresAt) {
      const expiresAt = PreviewEnvironmentExpiresAt.create(input.expiresAt);
      if (expiresAt.isErr()) return err(expiresAt.error);
      expiresAtValue = expiresAt.value;
    }

    const repositoryContext = toRepositoryContext(context);
    const existing = await this.previewEnvironmentRepository.findOne(
      repositoryContext,
      PreviewEnvironmentBySourceScopeSpec.create({
        provider: PreviewEnvironmentProviderValue.github(),
        repositoryFullName: repositoryFullName.value,
        pullRequestNumber: pullRequestNumber.value,
        resourceId: resourceId.value,
      }),
    );

    const source = {
      repositoryFullName: repositoryFullName.value,
      headRepositoryFullName: headRepositoryFullName.value,
      pullRequestNumber: pullRequestNumber.value,
      headSha: headSha.value,
      baseRef: baseRef.value,
      sourceBindingFingerprint: sourceBindingFingerprint.value,
    };
    const now = this.clock.now();

    if (existing) {
      const updated = existing.updateSourceContext({
        source,
        updatedAt: UpdatedAt.rehydrate(now),
      });
      if (updated.isErr()) {
        return err(updated.error);
      }

      await this.previewEnvironmentRepository.upsert(
        repositoryContext,
        existing,
        UpsertPreviewEnvironmentSpec.fromPreviewEnvironment(existing),
      );
      return ok(existing);
    }

    const previewEnvironmentId = PreviewEnvironmentId.create(this.idGenerator.next("prenv"));
    if (previewEnvironmentId.isErr()) return err(previewEnvironmentId.error);

    const created = PreviewEnvironment.create({
      id: previewEnvironmentId.value,
      projectId: projectId.value,
      environmentId: environmentId.value,
      resourceId: resourceId.value,
      serverId: serverId.value,
      destinationId: destinationId.value,
      provider: PreviewEnvironmentProviderValue.github(),
      source,
      createdAt: CreatedAt.rehydrate(now),
      ...(expiresAtValue ? { expiresAt: expiresAtValue } : {}),
    });
    if (created.isErr()) {
      return err(created.error);
    }

    await this.previewEnvironmentRepository.upsert(
      repositoryContext,
      created.value,
      UpsertPreviewEnvironmentSpec.fromPreviewEnvironment(created.value),
    );
    return ok(created.value);
  }
}
