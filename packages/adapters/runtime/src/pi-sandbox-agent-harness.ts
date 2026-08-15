import {
  type ExecutionContext,
  requireSandboxAgentModelCredentialBinding,
  type SandboxAgentHarness,
  type SandboxAgentHarnessEvent,
  type SandboxFileDescriptor,
  type SandboxProcessDescriptor,
  type SandboxExecResult,
  type SandboxAgentModelAccessDescriptor,
  type SandboxAgentModelAccessProvider,
  type SandboxAgentMcpAccessDescriptor,
  type SandboxAgentMcpAccessProvider,
  issueSandboxAgentMcpAccess,
  revokeSandboxAgentMcpAccess,
  withOccupancyFirstPartyMcpDiscovery,
} from "@appaloft/application";

import { type Result } from "@appaloft/core";

export interface PiSandboxExecutionPort {
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

export type PiSandboxModelAccessProvider = SandboxAgentModelAccessProvider;

export type PiSandboxModelAccess = SandboxAgentModelAccessDescriptor;

export interface PiSandboxAgentHarnessOptions {
  templateId: string;
  sandboxTemplateId: string;
  version: string;
  templateDigest: string;
  executable?: string;
  cwd?: string;
  timeoutMs?: number;
  offlineStartup?: boolean;
  modelAccess?: PiSandboxModelAccessProvider;
  mcpAccess?: SandboxAgentMcpAccessProvider;
  /** Absolute path to a reviewed, template-owned Pi MCP extension. */
  mcpExtensionPath?: string;
}

export function createPiSandboxModelConfig(modelAccess: PiSandboxModelAccess): string {
  return JSON.stringify({
    providers: {
      [modelAccess.provider]: {
        baseUrl: modelAccess.baseUrl,
        api: "openai-completions",
        apiKey: modelAccess.accessToken,
        authHeader: true,
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          supportsUsageInStreaming: false,
          maxTokensField: "max_tokens",
          supportsStrictMode: false,
        },
        models: [
          {
            id: modelAccess.model,
            name: modelAccess.model,
            reasoning: false,
            input: ["text"],
            contextWindow: 128_000,
            maxTokens: 16_384,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      },
    },
  });
}

export function createPiSandboxArgv(input: {
  executable?: string;
  offlineStartup?: boolean;
  modelAccess: PiSandboxModelAccess;
  mcpCapabilities?: readonly SandboxAgentMcpAccessDescriptor[];
  mcpExtensionPath?: string;
  prompt: string;
}): string[] {
  const mcpToolNames = [
    ...new Set(
      (input.mcpCapabilities ?? []).flatMap((capability) =>
        capability.effectiveTools.map((tool) =>
          createPiSandboxMcpToolName(capability.serverName, tool),
        ),
      ),
    ),
  ];
  return [
    input.executable ?? "pi",
    "--mode",
    "json",
    "--no-session",
    "--tools",
    ["read", "bash", "edit", "write", "grep", "find", "ls", ...mcpToolNames].join(","),
    "--no-extensions",
    ...(input.mcpExtensionPath ? ["--extension", input.mcpExtensionPath] : []),
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--no-approve",
    "--provider",
    input.modelAccess.provider,
    "--model",
    input.modelAccess.model,
    ...(input.offlineStartup === false ? [] : ["--offline"]),
    "--print",
    input.prompt,
  ];
}

export function createPiSandboxMcpToolName(serverName: string, upstreamTool: string): string {
  return `mcp_${serverName}_${upstreamTool}`.replace(/[^A-Za-z0-9_]/gu, "_").slice(0, 120);
}

export function createPiSandboxMcpConfig(
  capabilities: readonly SandboxAgentMcpAccessDescriptor[],
): string {
  return JSON.stringify({
    schemaVersion: "appaloft.pi-mcp/v1",
    servers: capabilities.map((capability) => ({
      name: capability.serverName,
      transport: capability.transport,
      url: capability.url,
      headers: { Authorization: `Bearer ${capability.accessToken}` },
      tools: [...capability.effectiveTools],
    })),
  });
}

function validPiMcpExtensionPath(path: string | undefined): path is string {
  return Boolean(
    path &&
      path.startsWith("/") &&
      !/[\0\r\n]/u.test(path) &&
      !path.split("/").some((segment) => segment === ".."),
  );
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
        type: typeof value.type === "string" ? value.type : "pi-event",
        data: value,
      });
    } catch {
      events.push({ type: "pi-output", data: { text: line } });
    }
  }
  return events;
}

