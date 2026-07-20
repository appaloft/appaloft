import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DependencyResourceSourceModeValue,
  type DomainError,
  EnvironmentId,
  ok,
  ProjectId,
  ProviderKey,
  ResourceInstance,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  type Result,
  UpsertResourceInstanceSpec,
} from "@appaloft/core";
import {
  FixedClock,
  MemoryDependencyResourceReadModel,
  MemoryDependencyResourceRepository,
} from "@appaloft/testkit";
import {
  createExecutionContext,
  type DependencyResourceSafeQueryInput,
  type DependencyResourceSafeQueryPort,
  type DependencyResourceSafeQueryResult,
  type ExecutionContext,
  InspectDependencyResourceQuery,
  InspectDependencyResourceQueryService,
  QueryDependencyResourceQuery,
  QueryDependencyResourceQueryService,
  toRepositoryContext,
} from "../src";

class CapturingSafeQueryPort implements DependencyResourceSafeQueryPort {
  inputs: DependencyResourceSafeQueryInput[] = [];

  supports(): boolean {
    return true;
  }

  async execute(
    _context: ExecutionContext,
    input: DependencyResourceSafeQueryInput,
  ): Promise<Result<Omit<DependencyResourceSafeQueryResult, "schemaVersion">, DomainError>> {
    this.inputs.push(input);
    return ok({
      dependencyResourceId: input.dependencyResource.id,
      kind: input.dependencyResource.kind,
      providerKey: input.dependencyResource.providerKey,
      statement: input.statement,
      columns: [{ name: "answer", type: "int4" }],
      rows: [{ answer: 42 }],
      rowCount: 1,
      truncated: false,
      executedAt: "2026-01-01T00:00:00.000Z",
    });
  }
}

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_dependency_resource_safe_query_test",
    entrypoint: "system",
  });
}

async function createHarness(kind: "postgres" | "redis" = "postgres") {
  const context = createContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const repository = new MemoryDependencyResourceRepository();
  const readModel = new MemoryDependencyResourceReadModel(repository);
  const resourceInput = {
    id: ResourceInstanceId.rehydrate("rsi_dep"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceInstanceName.rehydrate("Dependency"),
    kind: ResourceInstanceKindValue.rehydrate(kind),
    sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
    providerKey: ProviderKey.rehydrate(`external-${kind}`),
    endpoint:
      kind === "postgres"
        ? {
            host: "db.example.com",
            port: 5432,
            databaseName: "app",
            maskedConnection: "postgres://app:********@db.example.com:5432/app",
          }
        : {
            host: "redis.example.com",
            port: 6379,
            maskedConnection: "redis://:********@redis.example.com:6379/0",
          },
    providerManaged: false,
    createdAt: CreatedAt.rehydrate(clock.now()),
  };
  const resource =
    kind === "postgres"
      ? ResourceInstance.createPostgresDependencyResource(resourceInput)._unsafeUnwrap()
      : ResourceInstance.createRedisDependencyResource(resourceInput)._unsafeUnwrap();

  await repository.upsert(
    repositoryContext,
    resource,
    UpsertResourceInstanceSpec.fromResourceInstance(resource),
  );

  return { clock, context, readModel };
}

describe("dependency resource inspect and safe query", () => {
  test("[DEP-SAFE-QRY-001] inspects masked dependency readback and safe query readiness", async () => {
    const { clock, context, readModel } = await createHarness();
    const service = new InspectDependencyResourceQueryService(
      readModel,
      clock,
      new CapturingSafeQueryPort(),
    );
    const query = InspectDependencyResourceQuery.create({ dependencyResourceId: "rsi_dep" });

    expect(query.isOk()).toBe(true);
    const result = await service.execute(context, query._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().connection?.maskedConnection).toContain("********");
    expect(result._unsafeUnwrap().safeQuery.status).toBe("supported");
    expect(result._unsafeUnwrap().safeQuery.allowedFamilies).toContain("select");
  });

  test("[DEP-SAFE-QRY-001] reports not-configured when no safe query provider is composed", async () => {
    const { clock, context, readModel } = await createHarness();
    const service = new InspectDependencyResourceQueryService(readModel, clock);
    const query = InspectDependencyResourceQuery.create({ dependencyResourceId: "rsi_dep" });

    const result = await service.execute(context, query._unsafeUnwrap());

    expect(result._unsafeUnwrap().safeQuery.status).toBe("not-configured");
  });

  test("[DEP-SAFE-QRY-002] runs allowlisted Postgres SELECT through the safe query port", async () => {
    const { clock, context, readModel } = await createHarness();
    const port = new CapturingSafeQueryPort();
    const service = new QueryDependencyResourceQueryService(readModel, clock, port);
    const query = QueryDependencyResourceQuery.create({
      dependencyResourceId: "rsi_dep",
      statement: "select 42 as answer",
    });

    const result = await service.execute(context, query._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(port.inputs[0]?.maxRows).toBe(100);
    expect(result._unsafeUnwrap().rows[0]?.answer).toBe(42);
  });

  test("[DEP-SAFE-QRY-003] rejects mutating statements before provider execution", async () => {
    const { clock, context, readModel } = await createHarness();
    const port = new CapturingSafeQueryPort();
    const service = new QueryDependencyResourceQueryService(readModel, clock, port);
    const query = QueryDependencyResourceQuery.create({
      dependencyResourceId: "rsi_dep",
      statement: "drop table users",
    });

    const result = await service.execute(context, query._unsafeUnwrap());

    expect(result.isErr()).toBe(true);
    expect(port.inputs).toHaveLength(0);
  });

  test("[DEP-SAFE-QRY-003] rejects stacked statements and SQL comments before execution", async () => {
    const { clock, context, readModel } = await createHarness();
    const port = new CapturingSafeQueryPort();
    const service = new QueryDependencyResourceQueryService(readModel, clock, port);
    const stacked = QueryDependencyResourceQuery.create({
      dependencyResourceId: "rsi_dep",
      statement: "select 1; select 2",
    })._unsafeUnwrap();
    const commented = QueryDependencyResourceQuery.create({
      dependencyResourceId: "rsi_dep",
      statement: "select 1 -- hidden follow-up",
    })._unsafeUnwrap();

    expect((await service.execute(context, stacked)).isErr()).toBe(true);
    expect((await service.execute(context, commented)).isErr()).toBe(true);
    expect(port.inputs).toHaveLength(0);
  });

  test("[DEP-SAFE-QRY-004] accepts only allowlisted Redis read commands", async () => {
    const { clock, context, readModel } = await createHarness("redis");
    const port = new CapturingSafeQueryPort();
    const service = new QueryDependencyResourceQueryService(readModel, clock, port);
    const allowed = QueryDependencyResourceQuery.create({
      dependencyResourceId: "rsi_dep",
      statement: "TTL session:1",
    })._unsafeUnwrap();
    const denied = QueryDependencyResourceQuery.create({
      dependencyResourceId: "rsi_dep",
      statement: "FLUSHALL",
    })._unsafeUnwrap();

    expect((await service.execute(context, allowed)).isOk()).toBe(true);
    expect((await service.execute(context, denied)).isErr()).toBe(true);
  });
});
