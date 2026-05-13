import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import { scheduledRuntimePrunePolicyScopeSchema } from "./configure-scheduled-runtime-prune-policy.command";
import {
  type ListScheduledRuntimePrunePoliciesResult,
  type ScheduledRuntimePrunePolicyScope,
} from "./scheduled-runtime-prune.service";

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

export const listScheduledRuntimePrunePoliciesQueryInputSchema = z.object({
  serverId: z.string().trim().min(1).optional(),
  scope: scheduledRuntimePrunePolicyScopeSchema.optional(),
  enabledOnly: queryBooleanSchema,
});

export type ListScheduledRuntimePrunePoliciesQueryInput = z.input<
  typeof listScheduledRuntimePrunePoliciesQueryInputSchema
>;
export type ListScheduledRuntimePrunePoliciesQueryPayload = z.output<
  typeof listScheduledRuntimePrunePoliciesQueryInputSchema
>;

export class ListScheduledRuntimePrunePoliciesQuery extends Query<ListScheduledRuntimePrunePoliciesResult> {
  constructor(
    public readonly serverId: string | undefined,
    public readonly scope: ScheduledRuntimePrunePolicyScope | undefined,
    public readonly enabledOnly: boolean,
  ) {
    super();
  }

  static create(
    input?: ListScheduledRuntimePrunePoliciesQueryInput,
  ): Result<ListScheduledRuntimePrunePoliciesQuery> {
    return parseOperationInput(listScheduledRuntimePrunePoliciesQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListScheduledRuntimePrunePoliciesQuery(
          parsed.serverId,
          parsed.scope,
          parsed.enabledOnly,
        ),
    );
  }
}
