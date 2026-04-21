import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ServerAppliedRouteDesiredStateStore as CliServerAppliedRouteStateStore,
  type CliSourceLinkStore,
  FileSystemServerAppliedRouteDesiredStateStore,
  FileSystemSourceLinkStore,
} from "@appaloft/adapter-cli";
import {
  type AppLogger,
  MarkServerAppliedRouteAppliedSpec,
  MarkServerAppliedRouteFailedSpec,
  ServerAppliedRouteStateByRouteSetIdSpec,
  ServerAppliedRouteStateBySourceFingerprintSpec,
  ServerAppliedRouteStateByTargetSpec,
  type ServerAppliedRouteStateRepository,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
  UpsertServerAppliedRouteDesiredStateSpec,
  UpsertSourceLinkSpec,
} from "@appaloft/application";
import { err, ok } from "@appaloft/core";
import {
  createDatabase,
  createMigrator,
  PgServerAppliedRouteStateRepository,
  PgSourceLinkRepository,
} from "@appaloft/persistence-pg";
import { adoptLegacyPgliteState } from "../src/legacy-pglite-state-adoption";

const noopLogger: AppLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function createCliSourceLinkStore(repository: SourceLinkRepository): CliSourceLinkStore {
  return {
    read(sourceFingerprint) {
      return repository.findOne(SourceLinkBySourceFingerprintSpec.create(sourceFingerprint));
    },
    async requireSameTargetOrMissing(sourceFingerprint, target) {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(sourceFingerprint),
      );
      if (existing.isErr() || !existing.value) {
        return existing;
      }
      const record = existing.value;
      if (
        record.projectId === target.projectId &&
        record.environmentId === target.environmentId &&
        record.resourceId === target.resourceId &&
        record.serverId === target.serverId &&
        record.destinationId === target.destinationId
      ) {
        return existing;
      }

      throw new Error("Unexpected source-link retarget conflict in shell adoption test");
    },
    async createIfMissing(input) {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
      );
      if (existing.isErr()) {
        return err(existing.error);
      }
      if (existing.value) {
        return ok(existing.value);
      }

      const record: SourceLinkRecord = {
        sourceFingerprint: input.sourceFingerprint,
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
        resourceId: input.target.resourceId,
        updatedAt: input.updatedAt,
        ...(input.target.serverId ? { serverId: input.target.serverId } : {}),
        ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
      };
      return repository.upsert(record, UpsertSourceLinkSpec.fromRecord(record));
    },
  };
}

function createCliServerAppliedRouteStore(
  repository: ServerAppliedRouteStateRepository,
): CliServerAppliedRouteStateStore {
  return {
    upsertDesired(input) {
      const record = {
        routeSetId: [
          input.target.projectId,
          input.target.environmentId,
          input.target.resourceId,
          input.target.serverId,
          input.target.destinationId ?? "default",
        ].join(":"),
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
        resourceId: input.target.resourceId,
        serverId: input.target.serverId,
        ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
        ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
        domains: input.domains,
        status: "desired" as const,
        updatedAt: input.updatedAt,
      };
      return repository.upsert(record, UpsertServerAppliedRouteDesiredStateSpec.fromRecord(record));
    },
    read(target) {
      return repository.findOne(ServerAppliedRouteStateByTargetSpec.create(target));
    },
    markApplied(input) {
      const routeSetId =
        input.routeSetId ??
        [
          input.target.projectId,
          input.target.environmentId,
          input.target.resourceId,
          input.target.serverId,
          input.target.destinationId ?? "default",
        ].join(":");

      return repository.updateOne(
        ServerAppliedRouteStateByRouteSetIdSpec.create(routeSetId),
        MarkServerAppliedRouteAppliedSpec.create({
          deploymentId: input.deploymentId,
          updatedAt: input.updatedAt,
          ...(input.providerKey ? { providerKey: input.providerKey } : {}),
          ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
        }),
      );
    },
    markFailed(input) {
      const routeSetId =
        input.routeSetId ??
        [
          input.target.projectId,
          input.target.environmentId,
          input.target.resourceId,
          input.target.serverId,
          input.target.destinationId ?? "default",
        ].join(":");

      return repository.updateOne(
        ServerAppliedRouteStateByRouteSetIdSpec.create(routeSetId),
        MarkServerAppliedRouteFailedSpec.create({
          deploymentId: input.deploymentId,
          updatedAt: input.updatedAt,
          phase: input.phase,
          errorCode: input.errorCode,
          retryable: input.retryable,
          ...(input.message ? { message: input.message } : {}),
          ...(input.providerKey ? { providerKey: input.providerKey } : {}),
          ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
        }),
      );
    },
    deleteDesired(target) {
      return repository.deleteOne(ServerAppliedRouteStateByTargetSpec.create(target));
    },
    deleteDesiredBySourceFingerprint(sourceFingerprint) {
      return repository.deleteMany(
        ServerAppliedRouteStateBySourceFingerprintSpec.create(sourceFingerprint),
      );
    },
  };
}

