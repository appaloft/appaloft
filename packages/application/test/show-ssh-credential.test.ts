import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { type DomainError } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext } from "../src/execution-context";

interface ResultLike<T> {
  isOk(): boolean;
  isErr(): boolean;
  value?: T;
  error?: DomainError;
}

interface ShowSshCredentialQueryLike {
  credentialId: string;
  includeUsage: boolean;
}

interface ShowSshCredentialQueryFactory {
  create(input: {
    credentialId: string;
    includeUsage?: boolean;
  }): ResultLike<ShowSshCredentialQueryLike>;
}

interface SshCredentialDetail {
  schemaVersion: "credentials.show/v1";
  credential: {
    id: string;
    name: string;
    kind: "ssh-private-key";
    username?: string;
    publicKeyConfigured: boolean;
    privateKeyConfigured: boolean;
    createdAt: string;
  };
  usage?: {
    totalServers: number;
    activeServers: number;
    inactiveServers: number;
    servers: Array<{
      serverId: string;
      serverName: string;
      lifecycleStatus: "active" | "inactive";
      providerKey: string;
      host: string;
      username?: string;
    }>;
  };
  generatedAt: string;
}

interface ShowSshCredentialQueryServiceLike {
  execute(
    context: ExecutionContext,
    query: ShowSshCredentialQueryLike,
  ): Promise<ResultLike<SshCredentialDetail>>;
}

interface SshCredentialReadRow {
  id: string;
  name: string;
  kind: "ssh-private-key";
  username?: string;
  publicKeyConfigured: boolean;
  privateKeyConfigured: boolean;
  createdAt: string;
  publicKey?: string;
  privateKey?: string;
  privateKeyPath?: string;
}

interface SshCredentialUsageRow {
  credentialId: string | undefined;
  serverId: string;
  serverName: string;
  lifecycleStatus: "active" | "inactive" | "deleted";
  providerKey: string;
  host: string;
  username?: string;
  credentialMode: "stored-ssh-private-key" | "ssh-private-key" | "local-ssh-agent";
}

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:10.000Z";
  }
}

class StaticSshCredentialReadModel {
  public findOneCalls = 0;

  constructor(private readonly credentials: SshCredentialReadRow[]) {}

  async findOne(
    _context: unknown,
    credentialIdOrSpec: unknown,
  ): Promise<SshCredentialReadRow | null> {
    this.findOneCalls += 1;
    const credentialId = extractCredentialId(credentialIdOrSpec);
    return this.credentials.find((credential) => credential.id === credentialId) ?? null;
  }
}

class StaticSshCredentialUsageReader {
  public listCalls = 0;

  constructor(
    private readonly usages: SshCredentialUsageRow[],
    private readonly shouldThrow = false,
  ) {}

  async listByCredentialId(
    _context: unknown,
    credentialId: string,
  ): Promise<SshCredentialUsageRow[]> {
    this.listCalls += 1;
    if (this.shouldThrow) {
      throw new Error("usage unavailable");
    }
    return this.usages.filter((usage) => usage.credentialId === credentialId);
  }

  async listForCredential(
    context: unknown,
    credentialId: string,
  ): Promise<SshCredentialUsageRow[]> {
    return this.listByCredentialId(context, credentialId);
  }
}

function extractCredentialId(credentialIdOrSpec: unknown): string | null {
  if (typeof credentialIdOrSpec === "string") {
    return credentialIdOrSpec;
  }

  if (!credentialIdOrSpec || typeof credentialIdOrSpec !== "object") {
    return null;
  }

  const maybeSpec = credentialIdOrSpec as {
    accept?: <TResult>(
      query: TResult,
      visitor: {
        visitSshCredentialById(query: TResult, spec: { id: { value: string } }): TResult;
        visitUnusedSshCredentialById(query: TResult, spec: { id: { value: string } }): TResult;
      },
    ) => TResult;
  };

  if (typeof maybeSpec.accept !== "function") {
    return null;
  }

  return maybeSpec.accept<string | null>(null, {
    visitSshCredentialById: (_query, spec) => spec.id.value,
    visitUnusedSshCredentialById: (_query, spec) => spec.id.value,
  });
}

