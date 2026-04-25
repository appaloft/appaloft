import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { type DomainError, SshCredential, type SshCredentialState } from "@appaloft/core";

import {
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
  type SshCredentialReadModel,
  type SshCredentialRepository,
  type SshCredentialSummary,
  type SshCredentialUsageReader,
  type SshCredentialUsageServerSummary,
} from "../src";
import { RotateSshCredentialCommand } from "../src/messages";
import { RotateSshCredentialUseCase } from "../src/use-cases";

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_rotate_ssh_credential_test",
    entrypoint: "system",
  });
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

function credential(overrides?: Partial<SshCredentialSummary>): SshCredentialSummary {
  return {
    id: "cred_primary",
    name: "primary-key",
    kind: "ssh-private-key",
    username: "deploy",
    publicKeyConfigured: true,
    privateKeyConfigured: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function usage(
  overrides?: Partial<SshCredentialUsageServerSummary>,
): SshCredentialUsageServerSummary {
  return {
    serverId: "srv_primary",
    serverName: "Primary",
    lifecycleStatus: "active",
    providerKey: "generic-ssh",
    host: "203.0.113.10",
    username: "deploy",
    ...overrides,
  };
}

async function buildCredentialState(
  overrides?: Partial<{
    id: string;
    name: string;
    username: string;
    publicKey: string;
    privateKey: string;
    createdAt: string;
  }>,
): Promise<SshCredentialState> {
  const {
    CreatedAt,
    DeploymentTargetCredentialKindValue,
    DeploymentTargetUsername,
    SshCredentialId,
    SshCredentialName,
    SshPrivateKeyText,
    SshPublicKeyText,
  } = await import("@appaloft/core");

  const username = overrides?.username ?? "deploy";
  const publicKey = overrides?.publicKey ?? "ssh-ed25519 AAAA_OLD_PUBLIC";

  return {
    id: SshCredentialId.rehydrate(overrides?.id ?? "cred_primary"),
    name: SshCredentialName.rehydrate(overrides?.name ?? "primary-key"),
    kind: DeploymentTargetCredentialKindValue.rehydrate("ssh-private-key"),
    ...(username ? { username: DeploymentTargetUsername.rehydrate(username) } : {}),
    ...(publicKey ? { publicKey: SshPublicKeyText.rehydrate(publicKey) } : {}),
    privateKey: SshPrivateKeyText.rehydrate(overrides?.privateKey ?? "OLD_PRIVATE"),
    createdAt: CreatedAt.rehydrate(overrides?.createdAt ?? "2026-01-01T00:00:00.000Z"),
  };
}

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:10.000Z";
  }
}

class StaticSshCredentialReadModel implements SshCredentialReadModel {
  public findOneCalls = 0;

  constructor(private readonly credentials: SshCredentialSummary[]) {}

  async list(): Promise<SshCredentialSummary[]> {
    return this.credentials;
  }

  async findOne(
    _context: RepositoryContext,
    credentialIdOrSpec: unknown,
  ): Promise<SshCredentialSummary | null> {
    this.findOneCalls += 1;
    const credentialId = extractCredentialId(credentialIdOrSpec);
    return this.credentials.find((candidate) => candidate.id === credentialId) ?? null;
  }
}

class StaticSshCredentialUsageReader implements SshCredentialUsageReader {
  public listCalls = 0;

  constructor(
    private readonly usageBatches: SshCredentialUsageServerSummary[][],
    private readonly shouldThrow = false,
  ) {}

  async listByCredentialId(
    _context: RepositoryContext,
    _credentialId: string,
  ): Promise<SshCredentialUsageServerSummary[]> {
    if (this.shouldThrow) {
      this.listCalls += 1;
      throw new Error("usage unavailable");
    }
    const usages = this.usageBatches[Math.min(this.listCalls, this.usageBatches.length - 1)] ?? [];
    this.listCalls += 1;
    return usages;
  }
}

class RecordingSshCredentialRepository implements SshCredentialRepository {
  public updateCalls = 0;
  public updateSpecNames: string[] = [];
  public rotatedCredential: SshCredential | null = null;

  constructor(
    private readonly credentialState: SshCredentialState | null,
    private readonly updateResult = true,
    private readonly shouldThrowOnUpdate = false,
  ) {}

  async findOne(
    _context: RepositoryContext,
    credentialIdOrSpec: unknown,
  ): Promise<SshCredential | null> {
    const credentialId = extractCredentialId(credentialIdOrSpec);
    if (!this.credentialState || this.credentialState.id.value !== credentialId) {
      return null;
    }

    return SshCredential.rehydrate(this.credentialState);
  }

