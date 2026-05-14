import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const workflow = readFileSync(join(root, ".github/workflows/deploy-console-preview.yml"), "utf8");
const config = readFileSync(join(root, "appaloft.console-preview.yml"), "utf8");
const shellVariable = (value: string) => ["$", "{", value, "}"].join("");

test("[CONTROL-PLANE-INSTALL-007] deploy-console-preview workflow deploys web static assets through CLI", () => {
  expect(workflow).toContain("name: Deploy Console Preview");
  expect(workflow).toContain("console_preview_required");
  expect(workflow).toContain("apps/web/*");
  expect(workflow).toContain("bun run apps/shell/src/index.ts deploy .");
  expect(workflow).toContain("--config appaloft.console-preview.yml");
  expect(workflow).toContain("--method static");
  expect(workflow).toContain("--resource-kind static-site");
  expect(workflow).toContain("--publish-dir apps/web/build");
  expect(workflow).toContain("--state-backend ssh-pglite");
});

test("[CONTROL-PLANE-INSTALL-007] deploy-console-preview keeps preview routing and cleanup scoped", () => {
  expect(workflow).toContain(
    `preview_host="console-pr-${shellVariable("PR_NUMBER")}.preview.appaloft.com"`,
  );
  expect(workflow).toContain("--preview pull-request");
  expect(workflow).toContain(`--preview-id "pr-${shellVariable("PR_NUMBER")}"`);
  expect(workflow).toContain("--preview-domain-template");
  expect(workflow).toContain("bun run apps/shell/src/index.ts preview cleanup .");
  expect(workflow).toContain("--config appaloft.console-preview.yml");
  expect(config).toContain("controlPlane:");
  expect(config).toContain("mode: none");
  expect(config).not.toContain("baseDirectory");
});

test("[CONTROL-PLANE-INSTALL-007] deploy-console-preview requires an explicit API base URL", () => {
  expect(workflow).toContain("APPALOFT_CONSOLE_PREVIEW_API_BASE_URL");
  expect(workflow).toContain("APPALOFT_CONSOLE_ORIGIN");
  expect(workflow).toContain(
    "VITE_APPALOFT_API_BASE_URL=$API_BASE_URL bun run --cwd apps/web build",
  );
  expect(workflow).not.toContain("APPALOFT_DATABASE_URL");
  expect(workflow).not.toContain("APPALOFT_POSTGRES_PASSWORD");
});
