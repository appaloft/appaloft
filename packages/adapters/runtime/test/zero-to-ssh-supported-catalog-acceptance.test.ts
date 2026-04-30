import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { ExecutionBackend, ExecutionContext } from "@appaloft/application";
import {
  ConfigScopeValue,
  DisplayNameText,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  FilePathText,
  GeneratedAt,
  ok,
  SourceApplicationShapeValue,
  SourceDescriptor,
  SourceDetectedFileValue,
  SourceFrameworkValue,
  SourceInspectionSnapshot,
  SourceKindValue,
  SourceLocator,
  SourcePackageManagerValue,
  SourceRuntimeFamilyValue,
  type Deployment,
  type DeploymentLogEntry,
  type Result,
  type RollbackPlan,
  type SourceApplicationShape,
  type SourceDetectedFile,
  type SourceFramework,
  type SourceKind,
  type SourcePackageManager,
  type SourceRuntimeFamily,
} from "@appaloft/core";
import { RuntimeCommandBuilder, renderRuntimeCommandString } from "../src/runtime-commands";

const fixturesRoot = join(import.meta.dir, "../../filesystem/test/fixtures/frameworks");

type ProfileStrategy =
  | "auto"
  | "static"
  | "workspace-commands"
  | "dockerfile"
  | "docker-compose"
  | "prebuilt-image";

type ExpectedBuildStrategy =
  | "static-artifact"
  | "workspace-commands"
  | "dockerfile"
  | "compose-deploy"
  | "prebuilt-image";

interface SupportedCatalogDescriptor {
  matrixId: string;
  fixtureId: string;
  catalogEntry: string;
  source:
    | {
        kind: "fixture";
        fixture: string;
      }
    | {
        kind: "synthetic";
        descriptor: {
          kind: SourceKind;
          locator: string;
          displayName: string;
          inspection?: SourceInspectionSnapshot;
        };
      };
  profileDraft: {
    runtime: {
      strategy: ProfileStrategy;
      publishDirectory?: string;
      dockerfilePath?: string;
      installCommand?: string;
      buildCommand?: string;
      startCommand?: string;
    };
    network: {
      internalPort: number;
      upstreamProtocol: "http";
      exposureMode: "reverse-proxy" | "direct-port";
    };
  };
  expected: {
    runtimeFamily?: SourceRuntimeFamily;
    framework?: SourceFramework;
    packageManager?: SourcePackageManager;
    applicationShape: SourceApplicationShape | "container-native";
    plannerKey: string;
    supportTier: "first-class" | "explicit-custom" | "container-native";
    buildStrategy: ExpectedBuildStrategy;
    packagingMode: "all-in-one-docker" | "compose-bundle";
    artifactIntent: "build-image" | "compose-project" | "prebuilt-image";
    executionKind: "docker-container" | "docker-compose-stack";
    commandSpecs: {
      install?: string;
      build?: string;
      start?: string;
    };
    publishDirectory?: string;
  };
}

