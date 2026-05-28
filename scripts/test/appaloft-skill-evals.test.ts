import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { operationCatalog } from "../../packages/application/src/operation-catalog";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Appaloft skill eval suite", () => {
  test("[APPALOFT-SKILL-EVAL-001] evals cover core Appaloft docs and operation families", () => {
    const result = spawnSync("bun", ["run", "scripts/validate-appaloft-skill-evals.ts"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Validated 24 Appaloft skill evals");
  });

  test("[APPALOFT-SKILL-EVAL-002] eval suite is grounded in current operation catalog keys", async () => {
    const suite = JSON.parse(await Bun.file("skills/appaloft/evals/evals.json").text()) as {
      evals: Array<{ expected_operations: string[] }>;
    };
    const catalogKeys: ReadonlySet<string> = new Set(
      operationCatalog.map((operation) => operation.key),
    );
    const evalOperations = new Set(suite.evals.flatMap((entry) => entry.expected_operations));

    expect(evalOperations.size).toBeGreaterThan(80);
    for (const operationKey of evalOperations) {
      expect(catalogKeys.has(operationKey), operationKey).toBe(true);
    }
  });

  test("[APPALOFT-SKILL-EVAL-003] model eval runner supports no-network dry runs", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/run-appaloft-skill-model-evals.ts", "--dry-run", "--limit", "3"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dry run prepared 3 Appaloft skill model eval prompts");
    expect(result.stdout).toContain("appaloft-skill-server-save-and-manage");
    expect(result.stdout).toContain("appaloft-skill-server-readiness-capacity-maintenance");
  });
});
