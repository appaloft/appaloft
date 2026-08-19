import { describe, expect, test } from "bun:test";
import {
  findCiChangeClassifierViolations,
  findCiTestBoundaryViolations,
} from "../check-ci-test-boundaries";

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
  });
});
