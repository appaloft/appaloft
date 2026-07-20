import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type ExecutionContextFactory,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

import { createScheduledStorageVolumeBackupRunner } from "../src/scheduled-storage-volume-backup-runner";

describe("scheduled storage volume backup runner", () => {
  test("[STOR-BACKUP-AUTO-IDPOTENT-006] does not overlap ticks within one process", async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = createScheduledStorageVolumeBackupRunner({
      config: { enabled: true, intervalSeconds: 0.01, batchSize: 7 },
      service: {
        async runDue(_context, _dueAt, limit) {
          calls += 1;
          expect(limit).toBe(7);
          await gate;
          return ok({ completed: 0, failed: 0 });
        },
      },
      executionContextFactory: {
        create(input) {
          return createExecutionContext({ ...input, requestId: "req_scheduled_backup" });
        },
      } as ExecutionContextFactory,
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      } as unknown as AppLogger,
    });

    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(calls).toBe(1);
    runner.stop();
    release?.();
    await gate;
  });
});
