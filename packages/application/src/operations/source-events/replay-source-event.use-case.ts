import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ReplaySourceEventResult,
  type SourceEventDeploymentDispatcher,
  type SourceEventPolicyReader,
  type SourceEventReadModel,
  type SourceEventRecord,
  type SourceEventRecorder,
} from "../../ports";
import { tokens } from "../../tokens";
import { parseOperationInput } from "../shared-schema";
import {
  dispatchSourceEventDeployments,
  evaluateSourceEventPolicyMatch,
} from "./ingest-source-event.use-case";
import {
  type ReplaySourceEventCommandInput,
  replaySourceEventCommandInputSchema,
} from "./replay-source-event.schema";

@injectable()
export class ReplaySourceEventUseCase {
  constructor(
    @inject(tokens.sourceEventReadModel)
    private readonly sourceEventReadModel: SourceEventReadModel,
    @inject(tokens.sourceEventRecorder)
    private readonly sourceEventRecorder: SourceEventRecorder,
    @inject(tokens.sourceEventPolicyReader)
    private readonly sourceEventPolicyReader: SourceEventPolicyReader,
    @inject(tokens.sourceEventDeploymentDispatcher)
    private readonly sourceEventDeploymentDispatcher: SourceEventDeploymentDispatcher,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ReplaySourceEventCommandInput,
  ): Promise<Result<ReplaySourceEventResult>> {
    const parsed = parseOperationInput(replaySourceEventCommandInputSchema, input);
    if (parsed.isErr()) {
      return err(parsed.error);
    }

    if (!parsed.value.projectId && !parsed.value.resourceId) {
      return err(
        domainError.sourceEventScopeRequired(
          "Source event replay requires project or resource scope",
          {
            phase: "source-event-replay",
            sourceEventId: parsed.value.sourceEventId,
            requiredScopeKind: "project-or-resource",
          },
        ),
      );
    }

    const repositoryContext = toRepositoryContext(context);
    const sourceEvent = await this.sourceEventReadModel.findOne(repositoryContext, {
      sourceEventId: parsed.value.sourceEventId,
      ...(parsed.value.projectId ? { projectId: parsed.value.projectId } : {}),
      ...(parsed.value.resourceId ? { resourceId: parsed.value.resourceId } : {}),
    });

    if (!sourceEvent) {
      return err(
        domainError.sourceEventNotFound("Source event was not found", {
          phase: "source-event-replay",
          sourceEventId: parsed.value.sourceEventId,
        }),
      );
    }

    const outcome = await evaluateSourceEventPolicyMatch(
      repositoryContext,
      this.sourceEventPolicyReader,
      sourceEvent.sourceKind,
      sourceEvent.sourceIdentity,
      sourceEvent.eventKind,
      sourceEvent.ref,
      parsed.value.resourceId,
      {
        executionContext: context,
        revision: sourceEvent.revision,
        ...(sourceEvent.changeSet?.beforeRevision
          ? { beforeRevision: sourceEvent.changeSet.beforeRevision }
          : {}),
        refChangeKind: sourceEvent.changeSet?.refChangeKind ?? "updated",
        forced: sourceEvent.changeSet?.forced ?? false,
        ...(sourceEvent.changeSet ? { existingChangeSet: sourceEvent.changeSet } : {}),
      },
    );
    const projectId = outcome.projectId ?? sourceEvent.projectId;

    const replayRecord: SourceEventRecord = {
      sourceEventId: sourceEvent.sourceEventId,
      ...(projectId ? { projectId } : {}),
      sourceKind: sourceEvent.sourceKind,
      eventKind: sourceEvent.eventKind,
      sourceIdentity: sourceEvent.sourceIdentity,
      ref: sourceEvent.ref,
      revision: sourceEvent.revision,
      changeSet: outcome.changeSet,
      dedupeKey: `replay:${sourceEvent.sourceEventId}:${parsed.value.idempotencyKey ?? context.requestId}`,
      dedupeStatus: "new",
      verification: sourceEvent.verification,
      status: outcome.status,
      matchedResourceIds: outcome.matchedResourceIds,
      ignoredReasons: outcome.ignoredReasons,
      policyResults: outcome.policyResults,
      createdDeploymentIds: [...sourceEvent.createdDeploymentIds],
      receivedAt: sourceEvent.receivedAt,
    };

    const updated =
      outcome.dispatchTargets.length > 0
        ? await dispatchSourceEventDeployments(
            context,
            this.sourceEventRecorder,
            this.sourceEventDeploymentDispatcher,
            repositoryContext,
            replayRecord,
            outcome.dispatchTargets,
          )
        : await this.sourceEventRecorder.updateOutcome(repositoryContext, {
            sourceEventId: replayRecord.sourceEventId,
            status: outcome.status,
            ...(replayRecord.projectId ? { projectId: replayRecord.projectId } : {}),
            matchedResourceIds: replayRecord.matchedResourceIds,
            ignoredReasons: replayRecord.ignoredReasons,
            policyResults: replayRecord.policyResults,
            createdDeploymentIds: replayRecord.createdDeploymentIds,
          });

    return ok({
      schemaVersion: "source-events.replay/v1",
      sourceEventId: updated.sourceEventId,
      status: updated.status,
      matchedResourceIds: [...updated.matchedResourceIds],
      createdDeploymentIds: [...updated.createdDeploymentIds],
      ignoredReasons: [...updated.ignoredReasons],
      replayedAt: this.clock.now(),
    });
  }
}
