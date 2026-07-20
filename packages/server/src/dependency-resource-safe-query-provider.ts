import {
  type Clock,
  type DependencyResourceSafeQueryColumn,
  type DependencyResourceSafeQueryInput,
  type DependencyResourceSafeQueryPort,
  type DependencyResourceSafeQueryResult,
  type DependencyResourceSecretStore,
  type ExecutionContext,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import postgres from "postgres";

const maximumResultBytes = 1_048_576;
const maximumConnectTimeoutSeconds = 3;
const maximumExecutionDeadlineMs = 3_000;

type SafeQueryScalar = string | number | boolean | null;

export interface DependencyResourcePostgresQueryExecutionResult {
  columns: DependencyResourceSafeQueryColumn[];
  rows: Record<string, SafeQueryScalar>[];
  truncated: boolean;
}

export interface DependencyResourcePostgresQueryExecutorInput {
  connectionUrl: string;
  statement: string;
  maxRows: number;
  timeoutMs: number;
}

export interface DependencyResourcePostgresQueryExecutor {
  execute(
    input: DependencyResourcePostgresQueryExecutorInput,
  ): Promise<Result<DependencyResourcePostgresQueryExecutionResult, DomainError>>;
}

export interface ManagedDependencyResourcePostgresQueryExecutorInput {
  context: ExecutionContext;
  dependencyResource: DependencyResourceSafeQueryInput["dependencyResource"];
  statement: string;
  maxRows: number;
  timeoutMs: number;
}

export interface ManagedDependencyResourcePostgresQueryExecutor {
  execute(
    input: ManagedDependencyResourcePostgresQueryExecutorInput,
  ): Promise<Result<DependencyResourcePostgresQueryExecutionResult, DomainError>>;
}

function scalarValue(value: unknown): SafeQueryScalar {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Uint8Array) {
    return "[binary]";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function boundedDependencyResourceSafeQueryRows(
  rows: readonly Record<string, unknown>[],
  maxRows: number,
): { rows: Record<string, SafeQueryScalar>[]; truncated: boolean } {
  const bounded: Record<string, SafeQueryScalar>[] = [];
  let bytes = 0;
  let truncated = rows.length > maxRows;

  for (const source of rows.slice(0, maxRows)) {
    const row = Object.fromEntries(
      Object.entries(source).map(([key, value]) => [key, scalarValue(value)]),
    );
    const rowBytes = Buffer.byteLength(JSON.stringify(row), "utf8");
    if (bytes + rowBytes > maximumResultBytes) {
      truncated = true;
      break;
    }
    bytes += rowBytes;
    bounded.push(row);
  }

  return { rows: bounded, truncated };
}

function safeQueryProviderError(cause: unknown): DomainError {
  const candidate = cause as { code?: unknown; name?: unknown };
  return domainError.provider(
    "Postgres dependency safe query failed",
    {
      phase: "dependency-resource-safe-query-postgres",
      cause:
        typeof candidate.code === "string"
          ? candidate.code
          : typeof candidate.name === "string"
            ? candidate.name
            : "unknown",
    },
    true,
  );
}

function normalizedStatement(statement: string): string {
  return statement.trim().replace(/;\s*$/u, "");
}

export function dependencyResourceSafeQueryConnectTimeoutSeconds(timeoutMs: number): number {
  return Math.min(maximumConnectTimeoutSeconds, Math.max(1, Math.ceil(timeoutMs / 1_000)));
}

export function dependencyResourceSafeQueryExecutionDeadlineMs(timeoutMs: number): number {
  return Math.min(maximumExecutionDeadlineMs, Math.max(1, timeoutMs));
}

export async function executeDependencyResourceSafeQueryWithDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          onTimeout();
          const cause = new Error("Dependency safe query exceeded its execution deadline");
          cause.name = "TimeoutError";
          reject(cause);
        }, dependencyResourceSafeQueryExecutionDeadlineMs(timeoutMs));
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export class PostgresJsDependencyResourceQueryExecutor
  implements DependencyResourcePostgresQueryExecutor
{
  async execute(
    input: DependencyResourcePostgresQueryExecutorInput,
  ): Promise<Result<DependencyResourcePostgresQueryExecutionResult, DomainError>> {
    let sql: ReturnType<typeof postgres> | undefined;
    try {
      sql = postgres(input.connectionUrl, {
        connect_timeout: dependencyResourceSafeQueryConnectTimeoutSeconds(input.timeoutMs),
        idle_timeout: 1,
        max: 1,
        max_lifetime: Math.max(1, Math.ceil(input.timeoutMs / 1_000) + 1),
        prepare: false,
      });
      const result = await executeDependencyResourceSafeQueryWithDeadline(
        sql.begin("read only", async (transaction) => {
          await transaction.unsafe(`SET LOCAL statement_timeout = ${input.timeoutMs}`);
          return await transaction.unsafe<Record<string, unknown>[]>(
            `SELECT * FROM (${normalizedStatement(input.statement)}) AS appaloft_safe_query LIMIT ${input.maxRows + 1}`,
          );
        }),
        input.timeoutMs,
        () => {
          void sql?.end({ timeout: 0 }).catch(() => undefined);
        },
      );
      const limited = boundedDependencyResourceSafeQueryRows(result, input.maxRows);
      return ok({
        columns: result.columns.map((column) => ({
          name: column.name,
          type: String(column.type),
        })),
        rows: limited.rows,
        truncated: limited.truncated,
      });
    } catch (cause) {
      return err(safeQueryProviderError(cause));
    } finally {
      await sql?.end({ timeout: 0 }).catch(() => undefined);
    }
  }
}

