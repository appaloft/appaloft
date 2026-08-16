import { spawn } from "node:child_process";

import {
  AcquireWorkspaceWriterLeaseCommand,
  AddWorkspaceCollaborationLaneCommand,
  AddWorkspaceCollaborationParticipantCommand,
  ApproveAgentTaskRunCommand,
  ArchiveWorkspaceCollaborationLaneCommand,
  CancelAgentTaskRunCommand,
  ChangeWorkspaceCollaborationParticipantRoleCommand,
  CloseWorkspaceCollaborationCommand,
  CreateAgentTaskRunCommand,
  CreateWorkspaceCollaborationCommand,
  DeliverAgentTaskRunCommand,
  ExposeSandboxPortCommand,
  IssueSandboxAgentAttachAccessCommand,
  IssueWorkspaceCollaborationNativeAttachCommand,
  IssueWorkspaceCollaborationTerminalAccessCommand,
  ListAgentTaskRunsQuery,
  ListSandboxAgentHarnessesQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  ListServersQuery,
  ListWorkspaceCollaborationsQuery,
  OfferWorkspaceCollaborationHandoffCommand,
  OpenAgentWorkspaceCommand,
  OpenTerminalSessionCommand,
  PauseSandboxCommand,
  ReleaseWorkspaceWriterLeaseCommand,
  RemoveWorkspaceCollaborationParticipantCommand,
  RenewWorkspaceWriterLeaseCommand,
  ResolveWorkspaceCollaborationHandoffCommand,
  ResumeAgentTaskRunCommand,
  ResumeSandboxCommand,
  type SandboxAgentAttachDescriptor,
  ShowAgentTaskRunQuery,
  ShowRepositoryBindingQuery,
  ShowSandboxQuery,
  ShowTerminalSessionQuery,
  ShowWorkspaceCollaborationQuery,
  SteerAgentTaskRunCommand,
  StopAgentTaskRunCommand,
  TransferWorkspaceWriterLeaseCommand,
  type WorkspaceOpenResult,
} from "@appaloft/application";
import { createCliLogRenderer } from "@appaloft/cli-logging";
import { type DomainError, domainError } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";
import {
  resolveLocalGitWorkspaceContext,
  resolveRemoteGitWorkspaceRef,
} from "../local-git-workspace-context.js";
import {
  isolatedOpenCodeConfigHome,
  launchScratchAgent,
  resolveDefaultScratchHarness,
  resolveNativeOpenCodeAttachEnv,
  resolveScratchSession,
  SCRATCH_BANNER,
} from "../local-scratch-session.js";
import {
  formatRemoteCodeBanner,
  isRemoteCodeGitRemoteLocator,
  nativeAttachRequiresInteractiveTerminal,
  REMOTE_CODE_MODEL_HINT,
  resolveDefaultRemoteCodeDoor,
  scratchRemoteRejectedError,
} from "../remote-code-session.js";
import {
  attachTerminalSession,
  CliRuntime,
  optionalNumber,
  optionalValue,
  print,
  resultToEffect,
  runCommand,
  runQuery,
  runTerminalCommand,
} from "../runtime.js";
import { classifyWorkspaceHostTerminal } from "../workspace-control-terminal";
import { terminateWorkspaceWithRuntimes } from "../workspace-lifecycle-actions.js";
import { cliCommandDescriptions } from "./docs-help.js";

const workspaceId = Args.text({ name: "workspaceId" });
const terminalDirectory = Options.text("directory").pipe(Options.optional);
const terminalRows = Options.text("rows").pipe(Options.withDefault("24"));
const terminalCols = Options.text("cols").pipe(Options.withDefault("80"));
const attachTerminal = Options.boolean("attach").pipe(Options.withDefault(false));
const terminalSessionId = Options.text("session-id").pipe(Options.optional);
const collaborationId = Args.text({ name: "collaborationId" });
const collaborationLaneId = Options.text("lane-id");
const collaborationRole = Options.choice("role", [
  "owner",
  "editor",
  "reviewer",
  "viewer",
] as const);
const collaborationPurpose = Options.choice("purpose", [
  "builder",
  "reviewer",
  "tester",
  "custom",
] as const);

interface SandboxResult {
  readonly sandboxId: string;
  readonly status: string;
  readonly lastActivityAt?: string;
  readonly updatedAt?: string;
  readonly occupancy?: {
    readonly repositoryIdentity: string;
    readonly commitSha: string;
    readonly branch?: string;
  };
  readonly [key: string]: unknown;
}

interface AgentRuntimeResult {
  readonly runtimeId: string;
  readonly status?: string;
  readonly interaction?: {
    readonly transport?: string;
    readonly command?: readonly string[];
    readonly serverPort?: number;
  };
  readonly [key: string]: unknown;
}

interface SandboxListResult {
  readonly items: readonly SandboxResult[];
  readonly [key: string]: unknown;
}

interface AgentRuntimeListResult {
  readonly items: readonly AgentRuntimeResult[];
}

function requireOption(value: string | undefined, label: string): string {
  if (value?.trim()) return value.trim();
  throw domainError.validation(`${label} is required`);
}

function workspaceCliError(error: unknown, phase: string): DomainError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "category" in error &&
    "message" in error &&
    "retryable" in error
  ) {
    return error as DomainError;
  }
  return domainError.infra("Workspace CLI operation failed", {
    phase,
    message: error instanceof Error ? error.message : String(error),
  });
}

