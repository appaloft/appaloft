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
  readonly providerKey?: string;
  readonly lastActivityAt?: string;
  readonly suspension?: {
    readonly mode: "process-frozen" | "compute-released";
    readonly portability: "provider-local" | "provider-family" | "portable";
    readonly recoveryFamily?: string;
  };
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
  readonly profileInstallationId?: string;
}

export interface AppaloftWorkspaceCreateInput {
  readonly profileInstallationId?: string;
  readonly sandbox?: AppaloftSandboxCreateInput;
  readonly harness?: "pi" | "opencode";
  readonly harnessTemplateId?: string;
  readonly idempotencyKey?: string;
  readonly source?: {
    readonly repository: string;
    readonly repositoryIdentity?: string;
    readonly ref?: string;
    readonly branch?: string;
    readonly commitSha?: string;
  };
}

export interface AppaloftWorkspaceSourceHttpBasicCredential {
  readonly kind: "http-basic";
  readonly username: string;
  readonly password: string;
}

export type AppaloftWorkspaceSourceCredentialProvider = (input: {
  readonly repository: string;
}) => Promise<AppaloftWorkspaceSourceHttpBasicCredential | null>;

export interface AppaloftClientOptions extends AppaloftSdkClientOptions {
  /**
   * Trusted composition hook for transient private-source credentials.
   *
   * Credential material is delivered to the Git process through Sandbox stdin and is never
   * embedded in the repository locator or process argv.
   */
  readonly workspaceSourceCredentialProvider?: AppaloftWorkspaceSourceCredentialProvider;
}

interface AppaloftWorkspaceProfilePlan {
  readonly sandbox: {
    readonly source: AppaloftSandboxCreateInput["source"];
    readonly requestedIsolation: AppaloftSandboxCreateInput["requestedIsolation"];
    readonly limits: AppaloftSandboxCreateInput["limits"];
    readonly networkPolicy:
      | { readonly mode: "deny" }
      | Extract<AppaloftSandboxCreateInput["networkPolicy"], { readonly mode: "allowlist" }>;
  };
  readonly initialization: readonly {
    readonly id: string;
    readonly argv: readonly string[];
    readonly cwd?: string;
  }[];
  readonly runtime: {
    readonly harnessKey: string;
    readonly harnessTemplateId: string;
  };
  readonly defaultPorts: readonly {
    readonly port: number;
    readonly visibility: "private" | "organization" | "public";
    readonly ttlSeconds: number;
  }[];
  readonly preview?: {
    readonly startArgv: readonly string[];
    readonly cwd?: string;
    readonly port: number;
    readonly visibility: "private" | "organization" | "public";
    readonly ttlSeconds: number;
  };
}

export interface AppaloftWorkspaceOpenInput {
  readonly repository: string;
  readonly repositoryIdentity: string;
  readonly ref: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly profile?: string;
  readonly forceNew?: boolean;
  readonly attach?: boolean;
}

export interface AppaloftWorkspace {
  readonly workspaceId: string;
  readonly sandboxId: string;
  readonly sandbox: AppaloftSandbox;
  readonly agent: AppaloftAgent;
  readonly tasks: AppaloftWorkspaceTasks;
  readonly resumed?: boolean;
  readonly attach?: Readonly<Record<string, unknown>>;
  readonly terminate: <T = unknown>() => Promise<T>;
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
  readonly phase: "source-materialization" | "runtime-creation";
  readonly cause: unknown;

