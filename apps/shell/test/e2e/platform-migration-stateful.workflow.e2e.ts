import { describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  cleanupLocalDockerDeployment,
  cleanupWorkspace,
  createShellE2eWorkspace,
  dockerName,
  expectCliSuccess,
  fixturePath,
  parseJson,
  parseJsonPayloads,
  runDocker,
  runShellCli,
  waitForDeploymentSucceeded,
} from "./support/shell-e2e-fixture";

type MigrationPlan = { planDigest: string; state: string };
type MigrationReceipt = {
  operationKey: string;
  output: Record<string, string | number | boolean>;
};
type MigrationApplyResult = {
  state: string;
  failure?: { code: string; message: string; stepId: string };
  receipts: MigrationReceipt[];
};

function receiptId(
  receipts: readonly MigrationReceipt[],
  operationKey: string,
  outputKey: string,
): string {
  const value = receipts.find((receipt) => receipt.operationKey === operationKey)?.output[
    outputKey
  ];
  expect(typeof value, `${operationKey} must produce ${outputKey}`).toBe("string");
  return String(value);
}

function payloadString(raw: string, key: string): string {
  const visit = (value: unknown): string | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record[key] === "string") return record[key];
    for (const child of Object.values(record)) {
      const candidate = visit(child);
      if (candidate) return candidate;
    }
    return undefined;
  };
  for (const payload of parseJsonPayloads(raw)) {
    const candidate = visit(payload);
    if (candidate) return candidate;
  }
  throw new Error(`No ${key} found in CLI output`);
}

function dockerIds(kind: "container" | "volume", label: string): string[] {
  const result =
    kind === "container"
      ? runDocker(["ps", "-aq", "--filter", `label=${label}`])
      : runDocker(["volume", "ls", "-q", "--filter", `label=${label}`]);
  expect(result.exitCode, result.stderr).toBe(0);
  return result.stdout
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

function removeDockerResourcesByLabel(label: string): void {
  for (const containerId of dockerIds("container", label)) {
    runDocker(["rm", "-f", containerId]);
  }
  for (const volumeName of dockerIds("volume", label)) {
    runDocker(["volume", "rm", "-f", volumeName]);
  }
}

async function waitForDeploymentFailed(
  deploymentId: string,
  options: Parameters<typeof runShellCli>[1],
): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const shown = runShellCli(["deployments", "show", deploymentId], options);
    expectCliSuccess(shown, `wait for failed deployment ${deploymentId}`);
    const status = parseJson<{
      deployment?: { status?: string };
      status?: { current?: string };
    }>(shown.stdout);
    const current = status.deployment?.status ?? status.status?.current;
    if (current === "failed") return;
    if (current === "succeeded" || current === "canceled") {
      throw new Error(`Expected deployment ${deploymentId} to fail, received ${current}`);
    }
    await Bun.sleep(500);
  }
  throw new Error(`Timed out waiting for deployment ${deploymentId} to fail`);
}