function launchNativeWorkspaceClient(argv: readonly string[]): Promise<void> {
  if (
    argv.length === 0 ||
    argv.length > 64 ||
    argv.some(
      (argument) =>
        !argument || argument.length > 2_048 || argument.includes("\0") || /[\r\n]/u.test(argument),
    )
  ) {
    return Promise.reject(
      domainError.conflict("Adapter returned an invalid native attach handoff", {
        code: "agent_workspace_native_attach_handoff_invalid",
      }),
    );
  }
  if (!nativeAttachRequiresInteractiveTerminal()) {
    return Promise.reject(
      domainError.conflict("Native Agent attach requires an interactive terminal", {
        code: "agent_workspace_native_attach_tty_required",
        recovery: "Run appaloft code from a TTY, or use --no-attach.",
      }),
    );
  }
  return new Promise((resolve, reject) => {
    const attachEnv = resolveNativeOpenCodeAttachEnv();
    const child = spawn(argv[0] as string, argv.slice(1), {
      stdio: "inherit",
      shell: false,
      ...(attachEnv ? { env: { ...process.env, ...attachEnv } } : {}),
    });
    child.once("error", (error) => reject(error));
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        domainError.conflict("Native Agent client exited before attach completed", {
          code: "agent_workspace_native_attach_client_failed",
          exitCode: code ?? -1,
          signal: signal ?? "unknown",
        }),
      );
    });
  });
}

function completeWorkspaceOpen(
  result: WorkspaceOpenResult,
  attach: boolean,
  launchNativeClient: (argv: readonly string[]) => Promise<void> = launchNativeWorkspaceClient,
) {
  if (!attach) return print(result);
  if (!result.attach) {
    return Effect.fail(
      domainError.conflict("Workspace Agent does not declare a supported attach capability", {
        code: "agent_workspace_attach_unsupported",
        workspaceId: result.workspaceId,
      }),
    );
  }
  if (result.attach.transport === "managed-terminal") {
    return attachTerminalSession(
      ShowTerminalSessionQuery.create({ sessionId: result.attach.sessionId }),
      {
        initialRows: 24,
        initialCols: 80,
      },
    );
  }
  if (result.attach.clientHandoff === "display-only") {
    return print({
      ...result,
      handoff: {
        mode: "display-only",
        clientCommand: result.attach.clientCommand,
      },
    });
  }
  const clientCommand = result.attach.clientCommand;
  return Effect.tryPromise({
    try: () => launchNativeClient(clientCommand),
    catch: (error) => workspaceCliError(error, "workspace-native-client-handoff"),
  });
}

const create = EffectCommand.make(
  "create",
  {
    profile: Options.text("profile"),
    repository: Options.text("repo"),
    ref: Options.text("ref"),
    branch: Options.text("branch"),
    attach: Options.boolean("attach").pipe(Options.withDefault(false)),
  },
  ({ attach, branch, profile, ref, repository }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const source = yield* Effect.tryPromise({
        try: () =>
          (cli.resolveRemoteWorkspaceGitRef ?? resolveCreateWorkspaceGitRef)(repository, ref),
        catch: (error) => workspaceCliError(error, "workspace-create-git-ref"),
      });
      const command = yield* resultToEffect(
        OpenAgentWorkspaceCommand.create({
          repository: source.credentialFreeHttpsRepository,
          repositoryIdentity: source.repositoryIdentity,
          ref: source.ref,
          branch,
          commitSha: source.commitSha,
          profile,
          forceNew: true,
          attach,
        }),
      );
      const result = yield* resultToEffect(
        yield* Effect.promise(() => cli.executeCommand(command)),
      );
      yield* completeWorkspaceOpen(result, attach, cli.launchNativeWorkspaceClient);
    }),
).pipe(
  EffectCommand.withDescription(
    "Create a Profile-aware Agent Workspace from an exact remote Git ref",
  ),
);

function reportWorkspaceGitProgress(message: string): void {
  createCliLogRenderer().plain({ level: "info", message });
}

function resolveOpenWorkspaceGitContext(path: string) {
  return resolveLocalGitWorkspaceContext(path, undefined, {
    onProgress: reportWorkspaceGitProgress,
  });
}

function resolveCreateWorkspaceGitRef(repository: string, ref: string) {
  return resolveRemoteGitWorkspaceRef(repository, ref, undefined, {
    onProgress: reportWorkspaceGitProgress,
  });
}

function makeWorkspaceOpenCommand() {
  return EffectCommand.make(
    "open",
    {
      path: Args.text({ name: "path" }).pipe(Args.withDefault(".")),
      profile: Options.text("profile").pipe(Options.optional),
      forceNew: Options.boolean("new").pipe(Options.withDefault(false)),
      noAttach: Options.boolean("no-attach").pipe(Options.withDefault(false)),
    },
    ({ forceNew, noAttach, path, profile }) =>
      Effect.gen(function* () {
        const cli = yield* CliRuntime;
        const source = yield* Effect.tryPromise({
          try: () => (cli.resolveLocalWorkspaceGitContext ?? resolveOpenWorkspaceGitContext)(path),
          catch: (error) => workspaceCliError(error, "workspace-open-git-context"),
        });
        const attach = !noAttach;
        const command = yield* resultToEffect(
          OpenAgentWorkspaceCommand.create({
            repository: source.credentialFreeHttpsRepository,
            repositoryIdentity: source.repositoryIdentity,
            ref: source.ref,
            branch: source.branch,
            commitSha: source.headSha,
            ...(optionalValue(profile) ? { profile: optionalValue(profile) } : {}),
            forceNew,
            attach,
          }),
        );
        const result = yield* resultToEffect(
          yield* Effect.promise(() => cli.executeCommand(command)),
        );
        yield* completeWorkspaceOpen(result, attach, cli.launchNativeWorkspaceClient);
      }),
  ).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentWorkspaceOpen));
}