function isOwnedConnectionSecretRef(secretRef: string | undefined): secretRef is string {
  return Boolean(secretRef?.startsWith("appaloft://dependency-resources/"));
}

export class PostgresDependencyResourceSafeQueryProvider
  implements DependencyResourceSafeQueryPort
{
  constructor(
    private readonly secretStore: DependencyResourceSecretStore,
    private readonly clock: Clock,
    private readonly postgresExecutor: DependencyResourcePostgresQueryExecutor = new PostgresJsDependencyResourceQueryExecutor(),
    private readonly managedPostgresExecutor?: ManagedDependencyResourcePostgresQueryExecutor,
  ) {}

  supports(dependencyResource: DependencyResourceSafeQueryInput["dependencyResource"]): boolean {
    if (dependencyResource.kind !== "postgres") {
      return false;
    }
    if (dependencyResource.providerManaged) {
      return Boolean(
        this.managedPostgresExecutor &&
          dependencyResource.providerKey === "appaloft-managed-postgres" &&
          dependencyResource.providerRealization?.providerResourceHandle?.startsWith(
            "docker-single-server:v1:postgres:",
          ),
      );
    }
    return (
      dependencyResource.providerKey === "external-postgres" &&
      isOwnedConnectionSecretRef(dependencyResource.connection?.secretRef)
    );
  }

  async execute(
    context: ExecutionContext,
    input: DependencyResourceSafeQueryInput,
  ): Promise<Result<Omit<DependencyResourceSafeQueryResult, "schemaVersion">, DomainError>> {
    if (input.dependencyResource.kind !== "postgres") {
      return err(
        domainError.providerCapabilityUnsupported(
          "Dependency resource safe query provider supports Postgres only",
          {
            phase: "dependency-resource-safe-query-provider-selection",
            dependencyResourceId: input.dependencyResource.id,
            kind: input.dependencyResource.kind,
            providerKey: input.dependencyResource.providerKey,
          },
        ),
      );
    }

    let executed: Result<DependencyResourcePostgresQueryExecutionResult, DomainError>;
    if (input.dependencyResource.providerManaged) {
      if (!this.managedPostgresExecutor) {
        return err(
          domainError.providerCapabilityUnsupported(
            "Managed Postgres dependency safe query executor is not configured",
            {
              phase: "dependency-resource-safe-query-provider-selection",
              dependencyResourceId: input.dependencyResource.id,
              providerKey: input.dependencyResource.providerKey,
            },
          ),
        );
      }
      executed = await this.managedPostgresExecutor.execute({
        context,
        dependencyResource: input.dependencyResource,
        statement: input.statement,
        maxRows: input.maxRows,
        timeoutMs: input.timeoutMs,
      });
    } else {
      const secretRef = input.dependencyResource.connection?.secretRef;
      if (!isOwnedConnectionSecretRef(secretRef)) {
        return err(
          domainError.validation("Dependency safe query requires an Appaloft-owned connection", {
            dependencyResourceId: input.dependencyResource.id,
            providerKey: input.dependencyResource.providerKey,
          }),
        );
      }
      const secret = await this.secretStore.resolve(context, { secretRef });
      if (secret.isErr()) {
        return err(
          domainError.provider(
            "Dependency safe query connection could not be resolved",
            {
              phase: "dependency-resource-safe-query-secret-resolution",
              dependencyResourceId: input.dependencyResource.id,
              providerKey: input.dependencyResource.providerKey,
              cause: secret.error.code,
            },
            secret.error.retryable,
          ),
        );
      }
      executed = await this.postgresExecutor.execute({
        connectionUrl: secret.value.secretValue,
        statement: input.statement,
        maxRows: input.maxRows,
        timeoutMs: input.timeoutMs,
      });
    }

    if (executed.isErr()) {
      return err(executed.error);
    }
    return ok({
      dependencyResourceId: input.dependencyResource.id,
      kind: input.dependencyResource.kind,
      providerKey: input.dependencyResource.providerKey,
      statement: input.statement,
      columns: executed.value.columns,
      rows: executed.value.rows,
      rowCount: executed.value.rows.length,
      truncated: executed.value.truncated,
      executedAt: this.clock.now(),
    });
  }
}
