import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { createMigrationPlan } from "../src";

describe("Platform migration plan", () => {
  test("[MIG-PLAN-003] plans a fresh web migration as existing operation keys in dependency order", () => {
    const planned = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Fresh web migration" },
      spec: {
        project: { name: "Storefront" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: { kind: "remote-git", locator: "https://github.com/acme/storefront.git" },
            runtime: { startCommand: "bun run start" },
            network: { internalPort: 3000 },
          },
        ],
        variables: [{ key: "NODE_ENV", value: "production", exposure: "runtime" }],
        dependencies: [],
        volumes: [],
        domains: [],
      },
    });

    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) throw planned.error;

    expect(planned.value.steps.map((step) => step.operationKey)).toEqual([
      "projects.create",
      "environments.create",
      "environments.set-variable",
      "resources.create",
      "deployments.create",
    ]);
    expect(planned.value.steps[0]?.cleanup?.operationKey).toBe("projects.archive");
    expect(planned.value.state).toBe("ready");
    expect(planned.value.bundleDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("[MIG-PLAN-003][MIG-STATEFUL-012] orders dependency, volume, domain, and deployment effects", () => {
    const planned = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Stateful web migration" },
      spec: {
        project: { name: "Notes" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: { kind: "docker-image", locator: "ghcr.io/acme/notes:1.0.0" },
            network: { internalPort: 8080 },
          },
        ],
        variables: [],
        dependencies: [
          {
            ref: "database",
            name: "Database",
            kind: "postgres",
            providerKey: "appaloft-managed-postgres",
            bindings: [{ resourceRef: "web", targetName: "DATABASE_URL" }],
          },
        ],
        volumes: [{ ref: "uploads", name: "Uploads", resourceRef: "web", mountPath: "/data" }],
        domains: [{ hostname: "notes.example.test", resourceRef: "web", tlsPolicy: "automatic" }],
      },
    });

    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) throw planned.error;
    expect(planned.value.steps.map((step) => step.operationKey)).toEqual([
      "projects.create",
      "environments.create",
      "dependency-resources.provision",
      "storage-volumes.create",
      "resources.create",
      "resources.bind-dependency",
      "resources.attach-storage",
      "domain-bindings.create",
      "deployments.create",
    ]);
  });

  test("[MIG-COMPOSE-011] preserves the reviewed service graph on resource creation", () => {
    const planned = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Compose graph" },
      spec: {
        project: { name: "Compose graph" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_compose" },
        resources: [
          {
            ref: "stack",
            name: "Compose stack",
            kind: "compose-stack",
            services: [
              { name: "web", kind: "web" },
              { name: "api", kind: "api" },
            ],
            source: { kind: "local-folder", locator: "/tmp/compose-stack" },
            runtime: { strategy: "docker-compose", dockerComposeFilePath: "docker-compose.yml" },
          },
        ],
      },
    });

    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) throw planned.error;
    expect(
      planned.value.steps.find((step) => step.operationKey === "resources.create")?.input,
    ).toMatchObject({
      kind: "compose-stack",
      services: [
        { name: "api", kind: "api" },
        { name: "web", kind: "web" },
      ],
    });
  });

  test("[MIG-STATEFUL-012] keeps source secret references ephemeral for imported dependencies", () => {
    const planned = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Imported dependency" },
      spec: {
        project: { name: "Imported dependency" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: { kind: "local-folder", locator: "/tmp/imported-dependency" },
          },
        ],
        dependencies: [
          {
            ref: "redis",
            name: "Redis",
            kind: "redis",
            sourceMode: "imported-external",
            providerKey: "external-redis",
            connectionSecretRef: "env://REDIS_URL",
          },
        ],
      },
    });

    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) throw planned.error;
    expect(
      planned.value.steps.find((step) => step.operationKey === "dependency-resources.import")
        ?.input,
    ).toMatchObject({ connectionUrl: { $secretRef: "env://REDIS_URL" } });
    expect(
      planned.value.steps.find((step) => step.operationKey === "dependency-resources.import")
        ?.input,
    ).not.toHaveProperty("secretRef");
  });

  test("[MIG-PLAN-003][MIG-FAIL-006] blocks dangling migration references before effects", () => {
    const planned = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Broken migration" },
      spec: {
        project: { name: "Notes" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: { kind: "docker-image", locator: "ghcr.io/acme/notes:1.0.0" },
          },
        ],
        variables: [],
        dependencies: [],
        volumes: [{ ref: "uploads", name: "Uploads", resourceRef: "missing", mountPath: "/data" }],
        domains: [],
      },
    });

    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) throw planned.error;
    expect(planned.value.state).toBe("blocked");
    expect(planned.value.blockers).toEqual([
      {
        code: "unknown_resource_ref",
        path: "spec.volumes.uploads.resourceRef",
        message: 'Volume "uploads" references unknown resource "missing".',
      },
    ]);
  });
});
