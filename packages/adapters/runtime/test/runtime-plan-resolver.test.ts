import { describe, expect, test } from "bun:test";
import type { ExecutionContext } from "@appaloft/application";
import {
  ConfigScopeValue,
  DisplayNameText,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  FilePathText,
  GeneratedAt,
  SourceDescriptor,
  SourceDetectedFileValue,
  SourceDetectedScriptValue,
  SourceFrameworkValue,
  SourceInspectionSnapshot,
  SourceKindValue,
  SourceLocator,
  SourcePackageManagerValue,
  SourceRuntimeFamilyValue,
  SourceRuntimeVersionText,
  type SourceDetectedFile,
  type SourceDetectedScript,
  type SourceFramework,
  type SourceKind,
  type SourcePackageManager,
  type SourceRuntimeFamily,
} from "@appaloft/core";

function createTestExecutionContext(): ExecutionContext {
  return {
    entrypoint: "system",
    requestId: "req_runtime_test",
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  };
}

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??=
    () =>
    () => {};
}

function createEnvironmentSnapshot(snapshotId: string) {
  return EnvironmentConfigSnapshot.rehydrate({
    id: EnvironmentSnapshotId.rehydrate(snapshotId),
    environmentId: EnvironmentId.rehydrate("env_test"),
    createdAt: GeneratedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    precedence: [
      ConfigScopeValue.rehydrate("defaults"),
      ConfigScopeValue.rehydrate("system"),
      ConfigScopeValue.rehydrate("organization"),
      ConfigScopeValue.rehydrate("project"),
      ConfigScopeValue.rehydrate("environment"),
      ConfigScopeValue.rehydrate("deployment"),
    ],
    variables: [],
  });
}

function createSourceInspection(input: {
  runtimeFamily?: SourceRuntimeFamily;
  framework?: SourceFramework;
  packageManager?: SourcePackageManager;
  runtimeVersion?: string;
  detectedFiles?: SourceDetectedFile[];
  detectedScripts?: SourceDetectedScript[];
  dockerfilePath?: string;
  composeFilePath?: string;
}): SourceInspectionSnapshot {
  return SourceInspectionSnapshot.rehydrate({
    ...(input.runtimeFamily
      ? { runtimeFamily: SourceRuntimeFamilyValue.rehydrate(input.runtimeFamily) }
      : {}),
    ...(input.framework ? { framework: SourceFrameworkValue.rehydrate(input.framework) } : {}),
    ...(input.packageManager
      ? { packageManager: SourcePackageManagerValue.rehydrate(input.packageManager) }
      : {}),
    ...(input.runtimeVersion
      ? { runtimeVersion: SourceRuntimeVersionText.rehydrate(input.runtimeVersion) }
      : {}),
    ...(input.detectedFiles
      ? {
          detectedFiles: input.detectedFiles.map((file) =>
            SourceDetectedFileValue.rehydrate(file),
          ),
        }
      : {}),
    ...(input.detectedScripts
      ? {
          detectedScripts: input.detectedScripts.map((script) =>
            SourceDetectedScriptValue.rehydrate(script),
          ),
        }
      : {}),
    ...(input.dockerfilePath ? { dockerfilePath: FilePathText.rehydrate(input.dockerfilePath) } : {}),
    ...(input.composeFilePath
      ? { composeFilePath: FilePathText.rehydrate(input.composeFilePath) }
      : {}),
  });
}

