import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const actionRoot = resolve(import.meta.dir, "../../.github/actions/deploy-action");
const actionYaml = readFileSync(join(actionRoot, "action.yml"), "utf8");
const readme = readFileSync(join(actionRoot, "README.md"), "utf8");
const publicCiWorkflow = readFileSync(join(actionRoot, ".github/workflows/ci.yml"), "utf8");
const runDeployScript = join(actionRoot, "scripts/run-deploy.sh");
const exportScript = resolve(import.meta.dir, "../export-deploy-action-wrapper.ts");

function runDeploy(input: Record<string, string | undefined>) {
  const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-test-"));
  const argvPath = join(workspace, "argv.txt");
  const outputPath = join(workspace, "github-output.txt");
  const env = {
    ...Bun.env,
    APPALOFT_DEPLOY_ACTION_ARGV_PATH: argvPath,
    APPALOFT_DEPLOY_ACTION_DRY_RUN: "true",
    APPALOFT_BIN: "/opt/appaloft/appaloft",
    GITHUB_OUTPUT: outputPath,
    RUNNER_TEMP: workspace,
    ...input,
  };

  const result = Bun.spawnSync(["bash", runDeployScript], {
    cwd: workspace,
    env,
    stderr: "pipe",
    stdout: "pipe",
  });

  const argv = result.exitCode === 0 ? readFileSync(argvPath, "utf8").trim().split("\n") : [];
  const output = result.exitCode === 0 ? readFileSync(outputPath, "utf8") : "";

  return {
    argv,
    output,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
    exitCode: result.exitCode,
    workspace,
  };
}

