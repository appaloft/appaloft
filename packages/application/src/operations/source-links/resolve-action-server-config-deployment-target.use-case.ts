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
    const trustedContext = input.trustedContext;
    const hasExplicitContext = hasTrustedContext(trustedContext);

    if (hasExplicitContext && !hasCompleteTrustedContext(trustedContext)) {
      return err(
        domainError.validation(
          "Action server config deploy source-link bootstrap requires project, environment, resource, and server ids",
          {
            phase: "source-link-resolution",
            sourceFingerprint: input.sourceFingerprint,
          },
        ),
      );
    }

    const found = await this.sourceLinkRepository.findOne(
      SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
    );
    if (found.isErr()) {
      return err(found.error);
    }

    if (found.value && hasExplicitContext && sourceLinkConflicts(found.value, trustedContext)) {
      return err(
        domainError.validation(
          "Action server config deploy explicit context conflicts with existing source link; relink the source before deploying",
          {
            phase: "source-link-resolution",
            sourceFingerprint: input.sourceFingerprint,
          },
        ),
      );
    }

    if (found.value) {
      return ok(found.value);
    }

    if (!hasExplicitContext || !trustedContext?.serverId) {
      return err(domainError.notFound("Source link", input.sourceFingerprint));
    }

    const target = {
      sourceFingerprint: input.sourceFingerprint,
      projectId: trustedContext.projectId ?? "",
      environmentId: trustedContext.environmentId ?? "",
      resourceId: trustedContext.resourceId ?? "",
      serverId: trustedContext.serverId,
      ...(trustedContext.destinationId ? { destinationId: trustedContext.destinationId } : {}),
      updatedAt: this.clock.now(),
      reason: "github-action-server-config-bootstrap",
    } satisfies SourceLinkRecord;

    const persisted = await this.sourceLinkRepository.upsert(
      target,
      UpsertSourceLinkSpec.fromRecord(target),
    );
    if (persisted.isErr()) {
      return err(persisted.error);
    }

    return ok(persisted.value);
  }
}

function hasTrustedContext(
  trustedContext: ResolveActionServerConfigDeploymentTargetCommandParsedInput["trustedContext"],
): boolean {
  return Boolean(
    trustedContext?.projectId ||
      trustedContext?.environmentId ||
      trustedContext?.resourceId ||
      trustedContext?.serverId ||
      trustedContext?.destinationId,
  );
}

function hasCompleteTrustedContext(
  trustedContext: ResolveActionServerConfigDeploymentTargetCommandParsedInput["trustedContext"],
): boolean {
  return Boolean(
    trustedContext?.projectId &&
      trustedContext.environmentId &&
      trustedContext.resourceId &&
      trustedContext.serverId,
  );
}

function sourceLinkConflicts(
  link: SourceLinkRecord,
  trustedContext: ResolveActionServerConfigDeploymentTargetCommandParsedInput["trustedContext"],
): boolean {
  return (
    link.projectId !== trustedContext?.projectId ||
    link.environmentId !== trustedContext?.environmentId ||
    link.resourceId !== trustedContext?.resourceId ||
    link.serverId !== trustedContext?.serverId ||
    Boolean(trustedContext?.destinationId && link.destinationId !== trustedContext.destinationId)
  );
}
