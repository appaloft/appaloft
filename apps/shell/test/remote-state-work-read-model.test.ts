import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  type RemoteStateDiagnosticsRunner,
  SshRemoteStateWorkReadModel,
} from "../src/remote-state-work-read-model";

function context() {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_remote_state_work_test",
      tracer: {
        startActiveSpan(_name, _options, callback) {
          return Promise.resolve(
            callback({
              addEvent() {},
              recordError() {},
              setAttribute() {},
              setAttributes() {},
              setStatus() {},
            }),
          );
        },
      },
    }),
  );
}

describe("SSH remote-state work read model", () => {
  test("[OP-WORK-QRY-011] reads safe remote-state diagnostics rows from SSH output", async () => {
    const runner: RemoteStateDiagnosticsRunner = {
      run(input) {
        expect(input.command).toContain("/var/lib/appaloft/runtime/state");
        expect(input.command).toContain("journals");
        expect(input.command).toContain("backups");
        expect(input.command).toContain("recovery");

        return {
          exitCode: 0,
          failed: false,
          stderr: "",
          stdout: [
            JSON.stringify({
              id: "mutation-lock",
              status: "failed",
              phase: "remote-state-lock",
              step: "stale",
              updatedAt: "2026-01-01T00:00:10.000Z",
              stateBackend: "ssh-pglite",
              owner: "workflow-1",
              correlationId: "corr-1",
              stale: true,
              errorCode: "remote_state_lock_stale",
              errorCategory: "infra",
              retriable: true,
              nextAction: "manual-review",
              identityFile: "/Users/me/.ssh/id_ed25519",
            }),
            JSON.stringify({
              id: "migration:schema-1-to-2",
              status: "succeeded",
              phase: "remote-state-migration",
              step: "journal",
              updatedAt: "2026-01-01T00:00:09.000Z",
              stateBackend: "ssh-pglite",
              toVersion: 2,
            }),
            JSON.stringify({
              id: "backup:sync-1",
              status: "succeeded",
              phase: "remote-state-backup",
              step: "backup",
              updatedAt: "2026-01-01T00:00:08.000Z",
              stateBackend: "ssh-pglite",
            }),
            JSON.stringify({
              id: "recovery:marker",
              status: "failed",
              phase: "remote-state-recovery",
              step: "marker",
              updatedAt: "2026-01-01T00:00:07.000Z",
              stateBackend: "ssh-pglite",
              errorCode: "remote_state_recovery_marker_present",
              errorCategory: "infra",
              retriable: true,
            }),
          ].join("\n"),
        };
      },
    };
    const readModel = new SshRemoteStateWorkReadModel({
      dataRoot: "/var/lib/appaloft/runtime/state",
      serverId: "srv_primary",
      target: {
        host: "203.0.113.10",
        identityFile: "/Users/me/.ssh/id_ed25519",
      },
      runner,
    });

    const rows = await readModel.list(context(), {
      serverId: "srv_primary",
      limit: 10,
    });

    expect(rows.map((row) => row.phase)).toEqual([
      "remote-state-lock",
      "remote-state-migration",
      "remote-state-backup",
      "remote-state-recovery",
    ]);
    expect(rows[0]).toMatchObject({
      id: "mutation-lock",
      status: "failed",
      operationKey: "operator-work.list",
      phase: "remote-state-lock",
      serverId: "srv_primary",
      errorCode: "remote_state_lock_stale",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: {
        stateBackend: "ssh-pglite",
        owner: "workflow-1",
        correlationId: "corr-1",
        stale: true,
      },
    });
    expect(JSON.stringify(rows)).not.toContain("id_ed25519");
    expect(await readModel.list(context(), { serverId: "srv_other" })).toEqual([]);
  });

  test("[OP-WORK-QRY-011] returns a safe failed diagnostics row when SSH read fails", async () => {
    const readModel = new SshRemoteStateWorkReadModel({
      dataRoot: "/var/lib/appaloft/runtime/state",
      target: {
        host: "203.0.113.10",
        identityFile: "/Users/me/.ssh/id_ed25519",
      },
      runner: {
        run() {
          return {
            exitCode: 255,
            failed: true,
            stdout: "",
            stderr: "ssh: /Users/me/.ssh/id_ed25519 failed",
          };
        },
      },
    });

    const rows = await readModel.list(context());

    expect(rows).toEqual([
      expect.objectContaining({
        id: "diagnostics-read",
        status: "failed",
        phase: "remote-state-recovery",
        errorCode: "remote_state_diagnostics_unavailable",
        retriable: true,
        nextActions: ["diagnostic", "manual-review"],
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain("id_ed25519");
  });
});
