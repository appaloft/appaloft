import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ScheduledHistoryRetentionRunResult,
  type ScheduledHistoryRetentionService,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { createScheduledHistoryRetentionRunner } from "../src/scheduled-history-retention-runner";

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
      requestId: "req_scheduled_history_retention_runner",
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

class CapturingScheduledHistoryRetentionService
  implements Pick<ScheduledHistoryRetentionService, "run">
{
  readonly calls: Array<{
    context: ExecutionContext;
    input?: Parameters<ScheduledHistoryRetentionService["run"]>[1];
  }> = [];

  constructor(
    private readonly result: Result<ScheduledHistoryRetentionRunResult> = ok(runResult()),
  ) {}

  async run(
    context: ExecutionContext,
    input?: Parameters<ScheduledHistoryRetentionService["run"]>[1],
  ): ReturnType<ScheduledHistoryRetentionService["run"]> {
    this.calls.push({ context, ...(input ? { input } : {}) });
    return this.result;
  }
}

function runResult(): ScheduledHistoryRetentionRunResult {
  return {
    schemaVersion: "scheduled-history-retention.run/v1",
    scheduledAt: "2026-02-01T00:00:00.000Z",
    inspectedPolicyCount: 2,
    dispatchedCount: 1,
    skippedCount: 1,
    dispatches: [
      {
        category: "audit-rows",
        policyId: "rdf_audit",
        processAttemptId: "wrk_history_retention",
        operationKey: "audit-events.prune",
        before: "2026-01-02T00:00:00.000Z",
        dryRun: true,
        status: "dispatched",
      },
      {
        category: "provider-job-logs",
        policyId: "rdf_provider_logs",
        status: "skipped-dry-run-disabled",
      },
    ],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ScheduledHistoryRetentionRunner", () => {
  test("[SCHED-HISTORY-RETENTION-006] does not start when disabled", async () => {
    const service = new CapturingScheduledHistoryRetentionService();
    const runner = createScheduledHistoryRetentionRunner({
      config: {
        enabled: false,
        intervalSeconds: 60,
      },
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(service.calls).toHaveLength(0);
  });

  test("[SCHED-HISTORY-RETENTION-001] [SCHED-HISTORY-RETENTION-006] dispatches through the scheduled history retention service", async () => {
    const service = new CapturingScheduledHistoryRetentionService();
    const logger = new CapturingLogger();
    const runner = createScheduledHistoryRetentionRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
      },
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
          id: "scheduled-history-retention-runner",
        },
      },
    });
    expect(logger.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "info",
          message: "scheduled_history_retention_runner.tick_completed",
          details: {
            inspectedPolicyCount: 2,
            dispatchedCount: 1,
            skippedCount: 1,
          },
        }),
      ]),
    );
  });

  test("[SCHED-HISTORY-RETENTION-004] logs failed scheduled retention service results", async () => {
    const service = new CapturingScheduledHistoryRetentionService(
      err(
        domainError.infra("scheduled history retention failed", {
          phase: "scheduled-history-retention",
        }),
      ),
    );
    const logger = new CapturingLogger();
    const runner = createScheduledHistoryRetentionRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
      },
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
          message: "scheduled_history_retention_runner.run_failed",
          details: expect.objectContaining({
            errorCode: "infra_error",
          }),
        }),
      ]),
    );
  });
});
