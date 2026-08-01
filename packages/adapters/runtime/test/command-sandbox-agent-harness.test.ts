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
});