const open = makeWorkspaceOpenCommand();

export const workspaceCodeCommand = EffectCommand.make(
  "code",
  {
    path: Args.text({ name: "path" }).pipe(Args.withDefault(".")),
    noAttach: Options.boolean("no-attach").pipe(Options.withDefault(false)),
    local: Options.boolean("local").pipe(Options.withDefault(false)),
    forceNew: Options.boolean("new").pipe(Options.withDefault(false)),
  },
  ({ forceNew, local, noAttach, path }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      if (local) {
        if (isRemoteCodeGitRemoteLocator(path)) {
          return yield* Effect.fail(scratchRemoteRejectedError());
        }
        const session = yield* Effect.tryPromise({
          try: () =>
            resolveScratchSession(path, cli.resolveScratchHarness ?? resolveDefaultScratchHarness),
          catch: (error) => workspaceCliError(error, "scratch-harness"),
        });
        process.stdout.write(`${SCRATCH_BANNER}\n`);
        process.stdout.write(
          `${session.harness.name}${session.harness.skillOffered ? " · Appaloft skill offered" : ""}\n`,
        );
        if (noAttach) return;
        const launch = cli.launchScratchAgent ?? launchScratchAgent;
        yield* Effect.tryPromise({
          try: () =>
            launch({
              argv: session.harness.argv,
              cwd: session.path,
              ...(session.harness.env ? { env: session.harness.env } : {}),
            }),
          catch: (error) => workspaceCliError(error, "scratch-harness"),
        });
        return;
      }

      const door = yield* Effect.tryPromise({
        try: () =>
          (
            cli.resolveRemoteCodeDoor ??
            ((selectedPath?: string) =>
              resolveDefaultRemoteCodeDoor(
                {
                  ...(cli.environment ? { env: cli.environment } : {}),
                  localComposition: cli.executionTarget !== "remote",
                  forceNew,
                  listServers: async () => {
                    const query = ListServersQuery.create();
                    if (query.isErr()) throw query.error;
                    const listed = await cli.executeQuery(query.value);
                    if (listed.isErr()) throw listed.error;
                    return listed.value.items;
                  },
                  listOccupancies: async () => {
                    const query = ListSandboxesQuery.create({ limit: 100, offset: 0 });
                    if (query.isErr()) throw query.error;
                    const listed = await cli.executeQuery(query.value);
                    if (listed.isErr()) throw listed.error;
                    const items = (listed.value as SandboxListResult).items;
                    return items.map((item) => ({
                      sandboxId: item.sandboxId,
                      status: item.status,
                      ...(typeof item.lastActivityAt === "string"
                        ? { lastActivityAt: item.lastActivityAt }
                        : {}),
                      ...(typeof item.updatedAt === "string" ? { updatedAt: item.updatedAt } : {}),
                      ...(item.occupancy &&
                      typeof item.occupancy === "object" &&
                      typeof item.occupancy.repositoryIdentity === "string" &&
                      typeof item.occupancy.commitSha === "string"
                        ? {
                            occupancy: {
                              repositoryIdentity: item.occupancy.repositoryIdentity,
                              commitSha: item.occupancy.commitSha,
                              ...(typeof item.occupancy.branch === "string"
                                ? { branch: item.occupancy.branch }
                                : {}),
                            },
                          }
                        : {}),
                    }));
                  },
                  showBinding: async (repositoryIdentity) => {
                    const query = ShowRepositoryBindingQuery.create({ repositoryIdentity });
                    if (query.isErr()) throw query.error;
                    const shown = await cli.executeQuery(query.value);
                    if (shown.isErr()) return null;
                    return shown.value;
                  },
                  ...(cli.resolveRemoteWorkspaceGitRef
                    ? { resolveRemoteRef: cli.resolveRemoteWorkspaceGitRef }
                    : {}),
                },
                selectedPath ?? ".",
              ))
          )(path),
        catch: (error) => workspaceCliError(error, "remote-code-door"),
      });
      const attach = !noAttach;
      const openInput = {
        repository: door.repository,
        repositoryIdentity: door.repositoryIdentity,
        ref: door.ref,
        branch: door.branch,
        commitSha: door.commitSha,
        targetServerId: door.serverId,
        attach,
        forceNew,
      };
      const command = yield* resultToEffect(OpenAgentWorkspaceCommand.create(openInput));
      const opened = yield* Effect.promise(() => cli.executeCommand(command));
      let result: WorkspaceOpenResult;
      let bannerCommitSha = door.commitSha;
      if (opened.isOk()) {
        result = opened.value;
      } else {
        const details = opened.error.details;
        const pinnedSha =
          !forceNew &&
          details?.code === "workspace_open_source_pin_mismatch" &&
          typeof details.workspaceCommitSha === "string"
            ? details.workspaceCommitSha
            : undefined;
        if (!pinnedSha) return yield* Effect.fail(opened.error);
        const retry = yield* resultToEffect(
          OpenAgentWorkspaceCommand.create({
            ...openInput,
            commitSha: pinnedSha,
            forceNew: false,
          }),
        );
        result = yield* resultToEffect(yield* Effect.promise(() => cli.executeCommand(retry)));
        bannerCommitSha = pinnedSha;
        const workspaceId =
          typeof details?.workspaceId === "string" ? details.workspaceId : result.workspaceId;
        process.stdout.write(
          `Pinned · ${workspaceId} @ ${pinnedSha.slice(0, 7)} · requested ${door.commitSha.slice(0, 7)} · use --new for an isolated Workspace\n`,
        );
      }
      process.stdout.write(
        `${formatRemoteCodeBanner({
          projectId: result.projectId || door.projectId,
          repositoryIdentity: door.repositoryIdentity,
          commitSha: bannerCommitSha,
          serverName: door.serverName,
          workspaceId: result.workspaceId,
        })}\n`,
      );
      process.stdout.write(`${REMOTE_CODE_MODEL_HINT}\n`);
      if (!attach) return;
      yield* completeWorkspaceOpen(result, true, cli.launchNativeWorkspaceClient);
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentScratch));

