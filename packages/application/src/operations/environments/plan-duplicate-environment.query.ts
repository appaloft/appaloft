import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type EnvironmentDuplicatePlanSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type PlanDuplicateEnvironmentQueryInput,
  planDuplicateEnvironmentQueryInputSchema,
} from "./plan-duplicate-environment.schema";

export {
  type PlanDuplicateEnvironmentQueryInput,
  planDuplicateEnvironmentQueryInputSchema,
} from "./plan-duplicate-environment.schema";

export class PlanDuplicateEnvironmentQuery extends Query<EnvironmentDuplicatePlanSummary> {
  constructor(
    public readonly environmentId: string,
    public readonly targetName: string,
    public readonly targetProjectId?: string,
    public readonly targetEnvironmentId?: string,
  ) {
    super();
  }

  static create(input: PlanDuplicateEnvironmentQueryInput): Result<PlanDuplicateEnvironmentQuery> {
    return parseOperationInput(planDuplicateEnvironmentQueryInputSchema, input).map(
      (parsed) =>
        new PlanDuplicateEnvironmentQuery(
          parsed.environmentId,
          parsed.targetName,
          parsed.targetProjectId,
          parsed.targetEnvironmentId,
        ),
    );
  }
}
