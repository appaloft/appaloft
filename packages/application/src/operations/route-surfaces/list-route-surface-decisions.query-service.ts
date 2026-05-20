import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  DefaultRouteSurfacePort,
  DefaultTenantContextResolver,
  type RouteSurfacePort,
  type TenantContextResolver,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type ListRouteSurfaceDecisionsQuery,
  type ListRouteSurfaceDecisionsResponse,
} from "./list-route-surface-decisions.query";

@injectable()
export class ListRouteSurfaceDecisionsQueryService {
  constructor(
    @inject(tokens.routeSurfacePort)
    private readonly routeSurfacePort?: RouteSurfacePort,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver?: TenantContextResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListRouteSurfaceDecisionsQuery,
  ): Promise<Result<ListRouteSurfaceDecisionsResponse>> {
    const tenantContext = await (
      this.tenantContextResolver ?? new DefaultTenantContextResolver()
    ).resolveTenantContext(context);
    const effectiveContext = tenantContext ? { ...context, tenant: tenantContext } : context;
    const records = await (
      this.routeSurfacePort ?? new DefaultRouteSurfacePort()
    ).listRouteSurfaceDecisions(effectiveContext, query.input);

    return ok({ records: [...records] });
  }
}