const list = EffectCommand.make(
  "list",
  {
    limit: Options.text("limit").pipe(Options.optional),
    offset: Options.text("offset").pipe(Options.optional),
  },
  ({ limit, offset }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const query = yield* resultToEffect(
        ListSandboxesQuery.create({
          ...(optionalNumber(limit) !== undefined ? { limit: optionalNumber(limit) } : {}),
          ...(optionalNumber(offset) !== undefined ? { offset: optionalNumber(offset) } : {}),
        }),
      );
      const sandboxList = (yield* resultToEffect(
        yield* Effect.promise(() => cli.executeQuery(query)),
      )) as SandboxListResult;
      const items = yield* Effect.all(
        sandboxList.items.map((sandbox) =>
          Effect.gen(function* () {
            const runtimeQuery = yield* resultToEffect(
              ListSandboxAgentRuntimesQuery.create({ sandboxId: sandbox.sandboxId }),
            );
            const agents = (yield* resultToEffect(
              yield* Effect.promise(() => cli.executeQuery(runtimeQuery)),
            )) as AgentRuntimeListResult;
            return {
              workspaceId: sandbox.sandboxId,
              sandbox,
              agents: agents.items,
            };
          }),
        ),
        { concurrency: 8 },
      );
      yield* print({ ...sandboxList, items });
    }),
).pipe(EffectCommand.withDescription("List public Agent Workspaces"));

const show = EffectCommand.make("show", { workspaceId }, ({ workspaceId }) =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const sandboxQuery = yield* resultToEffect(ShowSandboxQuery.create({ sandboxId: workspaceId }));
    const runtimeQuery = yield* resultToEffect(
      ListSandboxAgentRuntimesQuery.create({ sandboxId: workspaceId }),
    );
    const [sandbox, agents] = yield* Effect.all(
      [
        Effect.promise(() => cli.executeQuery(sandboxQuery)).pipe(Effect.flatMap(resultToEffect)),
        Effect.promise(() => cli.executeQuery(runtimeQuery)).pipe(Effect.flatMap(resultToEffect)),
      ],
      { concurrency: 2 },
    );
    yield* print({
      workspaceId,
      sandbox,
      agents: (agents as AgentRuntimeListResult).items,
    });
  }),
);

const pause = EffectCommand.make("pause", { workspaceId }, ({ workspaceId }) =>
  runCommand(PauseSandboxCommand.create({ sandboxId: workspaceId })),
);
const resume = EffectCommand.make("resume", { workspaceId }, ({ workspaceId }) =>
  runCommand(ResumeSandboxCommand.create({ sandboxId: workspaceId })),
);
const terminate = EffectCommand.make("terminate", { workspaceId }, ({ workspaceId }) =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const result = yield* resultToEffect(
      yield* Effect.promise(() => terminateWorkspaceWithRuntimes(cli, workspaceId)),
    );
    yield* print(result);
  }),
);

const terminal = EffectCommand.make(
  "terminal",
  {
    workspaceId,
    directory: terminalDirectory,
    rows: terminalRows,
    cols: terminalCols,
    attach: attachTerminal,
  },
  ({ attach, cols, directory, rows, workspaceId }) =>
    runTerminalCommand(
      OpenTerminalSessionCommand.create({
        scope: { kind: "sandbox", sandboxId: workspaceId },
        ...(optionalValue(directory) ? { relativeDirectory: optionalValue(directory) } : {}),
        initialRows: Number(rows),
        initialCols: Number(cols),
      }),
      {
        attach,
        initialRows: Number(rows),
        initialCols: Number(cols),
      },
    ),
);

const connect = EffectCommand.make(
  "connect",
  {
    workspaceId,
    directory: terminalDirectory,
    rows: terminalRows,
    cols: terminalCols,
    sessionId: terminalSessionId,
  },
  ({ cols, directory, rows, sessionId, workspaceId }) => {
    const existingSessionId = optionalValue(sessionId);
    return existingSessionId
      ? attachTerminalSession(ShowTerminalSessionQuery.create({ sessionId: existingSessionId }), {
          initialRows: Number(rows),
          initialCols: Number(cols),
        })
      : runTerminalCommand(
          OpenTerminalSessionCommand.create({
            scope: { kind: "sandbox", sandboxId: workspaceId },
            ...(optionalValue(directory) ? { relativeDirectory: optionalValue(directory) } : {}),
            initialRows: Number(rows),
            initialCols: Number(cols),
          }),
          {
            attach: true,
            initialRows: Number(rows),
            initialCols: Number(cols),
          },
        );
  },
).pipe(
  EffectCommand.withDescription(
    "Connect to a Workspace through the managed terminal gateway without host SSH credentials",
  ),
);

