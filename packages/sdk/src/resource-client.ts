import { type GeneratedAppaloftClient, generatedSdkOperations } from "./generated-operations.js";
import {
  type AppaloftSdkClientOptions,
  type AppaloftSdkFacadeInput,
  type AppaloftSdkOperationResult,
  AppaloftSdkRequestError,
  createAppaloftFacadeClient,
  createAppaloftSdkClient,
  type DomainErrorResponse,
} from "./internal.js";

export const defaultPiHarnessTemplateId = "aht_pi_managed_v1";
export const defaultOpenCodeHarnessTemplateId = "aht_opencode_managed_v1";

export interface AppaloftSandboxCreateInput extends AppaloftSdkFacadeInput {
  readonly source:
    | { readonly kind: "image"; readonly image: string }
    | { readonly kind: "snapshot"; readonly snapshotId: string }
    | { readonly kind: "template"; readonly templateId: string };
  readonly requestedIsolation: "container-trusted" | "gvisor" | "kata" | "microvm";
  readonly limits: {
    readonly cpuMillis: number;
    readonly memoryBytes: number;
    readonly diskBytes: number;
    readonly maxProcesses: number;
  };
  readonly networkPolicy:
    | { readonly mode: "deny"; readonly rules: readonly [] }
    | {
        readonly mode: "allowlist";
        readonly rules: readonly {
          readonly kind: "domain" | "cidr";
          readonly value: string;
          readonly ports: readonly number[];
        }[];
      };
  readonly expiresAt?: string;
  readonly providerKey?: string;
}

export interface AppaloftSandboxDescriptor extends Record<string, unknown> {
  readonly sandboxId: string;
  readonly status: string;
}

export interface AppaloftAgentDescriptor extends Record<string, unknown> {
  readonly sandboxId: string;
  readonly runtimeId: string;
  readonly status: string;
}

export interface AppaloftRunDescriptor extends Record<string, unknown> {
  readonly sandboxId: string;
  readonly runtimeId: string;
  readonly runId: string;
  readonly status: string;
}

export interface AppaloftAgentCreateInput {
  readonly harness: string;
  readonly harnessTemplateId?: string;
  readonly idempotencyKey?: string;
}

export interface AppaloftWorkspaceCreateInput {
  readonly sandbox: AppaloftSandboxCreateInput;
  readonly harness: "pi" | "opencode";
  readonly harnessTemplateId?: string;
  readonly idempotencyKey?: string;
}

export interface AppaloftWorkspace {
  readonly workspaceId: string;
  readonly sandboxId: string;
  readonly sandbox: AppaloftSandbox;
  readonly agent: AppaloftAgent;
}

export interface AppaloftWorkspaceDescriptor {
  readonly workspaceId: string;
  readonly sandboxId: string;
  readonly sandbox: AppaloftSandboxDescriptor;
  readonly agentRuntimes: readonly AppaloftAgentDescriptor[];
}

export interface AppaloftWorkspaceListInput extends AppaloftSdkFacadeInput {
  readonly limit?: number;
  readonly offset?: number;
}

export interface AppaloftWorkspaceList {
  readonly items: readonly AppaloftWorkspaceDescriptor[];
  readonly [key: string]: unknown;
}

export class AppaloftWorkspaceCreateError extends Error {
  readonly workspaceId: string;
  readonly sandboxId: string;
  readonly cause: unknown;

