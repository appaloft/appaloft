import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  type ScheduledRuntimePrunePolicyRepository,
  type ShowScheduledRuntimePrunePolicyResult,
  scheduledRuntimePrunePolicyRecordReadback,
} from "./scheduled-runtime-prune.service";

@injectable()
export class ShowScheduledRuntimePrunePolicyQueryService {
  constructor(
    @inject(tokens.scheduledRuntimePrunePolicyRepository)
    private readonly policyRepository: ScheduledRuntimePrunePolicyRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: { policyId: string },
  ): Promise<Result<ShowScheduledRuntimePrunePolicyResult>> {
    const record = await this.policyRepository.findOne(
      toRepositoryContext(context),
      input.policyId,
    );
    if (record.isErr()) {
      return err(record.error);
    }

    return ok({
      schemaVersion: "scheduled-runtime-prune-policies.show/v1",
      policy: record.value ? scheduledRuntimePrunePolicyRecordReadback(record.value) : null,
    });
  }
}
