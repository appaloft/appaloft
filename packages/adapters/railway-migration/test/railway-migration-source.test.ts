import { describe, expect, test } from "bun:test";

import { createMigrationPlan } from "@appaloft/application";

import { translateRailwayMigrationSource } from "../src";

describe("Railway migration source adapter", () => {
  test("[MIG-SOURCE-002] translates a service graph without leaking Railway DTOs into the bundle", () => {
    const result = translateRailwayMigrationSource({
      apiVersion: "railway.appaloft.io/export/v1",
      kind: "RailwayProjectExport",
      metadata: { name: "Storefront", projectId: "railway_project_1" },
      environment: { name: "production", kind: "production" },
      target: { deploymentTargetId: "srv_appaloft", destinationId: "dst_appaloft" },
      services: [
        {
          ref: "web",
          name: "Web",
          source: {
            repositoryUrl: "https://github.com/acme/storefront.git",
            branch: "main",
            rootDirectory: "apps/web",
          },
          build: { builder: "railpack", buildCommand: "bun run build" },
          deploy: {
            startCommand: "bun run start",
            healthcheckPath: "/health",
            port: 3000,
          },
          variables: [
            { key: "PUBLIC_ORIGIN", value: "https://shop.example.com", exposure: "runtime" },
            {
              key: "SESSION_SECRET",
              secretRef: "local://railway/SESSION_SECRET",
              exposure: "runtime",
              secret: true,
            },
          ],
          domains: [{ hostname: "shop.example.com", tlsPolicy: "automatic" }],
          volumes: [{ ref: "uploads", name: "Uploads", mountPath: "/data" }],
        },
      ],
      dependencies: [
        {
          ref: "postgres",
          name: "Postgres",
          kind: "postgres",
          providerKey: "docker",
          bindings: [{ serviceRef: "web", targetName: "DATABASE_URL" }],
        },
      ],
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value.spec.resources[0]).toMatchObject({
      ref: "web",
      source: {
        kind: "remote-git",
        locator: "https://github.com/acme/storefront.git",
        gitRef: "main",
        baseDirectory: "apps/web",
      },
      runtime: {
        strategy: "auto",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        healthCheckPath: "/health",
      },
    });
    expect(result.value.spec.variables).toContainEqual({
      key: "SESSION_SECRET",
      secretRef: "local://railway/SESSION_SECRET",
      exposure: "runtime",
      kind: "secret",
      resourceRef: "web",
    });
    expect(JSON.stringify(result.value)).not.toContain("railway_project_1");
  });

  test("[MIG-SOURCE-002] turns unsupported Railway capabilities into explicit plan blockers", () => {
    const translated = translateRailwayMigrationSource({
      apiVersion: "railway.appaloft.io/export/v1",
      kind: "RailwayProjectExport",
      metadata: { name: "Worker" },
      environment: { name: "production", kind: "production" },
      target: { deploymentTargetId: "srv_appaloft" },
      services: [
        {
          ref: "worker",
          name: "Worker",
          source: { image: "ghcr.io/acme/worker:latest" },
          deploy: { replicas: 3, cronSchedule: "*/5 * * * *" },
        },
      ],
    });
    if (translated.isErr()) throw translated.error;
    const plan = createMigrationPlan(translated.value);
    if (plan.isErr()) throw plan.error;

    expect(plan.value.state).toBe("blocked");
    expect(plan.value.blockers.map((blocker) => blocker.code)).toEqual([
      "railway_cron_requires_scheduled_task_mapping",
      "railway_replicas_require_scale_profile",
    ]);
  });

  test("[MIG-SOURCE-002][MIG-AUTH-013] rejects plaintext values declared as Railway secrets", () => {
    const result = translateRailwayMigrationSource({
      apiVersion: "railway.appaloft.io/export/v1",
      kind: "RailwayProjectExport",
      metadata: { name: "Unsafe" },
      environment: { name: "production", kind: "production" },
      target: { deploymentTargetId: "srv_appaloft" },
      services: [
        {
          ref: "web",
          name: "Web",
          source: { image: "ghcr.io/acme/web:latest" },
          variables: [
            {
              key: "PASSWORD",
              value: "plaintext-must-not-leak",
              exposure: "runtime",
              secret: true,
            },
          ],
        },
      ],
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("unsafe export accepted");
    expect(JSON.stringify(result.error)).not.toContain("plaintext-must-not-leak");
  });
});