const nativeAttach = EffectCommand.make(
  "attach",
  {
    workspaceId,
    expiresAt: Options.text("expires-at").pipe(Options.optional),
    noAttach: Options.boolean("no-attach").pipe(Options.withDefault(false)),
  },
  ({ expiresAt, noAttach, workspaceId }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const runtimeQuery = yield* resultToEffect(
        ListSandboxAgentRuntimesQuery.create({ sandboxId: workspaceId }),
      );
      const runtimes = (yield* resultToEffect(
        yield* Effect.promise(() => cli.executeQuery(runtimeQuery)),
      )) as AgentRuntimeListResult;
      const runtime = runtimes.items.find(
        (candidate) =>
          candidate.interaction?.transport === "managed-terminal" ||
          (candidate.interaction?.transport === "native-attach" &&
            Number.isInteger(candidate.interaction.serverPort)),
      );
      if (!runtime?.interaction) {
        throw domainError.conflict("Workspace Runtime does not support Agent attach", {
          code: "agent_workspace_attach_unavailable",
          workspaceId,
        });
      }
      const defaultExpiry = new Date(Date.now() + 60 * 60_000).toISOString();
      const command = yield* resultToEffect(
        IssueSandboxAgentAttachAccessCommand.create({
          sandboxId: workspaceId,
          runtimeId: runtime.runtimeId,
          expiresAt: optionalValue(expiresAt) ?? defaultExpiry,
        }),
      );
      const issued = yield* resultToEffect(
        yield* Effect.promise(() => cli.executeCommand(command)),
      );
      const access = issued as SandboxAgentAttachDescriptor;
      if (noAttach) {
        yield* print(access);
        return;
      }
      process.stdout.write(`${REMOTE_CODE_MODEL_HINT}\n`);
      if (access.transport === "managed-terminal") {
        yield* attachTerminalSession(
          ShowTerminalSessionQuery.create({ sessionId: access.sessionId }),
          {
            initialRows: 24,
            initialCols: 80,
          },
        );
        return;
      }
      if (access.clientHandoff === "display-only") {
        yield* print(access);
        return;
      }
      yield* Effect.tryPromise({
        try: () =>
          (cli.launchNativeWorkspaceClient ?? launchNativeWorkspaceClient)(access.clientCommand),
        catch: (error) => workspaceCliError(error, "workspace-native-client-handoff"),
      });
    }),
).pipe(
  EffectCommand.withDescription(
    "Attach through the Agent-owned managed terminal or a scoped native client",
  ),
);

const preview = EffectCommand.make(
  "preview",
  {
    workspaceId,
    port: Options.integer("port"),
    visibility: Options.choice("visibility", ["private", "organization", "public"] as const).pipe(
      Options.withDefault("private"),
    ),
    expiresAt: Options.text("expires-at").pipe(Options.optional),
  },
  ({ expiresAt, port, visibility, workspaceId }) =>
    runCommand(
      ExposeSandboxPortCommand.create({
        sandboxId: workspaceId,
        port,
        visibility,
        ...(optionalValue(expiresAt) ? { expiresAt: optionalValue(expiresAt) } : {}),
      }),
    ),
);

const taskRuntimeId = Options.text("runtime-id");
const taskRunId = Args.text({ name: "taskRunId" });
const taskRun = EffectCommand.make(
  "run",
  {
    workspaceId,
    runtimeId: taskRuntimeId,
    task: Options.text("task"),
    continueFrom: Options.text("continue-from").pipe(Options.optional),
    idempotencyKey: Options.text("idempotency-key").pipe(Options.optional),
    checkArg: Options.text("check-arg").pipe(Options.repeated),
    previewStartArg: Options.text("preview-start-arg").pipe(Options.repeated),
    previewPort: Options.integer("preview-port").pipe(Options.optional),
    previewVisibility: Options.choice("preview-visibility", [
      "private",
      "organization",
      "public",
    ] as const).pipe(Options.withDefault("private")),
    previewExpiresAt: Options.text("preview-expires-at").pipe(Options.optional),
    immutableReview: Options.boolean("immutable-review").pipe(Options.withDefault(false)),
    sourceRoot: Options.text("source-root").pipe(Options.withDefault(".")),
  },
  ({
    checkArg,
    continueFrom,
    idempotencyKey,
    immutableReview,
    previewExpiresAt,
    previewPort,
    previewStartArg,
    previewVisibility,
    runtimeId,
    sourceRoot,
    task,
    workspaceId,
  }) =>
    runCommand(
      CreateAgentTaskRunCommand.create({
        workspaceId,
        runtimeId,
        task,
        runContext: optionalValue(continueFrom)
          ? { mode: "continue", parentRunId: optionalValue(continueFrom) }
          : { mode: "fresh" },
        idempotencyKey: optionalValue(idempotencyKey) ?? crypto.randomUUID(),
        checks: checkArg.length ? [{ name: "check", argv: [...checkArg], required: true }] : [],
        ...(optionalValue(previewPort) !== undefined && previewStartArg.length
          ? {
              preview: {
                startArgv: [...previewStartArg],
                port: optionalValue(previewPort),
                visibility: previewVisibility,
                ...(optionalValue(previewExpiresAt)
                  ? { expiresAt: optionalValue(previewExpiresAt) }
                  : {}),
              },
            }
          : {}),
        immutableReview,
        sourceRoot,
      }),
    ),
).pipe(
  EffectCommand.withDescription(
    "Submit a durable Agent task with checks, Git evidence and optional preview",
  ),
);

