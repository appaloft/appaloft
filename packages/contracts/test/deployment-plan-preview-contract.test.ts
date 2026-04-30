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

  test("[DPP-CATALOG-003][WF-PLAN-PY-001][WF-PLAN-PY-012] exposes ready Python planner catalog output", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_fastapi",
        serverId: "srv_local",
        destinationId: "dst_local",
        resourceName: "FastAPI App",
      },
      readiness: {
        status: "ready",
        ready: true,
        reasonCodes: [],
      },
      source: {
        kind: "local-folder",
        displayName: "fastapi-uv",
        locator: "/workspace/fastapi-uv",
        runtimeFamily: "python",
        framework: "fastapi",
        packageManager: "uv",
        applicationShape: "serverful-http",
        projectName: "fastapi-uv",
        detectedFiles: ["pyproject-toml", "uv-lock"],
        detectedScripts: [],
        reasoning: ["FastAPI ASGI app evidence detected"],
      },
      planner: {
        plannerKey: "fastapi",
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
          planner: "fastapi",
          baseImage: "python:3.12-slim",
          applicationShape: "serverful-http",
          packageManager: "uv",
        },
      },
      commands: [
        {
          kind: "install",
          command: "pip install --no-cache-dir uv && uv sync --frozen --no-dev",
          source: "planner",
        },
        {
          kind: "start",
          command: "uv run python -m uvicorn main:app --host 0.0.0.0 --port 3000",
          source: "planner",
        },
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

    expect(parsed.source.runtimeFamily).toBe("python");
    expect(parsed.source.packageManager).toBe("uv");
    expect(parsed.planner.plannerKey).toBe("fastapi");
    expect(parsed.commands.map((command) => command.kind)).toEqual(["install", "start"]);
  });

  test("[DPP-CATALOG-004][WF-PLAN-PY-009][WF-PLAN-PY-010] exposes blocked Python planner reasons", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_python",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "blocked",
        ready: false,
        reasonCodes: ["ambiguous-python-app-target"],
      },
      source: {
        kind: "local-folder",
        displayName: "generic-python-ambiguous",
        locator: "/workspace/generic-python-ambiguous",
        runtimeFamily: "python",
        packageManager: "uv",
        applicationShape: "serverful-http",
        detectedFiles: ["pyproject-toml", "uv-lock"],
        detectedScripts: [],
        reasoning: ["Multiple ASGI app targets were detected"],
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
          code: "ambiguous-python-app-target",
          category: "blocked",
          phase: "runtime-plan-resolution",
          message: "Python ASGI/WSGI app target is ambiguous.",
          recommendation: "Configure an explicit resource runtime start command before deployment.",
        },
      ],
      nextActions: [
        {
          kind: "command",
          targetOperation: "resources.configure-runtime",
          label: "Configure runtime",
          safeByDefault: true,
          blockedReasonCode: "ambiguous-python-app-target",
        },
      ],
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(parsed.readiness.ready).toBe(false);
    expect(parsed.unsupportedReasons[0]?.code).toBe("ambiguous-python-app-target");
    expect(parsed.nextActions[0]?.targetOperation).toBe("resources.configure-runtime");
  });

  test("[DPP-CATALOG-005][WF-PLAN-JVM-001][WF-PLAN-JVM-014] exposes ready JVM planner catalog output", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_spring",
        serverId: "srv_local",
        destinationId: "dst_local",
        resourceName: "Spring Boot App",
      },
      readiness: {
        status: "ready",
        ready: true,
        reasonCodes: [],
      },
      source: {
        kind: "local-folder",
        displayName: "spring-boot-maven-wrapper",
        locator: "/workspace/spring-boot-maven-wrapper",
        runtimeFamily: "java",
        framework: "spring-boot",
        packageManager: "maven",
        applicationShape: "serverful-http",
        runtimeVersion: "21",
        projectName: "spring-boot-maven-wrapper",
        detectedFiles: ["pom-xml", "maven-wrapper", "spring-boot-actuator"],
        detectedScripts: [],
        reasoning: ["Spring Boot Maven wrapper evidence detected"],
      },
      planner: {
        plannerKey: "spring-boot",
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
          planner: "spring-boot",
          baseImage: "eclipse-temurin:21-jdk",
          applicationShape: "serverful-http",
          packageManager: "maven",
          jarPath: "target/spring-boot-maven-wrapper-0.0.1-SNAPSHOT.jar",
        },
      },
      commands: [
        { kind: "build", command: "./mvnw package -DskipTests", source: "planner" },
        {
          kind: "start",
          command: "java -jar target/spring-boot-maven-wrapper-0.0.1-SNAPSHOT.jar",
          source: "planner",
        },
      ],
      network: {
        internalPort: 8080,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      health: {
        enabled: true,
        kind: "http",
        path: "/actuator/health",
        port: 8080,
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

    expect(parsed.source.runtimeFamily).toBe("java");
    expect(parsed.source.framework).toBe("spring-boot");
    expect(parsed.planner.plannerKey).toBe("spring-boot");
    expect(parsed.commands.map((command) => command.kind)).toEqual(["build", "start"]);
  });

  test("[DPP-CATALOG-006][WF-PLAN-JVM-011][WF-PLAN-JVM-012] exposes blocked JVM planner reasons", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_jvm",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "blocked",
        ready: false,
        reasonCodes: ["ambiguous-jvm-build-tool"],
      },
      source: {
        kind: "local-folder",
        displayName: "jvm-ambiguous-build-tool",
        locator: "/workspace/jvm-ambiguous-build-tool",
        runtimeFamily: "java",
        applicationShape: "serverful-http",
        detectedFiles: ["pom-xml", "gradle-build"],
        detectedScripts: [],
        reasoning: ["Maven and Gradle build files were both detected"],
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
        internalPort: 8080,
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
          code: "ambiguous-jvm-build-tool",
          category: "blocked",
          phase: "runtime-plan-resolution",
          message: "JVM build tool evidence is ambiguous.",
          recommendation:
            "Select a source root or configure explicit resource runtime build and start commands before deployment.",
        },
      ],
      nextActions: [
        {
          kind: "command",
          targetOperation: "resources.configure-runtime",
          label: "Configure runtime",
          safeByDefault: true,
          blockedReasonCode: "ambiguous-jvm-build-tool",
        },
      ],
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(parsed.readiness.ready).toBe(false);
    expect(parsed.unsupportedReasons[0]?.code).toBe("ambiguous-jvm-build-tool");
    expect(parsed.nextActions[0]?.targetOperation).toBe("resources.configure-runtime");
  });
});
