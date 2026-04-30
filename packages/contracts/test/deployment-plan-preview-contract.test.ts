import { describe, expect, test } from "bun:test";

import { deploymentPlanResponseSchema } from "../src/index";

describe("deployment plan preview contract", () => {
  test("[DPP-CATALOG-001][WF-PLAN-JS-001] exposes ready JavaScript planner catalog output", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_next",
        serverId: "srv_local",
        destinationId: "dst_local",
        projectName: "Demo",
        environmentName: "Production",
        resourceName: "Next App",
        serverName: "Local Docker",
      },
      readiness: {
        status: "ready",
        ready: true,
        reasonCodes: [],
      },
      source: {
        kind: "local-folder",
        displayName: "next-ssr",
        locator: "/workspace/next-ssr",
        runtimeFamily: "node",
        framework: "nextjs",
        packageManager: "pnpm",
        applicationShape: "ssr",
        projectName: "next-ssr",
        detectedFiles: ["package.json", "next.config.mjs", "pnpm-lock.yaml"],
        detectedScripts: ["build", "start"],
        reasoning: ["Next.js App Router evidence detected"],
      },
      planner: {
        plannerKey: "nextjs",
        supportTier: "first-class",
        buildStrategy: "workspace-commands",
        packagingMode: "all-in-one-docker",
        targetKind: "single-server",
        targetProviderKey: "local-shell",
      },
      artifact: {
        kind: "workspace-image",
        runtimeArtifactKind: "image",
        runtimeArtifactIntent: "build-image",
        metadata: {
          planner: "nextjs",
          baseImage: "node:22-alpine",
          applicationShape: "ssr",
        },
      },
      commands: [
        { kind: "install", command: "pnpm install", source: "planner" },
        { kind: "build", command: "pnpm build", source: "planner" },
        { kind: "start", command: "pnpm start", source: "planner" },
      ],
      network: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      health: {
        enabled: true,
        kind: "http",
        path: "/",
        port: 3000,
      },
      warnings: [],
      unsupportedReasons: [],
      nextActions: [
        {
          kind: "command",
          targetOperation: "deployments.create",
          label: "Deploy",
          safeByDefault: true,
        },
      ],
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(parsed.planner.plannerKey).toBe("nextjs");
    expect(parsed.artifact.kind).toBe("workspace-image");
    expect(parsed.commands.map((command) => command.kind)).toEqual(["install", "build", "start"]);
  });

  test("[DPP-CATALOG-002][WF-PLAN-JS-007][WF-PLAN-JS-012] exposes blocked JavaScript planner reasons", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_sveltekit",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "blocked",
        ready: false,
        reasonCodes: ["ambiguous-framework"],
      },
      source: {
        kind: "local-folder",
        displayName: "sveltekit-ambiguous",
        locator: "/workspace/sveltekit-ambiguous",
        runtimeFamily: "node",
        framework: "sveltekit",
        packageManager: "pnpm",
        applicationShape: "hybrid-static-server",
        detectedFiles: ["package.json", "svelte.config.js", "pnpm-lock.yaml"],
        detectedScripts: ["build"],
        reasoning: ["SvelteKit adapter mode is ambiguous"],
      },
      planner: {
        plannerKey: "unsupported",
        supportTier: "unsupported",
        buildStrategy: "workspace-commands",
        packagingMode: "all-in-one-docker",
        targetKind: "single-server",
        targetProviderKey: "local-shell",
      },
      artifact: {
        kind: "workspace-image",
      },
      commands: [],
      network: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      health: {
        enabled: false,
        kind: "none",
      },
      warnings: [],
      unsupportedReasons: [
        {
          code: "ambiguous-framework",
          category: "blocked",
          phase: "runtime-plan-resolution",
          message: "SvelteKit requires explicit static strategy or production start command.",
          recommendation: "Configure resource runtime strategy or start command before deployment.",
        },
      ],
      nextActions: [
        {
          kind: "command",
          targetOperation: "resources.configure-runtime",
          label: "Configure runtime",
          safeByDefault: true,
          blockedReasonCode: "ambiguous-framework",
        },
      ],
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(parsed.readiness.ready).toBe(false);
    expect(parsed.unsupportedReasons[0]?.code).toBe("ambiguous-framework");
    expect(parsed.nextActions[0]?.targetOperation).toBe("resources.configure-runtime");
  });
});
