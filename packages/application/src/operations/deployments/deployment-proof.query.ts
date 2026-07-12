import { type Result } from "@appaloft/core";
import { Query } from "../../cqrs";
import { type DeploymentProof } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type DeploymentProofQueryInput,
  deploymentProofQueryInputSchema,
} from "./deployment-proof.schema";

export { type DeploymentProofQueryInput, deploymentProofQueryInputSchema };
export class DeploymentProofQuery extends Query<DeploymentProof> {
  constructor(
    public readonly deploymentId: string,
    public readonly resourceId: string | undefined,
  ) {
    super();
  }
  static create(input: DeploymentProofQueryInput): Result<DeploymentProofQuery> {
    return parseOperationInput(deploymentProofQueryInputSchema, input).map(
      (parsed) => new DeploymentProofQuery(parsed.deploymentId, parsed.resourceId),
    );
  }
}
