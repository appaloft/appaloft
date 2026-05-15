import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { frameworkDockerSmokeFixtures } from "./support/framework-docker-smoke-fixtures";

const frameworkFixturesRoot = new URL(
  "../../../../packages/adapters/filesystem/test/fixtures/frameworks",
  import.meta.url,
).pathname;

const localDockerSubstrateSmoke =
  "apps/shell/test/e2e/quick-deploy-local-docker-substrates.workflow.e2e.ts";
const localDockerFrameworkSmoke =
  "apps/shell/test/e2e/quick-deploy-framework-fixtures-docker.workflow.e2e.ts";
const genericSshFrameworkSmoke =
  "apps/shell/test/e2e/quick-deploy-framework-fixtures-ssh.workflow.e2e.ts";
const frameworkFixtureWorkflow = ".github/workflows/framework-fixture-e2e.yml";
const frameworkSmokeSourceOfTruthDocs = [
  "docs/specs/014-framework-planner-contract-and-js-ts-catalog/spec.md",
  "docs/specs/014-framework-planner-contract-and-js-ts-catalog/plan.md",
  "docs/specs/014-framework-planner-contract-and-js-ts-catalog/tasks.md",
  "docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/spec.md",
  "docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/plan.md",
  "docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/tasks.md",
  "docs/specs/016-jvm-framework-planner-contract-and-spring-boot-catalog/spec.md",
  "docs/specs/016-jvm-framework-planner-contract-and-spring-boot-catalog/plan.md",
  "docs/specs/016-jvm-framework-planner-contract-and-spring-boot-catalog/tasks.md",
  "docs/specs/019-zero-to-ssh-supported-catalog-acceptance-harness/plan.md",
  "docs/implementation/deployment-runtime-substrate-plan.md",
  "docs/workflows/workload-framework-detection-and-planning.md",
  "docs/workflows/quick-deploy.md",
  "docs/workflows/resources.create-and-first-deploy.md",
  "docs/testing/deployments.create-test-matrix.md",
  "docs/testing/quick-deploy-test-matrix.md",
  "docs/testing/workload-framework-detection-and-planning-test-matrix.md",
  "docs/PRODUCT_ROADMAP.md",
] as const;

type LocalDockerCoverage =
  | {
      status: "active-fixture-smoke";
      fixture: string;
    }
  | {
      status: "active-substrate-smoke";
      coveredBy: string;
    };

interface RequiredCatalogCoverage {
  matrixId: string;
  catalogEntry: string;
  localDocker: LocalDockerCoverage;
  genericSsh: {
    status: "secret-gated-fixture-smoke" | "secret-gated-substrate-smoke";
    reason: string;
    fixture?: string;
  };
}