  async upsert(..._args: Parameters<SshCredentialRepository["upsert"]>): Promise<void> {
    throw new Error("SshCredentialRepository.upsert should not be used by rotate use case");
  }

  async updateOne(...args: Parameters<SshCredentialRepository["updateOne"]>): Promise<boolean> {
    if (this.shouldThrowOnUpdate) {
      throw new Error("update unavailable");
    }
    this.updateCalls += 1;
    this.rotatedCredential = args[1];
    this.updateSpecNames.push(args[2].constructor.name);
    return this.updateResult;
  }

  async deleteOne(..._args: Parameters<SshCredentialRepository["deleteOne"]>): Promise<never> {
    throw new Error("SshCredentialRepository.deleteOne should not be used by rotate use case");
  }
}

async function createHarness(input?: {
  credentials?: SshCredentialSummary[];
  credentialState?: SshCredentialState | null;
  usages?: SshCredentialUsageServerSummary[];
  usageBatches?: SshCredentialUsageServerSummary[][];
  usageThrows?: boolean;
  updateResult?: boolean;
  updateThrows?: boolean;
}) {
  const credentialState = input?.credentialState ?? (await buildCredentialState());
  const readModel = new StaticSshCredentialReadModel(input?.credentials ?? [credential()]);
  const usageReader = new StaticSshCredentialUsageReader(
    input?.usageBatches ?? [input?.usages ?? []],
    input?.usageThrows ?? false,
  );
  const repository = new RecordingSshCredentialRepository(
    credentialState,
    input?.updateResult ?? true,
    input?.updateThrows ?? false,
  );
  const useCase = new RotateSshCredentialUseCase(
    readModel,
    usageReader,
    repository,
    new FixedClock(),
  );

  return {
    context: createTestContext(),
    readModel,
    repository,
    usageReader,
    useCase,
  };
}

function assertErr(result: { isErr(): boolean; error?: DomainError }): DomainError {
  expect(result.isErr()).toBe(true);
  if (!result.isErr() || result.error === undefined) {
    throw new Error("Expected err result");
  }
  return result.error;
}

describe("RotateSshCredentialCommand", () => {
  test("[SSH-CRED-ROTATE-006] normalizes typed credential id confirmation and optional metadata", () => {
    const command = RotateSshCredentialCommand.create({
      credentialId: " cred_primary ",
      privateKey: " NEW_PRIVATE ",
      publicKey: " ssh-ed25519 NEW_PUBLIC ",
      username: " deploy-new ",
      confirmation: {
        credentialId: " cred_primary ",
        acknowledgeServerUsage: true,
      },
      idempotencyKey: " rotate-key ",
    });

    expect(command.isOk()).toBe(true);
    expect(command._unsafeUnwrap()).toMatchObject({
      credentialId: "cred_primary",
      privateKey: "NEW_PRIVATE",
      publicKey: "ssh-ed25519 NEW_PUBLIC",
      username: "deploy-new",
      confirmation: {
        credentialId: "cred_primary",
        acknowledgeServerUsage: true,
      },
      idempotencyKey: "rotate-key",
    });
  });
});