function createSource(input: {
  kind: SourceKind;
  locator: string;
  displayName: string;
  inspection?: SourceInspectionSnapshot;
  metadata?: Record<string, string>;
}): SourceDescriptor {
  return SourceDescriptor.rehydrate({
    kind: SourceKindValue.rehydrate(input.kind),
    locator: SourceLocator.rehydrate(input.locator),
    displayName: DisplayNameText.rehydrate(input.displayName),
    ...(input.inspection ? { inspection: input.inspection } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

describe("DefaultRuntimePlanResolver", () => {
  test("renders workspace Dockerfiles through the Dockerfile builder", async () => {
    const { renderWorkspaceDockerfile } = await import("../src/workspace-planners");

    const dockerfile = renderWorkspaceDockerfile({
      baseImage: "node:22-alpine",
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_ENV: "production",
      },
      beforeCopyRunCommands: ["corepack enable || true"],
      installCommand: "pnpm install",
      buildCommand: "pnpm build",
      port: 3000,
      startCommand: "pnpm start",
    });

    expect(dockerfile).toBe(
      [
        "FROM node:22-alpine",
        "WORKDIR /app",
        'ENV NEXT_TELEMETRY_DISABLED="1"',
        'ENV NODE_ENV="production"',
        'RUN ["sh","-lc","corepack enable || true"]',
        "COPY . .",
        'RUN ["sh","-lc","pnpm install"]',
        'RUN ["sh","-lc","pnpm build"]',
        "EXPOSE 3000",
        'CMD ["sh","-lc","pnpm start"]',
        "",
      ].join("\n"),
    );
  });

  test("renders static site Dockerfiles for prebuilt publish directories", async () => {
    const { renderStaticSiteDockerfile } = await import("../src/workspace-planners");

    const dockerfile = renderStaticSiteDockerfile({
      publishDirectory: "/dist",
    });

    expect(dockerfile).toBe(
      [
        "FROM nginx:1.27-alpine",
        'COPY ["dist/","/usr/share/nginx/html/"]',
        "EXPOSE 80",
        'CMD ["nginx","-g","daemon off;"]',
        "",
      ].join("\n"),
    );
  });

  test("renders static site Dockerfiles with build commands before the server stage", async () => {
    const { renderStaticSiteDockerfile } = await import("../src/workspace-planners");

    const dockerfile = renderStaticSiteDockerfile({
      publishDirectory: "/dist",
      installCommand: "pnpm install",
      buildCommand: "pnpm build",
    });

    expect(dockerfile).toBe(
      [
        "FROM node:22-alpine AS build",
        "WORKDIR /app",
        'RUN ["sh","-lc","corepack enable || true"]',
        "COPY . .",
        'RUN ["sh","-lc","pnpm install"]',
        'RUN ["sh","-lc","pnpm build"]',
        "FROM nginx:1.27-alpine",
        'COPY --from=build ["/app/dist/","/usr/share/nginx/html/"]',
        "EXPOSE 80",
        'CMD ["nginx","-g","daemon off;"]',
        "",
      ].join("\n"),
    );
  });

  test("selects workspace commands when explicitly requested", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_1",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/demo",
        displayName: "demo",
      }),
      server: {
        id: "srv_1",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_1"),
      detectedReasoning: ["detected local folder"],
      requestedDeployment: {
        method: "workspace-commands",
        buildCommand: "node build.mjs",
        startCommand: "node dist/server.js",
        port: 4310,
        healthCheckPath: "/health",
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("workspace-commands");
    expect(plan.packagingMode).toBe("all-in-one-docker");
    expect(plan.runtimeArtifact).toEqual(
      expect.objectContaining({
        kind: "image",
        intent: "build-image",
        metadata: expect.objectContaining({
          generatedDockerfile: "true",
          dockerfilePath: "Dockerfile.appaloft",
        }),
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "docker-container",
        dockerfilePath: "Dockerfile.appaloft",
        buildCommand: "node build.mjs",
        startCommand: "node dist/server.js",
        port: 4310,
        healthCheckPath: "/health",
      }),
    );
    expect(
      plan.execution.verificationSteps.map((step) => ({ kind: step.kind, label: step.label })),
    ).toEqual([
      {
        kind: "internal-http",
        label: "Verify internal container health",
      },
    ]);
    expect(plan.steps).toContain("Build workspace image");
    expect(plan.steps).toContain("Run docker container");
  });

  test("uses the Next.js workspace planner when framework metadata is detected", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_next",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/next-app",
        displayName: "next-app",
        inspection: createSourceInspection({
          runtimeFamily: "node",
          framework: "nextjs",
          packageManager: "pnpm",
          runtimeVersion: "22",
          detectedFiles: ["package-json", "next-config"],
          detectedScripts: ["build", "start"],
        }),
      }),
      server: {
        id: "srv_next",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_next"),
      detectedReasoning: ["detected next app"],
      requestedDeployment: {
        method: "auto",
        port: 4315,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("workspace-commands");
    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "nextjs",
        runtimeKind: "nextjs",
        baseImage: "node:22-alpine",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "docker-container",
        installCommand: "pnpm install",
        buildCommand: "pnpm build",
        startCommand: "pnpm start",
        port: 4315,
      }),
    );
  });

  test("uses the Python workspace planner when Python metadata is detected", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_python",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/python-app",
        displayName: "python-app",
        inspection: createSourceInspection({
          runtimeFamily: "python",
          runtimeVersion: "3.12",
          detectedFiles: ["requirements-txt"],
        }),
      }),
      server: {
        id: "srv_python",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_python"),
      detectedReasoning: ["detected python app"],
      requestedDeployment: {
        method: "workspace-commands",
        startCommand: "python -m app",
        port: 4316,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("workspace-commands");
    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "python",
        runtimeKind: "python",
        baseImage: "python:3.12-slim",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "docker-container",
        installCommand: "pip install --no-cache-dir -r requirements.txt",
        startCommand: "python -m app",
        port: 4316,
      }),
    );
  });

  test("prefers dockerfile deployment when Dockerfile is present", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_2",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/docker-app",
        displayName: "docker-app",
        inspection: createSourceInspection({
          runtimeFamily: "node",
          packageManager: "npm",
          detectedFiles: ["dockerfile", "package-json"],
          dockerfilePath: "Dockerfile",
        }),
      }),
      server: {
        id: "srv_2",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_2"),
      detectedReasoning: ["detected dockerfile"],
      requestedDeployment: {
        method: "auto",
        port: 4311,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("dockerfile");
    expect(plan.runtimeArtifact).toEqual(
      expect.objectContaining({
        kind: "image",
        intent: "build-image",
        metadata: expect.objectContaining({
          dockerfilePath: "Dockerfile",
        }),
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "docker-container",
        dockerfilePath: "Dockerfile",
        port: 4311,
      }),
    );
    expect(
      plan.execution.verificationSteps.map((step) => ({ kind: step.kind, label: step.label })),
    ).toEqual([
      {
        kind: "internal-http",
        label: "Verify internal container health",
      },
    ]);
    expect(plan.execution.accessRoutes).toEqual([]);
    expect(plan.steps).toContain("Verify internal container health");
    expect(plan.steps).not.toContain("Verify public access route");
    expect(plan.steps).not.toContain("Configure edge proxy");
  });

  test("adds a direct-port access route only when the resource exposure mode is direct-port", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_direct_port",
      source: createSource({
        kind: "docker-image",
        locator: "docker://ghcr.io/example/app:latest",
        displayName: "app",
      }),
      server: {
        id: "srv_direct",
        providerKey: "generic-ssh",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_direct"),
      detectedReasoning: ["configured docker image"],
      requestedDeployment: {
        method: "prebuilt-image",
        port: 4314,
        exposureMode: "direct-port",
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    const [route] = plan.execution.accessRoutes;

    expect(plan.runtimeArtifact).toEqual(
      expect.objectContaining({
        kind: "image",
        intent: "prebuilt-image",
        image: "ghcr.io/example/app:latest",
      }),
    );
    expect(route?.domains).toEqual([]);
    expect(route?.proxyKind).toBe("none");
    expect(route?.targetPort).toBe(4314);
  });

  test("adds access routes when public domains are requested", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_3",
      source: createSource({
        kind: "docker-image",
        locator: "docker://ghcr.io/example/app:latest",
        displayName: "app",
      }),
      server: {
        id: "srv_3",
        providerKey: "generic-ssh",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_3"),
      detectedReasoning: ["detected docker image"],
      requestedDeployment: {
        method: "prebuilt-image",
        port: 4312,
        domains: ["api.example.com"],
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    const [route] = plan.execution.accessRoutes;

    expect(route?.domains).toEqual(["api.example.com"]);
    expect(route?.proxyKind).toBe("traefik");
    expect(route?.pathPrefix).toBe("/");
    expect(route?.tlsMode).toBe("auto");
    expect(route?.targetPort).toBe(4312);
    expect(
      plan.execution.verificationSteps.map((step) => ({ kind: step.kind, label: step.label })),
    ).toEqual([
      {
        kind: "internal-http",
        label: "Verify internal container health",
      },
      {
        kind: "public-http",
        label: "Verify public access route",
      },
    ]);
    expect(plan.steps).toContain("Configure edge proxy");
    expect(plan.steps).toContain("Verify internal container health");
    expect(plan.steps).toContain("Verify public access route");
  });

  test("defaults public git sources to target-side dockerfile builds", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_4",
      source: createSource({
        kind: "git-public",
        locator: "https://github.com/example/app.git",
        displayName: "app",
      }),
      server: {
        id: "srv_4",
        providerKey: "generic-ssh",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_4"),
      detectedReasoning: ["configured public git source"],
      requestedDeployment: {
        method: "auto",
        port: 4313,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.source.kind).toBe("git-public");
    expect(plan.buildStrategy).toBe("dockerfile");
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "docker-container",
        dockerfilePath: "Dockerfile",
        port: 4313,
      }),
    );
  });

  test("plans inline compose sources as compose stacks", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_5",
      source: createSource({
        kind: "docker-compose-inline",
        locator: "inline://docker-compose.yml",
        displayName: "compose",
        inspection: createSourceInspection({
          detectedFiles: ["compose-manifest"],
          composeFilePath: "compose.yml",
        }),
        metadata: {
          content: "services: {}",
        },
      }),
      server: {
        id: "srv_5",
        providerKey: "generic-ssh",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_5"),
      detectedReasoning: ["configured inline compose source"],
      requestedDeployment: {
        method: "auto",
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.source.kind).toBe("docker-compose-inline");
    expect(plan.buildStrategy).toBe("compose-deploy");
    expect(plan.runtimeArtifact).toEqual(
      expect.objectContaining({
        kind: "compose-project",
        intent: "compose-project",
        composeFile: "compose.yml",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "docker-compose-stack",
        composeFile: "compose.yml",
      }),
    );
  });

  test("[DEP-CREATE-ADM-026] static strategy packages publish directory as static server image artifact", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_static",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/static-site",
        displayName: "static-site",
        metadata: {
          baseDirectory: "/site",
        },
      }),
      server: {
        id: "srv_static",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_static"),
      detectedReasoning: ["configured static site"],
      requestedDeployment: {
        method: "static",
        installCommand: "pnpm install",
        buildCommand: "pnpm build",
        publishDirectory: "/dist",
        port: 80,
        exposureMode: "reverse-proxy",
        upstreamProtocol: "http",
      } as never,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("static-artifact");
    expect(plan.packagingMode).toBe("all-in-one-docker");
    expect(plan.runtimeArtifact).toEqual(
      expect.objectContaining({
        kind: "image",
        intent: "build-image",
        metadata: expect.objectContaining({
          sourceKind: "local-folder",
          publishDirectory: "/dist",
          staticServer: "adapter-owned",
        }),
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "docker-container",
        dockerfilePath: "Dockerfile.appaloft-static",
        installCommand: "pnpm install",
        buildCommand: "pnpm build",
        port: 80,
        metadata: expect.objectContaining({
          "static.publishDirectory": "/dist",
          "static.server": "adapter-owned",
        }),
      }),
    );
    expect(plan.steps).toContain("Package static site");
    expect(plan.steps).toContain("Run static server container");
  });
});
