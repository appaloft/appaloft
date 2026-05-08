import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const workflow = readFileSync(join(root, ".github/workflows/deploy-console.yml"), "utf8");
const expression = (value: string) => ["$", "{{ ", value, " }}"].join("");

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow installs self-hosted Appaloft over SSH", () => {
  expect(workflow).toContain("name: Deploy Console");
  expect(workflow).toContain("APPALOFT_CONSOLE_SSH_HOST");
  expect(workflow).toContain("APPALOFT_CONSOLE_SSH_PRIVATE_KEY");
  expect(workflow).toContain("uses: ./.github/actions/deploy-action");
  expect(workflow).toContain("command: install-console");
  expect(workflow).toContain(`ssh-host: ${expression("vars.APPALOFT_CONSOLE_SSH_HOST")}`);
  expect(workflow).toContain(
    `ssh-private-key: ${expression("secrets.APPALOFT_CONSOLE_SSH_PRIVATE_KEY")}`,
  );
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow defaults to durable PGlite mode", () => {
  expect(workflow).toContain("default: pglite");
  expect(workflow).toContain(`console-database: ${expression("inputs.database")}`);
  expect(workflow).toContain(`console-url: ${expression("vars.APPALOFT_CONSOLE_ORIGIN")}`);
  expect(workflow).toContain(`url: ${expression("steps.console.outputs.console-url")}`);
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow exposes Docker orchestrator settings", () => {
  expect(workflow).toContain("default: compose");
  expect(workflow).toContain(`console-orchestrator: ${expression("inputs.orchestrator")}`);
  expect(workflow).toContain("console-swarm-stack-name");
  expect(workflow).toContain(`console-swarm-init: ${expression("inputs.swarm_init")}`);
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow keeps secrets out of repository config", () => {
  expect(workflow).not.toContain("APPALOFT_POSTGRES_PASSWORD");
  expect(workflow).not.toContain("APPALOFT_DATABASE_URL");
  expect(workflow).toContain("secrets.APPALOFT_CONSOLE_SSH_PRIVATE_KEY");
  expect(workflow).toContain("vars.APPALOFT_CONSOLE_ORIGIN");
  expect(workflow).not.toContain("scp \\");
});
