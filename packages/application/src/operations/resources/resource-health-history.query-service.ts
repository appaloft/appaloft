import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type Clock,
  type ResourceHealthHistory,
  type ResourceHealthObservationHistoryReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ResourceHealthHistoryQuery } from "./resource-health-history.query";

function withHealthHistoryDetails(error: DomainError): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "resources.health-history",
    },
  };
}

@injectable()
export class ResourceHealthHistoryQueryService {
  constructor(
    @inject(tokens.resourceHealthObservationHistoryReadModel)
    private readonly readModel: ResourceHealthObservationHistoryReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ResourceHealthHistoryQuery,
  ): Promise<Result<ResourceHealthHistory>> {
    const readResult = await this.readModel.listObservations(context, {
      resourceId: query.input.resourceId,
      window: query.input.window,
      limit: query.input.limit,
    });

    if (readResult.isErr()) {
      return err(withHealthHistoryDetails(readResult.error));
    }

    return ok({
      schemaVersion: "resources.health-history/v1",
      resourceId: query.input.resourceId,
      from: query.input.window.from,
      to: query.input.window.to,
      generatedAt: this.clock.now(),
      observations: readResult.value.observations,
      sourceErrors: readResult.value.sourceErrors,
    });
  }
}
