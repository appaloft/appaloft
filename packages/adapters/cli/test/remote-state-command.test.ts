import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ash } from "@appaloft/ash";
import {
  buildSshRemoteStateDiagnosticsCommand,
  buildSshRemoteStateImmutableBackupCreateCommand,
  buildSshRemoteStateLockInspectCommand,
  buildSshRemoteStateLockRecoverStaleCommand,
  buildSshRemoteStatePromoteCopyCommand,
  buildSshRemoteStateRestoreCopyCommand,
  buildSshRemoteStateRollbackCommand,
  renderSshRemoteStateDiagnosticsScript,
  renderSshRemoteStateImmutableBackupCreateScript,
  renderSshRemoteStateLockInspectScript,
  renderSshRemoteStateLockRecoverStaleScript,
  renderSshRemoteStatePromoteCopyScript,
  renderSshRemoteStateRestoreCopyScript,
  renderSshRemoteStateRollbackScript,
} from "../src/commands/remote-state";

function createRemoteStateFixture(root: string): string {
  const dataRoot = join(root, "runtime", "state");
  mkdirSync(join(dataRoot, "pglite"), { recursive: true });
  mkdirSync(join(dataRoot, "source-links"), { recursive: true });
  mkdirSync(join(dataRoot, "server-applied-routes"), { recursive: true });
  mkdirSync(join(dataRoot, "locks"), { recursive: true });
  writeFileSync(join(dataRoot, "pglite", "PG_VERSION"), "18\n");
  writeFileSync(join(dataRoot, "pglite", "state.bin"), "original-state\n");
  writeFileSync(join(dataRoot, "source-links", "source.json"), "{}\n");
  writeFileSync(join(dataRoot, "server-applied-routes", "routes.json"), "{}\n");
  writeFileSync(join(dataRoot, "sync-revision.txt"), "4\n");
  writeFileSync(join(dataRoot, "schema-version.json"), '{"version":1}\n');
  writeFileSync(
    join(dataRoot, "server-state-backend.json"),
    '{"schemaVersion":"1","stateBackend":"ssh-pglite"}\n',
  );
  return dataRoot;
}

function removeRemoteStateFixture(root: string): void {
  Bun.spawnSync(["chmod", "-R", "u+w", root]);
  rmSync(root, { force: true, recursive: true });
}