function readPiStructuredFailure(stdout: string): string | undefined {
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (value.type !== "message_end") continue;
      const message = value.message;
      if (!message || typeof message !== "object" || Array.isArray(message)) continue;
      if (!("stopReason" in message) || message.stopReason !== "error") continue;
      return "errorMessage" in message && typeof message.errorMessage === "string"
        ? message.errorMessage
        : "pi_process_failed";
    } catch {
      // Non-JSON output remains available to the existing exit-code classifier.
    }
  }
  return undefined;
}

async function emitJsonEvents(
  stdout: string,
  emitEvent: (event: SandboxAgentHarnessEvent) => Promise<void>,
): Promise<void> {
  for (const event of parseJsonEvents(stdout)) await emitEvent(event);
}

const piSandboxFailureCodes = [
  "pi_model_access_unavailable",
  "pi_model_gateway_host_unresolved",
  "pi_model_gateway_unreachable",
  "pi_model_configuration_invalid",
  "pi_model_unauthorized",
  "pi_model_endpoint_not_found",
  "pi_cli_option_unsupported",
  "pi_filesystem_read_only",
  "pi_permission_denied",
  "pi_out_of_memory",
  "pi_process_cancelled",
  "pi_process_timeout",
  "pi_process_result_unavailable",
  "pi_process_failed",
] as const;

export type PiSandboxFailureCode = (typeof piSandboxFailureCodes)[number];

export type PiSandboxFailurePhase =
  | "start-process"
  | "poll-process"
  | "read-process-result"
  | "validate-process-result";

export function classifyPiSandboxFailure(value: unknown): PiSandboxFailureCode {
  const message = value instanceof Error ? value.message : String(value);
  const known = piSandboxFailureCodes.find((code) => message === code);
  if (known) return known;
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|host not found|name resolution/i.test(message)) {
    return "pi_model_gateway_host_unresolved";
  }
  if (
    /ECONNREFUSED|ECONNRESET|network is unreachable|fetch failed|connection refused|connection error/i.test(
      message,
    )
  ) {
    return "pi_model_gateway_unreachable";
  }
  if (/\b(?:401|403)\b|unauthorized|forbidden|invalid api key|authentication failed/i.test(message)) {
    return "pi_model_unauthorized";
  }
  if (
    /unknown (model|provider)|(model|provider).*(not found|not configured|unavailable)/i.test(
      message,
    )
  ) {
    return "pi_model_configuration_invalid";
  }
  if (/\b404\b|endpoint not found|route not found/i.test(message)) {
    return "pi_model_endpoint_not_found";
  }
  if (/unknown option|unexpected option|unrecognized option/i.test(message)) {
    return "pi_cli_option_unsupported";
  }
  if (/read-only file system|\bEROFS\b/i.test(message)) {
    return "pi_filesystem_read_only";
  }
  if (/permission denied|\bEACCES\b|\bEPERM\b/i.test(message)) {
    return "pi_permission_denied";
  }
  if (/out of memory|\bENOMEM\b|heap limit/i.test(message)) {
    return "pi_out_of_memory";
  }
  return "pi_process_failed";
}

export class PiSandboxAgentHarness implements SandboxAgentHarness {
  readonly key = "pi";
  readonly templateId: string;
  readonly sandboxTemplateId: string;
  readonly version: string;
  readonly templateDigest: string;
  readonly capabilities = Object.freeze({
    taskMode: true,
    interactive: true,
    backgroundRuns: true,
    nativeSession: false,
    persistentPaths: Object.freeze(["/workspace", "/workspace/.appaloft-agent"]),
    healthcheck: Object.freeze({ kind: "process" as const }),
  });
  private readonly active = new Map<
    string,
    { context: ExecutionContext; sandboxId: string; processId: string; cancelled: boolean }
  >();

  constructor(
    private readonly execution: PiSandboxExecutionPort,
    private readonly options: PiSandboxAgentHarnessOptions,
  ) {
    this.templateId = options.templateId;
    this.sandboxTemplateId = options.sandboxTemplateId;
    this.version = options.version;
    this.templateDigest = options.templateDigest;
  }

  admitSandbox(source: Parameters<NonNullable<SandboxAgentHarness["admitSandbox"]>>[0]): boolean {
    return source.kind === "template" && source.templateId === this.options.sandboxTemplateId;
  }

