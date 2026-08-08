import {
  type ExecutionContext,
  type SandboxAgentHarness,
  type SandboxAgentHarnessCapabilities,
  type SandboxAgentHarnessEvent,
  type SandboxAgentHarnessInteraction,
  type SandboxExecResult,
  type SandboxFileDescriptor,
  type SandboxProcessDescriptor,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { sandboxWorkspaceProcessArgv } from "./sandbox-workspace-process-environment";

const backgroundExitStatusGraceMs = 5_000;

export interface CommandSandboxAgentExecutionPort {
  exec(
    context: ExecutionContext,
    sandboxId: string,
    input: {
      argv: string[];
      cwd?: string;
      background?: boolean;
      timeoutMs?: number;
    },
  ): Promise<Result<SandboxExecResult>>;
  listProcesses(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<Result<SandboxProcessDescriptor[]>>;
  terminateProcess(
    context: ExecutionContext,
    sandboxId: string,
    processId: string,
  ): Promise<Result<void>>;
  readFile(
    context: ExecutionContext,
    sandboxId: string,
    input: { path: string },
  ): Promise<Result<Uint8Array>>;
  writeFile(
    context: ExecutionContext,
    sandboxId: string,
    input: { path: string; content: Uint8Array },
  ): Promise<Result<SandboxFileDescriptor>>;
  removeFile(
    context: ExecutionContext,
    sandboxId: string,
    input: { path: string; recursive?: boolean },
  ): Promise<Result<void>>;
}

export interface CommandSandboxAgentDescriptor {
  key: string;
  templateId: string;
  sandboxTemplateId: string;
  version: string;
  templateDigest: string;
  cwd?: string;
  start?: { argv: readonly string[] };
  run: {
    argv: readonly string[];
    taskPlaceholder?: string;
    continueArgs?: readonly string[];
  };
  attach?: {
    transport: "managed-terminal" | "native-attach";
    command: readonly string[];
    sessionRecovery: "managed-run-lineage" | "native-session-store";
    clientHandoff?: "local-client-exec" | "display-only";
    serverPort?: number;
  };
  persistentPaths?: readonly string[];
  healthcheck?: SandboxAgentHarnessCapabilities["healthcheck"];
  timeoutMs?: number;
  startupPollAttempts?: number;
  startupPollIntervalMs?: number;
}

function normalizedRelativePath(value: string | undefined): string | undefined {
  const path = value?.trim().replaceAll("\\", "/").replace(/^\.\/+/u, "");
  if (!path || path === ".") return undefined;
  if (
    path.startsWith("/") ||
    path.includes("\0") ||
    path.split("/").some((segment) => segment === "..")
  ) {
    throw new Error("Command Agent cwd must remain below the Sandbox workspace");
  }
  return path;
}

function safeArgv(value: readonly string[], label: string): string[] {
  if (!value.length || value.length > 256) throw new Error(`${label} argv is invalid`);
  return value.map((argument) => {
    if (argument.includes("\0") || argument.length > 16_384) {
      throw new Error(`${label} argv is invalid`);
    }
    return argument;
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export class CommandSandboxAgentHarness implements SandboxAgentHarness {
  readonly key: string;
  readonly templateId: string;
  readonly sandboxTemplateId: string;
  readonly version: string;
  readonly templateDigest: string;
  readonly interaction?: SandboxAgentHarnessInteraction;
  readonly capabilities;
  private readonly cwd: string | undefined;
  private readonly active = new Map<
    string,
    { context: ExecutionContext; sandboxId: string; processId: string; cancelled: boolean }
  >();

  constructor(
    private readonly execution: CommandSandboxAgentExecutionPort,
    private readonly descriptor: CommandSandboxAgentDescriptor,
  ) {
    this.key = descriptor.key.trim();
    this.templateId = descriptor.templateId.trim();
    this.sandboxTemplateId = descriptor.sandboxTemplateId.trim();
    this.version = descriptor.version.trim();
    this.templateDigest = descriptor.templateDigest.trim();
    this.cwd = normalizedRelativePath(descriptor.cwd);
    if (
      !this.key ||
      !this.templateId ||
      !this.version ||
      !/^sha256:[a-f0-9]{64}$/u.test(this.templateDigest)
    ) {
      throw new Error("Command Agent descriptor identity and digest must be pinned");
    }
    safeArgv(descriptor.run.argv, "Command Agent run");
    if (descriptor.start) safeArgv(descriptor.start.argv, "Command Agent start");
    if (descriptor.attach) {
      this.interaction = Object.freeze({
          ...descriptor.attach,
          command: Object.freeze([...descriptor.attach.command]),
        });
    }
    this.capabilities = Object.freeze({
      taskMode: true,
      interactive: descriptor.attach !== undefined,
      backgroundRuns: true,
      nativeSession: descriptor.attach?.sessionRecovery === "native-session-store",
      persistentPaths: Object.freeze([...(descriptor.persistentPaths ?? ["/workspace"])]),
      healthcheck: descriptor.healthcheck ?? Object.freeze({ kind: "process" as const }),
    });
  }

  admitSandbox(source: Parameters<NonNullable<SandboxAgentHarness["admitSandbox"]>>[0]): boolean {
    return source.kind === "template" && source.templateId === this.descriptor.sandboxTemplateId;
  }

  async prepareRuntime(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
    launchProcess?: NonNullable<
      Parameters<NonNullable<SandboxAgentHarness["prepareRuntime"]>>[0]["launchProcess"]
    >;
  }): Promise<void> {
    if (!this.descriptor.start) return;
    const markerPath = this.processMarkerPath(input.runtimeId);
    let replaceTerminated = false;
    const marker = await this.execution.readFile(input.executionContext, input.sandboxId, {
      path: markerPath,
    });
    if (marker.isOk()) {
      const processId = new TextDecoder().decode(marker.value).trim();
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/u.test(processId)) {
        throw new Error("command_agent_runtime_marker_invalid");
      }
      if (await this.runtimeIsReady(input.executionContext, input.sandboxId, processId)) {
        return;
      }
      const processes = await this.execution.listProcesses(
        input.executionContext,
        input.sandboxId,
      );
      if (processes.isErr()) throw new Error(processes.error.message);
      if (
        processes.value.some(
          (candidate) => candidate.processId === processId && candidate.status === "running",
        )
      ) {
        const terminated = await this.execution.terminateProcess(
          input.executionContext,
          input.sandboxId,
          processId,
        );
        if (terminated.isErr()) throw new Error(terminated.error.message);
      }
      const removed = await this.execution.removeFile(input.executionContext, input.sandboxId, {
        path: markerPath,
      });
      if (removed.isErr()) throw new Error(removed.error.message);
      replaceTerminated = true;
    }
    const process = {
      argv: safeArgv(this.descriptor.start.argv, "Command Agent start"),
      ...(this.cwd ? { cwd: this.cwd } : {}),
      background: true as const,
      ...(replaceTerminated ? { replaceTerminated: true } : {}),
    };
    const started = input.launchProcess
      ? await input.launchProcess(process)
      : await this.execution.exec(input.executionContext, input.sandboxId, process);
    if (started.isErr() || started.value.mode !== "background") {
      throw new Error(
        started.isErr() ? started.error.message : "command_agent_start_background_required",
      );
    }
    const processId = started.value.processId;
    const attempts = this.descriptor.startupPollAttempts ?? 50;
    let ready = false;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      ready = await this.runtimeIsReady(
        input.executionContext,
        input.sandboxId,
        processId,
      );
      if (ready) break;
      await new Promise((resolve) =>
        setTimeout(resolve, this.descriptor.startupPollIntervalMs ?? 200),
      );
    }
    if (!ready) {
      const terminated = await this.execution.terminateProcess(
        input.executionContext,
        input.sandboxId,
        processId,
      );
      if (terminated.isErr()) throw new Error(terminated.error.message);
      throw new Error("command_agent_runtime_start_failed");
    }
    const written = await this.execution.writeFile(input.executionContext, input.sandboxId, {
      path: markerPath,
      content: new TextEncoder().encode(processId),
    });
    if (written.isErr()) {
      const terminated = await this.execution.terminateProcess(
        input.executionContext,
        input.sandboxId,
        processId,
      );
      if (terminated.isErr()) throw new Error(terminated.error.message);
      throw new Error(written.error.message);
    }
  }

  async terminateRuntime(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
  }): Promise<void> {
    const markerPath = this.processMarkerPath(input.runtimeId);
    const marker = await this.execution.readFile(input.executionContext, input.sandboxId, {
      path: markerPath,
    });
    if (marker.isErr()) return;
    const processId = new TextDecoder().decode(marker.value).trim();
    if (processId) {
      const terminated = await this.execution.terminateProcess(
        input.executionContext,
        input.sandboxId,
        processId,
      );
      if (terminated.isErr()) throw new Error(terminated.error.message);
    }
    const removed = await this.execution.removeFile(input.executionContext, input.sandboxId, {
      path: markerPath,
    });
    if (removed.isErr()) throw new Error(removed.error.message);
  }

  async execute(input: Parameters<SandboxAgentHarness["execute"]>[0]) {
    const outputRoot = `.appaloft-agent/${input.runId}`;
    const stdoutPath = `${outputRoot}/stdout.log`;
    const stderrPath = `${outputRoot}/stderr.log`;
    const exitPath = `${outputRoot}/exit-code`;
    const placeholder = this.descriptor.run.taskPlaceholder ?? "{task}";
    let replaced = false;
    const agentArgv = safeArgv(this.descriptor.run.argv, "Command Agent run").map((argument) => {
      if (argument !== placeholder) return argument;
      replaced = true;
      return input.task;
    });
    if (!replaced) agentArgv.push(input.task);
    if (input.context.mode === "continue" && this.descriptor.run.continueArgs?.length) {
      agentArgv.push(
        ...safeArgv(this.descriptor.run.continueArgs, "Command Agent continue"),
      );
    }
    const command = input.launchProcess
      ? [
          "sh",
          "-c",
          'mkdir -p "$1"; out="$2"; err="$3"; shift 3; exec "$@" >"$out" 2>"$err"',
          "appaloft-command-agent-run",
          outputRoot,
          stdoutPath,
          stderrPath,
          ...agentArgv,
        ]
      : [
          "sh",
          "-c",
          'mkdir -p "$1"; out="$2"; err="$3"; status="$4"; shift 4; "$@" >"$out" 2>"$err"; code=$?; printf "%s" "$code" >"$status"',
          "appaloft-command-agent-run",
          outputRoot,
          stdoutPath,
          stderrPath,
          exitPath,
          ...agentArgv,
        ];
    const process = {
      argv: command,
      ...(this.cwd ? { cwd: this.cwd } : {}),
      background: true as const,
      ...(this.descriptor.timeoutMs ? { timeoutMs: this.descriptor.timeoutMs } : {}),
    };
    const started = input.launchProcess
      ? await input.launchProcess(process)
      : await this.execution.exec(input.executionContext, input.sandboxId, process);
    if (started.isErr() || started.value.mode !== "background") {
      throw new Error(
        started.isErr() ? started.error.message : "command_agent_run_background_required",
      );
    }
    const active = {
      context: input.executionContext,
      sandboxId: input.sandboxId,
      processId: started.value.processId,
      cancelled: false,
    };
    this.active.set(input.runId, active);
    const deadline = Date.now() + (this.descriptor.timeoutMs ?? 30 * 60_000);
    let completedProcess: SandboxProcessDescriptor | undefined;
    let exitStatusDeadline: number | undefined;
    try {
      while (true) {
        if (active.cancelled) throw new Error("command_agent_run_cancelled");
        const processes = await this.execution.listProcesses(
          input.executionContext,
          input.sandboxId,
        );
        if (processes.isErr()) throw new Error(processes.error.message);
        const process = processes.value.find(
          (candidate) => candidate.processId === active.processId,
        );
        if (!process || process.status !== "running") {
          if (!input.launchProcess || Number.isInteger(process?.exitCode)) {
            completedProcess = process;
            break;
          }
          exitStatusDeadline ??= Math.min(deadline, Date.now() + backgroundExitStatusGraceMs);
          if (Date.now() >= exitStatusDeadline) {
            throw new Error("command_agent_run_exit_unavailable");
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        exitStatusDeadline = undefined;
        if (Date.now() >= deadline) {
          await this.execution.terminateProcess(
            input.executionContext,
            input.sandboxId,
            active.processId,
          );
          throw new Error("command_agent_run_timeout");
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const [stdout, stderr, exit] = await Promise.all([
        this.execution.readFile(input.executionContext, input.sandboxId, { path: stdoutPath }),
        this.execution.readFile(input.executionContext, input.sandboxId, { path: stderrPath }),
        input.launchProcess
          ? Promise.resolve(ok(new TextEncoder().encode(String(completedProcess?.exitCode ?? ""))))
          : this.execution.readFile(input.executionContext, input.sandboxId, { path: exitPath }),
      ]);
      if (stdout.isErr() || stderr.isErr() || exit.isErr()) {
        throw new Error("command_agent_run_result_unavailable");
      }
      const output = new TextDecoder().decode(stdout.value);
      const errorOutput = new TextDecoder().decode(stderr.value);
      const exitText = new TextDecoder().decode(exit.value).trim();
      if (!/^-?\d+$/u.test(exitText)) throw new Error("command_agent_run_exit_unavailable");
      const exitCode = Number(exitText);
      if (input.emitEvent) {
        for (const line of output.split("\n")) {
          if (!line) continue;
          const event: SandboxAgentHarnessEvent = {
            type: "agent-output",
            data: { text: line },
          };
          await input.emitEvent(event);
        }
      }
      if (exitCode !== 0) throw new Error(errorOutput.trim() || `command_agent_failed:${exitCode}`);
      return {
        events: [] as readonly SandboxAgentHarnessEvent[],
        outcomeDigest: await sha256(output),
      };
    } finally {
      this.active.delete(input.runId);
    }
  }

  async cancel(input: { sandboxId: string; runtimeId: string; runId: string }): Promise<void> {
    const active = this.active.get(input.runId);
    if (!active || active.sandboxId !== input.sandboxId) return;
    active.cancelled = true;
    const terminated = await this.execution.terminateProcess(
      active.context,
      active.sandboxId,
      active.processId,
    );
    if (terminated.isErr()) throw new Error(terminated.error.message);
  }

  private processMarkerPath(runtimeId: string): string {
    return `.appaloft-agent/${runtimeId}/command-agent-process-id`;
  }

  private async runtimeIsReady(
    context: ExecutionContext,
    sandboxId: string,
    processId: string,
  ): Promise<boolean> {
    const processes = await this.execution.listProcesses(context, sandboxId);
    if (
      processes.isErr() ||
      !processes.value.some(
        (candidate) => candidate.processId === processId && candidate.status === "running",
      )
    ) {
      return false;
    }
    const healthcheck = this.descriptor.healthcheck;
    if (!healthcheck || healthcheck.kind === "process") return true;
    const result = await this.execution.exec(context, sandboxId, {
      argv: sandboxWorkspaceProcessArgv([
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "--max-time",
        "2",
        `http://127.0.0.1:${healthcheck.port}${healthcheck.path}`,
      ]),
      ...(this.cwd ? { cwd: this.cwd } : {}),
      timeoutMs: 3_000,
    });
    return (
      result.isOk() &&
      result.value.mode === "foreground" &&
      result.value.frames.some((frame) => frame.kind === "exit" && frame.exitCode === 0)
    );
  }
}