const taskList = EffectCommand.make(
  "list",
  { workspaceId, runtimeId: taskRuntimeId },
  ({ runtimeId, workspaceId }) =>
    runQuery(ListAgentTaskRunsQuery.create({ workspaceId, runtimeId })),
);

const taskShow = EffectCommand.make(
  "show",
  { workspaceId, taskRunId },
  ({ taskRunId, workspaceId }) =>
    runQuery(ShowAgentTaskRunQuery.create({ workspaceId, taskRunId })),
);

const taskResume = EffectCommand.make(
  "resume",
  { workspaceId, taskRunId },
  ({ taskRunId, workspaceId }) =>
    runCommand(ResumeAgentTaskRunCommand.create({ workspaceId, taskRunId })),
);

const taskStop = EffectCommand.make(
  "stop",
  { workspaceId, taskRunId },
  ({ taskRunId, workspaceId }) =>
    runCommand(StopAgentTaskRunCommand.create({ workspaceId, taskRunId })),
);

const taskSteer = EffectCommand.make(
  "steer",
  {
    workspaceId,
    taskRunId,
    instruction: Options.text("instruction"),
  },
  ({ instruction, taskRunId, workspaceId }) =>
    runCommand(SteerAgentTaskRunCommand.create({ workspaceId, taskRunId, instruction })),
);

const taskCancel = EffectCommand.make(
  "cancel",
  { workspaceId, taskRunId },
  ({ taskRunId, workspaceId }) =>
    runCommand(CancelAgentTaskRunCommand.create({ workspaceId, taskRunId })),
);

const taskApprove = EffectCommand.make(
  "approve",
  { workspaceId, taskRunId },
  ({ taskRunId, workspaceId }) =>
    runCommand(ApproveAgentTaskRunCommand.create({ workspaceId, taskRunId })),
);

const taskDeliver = EffectCommand.make(
  "deliver",
  {
    workspaceId,
    taskRunId,
    commitMessage: Options.text("commit-message"),
    branch: Options.text("branch"),
    remote: Options.text("remote").pipe(Options.withDefault("origin")),
    pullRequestTitle: Options.text("pull-request-title").pipe(Options.optional),
    pullRequestBody: Options.text("pull-request-body").pipe(Options.optional),
    pullRequestBase: Options.text("pull-request-base").pipe(Options.optional),
  },
  ({
    branch,
    commitMessage,
    pullRequestBase,
    pullRequestBody,
    pullRequestTitle,
    remote,
    taskRunId,
    workspaceId,
  }) =>
    runCommand(
      DeliverAgentTaskRunCommand.create({
        workspaceId,
        taskRunId,
        branch,
        commitMessage,
        remote,
        ...(optionalValue(pullRequestTitle)
          ? {
              pullRequest: {
                provider: "github",
                title: optionalValue(pullRequestTitle),
                ...(optionalValue(pullRequestBody) ? { body: optionalValue(pullRequestBody) } : {}),
                ...(optionalValue(pullRequestBase) ? { base: optionalValue(pullRequestBase) } : {}),
              },
            }
          : {}),
      }),
    ),
);

const task = EffectCommand.make("task").pipe(
  EffectCommand.withDescription(
    "Run, inspect, resume, approve and deliver resumable Agent Task Runs",
  ),
  EffectCommand.withSubcommands([
    taskRun,
    taskList,
    taskShow,
    taskResume,
    taskStop,
    taskSteer,
    taskCancel,
    taskApprove,
    taskDeliver,
  ]),
);

const harnessList = EffectCommand.make("list", {}, () =>
  runQuery(ListSandboxAgentHarnessesQuery.create({})),
);

const harness = EffectCommand.make("harness").pipe(
  EffectCommand.withDescription("Inspect available public Agent adapters and capabilities"),
  EffectCommand.withSubcommands([harnessList]),
);

const collaborationCreate = EffectCommand.make(
  "create",
  {
    name: Options.text("name"),
    workspaceId: Options.text("workspace-id"),
    lanePurpose: Options.choice("lane-purpose", [
      "builder",
      "reviewer",
      "tester",
      "custom",
    ] as const).pipe(Options.withDefault("builder")),
    laneLabel: Options.text("lane-label").pipe(Options.withDefault("Builder")),
    branch: Options.text("branch").pipe(Options.optional),
  },
  ({ branch, laneLabel, lanePurpose, name, workspaceId }) =>
    runCommand(
      CreateWorkspaceCollaborationCommand.create({
        name,
        workspaceId,
        lanePurpose,
        laneLabel,
        ...(optionalValue(branch) ? { branch: optionalValue(branch) } : {}),
      }),
    ),
);

const collaborationList = EffectCommand.make("list", {}, () =>
  runQuery(ListWorkspaceCollaborationsQuery.create({})),
);

const collaborationShow = EffectCommand.make("show", { collaborationId }, ({ collaborationId }) =>
  runQuery(ShowWorkspaceCollaborationQuery.create({ collaborationId })),
);

