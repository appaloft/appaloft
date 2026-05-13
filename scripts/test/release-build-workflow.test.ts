import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

async function readText(path: string): Promise<string> {
  return Bun.file(join(root, path)).text();
}

async function readPackageScripts(): Promise<Record<string, string>> {
  const packageJson = (await Bun.file(join(root, "package.json")).json()) as {
    scripts?: Record<string, string>;
  };
  return packageJson.scripts ?? {};
}

describe("release build workflow", () => {
  test("[RELEASE-HARDENING-003] publishes governed release artifact classes", async () => {
    const workflow = await readText(".github/workflows/release-build.yml");

    expect(workflow).toContain("name: Release Build");
    expect(workflow).toContain("release-source");
    expect(workflow).toContain("appaloft-backend-v*.tar.gz");
    expect(workflow).toContain("appaloft-web-static-v*.tar.gz");
    expect(workflow).toContain("docker-compose.selfhost.yml");
    expect(workflow).toContain("dist/release/install.sh");
    expect(workflow).toContain(["release-binary-", "$", "{{ matrix.target }}"].join(""));
    expect(workflow).toContain("Linux Binary Smoke");
    expect(workflow).toContain("run-appaloft.sh doctor");
    expect(workflow).toContain("Build Desktop App");
    expect(workflow).toContain("docker/build-push-action");
    expect(workflow).toContain("publish_package packages/sdk");
    expect(workflow).toContain("Generate Manifest And Checksums");
    expect(workflow).toContain("bun run release:manifest");
    expect(workflow).toContain("bun run checksums");
    expect(workflow).toContain("Update Release Notes");
    expect(workflow).toContain("bun run release:notes");
    expect(workflow).toContain("release-final-metadata");
    expect(workflow).toContain("dist/release/release-manifest.json");
    expect(workflow).toContain("dist/release/checksums.txt");
    expect(workflow).toContain("Generate Homebrew Formula");
  });

  test("[RELEASE-HARDENING-006] keeps release-readiness smoke commands first-class", async () => {
    const scripts = await readPackageScripts();
    const nightlyWorkflow = await readText(".github/workflows/nightly.yml");
    const remoteStateSshWorkflow = await readText(".github/workflows/ssh-remote-state-e2e.yml");
    const quickDeploySshWorkflow = await readText(".github/workflows/ssh-quick-deploy-e2e.yml");
    const releaseWorkflow = await readText(".github/workflows/release.yml");

    expect(scripts["smoke:local:commands"]).toContain("scripts/smoke/local-deploy.ts");
    expect(scripts["smoke:local:docker"]).toContain("--method=dockerfile");
    expect(scripts["smoke:local:compose"]).toContain("--method=docker-compose");
    expect(scripts["smoke:local:prebuilt"]).toContain("--method=prebuilt-image");
    expect(scripts["smoke:local:static"]).toContain("--method=static");
    expect(scripts["smoke:install-auth"]).toContain("scripts/test/install-full-smoke.test.ts");
    expect(scripts["smoke:swarm"]).toContain("APPALOFT_DOCKER_SWARM_SMOKE=1");
    expect(scripts["smoke:swarm"]).toContain("docker-swarm-execution-backend.test.ts");
    expect(scripts["smoke:ssh:preflight"]).toBe(
      "bun run scripts/release/check-ssh-release-readiness.ts",
    );
    expect(scripts["smoke:ssh:remote-state"]).toStartWith("bun run smoke:ssh:preflight && ");
    expect(scripts["smoke:ssh:remote-state"]).toContain("APPALOFT_E2E_SSH_REMOTE_STATE=true");
    expect(scripts["smoke:ssh:remote-state"]).toContain(
      "./apps/shell/test/e2e/github-action-ssh-state.workflow.e2e.ts",
    );
    expect(scripts["smoke:ssh:quick-deploy"]).toStartWith("bun run smoke:ssh:preflight && ");
    expect(scripts["smoke:ssh:quick-deploy"]).toContain("APPALOFT_E2E_SSH_QUICK_DEPLOY=true");
    expect(scripts["smoke:ssh:quick-deploy"]).toContain(
      "./apps/shell/test/e2e/quick-deploy-ssh.workflow.e2e.ts",
    );
    expect(scripts["smoke:ssh"]).toBe(
      "bun run smoke:ssh:preflight && bun run smoke:ssh:remote-state && bun run smoke:ssh:quick-deploy",
    );
    expect(scripts["smoke:ssh:remote-state:evidence"]).toBe(
      "bun run scripts/release/capture-ssh-smoke-evidence.ts --suite remote-state --out dist/release/ssh-remote-state-evidence.json",
    );
    expect(scripts["smoke:ssh:quick-deploy:evidence"]).toBe(
      "bun run scripts/release/capture-ssh-smoke-evidence.ts --suite quick-deploy --out dist/release/ssh-quick-deploy-evidence.json",
    );
    expect(scripts["smoke:ssh:evidence"]).toBe(
      "bun run scripts/release/capture-ssh-smoke-evidence.ts",
    );
    expect(scripts["smoke:ssh:evidence:verify"]).toBe(
      "bun run scripts/release/verify-ssh-smoke-evidence.ts",
    );
    expect(scripts["smoke:ssh:remote-state:evidence:verify"]).toBe(
      "bun run scripts/release/verify-ssh-smoke-evidence.ts --suite remote-state --path dist/release/ssh-remote-state-evidence.json",
    );
    expect(scripts["smoke:ssh:quick-deploy:evidence:verify"]).toBe(
      "bun run scripts/release/verify-ssh-smoke-evidence.ts --suite quick-deploy --path dist/release/ssh-quick-deploy-evidence.json",
    );
    expect(releaseWorkflow).toContain("ssh-remote-state-e2e");
    expect(releaseWorkflow).toContain("require_ssh_remote_state_e2e");
    expect(releaseWorkflow).toContain("ssh-quick-deploy-e2e");
    expect(releaseWorkflow).toContain("require_ssh_quick_deploy_e2e");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/ssh-remote-state-e2e.yml");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/ssh-quick-deploy-e2e.yml");
    expect(releaseWorkflow).toContain(
      [
        "build-release:",
        "    needs:",
        "      - release-please",
        "      - ssh-remote-state-e2e",
        "      - ssh-quick-deploy-e2e",
      ].join("\n"),
    );
    expect(releaseWorkflow).toContain(
      [
        "required: ",
        "$",
        "{{ github.event_name == 'workflow_dispatch' && inputs.require_ssh_remote_state_e2e }}",
      ].join(""),
    );
    expect(releaseWorkflow).toContain(
      [
        "required: ",
        "$",
        "{{ github.event_name == 'workflow_dispatch' && inputs.require_ssh_quick_deploy_e2e }}",
      ].join(""),
    );
    expect(releaseWorkflow).not.toContain(
      "startsWith(needs.release-please.outputs.tag_name, 'v0.11.')",
    );
    expect(nightlyWorkflow).toContain("ssh-remote-state-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/ssh-remote-state-e2e.yml");
    expect(nightlyWorkflow).toContain("ssh-quick-deploy-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/ssh-quick-deploy-e2e.yml");
    expect(remoteStateSshWorkflow).toContain("APPALOFT_E2E_SSH_REMOTE_STATE");
    expect(remoteStateSshWorkflow).toContain("Check SSH Release Readiness");
    expect(remoteStateSshWorkflow).toContain("bun run smoke:ssh:preflight");
    expect(remoteStateSshWorkflow).toContain(
      ["APPALOFT_E2E_SSH_PORT: ", "$", "{{ secrets.APPALOFT_E2E_SSH_PORT }}"].join(""),
    );
    expect(remoteStateSshWorkflow).toContain(
      ["APPALOFT_E2E_SSH_PORT: ", "$", "{{ secrets.APPALOFT_E2E_SSH_PORT || '22' }}"].join(""),
    );
    expect(remoteStateSshWorkflow).toContain(
      ["APPALOFT_E2E_SSH_USERNAME: ", "$", "{{ secrets.APPALOFT_E2E_SSH_USERNAME }}"].join(""),
    );
    expect(remoteStateSshWorkflow).toContain(
      [
        "APPALOFT_E2E_SSH_USERNAME: ",
        "$",
        "{{ secrets.APPALOFT_E2E_SSH_USERNAME || 'root' }}",
      ].join(""),
    );
    expect(remoteStateSshWorkflow).not.toContain(
      ["APPALOFT_E2E_SSH_PRIVATE_KEY: ", "$", "{{ secrets.APPALOFT_E2E_SSH_PRIVATE_KEY }}"].join(
        "",
      ),
    );
    expect(remoteStateSshWorkflow).toContain("bun run smoke:ssh:remote-state:evidence");
    expect(remoteStateSshWorkflow).toContain("Upload SSH Remote State Evidence");
    expect(remoteStateSshWorkflow).toContain("name: ssh-remote-state-evidence");
    expect(remoteStateSshWorkflow).toContain("path: dist/release/ssh-remote-state-evidence.json");
    expect(quickDeploySshWorkflow).toContain("APPALOFT_E2E_SSH_QUICK_DEPLOY");
    expect(quickDeploySshWorkflow).toContain("Check SSH Release Readiness");
    expect(quickDeploySshWorkflow).toContain("bun run smoke:ssh:preflight");
    expect(quickDeploySshWorkflow).toContain(
      ["APPALOFT_E2E_SSH_PORT: ", "$", "{{ secrets.APPALOFT_E2E_SSH_PORT }}"].join(""),
    );
    expect(quickDeploySshWorkflow).toContain(
      ["APPALOFT_E2E_SSH_PORT: ", "$", "{{ secrets.APPALOFT_E2E_SSH_PORT || '22' }}"].join(""),
    );
    expect(quickDeploySshWorkflow).toContain(
      ["APPALOFT_E2E_SSH_USERNAME: ", "$", "{{ secrets.APPALOFT_E2E_SSH_USERNAME }}"].join(""),
    );
    expect(quickDeploySshWorkflow).toContain(
      [
        "APPALOFT_E2E_SSH_USERNAME: ",
        "$",
        "{{ secrets.APPALOFT_E2E_SSH_USERNAME || 'root' }}",
      ].join(""),
    );
    expect(quickDeploySshWorkflow).not.toContain(
      ["APPALOFT_E2E_SSH_PRIVATE_KEY: ", "$", "{{ secrets.APPALOFT_E2E_SSH_PRIVATE_KEY }}"].join(
        "",
      ),
    );
    expect(quickDeploySshWorkflow).toContain("bun run smoke:ssh:quick-deploy:evidence");
    expect(quickDeploySshWorkflow).toContain("Upload SSH Quick Deploy Evidence");
    expect(quickDeploySshWorkflow).toContain("name: ssh-quick-deploy-evidence");
    expect(quickDeploySshWorkflow).toContain("path: dist/release/ssh-quick-deploy-evidence.json");
  });

  test("[RELEASE-HARDENING-006] documents SSH release-readiness gates", async () => {
    const releaseDocs = await readText("docs/RELEASE.md");
    const releaseNotesScript = await readText("scripts/release/generate-release-notes.ts");
    const releaseSkill = await readText(".codex/skills/release/SKILL.md");
    const releaseHardeningMatrix = await readText("docs/testing/release-hardening-test-matrix.md");

    expect(releaseDocs).toContain("bun run smoke:ssh");
    expect(releaseDocs).toContain("bun run smoke:ssh:preflight");
    expect(releaseDocs).toContain("bun run smoke:ssh:evidence");
    expect(releaseDocs).toContain("bun run smoke:ssh:evidence:verify");
    expect(releaseDocs).toContain("APPALOFT_E2E_SSH_HOST");
    expect(releaseDocs).toContain("APPALOFT_E2E_SSH_PRIVATE_KEY");
    expect(releaseDocs).toContain("APPALOFT_E2E_SSH_USERNAME");
    expect(releaseDocs).toContain("require_ssh_remote_state_e2e=true");
    expect(releaseDocs).toContain("require_ssh_quick_deploy_e2e=true");
    expect(releaseDocs).toContain(
      "For `0.11.0`, real SSH smoke evidence is an accepted deferred roadmap gap",
    );
    expect(releaseNotesScript).toContain(
      "Real SSH release-readiness smoke evidence is deferred for this release",
    );
    expect(releaseSkill).toContain(
      "For `0.11.0`, missing real SSH smoke evidence is an accepted deferred release-note gap",
    );
    expect(releaseHardeningMatrix).toContain(
      "missing real SSH evidence is an accepted deferred release-note gap",
    );
    expect(releaseHardeningMatrix).toContain(
      "both scripts fail at the opt-in `APPALOFT_E2E_SSH_HOST` requirement",
    );
    expect(releaseHardeningMatrix).toContain("`smoke:ssh:preflight` verifies");
    expect(releaseHardeningMatrix).toContain("ssh-smoke-evidence.json");
    expect(releaseHardeningMatrix).toContain("`smoke:ssh:evidence:verify`");
    expect(releaseHardeningMatrix).toContain("`APPALOFT_E2E_SSH_USERNAME`");
  });

  test("[RELEASE-HARDENING-006] SSH smoke scripts fail closed when opt-in credentials are missing", () => {
    const sshSmokeEnv = {
      ...Bun.env,
      APPALOFT_E2E_SSH_HOST: "",
      APPALOFT_E2E_SSH_PRIVATE_KEY: "",
      APPALOFT_E2E_SSH_QUICK_DEPLOY: "",
      APPALOFT_E2E_SSH_REMOTE_STATE: "",
    };

    const remoteStateResult = Bun.spawnSync(["bun", "run", "smoke:ssh:remote-state"], {
      cwd: root,
      env: sshSmokeEnv,
      stderr: "pipe",
      stdout: "pipe",
    });
    const remoteStateOutput = `${remoteStateResult.stdout.toString()}\n${remoteStateResult.stderr.toString()}`;

    expect(remoteStateResult.exitCode).not.toBe(0);
    expect(remoteStateOutput).toContain("SSH release-readiness preflight failed");
    expect(remoteStateOutput).not.toContain("filters did not match any test files");

    const quickDeployResult = Bun.spawnSync(["bun", "run", "smoke:ssh:quick-deploy"], {
      cwd: root,
      env: sshSmokeEnv,
      stderr: "pipe",
      stdout: "pipe",
    });
    const quickDeployOutput = `${quickDeployResult.stdout.toString()}\n${quickDeployResult.stderr.toString()}`;

    expect(quickDeployResult.exitCode).not.toBe(0);
    expect(quickDeployOutput).toContain("SSH release-readiness preflight failed");
    expect(quickDeployOutput).not.toContain("filters did not match any test files");
  });

  test("[RELEASE-HARDENING-006] SSH release-readiness preflight checks required environment without leaking key values", () => {
    const secretLikePath = "/tmp/appaloft-secret-key-value-that-must-not-print";
    const missingResult = Bun.spawnSync(["bun", "run", "smoke:ssh:preflight"], {
      cwd: root,
      env: {
        ...Bun.env,
        APPALOFT_E2E_SSH_HOST: "",
        APPALOFT_E2E_SSH_PRIVATE_KEY: secretLikePath,
      },
      stderr: "pipe",
      stdout: "pipe",
    });
    const missingOutput = `${missingResult.stdout.toString()}\n${missingResult.stderr.toString()}`;

    expect(missingResult.exitCode).not.toBe(0);
    expect(missingOutput).toContain("APPALOFT_E2E_SSH_HOST is required");
    expect(missingOutput).toContain("APPALOFT_E2E_SSH_PRIVATE_KEY file does not exist");
    expect(missingOutput).not.toContain(secretLikePath);

    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-ssh-preflight-"));
    try {
      const keyPath = join(tempRoot, "id_ed25519");
      const directoryKeyResult = Bun.spawnSync(["bun", "run", "smoke:ssh:preflight"], {
        cwd: root,
        env: {
          ...Bun.env,
          APPALOFT_E2E_SSH_HOST: "127.0.0.1",
          APPALOFT_E2E_SSH_PRIVATE_KEY: tempRoot,
        },
        stderr: "pipe",
        stdout: "pipe",
      });
      const directoryKeyOutput = `${directoryKeyResult.stdout.toString()}\n${directoryKeyResult.stderr.toString()}`;

      expect(directoryKeyResult.exitCode).not.toBe(0);
      expect(directoryKeyOutput).toContain("APPALOFT_E2E_SSH_PRIVATE_KEY path must be a file");
      expect(directoryKeyOutput).not.toContain(tempRoot);

      writeFileSync(keyPath, "");

      const emptyKeyResult = Bun.spawnSync(["bun", "run", "smoke:ssh:preflight"], {
        cwd: root,
        env: {
          ...Bun.env,
          APPALOFT_E2E_SSH_HOST: "127.0.0.1",
          APPALOFT_E2E_SSH_PRIVATE_KEY: keyPath,
        },
        stderr: "pipe",
        stdout: "pipe",
      });
      const emptyKeyOutput = `${emptyKeyResult.stdout.toString()}\n${emptyKeyResult.stderr.toString()}`;

      expect(emptyKeyResult.exitCode).not.toBe(0);
      expect(emptyKeyOutput).toContain("APPALOFT_E2E_SSH_PRIVATE_KEY file is empty");
      expect(emptyKeyOutput).not.toContain(keyPath);

      writeFileSync(keyPath, "not-a-real-key-for-preflight-only");
      if (process.platform !== "win32") {
        chmodSync(keyPath, 0o644);

        const permissiveKeyResult = Bun.spawnSync(["bun", "run", "smoke:ssh:preflight"], {
          cwd: root,
          env: {
            ...Bun.env,
            APPALOFT_E2E_SSH_HOST: "127.0.0.1",
            APPALOFT_E2E_SSH_PRIVATE_KEY: keyPath,
          },
          stderr: "pipe",
          stdout: "pipe",
        });
        const permissiveKeyOutput = `${permissiveKeyResult.stdout.toString()}\n${permissiveKeyResult.stderr.toString()}`;

        expect(permissiveKeyResult.exitCode).not.toBe(0);
        expect(permissiveKeyOutput).toContain(
          "APPALOFT_E2E_SSH_PRIVATE_KEY file permissions must be 0600 or stricter",
        );
        expect(permissiveKeyOutput).not.toContain(keyPath);
        chmodSync(keyPath, 0o600);
      }

      const invalidPortResult = Bun.spawnSync(["bun", "run", "smoke:ssh:preflight"], {
        cwd: root,
        env: {
          ...Bun.env,
          APPALOFT_E2E_SSH_HOST: "127.0.0.1",
          APPALOFT_E2E_SSH_PRIVATE_KEY: keyPath,
          APPALOFT_E2E_SSH_PORT: "not-a-port",
        },
        stderr: "pipe",
        stdout: "pipe",
      });
      const invalidPortOutput = `${invalidPortResult.stdout.toString()}\n${invalidPortResult.stderr.toString()}`;

      expect(invalidPortResult.exitCode).not.toBe(0);
      expect(invalidPortOutput).toContain(
        "APPALOFT_E2E_SSH_PORT must be an integer from 1 to 65535",
      );
      expect(invalidPortOutput).not.toContain(keyPath);

      const blankUsernameResult = Bun.spawnSync(["bun", "run", "smoke:ssh:preflight"], {
        cwd: root,
        env: {
          ...Bun.env,
          APPALOFT_E2E_SSH_HOST: "127.0.0.1",
          APPALOFT_E2E_SSH_PRIVATE_KEY: keyPath,
          APPALOFT_E2E_SSH_USERNAME: "   ",
        },
        stderr: "pipe",
        stdout: "pipe",
      });
      const blankUsernameOutput = `${blankUsernameResult.stdout.toString()}\n${blankUsernameResult.stderr.toString()}`;

      expect(blankUsernameResult.exitCode).not.toBe(0);
      expect(blankUsernameOutput).toContain("APPALOFT_E2E_SSH_USERNAME must not be blank when set");
      expect(blankUsernameOutput).not.toContain(keyPath);

      const passedResult = Bun.spawnSync(["bun", "run", "smoke:ssh:preflight"], {
        cwd: root,
        env: {
          ...Bun.env,
          APPALOFT_E2E_SSH_HOST: "127.0.0.1",
          APPALOFT_E2E_SSH_PRIVATE_KEY: keyPath,
          APPALOFT_E2E_SSH_PORT: "2222",
          APPALOFT_E2E_SSH_USERNAME: "release-user",
        },
        stderr: "pipe",
        stdout: "pipe",
      });
      const passedOutput = `${passedResult.stdout.toString()}\n${passedResult.stderr.toString()}`;

      expect(passedResult.exitCode).toBe(0);
      expect(passedOutput).toContain("ssh executable is available");
      expect(passedOutput).toContain("APPALOFT_E2E_SSH_PORT is valid");
      expect(passedOutput).toContain("APPALOFT_E2E_SSH_USERNAME is configured");
      expect(passedOutput).toContain("SSH release-readiness preflight passed");
      expect(passedOutput).not.toContain(keyPath);
      expect(passedOutput).not.toContain("release-user");
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test("[RELEASE-HARDENING-006] SSH smoke evidence capture writes redacted proof only after success", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-ssh-evidence-"));
    const evidencePath = join(tempRoot, "ssh-smoke-evidence.json");
    const failedEvidencePath = join(tempRoot, "failed-ssh-smoke-evidence.json");
    const secretLikeHost = "ssh-release-target.example.internal";
    const secretLikeKeyPath = join(tempRoot, "secret-key-path");
    const secretLikeUsername = "release-secret-user";
    const secretLikeRouteHost = "release-route.example.internal";

    try {
      const passedResult = Bun.spawnSync(
        [
          "bun",
          "run",
          "scripts/release/capture-ssh-smoke-evidence.ts",
          "--out",
          evidencePath,
          "--release-target",
          "0.11.0",
          "--smoke-command-json",
          JSON.stringify(["bun", "-e", "console.log('fake ssh smoke passed')"]),
        ],
        {
          cwd: root,
          env: {
            ...Bun.env,
            APPALOFT_E2E_PUBLIC_ROUTE_HOST: secretLikeRouteHost,
            APPALOFT_E2E_SSH_HOST: secretLikeHost,
            APPALOFT_E2E_SSH_PRIVATE_KEY: secretLikeKeyPath,
            APPALOFT_E2E_SSH_USERNAME: secretLikeUsername,
          },
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const passedOutput = `${passedResult.stdout.toString()}\n${passedResult.stderr.toString()}`;
      const evidenceText = await Bun.file(evidencePath).text();
      const evidence = JSON.parse(evidenceText) as {
        command?: string;
        environment?: Record<string, boolean>;
        matrixId?: string;
        releaseTarget?: string;
        result?: string;
        schemaVersion?: string;
        suiteMode?: string;
        suites?: string[];
      };

      expect(passedResult.exitCode).toBe(0);
      expect(passedOutput).toContain("SSH release-readiness evidence written");
      expect(evidence.schemaVersion).toBe("appaloft.ssh-smoke-evidence/v1");
      expect(evidence.releaseTarget).toBe("0.11.0");
      expect(evidence.matrixId).toBe("RELEASE-HARDENING-006");
      expect(evidence.command).toBe("custom smoke command");
      expect(evidence.suiteMode).toBe("all");
      expect(evidence.suites).toEqual(["smoke:ssh:remote-state", "smoke:ssh:quick-deploy"]);
      expect(evidence.result).toBe("passed");
      expect(evidence.environment).toEqual({
        hostConfigured: true,
        portConfigured: false,
        privateKeyConfigured: true,
        publicRouteHostConfigured: true,
        usernameConfigured: true,
      });
      expect(evidenceText).not.toContain(secretLikeHost);
      expect(evidenceText).not.toContain(secretLikeKeyPath);
      expect(evidenceText).not.toContain(secretLikeUsername);
      expect(evidenceText).not.toContain(secretLikeRouteHost);
      expect(passedOutput).not.toContain(secretLikeHost);
      expect(passedOutput).not.toContain(secretLikeKeyPath);
      expect(passedOutput).not.toContain(secretLikeUsername);
      expect(passedOutput).not.toContain(secretLikeRouteHost);

      const verifyResult = Bun.spawnSync(
        [
          "bun",
          "run",
          "scripts/release/verify-ssh-smoke-evidence.ts",
          "--path",
          evidencePath,
          "--release-target",
          "0.11.0",
        ],
        {
          cwd: root,
          env: {
            ...Bun.env,
            APPALOFT_E2E_PUBLIC_ROUTE_HOST: secretLikeRouteHost,
            APPALOFT_E2E_SSH_HOST: secretLikeHost,
            APPALOFT_E2E_SSH_PRIVATE_KEY: secretLikeKeyPath,
            APPALOFT_E2E_SSH_USERNAME: secretLikeUsername,
          },
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const verifyOutput = `${verifyResult.stdout.toString()}\n${verifyResult.stderr.toString()}`;

      expect(verifyResult.exitCode).toBe(0);
      expect(verifyOutput).toContain("SSH release-readiness evidence verified");
      expect(verifyOutput).not.toContain(secretLikeHost);
      expect(verifyOutput).not.toContain(secretLikeKeyPath);
      expect(verifyOutput).not.toContain(secretLikeUsername);
      expect(verifyOutput).not.toContain(secretLikeRouteHost);

      const wrongTargetResult = Bun.spawnSync(
        [
          "bun",
          "run",
          "scripts/release/verify-ssh-smoke-evidence.ts",
          "--path",
          evidencePath,
          "--release-target",
          "0.10.0",
        ],
        {
          cwd: root,
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const wrongTargetOutput = `${wrongTargetResult.stdout.toString()}\n${wrongTargetResult.stderr.toString()}`;

      expect(wrongTargetResult.exitCode).not.toBe(0);
      expect(wrongTargetOutput).toContain("releaseTarget is invalid");

      const leakedEvidencePath = join(tempRoot, "leaked-ssh-smoke-evidence.json");
      writeFileSync(
        leakedEvidencePath,
        evidenceText.replace(
          '"hostConfigured": true',
          `"leakedHost": "${secretLikeHost}",\n    "hostConfigured": true`,
        ),
      );
      const leakedEvidenceResult = Bun.spawnSync(
        [
          "bun",
          "run",
          "scripts/release/verify-ssh-smoke-evidence.ts",
          "--path",
          leakedEvidencePath,
        ],
        {
          cwd: root,
          env: {
            ...Bun.env,
            APPALOFT_E2E_SSH_HOST: secretLikeHost,
          },
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const leakedEvidenceOutput = `${leakedEvidenceResult.stdout.toString()}\n${leakedEvidenceResult.stderr.toString()}`;

      expect(leakedEvidenceResult.exitCode).not.toBe(0);
      expect(leakedEvidenceOutput).toContain(
        "SSH evidence must not contain configured SSH secret-like values",
      );

      const failedResult = Bun.spawnSync(
        [
          "bun",
          "run",
          "scripts/release/capture-ssh-smoke-evidence.ts",
          "--out",
          failedEvidencePath,
          "--smoke-command-json",
          JSON.stringify(["bun", "-e", "process.exit(7)"]),
        ],
        {
          cwd: root,
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const failedOutput = `${failedResult.stdout.toString()}\n${failedResult.stderr.toString()}`;

      expect(failedResult.exitCode).toBe(7);
      expect(failedOutput).toContain("SSH release-readiness evidence was not written");
      expect(existsSync(failedEvidencePath)).toBe(false);

      const remoteStateEvidencePath = join(tempRoot, "remote-state-evidence.json");
      const remoteStateResult = Bun.spawnSync(
        [
          "bun",
          "run",
          "scripts/release/capture-ssh-smoke-evidence.ts",
          "--suite",
          "remote-state",
          "--out",
          remoteStateEvidencePath,
          "--smoke-command-json",
          JSON.stringify(["bun", "-e", "console.log('fake remote-state passed')"]),
        ],
        {
          cwd: root,
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const remoteStateEvidence = JSON.parse(await Bun.file(remoteStateEvidencePath).text()) as {
        command?: string;
        suiteMode?: string;
        suites?: string[];
      };

      expect(remoteStateResult.exitCode).toBe(0);
      expect(remoteStateEvidence.command).toBe("custom smoke command");
      expect(remoteStateEvidence.suiteMode).toBe("remote-state");
      expect(remoteStateEvidence.suites).toEqual(["smoke:ssh:remote-state"]);

      const quickDeployEvidencePath = join(tempRoot, "quick-deploy-evidence.json");
      const quickDeployResult = Bun.spawnSync(
        [
          "bun",
          "run",
          "scripts/release/capture-ssh-smoke-evidence.ts",
          "--suite",
          "quick-deploy",
          "--out",
          quickDeployEvidencePath,
          "--smoke-command-json",
          JSON.stringify(["bun", "-e", "console.log('fake quick-deploy passed')"]),
        ],
        {
          cwd: root,
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const quickDeployEvidence = JSON.parse(await Bun.file(quickDeployEvidencePath).text()) as {
        suiteMode?: string;
        suites?: string[];
      };

      expect(quickDeployResult.exitCode).toBe(0);
      expect(quickDeployEvidence.suiteMode).toBe("quick-deploy");
      expect(quickDeployEvidence.suites).toEqual(["smoke:ssh:quick-deploy"]);

      const invalidSuiteEvidencePath = join(tempRoot, "invalid-suite-evidence.json");
      const invalidSuiteResult = Bun.spawnSync(
        [
          "bun",
          "run",
          "scripts/release/capture-ssh-smoke-evidence.ts",
          "--suite",
          "invalid-suite",
          "--out",
          invalidSuiteEvidencePath,
          "--smoke-command-json",
          JSON.stringify(["bun", "-e", "console.log('should not run')"]),
        ],
        {
          cwd: root,
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const invalidSuiteOutput = `${invalidSuiteResult.stdout.toString()}\n${invalidSuiteResult.stderr.toString()}`;

      expect(invalidSuiteResult.exitCode).not.toBe(0);
      expect(invalidSuiteOutput).toContain("--suite must be one of");
      expect(invalidSuiteOutput).not.toContain("should not run");
      expect(existsSync(invalidSuiteEvidencePath)).toBe(false);
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  test("[RELEASE-HARDENING-006] allows stable 0.11.0 with accepted SSH evidence gap", () => {
    const result = Bun.spawnSync(
      [
        "bun",
        "run",
        "scripts/release/align-roadmap-for-release.ts",
        "--target-version",
        "0.11.0",
        "--current-version",
        "0.10.0",
        "--latest-release-tag",
        "v0.10.0",
        "--check",
      ],
      {
        cwd: root,
        stderr: "pipe",
        stdout: "pipe",
      },
    );

    const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
    expect(result.exitCode).toBe(0);
    expect(output).toContain("docs/PRODUCT_ROADMAP.md release alignment is valid for 0.11.0");
    expect(output).not.toContain("Roadmap gate rejects release 0.11.0");
  });

  test("[RELEASE-HARDENING-006] keeps local smoke control-plane and cleanup isolated", async () => {
    const smokeScript = await readText("scripts/smoke/local-deploy.ts");

    expect(smokeScript).toContain("async function reserveTcpPort()");
    expect(smokeScript).toContain("const controlPlanePort = await reserveTcpPort()");
    expect(smokeScript).toContain("APPALOFT_HTTP_PORT: String(controlPlanePort)");
    expect(smokeScript).toContain('OTEL_SDK_DISABLED: "true"');
    expect(smokeScript).not.toContain("http://127.0.0.1:3001/api/health");
    expect(smokeScript).toContain("function runDockerCleanup(args: string[]): void");
    expect(smokeScript).toContain('const dockerPath = Bun.which("docker")');
    expect(smokeScript).toContain('runDockerCleanup(["image", "rm", "-f", smokeImage])');
    expect(smokeScript).toContain("function assertDeploymentProducedRuntime(logs: string): void");
    expect(smokeScript).toContain("Deployment failed before runtime URL was available");
  });
});
