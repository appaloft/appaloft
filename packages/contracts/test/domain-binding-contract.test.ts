import { describe, expect, test } from "bun:test";
import { createDomainBindingInputSchema, domainBindingSummarySchema } from "../src";

describe("domain binding contract", () => {
  test("accepts a server target without an explicit destination", () => {
    const input = createDomainBindingInputSchema.parse({
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      domainName: "static.example.com",
      proxyKind: "traefik",
      tlsMode: "auto",
    });

    expect(input.serverId).toBe("srv_demo");
    expect(input.destinationId).toBeUndefined();
  });

  test("[CONFIG-FILE-DOMAIN-TARGET-001] preserves the target Compose service across transport", () => {
    const input = createDomainBindingInputSchema.parse({
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      domainName: "app.example.com",
      pathPrefix: "/api",
      pathHandling: "preserve",
      proxyKind: "traefik",
      tlsMode: "auto",
      targetServiceName: "api",
    });

    const summary = domainBindingSummarySchema.parse({
      id: "dmb_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      domainName: "app.example.com",
      pathPrefix: "/api",
      pathHandling: "preserve",
      proxyKind: "traefik",
      tlsMode: "auto",
      targetServiceName: input.targetServiceName,
      certificatePolicy: "auto",
      status: "pending_verification",
      verificationAttemptCount: 1,
      createdAt: "2026-07-19T00:00:00.000Z",
    });

    expect(input.targetServiceName).toBe("api");
    expect(summary.targetServiceName).toBe("api");
  });
});
