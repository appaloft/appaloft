import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { type InstanceUpgradeApplyResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";

export const applyInstanceUpgradeCommandInputSchema = z.object({
  targetVersion: z.string().trim().min(1).optional(),
  confirm: z.boolean(),
});

export type ApplyInstanceUpgradeCommandInput = z.infer<
  typeof applyInstanceUpgradeCommandInputSchema
>;

export class ApplyInstanceUpgradeCommand extends Command<InstanceUpgradeApplyResult> {
  constructor(
    public readonly confirm: boolean,
    public readonly targetVersion?: string,
  ) {
    super();
  }

  static create(input: ApplyInstanceUpgradeCommandInput): Result<ApplyInstanceUpgradeCommand> {
    return parseOperationInput(applyInstanceUpgradeCommandInputSchema, input).map(
      (parsed) => new ApplyInstanceUpgradeCommand(parsed.confirm, parsed.targetVersion),
    );
  }
}
