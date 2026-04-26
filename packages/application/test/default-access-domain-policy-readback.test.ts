import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Result,
  Server,
  UpsertServerSpec,
} from "@appaloft/core";
import { MemoryServerRepository } from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src";
import {
  type DefaultAccessDomainPolicyByScopeSpec,
  type DefaultAccessDomainPolicyRecord,
  type DefaultAccessDomainPolicyRepository,
  type DefaultAccessDomainPolicyScope,
} from "../src/ports";
import {
  ListDefaultAccessDomainPoliciesQueryService,
  ShowDefaultAccessDomainPolicyQueryService,
} from "../src/use-cases";

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

function serverFixture(id = "srv_demo"): Server {
  return Server.register({
    id: DeploymentTargetId.rehydrate(id),
    name: DeploymentTargetName.rehydrate("demo-server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

async function createHarness() {
  const context = createExecutionContext({
    requestId: "req_default_access_policy_readback_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const serverRepository = new MemoryServerRepository();
  const policyRepository = new MemoryDefaultAccessDomainPolicyRepository();

  await serverRepository.upsert(
    repositoryContext,
    serverFixture(),
    UpsertServerSpec.fromServer(serverFixture()),
  );

  return {
    context,
    policyRepository,
    listService: new ListDefaultAccessDomainPoliciesQueryService(policyRepository),
    showService: new ShowDefaultAccessDomainPolicyQueryService(policyRepository, serverRepository),
  };
}

describe("default-access-domain-policies readback queries", () => {
  test("[DEF-ACCESS-POLICY-008] shows a persisted system policy without static fallback fabrication", async () => {
    const { context, policyRepository, showService } = await createHarness();
    policyRepository.items.set("system", {
      id: "dap_system",
      scope: { kind: "system" },
      mode: "provider",
      providerKey: "sslip",
      updatedAt: "2026-01-01T00:00:10.000Z",
    });

    const result = await showService.execute(context, { scopeKind: "system" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "default-access-domain-policies.show/v1",
      scope: { kind: "system" },
      policy: {
        schemaVersion: "default-access-domain-policies.policy/v1",
        id: "dap_system",
        scope: { kind: "system" },
        mode: "provider",
        providerKey: "sslip",
        updatedAt: "2026-01-01T00:00:10.000Z",
      },
    });
  });

  test("[DEF-ACCESS-POLICY-009] shows a persisted deployment-target override for an existing server", async () => {
    const { context, policyRepository, showService } = await createHarness();
    policyRepository.items.set("deployment-target:srv_demo", {
      id: "dap_server",
      scope: { kind: "deployment-target", serverId: "srv_demo" },
      mode: "disabled",
      updatedAt: "2026-01-01T00:00:11.000Z",
    });

    const result = await showService.execute(context, {
      scopeKind: "deployment-target",
      serverId: "srv_demo",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "default-access-domain-policies.show/v1",
      scope: { kind: "deployment-target", serverId: "srv_demo" },
      policy: {
        schemaVersion: "default-access-domain-policies.policy/v1",
        id: "dap_server",
        scope: { kind: "deployment-target", serverId: "srv_demo" },
        mode: "disabled",
        updatedAt: "2026-01-01T00:00:11.000Z",
      },
    });
  });

  test("[DEF-ACCESS-POLICY-010] distinguishes missing durable policy from missing deployment target", async () => {
    const { context, showService } = await createHarness();

    const missingPolicy = await showService.execute(context, { scopeKind: "system" });
    const missingServer = await showService.execute(context, {
      scopeKind: "deployment-target",
      serverId: "srv_missing",
    });

    expect(missingPolicy.isOk()).toBe(true);
    expect(missingPolicy._unsafeUnwrap()).toEqual({
      schemaVersion: "default-access-domain-policies.show/v1",
      scope: { kind: "system" },
      policy: null,
    });
    expect(missingServer.isErr()).toBe(true);
    expect(missingServer._unsafeUnwrapErr().code).toBe("not_found");
  });

  test("[DEF-ACCESS-POLICY-011] lists persisted policy records as read models", async () => {
    const { listService, policyRepository } = await createHarness();
    policyRepository.items.set("system", {
      id: "dap_system",
      scope: { kind: "system" },
      mode: "provider",
      providerKey: "sslip",
      updatedAt: "2026-01-01T00:00:10.000Z",
    });
    policyRepository.items.set("deployment-target:srv_demo", {
      id: "dap_server",
      scope: { kind: "deployment-target", serverId: "srv_demo" },
      mode: "custom-template",
      providerKey: "internal-dns",
      templateRef: "apps/{{resourceSlug}}",
      updatedAt: "2026-01-01T00:00:11.000Z",
    });

    const result = await listService.execute();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "default-access-domain-policies.list/v1",
      items: [
        {
          schemaVersion: "default-access-domain-policies.policy/v1",
          id: "dap_system",
          scope: { kind: "system" },
          mode: "provider",
          providerKey: "sslip",
          updatedAt: "2026-01-01T00:00:10.000Z",
        },
        {
          schemaVersion: "default-access-domain-policies.policy/v1",
          id: "dap_server",
          scope: { kind: "deployment-target", serverId: "srv_demo" },
          mode: "custom-template",
          providerKey: "internal-dns",
          templateRef: "apps/{{resourceSlug}}",
          updatedAt: "2026-01-01T00:00:11.000Z",
        },
      ],
    });
  });
});