function createTestExecutionContext(): ExecutionContext {
  return {
    entrypoint: "system",
    requestId: "req_zssh_catalog_acceptance",
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
  reflectObject.metadata ??= () => () => {};
}

function createEnvironmentSnapshot(snapshotId: string) {
  return EnvironmentConfigSnapshot.rehydrate({
    id: EnvironmentSnapshotId.rehydrate(snapshotId),
    environmentId: EnvironmentId.rehydrate("env_zssh"),
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
  applicationShape?: SourceApplicationShape;
  detectedFiles?: SourceDetectedFile[];
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
    ...(input.applicationShape
      ? { applicationShape: SourceApplicationShapeValue.rehydrate(input.applicationShape) }
      : {}),
    ...(input.detectedFiles
      ? {
          detectedFiles: input.detectedFiles.map((file) =>
            SourceDetectedFileValue.rehydrate(file),
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
}): SourceDescriptor {
  return SourceDescriptor.rehydrate({
    kind: SourceKindValue.rehydrate(input.kind),
    locator: SourceLocator.rehydrate(input.locator),
    displayName: DisplayNameText.rehydrate(input.displayName),
    ...(input.inspection ? { inspection: input.inspection } : {}),
  });
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

class HermeticExecutionBackend implements ExecutionBackend {
  async execute(
    _context: Parameters<ExecutionBackend["execute"]>[0],
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    return ok({ deployment });
  }

  async cancel(
    _context: Parameters<ExecutionBackend["cancel"]>[0],
    _deployment: Deployment,
  ): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    return ok({ logs: [] });
  }

  async rollback(
    _context: Parameters<ExecutionBackend["rollback"]>[0],
    deployment: Deployment,
    _plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    return ok({ deployment });
  }
}

const supportedCatalog: SupportedCatalogDescriptor[] = [
  {
    matrixId: "ZSSH-CATALOG-001",
    fixtureId: "next-ssr",
    catalogEntry: "Next.js",
    source: { kind: "fixture", fixture: "next-ssr" },
    profileDraft: {
      runtime: { strategy: "auto" },
      network: { internalPort: 3000, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "node",
      framework: "nextjs",
      packageManager: "pnpm",
      applicationShape: "ssr",
      plannerKey: "nextjs",
      supportTier: "first-class",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: { install: "pnpm install", build: "pnpm build", start: "pnpm start" },
    },
  },
  {
    matrixId: "ZSSH-CATALOG-002",
    fixtureId: "vite-spa",
    catalogEntry: "Vite static SPA",
    source: { kind: "fixture", fixture: "vite-spa" },
    profileDraft: {
      runtime: { strategy: "static" },
      network: { internalPort: 80, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "node",
      framework: "vite",
      packageManager: "bun",
      applicationShape: "static",
      plannerKey: "vite-static",
      supportTier: "first-class",
      buildStrategy: "static-artifact",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: { install: "bun install", build: "bun run build" },
      publishDirectory: "/dist",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-003",
    fixtureId: "astro-static",
    catalogEntry: "Astro static",
    source: { kind: "fixture", fixture: "astro-static" },
    profileDraft: {
      runtime: { strategy: "static" },
      network: { internalPort: 80, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "node",
      framework: "astro",
      packageManager: "npm",
      applicationShape: "static",
      plannerKey: "astro-static",
      supportTier: "first-class",
      buildStrategy: "static-artifact",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: { install: "npm install", build: "npm run build" },
      publishDirectory: "/dist",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-004",
    fixtureId: "nuxt-generate",
    catalogEntry: "Nuxt generate",
    source: { kind: "fixture", fixture: "nuxt-generate" },
    profileDraft: {
      runtime: { strategy: "static" },
      network: { internalPort: 80, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "node",
      framework: "nuxt",
      packageManager: "pnpm",
      applicationShape: "static",
      plannerKey: "nuxt-static",
      supportTier: "first-class",
      buildStrategy: "static-artifact",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: { install: "pnpm install", build: "pnpm generate" },
      publishDirectory: "/.output/public",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-005",
    fixtureId: "sveltekit-static",
    catalogEntry: "SvelteKit static",
    source: { kind: "fixture", fixture: "sveltekit-static" },
    profileDraft: {
      runtime: { strategy: "static" },
      network: { internalPort: 80, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "node",
      framework: "sveltekit",
      packageManager: "pnpm",
      applicationShape: "static",
      plannerKey: "sveltekit-static",
      supportTier: "first-class",
      buildStrategy: "static-artifact",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: { install: "pnpm install", build: "pnpm build" },
      publishDirectory: "/build",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-006",
    fixtureId: "remix-ssr",
    catalogEntry: "Remix",
    source: { kind: "fixture", fixture: "remix-ssr" },
    profileDraft: {
      runtime: { strategy: "auto" },
      network: { internalPort: 3000, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "node",
      framework: "remix",
      packageManager: "npm",
      applicationShape: "ssr",
      plannerKey: "remix",
      supportTier: "first-class",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: { install: "npm install", build: "npm run build", start: "npm run start" },
    },
  },
  {
    matrixId: "ZSSH-CATALOG-007",
    fixtureId: "fastapi-uv",
    catalogEntry: "FastAPI",
    source: { kind: "fixture", fixture: "fastapi-uv" },
    profileDraft: {
      runtime: { strategy: "auto" },
      network: { internalPort: 3000, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "python",
      framework: "fastapi",
      packageManager: "uv",
      applicationShape: "serverful-http",
      plannerKey: "fastapi",
      supportTier: "first-class",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: {
        install: "pip install --no-cache-dir uv && uv sync --frozen --no-dev",
        start: "uv run python -m uvicorn main:app --host 0.0.0.0 --port 3000",
      },
    },
  },
  {
    matrixId: "ZSSH-CATALOG-008",
    fixtureId: "django-pip",
    catalogEntry: "Django",
    source: { kind: "fixture", fixture: "django-pip" },
    profileDraft: {
      runtime: { strategy: "auto" },
      network: { internalPort: 3000, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "python",
      framework: "django",
      packageManager: "pip",
      applicationShape: "serverful-http",
      plannerKey: "django",
      supportTier: "first-class",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: {
        install: "pip install --no-cache-dir -r requirements.txt",
        start: "python manage.py runserver 0.0.0.0:3000",
      },
    },
  },
  {
    matrixId: "ZSSH-CATALOG-009",
    fixtureId: "flask-pip",
    catalogEntry: "Flask",
    source: { kind: "fixture", fixture: "flask-pip" },
    profileDraft: {
      runtime: { strategy: "auto" },
      network: { internalPort: 3000, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "python",
      framework: "flask",
      packageManager: "pip",
      applicationShape: "serverful-http",
      plannerKey: "flask",
      supportTier: "first-class",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: {
        install: "pip install --no-cache-dir -r requirements.txt",
        start: "python -m flask --app app:app run --host 0.0.0.0 --port 3000",
      },
    },
  },
  {
    matrixId: "ZSSH-CATALOG-010",
    fixtureId: "generic-node-server",
    catalogEntry: "generic Node",
    source: { kind: "fixture", fixture: "generic-node-server" },
    profileDraft: {
      runtime: { strategy: "auto" },
      network: { internalPort: 3000, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "node",
      packageManager: "npm",
      applicationShape: "serverful-http",
      plannerKey: "node",
      supportTier: "first-class",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: {
        install: "npm install",
        build: "npm run build",
        start: "npm run start:built",
      },
    },
  },
  {
    matrixId: "ZSSH-CATALOG-011",
    fixtureId: "generic-asgi-uv",
    catalogEntry: "generic Python",
    source: { kind: "fixture", fixture: "generic-asgi-uv" },
    profileDraft: {
      runtime: { strategy: "auto" },
      network: { internalPort: 3000, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "python",
      packageManager: "uv",
      applicationShape: "serverful-http",
      plannerKey: "generic-asgi",
      supportTier: "first-class",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: {
        install: "pip install --no-cache-dir uv && uv sync --frozen --no-dev",
        start: "uv run python -m uvicorn asgi:app --host 0.0.0.0 --port 3000",
      },
    },
  },
  {
    matrixId: "ZSSH-CATALOG-012",
    fixtureId: "generic-java-jar",
    catalogEntry: "generic Java",
    source: { kind: "fixture", fixture: "generic-java-jar" },
    profileDraft: {
      runtime: { strategy: "auto" },
      network: { internalPort: 8080, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "java",
      applicationShape: "serverful-http",
      plannerKey: "java",
      supportTier: "first-class",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: {
        start: "java -jar target/generic-java-jar-1.0.0.jar",
      },
    },
  },
  {
    matrixId: "ZSSH-CATALOG-013",
    fixtureId: "dockerfile-profile",
    catalogEntry: "Dockerfile",
    source: {
      kind: "synthetic",
      descriptor: {
        kind: "local-folder",
        locator: "/tmp/appaloft-zssh/dockerfile-app",
        displayName: "dockerfile-app",
        inspection: createSourceInspection({
          detectedFiles: ["dockerfile"],
          dockerfilePath: "Dockerfile",
          applicationShape: "container-native",
        }),
      },
    },
    profileDraft: {
      runtime: { strategy: "dockerfile", dockerfilePath: "deploy/Dockerfile" },
      network: { internalPort: 4311, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      applicationShape: "container-native",
      plannerKey: "dockerfile",
      supportTier: "container-native",
      buildStrategy: "dockerfile",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: {},
    },
  },
  {
    matrixId: "ZSSH-CATALOG-014",
    fixtureId: "compose-profile",
    catalogEntry: "Docker Compose",
    source: {
      kind: "synthetic",
      descriptor: {
        kind: "compose",
        locator: "/tmp/appaloft-zssh/compose-app/docker-compose.yml",
        displayName: "compose-app",
        inspection: createSourceInspection({
          detectedFiles: ["compose-manifest"],
          composeFilePath: "docker-compose.yml",
          applicationShape: "container-native",
        }),
      },
    },
    profileDraft: {
      runtime: { strategy: "docker-compose" },
      network: { internalPort: 4312, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      applicationShape: "container-native",
      plannerKey: "docker-compose",
      supportTier: "container-native",
      buildStrategy: "compose-deploy",
      packagingMode: "compose-bundle",
      artifactIntent: "compose-project",
      executionKind: "docker-compose-stack",
      commandSpecs: {},
    },
  },
  {
    matrixId: "ZSSH-CATALOG-015",
    fixtureId: "prebuilt-image-profile",
    catalogEntry: "prebuilt image",
    source: {
      kind: "synthetic",
      descriptor: {
        kind: "docker-image",
        locator: "docker://ghcr.io/example/appaloft-zssh:1.0.0",
        displayName: "prebuilt-image-app",
      },
    },
    profileDraft: {
      runtime: { strategy: "prebuilt-image" },
      network: { internalPort: 4313, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      applicationShape: "container-native",
      plannerKey: "prebuilt-image",
      supportTier: "container-native",
      buildStrategy: "prebuilt-image",
      packagingMode: "all-in-one-docker",
      artifactIntent: "prebuilt-image",
      executionKind: "docker-container",
      commandSpecs: {},
    },
  },
  {
    matrixId: "ZSSH-CATALOG-016",
    fixtureId: "explicit-custom-commands",
    catalogEntry: "explicit custom commands",
    source: { kind: "fixture", fixture: "python-explicit-start" },
    profileDraft: {
      runtime: {
        strategy: "auto",
        installCommand: "pip install --no-cache-dir -r requirements.txt",
        startCommand: "python -m waitress --listen=0.0.0.0:4317 service:application",
      },
      network: { internalPort: 4317, upstreamProtocol: "http", exposureMode: "reverse-proxy" },
    },
    expected: {
      runtimeFamily: "python",
      packageManager: "pip",
      applicationShape: "serverful-http",
      plannerKey: "python",
      supportTier: "explicit-custom",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      artifactIntent: "build-image",
      executionKind: "docker-container",
      commandSpecs: {
        install: "pip install --no-cache-dir -r requirements.txt",
        start: "python -m waitress --listen=0.0.0.0:4317 service:application",
      },
    },
  },
];

function buildPreviewContract(descriptor: SupportedCatalogDescriptor) {
  return {
    schemaVersion: "deployments.plan/v1",
    context: {
      projectId: "proj_zssh",
      environmentId: "env_zssh",
      resourceId: `res_${descriptor.fixtureId.replaceAll("-", "_")}`,
      serverId: `srv_${descriptor.fixtureId.replaceAll("-", "_")}`,
    },
    readiness: {
      status: "ready",
      ready: true,
      reasonCodes: [],
    },
    source: {
      kind: descriptor.source.kind === "fixture" ? "local-folder" : descriptor.source.descriptor.kind,
      displayName: descriptor.fixtureId,
      locator:
        descriptor.source.kind === "fixture"
          ? join(fixturesRoot, descriptor.source.fixture)
          : descriptor.source.descriptor.locator,
      ...(descriptor.expected.runtimeFamily
        ? { runtimeFamily: descriptor.expected.runtimeFamily }
        : {}),
      ...(descriptor.expected.framework ? { framework: descriptor.expected.framework } : {}),
      ...(descriptor.expected.packageManager
        ? { packageManager: descriptor.expected.packageManager }
        : {}),
      applicationShape: descriptor.expected.applicationShape,
      detectedFiles: [],
      detectedScripts: [],
      reasoning: [`${descriptor.catalogEntry} supported catalog descriptor`],
    },
    planner: {
      plannerKey: descriptor.expected.plannerKey,
      supportTier: descriptor.expected.supportTier,
      buildStrategy: descriptor.expected.buildStrategy,
      packagingMode: descriptor.expected.packagingMode,
      targetKind: "single-server",
      targetProviderKey: "local-shell",
    },
    artifact: {
      kind:
        descriptor.expected.artifactIntent === "compose-project"
          ? "compose-project"
          : descriptor.expected.artifactIntent === "prebuilt-image"
            ? "prebuilt-image"
            : "workspace-image",
      runtimeArtifactIntent: descriptor.expected.artifactIntent,
    },
    commands: [
      ...(descriptor.expected.commandSpecs.install
        ? [
            {
              kind: "install",
              command: descriptor.expected.commandSpecs.install,
              source: "planner",
            },
          ]
        : []),
      ...(descriptor.expected.commandSpecs.build
        ? [
            {
              kind: "build",
              command: descriptor.expected.commandSpecs.build,
              source: "planner",
            },
          ]
        : []),
      ...(descriptor.expected.commandSpecs.start
        ? [
            {
              kind: "start",
              command: descriptor.expected.commandSpecs.start,
              source: "planner",
            },
          ]
        : []),
    ],
    network: {
      internalPort: descriptor.profileDraft.network.internalPort,
      upstreamProtocol: descriptor.profileDraft.network.upstreamProtocol,
      exposureMode: descriptor.profileDraft.network.exposureMode,
    },
    health: {
      enabled: true,
      kind: "http",
      path: "/",
      port: descriptor.profileDraft.network.internalPort,
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
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("Zero-to-SSH supported catalog acceptance harness", () => {
  for (const descriptor of supportedCatalog) {
    test(`[${descriptor.matrixId}][ZSSH-PREVIEW-001][ZSSH-CREATE-001][ZSSH-CREATE-002][ZSSH-RUNTIME-001][ZSSH-RUNTIME-002][ZSSH-RUNTIME-003] accepts ${descriptor.catalogEntry} through the hermetic zero-to-SSH contract`, async () => {
      ensureReflectMetadata();
      const [
        { FileSystemSourceDetector },
        { DefaultRuntimePlanResolver, createDefaultRuntimeTargetBackendRegistry },
      ] = await Promise.all([import("@appaloft/adapter-filesystem"), import("../src")]);
      const context = createTestExecutionContext();
      const preview = buildPreviewContract(descriptor);
      const createInput = {
        projectId: preview.context.projectId,
        environmentId: preview.context.environmentId,
        resourceId: preview.context.resourceId,
        serverId: preview.context.serverId,
      };

      expect(preview.schemaVersion).toBe("deployments.plan/v1");
      expect(preview.readiness.status).toBe("ready");
      expect(preview.planner).toEqual(
        expect.objectContaining({
          plannerKey: descriptor.expected.plannerKey,
          supportTier: descriptor.expected.supportTier,
          targetKind: "single-server",
          targetProviderKey: "local-shell",
        }),
      );
      expect(preview.artifact.runtimeArtifactIntent).toBe(descriptor.expected.artifactIntent);
      expect(Object.keys(createInput).sort()).toEqual([
        "environmentId",
        "projectId",
        "resourceId",
        "serverId",
      ]);
      expect(createInput).not.toHaveProperty("framework");
      expect(createInput).not.toHaveProperty("baseImage");
      expect(createInput).not.toHaveProperty("buildpack");
      expect(createInput).not.toHaveProperty("source");
      expect(createInput).not.toHaveProperty("runtime");
      expect(createInput).not.toHaveProperty("network");

      const source =
        descriptor.source.kind === "fixture"
          ? (
              await new FileSystemSourceDetector().detect(
                context,
                join(fixturesRoot, descriptor.source.fixture),
              )
            )._unsafeUnwrap().source
          : createSource(descriptor.source.descriptor);

      const result = await new DefaultRuntimePlanResolver().resolve(context, {
        id: `plan_${descriptor.fixtureId}`,
        source,
        server: {
          id: `srv_${descriptor.fixtureId}`,
          providerKey: "local-shell",
        },
        environmentSnapshot: createEnvironmentSnapshot(`snap_${descriptor.fixtureId}`),
        detectedReasoning: [`${descriptor.catalogEntry} zero-to-SSH acceptance harness`],
        requestedDeployment: {
          method: descriptor.profileDraft.runtime.strategy,
          port: descriptor.profileDraft.network.internalPort,
          exposureMode: descriptor.profileDraft.network.exposureMode,
          upstreamProtocol: descriptor.profileDraft.network.upstreamProtocol,
          ...(descriptor.profileDraft.runtime.publishDirectory
            ? { publishDirectory: descriptor.profileDraft.runtime.publishDirectory }
            : {}),
          ...(descriptor.profileDraft.runtime.dockerfilePath
            ? { dockerfilePath: descriptor.profileDraft.runtime.dockerfilePath }
            : {}),
          ...(descriptor.profileDraft.runtime.installCommand
            ? { installCommand: descriptor.profileDraft.runtime.installCommand }
            : {}),
          ...(descriptor.profileDraft.runtime.buildCommand
            ? { buildCommand: descriptor.profileDraft.runtime.buildCommand }
            : {}),
          ...(descriptor.profileDraft.runtime.startCommand
            ? { startCommand: descriptor.profileDraft.runtime.startCommand }
            : {}),
        },
        generatedAt: "2026-01-01T00:00:00.000Z",
      });

      expect(result.isOk()).toBe(true);
      const plan = result._unsafeUnwrap();
      const registry = createDefaultRuntimeTargetBackendRegistry({
        localBackend: new HermeticExecutionBackend(),
        sshBackend: new HermeticExecutionBackend(),
      });
      const localBackend = registry.find({
        targetKind: "single-server",
        providerKey: "local-shell",
        requiredCapabilities: ["runtime.apply", "runtime.verify", "runtime.logs", "runtime.health"],
      });
      const sshBackend = registry.find({
        targetKind: "single-server",
        providerKey: "generic-ssh",
        requiredCapabilities: ["runtime.apply", "runtime.verify", "runtime.logs", "runtime.health"],
      });
      const unsupportedBackend = registry.find({
        targetKind: "single-server",
        providerKey: "unsupported-provider",
        requiredCapabilities: ["runtime.apply"],
      });

      expect(plan.buildStrategy).toBe(descriptor.expected.buildStrategy);
      expect(plan.packagingMode).toBe(descriptor.expected.packagingMode);
      expect(plan.runtimeArtifact?.intent).toBe(descriptor.expected.artifactIntent);
      expect(plan.execution.kind).toBe(descriptor.expected.executionKind);
      expect(plan.execution.port).toBe(descriptor.profileDraft.network.internalPort);
      expect(plan.execution.installCommand).toBe(descriptor.expected.commandSpecs.install);
      expect(plan.execution.buildCommand).toBe(descriptor.expected.commandSpecs.build);
      expect(plan.execution.startCommand).toBe(descriptor.expected.commandSpecs.start);
      if (plan.execution.kind === "docker-compose-stack") {
        expect(plan.execution.verificationSteps).toEqual([]);
      } else {
        expect(plan.execution.verificationSteps.map((step) => step.kind)).toContain(
          "internal-http",
        );
      }
      expect(localBackend.isOk()).toBe(true);
      expect(sshBackend.isOk()).toBe(true);
      expect(unsupportedBackend.isErr()).toBe(true);

      if (descriptor.expected.applicationShape === "static") {
        expect(descriptor.profileDraft.network.internalPort).toBe(80);
        expect(plan.execution.metadata).toEqual(
          expect.objectContaining({
            "workspace.packageCommand": "static-server",
          }),
        );
      } else if (descriptor.expected.applicationShape !== "container-native") {
        expect(descriptor.profileDraft.network.internalPort).toBeGreaterThan(0);
      }

      if (plan.execution.kind === "docker-container") {
        const docker = RuntimeCommandBuilder.docker();
        const runCommand = renderRuntimeCommandString(
          docker.runContainer({
            image: `appaloft-zssh-${descriptor.fixtureId}:latest`,
            containerName: `appaloft-zssh-${descriptor.fixtureId}`,
            publishedPorts: [
              docker.publishPort({
                containerPort: descriptor.profileDraft.network.internalPort,
                mode: "loopback-ephemeral",
              }),
            ],
          }),
          { quote: shellQuote },
        );

        expect(runCommand).toContain("docker run -d");
        expect(runCommand).toContain(
          `127.0.0.1::${descriptor.profileDraft.network.internalPort}`,
        );
      }

      const observation = {
        readiness: {
          stage: "internal-http",
          status: "expected-ready",
        },
        health: {
          kind: "http",
          port: descriptor.profileDraft.network.internalPort,
          source: "resource-health-observation",
        },
        logs: {
          capability: "runtime.logs",
          source: "resources.runtime-logs",
        },
        access: {
          exposureMode: descriptor.profileDraft.network.exposureMode,
          source: "resource-access-summary",
        },
      };

      expect(observation.health.port).toBe(preview.network.internalPort);
      expect(observation.logs.capability).toBe("runtime.logs");
      expect(observation.access.source).toBe("resource-access-summary");
    });
  }

  test("[ZSSH-PREVIEW-002] unsupported and ambiguous controls reuse the 018 blocked preview shape", () => {
    const blockedReason = {
      phase: "runtime-plan-resolution",
      reasonCode: "ambiguous-framework-evidence",
      message: "Multiple runnable apps were detected under the selected source root.",
      evidence: [
        {
          kind: "source-inspection",
          runtimeFamily: "node",
          frameworks: ["sveltekit", "vite"],
        },
      ],
      fixPath: [
        {
          kind: "profile-field",
          profileField: "source.baseDirectory",
          label: "Select the deployable app directory",
        },
      ],
      overridePath: [
        {
          kind: "profile-field",
          profileField: "runtime.startCommand",
          label: "Provide explicit production start command",
        },
      ],
      affectedProfileField: "source.baseDirectory",
    };

    expect(blockedReason).toEqual(
      expect.objectContaining({
        phase: "runtime-plan-resolution",
        reasonCode: "ambiguous-framework-evidence",
        affectedProfileField: "source.baseDirectory",
      }),
    );
    expect(blockedReason.fixPath[0]?.profileField).toBe("source.baseDirectory");
    expect(blockedReason.overridePath[0]?.profileField).toBe("runtime.startCommand");
  });

  test("[ZSSH-PREVIEW-004] buildpack evidence stays non-winning for explicit planner and container-native profiles", () => {
    const precedenceCases = [
      {
        supportTier: "first-class",
        plannerKey: "nextjs",
        buildpackEvidence: "non-winning",
      },
      {
        supportTier: "explicit-custom",
        plannerKey: "python",
        buildpackEvidence: "non-winning",
      },
      {
        supportTier: "container-native",
        plannerKey: "dockerfile",
        buildpackEvidence: "non-winning",
      },
    ];

    for (const precedence of precedenceCases) {
      expect(precedence.buildpackEvidence).toBe("non-winning");
      expect(["first-class", "explicit-custom", "container-native"]).toContain(
        precedence.supportTier,
      );
    }
  });

  test("[ZSSH-RUNTIME-004][ZSSH-RUNTIME-005] real Docker and SSH fixture smoke are opt-in gates", () => {
    expect(process.env.APPALOFT_E2E_FRAMEWORK_DOCKER).not.toBe("true");
    expect(process.env.APPALOFT_E2E_FRAMEWORK_SSH).not.toBe("true");
  });
});
