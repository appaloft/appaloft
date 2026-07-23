import {
  type ExecutionContext,
  type SandboxAgentHarness,
  type SandboxAgentHarnessEvent,
  type SandboxExecResult,
  type SandboxFileDescriptor,
  type SandboxProcessDescriptor,
} from "@appaloft/application";
import { type Result } from "@appaloft/core";

export interface OpenCodeSandboxExecutionPort {
  exec(
    context: ExecutionContext,
    sandboxId: string,
    input: {
      argv: string[];
      cwd?: string;
      background?: boolean;
      timeoutMs?: number;
      stdin?: Uint8Array;
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

export interface OpenCodeSandboxAgentHarnessOptions {
  templateId: string;
  sandboxTemplateId: string;
  version: string;
  templateDigest: string;
  executable?: string;
  cwd?: string;
  port?: number;
  timeoutMs?: number;
  startupPollAttempts?: number;
  startupPollIntervalMs?: number;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function parseJsonEvents(stdout: string): SandboxAgentHarnessEvent[] {
  const events: SandboxAgentHarnessEvent[] = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      events.push({
        type: typeof value.type === "string" ? value.type : "opencode-event",
        data: value,
      });
    } catch {
      events.push({ type: "opencode-output", data: { text: line } });
    }
  }
  return events;
}

function foregroundSucceeded(result: SandboxExecResult): result is Extract<
  SandboxExecResult,
  { mode: "foreground" }
> {
  return (
    result.mode === "foreground" &&
    result.frames.some((frame) => frame.kind === "exit" && frame.exitCode === 0)
  );
}

function foregroundText(result: Extract<SandboxExecResult, { mode: "foreground" }>): string {
  return result.frames
    .filter(
      (frame): frame is Extract<(typeof result.frames)[number], { kind: "stdout" | "stderr" }> =>
        frame.kind === "stdout" || frame.kind === "stderr",
    )
    .map((frame) => frame.data)
    .join("");
}

function normalizedCwd(value: string | undefined): string {
  const cwd = (value ?? ".").trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (
    cwd.startsWith("/") ||
    cwd.includes("\0") ||
    cwd.split("/").some((segment) => segment === "..")
  ) {
    throw new Error("OpenCode Sandbox cwd must remain below the workspace root");
  }
  return cwd || ".";
}

export class OpenCodeSandboxAgentHarness implements SandboxAgentHarness {
  readonly key = "opencode";
  readonly templateId: string;
  readonly version: string;
  readonly templateDigest: string;
  readonly interaction;
  private readonly active = new Map<
    string,
    { context: ExecutionContext; sandboxId: string; processId: string; cancelled: boolean }
  >();
  private readonly executable: string;
  private readonly cwd: string;
  private readonly port: number;

  constructor(
    private readonly execution: OpenCodeSandboxExecutionPort,
    private readonly options: OpenCodeSandboxAgentHarnessOptions,
  ) {
    this.templateId = options.templateId;
    this.version = options.version.trim();
    this.templateDigest = options.templateDigest;
    this.executable = options.executable?.trim() || "opencode";
    this.cwd = normalizedCwd(options.cwd);
    this.port = options.port ?? 4096;
    if (!this.version || !/^sha256:[a-f0-9]{64}$/.test(this.templateDigest)) {
      throw new Error("OpenCode harness version and template digest must be pinned");
    }
    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65_535) {
      throw new Error("OpenCode harness port is invalid");
    }
    const workspaceDirectory = this.cwd === "." ? "/workspace" : `/workspace/${this.cwd}`;
    this.interaction = Object.freeze({
      transport: "native-attach" as const,
      command: Object.freeze([
        this.executable,
        "attach",
        `http://127.0.0.1:${this.port}`,
        "--dir",
        workspaceDirectory,
      ]),
      sessionRecovery: "native-session-store" as const,
      serverPort: this.port,
    });
  }

  admitSandbox(source: Parameters<NonNullable<SandboxAgentHarness["admitSandbox"]>>[0]): boolean {
    return source.kind === "template" && source.templateId === this.options.sandboxTemplateId;
  }

  async prepareRuntime(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
  }): Promise<void> {
    const markerPath = this.serverMarkerPath(input.runtimeId);
    const marked = await this.execution.readFile(input.executionContext, input.sandboxId, {
      path: markerPath,
    });
    if (marked.isOk()) {
      const processId = new TextDecoder().decode(marked.value).trim();
      const processes = await this.execution.listProcesses(
        input.executionContext,
        input.sandboxId,
      );
      if (
        processes.isOk() &&
        processes.value.some(
          (process) => process.processId === processId && process.status === "running",
        )
      ) {
        return;
      }
    }

    const version = await this.execution.exec(input.executionContext, input.sandboxId, {
      argv: [this.executable, "--version"],
      cwd: this.cwd,
    });
    if (
      version.isErr() ||
      !foregroundSucceeded(version.value) ||
      !foregroundText(version.value).includes(this.version)
    ) {
      throw new Error("opencode_harness_version_mismatch");
    }

    const started = await this.execution.exec(input.executionContext, input.sandboxId, {
      argv: [
        "env",
        "HOME=/workspace",
        "XDG_DATA_HOME=/workspace/.local/share",
        this.executable,
        "serve",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(this.port),
      ],
      cwd: this.cwd,
      background: true,
    });
    if (started.isErr() || started.value.mode !== "background") {
      throw new Error(
        started.isErr() ? started.error.message : "opencode_server_background_process_required",
      );
    }
    const processId = started.value.processId;
    const attempts = this.options.startupPollAttempts ?? 20;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const processes = await this.execution.listProcesses(
        input.executionContext,
        input.sandboxId,
      );
      if (
        processes.isOk() &&
        processes.value.some(
          (process) => process.processId === processId && process.status === "running",
        )
      ) {
        const written = await this.execution.writeFile(
          input.executionContext,
          input.sandboxId,
          {
            path: markerPath,
            content: new TextEncoder().encode(processId),
          },
        );
        if (written.isErr()) throw new Error(written.error.message);
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.options.startupPollIntervalMs ?? 100),
      );
    }
    throw new Error("opencode_server_start_failed");
  }

  async terminateRuntime(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
  }): Promise<void> {
    const markerPath = this.serverMarkerPath(input.runtimeId);
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
    await this.prepareRuntime(input);
    const outputRoot = `.appaloft-agent/${input.runId}`;
    const stdoutPath = `${outputRoot}/stdout.jsonl`;
    const stderrPath = `${outputRoot}/stderr.log`;
    const exitPath = `${outputRoot}/exit-code`;
    const stdoutFilePath = this.workspaceFilePath(stdoutPath);
    const stderrFilePath = this.workspaceFilePath(stderrPath);
    const exitFilePath = this.workspaceFilePath(exitPath);
    const argv = [
      "sh",
      "-c",
      'mkdir -p "$1"; out="$2"; err="$3"; status="$4"; shift 4; "$@" >"$out" 2>"$err"; code=$?; printf "%s" "$code" >"$status"',
      "appaloft-opencode-run",
      outputRoot,
      stdoutPath,
      stderrPath,
      exitPath,
      "env",
      "HOME=/workspace",
      "XDG_DATA_HOME=/workspace/.local/share",
      this.executable,
      "run",
      "--attach",
      `http://127.0.0.1:${this.port}`,
      "--dir",
      this.cwd === "." ? "/workspace" : `/workspace/${this.cwd}`,
      "--format",
      "json",
      "--auto",
      ...(input.context.mode === "continue" ? ["--continue"] : []),
      input.task,
    ];
    const result = await this.execution.exec(input.executionContext, input.sandboxId, {
      argv,
      cwd: this.cwd,
      background: true,
    });
    if (result.isErr()) throw new Error(result.error.message);
    if (result.value.mode !== "background") {
      throw new Error("OpenCode harness requires a cancellable background process");
    }
    const active = {
      context: input.executionContext,
      sandboxId: input.sandboxId,
      processId: result.value.processId,
      cancelled: false,
    };
    this.active.set(input.runId, active);
    const deadline = Date.now() + (this.options.timeoutMs ?? 30 * 60_000);
    let stdoutCursor = 0;
    const emitAvailableOutput = async (includeTrailing: boolean) => {
      if (!input.emitEvent) return;
      const stdoutResult = await this.execution.readFile(input.executionContext, input.sandboxId, {
        path: stdoutFilePath,
      });
      if (stdoutResult.isErr()) return;
      const stdout = new TextDecoder().decode(stdoutResult.value);
      const end = includeTrailing ? stdout.length : stdout.lastIndexOf("\n") + 1;
      if (end <= stdoutCursor) return;
      for (const event of parseJsonEvents(stdout.slice(stdoutCursor, end))) {
        await input.emitEvent(event);
      }
      stdoutCursor = end;
    };
    try {
      while (true) {
        if (active.cancelled) throw new Error("opencode_process_cancelled");
        const processes = await this.execution.listProcesses(
          input.executionContext,
          input.sandboxId,
        );
        if (processes.isErr()) throw new Error(processes.error.message);
        const process = processes.value.find(
          (candidate) => candidate.processId === active.processId,
        );
        if (!process || process.status !== "running") break;
        await emitAvailableOutput(false);
        if (Date.now() >= deadline) {
          await this.execution.terminateProcess(
            input.executionContext,
            input.sandboxId,
            active.processId,
          );
          throw new Error("opencode_process_timeout");
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const [stdoutResult, stderrResult, exitResult] = await Promise.all([
        this.execution.readFile(input.executionContext, input.sandboxId, {
          path: stdoutFilePath,
        }),
        this.execution.readFile(input.executionContext, input.sandboxId, {
          path: stderrFilePath,
        }),
        this.execution.readFile(input.executionContext, input.sandboxId, {
          path: exitFilePath,
        }),
      ]);
      if (stdoutResult.isErr() || stderrResult.isErr() || exitResult.isErr()) {
        throw new Error("opencode_process_result_unavailable");
      }
      await emitAvailableOutput(true);
      const stdout = new TextDecoder().decode(stdoutResult.value);
      const stderr = new TextDecoder().decode(stderrResult.value);
      const exitCode = Number(new TextDecoder().decode(exitResult.value));
      if (exitCode !== 0) {
        throw new Error(stderr.trim() || `opencode_process_failed:${exitCode}`);
      }
      return {
        events: [] as readonly SandboxAgentHarnessEvent[],
        outcomeDigest: await sha256(stdout),
      };
    } finally {
      this.active.delete(input.runId);
    }
  }

  async cancel(input: { sandboxId: string; runtimeId: string; runId: string }): Promise<void> {
    const active = this.active.get(input.runId);
    if (!active || active.sandboxId !== input.sandboxId) return;
    active.cancelled = true;
    const result = await this.execution.terminateProcess(
      active.context,
      active.sandboxId,
      active.processId,
    );
    if (result.isErr()) throw new Error(result.error.message);
  }

  private serverMarkerPath(runtimeId: string): string {
    return `.appaloft-agent/${runtimeId}/opencode-process-id`;
  }

  private workspaceFilePath(path: string): string {
    return this.cwd === "." ? path : `${this.cwd}/${path}`;
  }
}
