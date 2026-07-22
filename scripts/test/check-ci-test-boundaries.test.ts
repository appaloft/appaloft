import { describe, expect, test } from "bun:test";
import { findCiTestBoundaryViolations } from "../check-ci-test-boundaries";

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
});
