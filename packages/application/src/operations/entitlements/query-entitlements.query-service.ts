import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  DefaultEntitlementPort,
  DefaultTenantContextResolver,
  type EntitlementPort,
  type EntitlementQuery,
  type TenantContextResolver,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type QueryEntitlementsQuery,
  type QueryEntitlementsResponse,
} from "./query-entitlements.query";

@injectable()
export class QueryEntitlementsQueryService {
  constructor(
    @inject(tokens.entitlementPort)
    private readonly entitlementPort?: EntitlementPort,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver?: TenantContextResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    query: QueryEntitlementsQuery,
  ): Promise<Result<QueryEntitlementsResponse>> {
    const tenantContext = await (
      this.tenantContextResolver ?? new DefaultTenantContextResolver()
    ).resolveTenantContext(context);
    const effectiveContext = tenantContext ? { ...context, tenant: tenantContext } : context;
    const entitlements = await (
      this.entitlementPort ?? new DefaultEntitlementPort()
    ).checkEntitlements(effectiveContext, {
      queries: query.input.queries.map((entitlementQuery) =>
        cleanEntitlementQuery(entitlementQuery, tenantContext),
      ),
    });

    return ok({ entitlements: [...entitlements] });
  }
}

function cleanEntitlementQuery(
  input: EntitlementQuery,
  tenantContext: ExecutionContext["tenant"],
): EntitlementQuery {
  const resourceRefs = cleanResourceRefs(input.resourceRefs);

  return {
    capabilityKey: input.capabilityKey,
    ...(input.actor ? { actor: input.actor } : {}),
    ...((input.tenantId ?? tenantContext?.tenantId)
      ? { tenantId: input.tenantId ?? tenantContext?.tenantId }
      : {}),
    ...((input.accountId ?? tenantContext?.accountId)
      ? { accountId: input.accountId ?? tenantContext?.accountId }
      : {}),
    ...((input.organizationId ?? tenantContext?.organizationId)
      ? { organizationId: input.organizationId ?? tenantContext?.organizationId }
      : {}),
    ...(resourceRefs ? { resourceRefs } : {}),
    ...(input.attributes ? { attributes: input.attributes } : {}),
  };
}

function cleanResourceRefs(
  input: EntitlementQuery["resourceRefs"],
): EntitlementQuery["resourceRefs"] {
  if (!input) {
    return undefined;
  }

  const refs: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value?.trim()) {
      refs[key] = value;
    }
  }
  return Object.keys(refs).length > 0 ? refs : undefined;
}
