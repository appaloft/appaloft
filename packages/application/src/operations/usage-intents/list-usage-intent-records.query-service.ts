import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  DefaultTenantContextResolver,
  DefaultUsageIntentPort,
  type TenantContextResolver,
  type UsageIntentPort,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type ListUsageIntentRecordsQuery,
  type ListUsageIntentRecordsResponse,
} from "./list-usage-intent-records.query";

@injectable()
export class ListUsageIntentRecordsQueryService {
  constructor(
    @inject(tokens.usageIntentPort)
    private readonly usageIntentPort?: UsageIntentPort,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver?: TenantContextResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListUsageIntentRecordsQuery,
  ): Promise<Result<ListUsageIntentRecordsResponse>> {
    const tenantContext = await (
      this.tenantContextResolver ?? new DefaultTenantContextResolver()
    ).resolveTenantContext(context);
    const effectiveContext = { ...context, tenant: tenantContext };
    const records = await (
      this.usageIntentPort ?? new DefaultUsageIntentPort()
    ).listUsageIntentRecords(effectiveContext, query.input);

    return ok({ records: [...records] });
  }
}
