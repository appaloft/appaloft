import { describe, expect, test } from "bun:test";

import { type ExecutionContext } from "@appaloft/application";

import {
  StaticVultrInfrastructureCredentialProvider,
  VultrInfrastructureConnectorProviderAdapter,
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

function vultrFetcher(input: { failPlans?: boolean; captured?: CapturedRequest[] } = {}) {
  return async (requestInput: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(requestInput instanceof Request ? requestInput.url : String(requestInput));
    input.captured?.push({ url, init });
    if (url.pathname === "/v2/regions") {
      return jsonResponse({
        regions: [
          { id: "ewr", city: "New Jersey", country: "US" },
          { id: "sea", city: "Seattle", country: "US" },
        ],
      });
    }
    if (url.pathname === "/v2/plans") {
      if (input.failPlans) {
        return jsonResponse({ error: "invalid api key" });
      }
      return jsonResponse({
        plans: [
          {
            id: "vc2-1c-1gb",
            monthly_cost: 6,
            vcpu_count: 1,
            ram: 1024,
            locations: ["ewr", "sea"],
          },
          {
            id: "vc2-8c-32gb",
            monthly_cost: 160,
            vcpu_count: 8,
            ram: 32768,
            locations: ["ewr"],
          },
        ],
      });
    }
    if (url.pathname === "/v2/os") {
      return jsonResponse({
        os: [
          { id: 2284, name: "Ubuntu 24.04 LTS x64", family: "ubuntu", arch: "x64" },
          { id: 2136, name: "Debian 12 x64", family: "debian", arch: "x64" },
        ],
      });
    }
    return jsonResponse({ error: `Unhandled ${url.pathname}` });
  };
}

function adapter(input: Parameters<typeof vultrFetcher>[0] = {}) {
  return new VultrInfrastructureConnectorProviderAdapter({
    credentialProvider: new StaticVultrInfrastructureCredentialProvider({
      apiToken: "vultr_test_token",
    }),
    fetcher: vultrFetcher(input),
  });
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

describe("VultrInfrastructureConnectorProviderAdapter", () => {
  test("[APP-CONN-009][APP-CONN-010] plans server proposals from the Vultr provider catalog without creating paid resources", async () => {
    const captured: CapturedRequest[] = [];
    const service = adapter({ captured });

    const result = await service.planCapability(testContext(), {
      connectorKey: "vultr-infrastructure",
      capabilityKey: "infrastructure.server.propose",
      parameters: {
        region: "ewr",
        size: "vc2-1c-1gb",
        image: "ubuntu-24-04-lts-x64",
        serverName: "appaloft-edge-prod",
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.requiresExplicitAcceptance).toBe(true);
    expect(plan.riskLevel).toBe("low");
    expect(plan.providerPlan?.infrastructureServerProposal).toMatchObject({
      providerKey: "vultr",
      region: "ewr",
      size: "vc2-1c-1gb",
      image: "2284",
      estimatedMonthlyCostUsd: 6,
      costRiskLevel: "low",
      cleanupSupported: true,
      tags: ["appaloft", "connector", "vultr"],
    });
    expect(plan.effects.map((effect) => effect.kind)).toContain(
      "infrastructure.server.create.deferred",
    );
    expect(
      captured.map((request) => `${request.init?.method ?? "GET"} ${request.url.pathname}`),
    ).toEqual(["GET /v2/regions", "GET /v2/plans", "GET /v2/os"]);
    expect(JSON.stringify(plan)).not.toContain("vultr_test_token");
    expect(JSON.stringify(plan)).not.toContain("Authorization");
  });

  test("[APP-CONN-010] marks high-cost Vultr proposals as high risk", async () => {
    const service = adapter();

    const result = await service.planCapability(testContext(), {
      connectorKey: "vultr-infrastructure",
      capabilityKey: "infrastructure.server.propose",
      parameters: {
        region: "ewr",
        size: "vc2-8c-32gb",
        image: "2284",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      riskLevel: "high",
      requiresExplicitAcceptance: true,
    });
    expect(
      result._unsafeUnwrap().providerPlan?.infrastructureServerProposal?.estimatedMonthlyCostUsd,
    ).toBe(160);
  });

  test("[APP-CONN-009] rejects unavailable region or plan combinations before proposing a server", async () => {
    const service = adapter();

    const result = await service.planCapability(testContext(), {
      connectorKey: "vultr-infrastructure",
      capabilityKey: "infrastructure.server.propose",
      parameters: {
        region: "sea",
        size: "vc2-8c-32gb",
        image: "2284",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      message: "Vultr plan vc2-8c-32gb is not available in region sea",
    });
  });

  test("[APP-CONN-MOCK-020] translates Vultr provider errors without leaking authorization headers", async () => {
    const service = adapter({ failPlans: true });

    const result = await service.planCapability(testContext(), {
      connectorKey: "vultr-infrastructure",
      capabilityKey: "infrastructure.server.propose",
      parameters: {
        region: "ewr",
        size: "vc2-1c-1gb",
        image: "2284",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      category: "provider",
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("vultr_test_token");
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("Authorization");
  });

  test("[APP-CONN-010] keeps server creation disabled until accepted-plan mutation support exists", async () => {
    const service = adapter();

    const result = await service.applyCapability(testContext(), {
      connectorKey: "vultr-infrastructure",
      capabilityKey: "infrastructure.server.create",
      acceptedPlanId: "plan_high_cost",
      parameters: {
        region: "ewr",
        size: "vc2-1c-1gb",
        image: "2284",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
    });
  });
});
