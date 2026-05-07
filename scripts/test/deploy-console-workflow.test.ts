import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const workflow = readFileSync(join(root, ".github/workflows/deploy-console.yml"), "utf8");

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow installs self-hosted Appaloft over SSH", () => {
  expect(workflow).toContain("name: Deploy Console");
  expect(workflow).toContain("APPALOFT_CONSOLE_SSH_HOST");
  expect(workflow).toContain("APPALOFT_CONSOLE_SSH_PRIVATE_KEY");
  expect(workflow).toContain("scp \\");
  expect(workflow).toContain("install.sh \\");
  expect(workflow).toContain("/tmp/appaloft-install.sh");
  expect(workflow).toContain("sh /tmp/appaloft-install.sh --version");
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow defaults to durable PGlite mode", () => {
  expect(workflow).toContain("default: pglite");
  expect(workflow).toContain("APPALOFT_SELF_HOST_DATABASE");
  expect(workflow).toContain('--database $(shell_quote "$APPALOFT_SELF_HOST_DATABASE")');
  expect(workflow).toContain("APPALOFT_WEB_ORIGIN");
  expect(workflow).toContain("/api/health");
});

test("[CONTROL-PLANE-INSTALL-002] deploy-console workflow keeps secrets out of repository config", () => {
  expect(workflow).not.toContain("APPALOFT_POSTGRES_PASSWORD");
  expect(workflow).not.toContain("APPALOFT_DATABASE_URL");
  expect(workflow).toContain("secrets.APPALOFT_CONSOLE_SSH_PRIVATE_KEY");
  expect(workflow).toContain("vars.APPALOFT_CONSOLE_ORIGIN");
});
