import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { PruneResourceRuntimeControlAttemptsCommand } from "../src/operations/resources/prune-resource-runtime-control-attempts.command";
import { PruneResourceRuntimeControlAttemptsUseCase } from "../src/operations/resources/prune-resource-runtime-control-attempts.use-case";
import {
  type ResourceRuntimeControlAttemptPruneInput,
  type ResourceRuntimeControlAttemptPruneStoreResult,
  type ResourceRuntimeControlAttemptRetentionStore,
} from "../src/ports";

interface RuntimeControlAttemptRow {
  id: string;
  deploymentId?: string;
  resourceId: string;
  serverId: string;
  status: "accepted" | "running" | "succeeded" | "failed" | "blocked";
  updatedAt: string;
}

class MemoryRuntimeControlAttemptRetentionStore
  implements ResourceRuntimeControlAttemptRetentionStore
{
  readonly inputs: ResourceRuntimeControlAttemptPruneInput[] = [];

  constructor(private readonly rows: RuntimeControlAttemptRow[]) {}

  list(): RuntimeControlAttemptRow[] {
    return [...this.rows];
  }

  async prune(
    _context: RepositoryContext,
    input: ResourceRuntimeControlAttemptPruneInput,
  ): Promise<Result<ResourceRuntimeControlAttemptPruneStoreResult>> {
    this.inputs.push(input);
    const matched = this.rows.filter(
      (row) =>
        row.updatedAt < input.before &&
        ["succeeded", "failed", "blocked"].includes(row.status) &&
        (!input.deploymentId || row.deploymentId === input.deploymentId) &&
        (!input.resourceId || row.resourceId === input.resourceId) &&
        (!input.serverId || row.serverId === input.serverId),
    );

    if (!input.dryRun) {
      for (const row of matched) {
        const index = this.rows.findIndex((candidate) => candidate.id === row.id);
        if (index >= 0) {
          this.rows.splice(index, 1);
        }
      }
    }

    return ok({
      matchedCount: matched.length,
      prunedCount: input.dryRun ? 0 : matched.length,
      affectedResourceCount: new Set(matched.map((row) => row.resourceId)).size,
      affectedDeploymentCount: new Set(
        matched.flatMap((row) => (row.deploymentId ? [row.deploymentId] : [])),
      ).size,
    });
  }
}

function attempt(overrides: Partial<RuntimeControlAttemptRow> = {}): RuntimeControlAttemptRow {
  return {
    id: "rtc_primary",
    deploymentId: "dep_primary",
    resourceId: "res_web",
    serverId: "srv_primary",
    status: "succeeded",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resources.runtime-control-attempts.prune", () => {
  test("[RUNTIME-CTRL-PRUNE-001] dry-runs terminal runtime control attempt prune by default", async () => {
    const store = new MemoryRuntimeControlAttemptRetentionStore([
      attempt({ id: "rtc_old" }),
      attempt({ id: "rtc_running", status: "running" }),
      attempt({ id: "rtc_cutoff_equal", updatedAt: "2026-01-01T00:05:00.000Z" }),
    ]);
    const useCase = new PruneResourceRuntimeControlAttemptsUseCase(
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_runtime_control_attempt_prune_dry_run_test",
      entrypoint: "system",
    });
    const command = PruneResourceRuntimeControlAttemptsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "resources.runtime-control-attempts.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: true,
      matchedCount: 1,
      prunedCount: 0,
      affectedResourceCount: 1,
      affectedDeploymentCount: 1,
      prunedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.inputs).toEqual([
      {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: true,
      },
    ]);
    expect(store.list()).toHaveLength(3);
  });

  test("[RUNTIME-CTRL-PRUNE-002] destructive prune deletes only selected terminal attempts", async () => {
    const store = new MemoryRuntimeControlAttemptRetentionStore([
      attempt({ id: "rtc_match" }),
      attempt({ id: "rtc_other_resource", resourceId: "res_api" }),
      attempt({ id: "rtc_running", status: "running" }),
    ]);
    const useCase = new PruneResourceRuntimeControlAttemptsUseCase(
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_runtime_control_attempt_prune_delete_test",
      entrypoint: "system",
    });
    const command = PruneResourceRuntimeControlAttemptsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      resourceId: "res_web",
      dryRun: false,
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "resources.runtime-control-attempts.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      resourceId: "res_web",
      dryRun: false,
      matchedCount: 1,
      prunedCount: 1,
      affectedResourceCount: 1,
      affectedDeploymentCount: 1,
    });
    expect(store.list().map((row) => row.id)).toEqual(["rtc_other_resource", "rtc_running"]);
  });

  test("command schema normalizes optional filters and rejects malformed cutoffs", () => {
    const valid = PruneResourceRuntimeControlAttemptsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      deploymentId: " dep_primary ",
      resourceId: " res_web ",
      serverId: " srv_primary ",
      dryRun: false,
    });
    const invalid = PruneResourceRuntimeControlAttemptsCommand.create({
      before: "not-a-date",
    });

    expect(valid.isOk()).toBe(true);
    expect(valid._unsafeUnwrap()).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      deploymentId: "dep_primary",
      resourceId: "res_web",
      serverId: "srv_primary",
      dryRun: false,
    });
    expect(invalid.isErr()).toBe(true);
    expect(invalid._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
