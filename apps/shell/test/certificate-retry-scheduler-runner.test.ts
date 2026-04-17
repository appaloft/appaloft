import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type CertificateRetryScheduler,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

import { createCertificateRetrySchedulerRunner } from "../src/certificate-retry-scheduler-runner";

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
      requestId: "req_scheduler",
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

class CapturingScheduler implements Pick<CertificateRetryScheduler, "run"> {
  readonly calls: Array<{
    context: ExecutionContext;
    options: Parameters<CertificateRetryScheduler["run"]>[1];
  }> = [];

  async run(
    context: ExecutionContext,
    options: Parameters<CertificateRetryScheduler["run"]>[1],
  ): ReturnType<CertificateRetryScheduler["run"]> {
    this.calls.push({ context, options });
    return ok({
      scanned: 0,
      dispatched: [],
      failed: [],
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("CertificateRetrySchedulerRunner", () => {
  test("[ROUTE-TLS-SCHED-005] does not start when disabled", async () => {
    const scheduler = new CapturingScheduler();
    const runner = createCertificateRetrySchedulerRunner({
      config: {
        enabled: false,
        intervalSeconds: 1,
        defaultRetryDelaySeconds: 30,
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

  test("[ROUTE-TLS-SCHED-005] starts only through the long-running server runner", async () => {
    const scheduler = new CapturingScheduler();
    const runner = createCertificateRetrySchedulerRunner({
      config: {
        enabled: true,
        intervalSeconds: 60,
        defaultRetryDelaySeconds: 45,
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
        id: "certificate-retry-scheduler",
      },
    });
    expect(scheduler.calls[0]?.options).toEqual({
      defaultRetryDelaySeconds: 45,
      limit: 7,
    });
  });
});
