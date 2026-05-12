import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  type ListScheduledRuntimePrunePoliciesResult,
  type ScheduledRuntimePrunePolicyListFilter,
  type ScheduledRuntimePrunePolicyRepository,
  scheduledRuntimePrunePolicyRecordReadback,
} from "./scheduled-runtime-prune.service";

@injectable()
export class ListScheduledRuntimePrunePoliciesQueryService {
  constructor(
    @inject(tokens.scheduledRuntimePrunePolicyRepository)
    private readonly policyRepository: ScheduledRuntimePrunePolicyRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    filter: ScheduledRuntimePrunePolicyListFilter = {},
  ): Promise<Result<ListScheduledRuntimePrunePoliciesResult>> {
    const records = await this.policyRepository.listRecords(toRepositoryContext(context), filter);
    if (records.isErr()) {
      return err(records.error);
    }

    return ok({
      schemaVersion: "scheduled-runtime-prune-policies.list/v1",
      items: records.value.map(scheduledRuntimePrunePolicyRecordReadback),
    });
  }
}
