import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const actionRoot = resolve(import.meta.dir, "../../.github/actions/deploy-action");
const actionYaml = readFileSync(join(actionRoot, "action.yml"), "utf8");
const runDeployScript = join(actionRoot, "scripts/run-deploy.sh");

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
    expect(actionYaml).toContain("appaloft-version");
    expect(actionYaml).toContain("preview-url");
    expect(actionYaml).not.toContain("project:");
    expect(actionYaml).not.toContain("resource:");
    expect(actionYaml).not.toContain("server:");
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
});
