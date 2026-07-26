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
    let observedInput: Parameters<ExecutionSandboxService["maintainAllTenants"]>[1] | undefined;
    let resolveCalled: (() => void) | undefined;
    const called = new Promise<void>((resolve) => {
      resolveCalled = resolve;
    });
    const service: Pick<ExecutionSandboxService, "maintainAllTenants"> = {
      async maintainAllTenants(context, input) {
        observedContext = context;
        observedInput = input;
        resolveCalled?.();
        return ok({ tenants: [] });
      },
    };
    const runner = createExecutionSandboxMaintenanceRunner({
      service,
      executionContextFactory,
      logger,
      intervalSeconds: 5,
      terminalSessionGateway: {
        list: () => [
          {
            sessionId: "term_active",
            scope: "sandbox",
            sandboxId: "sbx_active",
            transport: { kind: "websocket", path: "/terminal" },
            providerKey: "docker",
            createdAt: "2026-07-20T00:00:00.000Z",
            status: "active",
          },
        ],
      },
    });

    runner.start();
    await called;
    runner.stop();

    expect(observedContext?.entrypoint).toBe("system");
    expect(observedContext?.actor).toMatchObject({
      kind: "system",
      id: "execution-sandbox-maintenance-runner",
    });
    expect(observedInput).toEqual({ protectedSandboxIds: ["sbx_active"] });
  });

  test("[SNAP-POL-002][SNAP-POL-004] reports reusable Snapshot capture and prune counts", async () => {
    const infoCalls: Array<{ event: string; fields?: Record<string, unknown> }> = [];
    let resolveCompleted: (() => void) | undefined;
    const completed = new Promise<void>((resolve) => {
      resolveCompleted = resolve;
    });
    const observedLogger: AppLogger = {
      debug() {},
      info(event, fields) {
        infoCalls.push({ event, ...(fields ? { fields } : {}) });
        if (event === "execution_sandbox_maintenance.tick_completed") {
          resolveCompleted?.();
        }
      },
      warn() {},
      error() {},
    };
    const service: Pick<ExecutionSandboxService, "maintainAllTenants"> = {
      async maintainAllTenants() {
        return ok({
          tenants: [
            {
              tenantId: "tenant_a",
              expired: 0,
              suspended: 0,
              migrated: 0,
              reconciled: 0,
              snapshotsCaptured: 2,
              snapshotsPruned: 1,
              removedOrphans: 0,
              failed: 0,
            },
          ],
        });
      },
    };
    const runner = createExecutionSandboxMaintenanceRunner({
      service,
      executionContextFactory,
      logger: observedLogger,
    });

    runner.start();
    await completed;
    runner.stop();

    expect(
      infoCalls.find((call) => call.event === "execution_sandbox_maintenance.tick_completed")
        ?.fields,
    ).toMatchObject({
      tenantCount: 1,
      snapshotCapturedCount: 2,
      snapshotPrunedCount: 1,
      failedCount: 0,
    });
  });
});
