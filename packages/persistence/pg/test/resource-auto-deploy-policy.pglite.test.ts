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
  HelmChartVersion,
  HelmHookPolicyValue,
  HelmTimeoutSeconds,
  HelmValuesSecretReference,
  Project,
  ProjectId,
  ProjectName,
  Resource,
  ResourceAutoDeployTriggerKindValue,
  ResourceByIdSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  SourceEventDedupeWindowSeconds,
  SourceEventKindValue,
  SourceKindValue,
  SourceLocator,
  SourcePathPattern,
  UpdatedAt,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";

describe("resource auto-deploy policy persistence", () => {
  test("[K8S-HELM-013] persists typed Helm chart source configuration", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-resource-helm-source-"));
    const {
      createDatabase,
      createMigrator,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgResourceRepository,
    } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();
      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_resource_helm_pglite_test",
          entrypoint: "system",
        }),
      );
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const resources = new PgResourceRepository(database.db);
      const createdAt = CreatedAt.rehydrate("2026-08-13T00:00:00.000Z");
      const project = Project.create({
        id: ProjectId.rehydrate("prj_helm"),
        name: ProjectName.rehydrate("Helm"),
        createdAt,
      })._unsafeUnwrap();
      const environment = Environment.create({
        id: EnvironmentId.rehydrate("env_helm"),
        projectId: ProjectId.rehydrate("prj_helm"),
        name: EnvironmentName.rehydrate("Production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt,
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate("res_helm"),
        projectId: ProjectId.rehydrate("prj_helm"),
        environmentId: EnvironmentId.rehydrate("env_helm"),
        name: ResourceName.rehydrate("Storefront"),
        kind: ResourceKindValue.rehydrate("application"),
        sourceBinding: {
          kind: SourceKindValue.rehydrate("helm-chart"),
          locator: SourceLocator.rehydrate("oci://registry.example.com/charts/storefront"),
          displayName: DisplayNameText.rehydrate("storefront"),
          helmChart: {
            version: HelmChartVersion.rehydrate("1.7.3"),
            valuesSecretReferences: [
              HelmValuesSecretReference.rehydrate("secret://helm/storefront/production"),
            ],
            hookPolicy: HelmHookPolicyValue.rehydrate("bounded"),
            timeoutSeconds: HelmTimeoutSeconds.rehydrate(300),
          },
        },
        createdAt,
      })._unsafeUnwrap();

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await resources.upsert(context, resource, UpsertResourceSpec.fromResource(resource));
      const persisted = await resources.findOne(
        context,
        ResourceByIdSpec.create(ResourceId.rehydrate("res_helm")),
      );
      const source = persisted?.toState().sourceBinding;

      expect(source?.kind.value).toBe("helm-chart");
      expect(source?.helmChart?.version.value).toBe("1.7.3");
      expect(source?.helmChart?.valuesSecretReferences.map((reference) => reference.value)).toEqual(
        ["secret://helm/storefront/production"],
      );
      expect(source?.helmChart?.hookPolicy.value).toBe("bounded");
      expect(source?.helmChart?.timeoutSeconds.value).toBe(300);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[SRC-AUTO-POLICY-001] [SRC-AUTO-POLICY-003] [SRC-AUTO-ROUNDTRIP-001] persists Resource auto-deploy policy state", async () => {
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
          includePaths: [SourcePathPattern.rehydrate("apps/web/**")],
          excludePaths: [SourcePathPattern.rehydrate("apps/web/docs/**")],
          dedupeWindowSeconds: SourceEventDedupeWindowSeconds.rehydrate(120),
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
      expect(policy?.includePaths?.map((pattern) => pattern.value)).toEqual(["apps/web/**"]);
      expect(policy?.excludePaths?.map((pattern) => pattern.value)).toEqual(["apps/web/docs/**"]);
      expect(policy?.dedupeWindowSeconds?.value).toBe(120);
      expect(policy?.sourceBindingFingerprint.value).toMatch(/^srcfp_[a-f0-9]{8}$/);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