const collaborationParticipantAdd = EffectCommand.make(
  "add",
  {
    collaborationId,
    subjectKind: Options.choice("subject-kind", ["user", "agent-runtime"] as const),
    subjectId: Options.text("subject-id").pipe(Options.optional),
    runtimeId: Options.text("runtime-id").pipe(Options.optional),
    workspaceId: Options.text("workspace-id").pipe(Options.optional),
    role: collaborationRole,
  },
  ({ collaborationId, role, runtimeId, subjectId, subjectKind, workspaceId }) => {
    const subject =
      subjectKind === "user"
        ? {
            kind: "user" as const,
            subjectId: requireOption(optionalValue(subjectId), "--subject-id"),
          }
        : {
            kind: "agent-runtime" as const,
            runtimeId: requireOption(optionalValue(runtimeId), "--runtime-id"),
            workspaceId: requireOption(optionalValue(workspaceId), "--workspace-id"),
          };
    return runCommand(
      AddWorkspaceCollaborationParticipantCommand.create({
        collaborationId,
        subject,
        role,
      }),
    );
  },
);

const collaborationParticipantRole = EffectCommand.make(
  "role",
  {
    collaborationId,
    participantId: Options.text("participant-id"),
    role: collaborationRole,
  },
  ({ collaborationId, participantId, role }) =>
    runCommand(
      ChangeWorkspaceCollaborationParticipantRoleCommand.create({
        collaborationId,
        participantId,
        role,
      }),
    ),
);

const collaborationParticipantRemove = EffectCommand.make(
  "remove",
  {
    collaborationId,
    participantId: Options.text("participant-id"),
  },
  ({ collaborationId, participantId }) =>
    runCommand(
      RemoveWorkspaceCollaborationParticipantCommand.create({
        collaborationId,
        participantId,
      }),
    ),
);

const collaborationParticipant = EffectCommand.make("participant").pipe(
  EffectCommand.withDescription("Manage user and Agent Runtime participants"),
  EffectCommand.withSubcommands([
    collaborationParticipantAdd,
    collaborationParticipantRole,
    collaborationParticipantRemove,
  ]),
);

const collaborationLaneAdd = EffectCommand.make(
  "add",
  {
    collaborationId,
    workspaceId: Options.text("workspace-id"),
    purpose: collaborationPurpose,
    label: Options.text("label"),
    branch: Options.text("branch").pipe(Options.optional),
  },
  ({ branch, collaborationId, label, purpose, workspaceId }) =>
    runCommand(
      AddWorkspaceCollaborationLaneCommand.create({
        collaborationId,
        workspaceId,
        purpose,
        label,
        ...(optionalValue(branch) ? { branch: optionalValue(branch) } : {}),
      }),
    ),
);

const collaborationLaneArchive = EffectCommand.make(
  "archive",
  { collaborationId, laneId: collaborationLaneId },
  ({ collaborationId, laneId }) =>
    runCommand(ArchiveWorkspaceCollaborationLaneCommand.create({ collaborationId, laneId })),
);

const collaborationLane = EffectCommand.make("lane").pipe(
  EffectCommand.withDescription("Manage isolated Workspace lanes"),
  EffectCommand.withSubcommands([collaborationLaneAdd, collaborationLaneArchive]),
);

const collaborationWriterAcquire = EffectCommand.make(
  "acquire",
  {
    collaborationId,
    laneId: collaborationLaneId,
    expiresAt: Options.text("expires-at"),
  },
  ({ collaborationId, expiresAt, laneId }) =>
    runCommand(AcquireWorkspaceWriterLeaseCommand.create({ collaborationId, laneId, expiresAt })),
);

const collaborationWriterRenew = EffectCommand.make(
  "renew",
  {
    collaborationId,
    laneId: collaborationLaneId,
    expiresAt: Options.text("expires-at"),
    generation: Options.integer("generation"),
  },
  ({ collaborationId, expiresAt, generation, laneId }) =>
    runCommand(
      RenewWorkspaceWriterLeaseCommand.create({
        collaborationId,
        laneId,
        expiresAt,
        expectedGeneration: generation,
      }),
    ),
);

const collaborationWriterRelease = EffectCommand.make(
  "release",
  {
    collaborationId,
    laneId: collaborationLaneId,
    generation: Options.integer("generation"),
  },
  ({ collaborationId, generation, laneId }) =>
    runCommand(
      ReleaseWorkspaceWriterLeaseCommand.create({
        collaborationId,
        laneId,
        expectedGeneration: generation,
      }),
    ),
);

const collaborationWriterTransfer = EffectCommand.make(
  "transfer",
  {
    collaborationId,
    laneId: collaborationLaneId,
    generation: Options.integer("generation"),
    toParticipantId: Options.text("to-participant-id"),
    expiresAt: Options.text("expires-at"),
  },
  ({ collaborationId, expiresAt, generation, laneId, toParticipantId }) =>
    runCommand(
      TransferWorkspaceWriterLeaseCommand.create({
        collaborationId,
        laneId,
        expectedGeneration: generation,
        toParticipantId,
        expiresAt,
      }),
    ),
);

const collaborationWriter = EffectCommand.make("writer").pipe(
  EffectCommand.withDescription("Acquire, renew, release or transfer a fenced writer lease"),
  EffectCommand.withSubcommands([
    collaborationWriterAcquire,
    collaborationWriterRenew,
    collaborationWriterRelease,
    collaborationWriterTransfer,
  ]),
);