const requiredCatalogCoverage: RequiredCatalogCoverage[] = [
  {
    matrixId: "ZSSH-CATALOG-001",
    catalogEntry: "Next.js",
    localDocker: { status: "active-fixture-smoke", fixture: "next-ssr" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "next-ssr",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-002",
    catalogEntry: "Vite static SPA",
    localDocker: { status: "active-fixture-smoke", fixture: "vite-spa" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "vite-spa",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-003",
    catalogEntry: "Astro static",
    localDocker: { status: "active-fixture-smoke", fixture: "astro-static" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "astro-static",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-004",
    catalogEntry: "Nuxt generate",
    localDocker: { status: "active-fixture-smoke", fixture: "nuxt-generate" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "nuxt-generate",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-005",
    catalogEntry: "SvelteKit static",
    localDocker: { status: "active-fixture-smoke", fixture: "sveltekit-static" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "sveltekit-static",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-006",
    catalogEntry: "Remix",
    localDocker: { status: "active-fixture-smoke", fixture: "remix-ssr" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "remix-ssr",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-007",
    catalogEntry: "FastAPI",
    localDocker: { status: "active-fixture-smoke", fixture: "fastapi-uv" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "fastapi-uv",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-008",
    catalogEntry: "Django",
    localDocker: { status: "active-fixture-smoke", fixture: "django-pip" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "django-pip",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-009",
    catalogEntry: "Flask",
    localDocker: { status: "active-fixture-smoke", fixture: "flask-pip" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "flask-pip",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-010",
    catalogEntry: "generic Node",
    localDocker: { status: "active-fixture-smoke", fixture: "generic-node-server" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "generic-node-server",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-011",
    catalogEntry: "generic Python",
    localDocker: { status: "active-fixture-smoke", fixture: "generic-asgi-uv" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "generic-asgi-uv",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-012",
    catalogEntry: "generic Java",
    localDocker: { status: "active-fixture-smoke", fixture: "generic-java-jar" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "generic-java-jar",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-017",
    catalogEntry: "Quarkus Maven",
    localDocker: { status: "active-fixture-smoke", fixture: "quarkus-maven" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "quarkus-maven",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-013",
    catalogEntry: "Dockerfile",
    localDocker: { status: "active-substrate-smoke", coveredBy: localDockerSubstrateSmoke },
    genericSsh: {
      status: "secret-gated-substrate-smoke",
      reason: "generic SSH substrate smoke covers Dockerfile deployment",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-014",
    catalogEntry: "Docker Compose",
    localDocker: { status: "active-substrate-smoke", coveredBy: localDockerSubstrateSmoke },
    genericSsh: {
      status: "secret-gated-substrate-smoke",
      reason: "generic SSH substrate smoke covers Docker Compose deployment",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-015",
    catalogEntry: "prebuilt image",
    localDocker: { status: "active-substrate-smoke", coveredBy: localDockerSubstrateSmoke },
    genericSsh: {
      status: "secret-gated-substrate-smoke",
      reason: "generic SSH substrate smoke covers prebuilt-image deployment",
    },
  },
  {
    matrixId: "ZSSH-CATALOG-016",
    catalogEntry: "explicit custom commands",
    localDocker: { status: "active-fixture-smoke", fixture: "python-explicit-start" },
    genericSsh: {
      status: "secret-gated-fixture-smoke",
      fixture: "python-explicit-start",
      reason: "generic-SSH fixture smoke uses the shared framework descriptor",
    },
  },
];

const requiredFrameworkSmokeFixtures = [
  "next-static-export",
  "vite-spa",
  "react-spa",
  "vue-spa",
  "svelte-spa",
  "solid-spa",
  "angular-spa",
  "astro-static",
  "nuxt-generate",
  "sveltekit-static",
  "next-ssr",
  "next-standalone",
  "remix-ssr",
  "express-server",
  "fastify-server",
  "nestjs-server",
  "hono-server",
  "koa-server",
  "generic-node-server",
  "generic-asgi-uv",
  "generic-wsgi-pip",
  "python-poetry-web",
  "fastapi-uv",
  "django-pip",
  "flask-pip",
  "jvm-explicit-start",
  "generic-java-jar",
  "spring-boot-maven-wrapper",
  "spring-boot-maven",
  "quarkus-maven",
  "spring-boot-gradle-wrapper",
  "spring-boot-gradle-kts",
  "python-explicit-start",
] as const;

describe("framework fixture real smoke coverage", () => {
  test("[WF-PLAN-SMOKE-005][WF-PLAN-SMOKE-006] records local Docker and generic-SSH smoke status for every supported catalog entry", () => {
    const localDockerSmokeSource = readFileSync(localDockerFrameworkSmoke, "utf8");
    const localDockerSubstrateSmokeSource = readFileSync(localDockerSubstrateSmoke, "utf8");
    const genericSshSmokeSource = readFileSync(genericSshFrameworkSmoke, "utf8");
    const frameworkFixtureWorkflowSource = readFileSync(frameworkFixtureWorkflow, "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = packageJson.scripts ?? {};

    expect(localDockerSmokeSource).toContain("frameworkDockerSmokeFixtures");
    expect(localDockerSmokeSource).toContain("APPALOFT_E2E_FRAMEWORK_DOCKER");
    expect(localDockerSmokeSource).toContain("APPALOFT_E2E_FRAMEWORK_FIXTURE");
    expect(localDockerSubstrateSmokeSource).toContain("QUICK-DEPLOY-WF-057");
    expect(localDockerSubstrateSmokeSource).toContain("QUICK-DEPLOY-WF-058");
    expect(localDockerSubstrateSmokeSource).toContain("QUICK-DEPLOY-WF-059");
    expect(localDockerSubstrateSmokeSource).toContain('"--proxy-kind"');
    expect(localDockerSubstrateSmokeSource).toContain('"none"');
    expect(genericSshSmokeSource).toContain("frameworkDockerSmokeFixtures");
    expect(genericSshSmokeSource).toContain("APPALOFT_E2E_SSH_FRAMEWORK_DOCKER");
    expect(genericSshSmokeSource).toContain("APPALOFT_E2E_FRAMEWORK_FIXTURE");
    expect(frameworkFixtureWorkflowSource).toContain("framework-docker-substrates:");
    expect(frameworkFixtureWorkflowSource).toContain("framework-docker-fixtures:");
    expect(frameworkFixtureWorkflowSource).toContain("framework-ssh-e2e:");
    expect(frameworkFixtureWorkflowSource).toContain("max-parallel: 4");
    expect(frameworkFixtureWorkflowSource).toContain("max-parallel: 1");
    expect(frameworkFixtureWorkflowSource).toContain("APPALOFT_E2E_FRAMEWORK_FIXTURE");
    expect(frameworkFixtureWorkflowSource).toContain(
      "bun test --timeout=1500000 ./apps/shell/test/e2e/quick-deploy-framework-fixtures-docker.workflow.e2e.ts",
    );
    expect(frameworkFixtureWorkflowSource).toContain(
      "bun run smoke:ssh:preflight && bun test --timeout=1500000 ./apps/shell/test/e2e/quick-deploy-framework-fixtures-ssh.workflow.e2e.ts",
    );
    expect(scripts["smoke:framework:docker-fixtures"]).toBe(
      "APPALOFT_E2E_FRAMEWORK_DOCKER=true bun test --timeout=3600000 ./apps/shell/test/e2e/quick-deploy-framework-fixtures-docker.workflow.e2e.ts",
    );
    expect(scripts["smoke:framework:docker-substrates"]).toBe(
      "bun test --timeout=300000 ./apps/shell/test/e2e/quick-deploy-local-docker-substrates.workflow.e2e.ts",
    );
    expect(scripts["smoke:framework:docker"]).toBe(
      "bun run smoke:framework:docker-substrates && bun run smoke:framework:docker-fixtures",
    );
    expect(scripts["smoke:framework:ssh"]).toBe(
      "bun run smoke:ssh:preflight && APPALOFT_E2E_SSH_FRAMEWORK_DOCKER=true bun test --timeout=1800000 ./apps/shell/test/e2e/quick-deploy-framework-fixtures-ssh.workflow.e2e.ts",
    );
    expect(scripts["smoke:framework"]).toBe(
      "bun run smoke:framework:docker && bun run smoke:framework:ssh",
    );

    const matrixIds = requiredCatalogCoverage.map((entry) => entry.matrixId);
    expect(new Set(matrixIds).size).toBe(matrixIds.length);
    expect(matrixIds.toSorted()).toEqual(
      [
        ...Array.from(
          { length: 16 },
          (_, index) => `ZSSH-CATALOG-${String(index + 1).padStart(3, "0")}`,
        ),
        "ZSSH-CATALOG-017",
      ].toSorted(),
    );

    const activeFixtureIds = new Set(
      frameworkDockerSmokeFixtures.map((fixture) => fixture.fixture),
    );
    const fixtureById = new Map(
      frameworkDockerSmokeFixtures.map((fixture) => [fixture.fixture, fixture]),
    );
    expect(activeFixtureIds.size).toBe(frameworkDockerSmokeFixtures.length);

    for (const fixtureId of requiredFrameworkSmokeFixtures) {
      expect(activeFixtureIds.has(fixtureId), fixtureId).toBe(true);
      expect(frameworkFixtureWorkflowSource, fixtureId).toContain(`- ${fixtureId}`);
    }
    expect([...activeFixtureIds].toSorted()).toEqual(
      [...requiredFrameworkSmokeFixtures].toSorted(),
    );

    for (const fixture of frameworkDockerSmokeFixtures) {
      const fixturePath = join(frameworkFixturesRoot, fixture.fixture);
      expect(existsSync(fixturePath), fixture.fixture).toBe(true);
      expect(fixture.matrixIds).toContain("WF-PLAN-SMOKE-005");
      expect(fixture.matrixIds).toContain("WF-PLAN-SMOKE-006");
      expect(fixture.expectedGeneratedLog.length).toBeGreaterThan(0);
      expect(fixture.expectedPlanner.length).toBeGreaterThan(0);

      if (fixture.fixture === "generic-java-jar") {
        const jarBytes = readFileSync(join(fixturePath, "target/generic-java-jar-1.0.0.jar"));
        expect(jarBytes.subarray(0, 4).toString("hex")).toBe("504b0304");
        expect(jarBytes.includes(Buffer.from("Main-Class: GenericJavaJarServer"))).toBe(true);
        expect(jarBytes.includes(Buffer.from([0xca, 0xfe, 0xba, 0xbe]))).toBe(true);
      }

      if (fixture.fixture === "next-static-export" || fixture.fixture === "next-standalone") {
        const packageJson = JSON.parse(readFileSync(join(fixturePath, "package.json"), "utf8")) as {
          devDependencies?: Record<string, string>;
        };
        expect(packageJson.devDependencies?.typescript, fixture.fixture).toBe("5.8.2");
        expect(packageJson.devDependencies?.["@types/node"], fixture.fixture).toBe("22.13.10");
        expect(packageJson.devDependencies?.["@types/react"], fixture.fixture).toBe("19.0.10");
      }

      if (fixture.fixture === "svelte-spa") {
        const packageJson = JSON.parse(readFileSync(join(fixturePath, "package.json"), "utf8")) as {
          devDependencies?: Record<string, string>;
          packageManager?: string;
        };
        expect(packageJson.packageManager, fixture.fixture).toBe("npm@10.9.2");
        expect(packageJson.devDependencies?.["@rollup/plugin-node-resolve"], fixture.fixture).toBe(
          "16.0.3",
        );
        expect(packageJson.devDependencies?.["rollup-plugin-svelte"], fixture.fixture).toBe(
          "7.2.3",
        );
        expect(packageJson.devDependencies?.["@rollup/plugin-svelte"], fixture.fixture).toBe(
          undefined,
        );
        expect(existsSync(join(fixturePath, "yarn.lock")), fixture.fixture).toBe(false);
      }

      if (fixture.fixture === "fastapi-uv" || fixture.fixture === "generic-asgi-uv") {
        const pyproject = readFileSync(join(fixturePath, "pyproject.toml"), "utf8");
        const uvLock = readFileSync(join(fixturePath, "uv.lock"), "utf8");
        expect(fixture.install, fixture.fixture).toBeUndefined();
        expect(fixture.start, fixture.fixture).toBeUndefined();
        expect(pyproject, fixture.fixture).toContain('requires-python = ">=3.12"');
        expect(uvLock, fixture.fixture).toContain("revision = 3");
        expect(uvLock, fixture.fixture).toContain('requires-python = ">=3.12"');
        expect(uvLock, fixture.fixture).toContain('name = "uvicorn"');
      }
    }

    for (const entry of requiredCatalogCoverage) {
      if (entry.localDocker.status === "active-fixture-smoke") {
        expect(activeFixtureIds.has(entry.localDocker.fixture), entry.catalogEntry).toBe(true);
        expect(
          fixtureById.get(entry.localDocker.fixture)?.matrixIds.split(","),
          entry.catalogEntry,
        ).toContain(entry.matrixId);
      }

      if (entry.localDocker.status === "active-substrate-smoke") {
        expect(entry.localDocker.coveredBy).toBe(localDockerSubstrateSmoke);
      }

      if (entry.genericSsh.status === "secret-gated-fixture-smoke") {
        expect(entry.genericSsh.fixture, entry.catalogEntry).toBeDefined();
        expect(activeFixtureIds.has(entry.genericSsh.fixture ?? ""), entry.catalogEntry).toBe(true);
        expect(
          fixtureById.get(entry.genericSsh.fixture ?? "")?.matrixIds.split(","),
          entry.catalogEntry,
        ).toContain(entry.matrixId);
      }

      expect(entry.genericSsh.reason.length, entry.catalogEntry).toBeGreaterThan(20);
    }
  });

  test("[WF-PLAN-SMOKE-005][WF-PLAN-SMOKE-006] source-of-truth docs do not preserve stale full-catalog smoke gaps", () => {
    for (const docPath of frameworkSmokeSourceOfTruthDocs) {
      const text = readFileSync(docPath, "utf8");
      expect(text, docPath).not.toContain(
        "fixture-by-fixture real Docker/SSH smoke remains a migration gap",
      );
      expect(text, docPath).not.toContain("Full real Docker/SSH smoke for every");
      expect(text, docPath).not.toContain("contract with migration gap");
      expect(text, docPath).not.toContain("absence of target is a migration gap");
      expect(text, docPath).not.toContain("real SSH execution is a migration gap");
      expect(text, docPath).not.toContain("headless local PGlite behavior is a migration gap");
      expect(text, docPath).not.toContain("Runtime target abstraction is not implemented yet");
      expect(text, docPath).not.toContain("execution remains a migration gap");
      expect(text, docPath).not.toContain("representative opt-in real Docker coverage");
      expect(text, docPath).not.toContain(
        "current supported JavaScript/TypeScript/Python fixture catalog",
      );
      expect(text, docPath).not.toContain(
        "with representative opt-in Docker smoke tracked separately",
      );
      expect(text, docPath).not.toContain("without claiming full real Docker/SSH fixture coverage");
      expect(text, docPath).not.toContain("default catalog closure stays hermetic");
      expect(text, docPath).not.toContain("Default release-gate confidence is hermetic");
      expect(text, docPath).not.toContain("while default CI remains hermetic");
      expect(text, docPath).not.toContain(
        "Real local Docker and real generic-SSH execution remain opt-in gates",
      );
      expect(text, docPath).not.toContain("Real Docker/SSH smoke remains opt-in");
      expect(text, docPath).not.toContain("real Docker/SSH execution remains opt-in");
      expect(text, docPath).not.toContain("opt-in Docker/SSH smoke gates");
      expect(text, docPath).not.toContain("opt-in harness");
      expect(text, docPath).not.toContain("opt-in test proves real runtime reachability");
      expect(text, docPath).not.toContain(
        "Real local Docker and generic-SSH execution remain opt-in smoke layers",
      );
    }

    const workflow = readFileSync(
      "docs/workflows/workload-framework-detection-and-planning.md",
      "utf8",
    );
    const quickDeployWorkflow = readFileSync("docs/workflows/quick-deploy.md", "utf8");
    expect(workflow).toContain("shared GitHub Actions/local explicit");
    expect(workflow).toContain("framework smoke descriptors");
    expect(workflow).toContain("framework descriptor list plus the local Docker substrate smoke");
    expect(quickDeployWorkflow).toContain("GitHub Actions or local explicit gate");
    expect(workflow).not.toContain("shared opt-in local Docker/generic-SSH");
  });
});
