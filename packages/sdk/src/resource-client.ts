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

export interface AppaloftRunCreateInput {
  readonly task: string;
  readonly context?:
    | { readonly mode: "fresh" }
    | { readonly mode: "continue"; readonly parentRunId: string };
  readonly idempotencyKey?: string;
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
    readonly create: (input: AppaloftRunCreateInput) => Promise<AppaloftRunDescriptor>;
  };
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

  return {
    ...operations,
    operations,
    sandboxes,
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
          (input.harness === "pi" ? defaultPiHarnessTemplateId : undefined);
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

function createAgentHandle(
  operations: GeneratedAppaloftClient,
  sandboxId: string,
  descriptor: AppaloftAgentDescriptor,
): AppaloftAgent {
  const runtimeId = requiredResourceId(descriptor.runtimeId, "runtimeId");
  return {
    ...descriptor,
    sandboxId,
    runtimeId,
    runs: {
      create: async (input) => {
        const run = unwrapOperation<AppaloftRunDescriptor>(
          await operations.sandboxes.agents.runs.create<AppaloftRunDescriptor>({
            sandboxId,
            runtimeId,
            task: input.task,
            context: input.context ?? { mode: "fresh" },
            idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
          }),
        );
        return {
          ...run,
          sandboxId,
          runtimeId,
          runId: requiredResourceId(run.runId, "runId"),
        };
      },
    },
  };
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
