import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface CiTestBoundaryViolation {
  readonly message: string;
  readonly rule:
    | "build-smoke-disk-budget"
    | "hermetic-package-tests"
    | "postgres-job-scope"
    | "shared-change-classifier"
    | "unit-tests-webview-ownership";
}

export function findCiTestBoundaryViolations(workflow: string): CiTestBoundaryViolation[] {
  const violations: CiTestBoundaryViolation[] = [];
  const globalEnv = yamlBlock(workflow, /^env:\s*$/, 0);
  const unitTests = yamlBlock(workflow, /^ {2}unit-tests:\s*$/, 2);
  const integrationTests = yamlBlock(workflow, /^ {2}integration-tests:\s*$/, 2);
  const buildSmoke = yamlBlock(workflow, /^ {2}build-smoke:\s*$/, 2);

  if (globalEnv.includes("APPALOFT_DATABASE_URL:")) {
    violations.push({
      rule: "hermetic-package-tests",
      message:
        "Do not expose APPALOFT_DATABASE_URL through workflow-global env; package tests must be hermetic.",
    });
  }

  if (!/^\s*(?:-\s*)?run:\s*bun run test\s*$/m.test(unitTests)) {
    violations.push({
      rule: "hermetic-package-tests",
      message: "The Unit Tests job must run the canonical bun run test gate.",
    });
  }

  if (unitTests.includes("APPALOFT_DATABASE_URL:")) {
    violations.push({
      rule: "hermetic-package-tests",
      message: "The Unit Tests job must not receive APPALOFT_DATABASE_URL.",
    });
  }

  for (const [name, block] of [
    ["integration-tests", integrationTests],
    ["build-smoke", buildSmoke],
  ] as const) {
    if (!block.includes("APPALOFT_DATABASE_URL:")) {
      violations.push({
        rule: "postgres-job-scope",
        message: `The ${name} job must own its APPALOFT_DATABASE_URL explicitly.`,
      });
    }
  }

  const reclaimDiskIndex = buildSmoke.indexOf("name: Reclaim Build Artifacts Before Docker Smoke");
  const dockerBuildIndex = buildSmoke.indexOf("name: Docker Build Smoke");
  if (reclaimDiskIndex < 0 || dockerBuildIndex < 0 || reclaimDiskIndex > dockerBuildIndex) {
    violations.push({
      rule: "build-smoke-disk-budget",
      message: "Build artifacts must be reclaimed before the Docker build smoke runs.",
    });
  }

  return violations;
}

export function findCiChangeClassifierViolations(
  ciWorkflow: string,
  e2eWorkflow: string,
): CiTestBoundaryViolation[] {
  const violations: CiTestBoundaryViolation[] = [];
  const classifier = "scripts/ci/classify-changed-files.ts";

  if (!ciWorkflow.includes(classifier) || !e2eWorkflow.includes(classifier)) {
    violations.push({
      message:
        "ci.yml and e2e.yml must classify changes through scripts/ci/classify-changed-files.ts.",
      rule: "shared-change-classifier",
    });
  }

  if (ciWorkflow.includes("Workflow dispatch; running full CI.")) {
    violations.push({
      message:
        "workflow_dispatch must classify against the default branch instead of forcing full CI.",
      rule: "shared-change-classifier",
    });
  }

  if (
    !e2eWorkflow.includes("name: Skip E2E") ||
    !e2eWorkflow.includes("shard: [1, 2]") ||
    e2eWorkflow.includes("e2e-skip:")
  ) {
    violations.push({
      message:
        "e2e.yml must keep the two-shard matrix and skip inside those jobs so e2e (1, 2) and e2e (2, 2) still succeed.",
      rule: "shared-change-classifier",
    });
  }

  if (!e2eWorkflow.includes("e2e_run_web") || !e2eWorkflow.includes("e2e_run_shell")) {
    violations.push({
      message:
        "e2e.yml must consume e2e_run_web and e2e_run_shell from the shared change classifier.",
      rule: "shared-change-classifier",
    });
  }

  const e2eJob = yamlBlock(e2eWorkflow, /^ {2}e2e:\s*$/, 2);
  if (/^ {4}if:/m.test(e2eJob)) {
    violations.push({
      message:
        "e2e.yml must not job-level skip e2e (including drafts); required e2e (1, 2) and e2e (2, 2) names must still conclude.",
      rule: "shared-change-classifier",
    });
  }

  if (/^ {4}services:\s*$/m.test(e2eJob)) {
    violations.push({
      message:
        "e2e.yml must start Postgres as a step so lightweight and web-only shards do not pay a job-level service tax.",
      rule: "shared-change-classifier",
    });
  }

  const resultVar = ["$", "{result}"].join("");
  const skippedOk = [
    'if [[ "',
    resultVar,
    '" != "success" && "',
    resultVar,
    '" != "skipped" ]]; then',
  ].join("");
  if (!ciWorkflow.includes(skippedOk)) {
    violations.push({
      message:
        "ci.yml must treat skipped needed jobs as success so the required ci check stays green.",
      rule: "shared-change-classifier",
    });
  }

  if (!ciWorkflow.includes("workspace_tui") || !ciWorkflow.includes("name: Skip Workspace TUI")) {
    violations.push({
      message:
        "ci.yml must consume workspace_tui from the shared classifier and skip cargo/docker/bridge work inside Workspace TUI jobs.",
      rule: "shared-change-classifier",
    });
  }

  const tuiJob = yamlBlock(ciWorkflow, /^ {2}workspace-tui:\s*$/, 2);
  if (/^ {4}if:/m.test(tuiJob)) {
    violations.push({
      message:
        "ci.yml must not job-level skip workspace-tui; required Workspace TUI (*) names must still conclude.",
      rule: "shared-change-classifier",
    });
  }

  for (const target of [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64-gnu",
    "linux-x64-gnu",
    "linux-arm64-musl",
    "linux-x64-musl",
  ]) {
    if (!tuiJob.includes(`target: ${target}`)) {
      violations.push({
        message: `ci.yml must keep the Workspace TUI matrix target ${target}.`,
        rule: "shared-change-classifier",
      });
      break;
    }
  }

  const pullRequestTrigger = e2eWorkflow.slice(
    e2eWorkflow.indexOf("  pull_request:"),
    e2eWorkflow.indexOf("  workflow_dispatch:"),
  );
  if (pullRequestTrigger.includes("paths:") || pullRequestTrigger.includes("paths-ignore:")) {
    violations.push({
      message: "e2e.yml must not hide required shard checks behind pull_request path filters.",
      rule: "shared-change-classifier",
    });
  }

  return violations;
}