async function seedSourceLinkContext(
  db: Awaited<ReturnType<typeof createDatabase>>["db"],
  suffix: string,
): Promise<{
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
}> {
  const projectId = `prj_source_${suffix}`;
  const serverId = `srv_source_${suffix}`;
  const destinationId = `dst_source_${suffix}`;
  const environmentId = `env_source_${suffix}`;
  const resourceId = `res_source_${suffix}`;
  const createdAt = "2026-01-01T00:00:00.000Z";

  await db
    .insertInto("projects")
    .values({
      id: projectId,
      name: `Source ${suffix}`,
      slug: `source-${suffix}`,
      description: null,
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("servers")
    .values({
      id: serverId,
      name: `source-${suffix}`,
      host: "127.0.0.1",
      port: 22,
      provider_key: "generic-ssh",
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
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("destinations")
    .values({
      id: destinationId,
      server_id: serverId,
      name: "default",
      kind: "generic",
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("environments")
    .values({
      id: environmentId,
      project_id: projectId,
      name: "production",
      kind: "production",
      parent_environment_id: null,
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("resources")
    .values({
      id: resourceId,
      project_id: projectId,
      environment_id: environmentId,
      destination_id: destinationId,
      name: "web",
      slug: `web-${suffix}`,
      kind: "application",
      description: null,
      services: [],
      source_binding: null,
      runtime_profile: null,
      network_profile: null,
      lifecycle_status: "active",
      archived_at: null,
      archive_reason: null,
      deleted_at: null,
      created_at: createdAt,
    })
    .execute();

  return {
    projectId,
    environmentId,
    resourceId,
    serverId,
    destinationId,
  };
}

describe("legacy PGlite state adoption", () => {
  test("[CONFIG-FILE-STATE-014] shell adopts legacy source-link and route files into PG/PGlite", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-shell-legacy-state-"));
    const dataDir = join(workspaceDir, ".appaloft", "data");
    const pgliteDataDir = join(dataDir, "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "legacy_adopt");
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      const legacySourceLinkStore = new FileSystemSourceLinkStore(dataDir);
      const legacyRouteStore = new FileSystemServerAppliedRouteDesiredStateStore(dataDir);
      const sourceLinkRepository = new PgSourceLinkRepository(database.db);
      const routeRepository = new PgServerAppliedRouteStateRepository(database.db);
      const sourceLinkStore = createCliSourceLinkStore(sourceLinkRepository);
      const routeStore = createCliServerAppliedRouteStore(routeRepository);

      const createdSourceLink = await legacySourceLinkStore.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(createdSourceLink.isOk()).toBe(true);

      const createdRoute = await legacyRouteStore.upsertDesired({
        target,
        sourceFingerprint,
        updatedAt: "2026-01-01T00:02:00.000Z",
        domains: [
          {
            host: "www.appaloft.com",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      expect(createdRoute.isOk()).toBe(true);

      const appliedLegacyRoute = await legacyRouteStore.markApplied({
        target,
        routeSetId: createdRoute._unsafeUnwrap().routeSetId,
        deploymentId: "dep_legacy_apply",
        updatedAt: "2026-01-01T00:03:00.000Z",
        providerKey: "traefik",
        proxyKind: "traefik",
      });
      expect(appliedLegacyRoute.isOk()).toBe(true);

      const summary = await adoptLegacyPgliteState({
        pgliteDataDir,
        sourceLinkStore,
        serverAppliedRouteStore: routeStore,
        logger: noopLogger,
      });

      expect(summary).toEqual({
        importedSourceLinks: 1,
        prunedSourceLinks: 0,
        importedServerAppliedRoutes: 1,
        prunedServerAppliedRoutes: 0,
      });

      const adoptedSourceLink = await sourceLinkStore.read(sourceFingerprint);
      const adoptedRoute = await routeStore.read(target);
      const remainingLegacySourceLinks = await legacySourceLinkStore.list();
      const remainingLegacyRoutes = await legacyRouteStore.list();

      expect(adoptedSourceLink.isOk()).toBe(true);
      expect(adoptedSourceLink._unsafeUnwrap()).toMatchObject({
        sourceFingerprint,
        ...target,
      });
      expect(adoptedRoute.isOk()).toBe(true);
      expect(adoptedRoute._unsafeUnwrap()).toMatchObject({
        routeSetId: createdRoute._unsafeUnwrap().routeSetId,
        sourceFingerprint,
        status: "applied",
        lastApplied: {
          deploymentId: "dep_legacy_apply",
          providerKey: "traefik",
          proxyKind: "traefik",
        },
      });
      expect(remainingLegacySourceLinks.isOk()).toBe(true);
      expect(remainingLegacySourceLinks._unsafeUnwrap()).toEqual([]);
      expect(remainingLegacyRoutes.isOk()).toBe(true);
      expect(remainingLegacyRoutes._unsafeUnwrap()).toEqual([]);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[CONFIG-FILE-STATE-015][SOURCE-LINK-STATE-020] shell prunes stale legacy file state when PG already owns the fingerprint", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-shell-legacy-state-"));
    const dataDir = join(workspaceDir, ".appaloft", "data");
    const pgliteDataDir = join(dataDir, "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const staleTarget = await seedSourceLinkContext(database.db, "legacy_stale");
      const currentTarget = await seedSourceLinkContext(database.db, "legacy_current");
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      const legacySourceLinkStore = new FileSystemSourceLinkStore(dataDir);
      const legacyRouteStore = new FileSystemServerAppliedRouteDesiredStateStore(dataDir);
      const sourceLinkRepository = new PgSourceLinkRepository(database.db);
      const routeRepository = new PgServerAppliedRouteStateRepository(database.db);
      const sourceLinkStore = createCliSourceLinkStore(sourceLinkRepository);
      const routeStore = createCliServerAppliedRouteStore(routeRepository);

      const currentSourceLink = await sourceLinkStore.createIfMissing({
        sourceFingerprint,
        target: currentTarget,
        updatedAt: "2026-01-01T00:10:00.000Z",
      });
      expect(currentSourceLink.isOk()).toBe(true);

      const currentRoute = await routeStore.upsertDesired({
        target: currentTarget,
        sourceFingerprint,
        updatedAt: "2026-01-01T00:11:00.000Z",
        domains: [
          {
            host: "www.appaloft.com",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      expect(currentRoute.isOk()).toBe(true);

      const staleSourceLink = await legacySourceLinkStore.createIfMissing({
        sourceFingerprint,
        target: staleTarget,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(staleSourceLink.isOk()).toBe(true);

      const staleRoute = await legacyRouteStore.upsertDesired({
        target: staleTarget,
        sourceFingerprint,
        updatedAt: "2026-01-01T00:02:00.000Z",
        domains: [
          {
            host: "old-www.appaloft.com",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      expect(staleRoute.isOk()).toBe(true);

      const summary = await adoptLegacyPgliteState({
        pgliteDataDir,
        sourceLinkStore,
        serverAppliedRouteStore: routeStore,
        logger: noopLogger,
      });

      expect(summary).toEqual({
        importedSourceLinks: 0,
        prunedSourceLinks: 1,
        importedServerAppliedRoutes: 0,
        prunedServerAppliedRoutes: 1,
      });

      const retainedSourceLink = await sourceLinkStore.read(sourceFingerprint);
      const retainedRoute = await routeStore.read(currentTarget);
      const prunedStaleRoute = await routeStore.read(staleTarget);
      const remainingLegacySourceLinks = await legacySourceLinkStore.list();
      const remainingLegacyRoutes = await legacyRouteStore.list();

      expect(retainedSourceLink.isOk()).toBe(true);
      expect(retainedSourceLink._unsafeUnwrap()).toMatchObject(currentTarget);
      expect(retainedRoute.isOk()).toBe(true);
      expect(retainedRoute._unsafeUnwrap()).toMatchObject({
        routeSetId: currentRoute._unsafeUnwrap().routeSetId,
        sourceFingerprint,
      });
      expect(prunedStaleRoute.isOk()).toBe(true);
      expect(prunedStaleRoute._unsafeUnwrap()).toBeNull();
      expect(remainingLegacySourceLinks.isOk()).toBe(true);
      expect(remainingLegacySourceLinks._unsafeUnwrap()).toEqual([]);
      expect(remainingLegacyRoutes.isOk()).toBe(true);
      expect(remainingLegacyRoutes._unsafeUnwrap()).toEqual([]);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);
});
