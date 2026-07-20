import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ExecutionSandboxService,
} from "@appaloft/application";
import { ok } from "@appaloft/core";
import { createExecutionSandboxMaintenanceRunner } from "../src/execution-sandbox-maintenance-runner";

const logger: AppLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const executionContextFactory: ExecutionContextFactory = {
  create(input) {
    return createExecutionContext(input);
  },
};

describe("execution sandbox maintenance runner", () => {
  test("[SBX-MAINTENANCE-001] starts immediately with a system context and can stop", async () => {
    let observedContext: ExecutionContext | undefined;
    let resolveCalled: (() => void) | undefined;
    const called = new Promise<void>((resolve) => {
      resolveCalled = resolve;
    });
    const service: Pick<ExecutionSandboxService, "maintainAllTenants"> = {
      async maintainAllTenants(context) {
        observedContext = context;
        resolveCalled?.();
        return ok({ tenants: [] });
      },
    };
    const runner = createExecutionSandboxMaintenanceRunner({
      service,
      executionContextFactory,
      logger,
      intervalSeconds: 5,
    });

    runner.start();
    await called;
    runner.stop();

    expect(observedContext?.entrypoint).toBe("system");
    expect(observedContext?.actor).toMatchObject({
      kind: "system",
      id: "execution-sandbox-maintenance-runner",
    });
  });
});