async function loadTargetTypes() {
  const messages = (await import("../src/messages")) as Record<string, unknown>;
  const useCases = (await import("../src/use-cases")) as Record<string, unknown>;
  const ShowSshCredentialQuery = messages.ShowSshCredentialQuery as
    | ShowSshCredentialQueryFactory
    | undefined;
  const ShowSshCredentialQueryService = useCases.ShowSshCredentialQueryService as
    | (new (
        credentialReadModel: unknown,
        usageReader: unknown,
        clock: FixedClock,
      ) => ShowSshCredentialQueryServiceLike)
    | undefined;

  expect(ShowSshCredentialQuery, "ShowSshCredentialQuery export").toBeDefined();
  expect(ShowSshCredentialQueryService, "ShowSshCredentialQueryService export").toBeDefined();

  if (!ShowSshCredentialQuery || !ShowSshCredentialQueryService) {
    throw new Error("credentials.show query implementation is not exported yet");
  }

  return { ShowSshCredentialQuery, ShowSshCredentialQueryService };
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_show_ssh_credential_test",
    entrypoint: "system",
  });
}

function credential(overrides?: Partial<SshCredentialReadRow>): SshCredentialReadRow {
  return {
    id: "cred_primary",
    name: "primary-key",
    kind: "ssh-private-key",
    username: "deploy",
    publicKeyConfigured: true,
    privateKeyConfigured: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    publicKey: "ssh-ed25519 AAAA_PUBLIC_KEY_SHOULD_NOT_LEAK",
    privateKey: "-----BEGIN PRIVATE KEY-----PRIVATE_KEY_SHOULD_NOT_LEAK",
    privateKeyPath: "/Users/operator/.ssh/appaloft-demo",
    ...overrides,
  };
}

function usage(overrides?: Partial<SshCredentialUsageRow>): SshCredentialUsageRow {
  return {
    credentialId: "cred_primary",
    serverId: "srv_primary",
    serverName: "Primary",
    lifecycleStatus: "active",
    providerKey: "generic-ssh",
    host: "203.0.113.10",
    username: "deploy",
    credentialMode: "stored-ssh-private-key",
    ...overrides,
  };
}

function assertOk<T>(result: ResultLike<T>): T {
  expect(result.isOk()).toBe(true);
  if (!result.isOk() || result.value === undefined) {
    throw new Error(result.error?.message ?? "Expected ok result");
  }
  return result.value;
}

function assertErr<T>(result: ResultLike<T>): DomainError {
  expect(result.isErr()).toBe(true);
  if (!result.isErr() || result.error === undefined) {
    throw new Error("Expected err result");
  }
  return result.error;
}

async function createQuery(input?: {
  credentialId?: string;
  includeUsage?: boolean;
}): Promise<ShowSshCredentialQueryLike> {
  const { ShowSshCredentialQuery } = await loadTargetTypes();
  const result = ShowSshCredentialQuery.create({
    credentialId: input?.credentialId ?? "cred_primary",
    ...(input?.includeUsage === undefined ? {} : { includeUsage: input.includeUsage }),
  });

  return assertOk(result);
}

async function createService(input?: {
  credentials?: SshCredentialReadRow[];
  usages?: SshCredentialUsageRow[];
  usageThrows?: boolean;
}) {
  const { ShowSshCredentialQueryService } = await loadTargetTypes();
  const credentialReadModel = new StaticSshCredentialReadModel(
    input?.credentials ?? [credential()],
  );
  const usageReader = new StaticSshCredentialUsageReader(
    input?.usages ?? [],
    input?.usageThrows ?? false,
  );
  const service = new ShowSshCredentialQueryService(
    credentialReadModel,
    usageReader,
    new FixedClock(),
  );

  return { credentialReadModel, service, usageReader };
}

