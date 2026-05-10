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

    const hasExplicitContext = Boolean(
      input.projectId ||
        input.environmentId ||
        input.resourceId ||
        input.serverId ||
        input.destinationId,
    );

    if (
      hasExplicitContext &&
      (!input.projectId || !input.environmentId || !input.resourceId || !input.serverId)
    ) {
      return err(
        domainError.validation(
          "Action deployment source-link bootstrap requires project, environment, resource, and server ids",
          {
            phase: "action-source-link-deployment",
            sourceFingerprint: input.sourceFingerprint,
          },
        ),
      );
    }

    if (!link.value && !hasExplicitContext) {
      return err(domainError.notFound("Source link", input.sourceFingerprint));
    }

    if (link.value && hasExplicitContext && sourceLinkConflicts(link.value, input)) {
      return err(
        domainError.validation(
          "Action deployment explicit context conflicts with existing source link; relink the source before deploying",
          {
            phase: "action-source-link-deployment",
            sourceFingerprint: input.sourceFingerprint,
          },
        ),
      );
    }

    const target = link.value ?? {
      sourceFingerprint: input.sourceFingerprint,
      projectId: input.projectId ?? "",
      environmentId: input.environmentId ?? "",
      resourceId: input.resourceId ?? "",
      serverId: input.serverId,
      ...(input.destinationId ? { destinationId: input.destinationId } : {}),
      updatedAt: this.clock.now(),
      reason: "github-action-source-link-bootstrap",
    };

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
      const record = {
        sourceFingerprint: target.sourceFingerprint,
        projectId: target.projectId,
        environmentId: target.environmentId,
        resourceId: target.resourceId,
        updatedAt: target.updatedAt,
        reason: "github-action-source-link-bootstrap",
        ...(target.serverId ? { serverId: target.serverId } : {}),
        ...(target.destinationId ? { destinationId: target.destinationId } : {}),
      } satisfies SourceLinkRecord;
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

function sourceLinkConflicts(
  link: SourceLinkRecord,
  input: CreateActionSourceLinkDeploymentCommandParsedInput,
): boolean {
  return (
    link.projectId !== input.projectId ||
    link.environmentId !== input.environmentId ||
    link.resourceId !== input.resourceId ||
    link.serverId !== input.serverId ||
    Boolean(input.destinationId && link.destinationId !== input.destinationId)
  );
}