  constructor(
    sandboxId: string,
    cause: unknown,
    phase: "source-materialization" | "runtime-creation" = "runtime-creation",
  ) {
    super(
      `Agent Workspace ${phase.replaceAll("-", " ")} failed after Sandbox ${sandboxId} was created: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "AppaloftWorkspaceCreateError";
    this.workspaceId = sandboxId;
    this.sandboxId = sandboxId;
    this.phase = phase;
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

export interface AppaloftAgentTaskCheckInput {
  readonly name: string;
  readonly argv: readonly string[];
  readonly required?: boolean;
}

export interface AppaloftAgentTaskPreviewInput {
  readonly startArgv: readonly string[];
  readonly port: number;
  readonly visibility?: "private" | "organization" | "public";
  readonly expiresAt?: string;
}

export interface AppaloftAgentTaskRunInput extends AppaloftRunCreateInput {
  readonly checks?: readonly AppaloftAgentTaskCheckInput[];
  readonly preview?: AppaloftAgentTaskPreviewInput;
  readonly immutableReview?: boolean;
  readonly sourceRoot?: string;
}

export interface AppaloftAgentTaskCheckResult {
  readonly name: string;
  readonly required: boolean;
  readonly status: "passed" | "failed";
  readonly exitCode: number;
  readonly output: string;
  readonly truncated: boolean;
  readonly redacted: boolean;
}

export interface AppaloftAgentTaskChanges {
  readonly status: string;
  readonly stat: string;
  readonly patch: string;
  readonly truncated: boolean;
  readonly redacted: boolean;
}

export interface AppaloftAgentTaskResult {
  readonly schemaVersion: "agent-task-run/v1";
  readonly taskRunId: string;
  readonly runId: string;
  readonly runtimeId: string;
  readonly workspaceId: string;
  readonly status:
    | "running"
    | "finalizing"
    | "checks-failed"
    | "awaiting-approval"
    | "approved"
    | "delivering"
    | "delivered"
    | "failed"
    | "cancelled";
  readonly plan: {
    readonly checks: readonly AppaloftAgentTaskCheckInput[];
    readonly preview?: AppaloftAgentTaskPreviewInput;
    readonly immutableReview: boolean;
    readonly sourceRoot: string;
  };
  readonly agentRun: AppaloftRunDescriptor;
  readonly checks: readonly AppaloftAgentTaskCheckResult[];
  readonly changes?: AppaloftAgentTaskChanges;
  readonly developmentPreview?: Readonly<Record<string, unknown>>;
  readonly sourceArtifact?: Readonly<Record<string, unknown>>;
  readonly candidatePreview?: Readonly<Record<string, unknown>>;
  readonly approval?: {
    readonly actorKind: string;
    readonly actorId: string;
    readonly approvedAt: string;
  };
  readonly delivery?: {
    readonly remote: string;
    readonly branch: string;
    readonly commitSha: string;
    readonly pullRequestUrl?: string;
  };
  readonly failure?: {
    readonly phase: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AppaloftAgentTaskDeliveryInput {
  readonly commitMessage: string;
  readonly branch: string;
  readonly remote?: string;
  readonly pullRequest?: {
    readonly provider: "github";
    readonly title: string;
    readonly body?: string;
    readonly base?: string;
  };
}

export interface AppaloftWorkspaceTasks {
  readonly run: (input: AppaloftAgentTaskRunInput) => Promise<AppaloftAgentTaskResult>;
  readonly list: () => Promise<{ readonly items: readonly AppaloftAgentTaskResult[] }>;
  readonly show: (taskRunId: string) => Promise<AppaloftAgentTaskResult>;
  readonly resume: (taskRunId: string) => Promise<AppaloftAgentTaskResult>;
  readonly cancel: (taskRunId: string) => Promise<AppaloftAgentTaskResult>;
  readonly approve: (taskRunId: string) => Promise<AppaloftAgentTaskResult>;
  readonly deliver: (
    taskRunId: string,
    input: AppaloftAgentTaskDeliveryInput,
  ) => Promise<AppaloftAgentTaskResult>;
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
  readonly attach: (input?: { readonly expiresAt?: string }) => Promise<
    | {
        readonly workspaceId: string;
        readonly runtimeId: string;
        readonly transport: "native-attach";
        readonly access: Readonly<Record<string, unknown>>;
        readonly clientCommand: readonly string[];
      }
    | {
        readonly workspaceId: string;
        readonly runtimeId: string;
        readonly transport: "managed-terminal";
        readonly sessionId: string;
        readonly processId: string;
        readonly access: Readonly<Record<string, unknown>>;
      }
  >;
  readonly terminate: <T = unknown>() => Promise<T>;
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
  readonly pause: () => Promise<AppaloftSandbox>;
  readonly resume: (input?: { readonly providerKey?: string }) => Promise<AppaloftSandbox>;
  readonly terminate: <T = unknown>() => Promise<T>;
}

export interface AppaloftWorkspaceCollaborationDescriptor extends Record<string, unknown> {
  readonly schemaVersion: "workspace-collaboration/v1";
  readonly collaborationId: string;
  readonly name: string;
  readonly status: "active" | "closed";
  readonly revision: number;
  readonly participants: readonly Readonly<Record<string, unknown>>[];
  readonly lanes: readonly Readonly<Record<string, unknown>>[];
  readonly handoffs: readonly Readonly<Record<string, unknown>>[];
}

export interface AppaloftWorkspaceCollaborationCreateInput extends AppaloftSdkFacadeInput {
  readonly name: string;
  readonly workspaceId: string;
  readonly lanePurpose?: "builder" | "reviewer" | "tester" | "custom";
  readonly laneLabel?: string;
  readonly branch?: string;
}

export interface AppaloftWorkspaceCollaboration extends AppaloftWorkspaceCollaborationDescriptor {
  readonly refresh: () => Promise<AppaloftWorkspaceCollaboration>;
  readonly participantsApi: {
    readonly add: (input: {
      readonly subject:
        | { readonly kind: "user"; readonly subjectId: string }
        | {
            readonly kind: "agent-runtime";
            readonly runtimeId: string;
            readonly workspaceId: string;
          };
      readonly role: "owner" | "editor" | "reviewer" | "viewer";
    }) => Promise<AppaloftWorkspaceCollaboration>;
    readonly changeRole: (
      participantId: string,
      role: "owner" | "editor" | "reviewer" | "viewer",
    ) => Promise<AppaloftWorkspaceCollaboration>;
    readonly remove: (participantId: string) => Promise<AppaloftWorkspaceCollaboration>;
  };
  readonly lanesApi: {
    readonly add: (input: {
      readonly workspaceId: string;
      readonly purpose: "builder" | "reviewer" | "tester" | "custom";
      readonly label: string;
      readonly branch?: string;
    }) => Promise<AppaloftWorkspaceCollaboration>;
    readonly archive: (laneId: string) => Promise<AppaloftWorkspaceCollaboration>;
    readonly authorize: (input: {
      readonly laneId: string;
      readonly access: "observe" | "write";
      readonly expectedGeneration?: number;
    }) => Promise<Readonly<Record<string, unknown>>>;
    readonly issueTerminalAccess: (input: {
      readonly laneId: string;
      readonly sessionId: string;
      readonly access: "observe" | "write";
      readonly expectedGeneration?: number;
    }) => Promise<Readonly<Record<string, unknown>>>;
    readonly issueNativeAttach: (input: {
      readonly laneId: string;
      readonly runtimeId: string;
      readonly expiresAt: string;
      readonly expectedGeneration: number;
    }) => Promise<Readonly<Record<string, unknown>>>;
  };
  readonly writerLeases: {
    readonly acquire: (
      laneId: string,
      expiresAt: string,
    ) => Promise<AppaloftWorkspaceCollaboration>;
    readonly renew: (
      laneId: string,
      expectedGeneration: number,
      expiresAt: string,
    ) => Promise<AppaloftWorkspaceCollaboration>;
    readonly release: (
      laneId: string,
      expectedGeneration: number,
    ) => Promise<AppaloftWorkspaceCollaboration>;
    readonly transfer: (input: {
      readonly laneId: string;
      readonly expectedGeneration: number;
      readonly toParticipantId: string;
      readonly expiresAt: string;
    }) => Promise<AppaloftWorkspaceCollaboration>;
  };
  readonly handoffsApi: {
    readonly offer: (input: {
      readonly sourceLaneId: string;
      readonly targetLaneId: string;
      readonly artifactId: string;
      readonly expectedDigest: string;
    }) => Promise<AppaloftWorkspaceCollaboration>;
    readonly resolve: (
      handoffId: string,
      decision: "accept" | "reject",
    ) => Promise<AppaloftWorkspaceCollaboration>;
  };
  readonly close: () => Promise<AppaloftWorkspaceCollaboration>;
}

type GeneratedSandboxes = GeneratedAppaloftClient["sandboxes"];

export type AppaloftClient = Omit<
  GeneratedAppaloftClient,
  "sandboxes" | "workspaceCollaborations" | "workspaces"
> & {
  readonly operations: GeneratedAppaloftClient;
  readonly sandboxes: Omit<GeneratedSandboxes, "create"> & {
    readonly create: (input: AppaloftSandboxCreateInput) => Promise<AppaloftSandbox>;
  };
  readonly workspaces: {
    readonly open: (input: AppaloftWorkspaceOpenInput) => Promise<AppaloftWorkspace>;
    readonly create: (input: AppaloftWorkspaceCreateInput) => Promise<AppaloftWorkspace>;
    readonly list: (input?: AppaloftWorkspaceListInput) => Promise<AppaloftWorkspaceList>;
    readonly show: (workspaceId: string) => Promise<AppaloftWorkspaceDescriptor>;
  };
  readonly workspaceCollaborations: {
    readonly create: (
      input: AppaloftWorkspaceCollaborationCreateInput,
    ) => Promise<AppaloftWorkspaceCollaboration>;
    readonly list: () => Promise<{
      readonly schemaVersion?: string;
      readonly items: readonly AppaloftWorkspaceCollaboration[];
    }>;
    readonly show: (collaborationId: string) => Promise<AppaloftWorkspaceCollaboration>;
  };
};

export function createAppaloftClient(options: AppaloftClientOptions): AppaloftClient {
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
  const openWorkspace = async (input: AppaloftWorkspaceOpenInput): Promise<AppaloftWorkspace> => {
    const result = unwrapOperation<{
      readonly workspaceId: string;
      readonly resumed: boolean;
      readonly sandbox: AppaloftSandboxDescriptor;
      readonly agent: AppaloftAgentDescriptor;
      readonly attach?: Readonly<Record<string, unknown>>;
    }>(
      await operations.workspaces.open({
        ...input,
        repository: validateRepositoryLocator(input.repository),
      }),
    );
    const sandbox = createSandboxHandle(operations, result.sandbox);
    const agent = createAgentHandle(operations, result.workspaceId, result.agent);
    return {
      workspaceId: result.workspaceId,
      sandboxId: result.workspaceId,
      sandbox,
      agent,
      tasks: createAppaloftWorkspaceTasks(operations, result.workspaceId, agent.runtimeId),
      resumed: result.resumed,
      ...(result.attach ? { attach: result.attach } : {}),
      terminate: async <T>() => {
        await agent.terminate();
        return sandbox.terminate<T>();
      },
    };
  };
  const workspaces = {
    open: openWorkspace,
    create: async (input: AppaloftWorkspaceCreateInput): Promise<AppaloftWorkspace> => {
      if (input.profileInstallationId) {
        const source = input.source;
        if (!source?.repositoryIdentity || !source.ref || !source.branch || !source.commitSha) {
          throw new TypeError(
            "Profile-aware workspaces.create requires an exact Repository identity, ref, branch, and commit SHA",
          );
        }
        return openWorkspace({
          repository: source.repository,
          repositoryIdentity: source.repositoryIdentity,
          ref: source.ref,
          branch: source.branch,
          commitSha: source.commitSha,
          profile: input.profileInstallationId,
          forceNew: true,
          attach: false,
        });
      }
      if (!input.sandbox || !input.harness) {
        throw new TypeError(
          "workspaces.create requires a Profile with exact source context or both sandbox and harness",
        );
      }
      const source = input.source
        ? {
            ...input.source,
            repository: validateRepositoryLocator(input.source.repository),
          }
        : undefined;
      const resolvedSandbox = input.sandbox;
      if (!resolvedSandbox) {
        throw new TypeError("Agent Workspace Sandbox plan is unavailable");
      }
      const sandboxInput = source
        ? {
            ...resolvedSandbox,
            networkPolicy: {
              mode: "allowlist" as const,
              rules: mergeNetworkRules(
                resolvedSandbox.networkPolicy?.mode === "allowlist"
                  ? resolvedSandbox.networkPolicy.rules
                  : [],
                repositoryNetworkRules(source.repository),
              ),
            },
          }
        : resolvedSandbox;
      const sandbox = await sandboxes.create(sandboxInput);
      if (source) {
        try {
          await materializeWorkspaceSource(
            sandbox,
            source,
            options.workspaceSourceCredentialProvider,
          );
        } catch (error) {
          throw new AppaloftWorkspaceCreateError(
            sandbox.sandboxId,
            error,
            "source-materialization",
          );
        }
      }
      try {
        const harnessTemplateId = input.harnessTemplateId;
        const agent = await sandbox.agents.create({
          harness: input.harness,
          ...(harnessTemplateId ? { harnessTemplateId } : {}),
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        });
        return {
          workspaceId: sandbox.sandboxId,
          sandboxId: sandbox.sandboxId,
          sandbox,
          agent,
          tasks: createAppaloftWorkspaceTasks(operations, sandbox.sandboxId, agent.runtimeId),
          terminate: async <T>() => {
            await agent.terminate();
            return sandbox.terminate<T>();
          },
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
  const workspaceCollaborations = {
    create: async (
      input: AppaloftWorkspaceCollaborationCreateInput,
    ): Promise<AppaloftWorkspaceCollaboration> => {
      const descriptor = unwrapOperation<AppaloftWorkspaceCollaborationDescriptor>(
        await operations.workspaceCollaborations.create({
          name: input.name,
          workspaceId: input.workspaceId,
          lanePurpose: input.lanePurpose ?? "builder",
          laneLabel: input.laneLabel ?? "Builder",
          ...(input.branch ? { branch: input.branch } : {}),
        }),
      );
      return createWorkspaceCollaborationHandle(operations, descriptor);
    },
    list: async () => {
      const result = unwrapOperation<{
        readonly schemaVersion?: string;
        readonly items: readonly AppaloftWorkspaceCollaborationDescriptor[];
      }>(await operations.workspaceCollaborations.list({}));
      return {
        ...result,
        items: result.items.map((item) => createWorkspaceCollaborationHandle(operations, item)),
      };
    },
    show: async (collaborationId: string): Promise<AppaloftWorkspaceCollaboration> => {
      const descriptor = unwrapOperation<AppaloftWorkspaceCollaborationDescriptor>(
        await operations.workspaceCollaborations.show({ collaborationId }),
      );
      return createWorkspaceCollaborationHandle(operations, descriptor);
    },
  };

  return {
    ...operations,
    operations,
    sandboxes,
    workspaces,
    workspaceCollaborations,
  } as AppaloftClient;
}

function createWorkspaceCollaborationHandle(
  operations: GeneratedAppaloftClient,
  descriptor: AppaloftWorkspaceCollaborationDescriptor,
): AppaloftWorkspaceCollaboration {
  const collaborationId = requiredResourceId(descriptor.collaborationId, "collaborationId");
  const wrap = async (
    operation: Promise<AppaloftSdkOperationResult<unknown>>,
  ): Promise<AppaloftWorkspaceCollaboration> =>
    createWorkspaceCollaborationHandle(
      operations,
      unwrapOperation<AppaloftWorkspaceCollaborationDescriptor>(
        (await operation) as AppaloftSdkOperationResult<AppaloftWorkspaceCollaborationDescriptor>,
      ),
    );
  return {
    ...descriptor,
    collaborationId,
    refresh: async () =>
      createWorkspaceCollaborationHandle(
        operations,
        unwrapOperation<AppaloftWorkspaceCollaborationDescriptor>(
          await operations.workspaceCollaborations.show({ collaborationId }),
        ),
      ),
    participantsApi: {
      add: (input) =>
        wrap(
          operations.workspaceCollaborations.participants.add({
            collaborationId,
            ...input,
          }),
        ),
      changeRole: (participantId, role) =>
        wrap(
          operations.workspaceCollaborations.participants.changeRole({
            collaborationId,
            participantId,
            role,
          }),
        ),
      remove: (participantId) =>
        wrap(
          operations.workspaceCollaborations.participants.remove({
            collaborationId,
            participantId,
          }),
        ),
    },
    lanesApi: {
      add: (input) =>
        wrap(
          operations.workspaceCollaborations.lanes.add({
            collaborationId,
            ...input,
          }),
        ),
      archive: (laneId) =>
        wrap(
          operations.workspaceCollaborations.lanes.archive({
            collaborationId,
            laneId,
          }),
        ),
      authorize: async (input) =>
        unwrapOperation<Readonly<Record<string, unknown>>>(
          await operations.workspaceCollaborations.lanes.authorizeAccess({
            collaborationId,
            ...input,
          }),
        ),
      issueTerminalAccess: async (input) =>
        unwrapOperation<Readonly<Record<string, unknown>>>(
          await operations.workspaceCollaborations.lanes.terminalAccess.issue({
            collaborationId,
            ...input,
          }),
        ),
      issueNativeAttach: async (input) =>
        unwrapOperation<Readonly<Record<string, unknown>>>(
          await operations.workspaceCollaborations.lanes.nativeAttach.issue({
            collaborationId,
            ...input,
          }),
        ),
    },
    writerLeases: {
      acquire: (laneId, expiresAt) =>
        wrap(
          operations.workspaceCollaborations.writerLeases.acquire({
            collaborationId,
            laneId,
            expiresAt,
          }),
        ),
      renew: (laneId, expectedGeneration, expiresAt) =>
        wrap(
          operations.workspaceCollaborations.writerLeases.renew({
            collaborationId,
            laneId,
            expectedGeneration,
            expiresAt,
          }),
        ),
      release: (laneId, expectedGeneration) =>
        wrap(
          operations.workspaceCollaborations.writerLeases.release({
            collaborationId,
            laneId,
            expectedGeneration,
          }),
        ),
      transfer: (input) =>
        wrap(
          operations.workspaceCollaborations.writerLeases.transfer({
            collaborationId,
            ...input,
          }),
        ),
    },
    handoffsApi: {
      offer: (input) =>
        wrap(
          operations.workspaceCollaborations.handoffs.offer({
            collaborationId,
            ...input,
          }),
        ),
      resolve: (handoffId, decision) =>
        wrap(
          operations.workspaceCollaborations.handoffs.resolve({
            collaborationId,
            handoffId,
            decision,
          }),
        ),
    },
    close: () => wrap(operations.workspaceCollaborations.close({ collaborationId })),
  };
}

export function createAppaloftWorkspaceTasks(
  operations: GeneratedAppaloftClient,
  workspaceId: string,
  runtimeId: string,
): AppaloftWorkspaceTasks {
  const unwrapTask = async <T>(
    operation: Promise<AppaloftSdkOperationResult<unknown>>,
  ): Promise<T> => unwrapOperation<T>((await operation) as AppaloftSdkOperationResult<T>);

  return {
    run: (input) =>
      unwrapTask<AppaloftAgentTaskResult>(
        operations.sandboxes.agentTasks.create({
          workspaceId,
          runtimeId,
          task: input.task,
          runContext: input.context ?? { mode: "fresh" },
          idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
          checks:
            input.checks?.map((check) => ({
              name: check.name,
              argv: [...check.argv],
              required: check.required !== false,
            })) ?? [],
          ...(input.preview
            ? {
                preview: {
                  startArgv: [...input.preview.startArgv],
                  port: input.preview.port,
                  visibility: input.preview.visibility ?? "private",
                  ...(input.preview.expiresAt ? { expiresAt: input.preview.expiresAt } : {}),
                },
              }
            : {}),
          immutableReview: input.immutableReview === true,
          sourceRoot: input.sourceRoot?.trim() || ".",
        }),
      ),
    list: () =>
      unwrapTask<{ readonly items: readonly AppaloftAgentTaskResult[] }>(
        operations.sandboxes.agentTasks.list({ workspaceId, runtimeId }),
      ),
    show: (taskRunId) =>
      unwrapTask<AppaloftAgentTaskResult>(
        operations.sandboxes.agentTasks.show({ workspaceId, taskRunId }),
      ),
    resume: (taskRunId) =>
      unwrapTask<AppaloftAgentTaskResult>(
        operations.sandboxes.agentTasks.resume({ workspaceId, taskRunId }),
      ),
    cancel: (taskRunId) =>
      unwrapTask<AppaloftAgentTaskResult>(
        operations.sandboxes.agentTasks.cancel({ workspaceId, taskRunId }),
      ),
    approve: (taskRunId) =>
      unwrapTask<AppaloftAgentTaskResult>(
        operations.sandboxes.agentTasks.approve({ workspaceId, taskRunId }),
      ),
    deliver: (taskRunId, input) =>
      unwrapTask<AppaloftAgentTaskResult>(
        operations.sandboxes.agentTasks.deliver({
          workspaceId,
          taskRunId,
          branch: input.branch,
          commitMessage: input.commitMessage,
          remote: input.remote ?? "origin",
          ...(input.pullRequest ? { pullRequest: input.pullRequest } : {}),
        }),
      ),
  };
}

function validateRepositoryLocator(value: string): string {
  const repository = value.trim();
  if (
    !repository ||
    repository.length > 2_048 ||
    repository.includes("\0") ||
    repository.startsWith("-") ||
    /[\r\n]/u.test(repository)
  ) {
    throw new TypeError("Workspace repository locator is invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(repository);
  } catch {
    throw new TypeError("Workspace repository must use HTTPS");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname === "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError("Workspace repository must use credential-free HTTPS");
  }
  return repository;
}

function repositoryNetworkRules(repository: string) {
  const host = new URL(repository).hostname.toLowerCase();
  return [
    { kind: "domain" as const, value: host, ports: [443] },
    ...(host === "github.com"
      ? [{ kind: "domain" as const, value: "api.github.com", ports: [443] }]
      : []),
  ];
}

function mergeNetworkRules(
  existing: readonly { kind: "domain" | "cidr"; value: string; ports: readonly number[] }[],
  required: readonly { kind: "domain" | "cidr"; value: string; ports: readonly number[] }[],
) {
  const result = new Map<string, { kind: "domain" | "cidr"; value: string; ports: number[] }>();
  for (const rule of [...existing, ...required]) {
    const key = `${rule.kind}:${rule.value.toLowerCase()}`;
    const current = result.get(key);
    result.set(key, {
      kind: rule.kind,
      value: rule.value.toLowerCase(),
      ports: [...new Set([...(current?.ports ?? []), ...rule.ports])].sort(
        (left, right) => left - right,
      ),
    });
  }
  return [...result.values()];
}

function validateGitRef(value: string | undefined, label: string): string | undefined {
  const ref = value?.trim();
  if (!ref) return undefined;
  if (
    ref.length > 512 ||
    ref.startsWith("-") ||
    ref.includes("\0") ||
    /[\s~^:?*[\\]/u.test(ref) ||
    ref.includes("..") ||
    ref.endsWith(".") ||
    ref.endsWith("/")
  ) {
    throw new TypeError(`Workspace ${label} is invalid`);
  }
  return ref;
}

interface WorkspaceForegroundExecResult {
  readonly mode: "foreground";
  readonly frames: readonly (
    | { readonly kind: "stdout" | "stderr"; readonly data: string }
    | { readonly kind: "exit"; readonly exitCode: number }
  )[];
}

function requireSuccessfulExec(value: unknown, phase: string): WorkspaceForegroundExecResult {
  if (!value || typeof value !== "object" || (value as { mode?: unknown }).mode !== "foreground") {
    throw new Error(`${phase} did not return a foreground result`);
  }
  const result = value as WorkspaceForegroundExecResult;
  const exit = result.frames.find(
    (frame): frame is Extract<(typeof result.frames)[number], { kind: "exit" }> =>
      frame.kind === "exit",
  );
  if (exit?.exitCode !== 0) {
    const stderr = result.frames
      .flatMap((frame) => (frame.kind === "stderr" ? [frame.data] : []))
      .join("")
      .slice(0, 1_024);
    throw new Error(stderr || `${phase} failed`);
  }
  return result;
}

async function materializeWorkspaceSource(
  sandbox: AppaloftSandbox,
  input: NonNullable<AppaloftWorkspaceCreateInput["source"]>,
  credentialProvider?: AppaloftWorkspaceSourceCredentialProvider,
): Promise<void> {
  const repository = validateRepositoryLocator(input.repository);
  const ref = validateGitRef(input.ref, "source ref");
  const branch = validateGitRef(input.branch, "branch");
  const credential = credentialProvider
    ? validateWorkspaceSourceCredential(await credentialProvider({ repository }))
    : null;
  const execGit = (argv: readonly string[], authenticated = false) =>
    credential && authenticated
      ? sandbox.exec<unknown>(authenticatedWorkspaceSourceGitExec(repository, credential, argv))
      : sandbox.exec<unknown>({ argv });

  const initialized = await execGit(["git", "init"]);
  requireSuccessfulExec(initialized, "Workspace repository initialization");

  const remoteAdded = await execGit(["git", "remote", "add", "origin", repository]);
  requireSuccessfulExec(remoteAdded, "Workspace repository remote configuration");

  const fetched = await execGit(["git", "fetch", "origin"], true);
  requireSuccessfulExec(fetched, "Workspace repository fetch");

  let checkoutRef = ref;
  if (!checkoutRef) {
    const remoteHeadSet = await execGit(["git", "remote", "set-head", "origin", "--auto"], true);
    requireSuccessfulExec(remoteHeadSet, "Workspace repository default branch discovery");
    const remoteHeadRead = await execGit([
      "git",
      "symbolic-ref",
      "--short",
      "refs/remotes/origin/HEAD",
    ]);
    const remoteHeadOutput = requireSuccessfulExec(
      remoteHeadRead,
      "Workspace repository default branch readback",
    )
      .frames.flatMap((frame) => (frame.kind === "stdout" ? [frame.data] : []))
      .join("")
      .trim();
    if (!remoteHeadOutput.startsWith("origin/")) {
      throw new Error("Workspace repository default branch readback was invalid");
    }
    checkoutRef = validateGitRef(
      remoteHeadOutput.slice("origin/".length),
      "repository default branch",
    );
    if (!checkoutRef) {
      throw new Error("Workspace repository default branch readback was empty");
    }
  }

  const checkedOut = await execGit(["git", "checkout", checkoutRef]);
  requireSuccessfulExec(checkedOut, "Workspace repository checkout");

  if (branch) {
    const switched = await execGit(["git", "switch", "-c", branch]);
    requireSuccessfulExec(switched, "Workspace branch creation");
  }
}

function validateWorkspaceSourceCredential(
  credential: AppaloftWorkspaceSourceHttpBasicCredential | null,
): AppaloftWorkspaceSourceHttpBasicCredential | null {
  if (!credential) return null;
  if (credential.kind !== "http-basic") {
    throw new TypeError("Workspace source credential kind is unsupported");
  }
  if (
    !credential.username ||
    credential.username.length > 256 ||
    /[:\r\n\0]/u.test(credential.username)
  ) {
    throw new TypeError("Workspace source credential username is invalid");
  }
  if (
    !credential.password ||
    credential.password.length > 4_096 ||
    /[\r\n\0]/u.test(credential.password)
  ) {
    throw new TypeError("Workspace source credential password is invalid");
  }
  return credential;
}

function authenticatedWorkspaceSourceGitExec(
  repository: string,
  credential: AppaloftWorkspaceSourceHttpBasicCredential,
  argv: readonly string[],
): AppaloftSandboxExecInput {
  if (argv[0] !== "git") {
    throw new TypeError("Authenticated Workspace source execution only supports Git");
  }
  const origin = new URL(repository).origin;
  const authorization = Buffer.from(
    `${credential.username}:${credential.password}`,
    "utf8",
  ).toString("base64");
  return {
    argv: [
      "sh",
      "-c",
      [
        "IFS= read -r APPALOFT_GIT_AUTHORIZATION || exit 90",
        '[ -n "$APPALOFT_GIT_AUTHORIZATION" ] || exit 90',
        'export GIT_CONFIG_COUNT="1"',
        'export GIT_CONFIG_KEY_0="$1"',
        'export GIT_CONFIG_VALUE_0="Authorization: Basic $APPALOFT_GIT_AUTHORIZATION"',
        'export GIT_TERMINAL_PROMPT="0"',
        'export GIT_TRACE_CURL="0"',
        'export GIT_CURL_VERBOSE="0"',
        "shift",
        'exec git "$@"',
      ].join("; "),
      "appaloft-workspace-source-auth",
      `http.${origin}/.extraHeader`,
      ...argv.slice(1),
    ],
    stdinBase64: Buffer.from(`${authorization}\n`, "utf8").toString("base64"),
  };
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
            ...(input.profileInstallationId
              ? { profileInstallationId: input.profileInstallationId }
              : {}),
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
    pause: async () =>
      createSandboxHandle(
        operations,
        unwrapOperation<AppaloftSandboxDescriptor>(
          await operations.sandboxes.pause<AppaloftSandboxDescriptor>({ sandboxId }),
        ),
      ),
    resume: async (input = {}) =>
      createSandboxHandle(
        operations,
        unwrapOperation<AppaloftSandboxDescriptor>(
          await operations.sandboxes.resume<AppaloftSandboxDescriptor>({
            sandboxId,
            ...(input.providerKey ? { providerKey: input.providerKey } : {}),
          }),
        ),
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
    attach: async (input = {}) =>
      unwrapOperation(
        await operations.sandboxes.agents.runtimes.attach({
          sandboxId,
          runtimeId,
          expiresAt: input.expiresAt ?? new Date(Date.now() + 60 * 60_000).toISOString(),
        }),
      ),
    terminate: async <T>() =>
      unwrapOperation<T>(
        await operations.sandboxes.agents.runtimes.terminate<T>({
          sandboxId,
          runtimeId,
        }),
      ),
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