export function findUnitTestsWebViewOwnershipViolations(
  ciWorkflow: string,
  e2eWorkflow: string,
  dashboardPackageJson: string,
): CiTestBoundaryViolation[] {
  const violations: CiTestBoundaryViolation[] = [];
  const unitTests = yamlBlock(ciWorkflow, /^ {2}unit-tests:\s*$/, 2);

  if (!/^ {4}name: Unit Tests\s*$/m.test(unitTests)) {
    violations.push({
      message: "The Unit Tests job name must stay exactly Unit Tests.",
      rule: "unit-tests-webview-ownership",
    });
  }

  if (/^ {4}if:/m.test(unitTests)) {
    violations.push({
      message:
        "ci.yml must not job-level skip unit-tests; the required Unit Tests name must still conclude.",
      rule: "unit-tests-webview-ownership",
    });
  }

  if (/\btest:e2e(?::webview)?\b/.test(unitTests)) {
    violations.push({
      message: "The Unit Tests job must not invoke WebView e2e; e2e.yml owns that suite.",
      rule: "unit-tests-webview-ownership",
    });
  }

  let dashboardScripts: Record<string, string> = {};
  try {
    const parsed = JSON.parse(dashboardPackageJson) as { scripts?: Record<string, string> };
    dashboardScripts = parsed.scripts ?? {};
  } catch {
    violations.push({
      message:
        "apps/dashboard/package.json must remain valid JSON so Unit Tests can stay vitest-only.",
      rule: "unit-tests-webview-ownership",
    });
    return violations;
  }

  if (/\btest:e2e(?::webview)?\b/.test(dashboardScripts.test ?? "")) {
    violations.push({
      message:
        "@appaloft/dashboard `test` must stay vitest-only so turbo run test does not pay the WebView tax.",
      rule: "unit-tests-webview-ownership",
    });
  }

  if (!dashboardScripts["test:e2e"] || !dashboardScripts["test:e2e:webview"]) {
    violations.push({
      message: "@appaloft/dashboard must keep test:e2e and test:e2e:webview for e2e.yml.",
      rule: "unit-tests-webview-ownership",
    });
  }

  if (!e2eWorkflow.includes("run: bun run test:e2e")) {
    violations.push({
      message: "e2e.yml must keep bun run test:e2e as the WebView owner.",
      rule: "unit-tests-webview-ownership",
    });
  }

  return violations;
}

function yamlBlock(source: string, startPattern: RegExp, indentation: number): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return "";

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (line.length - line.trimStart().length <= indentation) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

async function checkRepository(): Promise<void> {
  const ciWorkflowPath = resolve(import.meta.dir, "../.github/workflows/ci.yml");
  const e2eWorkflowPath = resolve(import.meta.dir, "../.github/workflows/e2e.yml");
  const dashboardPackageJsonPath = resolve(import.meta.dir, "../apps/dashboard/package.json");
  const ciWorkflow = await readFile(ciWorkflowPath, "utf8");
  const e2eWorkflow = await readFile(e2eWorkflowPath, "utf8");
  const dashboardPackageJson = await readFile(dashboardPackageJsonPath, "utf8");
  const violations = [
    ...findCiTestBoundaryViolations(ciWorkflow),
    ...findCiChangeClassifierViolations(ciWorkflow, e2eWorkflow),
    ...findUnitTestsWebViewOwnershipViolations(ciWorkflow, e2eWorkflow, dashboardPackageJson),
  ];
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`[${violation.rule}] ${violation.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("CI test boundary check passed");
}

if (import.meta.main) {
  await checkRepository();
}
