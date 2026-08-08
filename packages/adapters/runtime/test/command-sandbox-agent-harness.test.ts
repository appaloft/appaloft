import { describe, expect, test } from "bun:test";
import { createExecutionContext, type SandboxExecResult } from "@appaloft/application";
import { err, ok } from "@appaloft/core";

import {
  CommandSandboxAgentHarness,
  type CommandSandboxAgentExecutionPort,
} from "../src/command-sandbox-agent-harness";

describe("CommandSandboxAgentHarness", () => {
  test("[AGENT-ADAPTER-018] executes a declarative custom CLI Agent and reports capabilities", async () => {
    const files = new Map<string, Uint8Array>();
    const commands: string[][] = [];
    const execution: CommandSandboxAgentExecutionPort = {
      exec: async (_context, _sandboxId, input) => {
        commands.push(input.argv);
        const privileged = input.argv[1]?.includes('exec "$@"') ?? false;
        const outputRoot = input.argv[privileged ? 3 : 4];
        const stdoutPath = input.argv[privileged ? 4 : 5];
        const stderrPath = input.argv[privileged ? 5 : 6];
        const exitPath = input.argv[7];
        if (!outputRoot || !stdoutPath || !stderrPath || (!privileged && !exitPath)) {
          return err(new Error("invalid command wrapper"));
        }
        files.set(stdoutPath, new TextEncoder().encode("custom agent completed\n"));
        files.set(stderrPath, new Uint8Array());
        if (exitPath) files.set(exitPath, new TextEncoder().encode("0"));
        return ok({ mode: "background", processId: "spr_custom" } as SandboxExecResult);
      },
      listProcesses: async () =>
        ok([{ processId: "spr_custom", status: "exited", exitCode: 0 }]),
      terminateProcess: async () => ok(undefined),
      readFile: async (_context, _sandboxId, input) => {
        const content = files.get(input.path);
        return content ? ok(content) : err(new Error("not found"));
      },
      writeFile: async (_context, _sandboxId, input) => {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      removeFile: async (_context, _sandboxId, input) => {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new CommandSandboxAgentHarness(execution, {
      key: "custom-cli",
      templateId: "aht_custom_cli_v1",
      sandboxTemplateId: "sbt_custom_cli_v1",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      run: { argv: ["custom-agent", "--json", "{task}"] },
      attach: {
        transport: "managed-terminal",
        command: ["custom-agent"],
        sessionRecovery: "managed-run-lineage",
      },
      persistentPaths: ["/workspace", "/workspace/.custom-agent"],
    });

    const events: string[] = [];
    const privilegedLaunches: string[][] = [];
    const result = await harness.execute({
      executionContext: createExecutionContext({ requestId: "req_custom_agent" }),
      sandboxId: "sbx_custom",
      runtimeId: "sar_custom",
      runId: "srun_custom",
      task: "fix the failing test",
      context: { mode: "fresh" },
      launchProcess: async (input) => {
        privilegedLaunches.push([...input.argv]);
        return execution.exec(
          createExecutionContext({ requestId: "req_custom_agent_launch" }),
          "sbx_custom",
          input,
        );
      },
      emitEvent: async (event) => {
        events.push(String(event.data.text));
      },
      requestApproval: async () => "approved",
    });

    expect(harness.capabilities).toEqual({
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: false,
      persistentPaths: ["/workspace", "/workspace/.custom-agent"],
      healthcheck: { kind: "process" },
    });
    expect(commands[0]).toContain("fix the failing test");
    expect(privilegedLaunches[0]).toContain("fix the failing test");
    expect(commands).toHaveLength(1);
    expect(events).toEqual(["custom agent completed"]);
    expect(result.outcomeDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("[AGENT-ADAPTER-018] waits for a definitive background exit status", async () => {
    const files = new Map<string, Uint8Array>([
      [".appaloft-agent/srun_exit_race/stdout.log", new TextEncoder().encode("done\n")],
      [".appaloft-agent/srun_exit_race/stderr.log", new Uint8Array()],
    ]);
    let processObservations = 0;
    const execution: CommandSandboxAgentExecutionPort = {
      exec: async () => ok({ mode: "background", processId: "spr_exit_race" }),
      listProcesses: async () => {
        processObservations += 1;
        if (processObservations === 1) {
          return ok([{ processId: "spr_exit_race", status: "running" }]);
        }
        if (processObservations === 2) {
          return ok([{ processId: "spr_exit_race", status: "exited" }]);
        }
        return ok([{ processId: "spr_exit_race", status: "exited", exitCode: 0 }]);
      },
      terminateProcess: async () => ok(undefined),
      readFile: async (_context, _sandboxId, input) => {
        const content = files.get(input.path);
        return content ? ok(content) : err(new Error("not found"));
      },
      writeFile: async (_context, _sandboxId, input) =>
        ok({ path: input.path, sizeBytes: input.content.byteLength }),
      removeFile: async () => ok(undefined),
    };
    const harness = new CommandSandboxAgentHarness(execution, {
      key: "custom-cli",
      templateId: "aht_custom_cli_v1",
      sandboxTemplateId: "sbt_custom_cli_v1",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      run: { argv: ["custom-agent", "{task}"] },
    });

    const result = await harness.execute({
      executionContext: createExecutionContext({ requestId: "req_exit_race" }),
      sandboxId: "sbx_exit_race",
      runtimeId: "sar_exit_race",
      runId: "srun_exit_race",
      task: "finish the change",
      context: { mode: "fresh" },
      launchProcess: async () =>
        ok({ mode: "background", processId: "spr_exit_race" } as SandboxExecResult),
      emitEvent: async () => {},
      requestApproval: async () => "approved",
    });

    expect(processObservations).toBe(3);
    expect(result.outcomeDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("[AGENT-ADAPTER-018] bounds an unavailable background exit status", async () => {
    let processObservations = 0;
    const execution: CommandSandboxAgentExecutionPort = {
      exec: async () => ok({ mode: "background", processId: "spr_exit_missing" }),
      listProcesses: async () => {
        processObservations += 1;
        return ok([{ processId: "spr_exit_missing", status: "exited" }]);
      },
      terminateProcess: async () => ok(undefined),
      readFile: async (_context, _sandboxId, input) => {
        if (input.path.endsWith("stdout.log") || input.path.endsWith("stderr.log")) {
          return ok(new Uint8Array());
        }
        return err(new Error("not found"));
      },
      writeFile: async (_context, _sandboxId, input) =>
        ok({ path: input.path, sizeBytes: input.content.byteLength }),
      removeFile: async () => ok(undefined),
    };
    const harness = new CommandSandboxAgentHarness(execution, {
      key: "custom-cli",
      templateId: "aht_custom_cli_v1",
      sandboxTemplateId: "sbt_custom_cli_v1",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      run: { argv: ["custom-agent", "{task}"] },
      timeoutMs: 1,
    });

    expect(
      harness.execute({
        executionContext: createExecutionContext({ requestId: "req_exit_missing" }),
        sandboxId: "sbx_exit_missing",
        runtimeId: "sar_exit_missing",
        runId: "srun_exit_missing",
        task: "finish the change",
        context: { mode: "fresh" },
        launchProcess: async () =>
          ok({ mode: "background", processId: "spr_exit_missing" } as SandboxExecResult),
        emitEvent: async () => {},
        requestApproval: async () => "approved",
      }),
    ).rejects.toThrow("command_agent_run_exit_unavailable");
    expect(processObservations).toBe(2);
  });

  test("[ADAPTER-RUNTIME-013] launches a Runtime start child through its scoped process seam before recording readiness", async () => {
    const files = new Map<string, Uint8Array>();
    const launched: string[][] = [];
    const execution: CommandSandboxAgentExecutionPort = {
      exec: async () => {
        throw new Error("unscoped Runtime start must not execute");
      },
      listProcesses: async () => ok([{ processId: "spr_server", status: "running" }]),
      terminateProcess: async () => ok(undefined),
      readFile: async (_context, _sandboxId, input) => {
        const content = files.get(input.path);
        return content ? ok(content) : err(new Error("not found"));
      },
      writeFile: async (_context, _sandboxId, input) => {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      removeFile: async (_context, _sandboxId, input) => {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new CommandSandboxAgentHarness(execution, {
      key: "custom-server",
      templateId: "aht_custom_server_v1",
      sandboxTemplateId: "sbt_custom_server_v1",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      start: { argv: ["custom-agent", "serve"] },
      run: { argv: ["custom-agent", "run", "{task}"] },
      healthcheck: { kind: "process" },
    });

    await harness.prepareRuntime?.({
      executionContext: createExecutionContext({ requestId: "req_runtime_start" }),
      sandboxId: "sbx_server",
      runtimeId: "sar_server",
      launchProcess: async (input) => {
        launched.push([...input.argv]);
        return ok({ mode: "background", processId: "spr_server" });
      },
    });

    expect(launched).toEqual([["custom-agent", "serve"]]);
    expect(new TextDecoder().decode(files.get(".appaloft-agent/sar_server/command-agent-process-id"))).toBe(
      "spr_server",
    );
  });

  test("[ADAPTER-RUNTIME-013] never reuses a Task-scoped launcher for the long-running Runtime child", async () => {
    const files = new Map<string, Uint8Array>([
      [".appaloft-agent/srun_task/stdout.log", new TextEncoder().encode("done\n")],
      [".appaloft-agent/srun_task/stderr.log", new Uint8Array()],
    ]);
    const launches: string[][] = [];
    const execution: CommandSandboxAgentExecutionPort = {
      exec: async () => {
        throw new Error("Task execution must use its scoped launcher");
      },
      listProcesses: async () =>
        ok([{ processId: "spr_task", status: "exited", exitCode: 0 }]),
      terminateProcess: async () => ok(undefined),
      readFile: async (_context, _sandboxId, input) => {
        const content = files.get(input.path);
        return content ? ok(content) : err(new Error("not found"));
      },
      writeFile: async (_context, _sandboxId, input) =>
        ok({ path: input.path, sizeBytes: input.content.byteLength }),
      removeFile: async () => ok(undefined),
    };
    const harness = new CommandSandboxAgentHarness(execution, {
      key: "custom-server",
      templateId: "aht_custom_server_v1",
      sandboxTemplateId: "sbt_custom_server_v1",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      start: { argv: ["custom-agent", "serve"] },
      run: { argv: ["custom-agent", "run", "{task}"] },
      healthcheck: { kind: "process" },
    });

    await harness.execute({
      executionContext: createExecutionContext({ requestId: "req_task_scope" }),
      sandboxId: "sbx_server",
      runtimeId: "sar_server",
      runId: "srun_task",
      task: "review the change",
      context: { mode: "fresh" },
      launchProcess: async (input) => {
        launches.push([...input.argv]);
        return ok({ mode: "background", processId: "spr_task" });
      },
      emitEvent: async () => {},
      requestApproval: async () => "approved",
    });

    expect(launches).toHaveLength(1);
    expect(launches[0]).toContain("review the change");
    expect(launches[0]).not.toContain("serve");
  });

  test("[ADAPTER-RUNTIME-013] probes bounded HTTP readiness and cleans the exact unhealthy start child", async () => {
    const healthProbes: string[][] = [];
    const terminated: string[] = [];
    let markerWrites = 0;
    const execution: CommandSandboxAgentExecutionPort = {
      exec: async (_context, _sandboxId, input) => {
        healthProbes.push([...input.argv]);
        return ok({
          mode: "foreground",
          frames: [{ kind: "exit", sequence: 1, exitCode: 1 }],
        });
      },
      listProcesses: async () => ok([{ processId: "spr_unhealthy", status: "running" }]),
      terminateProcess: async (_context, _sandboxId, processId) => {
        terminated.push(processId);
        return ok(undefined);
      },
      readFile: async () => err(new Error("not found")),
      writeFile: async (_context, _sandboxId, input) => {
        markerWrites += 1;
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      removeFile: async () => ok(undefined),
    };
    const harness = new CommandSandboxAgentHarness(execution, {
      key: "custom-server",
      templateId: "aht_custom_server_v1",
      sandboxTemplateId: "sbt_custom_server_v1",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      start: { argv: ["custom-agent", "serve", "--port", "4096"] },
      run: { argv: ["custom-agent", "run", "{task}"] },
      healthcheck: { kind: "http", port: 4_096, path: "/health" },
      startupPollAttempts: 2,
      startupPollIntervalMs: 1,
    });

    expect(
      harness.prepareRuntime?.({
        executionContext: createExecutionContext({ requestId: "req_runtime_health" }),
        sandboxId: "sbx_server",
        runtimeId: "sar_server",
        launchProcess: async () =>
          ok({ mode: "background", processId: "spr_unhealthy" }),
      }),
    ).rejects.toThrow("command_agent_runtime_start_failed");

    expect(healthProbes).toHaveLength(2);
    expect(healthProbes[0]).toEqual(
      expect.arrayContaining(["curl", "http://127.0.0.1:4096/health"]),
    );
    expect(terminated).toEqual(["spr_unhealthy"]);
    expect(markerWrites).toBe(0);
  });

  test("[ADAPTER-RUNTIME-013] terminates an accepted start child when its ready marker cannot be persisted", async () => {
    const terminated: string[] = [];
    const execution: CommandSandboxAgentExecutionPort = {
      exec: async () => ok({ mode: "foreground", frames: [] }),
      listProcesses: async () => ok([{ processId: "spr_unmarked", status: "running" }]),
      terminateProcess: async (_context, _sandboxId, processId) => {
        terminated.push(processId);
        return ok(undefined);
      },
      readFile: async () => err(new Error("not found")),
      writeFile: async () => err(new Error("marker storage unavailable")),
      removeFile: async () => ok(undefined),
    };
    const harness = new CommandSandboxAgentHarness(execution, {
      key: "custom-server",
      templateId: "aht_custom_server_v1",
      sandboxTemplateId: "sbt_custom_server_v1",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      start: { argv: ["custom-agent", "serve"] },
      run: { argv: ["custom-agent", "run", "{task}"] },
      healthcheck: { kind: "process" },
    });

    expect(
      harness.prepareRuntime?.({
        executionContext: createExecutionContext({ requestId: "req_runtime_marker" }),
        sandboxId: "sbx_server",
        runtimeId: "sar_server",
        launchProcess: async () => ok({ mode: "background", processId: "spr_unmarked" }),
      }),
    ).rejects.toThrow("marker storage unavailable");
    expect(terminated).toEqual(["spr_unmarked"]);
  });

  test("[ADAPTER-RUNTIME-013] replaces an unhealthy marked server before relaunching its Runtime start child", async () => {
    const files = new Map<string, Uint8Array>([
      [
        ".appaloft-agent/sar_server/command-agent-process-id",
        new TextEncoder().encode("spr_stale"),
      ],
    ]);
    const terminated: string[] = [];
    const launches: Array<{ argv: readonly string[]; replaceTerminated?: boolean }> = [];
    let healthProbe = 0;
    const execution: CommandSandboxAgentExecutionPort = {
      exec: async () => {
        healthProbe += 1;
        return ok({
          mode: "foreground",
          frames: [{ kind: "exit", sequence: 1, exitCode: healthProbe === 1 ? 1 : 0 }],
        });
      },
      listProcesses: async () =>
        ok([
          { processId: "spr_stale", status: "running" },
          { processId: "spr_new", status: "running" },
        ]),
      terminateProcess: async (_context, _sandboxId, processId) => {
        terminated.push(processId);
        return ok(undefined);
      },
      readFile: async (_context, _sandboxId, input) => {
        const content = files.get(input.path);
        return content ? ok(content) : err(new Error("not found"));
      },
      writeFile: async (_context, _sandboxId, input) => {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      removeFile: async (_context, _sandboxId, input) => {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new CommandSandboxAgentHarness(execution, {
      key: "custom-server",
      templateId: "aht_custom_server_v1",
      sandboxTemplateId: "sbt_custom_server_v1",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      start: { argv: ["custom-agent", "serve", "--port", "4096"] },
      run: { argv: ["custom-agent", "run", "{task}"] },
      healthcheck: { kind: "http", port: 4_096, path: "/health" },
      startupPollAttempts: 2,
      startupPollIntervalMs: 1,
    });

    await harness.prepareRuntime?.({
      executionContext: createExecutionContext({ requestId: "req_runtime_replace" }),
      sandboxId: "sbx_server",
      runtimeId: "sar_server",
      launchProcess: async (input) => {
        launches.push(input);
        return ok({ mode: "background", processId: "spr_new" });
      },
    });

    expect(terminated).toEqual(["spr_stale"]);
    expect(launches).toEqual([
      expect.objectContaining({
        argv: ["custom-agent", "serve", "--port", "4096"],
        replaceTerminated: true,
      }),
    ]);
    expect(new TextDecoder().decode(files.get(".appaloft-agent/sar_server/command-agent-process-id"))).toBe(
      "spr_new",
    );
  });
});
