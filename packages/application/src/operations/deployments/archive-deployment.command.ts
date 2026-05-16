import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ArchiveDeploymentCommandInput,
  type ArchiveDeploymentCommandPayload,
  type ArchiveDeploymentResponse,
  archiveDeploymentCommandInputSchema,
} from "./archive-deployment.schema";

export {
  type ArchiveDeploymentCommandInput,
  type ArchiveDeploymentResponse,
  archiveDeploymentCommandInputSchema,
  archiveDeploymentResponseSchema,
} from "./archive-deployment.schema";

export class ArchiveDeploymentCommand extends Command<ArchiveDeploymentResponse> {
  constructor(
    public readonly deploymentId: string,
    public readonly confirm: string,
    public readonly resourceId: string | undefined,
  ) {
    super();
  }

  static create(input: ArchiveDeploymentCommandInput): Result<ArchiveDeploymentCommand> {
    return parseOperationInput(archiveDeploymentCommandInputSchema, input).map(
      (parsed: ArchiveDeploymentCommandPayload) =>
        new ArchiveDeploymentCommand(parsed.deploymentId, parsed.confirm, parsed.resourceId),
    );
  }
}
