import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ash } from "@appaloft/ash";
import {
  buildSshRemoteStateDiagnosticsCommand,
  buildSshRemoteStateLockInspectCommand,
  buildSshRemoteStateLockRecoverStaleCommand,
  renderSshRemoteStateDiagnosticsScript,
  renderSshRemoteStateLockInspectScript,
  renderSshRemoteStateLockRecoverStaleScript,
} from "../src/commands/remote-state";

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
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
