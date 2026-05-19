import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const workflow = readFileSync(join(root, ".github/workflows/deploy-console.yml"), "utf8");
const expression = (value: string) => ["$", "{{ ", value, " }}"].join("");
const shellExpansion = (value: string) => ["$", "{", value, "}"].join("");

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow installs self-hosted Appaloft over SSH", () => {
  expect(workflow).toContain("name: Deploy Console");
  expect(workflow).toContain("APPALOFT_CONSOLE_SSH_HOST");
  expect(workflow).toContain("APPALOFT_CONSOLE_SSH_PRIVATE_KEY");
  expect(workflow).toContain("uses: ./.github/actions/deploy-action");
  expect(workflow).toContain("command: install-console");
  expect(workflow).toContain(
    `ssh-host: ${expression("vars.APPALOFT_CONSOLE_SSH_HOST || vars.APPALOFT_SSH_HOST")}`,
  );
  expect(workflow).toContain(
    `ssh-private-key: ${expression("secrets.APPALOFT_CONSOLE_SSH_PRIVATE_KEY || secrets.APPALOFT_SSH_PRIVATE_KEY")}`,
  );
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow resolves explicit prerelease versions", () => {
  expect(workflow).toContain("APPALOFT_CONSOLE_VERSION");
  expect(workflow).toContain("latest stable");
  expect(workflow).toContain(
    "Deploy Console version must be a release tag like v1.0.0-rc.1 or latest.",
  );
  expect(workflow).toContain(
    `APPALOFT_CONSOLE_VERSION: ${expression("inputs.version || vars.APPALOFT_CONSOLE_VERSION || 'latest'")}`,
  );
  expect(workflow).toContain(`version: ${expression("steps.settings.outputs.version")}`);
  expect(workflow).toContain("Pass a prerelease tag explicitly");
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow defaults to production Postgres mode", () => {
  expect(workflow).toContain("default: postgres");
  expect(workflow).toContain(`console-database: ${expression("inputs.database")}`);
  expect(workflow).toContain(`console-url: ${expression("vars.APPALOFT_CONSOLE_ORIGIN")}`);
  expect(workflow).toContain("APPALOFT_CONSOLE_DOMAIN");
  expect(workflow).toContain(`domain="${shellExpansion("APPALOFT_CONSOLE_ORIGIN#http://")}"`);
  expect(workflow).toContain(`domain="${shellExpansion("domain#https://")}"`);
  expect(workflow).toContain(`console-domain: ${expression("steps.settings.outputs.domain")}`);
  expect(workflow).toContain(`url: ${expression("steps.console.outputs.console-url")}`);
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow exposes Docker orchestrator settings", () => {
  expect(workflow).toContain("default: compose");
  expect(workflow).toContain(`console-orchestrator: ${expression("inputs.orchestrator")}`);
  expect(workflow).toContain("console-swarm-stack-name");
  expect(workflow).toContain(`console-swarm-init: ${expression("inputs.swarm_init")}`);
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow exposes optional Jaeger tracing", () => {
  expect(workflow).toContain("trace:");
  expect(workflow).toContain("Optional trace collector to install with the console.");
  expect(workflow).toContain("- jaeger");
  expect(workflow).toContain(`console-trace: ${expression("inputs.trace")}`);
  expect(workflow).toContain(`console-jaeger-ui-host: ${expression("inputs.jaeger_ui_host")}`);
  expect(workflow).toContain(`console-jaeger-ui-port: ${expression("inputs.jaeger_ui_port")}`);
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow keeps secrets out of repository config", () => {
  expect(workflow).not.toContain("APPALOFT_POSTGRES_PASSWORD");
  expect(workflow).not.toContain("APPALOFT_DATABASE_URL");
  expect(workflow).toContain("secrets.APPALOFT_CONSOLE_SSH_PRIVATE_KEY");
  expect(workflow).toContain("secrets.APPALOFT_SSH_PRIVATE_KEY");
  expect(workflow).toContain("vars.APPALOFT_CONSOLE_ORIGIN");
  expect(workflow).not.toContain("scp \\");
});
