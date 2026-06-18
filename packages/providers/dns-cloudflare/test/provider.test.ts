import { describe, expect, test } from "bun:test";

import { type ExecutionContext } from "@appaloft/application";

import {
  CloudflareDnsConnectorProviderAdapter,
  StaticCloudflareDnsCredentialProvider,
} from "../src";

interface CapturedRequest {
  url: URL;
  init: RequestInit | undefined;
}

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function cloudflareFetcher(
  input: { existingRecords?: unknown[]; failCreate?: boolean; captured?: CapturedRequest[] } = {},
) {
  return async (requestInput: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(requestInput instanceof Request ? requestInput.url : String(requestInput));
    input.captured?.push({ url, init });
    if (url.pathname === "/client/v4/zones") {
      return jsonResponse({
        success: true,
        result: [{ id: "zone_123", name: "example.com" }],
      });
    }
    if (url.pathname === "/client/v4/zones/zone_123/dns_records" && (!init || !init.method)) {
      return jsonResponse({
        success: true,
        result: input.existingRecords ?? [],
      });
    }
    if (url.pathname === "/client/v4/zones/zone_123/dns_records" && init?.method === "POST") {
      if (input.failCreate) {
        return jsonResponse({
          success: false,
          errors: [{ code: 81057, message: "record already exists" }],
        });
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return jsonResponse({
        success: true,
        result: {
          id: "dnsrec_created",
          type: body.type,
          name: body.name,
          content: body.content,
          ttl: body.ttl,
          proxied: body.proxied,
          comment: body.comment,
          tags: body.tags,
        },
      });
    }
    if (
      url.pathname === "/client/v4/zones/zone_123/dns_records/dnsrec_managed" &&
      init?.method === "DELETE"
    ) {
      return jsonResponse({
        success: true,
        result: { id: "dnsrec_managed" },
      });
    }
    return jsonResponse({ success: false, errors: [{ message: `Unhandled ${url.pathname}` }] });
  };
}

function testContext(): ExecutionContext {
  return {
    entrypoint: "system",
    locale: "en-US",
    requestId: "req_test",
    t(key) {
      return key;
    },
    tracer: {
      async startActiveSpan(_name, _options, callback) {
        return callback({
          addEvent() {},
          recordError() {},
          setAttribute() {},
          setAttributes() {},
          setStatus() {},
        });
      },
    },
  };
}

function adapter(input: Parameters<typeof cloudflareFetcher>[0] = {}) {
  return new CloudflareDnsConnectorProviderAdapter({
    credentialProvider: new StaticCloudflareDnsCredentialProvider({
      apiToken: "cf_test_token",
    }),
    fetcher: cloudflareFetcher(input),
  });
}

describe("CloudflareDnsConnectorProviderAdapter", () => {
  test("[APP-CONN-019] lists authorized Cloudflare DNS zones for provider-neutral readiness checks", async () => {
    const service = adapter();

    const result = await service.listZones();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      {
        id: "zone_123",
        name: "example.com",
        providerKey: "cloudflare",
      },
    ]);
  });

  test("[APP-CONN-004][APP-CONN-016] plans Cloudflare DNS records through the real provider API boundary without exposing token material", async () => {
    const captured: CapturedRequest[] = [];
    const service = adapter({ captured });

    const result = await service.planCapability(testContext(), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.plan",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.test",
        type: "CNAME",
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.providerPlan?.dnsRecords?.records).toEqual([
      {
        name: "app.example.com",
        type: "CNAME",
        value: "edge.appaloft.test",
        purpose: "domain-routing",
      },
    ]);
    expect(plan.requiresExplicitAcceptance).toBe(true);
    expect(JSON.stringify(plan)).not.toContain("cf_test_token");
    expect(captured.map((request) => request.url.pathname)).toEqual([
      "/client/v4/zones",
      "/client/v4/zones/zone_123/dns_records",
    ]);
    expect(String(captured[0]?.init?.headers)).not.toContain("cf_test_token");
  });

  test("[APP-CONN-004] applies accepted DNS records and tags them as Appaloft-managed", async () => {
    const captured: CapturedRequest[] = [];
    const service = adapter({ captured });

    const result = await service.applyCapability(testContext(), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      acceptedPlanId: "plan_123",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.test",
        type: "CNAME",
        proxied: true,
      },
    });

    expect(result.isOk()).toBe(true);
    const applied = result._unsafeUnwrap();
    expect(applied.status).toBe("applied");
    expect(applied.effects).toEqual([
      expect.objectContaining({
        kind: "dns.record.upsert",
        providerRecordId: "dnsrec_created",
        managed: true,
      }),
    ]);
    const createRequest = captured.find((request) => request.init?.method === "POST");
    expect(JSON.parse(String(createRequest?.init?.body))).toMatchObject({
      type: "CNAME",
      name: "app.example.com",
      content: "edge.appaloft.test",
      ttl: 1,
      proxied: true,
      comment: "Managed by Appaloft",
      tags: ["appaloft:managed"],
    });
    expect(JSON.stringify(applied)).not.toContain("cf_test_token");
  });

  test("[APP-CONN-005] fails closed when Cloudflare has conflicting user-owned records", async () => {
    const service = adapter({
      existingRecords: [
        {
          id: "dnsrec_user",
          type: "A",
          name: "app.example.com",
          content: "203.0.113.10",
          ttl: 300,
          comment: "user managed",
          tags: [],
        },
      ],
    });

    const result = await service.applyCapability(testContext(), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      acceptedPlanId: "plan_conflict",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.test",
        type: "CNAME",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
    });
  });

  test("[APP-CONN-004] cleanup deletes only Appaloft-managed Cloudflare records", async () => {
    const captured: CapturedRequest[] = [];
    const service = adapter({
      captured,
      existingRecords: [
        {
          id: "dnsrec_managed",
          type: "CNAME",
          name: "app.example.com",
          content: "edge.appaloft.test",
          ttl: 1,
          comment: "Managed by Appaloft",
          tags: ["appaloft:managed"],
        },
        {
          id: "dnsrec_user",
          type: "TXT",
          name: "app.example.com",
          content: "do-not-delete",
          ttl: 300,
          comment: "user managed",
          tags: [],
        },
      ],
    });

    const result = await service.applyCapability(testContext(), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.cleanup",
      acceptedPlanId: "plan_cleanup",
      parameters: {
        zoneName: "example.com",
        records: [
          {
            name: "app.example.com",
            type: "CNAME",
            value: "edge.appaloft.test",
            purpose: "domain-routing",
          },
          {
            name: "app.example.com",
            type: "TXT",
            value: "do-not-delete",
            purpose: "manual",
          },
        ],
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().effects).toEqual([
      expect.objectContaining({ kind: "dns.record.cleanup.deleted", managed: true }),
      expect.objectContaining({ kind: "dns.record.cleanup.skipped", managed: false }),
    ]);
    expect(captured.some((request) => request.init?.method === "DELETE")).toBe(true);
  });

  test("[APP-CONN-MOCK-020] translates Cloudflare provider errors without leaking authorization headers", async () => {
    const service = adapter({ failCreate: true });

    const result = await service.applyCapability(testContext(), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      acceptedPlanId: "plan_provider_error",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.test",
        type: "CNAME",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      category: "provider",
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("cf_test_token");
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("Authorization");
  });
});
