import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type Clock,
  createExecutionContext,
  type DependencyResourceSafeQueryInput,
  type DependencyResourceSecretStore,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";

import {
  type DependencyResourcePostgresQueryExecutor,
  dependencyResourceSafeQueryConnectTimeoutSeconds,
  type ManagedDependencyResourcePostgresQueryExecutor,
  PostgresDependencyResourceSafeQueryProvider,
  PostgresJsDependencyResourceQueryExecutor,
} from "../src/dependency-resource-safe-query-provider";

const context = createExecutionContext({
  requestId: "req_safe_query_provider_test",
  entrypoint: "system",
});

const clock: Clock = {
  now: () => "2026-07-20T00:00:00.000Z",
};

const postgresDependency: DependencyResourceSafeQueryInput["dependencyResource"] = {
  id: "rsi_external_pg",
  projectId: "prj_demo",
  environmentId: "env_demo",
  name: "External Postgres",
  slug: "external-postgres",
  kind: "postgres",
  sourceMode: "imported-external",
  providerKey: "external-postgres",
  providerManaged: false,
  lifecycleStatus: "ready",
  connection: {
    host: "db.example.test",
    port: 5432,
    databaseName: "postgres",
    maskedConnection: "postgresql://postgres:********@db.example.test:5432/postgres",
    secretRef: "appaloft://dependency-resources/rsi_external_pg/connection",
  },
  desiredCapabilities: [],
  capabilityReadbacks: [],
  bindingReadiness: { status: "ready" },
  createdAt: "2026-07-20T00:00:00.000Z",
};

class CapturingSecretStore implements DependencyResourceSecretStore {
  resolvedRefs: string[] = [];

  async storeConnection(): Promise<Result<{ secretRef: string }, DomainError>> {
    return ok({ secretRef: postgresDependency.connection?.secretRef ?? "" });
  }

  async resolve(
    _context: Parameters<DependencyResourceSecretStore["resolve"]>[0],
    input: Parameters<DependencyResourceSecretStore["resolve"]>[1],
  ): Promise<Result<{ secretRef: string; secretValue: string }, DomainError>> {
    this.resolvedRefs.push(input.secretRef);
    return ok({
      secretRef: input.secretRef,
      secretValue: "postgresql://postgres:secret@db.example.test:5432/postgres",
    });
  }
}

class CapturingPostgresExecutor implements DependencyResourcePostgresQueryExecutor {
  inputs: Parameters<DependencyResourcePostgresQueryExecutor["execute"]>[0][] = [];

  async execute(
    input: Parameters<DependencyResourcePostgresQueryExecutor["execute"]>[0],
  ): ReturnType<DependencyResourcePostgresQueryExecutor["execute"]> {
    this.inputs.push(input);
    return ok({
      columns: [{ name: "answer", type: "int4" }],
      rows: [{ answer: 42 }],
      truncated: false,
    });
  }
}

