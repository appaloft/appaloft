import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { PruneProviderJobLogsCommand } from "../src/operations/provider-job-logs/prune-provider-job-logs.command";
import { PruneProviderJobLogsUseCase } from "../src/operations/provider-job-logs/prune-provider-job-logs.use-case";
import {
  type ProviderJobLogPruneInput,
  type ProviderJobLogPruneStoreResult,
  type ProviderJobLogRetentionStore,
} from "../src/ports";

interface ProviderJobLogRow {
  id: string;
  deploymentId: string;
  providerKey: string;
  resourceId: string;
  serverId: string;
  createdAt: string;
}

class MemoryProviderJobLogRetentionStore implements ProviderJobLogRetentionStore {
  readonly inputs: ProviderJobLogPruneInput[] = [];

  constructor(private readonly rows: ProviderJobLogRow[]) {}

  list(): ProviderJobLogRow[] {
    return [...this.rows];
  }

  async prune(
    _context: RepositoryContext,
    input: ProviderJobLogPruneInput,
  ): Promise<Result<ProviderJobLogPruneStoreResult>> {
    this.inputs.push(input);
    const matched = this.rows.filter(
      (row) =>
        row.createdAt < input.before &&
        (!input.deploymentId || row.deploymentId === input.deploymentId) &&
        (!input.providerKey || row.providerKey === input.providerKey) &&
        (!input.resourceId || row.resourceId === input.resourceId) &&
        (!input.serverId || row.serverId === input.serverId),
    );
    const countsByProviderKey: Record<string, number> = {};
    for (const row of matched) {
      countsByProviderKey[row.providerKey] = (countsByProviderKey[row.providerKey] ?? 0) + 1;
    }

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
      countsByProviderKey,
    });
  }
}

function providerJobLog(overrides: Partial<ProviderJobLogRow> = {}): ProviderJobLogRow {
  return {
    id: "pjl_primary",
    deploymentId: "dep_primary",
    providerKey: "generic-ssh",
    resourceId: "res_web",
    serverId: "srv_primary",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("provider-job-logs.prune", () => {
  test("[PROV-JOB-LOG-PRUNE-001] dry-runs provider job log prune by default", async () => {
    const store = new MemoryProviderJobLogRetentionStore([
      providerJobLog({ id: "pjl_old" }),
      providerJobLog({ id: "pjl_other_provider", providerKey: "local-shell" }),
      providerJobLog({ id: "pjl_cutoff_equal", createdAt: "2026-01-01T00:05:00.000Z" }),
    ]);
    const useCase = new PruneProviderJobLogsUseCase(
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_provider_job_log_prune_dry_run_test",
      entrypoint: "system",
    });
    const command = PruneProviderJobLogsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "provider-job-logs.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: true,
      matchedCount: 2,
      prunedCount: 0,
      countsByProviderKey: {
        "generic-ssh": 1,
        "local-shell": 1,
      },
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

  test("[PROV-JOB-LOG-PRUNE-002] destructive prune deletes only selected old provider job logs", async () => {
    const store = new MemoryProviderJobLogRetentionStore([
      providerJobLog({ id: "pjl_match" }),
      providerJobLog({ id: "pjl_other_provider", providerKey: "local-shell" }),
      providerJobLog({ id: "pjl_other_resource", resourceId: "res_api" }),
    ]);
    const useCase = new PruneProviderJobLogsUseCase(
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_provider_job_log_prune_delete_test",
      entrypoint: "system",
    });
    const command = PruneProviderJobLogsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      providerKey: "generic-ssh",
      resourceId: "res_web",
      dryRun: false,
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "provider-job-logs.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      providerKey: "generic-ssh",
      resourceId: "res_web",
      dryRun: false,
      matchedCount: 1,
      prunedCount: 1,
      countsByProviderKey: {
        "generic-ssh": 1,
      },
    });
    expect(store.list().map((row) => row.id)).toEqual(["pjl_other_provider", "pjl_other_resource"]);
  });

  test("command schema normalizes optional filters and rejects malformed cutoffs", () => {
    const valid = PruneProviderJobLogsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      deploymentId: " dep_primary ",
      providerKey: " generic-ssh ",
      resourceId: " res_web ",
      serverId: " srv_primary ",
      dryRun: false,
    });
    const invalid = PruneProviderJobLogsCommand.create({
      before: "not-a-date",
    });

    expect(valid.isOk()).toBe(true);
    expect(valid._unsafeUnwrap()).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      deploymentId: "dep_primary",
      providerKey: "generic-ssh",
      resourceId: "res_web",
      serverId: "srv_primary",
      dryRun: false,
    });
    expect(invalid.isErr()).toBe(true);
    expect(invalid._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
