import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import { type ShowScheduledRuntimePrunePolicyResult } from "./scheduled-runtime-prune.service";

export const showScheduledRuntimePrunePolicyQueryInputSchema = z.object({
  policyId: z.string().trim().min(1),
});

export type ShowScheduledRuntimePrunePolicyQueryInput = z.input<
  typeof showScheduledRuntimePrunePolicyQueryInputSchema
>;
export type ShowScheduledRuntimePrunePolicyQueryPayload = z.output<
  typeof showScheduledRuntimePrunePolicyQueryInputSchema
>;

export class ShowScheduledRuntimePrunePolicyQuery extends Query<ShowScheduledRuntimePrunePolicyResult> {
  constructor(public readonly policyId: string) {
    super();
  }

  static create(
    input: ShowScheduledRuntimePrunePolicyQueryInput,
  ): Result<ShowScheduledRuntimePrunePolicyQuery> {
    return parseOperationInput(showScheduledRuntimePrunePolicyQueryInputSchema, input).map(
      (parsed) => new ShowScheduledRuntimePrunePolicyQuery(parsed.policyId),
    );
  }
}
