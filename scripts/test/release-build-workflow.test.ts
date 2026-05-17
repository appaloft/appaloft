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
    expect(workflow).toContain('[[ "$version" == *-* ]]');
    expect(workflow).toContain("npm_tag=next");
    expect(workflow).toContain("APPALOFT_RELEASE_PRERELEASE");
    expect(workflow).toContain("release_flags+=(--prerelease)");
    expect(workflow).toContain("release_flags+=(--latest)");
    expect(workflow).toContain(
      [
        "type=raw,value=latest,enable=",
        "$",
        "{{ needs.resolve.outputs.prerelease == 'false' }}",
      ].join(""),
    );
    const updateReleaseNotesStep = workflow.match(
      / {6}- name: Update Release Notes\n(?<body>[\s\S]*?)\n\n {6}- name: Upload Final Release Metadata/,
    );
    expect(updateReleaseNotesStep?.groups?.body).toContain("GH_TOKEN");
    expect(updateReleaseNotesStep?.groups?.body).toContain("APPALOFT_RELEASE_PRERELEASE");
    expect(updateReleaseNotesStep?.groups?.body.match(/^ {8}env:/gm)?.length).toBe(1);
  });

  test("[RELEASE-HARDENING-006] keeps release-readiness smoke commands first-class", async () => {
    const scripts = await readPackageScripts();
    const nightlyWorkflow = await readText(".github/workflows/nightly.yml");
    const remoteStateSshWorkflow = await readText(".github/workflows/ssh-remote-state-e2e.yml");
    const quickDeploySshWorkflow = await readText(".github/workflows/ssh-quick-deploy-e2e.yml");
    const frameworkFixtureWorkflow = await readText(".github/workflows/framework-fixture-e2e.yml");
    const scheduledTaskWorkflow = await readText(".github/workflows/scheduled-task-e2e.yml");
    const storageCleanupWorkflow = await readText(".github/workflows/storage-cleanup-e2e.yml");
    const runtimeUsageWorkflow = await readText(".github/workflows/runtime-usage-e2e.yml");
    const capacityPruneWorkflow = await readText(".github/workflows/capacity-prune-e2e.yml");
    const previewProviderWorkflow = await readText(".github/workflows/preview-provider-e2e.yml");
    const dependencyRedisBackupWorkflow = await readText(
      ".github/workflows/dependency-redis-backup-e2e.yml",
    );
    const releaseWorkflow = await readText(".github/workflows/release.yml");

    expect(scripts["smoke:local:commands"]).toContain("scripts/smoke/local-deploy.ts");
    expect(scripts["smoke:local:docker"]).toContain("--method=dockerfile");
    expect(scripts["smoke:local:compose"]).toContain("--method=docker-compose");
    expect(scripts["smoke:local:prebuilt"]).toContain("--method=prebuilt-image");
    expect(scripts["smoke:local:static"]).toContain("--method=static");
    expect(scripts["smoke:framework:docker-fixtures"]).toBe(
      "APPALOFT_E2E_FRAMEWORK_DOCKER=true bun test --timeout=3600000 ./apps/shell/test/e2e/quick-deploy-framework-fixtures-docker.workflow.e2e.ts",
    );
    expect(scripts["smoke:framework:docker-substrates"]).toBe(
      "bun test --timeout=300000 ./apps/shell/test/e2e/quick-deploy-local-docker-substrates.workflow.e2e.ts",
    );
    expect(scripts["smoke:framework:docker"]).toBe(
      "bun run smoke:framework:docker-substrates && bun run smoke:framework:docker-fixtures",
    );
    expect(scripts["smoke:framework:ssh"]).toBe(
      "bun run smoke:ssh:preflight && APPALOFT_E2E_SSH_FRAMEWORK_DOCKER=true bun test --timeout=1800000 ./apps/shell/test/e2e/quick-deploy-framework-fixtures-ssh.workflow.e2e.ts",
    );
    expect(scripts["smoke:framework"]).toBe(
      "bun run smoke:framework:docker && bun run smoke:framework:ssh",
    );
    expect(scripts["smoke:scheduled-task:docker"]).toBe(
      "APPALOFT_E2E_SCHEDULED_TASK_DOCKER=true bun test --timeout=300000 packages/adapters/runtime/test/scheduled-task-runtime.real-docker.test.ts",
    );
    expect(scripts["smoke:scheduled-task:ssh"]).toBe(
      "bun run smoke:ssh:preflight && APPALOFT_E2E_SSH_SCHEDULED_TASK_DOCKER=true bun test --timeout=300000 packages/adapters/runtime/test/scheduled-task-runtime.real-docker.test.ts",
    );
    expect(scripts["smoke:scheduled-task"]).toBe(
      "bun run smoke:scheduled-task:docker && bun run smoke:scheduled-task:ssh",
    );
    expect(scripts["smoke:storage-cleanup:docker"]).toBe(
      "APPALOFT_E2E_STORAGE_CLEANUP_DOCKER=true bun test --timeout=300000 packages/adapters/runtime/test/storage-runtime-cleanup.test.ts",
    );
    expect(scripts["smoke:storage-cleanup:ssh"]).toBe(
      "bun run smoke:ssh:preflight && APPALOFT_E2E_SSH_STORAGE_CLEANUP_DOCKER=true bun test --timeout=300000 packages/adapters/runtime/test/storage-runtime-cleanup.test.ts",
    );
    expect(scripts["smoke:storage-cleanup"]).toBe(
      "bun run smoke:storage-cleanup:docker && bun run smoke:storage-cleanup:ssh",
    );
    expect(scripts["smoke:runtime-usage:docker"]).toBe(
      "APPALOFT_RUNTIME_USAGE_DOCKER_SMOKE=1 bun test --timeout=300000 packages/adapters/runtime/test/runtime-usage-smoke.test.ts",
    );
    expect(scripts["smoke:runtime-usage:ssh"]).toBe(
      "bun run smoke:ssh:preflight && APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1 bun test --timeout=300000 packages/adapters/runtime/test/runtime-usage-smoke.test.ts",
    );
    expect(scripts["smoke:runtime-usage"]).toBe(
      "bun run smoke:runtime-usage:docker && bun run smoke:runtime-usage:ssh",
    );
    expect(scripts["smoke:capacity-prune:local"]).toBe(
      "APPALOFT_E2E_CAPACITY_PRUNE_LOCAL=true bun test --timeout=300000 packages/adapters/runtime/test/runtime-target-capacity-prune.test.ts",
    );
    expect(scripts["smoke:capacity-prune:ssh"]).toBe(
      "bun run smoke:ssh:preflight && APPALOFT_E2E_SSH_CAPACITY_PRUNE=true bun test --timeout=300000 packages/adapters/runtime/test/runtime-target-capacity-prune.test.ts",
    );
    expect(scripts["smoke:capacity-prune"]).toBe(
      "bun run smoke:capacity-prune:local && bun run smoke:capacity-prune:ssh",
    );
    expect(scripts["smoke:preview-provider:github"]).toBe(
      "APPALOFT_GITHUB_PREVIEW_PROVIDER_SMOKE=true bun test --timeout=300000 packages/integrations/github/test/github-preview-provider-smoke.test.ts",
    );
    expect(scripts["smoke:dependency-redis-backup"]).toBe(
      "APPALOFT_E2E_REDIS_BACKUP_RESTORE=true bun test --timeout=300000 ./apps/shell/test/e2e/dependency-resource-redis-backup.workflow.e2e.ts",
    );
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
    expect(releaseWorkflow).toContain("framework-fixture-e2e");
    expect(releaseWorkflow).toContain("scheduled-task-e2e");
    expect(releaseWorkflow).toContain("storage-cleanup-e2e");
    expect(releaseWorkflow).toContain("runtime-usage-e2e");
    expect(releaseWorkflow).toContain("capacity-prune-e2e");
    expect(releaseWorkflow).toContain("preview-provider-e2e");
    expect(releaseWorkflow).toContain("dependency-redis-backup-e2e");
    expect(releaseWorkflow).toContain("require_ssh_quick_deploy_e2e");
    expect(releaseWorkflow).toContain("require_framework_fixture_e2e");
    expect(releaseWorkflow).toContain("require_scheduled_task_e2e");
    expect(releaseWorkflow).toContain("require_storage_cleanup_e2e");
    expect(releaseWorkflow).toContain("require_runtime_usage_e2e");
    expect(releaseWorkflow).toContain("require_capacity_prune_e2e");
    expect(releaseWorkflow).toContain("require_preview_provider_e2e");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/ssh-remote-state-e2e.yml");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/ssh-quick-deploy-e2e.yml");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/framework-fixture-e2e.yml");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/scheduled-task-e2e.yml");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/storage-cleanup-e2e.yml");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/runtime-usage-e2e.yml");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/capacity-prune-e2e.yml");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/preview-provider-e2e.yml");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/dependency-redis-backup-e2e.yml");
    expect(releaseWorkflow).toContain("Mark prerelease release");
    expect(releaseWorkflow).toContain("gh release edit");
    expect(releaseWorkflow).toContain(['--repo "', "$", '{GITHUB_REPOSITORY}"'].join(""));
    expect(releaseWorkflow).toContain("--prerelease");
    expect(releaseWorkflow).toContain(
      [
        "build-release:",
        "    needs:",
        "      - release-please",
        "      - ssh-remote-state-e2e",
        "      - ssh-quick-deploy-e2e",
        "      - framework-fixture-e2e",
        "      - scheduled-task-e2e",
        "      - storage-cleanup-e2e",
        "      - runtime-usage-e2e",
        "      - capacity-prune-e2e",
        "      - preview-provider-e2e",
        "      - dependency-redis-backup-e2e",
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
    expect(releaseWorkflow).toContain(
      [
        "required: ",
        "$",
        "{{ github.event_name == 'workflow_dispatch' && inputs.require_framework_fixture_e2e }}",
      ].join(""),
    );
    expect(releaseWorkflow).toContain(
      [
        "required: ",
        "$",
        "{{ github.event_name == 'workflow_dispatch' && inputs.require_scheduled_task_e2e }}",
      ].join(""),
    );
    expect(releaseWorkflow).toContain(
      [
        "required: ",
        "$",
        "{{ github.event_name == 'workflow_dispatch' && inputs.require_storage_cleanup_e2e }}",
      ].join(""),
    );
    expect(releaseWorkflow).toContain(
      [
        "required: ",
        "$",
        "{{ github.event_name == 'workflow_dispatch' && inputs.require_runtime_usage_e2e }}",
      ].join(""),
    );
    expect(releaseWorkflow).toContain(
      [
        "required: ",
        "$",
        "{{ github.event_name == 'workflow_dispatch' && inputs.require_capacity_prune_e2e }}",
      ].join(""),
    );
    expect(releaseWorkflow).toContain(
      [
        "required: ",
        "$",
        "{{ github.event_name == 'workflow_dispatch' && inputs.require_preview_provider_e2e }}",
      ].join(""),
    );
    expect(releaseWorkflow).not.toContain(
      "startsWith(needs.release-please.outputs.tag_name, 'v0.11.')",
    );
    expect(nightlyWorkflow).toContain("ssh-remote-state-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/ssh-remote-state-e2e.yml");
    expect(nightlyWorkflow).toContain("ssh-quick-deploy-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/ssh-quick-deploy-e2e.yml");
    expect(nightlyWorkflow).toContain("framework-fixture-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/framework-fixture-e2e.yml");
    expect(nightlyWorkflow).toContain("scheduled-task-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/scheduled-task-e2e.yml");
    expect(nightlyWorkflow).toContain("storage-cleanup-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/storage-cleanup-e2e.yml");
    expect(nightlyWorkflow).toContain("runtime-usage-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/runtime-usage-e2e.yml");
    expect(nightlyWorkflow).toContain("capacity-prune-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/capacity-prune-e2e.yml");
    expect(nightlyWorkflow).toContain("preview-provider-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/preview-provider-e2e.yml");
    expect(nightlyWorkflow).toContain("dependency-redis-backup-e2e");
    expect(nightlyWorkflow).toContain("uses: ./.github/workflows/dependency-redis-backup-e2e.yml");
    expect(frameworkFixtureWorkflow).toContain("name: Framework Fixture E2E");
    expect(frameworkFixtureWorkflow).toContain("APPALOFT_E2E_FRAMEWORK_DOCKER");
    expect(frameworkFixtureWorkflow).toContain("APPALOFT_E2E_SSH_FRAMEWORK_DOCKER");
    expect(frameworkFixtureWorkflow).toContain("framework-docker-substrates");
    expect(frameworkFixtureWorkflow).toContain("framework-docker-fixtures");
    expect(frameworkFixtureWorkflow).toContain("APPALOFT_E2E_FRAMEWORK_FIXTURE");
    expect(frameworkFixtureWorkflow).toContain(
      "bun test --timeout=1500000 ./apps/shell/test/e2e/quick-deploy-framework-fixtures-docker.workflow.e2e.ts",
    );
    expect(frameworkFixtureWorkflow).toContain(
      "bun run smoke:ssh:preflight && bun test --timeout=1500000 ./apps/shell/test/e2e/quick-deploy-framework-fixtures-ssh.workflow.e2e.ts",
    );
    expect(frameworkFixtureWorkflow).toContain("HAS_SSH_FRAMEWORK_SECRETS");
    expect(frameworkFixtureWorkflow).toContain(
      "Skipping SSH framework fixture E2E because APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY is not configured.",
    );
    expect(frameworkFixtureWorkflow).toContain(
      "Missing APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY.",
    );
    expect(scheduledTaskWorkflow).toContain("name: Scheduled Task E2E");
    expect(scheduledTaskWorkflow).toContain("bun run smoke:scheduled-task:docker");
    expect(scheduledTaskWorkflow).toContain("bun run smoke:scheduled-task:ssh");
    expect(scheduledTaskWorkflow).toContain("HAS_SSH_SCHEDULED_TASK_SECRETS");
    expect(scheduledTaskWorkflow).toContain(
      "Skipping SSH scheduled-task E2E because APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY is not configured.",
    );
    expect(scheduledTaskWorkflow).toContain(
      "Missing APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY.",
    );
    expect(storageCleanupWorkflow).toContain("name: Storage Cleanup E2E");
    expect(storageCleanupWorkflow).toContain("bun run smoke:storage-cleanup:docker");
    expect(storageCleanupWorkflow).toContain("bun run smoke:storage-cleanup:ssh");
    expect(storageCleanupWorkflow).toContain("HAS_SSH_STORAGE_CLEANUP_SECRETS");
    expect(storageCleanupWorkflow).toContain(
      "Skipping SSH storage-cleanup E2E because APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY is not configured.",
    );
    expect(storageCleanupWorkflow).toContain(
      "Missing APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY.",
    );
    expect(previewProviderWorkflow).toContain("name: Preview Provider E2E");
    expect(previewProviderWorkflow).toContain("bun run smoke:preview-provider:github");
    expect(previewProviderWorkflow).toContain("HAS_GITHUB_PREVIEW_PROVIDER_SECRETS");
    expect(previewProviderWorkflow).toContain("APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN");
    expect(previewProviderWorkflow).toContain("APPALOFT_GITHUB_PREVIEW_SMOKE_REPOSITORY");
    expect(previewProviderWorkflow).toContain("APPALOFT_GITHUB_PREVIEW_SMOKE_PR");
    expect(previewProviderWorkflow).toContain(
      "Skipping GitHub preview provider E2E because APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN, APPALOFT_GITHUB_PREVIEW_SMOKE_REPOSITORY, or APPALOFT_GITHUB_PREVIEW_SMOKE_PR is not configured.",
    );
    expect(dependencyRedisBackupWorkflow).toContain("name: Dependency Redis Backup E2E");
    expect(dependencyRedisBackupWorkflow).toContain("image: redis:7-alpine");
    expect(dependencyRedisBackupWorkflow).toContain("sudo apt-get install -y redis-tools");
    expect(dependencyRedisBackupWorkflow).toContain("bun run smoke:dependency-redis-backup");
    expect(dependencyRedisBackupWorkflow).toContain("APPALOFT_E2E_REDIS_URL");
    expect(runtimeUsageWorkflow).toContain("name: Runtime Usage E2E");
    expect(runtimeUsageWorkflow).toContain("bun run smoke:runtime-usage:docker");
    expect(runtimeUsageWorkflow).toContain("bun run smoke:runtime-usage:ssh");
    expect(runtimeUsageWorkflow).toContain("HAS_SSH_RUNTIME_USAGE_SECRETS");
    expect(runtimeUsageWorkflow).toContain(
      "Skipping SSH runtime-usage E2E because APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY is not configured.",
    );
    expect(runtimeUsageWorkflow).toContain(
      "Missing APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY.",
    );
    expect(capacityPruneWorkflow).toContain("name: Capacity Prune E2E");
    expect(capacityPruneWorkflow).toContain("bun run smoke:capacity-prune:local");
    expect(capacityPruneWorkflow).toContain("bun run smoke:capacity-prune:ssh");
    expect(capacityPruneWorkflow).toContain("HAS_SSH_CAPACITY_PRUNE_SECRETS");
    expect(capacityPruneWorkflow).toContain(
      "Skipping SSH capacity-prune E2E because APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY is not configured.",
    );
    expect(capacityPruneWorkflow).toContain(
      "Missing APPALOFT_E2E_SSH_HOST or APPALOFT_E2E_SSH_PRIVATE_KEY.",
    );
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
    expect(releaseDocs).toContain("framework-fixture-e2e.yml");
    expect(releaseDocs).toContain("scheduled-task-e2e.yml");
    expect(releaseDocs).toContain("storage-cleanup-e2e.yml");
    expect(releaseDocs).toContain("runtime-usage-e2e.yml");
    expect(releaseDocs).toContain("capacity-prune-e2e.yml");
    expect(releaseDocs).toContain("preview-provider-e2e.yml");
    expect(releaseDocs).toContain("dependency-redis-backup-e2e.yml");
    expect(releaseDocs).toContain("bun run smoke:dependency-redis-backup");
    expect(releaseDocs).toContain("bun run smoke:framework:docker");
    expect(releaseDocs).toContain("bun run smoke:framework:ssh");
    expect(releaseDocs).toContain("bun run smoke:scheduled-task:docker");
    expect(releaseDocs).toContain("bun run smoke:scheduled-task:ssh");
    expect(releaseDocs).toContain("bun run smoke:storage-cleanup:docker");
    expect(releaseDocs).toContain("bun run smoke:storage-cleanup:ssh");
    expect(releaseDocs).toContain("bun run smoke:runtime-usage:docker");
    expect(releaseDocs).toContain("bun run smoke:runtime-usage:ssh");
    expect(releaseDocs).toContain("bun run smoke:capacity-prune:local");
    expect(releaseDocs).toContain("bun run smoke:capacity-prune:ssh");
    expect(releaseDocs).toContain("bun run smoke:preview-provider:github");
    expect(releaseDocs).toContain("require_framework_fixture_e2e=true");
    expect(releaseDocs).toContain("require_scheduled_task_e2e=true");
    expect(releaseDocs).toContain("require_storage_cleanup_e2e=true");
    expect(releaseDocs).toContain("require_runtime_usage_e2e=true");
    expect(releaseDocs).toContain("require_capacity_prune_e2e=true");
    expect(releaseDocs).toContain("require_preview_provider_e2e=true");
    expect(releaseDocs).toContain("APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN");
    expect(releaseDocs).toContain("APPALOFT_GITHUB_PREVIEW_SMOKE_REPOSITORY");
    expect(releaseDocs).toContain("APPALOFT_GITHUB_PREVIEW_SMOKE_PR");
    expect(releaseDocs).toContain(
      "If local SSH smoke cannot run because no target server is available",
    );
    expect(releaseDocs).toContain(
      "use the GitHub Actions reusable workflows as the release-readiness confidence layer",
    );
    expect(releaseNotesScript).not.toContain(
      ["Real SSH release-readiness", "smoke evidence is deferred for this release"].join(" "),
    );
    expect(releaseSkill).toContain("When one of these inputs is set");
    expect(releaseSkill).toContain("missing SSH target secrets or GitHub preview provider smoke");
    expect(releaseSkill).toContain("secrets fail the reusable workflow");
    expect(releaseSkill).toContain("require_scheduled_task_e2e=true");
    expect(releaseSkill).toContain("require_storage_cleanup_e2e=true");
    expect(releaseSkill).toContain("require_runtime_usage_e2e=true");
    expect(releaseSkill).toContain("require_capacity_prune_e2e=true");
    expect(releaseSkill).toContain("require_preview_provider_e2e=true");
    expect(releaseHardeningMatrix).toContain("fail-closed reusable GitHub Actions gates");
    expect(releaseHardeningMatrix).toContain(
      "both scripts fail at the explicit `APPALOFT_E2E_SSH_HOST` requirement",
    );
    expect(releaseHardeningMatrix).toContain("smoke:scheduled-task:docker");
    expect(releaseHardeningMatrix).toContain(
      "local explicit real scheduled-task runtime execution",
    );
    expect(releaseHardeningMatrix).toContain("APPALOFT_E2E_SSH_SCHEDULED_TASK_DOCKER=true");
    expect(releaseHardeningMatrix).toContain("scheduled-task-e2e.yml");
    expect(releaseHardeningMatrix).toContain("require_scheduled_task_e2e=true");
    expect(releaseHardeningMatrix).toContain("smoke:storage-cleanup:docker");
    expect(releaseHardeningMatrix).toContain("APPALOFT_E2E_SSH_STORAGE_CLEANUP_DOCKER=true");
    expect(releaseHardeningMatrix).toContain("storage-cleanup-e2e.yml");
    expect(releaseHardeningMatrix).toContain("require_storage_cleanup_e2e=true");
    expect(releaseHardeningMatrix).toContain("smoke:runtime-usage:docker");
    expect(releaseHardeningMatrix).toContain("APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1");
    expect(releaseHardeningMatrix).toContain("runtime-usage-e2e.yml");
    expect(releaseHardeningMatrix).toContain("require_runtime_usage_e2e=true");
    expect(releaseHardeningMatrix).toContain("smoke:capacity-prune:local");
    expect(releaseHardeningMatrix).toContain("local explicit real runtime workspace prune");
    expect(releaseHardeningMatrix).toContain("APPALOFT_E2E_SSH_CAPACITY_PRUNE=true");
    expect(releaseHardeningMatrix).toContain("capacity-prune-e2e.yml");
    expect(releaseHardeningMatrix).toContain("require_capacity_prune_e2e=true");
    expect(releaseHardeningMatrix).toContain("smoke:preview-provider:github");
    expect(releaseHardeningMatrix).toContain("preview-provider-e2e.yml");
    expect(releaseHardeningMatrix).toContain("APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN");
    expect(releaseHardeningMatrix).toContain("APPALOFT_GITHUB_PREVIEW_SMOKE_REPOSITORY");
    expect(releaseHardeningMatrix).toContain("APPALOFT_GITHUB_PREVIEW_SMOKE_PR");
    expect(releaseHardeningMatrix).toContain("require_preview_provider_e2e=true");
    expect(releaseHardeningMatrix).toContain("smoke:dependency-redis-backup");
    expect(releaseHardeningMatrix).toContain("dependency-redis-backup-e2e.yml");
    expect(releaseHardeningMatrix).toContain("APPALOFT_E2E_REDIS_BACKUP_RESTORE=true");
    expect(releaseHardeningMatrix).toContain("`smoke:ssh:preflight` verifies");
    expect(releaseHardeningMatrix).toContain("ssh-smoke-evidence.json");
    expect(releaseHardeningMatrix).toContain("`smoke:ssh:evidence:verify`");
    expect(releaseHardeningMatrix).toContain("`APPALOFT_E2E_SSH_USERNAME`");
    expect(releaseHardeningMatrix).not.toContain("opt-in real scheduled-task runtime execution");
    expect(releaseHardeningMatrix).not.toContain("opt-in real runtime workspace prune");
  });

  test("[RELEASE-HARDENING-006] SSH smoke scripts fail closed when explicit credentials are missing", () => {
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

  test("[RELEASE-HARDENING-006] allows stable 0.11.0 with explicit SSH confidence gates", () => {
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

  test("[RELEASE-HARDENING-006] allows the 1.0.0-rc release gate as a prerelease target", () => {
    const result = Bun.spawnSync(
      [
        "bun",
        "run",
        "scripts/release/align-roadmap-for-release.ts",
        "--target-version",
        "1.0.0-rc",
        "--current-version",
        "0.12.4",
        "--latest-release-tag",
        "v0.12.4",
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
    expect(output).toContain("docs/PRODUCT_ROADMAP.md release alignment is valid for 1.0.0-rc");
    expect(output).not.toContain("Expected a stable SemVer version");
    expect(output).not.toContain("Roadmap gate rejects release 1.0.0-rc");
  });

  test("[RELEASE-HARDENING-006] allows follow-up release candidates on the 1.0.0-rc gate", () => {
    const result = Bun.spawnSync(
      [
        "bun",
        "run",
        "scripts/release/align-roadmap-for-release.ts",
        "--target-version",
        "1.0.0-rc.1",
        "--current-version",
        "1.0.0-rc",
        "--latest-release-tag",
        "v1.0.0-rc",
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
    expect(output).toContain("docs/PRODUCT_ROADMAP.md release alignment is valid for 1.0.0-rc.1");
    expect(output).not.toContain("No roadmap phase target matches release 1.0.0-rc.1");
    expect(output).not.toContain("Roadmap gate rejects release 1.0.0-rc.1");
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
