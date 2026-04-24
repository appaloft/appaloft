import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { type DomainError } from "@appaloft/core";

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
import { DeleteSshCredentialCommand } from "../src/messages";
import { DeleteSshCredentialUseCase } from "../src/use-cases";

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_delete_ssh_credential_test",
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
  public deleteCalls = 0;
  public deleteSpecNames: string[] = [];

  constructor(private readonly deleteResult = true) {}

  async findOne(..._args: Parameters<SshCredentialRepository["findOne"]>): Promise<never> {
    throw new Error("SshCredentialRepository.findOne should not be used by delete use case");
  }

  async upsert(..._args: Parameters<SshCredentialRepository["upsert"]>): Promise<void> {
    throw new Error("SshCredentialRepository.upsert should not be used by delete use case");
  }

  async deleteOne(...args: Parameters<SshCredentialRepository["deleteOne"]>): Promise<boolean> {
    this.deleteCalls += 1;
    this.deleteSpecNames.push(args[1].constructor.name);
    return this.deleteResult;
  }
}

async function createHarness(input?: {
  credentials?: SshCredentialSummary[];
  usages?: SshCredentialUsageServerSummary[];
  usageBatches?: SshCredentialUsageServerSummary[][];
  usageThrows?: boolean;
  deleteResult?: boolean;
}) {
  const readModel = new StaticSshCredentialReadModel(input?.credentials ?? [credential()]);
  const usageReader = new StaticSshCredentialUsageReader(
    input?.usageBatches ?? [input?.usages ?? []],
    input?.usageThrows ?? false,
  );
  const repository = new RecordingSshCredentialRepository(input?.deleteResult);
  const useCase = new DeleteSshCredentialUseCase(readModel, usageReader, repository);

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

describe("DeleteSshCredentialCommand", () => {
  test("[SSH-CRED-DELETE-005] normalizes typed credential id confirmation", () => {
    const command = DeleteSshCredentialCommand.create({
      credentialId: " cred_primary ",
      confirmation: {
        credentialId: " cred_primary ",
      },
      idempotencyKey: " delete-key ",
    });

    expect(command.isOk()).toBe(true);
    expect(command._unsafeUnwrap()).toMatchObject({
      credentialId: "cred_primary",
      confirmation: {
        credentialId: "cred_primary",
      },
      idempotencyKey: "delete-key",
    });
  });
});

describe("DeleteSshCredentialUseCase", () => {
  test("[SSH-CRED-DELETE-001] deletes an unused reusable SSH credential", async () => {
    const { context, repository, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      confirmation: {
        credentialId: "cred_primary",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: "cred_primary" });
    expect(repository.deleteCalls).toBe(1);
    expect(repository.deleteSpecNames).toEqual(["UnusedSshCredentialByIdSpec"]);
  });

  test("[SSH-CRED-DELETE-002] blocks delete when active or inactive visible servers use the credential", async () => {
    const { context, repository, useCase } = await createHarness({
      usages: [
        usage({ serverId: "srv_active", lifecycleStatus: "active" }),
        usage({ serverId: "srv_inactive", lifecycleStatus: "inactive" }),
      ],
    });

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      confirmation: {
        credentialId: "cred_primary",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "credential_in_use",
      retryable: false,
      details: {
        commandName: "credentials.delete-ssh",
        phase: "credential-safety-check",
        credentialId: "cred_primary",
        totalServers: 2,
        activeServers: 1,
        inactiveServers: 1,
      },
    });
    expect(repository.deleteCalls).toBe(0);
  });

  test("[SSH-CRED-DELETE-002] rechecks usage after guarded delete misses and rejects a raced visible reference", async () => {
    const { context, repository, usageReader, useCase } = await createHarness({
      deleteResult: false,
      usageBatches: [[], [usage({ serverId: "srv_raced", lifecycleStatus: "active" })]],
    });

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      confirmation: {
        credentialId: "cred_primary",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "credential_in_use",
      details: {
        commandName: "credentials.delete-ssh",
        phase: "credential-safety-check",
        credentialId: "cred_primary",
        totalServers: 1,
        activeServers: 1,
        inactiveServers: 0,
      },
    });
    expect(usageReader.listCalls).toBe(2);
    expect(repository.deleteCalls).toBe(1);
  });

  test("[SSH-CRED-DELETE-003] rejects when usage read is unavailable and does not delete", async () => {
    const { context, repository, useCase } = await createHarness({ usageThrows: true });

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      confirmation: {
        credentialId: "cred_primary",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "infra_error",
      retryable: true,
      details: {
        commandName: "credentials.delete-ssh",
        phase: "credential-usage-read",
        credentialId: "cred_primary",
      },
    });
    expect(repository.deleteCalls).toBe(0);
  });

  test("[SSH-CRED-DELETE-004] rejects missing credentials before usage or delete", async () => {
    const { context, repository, usageReader, useCase } = await createHarness({
      credentials: [],
    });

    const result = await useCase.execute(context, {
      credentialId: "cred_missing",
      confirmation: {
        credentialId: "cred_missing",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "not_found",
      details: {
        commandName: "credentials.delete-ssh",
        phase: "credential-read",
        credentialId: "cred_missing",
      },
    });
    expect(usageReader.listCalls).toBe(0);
    expect(repository.deleteCalls).toBe(0);
  });

  test("[SSH-CRED-DELETE-005] rejects confirmation mismatch before usage or delete", async () => {
    const { context, repository, usageReader, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      confirmation: {
        credentialId: "cred_other",
      },
    });
    const error = assertErr(result);

    expect(error).toMatchObject({
      code: "validation_error",
      details: {
        commandName: "credentials.delete-ssh",
        phase: "command-validation",
        credentialId: "cred_primary",
        expectedCredentialId: "cred_primary",
        actualCredentialId: "cred_other",
      },
    });
    expect(usageReader.listCalls).toBe(0);
    expect(repository.deleteCalls).toBe(0);
  });

  test("[SSH-CRED-DELETE-006] credential delete errors do not leak key material", async () => {
    const { context, useCase } = await createHarness({
      credentials: [
        {
          ...credential(),
          publicKeyConfigured: true,
          privateKeyConfigured: true,
          publicKey: "ssh-ed25519 AAAA_PUBLIC_KEY_SHOULD_NOT_LEAK",
          privateKey: "-----BEGIN PRIVATE KEY-----PRIVATE_KEY_SHOULD_NOT_LEAK",
          privateKeyPath: "/Users/operator/.ssh/appaloft-demo",
        } as SshCredentialSummary,
      ],
      usages: [usage()],
    });

    const result = await useCase.execute(context, {
      credentialId: "cred_primary",
      confirmation: {
        credentialId: "cred_primary",
      },
    });
    const error = assertErr(result);
    const serialized = JSON.stringify(error);

    expect(serialized).not.toContain("PRIVATE_KEY_SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("AAAA_PUBLIC_KEY_SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("/Users/operator/.ssh/appaloft-demo");
  });
});
