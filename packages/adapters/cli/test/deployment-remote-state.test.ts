import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileSystemRemoteStateLifecycle,
  FileSystemServerAppliedRouteDesiredStateStore,
  FileSystemSourceLinkStore,
  remoteStatePathExists,
} from "../src/commands/deployment-remote-state";

async function tempStateRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "appaloft-remote-state-"));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

describe("CLI remote state lifecycle", () => {
  test("[CONFIG-FILE-STATE-002] remote state ensure prepares durable root", async () => {
    const root = await tempStateRoot();
    try {
      const lifecycle = new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        now: () => new Date("2026-04-19T00:00:00.000Z"),
      });

      const prepared = await lifecycle.prepare();

      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) {
        throw new Error(prepared.error.message);
      }
      expect(await remoteStatePathExists(join(root, "pglite"))).toBe(true);
      expect(await remoteStatePathExists(join(root, "locks", "mutation.lock"))).toBe(true);
      expect(await remoteStatePathExists(join(root, "backups"))).toBe(true);
      expect(await remoteStatePathExists(join(root, "journals"))).toBe(true);
      expect(await remoteStatePathExists(join(root, "source-links"))).toBe(true);
      expect(await remoteStatePathExists(join(root, "server-applied-routes"))).toBe(true);
      expect(await readJson<{ version: number }>(join(root, "schema-version.json"))).toMatchObject({
        version: 1,
      });

      const released = await prepared.value.release();
      expect(released.isOk()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-003] remote state lock serializes concurrent deploys", async () => {
    const root = await tempStateRoot();
    try {
      const first = new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        owner: "first",
        correlationId: "run_1",
      });
      const second = new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        owner: "second",
        correlationId: "run_2",
      });

      const firstPrepared = await first.prepare();
      const secondPrepared = await second.prepare();

      expect(firstPrepared.isOk()).toBe(true);
      expect(secondPrepared.isErr()).toBe(true);
      if (secondPrepared.isOk()) {
        throw new Error("Expected second remote state prepare to fail while lock is held");
      }
      expect(secondPrepared.error).toMatchObject({
        code: "infra_error",
        details: {
          phase: "remote-state-lock",
          lockOwner: "first",
          correlationId: "run_1",
        },
      });
      if (firstPrepared.isOk()) {
        await firstPrepared.value.release();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-004] remote migrations run before workflow state resolution", async () => {
    const root = await tempStateRoot();
    try {
      await writeFile(join(root, "schema-version.json"), JSON.stringify({ version: 0 }));
      const lifecycle = new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        schemaVersion: 2,
        now: () => new Date("2026-04-19T00:00:00.000Z"),
      });

      const prepared = await lifecycle.prepare();

      expect(prepared.isOk()).toBe(true);
      if (prepared.isErr()) {
        throw new Error(prepared.error.message);
      }
      expect(prepared.value.backupPath).toContain("schema-0-to-2");
      expect(prepared.value.journalPath).toContain("schema-0-to-2");
      expect(await readJson<{ version: number }>(join(root, "schema-version.json"))).toMatchObject({
        version: 2,
      });
      expect(await remoteStatePathExists(prepared.value.backupPath ?? "")).toBe(true);
      expect(await remoteStatePathExists(prepared.value.journalPath ?? "")).toBe(true);
      await prepared.value.release();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-005] remote migration recovery marker is written on failure", async () => {
    const root = await tempStateRoot();
    try {
      await writeFile(join(root, "schema-version.json"), JSON.stringify({ version: 0 }));
      const lifecycle = new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        schemaVersion: 2,
        failMigration: true,
      });

      const prepared = await lifecycle.prepare();
      const recovery = await lifecycle.recoveryStatus();

      expect(prepared.isErr()).toBe(true);
      if (prepared.isOk()) {
        throw new Error("Expected migration failure");
      }
      expect(prepared.error).toMatchObject({
        code: "infra_error",
        details: {
          phase: "remote-state-migration",
        },
      });
      expect(recovery.isOk()).toBe(true);
      if (recovery.isErr()) {
        throw new Error(recovery.error.message);
      }
      expect(recovery.value).toMatchObject({
        exists: true,
        phase: "remote-state-recovery",
      });
      expect(await remoteStatePathExists(join(root, "locks", "mutation.lock"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-STATE-006] abandoned lock recovery is visible", async () => {
    const root = await tempStateRoot();
    try {
      await new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        owner: "abandoned",
        correlationId: "run_old",
      }).prepare();

      const prepared = await new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        owner: "next",
        correlationId: "run_new",
      }).prepare();

      expect(prepared.isErr()).toBe(true);
      if (prepared.isOk()) {
        throw new Error("Expected abandoned lock to block next prepare");
      }
      expect(prepared.error.details).toMatchObject({
        phase: "remote-state-lock",
        lockOwner: "abandoned",
        correlationId: "run_old",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("CLI server-applied route desired state", () => {
  test("[CONFIG-FILE-DOMAIN-001] server-applied route desired state persists in remote state", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemServerAppliedRouteDesiredStateStore(root);
      const target = {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      };

      const persisted = await store.upsertDesired({
        target,
        sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        updatedAt: "2026-04-19T00:00:00.000Z",
        domains: [
          {
            host: "www.example.com",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      });
      const readBack = await store.read(target);

      expect(persisted.isOk()).toBe(true);
      expect(readBack.isOk()).toBe(true);
      if (persisted.isErr() || readBack.isErr()) {
        throw new Error("Expected server-applied route state persistence to succeed");
      }
      expect(persisted.value).toMatchObject({
        routeSetId: "proj_1:env_1:res_1:srv_1:default",
        sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        status: "desired",
        domains: [
          {
            host: "www.example.com",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      });
      expect(readBack.value).toEqual(persisted.value);
      expect(await remoteStatePathExists(join(root, "server-applied-routes"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-DOMAIN-001] server-applied route state falls back to default destination scope", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemServerAppliedRouteDesiredStateStore(root);
      const defaultTarget = {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      };
      const destinationTarget = {
        ...defaultTarget,
        destinationId: "dst_1",
      };
      await store.upsertDesired({
        target: defaultTarget,
        updatedAt: "2026-04-19T00:00:00.000Z",
        domains: [
          {
            host: "www.example.com",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      });

      const readWithDestination = await store.read(destinationTarget);
      const appliedWithDestination = await store.markApplied({
        target: destinationTarget,
        deploymentId: "dep_1",
        updatedAt: "2026-04-19T00:02:00.000Z",
        routeSetId: "proj_1:env_1:res_1:srv_1:default",
        providerKey: "traefik",
        proxyKind: "traefik",
      });
      const readDefault = await store.read(defaultTarget);

      expect(readWithDestination.isOk()).toBe(true);
      expect(appliedWithDestination.isOk()).toBe(true);
      expect(readDefault.isOk()).toBe(true);
      if (readWithDestination.isErr() || appliedWithDestination.isErr() || readDefault.isErr()) {
        throw new Error("Expected default-destination route state fallback to succeed");
      }
      expect(readWithDestination.value).toMatchObject({
        routeSetId: "proj_1:env_1:res_1:srv_1:default",
        domains: [
          {
            host: "www.example.com",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      });
      expect(appliedWithDestination.value).toMatchObject({
        routeSetId: "proj_1:env_1:res_1:srv_1:default",
        status: "applied",
        lastApplied: {
          deploymentId: "dep_1",
          providerKey: "traefik",
          proxyKind: "traefik",
        },
      });
      expect(readDefault.value).toEqual(appliedWithDestination.value);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-DOMAIN-001] destination-scoped route state takes precedence over default scope", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemServerAppliedRouteDesiredStateStore(root);
      const defaultTarget = {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      };
      const destinationTarget = {
        ...defaultTarget,
        destinationId: "dst_1",
      };
      await store.upsertDesired({
        target: defaultTarget,
        updatedAt: "2026-04-19T00:00:00.000Z",
        domains: [
          {
            host: "default.example.com",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      });
      await store.upsertDesired({
        target: destinationTarget,
        updatedAt: "2026-04-19T00:01:00.000Z",
        domains: [
          {
            host: "destination.example.com",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      });

      const readWithDestination = await store.read(destinationTarget);

      expect(readWithDestination.isOk()).toBe(true);
      if (readWithDestination.isErr()) {
        throw new Error("Expected destination-scoped route state read to succeed");
      }
      expect(readWithDestination.value).toMatchObject({
        routeSetId: "proj_1:env_1:res_1:srv_1:dst_1",
        domains: [
          {
            host: "destination.example.com",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-DOMAIN-007] server-applied route desired state preserves canonical redirect metadata", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemServerAppliedRouteDesiredStateStore(root);
      const target = {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      };
      const domains = [
        {
          host: "example.com",
          pathPrefix: "/",
          tlsMode: "auto" as const,
        },
        {
          host: "www.example.com",
          pathPrefix: "/",
          tlsMode: "auto" as const,
          redirectTo: "example.com",
          redirectStatus: 308 as const,
        },
      ];

      const persisted = await store.upsertDesired({
        target,
        updatedAt: "2026-04-19T00:00:00.000Z",
        domains,
      });
      const readBack = await store.read(target);

      expect(persisted.isOk()).toBe(true);
      expect(readBack.isOk()).toBe(true);
      if (persisted.isErr() || readBack.isErr()) {
        throw new Error("Expected canonical redirect route state persistence to succeed");
      }
      expect(persisted.value.domains).toEqual(domains);
      expect(readBack.value?.domains).toEqual(domains);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[EDGE-PROXY-ROUTE-005] server-applied route state records applied status", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemServerAppliedRouteDesiredStateStore(root);
      const target = {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      };
      await store.upsertDesired({
        target,
        updatedAt: "2026-04-19T00:00:00.000Z",
        domains: [
          {
            host: "www.example.com",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });

      const applied = await store.markApplied({
        target,
        deploymentId: "dep_1",
        updatedAt: "2026-04-19T00:02:00.000Z",
        routeSetId: "proj_1:env_1:res_1:srv_1:default",
        providerKey: "traefik",
        proxyKind: "traefik",
      });
      const readBack = await store.read(target);

      expect(applied.isOk()).toBe(true);
      expect(readBack.isOk()).toBe(true);
      if (applied.isErr() || readBack.isErr()) {
        throw new Error("Expected server-applied route applied status persistence to succeed");
      }
      expect(readBack.value).toEqual(applied.value);
      expect(applied.value).toMatchObject({
        status: "applied",
        updatedAt: "2026-04-19T00:02:00.000Z",
        lastApplied: {
          deploymentId: "dep_1",
          appliedAt: "2026-04-19T00:02:00.000Z",
          providerKey: "traefik",
          proxyKind: "traefik",
        },
      });
      expect(applied.value?.lastFailure).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[EDGE-PROXY-ROUTE-007] server-applied route state records failed status", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemServerAppliedRouteDesiredStateStore(root);
      const target = {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      };
      await store.upsertDesired({
        target,
        updatedAt: "2026-04-19T00:00:00.000Z",
        domains: [
          {
            host: "www.example.com",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });

      const failed = await store.markFailed({
        target,
        deploymentId: "dep_1",
        updatedAt: "2026-04-19T00:03:00.000Z",
        routeSetId: "proj_1:env_1:res_1:srv_1:default",
        phase: "public-route-verification",
        errorCode: "ssh_public_route_health_check_failed",
        message: "Public route did not return healthy",
        retryable: true,
        proxyKind: "traefik",
      });
      const readBack = await store.read(target);

      expect(failed.isOk()).toBe(true);
      expect(readBack.isOk()).toBe(true);
      if (failed.isErr() || readBack.isErr()) {
        throw new Error("Expected server-applied route failed status persistence to succeed");
      }
      expect(readBack.value).toEqual(failed.value);
      expect(failed.value).toMatchObject({
        status: "failed",
        updatedAt: "2026-04-19T00:03:00.000Z",
        lastFailure: {
          deploymentId: "dep_1",
          failedAt: "2026-04-19T00:03:00.000Z",
          phase: "public-route-verification",
          errorCode: "ssh_public_route_health_check_failed",
          message: "Public route did not return healthy",
          retryable: true,
          proxyKind: "traefik",
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("CLI source link state", () => {
  test("[SOURCE-LINK-STATE-004] first-run config deploy creates link", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);

      const link = await store.createIfMissing({
        sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        updatedAt: "2026-04-19T00:00:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
          serverId: "srv_1",
        },
      });

      expect(link.isOk()).toBe(true);
      if (link.isErr()) {
        throw new Error(link.error.message);
      }
      expect(link.value).toMatchObject({
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-005] repeated config deploy reuses link", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      await store.createIfMissing({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:00:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
        },
      });

      const repeated = await store.createIfMissing({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:01:00.000Z",
        target: {
          projectId: "proj_2",
          environmentId: "env_2",
          resourceId: "res_2",
        },
      });

      expect(repeated.isOk()).toBe(true);
      if (repeated.isErr()) {
        throw new Error(repeated.error.message);
      }
      expect(repeated.value).toMatchObject({
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-006] config cannot retarget link", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      await store.createIfMissing({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:00:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
        },
      });

      const retarget = await store.requireSameTargetOrMissing(sourceFingerprint, {
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_2",
      });

      expect(retarget.isErr()).toBe(true);
      if (retarget.isOk()) {
        throw new Error("Expected retarget to fail");
      }
      expect(retarget.error).toMatchObject({
        code: "validation_error",
        details: {
          phase: "source-link-resolution",
          resourceId: "res_1",
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-007] ambiguous fingerprint requires explicit selection", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);

      const link = await store.read("https://user:secret@example.test/repo.git");

      expect(link.isErr()).toBe(true);
      if (link.isOk()) {
        throw new Error("Expected unsafe fingerprint to fail");
      }
      expect(link.error).toMatchObject({
        code: "validation_error",
        details: {
          phase: "source-link-validation",
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-008] relink source to another resource", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      await store.createIfMissing({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:00:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
        },
      });

      const relinked = await store.relink({
        sourceFingerprint,
        expectedCurrentResourceId: "res_1",
        updatedAt: "2026-04-19T00:02:00.000Z",
        reason: "move to canonical resource",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_2",
        },
      });

      expect(relinked.isOk()).toBe(true);
      if (relinked.isErr()) {
        throw new Error(relinked.error.message);
      }
      expect(relinked.value).toMatchObject({
        resourceId: "res_2",
        reason: "move to canonical resource",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-009] relink idempotent same target", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      await store.createIfMissing({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:00:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
        },
      });

      const relinked = await store.relink({
        sourceFingerprint,
        expectedCurrentResourceId: "res_1",
        updatedAt: "2026-04-19T00:02:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
        },
      });

      expect(relinked.isOk()).toBe(true);
      if (relinked.isErr()) {
        throw new Error(relinked.error.message);
      }
      expect(relinked.value.updatedAt).toBe("2026-04-19T00:00:00.000Z");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-010] relink optimistic guard conflict rejects without mutation", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      await store.createIfMissing({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:00:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
        },
      });

      const relinked = await store.relink({
        sourceFingerprint,
        expectedCurrentResourceId: "res_other",
        updatedAt: "2026-04-19T00:02:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_2",
        },
      });
      const existing = await store.read(sourceFingerprint);

      expect(relinked.isErr()).toBe(true);
      if (relinked.isOk()) {
        throw new Error("Expected guard conflict");
      }
      expect(relinked.error).toMatchObject({
        code: "source_link_conflict",
        details: {
          phase: "source-link-resolution",
          actualResourceId: "res_1",
        },
      });
      expect(existing.isOk()).toBe(true);
      if (existing.isErr()) {
        throw new Error(existing.error.message);
      }
      expect(existing.value?.resourceId).toBe("res_1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-011] relink validates context", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      await store.createIfMissing({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:00:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
        },
      });

      const relinked = await store.relink({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:02:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
          destinationId: "dest_1",
        },
      });

      expect(relinked.isErr()).toBe(true);
      if (relinked.isOk()) {
        throw new Error("Expected context mismatch");
      }
      expect(relinked.error).toMatchObject({
        code: "source_link_context_mismatch",
        details: {
          phase: "source-link-admission",
          destinationId: "dest_1",
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-012] relink uses remote state lock", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      await store.createIfMissing({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:00:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
        },
      });
      const active = await new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        owner: "deploy",
        correlationId: "run_active",
      }).prepare();
      const relinkLifecycle = await new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        owner: "relink",
        correlationId: "run_relink",
      }).prepare();
      const existing = await store.read(sourceFingerprint);

      expect(active.isOk()).toBe(true);
      expect(relinkLifecycle.isErr()).toBe(true);
      if (relinkLifecycle.isOk()) {
        throw new Error("Expected relink lock acquisition to fail");
      }
      expect(relinkLifecycle.error).toMatchObject({
        code: "infra_error",
        details: {
          phase: "remote-state-lock",
          lockOwner: "deploy",
          correlationId: "run_active",
        },
      });
      expect(existing.isOk()).toBe(true);
      if (existing.isErr()) {
        throw new Error(existing.error.message);
      }
      expect(existing.value?.resourceId).toBe("res_1");
      if (active.isOk()) {
        await active.value.release();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-013] source link diagnostics are safe", async () => {
    const root = await tempStateRoot();
    try {
      const store = new FileSystemSourceLinkStore(root);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amain";
      await store.createIfMissing({
        sourceFingerprint,
        updatedAt: "2026-04-19T00:00:00.000Z",
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
          serverId: "srv_1",
        },
      });

      const diagnostics = await store.diagnostics(sourceFingerprint);
      const serialized = JSON.stringify(diagnostics);

      expect(diagnostics.isOk()).toBe(true);
      if (diagnostics.isErr()) {
        throw new Error(diagnostics.error.message);
      }
      expect(diagnostics.value).toMatchObject({
        sourceFingerprint,
        projectId: "proj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      });
      expect(serialized).not.toContain("OPENSSH");
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("://user:");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("[SOURCE-LINK-STATE-014] recovery marker visible", async () => {
    const root = await tempStateRoot();
    try {
      const lifecycle = new FileSystemRemoteStateLifecycle({
        dataRoot: root,
        schemaVersion: 2,
        failMigration: true,
      });

      await lifecycle.prepare();
      const recovery = await lifecycle.recoveryStatus();

      expect(recovery.isOk()).toBe(true);
      if (recovery.isErr()) {
        throw new Error(recovery.error.message);
      }
      expect(recovery.value).toMatchObject({
        exists: true,
        phase: "remote-state-recovery",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
