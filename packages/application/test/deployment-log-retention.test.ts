import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { PruneDeploymentLogsCommand } from "../src/operations/deployments/prune-deployment-logs.command";
import { PruneDeploymentLogsUseCase } from "../src/operations/deployments/prune-deployment-logs.use-case";
import {
  type DeploymentLogPruneInput,
  type DeploymentLogPruneStoreResult,
  type DeploymentLogRetentionStore,
} from "../src/ports";

interface DeploymentLogRow {
  deploymentId: string;
  resourceId: string;
  serverId: string;
  timestamp: string;
}

class MemoryDeploymentLogRetentionStore implements DeploymentLogRetentionStore {
  readonly inputs: DeploymentLogPruneInput[] = [];

  constructor(private readonly rows: DeploymentLogRow[]) {}

  list(): DeploymentLogRow[] {
    return [...this.rows];
  }

  async prune(
    _context: RepositoryContext,
    input: DeploymentLogPruneInput,
  ): Promise<Result<DeploymentLogPruneStoreResult>> {
    this.inputs.push(input);
    const matched = this.rows.filter(
      (row) =>
        row.timestamp < input.before &&
        (!input.deploymentId || row.deploymentId === input.deploymentId) &&
        (!input.resourceId || row.resourceId === input.resourceId) &&
        (!input.serverId || row.serverId === input.serverId),
    );
    const affectedDeploymentIds = new Set(matched.map((row) => row.deploymentId));

    if (!input.dryRun) {
      for (const row of matched) {
        const index = this.rows.findIndex(
          (candidate) =>
            candidate.deploymentId === row.deploymentId &&
            candidate.resourceId === row.resourceId &&
            candidate.serverId === row.serverId &&
            candidate.timestamp === row.timestamp,
        );
        if (index >= 0) {
          this.rows.splice(index, 1);
        }
      }
    }

    return ok({
      matchedCount: matched.length,
      prunedCount: input.dryRun ? 0 : matched.length,
      affectedDeploymentCount: affectedDeploymentIds.size,
    });
  }
}

function deploymentLog(overrides: Partial<DeploymentLogRow> = {}): DeploymentLogRow {
  return {
    deploymentId: "dep_primary",
    resourceId: "res_web",
    serverId: "srv_primary",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deployments.logs.prune", () => {
  test("[DEP-LOG-PRUNE-001] dry-runs deployment log prune by default", async () => {
    const store = new MemoryDeploymentLogRetentionStore([
      deploymentLog({ timestamp: "2026-01-01T00:00:00.000Z" }),
      deploymentLog({ timestamp: "2026-01-01T00:01:00.000Z" }),
      deploymentLog({ timestamp: "2026-01-01T00:05:00.000Z" }),
    ]);
    const useCase = new PruneDeploymentLogsUseCase(
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_deployment_log_prune_dry_run_test",
      entrypoint: "system",
    });
    const command = PruneDeploymentLogsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "deployments.logs.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: true,
      matchedCount: 2,
      prunedCount: 0,
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

  test("[DEP-LOG-PRUNE-002] destructive prune removes only selected old deployment logs", async () => {
    const store = new MemoryDeploymentLogRetentionStore([
      deploymentLog({ deploymentId: "dep_match", timestamp: "2026-01-01T00:00:00.000Z" }),
      deploymentLog({ deploymentId: "dep_match", timestamp: "2026-01-01T00:06:00.000Z" }),
      deploymentLog({ deploymentId: "dep_other_resource", resourceId: "res_api" }),
    ]);
    const useCase = new PruneDeploymentLogsUseCase(
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_deployment_log_prune_delete_test",
      entrypoint: "system",
    });
    const command = PruneDeploymentLogsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      resourceId: "res_web",
      dryRun: false,
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "deployments.logs.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      resourceId: "res_web",
      dryRun: false,
      matchedCount: 1,
      prunedCount: 1,
      affectedDeploymentCount: 1,
    });
    expect(store.list()).toEqual([
      deploymentLog({ deploymentId: "dep_match", timestamp: "2026-01-01T00:06:00.000Z" }),
      deploymentLog({ deploymentId: "dep_other_resource", resourceId: "res_api" }),
    ]);
  });

  test("command schema normalizes optional filters and rejects malformed cutoffs", () => {
    const valid = PruneDeploymentLogsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      deploymentId: " dep_primary ",
      resourceId: " res_web ",
      serverId: " srv_primary ",
      dryRun: false,
    });
    const invalid = PruneDeploymentLogsCommand.create({
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
