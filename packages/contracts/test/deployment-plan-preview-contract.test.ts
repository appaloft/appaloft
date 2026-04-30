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

  test("[WF-PLAN-BP-001] keeps explicit framework planner ahead of buildpack evidence", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_next",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "ready",
        ready: true,
        reasonCodes: [],
      },
      source: {
        kind: "local-folder",
        displayName: "next-with-buildpack-files",
        locator: "/workspace/next-with-buildpack-files",
        runtimeFamily: "node",
        framework: "nextjs",
        packageManager: "pnpm",
        applicationShape: "ssr",
        detectedFiles: ["package.json", "next.config.mjs", "project.toml"],
        detectedScripts: ["build", "start"],
        reasoning: ["Next.js evidence is first-class; buildpack evidence is non-winning"],
      },
      planner: {
        plannerKey: "nextjs",
        supportTier: "first-class",
        buildStrategy: "workspace-commands",
        packagingMode: "all-in-one-docker",
        targetKind: "single-server",
        targetProviderKey: "local-shell",
      },
      buildpack: {
        status: "non-winning",
        supportTier: "buildpack-accelerated",
        evidence: {
          platformFiles: ["project.toml"],
          languageFamilies: ["node"],
          frameworkHints: ["nextjs"],
          builderEvidence: ["default-builder-policy"],
          detectedBuildpacks: [{ id: "paketo-buildpacks/nodejs" }],
        },
        builderPolicy: {
          defaultBuilder: "paketobuildpacks/builder-jammy-base",
          override: "none",
          blockedBuilders: [],
        },
        artifactIntent: "build-image",
        limitations: [
          {
            code: "buildpack-non-winning",
            message: "First-class Next.js planner takes precedence over buildpack evidence.",
          },
        ],
      },
      artifact: {
        kind: "workspace-image",
        runtimeArtifactKind: "image",
        runtimeArtifactIntent: "build-image",
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
    expect(parsed.planner.supportTier).toBe("first-class");
    expect(parsed.buildpack?.status).toBe("non-winning");
  });

  test("[WF-PLAN-BP-002][WF-PLAN-BP-008] keeps explicit custom runtime overrides ahead of buildpack candidate", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_custom",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "ready",
        ready: true,
        reasonCodes: [],
      },
      source: {
        kind: "local-folder",
        displayName: "custom-with-buildpack-files",
        locator: "/workspace/custom-with-buildpack-files",
        runtimeFamily: "ruby",
        applicationShape: "serverful-http",
        detectedFiles: ["Gemfile", "project.toml"],
        detectedScripts: [],
        reasoning: ["Explicit resource runtime commands make the custom plan authoritative"],
      },
      planner: {
        plannerKey: "custom",
        supportTier: "custom",
        buildStrategy: "workspace-commands",
        packagingMode: "all-in-one-docker",
        targetKind: "single-server",
        targetProviderKey: "local-shell",
      },
      buildpack: {
        status: "non-winning",
        supportTier: "buildpack-accelerated",
        evidence: {
          platformFiles: ["project.toml"],
          languageFamilies: ["ruby"],
          frameworkHints: ["rack"],
          builderEvidence: ["default-builder-policy"],
          detectedBuildpacks: [{ id: "paketo-buildpacks/ruby" }],
        },
        builderPolicy: {
          defaultBuilder: "paketobuildpacks/builder-jammy-base",
          override: "none",
          blockedBuilders: [],
        },
        artifactIntent: "build-image",
        limitations: [
          {
            code: "buildpack-non-winning",
            message: "Explicit runtime commands take precedence over buildpack evidence.",
          },
        ],
      },
      artifact: {
        kind: "custom-command-image",
        runtimeArtifactKind: "image",
        runtimeArtifactIntent: "build-image",
      },
      commands: [
        { kind: "install", command: "bundle install", source: "resource-runtime-profile" },
        {
          kind: "start",
          command: "bundle exec rackup -o 0.0.0.0 -p 3000",
          source: "resource-runtime-profile",
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

    expect(parsed.planner.plannerKey).toBe("custom");
    expect(parsed.commands.every((command) => command.source === "resource-runtime-profile")).toBe(
      true,
    );
    expect(parsed.buildpack?.status).toBe("non-winning");
  });

  test("[WF-PLAN-BP-004] exposes disabled or unavailable buildpack accelerator as blocked preview", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_unavailable",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "blocked",
        ready: false,
        reasonCodes: ["buildpack-target-unavailable"],
      },
      source: {
        kind: "local-folder",
        displayName: "buildpack-unavailable-app",
        locator: "/workspace/buildpack-unavailable-app",
        runtimeFamily: "php",
        applicationShape: "serverful-http",
        detectedFiles: ["composer.json", "project.toml"],
        detectedScripts: [],
        reasoning: ["Buildpack evidence exists but the selected target cannot run the lifecycle"],
      },
      planner: {
        plannerKey: "buildpack",
        supportTier: "unsupported",
        buildStrategy: "buildpack",
        packagingMode: "all-in-one-docker",
        targetKind: "single-server",
        targetProviderKey: "local-shell",
      },
      buildpack: {
        status: "unavailable",
        supportTier: "unsupported",
        evidence: {
          platformFiles: ["project.toml"],
          languageFamilies: ["php"],
          frameworkHints: ["generic-php"],
          builderEvidence: ["default-builder-policy"],
          detectedBuildpacks: [{ id: "paketo-buildpacks/php" }],
        },
        builderPolicy: {
          defaultBuilder: "paketobuildpacks/builder-jammy-base",
          override: "none",
          blockedBuilders: [],
        },
        artifactIntent: "build-image",
        limitations: [
          {
            code: "buildpack-target-unavailable",
            message: "Selected runtime target lacks buildpack lifecycle support.",
            fixPath: "Configure explicit runtime commands or select a supported target.",
          },
        ],
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
          code: "buildpack-target-unavailable",
          category: "blocked",
          phase: "runtime-target-resolution",
          message: "Buildpack lifecycle support is unavailable for the selected target.",
          recommendation: "Configure explicit runtime commands or select a supported target.",
        },
      ],
      nextActions: [
        {
          kind: "command",
          targetOperation: "resources.configure-runtime",
          label: "Configure runtime",
          safeByDefault: true,
          blockedReasonCode: "buildpack-target-unavailable",
        },
      ],
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(parsed.readiness.ready).toBe(false);
    expect(parsed.buildpack?.status).toBe("unavailable");
    expect(parsed.unsupportedReasons[0]?.code).toBe("buildpack-target-unavailable");
  });

  test("[DPP-CATALOG-BP-001][WF-PLAN-BP-003][WF-PLAN-BP-009] exposes ready buildpack accelerator output", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_unknown",
        serverId: "srv_local",
        destinationId: "dst_local",
        resourceName: "Unknown Web Service",
      },
      readiness: {
        status: "warning",
        ready: true,
        reasonCodes: [],
      },
      source: {
        kind: "local-folder",
        displayName: "unknown-buildpack-app",
        locator: "/workspace/unknown-buildpack-app",
        runtimeFamily: "go",
        applicationShape: "serverful-http",
        detectedFiles: ["go.mod", "project.toml"],
        detectedScripts: [],
        reasoning: ["No first-class planner matched; buildpack evidence is available"],
      },
      planner: {
        plannerKey: "buildpack",
        supportTier: "buildpack-accelerated",
        buildStrategy: "buildpack",
        packagingMode: "all-in-one-docker",
        targetKind: "single-server",
        targetProviderKey: "local-shell",
      },
      buildpack: {
        status: "selected",
        supportTier: "buildpack-accelerated",
        evidence: {
          platformFiles: ["project.toml"],
          languageFamilies: ["go"],
          frameworkHints: ["generic-http"],
          builderEvidence: ["default-builder-policy"],
          detectedBuildpacks: [
            {
              id: "paketo-buildpacks/go",
              version: "4.12.0",
            },
          ],
        },
        builderPolicy: {
          defaultBuilder: "paketobuildpacks/builder-jammy-base",
          override: "allowed",
          blockedBuilders: [],
        },
        artifactIntent: "build-image",
        limitations: [
          {
            code: "buildpack-not-first-class-planner",
            message:
              "This preview uses adapter-owned buildpack evidence until an explicit planner exists.",
          },
        ],
      },
      artifact: {
        kind: "workspace-image",
        runtimeArtifactKind: "image",
        runtimeArtifactIntent: "build-image",
        metadata: {
          planner: "buildpack",
          builder: "paketobuildpacks/builder-jammy-base",
          applicationShape: "serverful-http",
        },
      },
      commands: [
        { kind: "package", command: "build OCI image with selected builder", source: "planner" },
      ],
      network: {
        internalPort: 8080,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      health: {
        enabled: false,
        kind: "none",
      },
      warnings: [
        {
          code: "buildpack-preview-limited",
          category: "warning",
          phase: "runtime-plan-resolution",
          message:
            "Buildpack acceleration is preview-only and does not imply first-class framework support.",
          recommendation:
            "Add explicit resource runtime commands if the generated plan is not sufficient.",
        },
      ],
      unsupportedReasons: [],
      nextActions: [
        {
          kind: "command",
          targetOperation: "deployments.create",
          label: "Deploy",
          safeByDefault: false,
        },
      ],
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(parsed.planner.supportTier).toBe("buildpack-accelerated");
    expect(parsed.buildpack?.status).toBe("selected");
    expect(parsed.buildpack?.evidence.detectedBuildpacks[0]?.id).toBe("paketo-buildpacks/go");
    expect(parsed.health.kind).toBe("none");
  });

  test("[DPP-CATALOG-BP-002][WF-PLAN-BP-005][WF-PLAN-BP-006][WF-PLAN-BP-007] exposes blocked buildpack guardrails", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_ambiguous",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "blocked",
        ready: false,
        reasonCodes: [
          "ambiguous-buildpack-evidence",
          "unsupported-buildpack-builder",
          "internal-port-missing",
        ],
      },
      source: {
        kind: "local-folder",
        displayName: "ambiguous-buildpack-app",
        locator: "/workspace/ambiguous-buildpack-app",
        applicationShape: "serverful-http",
        detectedFiles: ["package.json", "Gemfile", "project.toml"],
        detectedScripts: ["build"],
        reasoning: ["Multiple buildpack language families were detected"],
      },
      planner: {
        plannerKey: "buildpack",
        supportTier: "requires-override",
        buildStrategy: "buildpack",
        packagingMode: "all-in-one-docker",
        targetKind: "single-server",
        targetProviderKey: "local-shell",
      },
      buildpack: {
        status: "blocked",
        supportTier: "requires-override",
        evidence: {
          platformFiles: ["project.toml"],
          languageFamilies: ["node", "ruby"],
          frameworkHints: ["express", "rack"],
          builderEvidence: ["custom-builder"],
          detectedBuildpacks: [
            { id: "paketo-buildpacks/nodejs" },
            { id: "paketo-buildpacks/ruby" },
          ],
        },
        builderPolicy: {
          defaultBuilder: "paketobuildpacks/builder-jammy-base",
          override: "blocked",
          requestedBuilder: "example.com/unsupported/builder:latest",
          blockedBuilders: ["example.com/unsupported/builder:latest"],
        },
        artifactIntent: "build-image",
        limitations: [
          {
            code: "ambiguous-buildpack-evidence",
            message: "Multiple buildpack language families were detected.",
            fixPath: "Select a source root or configure explicit runtime commands.",
          },
          {
            code: "unsupported-buildpack-builder",
            message: "The requested builder is outside Appaloft policy.",
            fixPath: "Use the default builder or an allowed builder override.",
          },
          {
            code: "internal-port-missing",
            message: "Inbound buildpack applications still require resource network internalPort.",
            fixPath: "Run resources.configure-network with an internal port.",
          },
        ],
      },
      artifact: {
        kind: "workspace-image",
      },
      commands: [],
      network: {
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
          code: "ambiguous-buildpack-evidence",
          category: "blocked",
          phase: "runtime-plan-resolution",
          message: "Buildpack evidence is ambiguous.",
          recommendation: "Select a source root or configure explicit runtime commands.",
        },
        {
          code: "unsupported-buildpack-builder",
          category: "blocked",
          phase: "runtime-plan-resolution",
          message: "Requested buildpack builder is unsupported.",
          recommendation: "Use the default builder or an allowed override.",
        },
        {
          code: "internal-port-missing",
          category: "blocked",
          phase: "resource-network-resolution",
          message: "Buildpack port hints are not the resource network source of truth.",
          recommendation: "Configure ResourceNetworkProfile.internalPort before deployment.",
        },
      ],
      nextActions: [
        {
          kind: "command",
          targetOperation: "resources.configure-runtime",
          label: "Configure runtime",
          safeByDefault: true,
          blockedReasonCode: "ambiguous-buildpack-evidence",
        },
        {
          kind: "command",
          targetOperation: "resources.configure-network",
          label: "Configure network",
          safeByDefault: true,
          blockedReasonCode: "internal-port-missing",
        },
      ],
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(parsed.readiness.ready).toBe(false);
    expect(parsed.planner.supportTier).toBe("requires-override");
    expect(parsed.buildpack?.builderPolicy.override).toBe("blocked");
    expect(parsed.unsupportedReasons.map((reason) => reason.code)).toContain(
      "internal-port-missing",
    );
  });

  test("[DPP-PLAN-FAIL-001][WF-PLAN-FAIL-001][WF-PLAN-FAIL-002][WF-PLAN-FAIL-003][WF-PLAN-FAIL-009] exposes shared blocked preview shape", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_unsupported",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "blocked",
        ready: false,
        reasonCodes: ["unsupported-runtime-family", "ambiguous-framework-evidence"],
      },
      source: {
        kind: "local-folder",
        displayName: "unsupported-multi-app",
        locator: "/workspace/unsupported-multi-app",
        runtimeFamily: "rust",
        applicationShape: "serverful-http",
        detectedFiles: ["Cargo.toml", "mix.exs"],
        detectedScripts: [],
        reasoning: ["Multiple unsupported app roots were detected"],
      },
      planner: {
        plannerKey: "unsupported",
        supportTier: "requires-override",
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
          code: "unsupported-runtime-family",
          reasonCode: "unsupported-runtime-family",
          category: "blocked",
          phase: "runtime-plan-resolution",
          message: "Rust and Elixir framework evidence is not yet first-class.",
          recommendation:
            "Configure explicit custom commands or provide a container-native profile.",
          evidence: [
            {
              kind: "runtime-family",
              label: "Detected runtime family",
              value: "rust",
              source: "Cargo.toml",
            },
          ],
          fixPath: [
            {
              kind: "command",
              targetOperation: "resources.configure-runtime",
              label: "Configure runtime commands",
              profileField: "runtime.startCommand",
              safeByDefault: true,
            },
          ],
          overridePath: [
            {
              kind: "command",
              targetOperation: "resources.configure-runtime",
              label: "Use explicit Dockerfile profile",
              profileField: "runtime.dockerfilePath",
              safeByDefault: true,
            },
          ],
          affectedProfileField: "runtime.startCommand",
        },
        {
          code: "ambiguous-framework-evidence",
          reasonCode: "ambiguous-framework-evidence",
          category: "blocked",
          phase: "source-detection",
          message: "Multiple source roots could own the deployment.",
          recommendation: "Select a source base directory before planning.",
          evidence: [
            {
              kind: "detected-file",
              label: "Ambiguous app roots",
              value: "Cargo.toml,mix.exs",
              source: "source-inspection",
            },
          ],
          fixPath: [
            {
              kind: "command",
              targetOperation: "resources.configure-source",
              label: "Set source base directory",
              profileField: "source.baseDirectory",
              safeByDefault: true,
            },
          ],
          overridePath: [
            {
              kind: "workflow-action",
              label: "Choose source root in draft",
              profileField: "source.baseDirectory",
              safeByDefault: true,
            },
          ],
          affectedProfileField: "source.baseDirectory",
        },
      ],
      nextActions: [
        {
          kind: "command",
          targetOperation: "resources.configure-runtime",
          label: "Configure runtime commands",
          safeByDefault: true,
          blockedReasonCode: "unsupported-runtime-family",
        },
        {
          kind: "command",
          targetOperation: "resources.configure-source",
          label: "Configure source",
          safeByDefault: true,
          blockedReasonCode: "ambiguous-framework-evidence",
        },
      ],
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(parsed.unsupportedReasons[0]?.reasonCode).toBe("unsupported-runtime-family");
    expect(parsed.unsupportedReasons[0]?.fixPath?.[0]?.profileField).toBe("runtime.startCommand");
    expect(parsed.unsupportedReasons[1]?.affectedProfileField).toBe("source.baseDirectory");
  });

  test("[DPP-PLAN-FAIL-002][DPP-PLAN-FAIL-003][DPP-PLAN-FAIL-004][WF-PLAN-FAIL-006][WF-PLAN-FAIL-008] preserves explicit override and static ready parity", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_static",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "ready",
        ready: true,
        reasonCodes: [],
      },
      source: {
        kind: "local-folder",
        displayName: "static-explicit",
        locator: "/workspace/static-explicit",
        runtimeFamily: "node",
        framework: "vite",
        packageManager: "pnpm",
        applicationShape: "static",
        detectedFiles: ["package.json", "vite.config.ts", "project.toml"],
        detectedScripts: ["build"],
        reasoning: ["Explicit static profile wins; buildpack evidence is non-winning"],
      },
      planner: {
        plannerKey: "custom",
        supportTier: "explicit-custom",
        buildStrategy: "static-artifact",
        packagingMode: "all-in-one-docker",
        targetKind: "single-server",
        targetProviderKey: "local-shell",
      },
      buildpack: {
        status: "non-winning",
        supportTier: "buildpack-accelerated",
        evidence: {
          platformFiles: ["project.toml"],
          languageFamilies: ["node"],
          frameworkHints: ["vite"],
          builderEvidence: ["default-builder-policy"],
          detectedBuildpacks: [{ id: "paketo-buildpacks/nodejs" }],
        },
        builderPolicy: {
          defaultBuilder: "paketobuildpacks/builder-jammy-base",
          override: "none",
          blockedBuilders: [],
        },
        artifactIntent: "build-image",
        limitations: [
          {
            code: "buildpack-non-winning",
            message: "Explicit static/custom profile takes precedence.",
          },
        ],
      },
      artifact: {
        kind: "static-server-image",
        runtimeArtifactKind: "image",
        runtimeArtifactIntent: "build-image",
      },
      commands: [
        { kind: "install", command: "pnpm install", source: "resource-runtime-profile" },
        { kind: "build", command: "pnpm build", source: "resource-runtime-profile" },
      ],
      network: {
        internalPort: 80,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      health: {
        enabled: true,
        kind: "http",
        path: "/",
        port: 80,
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

    expect(parsed.planner.supportTier).toBe("explicit-custom");
    expect(parsed.network.internalPort).toBe(80);
    expect(parsed.buildpack?.status).toBe("non-winning");
  });

  test("[DPP-PLAN-FAIL-005][DPP-PLAN-FAIL-006][WF-PLAN-FAIL-004][WF-PLAN-FAIL-005][WF-PLAN-FAIL-007][WF-PLAN-FAIL-010][WF-PLAN-FAIL-011][WF-PLAN-FAIL-012] exposes fix and override paths for missing configuration", () => {
    const parsed = deploymentPlanResponseSchema.parse({
      schemaVersion: "deployments.plan/v1",
      context: {
        projectId: "proj_demo",
        environmentId: "env_demo",
        resourceId: "res_missing",
        serverId: "srv_local",
        destinationId: "dst_local",
      },
      readiness: {
        status: "blocked",
        ready: false,
        reasonCodes: [
          "ambiguous-build-tool",
          "missing-build-tool",
          "missing-internal-port",
          "missing-artifact-output",
          "unsupported-runtime-target",
          "unsupported-container-native-profile",
        ],
      },
      source: {
        kind: "local-folder",
        displayName: "missing-config",
        locator: "/workspace/missing-config",
        runtimeFamily: "java",
        applicationShape: "serverful-http",
        detectedFiles: ["pom.xml", "build.gradle", "Dockerfile"],
        detectedScripts: [],
        reasoning: ["Build tool and container-native profile evidence require explicit selection"],
      },
      planner: {
        plannerKey: "unsupported",
        supportTier: "requires-override",
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
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
      health: {
        enabled: false,
        kind: "none",
      },
      warnings: [
        {
          code: "buildpack-preview-limited",
          reasonCode: "buildpack-preview-limited",
          category: "warning",
          phase: "runtime-plan-resolution",
          message: "Planner and buildpack health hints are not app-level health policy.",
          evidence: [
            {
              kind: "health-policy",
              label: "Health source",
              value: "none",
              source: "resource-health-policy",
            },
            {
              kind: "variable-boundary",
              label: "Secret variable",
              value: "masked",
              source: "environment-snapshot",
            },
          ],
        },
      ],
      unsupportedReasons: [
        {
          code: "ambiguous-build-tool",
          reasonCode: "ambiguous-build-tool",
          category: "blocked",
          phase: "runtime-plan-resolution",
          message: "Maven and Gradle evidence both exist.",
          recommendation: "Choose a build tool or source root.",
          evidence: [
            {
              kind: "build-tool",
              label: "Detected build tools",
              value: "maven,gradle",
              source: "source-inspection",
            },
          ],
          fixPath: [
            {
              kind: "command",
              targetOperation: "resources.configure-runtime",
              label: "Select build command",
              profileField: "runtime.buildCommand",
              safeByDefault: true,
            },
          ],
          overridePath: [
            {
              kind: "command",
              targetOperation: "resources.configure-runtime",
              label: "Use explicit start command",
              profileField: "runtime.startCommand",
              safeByDefault: true,
            },
          ],
          affectedProfileField: "runtime.buildCommand",
        },
        {
          code: "missing-internal-port",
          reasonCode: "missing-internal-port",
          category: "blocked",
          phase: "resource-network-resolution",
          message: "Serverful HTTP resources require an internal port.",
          recommendation: "Configure ResourceNetworkProfile.internalPort.",
          fixPath: [
            {
              kind: "command",
              targetOperation: "resources.configure-network",
              label: "Configure internal port",
              profileField: "network.internalPort",
              safeByDefault: true,
            },
          ],
          overridePath: [],
          affectedProfileField: "network.internalPort",
        },
        {
          code: "unsupported-container-native-profile",
          reasonCode: "unsupported-container-native-profile",
          category: "blocked",
          phase: "runtime-plan-resolution",
          message: "The explicit Dockerfile profile cannot be planned safely.",
          recommendation: "Fix Dockerfile path or switch to explicit commands.",
          fixPath: [
            {
              kind: "command",
              targetOperation: "resources.configure-runtime",
              label: "Fix Dockerfile path",
              profileField: "runtime.dockerfilePath",
              safeByDefault: true,
            },
          ],
          overridePath: [
            {
              kind: "command",
              targetOperation: "resources.configure-runtime",
              label: "Use Compose profile",
              profileField: "runtime.dockerComposeFilePath",
              safeByDefault: true,
            },
          ],
          affectedProfileField: "runtime.dockerfilePath",
        },
      ],
      nextActions: [
        {
          kind: "command",
          targetOperation: "resources.configure-runtime",
          label: "Configure runtime",
          safeByDefault: true,
          blockedReasonCode: "ambiguous-build-tool",
        },
        {
          kind: "command",
          targetOperation: "resources.configure-network",
          label: "Configure network",
          safeByDefault: true,
          blockedReasonCode: "missing-internal-port",
        },
      ],
      generatedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(parsed.readiness.reasonCodes).toContain("missing-artifact-output");
    expect(parsed.unsupportedReasons[1]?.affectedProfileField).toBe("network.internalPort");
    expect(parsed.warnings[0]?.evidence?.[1]?.value).toBe("masked");
    expect(parsed.nextActions[1]?.blockedReasonCode).toBe("missing-internal-port");
  });
});
