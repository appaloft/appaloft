import { describe, expect, test } from "bun:test";

import { ok } from "@appaloft/core";
import { type ServerWorkerSafeStatus } from "@appaloft/server-worker-relay";

import { runStandaloneServerWorkerCli, type ServerWorkerCommandRuntime } from "../src";

const safeStatus: ServerWorkerSafeStatus = {
  schemaVersion: "server-worker-status/v1",
  workerId: "worker-1",
  serverId: "server-1",
  name: "my-mac",
  generation: 1,
  connected: false,
  version: "0.0.0",
  capabilities: ["runtime.dev"],
  serialNumber: "01",
  expiresAt: "2026-08-13T00:00:00.000Z",
  platform: "darwin-arm64",
};

function runtime(overrides: Partial<ServerWorkerCommandRuntime> = {}): ServerWorkerCommandRuntime {
  return {
    enroll: async () => ok(safeStatus),
    run: async () => ok(safeStatus),
    status: async () => ok({ state: "not-enrolled" as const }),
    revoke: async () => ok({ revoked: true, workerId: "worker-1" }),
    upgrade: async () => ok({ upgraded: true, rolledBack: false }),
    ...overrides,
  };
}

describe("standalone Server Worker CLI", () => {
  test("[SWR-ENROLL-001] authenticated enrollment can issue its own one-time token", async () => {
    let observedToken: string | undefined = "unexpected";
    const result = await runStandaloneServerWorkerCli({
      argv: [
        "bun",
        "appaloft",
        "server",
        "worker",
        "enroll",
        "--server",
        "server-1",
        "--name",
        "mac",
      ],
      env: {},
      runtime: runtime({
        enroll: async (input) => {
          observedToken = input.token;
          return ok(safeStatus);
        },
      }),
      writeStdout: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(observedToken).toBeUndefined();
  });

  test("[SWR-ENROLL-001] accepts enrollment secrets only from stdin", async () => {
    const denied: string[] = [];
    const argvSecret = await runStandaloneServerWorkerCli({
      argv: [
        "bun",
        "appaloft",
        "server",
        "worker",
        "enroll",
        "--server",
        "server-1",
        "--name",
        "mac",
        "--token",
        "secret",
      ],
      env: {},
      runtime: runtime(),
      stdinText: "",
      writeStderr: (value) => denied.push(value),
    });
    expect(argvSecret.exitCode).toBe(1);
    expect(denied.join("")).not.toContain("secret");

    let observedToken = "";
    const accepted = await runStandaloneServerWorkerCli({
      argv: [
        "bun",
        "appaloft",
        "server",
        "worker",
        "enroll",
        "--server",
        "server-1",
        "--name",
        "mac",
        "--token-stdin",
      ],
      env: {},
      runtime: runtime({
        enroll: async (input) => {
          observedToken = input.token;
          return ok(safeStatus);
        },
      }),
      stdinText: "one-time-secret\n",
      writeStdout: () => undefined,
    });
    expect(accepted.exitCode).toBe(0);
    expect(observedToken).toBe("one-time-secret");
  });

  test("[SWR-STATUS-016] emits only the public safe status contract", async () => {
    const output: string[] = [];
    const result = await runStandaloneServerWorkerCli({
      argv: ["bun", "appaloft", "server", "worker", "status", "--json"],
      env: {},
      runtime: runtime({ status: async () => ok(safeStatus) }),
      writeStdout: (value) => output.push(value),
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(output.join(""))).toEqual(safeStatus);
    expect(output.join("")).not.toContain("PRIVATE KEY");
    expect(output.join("")).not.toContain("host");
  });
});
