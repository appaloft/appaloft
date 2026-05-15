import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import { type ShowDependencyResourceBackupPolicyResult } from "./dependency-resource-backup-policy.types";

export const showDependencyResourceBackupPolicyQueryInputSchema = z.object({
  policyId: z.string().trim().min(1),
});

export type ShowDependencyResourceBackupPolicyQueryInput = z.input<
  typeof showDependencyResourceBackupPolicyQueryInputSchema
>;

export class ShowDependencyResourceBackupPolicyQuery extends Query<ShowDependencyResourceBackupPolicyResult> {
  constructor(public readonly policyId: string) {
    super();
  }

  static create(
    input: ShowDependencyResourceBackupPolicyQueryInput,
  ): Result<ShowDependencyResourceBackupPolicyQuery> {
    return parseOperationInput(showDependencyResourceBackupPolicyQueryInputSchema, input).map(
      (parsed) => new ShowDependencyResourceBackupPolicyQuery(parsed.policyId),
    );
  }
}
