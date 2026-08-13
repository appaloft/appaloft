import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { parseMigrationBundle } from "../src";

describe("Platform migration bundle", () => {
  test("[MIG-BUNDLE-001] parses v1 input into one deterministic canonical order", () => {
    const parsed = parseMigrationBundle({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: {
        name: "Storefront migration",
        source: { provider: "railway", projectRef: "railway-project-1" },
      },
      spec: {
        project: { name: "Storefront" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "worker",
            name: "Worker",
            source: { kind: "remote-git", locator: "https://github.com/acme/storefront.git" },
            runtime: { startCommand: "bun run worker" },
          },
          {
            ref: "web",
            name: "Web",
            source: { kind: "remote-git", locator: "https://github.com/acme/storefront.git" },
            runtime: { startCommand: "bun run start" },
            network: { internalPort: 3000 },
          },
        ],
        variables: [
          { key: "NODE_ENV", value: "production", exposure: "runtime" },
          { key: "API_URL", value: "https://api.example.test", exposure: "runtime" },
        ],
        dependencies: [],
        volumes: [],
        domains: [],
      },
    });

    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) throw parsed.error;

    expect(parsed.value.spec.resources.map((resource) => resource.ref)).toEqual(["web", "worker"]);
    expect(parsed.value.spec.variables.map((variable) => variable.key)).toEqual([
      "API_URL",
      "NODE_ENV",
    ]);
  });

  test("[MIG-BUNDLE-001][MIG-AUTH-013] refuses plaintext secret variables", () => {
    const parsed = parseMigrationBundle({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Secret-safe migration" },
      spec: {
        project: { name: "Storefront" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: { kind: "remote-git", locator: "https://github.com/acme/storefront.git" },
          },
        ],
        variables: [
          {
            key: "DATABASE_PASSWORD",
            kind: "secret",
            value: "must-never-enter-a-migration-bundle",
            exposure: "runtime",
          },
        ],
        dependencies: [],
        volumes: [],
        domains: [],
      },
    });

    expect(parsed.isErr()).toBe(true);
    if (parsed.isOk()) throw new Error("Expected plaintext secret rejection");
    expect(parsed.error.details?.validationIssuePaths).toContain("spec.variables.0.secretRef");
    expect(JSON.stringify(parsed.error)).not.toContain("must-never-enter-a-migration-bundle");
  });
});
