import {
  type ExecutionContext,
  selectSandboxAgentModelCredentialBinding,
  type SandboxAgentModelAccessProvider,
  type SandboxAgentHarness,
  type SandboxAgentHarnessEvent,
  type SandboxAgentMcpAccessDescriptor,
  type SandboxAgentMcpAccessProvider,
  type SandboxExecResult,
  type SandboxFileDescriptor,
  type SandboxProcessDescriptor,
  issueSandboxAgentMcpAccess,
  reconcileSandboxAgentMcpAccessScope,
  revokeSandboxAgentMcpAccess,
} from "@appaloft/application";
import { type Result } from "@appaloft/core";
import { sandboxWorkspaceProcessArgv } from "./sandbox-workspace-process-environment";

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

export type OpenCodeSandboxModelAccessProvider = SandboxAgentModelAccessProvider;

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
  mcpAccess?: SandboxAgentMcpAccessProvider;
}

type OpenCodeSandboxModelCapability = Awaited<
  ReturnType<OpenCodeSandboxModelAccessProvider["issue"]>
>;

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

function validModelCapability(
  capability: OpenCodeSandboxModelCapability,
  minimumLifetimeMs: number,
): boolean {
  let modelGateway: URL | undefined;
  try {
    modelGateway = new URL(capability.baseUrl);
  } catch {
    modelGateway = undefined;
  }
  const capabilityExpiry = Date.parse(capability.expiresAt);
  return Boolean(
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/u.test(capability.capabilityId) &&
      capability.accessToken &&
      !/[\r\n\0]/u.test(capability.accessToken) &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/u.test(capability.provider) &&
      /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/u.test(capability.model) &&
      modelGateway &&
      ["http:", "https:"].includes(modelGateway.protocol) &&
      modelGateway.hostname &&
      !modelGateway.username &&
      !modelGateway.password &&
      !["localhost", "127.0.0.1", "::1"].includes(modelGateway.hostname.toLowerCase()) &&
      Number.isFinite(capabilityExpiry) &&
      capabilityExpiry > Date.now() + minimumLifetimeMs,
  );
}

export const APPALOFT_SANDBOX_SKILL_PATHS = ["/workspace/skills", "/workspace/.agents/skills"] as const;

