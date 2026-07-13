import { type Result } from "@appaloft/core";
import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ReconcileStaleDeploymentCommandInput,
  reconcileStaleDeploymentCommandInputSchema,
} from "./reconcile-stale-deployment.schema";

export { reconcileStaleDeploymentCommandInputSchema } from "./reconcile-stale-deployment.schema";

export interface ReconcileStaleDeploymentResult {
  id: string;
  status: "interrupted";
  interruptedAt: string;
}

export class ReconcileStaleDeploymentCommand extends Command<ReconcileStaleDeploymentResult> {
  constructor(
    public readonly deploymentId: string,
    public readonly confirm: string,
    public readonly stateVersion: string,
    public readonly resourceId: string | undefined,
    public readonly staleAfterSeconds: number,
  ) {
    super();
  }

  static create(
    input: ReconcileStaleDeploymentCommandInput,
  ): Result<ReconcileStaleDeploymentCommand> {
    return parseOperationInput(reconcileStaleDeploymentCommandInputSchema, input).map(
      (parsed) =>
        new ReconcileStaleDeploymentCommand(
          parsed.deploymentId,
          parsed.confirm,
          parsed.stateVersion,
          parsed.resourceId,
          parsed.staleAfterSeconds,
        ),
    );
  }
}
