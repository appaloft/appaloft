import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  type SourceApplicationShape,
  type SourceDetectedFile,
  type SourceFramework,
  type SourcePackageManager,
  type SourceRuntimeFamily,
} from "@appaloft/core";

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

const fixturesRoot = join(import.meta.dir, "fixtures", "frameworks");

interface FrameworkFixtureExpectation {
  matrixIds: string;
  fixture: string;
  runtimeFamily: SourceRuntimeFamily;
  framework?: SourceFramework;
  packageManager: SourcePackageManager;
  applicationShape: SourceApplicationShape;
  detectedFiles?: SourceDetectedFile[];
  fixedVersions: FixedVersionExpectation;
}

interface FixedVersionExpectation {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  pyprojectDependencies?: string[];
  requirements?: string[];
}

const frameworkFixtures: FrameworkFixtureExpectation[] = [
  {
    matrixIds: "WF-PLAN-CAT-001",
    fixture: "next-ssr",
    runtimeFamily: "node",
    framework: "nextjs",
    packageManager: "pnpm",
    applicationShape: "ssr",
    detectedFiles: ["next-app-router"],
    fixedVersions: {
      packageManager: "pnpm@10.6.0",
      dependencies: {
        next: "15.2.4",
        react: "19.0.0",
        "react-dom": "19.0.0",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-001,WF-PLAN-DET-013",
    fixture: "next-standalone",
    runtimeFamily: "node",
    framework: "nextjs",
    packageManager: "pnpm",
    applicationShape: "ssr",
    detectedFiles: ["next-standalone-output", "next-pages-router"],
    fixedVersions: {
      packageManager: "pnpm@10.6.0",
      dependencies: {
        next: "15.2.4",
        react: "19.0.0",
        "react-dom": "19.0.0",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-002,WF-PLAN-DET-013",
    fixture: "next-static-export",
    runtimeFamily: "node",
    framework: "nextjs",
    packageManager: "pnpm",
    applicationShape: "static",
    detectedFiles: ["next-static-output", "next-pages-router"],
    fixedVersions: {
      packageManager: "pnpm@10.6.0",
      dependencies: {
        next: "15.2.4",
        react: "19.0.0",
        "react-dom": "19.0.0",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "vite-spa",
    runtimeFamily: "node",
    framework: "vite",
    packageManager: "bun",
    applicationShape: "static",
    fixedVersions: {
      dependencies: {
        vite: "5.4.11",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "react-spa",
    runtimeFamily: "node",
    framework: "react",
    packageManager: "npm",
    applicationShape: "static",
    detectedFiles: ["package-lock"],
    fixedVersions: {
      packageManager: "npm@10.9.0",
      dependencies: {
        react: "18.3.1",
        "react-dom": "18.3.1",
        "react-scripts": "5.0.1",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "vue-spa",
    runtimeFamily: "node",
    framework: "vue",
    packageManager: "pnpm",
    applicationShape: "static",
    detectedFiles: ["pnpm-lock"],
    fixedVersions: {
      packageManager: "pnpm@10.6.0",
      dependencies: {
        vue: "3.5.13",
      },
      devDependencies: {
        "@vue/cli-service": "5.0.8",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "svelte-spa",
    runtimeFamily: "node",
    framework: "svelte",
    packageManager: "yarn",
    applicationShape: "static",
    detectedFiles: ["yarn-lock"],
    fixedVersions: {
      packageManager: "yarn@4.6.0",
      dependencies: {
        svelte: "5.19.7",
      },
      devDependencies: {
        "@rollup/plugin-svelte": "7.2.2",
        rollup: "4.34.8",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "solid-spa",
    runtimeFamily: "node",
    framework: "solid",
    packageManager: "bun",
    applicationShape: "static",
    detectedFiles: ["bun-lock", "vite-config"],
    fixedVersions: {
      packageManager: "bun@1.2.4",
      dependencies: {
        "solid-js": "1.9.5",
      },
      devDependencies: {
        vite: "6.1.0",
        "vite-plugin-solid": "2.11.2",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-007",
    fixture: "angular-spa",
    runtimeFamily: "node",
    framework: "angular",
    packageManager: "npm",
    applicationShape: "static",
    fixedVersions: {
      dependencies: {
        "@angular/core": "19.2.0",
        rxjs: "7.8.1",
        "zone.js": "0.15.0",
      },
      devDependencies: {
        "@angular-devkit/build-angular": "19.2.0",
        "@angular/cli": "19.2.0",
        "@angular/compiler-cli": "19.2.0",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-005",
    fixture: "sveltekit-static",
    runtimeFamily: "node",
    framework: "sveltekit",
    packageManager: "pnpm",
    applicationShape: "static",
    fixedVersions: {
      packageManager: "pnpm@10.6.0",
      dependencies: {
        "@sveltejs/adapter-static": "3.0.8",
        "@sveltejs/kit": "2.16.1",
        svelte: "5.19.7",
        vite: "6.1.0",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-005",
    fixture: "sveltekit-ambiguous",
    runtimeFamily: "node",
    framework: "sveltekit",
    packageManager: "pnpm",
    applicationShape: "hybrid-static-server",
    fixedVersions: {
      packageManager: "pnpm@10.6.0",
      dependencies: {
        "@sveltejs/kit": "2.16.1",
        svelte: "5.19.7",
        vite: "6.1.0",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-004",
    fixture: "nuxt-generate",
    runtimeFamily: "node",
    framework: "nuxt",
    packageManager: "pnpm",
    applicationShape: "static",
    fixedVersions: {
      packageManager: "pnpm@10.6.0",
      dependencies: {
        nuxt: "3.16.1",
        vue: "3.5.13",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-006",
    fixture: "astro-static",
    runtimeFamily: "node",
    framework: "astro",
    packageManager: "npm",
    applicationShape: "static",
    fixedVersions: {
      dependencies: {
        astro: "5.5.5",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-003",
    fixture: "remix-ssr",
    runtimeFamily: "node",
    framework: "remix",
    packageManager: "npm",
    applicationShape: "ssr",
    fixedVersions: {
      dependencies: {
        "@remix-run/node": "2.16.3",
        "@remix-run/react": "2.16.3",
        "@remix-run/serve": "2.16.3",
        react: "18.3.1",
        "react-dom": "18.3.1",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "express-server",
    runtimeFamily: "node",
    framework: "express",
    packageManager: "npm",
    applicationShape: "serverful-http",
    fixedVersions: {
      dependencies: {
        express: "4.21.2",
      },
      devDependencies: {
        typescript: "5.8.2",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "fastify-server",
    runtimeFamily: "node",
    framework: "fastify",
    packageManager: "pnpm",
    applicationShape: "serverful-http",
    detectedFiles: ["pnpm-lock"],
    fixedVersions: {
      packageManager: "pnpm@10.6.0",
      dependencies: {
        fastify: "5.2.1",
      },
      devDependencies: {
        typescript: "5.8.2",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "nestjs-server",
    runtimeFamily: "node",
    framework: "nestjs",
    packageManager: "npm",
    applicationShape: "serverful-http",
    detectedFiles: ["package-lock"],
    fixedVersions: {
      packageManager: "npm@10.9.0",
      dependencies: {
        "@nestjs/common": "11.0.11",
        "@nestjs/core": "11.0.11",
        "@nestjs/platform-express": "11.0.11",
        "reflect-metadata": "0.2.2",
        rxjs: "7.8.2",
      },
      devDependencies: {
        typescript: "5.8.2",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "hono-server",
    runtimeFamily: "node",
    framework: "hono",
    packageManager: "bun",
    applicationShape: "serverful-http",
    detectedFiles: ["bun-lock"],
    fixedVersions: {
      packageManager: "bun@1.2.4",
      dependencies: {
        hono: "4.7.5",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "koa-server",
    runtimeFamily: "node",
    framework: "koa",
    packageManager: "yarn",
    applicationShape: "serverful-http",
    detectedFiles: ["yarn-lock"],
    fixedVersions: {
      packageManager: "yarn@4.6.0",
      dependencies: {
        koa: "2.16.0",
      },
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-008",
    fixture: "generic-node-server",
    runtimeFamily: "node",
    packageManager: "npm",
    applicationShape: "serverful-http",
    detectedFiles: ["package-lock"],
    fixedVersions: {
      packageManager: "npm@10.9.0",
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-009,WF-PLAN-PY-001,WF-PLAN-PY-008,WF-PLAN-PY-012",
    fixture: "fastapi-uv",
    runtimeFamily: "python",
    framework: "fastapi",
    packageManager: "uv",
    applicationShape: "serverful-http",
    detectedFiles: ["pyproject-toml", "uv-lock"],
    fixedVersions: {
      pyprojectDependencies: ["fastapi==0.115.8", "uvicorn==0.34.0"],
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-010,WF-PLAN-PY-002,WF-PLAN-PY-008,WF-PLAN-PY-012",
    fixture: "django-pip",
    runtimeFamily: "python",
    framework: "django",
    packageManager: "pip",
    applicationShape: "serverful-http",
    detectedFiles: ["pyproject-toml", "requirements-txt", "django-manage"],
    fixedVersions: {
      pyprojectDependencies: ["Django==5.1.7"],
      requirements: ["Django==5.1.7"],
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-010,WF-PLAN-PY-003,WF-PLAN-PY-008,WF-PLAN-PY-012",
    fixture: "flask-pip",
    runtimeFamily: "python",
    framework: "flask",
    packageManager: "pip",
    applicationShape: "serverful-http",
    detectedFiles: ["requirements-txt"],
    fixedVersions: {
      requirements: ["Flask==3.1.0"],
    },
  },
  {
    matrixIds: "WF-PLAN-PY-004,WF-PLAN-PY-008,WF-PLAN-PY-012",
    fixture: "generic-asgi-uv",
    runtimeFamily: "python",
    packageManager: "uv",
    applicationShape: "serverful-http",
    detectedFiles: ["pyproject-toml", "uv-lock"],
    fixedVersions: {
      pyprojectDependencies: ["uvicorn==0.34.0"],
    },
  },
  {
    matrixIds: "WF-PLAN-PY-005,WF-PLAN-PY-008,WF-PLAN-PY-012",
    fixture: "generic-wsgi-pip",
    runtimeFamily: "python",
    packageManager: "pip",
    applicationShape: "serverful-http",
    detectedFiles: ["requirements-txt"],
    fixedVersions: {
      requirements: ["gunicorn==23.0.0"],
    },
  },
  {
    matrixIds: "WF-PLAN-PY-006,WF-PLAN-PY-008,WF-PLAN-PY-012",
    fixture: "python-poetry-web",
    runtimeFamily: "python",
    framework: "flask",
    packageManager: "poetry",
    applicationShape: "serverful-http",
    detectedFiles: ["pyproject-toml", "poetry-lock"],
    fixedVersions: {},
  },
  {
    matrixIds: "WF-PLAN-PY-007,WF-PLAN-PY-008,WF-PLAN-PY-012",
    fixture: "python-explicit-start",
    runtimeFamily: "python",
    packageManager: "pip",
    applicationShape: "serverful-http",
    detectedFiles: ["requirements-txt"],
    fixedVersions: {
      requirements: ["waitress==3.0.2"],
    },
  },
];

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function expectExactPackageVersion(version: unknown): void {
  expect(typeof version).toBe("string");
  expect(version).toMatch(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u);
}

function expectManifestVersions(
  packageJson: Record<string, unknown>,
  field: "dependencies" | "devDependencies",
  expected: Record<string, string> | undefined,
): void {
  const versions = objectRecord(packageJson[field]);

  for (const [packageName, version] of Object.entries(versions)) {
    expectExactPackageVersion(version);
    expect(expected?.[packageName] ?? version).toBe(version);
  }

  for (const [packageName, version] of Object.entries(expected ?? {})) {
    expect(versions[packageName]).toBe(version);
  }
}

async function expectFixedVersions(
  fixturePath: string,
  expected: FixedVersionExpectation,
): Promise<void> {
  const packageJsonFile = Bun.file(join(fixturePath, "package.json"));

  if (await packageJsonFile.exists()) {
    const parsed = (await packageJsonFile.json()) as unknown;
    const packageJson = objectRecord(parsed);

    if (expected.packageManager) {
      expect(packageJson.packageManager).toBe(expected.packageManager);
    }

    expectManifestVersions(packageJson, "dependencies", expected.dependencies);
    expectManifestVersions(packageJson, "devDependencies", expected.devDependencies);
  }

  if (expected.pyprojectDependencies) {
    const text = await Bun.file(join(fixturePath, "pyproject.toml")).text();

    for (const dependency of expected.pyprojectDependencies) {
      expect(text).toContain(`"${dependency}"`);
    }
  }

  if (expected.requirements) {
    const text = await Bun.file(join(fixturePath, "requirements.txt")).text();
    const requirements = text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    expect(requirements).toEqual(expected.requirements);
  }
}

describe("FileSystemSourceDetector framework fixtures", () => {
  for (const fixture of frameworkFixtures) {
    test(`[${fixture.matrixIds}][WF-PLAN-DET-007] detects pinned ${fixture.fixture} fixture`, async () => {
      ensureReflectMetadata();
      const [{ createExecutionContext }, { FileSystemSourceDetector }] = await Promise.all([
        import("@appaloft/application"),
        import("../src"),
      ]);
      const fixturePath = join(fixturesRoot, fixture.fixture);

      await expectFixedVersions(fixturePath, fixture.fixedVersions);

      const result = await new FileSystemSourceDetector().detect(
        createExecutionContext({ entrypoint: "cli", requestId: `req_${fixture.fixture}` }),
        fixturePath,
      );

      expect(result.isOk()).toBe(true);
      const inspection = result._unsafeUnwrap().source.inspection;
      expect(inspection?.runtimeFamily).toBe(fixture.runtimeFamily);
      expect(inspection?.framework).toBe(fixture.framework);
      expect(inspection?.packageManager).toBe(fixture.packageManager);
      expect(inspection?.applicationShape).toBe(fixture.applicationShape);
      for (const file of fixture.detectedFiles ?? []) {
        expect(inspection?.detectedFiles).toContain(file);
      }
    });
  }
});
