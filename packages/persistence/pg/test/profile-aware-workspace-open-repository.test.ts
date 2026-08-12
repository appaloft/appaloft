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
import { workspaceActivationTargetEvidenceMigration } from "../src/migrations/119_workspace_activation_target_evidence";

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
  test("[WS-OPEN-BIND-005][WS-OPEN-RESUME-011][WS-OPEN-NEW-012][WS-OPEN-CLEANUP-020][WS-OPEN-PROFILE-021] stores tenant bindings and one preferred Workspace generation", async () => {
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
      const managedSelection = {
        targetClass: "managed" as const,
        source: "platform-default" as const,
        reason: "managed_entitlement_default",
      };
      const activation = {
        project: { projectId: "prj_workspace_open", disposition: "created" as const },
        repositoryBinding: { bindingId: "rbd_web", disposition: "created" as const },
        profile: { profileInstallationId: "awpi_default", disposition: "created" as const },
      };
      expect(
        (
          await entries.begin(tenantA, key, {
            commitSha: "a".repeat(40),
            profileInstallationId: "awpi_default",
            forceNew: false,
            targetSelection: managedSelection,
            activation,
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
        targetSelection: managedSelection,
        activation,
      });
      expect(
        (
          await entries.begin(tenantA, key, {
            commitSha: "a".repeat(40),
            profileInstallationId: "awpi_default",
            forceNew: false,
            targetSelection: managedSelection,
            activation,
          })
        )._unsafeUnwrap(),
      ).toEqual({ workspaceId: "sbx_first", created: false });
      expect(
        (
          await entries.begin(tenantA, key, {
            commitSha: "b".repeat(40),
            profileInstallationId: "awpi_opencode",
            forceNew: true,
            targetSelection: {
              targetClass: "registered-server",
              source: "saved-policy",
              reason: "registered_server_saved_policy",
            },
            activation: {
              ...activation,
              project: { ...activation.project, disposition: "reused" },
              repositoryBinding: {
                ...activation.repositoryBinding,
                disposition: "reused",
              },
              profile: {
                profileInstallationId: "awpi_opencode",
                disposition: "reused",
              },
            },
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
        await entries.findPreferred(tenantA, key, {
          profileInstallationId: "awpi_default",
        }),
      ).toMatchObject({
        workspaceId: "sbx_first",
        runtimeId: "sar_first",
      });
      expect(
        await entries.findPreferred(tenantA, key, {
          profileInstallationId: "awpi_missing",
        }),
      ).toBeUndefined();
      expect(
        await entries.findPreferred(
          tenantB,
          { ...key, tenantId: "tenant_b" },
          {
            profileInstallationId: "awpi_default",
          },
        ),
      ).toBeUndefined();
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
            targetSelection: managedSelection,
            activation,
          })
        )._unsafeUnwrap(),
      ).toEqual({ created: true });
    } finally {
      await database.close();
    }
  });

  test("[WS-ACT-LEGACY-006][WS-ACT-SAFE-007] reads nullable legacy target evidence without guessing and rejects legacy evidence for new entries", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-workspace-open-legacy-pg-"));
    directories.push(directory);
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: directory,
    });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const tenant = context("tenant_legacy");
      const legacyProject = Project.create({
        id: ProjectId.rehydrate("prj_legacy"),
        name: ProjectName.rehydrate("Legacy"),
        createdAt: CreatedAt.rehydrate("2026-08-12T00:00:00.000Z"),
      })._unsafeUnwrap();
      await new PgProjectRepository(database.db).upsert(
        toRepositoryContext(tenant),
        legacyProject,
        UpsertProjectSpec.fromProject(legacyProject),
      );
      const key = {
        tenantId: "tenant_legacy",
        subjectId: "usr_1",
        projectId: "prj_legacy",
        repositoryIdentity: "github.com/Acme/Legacy",
        branch: "main",
      };
      await database.db
        .insertInto("workspace_open_entries")
        .values({
          tenant_id: key.tenantId,
          subject_id: key.subjectId,
          project_id: key.projectId,
          repository_identity: key.repositoryIdentity,
          branch: key.branch,
          generation: 1,
          commit_sha: "a".repeat(40),
          profile_installation_id: "awpi_legacy",
          target_class: null,
          target_selection_source: null,
          target_selection_reason: null,
          activation_repository_binding_id: null,
          activation_project_disposition: null,
          activation_repository_binding_disposition: null,
          activation_profile_disposition: null,
          workspace_id: "sbx_legacy",
          runtime_id: "sar_legacy",
          status: "ready",
          phase: "workspace-open-ready",
          error_code: null,
          preferred: true,
          created_at: "2026-08-12T00:00:00.000Z",
          updated_at: "2026-08-12T00:00:00.000Z",
        })
        .execute();
      const entries = new PgWorkspaceOpenEntryRepository(
        database.db,
        () => "2026-08-12T00:00:01.000Z",
      );

      expect(await entries.findPreferred(tenant, key)).toMatchObject({
        workspaceId: "sbx_legacy",
        targetSelection: {
          targetClass: "legacy-unclassified",
          source: "legacy",
          reason: "workspace_target_legacy_unclassified",
        },
      });
      const rejected = await entries.begin(tenant, key, {
        commitSha: "b".repeat(40),
        profileInstallationId: "awpi_legacy",
        forceNew: true,
        targetSelection: {
          targetClass: "legacy-unclassified",
          source: "legacy",
          reason: "workspace_target_legacy_unclassified",
        },
        activation: {
          project: { projectId: "prj_legacy", disposition: "reused" },
          repositoryBinding: { bindingId: "rbd_legacy", disposition: "reused" },
          profile: { profileInstallationId: "awpi_legacy", disposition: "reused" },
        },
      });
      expect(rejected._unsafeUnwrapErr().details?.code).toBe(
        "workspace_target_selection_evidence_invalid",
      );
    } finally {
      await database.close();
    }
  });

  test("[WS-ACT-LEGACY-006] upgrades a pre-evidence Workspace row without inferring target ownership", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-workspace-open-upgrade-pg-"));
    directories.push(directory);
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: directory,
    });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      await workspaceActivationTargetEvidenceMigration.down(database.db);

      const tenant = context("tenant_upgrade");
      const legacyProject = Project.create({
        id: ProjectId.rehydrate("prj_upgrade"),
        name: ProjectName.rehydrate("Upgrade"),
        createdAt: CreatedAt.rehydrate("2026-08-12T00:00:00.000Z"),
      })._unsafeUnwrap();
      await new PgProjectRepository(database.db).upsert(
        toRepositoryContext(tenant),
        legacyProject,
        UpsertProjectSpec.fromProject(legacyProject),
      );
      await database.db
        .insertInto("workspace_open_entries")
        .values({
          tenant_id: "tenant_upgrade",
          subject_id: "usr_1",
          project_id: "prj_upgrade",
          repository_identity: "github.com/Acme/Upgrade",
          branch: "main",
          generation: 1,
          commit_sha: "c".repeat(40),
          profile_installation_id: "awpi_upgrade",
          workspace_id: "sbx_upgrade",
          runtime_id: "sar_upgrade",
          status: "ready",
          phase: "workspace-open-ready",
          error_code: null,
          preferred: true,
          created_at: "2026-08-12T00:00:00.000Z",
          updated_at: "2026-08-12T00:00:00.000Z",
        })
        .execute();

      await workspaceActivationTargetEvidenceMigration.up(database.db);
      const upgraded = await new PgWorkspaceOpenEntryRepository(
        database.db,
        () => "2026-08-12T00:00:01.000Z",
      ).findPreferred(tenant, {
        tenantId: "tenant_upgrade",
        subjectId: "usr_1",
        projectId: "prj_upgrade",
        repositoryIdentity: "github.com/Acme/Upgrade",
        branch: "main",
      });
      expect(upgraded).toMatchObject({
        workspaceId: "sbx_upgrade",
        targetSelection: {
          targetClass: "legacy-unclassified",
          source: "legacy",
          reason: "workspace_target_legacy_unclassified",
        },
      });
      expect(upgraded?.activation).toBeUndefined();
    } finally {
      await database.close();
    }
  });
});
