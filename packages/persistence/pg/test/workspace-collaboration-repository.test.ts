import "reflect-metadata";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  ExpiresAt,
  SandboxId,
  UpdatedAt,
  WorkspaceCollaboration,
  WorkspaceCollaborationId,
  WorkspaceCollaborationLaneId,
  WorkspaceCollaborationName,
  WorkspaceCollaborationParticipantId,
  WorkspaceWriterLeaseId,
} from "@appaloft/core";
import { createDatabase, createMigrator, PgWorkspaceCollaborationRepository } from "../src";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function context(tenantId: string) {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      tenant: { tenantId },
      requestId: `req_${tenantId}`,
    }),
  );
}

function aggregate() {
  return WorkspaceCollaboration.create({
    id: WorkspaceCollaborationId.rehydrate("wco_pg"),
    name: WorkspaceCollaborationName.rehydrate("Issue 123"),
    creator: {
      id: WorkspaceCollaborationParticipantId.rehydrate("wcp_owner"),
      subject: { kind: "user", subjectId: "usr_owner" },
      role: "owner",
    },
    firstLane: {
      id: WorkspaceCollaborationLaneId.rehydrate("wcl_builder"),
      workspaceId: SandboxId.rehydrate("sbx_builder"),
      purpose: "builder",
      label: "implementation",
    },
    createdAt: CreatedAt.rehydrate("2026-07-24T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("PgWorkspaceCollaborationRepository", () => {
  test("[COLLAB-LEASE-004] round-trips tenant state and compare-and-swap fences concurrent writers", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-collaboration-pg-"));
    directories.push(directory);
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: directory });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const repository = new PgWorkspaceCollaborationRepository(database.db);
      const tenantA = context("tenant_a");
      const tenantB = context("tenant_b");
      expect((await repository.save(tenantA, aggregate(), null)).isOk()).toBe(true);
      expect(await repository.find(tenantB, "wco_pg")).toBeNull();

      const first = await repository.find(tenantA, "wco_pg");
      const competing = await repository.find(tenantA, "wco_pg");
      if (!first || !competing) throw new Error("collaboration was not loaded");
      const at = UpdatedAt.rehydrate("2026-07-24T00:01:00.000Z");
      first
        .acquireWriterLease({
          actorId: WorkspaceCollaborationParticipantId.rehydrate("wcp_owner"),
          laneId: WorkspaceCollaborationLaneId.rehydrate("wcl_builder"),
          leaseId: WorkspaceWriterLeaseId.rehydrate("wwl_first"),
          expiresAt: ExpiresAt.rehydrate("2026-07-24T00:11:00.000Z"),
          at,
        })
        ._unsafeUnwrap();
      competing
        .acquireWriterLease({
          actorId: WorkspaceCollaborationParticipantId.rehydrate("wcp_owner"),
          laneId: WorkspaceCollaborationLaneId.rehydrate("wcl_builder"),
          leaseId: WorkspaceWriterLeaseId.rehydrate("wwl_competing"),
          expiresAt: ExpiresAt.rehydrate("2026-07-24T00:11:00.000Z"),
          at,
        })
        ._unsafeUnwrap();

      expect((await repository.save(tenantA, first, 0)).isOk()).toBe(true);
      const rejected = await repository.save(tenantA, competing, 0);
      expect(rejected.isErr()).toBe(true);
      expect(rejected._unsafeUnwrapErr()).toMatchObject({
        code: "conflict",
        details: { expectedRevision: 0, revision: 1 },
      });

      const stored = await repository.find(tenantA, "wco_pg");
      expect(stored?.toState()).toMatchObject({
        revision: 1,
        writerLeases: [
          {
            generation: 1,
          },
        ],
      });
      expect((await repository.list(tenantA)).map((item) => item.id.value)).toEqual(["wco_pg"]);
    } finally {
      await database.close();
    }
  });
});
