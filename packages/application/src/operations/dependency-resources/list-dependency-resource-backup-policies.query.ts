import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import { type ListDependencyResourceBackupPoliciesResult } from "./dependency-resource-backup-policy.types";

const queryBooleanSchema = z
  .union([
    z.boolean(),
    z
      .string()
      .trim()
      .transform((value) => value === "true")
      .pipe(z.boolean()),
  ])
  .default(false);

export const listDependencyResourceBackupPoliciesQueryInputSchema = z.object({
  dependencyResourceId: z.string().trim().min(1).optional(),
  enabledOnly: queryBooleanSchema,
  dueAt: z.string().trim().min(1).optional(),
});

export type ListDependencyResourceBackupPoliciesQueryInput = z.input<
  typeof listDependencyResourceBackupPoliciesQueryInputSchema
>;

export class ListDependencyResourceBackupPoliciesQuery extends Query<ListDependencyResourceBackupPoliciesResult> {
  constructor(
    public readonly dependencyResourceId: string | undefined,
    public readonly enabledOnly: boolean,
    public readonly dueAt: string | undefined,
  ) {
    super();
  }

  static create(
    input?: ListDependencyResourceBackupPoliciesQueryInput,
  ): Result<ListDependencyResourceBackupPoliciesQuery> {
    return parseOperationInput(
      listDependencyResourceBackupPoliciesQueryInputSchema,
      input ?? {},
    ).map(
      (parsed) =>
        new ListDependencyResourceBackupPoliciesQuery(
          parsed.dependencyResourceId,
          parsed.enabledOnly,
          parsed.dueAt,
        ),
    );
  }
}