describe("platform migration stateful workflow e2e", () => {
  test("[MIG-STATEFUL-012] migrates stateful resources, proves backup/restore and rollback, then exits exactly", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]).stdout.trim();
    expect(dockerVersion).not.toBe("");

    const suffix = crypto.randomUUID().slice(0, 8);
    const externalRedisName = dockerName(`appaloft-migration-source-redis-${suffix}`);
    const workspace = createShellE2eWorkspace("appaloft-platform-migration-stateful-", {
      appVersion: "0.1.0-platform-migration-stateful-e2e",
    });
    const bundlePath = join(workspace.workspaceDir, "migration-bundle.json");
    const planPath = join(workspace.workspaceDir, "migration-plan.json");
    const taskPath = join(workspace.workspaceDir, "migration-task.json");
    const backupRoot = join(workspace.workspaceDir, "storage-backups");
    const stateKey = `appaloft:migration:${suffix}`;
    const domainName = "manual.example.test";
    const portBlockerName = dockerName(`appaloft-migration-port-blocker-${suffix}`);
    const deploymentIds: string[] = [];
    let portBlockerCreated = false;
    let dependencyResourceId: string | undefined;
    let storageVolumeId: string | undefined;
    let restoredStorageVolumeId: string | undefined;

    try {
      const startedRedis = runDocker([
        "run",
        "-d",
        "--name",
        externalRedisName,
        "-p",
        "127.0.0.1::6379",
        "redis:7-alpine",
      ]);
      expect(startedRedis.exitCode, startedRedis.stderr).toBe(0);
      const redisPort = runDocker(["port", externalRedisName, "6379/tcp"]);
      expect(redisPort.exitCode, redisPort.stderr).toBe(0);
      const mappedPort = redisPort.stdout.trim().match(/:(\d+)$/u)?.[1];
      expect(mappedPort).toBeDefined();
      const redisUrl = `redis://127.0.0.1:${mappedPort}/0`;
      workspace.cliOptions.env = {
        ...workspace.cliOptions.env,
        APPALOFT_CONTROL_PLANE_ACTIVE_SECRET_KEY_ID: "migration-stateful-e2e",
        APPALOFT_CONTROL_PLANE_SECRET_KEYS: JSON.stringify({
          "migration-stateful-e2e": Buffer.alloc(32, 7).toString("base64"),
        }),
        APPALOFT_MIGRATION_REDIS_URL: redisUrl,
      };

      const server = runShellCli(
        [
          "server",
          "register",
          "--name",
          `migration-stateful-${suffix}`,
          "--host",
          "127.0.0.1",
          "--provider",
          "local-shell",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(server, "register stateful migration target");
      const serverId = parseJson<{ id: string }>(server.stdout).id;

      await writeFile(
        bundlePath,
        JSON.stringify({
          apiVersion: "appaloft.io/migration/v1",
          kind: "MigrationBundle",
          metadata: { name: `Stateful ${suffix}`, source: { provider: "railway" } },
          spec: {
            project: { name: `Stateful ${suffix}` },
            environment: { name: "production", kind: "production" },
            target: { deploymentTargetId: serverId },
            resources: [
              {
                ref: "web",
                name: `Stateful web ${suffix}`,
                source: { kind: "local-folder", locator: fixturePath("docker-express-hello") },
                runtime: {
                  strategy: "dockerfile",
                  dockerfilePath: "Dockerfile",
                  healthCheckPath: "/health",
                },
                network: { internalPort: 3000 },
              },
            ],
            dependencies: [
              {
                ref: "redis",
                name: `Redis ${suffix}`,
                kind: "redis",
                sourceMode: "imported-external",
                providerKey: "external-redis",
                connectionSecretRef: "env://APPALOFT_MIGRATION_REDIS_URL",
                bindings: [
                  {
                    resourceRef: "web",
                    targetName: "REDIS_URL",
                    scope: "runtime-only",
                    injectionMode: "env",
                  },
                ],
              },
            ],
            volumes: [
              {
                ref: "data",
                name: `Data ${suffix}`,
                resourceRef: "web",
                mountPath: "/data",
              },
            ],
            domains: [{ hostname: domainName, resourceRef: "web", tlsPolicy: "manual" }],
          },
        }),
        "utf8",
      );

      const planned = runShellCli(["migrate", "plan", "--input", bundlePath], workspace.cliOptions);
      expectCliSuccess(planned, "plan stateful migration");
      const plan = parseJson<MigrationPlan>(planned.stdout);
      expect(plan.state).toBe("ready");
      await writeFile(planPath, JSON.stringify(plan), "utf8");

      const applied = runShellCli(
        ["migrate", "apply", "--plan", planPath, "--confirm", plan.planDigest],
        workspace.cliOptions,
      );
      expectCliSuccess(applied, "apply stateful migration");
      const applyResult = parseJson<MigrationApplyResult>(applied.stdout);
      expect(applyResult.state, JSON.stringify(applyResult.failure)).toBe("completed");
      const projectId = receiptId(applyResult.receipts, "projects.create", "projectId");
      const environmentId = receiptId(applyResult.receipts, "environments.create", "environmentId");
      const resourceId = receiptId(applyResult.receipts, "resources.create", "resourceId");
      dependencyResourceId = receiptId(
        applyResult.receipts,
        "dependency-resources.import",
        "dependencyResourceId",
      );
      storageVolumeId = receiptId(
        applyResult.receipts,
        "storage-volumes.create",
        "storageVolumeId",
      );
      const attachmentId = receiptId(
        applyResult.receipts,
        "resources.attach-storage",
        "attachmentId",
      );
      const domainBindingId = receiptId(
        applyResult.receipts,
        "domain-bindings.create",
        "domainBindingId",
      );
      const deploymentId = receiptId(applyResult.receipts, "deployments.create", "deploymentId");
      deploymentIds.push(deploymentId);
      await writeFile(taskPath, JSON.stringify({ plan, receipts: applyResult.receipts }), "utf8");
      await waitForDeploymentSucceeded(deploymentId, workspace.cliOptions);

      const applicationContainer = dockerName(`appaloft-${deploymentId}`);
      const environment = runDocker([
        "inspect",
        "--format",
        "{{json .Config.Env}}",
        applicationContainer,
      ]);
      expect(environment.exitCode, environment.stderr).toBe(0);
      expect(environment.stdout).toContain("REDIS_URL=redis://127.0.0.1:");
      const mounts = runDocker(["inspect", "--format", "{{json .Mounts}}", applicationContainer]);
      expect(mounts.exitCode, mounts.stderr).toBe(0);
      expect(mounts.stdout).toContain('"Destination":"/data"');

      const seeded = runDocker([
        "exec",
        externalRedisName,
        "redis-cli",
        "SET",
        stateKey,
        "before-backup",
      ]);
      expect(seeded.exitCode, seeded.stderr).toBe(0);
      const directDumpResult = Bun.spawnSync(
        ["docker", "exec", externalRedisName, "redis-cli", "--raw", "DUMP", stateKey],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(
        directDumpResult.exitCode,
        new TextDecoder().decode(directDumpResult.stderr ?? new Uint8Array()),
      ).toBe(0);
      const directDump = directDumpResult.stdout;
      const expectedDump =
        directDump[directDump.length - 1] === 10 ? directDump.slice(0, -1) : directDump;
      const dependencyBackup = runShellCli(
        ["dependency", "backup", "create", dependencyResourceId],
        workspace.cliOptions,
      );
      expectCliSuccess(dependencyBackup, "create imported Redis backup");
      const dependencyBackupId = payloadString(dependencyBackup.stdout, "id");
      const shownDependencyBackup = runShellCli(
        ["dependency", "backup", "show", dependencyBackupId],
        workspace.cliOptions,
      );
      expectCliSuccess(shownDependencyBackup, "show imported Redis backup");
      expect(
        parseJson<{ backup: { status: string } }>(shownDependencyBackup.stdout).backup.status,
      ).toBe("ready");
      const redisBackupArtifact = JSON.parse(
        await readFile(
          join(
            workspace.dataDir,
            "dependency-resource-backups",
            dependencyResourceId,
            `${dependencyBackupId}.redis.json`,
          ),
          "utf8",
        ),
      ) as { keyCount: number; keys: Array<{ dumpBase64: string; key: string }> };
      expect(redisBackupArtifact.keyCount).toBeGreaterThan(0);
      expect(redisBackupArtifact.keys.map((entry) => entry.key)).toContain(stateKey);
      const stateDump = redisBackupArtifact.keys.find((entry) => entry.key === stateKey);
      expect(stateDump).toBeDefined();
      expect(Buffer.from(stateDump?.dumpBase64 ?? "", "base64").toString("hex")).toBe(
        Buffer.from(expectedDump).toString("hex"),
      );
      const probeKey = `${stateKey}:probe`;
      const probedRestore = Bun.spawnSync(
        ["docker", "exec", "-i", externalRedisName, "redis-cli", "-x", "RESTORE", probeKey, "0"],
        {
          stdin: Buffer.from(stateDump?.dumpBase64 ?? "", "base64"),
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(
        new TextDecoder().decode(probedRestore.stdout ?? new Uint8Array()).trim(),
        new TextDecoder().decode(probedRestore.stderr ?? new Uint8Array()),
      ).toBe("OK");
      expect(
        runDocker(["exec", externalRedisName, "redis-cli", "GET", probeKey]).stdout.trim(),
      ).toBe("before-backup");
      runDocker(["exec", externalRedisName, "redis-cli", "DEL", probeKey]);
      expect(
        runDocker(["exec", externalRedisName, "redis-cli", "SET", stateKey, "after-backup"])
          .exitCode,
      ).toBe(0);
      expect(
        runDocker(["exec", externalRedisName, "redis-cli", "GET", stateKey]).stdout.trim(),
      ).toBe("after-backup");
      const restoredDependency = runShellCli(
        [
          "dependency",
          "backup",
          "restore",
          dependencyBackupId,
          "--confirm-data-overwrite",
          "--confirm-runtime-not-restarted",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(restoredDependency, "restore imported Redis backup");
      const shownRestoredDependency = runShellCli(
        ["dependency", "backup", "show", dependencyBackupId],
        workspace.cliOptions,
      );
      expectCliSuccess(shownRestoredDependency, "show imported Redis restore");
      const restoreSummary = parseJson<{
        backup: { latestRestoreAttempt?: { failureMessage?: string; status: string } };
      }>(shownRestoredDependency.stdout).backup.latestRestoreAttempt;
      expect(restoreSummary?.status, restoreSummary?.failureMessage).toBe("completed");
      const restoredValue = runDocker(["exec", externalRedisName, "redis-cli", "GET", stateKey]);
      expect(restoredValue.exitCode, restoredValue.stderr).toBe(0);
      const restoredKeys = runDocker(["exec", externalRedisName, "redis-cli", "--scan"]);
      expect(restoredValue.stdout.trim(), `restored keys: ${restoredKeys.stdout.trim()}`).toBe(
        "before-backup",
      );

      const marker = `stateful-${suffix}`;
      const writeMarker = runDocker([
        "exec",
        applicationContainer,
        "sh",
        "-c",
        `printf %s ${marker} > /data/migration-marker`,
      ]);
      expect(writeMarker.exitCode, writeMarker.stderr).toBe(0);
      const storageBackup = runShellCli(
        [
          "storage",
          "volume",
          "backup",
          "create",
          "--storage-volume",
          storageVolumeId,
          "--resource",
          resourceId,
          "--server",
          serverId,
          "--attachment",
          attachmentId,
          "--destination-path",
          "/data",
          "--data-format",
          "filesystem",
          "--live-writes",
          "false",
          "--consistency",
          "crash-consistent",
          "--source-adapter",
          "tar-volume",
          "--target-provider",
          "local-filesystem",
          "--target-ref",
          backupRoot,
          "--retention-min-free-bytes",
          "1",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(storageBackup, "create storage volume backup");
      const storageBackupId = payloadString(storageBackup.stdout, "id");
      const shownStorageBackup = runShellCli(
        ["storage", "volume", "backup", "show", storageBackupId],
        workspace.cliOptions,
      );
      expectCliSuccess(shownStorageBackup, "show storage volume backup");
      const storageBackupSummary = parseJson<{
        backup: { failureMessage?: string; status: string };
      }>(shownStorageBackup.stdout).backup;
      expect(storageBackupSummary.status, storageBackupSummary.failureMessage).toBe("ready");
      const restoredVolume = runShellCli(
        [
          "storage",
          "volume",
          "backup",
          "restore",
          storageBackupId,
          "--target-mode",
          "new-volume",
          "--restored-volume-name",
          `Restored ${suffix}`,
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(restoredVolume, "restore backup into independent volume");
      restoredStorageVolumeId = payloadString(restoredVolume.stdout, "restoredStorageVolumeId");
      expect(restoredStorageVolumeId).not.toBe(storageVolumeId);
      const restoredDockerVolume = dockerIds(
        "volume",
        `appaloft.storage-volume-id=${restoredStorageVolumeId}`,
      )[0];
      expect(restoredDockerVolume).toBeDefined();
      const readRestoredMarker = runDocker([
        "run",
        "--rm",
        "-v",
        `${restoredDockerVolume}:/restore:ro`,
        "alpine:3.20",
        "cat",
        "/restore/migration-marker",
      ]);
      expect(readRestoredMarker.exitCode, readRestoredMarker.stderr).toBe(0);
      expect(readRestoredMarker.stdout.trim()).toBe(marker);

      const verified = runShellCli(["migrate", "verify", "--task", taskPath], workspace.cliOptions);
      expectCliSuccess(verified, "verify stateful migration evidence");
      expect(parseJson<{ state: string }>(verified.stdout).state).toBe("passed");

      const redeployed = runShellCli(
        [
          "deployments",
          "redeploy",
          resourceId,
          "--project",
          projectId,
          "--environment",
          environmentId,
          "--server",
          serverId,
          "--source-deployment",
          deploymentId,
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(redeployed, "redeploy migrated stateful resource");
      const redeploymentId = payloadString(redeployed.stdout, "id");
      deploymentIds.push(redeploymentId);
      await waitForDeploymentSucceeded(redeploymentId, workspace.cliOptions);

      const confirmed = runShellCli(
        ["domain-binding", "confirm-ownership", domainBindingId, "--verification-mode", "manual"],
        workspace.cliOptions,
      );
      expectCliSuccess(confirmed, "confirm custom domain ownership");
      const imported = runShellCli(
        [
          "certificate",
          "import",
          domainBindingId,
          "--chain-file",
          fixturePath("manual-certificate.crt"),
          "--key-file",
          fixturePath("manual-certificate.key"),
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(imported, "import custom-domain TLS certificate");
      const certificateId = payloadString(imported.stdout, "certificateId");

      const portBlocker = runDocker([
        "run",
        "-d",
        "--name",
        portBlockerName,
        "-p",
        "80:6379",
        "redis:7-alpine",
      ]);
      portBlockerCreated = portBlocker.exitCode === 0;
      const failedRedeploy = runShellCli(
        [
          "deployments",
          "redeploy",
          resourceId,
          "--project",
          projectId,
          "--environment",
          environmentId,
          "--server",
          serverId,
          "--source-deployment",
          redeploymentId,
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(failedRedeploy, "start deployment failure used for rollback proof");
      const failedDeploymentId = payloadString(failedRedeploy.stdout, "id");
      deploymentIds.push(failedDeploymentId);
      await waitForDeploymentFailed(failedDeploymentId, workspace.cliOptions);
      if (portBlockerCreated) {
        runDocker(["rm", "-f", portBlockerName]);
        portBlockerCreated = false;
      }

      const rolledBack = runShellCli(
        [
          "deployments",
          "rollback",
          failedDeploymentId,
          "--candidate",
          redeploymentId,
          "--resource",
          resourceId,
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(rolledBack, "rollback failed stateful deployment");
      const rollbackDeploymentId = payloadString(rolledBack.stdout, "id");
      deploymentIds.push(rollbackDeploymentId);
      await waitForDeploymentSucceeded(rollbackDeploymentId, workspace.cliOptions);

      for (const extraDeploymentId of [rollbackDeploymentId, failedDeploymentId, redeploymentId]) {
        const runtimeCleanup = runShellCli(
          [
            "deployments",
            "cleanup-runtime",
            extraDeploymentId,
            "--confirm",
            extraDeploymentId,
            "--resource",
            resourceId,
          ],
          workspace.cliOptions,
        );
        expectCliSuccess(runtimeCleanup, `clean runtime ${extraDeploymentId}`);
        const archived = runShellCli(
          [
            "deployments",
            "archive",
            extraDeploymentId,
            "--confirm",
            extraDeploymentId,
            "--resource",
            resourceId,
          ],
          workspace.cliOptions,
        );
        expectCliSuccess(archived, `archive deployment ${extraDeploymentId}`);
      }

      const revokedCertificate = runShellCli(
        ["certificate", "revoke", certificateId, "--reason", "migration acceptance cleanup"],
        workspace.cliOptions,
      );
      expectCliSuccess(revokedCertificate, "revoke migration acceptance certificate");
      const deletedCertificate = runShellCli(
        ["certificate", "delete", certificateId, "--confirm", certificateId],
        workspace.cliOptions,
      );
      expectCliSuccess(deletedCertificate, "delete migration acceptance certificate");

      const prunedStorageBackup = runShellCli(
        ["storage", "volume", "backup", "prune", storageBackupId],
        workspace.cliOptions,
      );
      expectCliSuccess(prunedStorageBackup, "prune migration acceptance storage backup");

      const cleanedRestoredRuntime = runShellCli(
        [
          "storage",
          "volume",
          "cleanup-runtime",
          restoredStorageVolumeId,
          "--server",
          serverId,
          "--before",
          new Date(Date.now() + 60_000).toISOString(),
          "--dry-run",
          "false",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(cleanedRestoredRuntime, "clean independent restored volume runtime");
      const restoredCleanup = parseJson<{
        summary: {
          cleanedCount: number;
          blockedCount: number;
          skippedCount: number;
        };
        candidates: unknown[];
      }>(cleanedRestoredRuntime.stdout);
      expect(restoredCleanup.summary, JSON.stringify(restoredCleanup.candidates)).toEqual(
        expect.objectContaining({ cleanedCount: 1, blockedCount: 0, skippedCount: 0 }),
      );
      const deletedRestoredVolume = runShellCli(
        ["storage", "volume", "delete", restoredStorageVolumeId],
        workspace.cliOptions,
      );
      expectCliSuccess(deletedRestoredVolume, "delete independent restored volume record");

      const cleaned = runShellCli(
        ["migrate", "cleanup", "--task", taskPath, "--confirm", plan.planDigest],
        workspace.cliOptions,
      );
      expectCliSuccess(cleaned, "clean stateful migration");
      expect(parseJson<{ state: string; remainingStepIds: string[] }>(cleaned.stdout)).toEqual(
        expect.objectContaining({ state: "completed", remainingStepIds: [] }),
      );
      expect(dockerIds("volume", `appaloft.storage-volume-id=${storageVolumeId}`)).toEqual([]);
      expect(dockerIds("volume", `appaloft.storage-volume-id=${restoredStorageVolumeId}`)).toEqual(
        [],
      );
    } finally {
      for (const deploymentId of deploymentIds) cleanupLocalDockerDeployment(deploymentId);
      if (dependencyResourceId) {
        removeDockerResourcesByLabel(`appaloft.dependency-resource-id=${dependencyResourceId}`);
      }
      if (storageVolumeId) {
        removeDockerResourcesByLabel(`appaloft.storage-volume-id=${storageVolumeId}`);
      }
      if (restoredStorageVolumeId) {
        removeDockerResourcesByLabel(`appaloft.storage-volume-id=${restoredStorageVolumeId}`);
      }
      if (portBlockerCreated) runDocker(["rm", "-f", portBlockerName]);
      runDocker(["rm", "-f", externalRedisName]);
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 600_000);
});
