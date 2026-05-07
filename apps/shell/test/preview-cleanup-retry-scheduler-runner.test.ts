import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type MutationCoordinator,
  type MutationCoordinatorRunExclusiveInput,
  type PreviewCleanupRetryScheduler,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";

import { createPreviewCleanupRetrySchedulerRunner } from "../src/preview-cleanup-retry-scheduler-runner";

class CapturingLogger implements AppLogger {
  readonly messages: string[] = [];

  debug(message: string): void {
    this.messages.push(message);
  }

  info(message: string): void {
    this.messages.push(message);
  }

  warn(message: string): void {
    this.messages.push(message);
  }

  error(message: string): void {
    this.messages.push(message);
  }
}

class FixedExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      entrypoint: input.entrypoint,
      requestId: "req_preview_cleanup_retry_runner",
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

class CapturingPreviewCleanupRetryScheduler implements Pick<PreviewCleanupRetryScheduler, "run"> {
  readonly calls: Array<{
    context: ExecutionContext;
    options: Parameters<PreviewCleanupRetryScheduler["run"]>[1];
  }> = [];

  async run(
    context: ExecutionContext,
    options: Parameters<PreviewCleanupRetryScheduler["run"]>[1],
  ): ReturnType<PreviewCleanupRetryScheduler["run"]> {
    this.calls.push({ context, options });
    return ok({
      scanned: 1,
      dispatched: [
        {
          previewEnvironmentId: "prenv_1",
          resourceId: "res_api",
          previousAttemptId: "pcln_1",
          nextAttemptId: "pcln_2",
          status: "cleaned",
        },
      ],
      failed: [],
    });
  }
}

class BlockingPreviewCleanupRetryScheduler implements Pick<PreviewCleanupRetryScheduler, "run"> {
  readonly calls: Array<{
    context: ExecutionContext;
    options: Parameters<PreviewCleanupRetryScheduler["run"]>[1];
  }> = [];

  private releaseRun: (() => void) | undefined;

  async run(
    context: ExecutionContext,
    options: Parameters<PreviewCleanupRetryScheduler["run"]>[1],
  ): ReturnType<PreviewCleanupRetryScheduler["run"]> {
    this.calls.push({ context, options });
    await new Promise<void>((resolve) => {
      this.releaseRun = resolve;
    });

    return ok({
      scanned: 0,
      dispatched: [],
      failed: [],
    });
  }

  release(): void {
    this.releaseRun?.();
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

describe("PreviewCleanupRetrySchedulerRunner", () => {
  test("[PG-PREVIEW-CLEANUP-002] does not start when disabled", async () => {
    const scheduler = new CapturingPreviewCleanupRetryScheduler();
    const runner = createPreviewCleanupRetrySchedulerRunner({
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

  test("[PG-PREVIEW-CLEANUP-002] starts from shell runner with system actor context", async () => {
    const scheduler = new CapturingPreviewCleanupRetryScheduler();
    const runner = createPreviewCleanupRetrySchedulerRunner({
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
        id: "preview-cleanup-retry-scheduler",
      },
    });
    expect(scheduler.calls[0]?.options).toEqual({ limit: 7 });
  });

  test("[PG-PREVIEW-CLEANUP-002] wraps scheduler ticks in a durable preview-lifecycle lease", async () => {
    const scheduler = new CapturingPreviewCleanupRetryScheduler();
    const mutationCoordinator = new CapturingMutationCoordinator();
    const runner = createPreviewCleanupRetrySchedulerRunner({
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
        operationKey: "preview-cleanup-retry-scheduler",
        scopeKind: "preview-lifecycle",
        mode: "serialize-with-bounded-wait",
      },
      scope: {
        kind: "preview-lifecycle",
        key: "preview-cleanup-retry-scheduler",
      },
      owner: {
        ownerId: "req_preview_cleanup_retry_runner",
        label: "Preview cleanup retry scheduler",
      },
    });
  });

  test("[PG-PREVIEW-CLEANUP-002] skips overlapping ticks while one scheduler run is active", async () => {
    const scheduler = new BlockingPreviewCleanupRetryScheduler();
    const runner = createPreviewCleanupRetrySchedulerRunner({
      config: {
        enabled: true,
        intervalSeconds: 0.001,
        batchSize: 3,
      },
      scheduler,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(10);

    expect(scheduler.calls).toHaveLength(1);

    scheduler.release();
    await sleep(5);
    runner.stop();
  });
});
