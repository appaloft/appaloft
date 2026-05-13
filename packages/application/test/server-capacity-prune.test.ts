import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetLifecycleStatusValue,
  DeploymentTargetName,
  err,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Result,
  TargetKindValue,
} from "@appaloft/core";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { PruneServerCapacityCommand } from "../src/operations/servers/prune-server-capacity.command";
import { PruneServerCapacityUseCase } from "../src/operations/servers/prune-server-capacity.use-case";
import {
  type AuditEventRecorder,
  type AuditEventRecordInput,
  type Clock,
  type IdGenerator,
  type RuntimeTargetCapacityPruneResult,
  type RuntimeTargetCapacityPruner,
  type ServerRepository,
} from "../src/ports";

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

function deploymentTarget(overrides: { id?: string; providerKey?: string } = {}): DeploymentTarget {
  return DeploymentTarget.rehydrate({
    id: unwrap(DeploymentTargetId.create(overrides.id ?? "srv_primary")),
    name: DeploymentTargetName.rehydrate("Primary"),
    providerKey: ProviderKey.rehydrate(overrides.providerKey ?? "generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

class MemoryServerRepository implements ServerRepository {
  constructor(private server: DeploymentTarget | null) {}

  async findOne(): Promise<DeploymentTarget | null> {
    return this.server;
  }

  async upsert(_context: RepositoryContext, server: DeploymentTarget): Promise<void> {
    this.server = server;
  }
}

class FakeCapacityPruner implements RuntimeTargetCapacityPruner {
  readonly inputs: Parameters<RuntimeTargetCapacityPruner["prune"]>[1][] = [];

  constructor(private readonly prunedCountOverride?: number) {}

  async prune(
    _context: Parameters<RuntimeTargetCapacityPruner["prune"]>[0],
    input: Parameters<RuntimeTargetCapacityPruner["prune"]>[1],
  ): Promise<Result<RuntimeTargetCapacityPruneResult>> {
    this.inputs.push(input);
    const matchedCount = input.categories.length;
    const prunedCount = input.dryRun ? 0 : (this.prunedCountOverride ?? matchedCount);
    return ok({
      schemaVersion: "servers.capacity.prune/v1",
      server: {
        id: input.server.id.value,
        name: input.server.name.value,
        host: input.server.host.value,
        port: input.server.port.value,
        providerKey: input.server.providerKey.value,
        targetKind: input.server.targetKind.value,
      },
      before: input.before,
      categories: input.categories,
      dryRun: input.dryRun,
      prunedAt: "2026-01-01T00:10:00.000Z",
      summary: {
        inspectedCount: matchedCount,
        matchedCount,
        prunedCount,
        skippedCount: 0,
        excludedCount: 0,
        reclaimedBytes: prunedCount > 0 ? 1024 : 0,
      },
      candidates: input.categories.map((category, index) => ({
        id: `candidate_${index}`,
        category,
        target: `/var/lib/appaloft/runtime/ssh-deployments/dep_${index}`,
        updatedAt: "2026-01-01T00:00:00.000Z",
        size: 512,
        action: input.dryRun ? "matched" : "pruned",
      })),
      warnings: [],
    });
  }
}

class FixedClock implements Clock {
  constructor(private readonly value: string) {}

  now(): string {
    return this.value;
  }
}

class SequenceIdGenerator implements IdGenerator {
  private count = 0;

  next(prefix: string): string {
    this.count += 1;
    return `${prefix}_${this.count}`;
  }
}

class MemoryAuditEventRecorder implements AuditEventRecorder {
  readonly records: AuditEventRecordInput[] = [];

  async record(_context: RepositoryContext, input: AuditEventRecordInput): Promise<Result<void>> {
    this.records.push(input);
    return ok(undefined);
  }
}

class FailingAuditEventRecorder implements AuditEventRecorder {
  async record(): Promise<Result<void>> {
    return err({
      code: "infra_error",
      message: "audit unavailable",
      category: "infra",
      retryable: true,
      details: {
        phase: "runtime-target-capacity-prune-audit",
      },
    });
  }
}

function createUseCase(input: {
  server?: DeploymentTarget | null;
  pruner?: RuntimeTargetCapacityPruner;
  auditRecorder?: AuditEventRecorder;
  clock?: Clock;
  idGenerator?: IdGenerator;
}): PruneServerCapacityUseCase {
  return new PruneServerCapacityUseCase(
    new MemoryServerRepository(input.server === undefined ? deploymentTarget() : input.server),
    input.pruner ?? new FakeCapacityPruner(),
    input.auditRecorder ?? new MemoryAuditEventRecorder(),
    input.idGenerator ?? new SequenceIdGenerator(),
    input.clock ?? new FixedClock("2026-01-01T00:11:00.000Z"),
  );
}

describe("servers.capacity.prune", () => {
  test("[RT-CAP-PRUNE-001] dry-runs runtime target prune by default", async () => {
    const pruner = new FakeCapacityPruner();
    const auditRecorder = new MemoryAuditEventRecorder();
    const useCase = createUseCase({ pruner, auditRecorder });
    const context = createExecutionContext({
      requestId: "req_server_capacity_prune_dry_run_test",
      entrypoint: "system",
    });
    const command = unwrap(
      PruneServerCapacityCommand.create({
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "servers.capacity.prune/v1",
      dryRun: true,
      categories: ["stopped-containers", "preview-workspaces", "source-workspaces"],
      summary: {
        prunedCount: 0,
      },
    });
    expect(pruner.inputs).toHaveLength(1);
    expect(pruner.inputs[0]).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      dryRun: true,
      categories: ["stopped-containers", "preview-workspaces", "source-workspaces"],
    });
    expect(auditRecorder.records).toHaveLength(0);
  });

  test("[RT-CAP-PRUNE-002][RT-CAP-PRUNE-006] destructive prune passes selected categories and records safe audit output", async () => {
    const pruner = new FakeCapacityPruner();
    const auditRecorder = new MemoryAuditEventRecorder();
    const useCase = createUseCase({ pruner, auditRecorder });
    const context = createExecutionContext({
      requestId: "req_server_capacity_prune_delete_test",
      entrypoint: "system",
    });
    const command = unwrap(
      PruneServerCapacityCommand.create({
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        categories: ["stopped-containers"],
        dryRun: false,
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      dryRun: false,
      categories: ["stopped-containers"],
      summary: {
        matchedCount: 1,
        prunedCount: 1,
      },
    });
    expect(pruner.inputs[0]).toMatchObject({
      dryRun: false,
      categories: ["stopped-containers"],
    });
    expect(auditRecorder.records).toEqual([
      {
        id: "aud_1",
        aggregateId: "srv_primary",
        eventType: "server-capacity-pruned",
        payload: {
          operationKey: "servers.capacity.prune",
          serverId: "srv_primary",
          before: "2026-01-01T00:05:00.000Z",
          categories: ["stopped-containers"],
          inspectedCount: 1,
          matchedCount: 1,
          prunedCount: 1,
          skippedCount: 0,
          excludedCount: 0,
          reclaimedBytes: 1024,
          prunedAt: "2026-01-01T00:10:00.000Z",
        },
        createdAt: "2026-01-01T00:11:00.000Z",
      },
    ]);
  });

  test("[RT-CAP-PRUNE-007] Docker cache and image prune categories require explicit opt-in", async () => {
    const pruner = new FakeCapacityPruner();
    const useCase = createUseCase({ pruner });
    const context = createExecutionContext({
      requestId: "req_server_capacity_prune_docker_categories_test",
      entrypoint: "system",
    });
    const defaultCommand = unwrap(
      PruneServerCapacityCommand.create({
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
      }),
    );
    const explicitCommand = unwrap(
      PruneServerCapacityCommand.create({
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        categories: ["docker-build-cache", "unused-images"],
      }),
    );

    await useCase.execute(context, defaultCommand.input);
    await useCase.execute(context, explicitCommand.input);

    expect(pruner.inputs[0]?.categories).toEqual([
      "stopped-containers",
      "preview-workspaces",
      "source-workspaces",
    ]);
    expect(pruner.inputs[1]?.categories).toEqual(["docker-build-cache", "unused-images"]);
  });

  test("[RT-CAP-PRUNE-006] destructive no-op prune does not record audit output", async () => {
    const pruner = new FakeCapacityPruner(0);
    const auditRecorder = new MemoryAuditEventRecorder();
    const useCase = createUseCase({ pruner, auditRecorder });
    const context = createExecutionContext({
      requestId: "req_server_capacity_prune_noop_audit_test",
      entrypoint: "system",
    });
    const command = unwrap(
      PruneServerCapacityCommand.create({
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        categories: ["stopped-containers"],
        dryRun: false,
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      summary: {
        prunedCount: 0,
      },
    });
    expect(auditRecorder.records).toHaveLength(0);
  });

  test("[RT-CAP-PRUNE-006] audit recorder failure is returned as sanitized warning", async () => {
    const useCase = createUseCase({
      pruner: new FakeCapacityPruner(),
      auditRecorder: new FailingAuditEventRecorder(),
    });
    const context = createExecutionContext({
      requestId: "req_server_capacity_prune_audit_warning_test",
      entrypoint: "system",
    });
    const command = unwrap(
      PruneServerCapacityCommand.create({
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        categories: ["stopped-containers"],
        dryRun: false,
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      summary: {
        prunedCount: 1,
      },
      warnings: [
        {
          code: "audit-record-failed",
          message: "Runtime prune succeeded, but audit output could not be recorded.",
          resource: "appaloft-runtime",
        },
      ],
    });
  });

  test("missing server rejects before runtime target mutation", async () => {
    const pruner = new FakeCapacityPruner();
    const useCase = createUseCase({ server: null, pruner });
    const context = createExecutionContext({
      requestId: "req_server_capacity_prune_missing_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      serverId: "srv_missing",
      before: "2026-01-01T00:05:00.000Z",
      categories: ["stopped-containers"],
      dryRun: true,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        commandName: "servers.capacity.prune",
        phase: "server-read",
        serverId: "srv_missing",
      },
    });
    expect(pruner.inputs).toHaveLength(0);
  });

  test("command schema normalizes dry-run input and rejects invalid categories", () => {
    const valid = PruneServerCapacityCommand.create({
      serverId: "srv_primary",
      before: "2026-01-01T00:05:00.000Z",
      categories: ["preview-workspaces"],
      dryRun: false,
    });
    const invalid = PruneServerCapacityCommand.create({
      serverId: "srv_primary",
      before: "2026-01-01T00:05:00.000Z",
      categories: ["volumes" as "stopped-containers"],
    });

    expect(valid.isOk()).toBe(true);
    expect(valid._unsafeUnwrap()).toMatchObject({
      input: {
        categories: ["preview-workspaces"],
        dryRun: false,
      },
    });
    expect(invalid.isErr()).toBe(true);
    expect(invalid._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
