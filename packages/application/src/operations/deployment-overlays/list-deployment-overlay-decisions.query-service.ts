import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  DefaultDeploymentOverlayPort,
  DefaultTenantContextResolver,
  type DeploymentOverlayPort,
  type TenantContextResolver,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type ListDeploymentOverlayDecisionsQuery,
  type ListDeploymentOverlayDecisionsResponse,
} from "./list-deployment-overlay-decisions.query";

@injectable()
export class ListDeploymentOverlayDecisionsQueryService {
  constructor(
    @inject(tokens.deploymentOverlayPort)
    private readonly deploymentOverlayPort?: DeploymentOverlayPort,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver?: TenantContextResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListDeploymentOverlayDecisionsQuery,
  ): Promise<Result<ListDeploymentOverlayDecisionsResponse>> {
    const tenantContext = await (
      this.tenantContextResolver ?? new DefaultTenantContextResolver()
    ).resolveTenantContext(context);
    const effectiveContext = tenantContext ? { ...context, tenant: tenantContext } : context;
    const records = await (
      this.deploymentOverlayPort ?? new DefaultDeploymentOverlayPort()
    ).listDeploymentOverlayDecisions(effectiveContext, query.input);

    return ok({ records: [...records] });
  }
}