describe("PostgresDependencyResourceSafeQueryProvider", () => {
  test("[DEP-SAFE-QRY-009] bounds external connection setup below the HTTP gateway deadline", () => {
    expect(dependencyResourceSafeQueryConnectTimeoutSeconds(500)).toBe(1);
    expect(dependencyResourceSafeQueryConnectTimeoutSeconds(5_000)).toBe(3);
    expect(dependencyResourceSafeQueryConnectTimeoutSeconds(30_000)).toBe(3);
  });

  test("[DEP-SAFE-QRY-010] returns a redacted provider error when connection setup throws", async () => {
    const executor = new PostgresJsDependencyResourceQueryExecutor();
    const result = await executor.execute({
      connectionUrl: "not-a-postgres-url",
      statement: "select 1",
      maxRows: 10,
      timeoutMs: 5_000,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      retryable: true,
      details: { phase: "dependency-resource-safe-query-postgres" },
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("not-a-postgres-url");
  });

  test("[DEP-SAFE-QRY-005] resolves an Appaloft secret reference and executes a bounded query", async () => {
    const secretStore = new CapturingSecretStore();
    const executor = new CapturingPostgresExecutor();
    const provider = new PostgresDependencyResourceSafeQueryProvider(secretStore, clock, executor);

    expect(provider.supports(postgresDependency)).toBe(true);

    const result = await provider.execute(context, {
      dependencyResource: postgresDependency,
      statement: "select 42 as answer",
      maxRows: 100,
      timeoutMs: 5_000,
    });

    expect(result.isOk()).toBe(true);
    expect(secretStore.resolvedRefs).toEqual([
      "appaloft://dependency-resources/rsi_external_pg/connection",
    ]);
    expect(executor.inputs[0]).toMatchObject({
      connectionUrl: "postgresql://postgres:secret@db.example.test:5432/postgres",
      maxRows: 100,
      statement: "select 42 as answer",
      timeoutMs: 5_000,
    });
    expect(result._unsafeUnwrap()).toMatchObject({
      dependencyResourceId: "rsi_external_pg",
      rows: [{ answer: 42 }],
      executedAt: "2026-07-20T00:00:00.000Z",
    });
  });

  test("[DEP-SAFE-QRY-006] fails closed when the dependency has no owned connection secret", async () => {
    const secretStore = new CapturingSecretStore();
    const executor = new CapturingPostgresExecutor();
    const provider = new PostgresDependencyResourceSafeQueryProvider(secretStore, clock, executor);

    const result = await provider.execute(context, {
      dependencyResource: { ...postgresDependency, connection: undefined },
      statement: "select 1",
      maxRows: 100,
      timeoutMs: 5_000,
    });

    expect(result.isErr()).toBe(true);
    expect(executor.inputs).toHaveLength(0);
  });

  test("[DEP-SAFE-QRY-007] does not leak a provider error message containing the connection URL", async () => {
    const secretStore = new CapturingSecretStore();
    const executor: DependencyResourcePostgresQueryExecutor = {
      async execute() {
        return err({
          code: "provider_error",
          message: "connection failed",
          details: { phase: "dependency-resource-safe-query-postgres" },
          retryable: true,
        });
      },
    };
    const provider = new PostgresDependencyResourceSafeQueryProvider(secretStore, clock, executor);

    const result = await provider.execute(context, {
      dependencyResource: postgresDependency,
      statement: "select 1",
      maxRows: 100,
      timeoutMs: 5_000,
    });

    expect(result.isErr()).toBe(true);
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("secret@");
  });

  test("[DEP-SAFE-QRY-008] routes managed Postgres through its realization executor without resolving a connection secret", async () => {
    const secretStore = new CapturingSecretStore();
    const externalExecutor = new CapturingPostgresExecutor();
    const managedInputs: Parameters<
      ManagedDependencyResourcePostgresQueryExecutor["execute"]
    >[0][] = [];
    const managedExecutor: ManagedDependencyResourcePostgresQueryExecutor = {
      async execute(input) {
        managedInputs.push(input);
        return ok({
          columns: [{ name: "count" }],
          rows: [{ count: 3 }],
          truncated: false,
        });
      },
    };
    const provider = new PostgresDependencyResourceSafeQueryProvider(
      secretStore,
      clock,
      externalExecutor,
      managedExecutor,
    );
    const managedDependency = {
      ...postgresDependency,
      sourceMode: "appaloft-managed" as const,
      providerKey: "appaloft-managed-postgres",
      providerManaged: true,
      providerRealization: {
        status: "ready" as const,
        attemptId: "dpr_ready",
        attemptedAt: "2026-07-20T00:00:00.000Z",
        providerResourceHandle:
          "docker-single-server:v1:postgres:srv_demo:appaloft-postgres-rsi_external_pg",
        realizedAt: "2026-07-20T00:00:00.000Z",
      },
    };

    const result = await provider.execute(context, {
      dependencyResource: managedDependency,
      statement: "select count(*) as count from products",
      maxRows: 100,
      timeoutMs: 5_000,
    });

    expect(result.isOk()).toBe(true);
    expect(managedInputs).toHaveLength(1);
    expect(secretStore.resolvedRefs).toHaveLength(0);
    expect(externalExecutor.inputs).toHaveLength(0);
  });
});
