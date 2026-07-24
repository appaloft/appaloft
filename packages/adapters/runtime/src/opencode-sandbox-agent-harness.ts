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

export interface OpenCodeSandboxModelAccessProvider {
  issue(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
    runId: string;
  }): Promise<{
    capabilityId: string;
    baseUrl: string;
    accessToken: string;
    provider: string;
    model: string;
    expiresAt: string;
  }>;
  revoke(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
    runId: string;
    capabilityId: string;
  }): Promise<void>;
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
  modelAccess?: OpenCodeSandboxModelAccessProvider;
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
  readonly sandboxTemplateId: string;
  readonly version: string;
  readonly templateDigest: string;
  readonly interaction;
  readonly capabilities;
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
    this.sandboxTemplateId = options.sandboxTemplateId;
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
    this.capabilities = Object.freeze({
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: true,
      persistentPaths: Object.freeze([
        "/workspace",
        "/workspace/.local/share/opencode",
        "/workspace/.appaloft-agent",
      ]),
      healthcheck: Object.freeze({
        kind: "http" as const,
        port: this.port,
        path: "/global/health",
      }),
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
      const marker = this.parseServerMarker(new TextDecoder().decode(marked.value));
      const processes = await this.execution.listProcesses(
        input.executionContext,
        input.sandboxId,
      );
      if (processes.isErr()) throw new Error(processes.error.message);
      if (
        marker &&
        marker.schemaVersion === "opencode-server-marker/v2" &&
        marker.provider &&
        marker.model &&
        new Date(marker.expiresAt).getTime() >
          Date.now() + (this.options.timeoutMs ?? 30 * 60_000) &&
        processes.value.some(
          (process) => process.processId === marker.processId && process.status === "running",
        )
      ) {
        return;
      }
      const legacyProcessId = marker
        ? undefined
        : this.parseLegacyProcessId(new TextDecoder().decode(marked.value));
      const processId = marker?.processId ?? legacyProcessId;
      if (
        processId &&
        processes.value.some(
          (process) => process.processId === processId && process.status === "running",
        )
      ) {
        const terminated = await this.execution.terminateProcess(
          input.executionContext,
          input.sandboxId,
          processId,
        );
        if (terminated.isErr()) throw new Error(terminated.error.message);
      }
      if (marker) {
        await this.options.modelAccess?.revoke({
          ...input,
          runId: input.runtimeId,
          capabilityId: marker.capabilityId,
        });
      }
      const removed = await this.execution.removeFile(
        input.executionContext,
        input.sandboxId,
        { path: markerPath },
      );
      if (removed.isErr()) throw new Error(removed.error.message);
    }

    const version = await this.execution.exec(input.executionContext, input.sandboxId, {
      argv: [this.executable, "--version"],
      ...(this.cwd === "." ? {} : { cwd: this.cwd }),
    });
    if (version.isErr()) throw new Error(version.error.message);
    if (!foregroundSucceeded(version.value) || !foregroundText(version.value).includes(this.version)) {
      throw new Error("opencode_harness_version_mismatch");
    }

    const modelAccess = this.options.modelAccess;
    if (!modelAccess) throw new Error("opencode_model_access_unavailable");
    const capability = await modelAccess.issue({
      ...input,
      runId: input.runtimeId,
    });
    let modelGateway: URL | undefined;
    try {
      modelGateway = new URL(capability.baseUrl);
    } catch {
      modelGateway = undefined;
    }
    const capabilityExpiry = Date.parse(capability.expiresAt);
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/u.test(capability.capabilityId) ||
      !capability.accessToken ||
      /[\r\n\0]/u.test(capability.accessToken) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/u.test(capability.provider) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/u.test(capability.model) ||
      !modelGateway ||
      !["http:", "https:"].includes(modelGateway.protocol) ||
      !modelGateway.hostname ||
      modelGateway.username ||
      modelGateway.password ||
      ["localhost", "127.0.0.1", "::1"].includes(modelGateway.hostname.toLowerCase()) ||
      !Number.isFinite(capabilityExpiry) ||
      capabilityExpiry <= Date.now() + (this.options.timeoutMs ?? 30 * 60_000)
    ) {
      await modelAccess.revoke({
        ...input,
        runId: input.runtimeId,
        capabilityId: capability.capabilityId,
      });
      throw new Error("opencode_model_access_invalid");
    }
    const config = JSON.stringify({
      model: `${capability.provider}/${capability.model}`,
      provider: {
        [capability.provider]: {
          npm: "@ai-sdk/openai-compatible",
          name: "Appaloft scoped model gateway",
          options: {
            baseURL: capability.baseUrl,
            apiKey: "{env:APPALOFT_MODEL_ACCESS_TOKEN}",
          },
          models: {
            [capability.model]: { name: capability.model },
          },
        },
      },
    });
    const started = await this.execution.exec(input.executionContext, input.sandboxId, {
      argv: [
        "sh",
        "-c",
        'IFS= read -r config; IFS= read -r token; export OPENCODE_CONFIG_CONTENT="$config"; export APPALOFT_MODEL_ACCESS_TOKEN="$token"; exec "$@"',
        "appaloft-opencode-server",
        "env",
        "HOME=/workspace",
        "XDG_DATA_HOME=/workspace/.local/share",
        this.executable,
        "serve",
        "--hostname",
        "0.0.0.0",
        "--port",
        String(this.port),
      ],
      ...(this.cwd === "." ? {} : { cwd: this.cwd }),
      background: true,
      stdin: new TextEncoder().encode(`${config}\n${capability.accessToken}\n`),
    });
    if (started.isErr() || started.value.mode !== "background") {
      await modelAccess.revoke({
        ...input,
        runId: input.runtimeId,
        capabilityId: capability.capabilityId,
      });
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
            content: new TextEncoder().encode(
              JSON.stringify({
                schemaVersion: "opencode-server-marker/v2",
                processId,
                capabilityId: capability.capabilityId,
                expiresAt: capability.expiresAt,
                provider: capability.provider,
                model: capability.model,
              }),
            ),
          },
        );
        if (written.isErr()) {
          await this.cleanupStartedServer(input, processId, capability.capabilityId);
          throw new Error(written.error.message);
        }
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.options.startupPollIntervalMs ?? 100),
      );
    }
    await this.cleanupStartedServer(input, processId, capability.capabilityId);
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
    const parsed = this.parseServerMarker(new TextDecoder().decode(marker.value));
    if (parsed) {
      const terminated = await this.execution.terminateProcess(
        input.executionContext,
        input.sandboxId,
        parsed.processId,
      );
      if (terminated.isErr()) throw new Error(terminated.error.message);
      await this.options.modelAccess?.revoke({
        ...input,
        runId: input.runtimeId,
        capabilityId: parsed.capabilityId,
      });
    }
    const removed = await this.execution.removeFile(input.executionContext, input.sandboxId, {
      path: markerPath,
    });
    if (removed.isErr()) throw new Error(removed.error.message);
  }

  async execute(input: Parameters<SandboxAgentHarness["execute"]>[0]) {
    await this.prepareRuntime(input);
    const marker = await this.execution.readFile(input.executionContext, input.sandboxId, {
      path: this.serverMarkerPath(input.runtimeId),
    });
    if (marker.isErr()) throw new Error(marker.error.message);
    const server = this.parseServerMarker(new TextDecoder().decode(marker.value));
    if (!server?.provider || !server.model) {
      throw new Error("opencode_model_identity_unavailable");
    }
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
      "--model",
      `${server.provider}/${server.model}`,
      "--format",
      "json",
      "--auto",
      ...(input.context.mode === "continue" ? ["--continue"] : []),
      input.task,
    ];
    const result = await this.execution.exec(input.executionContext, input.sandboxId, {
      argv,
      ...(this.cwd === "." ? {} : { cwd: this.cwd }),
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

  private parseServerMarker(
    value: string,
  ): {
    schemaVersion?: string;
    processId: string;
    capabilityId: string;
    expiresAt: string;
    provider?: string;
    model?: string;
  } | null {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (
        typeof parsed.processId === "string" &&
        typeof parsed.capabilityId === "string" &&
        typeof parsed.expiresAt === "string"
      ) {
        return {
          ...(parsed.schemaVersion === "opencode-server-marker/v2"
            ? { schemaVersion: parsed.schemaVersion }
            : {}),
          processId: parsed.processId,
          capabilityId: parsed.capabilityId,
          expiresAt: parsed.expiresAt,
          ...(typeof parsed.provider === "string" ? { provider: parsed.provider } : {}),
          ...(typeof parsed.model === "string" ? { model: parsed.model } : {}),
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  private parseLegacyProcessId(value: string): string | undefined {
    const processId = value.trim();
    return /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/u.test(processId)
      ? processId
      : undefined;
  }

  private async cleanupStartedServer(
    input: {
      executionContext: ExecutionContext;
      sandboxId: string;
      runtimeId: string;
    },
    processId: string,
    capabilityId: string,
  ): Promise<void> {
    const terminated = await this.execution.terminateProcess(
      input.executionContext,
      input.sandboxId,
      processId,
    );
    let revokeError: unknown;
    try {
      await this.options.modelAccess?.revoke({
        ...input,
        runId: input.runtimeId,
        capabilityId,
      });
    } catch (error) {
      revokeError = error;
    }
    if (terminated.isErr()) throw new Error(terminated.error.message);
    if (revokeError) {
      throw revokeError instanceof Error
        ? revokeError
        : new Error("opencode_model_access_revoke_failed");
    }
  }

  private workspaceFilePath(path: string): string {
    return this.cwd === "." ? path : `${this.cwd}/${path}`;
  }
}
