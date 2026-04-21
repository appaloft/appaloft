import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  type SourceApplicationShape,
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
  framework: SourceFramework;
  packageManager: SourcePackageManager;
  applicationShape: SourceApplicationShape;
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
    matrixIds: "WF-PLAN-CAT-002",
    fixture: "next-static-export",
    runtimeFamily: "node",
    framework: "nextjs",
    packageManager: "pnpm",
    applicationShape: "static",
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
        "@vitejs/plugin-react": "4.3.4",
        react: "18.3.1",
        "react-dom": "18.3.1",
        vite: "5.4.11",
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
    matrixIds: "WF-PLAN-CAT-009",
    fixture: "fastapi-uv",
    runtimeFamily: "python",
    framework: "fastapi",
    packageManager: "uv",
    applicationShape: "serverful-http",
    fixedVersions: {
      pyprojectDependencies: ["fastapi==0.115.8", "uvicorn==0.34.0"],
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-010",
    fixture: "django-pip",
    runtimeFamily: "python",
    framework: "django",
    packageManager: "pip",
    applicationShape: "serverful-http",
    fixedVersions: {
      pyprojectDependencies: ["Django==5.1.7"],
      requirements: ["Django==5.1.7"],
    },
  },
  {
    matrixIds: "WF-PLAN-CAT-010",
    fixture: "flask-pip",
    runtimeFamily: "python",
    framework: "flask",
    packageManager: "pip",
    applicationShape: "serverful-http",
    fixedVersions: {
      requirements: ["Flask==3.1.0"],
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
    });
  }
});
