import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type RepositoryContext,
  type ScheduledRuntimePrunePolicy,
  type ScheduledRuntimePrunePolicyListFilter,
  type ScheduledRuntimePrunePolicyReadModel,
  type ScheduledRuntimePruneRunResult,
  type ScheduledRuntimePruneService,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { createScheduledRuntimePruneRunner } from "../src/scheduled-runtime-prune-runner";

class CapturingLogger implements AppLogger {
  readonly messages: Array<{ level: string; message: string; details?: Record<string, unknown> }> =
    [];

  debug(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "debug", message, ...(details ? { details } : {}) });
  }

  info(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "info", message, ...(details ? { details } : {}) });
  }

  warn(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "warn", message, ...(details ? { details } : {}) });
  }

  error(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "error", message, ...(details ? { details } : {}) });
  }
}

class FixedExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      entrypoint: input.entrypoint,
      requestId: "req_scheduled_runtime_prune_runner",
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

class CapturingScheduledRuntimePruneService implements Pick<ScheduledRuntimePruneService, "run"> {
  readonly calls: Array<{
    context: ExecutionContext;
    input: Parameters<ScheduledRuntimePruneService["run"]>[1];
  }> = [];

  constructor(private readonly result: Result<ScheduledRuntimePruneRunResult> = ok(runResult())) {}

  async run(
    context: ExecutionContext,
    input: Parameters<ScheduledRuntimePruneService["run"]>[1],
  ): ReturnType<ScheduledRuntimePruneService["run"]> {
    this.calls.push({ context, input });
    return this.result;
  }
}

class CapturingScheduledRuntimePrunePolicyReadModel
  implements Pick<ScheduledRuntimePrunePolicyReadModel, "list">
{
  readonly calls: Array<{
    context: RepositoryContext;
    filter?: ScheduledRuntimePrunePolicyListFilter;
  }> = [];

  constructor(private readonly result: Result<ScheduledRuntimePrunePolicy[]>) {}

  async list(
    context: RepositoryContext,
    filter?: ScheduledRuntimePrunePolicyListFilter,
  ): Promise<Result<ScheduledRuntimePrunePolicy[]>> {
    this.calls.push({ context, ...(filter ? { filter } : {}) });
    return this.result;
  }
}

function runResult(): ScheduledRuntimePruneRunResult {
  return {
    schemaVersion: "scheduled-runtime-prune.run/v1",
    processAttemptId: "wrk_runtime_prune",
    serverId: "srv_primary",
    policyId: "rpp_system",
    policyScope: "system",
    before: "2026-01-01T00:00:00.000Z",
    dryRun: true,
    prune: {
      schemaVersion: "servers.capacity.prune/v1",
      server: {
        id: "srv_primary",
        name: "Primary",
        host: "203.0.113.10",
        port: 22,
        providerKey: "generic-ssh",
        targetKind: "single-server",
      },
      before: "2026-01-01T00:00:00.000Z",
      categories: ["stopped-containers"],
      dryRun: true,
      prunedAt: "2026-01-31T00:00:00.000Z",
      summary: {
        inspectedCount: 1,
        matchedCount: 1,
        prunedCount: 0,
        skippedCount: 0,
        excludedCount: 0,
        reclaimedBytes: 0,
      },
      candidates: [],
      warnings: [],
    },
  };
}

function policy(overrides: Partial<ScheduledRuntimePrunePolicy> = {}): ScheduledRuntimePrunePolicy {
  return {
    id: "rpp_system",
    version: "v1",
    scope: "system",
    serverId: "srv_primary",
    retentionDays: 30,
    categories: ["stopped-containers"],
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ScheduledRuntimePruneRunner", () => {
  test("[RT-CAP-SCHED-007] does not start when disabled", async () => {
    const service = new CapturingScheduledRuntimePruneService();
    const runner = createScheduledRuntimePruneRunner({
      config: {
        enabled: false,
        intervalSeconds: 60,
        batchSize: 5,
      },
      policies: [policy()],
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(service.calls).toHaveLength(0);
  });

  test("[RT-CAP-SCHED-004] [RT-CAP-SCHED-007] [PROC-DELIVERY-001] [PROC-DELIVERY-002] dispatches configured policies through the application service", async () => {
    const service = new CapturingScheduledRuntimePruneService();
    const logger = new CapturingLogger();
    const runner = createScheduledRuntimePruneRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 1,
      },
      policies: [policy(), policy({ id: "rpp_project", scope: "project" })],
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger,
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(service.calls).toHaveLength(1);
    expect(service.calls[0]).toMatchObject({
      context: {
        entrypoint: "system",
        actor: {
          kind: "system",
          id: "scheduled-runtime-prune-runner",
        },
      },
      input: {
        policy: {
          id: "rpp_system",
          scope: "system",
          serverId: "srv_primary",
        },
      },
    });
    expect(logger.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "info",
          message: "scheduled_runtime_prune_runner.tick_completed",
          details: {
            scanned: 1,
            completed: 1,
            failed: 0,
          },
        }),
      ]),
    );
  });

  test("[RT-CAP-SCHED-001] [RT-CAP-SCHED-007] discovers persisted policies through the read model", async () => {
    const service = new CapturingScheduledRuntimePruneService();
    const policyReadModel = new CapturingScheduledRuntimePrunePolicyReadModel(
      ok([policy(), policy({ id: "rpp_project", scope: "project" })]),
    );
    const logger = new CapturingLogger();
    const runner = createScheduledRuntimePruneRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 1,
      },
      policyReadModel,
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger,
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(policyReadModel.calls).toHaveLength(1);
    expect(policyReadModel.calls[0]).toMatchObject({
      context: {
        requestId: "req_scheduled_runtime_prune_runner",
      },
      filter: {
        enabledOnly: true,
      },
    });
    expect(service.calls).toHaveLength(1);
    expect(service.calls[0]?.input.policy.id).toBe("rpp_system");
  });

  test("[RT-CAP-SCHED-005] logs policy discovery failures without runtime access", async () => {
    const service = new CapturingScheduledRuntimePruneService();
    const policyReadModel = new CapturingScheduledRuntimePrunePolicyReadModel(
      err(
        domainError.infra("scheduled runtime prune policies unavailable", {
          phase: "scheduled-runtime-prune-policy-read",
        }),
      ),
    );
    const logger = new CapturingLogger();
    const runner = createScheduledRuntimePruneRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 5,
      },
      policyReadModel,
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger,
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(service.calls).toHaveLength(0);
    expect(logger.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "scheduled_runtime_prune_runner.policy_discovery_failed",
          details: expect.objectContaining({
            errorCode: "infra_error",
          }),
        }),
      ]),
    );
  });

  test("[RT-CAP-SCHED-005] logs failed scheduled prune service results without direct runtime access", async () => {
    const service = new CapturingScheduledRuntimePruneService(
      err(
        domainError.infra("scheduled runtime prune failed", {
          phase: "scheduled-runtime-prune",
        }),
      ),
    );
    const logger = new CapturingLogger();
    const runner = createScheduledRuntimePruneRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 5,
      },
      policies: [policy()],
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger,
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(service.calls).toHaveLength(1);
    expect(logger.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "scheduled_runtime_prune_runner.run_failed",
          details: expect.objectContaining({
            policyId: "rpp_system",
            policyScope: "system",
            serverId: "srv_primary",
            errorCode: "infra_error",
          }),
        }),
      ]),
    );
  });
});
