import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  createExecutionContext,
  DefaultEntitlementPort,
  DefaultTenantContextResolver,
  QueryEntitlementsQuery,
  QueryEntitlementsQueryService,
} from "../src";

describe("neutral entitlement query", () => {
  test("[CLOUD-TENANT-CTX-001] carries optional neutral tenant context compatibly", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_tenant_context",
      tenant: {
        tenantId: "tenant_public",
        accountId: "account_public",
        organizationId: "org_public",
        subjectId: "usr_public",
        mode: "self-hosted",
        source: "test",
      },
    });

    await expect(new DefaultTenantContextResolver().resolveTenantContext(context)).resolves.toEqual(
      {
        tenantId: "tenant_public",
        accountId: "account_public",
        organizationId: "org_public",
        subjectId: "usr_public",
        mode: "self-hosted",
        source: "test",
      },
    );
  });

  test("[CLOUD-ENTITLE-PORT-004] default entitlement port allows Community usage", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_entitlement_default",
      tenant: {
        tenantId: "tenant_local",
        organizationId: "org_local",
      },
    });

    const decisions = await new DefaultEntitlementPort().checkEntitlements(context, {
      queries: [{ capabilityKey: "runtime.local-development" }],
    });

    expect(decisions).toEqual([
      {
        capabilityKey: "runtime.local-development",
        entitled: true,
        status: "entitled",
        mode: "unrestricted",
        hint: "enabled",
        reason: "entitlement-default-allow",
        source: "default",
        details: {
          capabilityKey: "runtime.local-development",
          organizationId: "org_local",
          tenantId: "tenant_local",
        },
      },
    ]);
  });

  test("[CLOUD-ENTITLE-QUERY-005] query service resolves tenant context before checking", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_entitlement_query",
    });
    const query = QueryEntitlementsQuery.create({
      queries: [{ capabilityKey: "static-artifacts.publish" }],
    })._unsafeUnwrap();
    const service = new QueryEntitlementsQueryService(new DefaultEntitlementPort(), {
      resolveTenantContext: async () => ({
        tenantId: "tenant_query",
        organizationId: "org_query",
        source: "test",
      }),
    });

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().entitlements).toEqual([
      expect.objectContaining({
        capabilityKey: "static-artifacts.publish",
        entitled: true,
        reason: "entitlement-default-allow",
        details: expect.objectContaining({
          organizationId: "org_query",
          tenantId: "tenant_query",
        }),
      }),
    ]);
  });
});
