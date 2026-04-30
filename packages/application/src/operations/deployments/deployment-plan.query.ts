import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DeploymentPlanPreview } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type DeploymentPlanQueryInput,
  deploymentPlanQueryInputSchema,
} from "./deployment-plan.schema";

export {
  type DeploymentPlanQueryInput,
  deploymentPlanQueryInputSchema,
} from "./deployment-plan.schema";

export class DeploymentPlanQuery extends Query<DeploymentPlanPreview> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly resourceId: string,
    public readonly serverId: string,
    public readonly destinationId: string | undefined,
    public readonly includeAccessPlan: boolean,
    public readonly includeCommandSpecs: boolean,
  ) {
    super();
  }

  static create(input: DeploymentPlanQueryInput): Result<DeploymentPlanQuery> {
    return parseOperationInput(deploymentPlanQueryInputSchema, input).map(
      (parsed) =>
        new DeploymentPlanQuery(
          parsed.projectId,
          parsed.environmentId,
          parsed.resourceId,
          parsed.serverId,
          parsed.destinationId,
          parsed.includeAccessPlan,
          parsed.includeCommandSpecs,
        ),
    );
  }
}