  constructor(sandboxId: string, cause: unknown) {
    super(
      `Agent Workspace Runtime creation failed after Sandbox ${sandboxId} was created: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "AppaloftWorkspaceCreateError";
    this.workspaceId = sandboxId;
    this.sandboxId = sandboxId;
    this.cause = cause;
  }
}

export interface AppaloftRunCreateInput {
  readonly task: string;
  readonly context?:
    | { readonly mode: "fresh" }
    | { readonly mode: "continue"; readonly parentRunId: string };
  readonly idempotencyKey?: string;
}

export interface AppaloftAgentStreamInput {
  readonly task?: string;
  readonly prompt?: string;
  readonly context?: AppaloftRunCreateInput["context"];
  readonly idempotencyKey?: string;
}

export type AppaloftRunEventEnvelope =
  | {
      readonly kind: "event";
      readonly schemaVersion: "sandbox-agent.run-events/v1";
      readonly cursor: string;
      readonly runId: string;
      readonly sequence: number;
      readonly occurredAt: string;
      readonly eventType: string;
      readonly data: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: "error";
      readonly schemaVersion: "sandbox-agent.run-events/v1";
      readonly runId: string;
      readonly code: "cursor-gap" | "stream-failed";
      readonly retryable: boolean;
    }
  | {
      readonly kind: "closed";
      readonly schemaVersion: "sandbox-agent.run-events/v1";
      readonly runId: string;
      readonly reason: "terminal" | "aborted";
    };

export interface AppaloftRun extends AppaloftRunDescriptor {
  readonly events: {
    readonly list: <T = unknown>(input?: {
      readonly afterSequence?: number;
      readonly limit?: number;
    }) => Promise<T>;
    readonly stream: (input?: {
      readonly afterSequence?: number;
      readonly limit?: number;
      readonly signal?: AbortSignal;
    }) => AsyncIterable<AppaloftRunEventEnvelope>;
  };
}

export interface AppaloftSandboxFileWriteInput {
  readonly path: string;
  readonly contentBase64: string;
}

export interface AppaloftSandboxFileReadInput {
  readonly path: string;
}

export interface AppaloftSandboxExecInput {
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly background?: boolean;
  readonly timeoutMs?: number;
  readonly stdinBase64?: string;
}

export interface AppaloftAgent extends AppaloftAgentDescriptor {
  readonly runs: {
    readonly create: (input: AppaloftRunCreateInput) => Promise<AppaloftRun>;
  };
  readonly stream: (
    input: AppaloftAgentStreamInput,
  ) => Promise<AppaloftRun & { readonly fullStream: AsyncIterable<AppaloftRunEventEnvelope> }>;
}

export interface AppaloftSandbox extends AppaloftSandboxDescriptor {
  readonly agents: {
    readonly create: (input: AppaloftAgentCreateInput) => Promise<AppaloftAgent>;
  };
  readonly files: {
    readonly write: <T = unknown>(input: AppaloftSandboxFileWriteInput) => Promise<T>;
    readonly read: <T = unknown>(input: AppaloftSandboxFileReadInput) => Promise<T>;
  };
  readonly exec: <T = unknown>(input: AppaloftSandboxExecInput) => Promise<T>;
  readonly terminate: <T = unknown>() => Promise<T>;
}

type GeneratedSandboxes = GeneratedAppaloftClient["sandboxes"];

export type AppaloftClient = Omit<GeneratedAppaloftClient, "sandboxes"> & {
  readonly operations: GeneratedAppaloftClient;
  readonly sandboxes: Omit<GeneratedSandboxes, "create"> & {
    readonly create: (input: AppaloftSandboxCreateInput) => Promise<AppaloftSandbox>;
  };
  readonly workspaces: {
    readonly create: (input: AppaloftWorkspaceCreateInput) => Promise<AppaloftWorkspace>;
    readonly list: (input?: AppaloftWorkspaceListInput) => Promise<AppaloftWorkspaceList>;
    readonly show: (workspaceId: string) => Promise<AppaloftWorkspaceDescriptor>;
  };
};

export function createAppaloftClient(options: AppaloftSdkClientOptions): AppaloftClient {
  const operations = createAppaloftFacadeClient(
    createAppaloftSdkClient(options),
    generatedSdkOperations,
  ) as unknown as GeneratedAppaloftClient;
  const sandboxes = {
    ...operations.sandboxes,
    create: async (input: AppaloftSandboxCreateInput) => {
      const descriptor = unwrapOperation<AppaloftSandboxDescriptor>(
        await operations.sandboxes.create<AppaloftSandboxDescriptor>(input),
      );
      return createSandboxHandle(operations, descriptor);
    },
  };
  const workspaces = {
    create: async (input: AppaloftWorkspaceCreateInput): Promise<AppaloftWorkspace> => {
      const sandbox = await sandboxes.create(input.sandbox);
      try {
        const agent = await sandbox.agents.create({
          harness: input.harness,
          ...(input.harnessTemplateId ? { harnessTemplateId: input.harnessTemplateId } : {}),
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        });
        return {
          workspaceId: sandbox.sandboxId,
          sandboxId: sandbox.sandboxId,
          sandbox,
          agent,
        };
      } catch (error) {
        throw new AppaloftWorkspaceCreateError(sandbox.sandboxId, error);
      }
    },
    list: async (input: AppaloftWorkspaceListInput = {}): Promise<AppaloftWorkspaceList> => {
      const sandboxesResult = unwrapOperation<{
        readonly items: readonly AppaloftSandboxDescriptor[];
        readonly [key: string]: unknown;
      }>(await operations.sandboxes.list(input));
      const items = await Promise.all(
        sandboxesResult.items.map((sandbox) => createWorkspaceDescriptor(operations, sandbox)),
      );
      return { ...sandboxesResult, items };
    },
    show: async (workspaceId: string): Promise<AppaloftWorkspaceDescriptor> => {
      const sandbox = unwrapOperation<AppaloftSandboxDescriptor>(
        await operations.sandboxes.show({ sandboxId: workspaceId }),
      );
      return createWorkspaceDescriptor(operations, sandbox);
    },
  };

  return {
    ...operations,
    operations,
    sandboxes,
    workspaces,
  } as AppaloftClient;
}

function createSandboxHandle(
  operations: GeneratedAppaloftClient,
  descriptor: AppaloftSandboxDescriptor,
): AppaloftSandbox {
  const sandboxId = requiredResourceId(descriptor.sandboxId, "sandboxId");
  return {
    ...descriptor,
    sandboxId,
    agents: {
      create: async (input) => {
        const harnessTemplateId =
          input.harnessTemplateId ??
          (input.harness === "pi"
            ? defaultPiHarnessTemplateId
            : input.harness === "opencode"
              ? defaultOpenCodeHarnessTemplateId
              : undefined);
        if (!harnessTemplateId) {
          throw new TypeError(`harnessTemplateId is required for harness ${input.harness}`);
        }
        const agent = unwrapOperation<AppaloftAgentDescriptor>(
          await operations.sandboxes.agents.runtimes.create<AppaloftAgentDescriptor>({
            sandboxId,
            harnessKey: input.harness,
            harnessTemplateId,
            idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
          }),
        );
        return createAgentHandle(operations, sandboxId, agent);
      },
    },
    files: {
      write: async <T>(input: AppaloftSandboxFileWriteInput) =>
        unwrapOperation<T>(await operations.sandboxFiles.write<T>({ sandboxId, ...input })),
      read: async <T>(input: AppaloftSandboxFileReadInput) =>
        unwrapOperation<T>(await operations.sandboxFiles.read<T>({ sandboxId, ...input })),
    },
    exec: async <T>(input: AppaloftSandboxExecInput) =>
      unwrapOperation<T>(
        await operations.sandboxes.exec<T>({
          sandboxId,
          ...input,
          argv: [...input.argv],
        }),
      ),
    terminate: async <T>() =>
      unwrapOperation<T>(await operations.sandboxes.terminate<T>({ sandboxId })),
  };
}

async function createWorkspaceDescriptor(
  operations: GeneratedAppaloftClient,
  sandbox: AppaloftSandboxDescriptor,
): Promise<AppaloftWorkspaceDescriptor> {
  const sandboxId = requiredResourceId(sandbox.sandboxId, "sandboxId");
  const runtimes = unwrapOperation<{ readonly items: readonly AppaloftAgentDescriptor[] }>(
    await operations.sandboxes.agents.runtimes.list({ sandboxId }),
  );
  return {
    workspaceId: sandboxId,
    sandboxId,
    sandbox,
    agentRuntimes: runtimes.items,
  };
}

function createAgentHandle(
  operations: GeneratedAppaloftClient,
  sandboxId: string,
  descriptor: AppaloftAgentDescriptor,
): AppaloftAgent {
  const runtimeId = requiredResourceId(descriptor.runtimeId, "runtimeId");
  const createRun = async (input: AppaloftRunCreateInput) => {
    const run = unwrapOperation<AppaloftRunDescriptor>(
      await operations.sandboxes.agents.runs.create<AppaloftRunDescriptor>({
        sandboxId,
        runtimeId,
        task: input.task,
        context: input.context ?? { mode: "fresh" },
        idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
      }),
    );
    return createRunHandle(operations, sandboxId, runtimeId, run);
  };
  return {
    ...descriptor,
    sandboxId,
    runtimeId,
    runs: {
      create: createRun,
    },
    stream: async (input) => {
      const task = input.task ?? input.prompt;
      if (!task?.trim()) throw new TypeError("agent.stream requires task or prompt");
      const run = await createRun({
        task,
        ...(input.context ? { context: input.context } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      });
      return { ...run, fullStream: run.events.stream() };
    },
  };
}

function createRunHandle(
  operations: GeneratedAppaloftClient,
  sandboxId: string,
  runtimeId: string,
  descriptor: AppaloftRunDescriptor,
): AppaloftRun {
  const runId = requiredResourceId(descriptor.runId, "runId");
  return {
    ...descriptor,
    sandboxId,
    runtimeId,
    runId,
    events: {
      list: async <T>(input = {}) =>
        unwrapOperation<T>(await operations.sandboxes.agents.runs.events<T>({ runId, ...input })),
      stream: (input = {}) => {
        const source = operations.sandboxes.agents.runs.events.stream<unknown>({
          runId,
          ...input,
        });
        return (async function* runEventEnvelopes() {
          for await (const value of source) {
            if (!isRunEventEnvelope(value)) continue;
            yield value;
          }
        })();
      },
    },
  };
}

function isRunEventEnvelope(value: unknown): value is AppaloftRunEventEnvelope {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "event" || kind === "error" || kind === "closed";
}

function unwrapOperation<T>(result: AppaloftSdkOperationResult<T>): T {
  if (result.ok) return result.data;
  throw new AppaloftSdkRequestError(result.status, result.error);
}

function requiredResourceId(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new AppaloftSdkRequestError(502, invalidResourceResponse(field));
}

function invalidResourceResponse(field: string): DomainErrorResponse {
  return {
    code: "sdk_resource_response_invalid",
    category: "infra",
    message: `Appaloft response is missing ${field}`,
    retryable: false,
    details: { field },
  };
}
