import { type Result } from "@appaloft/core";
import { Query } from "../../cqrs";
import { type DeploymentStaleAttemptsResult } from "../../ports";
import { boundedListLimit, parseOperationInput } from "../shared-schema";
import {
  type ListStaleDeploymentAttemptsQueryInput,
  listStaleDeploymentAttemptsQueryInputSchema,
} from "./list-stale-deployment-attempts.schema";

export { listStaleDeploymentAttemptsQueryInputSchema } from "./list-stale-deployment-attempts.schema";

export class ListStaleDeploymentAttemptsQuery extends Query<DeploymentStaleAttemptsResult> {
  constructor(
    public readonly projectId: string | undefined,
    public readonly resourceId: string | undefined,
    public readonly staleAfterSeconds: number,
    public readonly limit: number,
  ) {
    super();
  }

  static create(
    input: ListStaleDeploymentAttemptsQueryInput = {},
  ): Result<ListStaleDeploymentAttemptsQuery> {
    return parseOperationInput(listStaleDeploymentAttemptsQueryInputSchema, input).map(
      (parsed) =>
        new ListStaleDeploymentAttemptsQuery(
          parsed.projectId,
          parsed.resourceId,
          parsed.staleAfterSeconds,
          boundedListLimit(parsed.limit),
        ),
    );
  }
}
