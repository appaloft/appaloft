import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSshRemoteStateLockInspectCommand,
  buildSshRemoteStateLockRecoverStaleCommand,
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
    expect(command).toContain("recorded_stale_after=30");
    expect(command).toContain('date -j -u -f "%Y-%m-%dT%H:%M:%SZ"');
    expect(command).toContain('stat -f %m "$lock_dir"');
    expect(command).not.toContain('mkdir "$lock_dir"');
    expect(command).not.toContain("OPENSSH PRIVATE KEY");
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
    expect(command).toContain("recorded_stale_after=30");
    expect(command).toContain("appaloft-cli-test");
    expect(command).not.toContain("OPENSSH PRIVATE KEY");
  });

  test("[CONFIG-FILE-STATE-020] docs maintenance workflow uses shared stale-only lock maintenance", () => {
    const maintenanceWorkflow = readFileSync(
      resolve(import.meta.dir, "../../../../.github/workflows/remote-state-maintenance.yml"),
      "utf8",
    );
    const deployDocsWorkflow = readFileSync(
      resolve(import.meta.dir, "../../../../.github/workflows/deploy-docs.yml"),
      "utf8",
    );
    const deployDocsPreviewWorkflow = readFileSync(
      resolve(import.meta.dir, "../../../../.github/workflows/deploy-docs-preview.yml"),
      "utf8",
    );
    const preflightAction = readFileSync(
      resolve(
        import.meta.dir,
        "../../../../.github/actions/remote-state-lock-preflight/action.yml",
      ),
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
    expect(deployDocsWorkflow).toContain("uses: ./.github/actions/remote-state-lock-preflight");
    expect(deployDocsPreviewWorkflow.match(/Remote State Lock Preflight/g)?.length).toBe(2);
    expect(preflightAction).toContain("remote-state lock recover-stale");
    expect(preflightAction).toContain("remote-state-lock-preflight=");
    expect(preflightAction).toContain("owner");
    expect(preflightAction).toContain("correlationId");
    expect(preflightAction).toContain("lastHeartbeatAt");
    expect(preflightAction).toContain("lockAgeSeconds");
    expect(preflightAction).toContain("staleAfterSeconds");
    expect(preflightAction).toContain("recoveredPath");
    expect(`${maintenanceWorkflow}\n${preflightAction}`).not.toContain("force");
  });
});
