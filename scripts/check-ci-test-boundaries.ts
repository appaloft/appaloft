import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface CiTestBoundaryViolation {
  readonly rule: "hermetic-package-tests" | "postgres-job-scope";
  readonly message: string;
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
  const workflowPath = resolve(import.meta.dir, "../.github/workflows/ci.yml");
  const violations = findCiTestBoundaryViolations(await readFile(workflowPath, "utf8"));
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`.github/workflows/ci.yml [${violation.rule}] ${violation.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("CI test boundary check passed");
}

if (import.meta.main) {
  await checkRepository();
}
