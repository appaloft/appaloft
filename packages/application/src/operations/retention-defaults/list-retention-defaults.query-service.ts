import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  type ListRetentionDefaultsResult,
  type RetentionDefaultListFilter,
  type RetentionDefaultRepository,
  retentionDefaultRecordReadback,
} from "./retention-defaults.service";

@injectable()
export class ListRetentionDefaultsQueryService {
  constructor(
    @inject(tokens.retentionDefaultRepository)
    private readonly repository: RetentionDefaultRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    filter: RetentionDefaultListFilter = {},
  ): Promise<Result<ListRetentionDefaultsResult>> {
    const records = await this.repository.list(toRepositoryContext(context), filter);
    if (records.isErr()) {
      return err(records.error);
    }

    return ok({
      schemaVersion: "retention-defaults.list/v1",
      items: records.value.map(retentionDefaultRecordReadback),
    });
  }
}
