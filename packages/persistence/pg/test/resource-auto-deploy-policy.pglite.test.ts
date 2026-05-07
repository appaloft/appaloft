import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  DisplayNameText,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  GitRefText,
  Project,
  ProjectId,
  ProjectName,
  Resource,
  ResourceAutoDeployTriggerKindValue,
  ResourceByIdSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  SourceEventKindValue,
  SourceKindValue,
  SourceLocator,
  UpdatedAt,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";

describe("resource auto-deploy policy persistence", () => {
  test("[SRC-AUTO-POLICY-001] [SRC-AUTO-POLICY-003] persists Resource auto-deploy policy state", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-resource-auto-deploy-"));
    const {
      createDatabase,
      createMigrator,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgResourceRepository,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_resource_auto_deploy_pglite_test",
          entrypoint: "system",
        }),
      );
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const resources = new PgResourceRepository(database.db);
      const createdAt = CreatedAt.rehydrate("2026-01-01T00:00:00.000Z");
      const project = Project.create({
        id: ProjectId.rehydrate("prj_demo"),
        name: ProjectName.rehydrate("Demo"),
        createdAt,
      })._unsafeUnwrap();
      const environment = Environment.create({
        id: EnvironmentId.rehydrate("env_demo"),
        projectId: ProjectId.rehydrate("prj_demo"),
        name: EnvironmentName.rehydrate("Production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt,
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate("res_web"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        name: ResourceName.rehydrate("Web"),
        kind: ResourceKindValue.rehydrate("application"),
        sourceBinding: {
          kind: SourceKindValue.rehydrate("git-public"),
          locator: SourceLocator.rehydrate("https://github.com/appaloft/demo"),
          displayName: DisplayNameText.rehydrate("appaloft/demo"),
          gitRef: GitRefText.rehydrate("main"),
        },
        createdAt,
      })._unsafeUnwrap();

      resource
        .configureAutoDeployPolicy({
          triggerKind: ResourceAutoDeployTriggerKindValue.rehydrate("git-push"),
          refs: [GitRefText.rehydrate("main")],
          eventKinds: [SourceEventKindValue.rehydrate("push")],
          configuredAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
        })
        ._unsafeUnwrap();
      resource
        .configureSourceBinding({
          sourceBinding: {
            kind: SourceKindValue.rehydrate("git-public"),
            locator: SourceLocator.rehydrate("https://github.com/appaloft/demo"),
            displayName: DisplayNameText.rehydrate("appaloft/demo"),
            gitRef: GitRefText.rehydrate("release"),
          },
          configuredAt: UpdatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
        })
        ._unsafeUnwrap();

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await resources.upsert(context, resource, UpsertResourceSpec.fromResource(resource));

      const persisted = await resources.findOne(
        context,
        ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
      );
      const policy = persisted?.toState().autoDeployPolicy;

      expect(policy?.status.value).toBe("blocked");
      expect(policy?.blockedReason?.value).toBe("source-binding-changed");
      expect(policy?.triggerKind.value).toBe("git-push");
      expect(policy?.refs.map((ref) => ref.value)).toEqual(["main"]);
      expect(policy?.eventKinds.map((eventKind) => eventKind.value)).toEqual(["push"]);
      expect(policy?.sourceBindingFingerprint.value).toMatch(/^srcfp_[a-f0-9]{8}$/);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
