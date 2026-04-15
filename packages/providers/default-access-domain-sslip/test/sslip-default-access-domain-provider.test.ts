import { describe, expect, test } from "bun:test";
import { type ExecutionContext } from "@yundu/application";
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