const collaborationTerminalAccess = EffectCommand.make(
  "terminal-access",
  {
    collaborationId,
    laneId: collaborationLaneId,
    sessionId: Options.text("session-id"),
    access: Options.choice("access", ["observe", "write"] as const),
    generation: Options.integer("generation").pipe(Options.optional),
  },
  ({ access, collaborationId, generation, laneId, sessionId }) =>
    runCommand(
      IssueWorkspaceCollaborationTerminalAccessCommand.create({
        collaborationId,
        laneId,
        sessionId,
        access,
        ...(optionalValue(generation) !== undefined
          ? { expectedGeneration: optionalValue(generation) }
          : {}),
      }),
    ),
);

const collaborationNativeAttach = EffectCommand.make(
  "native-attach",
  {
    collaborationId,
    laneId: collaborationLaneId,
    runtimeId: Options.text("runtime-id"),
    expiresAt: Options.text("expires-at"),
    generation: Options.integer("generation"),
  },
  ({ collaborationId, expiresAt, generation, laneId, runtimeId }) =>
    runCommand(
      IssueWorkspaceCollaborationNativeAttachCommand.create({
        collaborationId,
        laneId,
        runtimeId,
        expiresAt,
        expectedGeneration: generation,
      }),
    ),
);

const collaborationHandoffOffer = EffectCommand.make(
  "offer",
  {
    collaborationId,
    sourceLaneId: Options.text("source-lane-id"),
    targetLaneId: Options.text("target-lane-id"),
    artifactId: Options.text("artifact-id"),
    expectedDigest: Options.text("expected-digest"),
  },
  ({ artifactId, collaborationId, expectedDigest, sourceLaneId, targetLaneId }) =>
    runCommand(
      OfferWorkspaceCollaborationHandoffCommand.create({
        collaborationId,
        sourceLaneId,
        targetLaneId,
        artifactId,
        expectedDigest,
      }),
    ),
);

const collaborationHandoffResolve = EffectCommand.make(
  "resolve",
  {
    collaborationId,
    handoffId: Options.text("handoff-id"),
    decision: Options.choice("decision", ["accept", "reject"] as const),
  },
  ({ collaborationId, decision, handoffId }) =>
    runCommand(
      ResolveWorkspaceCollaborationHandoffCommand.create({
        collaborationId,
        handoffId,
        decision,
      }),
    ),
);

const collaborationHandoff = EffectCommand.make("handoff").pipe(
  EffectCommand.withDescription("Offer and resolve immutable artifact handoffs"),
  EffectCommand.withSubcommands([collaborationHandoffOffer, collaborationHandoffResolve]),
);

const collaborationClose = EffectCommand.make("close", { collaborationId }, ({ collaborationId }) =>
  runCommand(CloseWorkspaceCollaborationCommand.create({ collaborationId })),
);

const collaboration = EffectCommand.make("collaboration").pipe(
  EffectCommand.withDescription(
    "Coordinate isolated Workspaces, Agent participants, review and writer handoff",
  ),
  EffectCommand.withSubcommands([
    collaborationCreate,
    collaborationList,
    collaborationShow,
    collaborationParticipant,
    collaborationLane,
    collaborationWriter,
    collaborationTerminalAccess,
    collaborationNativeAttach,
    collaborationHandoff,
    collaborationClose,
  ]),
);

const workspaceNoTui = Options.boolean("no-tui").pipe(
  Options.withDescription("Skip the interactive Workspace control TUI."),
  Options.withDefault(false),
);
const workspaceJson = Options.boolean("json").pipe(
  Options.withDescription("Print the headless Workspace control status as JSON."),
  Options.withDefault(false),
);

export const agentWorkspaceCommand = EffectCommand.make(
  "workspace",
  {
    noTui: workspaceNoTui,
    json: workspaceJson,
  },
  ({ json, noTui }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const interactive = Boolean(cli.terminalIO.stdin.isTTY && cli.terminalIO.stdout.isTTY);
      const terminalFallbackReason = interactive
        ? classifyWorkspaceHostTerminal(cli.environment ?? process.env).reason
        : undefined;
      if (
        !interactive ||
        noTui ||
        json ||
        terminalFallbackReason ||
        !cli.workspaceControlPresentation
      ) {
        return yield* print({
          schemaVersion: "appaloft.workspace-control/v1",
          status: "renderer-unavailable",
          reason: !interactive
            ? "non-interactive-terminal"
            : noTui
              ? "no-tui"
              : json
                ? "structured-output"
                : terminalFallbackReason
                  ? terminalFallbackReason
                  : "presentation-not-composed",
          nextAction: "Use an explicit appaloft workspace subcommand.",
        });
      }
      yield* Effect.tryPromise({
        try: () =>
          cli.workspaceControlPresentation?.start({
            executeCommand: cli.executeCommand,
            executeQuery: cli.executeQuery,
            ...(cli.terminalSessionGateway
              ? { terminalSessionGateway: cli.terminalSessionGateway }
              : {}),
            openNativeWorkspaceTerminal: cli.openNativeWorkspaceTerminal,
          }) ?? Promise.resolve(),
        catch: (error) => workspaceCliError(error, "workspace-control-presentation"),
      });
    }),
).pipe(
  EffectCommand.withDescription("Open and operate Profile-aware Agent Workspaces"),
  EffectCommand.withSubcommands([
    open,
    create,
    list,
    show,
    pause,
    resume,
    terminate,
    connect,
    terminal,
    nativeAttach,
    preview,
    harness,
    task,
    collaboration,
  ]),
);
