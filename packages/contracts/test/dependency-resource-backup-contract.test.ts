import { describe, expect, test } from "bun:test";

import {
  dependencyResourceBackupSummarySchema,
  listDependencyResourceBackupsResponseSchema,
  showDependencyResourceBackupResponseSchema,
} from "../src/index";

describe("dependency resource backup contract", () => {
  test("[DEP-RES-BACKUP-002] [DEP-RES-BACKUP-007] accepts safe backup and restore summaries", () => {
    const backup = dependencyResourceBackupSummarySchema.parse({
      id: "drb_1",
      dependencyResourceId: "rsi_pg",
      projectId: "prj_demo",
      environmentId: "env_demo",
      dependencyKind: "postgres",
      providerKey: "appaloft-managed-postgres",
      status: "ready",
      attemptId: "dba_1",
      requestedAt: "2026-01-01T00:00:00.000Z",
      retentionStatus: "retained",
      providerArtifactHandle: "backup/rsi_pg/drb_1",
      completedAt: "2026-01-01T00:00:01.000Z",
      latestRestoreAttempt: {
        attemptId: "dra_1",
        status: "completed",
        requestedAt: "2026-01-01T00:01:00.000Z",
        completedAt: "2026-01-01T00:02:00.000Z",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const list = listDependencyResourceBackupsResponseSchema.parse({
      schemaVersion: "dependency-resources.backups.list/v1",
      items: [backup],
      generatedAt: "2026-01-01T00:03:00.000Z",
    });
    const shown = showDependencyResourceBackupResponseSchema.parse({
      schemaVersion: "dependency-resources.backups.show/v1",
      backup,
      generatedAt: "2026-01-01T00:03:00.000Z",
    });

    expect(list.items[0]?.retentionStatus).toBe("retained");
    expect(shown.backup.latestRestoreAttempt?.status).toBe("completed");
    expect(JSON.stringify(shown)).not.toContain("password");
  });
});
