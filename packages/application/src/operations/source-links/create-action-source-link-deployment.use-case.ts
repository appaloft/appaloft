import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type Clock,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
  UpsertSourceLinkSpec,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CreateDeploymentUseCase } from "../deployments/create-deployment.use-case";
import {
  resolveActionDeploymentTarget,
  sourceLinkRecordFromTarget,
} from "./action-deployment-target-resolution";
import {
  type CreateActionSourceLinkDeploymentCommandParsedInput,
  type CreateActionSourceLinkDeploymentResponse,
} from "./create-action-source-link-deployment.schema";

@injectable()
export class CreateActionSourceLinkDeploymentUseCase {
  constructor(
    @inject(tokens.sourceLinkRepository)
    private readonly sourceLinkRepository: SourceLinkRepository,
    @inject(tokens.createDeploymentUseCase)
    private readonly createDeploymentUseCase: CreateDeploymentUseCase,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateActionSourceLinkDeploymentCommandParsedInput,
  ): Promise<Result<CreateActionSourceLinkDeploymentResponse>> {
    const link = await this.sourceLinkRepository.findOne(
      SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
    );
    if (link.isErr()) {
      return err(link.error);
    }

    const trustedContext = mergedTrustedContext(input);
    const targetResult = resolveActionDeploymentTarget({
      explicitContextReason: "github-action-source-link-bootstrap",
      sourceFingerprint: input.sourceFingerprint,
      sourceLink: link.value,
      ...(input.authorizedTokenScope ? { authorizedTokenScope: input.authorizedTokenScope } : {}),
      ...(trustedContext ? { trustedContext } : {}),
    });
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }
    const target = targetResult.value;

    if (!target.serverId) {
      return err(
        domainError.validation("Source link does not include a deployment target", {
          phase: "action-source-link-deployment",
          sourceFingerprint: input.sourceFingerprint,
        }),
      );
    }

    const result = await this.createDeploymentUseCase.execute(context, {
      projectId: target.projectId,
      environmentId: target.environmentId,
      resourceId: target.resourceId,
      serverId: target.serverId,
      ...(target.destinationId ? { destinationId: target.destinationId } : {}),
    });
    if (result.isErr()) {
      return err(result.error);
    }

    if (!link.value) {
      const record = sourceLinkRecordFromTarget({
        sourceFingerprint: input.sourceFingerprint,
        target,
        updatedAt: this.clock.now(),
        reason: target.reason,
      }) satisfies SourceLinkRecord;
      const persisted = await this.sourceLinkRepository.upsert(
        record,
        UpsertSourceLinkSpec.fromRecord(record),
      );
      if (persisted.isErr()) {
        return err(persisted.error);
      }
    }

    return ok(result.value);
  }
}

function explicitContextFromLegacyInput(input: CreateActionSourceLinkDeploymentCommandParsedInput) {
  if (
    !input.projectId &&
    !input.environmentId &&
    !input.resourceId &&
    !input.serverId &&
    !input.destinationId
  ) {
    return undefined;
  }

  return {
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.environmentId ? { environmentId: input.environmentId } : {}),
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    ...(input.serverId ? { serverId: input.serverId } : {}),
    ...(input.destinationId ? { destinationId: input.destinationId } : {}),
  };
}

function mergedTrustedContext(input: CreateActionSourceLinkDeploymentCommandParsedInput) {
  const legacyContext = explicitContextFromLegacyInput(input);
  if (!legacyContext && !input.trustedContext) {
    return undefined;
  }

  return {
    ...legacyContext,
    ...input.trustedContext,
  };
}
