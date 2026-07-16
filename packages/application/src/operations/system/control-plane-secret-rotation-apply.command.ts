import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { type ControlPlaneSecretRotationApplyResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";

export const controlPlaneSecretRotationApplyCommandInputSchema = z.object({
  planDigest: z.string().trim().min(1),
  backupReference: z.string().trim().min(1),
  allowLegacyPlaintext: z.boolean(),
});

export type ControlPlaneSecretRotationApplyCommandInput = z.infer<
  typeof controlPlaneSecretRotationApplyCommandInputSchema
>;

export class ControlPlaneSecretRotationApplyCommand extends Command<ControlPlaneSecretRotationApplyResult> {
  constructor(readonly input: ControlPlaneSecretRotationApplyCommandInput) {
    super();
  }

  static create(
    input: ControlPlaneSecretRotationApplyCommandInput,
  ): Result<ControlPlaneSecretRotationApplyCommand> {
    return parseOperationInput(controlPlaneSecretRotationApplyCommandInputSchema, input).map(
      (parsed) => new ControlPlaneSecretRotationApplyCommand(parsed),
    );
  }
}
