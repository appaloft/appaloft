import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
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

function executeAshScript(
  script: Parameters<typeof ash.execute>[0],
  transform: (command: string) => string = (command) => command,
) {
  const command = transform(ash.render(script)).replaceAll(
    "sleep 15 &",
    "sleep 15 </dev/null >/dev/null 2>&1 &",
  );
  const syncShim = "sync() { return 0; }";
  const executableCommand =
    process.platform === "darwin"
      ? `flock() { return 0; }\n${syncShim}\n${command}`
      : `${syncShim}\n${command}`;
  const result = Bun.spawnSync(["sh", "-lc", executableCommand], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    success: result.success,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
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
    expect(command).toContain('guard_dir="$data_root/locks/mutation.guard"');
    expect(command).toContain("acquire_guard");
    expect(command).toContain('mv "$lock_dir" "$recovered_path"');
    expect(command).toContain("recovered.json");
    expect(command.indexOf('> "$recovery_record_temp"')).toBeLessThan(
      command.indexOf('mv "$lock_dir" "$recovered_path"'),
    );
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

  test("[CONFIG-FILE-STATE-003][CONFIG-FILE-STATE-019] recover-stale archives a crashed guard before recovering the mutation lock", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-state-guard-recovery-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const locksRoot = join(dataRoot, "locks");
      const guardRoot = join(locksRoot, "mutation.guard");
      const lockRoot = join(locksRoot, "mutation.lock");
      mkdirSync(guardRoot);
      writeFileSync(
        join(guardRoot, "owner.json"),
        '{"token":"crashed","operation":"prepare","pid":1,"startedAt":"2020-01-01T00:00:00Z","staleAfterSeconds":30}\n',
      );
      utimesSync(guardRoot, new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));
      mkdirSync(lockRoot);
      writeFileSync(
        join(lockRoot, "owner.json"),
        '{"owner":"crashed","correlationId":"crashed-1","startedAt":"2020-01-01T00:00:00Z","lastHeartbeatAt":"2020-01-01T00:00:00Z","staleAfterSeconds":1}\n',
      );

      const result = executeAshScript(
        renderSshRemoteStateLockRecoverStaleScript({
          dataRoot,
          staleAfterSeconds: 1,
          recoveredBy: "test-recovery",
        }),
      );

      expect(result.success).toBe(true);
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "recovered", recovered: true });
      expect(existsSync(guardRoot)).toBe(false);
      expect(existsSync(lockRoot)).toBe(false);
      const recoveredEntries = readdirSync(join(locksRoot, "recovered"));
      const recoveredGuard = recoveredEntries.find((name) => name.startsWith("guard-"));
      const recoveredLock = recoveredEntries.find((name) => name.startsWith("manual-"));
      expect(recoveredGuard).toBeDefined();
      expect(recoveredLock).toBeDefined();
      expect(existsSync(join(locksRoot, "recovered", recoveredGuard!, "recovered.json"))).toBe(
        true,
      );
      expect(existsSync(join(locksRoot, "recovered", recoveredLock!, "recovered.json"))).toBe(true);
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
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
      const missing = executeAshScript(
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
      const unlocked = executeAshScript(
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
      const result = executeAshScript(
        renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
      );

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
      expect(command).toContain("acquire_guard");
      expect(command).toContain("lockToken");
      expect(command).toContain(".owner-maintenance-heartbeat-");
      expect(command).toContain(".mutation-maintenance-release-");
      expect(command).not.toContain('rm -rf "$lock_dir"');
      expect(command).not.toContain("OPENSSH PRIVATE KEY");
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });

  test("[CONFIG-FILE-STATE-022][CONFIG-FILE-STATE-023][CONFIG-FILE-STATE-024] isolated copy promotes and rolls back through the immutable reference", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-recovery-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const backup = executeAshScript(
        renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
      );
      expect(backup.success).toBe(true);
      const backupReference = (JSON.parse(backup.stdout) as { backupReference: string })
        .backupReference;
      const candidateRuntimeRoot = join(tempRoot, "recovery", "candidate");

      const restored = executeAshScript(
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
      const promoted = executeAshScript(
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

      const rolledBack = executeAshScript(
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
      const promoteCommand = buildSshRemoteStatePromoteCopyCommand({
        dataRoot,
        backupReference,
        candidateRemoteRuntimeRoot: candidateRuntimeRoot,
        candidatePlanDigest: planDigest,
      });
      expect(promoteCommand).toContain("live state changed after immutable backup");
      const rollbackParentSyncIndex = promoteCommand.indexOf('sync_path "$data_root/backups"');
      const plannedMarkerIndex = promoteCommand.indexOf("write_swap_recovery_status planned 0");
      const revisionCommitIndex = promoteCommand.indexOf(
        'mv "$revision_temp" "$revision_file" || return 75',
      );
      const liveDurabilityIndex = promoteCommand.lastIndexOf(
        "sync_all || return 75",
        revisionCommitIndex,
      );
      const postCommitSyncIndex = promoteCommand.indexOf(
        'sync_path "$data_root" || return 75',
        revisionCommitIndex,
      );
      expect(rollbackParentSyncIndex).toBeGreaterThan(-1);
      expect(rollbackParentSyncIndex).toBeLessThan(plannedMarkerIndex);
      expect(liveDurabilityIndex).toBeLessThan(revisionCommitIndex);
      expect(revisionCommitIndex).toBeLessThan(postCommitSyncIndex);
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
      const backup = executeAshScript(
        renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
      );
      const backupReference = (JSON.parse(backup.stdout) as { backupReference: string })
        .backupReference;
      const candidateRuntimeRoot = join(tempRoot, "recovery", "candidate");
      expect(
        executeAshScript(
          renderSshRemoteStateRestoreCopyScript({
            dataRoot,
            backupReference,
            targetRemoteRuntimeRoot: candidateRuntimeRoot,
          }),
        ).success,
      ).toBe(true);
      writeFileSync(join(dataRoot, "pglite", "state.bin"), "unexpected-live-write\n");

      const promoted = executeAshScript(
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

  test("[CONFIG-FILE-STATE-021] immutable backup consumers reject symlinked roots and files", () => {
    for (const symlinkTarget of ["root", "archive", "manifest"] as const) {
      const tempRoot = mkdtempSync(
        join(tmpdir(), `appaloft-remote-backup-symlink-${symlinkTarget}-`),
      );
      try {
        const dataRoot = createRemoteStateFixture(tempRoot);
        const backup = executeAshScript(
          renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
        );
        expect(backup.success).toBe(true);
        const backupReference = (JSON.parse(backup.stdout) as { backupReference: string })
          .backupReference;
        const backupId = backupReference.replace("remote-state-backup:", "");
        const backupRoot = join(dataRoot, "backups", backupId);
        Bun.spawnSync(["chmod", "-R", "u+w", backupRoot]);
        const externalRoot = join(tempRoot, `external-${symlinkTarget}`);
        mkdirSync(externalRoot);

        if (symlinkTarget === "root") {
          rmSync(backupRoot, { force: true, recursive: true });
          symlinkSync(externalRoot, backupRoot);
        } else {
          const protectedPath = join(
            backupRoot,
            symlinkTarget === "archive" ? "state.tar.gz" : "manifest.json",
          );
          const externalPath = join(externalRoot, symlinkTarget);
          writeFileSync(externalPath, "external-must-remain\n");
          rmSync(protectedPath);
          symlinkSync(externalPath, protectedPath);
        }

        const result = executeAshScript(
          renderSshRemoteStateRollbackScript({ dataRoot, backupReference }),
        );

        expect(result.success).toBe(false);
        if (symlinkTarget !== "root") {
          expect(readFileSync(join(externalRoot, symlinkTarget), "utf8")).toBe(
            "external-must-remain\n",
          );
        }
        expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe(
          "original-state\n",
        );
      } finally {
        removeRemoteStateFixture(tempRoot);
      }
    }
  }, 15_000);

  test("[CONFIG-FILE-STATE-012G][CONFIG-FILE-STATE-021] backup creation rejects symlinked authoritative files", () => {
    for (const relativePath of [
      "pglite/PG_VERSION",
      "sync-revision.txt",
      "schema-version.json",
      "server-state-backend.json",
    ]) {
      const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-backup-source-symlink-"));
      try {
        const dataRoot = createRemoteStateFixture(tempRoot);
        const externalPath = join(tempRoot, "external-authoritative-file");
        writeFileSync(externalPath, "external-must-remain\n");
        const authoritativePath = join(dataRoot, relativePath);
        rmSync(authoritativePath);
        symlinkSync(externalPath, authoritativePath);

        const result = executeAshScript(
          renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
        );

        expect(result.success).toBe(false);
        expect(readFileSync(externalPath, "utf8")).toBe("external-must-remain\n");
        expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
      } finally {
        removeRemoteStateFixture(tempRoot);
      }
    }
  });

  test("[CONFIG-FILE-STATE-012G][CONFIG-FILE-STATE-022] restore-copy rejects symlinked backup markers", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-backup-marker-symlink-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const backup = executeAshScript(
        renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
      );
      expect(backup.success).toBe(true);
      const backupReference = (JSON.parse(backup.stdout) as { backupReference: string })
        .backupReference;
      const backupRoot = join(
        dataRoot,
        "backups",
        backupReference.replace("remote-state-backup:", ""),
      );
      Bun.spawnSync(["chmod", "-R", "u+w", backupRoot]);
      const externalPath = join(tempRoot, "external-marker");
      writeFileSync(externalPath, "external-must-remain\n");
      rmSync(join(backupRoot, "schema-version.json"));
      symlinkSync(externalPath, join(backupRoot, "schema-version.json"));

      const restored = executeAshScript(
        renderSshRemoteStateRestoreCopyScript({
          dataRoot,
          backupReference,
          targetRemoteRuntimeRoot: join(tempRoot, "recovery", "candidate-symlink-marker"),
        }),
      );

      expect(restored.success).toBe(false);
      expect(readFileSync(externalPath, "utf8")).toBe("external-must-remain\n");
      expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });

  test("[CONFIG-FILE-STATE-022][CONFIG-FILE-STATE-023] candidate paths reject symlinked ancestors", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-candidate-symlink-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const backup = executeAshScript(
        renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
      );
      expect(backup.success).toBe(true);
      const backupReference = (JSON.parse(backup.stdout) as { backupReference: string })
        .backupReference;
      const recoveryRoot = join(tempRoot, "recovery");
      const externalRoot = join(tempRoot, "external-candidate-root");
      mkdirSync(recoveryRoot);
      mkdirSync(join(externalRoot, "state", "pglite"), { recursive: true });
      mkdirSync(join(externalRoot, "state", "source-links"), { recursive: true });
      mkdirSync(join(externalRoot, "state", "server-applied-routes"), { recursive: true });
      writeFileSync(join(externalRoot, "state", "pglite", "PG_VERSION"), "18\n");
      writeFileSync(join(externalRoot, "state", "pglite", "state.bin"), "external-state\n");
      writeFileSync(join(externalRoot, "sentinel"), "external-must-remain\n");
      symlinkSync(externalRoot, join(recoveryRoot, "linked"));
      const linkedCandidate = join(recoveryRoot, "linked");

      const restored = executeAshScript(
        renderSshRemoteStateRestoreCopyScript({
          dataRoot,
          backupReference,
          targetRemoteRuntimeRoot: join(linkedCandidate, "nested"),
        }),
      );
      expect(restored.success).toBe(false);
      expect(existsSync(join(externalRoot, "nested"))).toBe(false);

      const promoted = executeAshScript(
        renderSshRemoteStatePromoteCopyScript({
          dataRoot,
          backupReference,
          candidateRemoteRuntimeRoot: linkedCandidate,
          candidatePlanDigest: `sha256:${"e".repeat(64)}`,
        }),
      );
      expect(promoted.success).toBe(false);
      expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe("original-state\n");
      expect(readFileSync(join(externalRoot, "sentinel"), "utf8")).toBe("external-must-remain\n");
      expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });

  test("[CONFIG-FILE-STATE-023][CONFIG-FILE-STATE-024] interrupted state swaps restore live state and preserve revision", () => {
    const interruptionPoints = [
      {
        needle: 'mv "$data_root/pglite" "$rollback_dir/pglite"',
        replacement: 'mv "$data_root/pglite" "$rollback_dir/pglite"\nkill -TERM $$',
      },
      {
        needle: 'mv "$incoming/pglite" "$data_root/pglite"',
        replacement: 'mv "$incoming/pglite" "$data_root/pglite"\nkill -TERM $$',
      },
      {
        needle: 'mv "$revision_temp" "$revision_file" || return 75',
        replacement: 'kill -TERM $$\nmv "$revision_temp" "$revision_file" || return 75',
      },
    ];

    for (const interruptionPoint of interruptionPoints) {
      const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-swap-interrupt-"));
      try {
        const dataRoot = createRemoteStateFixture(tempRoot);
        const backup = executeAshScript(
          renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
        );
        expect(backup.success).toBe(true);
        const backupReference = (JSON.parse(backup.stdout) as { backupReference: string })
          .backupReference;
        const candidateRuntimeRoot = join(tempRoot, "recovery", "candidate");
        expect(
          executeAshScript(
            renderSshRemoteStateRestoreCopyScript({
              dataRoot,
              backupReference,
              targetRemoteRuntimeRoot: candidateRuntimeRoot,
            }),
          ).success,
        ).toBe(true);
        writeFileSync(join(candidateRuntimeRoot, "state", "pglite", "state.bin"), "candidate\n");

        const interrupted = executeAshScript(
          renderSshRemoteStatePromoteCopyScript({
            dataRoot,
            backupReference,
            candidateRemoteRuntimeRoot: candidateRuntimeRoot,
            candidatePlanDigest: `sha256:${"c".repeat(64)}`,
          }),
          (command) => {
            expect(command).toContain(interruptionPoint.needle);
            return command.replace(interruptionPoint.needle, interruptionPoint.replacement);
          },
        );

        expect(interrupted.success).toBe(false);
        expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe(
          "original-state\n",
        );
        expect(readFileSync(join(dataRoot, "sync-revision.txt"), "utf8")).toBe("4\n");
        expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
        expect(existsSync(join(dataRoot, "locks", "mutation.guard"))).toBe(false);
        expect(
          JSON.parse(
            readFileSync(join(dataRoot, "recovery", "remote-state-promotion.json"), "utf8"),
          ),
        ).toMatchObject({ status: "interrupted", expectedRevision: 4, nextRevision: 5 });
      } finally {
        removeRemoteStateFixture(tempRoot);
      }
    }
  }, 15_000);

  test("[CONFIG-FILE-STATE-023] durability fence failures occur before canonical state movement", () => {
    const failurePoints = [
      'sync_path "$data_root/backups" || exit 75',
      'sync_path "$recovery_status_temp" || return 75',
    ];

    for (const failurePoint of failurePoints) {
      const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-remote-swap-fence-failure-"));
      try {
        const dataRoot = createRemoteStateFixture(tempRoot);
        const backup = executeAshScript(
          renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
        );
        expect(backup.success).toBe(true);
        const backupReference = (JSON.parse(backup.stdout) as { backupReference: string })
          .backupReference;
        const candidateRuntimeRoot = join(tempRoot, "recovery", "candidate");
        expect(
          executeAshScript(
            renderSshRemoteStateRestoreCopyScript({
              dataRoot,
              backupReference,
              targetRemoteRuntimeRoot: candidateRuntimeRoot,
            }),
          ).success,
        ).toBe(true);
        writeFileSync(join(candidateRuntimeRoot, "state", "pglite", "state.bin"), "candidate\n");

        const failed = executeAshScript(
          renderSshRemoteStatePromoteCopyScript({
            dataRoot,
            backupReference,
            candidateRemoteRuntimeRoot: candidateRuntimeRoot,
            candidatePlanDigest: `sha256:${"d".repeat(64)}`,
          }),
          (command) => {
            expect(command).toContain(failurePoint);
            return command.replace(failurePoint, "false || exit 75");
          },
        );

        expect(failed.success).toBe(false);
        expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe(
          "original-state\n",
        );
        expect(readFileSync(join(dataRoot, "sync-revision.txt"), "utf8")).toBe("4\n");
        expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
      } finally {
        removeRemoteStateFixture(tempRoot);
      }
    }
  });

  test("[CONFIG-FILE-STATE-023] maintenance owner publication failure removes the ownerless lock", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-maintenance-owner-failure-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const failed = executeAshScript(
        renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
        (command) => {
          const ownerWrite = '> "$maintenance_owner_temp"';
          expect(command).toContain(ownerWrite);
          return command.replace(ownerWrite, '> "$data_root"');
        },
      );

      expect(failed.success).toBe(false);
      expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
      expect(existsSync(join(dataRoot, "locks", "mutation.guard"))).toBe(false);
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });

  test("[CONFIG-FILE-STATE-023] a later maintenance session resolves a planned crash marker from the revision", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-maintenance-crash-recovery-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const transactionId = "promotion-20260823T000000Z-123";
      const rollbackName = `replaced-${transactionId}`;
      const incomingName = `.incoming-recovery-${transactionId}`;
      const revisionTempName = `.sync-revision-${transactionId}.tmp`;
      const rollbackRoot = join(dataRoot, "backups", rollbackName);
      mkdirSync(rollbackRoot, { recursive: true });
      mkdirSync(join(dataRoot, "recovery"), { recursive: true });
      Bun.spawnSync(["mv", join(dataRoot, "pglite"), join(rollbackRoot, "pglite")]);
      mkdirSync(join(dataRoot, incomingName));
      writeFileSync(join(dataRoot, revisionTempName), "5\n");
      writeFileSync(
        join(dataRoot, "recovery", "remote-state-promotion.json"),
        JSON.stringify({
          schemaVersion: "appaloft.remote-state-swap-recovery/v1",
          status: "planned",
          operation: "promotion",
          transactionId,
          rollbackDirName: rollbackName,
          incomingName,
          revisionTempName,
          expectedRevision: 4,
          nextRevision: 5,
          backupReference: "remote-state-backup:immutable-test",
        }) + "\n",
      );

      const recovered = executeAshScript(
        renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
      );

      expect(recovered.success).toBe(true);
      expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe("original-state\n");
      expect(readFileSync(join(dataRoot, "sync-revision.txt"), "utf8")).toBe("4\n");
      expect(
        JSON.parse(readFileSync(join(dataRoot, "recovery", "remote-state-promotion.json"), "utf8")),
      ).toMatchObject({ status: "recovered-rolled-back", actualRevision: 4 });
      expect(existsSync(join(dataRoot, incomingName))).toBe(false);
      expect(existsSync(join(dataRoot, revisionTempName))).toBe(false);
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });

  test("[CONFIG-FILE-STATE-023] maintenance heartbeat integrity failure interrupts the mutation", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "appaloft-maintenance-heartbeat-failure-"));
    try {
      const dataRoot = createRemoteStateFixture(tempRoot);
      const failed = executeAshScript(
        renderSshRemoteStateImmutableBackupCreateScript({ dataRoot }),
        (command) =>
          command
            .replace("sleep 15 &", "sleep 0.05 &")
            .replace('tar -czf "$archive"', 'sleep 0.2\ntar -czf "$archive"')
            .replace('> "$heartbeat_tmp"', '> "$data_root"'),
      );

      expect(failed.success).toBe(false);
      expect(existsSync(join(dataRoot, "locks", "mutation.lock"))).toBe(false);
      expect(existsSync(join(dataRoot, "locks", "mutation.guard"))).toBe(false);
      expect(readFileSync(join(dataRoot, "pglite", "state.bin"), "utf8")).toBe("original-state\n");
    } finally {
      removeRemoteStateFixture(tempRoot);
    }
  });
});
