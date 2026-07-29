import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  Project,
  ProjectId,
  ProjectName,
  ProjectRepositoryBinding,
  ProjectRepositoryBindingId,
  RepositoryIdentity,
  UpsertProjectSpec,
} from "@appaloft/core";

import {
  createDatabase,
  createMigrator,
  PgProjectRepository,
  PgRepositoryBindingRepository,
  PgWorkspaceOpenEntryRepository,
} from "../src";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function context(tenantId: string) {
  return createExecutionContext({
    entrypoint: "system",
    requestId: `req_${tenantId}`,
    actor: { kind: "user", id: "usr_1" },
    tenant: { tenantId, subjectId: "usr_1" },
  });
}

describe("Profile-aware Workspace open persistence", () => {
  test("[WS-OPEN-BIND-005][WS-OPEN-RESUME-011][WS-OPEN-NEW-012][WS-OPEN-CLEANUP-020] stores tenant bindings and one preferred Workspace generation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-workspace-open-pg-"));
    directories.push(directory);
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: directory,
    });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const tenantA = context("tenant_a");
      const tenantB = context("tenant_b");
      const repositoryContext = toRepositoryContext(tenantA);
      const project = Project.create({
        id: ProjectId.rehydrate("prj_workspace_open"),
        name: ProjectName.rehydrate("Workspace Open"),
        createdAt: CreatedAt.rehydrate("2026-07-28T00:00:00.000Z"),
      })._unsafeUnwrap();
      await new PgProjectRepository(database.db).upsert(
        repositoryContext,
        project,
        UpsertProjectSpec.fromProject(project),
      );

      const bindings = new PgRepositoryBindingRepository(database.db);
      const binding = ProjectRepositoryBinding.bind({
        id: ProjectRepositoryBindingId.rehydrate("rbd_web"),
        repositoryIdentity: RepositoryIdentity.rehydrate("github.com/Acme/Web"),
        projectId: ProjectId.rehydrate("prj_workspace_open"),
        createdAt: CreatedAt.rehydrate("2026-07-28T00:00:01.000Z"),
      })._unsafeUnwrap();
      expect((await bindings.save(repositoryContext, binding)).isOk()).toBe(true);
      expect(
        (await bindings.findByIdentity(repositoryContext, "github.com/Acme/Web"))?.binding.toState()
          .projectId.value,
      ).toBe("prj_workspace_open");
      expect(
        await bindings.findByIdentity(toRepositoryContext(tenantB), "github.com/Acme/Web"),
      ).toBeNull();

      let time = 1;
      const entries = new PgWorkspaceOpenEntryRepository(
        database.db,
        () => `2026-07-28T00:00:0${time++}.000Z`,
      );
      const key = {
        tenantId: "tenant_a",
        subjectId: "usr_1",
        projectId: "prj_workspace_open",
        repositoryIdentity: "github.com/Acme/Web",
        branch: "main",
      };
      expect(
        (
          await entries.begin(tenantA, key, {
            commitSha: "a".repeat(40),
            profileInstallationId: "awpi_default",
            forceNew: false,
          })
        )._unsafeUnwrap(),
      ).toEqual({ created: true });
      expect(
        (
          await entries.complete(tenantA, {
            ...key,
            workspaceId: "sbx_first",
            runtimeId: "sar_first",
            commitSha: "a".repeat(40),
          })
        ).isOk(),
      ).toBe(true);
      expect(await entries.findPreferred(tenantA, key)).toMatchObject({
        workspaceId: "sbx_first",
        runtimeId: "sar_first",
        commitSha: "a".repeat(40),
        status: "ready",
      });
      expect(
        (
          await entries.begin(tenantA, key, {
            commitSha: "a".repeat(40),
            profileInstallationId: "awpi_default",
            forceNew: false,
          })
        )._unsafeUnwrap(),
      ).toEqual({ workspaceId: "sbx_first", created: false });
      expect(
        (
          await entries.begin(tenantA, key, {
            commitSha: "b".repeat(40),
            profileInstallationId: "awpi_default",
            forceNew: true,
          })
        )._unsafeUnwrap(),
      ).toEqual({ created: true });
      await entries.complete(tenantA, {
        ...key,
        workspaceId: "sbx_second",
        runtimeId: "sar_second",
        commitSha: "b".repeat(40),
      });
      expect(await entries.findPreferred(tenantA, key)).toMatchObject({
        workspaceId: "sbx_second",
        runtimeId: "sar_second",
      });
      expect(
        (await entries.markWorkspaceTerminated(tenantB, "sbx_second"))._unsafeUnwrap(),
      ).toEqual({ advanced: false });
      expect(
        (await entries.markWorkspaceTerminated(tenantA, "sbx_second"))._unsafeUnwrap(),
      ).toEqual({ advanced: true });
      expect(await entries.findPreferred(tenantA, key)).toBeUndefined();
      expect(
        (
          await entries.begin(tenantA, key, {
            commitSha: "b".repeat(40),
            profileInstallationId: "awpi_default",
            forceNew: false,
          })
        )._unsafeUnwrap(),
      ).toEqual({ created: true });
    } finally {
      await database.close();
    }
  });
});