describe("CLI SSH remote-state lock commands", () => {
  test("[CONFIG-FILE-STATE-018] inspect reads lock metadata without acquiring the mutation lock", () => {
    const command = buildSshRemoteStateLockInspectCommand({
      dataRoot: "/var/lib/appaloft/runtime/state",
      staleAfterSeconds: 1_200,
    });

    expect(command).toContain('lock_dir="$data_root/locks/mutation.lock"');
    expect(command).toContain("lastHeartbeatAt");
    expect(command).toContain("lockAgeSeconds");
    expect(command).toContain("owner_file_present");
    expect(command).toContain('recorded_stale_after" -gt "$stale_after_seconds"');
    expect(command).toContain("recorded_stale_after=30");
    expect(command).toContain('date -j -u -f "%Y-%m-%dT%H:%M:%SZ"');
    expect(command).toContain('stat -f %m "$lock_dir"');
    expect(command).not.toContain('mkdir "$lock_dir"');
    expect(command).not.toContain("OPENSSH PRIVATE KEY");
  });

  test("[CONFIG-FILE-STATE-018] rendered inspect script is stable", () => {
    const script = ash.render(
      renderSshRemoteStateLockInspectScript({
        dataRoot: "/var/lib/appaloft/runtime/state",
        staleAfterSeconds: 1_200,
      }),
    );

    expect(script).toMatchSnapshot();
  });

  test("[CONFIG-FILE-STATE-019] recover-stale archives only stale mutation locks", () => {
    const command = buildSshRemoteStateLockRecoverStaleCommand({
      dataRoot: "/var/lib/appaloft/runtime/state",
      staleAfterSeconds: 1_200,
      recoveredBy: "appaloft-cli-test",
    });

    expect(command).toContain('if [ "$stale" != true ]; then');
    expect(command).toContain('mkdir -p "$data_root/locks/recovered"');
    expect(command).toContain('mv "$lock_dir" "$recovered_path"');
    expect(command).toContain("recovered.json");
    expect(command).toContain("owner_file_present");
    expect(command).toContain('recorded_stale_after" -gt "$stale_after_seconds"');
    expect(command).toContain("recorded_stale_after=30");
    expect(command).toContain("appaloft-cli-test");
    expect(command).not.toContain("OPENSSH PRIVATE KEY");
  });

  test("[CONFIG-FILE-STATE-019] rendered recover-stale script is stable", () => {
    const script = ash.render(
      renderSshRemoteStateLockRecoverStaleScript({
        dataRoot: "/var/lib/appaloft/runtime/state",
        staleAfterSeconds: 1_200,
        recoveredBy: "appaloft-cli-test",
      }),
    );

    expect(script).toMatchSnapshot();
  });

  test("[CONFIG-FILE-STATE-020] remote-state maintenance uses stale-only lock maintenance", () => {
    const maintenanceWorkflow = readFileSync(
      resolve(import.meta.dir, "../../../../.github/workflows/remote-state-maintenance.yml"),
      "utf8",
    );
    const githubExpressionOpen = "$" + "{{";

    expect(maintenanceWorkflow).toContain("workflow_dispatch:");
    expect(maintenanceWorkflow).toContain("group: appaloft-www-remote-state");
    expect(maintenanceWorkflow).toContain("ref: main");
    expect(maintenanceWorkflow).toContain("default: /var/lib/appaloft/runtime");
    expect(maintenanceWorkflow).toContain(
      `APPALOFT_SSH_HOST: ${githubExpressionOpen} vars.APPALOFT_SSH_HOST }}`,
    );
    expect(maintenanceWorkflow).toContain(
      `APPALOFT_SSH_PRIVATE_KEY: ${githubExpressionOpen} secrets.APPALOFT_SSH_PRIVATE_KEY }}`,
    );
    expect(maintenanceWorkflow).toContain('remote-state lock "$MAINTENANCE_ACTION"');
    expect(maintenanceWorkflow).not.toContain("force");
  });

  test("[OP-WORK-QRY-011] diagnostics command reads lock, migration, backup, and recovery markers without mutation", () => {
    const command = buildSshRemoteStateDiagnosticsCommand({
      dataRoot: "/var/lib/appaloft/runtime/state",
      staleAfterSeconds: 1_200,
      limit: 20,
    });

    expect(command).toContain('lock_dir="$data_root/locks/mutation.lock"');
    expect(command).toContain('"$data_root"/journals/*.json');
    expect(command).toContain('"$data_root"/backups/*');
    expect(command).toContain('"$data_root"/recovery/*.json');
    expect(command).toContain('"$data_root"/locks/recovered/*/recovered.json');
    expect(command).toContain("remote-state-migration");
    expect(command).toContain("remote-state-backup");
    expect(command).toContain("remote-state-recovery");
    expect(command).not.toContain('mkdir "$lock_dir"');
    expect(command).not.toContain('mv "$lock_dir"');
    expect(command).not.toContain("OPENSSH PRIVATE KEY");
  });

  test("[OP-WORK-QRY-011] rendered diagnostics script is stable", () => {
    const script = ash.render(
      renderSshRemoteStateDiagnosticsScript({
        dataRoot: "/var/lib/appaloft/runtime/state",
        staleAfterSeconds: 1_200,
        limit: 20,
      }),
    );

    expect(script).toMatchSnapshot();
  });

  test("[CONFIG-FILE-STATE-018] inspect script executes missing and unlocked safe paths", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-state-ash-"));
    try {
      const missingRoot = join(tempRoot, "missing");
      const missing = ash.execute(
        renderSshRemoteStateLockInspectScript({
          dataRoot: missingRoot,
          staleAfterSeconds: 1_200,
        }),
      );
      expect(missing.success).toBe(true);
      expect(JSON.parse(missing.stdout)).toMatchObject({
        status: "missing",
        phase: "remote-state-lock",
        stateBackend: "ssh-pglite",
        dataRoot: missingRoot,
      });

      const unlockedRoot = join(tempRoot, "unlocked");
      Bun.spawnSync(["mkdir", "-p", unlockedRoot]);
      const unlocked = ash.execute(
        renderSshRemoteStateLockInspectScript({
          dataRoot: unlockedRoot,
          staleAfterSeconds: 1_200,
        }),
      );
      expect(unlocked.success).toBe(true);
      expect(JSON.parse(unlocked.stdout)).toMatchObject({
        status: "unlocked",
        phase: "remote-state-lock",
        stateBackend: "ssh-pglite",
        dataRoot: unlockedRoot,
        stale: false,
      });
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });

  test("[CONFIG-FILE-STATE-021] immutable backup records bounded evidence and preserves live state", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-backup-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const before = readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8");
      const result = ash.execute(renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }));

      expect(result.success).toBe(true);
      const output = JSON.parse(result.stdout) as {
        backupReference: string;
        archiveDigest: string;
        sourceTreeDigest: string;
        sourceRevision: number;
        postgresMajor: string;
      };
      expect(output).toMatchObject({
        sourceRevision: 4,
        postgresMajor: "18",
      });
      expect(output.backupReference).toMatch(/^remote-state-backup:immutable-/);
      expect(output.archiveDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(output.sourceTreeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe(before);
      expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);

      const command = buildSshRemoteStateImmutableBackupCreateCommand({ dataRoot });
      expect(command).toContain("state.tar.gz");
      expect(command).toContain("sourceTreeDigest");
      expect(command).not.toContain("OPENSSH PRIVATE KEY");
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });

  test("[CONFIG-FILE-STATE-022][CONFIG-FILE-STATE-023][CONFIG-FILE-STATE-024] isolated copy promotes and rolls back through the immutable reference", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-recovery-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const backup = ash.execute(renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }));
      expect(backup.success).toBe(true);
      const backupReference = (JSON.parse(backup.stdout) as { backupReference: string })
        .backupReference;
      const candidateRuntimeRoot = join(tempRoot, "recovery", "candidate");

      const restored = ash.execute(
        renderSshRemoteStateRestoreCopyScript({
          dataRoot,
          backupReference,
          targetRemoteRuntimeRoot: candidateRuntimeRoot,
        }),
      );
      expect(restored.success).toBe(true);
      expect(readFileSync(join(candidateRuntimeRoot, "state", "pglite", "state.bin"), "utf8")).toBe(
        "original-state\n",
      );
      writeFileSync(join(candidateRuntimeRoot, "state", "pglite", "state.bin"), "repaired-state\n");

      const planDigest = `sha256:${"a".repeat(64)}`;
      const promoted = ash.execute(
        renderSshRemoteStatePromoteCopyScript({
          dataRoot,
          backupReference,
          candidateRemoteRuntimeRoot: candidateRuntimeRoot,
          candidatePlanDigest: planDigest,
        }),
      );
      expect(promoted.success).toBe(true);
      expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe("repaired-state\n");
      expect(readFileSync(join(dataRoot, "sync-revision.txt"), "utf8")).toBe("5\n");

      const rolledBack = ash.execute(
        renderSshRemoteStateRollbackScript({ dataRoot, backupReference }),
      );
      expect(rolledBack.success).toBe(true);
      expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe("original-state\n");
      expect(readFileSync(join(dataRoot, "sync-revision.txt"), "utf8")).toBe("6\n");

      expect(
        buildSshRemoteStateRestoreCopyCommand({
          dataRoot,
          backupReference,
          targetRemoteRuntimeRoot: candidateRuntimeRoot,
        }),
      ).toContain("candidate source digest mismatch");
      expect(
        buildSshRemoteStatePromoteCopyCommand({
          dataRoot,
          backupReference,
          candidateRemoteRuntimeRoot: candidateRuntimeRoot,
          candidatePlanDigest: planDigest,
        }),
      ).toContain("live state changed after immutable backup");
      expect(buildSshRemoteStateRollbackCommand({ dataRoot, backupReference })).toContain(
        "restored state digest mismatch",
      );
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });

  test("[CONFIG-FILE-STATE-023] promotion fails closed when live state drifted after backup", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-freeze-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const backup = ash.execute(renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }));
      const backupReference = (JSON.parse(backup.stdout) as { backupReference: string })
        .backupReference;
      const candidateRuntimeRoot = join(tempRoot, "recovery", "candidate");
      expect(
        ash.execute(
          renderSshRemoteStateRestoreCopyScript({
            dataRoot,
            backupReference,
            targetRemoteRuntimeRoot: candidateRuntimeRoot,
          }),
        ).success,
      ).toBe(true);
      writeFileSync(join(dataRoot, "pglite", "state.bin"), "unexpected-live-write\n");

      const promoted = ash.execute(
        renderSshRemoteStatePromoteCopyScript({
          dataRoot,
          backupReference,
          candidateRemoteRuntimeRoot: candidateRuntimeRoot,
          candidatePlanDigest: `sha256:${"b".repeat(64)}`,
        }),
      );
      expect(promoted.success).toBe(false);
      expect(promoted.stderr).toContain("live state changed after immutable backup");
      expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe(
        "unexpected-live-write\n",
      );
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });
});
