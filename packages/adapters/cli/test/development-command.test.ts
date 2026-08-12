import { describe, expect, test } from "bun:test";
import { err, ok } from "@appaloft/core";

import {
  type DevelopmentCommandRuntime,
  runStandaloneDevelopmentCli,
} from "../src/standalone-development";

function runtimeFixture() {
  const calls: Array<{ operation: string; input: unknown }> = [];
  const plan = {
    sourceRoot: "/workspace",
    configFilePath: null,
    deploymentGraph: {},
    services: [
      {
        key: "app",
        commandIntent: "bun run dev",
        watch: "native" as const,
        workingDirectory: "/workspace",
      },
    ],
  };
  const runtime: DevelopmentCommandRuntime = {
    plan: async (input) => {
      calls.push({ operation: "plan", input });
      return ok(plan);
    },
    start: async (input) => {
      calls.push({ operation: "start", input });
      return ok({ state: "running", sessionId: "dev-1", sourceRoot: input.plan.sourceRoot });
    },
    status: async (input) => {
      calls.push({ operation: "status", input });
      return ok({ state: "running", sessionId: "dev-1", sourceRoot: input.sourceRoot });
    },
    logs: async (input) => {
      calls.push({ operation: "logs", input });
      return ok({ lines: ["ready"] });
    },
    stop: async (input) => {
      calls.push({ operation: "stop", input });
      return ok({ state: "stopped", sourceRoot: input.sourceRoot });
    },
    reset: async (input) => {
      calls.push({ operation: "reset", input });
      return ok({ state: "reset", sourceRoot: input.sourceRoot });
    },
  };
  return { calls, runtime };
}

describe("standalone appaloft dev command", () => {
  test("[DEV-CLI-004] starts through the local fast path with explicit env precedence", async () => {
    const { calls, runtime } = runtimeFixture();
    const stdout: string[] = [];

    const result = await runStandaloneDevelopmentCli({
      argv: [
        "bun",
        "appaloft",
        "dev",
        "start",
        "/workspace",
        "--detach",
        "--env-file",
        ".env.dev",
        "--env",
        "PORT=4310",
        "--json",
      ],
      env: {},
      runtime,
      writeStdout: (value) => stdout.push(value),
      writeStderr: () => undefined,
    });

    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(calls.map((call) => call.operation)).toEqual(["plan", "start"]);
    expect(calls[1]?.input).toMatchObject({
      detach: true,
      envFiles: [".env.dev"],
      environmentOverlay: { PORT: "4310" },
    });
    expect(JSON.parse(stdout.join(""))).toMatchObject({ state: "running", sessionId: "dev-1" });
  });

  test("[DEV-CLI-005] dispatches plan/status/logs/stop/reset without database composition", async () => {
    for (const operation of ["plan", "status", "logs", "stop", "reset"] as const) {
      const { calls, runtime } = runtimeFixture();
      const result = await runStandaloneDevelopmentCli({
        argv: [
          "bun",
          "appaloft",
          "dev",
          operation,
          "/workspace",
          "--json",
          ...(operation === "reset" ? ["--yes"] : []),
        ],
        env: {},
        runtime,
        writeStdout: () => undefined,
        writeStderr: () => undefined,
      });

      expect(result.exitCode).toBe(0);
      expect(calls[0]?.operation).toBe(operation);
    }
  });

  test("[DEV-TUI-010] interactive start keeps the session under the native presentation", async () => {
    const { calls, runtime } = runtimeFixture();
    const presentations: unknown[] = [];
    const result = await runStandaloneDevelopmentCli({
      argv: ["bun", "appaloft", "dev", "/workspace"],
      env: {},
      runtime,
      interactive: true,
      presentation: {
        run: async (input) => {
          presentations.push(input);
          return ok({ state: "detached", sourceRoot: input.startInput.plan.sourceRoot });
        },
      },
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(calls[1]?.input).toMatchObject({ detach: true });
    expect(presentations).toHaveLength(1);
  });

  test("[DEV-PACKAGE-016][DEV-PARITY-015] a missing renderer falls back to the same headless foreground lifecycle", async () => {
    const { calls, runtime } = runtimeFixture();
    const warnings: string[] = [];
    const result = await runStandaloneDevelopmentCli({
      argv: ["bun", "appaloft", "dev", "/workspace"],
      env: {},
      runtime,
      interactive: true,
      presentation: {
        prepare: () =>
          err({
            code: "development_gateway_failed",
            category: "infra",
            message: "renderer missing",
            retryable: true,
            details: { phase: "development-presentation", reason: "binary-missing" },
          }),
        run: async () => {
          throw new Error("missing renderer must not run");
        },
      },
      writeStdout: () => undefined,
      writeStderr: (value) => warnings.push(value),
    });

    expect(result.exitCode).toBe(0);
    expect(calls[1]?.input).toMatchObject({ detach: false });
    expect(warnings.join(" ")).toContain("headless");
  });

  test("[SWR-DEV-008] treats --server as transport selection without changing the source identity", async () => {
    const { calls, runtime } = runtimeFixture();
    const result = await runStandaloneDevelopmentCli({
      argv: ["bun", "appaloft", "dev", "status", "/workspace", "--server", "server-1", "--json"],
      env: {},
      runtime,
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    });
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([{ operation: "status", input: { sourceRoot: "/workspace" } }]);
  });

  test("[DEV-DATA-013][DEV-ERROR-014] reset fails with a stable safe error before deletion without explicit confirmation", async () => {
    const { calls, runtime } = runtimeFixture();
    const stderr: string[] = [];
    const result = await runStandaloneDevelopmentCli({
      argv: ["bun", "appaloft", "dev", "reset", "/workspace", "--json"],
      env: {},
      runtime,
      writeStdout: () => undefined,
      writeStderr: (value) => stderr.push(value),
    });

    expect(result.exitCode).toBe(1);
    expect(calls).toHaveLength(0);
    expect(JSON.parse(stderr.join(""))).toMatchObject({
      error: {
        code: "development_plan_invalid",
        category: "user",
        retryable: false,
        details: { phase: "development-cleanup" },
      },
    });
  });

  test("returns unhandled for non-development commands", async () => {
    const { runtime } = runtimeFixture();
    expect(
      await runStandaloneDevelopmentCli({
        argv: ["bun", "appaloft", "project", "list"],
        env: {},
        runtime,
      }),
    ).toEqual({ handled: false, exitCode: 0 });
  });
});
