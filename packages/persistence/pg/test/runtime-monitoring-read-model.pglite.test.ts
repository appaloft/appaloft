import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../src";

function createTestContext() {
  return createExecutionContext({
    requestId: "req_runtime_monitoring_pglite",
    entrypoint: "system",
  });
}

async function seedBaseRows(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto("projects")
    .values({
      id: "prj_demo",
      name: "Demo",
      slug: "demo",
      description: null,
      lifecycle_status: "active",
      archived_at: null,
      archive_reason: null,
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("servers")
    .values({
      id: "srv_primary",
      name: "Primary",
      host: "203.0.113.10",
      port: 22,
      provider_key: "generic-ssh",
      target_kind: "server",
      lifecycle_status: "active",
      deactivated_at: null,
      deactivation_reason: null,
      deleted_at: null,
      edge_proxy_kind: null,
      edge_proxy_status: null,
      edge_proxy_last_attempt_at: null,
      edge_proxy_last_succeeded_at: null,
      edge_proxy_last_error_code: null,
      edge_proxy_last_error_message: null,
      credential_id: null,
      credential_kind: null,
      credential_username: null,
      credential_public_key: null,
      credential_private_key: null,
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("destinations")
    .values({
      id: "dst_primary",
      server_id: "srv_primary",
      name: "Primary",
      kind: "single-server",
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("environments")
    .values({
      id: "env_prod",
      project_id: "prj_demo",
      name: "Production",
      kind: "production",
      parent_environment_id: null,
      lifecycle_status: "active",
      locked_at: null,
      lock_reason: null,
      archived_at: null,
      archive_reason: null,
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("resources")
    .values({
      id: "res_api",
      project_id: "prj_demo",
      environment_id: "env_prod",
      destination_id: "dst_primary",
      name: "API",
      slug: "api",
      kind: "web-service",
      description: null,
      services: [],
      source_binding: null,
      runtime_profile: null,
      network_profile: null,
      access_profile: null,
      auto_deploy_policy: null,
      lifecycle_status: "active",
      archived_at: null,
      archive_reason: null,
      deleted_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();
  await db
    .insertInto("deployments")
    .values({
      id: "dep_api",
      project_id: "prj_demo",
      environment_id: "env_prod",
      resource_id: "res_api",
      server_id: "srv_primary",
      destination_id: "dst_primary",
      status: "succeeded",
      runtime_plan: {},
      environment_snapshot: {},
      dependency_binding_references: [],
      timeline: [],
      created_at: "2026-01-01T00:00:00.000Z",
      started_at: "2026-01-01T00:00:05.000Z",
      finished_at: "2026-01-01T00:00:25.000Z",
      trigger_kind: "manual",
      source_deployment_id: null,
      rollback_candidate_deployment_id: null,
      rollback_of_deployment_id: null,
      supersedes_deployment_id: null,
      superseded_by_deployment_id: null,
    })
    .execute();
}

describe("runtime monitoring read models pglite integration", () => {
  test("[RT-MON-002][RT-MON-003] pglite reads retained samples and deployment markers", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-monitoring-"));
    const {
      createDatabase,
      createMigrator,
      PgRuntimeMonitoringMarkerReadModel,
      PgRuntimeMonitoringSampleReadModel,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }
      await seedBaseRows(database.db);
      await database.db
        .insertInto("runtime_monitoring_samples")
        .values([
          {
            id: "rms_dep_api_1",
            observed_at: "2026-01-01T00:01:00.000Z",
            collected_at: "2026-01-01T00:01:03.000Z",
            scope_kind: "deployment",
            scope_id: "dep_api",
            server_id: "srv_primary",
            project_id: "prj_demo",
            environment_id: "env_prod",
            resource_id: "res_api",
            deployment_id: "dep_api",
            totals: {
              cpu: { containerCpuPercent: 17 },
              memory: { containerUsedBytes: 2048 },
            },
            freshness: "recent-sample",
            partial: false,
            labels: {
              providerKey: "generic-ssh",
              runtimeId: "run_api",
              unsafeHostPath: "/root/private",
            },
            warnings: [],
            source_errors: [],
            retained_until: "2026-01-02T00:01:00.000Z",
          },
          {
            id: "rms_other_resource",
            observed_at: "2026-01-01T00:02:00.000Z",
            collected_at: "2026-01-01T00:02:03.000Z",
            scope_kind: "resource",
            scope_id: "res_other",
            server_id: "srv_primary",
            project_id: "prj_demo",
            environment_id: "env_prod",
            resource_id: "res_other",
            deployment_id: null,
            totals: { cpu: { containerCpuPercent: 99 } },
            freshness: "recent-sample",
            partial: false,
            labels: { providerKey: "generic-ssh" },
            warnings: [],
            source_errors: [],
            retained_until: "2026-01-02T00:02:00.000Z",
          },
        ])
        .execute();

      const context = createTestContext();
      const sampleReadModel = new PgRuntimeMonitoringSampleReadModel(database.db);
      const markerReadModel = new PgRuntimeMonitoringMarkerReadModel(database.db);

      const samples = await sampleReadModel.listSamples(context, {
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
        signals: ["cpu"],
        limit: 10,
      });
      expect(samples.isOk()).toBe(true);
      const sampleWindow = samples._unsafeUnwrap();
      expect(sampleWindow.samples).toHaveLength(1);
      expect(sampleWindow.samples[0]).toMatchObject({
        sampleId: "rms_dep_api_1",
        scopeEvidence: {
          scope: { kind: "deployment", deploymentId: "dep_api" },
          resourceId: "res_api",
        },
        totals: {
          cpu: { containerCpuPercent: 17 },
        },
        labels: {
          providerKey: "generic-ssh",
          runtimeId: "run_api",
        },
      });
      expect(sampleWindow.samples[0]?.totals.memory).toBeUndefined();
      expect(sampleWindow.samples[0]?.labels).not.toHaveProperty("unsafeHostPath");

      const markers = await markerReadModel.listDeploymentMarkers(context, {
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
      });
      expect(markers.isOk()).toBe(true);
      expect(markers._unsafeUnwrap()).toEqual([
        {
          deploymentId: "dep_api",
          resourceId: "res_api",
          environmentId: "env_prod",
          observedAt: "2026-01-01T00:00:25.000Z",
          status: "succeeded",
          label: "Deployment dep_api succeeded",
          correlation: "time",
        },
      ]);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[RT-MON-001] pglite records sanitized retained samples for collector writes", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-monitoring-write-"));
    const {
      createDatabase,
      createMigrator,
      PgRuntimeMonitoringSampleReadModel,
      PgRuntimeMonitoringSampleWriteStore,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }
      await seedBaseRows(database.db);

      const context = createTestContext();
      const repositoryContext = toRepositoryContext(context);
      const writeStore = new PgRuntimeMonitoringSampleWriteStore(database.db);
      const written = await writeStore.record(repositoryContext, {
        sampleId: "rms_collected_res_api",
        observedAt: "2026-01-01T00:04:00.000Z",
        collectedAt: "2026-01-01T00:04:05.000Z",
        retainedUntil: "2026-01-01T06:04:00.000Z",
        scopeEvidence: {
          scope: { kind: "resource", resourceId: "res_api" },
          serverId: "srv_primary",
          projectId: "prj_demo",
          environmentId: "env_prod",
          resourceId: "res_api",
          deploymentId: "dep_api",
        },
        totals: {
          cpu: { containerCpuPercent: 21 },
          disk: { attributedBytes: 8192 },
        },
        freshness: "live",
        partial: true,
        labels: {
          artifactKind: "active-runtime",
          runtimeId: "run_api",
        },
        warnings: [
          {
            code: "partial-window",
            message: "Network usage source is unavailable.",
            signal: "network",
          },
        ],
        sourceErrors: [
          {
            source: "collector",
            code: "docker_stats_unavailable",
            message: "Docker stats could not be read.",
            retriable: true,
          },
        ],
      });
      expect(written.isOk()).toBe(true);

      const readModel = new PgRuntimeMonitoringSampleReadModel(database.db);
      const samples = await readModel.listSamples(context, {
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
        signals: ["cpu", "disk", "network"],
        limit: 10,
      });

      expect(samples.isOk()).toBe(true);
      expect(samples._unsafeUnwrap().samples).toEqual([
        {
          sampleId: "rms_collected_res_api",
          observedAt: "2026-01-01T00:04:00.000Z",
          collectedAt: "2026-01-01T00:04:05.000Z",
          scopeEvidence: {
            scope: { kind: "resource", resourceId: "res_api" },
            serverId: "srv_primary",
            projectId: "prj_demo",
            environmentId: "env_prod",
            resourceId: "res_api",
            deploymentId: "dep_api",
          },
          totals: {
            cpu: { containerCpuPercent: 21 },
            disk: { attributedBytes: 8192 },
          },
          freshness: "live",
          partial: true,
          labels: {
            artifactKind: "active-runtime",
            runtimeId: "run_api",
          },
          warnings: [
            {
              code: "partial-window",
              message: "Network usage source is unavailable.",
              signal: "network",
            },
          ],
          sourceErrors: [
            {
              source: "collector",
              code: "docker_stats_unavailable",
              message: "Docker stats could not be read.",
              retriable: true,
            },
          ],
        },
      ]);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[RT-MON-001] pglite prunes expired retained samples with dry-run and scope bounds", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-monitoring-prune-"));
    const { createDatabase, createMigrator, PgRuntimeMonitoringSampleRetentionStore } =
      await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }
      await seedBaseRows(database.db);
      await database.db
        .insertInto("runtime_monitoring_samples")
        .values([
          {
            id: "rms_expired_res_api",
            observed_at: "2026-01-01T00:01:00.000Z",
            collected_at: "2026-01-01T00:01:03.000Z",
            scope_kind: "resource",
            scope_id: "res_api",
            server_id: "srv_primary",
            project_id: "prj_demo",
            environment_id: "env_prod",
            resource_id: "res_api",
            deployment_id: "dep_api",
            totals: { cpu: { containerCpuPercent: 17 } },
            freshness: "recent-sample",
            partial: false,
            labels: { providerKey: "generic-ssh" },
            warnings: [],
            source_errors: [],
            retained_until: "2026-01-01T06:00:00.000Z",
          },
          {
            id: "rms_boundary_res_api",
            observed_at: "2026-01-01T00:02:00.000Z",
            collected_at: "2026-01-01T00:02:03.000Z",
            scope_kind: "resource",
            scope_id: "res_api",
            server_id: "srv_primary",
            project_id: "prj_demo",
            environment_id: "env_prod",
            resource_id: "res_api",
            deployment_id: "dep_api",
            totals: { cpu: { containerCpuPercent: 18 } },
            freshness: "recent-sample",
            partial: false,
            labels: { providerKey: "generic-ssh" },
            warnings: [],
            source_errors: [],
            retained_until: "2026-01-01T07:00:00.000Z",
          },
          {
            id: "rms_expired_other_resource",
            observed_at: "2026-01-01T00:03:00.000Z",
            collected_at: "2026-01-01T00:03:03.000Z",
            scope_kind: "resource",
            scope_id: "res_other",
            server_id: "srv_primary",
            project_id: "prj_demo",
            environment_id: "env_prod",
            resource_id: "res_other",
            deployment_id: null,
            totals: { cpu: { containerCpuPercent: 99 } },
            freshness: "recent-sample",
            partial: false,
            labels: { providerKey: "generic-ssh" },
            warnings: [],
            source_errors: [],
            retained_until: "2026-01-01T06:30:00.000Z",
          },
        ])
        .execute();

      const repositoryContext = toRepositoryContext(createTestContext());
      const retentionStore = new PgRuntimeMonitoringSampleRetentionStore(database.db);

      const dryRun = await retentionStore.prune(repositoryContext, {
        scope: { kind: "resource", resourceId: "res_api" },
        before: "2026-01-01T07:00:00.000Z",
        dryRun: true,
      });
      expect(dryRun.isOk()).toBe(true);
      expect(dryRun._unsafeUnwrap()).toEqual({
        matchedCount: 1,
        prunedCount: 0,
      });
      expect(
        await database.db
          .selectFrom("runtime_monitoring_samples")
          .select((expressionBuilder) => expressionBuilder.fn.countAll().as("count"))
          .executeTakeFirstOrThrow(),
      ).toEqual({ count: 3 });

      const prune = await retentionStore.prune(repositoryContext, {
        scope: { kind: "resource", resourceId: "res_api" },
        before: "2026-01-01T07:00:00.000Z",
        dryRun: false,
      });
      expect(prune.isOk()).toBe(true);
      expect(prune._unsafeUnwrap()).toEqual({
        matchedCount: 1,
        prunedCount: 1,
      });

      const remainingRows = await database.db
        .selectFrom("runtime_monitoring_samples")
        .select("id")
        .orderBy("id", "asc")
        .execute();
      expect(remainingRows.map((row) => row.id)).toEqual([
        "rms_boundary_res_api",
        "rms_expired_other_resource",
      ]);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[RT-MON-006] pglite upserts runtime monitoring threshold policies by exact scope", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-monitoring-thresholds-"));
    const { createDatabase, createMigrator, PgRuntimeMonitoringThresholdPolicyRepository } =
      await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }

      const repositoryContext = toRepositoryContext(createTestContext());
      const repository = new PgRuntimeMonitoringThresholdPolicyRepository(database.db);
      const first = await repository.upsert(repositoryContext, {
        policyId: "rmtp_res_api_first",
        scope: { kind: "resource", resourceId: "res_api" },
        rules: [
          {
            ruleId: "rmtr_memory",
            signal: "memory",
            metric: "usedBytes",
            warning: 1024,
            critical: 2048,
            comparator: "greater-than-or-equal",
          },
        ],
        enabled: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedByActorId: "usr_ops",
        updatedByActorKind: "user",
      });
      expect(first.isOk()).toBe(true);

      const replacement = await repository.upsert(repositoryContext, {
        policyId: "rmtp_res_api_second",
        scope: { kind: "resource", resourceId: "res_api" },
        rules: [
          {
            ruleId: "rmtr_disk",
            signal: "disk",
            metric: "usedBytes",
            critical: 4096,
            comparator: "greater-than-or-equal",
          },
        ],
        enabled: false,
        updatedAt: "2026-01-01T00:05:00.000Z",
        updatedByActorId: "usr_ops_2",
        updatedByActorKind: "user",
      });
      expect(replacement.isOk()).toBe(true);
      expect(replacement._unsafeUnwrap()).toEqual({
        policyId: "rmtp_res_api_first",
        scope: { kind: "resource", resourceId: "res_api" },
        rules: [
          {
            ruleId: "rmtr_disk",
            signal: "disk",
            metric: "usedBytes",
            critical: 4096,
            comparator: "greater-than-or-equal",
          },
        ],
        enabled: false,
        updatedAt: "2026-01-01T00:05:00.000Z",
        updatedByActorId: "usr_ops_2",
        updatedByActorKind: "user",
      });

      const byScope = await repository.findOne(repositoryContext, {
        scope: { kind: "resource", resourceId: "res_api" },
      });
      expect(byScope.isOk()).toBe(true);
      expect(byScope._unsafeUnwrap()?.policyId).toBe("rmtp_res_api_first");

      const raw = await database.db
        .selectFrom("runtime_monitoring_threshold_policies")
        .select(["id", "scope_kind", "scope_id", "enabled", "rules"])
        .executeTakeFirstOrThrow();
      expect(raw).toEqual({
        id: "rmtp_res_api_first",
        scope_kind: "resource",
        scope_id: "res_api",
        enabled: false,
        rules: [
          {
            ruleId: "rmtr_disk",
            signal: "disk",
            metric: "usedBytes",
            critical: 4096,
            comparator: "greater-than-or-equal",
          },
        ],
      });
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