describe("RotateSshCredentialUseCase", () => {
  test("[SSH-CRED-ROTATE-001] rotates an unused reusable SSH credential in place", async () => {
    const { context, repository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      privateKey: "NEW_PRIVATE",
      publicKey: "ssh-ed25519 NEW_PUBLIC",
      username: "deploy-new",
      confirmation: {
        credentialId: "cred_primary",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "credentials.rotate-ssh/v1",
      credential: {
        id: "cred_primary",
        kind: "ssh-private-key",
        usernameConfigured: true,
        publicKeyConfigured: true,
        privateKeyConfigured: true,
        rotatedAt: "2026-01-01T00:00:10.000Z",
      },
      affectedUsage: {
        totalServers: 0,
        activeServers: 0,
        inactiveServers: 0,
        servers: [],
      },
    });
    expect(repository.updateCalls).toBe(1);
    expect(repository.updateSpecNames).toEqual(["RotateSshCredentialSpec"]);
    expect(repository.rotatedCredential?.toState()).toMatchObject({
      privateKey: { value: "NEW_PRIVATE" },
      publicKey: { value: "ssh-ed25519 NEW_PUBLIC" },
      username: { value: "deploy-new" },
      rotatedAt: { value: "2026-01-01T00:00:10.000Z" },
    });
  });

  test("[SSH-CRED-ROTATE-002] rotates an in-use credential only with acknowledgement", async () => {
    const { context, repository, useCase } = await createHarness({
      usages: [
        usage({ serverId: "srv_active", lifecycleStatus: "active" }),
        usage({ serverId: "srv_inactive", lifecycleStatus: "inactive" }),
      ],
    });

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      privateKey: "NEW_PRIVATE",
      publicKey: null,
      username: null,
      confirmation: {
        credentialId: "cred_primary",
        acknowledgeServerUsage: true,
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      affectedUsage: {
        totalServers: 2,
        activeServers: 1,
        inactiveServers: 1,
      },
    });
    expect(repository.rotatedCredential?.toState().publicKey).toBeUndefined();
    expect(repository.rotatedCredential?.toState().username).toBeUndefined();
  });

  test("[SSH-CRED-ROTATE-003] rejects in-use rotation without acknowledgement", async () => {
    const { context, repository, useCase } = await createHarness({
      usages: [usage({ serverId: "srv_active", lifecycleStatus: "active" })],
    });

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      privateKey: "NEW_PRIVATE",
      confirmation: {
        credentialId: "cred_primary",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "credential_rotation_requires_usage_acknowledgement",
      retryable: false,
      details: {
        commandName: "credentials.rotate-ssh",
        phase: "credential-safety-check",
        credentialId: "cred_primary",
        totalServers: 1,
        activeServers: 1,
        inactiveServers: 0,
      },
    });
    expect(repository.updateCalls).toBe(0);
  });

  test("[SSH-CRED-ROTATE-004] rejects when usage read is unavailable and does not rotate", async () => {
    const { context, repository, useCase } = await createHarness({ usageThrows: true });

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      privateKey: "NEW_PRIVATE",
      confirmation: {
        credentialId: "cred_primary",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "infra_error",
      retryable: true,
      details: {
        commandName: "credentials.rotate-ssh",
        phase: "credential-usage-read",
        credentialId: "cred_primary",
      },
    });
    expect(repository.updateCalls).toBe(0);
  });

  test("[SSH-CRED-ROTATE-005] rejects missing credentials before usage or mutation", async () => {
    const { context, repository, usageReader, useCase } = await createHarness({
      credentials: [],
      credentialState: null,
    });

    const result = await useCase.execute(context, {
      credentialId: "cred_missing",
      privateKey: "NEW_PRIVATE",
      confirmation: {
        credentialId: "cred_missing",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "not_found",
      details: {
        commandName: "credentials.rotate-ssh",
        phase: "credential-read",
        credentialId: "cred_missing",
      },
    });
    expect(usageReader.listCalls).toBe(0);
    expect(repository.updateCalls).toBe(0);
  });

  test("[SSH-CRED-ROTATE-006] rejects confirmation mismatch before usage or mutation", async () => {
    const { context, repository, usageReader, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      privateKey: "NEW_PRIVATE",
      confirmation: {
        credentialId: "cred_other",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "validation_error",
      details: {
        commandName: "credentials.rotate-ssh",
        phase: "command-validation",
        credentialId: "cred_primary",
        expectedCredentialId: "cred_primary",
        actualCredentialId: "cred_other",
      },
    });
    expect(usageReader.listCalls).toBe(0);
    expect(repository.updateCalls).toBe(0);
  });

  test("[SSH-CRED-ROTATE-006] credential rotation errors do not leak key material", async () => {
    const { context, useCase } = await createHarness({
      usages: [usage()],
    });

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      privateKey: "-----BEGIN PRIVATE KEY-----NEW_PRIVATE_KEY_SHOULD_NOT_LEAK",
      publicKey: "ssh-ed25519 NEW_PUBLIC_KEY_SHOULD_NOT_LEAK",
      confirmation: {
        credentialId: "cred_primary",
      },
    });
    const error = assertErr(result);
    const serialized = JSON.stringify(error);

    expect(serialized).not.toContain("NEW_PRIVATE_KEY_SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("NEW_PUBLIC_KEY_SHOULD_NOT_LEAK");
  });

  test("[SSH-CRED-ROTATE-008] reports mutation failures without leaking secrets", async () => {
    const { context, useCase } = await createHarness({ updateThrows: true });

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      privateKey: "NEW_PRIVATE_SHOULD_NOT_LEAK",
      confirmation: {
        credentialId: "cred_primary",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "infra_error",
      retryable: true,
      details: {
        commandName: "credentials.rotate-ssh",
        phase: "credential-mutation",
        credentialId: "cred_primary",
      },
    });
    expect(JSON.stringify(error)).not.toContain("NEW_PRIVATE_SHOULD_NOT_LEAK");
  });
});
