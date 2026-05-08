import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const workflow = readFileSync(join(root, ".github/workflows/deploy-docs.yml"), "utf8");
const expression = (value: string) => ["$", "{{ ", value, " }}"].join("");

test("[CONTROL-PLANE-HANDSHAKE-017] deploy-docs self-hosted path dogfoods server config deploy", () => {
  expect(workflow).toContain("name: Deploy Docs");
  expect(workflow).toContain("Deploy Docs Through Appaloft Server");
  expect(workflow).toContain("uses: ./.github/actions/deploy-action");
  expect(workflow).toContain("config: appaloft.docs.yml");
  expect(workflow).toContain("server-config-deploy: true");
  expect(workflow).toContain(
    `control-plane-mode: ${expression("steps.control-plane.outputs.control-plane-mode")}`,
  );
  expect(workflow).toContain(
    `control-plane-url: ${expression("steps.control-plane.outputs.control-plane-url")}`,
  );
  expect(workflow).toContain(`resource-id: ${expression("vars.APPALOFT_DOCS_RESOURCE_ID")}`);
});

test("[CONTROL-PLANE-HANDSHAKE-017] deploy-docs keeps pure SSH CLI fallback separate", () => {
  expect(workflow).toContain(
    `if: ${expression("steps.control-plane.outputs.control-plane-mode != 'self-hosted'")}`,
  );
  expect(workflow).toContain("Remote Runtime Capacity Preflight");
  expect(workflow).toContain("Remote State Lock Preflight");
  expect(workflow).toContain("--state-backend ssh-pglite");
});