export function createOpenCodeSandboxConfig(
  capability?: OpenCodeSandboxModelCapability,
  mcpCapabilities: readonly SandboxAgentMcpAccessDescriptor[] = [],
): string {
  return JSON.stringify({
    snapshot: false,
    skills: { paths: [...APPALOFT_SANDBOX_SKILL_PATHS] },
    ...(capability
      ? {
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
        }
      : {}),
    ...(mcpCapabilities.length > 0
      ? {
          mcp: Object.fromEntries(
            mcpCapabilities.map((mcpCapability) => [
              mcpCapability.serverName,
              {
                type: "remote",
                url: mcpCapability.url,
                enabled: true,
                oauth: false,
                headers: {
                  Authorization: `Bearer ${mcpCapability.accessToken}`,
                },
              },
            ]),
          ),
        }
      : {}),
  });
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
      clientHandoff: "local-client-exec" as const,
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


  async prepareRuntime(
    input: Parameters<NonNullable<SandboxAgentHarness["prepareRuntime"]>>[0],
  ): Promise<void> {
    const credentialBinding = selectSandboxAgentModelCredentialBinding(input.credentialBindings);
    const modelAccess = this.options.modelAccess;
    if (credentialBinding && !modelAccess) throw new Error("opencode_model_access_unavailable");
    const mcpBindings = input.mcpBindings ?? [];
    const mcpBindingDigest = await sha256(JSON.stringify(mcpBindings));
    const markerPath = this.serverMarkerPath(input.runtimeId);
    const marked = await this.readServerMarker(
      input.executionContext,
      input.sandboxId,
      markerPath,
    );
    if (marked) {
      const marker = this.parseServerMarker(new TextDecoder().decode(marked));
      const processes = await this.execution.listProcesses(
        input.executionContext,
        input.sandboxId,
      );
      if (processes.isErr()) throw new Error(processes.error.message);
      const vendorLoginReady =
        !credentialBinding &&
        marker?.schemaVersion === "opencode-server-marker/v4" &&
        marker.mcpBindingDigest === mcpBindingDigest &&
        marker.mcpCapabilities.every(
          (capability) =>
            new Date(capability.expiresAt).getTime() > Date.now() + this.capabilitySafetyWindowMs(),
        );
      const brokeredReady =
        Boolean(credentialBinding) &&
        marker &&
        (marker.schemaVersion === "opencode-server-marker/v3"
          ? marker.mcpBindingDigest === mcpBindingDigest &&
            marker.mcpCapabilities.every(
              (capability) =>
                new Date(capability.expiresAt).getTime() >
                Date.now() + this.capabilitySafetyWindowMs(),
            )
          : marker.schemaVersion === "opencode-server-marker/v2" && mcpBindings.length === 0) &&
        marker.provider &&
        marker.model &&
        new Date(marker.expiresAt).getTime() > Date.now() + this.capabilitySafetyWindowMs();
      if (
        (vendorLoginReady || brokeredReady) &&
        marker &&
        processes.value.some(
          (process) => process.processId === marker.processId && process.status === "running",
        ) &&
        (await this.serverIsHealthy(input.executionContext, input.sandboxId))
      ) {
        return;
      }
      const legacyProcessId = marker
        ? undefined
        : this.parseLegacyProcessId(new TextDecoder().decode(marked));
      const processId = marker?.processId ?? legacyProcessId;
      let cleanupError: unknown;
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
        if (terminated.isErr()) cleanupError = new Error(terminated.error.message);
      }
      if (marker) {
        try {
          if (marker.capabilityId !== "vendor-login") {
            await this.options.modelAccess?.revoke({
              ...input,
              runId: input.runtimeId,
              capabilityId: marker.capabilityId,
            });
          }
        } catch (error) {
          cleanupError ??= error;
        }
        try {
          await this.revokeMcpCapabilityIds(
            { ...input, runId: input.runtimeId },
            marker.mcpCapabilities.map((capability) => capability.capabilityId),
          );
        } catch (error) {
          cleanupError ??= error;
        }
      }
      try {
        await reconcileSandboxAgentMcpAccessScope(this.options.mcpAccess, {
          ...input,
          runId: input.runtimeId,
        });
      } catch (error) {
        cleanupError ??= error;
      }
      const removed = await this.execution.removeFile(input.executionContext, input.sandboxId, {
        path: markerPath,
      });
      if (removed.isErr()) cleanupError ??= new Error(removed.error.message);
      if (cleanupError) throw cleanupError;
    }

    const version = await this.execution.exec(input.executionContext, input.sandboxId, {
      argv: sandboxWorkspaceProcessArgv([this.executable, "--version"]),
      ...(this.cwd === "." ? {} : { cwd: this.cwd }),
    });
    if (version.isErr()) throw new Error(version.error.message);
    if (!foregroundSucceeded(version.value) || !foregroundText(version.value).includes(this.version)) {
      throw new Error("opencode_harness_version_mismatch");
    }

    const capability =
      credentialBinding && modelAccess
        ? await modelAccess.issue({
            executionContext: input.executionContext,
            sandboxId: input.sandboxId,
            runtimeId: input.runtimeId,
            runId: input.runtimeId,
            credentialBinding,
          })
        : undefined;
    if (capability && !validModelCapability(capability, this.capabilitySafetyWindowMs())) {
      await modelAccess?.revoke({
        ...input,
        runId: input.runtimeId,
        capabilityId: capability.capabilityId,
      });
      throw new Error("opencode_model_access_invalid");
    }
    let mcpCapabilities: SandboxAgentMcpAccessDescriptor[] = [];
    try {
      mcpCapabilities = await issueSandboxAgentMcpAccess(
        this.options.mcpAccess,
        {
          executionContext: input.executionContext,
          sandboxId: input.sandboxId,
          runtimeId: input.runtimeId,
          runId: input.runtimeId,
        },
        mcpBindings,
      );
    } catch (error) {
      if (capability) {
        await modelAccess?.revoke({
          ...input,
          runId: input.runtimeId,
          capabilityId: capability.capabilityId,
        });
      }
      throw error;
    }
    const config = createOpenCodeSandboxConfig(capability, mcpCapabilities);
    if (!(await this.nativeConfigIsValid(input.executionContext, input.sandboxId, config))) {
      await this.revokePreparedCapabilities(input, capability?.capabilityId, mcpCapabilities);
      throw new Error("opencode_harness_config_invalid");
    }
    const started = await this.execution.exec(input.executionContext, input.sandboxId, {
      argv: [
        "sh",
        "-c",
        'IFS= read -r config; IFS= read -r token; export OPENCODE_CONFIG_CONTENT="$config"; export APPALOFT_MODEL_ACCESS_TOKEN="$token"; exec "$@"',
        "appaloft-opencode-server",
        ...sandboxWorkspaceProcessArgv([
          this.executable,
          "serve",
          "--hostname",
          "0.0.0.0",
          "--port",
          String(this.port),
        ]),
      ],
      ...(this.cwd === "." ? {} : { cwd: this.cwd }),
      background: true,
      stdin: new TextEncoder().encode(`${config}\n${capability?.accessToken ?? ""}\n`),
    });
    if (started.isErr() || started.value.mode !== "background") {
      await this.revokePreparedCapabilities(input, capability?.capabilityId, mcpCapabilities);
      throw new Error(
        started.isErr() ? started.error.message : "opencode_server_background_process_required",
      );
    }
    const processId = started.value.processId;
    const attempts = this.options.startupPollAttempts ?? 50;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const processes = await this.execution.listProcesses(
        input.executionContext,
        input.sandboxId,
      );
      if (
        processes.isOk() &&
        processes.value.some(
          (process) => process.processId === processId && process.status === "running",
        ) &&
        (await this.serverIsHealthy(input.executionContext, input.sandboxId))
      ) {
        const written = await this.execution.writeFile(input.executionContext, input.sandboxId, {
          path: markerPath,
          content: new TextEncoder().encode(
            JSON.stringify({
              schemaVersion: capability ? "opencode-server-marker/v3" : "opencode-server-marker/v4",
              processId,
              capabilityId: capability?.capabilityId ?? "vendor-login",
              expiresAt: capability?.expiresAt ?? "9999-01-01T00:00:00.000Z",
              ...(capability
                ? { provider: capability.provider, model: capability.model }
                : {}),
              mcpBindingDigest,
              mcpCapabilities: mcpCapabilities.map((mcpCapability) => ({
                capabilityId: mcpCapability.capabilityId,
                expiresAt: mcpCapability.expiresAt,
              })),
            }),
          ),
        });
        if (written.isErr()) {
          await this.cleanupStartedServer(
            input,
            processId,
            capability?.capabilityId,
            mcpCapabilities,
          );
          throw new Error(written.error.message);
        }
        return;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.options.startupPollIntervalMs ?? 200),
      );
    }
    await this.cleanupStartedServer(input, processId, capability?.capabilityId, mcpCapabilities);
    throw new Error("opencode_server_start_failed");
  }

  async terminateRuntime(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
  }): Promise<void> {
    const markerPath = this.serverMarkerPath(input.runtimeId);
    const marker = await this.readServerMarker(
      input.executionContext,
      input.sandboxId,
      markerPath,
    );
    if (!marker) {
      await reconcileSandboxAgentMcpAccessScope(this.options.mcpAccess, {
        ...input,
        runId: input.runtimeId,
      });
      return;
    }
    const parsed = this.parseServerMarker(new TextDecoder().decode(marker));
    let cleanupError: unknown;
    if (parsed) {
      const terminated = await this.execution.terminateProcess(
        input.executionContext,
        input.sandboxId,
        parsed.processId,
      );
      if (terminated.isErr()) cleanupError = new Error(terminated.error.message);
      try {
        await this.options.modelAccess?.revoke({
          ...input,
          runId: input.runtimeId,
          capabilityId: parsed.capabilityId,
        });
      } catch (error) {
        cleanupError ??= error;
      }
      try {
        await this.revokeMcpCapabilityIds(
          { ...input, runId: input.runtimeId },
          parsed.mcpCapabilities.map((capability) => capability.capabilityId),
        );
      } catch (error) {
        cleanupError ??= error;
      }
    }
    try {
      await reconcileSandboxAgentMcpAccessScope(this.options.mcpAccess, {
        ...input,
        runId: input.runtimeId,
      });
    } catch (error) {
      cleanupError ??= error;
    }
    const removed = await this.execution.removeFile(input.executionContext, input.sandboxId, {
      path: markerPath,
    });
    if (removed.isErr()) cleanupError ??= new Error(removed.error.message);
    if (cleanupError) throw cleanupError;
  }

  async execute(input: Parameters<SandboxAgentHarness["execute"]>[0]) {
    await this.prepareRuntime(input);
    const credentialBinding = selectSandboxAgentModelCredentialBinding(input.credentialBindings);
    const modelAccess = this.options.modelAccess;
    if (credentialBinding && !modelAccess) throw new Error("opencode_model_access_unavailable");
    const capability =
      credentialBinding && modelAccess
        ? await modelAccess.issue({
            executionContext: input.executionContext,
            sandboxId: input.sandboxId,
            runtimeId: input.runtimeId,
            runId: input.runId,
            credentialBinding,
          })
        : undefined;
    if (capability && !validModelCapability(capability, this.capabilitySafetyWindowMs())) {
      await modelAccess?.revoke({
        executionContext: input.executionContext,
        sandboxId: input.sandboxId,
        runtimeId: input.runtimeId,
        runId: input.runId,
        capabilityId: capability.capabilityId,
      });
      throw new Error("opencode_model_access_invalid");
    }
    const mcpCapabilities = await issueSandboxAgentMcpAccess(
      this.options.mcpAccess,
      {
        executionContext: input.executionContext,
        sandboxId: input.sandboxId,
        runtimeId: input.runtimeId,
        runId: input.runId,
      },
      input.mcpBindings,
    ).catch(async (error) => {
      if (capability) {
        await modelAccess?.revoke({
          executionContext: input.executionContext,
          sandboxId: input.sandboxId,
          runtimeId: input.runtimeId,
          runId: input.runId,
          capabilityId: capability.capabilityId,
        });
      }
      throw error;
    });
    const config = createOpenCodeSandboxConfig(capability, mcpCapabilities);
    if (!(await this.nativeConfigIsValid(input.executionContext, input.sandboxId, config))) {
      await this.revokePreparedCapabilities(input, capability?.capabilityId, mcpCapabilities);
      throw new Error("opencode_harness_config_invalid");
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
      'IFS= read -r config; IFS= read -r token; if [ -n "$config" ]; then export OPENCODE_CONFIG_CONTENT="$config"; fi; if [ -n "$token" ]; then export APPALOFT_MODEL_ACCESS_TOKEN="$token"; fi; mkdir -p "$1"; out="$2"; err="$3"; status="$4"; shift 4; "$@" >"$out" 2>"$err"; code=$?; printf "%s" "$code" >"$status"',
      "appaloft-opencode-run",
      outputRoot,
      stdoutPath,
      stderrPath,
      exitPath,
      ...sandboxWorkspaceProcessArgv([
        this.executable,
        "run",
        "--dir",
        this.cwd === "." ? "/workspace" : `/workspace/${this.cwd}`,
        ...(capability
          ? ["--model", `${capability.provider}/${capability.model}`]
          : ["--attach", `http://127.0.0.1:${this.port}`]),
        "--format",
        "json",
        "--auto",
        ...(input.context.mode === "continue" ? ["--continue"] : []),
        input.task,
      ]),
    ];
    const result = await this.execution.exec(input.executionContext, input.sandboxId, {
      argv,
      ...(this.cwd === "." ? {} : { cwd: this.cwd }),
      background: true,
      stdin: new TextEncoder().encode(
        `${capability ? config : ""}\n${capability?.accessToken ?? ""}\n`,
      ),
    });
    const revokeExecute = async () => {
      if (capability) {
        await this.revokeCapabilities(input, capability.capabilityId, mcpCapabilities);
        return;
      }
      await revokeSandboxAgentMcpAccess(this.options.mcpAccess, input, mcpCapabilities);
    };
    if (result.isErr()) {
      await revokeExecute();
      throw new Error(result.error.message);
    }
    if (result.value.mode !== "background") {
      await revokeExecute();
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
      if (stdout.trim() === "" && stderr.trim() === "") {
        throw new Error("opencode_empty_run_result");
      }
      return {
        events: [] as readonly SandboxAgentHarnessEvent[],
        outcomeDigest: await sha256(stdout),
      };
    } finally {
      this.active.delete(input.runId);
      await revokeExecute();
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

  private async readServerMarker(
    context: ExecutionContext,
    sandboxId: string,
    path: string,
  ): Promise<Uint8Array | null> {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const result = await this.execution.readFile(context, sandboxId, { path });
      if (result.isOk()) return result.value;
      if (result.error.code === "sandbox_file_not_found") return null;
      if (result.error.retryable !== true || attempt === attempts) {
        throw new Error(result.error.message);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
    throw new Error("opencode_server_marker_read_failed");
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
    mcpBindingDigest?: string;
    mcpCapabilities: Array<{ capabilityId: string; expiresAt: string }>;
  } | null {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (
        typeof parsed.processId === "string" &&
        typeof parsed.capabilityId === "string" &&
        typeof parsed.expiresAt === "string"
      ) {
        return {
          ...(parsed.schemaVersion === "opencode-server-marker/v2" ||
          parsed.schemaVersion === "opencode-server-marker/v3" ||
          parsed.schemaVersion === "opencode-server-marker/v4"
            ? { schemaVersion: parsed.schemaVersion }
            : {}),
          processId: parsed.processId,
          capabilityId: parsed.capabilityId,
          expiresAt: parsed.expiresAt,
          ...(typeof parsed.provider === "string" ? { provider: parsed.provider } : {}),
          ...(typeof parsed.model === "string" ? { model: parsed.model } : {}),
          ...(typeof parsed.mcpBindingDigest === "string"
            ? { mcpBindingDigest: parsed.mcpBindingDigest }
            : {}),
          mcpCapabilities: Array.isArray(parsed.mcpCapabilities)
            ? parsed.mcpCapabilities.flatMap((candidate) => {
                if (
                  typeof candidate === "object" &&
                  candidate !== null &&
                  typeof (candidate as Record<string, unknown>).capabilityId === "string" &&
                  typeof (candidate as Record<string, unknown>).expiresAt === "string"
                ) {
                  const capabilityId = (candidate as Record<string, unknown>).capabilityId;
                  const expiresAt = (candidate as Record<string, unknown>).expiresAt;
                  return [
                    {
                      capabilityId: capabilityId as string,
                      expiresAt: expiresAt as string,
                    },
                  ];
                }
                return [];
              })
            : [],
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
    capabilityId: string | undefined,
    mcpCapabilities: readonly SandboxAgentMcpAccessDescriptor[],
  ): Promise<void> {
    const terminated = await this.execution.terminateProcess(
      input.executionContext,
      input.sandboxId,
      processId,
    );
    let revokeError: unknown;
    if (capabilityId) {
      try {
        await this.options.modelAccess?.revoke({
          ...input,
          runId: input.runtimeId,
          capabilityId,
        });
      } catch (error) {
        revokeError = error;
      }
    }
    try {
      await revokeSandboxAgentMcpAccess(
        this.options.mcpAccess,
        { ...input, runId: input.runtimeId },
        mcpCapabilities,
      );
    } catch (error) {
      revokeError ??= error;
    }
    if (terminated.isErr()) throw new Error(terminated.error.message);
    if (revokeError) {
      throw revokeError instanceof Error
        ? revokeError
        : new Error("opencode_model_access_revoke_failed");
    }
  }

  private async revokePreparedCapabilities(
    input: {
      executionContext: ExecutionContext;
      sandboxId: string;
      runtimeId: string;
    },
    modelCapabilityId: string | undefined,
    mcpCapabilities: readonly SandboxAgentMcpAccessDescriptor[],
  ): Promise<void> {
    if (!modelCapabilityId) {
      await revokeSandboxAgentMcpAccess(
        this.options.mcpAccess,
        { ...input, runId: input.runtimeId },
        mcpCapabilities,
      );
      return;
    }
    return this.revokeCapabilities(
      { ...input, runId: input.runtimeId },
      modelCapabilityId,
      mcpCapabilities,
    );
  }

  private async revokeCapabilities(
    input: {
      executionContext: ExecutionContext;
      sandboxId: string;
      runtimeId: string;
      runId: string;
    },
    modelCapabilityId: string,
    mcpCapabilities: readonly SandboxAgentMcpAccessDescriptor[],
  ): Promise<void> {
    let firstError: unknown;
    try {
      await this.options.modelAccess?.revoke({
        ...input,
        capabilityId: modelCapabilityId,
      });
    } catch (error) {
      firstError = error;
    }
    try {
      await revokeSandboxAgentMcpAccess(
        this.options.mcpAccess,
        input,
        mcpCapabilities,
      );
    } catch (error) {
      firstError ??= error;
    }
    if (firstError) throw firstError;
  }

  private async revokeMcpCapabilityIds(
    input: {
      executionContext: ExecutionContext;
      sandboxId: string;
      runtimeId: string;
      runId: string;
    },
    capabilityIds: readonly string[],
  ): Promise<void> {
    let firstError: unknown;
    for (const capabilityId of capabilityIds) {
      try {
        await this.options.mcpAccess?.revoke({ ...input, capabilityId });
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  private async nativeConfigIsValid(
    executionContext: ExecutionContext,
    sandboxId: string,
    config: string,
  ): Promise<boolean> {
    const validated = await this.execution.exec(executionContext, sandboxId, {
      argv: [
        "sh",
        "-c",
        'IFS= read -r config; export OPENCODE_CONFIG_CONTENT="$config"; exec "$@" >/dev/null 2>&1',
        "appaloft-opencode-config",
        ...sandboxWorkspaceProcessArgv([this.executable, "debug", "config"]),
      ],
      ...(this.cwd === "." ? {} : { cwd: this.cwd }),
      stdin: new TextEncoder().encode(`${config}\n`),
    });
    return validated.isOk() && foregroundSucceeded(validated.value);
  }

  private workspaceFilePath(path: string): string {
    return this.cwd === "." ? path : `${this.cwd}/${path}`;
  }

  private capabilitySafetyWindowMs(): number {
    const attempts = this.options.startupPollAttempts ?? 50;
    const intervalMs = this.options.startupPollIntervalMs ?? 200;
    return Math.max(30_000, attempts * intervalMs + 10_000);
  }

  private async serverIsHealthy(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<boolean> {
    const result = await this.execution.exec(context, sandboxId, {
      argv: sandboxWorkspaceProcessArgv([
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "--max-time",
        "2",
        `http://127.0.0.1:${this.port}/global/health`,
      ]),
      ...(this.cwd === "." ? {} : { cwd: this.cwd }),
      timeoutMs: 3_000,
    });
    return result.isOk() && foregroundSucceeded(result.value);
  }
}
