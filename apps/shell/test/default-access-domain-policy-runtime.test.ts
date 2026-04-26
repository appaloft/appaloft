import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type DefaultAccessDomainPolicyByScopeSpec,
  type DefaultAccessDomainPolicyRecord,
  type DefaultAccessDomainPolicyRepository,
  type DefaultAccessDomainPolicyScope,
} from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";
import { ok, type Result } from "@appaloft/core";

import { PolicyAwareDefaultAccessDomainProvider } from "../src/default-access-domain-policy-runtime";

class NoopLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class MemoryDefaultAccessDomainPolicyRepository implements DefaultAccessDomainPolicyRepository {
  readonly items = new Map<string, DefaultAccessDomainPolicyRecord>();

  async findOne(
    spec: DefaultAccessDomainPolicyByScopeSpec,
  ): Promise<Result<DefaultAccessDomainPolicyRecord | null>> {
    return ok(this.items.get(this.scopeKey(spec.scope)) ?? null);
  }

  async list(): Promise<Result<DefaultAccessDomainPolicyRecord[]>> {
    return ok(Array.from(this.items.values()));
  }

  async upsert(
    record: DefaultAccessDomainPolicyRecord,
  ): Promise<Result<DefaultAccessDomainPolicyRecord>> {
    this.items.set(this.scopeKey(record.scope), record);
    return ok(record);
  }

  private scopeKey(scope: DefaultAccessDomainPolicyScope): string {
    return scope.kind === "system" ? "system" : `deployment-target:${scope.serverId}`;
  }
}

function configFixture(): AppConfig["defaultAccessDomain"] {
  return {
    mode: "provider",
    providerKey: "sslip",
    zone: "sslip.io",
    scheme: "http",
  };
}

function requestContext() {
  return createExecutionContext({
    requestId: "req_default_access_runtime_test",
    entrypoint: "system",
  });
}

function requestFixture() {
  return {
    publicAddress: "124.221.7.170",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_demo",
    resourceSlug: "web",
    serverId: "srv_demo",
    routePurpose: "default-resource-access" as const,
    correlationId: "req_default_access_runtime_test",
  };
}

describe("PolicyAwareDefaultAccessDomainProvider", () => {
  test("[DEF-ACCESS-PROVIDER-001] uses deployment-target policy before system and static fallback", async () => {
    const store = new MemoryDefaultAccessDomainPolicyRepository();
    store.items.set("system", {
      id: "dap_system",
      scope: { kind: "system" },
      mode: "disabled",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    store.items.set("deployment-target:srv_demo", {
      id: "dap_server",
      scope: { kind: "deployment-target", serverId: "srv_demo" },
      mode: "provider",
      providerKey: "sslip",
      updatedAt: "2026-01-01T00:00:01.000Z",
    });

    const provider = new PolicyAwareDefaultAccessDomainProvider(
      store,
      configFixture(),
      new NoopLogger(),
    );
    const result = await provider.generate(requestContext(), requestFixture());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      kind: "generated",
      domain: {
        providerKey: "sslip",
      },
    });
  });

  test("[DEF-ACCESS-PROVIDER-001] uses system policy before static fallback", async () => {
    const store = new MemoryDefaultAccessDomainPolicyRepository();
    store.items.set("system", {
      id: "dap_system",
      scope: { kind: "system" },
      mode: "disabled",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const provider = new PolicyAwareDefaultAccessDomainProvider(
      store,
      configFixture(),
      new NoopLogger(),
    );
    const result = await provider.generate(requestContext(), requestFixture());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      kind: "disabled",
      reason: "policy-disabled",
    });
  });

  test("[DEF-ACCESS-PROVIDER-001] falls back to static config when durable policy is missing", async () => {
    const provider = new PolicyAwareDefaultAccessDomainProvider(
      new MemoryDefaultAccessDomainPolicyRepository(),
      configFixture(),
      new NoopLogger(),
    );
    const result = await provider.generate(requestContext(), requestFixture());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      kind: "generated",
      domain: {
        hostname: "web-demo.124.221.7.170.sslip.io",
      },
    });
  });
});
