import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTargetId,
  DeploymentTargetName,
  domainError,
  err,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Result,
  Server,
  UpsertServerSpec,
} from "@appaloft/core";
import { FixedClock, MemoryServerRepository, SequenceIdGenerator } from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src";
import { ConfigureDefaultAccessDomainPolicyCommand } from "../src/messages";
import {
  type DefaultAccessDomainPolicyByScopeSpec,
  type DefaultAccessDomainPolicyConfiguration,
  type DefaultAccessDomainPolicyRecord,
  type DefaultAccessDomainPolicyRepository,
  type DefaultAccessDomainPolicyScope,
  type DefaultAccessDomainPolicySupport,
} from "../src/ports";
import { ConfigureDefaultAccessDomainPolicyUseCase } from "../src/use-cases";

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

class StaticDefaultAccessDomainPolicySupport implements DefaultAccessDomainPolicySupport {
  async validate(
    _context: Parameters<DefaultAccessDomainPolicySupport["validate"]>[0],
    input: DefaultAccessDomainPolicyConfiguration,
  ): Promise<Result<DefaultAccessDomainPolicyConfiguration>> {
    if (input.mode === "disabled") {
      return ok({ mode: "disabled" });
    }

    if (input.mode === "custom-template") {
      return err(
        domainError.defaultAccessProviderUnavailable(
          "Default access custom-template providers are not configured",
          {
            phase: "provider-resolution",
            providerKey: input.providerKey ?? "custom-template",
          },
          false,
        ),
      );
    }

    if (input.providerKey !== "sslip") {
      return err(
        domainError.defaultAccessProviderUnavailable(
          "Default access domain provider is not registered",
          {
            phase: "provider-resolution",
            providerKey: input.providerKey ?? "",
          },
          false,
        ),
      );
    }

    return ok({
      mode: "provider",
      providerKey: input.providerKey,
    });
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
    requestId: "req_configure_default_access_policy_test",
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
    useCase: new ConfigureDefaultAccessDomainPolicyUseCase(
      policyRepository,
      new StaticDefaultAccessDomainPolicySupport(),
      serverRepository,
      new FixedClock("2026-01-01T00:00:10.000Z"),
      new SequenceIdGenerator(),
    ),
  };
}

describe("default-access-domain-policies.configure command", () => {
  test("[DEF-ACCESS-POLICY-001] persists system-scoped provider policy", async () => {
    const { context, policyRepository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      scope: { kind: "system" },
      mode: "provider",
      providerKey: "sslip",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().id).toBe("dap_0001");
    expect(policyRepository.items.get("system")).toEqual({
      id: "dap_0001",
      scope: { kind: "system" },
      mode: "provider",
      providerKey: "sslip",
      updatedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[DEF-ACCESS-POLICY-002] persists deployment-target override for an existing server", async () => {
    const { context, policyRepository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      scope: { kind: "deployment-target", serverId: "srv_demo" },
      mode: "disabled",
    });

    expect(result.isOk()).toBe(true);
    expect(policyRepository.items.get("deployment-target:srv_demo")).toEqual({
      id: "dap_0001",
      scope: { kind: "deployment-target", serverId: "srv_demo" },
      mode: "disabled",
      updatedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[DEF-ACCESS-POLICY-003] reuses the existing record for idempotent retries", async () => {
    const { context, useCase } = await createHarness();

    const first = await useCase.execute(context, {
      scope: { kind: "system" },
      mode: "provider",
      providerKey: "sslip",
      idempotencyKey: "policy-1",
    });
    const second = await useCase.execute(context, {
      scope: { kind: "system" },
      mode: "provider",
      providerKey: "sslip",
      idempotencyKey: "policy-1",
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(first._unsafeUnwrap().id).toBe("dap_0001");
    expect(second._unsafeUnwrap().id).toBe("dap_0001");
  });

  test("[DEF-ACCESS-POLICY-004] rejects conflicting retries for the same idempotency key", async () => {
    const { context, useCase } = await createHarness();

    const first = await useCase.execute(context, {
      scope: { kind: "system" },
      mode: "provider",
      providerKey: "sslip",
      idempotencyKey: "policy-1",
    });
    const second = await useCase.execute(context, {
      scope: { kind: "system" },
      mode: "disabled",
      idempotencyKey: "policy-1",
    });

    expect(first.isOk()).toBe(true);
    expect(second.isErr()).toBe(true);
    expect(second._unsafeUnwrapErr()).toMatchObject({
      code: "default_access_policy_conflict",
      details: {
        phase: "policy-admission",
        idempotencyKey: "policy-1",
        scopeKind: "system",
      },
    });
  });

  test("[DEF-ACCESS-POLICY-005] rejects unsupported providers and missing deployment targets", async () => {
    const { context, useCase } = await createHarness();

    const unsupported = await useCase.execute(context, {
      scope: { kind: "system" },
      mode: "provider",
      providerKey: "unknown",
    });
    const missingServer = await useCase.execute(context, {
      scope: { kind: "deployment-target", serverId: "srv_missing" },
      mode: "disabled",
    });

    expect(unsupported.isErr()).toBe(true);
    expect(unsupported._unsafeUnwrapErr().code).toBe("default_access_provider_unavailable");
    expect(missingServer.isErr()).toBe(true);
    expect(missingServer._unsafeUnwrapErr().code).toBe("not_found");
  });

  test("[DEF-ACCESS-POLICY-006] validates command input shape at the schema boundary", () => {
    const command = ConfigureDefaultAccessDomainPolicyCommand.create({
      scope: { kind: "deployment-target", serverId: "" },
      mode: "provider",
      providerKey: "",
    });

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
