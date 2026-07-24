import {
  type ExecutionContext,
  type SandboxAgentHarness,
  type SandboxAgentHarnessEvent,
  type SandboxFileDescriptor,
  type SandboxProcessDescriptor,
  type SandboxExecResult,
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

export interface PiSandboxModelAccessProvider {
  issue(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
    runId: string;
  }): Promise<PiSandboxModelAccess>;
  revoke(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
    runId: string;
    capabilityId: string;
  }): Promise<void>;
}

export interface PiSandboxModelAccess {
  capabilityId: string;
  baseUrl: string;
  accessToken: string;
  provider: string;
  model: string;
  expiresAt: string;
}

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
}

export function createPiSandboxModelConfig(modelAccess: PiSandboxModelAccess): string {
  return JSON.stringify({
    providers: {
      [modelAccess.provider]: {
        baseUrl: modelAccess.baseUrl,
        api: "openai-completions",
        apiKey: modelAccess.accessToken,
        authHeader: true,
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
  prompt: string;
}): string[] {
  return [
    input.executable ?? "pi",
    "--mode",
    "json",
    "--no-session",
    "--tools",
    "read,bash,edit,write,grep,find,ls",
    "--no-extensions",
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

export function classifyPiSandboxFailure(value: unknown): PiSandboxFailureCode {
  const message = value instanceof Error ? value.message : String(value);
  const known = piSandboxFailureCodes.find((code) => message === code);
  if (known) return known;
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|host not found|name resolution/i.test(message)) {
    return "pi_model_gateway_host_unresolved";
  }
  if (/ECONNREFUSED|ECONNRESET|network is unreachable|fetch failed|connection refused/i.test(message)) {
    return "pi_model_gateway_unreachable";
  }
  if (/\b401\b|unauthorized|invalid api key|authentication failed/i.test(message)) {
    return "pi_model_unauthorized";
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
    const modelAccess = await modelAccessProvider.issue(input);
    const outputRoot = `.appaloft-agent/${input.runId}`;
    const agentDir = `${outputRoot}/agent`;
    const modelConfig = createPiSandboxModelConfig(modelAccess);
    const configured = await this.execution.writeFile(input.executionContext, input.sandboxId, {
      path: `${agentDir}/models.json`,
      content: new TextEncoder().encode(modelConfig),
    });
    if (configured.isErr()) {
      await modelAccessProvider.revoke({
        ...input,
        capabilityId: modelAccess.capabilityId,
      });
      throw new Error(configured.error.message);
    }
    const piArgv = createPiSandboxArgv({
      ...(this.options.executable ? { executable: this.options.executable } : {}),
      ...(this.options.offlineStartup === undefined
        ? {}
        : { offlineStartup: this.options.offlineStartup }),
      modelAccess,
      prompt,
    });
    const stdoutPath = `${outputRoot}/stdout.jsonl`;
    const stderrPath = `${outputRoot}/stderr.log`;
    const exitPath = `${outputRoot}/exit-code`;
    const argv = [
      "sh",
      "-c",
      'mkdir -p "$1"; out="$2"; err="$3"; status="$4"; export PI_CODING_AGENT_DIR="$5"; shift 5; "$@" >"$out" 2>"$err"; code=$?; printf "%s" "$code" >"$status"',
      "appaloft-pi-run",
      outputRoot,
      stdoutPath,
      stderrPath,
      exitPath,
      agentDir,
      ...piArgv,
    ];
    try {
      const result = await this.execution.exec(input.executionContext, input.sandboxId, {
        argv,
        ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
        background: true,
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
      if (input.emitEvent) {
        await emitJsonEvents(stdout.slice(stdoutCursor), input.emitEvent);
      }
      if (exitCode !== 0) {
        throw new Error(classifyPiSandboxFailure(stderr));
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
            data: { source: "pi", code },
          });
        } catch {
          // The original secret-safe failure code remains authoritative when event persistence fails.
        }
      }
      throw new Error(code);
    } finally {
      this.active.delete(input.runId);
      await this.cleanup(input.executionContext, input.sandboxId, outputRoot);
      await modelAccessProvider.revoke({
        ...input,
        capabilityId: modelAccess.capabilityId,
      });
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
}
