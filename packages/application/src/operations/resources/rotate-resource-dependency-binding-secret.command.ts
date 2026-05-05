import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RotateResourceDependencyBindingSecretCommandInput,
  rotateResourceDependencyBindingSecretCommandInputSchema,
} from "./rotate-resource-dependency-binding-secret.schema";

export {
  type RotateResourceDependencyBindingSecretCommandInput,
  rotateResourceDependencyBindingSecretCommandInputSchema,
};

export interface RotateResourceDependencyBindingSecretCommandResult {
  id: string;
  rotatedAt: string;
  secretVersion: string;
}

export class RotateResourceDependencyBindingSecretCommand extends Command<RotateResourceDependencyBindingSecretCommandResult> {
  constructor(
    public readonly resourceId: string,
    public readonly bindingId: string,
    public readonly secretRef: string | undefined,
    public readonly secretValue: string | undefined,
    public readonly confirmHistoricalSnapshotsRemainUnchanged: true,
  ) {
    super();
  }

  static create(
    input: RotateResourceDependencyBindingSecretCommandInput,
  ): Result<RotateResourceDependencyBindingSecretCommand> {
    return parseOperationInput(rotateResourceDependencyBindingSecretCommandInputSchema, input).map(
      (parsed) =>
        new RotateResourceDependencyBindingSecretCommand(
          parsed.resourceId,
          parsed.bindingId,
          parsed.secretRef,
          parsed.secretValue,
          parsed.confirmHistoricalSnapshotsRemainUnchanged,
        ),
    );
  }
}
