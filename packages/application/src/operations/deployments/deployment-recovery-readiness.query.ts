import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DeploymentRecoveryReadiness } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type DeploymentRecoveryReadinessQueryInput,
  deploymentRecoveryReadinessQueryInputSchema,
} from "./deployment-recovery-readiness.schema";

export {
  type DeploymentRecoveryReadinessQueryInput,
  deploymentRecoveryReadinessQueryInputSchema,
} from "./deployment-recovery-readiness.schema";

export class DeploymentRecoveryReadinessQuery extends Query<DeploymentRecoveryReadiness> {
  constructor(
    public readonly deploymentId: string,
    public readonly resourceId: string | undefined,
    public readonly includeCandidates: boolean,
    public readonly maxCandidates: number | undefined,
  ) {
    super();
  }

  static create(
    input: DeploymentRecoveryReadinessQueryInput,
  ): Result<DeploymentRecoveryReadinessQuery> {
    return parseOperationInput(deploymentRecoveryReadinessQueryInputSchema, input).map(
      (parsed) =>
        new DeploymentRecoveryReadinessQuery(
          parsed.deploymentId,
          parsed.resourceId,
          parsed.includeCandidates,
          parsed.maxCandidates,
        ),
    );
  }
}
