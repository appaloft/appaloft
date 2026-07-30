import { describe, expect, test } from "bun:test";
import { type AppTracer, type IdGenerator } from "@appaloft/application";
import { createExecutionContextFactory } from "../src";

const tracer: AppTracer = {
  async startActiveSpan(_name, _options, callback) {
    return callback({
      addEvent() {},
      recordError() {},
      setAttribute() {},
      setAttributes() {},
      setStatus() {},
    });
  },
};

const idGenerator: IdGenerator = {
  next: (prefix) => `${prefix}_generated`,
};

describe("default execution context factory", () => {
  test("[WS-OPEN-CRED-007] preserves authorized tenant and request-security context", () => {
    const factory = createExecutionContextFactory({ idGenerator, tracer });
    const tenant = {
      tenantId: "org_alpha",
      organizationId: "org_alpha",
      subjectId: "usr_alpha",
      source: "product-session" as const,
    };
    const requestSecurity = {
      edgeAction: "allow",
      edgeProvider: "cloudflare",
      edgeRayId: "ray_alpha",
    };

    const context = factory.create({
      entrypoint: "http",
      tenant,
      requestSecurity,
    });

    expect(context.tenant).toEqual(tenant);
    expect(context.requestSecurity).toEqual(requestSecurity);
  });
});
