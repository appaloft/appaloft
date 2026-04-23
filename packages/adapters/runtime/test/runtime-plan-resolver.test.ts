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
import { pinnedBunAlpineImage } from "../src/workspace-planners/bun";

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

const staticServerConfigInstruction = [
  'RUN ["sh","-lc","printf \'%s\\\\n\' ',
  "'server {' ",
  "'  listen 80;' ",
  "'  server_name _;' ",
  "'  root /usr/share/nginx/html;' ",
  "'  index index.html;' ",
  "'' ",
  "'  location ~* \\\\.[A-Za-z0-9][A-Za-z0-9._-]*$ {' ",
  "'    try_files $uri =404;' ",
  "'  }' ",
  "'' ",
  "'  location / {' ",
  "'    try_files $uri $uri/ /index.html;' ",
  "'  }' ",
  "'}' > '/etc/nginx/conf.d/default.conf'\"]",
].join("");

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
        staticServerConfigInstruction,
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
        staticServerConfigInstruction,
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

  test("[WF-PLAN-DET-007][WF-PLAN-CAT-001] classifies Next.js workspace plans as SSR", async () => {
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
        applicationShape: "ssr",
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
    expect(plan.execution.metadata).toEqual(
      expect.objectContaining({
        "workspace.applicationShape": "ssr",
      }),
    );
  });

  test("preserves runtime context metadata in execution plans", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_labels",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/demo",
        displayName: "workspace",
      }),
      server: {
        id: "srv_demo",
        providerKey: "generic-ssh",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_labels"),
      detectedReasoning: ["local folder"],
      requestedDeployment: {
        method: "workspace-commands",
        installCommand: "bun install",
        buildCommand: "bun run build",
        startCommand: "bun start",
        port: 4321,
        exposureMode: "reverse-proxy",
        upstreamProtocol: "http",
        accessContext: {
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          resourceSlug: "web",
          destinationId: "dst_demo",
          exposureMode: "reverse-proxy",
          upstreamProtocol: "http",
          routePurpose: "default-resource-access",
        },
        runtimeMetadata: {
          "context.environmentKind": "preview",
          "context.environmentName": "preview-pr-14",
          "context.resourceKind": "application",
          "preview.id": "pr-14",
          "preview.number": "14",
          "preview.mode": "pull-request",
        },
        accessRouteMetadata: {
          "access.routeSource": "server-applied-config-domain",
          "access.hostname": "14.preview.appaloft.com",
        },
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.execution.metadata).toEqual(
      expect.objectContaining({
        "resource.exposureMode": "reverse-proxy",
        "resource.upstreamProtocol": "http",
        "resource.id": "res_demo",
        "resource.slug": "web",
        "context.environmentKind": "preview",
        "context.environmentName": "preview-pr-14",
        "context.resourceKind": "application",
        "preview.id": "pr-14",
        "preview.number": "14",
        "preview.mode": "pull-request",
        "access.routeSource": "server-applied-config-domain",
        "access.hostname": "14.preview.appaloft.com",
      }),
    );
  });

  test("[WF-PLAN-DET-007][WF-PLAN-CAT-002] packages detected Next.js static export as static artifact", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_next_static",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/next-static-app",
        displayName: "next-static-app",
        inspection: createSourceInspection({
          runtimeFamily: "node",
          framework: "nextjs",
          packageManager: "pnpm",
          runtimeVersion: "22",
          detectedFiles: ["package-json", "next-config", "pnpm-lock"],
          detectedScripts: ["build", "export"],
        }),
      }),
      server: {
        id: "srv_next_static",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_next_static"),
      detectedReasoning: ["detected next static export app"],
      requestedDeployment: {
        method: "auto",
        port: 80,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("static-artifact");
    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "nextjs-static",
        runtimeKind: "static",
        framework: "nextjs",
        packageManager: "pnpm",
        baseImage: "node:22-alpine",
        publishDirectory: "/out",
        applicationShape: "static",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        dockerfilePath: "Dockerfile.appaloft-static",
        installCommand: "pnpm install",
        buildCommand: "pnpm build",
        port: 80,
      }),
    );
    expect(plan.execution.metadata).toEqual(
      expect.objectContaining({
        "static.publishDirectory": "/out",
        "workspace.planner": "nextjs-static",
        "workspace.applicationShape": "static",
      }),
    );
  });

  test("[DEP-CREATE-ADM-028][WF-PLAN-DET-007][WF-PLAN-CAT-007] packages Vite static output with typed planner evidence", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_vite_static",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/vite-app",
        displayName: "vite-app",
        inspection: createSourceInspection({
          runtimeFamily: "node",
          framework: "vite",
          packageManager: "yarn",
          runtimeVersion: "20",
          detectedFiles: ["package-json", "vite-config", "yarn-lock"],
          detectedScripts: ["build"],
        }),
      }),
      server: {
        id: "srv_vite",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_vite"),
      detectedReasoning: ["detected vite app"],
      requestedDeployment: {
        method: "auto",
        port: 80,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("static-artifact");
    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "vite-static",
        runtimeKind: "static",
        framework: "vite",
        packageManager: "yarn",
        baseImage: "node:20-alpine",
        publishDirectory: "/dist",
        applicationShape: "static",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        kind: "docker-container",
        dockerfilePath: "Dockerfile.appaloft-static",
        installCommand: "yarn install --frozen-lockfile",
        buildCommand: "yarn build",
        port: 80,
      }),
    );
    expect(plan.execution.metadata).toEqual(
      expect.objectContaining({
        "static.publishDirectory": "/dist",
        "workspace.planner": "vite-static",
        "workspace.framework": "vite",
        "workspace.packageManager": "yarn",
        "workspace.baseImage": "node:20-alpine",
        "workspace.applicationShape": "static",
      }),
    );
  });

  test("[DEP-CREATE-ADM-033] packages Nuxt generate output as static artifact", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_nuxt_static",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/nuxt-app",
        displayName: "nuxt-app",
        inspection: createSourceInspection({
          runtimeFamily: "node",
          framework: "nuxt",
          packageManager: "pnpm",
          runtimeVersion: "22",
          detectedFiles: ["package-json", "nuxt-config", "pnpm-lock"],
          detectedScripts: ["generate"],
        }),
      }),
      server: {
        id: "srv_nuxt",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_nuxt"),
      detectedReasoning: ["detected nuxt generate app"],
      requestedDeployment: {
        method: "auto",
        port: 80,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("static-artifact");
    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "nuxt-static",
        runtimeKind: "static",
        framework: "nuxt",
        packageManager: "pnpm",
        publishDirectory: "/.output/public",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        dockerfilePath: "Dockerfile.appaloft-static",
        installCommand: "pnpm install",
        buildCommand: "pnpm generate",
        port: 80,
      }),
    );
  });

  test("[WF-PLAN-DET-007][WF-PLAN-CAT-005] refuses ambiguous SvelteKit auto planning without explicit strategy or start command", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_sveltekit_ambiguous",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/sveltekit-ambiguous-app",
        displayName: "sveltekit-ambiguous-app",
        inspection: createSourceInspection({
          runtimeFamily: "node",
          framework: "sveltekit",
          packageManager: "pnpm",
          detectedFiles: ["package-json", "svelte-config", "pnpm-lock"],
          detectedScripts: ["build", "start"],
        }),
      }),
      server: {
        id: "srv_sveltekit_ambiguous",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_sveltekit_ambiguous"),
      detectedReasoning: ["detected sveltekit app without adapter evidence"],
      requestedDeployment: {
        method: "auto",
        port: 3000,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toEqual(
      expect.objectContaining({
        phase: "runtime-plan-resolution",
        framework: "sveltekit",
        applicationShape: "hybrid-static-server",
      }),
    );
  });

  test("[DEP-CREATE-ADM-033] resolves explicit SvelteKit static output defaults", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_sveltekit_static",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/sveltekit-app",
        displayName: "sveltekit-app",
        inspection: createSourceInspection({
          runtimeFamily: "node",
          framework: "sveltekit",
          packageManager: "bun",
          detectedFiles: ["package-json", "svelte-config", "bun-lock"],
          detectedScripts: ["build"],
        }),
      }),
      server: {
        id: "srv_sveltekit",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_sveltekit"),
      detectedReasoning: ["detected sveltekit static app"],
      requestedDeployment: {
        method: "static",
        port: 80,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("static-artifact");
    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "sveltekit-static",
        runtimeKind: "static",
        framework: "sveltekit",
        packageManager: "bun",
        baseImage: pinnedBunAlpineImage,
        publishDirectory: "/build",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        installCommand: "bun install",
        buildCommand: "bun run build",
        port: 80,
      }),
    );
  });

  test("[DEP-CREATE-ADM-028][WF-PLAN-DET-007][WF-PLAN-CAT-003] uses the Remix workspace planner before generic Node", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_remix",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/remix-app",
        displayName: "remix-app",
        inspection: createSourceInspection({
          runtimeFamily: "node",
          framework: "remix",
          packageManager: "npm",
          runtimeVersion: "22",
          detectedFiles: ["package-json", "remix-config", "package-lock"],
          detectedScripts: ["build", "start"],
        }),
      }),
      server: {
        id: "srv_remix",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_remix"),
      detectedReasoning: ["detected remix app"],
      requestedDeployment: {
        method: "auto",
        port: 4321,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("workspace-commands");
    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "remix",
        runtimeKind: "remix",
        framework: "remix",
        packageManager: "npm",
        baseImage: "node:22-alpine",
        applicationShape: "ssr",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        installCommand: "npm install",
        buildCommand: "npm run build",
        startCommand: "npm run start",
        port: 4321,
      }),
    );
  });

  test("[DEP-CREATE-ADM-031][WF-PLAN-DET-007][WF-PLAN-CAT-008] keeps serverful framework planner metadata", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_express",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/express-app",
        displayName: "express-app",
        inspection: createSourceInspection({
          runtimeFamily: "node",
          framework: "express",
          packageManager: "pnpm",
          runtimeVersion: "22",
          detectedFiles: ["package-json", "pnpm-lock"],
          detectedScripts: ["build", "start"],
        }),
      }),
      server: {
        id: "srv_express",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_express"),
      detectedReasoning: ["detected express app"],
      requestedDeployment: {
        method: "auto",
        port: 4317,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("workspace-commands");
    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "node",
        runtimeKind: "node",
        framework: "express",
        packageManager: "pnpm",
        baseImage: "node:22-alpine",
        applicationShape: "serverful-http",
      }),
    );
    expect(plan.execution.metadata).toEqual(
      expect.objectContaining({
        "workspace.baseImage": "node:22-alpine",
        "workspace.applicationShape": "serverful-http",
        framework: "express",
        packageManager: "pnpm",
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

  test("[DEP-CREATE-ADM-028][WF-PLAN-DET-007][WF-PLAN-CAT-009] uses the FastAPI workspace planner with uv defaults", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_fastapi",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/fastapi-app",
        displayName: "fastapi-app",
        inspection: createSourceInspection({
          runtimeFamily: "python",
          framework: "fastapi",
          packageManager: "uv",
          runtimeVersion: "3.12",
          detectedFiles: ["pyproject-toml", "uv-lock"],
        }),
      }),
      server: {
        id: "srv_fastapi",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_fastapi"),
      detectedReasoning: ["detected fastapi app"],
      requestedDeployment: {
        method: "auto",
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.buildStrategy).toBe("workspace-commands");
    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "fastapi",
        runtimeKind: "fastapi",
        framework: "fastapi",
        packageManager: "uv",
        baseImage: "python:3.12-slim",
        applicationShape: "serverful-http",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        installCommand: "pip install --no-cache-dir uv && uv sync --frozen --no-dev",
        startCommand: "uv run python -m uvicorn main:app --host 0.0.0.0 --port 3000",
        port: 3000,
      }),
    );
  });

  test("[DEP-CREATE-ADM-028] uses the Django workspace planner with manage.py evidence", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_django",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/django-app",
        displayName: "django-app",
        inspection: createSourceInspection({
          runtimeFamily: "python",
          framework: "django",
          packageManager: "poetry",
          runtimeVersion: "3.11",
          detectedFiles: ["pyproject-toml", "poetry-lock", "django-manage"],
        }),
      }),
      server: {
        id: "srv_django",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_django"),
      detectedReasoning: ["detected django app"],
      requestedDeployment: {
        method: "auto",
        port: 4319,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "django",
        runtimeKind: "django",
        framework: "django",
        packageManager: "poetry",
        baseImage: "python:3.11-slim",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        installCommand:
          "pip install --no-cache-dir poetry && poetry install --only main --no-root",
        startCommand: "poetry run python manage.py runserver 0.0.0.0:4319",
        port: 4319,
      }),
    );
  });

  test("[DEP-CREATE-ADM-028] uses the Flask workspace planner with pip defaults", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_flask",
      source: createSource({
        kind: "local-folder",
        locator: "/tmp/flask-app",
        displayName: "flask-app",
        inspection: createSourceInspection({
          runtimeFamily: "python",
          framework: "flask",
          packageManager: "pip",
          detectedFiles: ["requirements-txt"],
        }),
      }),
      server: {
        id: "srv_flask",
        providerKey: "local-shell",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_flask"),
      detectedReasoning: ["detected flask app"],
      requestedDeployment: {
        method: "auto",
        port: 4320,
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(plan.runtimeArtifact?.metadata).toEqual(
      expect.objectContaining({
        planner: "flask",
        runtimeKind: "flask",
        framework: "flask",
        packageManager: "pip",
        baseImage: "python:3.12-slim",
      }),
    );
    expect(plan.execution).toEqual(
      expect.objectContaining({
        installCommand: "pip install --no-cache-dir -r requirements.txt",
        startCommand: "python -m flask run --host 0.0.0.0 --port 4320",
        port: 4320,
      }),
    );
  });

  test("[WF-PLAN-DET-009][WF-PLAN-CAT-016] prefers container-native Dockerfile deployment when Dockerfile is present", async () => {
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
          applicationShape: "container-native",
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

  test("[EDGE-PROXY-ROUTE-005] adds multiple requested access route groups", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimePlanResolver } = await import("../src");
    const resolver = new DefaultRuntimePlanResolver();
    const context = createTestExecutionContext();

    const result = await resolver.resolve(context, {
      id: "plan_multi_routes",
      source: createSource({
        kind: "docker-image",
        locator: "docker://ghcr.io/example/app:latest",
        displayName: "app",
      }),
      server: {
        id: "srv_multi_routes",
        providerKey: "generic-ssh",
      },
      environmentSnapshot: createEnvironmentSnapshot("snap_multi_routes"),
      detectedReasoning: ["detected docker image"],
      requestedDeployment: {
        method: "prebuilt-image",
        port: 4312,
        accessRoutes: [
          {
            proxyKind: "traefik",
            domains: ["www.example.com"],
            pathPrefix: "/",
            tlsMode: "auto",
          },
          {
            proxyKind: "traefik",
            domains: ["www.example.com"],
            pathPrefix: "/admin",
            tlsMode: "disabled",
          },
        ],
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();

    expect(
      plan.execution.accessRoutes.map((route) => ({
        proxyKind: route.proxyKind,
        domains: route.domains,
        pathPrefix: route.pathPrefix,
        tlsMode: route.tlsMode,
        targetPort: route.targetPort,
      })),
    ).toEqual([
      {
        proxyKind: "traefik",
        domains: ["www.example.com"],
        pathPrefix: "/",
        tlsMode: "auto",
        targetPort: 4312,
      },
      {
        proxyKind: "traefik",
        domains: ["www.example.com"],
        pathPrefix: "/admin",
        tlsMode: "disabled",
        targetPort: 4312,
      },
    ]);
    expect(plan.steps).toContain("Configure edge proxy");
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
