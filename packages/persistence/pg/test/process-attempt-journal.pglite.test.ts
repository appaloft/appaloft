import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";

function context() {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_process_attempt_journal_test",
      tracer: {
        startActiveSpan(_name, _options, callback) {
          return Promise.resolve(
            callback({
              addEvent() {},
              recordError() {},
              setAttribute() {},
              setAttributes() {},
              setStatus() {},
            }),
          );
        },
      },
    }),
  );
}

describe("process attempt journal persistence", () => {
  test("[OP-WORK-JOURNAL-002] migrates, records, filters, shows, and sanitizes process attempts", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-journal-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    const recorded = await journal.record(repositoryContext, {
      id: "pxy_journal_1",
      kind: "proxy-bootstrap",
      status: "running",
      operationKey: "servers.bootstrap-proxy",
      dedupeKey: "proxy-bootstrap:srv_journal:pxy_journal_1",
      correlationId: "req_journal",
      requestId: "req_journal",
      phase: "proxy-bootstrap",
      step: "starting",
      serverId: "srv_journal",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nextActions: ["no-action"],
      safeDetails: {
        providerKey: "caddy",
        commandLine: "PRIVATE_KEY=raw-value caddy run",
      },
    });
    expect(recorded.isOk()).toBe(true);

    const updated = await journal.record(repositoryContext, {
      id: "pxy_journal_1",
      kind: "proxy-bootstrap",
      status: "failed",
      operationKey: "servers.bootstrap-proxy",
      phase: "proxy-container",
      step: "failed",
      updatedAt: "2026-01-01T00:00:05.000Z",
      finishedAt: "2026-01-01T00:00:05.000Z",
      errorCode: "edge_proxy_start_failed",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: {
        proxyKind: "caddy",
      },
    });
    expect(updated.isOk()).toBe(true);

    const list = await journal.list(repositoryContext, {
      kind: "proxy-bootstrap",
      status: "failed",
      serverId: "srv_journal",
    });
    const shown = await journal.findOne(repositoryContext, "pxy_journal_1");

    expect(list).toEqual([
      expect.objectContaining({
        id: "pxy_journal_1",
        kind: "proxy-bootstrap",
        status: "failed",
        operationKey: "servers.bootstrap-proxy",
        serverId: "srv_journal",
        errorCode: "edge_proxy_start_failed",
        retriable: true,
        safeDetails: {
          providerKey: "caddy",
          proxyKind: "caddy",
        },
      }),
    ]);
    expect(shown).toMatchObject({
      id: "pxy_journal_1",
      serverId: "srv_journal",
      finishedAt: "2026-01-01T00:00:05.000Z",
    });
    expect(JSON.stringify(list)).not.toContain("PRIVATE_KEY");

    await database.close();
  });

  test("[OP-WORK-JOURNAL-003] [PROC-DELIVERY-003] lists due retry candidates with dedupe and limit ordering", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-retries-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "job_due_old",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "scheduled-tasks.run-now",
      dedupeKey: "job:runner:1",
      updatedAt: "2026-01-01T00:00:01.000Z",
      nextEligibleAt: "2026-01-01T00:00:03.000Z",
      nextActions: ["retry"],
    });
    await journal.record(repositoryContext, {
      id: "job_due_new",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "scheduled-tasks.run-now",
      dedupeKey: "job:runner:2",
      updatedAt: "2026-01-01T00:00:02.000Z",
      nextEligibleAt: "2026-01-01T00:00:02.000Z",
      nextActions: ["retry"],
    });
    await journal.record(repositoryContext, {
      id: "job_future",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "scheduled-tasks.run-now",
      dedupeKey: "job:runner:3",
      updatedAt: "2026-01-01T00:00:03.000Z",
      nextEligibleAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["retry"],
    });
    await journal.record(repositoryContext, {
      id: "job_terminal",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "scheduled-tasks.run-now",
      dedupeKey: "job:runner:4",
      updatedAt: "2026-01-01T00:00:04.000Z",
      nextEligibleAt: "2026-01-01T00:00:04.000Z",
      nextActions: ["retry"],
    });
    await journal.record(repositoryContext, {
      id: "job_terminal_done",
      kind: "runtime-maintenance",
      status: "succeeded",
      operationKey: "scheduled-tasks.run-now",
      dedupeKey: "job:runner:4",
      updatedAt: "2026-01-01T00:00:05.000Z",
      nextActions: ["no-action"],
    });
    await journal.record(repositoryContext, {
      id: "proxy_due",
      kind: "proxy-bootstrap",
      status: "retry-scheduled",
      operationKey: "servers.bootstrap-proxy",
      dedupeKey: "proxy:srv_1",
      updatedAt: "2026-01-01T00:00:06.000Z",
      nextEligibleAt: "2026-01-01T00:00:01.000Z",
      nextActions: ["retry"],
    });

    const allDue = await journal.listDueRetries(repositoryContext, {
      now: "2026-01-01T00:00:10.000Z",
    });
    const runtimeDue = await journal.listDueRetries(repositoryContext, {
      kind: "runtime-maintenance",
      now: "2026-01-01T00:00:10.000Z",
      limit: 1,
    });

    expect(allDue.map((attempt) => attempt.id)).toEqual([
      "proxy_due",
      "job_due_new",
      "job_due_old",
    ]);
    expect(allDue.map((attempt) => attempt.id)).not.toContain("job_terminal");
    expect(runtimeDue.map((attempt) => attempt.id)).toEqual(["job_due_new"]);

    await database.close();
  });

  test("[PROC-DELIVERY-002] atomically claims one due process attempt for worker execution", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-claim-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_claim_due",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      resourceId: "res_web",
      serverId: "srv_primary",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nextEligibleAt: "2026-01-01T00:00:05.000Z",
      nextActions: ["retry"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
      },
    });

    const firstClaim = await journal.claimDue(repositoryContext, {
      attemptId: "wrk_claim_due",
      workerId: "worker_a",
      claimedAt: "2026-01-01T00:00:10.000Z",
      safeDetails: {
        host: "runner-1",
        token: "SECRET_TOKEN",
      },
    });
    const secondClaim = await journal.claimDue(repositoryContext, {
      attemptId: "wrk_claim_due",
      workerId: "worker_b",
      claimedAt: "2026-01-01T00:00:11.000Z",
    });
    const shown = await journal.findOne(repositoryContext, "wrk_claim_due");

    expect(firstClaim.isOk()).toBe(true);
    expect(firstClaim._unsafeUnwrap()).toEqual({
      status: "claimed",
      attempt: {
        id: "wrk_claim_due",
        kind: "runtime-maintenance",
        status: "running",
        operationKey: "runtime-maintenance.sweep",
        dedupeKey: "runtime-maintenance:sweep",
        phase: "worker-claim",
        step: "claimed",
        resourceId: "res_web",
        serverId: "srv_primary",
        updatedAt: "2026-01-01T00:00:10.000Z",
        retriable: false,
        nextActions: ["no-action"],
        safeDetails: {
          cleanupStage: "workspace-sweep",
          claimedAt: "2026-01-01T00:00:10.000Z",
          claimedBy: "worker_a",
          host: "runner-1",
        },
      },
    });
    expect(secondClaim.isOk()).toBe(true);
    expect(secondClaim._unsafeUnwrap()).toMatchObject({
      status: "already-claimed",
      attempt: {
        id: "wrk_claim_due",
        status: "running",
        safeDetails: {
          claimedBy: "worker_a",
        },
      },
    });
    expect(shown).toMatchObject({
      id: "wrk_claim_due",
      status: "running",
      safeDetails: {
        claimedBy: "worker_a",
      },
    });
    expect(JSON.stringify(shown)).not.toContain("SECRET_TOKEN");

    await database.close();
  });

  test("[PROC-DELIVERY-002] refuses future, terminal, and missing process attempt claims", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-claim-refused-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_future",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "runtime-maintenance.sweep",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nextEligibleAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["retry"],
    });
    await journal.record(repositoryContext, {
      id: "wrk_terminal",
      kind: "runtime-maintenance",
      status: "succeeded",
      operationKey: "runtime-maintenance.sweep",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nextActions: ["no-action"],
    });

    const future = await journal.claimDue(repositoryContext, {
      attemptId: "wrk_future",
      workerId: "worker_a",
      claimedAt: "2026-01-01T00:00:10.000Z",
    });
    const terminal = await journal.claimDue(repositoryContext, {
      attemptId: "wrk_terminal",
      workerId: "worker_a",
      claimedAt: "2026-01-01T00:00:10.000Z",
    });
    const missing = await journal.claimDue(repositoryContext, {
      attemptId: "wrk_missing",
      workerId: "worker_a",
      claimedAt: "2026-01-01T00:00:10.000Z",
    });

    expect(future.isOk()).toBe(true);
    expect(future._unsafeUnwrap()).toMatchObject({
      status: "not-due",
      attempt: {
        id: "wrk_future",
        status: "retry-scheduled",
      },
    });
    expect(terminal.isOk()).toBe(true);
    expect(terminal._unsafeUnwrap()).toMatchObject({
      status: "not-claimable",
      attempt: {
        id: "wrk_terminal",
        status: "succeeded",
      },
    });
    expect(missing.isOk()).toBe(true);
    expect(missing._unsafeUnwrap()).toEqual({
      status: "not-found",
      attemptId: "wrk_missing",
    });

    await database.close();
  });

  test("[PROC-DELIVERY-002] lists due process delivery candidates for worker handoff", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-delivery-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_pending_due",
      kind: "runtime-maintenance",
      status: "pending",
      operationKey: "scheduled-tasks.run-now",
      resourceId: "res_web",
      updatedAt: "2026-01-01T00:00:01.000Z",
      nextActions: ["no-action"],
      safeDetails: {
        runId: "str_pending",
      },
    });
    await journal.record(repositoryContext, {
      id: "wrk_retry_due",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "scheduled-tasks.run-now",
      resourceId: "res_web",
      updatedAt: "2026-01-01T00:00:02.000Z",
      nextEligibleAt: "2026-01-01T00:00:03.000Z",
      retriable: true,
      nextActions: ["retry"],
      safeDetails: {
        runId: "str_retry",
      },
    });
    await journal.record(repositoryContext, {
      id: "wrk_future",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "scheduled-tasks.run-now",
      updatedAt: "2026-01-01T00:00:03.000Z",
      nextEligibleAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["retry"],
    });
    await journal.record(repositoryContext, {
      id: "wrk_claimed",
      kind: "runtime-maintenance",
      status: "running",
      operationKey: "scheduled-tasks.run-now",
      updatedAt: "2026-01-01T00:00:04.000Z",
      nextActions: ["no-action"],
    });
    await journal.record(repositoryContext, {
      id: "wrk_proxy",
      kind: "proxy-bootstrap",
      status: "pending",
      operationKey: "servers.bootstrap-proxy",
      updatedAt: "2026-01-01T00:00:05.000Z",
      nextActions: ["no-action"],
    });

    const due = await journal.listDueDeliveryCandidates(repositoryContext, {
      kind: "runtime-maintenance",
      operationKey: "scheduled-tasks.run-now",
      now: "2026-01-01T00:00:10.000Z",
    });
    const limited = await journal.listDueDeliveryCandidates(repositoryContext, {
      kind: "runtime-maintenance",
      operationKey: "scheduled-tasks.run-now",
      now: "2026-01-01T00:00:10.000Z",
      limit: 1,
    });

    expect(due.map((attempt) => attempt.id)).toEqual(["wrk_pending_due", "wrk_retry_due"]);
    expect(limited.map((attempt) => attempt.id)).toEqual(["wrk_pending_due"]);

    await database.close();
  });

  test("[PROC-DELIVERY-004] completes a claimed attempt as retry-scheduled with safe failure visibility", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-complete-retry-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_retry_failure",
      kind: "runtime-maintenance",
      status: "running",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      resourceId: "res_web",
      serverId: "srv_primary",
      phase: "worker-claim",
      step: "claimed",
      updatedAt: "2026-01-01T00:00:10.000Z",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        claimedBy: "worker_a",
      },
    });

    const completed = await journal.complete(repositoryContext, {
      attemptId: "wrk_retry_failure",
      status: "retry-scheduled",
      completedAt: "2026-01-01T00:00:20.000Z",
      phase: "runtime-maintenance",
      step: "workspace-sweep",
      errorCode: "runtime_maintenance_failed",
      errorCategory: "async-processing",
      retriable: true,
      nextEligibleAt: "2026-01-01T00:05:20.000Z",
      nextActions: ["retry", "manual-review"],
      safeDetails: {
        failureKind: "timeout",
        commandLine: "SECRET_TOKEN=raw rm -rf /tmp/appaloft",
      },
    });
    const shown = await journal.findOne(repositoryContext, "wrk_retry_failure");

    expect(completed.isOk()).toBe(true);
    expect(completed._unsafeUnwrap()).toEqual({
      status: "completed",
      attempt: {
        id: "wrk_retry_failure",
        kind: "runtime-maintenance",
        status: "retry-scheduled",
        operationKey: "runtime-maintenance.sweep",
        dedupeKey: "runtime-maintenance:sweep",
        phase: "runtime-maintenance",
        step: "workspace-sweep",
        resourceId: "res_web",
        serverId: "srv_primary",
        updatedAt: "2026-01-01T00:00:20.000Z",
        finishedAt: "2026-01-01T00:00:20.000Z",
        errorCode: "runtime_maintenance_failed",
        errorCategory: "async-processing",
        retriable: true,
        nextEligibleAt: "2026-01-01T00:05:20.000Z",
        nextActions: ["retry", "manual-review"],
        safeDetails: {
          claimedBy: "worker_a",
          failureKind: "timeout",
        },
      },
    });
    expect(shown).toMatchObject({
      status: "retry-scheduled",
      errorCode: "runtime_maintenance_failed",
      nextEligibleAt: "2026-01-01T00:05:20.000Z",
    });
    expect(JSON.stringify(shown)).not.toContain("SECRET_TOKEN");

    await database.close();
  });

  test("[PROC-DELIVERY-005] completes a claimed attempt as terminal failed and refuses non-running completion", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-complete-failed-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_terminal_failure",
      kind: "runtime-maintenance",
      status: "running",
      operationKey: "runtime-maintenance.sweep",
      updatedAt: "2026-01-01T00:00:10.000Z",
      nextActions: ["no-action"],
    });
    await journal.record(repositoryContext, {
      id: "wrk_not_running",
      kind: "runtime-maintenance",
      status: "pending",
      operationKey: "runtime-maintenance.sweep",
      updatedAt: "2026-01-01T00:00:10.000Z",
      nextActions: ["no-action"],
    });

    const terminal = await journal.complete(repositoryContext, {
      attemptId: "wrk_terminal_failure",
      status: "failed",
      completedAt: "2026-01-01T00:00:20.000Z",
      phase: "runtime-maintenance",
      step: "workspace-sweep",
      errorCode: "runtime_maintenance_permission_denied",
      errorCategory: "async-processing",
      retriable: false,
      nextActions: ["manual-review"],
      safeDetails: {
        failureKind: "permission-denied",
      },
    });
    const notRunning = await journal.complete(repositoryContext, {
      attemptId: "wrk_not_running",
      status: "succeeded",
      completedAt: "2026-01-01T00:00:20.000Z",
      nextActions: ["no-action"],
    });
    const missing = await journal.complete(repositoryContext, {
      attemptId: "wrk_missing",
      status: "succeeded",
      completedAt: "2026-01-01T00:00:20.000Z",
      nextActions: ["no-action"],
    });

    expect(terminal.isOk()).toBe(true);
    expect(terminal._unsafeUnwrap()).toMatchObject({
      status: "completed",
      attempt: {
        id: "wrk_terminal_failure",
        status: "failed",
        errorCode: "runtime_maintenance_permission_denied",
        retriable: false,
        nextActions: ["manual-review"],
      },
    });
    expect(notRunning.isOk()).toBe(true);
    expect(notRunning._unsafeUnwrap()).toMatchObject({
      status: "not-running",
      attempt: {
        id: "wrk_not_running",
        status: "pending",
      },
    });
    expect(missing.isOk()).toBe(true);
    expect(missing._unsafeUnwrap()).toEqual({
      status: "not-found",
      attemptId: "wrk_missing",
    });

    await database.close();
  });

  test("[OP-WORK-MARK-RECOVERED-004] marks recovered rows by clearing stale retry and error fields", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-recovered-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_recovered",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep:retry:wrk_retry_next",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
      errorCode: "runtime_maintenance_failed",
      errorCategory: "async-processing",
      retriable: true,
      nextEligibleAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["retry", "manual-review"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
      },
    });

    const recovered = await journal.markRecovered(repositoryContext, {
      id: "wrk_recovered",
      kind: "runtime-maintenance",
      status: "succeeded",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      resourceId: "res_web",
      serverId: "srv_primary",
      phase: "manual-recovery",
      step: "marked-recovered",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      finishedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        recovered: true,
        recoveredAt: "2026-01-01T00:10:00.000Z",
      },
    });
    const shown = await journal.findOne(repositoryContext, "wrk_recovered");
    const due = await journal.listDueRetries(repositoryContext, {
      now: "2026-01-01T00:15:00.000Z",
    });

    expect(recovered.isOk()).toBe(true);
    expect(shown).toEqual({
      id: "wrk_recovered",
      kind: "runtime-maintenance",
      status: "succeeded",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      phase: "manual-recovery",
      step: "marked-recovered",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      finishedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        recovered: true,
        recoveredAt: "2026-01-01T00:10:00.000Z",
      },
    });
    expect(due.map((attempt) => attempt.id)).not.toContain("wrk_recovered");

    await database.close();
  });

  test("[OP-WORK-DEAD-LETTER-004] [PROC-DELIVERY-007] dead-letters rows by clearing stale retry fields", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-dead-letter-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_dead_letter",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
      errorCode: "runtime_maintenance_failed",
      errorCategory: "async-processing",
      retriable: true,
      nextEligibleAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["retry", "manual-review"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
      },
    });

    const deadLettered = await journal.deadLetter(repositoryContext, {
      id: "wrk_dead_letter",
      kind: "runtime-maintenance",
      status: "dead-lettered",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      resourceId: "res_web",
      serverId: "srv_primary",
      phase: "manual-dead-letter",
      step: "dead-lettered",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      finishedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["manual-review"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        deadLettered: true,
        deadLetteredAt: "2026-01-01T00:10:00.000Z",
        deadLetterReason: "external dependency requires vendor support",
      },
    });
    const shown = await journal.findOne(repositoryContext, "wrk_dead_letter");
    const due = await journal.listDueRetries(repositoryContext, {
      now: "2026-01-01T00:15:00.000Z",
    });

    expect(deadLettered.isOk()).toBe(true);
    expect(shown).toEqual({
      id: "wrk_dead_letter",
      kind: "runtime-maintenance",
      status: "dead-lettered",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      phase: "manual-dead-letter",
      step: "dead-lettered",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      finishedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["manual-review"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        deadLettered: true,
        deadLetteredAt: "2026-01-01T00:10:00.000Z",
        deadLetterReason: "external dependency requires vendor support",
      },
    });
    expect(due).toEqual([]);
    expect(due.map((attempt) => attempt.id)).not.toContain("wrk_dead_letter");

    await database.close();
  });

  test("[OP-WORK-CANCEL-004] cancels rows by clearing stale retry fields", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-cancel-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_cancel",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
      errorCode: "runtime_maintenance_failed",
      errorCategory: "async-processing",
      retriable: true,
      nextEligibleAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["retry", "manual-review"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
      },
    });

    const canceled = await journal.cancel(repositoryContext, {
      id: "wrk_cancel",
      kind: "runtime-maintenance",
      status: "canceled",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      resourceId: "res_web",
      serverId: "srv_primary",
      phase: "manual-cancel",
      step: "canceled",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      finishedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        canceled: true,
        canceledAt: "2026-01-01T00:10:00.000Z",
        cancelReason: "operator stopped the retry loop",
      },
    });
    const shown = await journal.findOne(repositoryContext, "wrk_cancel");
    const due = await journal.listDueRetries(repositoryContext, {
      now: "2026-01-01T00:15:00.000Z",
    });

    expect(canceled.isOk()).toBe(true);
    expect(shown).toEqual({
      id: "wrk_cancel",
      kind: "runtime-maintenance",
      status: "canceled",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      phase: "manual-cancel",
      step: "canceled",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      finishedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        canceled: true,
        canceledAt: "2026-01-01T00:10:00.000Z",
        cancelReason: "operator stopped the retry loop",
      },
    });
    expect(due.map((attempt) => attempt.id)).not.toContain("wrk_cancel");

    await database.close();
  });

  test("[OP-WORK-RETRY-004] inserts retry rows without overwriting original attempts", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-retry-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_failed_retry_source",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
      finishedAt: "2026-01-01T00:00:05.000Z",
      errorCode: "runtime_maintenance_failed",
      errorCategory: "async-processing",
      retriable: true,
      nextEligibleAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["retry", "manual-review"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
      },
    });

    const retried = await journal.retry(repositoryContext, {
      id: "wrk_retry_next",
      kind: "runtime-maintenance",
      status: "pending",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep:retry:wrk_retry_next",
      resourceId: "res_web",
      serverId: "srv_primary",
      phase: "manual-retry",
      step: "queued",
      startedAt: "2026-01-01T00:10:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        retryOfWorkId: "wrk_failed_retry_source",
        retryOfDedupeKey: "runtime-maintenance:sweep",
        retriedAt: "2026-01-01T00:10:00.000Z",
      },
    });
    const original = await journal.findOne(repositoryContext, "wrk_failed_retry_source");
    const retry = await journal.findOne(repositoryContext, "wrk_retry_next");
    const due = await journal.listDueRetries(repositoryContext, {
      now: "2026-01-01T00:15:00.000Z",
    });

    expect(retried.isOk()).toBe(true);
    expect(original).toMatchObject({
      id: "wrk_failed_retry_source",
      status: "retry-scheduled",
      retriable: false,
      nextActions: ["no-action"],
    });
    expect(retry).toEqual({
      id: "wrk_retry_next",
      kind: "runtime-maintenance",
      status: "pending",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep:retry:wrk_retry_next",
      phase: "manual-retry",
      step: "queued",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:10:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        retryOfWorkId: "wrk_failed_retry_source",
        retryOfDedupeKey: "runtime-maintenance:sweep",
        retriedAt: "2026-01-01T00:10:00.000Z",
      },
    });
    expect(due.map((attempt) => attempt.id)).not.toContain("wrk_failed_retry_source");

    await database.close();
  });

  test("[PROC-DELIVERY-010] generates a fresh pending delivery generation from due retry work", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-retry-gen-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_retry_source",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "scheduled-tasks.run-now",
      dedupeKey: "scheduled-task-run:str_failed",
      correlationId: "req_retry",
      requestId: "req_retry",
      resourceId: "res_web",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
      finishedAt: "2026-01-01T00:00:05.000Z",
      errorCode: "scheduled_task_run_failed",
      errorCategory: "async-processing",
      retriable: true,
      nextEligibleAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["retry", "manual-review"],
      safeDetails: {
        runId: "str_failed",
        taskId: "tsk_daily",
        resourceId: "res_web",
        commandLine: "SECRET_TOKEN=raw bun run task",
      },
    });

    const generated = await journal.generateDueRetry(repositoryContext, {
      sourceAttemptId: "wrk_retry_source",
      retryAttemptId: "wrk_retry_generated",
      generatedAt: "2026-01-01T00:06:00.000Z",
      phase: "scheduled-task-run-retry",
      step: "queued",
      safeDetails: {
        generatedBy: "scheduled-task-runner",
      },
    });
    const original = await journal.findOne(repositoryContext, "wrk_retry_source");
    const retry = await journal.findOne(repositoryContext, "wrk_retry_generated");
    const dueRetries = await journal.listDueRetries(repositoryContext, {
      kind: "runtime-maintenance",
      now: "2026-01-01T00:07:00.000Z",
    });
    const dueDeliveries = await journal.listDueDeliveryCandidates(repositoryContext, {
      kind: "runtime-maintenance",
      operationKey: "scheduled-tasks.run-now",
      now: "2026-01-01T00:07:00.000Z",
    });

    expect(generated.isOk()).toBe(true);
    expect(generated._unsafeUnwrap()).toMatchObject({
      status: "generated",
      sourceAttempt: {
        id: "wrk_retry_source",
        status: "retry-scheduled",
        retriable: false,
        nextActions: ["no-action"],
      },
      retryAttempt: {
        id: "wrk_retry_generated",
        status: "pending",
        operationKey: "scheduled-tasks.run-now",
        dedupeKey: "scheduled-task-run:str_failed:retry:wrk_retry_generated",
      },
    });
    expect(original).toMatchObject({
      id: "wrk_retry_source",
      status: "retry-scheduled",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        retryAttemptId: "wrk_retry_generated",
        retryGeneratedAt: "2026-01-01T00:06:00.000Z",
      },
    });
    expect(retry).toEqual({
      id: "wrk_retry_generated",
      kind: "runtime-maintenance",
      status: "pending",
      operationKey: "scheduled-tasks.run-now",
      dedupeKey: "scheduled-task-run:str_failed:retry:wrk_retry_generated",
      correlationId: "req_retry",
      requestId: "req_retry",
      phase: "scheduled-task-run-retry",
      step: "queued",
      resourceId: "res_web",
      startedAt: "2026-01-01T00:06:00.000Z",
      updatedAt: "2026-01-01T00:06:00.000Z",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        runId: "str_failed",
        taskId: "tsk_daily",
        resourceId: "res_web",
        generatedBy: "scheduled-task-runner",
        retryOfWorkId: "wrk_retry_source",
        generatedAt: "2026-01-01T00:06:00.000Z",
        retryOfDedupeKey: "scheduled-task-run:str_failed",
      },
    });
    expect(dueRetries.map((attempt) => attempt.id)).not.toContain("wrk_retry_source");
    expect(dueDeliveries.map((attempt) => attempt.id)).toEqual(["wrk_retry_generated"]);
    expect(JSON.stringify(retry)).not.toContain("SECRET_TOKEN");

    await database.close();
  });

  test("[PROC-DELIVERY-010] skips stale retry generations when dedupe authority advances", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-retry-gen-stale-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_retry_stale",
      kind: "runtime-maintenance",
      status: "retry-scheduled",
      operationKey: "scheduled-tasks.run-now",
      dedupeKey: "scheduled-task-run:str_stale",
      updatedAt: "2026-01-01T00:00:00.000Z",
      retriable: true,
      nextEligibleAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["retry"],
    });
    await journal.record(repositoryContext, {
      id: "wrk_retry_latest",
      kind: "runtime-maintenance",
      status: "succeeded",
      operationKey: "scheduled-tasks.run-now",
      dedupeKey: "scheduled-task-run:str_stale",
      updatedAt: "2026-01-01T00:06:00.000Z",
      nextActions: ["no-action"],
    });

    const generated = await journal.generateDueRetry(repositoryContext, {
      sourceAttemptId: "wrk_retry_stale",
      retryAttemptId: "wrk_retry_should_not_exist",
      generatedAt: "2026-01-01T00:07:00.000Z",
      phase: "scheduled-task-run-retry",
      step: "queued",
    });
    const retry = await journal.findOne(repositoryContext, "wrk_retry_should_not_exist");

    expect(generated.isOk()).toBe(true);
    expect(generated._unsafeUnwrap()).toEqual({
      status: "not-found",
      sourceAttemptId: "wrk_retry_stale",
    });
    expect(retry).toBeNull();

    await database.close();
  });

  test("[OP-WORK-PRUNE-004] prunes old terminal rows only after destructive confirmation", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-prune-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    await journal.record(repositoryContext, {
      id: "wrk_old_failed",
      kind: "runtime-maintenance",
      status: "failed",
      operationKey: "runtime-maintenance.sweep",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nextActions: ["manual-review"],
    });
    await journal.record(repositoryContext, {
      id: "wrk_old_canceled",
      kind: "runtime-maintenance",
      status: "canceled",
      operationKey: "runtime-maintenance.sweep",
      updatedAt: "2026-01-01T00:00:01.000Z",
      nextActions: ["no-action"],
    });
    await journal.record(repositoryContext, {
      id: "wrk_old_running",
      kind: "runtime-maintenance",
      status: "running",
      operationKey: "runtime-maintenance.sweep",
      updatedAt: "2026-01-01T00:00:02.000Z",
      nextActions: ["no-action"],
    });
    await journal.record(repositoryContext, {
      id: "wrk_cutoff_equal",
      kind: "runtime-maintenance",
      status: "failed",
      operationKey: "runtime-maintenance.sweep",
      updatedAt: "2026-01-01T00:05:00.000Z",
      nextActions: ["manual-review"],
    });

    const dryRun = await journal.prune(repositoryContext, {
      before: "2026-01-01T00:05:00.000Z",
      statuses: ["failed", "canceled", "dead-lettered", "succeeded"],
      dryRun: true,
    });
    const afterDryRun = await journal.list(repositoryContext, { limit: 10 });
    const destructive = await journal.prune(repositoryContext, {
      before: "2026-01-01T00:05:00.000Z",
      statuses: ["failed", "canceled", "dead-lettered", "succeeded"],
      dryRun: false,
    });
    const afterDelete = await journal.list(repositoryContext, { limit: 10 });

    expect(dryRun.isOk()).toBe(true);
    expect(dryRun._unsafeUnwrap()).toEqual({
      matchedCount: 2,
      prunedCount: 0,
      countsByStatus: {
        failed: 1,
        canceled: 1,
      },
    });
    expect(afterDryRun.map((attempt) => attempt.id).sort()).toEqual([
      "wrk_cutoff_equal",
      "wrk_old_canceled",
      "wrk_old_failed",
      "wrk_old_running",
    ]);
    expect(destructive.isOk()).toBe(true);
    expect(destructive._unsafeUnwrap()).toEqual({
      matchedCount: 2,
      prunedCount: 2,
      countsByStatus: {
        failed: 1,
        canceled: 1,
      },
    });
    expect(afterDelete.map((attempt) => attempt.id).sort()).toEqual([
      "wrk_cutoff_equal",
      "wrk_old_running",
    ]);

    await database.close();
  });
});
