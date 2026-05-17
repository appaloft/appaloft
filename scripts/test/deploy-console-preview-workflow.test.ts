import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const workflow = readFileSync(join(root, ".github/workflows/deploy-console-preview.yml"), "utf8");
const backendConfig = readFileSync(join(root, "appaloft.console-backend-preview.yml"), "utf8");
const legacyStaticConfig = readFileSync(join(root, "appaloft.console-preview.yml"), "utf8");
const shellVariable = (value: string) => ["$", "{", value, "}"].join("");

test("[CONTROL-PLANE-INSTALL-007] deploy-console-preview workflow deploys a PR-scoped console backend through CLI", () => {
  expect(workflow).toContain("name: Deploy Console Preview");
  expect(workflow).toContain("console_preview_required");
  expect(workflow).toContain("apps/web/*");
  expect(workflow).toContain("apps/shell/*");
  expect(workflow).toContain("bun run apps/shell/src/index.ts deploy .");
  expect(workflow).toContain("--config appaloft.console-backend-preview.yml");
  expect(workflow).toContain("--method dockerfile");
  expect(workflow).toContain("--resource-kind application");
  expect(workflow).toContain("--dockerfile-path Dockerfile");
  expect(workflow).toContain("--port 3001");
  expect(workflow).toContain("--health-path /api/health");
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
  expect(workflow).toContain("--config appaloft.console-backend-preview.yml");
  expect(
    workflow.indexOf(
      "bun run apps/shell/src/index.ts preview cleanup . \\\n            --config appaloft.console-preview.yml",
    ),
  ).toBeLessThan(
    workflow.indexOf(
      "bun run apps/shell/src/index.ts deploy . \\\n            --config appaloft.console-backend-preview.yml",
    ),
  );
  expect(
    workflow.indexOf(
      "bun run apps/shell/src/index.ts preview cleanup . \\\n            --config appaloft.console-backend-preview.yml",
    ),
  ).toBeLessThan(
    workflow.indexOf(
      "bun run apps/shell/src/index.ts deploy . \\\n            --config appaloft.console-backend-preview.yml",
    ),
  );
  expect(backendConfig).toContain("controlPlane:");
  expect(backendConfig).toContain("mode: none");
  expect(backendConfig).not.toContain("baseDirectory");
  expect(legacyStaticConfig).toContain("controlPlane:");
  expect(legacyStaticConfig).toContain("mode: none");
  expect(legacyStaticConfig).not.toContain("baseDirectory");
});

test("[CONTROL-PLANE-INSTALL-007] deploy-console-preview uses a PR-scoped same-origin backend", () => {
  expect(workflow).toContain("APPALOFT_CONSOLE_PREVIEW_AUTH_SECRET");
  expect(workflow).toContain("APPALOFT_BETTER_AUTH_SECRET");
  expect(workflow).toContain("crypto.getRandomValues(new Uint8Array(48))");
  expect(workflow).toContain('await Bun.file("package.json").json()');
  expect(workflow).not.toContain("APPALOFT_APP_NAME=");
  expect(workflow).toContain('--env "APPALOFT_APP_VERSION=$APPALOFT_APP_VERSION"');
  expect(workflow).toContain('--env "APPALOFT_WEB_ORIGIN=$PREVIEW_URL"');
  expect(workflow).toContain('--env "APPALOFT_BETTER_AUTH_URL=$PREVIEW_URL"');
  expect(workflow).toContain(
    '--secret "APPALOFT_BETTER_AUTH_SECRET=ci-env:APPALOFT_BETTER_AUTH_SECRET"',
  );
  expect(workflow).not.toContain("APPALOFT_CONSOLE_PREVIEW_API_BASE_URL");
  expect(workflow).not.toContain("VITE_APPALOFT_API_BASE_URL=");
  expect(workflow).not.toContain("--publish-dir apps/web/build");
  expect(workflow).not.toContain("APPALOFT_DATABASE_URL");
  expect(workflow).not.toContain("APPALOFT_POSTGRES_PASSWORD");
});