describe("deploy-action wrapper reference", () => {
  test("[CONFIG-FILE-ENTRY-009] action metadata installs before deploying and exposes wrapper outputs", () => {
    expect(actionYaml).toContain("using: composite");
    expect(actionYaml).toContain("scripts/install-appaloft.sh");
    expect(actionYaml).toContain("scripts/run-deploy.sh");
    expect(actionYaml).toContain("command:");
    expect(actionYaml).toContain("appaloft-version");
    expect(actionYaml).toContain("preview-url");
    expect(actionYaml).toContain("preview-cleanup-status");
    expect(actionYaml).toContain("pr-comment");
    expect(actionYaml).toContain("github-token");
    expect(actionYaml).not.toContain("project:");
    expect(actionYaml).not.toContain("resource:");
    expect(actionYaml).not.toContain("server:");
  });

  test("[CONFIG-FILE-ENTRY-009] exports the public deploy-action repository layout", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-export-"));
    const outputRoot = join(workspace, "deploy-action");
    const result = Bun.spawnSync([process.execPath, exportScript, outputRoot], {
      cwd: resolve(import.meta.dir, "../.."),
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      for (const file of [
        ".github/workflows/ci.yml",
        "action.yml",
        "README.md",
        "scripts/install-appaloft.sh",
        "scripts/run-deploy.sh",
        "scripts/resolve-control-plane.sh",
      ]) {
        expect(readFileSync(join(outputRoot, file), "utf8")).toBe(
          readFileSync(join(actionRoot, file), "utf8"),
        );
      }
      expect(statSync(join(outputRoot, "scripts/install-appaloft.sh")).mode & 0o111).toBeTruthy();
      expect(statSync(join(outputRoot, "scripts/run-deploy.sh")).mode & 0o111).toBeTruthy();
      expect(
        statSync(join(outputRoot, "scripts/resolve-control-plane.sh")).mode & 0o111,
      ).toBeTruthy();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-009] exported public CI validates wrapper layout and dry-run preview mapping", () => {
    expect(publicCiWorkflow).toContain(
      "bash -n scripts/install-appaloft.sh scripts/run-deploy.sh scripts/resolve-control-plane.sh",
    );
    expect(publicCiWorkflow).toContain("APPALOFT_DEPLOY_ACTION_DRY_RUN");
    expect(publicCiWorkflow).toContain("INPUT_PREVIEW: pull-request");
    expect(publicCiWorkflow).toContain('grep -q -- "--preview-output-file"');
    expect(publicCiWorkflow).toContain("Opt-in exact-version install smoke");
    expect(publicCiWorkflow).toContain("APPALOFT_INSTALL_SMOKE_VERSION");
    expect(publicCiWorkflow).not.toContain("APPALOFT_SSH_PRIVATE_KEY");
  });

  test("[CONFIG-FILE-ENTRY-010][CONFIG-FILE-ENTRY-015] maps trusted action inputs to CLI preview flags", () => {
    const result = runDeploy({
      INPUT_CONFIG: "appaloft.preview.yml",
      INPUT_SOURCE: ".",
      INPUT_RUNTIME_NAME: "preview-42",
      INPUT_SSH_HOST: "203.0.113.10",
      INPUT_SSH_USER: "deploy",
      INPUT_SSH_PORT: "2222",
      INPUT_SSH_PRIVATE_KEY:
        "-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----",
      INPUT_SERVER_PROVIDER: "generic-ssh",
      INPUT_SERVER_PROXY_KIND: "traefik",
      INPUT_PREVIEW: "pull-request",
      INPUT_PREVIEW_ID: "pr-42",
      INPUT_PREVIEW_DOMAIN_TEMPLATE: "pr-42.preview.example.com",
      INPUT_PREVIEW_TLS_MODE: "disabled",
      INPUT_REQUIRE_PREVIEW_URL: "true",
      INPUT_ENVIRONMENT_VARIABLES:
        "HOST=0.0.0.0\nPORT=4321\nAPPALOFT_BETTER_AUTH_URL=http://pr-42.preview.example.com",
      INPUT_SECRET_VARIABLES: "APPALOFT_BETTER_AUTH_SECRET=ci-env:APPALOFT_BETTER_AUTH_SECRET",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv.slice(0, 4)).toEqual([
        "/opt/appaloft/appaloft",
        "deploy",
        ".",
        "--config",
      ]);
      expect(result.argv).toContain("appaloft.preview.yml");
      expect(result.argv).toContain("--runtime-name");
      expect(result.argv).toContain("preview-42");
      expect(result.argv).toContain("--server-host");
      expect(result.argv).toContain("203.0.113.10");
      expect(result.argv).toContain("--state-backend");
      expect(result.argv).toContain("ssh-pglite");
      expect(result.argv).toContain("--preview");
      expect(result.argv).toContain("pull-request");
      expect(result.argv).toContain("--preview-id");
      expect(result.argv).toContain("pr-42");
      expect(result.argv).toContain("--preview-domain-template");
      expect(result.argv).toContain("pr-42.preview.example.com");
      expect(result.argv).toContain("--env");
      expect(result.argv).toContain("HOST=0.0.0.0");
      expect(result.argv).toContain("APPALOFT_BETTER_AUTH_URL=http://pr-42.preview.example.com");
      expect(result.argv).toContain("--secret");
      expect(result.argv).toContain(
        "APPALOFT_BETTER_AUTH_SECRET=ci-env:APPALOFT_BETTER_AUTH_SECRET",
      );
      expect(result.argv).toContain("--require-preview-url");
      expect(result.output).toContain("preview-id=pr-42");
      expect(result.output).toContain("preview-url=http://pr-42.preview.example.com");

      const privateKeyFlagIndex = result.argv.indexOf("--server-ssh-private-key-file");
      expect(privateKeyFlagIndex).toBeGreaterThan(0);
      const privateKeyPath = result.argv[privateKeyFlagIndex + 1];
      expect(privateKeyPath).toBeDefined();
      if (!privateKeyPath) {
        throw new Error("missing private key path");
      }
      expect(privateKeyPath).toStartWith(result.workspace);
      expect(existsSync(privateKeyPath)).toBe(false);
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-026] publishes preview-url from CLI preview output file", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-preview-output-"));
    const outputPath = join(workspace, "github-output.txt");
    const fakeAppaloft = join(workspace, "appaloft");
    writeFileSync(
      fakeAppaloft,
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'preview_output_file=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "--preview-output-file" ]; then',
        "    shift",
        '    preview_output_file="$1"',
        "  fi",
        "  shift || true",
        "done",
        'if [ -z "$preview_output_file" ]; then',
        "  echo 'missing preview output file' >&2",
        "  exit 1",
        "fi",
        "cat > \"$preview_output_file\" <<'EOF'",
        "schema-version=deploy.preview-output/v1",
        "deployment-id=dep_1",
        "resource-id=res_1",
        "preview-id=pr-43",
        "deployment-status=succeeded",
        "preview-url=https://generated.preview.example.com",
        "EOF",
        "",
      ].join("\n"),
    );
    chmodSync(fakeAppaloft, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: fakeAppaloft,
        GITHUB_OUTPUT: outputPath,
        RUNNER_TEMP: workspace,
        INPUT_SOURCE: ".",
        INPUT_SSH_HOST: "203.0.113.10",
        INPUT_PREVIEW: "pull-request",
        INPUT_PREVIEW_ID: "pr-43",
        INPUT_REQUIRE_PREVIEW_URL: "true",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      const output = readFileSync(outputPath, "utf8");
      expect(output).toContain("preview-id=pr-43");
      expect(output).toContain("preview-url=https://generated.preview.example.com");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-019] maps preview-cleanup command to CLI cleanup", () => {
    const result = runDeploy({
      INPUT_COMMAND: "preview-cleanup",
      INPUT_CONFIG: "appaloft.preview.yml",
      INPUT_SOURCE: ".",
      INPUT_SSH_HOST: "203.0.113.10",
      INPUT_SSH_USER: "deploy",
      INPUT_PREVIEW: "pull-request",
      INPUT_PREVIEW_ID: "pr-42",
      INPUT_PREVIEW_DOMAIN_TEMPLATE: "pr-42.preview.example.com",
      INPUT_REQUIRE_PREVIEW_URL: "true",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv.slice(0, 4)).toEqual([
        "/opt/appaloft/appaloft",
        "preview",
        "cleanup",
        ".",
      ]);
      expect(result.argv).toContain("--config");
      expect(result.argv).toContain("appaloft.preview.yml");
      expect(result.argv).toContain("--server-host");
      expect(result.argv).toContain("203.0.113.10");
      expect(result.argv).toContain("--state-backend");
      expect(result.argv).toContain("ssh-pglite");
      expect(result.argv).toContain("--preview");
      expect(result.argv).toContain("pull-request");
      expect(result.argv).toContain("--preview-id");
      expect(result.argv).toContain("pr-42");
      expect(result.argv).not.toContain("--preview-domain-template");
      expect(result.argv).not.toContain("--require-preview-url");
      expect(result.argv).not.toContain("--preview-output-file");
      expect(result.output).toContain("preview-id=pr-42");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-ENTRY-002] unsupported control-plane inputs fail before mutation", () => {
    const result = runDeploy({
      INPUT_CONTROL_PLANE_MODE: "cloud",
      INPUT_SSH_HOST: "203.0.113.10",
    });

    try {
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("control-plane-mode=cloud");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-011] self-hosted preview cleanup calls the server cleanup API", () => {
    const result = runDeploy({
      INPUT_COMMAND: "preview-cleanup",
      INPUT_CONFIG: "appaloft.preview.yml",
      INPUT_CONTROL_PLANE_MODE: "self-hosted",
      INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
      INPUT_PREVIEW: "pull-request",
      INPUT_PREVIEW_ID: "pr-42",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv).toEqual([
        "GET https://console.example.com/api/version",
        "POST https://console.example.com/api/deployments/cleanup-preview",
      ]);
      expect(result.output).toContain("console-url=https://console.example.com");
      expect(result.output).toContain("preview-id=pr-42");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-027] optional PR comment publishes the console feedback endpoint", () => {
    const result = runDeploy({
      INPUT_COMMAND: "preview-cleanup",
      INPUT_CONFIG: "appaloft.preview.yml",
      INPUT_CONTROL_PLANE_MODE: "self-hosted",
      INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
      INPUT_PREVIEW: "pull-request",
      INPUT_PREVIEW_ID: "pr-42",
      INPUT_PR_COMMENT: "true",
      INPUT_GITHUB_TOKEN: "github-token-fixture",
      GITHUB_REPOSITORY: "appaloft/www",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv).toEqual([
        "GET https://console.example.com/api/version",
        "POST https://console.example.com/api/deployments/cleanup-preview",
        "COMMENT https://api.github.com/repos/appaloft/www/issues/42/comments",
      ]);
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-027] PR comment failures do not fail a successful deployment", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-pr-comment-"));
    const outputPath = join(workspace, "github-output.txt");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    const fakeAppaloft = join(workspace, "appaloft");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      ["#!/usr/bin/env bash", "echo 'comment denied' >&2", "exit 22", ""].join("\n"),
    );
    writeFileSync(fakeAppaloft, ["#!/usr/bin/env bash", "exit 0", ""].join("\n"));
    chmodSync(fakeCurl, 0o755);
    chmodSync(fakeAppaloft, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: fakeAppaloft,
        GITHUB_OUTPUT: outputPath,
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_SOURCE: ".",
        INPUT_SSH_HOST: "203.0.113.10",
        INPUT_PREVIEW: "pull-request",
        INPUT_PREVIEW_ID: "pr-44",
        INPUT_PREVIEW_DOMAIN_TEMPLATE: "pr-44.preview.example.com",
        INPUT_PREVIEW_TLS_MODE: "disabled",
        INPUT_PR_COMMENT: "true",
        INPUT_GITHUB_TOKEN: "github-token-fixture",
        GITHUB_REPOSITORY: "appaloft/www",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(readFileSync(outputPath, "utf8")).toContain(
        "preview-url=http://pr-44.preview.example.com",
      );
      expect(result.stderr.toString()).toContain("Appaloft PR comment was not published");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-012] no-config deploy defaults source and uses appaloft.yml only when present", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-config-default-"));
    const argvPath = join(workspace, "argv.txt");
    const outputPath = join(workspace, "github-output.txt");
    writeFileSync(join(workspace, "appaloft.yml"), "runtime:\n  strategy: workspace-commands\n");
    chmodSync(runDeployScript, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_DEPLOY_ACTION_ARGV_PATH: argvPath,
        APPALOFT_DEPLOY_ACTION_DRY_RUN: "true",
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        GITHUB_OUTPUT: outputPath,
        RUNNER_TEMP: workspace,
        INPUT_SOURCE: ".",
        INPUT_SSH_HOST: "203.0.113.10",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(readFileSync(argvPath, "utf8").trim().split("\n")).toContain("--config");
      expect(readFileSync(argvPath, "utf8").trim().split("\n")).toContain("appaloft.yml");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONFIG-FILE-ENTRY-018][CONFIG-FILE-ENTRY-019] Marketplace README documents previews and cleanup safety", () => {
    expect(readme).toContain("uses: appaloft/deploy-action@v1");
    expect(readme).toContain("version: v0.9.0");
    expect(readme).toContain("Minimal `appaloft.yml`");
    expect(readme).toContain("pull_request:");
    expect(readme).toContain(
      "if: github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(readme).toContain("config: appaloft.preview.yml");
    expect(readme).toContain("require-preview-url: true");
    expect(readme).toContain("command: preview-cleanup");
    expect(readme).toContain("types: [closed]");
    expect(readme).toContain("Cleanup is idempotent");
    expect(readme).toContain("Product-grade previews");
  });
});