  async execute(input: Parameters<SandboxAgentHarness["execute"]>[0]) {
    const prompt =
      input.context.mode === "fresh"
        ? input.task
        : `Continue from Appaloft Run ${input.context.parentRunId}.\n\n${input.task}`;
    const modelAccessProvider = this.options.modelAccess;
    if (!modelAccessProvider) {
      throw new Error("pi_model_access_unavailable");
    }
    const credentialBinding = requireSandboxAgentModelCredentialBinding(input.credentialBindings);
    const mcpBindings = withOccupancyFirstPartyMcpDiscovery(input.mcpBindings ?? []);

    if (mcpBindings.length > 0 && !validPiMcpExtensionPath(this.options.mcpExtensionPath)) {
      throw new Error("pi_mcp_extension_unavailable");
    }
    const modelAccess = await modelAccessProvider.issue({
      executionContext: input.executionContext,
      sandboxId: input.sandboxId,
      runtimeId: input.runtimeId,
      runId: input.runId,
      credentialBinding,
    });
    let mcpCapabilities: SandboxAgentMcpAccessDescriptor[] = [];
    try {
      mcpCapabilities = await issueSandboxAgentMcpAccess(
        this.options.mcpAccess,
        {
          executionContext: input.executionContext,
          sandboxId: input.sandboxId,
          runtimeId: input.runtimeId,
          runId: input.runId,
        },
        mcpBindings,
      );
    } catch (error) {
      await modelAccessProvider.revoke({ ...input, capabilityId: modelAccess.capabilityId });
      throw error;
    }
    const outputRoot = `.appaloft-agent/${input.runId}`;
    const agentDir = `${outputRoot}/agent`;
    const modelConfig = createPiSandboxModelConfig(modelAccess);
    const configured = await this.execution.writeFile(input.executionContext, input.sandboxId, {
      path: `${agentDir}/models.json`,
      content: new TextEncoder().encode(modelConfig),
    });
    if (configured.isErr()) {
      await this.revokeCapabilities(input, modelAccess.capabilityId, mcpCapabilities);
      throw new Error(configured.error.message);
    }
    const piArgv = createPiSandboxArgv({
      ...(this.options.executable ? { executable: this.options.executable } : {}),
      ...(this.options.offlineStartup === undefined
        ? {}
        : { offlineStartup: this.options.offlineStartup }),
      modelAccess,
      ...(mcpCapabilities.length > 0
        ? { mcpCapabilities, mcpExtensionPath: this.options.mcpExtensionPath }
        : {}),
      prompt,
    });
    const mcpConfig = createPiSandboxMcpConfig(mcpCapabilities);
    const stdoutPath = `${outputRoot}/stdout.jsonl`;
    const stderrPath = `${outputRoot}/stderr.log`;
    const exitPath = `${outputRoot}/exit-code`;
    const argv = [
      "sh",
      "-c",
      'IFS= read -r mcp_config; export APPALOFT_MCP_CONFIG="$mcp_config"; mkdir -p "$1"; out="$2"; err="$3"; status="$4"; export PI_CODING_AGENT_DIR="$5"; shift 5; "$@" >"$out" 2>"$err"; code=$?; printf "%s" "$code" >"$status"',
      "appaloft-pi-run",
      outputRoot,
      stdoutPath,
      stderrPath,
      exitPath,
      agentDir,
      ...piArgv,
    ];
    let failurePhase: PiSandboxFailurePhase = "start-process";
    try {
      const result = await this.execution.exec(input.executionContext, input.sandboxId, {
        argv,
        ...(this.options.cwd && this.options.cwd !== "." ? { cwd: this.options.cwd } : {}),
        background: true,
        stdin: new TextEncoder().encode(`${mcpConfig}\n`),
      });
      if (result.isErr()) throw new Error(result.error.message);
      if (result.value.mode !== "background") {
        throw new Error("Pi harness requires a cancellable background process");
      }
      const active = {
        context: input.executionContext,
        sandboxId: input.sandboxId,
        processId: result.value.processId,
        cancelled: false,
      };
      this.active.set(input.runId, active);
      failurePhase = "poll-process";
      const deadline = Date.now() + (this.options.timeoutMs ?? 30 * 60_000);
      let stdoutCursor = 0;
      const emitAvailableOutput = async (includeTrailing: boolean) => {
        if (!input.emitEvent) return;
        const stdoutResult = await this.execution.readFile(input.executionContext, input.sandboxId, {
          path: stdoutPath,
        });
        if (stdoutResult.isErr()) return;
        const stdout = new TextDecoder().decode(stdoutResult.value);
        const end = includeTrailing ? stdout.length : stdout.lastIndexOf("\n") + 1;
        if (end <= stdoutCursor) return;
        await emitJsonEvents(stdout.slice(stdoutCursor, end), input.emitEvent);
        stdoutCursor = end;
      };
      while (true) {
        if (active.cancelled) throw new Error("pi_process_cancelled");
        const processes = await this.execution.listProcesses(
          input.executionContext,
          input.sandboxId,
        );
        if (processes.isErr()) throw new Error(processes.error.message);
        const process = processes.value.find((candidate) => candidate.processId === active.processId);
        if (!process || process.status !== "running") break;
        await emitAvailableOutput(false);
        if (Date.now() >= deadline) {
          await this.execution.terminateProcess(
            input.executionContext,
            input.sandboxId,
            active.processId,
          );
          throw new Error("pi_process_timeout");
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      failurePhase = "read-process-result";
      const [stdoutResult, stderrResult, exitResult] = await Promise.all([
        this.execution.readFile(input.executionContext, input.sandboxId, { path: stdoutPath }),
        this.execution.readFile(input.executionContext, input.sandboxId, { path: stderrPath }),
        this.execution.readFile(input.executionContext, input.sandboxId, { path: exitPath }),
      ]);
      if (stdoutResult.isErr() || stderrResult.isErr() || exitResult.isErr()) {
        throw new Error("pi_process_result_unavailable");
      }
      const stdout = new TextDecoder().decode(stdoutResult.value);
      const stderr = new TextDecoder().decode(stderrResult.value);
      const exitCode = Number(new TextDecoder().decode(exitResult.value));
      failurePhase = "validate-process-result";
      if (input.emitEvent) {
        await emitJsonEvents(stdout.slice(stdoutCursor), input.emitEvent);
      }
      const structuredFailure = readPiStructuredFailure(stdout);
      if (exitCode !== 0 || structuredFailure) {
        throw new Error(classifyPiSandboxFailure(structuredFailure ?? `${stderr}\n${stdout}`));
      }
      return {
        events: input.emitEvent ? [] : parseJsonEvents(stdout),
        outcomeDigest: await sha256(stdout),
      };
    } catch (error) {
      const code = classifyPiSandboxFailure(error);
      if (input.emitEvent) {
        try {
          await input.emitEvent({
            type: "run-error",
            data: { source: "pi", code, phase: failurePhase },
          });
        } catch {
          // The original secret-safe failure code remains authoritative when event persistence fails.
        }
      }
      throw new Error(code);
    } finally {
      this.active.delete(input.runId);
      await this.cleanup(input.executionContext, input.sandboxId, outputRoot);
      await this.revokeCapabilities(input, modelAccess.capabilityId, mcpCapabilities);
    }
  }

  async cancel(input: Parameters<SandboxAgentHarness["cancel"]>[0]): Promise<void> {
    const active = this.active.get(input.runId);
    if (!active) return;
    active.cancelled = true;
    const terminated = await this.execution.terminateProcess(
      active.context,
      active.sandboxId,
      active.processId,
    );
    if (terminated.isErr()) throw new Error(terminated.error.message);
  }

  private async cleanup(
    context: ExecutionContext,
    sandboxId: string,
    outputRoot: string,
  ): Promise<void> {
    try {
      await this.execution.removeFile(context, sandboxId, {
        path: outputRoot,
        recursive: true,
      });
    } catch {
      // Run output is bounded and lives under the Sandbox-owned workspace; lifecycle cleanup remains authoritative.
    }
  }

  private async revokeCapabilities(
    input: Parameters<SandboxAgentHarness["execute"]>[0],
    modelCapabilityId: string,
    mcpCapabilities: readonly SandboxAgentMcpAccessDescriptor[],
  ): Promise<void> {
    let firstError: unknown;
    try {
      await revokeSandboxAgentMcpAccess(this.options.mcpAccess, input, mcpCapabilities);
    } catch (error) {
      firstError = error;
    }
    try {
      await this.options.modelAccess?.revoke({ ...input, capabilityId: modelCapabilityId });
    } catch (error) {
      firstError ??= error;
    }
    if (firstError) throw firstError;
  }
}
