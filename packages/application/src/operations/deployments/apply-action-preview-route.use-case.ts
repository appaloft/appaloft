import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteStateRepository,
  UpsertServerAppliedRouteDesiredStateSpec,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type ApplyActionPreviewRouteCommandParsedInput,
  type ApplyActionPreviewRouteResponse,
} from "./apply-action-preview-route.schema";

function previewRouteUrl(input: {
  host: string;
  pathPrefix: string;
  tlsMode: "auto" | "disabled";
}): string {
  const scheme = input.tlsMode === "disabled" ? "http" : "https";
  const path = input.pathPrefix === "/" ? "" : input.pathPrefix;
  return `${scheme}://${input.host}${path}`;
}

@injectable()
export class ApplyActionPreviewRouteUseCase {
  constructor(
    @inject(tokens.serverAppliedRouteStateRepository)
    private readonly routeStateRepository: ServerAppliedRouteStateRepository,
  ) {}

  async execute(
    _context: ExecutionContext,
    input: ApplyActionPreviewRouteCommandParsedInput,
  ): Promise<Result<ApplyActionPreviewRouteResponse>> {
    if (!input.serverId) {
      return err(
        domainError.validation("Action server config preview route requires a server id", {
          phase: "profile-application",
          resourceId: input.resourceId,
        }),
      );
    }

    const target = {
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      serverId: input.serverId,
      ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    };
    const record: ServerAppliedRouteDesiredStateRecord = {
      routeSetId: [
        target.projectId,
        target.environmentId,
        target.resourceId,
        target.serverId,
        target.destinationId ?? "default",
      ].join(":"),
      ...target,
      sourceFingerprint: input.sourceFingerprint,
      domains: [
        {
          host: input.host,
          pathPrefix: input.pathPrefix,
          tlsMode: input.tlsMode,
        },
      ],
      status: "desired",
      updatedAt: new Date().toISOString(),
    };

    const result = await this.routeStateRepository.upsert(
      record,
      UpsertServerAppliedRouteDesiredStateSpec.fromRecord(record),
    );
    if (result.isErr()) {
      return err(result.error);
    }

    return ok({ previewUrl: previewRouteUrl(input) });
  }
}
