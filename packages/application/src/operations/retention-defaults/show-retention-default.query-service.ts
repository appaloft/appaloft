import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  type RetentionDefaultCategory,
  type RetentionDefaultRepository,
  type RetentionDefaultScope,
  retentionDefaultRecordReadback,
  type ShowRetentionDefaultResult,
} from "./retention-defaults.service";

@injectable()
export class ShowRetentionDefaultQueryService {
  constructor(
    @inject(tokens.retentionDefaultRepository)
    private readonly repository: RetentionDefaultRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: {
      scope?: RetentionDefaultScope;
      organizationId?: string;
      category: RetentionDefaultCategory;
    },
  ): Promise<Result<ShowRetentionDefaultResult>> {
    const record = await this.repository.findOne(toRepositoryContext(context), input);
    if (record.isErr()) {
      return err(record.error);
    }

    return ok({
      schemaVersion: "retention-defaults.show/v1",
      policy: record.value ? retentionDefaultRecordReadback(record.value) : null,
    });
  }
}
