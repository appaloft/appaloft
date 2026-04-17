import { context, type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  type TransactionSettings,
} from "kysely";

interface DatabaseTraceDescriptor {
  driver: "postgres" | "pglite";
  location?: string;
}

const tracer = trace.getTracer("appaloft.persistence.pg");

function readOperationName(sql: string): string {
  const operation = sql.trim().split(/\s+/, 1)[0]?.toUpperCase();

  return operation && /^[A-Z]+$/.test(operation) ? operation : "SQL";
}

function setError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    return;
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: String(error),
  });
}

function createAttributes(
  compiledQuery: CompiledQuery,
  descriptor: DatabaseTraceDescriptor,
): Record<string, string | number> {
  const operation = readOperationName(compiledQuery.sql);

  return {
    "db.system.name": "postgresql",
    "db.operation.name": operation,
    "db.collection.name": descriptor.driver,
    ...(descriptor.location ? { "server.address": descriptor.location } : {}),
  };
}

class TracingDatabaseConnection implements DatabaseConnection {
  constructor(
    readonly inner: DatabaseConnection,
    private readonly descriptor: DatabaseTraceDescriptor,
  ) {}

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const operation = readOperationName(compiledQuery.sql);

    return tracer.startActiveSpan(
      `db.postgresql.${operation.toLowerCase()}`,
      {
        kind: SpanKind.CLIENT,
        attributes: createAttributes(compiledQuery, this.descriptor),
      },
      async (span) => {
        try {
          const result = await this.inner.executeQuery<R>(compiledQuery);
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute("db.response.returned_rows", result.rows.length);
          return result;
        } catch (error) {
          setError(span, error);
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  async *streamQuery<R>(
    compiledQuery: CompiledQuery,
    chunkSize?: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    const operation = readOperationName(compiledQuery.sql);
    const span = tracer.startSpan(`db.postgresql.${operation.toLowerCase()}`, {
      kind: SpanKind.CLIENT,
      attributes: createAttributes(compiledQuery, this.descriptor),
    });
    const activeContext = trace.setSpan(context.active(), span);

    try {
      const stream = context.with(activeContext, () =>
        this.inner.streamQuery<R>(compiledQuery, chunkSize),
      );

      for await (const result of stream) {
        span.setAttribute("db.response.returned_rows", result.rows.length);
        yield result;
      }

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      setError(span, error);
      throw error;
    } finally {
      span.end();
    }
  }
}

function unwrapConnection(connection: DatabaseConnection): DatabaseConnection {
  return connection instanceof TracingDatabaseConnection ? connection.inner : connection;
}

class TracingDriver implements Driver {
  constructor(
    private readonly inner: Driver,
    private readonly descriptor: DatabaseTraceDescriptor,
  ) {}

  async init(): Promise<void> {
    await this.inner.init();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new TracingDatabaseConnection(await this.inner.acquireConnection(), this.descriptor);
  }

  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    await this.inner.beginTransaction(unwrapConnection(connection), settings);
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await this.inner.commitTransaction(unwrapConnection(connection));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await this.inner.rollbackTransaction(unwrapConnection(connection));
  }

  async savepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    await this.inner.savepoint?.(unwrapConnection(connection), savepointName, compileQuery);
  }

  async rollbackToSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    await this.inner.rollbackToSavepoint?.(
      unwrapConnection(connection),
      savepointName,
      compileQuery,
    );
  }

  async releaseSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    await this.inner.releaseSavepoint?.(unwrapConnection(connection), savepointName, compileQuery);
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    await this.inner.releaseConnection(unwrapConnection(connection));
  }

  async destroy(): Promise<void> {
    await this.inner.destroy();
  }
}

export class TracingDialect implements Dialect {
  constructor(
    private readonly inner: Dialect,
    private readonly descriptor: DatabaseTraceDescriptor,
  ) {}

  createDriver(): Driver {
    return new TracingDriver(this.inner.createDriver(), this.descriptor);
  }

  createQueryCompiler(): QueryCompiler {
    return this.inner.createQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return this.inner.createAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return this.inner.createIntrospector(db);
  }
}
