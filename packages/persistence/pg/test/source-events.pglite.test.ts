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
  ResourceId,
  ResourceKindValue,
  ResourceName,
  SourceEventKindValue,
  SourceKindValue,
  SourceLocator,
  SourceRepositoryFullName,
  SourceRepositoryId,
  UpdatedAt,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

class SequentialIdGenerator {
  private sequence = 0;

  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }
}

describe("source event persistence", () => {
  test("[SRC-AUTO-EVENT-002] [SRC-AUTO-QUERY-001] [SRC-AUTO-QUERY-002] persists source event dedupe and read models", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-source-events-"));
    const { createDatabase, createMigrator, PgSourceEventRepository } = await import("../src");
    const {
      IngestSourceEventUseCase,
      ListSourceEventsQuery,
      ListSourceEventsQueryService,
      ShowSourceEventQuery,
      ShowSourceEventQueryService,
    } = await import("@appaloft/application");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = createExecutionContext({
        requestId: "req_source_events_pglite_test",
        entrypoint: "system",
      });
      const repositoryContext = toRepositoryContext(context);
      const sourceEvents = new PgSourceEventRepository(database.db);
      const clock = new FixedClock("2026-01-01T00:00:10.000Z");
      const ingest = new IngestSourceEventUseCase(sourceEvents, clock, new SequentialIdGenerator());
      const list = new ListSourceEventsQueryService(sourceEvents, clock);
      const show = new ShowSourceEventQueryService(sourceEvents);

      const input = {
        sourceKind: "github" as const,
        eventKind: "push" as const,
        sourceIdentity: {
          locator: "https://token:secret@github.com/appaloft/demo",
          providerRepositoryId: "repo_1",
          repositoryFullName: "appaloft/demo",
        },
        ref: "main",
        revision: "abc123",
        deliveryId: "delivery_1",
        verification: {
          status: "verified" as const,
          method: "provider-signature" as const,
        },
      };

      const first = await ingest.execute(context, input);
      const second = await ingest.execute(context, input);

      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
      expect(second._unsafeUnwrap()).toMatchObject({
        sourceEventId: "sevt_1",
        status: "deduped",
        dedupeOfSourceEventId: "sevt_1",
      });

      const stored = await sourceEvents.findByDedupeKey(
        repositoryContext,
        "delivery:github:repo_1:appaloft/demo:https://github.com/appaloft/demo:delivery_1",
      );
      expect(stored?.sourceIdentity.locator).toBe("https://github.com/appaloft/demo");

      await sourceEvents.record(repositoryContext, {
        sourceEventId: "sevt_dispatched",
        projectId: "prj_demo",
        matchedResourceIds: ["res_web"],
        sourceKind: "github",
        eventKind: "push",
        sourceIdentity: {
          locator: "https://github.com/appaloft/demo",
          providerRepositoryId: "repo_1",
          repositoryFullName: "appaloft/demo",
        },
        ref: "main",
        revision: "def456",
        deliveryId: "delivery_2",
        dedupeKey:
          "delivery:github:repo_1:appaloft/demo:https://github.com/appaloft/demo:delivery_2",
        dedupeStatus: "new",
        verification: {
          status: "verified",
          method: "provider-signature",
        },
        status: "dispatched",
        ignoredReasons: [],
        policyResults: [
          {
            resourceId: "res_web",
            status: "dispatched",
            deploymentId: "dep_1",
          },
        ],
        createdDeploymentIds: ["dep_1"],
        receivedAt: "2026-01-01T00:00:11.000Z",
      });

      const listed = await list.execute(
        context,
        ListSourceEventsQuery.create({ resourceId: "res_web" })._unsafeUnwrap(),
      );
      expect(listed.isOk()).toBe(true);
      expect(listed._unsafeUnwrap().items).toHaveLength(1);
      expect(listed._unsafeUnwrap().items[0]).toMatchObject({
        sourceEventId: "sevt_dispatched",
        projectId: "prj_demo",
        resourceIds: ["res_web"],
        status: "dispatched",
        createdDeploymentIds: ["dep_1"],
      });

      const detail = await show.execute(
        context,
        ShowSourceEventQuery.create({
          sourceEventId: "sevt_dispatched",
          resourceId: "res_web",
        })._unsafeUnwrap(),
      );
      expect(detail.isOk()).toBe(true);
      expect(detail._unsafeUnwrap()).toMatchObject({
        sourceEventId: "sevt_dispatched",
        projectId: "prj_demo",
        matchedResourceIds: ["res_web"],
        createdDeploymentIds: ["dep_1"],
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[SRC-AUTO-EVENT-003] persists ignored ref outcomes from Resource policy matching", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-source-event-policy-"));
    const {
      createDatabase,
      createMigrator,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgResourceRepository,
      PgSourceEventRepository,
    } = await import("../src");
    const { IngestSourceEventUseCase, ShowSourceEventQuery, ShowSourceEventQueryService } =
      await import("@appaloft/application");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const executionContext = createExecutionContext({
        requestId: "req_source_event_policy_pglite_test",
        entrypoint: "system",
      });
      const repositoryContext = toRepositoryContext(executionContext);
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const resources = new PgResourceRepository(database.db);
      const sourceEvents = new PgSourceEventRepository(database.db);
      const clock = new FixedClock("2026-01-01T00:00:10.000Z");
      const ingest = new IngestSourceEventUseCase(
        sourceEvents,
        clock,
        new SequentialIdGenerator(),
        sourceEvents,
      );
      const show = new ShowSourceEventQueryService(sourceEvents);
      const createdAt = CreatedAt.rehydrate("2026-01-01T00:00:00.000Z");
      const project = Project.create({
        id: ProjectId.rehydrate("prj_demo"),
        name: ProjectName.rehydrate("Demo"),
        createdAt,
      })._unsafeUnwrap();
      const environment = Environment.create({
        id: EnvironmentId.rehydrate("env_prod"),
        projectId: ProjectId.rehydrate("prj_demo"),
        name: EnvironmentName.rehydrate("Production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt,
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate("res_web"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_prod"),
        name: ResourceName.rehydrate("Web"),
        kind: ResourceKindValue.rehydrate("application"),
        sourceBinding: {
          kind: SourceKindValue.rehydrate("git-public"),
          locator: SourceLocator.rehydrate("https://github.com/appaloft/demo"),
          displayName: DisplayNameText.rehydrate("appaloft/demo"),
          gitRef: GitRefText.rehydrate("main"),
          repositoryId: SourceRepositoryId.rehydrate("repo_1"),
          repositoryFullName: SourceRepositoryFullName.rehydrate("appaloft/demo"),
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

      await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        repositoryContext,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await resources.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );

      const result = await ingest.execute(executionContext, {
        sourceKind: "github",
        eventKind: "push",
        sourceIdentity: {
          locator: "https://github.com/appaloft/demo",
          providerRepositoryId: "repo_1",
          repositoryFullName: "appaloft/demo",
        },
        ref: "feature/skip",
        revision: "abc123",
        deliveryId: "delivery_ref_skip",
        verification: {
          status: "verified",
          method: "provider-signature",
        },
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({
        sourceEventId: "sevt_1",
        status: "ignored",
        ignoredReasons: ["ref-not-matched"],
        createdDeploymentIds: [],
      });

      const detail = await show.execute(
        executionContext,
        ShowSourceEventQuery.create({
          sourceEventId: "sevt_1",
          projectId: "prj_demo",
        })._unsafeUnwrap(),
      );
      expect(detail.isOk()).toBe(true);
      expect(detail._unsafeUnwrap()).toMatchObject({
        sourceEventId: "sevt_1",
        projectId: "prj_demo",
        status: "ignored",
        matchedResourceIds: [],
        policyResults: [
          {
            resourceId: "res_web",
            status: "ignored",
            reason: "ref-not-matched",
          },
        ],
        createdDeploymentIds: [],
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
