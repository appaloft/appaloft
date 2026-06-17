import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import { FixedClock, MemoryEnvironmentProfileDecisionStore } from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src";
import {
  type DomainBindingReadModel,
  type EnvironmentReadModel,
  type ResourceDependencyBindingReadModel,
  type ResourceReadModel,
  type StorageVolumeReadModel,
} from "../src/ports";
import { DiffEnvironmentProfileQueryService } from "../src/use-cases";

const sourceEnvironment = {
  id: "env_prod",
  projectId: "prj_demo",
  name: "production",
  kind: "production",
  lifecycleStatus: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  maskedVariables: [
    {
      key: "DATABASE_URL",
      value: "raw-production-secret",
      scope: "environment",
      exposure: "runtime",
      isSecret: true,
      kind: "secret",
    },
    {
      key: "FEATURE_FLAG",
      value: "true",
      scope: "environment",
      exposure: "runtime",
      isSecret: false,
      kind: "plain-config",
    },
  ],
} satisfies Awaited<ReturnType<EnvironmentReadModel["findOne"]>>;

const targetEnvironment = {
  ...sourceEnvironment,
  id: "env_staging",
  name: "staging",
  kind: "staging",
  maskedVariables: [
    {
      key: "DATABASE_URL",
      value: "raw-staging-secret",
      scope: "environment",
      exposure: "runtime",
      isSecret: true,
      kind: "secret",
    },
    {
      key: "FEATURE_FLAG",
      value: "false",
      scope: "environment",
      exposure: "runtime",
      isSecret: false,
      kind: "plain-config",
    },
    {
      key: "LOG_LEVEL",
      value: "debug",
      scope: "environment",
      exposure: "runtime",
      isSecret: false,
      kind: "plain-config",
    },
  ],
} satisfies Awaited<ReturnType<EnvironmentReadModel["findOne"]>>;

const sourceResources = [
  {
    id: "res_prod_web",
    projectId: "prj_demo",
    environmentId: "env_prod",
    destinationId: "dst_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    createdAt: "2026-01-01T00:00:01.000Z",
    services: [{ name: "web", kind: "web" }],
    networkProfile: {
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    },
    deploymentCount: 1,
  },
  {
    id: "res_prod_worker",
    projectId: "prj_demo",
    environmentId: "env_prod",
    destinationId: "dst_demo",
    name: "Worker",
    slug: "worker",
    kind: "worker",
    createdAt: "2026-01-01T00:00:02.000Z",
    services: [{ name: "worker", kind: "worker" }],
    deploymentCount: 1,
  },
] satisfies Awaited<ReturnType<ResourceReadModel["list"]>>;

const targetResources = [
  {
    id: "res_staging_web",
    projectId: "prj_demo",
    environmentId: "env_staging",
    destinationId: "dst_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    createdAt: "2026-01-01T00:00:01.000Z",
    services: [{ name: "web", kind: "web" }],
    networkProfile: {
      internalPort: 4000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    },
    deploymentCount: 1,
  },
  {
    id: "res_staging_api",
    projectId: "prj_demo",
    environmentId: "env_staging",
    destinationId: "dst_demo",
    name: "API",
    slug: "api",
    kind: "application",
    createdAt: "2026-01-01T00:00:03.000Z",
    services: [{ name: "api", kind: "web" }],
    deploymentCount: 0,
  },
] satisfies Awaited<ReturnType<ResourceReadModel["list"]>>;

const environmentReadModel = {
  async count() {
    return 2;
  },
  async list() {
    return [sourceEnvironment, targetEnvironment];
  },
  async findOne(_context, spec) {
    const id = (spec as unknown as { id?: { value: string } }).id?.value;
    return (
      [sourceEnvironment, targetEnvironment].find((environment) => environment.id === id) ?? null
    );
  },
} satisfies EnvironmentReadModel;

const resourceReadModel = {
  async count() {
    return 2;
  },
  async list(_context, input) {
    if (input?.environmentId === "env_prod") {
      return sourceResources;
    }
    if (input?.environmentId === "env_staging") {
      return targetResources;
    }
    return [];
  },
  async findOne() {
    return null;
  },
} satisfies ResourceReadModel;

const resourceDependencyBindingReadModel = {
  async list(_context, input) {
    if (input?.resourceId === "res_prod_web") {
      return ok([
        {
          id: "rbind_prod_pg",
          projectId: "prj_demo",
          environmentId: "env_prod",
          resourceId: "res_prod_web",
          dependencyResourceId: "rsi_prod_pg",
          dependencyResourceName: "Main DB",
          dependencyResourceSlug: "main-db",
          kind: "postgres",
          sourceMode: "appaloft-managed",
          providerKey: "appaloft-managed-postgres",
          providerManaged: true,
          lifecycleStatus: "ready",
          target: {
            targetName: "DATABASE_URL",
            scope: "environment",
            injectionMode: "env",
            secretRef: "secret://dependency/postgres/rsi_prod_pg",
          },
          bindingReadiness: { status: "ready" },
          snapshotReadiness: { status: "ready" },
          status: "active",
          createdAt: "2026-01-01T00:00:04.000Z",
        },
      ]);
    }
    return ok([]);
  },
  async findOne() {
    return ok(null);
  },
} satisfies ResourceDependencyBindingReadModel;