describe("ShowSshCredentialQueryService", () => {
  test("[SSH-CRED-SHOW-001] credentials.show returns masked credential detail", async () => {
    const { service } = await createService();

    const result = await service.execute(createTestContext(), await createQuery());
    const detail = assertOk(result);

    expect(detail).toMatchObject({
      schemaVersion: "credentials.show/v1",
      credential: {
        id: "cred_primary",
        name: "primary-key",
        kind: "ssh-private-key",
        username: "deploy",
        publicKeyConfigured: true,
        privateKeyConfigured: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      generatedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[SSH-CRED-SHOW-002] credentials.show returns not_found for a missing credential", async () => {
    const { service } = await createService({ credentials: [] });

    const result = await service.execute(createTestContext(), await createQuery());
    const error = assertErr(result);

    expect(error.code).toBe("not_found");
    expect(error.retryable).toBe(false);
    expect(error.details).toMatchObject({
      queryName: "credentials.show",
      phase: "credential-read",
      credentialId: "cred_primary",
    });
  });

  test("[SSH-CRED-SHOW-003] credentials.show returns active and inactive server usage", async () => {
    const { service } = await createService({
      usages: [
        usage({ serverId: "srv_active_one", serverName: "Active One", lifecycleStatus: "active" }),
        usage({ serverId: "srv_active_two", serverName: "Active Two", lifecycleStatus: "active" }),
        usage({
          serverId: "srv_inactive",
          serverName: "Inactive",
          lifecycleStatus: "inactive",
        }),
      ],
    });

    const result = await service.execute(createTestContext(), await createQuery());
    const detail = assertOk(result);

    expect(detail.usage).toMatchObject({
      totalServers: 3,
      activeServers: 2,
      inactiveServers: 1,
      servers: [
        {
          serverId: "srv_active_one",
          serverName: "Active One",
          lifecycleStatus: "active",
          providerKey: "generic-ssh",
          host: "203.0.113.10",
          username: "deploy",
        },
        {
          serverId: "srv_active_two",
          serverName: "Active Two",
          lifecycleStatus: "active",
        },
        {
          serverId: "srv_inactive",
          serverName: "Inactive",
          lifecycleStatus: "inactive",
        },
      ],
    });
  });

  test("[SSH-CRED-SHOW-004] credentials.show does not count direct key or local-agent servers as reusable usage", async () => {
    const { service } = await createService({
      usages: [
        usage({
          credentialId: undefined,
          credentialMode: "ssh-private-key",
          serverId: "srv_direct_key",
        }),
        usage({
          credentialId: undefined,
          credentialMode: "local-ssh-agent",
          serverId: "srv_local_agent",
        }),
      ],
    });

    const result = await service.execute(createTestContext(), await createQuery());
    const detail = assertOk(result);

    expect(detail.usage).toMatchObject({
      totalServers: 0,
      activeServers: 0,
      inactiveServers: 0,
      servers: [],
    });
  });

  test("[SSH-CRED-SHOW-005] credentials.show omits usage when includeUsage is false", async () => {
    const { service, usageReader } = await createService({
      usages: [usage()],
    });

    const result = await service.execute(
      createTestContext(),
      await createQuery({ includeUsage: false }),
    );
    const detail = assertOk(result);

    expect(detail.usage).toBeUndefined();
    expect(usageReader.listCalls).toBe(0);
  });

  test("[SSH-CRED-SHOW-006] credentials.show fails when usage read is unavailable", async () => {
    const { service } = await createService({ usageThrows: true });

    const result = await service.execute(createTestContext(), await createQuery());
    const error = assertErr(result);

    expect(error.code).toBe("infra_error");
    expect(error.retryable).toBe(true);
    expect(error.details).toMatchObject({
      queryName: "credentials.show",
      phase: "credential-usage-read",
      credentialId: "cred_primary",
    });
  });

  test("[SSH-CRED-SHOW-007] credentials.show does not leak credential material", async () => {
    const { service } = await createService();

    const result = await service.execute(createTestContext(), await createQuery());
    const detail = assertOk(result);
    const serialized = JSON.stringify(detail);

    expect(serialized).not.toContain("PRIVATE_KEY_SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("AAAA_PUBLIC_KEY_SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("/Users/operator/.ssh/appaloft-demo");
    expect(serialized).not.toContain('"privateKey":');
    expect(serialized).not.toContain('publicKey":"');
  });
});
