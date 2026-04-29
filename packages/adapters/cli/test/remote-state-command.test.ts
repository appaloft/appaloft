import { describe, expect, test } from "bun:test";
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
    expect(command).toContain("appaloft-cli-test");
    expect(command).not.toContain("OPENSSH PRIVATE KEY");
  });
});
