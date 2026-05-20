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

function runDeploy(input: Record<string, string | undefined>, files?: Record<string, string>) {
  const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-test-"));
  const argvPath = join(workspace, "argv.txt");
  const outputPath = join(workspace, "github-output.txt");
  const summaryPath = join(workspace, "github-step-summary.md");
  for (const [path, content] of Object.entries(files ?? {})) {
    writeFileSync(join(workspace, path), content);
  }
  const env = {
    ...Bun.env,
    APPALOFT_DEPLOY_ACTION_ARGV_PATH: argvPath,
    APPALOFT_DEPLOY_ACTION_DRY_RUN: "true",
    APPALOFT_BIN: "/opt/appaloft/appaloft",
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
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
  const output =
    result.exitCode === 0 && existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
  const summary =
    result.exitCode === 0 && existsSync(summaryPath) ? readFileSync(summaryPath, "utf8") : "";

  return {
    argv,
    output,
    summary,
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
    expect(actionYaml).toContain("install-console");
    expect(actionYaml).toContain("console-domain");
    expect(actionYaml).toContain("console-database");
    expect(actionYaml).toContain("console-orchestrator");
    expect(actionYaml).toContain("appaloft-version");
    expect(actionYaml).toContain("preview-url");
    expect(actionYaml).toContain("preview-cleanup-status");
    expect(actionYaml).toContain("deployment-url");
    expect(actionYaml).toContain("pr-comment");
    expect(actionYaml).toContain("github-token");
    expect(actionYaml).toContain("server-config-deploy");
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
    expect(publicCiWorkflow).toContain("Validate dry-run self-hosted preview deploy");
    expect(publicCiWorkflow).toContain("INPUT_CONTROL_PLANE_MODE: self-hosted");
    expect(publicCiWorkflow).toContain(
      "POST https://console.example.com/api/action/deployments/from-source-link",
    );
    expect(publicCiWorkflow).toContain("Validate dry-run self-hosted server config deploy");
    expect(publicCiWorkflow).toContain(
      "POST https://console.example.com/api/action/deployments/from-config-package",
    );
    expect(publicCiWorkflow).toContain("Validate dry-run console install");
    expect(publicCiWorkflow).toContain("INPUT_COMMAND: install-console");
    expect(publicCiWorkflow).toContain("INPUT_CONSOLE_ORCHESTRATOR: swarm");
    expect(publicCiWorkflow).toContain("HEALTH https://console.example.com/api/health");
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

  test("[SELF-AUTH-ACTION-007] self-hosted preview cleanup sends Action auth marker and bearer token", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-cleanup-auth-"));
    const outputPath = join(workspace, "github-output.txt");
    const curlArgsPath = join(workspace, "curl-args.txt");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'printf "%s\\n" "$*" >> "$APPALOFT_TEST_CURL_ARGS_PATH"',
        'case "$*" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{"sourcePackages":true}}\'',
        "    ;;",
        '  *"/api/deployments/cleanup-preview"*)',
        '    printf \'{"status":"cleaned"}\'',
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        APPALOFT_TEST_CURL_ARGS_PATH: curlArgsPath,
        GITHUB_OUTPUT: outputPath,
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_APPALOFT_TOKEN: "action-token-fixture",
        INPUT_COMMAND: "preview-cleanup",
        INPUT_CONFIG: "appaloft.preview.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_PREVIEW: "pull-request",
        INPUT_PREVIEW_ID: "pr-42",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      const curlArgs = readFileSync(curlArgsPath, "utf8");
      expect(curlArgs).toContain("Authorization: Bearer action-token-fixture");
      expect(curlArgs).toContain("X-Appaloft-Action-Command: preview-cleanup");
      expect(readFileSync(outputPath, "utf8")).toContain("preview-cleanup-status=cleaned");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-012] self-hosted preview deploy calls the server deployment API", () => {
    const result = runDeploy({
      INPUT_CONFIG: "appaloft.preview.yml",
      INPUT_CONTROL_PLANE_MODE: "self-hosted",
      INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
      INPUT_PREVIEW: "pull-request",
      INPUT_PREVIEW_ID: "pr-42",
      INPUT_PROJECT_ID: "prj_console",
      INPUT_ENVIRONMENT_ID: "env_preview",
      INPUT_RESOURCE_ID: "res_preview",
      INPUT_SERVER_ID: "srv_prod",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv).toEqual([
        "GET https://console.example.com/api/version",
        "POST https://console.example.com/api/action/deployments/from-source-link",
      ]);
      expect(result.output).toContain("console-url=https://console.example.com");
      expect(result.output).toContain("preview-id=pr-42");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-014] self-hosted server config deploy calls the config package API in dry-run", () => {
    const result = runDeploy({
      INPUT_CONFIG: "appaloft.yml",
      INPUT_CONTROL_PLANE_MODE: "self-hosted",
      INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
      INPUT_SERVER_CONFIG_DEPLOY: "true",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv).toEqual([
        "GET https://console.example.com/api/version",
        "POST https://console.example.com/api/action/deployments/from-config-package",
      ]);
      expect(result.output).toContain("console-url=https://console.example.com");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-014] self-hosted deploy reads deployment context from appaloft.yml", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-config-context-"));
    const outputPath = join(workspace, "github-output.txt");
    const payloadPath = join(workspace, "payload.json");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      join(workspace, "appaloft.yml"),
      [
        "controlPlane:",
        "  mode: self-hosted",
        "  url: https://console.example.com",
        "  deploymentContext:",
        "    projectId: prj_www",
        "    environmentId: env_prod",
        "    resourceId: res_www",
        "    serverId: srv_prod",
        "runtime:",
        "  strategy: static",
      ].join("\n"),
    );
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'args="$*"',
        'payload_file=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "--data-binary" ]; then',
        "    shift",
        '    payload_file="$1"',
        "    payload_file=\"$(printf '%s' \"$payload_file\" | sed 's/^@//')\"",
        "  fi",
        "  shift || true",
        "done",
        'case "$args" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{"sourcePackage":true,"serverSideConfigBootstrap":true}}\'',
        "    ;;",
        '  *"/api/action/deployments/from-config-package"*)',
        '    cp "$payload_file" "$APPALOFT_TEST_PAYLOAD_PATH"',
        '    printf \'{"id":"dep_config_context","deploymentHref":"/deployments/dep_config_context"}\'',
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        APPALOFT_TEST_PAYLOAD_PATH: payloadPath,
        GITHUB_OUTPUT: outputPath,
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_CONFIG: "appaloft.yml",
        INPUT_SERVER_CONFIG_DEPLOY: "true",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
      expect(payload.trustedContext).toMatchObject({
        projectId: "prj_www",
        environmentId: "env_prod",
        resourceId: "res_www",
        serverId: "srv_prod",
      });
      expect(readFileSync(outputPath, "utf8")).toContain(
        "deployment-url=https://console.example.com/deployments/dep_config_context",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-014] self-hosted server config deploy sends resolved ci-env secrets to the server API", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-server-secrets-"));
    const outputPath = join(workspace, "github-output.txt");
    const payloadPath = join(workspace, "payload.json");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'args="$*"',
        'payload_file=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "--data-binary" ]; then',
        "    shift",
        '    payload_file="$1"',
        "    payload_file=\"$(printf '%s' \"$payload_file\" | sed 's/^@//')\"",
        "  fi",
        "  shift || true",
        "done",
        'case "$args" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{"sourcePackage":true,"serverSideConfigBootstrap":true}}\'',
        "    ;;",
        '  *"/api/action/deployments/from-config-package"*)',
        '    cp "$payload_file" "$APPALOFT_TEST_PAYLOAD_PATH"',
        '    printf \'{"id":"dep_server_config_secret","deploymentHref":"/deployments/dep_server_config_secret"}\'',
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BETTER_AUTH_SECRET: "resolved-ci-secret",
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        APPALOFT_TEST_PAYLOAD_PATH: payloadPath,
        GITHUB_OUTPUT: outputPath,
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_CONFIG: "appaloft.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_SECRET_VARIABLES: "APPALOFT_BETTER_AUTH_SECRET=ci-env:APPALOFT_BETTER_AUTH_SECRET",
        INPUT_SERVER_CONFIG_DEPLOY: "true",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
      expect(payload.resolvedSecrets).toEqual({
        APPALOFT_BETTER_AUTH_SECRET: "resolved-ci-secret",
      });
      expect(result.stderr.toString()).not.toContain("resolved-ci-secret");
      expect(result.stdout.toString()).not.toContain("resolved-ci-secret");
      const output = readFileSync(outputPath, "utf8");
      expect(output).toContain("deployment-id=dep_server_config_secret");
      expect(output).toContain(
        "deployment-url=https://console.example.com/deployments/dep_server_config_secret",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-014] self-hosted server config deploy rejects missing ci-env secrets before API mutation", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-server-secret-missing-"));
    const outputPath = join(workspace, "github-output.txt");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'case "$*" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{"sourcePackage":true,"serverSideConfigBootstrap":true}}\'',
        "    ;;",
        '  *"/api/action/deployments/from-config-package"*)',
        "    echo 'unexpected config package mutation' >&2",
        "    exit 22",
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        GITHUB_OUTPUT: outputPath,
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_CONFIG: "appaloft.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_SECRET_VARIABLES:
          "APPALOFT_BETTER_AUTH_SECRET=ci-env:APPALOFT_DEPLOY_ACTION_TEST_MISSING_SECRET_404",
        INPUT_SERVER_CONFIG_DEPLOY: "true",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("required secret was not found");
      expect(result.stderr.toString()).toContain("APPALOFT_BETTER_AUTH_SECRET");
      expect(result.stderr.toString()).toContain(
        "ci-env:APPALOFT_DEPLOY_ACTION_TEST_MISSING_SECRET_404",
      );
      expect(existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "").toBe("");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-INSTALL-002] install-console downloads and runs the self-hosted installer over SSH", () => {
    const result = runDeploy({
      INPUT_COMMAND: "install-console",
      INPUT_VERSION: "v0.9.1",
      INPUT_SSH_HOST: "203.0.113.10",
      INPUT_SSH_USER: "root",
      INPUT_SSH_PORT: "2222",
      INPUT_CONSOLE_DOMAIN: "console.example.com",
      INPUT_CONSOLE_DATABASE: "pglite",
      INPUT_CONSOLE_ORCHESTRATOR: "swarm",
      INPUT_CONSOLE_SWARM_STACK_NAME: "appaloft-console",
      INPUT_CONSOLE_SWARM_INIT: "true",
      INPUT_CONSOLE_SKIP_DOCKER_INSTALL: "true",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv).toEqual([
        "SSH root@203.0.113.10:2222",
        "INSTALLER https://github.com/appaloft/appaloft/releases/download/v0.9.1/install.sh",
        "RUN sh /tmp/appaloft-install.sh --version 'v0.9.1' --web-origin 'https://console.example.com' --database 'pglite' --orchestrator 'swarm' --host '0.0.0.0' --port '3721' --image 'ghcr.io/appaloft/appaloft' --domain 'console.example.com' --proxy 'traefik' --stack-name 'appaloft-console' --swarm-init --skip-docker-install",
        "HEALTH https://console.example.com/api/health",
      ]);
      expect(result.output).toContain("console-url=https://console.example.com");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-INSTALL-003] install-console reads non-secret console settings from config", () => {
    const result = runDeploy(
      {
        INPUT_COMMAND: "install-console",
        INPUT_VERSION: "latest",
        INPUT_CONFIG: "appaloft.yml",
        INPUT_SSH_HOST: "203.0.113.10",
      },
      {
        "appaloft.yml": [
          "controlPlane:",
          "  mode: self-hosted",
          "  url: https://console.example.com",
          "  install:",
          "    database: pglite",
          "    orchestrator: swarm",
          "    proxy: none",
          "    httpHost: 127.0.0.1",
          "    httpPort: 3101",
          "    swarmStackName: appaloft-console",
          "    swarmInit: true",
          "    image: ghcr.io/appaloft/appaloft:v0.9.x",
          "    skipDockerInstall: true",
        ].join("\n"),
      },
    );

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv).toEqual([
        "SSH root@203.0.113.10:22",
        "INSTALLER https://github.com/appaloft/appaloft/releases/latest/download/install.sh",
        "RUN sh /tmp/appaloft-install.sh --version 'latest' --web-origin 'https://console.example.com' --database 'pglite' --orchestrator 'swarm' --host '127.0.0.1' --port '3101' --image 'ghcr.io/appaloft/appaloft:v0.9.x' --proxy 'none' --stack-name 'appaloft-console' --swarm-init --skip-docker-install",
        "HEALTH https://console.example.com/api/health",
      ]);
      expect(result.output).toContain("console-url=https://console.example.com");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-INSTALL-003] install-console can pass Jaeger tracing to the installer", () => {
    const result = runDeploy({
      INPUT_COMMAND: "install-console",
      INPUT_VERSION: "latest",
      INPUT_SSH_HOST: "203.0.113.10",
      INPUT_CONSOLE_URL: "https://console.example.com",
      INPUT_CONSOLE_TRACE: "jaeger",
      INPUT_CONSOLE_JAEGER_UI_HOST: "0.0.0.0",
      INPUT_CONSOLE_JAEGER_UI_PORT: "16687",
    });

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv[2]).toContain("--trace 'jaeger'");
      expect(result.argv[2]).toContain("--jaeger-ui-host '0.0.0.0'");
      expect(result.argv[2]).toContain("--jaeger-ui-port '16687'");
      expect(result.summary).toContain("Trace: `jaeger`");
      expect(result.summary).toContain("Jaeger UI: `http://0.0.0.0:16687`");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-INSTALL-003] install-console inputs override config defaults", () => {
    const result = runDeploy(
      {
        INPUT_COMMAND: "install-console",
        INPUT_CONFIG: "appaloft.yml",
        INPUT_SSH_HOST: "203.0.113.10",
        INPUT_CONSOLE_DATABASE: "postgres",
        INPUT_CONSOLE_ORCHESTRATOR: "compose",
        INPUT_CONSOLE_HTTP_PORT: "3201",
      },
      {
        "appaloft.yml": [
          "controlPlane:",
          "  mode: self-hosted",
          "  url: https://console.example.com",
          "  install:",
          "    database: pglite",
          "    orchestrator: swarm",
          "    httpPort: 3101",
          "    swarmStackName: appaloft-console",
          "    swarmInit: true",
        ].join("\n"),
      },
    );

    try {
      expect(result.exitCode).toBe(0);
      expect(result.argv[2]).toContain("--database 'postgres'");
      expect(result.argv[2]).toContain("--orchestrator 'compose'");
      expect(result.argv[2]).toContain("--port '3201'");
      expect(result.argv[2]).toContain("--project-name 'appaloft'");
      expect(result.argv[2]).not.toContain("--stack-name");
      expect(result.argv[2]).not.toContain("--swarm-init");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-INSTALL-002] install-console preserves pure SSH deploy as a separate command path", () => {
    const install = runDeploy({
      INPUT_COMMAND: "install-console",
      INPUT_SSH_HOST: "203.0.113.10",
      INPUT_CONSOLE_URL: "http://203.0.113.10:3001",
    });
    const deploy = runDeploy({
      INPUT_SOURCE: ".",
      INPUT_SSH_HOST: "203.0.113.10",
    });

    try {
      expect(install.exitCode).toBe(0);
      expect(install.argv[0]).toBe("SSH root@203.0.113.10:22");
      expect(deploy.exitCode).toBe(0);
      expect(deploy.argv.slice(0, 3)).toEqual(["/opt/appaloft/appaloft", "deploy", "."]);
      expect(deploy.argv).toContain("--state-backend");
      expect(deploy.argv).toContain("ssh-pglite");
    } finally {
      rmSync(install.workspace, { recursive: true, force: true });
      rmSync(deploy.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-INSTALL-002] install-console rejects unknown orchestrators before SSH", () => {
    const result = runDeploy({
      INPUT_COMMAND: "install-console",
      INPUT_SSH_HOST: "203.0.113.10",
      INPUT_CONSOLE_ORCHESTRATOR: "kubernetes",
    });

    try {
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("console-orchestrator must be compose or swarm");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-INSTALL-002] install-console rejects unknown proxy modes before SSH", () => {
    const result = runDeploy({
      INPUT_COMMAND: "install-console",
      INPUT_SSH_HOST: "203.0.113.10",
      INPUT_CONSOLE_PROXY: "nginx",
    });

    try {
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("console-proxy must be traefik or none");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-INSTALL-002] install-console rejects unknown trace stacks before SSH", () => {
    const result = runDeploy({
      INPUT_COMMAND: "install-console",
      INPUT_SSH_HOST: "203.0.113.10",
      INPUT_CONSOLE_TRACE: "zipkin",
    });

    try {
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("console-trace must be none or jaeger");
    } finally {
      rmSync(result.workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-013] self-hosted server config deploy fails when the server lacks source package support", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-server-config-gate-"));
    const outputPath = join(workspace, "github-output.txt");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'case "$*" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{}}\'',
        "    ;;",
        '  *"/api/action/deployments/from-config-package"*)',
        "    echo 'unexpected config package mutation' >&2",
        "    exit 22",
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        GITHUB_OUTPUT: outputPath,
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_CONFIG: "appaloft.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_SERVER_CONFIG_DEPLOY: "true",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("Action Server Config Deploy");
      expect(existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "").toBe("");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-012] self-hosted deploy outputs the console deployment URL", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-server-output-"));
    const outputPath = join(workspace, "github-output.txt");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'case "$*" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1"}\'',
        "    ;;",
        '  *"/api/action/deployments/from-source-link"*)',
        '    printf \'{"id":"dep_server_mode","deploymentHref":"/deployments/dep_server_mode"}\'',
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        GITHUB_OUTPUT: outputPath,
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_CONFIG: "appaloft.preview.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_PREVIEW: "pull-request",
        INPUT_PREVIEW_ID: "pr-42",
        INPUT_PROJECT_ID: "prj_console",
        INPUT_ENVIRONMENT_ID: "env_preview",
        INPUT_RESOURCE_ID: "res_preview",
        INPUT_SERVER_ID: "srv_prod",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      const output = readFileSync(outputPath, "utf8");
      expect(output).toContain("deployment-id=dep_server_mode");
      expect(output).toContain("console-url=https://console.example.com");
      expect(output).toContain(
        "deployment-url=https://console.example.com/deployments/dep_server_mode",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] self-hosted server config preview sends transient env and route payload", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-server-preview-"));
    const outputPath = join(workspace, "github-output.txt");
    const payloadPath = join(workspace, "payload.json");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'case "$*" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{"sourcePackage":true,"serverSideConfigBootstrap":true}}\'',
        "    ;;",
        '  *"/api/action/deployments/from-config-package"*)',
        '    payload=""',
        '    previous=""',
        '    for arg in "$@"; do',
        '      if [ "$previous" = "--data-binary" ]; then',
        '        payload="$arg"',
        "      fi",
        '      previous="$arg"',
        "    done",
        "    payload_file=\"$(printf '%s' \"$payload\" | sed 's/^@//')\"",
        '    cat "$payload_file" > "$APPALOFT_CAPTURED_PAYLOAD"',
        '    printf \'{"id":"dep_server_preview","deploymentHref":"/deployments/dep_server_preview","previewUrl":"http://pr-42.preview.example.com"}\'',
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        APPALOFT_BETTER_AUTH_SECRET: "resolved-secret",
        APPALOFT_CAPTURED_PAYLOAD: payloadPath,
        GITHUB_BASE_REF: "main",
        GITHUB_HEAD_REF: "feature-preview",
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: "appaloft/www",
        GITHUB_REPOSITORY_ID: "123456",
        GITHUB_SHA: "abc123",
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_CONFIG: "appaloft.preview.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_ENVIRONMENT_VARIABLES:
          "HOST=0.0.0.0\nPORT=4321\nAPPALOFT_BETTER_AUTH_URL=http://pr-42.preview.example.com",
        INPUT_PREVIEW: "pull-request",
        INPUT_PREVIEW_ID: "pr-42",
        INPUT_PREVIEW_DOMAIN_TEMPLATE: "pr-42.preview.example.com",
        INPUT_PREVIEW_TLS_MODE: "disabled",
        INPUT_REQUIRE_PREVIEW_URL: "true",
        INPUT_SECRET_VARIABLES: "APPALOFT_BETTER_AUTH_SECRET=ci-env:APPALOFT_BETTER_AUTH_SECRET",
        INPUT_SERVER_CONFIG_DEPLOY: "true",
        INPUT_GITHUB_TOKEN: "github-token-fixture",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      const output = readFileSync(outputPath, "utf8");
      expect(output).toContain("deployment-id=dep_server_preview");
      expect(output).toContain("preview-id=pr-42");
      expect(output).toContain("preview-url=http://pr-42.preview.example.com");
      const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
      expect(payload).toMatchObject({
        configPath: "appaloft.preview.yml",
        environmentVariables: {
          HOST: "0.0.0.0",
          PORT: "4321",
          APPALOFT_BETTER_AUTH_URL: "http://pr-42.preview.example.com",
        },
        preview: {
          kind: "pull-request",
          previewId: "pr-42",
          pullRequestNumber: 42,
          baseRef: "main",
          headRef: "feature-preview",
        },
        previewRoute: {
          host: "pr-42.preview.example.com",
          pathPrefix: "/",
          tlsMode: "disabled",
        },
        resolvedSecrets: {
          APPALOFT_BETTER_AUTH_SECRET: "resolved-secret",
        },
        sourcePackageCredentials: {
          githubToken: "github-token-fixture",
        },
        trustedContext: {
          repositoryFullName: "appaloft/www",
          repositoryId: "123456",
          revision: "abc123",
        },
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-021] self-hosted server config preview allows partial placement hints for preview policy", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-server-preview-hints-"));
    const outputPath = join(workspace, "github-output.txt");
    const payloadPath = join(workspace, "payload.json");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'case "$*" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{"sourcePackage":true,"serverSideConfigBootstrap":true}}\'',
        "    ;;",
        '  *"/api/action/deployments/from-config-package"*)',
        '    payload=""',
        '    previous=""',
        '    for arg in "$@"; do',
        '      if [ "$previous" = "--data-binary" ]; then',
        '        payload="$arg"',
        "      fi",
        '      previous="$arg"',
        "    done",
        "    payload_file=\"$(printf '%s' \"$payload\" | sed 's/^@//')\"",
        '    cat "$payload_file" > "$APPALOFT_CAPTURED_PAYLOAD"',
        '    printf \'{"id":"dep_server_preview","deploymentHref":"/deployments/dep_server_preview","previewUrl":"http://pr-42.preview.example.com"}\'',
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        APPALOFT_CAPTURED_PAYLOAD: payloadPath,
        GITHUB_BASE_REF: "main",
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: "appaloft/www",
        GITHUB_REPOSITORY_ID: "123456",
        GITHUB_SHA: "abc123",
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_CONFIG: "appaloft.preview.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_ENVIRONMENT_ID: "env_preview",
        INPUT_PREVIEW: "pull-request",
        INPUT_PREVIEW_ID: "pr-42",
        INPUT_PREVIEW_DOMAIN_TEMPLATE: "pr-42.preview.example.com",
        INPUT_PROJECT_ID: "prj_www",
        INPUT_SERVER_CONFIG_DEPLOY: "true",
        INPUT_SERVER_ID: "srv_prod",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
      expect(payload.trustedContext).toMatchObject({
        projectId: "prj_www",
        environmentId: "env_preview",
        serverId: "srv_prod",
        repositoryFullName: "appaloft/www",
        repositoryId: "123456",
        revision: "abc123",
      });
      expect(payload.trustedContext).not.toHaveProperty("resourceId");
      expect(readFileSync(outputPath, "utf8")).toContain(
        "preview-url=http://pr-42.preview.example.com",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[SELF-AUTH-ACTION-004] self-hosted deploy surfaces structured action auth denial details", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-auth-denied-"));
    const outputPath = join(workspace, "github-output.txt");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'args="$*"',
        'output_file=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then',
        "    shift",
        '    output_file="$1"',
        "  fi",
        "  shift || true",
        "done",
        'case "$args" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{"sourcePackage":true,"serverSideConfigBootstrap":true}}\'',
        "    ;;",
        '  *"/api/action/deployments/from-config-package"*)',
        "    cat > \"$output_file\" <<'JSON'",
        '{"error":{"code":"action_auth_forbidden","message":"Action deploy token is not authorized for this request","details":{"deniedScope":"repository","missingScope":"repository","reasonCode":"scope_value_not_allowed","workflow":"server-config-deploy","repositoryFullName":"appaloft/appaloft-cloud"}}}',
        "JSON",
        "    printf '403'",
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: "appaloft/appaloft-cloud",
        GITHUB_SHA: "abc123",
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_APPALOFT_TOKEN: "action-token-fixture",
        INPUT_CONFIG: "appaloft.cloud-preview.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_PREVIEW: "pull-request",
        INPUT_PREVIEW_ID: "cloud-pr-263",
        INPUT_PREVIEW_DOMAIN_TEMPLATE: "cloud-pr-263.appalofttest.xyz",
        INPUT_SERVER_CONFIG_DEPLOY: "true",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(22);
      const stderr = result.stderr.toString();
      expect(stderr).toContain("Action deploy token is not authorized for this request");
      expect(stderr).toContain("status=403");
      expect(stderr).toContain("code=action_auth_forbidden");
      expect(stderr).toContain("deniedScope=repository");
      expect(stderr).toContain("reasonCode=scope_value_not_allowed");
      expect(stderr).toContain("workflow=server-config-deploy");
      expect(stderr).toContain("repositoryFullName=appaloft/appaloft-cloud");
      expect(stderr).not.toContain("action-token-fixture");
      expect(existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "").not.toContain(
        "deployment-id=",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-015] self-hosted deploy surfaces source package fetch details", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-config-fetch-denied-"));
    const outputPath = join(workspace, "github-output.txt");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'args="$*"',
        'output_file=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-o" ]; then',
        "    shift",
        '    output_file="$1"',
        "  fi",
        "  shift || true",
        "done",
        'case "$args" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{"sourcePackage":true,"serverSideConfigBootstrap":true}}\'',
        "    ;;",
        '  *"/api/action/deployments/from-config-package"*)',
        "    cat > \"$output_file\" <<'JSON'",
        '{"error":{"code":"validation_error","message":"GitHub source package config could not be fetched","details":{"phase":"config-bootstrap","reasonCode":"github_source_package_config_fetch_failed","upstreamStatus":404,"configPath":"appaloft.cloud-preview.yml","repositoryFullName":"appaloft/appaloft-cloud","credentialProvided":true}}}',
        "JSON",
        "    printf '400'",
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: "appaloft/appaloft-cloud",
        GITHUB_SHA: "abc123",
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_APPALOFT_TOKEN: "action-token-fixture",
        INPUT_CONFIG: "appaloft.cloud-preview.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_GITHUB_TOKEN: "github-token-fixture",
        INPUT_SERVER_CONFIG_DEPLOY: "true",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(22);
      const stderr = result.stderr.toString();
      expect(stderr).toContain("GitHub source package config could not be fetched");
      expect(stderr).toContain("status=400");
      expect(stderr).toContain("code=validation_error");
      expect(stderr).toContain("reasonCode=github_source_package_config_fetch_failed");
      expect(stderr).toContain("phase=config-bootstrap");
      expect(stderr).toContain("upstreamStatus=404");
      expect(stderr).toContain("configPath=appaloft.cloud-preview.yml");
      expect(stderr).toContain("repositoryFullName=appaloft/appaloft-cloud");
      expect(stderr).toContain("credentialProvided=true");
      expect(stderr).not.toContain("github-token-fixture");
      expect(existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "").not.toContain(
        "deployment-id=",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] self-hosted server config preview fails without server-confirmed route", () => {
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-deploy-action-server-preview-"));
    const outputPath = join(workspace, "github-output.txt");
    const binDir = join(workspace, "bin");
    const fakeCurl = join(binDir, "curl");
    mkdirSync(binDir);
    writeFileSync(
      fakeCurl,
      [
        "#!/usr/bin/env bash",
        'case "$*" in',
        '  *"/api/version"*)',
        '    printf \'{"apiVersion":"v1","features":{"sourcePackage":true,"serverSideConfigBootstrap":true}}\'',
        "    ;;",
        '  *"/api/action/deployments/from-config-package"*)',
        '    printf \'{"id":"dep_server_preview","deploymentHref":"/deployments/dep_server_preview"}\'',
        "    ;;",
        "  *)",
        "    echo 'unexpected curl call' >&2",
        "    exit 22",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync(["bash", runDeployScript], {
      cwd: workspace,
      env: {
        ...Bun.env,
        APPALOFT_BIN: "/opt/appaloft/appaloft",
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: "appaloft/www",
        GITHUB_REPOSITORY_ID: "123456",
        GITHUB_SHA: "abc123",
        PATH: `${binDir}:${Bun.env.PATH ?? ""}`,
        RUNNER_TEMP: workspace,
        INPUT_CONFIG: "appaloft.preview.yml",
        INPUT_CONTROL_PLANE_MODE: "self-hosted",
        INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
        INPUT_PREVIEW: "pull-request",
        INPUT_PREVIEW_ID: "pr-42",
        INPUT_PREVIEW_DOMAIN_TEMPLATE: "pr-42.preview.example.com",
        INPUT_PREVIEW_TLS_MODE: "disabled",
        INPUT_SERVER_CONFIG_DEPLOY: "true",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    try {
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("did not confirm the requested preview domain");
      expect(existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "").not.toContain(
        "preview-url=",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("[CONTROL-PLANE-HANDSHAKE-009] self-hosted preview deploy rejects route/profile inputs", () => {
    const result = runDeploy({
      INPUT_CONFIG: "appaloft.preview.yml",
      INPUT_CONTROL_PLANE_MODE: "self-hosted",
      INPUT_CONTROL_PLANE_URL: "https://console.example.com/",
      INPUT_PREVIEW: "pull-request",
      INPUT_PREVIEW_ID: "pr-42",
      INPUT_PREVIEW_DOMAIN_TEMPLATE: "pr-42.preview.example.com",
      INPUT_PROJECT_ID: "prj_console",
      INPUT_ENVIRONMENT_ID: "env_preview",
      INPUT_RESOURCE_ID: "res_preview",
      INPUT_SERVER_ID: "srv_prod",
    });

    try {
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("preview route inputs are not applied");
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

  test("[CONFIG-FILE-ENTRY-019] roadmap and workflow no longer describe the public wrapper as missing", () => {
    const roadmap = readFileSync(resolve(import.meta.dir, "../../docs/PRODUCT_ROADMAP.md"), "utf8");
    const workflow = readFileSync(
      resolve(import.meta.dir, "../../docs/workflows/github-action-pr-preview-deploy.md"),
      "utf8",
    );

    expect(roadmap).toContain(
      "[x] Action PR preview: deploy/update from a user-authored GitHub Actions workflow",
    );
    expect(roadmap).toContain(
      "[x] Git source binding, Action PR previews, and product-grade preview deployments.",
    );
    expect(roadmap).not.toContain(
      "[ ] Action PR preview: deploy/update from a user-authored GitHub Actions workflow",
    );
    expect(roadmap).not.toContain(
      "[ ] Git source binding, webhooks, auto-deploy, Action PR previews, and product-grade preview",
    );
    expect(workflow).toContain("public repository is published");
    expect(workflow).not.toContain("public `appaloft/deploy-action` repository is not yet created");
  });
});
