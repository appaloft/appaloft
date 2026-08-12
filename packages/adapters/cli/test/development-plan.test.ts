import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { developmentPlanFromSource } from "../src/development-plan";

describe("Development Plan", () => {
  test("[DEV-PLAN-001][DEV-DEPLOY-017] reuses deploy graph normalization", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-dev-plan-"));
    writeFileSync(
      join(root, "appaloft.yml"),
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 4310",
        "health:",
        "  path: /health",
        "development:",
        "  command: bun run dev",
        "  watch: native",
      ].join("\n"),
    );

    const planned = await developmentPlanFromSource({ sourceRoot: root });

    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) return;
    expect(planned.value.services).toEqual([
      expect.objectContaining({
        key: "app",
        commandIntent: "bun run dev",
        watch: "native",
        port: 4310,
        healthPath: "/health",
      }),
    ]);
    expect(planned.value.deploymentGraph).toMatchObject({
      deploymentMethod: "workspace-commands",
      startCommand: "bun run start",
      port: 4310,
      healthCheckPath: "/health",
    });
    expect(JSON.stringify(planned.value.deploymentGraph)).not.toContain("bun run dev");
  });

  test("[DEV-PLAN-003] rejects unsupported substrate before any runtime effect", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-dev-plan-"));
    writeFileSync(
      join(root, "appaloft.json"),
      JSON.stringify({
        runtime: { strategy: "dockerfile", dockerfilePath: "Dockerfile" },
        network: { internalPort: 3000 },
      }),
    );

    const planned = await developmentPlanFromSource({ sourceRoot: root });

    expect(planned.isErr()).toBe(true);
    if (planned.isOk()) return;
    expect(planned.error.code).toBe("development_substrate_unsupported");
    expect(planned.error.details?.phase).toBe("development-plan");
  });

  test("[DEV-PLAN-003] detects a deterministic package script when config is absent", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-dev-plan-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "fixture", scripts: { dev: "bun run server.ts" } }),
    );

    const planned = await developmentPlanFromSource({ sourceRoot: root });

    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) return;
    expect(planned.value.services[0]).toMatchObject({
      key: "app",
      commandIntent: "bun run dev",
      watch: "native",
    });
    expect(planned.value.configFilePath).toBeNull();
  });

  test("[DEV-PLAN-001] realizes a user Compose graph without inventing deployment identity", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-dev-plan-"));
    writeFileSync(
      join(root, "appaloft.yml"),
      [
        "runtime:",
        "  strategy: docker-compose",
        "  dockerComposeFilePath: compose.dev.yml",
        "network:",
        "  internalPort: 4310",
      ].join("\n"),
    );

    const planned = await developmentPlanFromSource({ sourceRoot: root });

    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) return;
    expect(planned.value.services[0]).toMatchObject({
      commandIntent: "docker compose up",
      commandArgs: ["docker", "compose", "-f", join(root, "compose.dev.yml"), "up"],
      cleanupArgs: ["docker", "compose", "-f", join(root, "compose.dev.yml"), "down"],
    });
    expect(planned.value.deploymentGraph).toMatchObject({
      deploymentMethod: "docker-compose",
      dockerComposeFilePath: "compose.dev.yml",
    });
  });
});
