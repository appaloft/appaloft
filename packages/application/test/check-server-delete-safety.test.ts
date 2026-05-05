import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type DeploymentTargetByIdSpec,
  type DeploymentTargetByProviderAndHostSpec,
  type DeploymentTargetSelectionSpecVisitor,
  ok,
  type Result,
  type ServerSelectionSpec,
} from "@appaloft/core";
import {
  CheckServerDeleteSafetyQuery,
  CheckServerDeleteSafetyQueryService,
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
  type ServerDeletionBlocker,
  type ServerDeletionBlockerReader,
  type ServerReadModel,
  type ServerSummary,
} from "../src";

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:10.000Z";
  }
}

class ServerIdSelectionVisitor implements DeploymentTargetSelectionSpecVisitor<string | null> {
  visitDeploymentTargetById(_query: string | null, spec: DeploymentTargetByIdSpec): string | null {
    return spec.id.value;
  }

  visitDeploymentTargetByProviderAndHost(
    query: string | null,
    _spec: DeploymentTargetByProviderAndHostSpec,
  ): string | null {
    return query;
  }
}

class StaticServerReadModel implements ServerReadModel {
  constructor(private readonly servers: ServerSummary[]) {}

  async list(): Promise<ServerSummary[]> {
    return this.servers;
  }

  async findOne(_context: RepositoryContext, spec: ServerSelectionSpec) {
    const serverId = spec.accept(null, new ServerIdSelectionVisitor());
    return this.servers.find((server) => server.id === serverId) ?? null;
  }
}

class StaticBlockerReader implements ServerDeletionBlockerReader {
  public calls = 0;

  constructor(private readonly blockers: ServerDeletionBlocker[]) {}

  async findBlockers(
    _context: RepositoryContext,
    _input: { serverId: string },
  ): Promise<Result<ServerDeletionBlocker[]>> {
    this.calls += 1;
    return ok(this.blockers);
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_server_delete_check_test",
    entrypoint: "system",
  });
}

function serverSummary(overrides?: Partial<ServerSummary>): ServerSummary {
  return {
    id: "srv_primary",
    name: "Primary",
    host: "203.0.113.10",
    port: 22,
    providerKey: "generic-ssh",
    targetKind: "single-server",
    lifecycleStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createQuery(serverId = "srv_primary") {
  const query = CheckServerDeleteSafetyQuery.create({
    serverId,
  });
  expect(query.isOk()).toBe(true);

  if (query.isErr()) {
    throw new Error("Expected CheckServerDeleteSafetyQuery creation to succeed");
  }

  return query.value;
}

describe("CheckServerDeleteSafetyQueryService", () => {
  test("[SRV-LIFE-DELETE-CHECK-001] active servers return an active-server blocker", async () => {
    const blockerReader = new StaticBlockerReader([]);
    const service = new CheckServerDeleteSafetyQueryService(
      new StaticServerReadModel([serverSummary()]),
      blockerReader,
      new FixedClock(),
    );

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "servers.delete-check/v1",
      serverId: "srv_primary",
      lifecycleStatus: "active",
      eligible: false,
      blockers: [
        {
          kind: "active-server",
          relatedEntityId: "srv_primary",
          relatedEntityType: "server",
          count: 1,
        },
      ],
      checkedAt: "2026-01-01T00:00:10.000Z",
    });
    expect(blockerReader.calls).toBe(1);
  });

  test("[SRV-LIFE-DELETE-CHECK-002] inactive servers report retained dependency blockers", async () => {
    const service = new CheckServerDeleteSafetyQueryService(
      new StaticServerReadModel([
        serverSummary({
          lifecycleStatus: "inactive",
          deactivatedAt: "2026-01-01T00:00:05.000Z",
        }),
      ]),
      new StaticBlockerReader([
        {
          kind: "deployment-history",
          relatedEntityId: "dep_last",
          relatedEntityType: "deployment",
          count: 3,
        },
        {
          kind: "domain-binding",
          relatedEntityId: "dom_primary",
          relatedEntityType: "domain-binding",
          count: 1,
        },
      ]),
      new FixedClock(),
    );

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      lifecycleStatus: "inactive",
      eligible: false,
      blockers: [
        {
          kind: "deployment-history",
          count: 3,
        },
        {
          kind: "domain-binding",
          relatedEntityId: "dom_primary",
        },
      ],
    });
  });

  test("[SRV-LIFE-DELETE-CHECK-003] inactive servers with no dependencies are eligible", async () => {
    const service = new CheckServerDeleteSafetyQueryService(
      new StaticServerReadModel([
        serverSummary({
          lifecycleStatus: "inactive",
          deactivatedAt: "2026-01-01T00:00:05.000Z",
        }),
      ]),
      new StaticBlockerReader([]),
      new FixedClock(),
    );

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      lifecycleStatus: "inactive",
      eligible: true,
      blockers: [],
    });
  });

  test("[SRV-LIFE-DELETE-CHECK-004] missing servers return not_found", async () => {
    const blockerReader = new StaticBlockerReader([]);
    const service = new CheckServerDeleteSafetyQueryService(
      new StaticServerReadModel([]),
      blockerReader,
      new FixedClock(),
    );

    const result = await service.execute(createTestContext(), createQuery("srv_missing"));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        queryName: "servers.delete-check",
        phase: "server-read",
        serverId: "srv_missing",
      },
    });
    expect(blockerReader.calls).toBe(0);
  });
});
