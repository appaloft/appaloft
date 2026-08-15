import { describe, expect, test } from "bun:test";
import { type ExecutionContext } from "@appaloft/application";
import { SslipDefaultAccessDomainProvider } from "../src";

function createProviderTestContext(): ExecutionContext {
  return {
    entrypoint: "system",
    locale: "en-US",
    requestId: "req_provider_test",
    t: (key) => key,
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  };
}

describe("SslipDefaultAccessDomainProvider", () => {
  test("generates an IP-embedded hostname from provider-neutral input", async () => {
    const provider = new SslipDefaultAccessDomainProvider();
    const context = createProviderTestContext();

    const result = await provider.generate(context, {
      publicAddress: "124.221.7.170",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo123456",
      resourceSlug: "bun-docker",
      serverId: "srv_demo",
      routePurpose: "default-resource-access",
      correlationId: "req_provider_test",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      kind: "generated",
      domain: {
        hostname: "bun-docker-demo123456.124.221.7.170.sslip.io",
        scheme: "http",
        providerKey: "sslip",
        metadata: {
          zone: "sslip.io",
          routePurpose: "default-resource-access",
        },
      },
    });
  });

  test("[R8-OCC-DEPLOY-001] maps localhost occupancy hosts to loopback sslip addresses", async () => {
    const provider = new SslipDefaultAccessDomainProvider();
    const context = createProviderTestContext();

    const result = await provider.generate(context, {
      publicAddress: "localhost",
      projectId: "prj_occupancy",
      environmentId: "env_local",
      resourceId: "res_occupancy12",
      resourceSlug: "occupancy-static",
      serverId: "srv_local",
      routePurpose: "default-resource-access",
      correlationId: "req_provider_test",
    });

    expect(result.isOk()).toBe(true);
    const generated = result._unsafeUnwrap();
    expect(generated.kind).toBe("generated");
    if (generated.kind !== "generated") return;
    expect(generated.domain.hostname).toContain("127.0.0.1.sslip.io");
    expect(generated.domain.scheme).toBe("http");
    expect(generated.domain.providerKey).toBe("sslip");
  });

  test("returns a provider error for unsupported public address shapes", async () => {
    const provider = new SslipDefaultAccessDomainProvider();
    const context = createProviderTestContext();

    const result = await provider.generate(context, {
      publicAddress: "server.internal",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      resourceSlug: "web",
      serverId: "srv_demo",
      routePurpose: "default-resource-access",
      correlationId: "req_provider_test",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      category: "provider",
      retryable: false,
      details: {
        phase: "default-access-domain-generation",
        publicAddress: "server.internal",
      },
    });
  });
});
