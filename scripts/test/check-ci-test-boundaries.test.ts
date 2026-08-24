import { describe, expect, test } from "bun:test";
import {
  findCiChangeClassifierViolations,
  findCiTestBoundaryViolations,
  findUnitTestsWebViewOwnershipViolations,
} from "../check-ci-test-boundaries";

const expression = (value: string) => ["$", "{{ ", value, " }}"].join("");

const validWorkflow = `
env:
  APPALOFT_APP_VERSION: 0.1.0-ci
jobs:
  unit-tests:
    steps:
      - run: bun run test
  integration-tests:
    env:
      APPALOFT_DATABASE_URL: postgres://integration
  build-smoke:
    env:
      APPALOFT_DATABASE_URL: postgres://smoke
    steps:
      - name: Reclaim Build Artifacts Before Docker Smoke
      - name: Docker Build Smoke
`;

describe("CI test boundary check", () => {
  test("[CI-TEST-BOUNDARY-001] accepts hermetic package tests and job-scoped PostgreSQL", () => {
    expect(findCiTestBoundaryViolations(validWorkflow)).toEqual([]);
  });

  test("[CI-TEST-BOUNDARY-002] rejects a database target inherited by every CI job", () => {
    const workflow = validWorkflow.replace(
      "  APPALOFT_APP_VERSION: 0.1.0-ci",
      "  APPALOFT_APP_VERSION: 0.1.0-ci\n  APPALOFT_DATABASE_URL: postgres://global",
    );

    expect(findCiTestBoundaryViolations(workflow)).toContainEqual(
      expect.objectContaining({ rule: "hermetic-package-tests" }),
    );
  });

  test("[CI-TEST-BOUNDARY-003] requires the canonical package-test command", () => {
    const workflow = validWorkflow.replace("run: bun run test", "run: bun run test:unit");

    expect(findCiTestBoundaryViolations(workflow)).toContainEqual(
      expect.objectContaining({ rule: "hermetic-package-tests" }),
    );
  });

  test("[CI-TEST-BOUNDARY-004] requires disk reclamation before Docker build smoke", () => {
    const workflow = validWorkflow.replace(
      "      - name: Reclaim Build Artifacts Before Docker Smoke\n",
      "",
    );

    expect(findCiTestBoundaryViolations(workflow)).toContainEqual(
      expect.objectContaining({ rule: "build-smoke-disk-budget" }),
    );
  });

  test("[CI-LIGHTWEIGHT-005] requires ci.yml and e2e.yml to share the change classifier", () => {
    const ciWorkflow = `${validWorkflow}
      - run: bun scripts/ci/classify-changed-files.ts
    if: \${{ needs.changes.outputs.lightweight_only != 'true' }}
            if [[ "\${result}" != "success" && "\${result}" != "skipped" ]]; then
  workspace-tui:
    name: Workspace TUI
    strategy:
      matrix:
        include:
          - target: darwin-arm64
          - target: darwin-x64
          - target: linux-arm64-gnu
          - target: linux-x64-gnu
          - target: linux-arm64-musl
          - target: linux-x64-musl
    steps:
      - name: Skip Workspace TUI
      - name: consume workspace_tui
`;
    const e2eWorkflow = `
on:
  pull_request:
  workflow_dispatch:
jobs:
  e2e:
    strategy:
      matrix:
        shard: [1, 2]
    steps:
      - name: Skip E2E
      - run: bun scripts/ci/classify-changed-files.ts
      - name: consume e2e_run_web and e2e_run_shell
`;

    expect(findCiChangeClassifierViolations(ciWorkflow, e2eWorkflow)).toEqual([]);
    expect(
      findCiChangeClassifierViolations(
        `${ciWorkflow}\n            echo "Workflow dispatch; running full CI."\n`,
        e2eWorkflow,
      ),
    ).toContainEqual(expect.objectContaining({ rule: "shared-change-classifier" }));
    expect(
      findCiChangeClassifierViolations(ciWorkflow, "on:\n  pull_request:\n  workflow_dispatch:\n"),
    ).toContainEqual(expect.objectContaining({ rule: "shared-change-classifier" }));
    expect(
      findCiChangeClassifierViolations(
        ciWorkflow,
        `${e2eWorkflow.replace("    steps:", "    services:\n      postgres:\n    steps:")}`,
      ),
    ).toContainEqual(
      expect.objectContaining({
        message:
          "e2e.yml must start Postgres as a step so lightweight and web-only shards do not pay a job-level service tax.",
      }),
    );
    expect(
      findCiChangeClassifierViolations(
        ciWorkflow.replace(
          "  workspace-tui:",
          [
            "  workspace-tui:\n    if: ",
            expression("needs.changes.outputs.workspace_tui == 'true'"),
          ].join(""),
        ),
        e2eWorkflow,
      ),
    ).toContainEqual(
      expect.objectContaining({
        message:
          "ci.yml must not job-level skip workspace-tui; required Workspace TUI (*) names must still conclude.",
      }),
    );
    expect(
      findCiChangeClassifierViolations(
        ciWorkflow,
        e2eWorkflow.replace(
          "  e2e:",
          ["  e2e:\n    if: ", expression("github.event.pull_request.draft == false")].join(""),
        ),
      ),
    ).toContainEqual(
      expect.objectContaining({
        message:
          "e2e.yml must not job-level skip e2e (including drafts); required e2e (1, 2) and e2e (2, 2) names must still conclude.",
      }),
    );
  });

  test("[CI-UNIT-SCOPE-001] keeps Unit Tests named and free of WebView e2e", () => {
    const ciWorkflow = `
jobs:
  unit-tests:
    name: Unit Tests
    steps:
      - name: Skip Unit Tests
      - name: Unit Tests
        run: bun run test
`;
    const e2eWorkflow = `
      - name: Dashboard WebView Smoke
        run: bun run test:e2e
`;
    const webPackageJson = JSON.stringify({
      scripts: {
        test: "bun run test:unit -- --run",
        "test:e2e": "bun run test:e2e:webview",
        "test:e2e:webview": "bun run build && bun test test/e2e-webview/home.webview.test.ts",
      },
    });

    expect(
      findUnitTestsWebViewOwnershipViolations(ciWorkflow, e2eWorkflow, webPackageJson),
    ).toEqual([]);
    expect(
      findUnitTestsWebViewOwnershipViolations(
        ciWorkflow.replace("name: Unit Tests", "name: Package Tests"),
        e2eWorkflow,
        webPackageJson,
      ),
    ).toContainEqual(
      expect.objectContaining({
        message: "The Unit Tests job name must stay exactly Unit Tests.",
      }),
    );
    expect(
      findUnitTestsWebViewOwnershipViolations(
        ciWorkflow.replace(
          "  unit-tests:",
          [
            "  unit-tests:\n    if: ",
            expression("needs.changes.outputs.lightweight_only != 'true'"),
          ].join(""),
        ),
        e2eWorkflow,
        webPackageJson,
      ),
    ).toContainEqual(
      expect.objectContaining({
        message:
          "ci.yml must not job-level skip unit-tests; the required Unit Tests name must still conclude.",
      }),
    );
    expect(
      findUnitTestsWebViewOwnershipViolations(
        ciWorkflow.replace("run: bun run test", "run: bun run test:e2e:webview"),
        e2eWorkflow,
        webPackageJson,
      ),
    ).toContainEqual(
      expect.objectContaining({
        message: "The Unit Tests job must not invoke WebView e2e; e2e.yml owns that suite.",
      }),
    );
    expect(
      findUnitTestsWebViewOwnershipViolations(
        ciWorkflow,
        e2eWorkflow,
        JSON.stringify({
          scripts: {
            test: "bun run test:unit -- --run && bun run test:e2e",
            "test:e2e": "bun run test:e2e:webview",
            "test:e2e:webview": "bun run build && bun test test/e2e-webview/home.webview.test.ts",
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        message:
          "@appaloft/dashboard `test` must stay vitest-only so turbo run test does not pay the WebView tax.",
      }),
    );
    expect(
      findUnitTestsWebViewOwnershipViolations(
        ciWorkflow,
        e2eWorkflow.replace("run: bun run test:e2e", "run: echo skip"),
        webPackageJson,
      ),
    ).toContainEqual(
      expect.objectContaining({
        message: "e2e.yml must keep bun run test:e2e as the WebView owner.",
      }),
    );
  });
});