const domainBindingReadModel = {
  async list(_context, input) {
    if (input?.resourceId === "res_prod_web") {
      return [
        {
          id: "dom_prod_web",
          projectId: "prj_demo",
          environmentId: "env_prod",
          resourceId: "res_prod_web",
          serverId: "srv_demo",
          destinationId: "dst_demo",
          domainName: "www.example.com",
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "auto",
          certificatePolicy: "auto",
          status: "ready",
          verificationAttemptCount: 1,
          createdAt: "2026-01-01T00:00:05.000Z",
        },
      ];
    }
    if (input?.resourceId === "res_staging_web") {
      return [
        {
          id: "dom_staging_web",
          projectId: "prj_demo",
          environmentId: "env_staging",
          resourceId: "res_staging_web",
          serverId: "srv_demo",
          destinationId: "dst_demo",
          domainName: "staging.example.com",
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "auto",
          certificatePolicy: "auto",
          status: "ready",
          verificationAttemptCount: 1,
          createdAt: "2026-01-01T00:00:06.000Z",
        },
      ];
    }
    return [];
  },
} satisfies DomainBindingReadModel;

const storageVolumeReadModel = {
  async list(_context, input) {
    if (input?.environmentId === "env_prod") {
      return [
        {
          id: "stv_prod_uploads",
          projectId: "prj_demo",
          environmentId: "env_prod",
          name: "Uploads",
          slug: "uploads",
          kind: "named-volume",
          lifecycleStatus: "active",
          attachmentCount: 1,
          attachments: [
            {
              attachmentId: "rsta_prod_uploads",
              resourceId: "res_prod_web",
              destinationPath: "/app/uploads",
              mountMode: "read-write",
              dataFormat: "filesystem",
              applicationDataLabel: "user uploads",
              attachedAt: "2026-01-01T00:00:07.000Z",
            },
          ],
          createdAt: "2026-01-01T00:00:07.000Z",
        },
      ];
    }
    return [];
  },
  async findOne() {
    return null;
  },
  async countAttachments() {
    return 0;
  },
} satisfies StorageVolumeReadModel;

function createService(decisions = new MemoryEnvironmentProfileDecisionStore()) {
  return new DiffEnvironmentProfileQueryService(
    environmentReadModel,
    resourceReadModel,
    resourceDependencyBindingReadModel,
    new FixedClock("2026-01-01T00:00:10.000Z"),
    domainBindingReadModel,
    storageVolumeReadModel,
    decisions,
  );
}

describe("environment profile diff query", () => {
  test("[ENV-PROFILE-DUP-008] compares profile shape and masks secret values", async () => {
    const decisions = new MemoryEnvironmentProfileDecisionStore();
    await decisions.recordPending(
      toRepositoryContext(
        createExecutionContext({ requestId: "req_seed_pending", entrypoint: "system" }),
      ),
      {
        id: "epd_env_staging_storage_rsta_prod_uploads",
        projectId: "prj_demo",
        environmentId: "env_staging",
        resourceId: "res_staging_web",
        kind: "storage",
        sourceId: "rsta_prod_uploads",
        reason: "Storage data requires a target decision.",
        createdAt: "2026-01-01T00:00:08.000Z",
        sourceEnvironmentId: "env_prod",
        sourceResourceId: "res_prod_web",
        decision: "defer",
      },
    );

    const result = await createService(decisions).execute(
      createExecutionContext({ requestId: "req_env_profile_diff", entrypoint: "system" }),
      {
        environmentId: "env_prod",
        targetEnvironmentId: "env_staging",
      },
    );

    expect(result.isOk()).toBe(true);
    const diff = result._unsafeUnwrap();
    expect(diff).toMatchObject({
      schemaVersion: "environments.diff-profile/v1",
      sourceEnvironment: { id: "env_prod", name: "production" },
      targetEnvironment: { id: "env_staging", name: "staging" },
      generatedAt: "2026-01-01T00:00:10.000Z",
    });
    expect(JSON.stringify(diff)).not.toContain("raw-production-secret");
    expect(JSON.stringify(diff)).not.toContain("raw-staging-secret");
    expect(diff.entries).toContainEqual(
      expect.objectContaining({
        section: "variable",
        key: "environment:runtime:FEATURE_FLAG",
        change: "changed",
      }),
    );
    expect(diff.entries).toContainEqual(
      expect.objectContaining({
        section: "variable",
        key: "environment:runtime:LOG_LEVEL",
        change: "added",
      }),
    );
    expect(diff.entries).not.toContainEqual(
      expect.objectContaining({
        section: "variable",
        key: "environment:runtime:DATABASE_URL",
      }),
    );
    expect(diff.entries).toContainEqual(
      expect.objectContaining({ section: "resource", key: "web", change: "changed" }),
    );
    expect(diff.entries).toContainEqual(
      expect.objectContaining({ section: "resource", key: "worker", change: "removed" }),
    );
    expect(diff.entries).toContainEqual(
      expect.objectContaining({ section: "resource", key: "api", change: "added" }),
    );
    expect(diff.entries).toContainEqual(
      expect.objectContaining({
        section: "dependency-binding",
        key: "web:postgres:environment:DATABASE_URL",
        change: "removed",
      }),
    );
    expect(diff.entries).toContainEqual(
      expect.objectContaining({
        section: "route",
        key: "web:www.example.com:/",
        change: "removed",
      }),
    );
    expect(diff.entries).toContainEqual(
      expect.objectContaining({
        section: "storage",
        key: "web:/app/uploads",
        change: "removed",
      }),
    );
    expect(diff.entries).toContainEqual(
      expect.objectContaining({
        section: "pending-decision",
        key: "storage:rsta_prod_uploads",
        change: "added",
      }),
    );
  });
});
