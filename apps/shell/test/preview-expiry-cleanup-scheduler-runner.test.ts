import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type MutationCoordinator,
  type MutationCoordinatorRunExclusiveInput,
  type PreviewExpiryCleanupScheduler,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";

import { createPreviewExpiryCleanupSchedulerRunner } from "../src/preview-expiry-cleanup-scheduler-runner";

class CapturingLogger implements AppLogger {
  debug(_message: string): void {}

  info(_message: string): void {}

  warn(_message: string): void {}

  error(_message: string): void {}
}

class FixedExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      entrypoint: input.entrypoint,
      requestId: "req_preview_expiry_cleanup_runner",
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

class CapturingPreviewExpiryCleanupScheduler implements Pick<PreviewExpiryCleanupScheduler, "run"> {
  readonly calls: Array<{
    context: ExecutionContext;
    options: Parameters<PreviewExpiryCleanupScheduler["run"]>[1];
  }> = [];

  async run(
    context: ExecutionContext,
    options: Parameters<PreviewExpiryCleanupScheduler["run"]>[1],
  ): ReturnType<PreviewExpiryCleanupScheduler["run"]> {
    this.calls.push({ context, options });
    return ok({
      scanned: 1,
      dispatched: [
        {
          previewEnvironmentId: "prenv_1",
          resourceId: "res_api",
          expiresAt: "2026-05-06T06:00:00.000Z",
          attemptId: "pcln_1",
          status: "cleaned",
        },
      ],
      failed: [],
    });
  }
}

class CapturingMutationCoordinator implements Pick<MutationCoordinator, "runExclusive"> {
  readonly calls: MutationCoordinatorRunExclusiveInput<unknown>[] = [];

  async runExclusive<T>(input: MutationCoordinatorRunExclusiveInput<T>): Promise<Result<T>> {
    this.calls.push(input as MutationCoordinatorRunExclusiveInput<unknown>);
    return input.work();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("PreviewExpiryCleanupSchedulerRunner", () => {
  test("[PG-PREVIEW-POLICY-003] does not start when disabled", async () => {
    const scheduler = new CapturingPreviewExpiryCleanupScheduler();
    const runner = createPreviewExpiryCleanupSchedulerRunner({
      config: {
        enabled: false,
        intervalSeconds: 1,
        batchSize: 5,
      },
      scheduler,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);

    expect(scheduler.calls).toHaveLength(0);
    runner.stop();
  });

  test("[PG-PREVIEW-POLICY-003] starts from shell runner with system actor context", async () => {
    const scheduler = new CapturingPreviewExpiryCleanupScheduler();
    const runner = createPreviewExpiryCleanupSchedulerRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 7,
      },
      scheduler,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(scheduler.calls).toHaveLength(1);
    expect(scheduler.calls[0]?.context).toMatchObject({
      entrypoint: "system",
      actor: {
        kind: "system",
        id: "preview-expiry-cleanup-scheduler",
      },
    });
    expect(scheduler.calls[0]?.options).toEqual({ limit: 7 });
  });

  test("[PG-PREVIEW-POLICY-003] wraps scheduler ticks in a durable preview-lifecycle lease", async () => {
    const scheduler = new CapturingPreviewExpiryCleanupScheduler();
    const mutationCoordinator = new CapturingMutationCoordinator();
    const runner = createPreviewExpiryCleanupSchedulerRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 11,
      },
      scheduler,
      mutationCoordinator,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(scheduler.calls).toHaveLength(1);
    expect(scheduler.calls[0]?.options).toEqual({ limit: 11 });
    expect(mutationCoordinator.calls).toHaveLength(1);
    expect(mutationCoordinator.calls[0]).toMatchObject({
      policy: {
        operationKey: "preview-expiry-cleanup-scheduler",
        scopeKind: "preview-lifecycle",
        mode: "serialize-with-bounded-wait",
      },
      scope: {
        kind: "preview-lifecycle",
        key: "preview-expiry-cleanup-scheduler",
      },
      owner: {
        ownerId: "req_preview_expiry_cleanup_runner",
        label: "Preview expiry cleanup scheduler",
      },
    });
  });
});
