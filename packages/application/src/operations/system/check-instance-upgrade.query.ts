import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type InstanceUpgradeCheckResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";

export const checkInstanceUpgradeQueryInputSchema = z.object({
  targetVersion: z.string().trim().min(1).optional(),
});

export type CheckInstanceUpgradeQueryInput = z.infer<typeof checkInstanceUpgradeQueryInputSchema>;

export class CheckInstanceUpgradeQuery extends Query<InstanceUpgradeCheckResult> {
  constructor(public readonly targetVersion?: string) {
    super();
  }

  static create(input: CheckInstanceUpgradeQueryInput = {}): Result<CheckInstanceUpgradeQuery> {
    return parseOperationInput(checkInstanceUpgradeQueryInputSchema, input).map(
      (parsed) => new CheckInstanceUpgradeQuery(parsed.targetVersion),
    );
  }
}
