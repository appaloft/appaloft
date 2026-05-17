import { err, ok, type Result } from "@appaloft/core";
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
import {
  resolveActionDeploymentTarget,
  sourceLinkRecordFromTarget,
} from "./action-deployment-target-resolution";
import {
  type ResolveActionServerConfigDeploymentTargetCommandParsedInput,
  type ResolveActionServerConfigDeploymentTargetResponse,
} from "./resolve-action-server-config-deployment-target.schema";

@injectable()
export class ResolveActionServerConfigDeploymentTargetUseCase {
  constructor(
    @inject(tokens.sourceLinkRepository)
    private readonly sourceLinkRepository: SourceLinkRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    _context: ExecutionContext,
    input: ResolveActionServerConfigDeploymentTargetCommandParsedInput,
  ): Promise<Result<ResolveActionServerConfigDeploymentTargetResponse>> {
    const found = await this.sourceLinkRepository.findOne(
      SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
    );
    if (found.isErr()) {
      return err(found.error);
    }

    const targetResult = resolveActionDeploymentTarget({
      explicitContextReason: "github-action-server-config-bootstrap",
      sourceFingerprint: input.sourceFingerprint,
      sourceLink: found.value,
      ...(input.authorizedTokenScope ? { authorizedTokenScope: input.authorizedTokenScope } : {}),
      ...(input.trustedContext ? { trustedContext: input.trustedContext } : {}),
    });
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }
    const target = targetResult.value;

    if (found.value) {
      return ok({
        sourceFingerprint: input.sourceFingerprint,
        projectId: target.projectId,
        environmentId: target.environmentId,
        resourceId: target.resourceId,
        ...(target.serverId ? { serverId: target.serverId } : {}),
        ...(target.destinationId ? { destinationId: target.destinationId } : {}),
        updatedAt: found.value.updatedAt,
        reason: target.reason,
      });
    }

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

    return ok(persisted.value);
  }
}
