import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assignShellE2eFiles,
  selectShellE2eShard,
  webViewSmokeWeightMs,
} from "./select-shell-e2e-shard";

const root = resolve(import.meta.dir, "../..");
const workflow = readFileSync(join(root, ".github/workflows/e2e.yml"), "utf8");
const expression = (value: string) => ["$", "{{ ", value, " }}"].join("");

const shellE2eFiles = [
  "./test/e2e/archive-delete-lifecycle.command.e2e.ts",
  "./test/e2e/certificates.command.e2e.ts",
  "./test/e2e/certificates.import.command.e2e.ts",
  "./test/e2e/dependency-resource-redis-backup.workflow.e2e.ts",
  "./test/e2e/domain-bindings.command.e2e.ts",
  "./test/e2e/github-action-ssh-state.workflow.e2e.ts",
  "./test/e2e/quick-deploy-framework-fixtures-docker.workflow.e2e.ts",
  "./test/e2e/quick-deploy-framework-fixtures-ssh.workflow.e2e.ts",
  "./test/e2e/quick-deploy-local-docker-substrates.workflow.e2e.ts",
  "./test/e2e/quick-deploy-ssh.workflow.e2e.ts",
  "./test/e2e/quick-deploy-static-docker.workflow.e2e.ts",
  "./test/e2e/quick-deploy-workspace-docker.workflow.e2e.ts",
  "./test/e2e/remote-control-plane.command.e2e.ts",
  "./test/e2e/routing-domain-and-tls-proxy.workflow.e2e.ts",
  "./test/e2e/routing-domain-and-tls.workflow.e2e.ts",
  "./test/e2e/server-register.command.e2e.ts",
];

test("shell e2e shard assignment balances the historically slow files", () => {
  const assignments = assignShellE2eFiles(shellE2eFiles, 2);
  const [first, second] = assignments;

  expect(first.shellWeightMs).toBeLessThan(second.shellWeightMs);
  expect(first.extraWeightMs).toBe(webViewSmokeWeightMs);
  expect(second.extraWeightMs).toBe(0);
  expect(first.files.length).toBeGreaterThan(0);
  expect(second.files.length).toBeGreaterThan(0);

  const combinedDifferenceMs = Math.abs(first.totalWeightMs - second.totalWeightMs);
  expect(combinedDifferenceMs).toBeLessThan(20_000);
});

test("shell e2e shard selection is deterministic and complete", () => {
  const first = selectShellE2eShard(shellE2eFiles, 1, 2);
  const second = selectShellE2eShard(shellE2eFiles, 2, 2);
  const selected = [...first.files, ...second.files].sort((left, right) =>
    left.localeCompare(right),
  );

  expect(new Set(selected).size).toBe(shellE2eFiles.length);
  expect(selected).toEqual(shellE2eFiles);
});

test("e2e workflow uses weighted shell shards and runs WebView on the lighter shell shard", () => {
  expect(workflow).toContain("scripts/test/select-shell-e2e-shard.ts");
  expect(workflow).not.toContain("./test/e2e/*.e2e.ts --shard=");
  expect(workflow).toContain(`if: ${expression("matrix.shard == 1")}`);
  expect(workflow).toContain("run: bun run test:e2e");
  expect(workflow.indexOf("name: Web WebView Smoke")).toBeLessThan(
    workflow.indexOf("name: Shell CLI + HTTP E2E"),
  );
});
