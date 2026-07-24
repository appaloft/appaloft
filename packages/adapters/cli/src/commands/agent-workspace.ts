import {
  ApproveAgentTaskRunCommand,
  CancelAgentTaskRunCommand,
  CreateAgentTaskRunCommand,
  CreateSandboxAgentRuntimeCommand,
  CreateSandboxCommand,
  DeliverAgentTaskRunCommand,
  ExecuteSandboxCommand,
  ExposeSandboxPortCommand,
  IssueSandboxAgentAttachAccessCommand,
  ListAgentTaskRunsQuery,
  ListSandboxAgentHarnessesQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  OpenTerminalSessionCommand,
  PauseSandboxCommand,
  ResumeAgentTaskRunCommand,
  ResumeSandboxCommand,
  ShowAgentTaskRunQuery,
  ShowSandboxQuery,
  ShowTerminalSessionQuery,
  TerminateSandboxAgentRuntimeCommand,
  TerminateSandboxCommand,
} from "@appaloft/application";
import { domainError } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";

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

const workspaceId = Args.text({ name: "workspaceId" });
const terminalDirectory = Options.text("directory").pipe(Options.optional);
const terminalRows = Options.text("rows").pipe(Options.withDefault("24"));
const terminalCols = Options.text("cols").pipe(Options.withDefault("80"));
const attachTerminal = Options.boolean("attach").pipe(Options.withDefault(false));
const terminalSessionId = Options.text("session-id").pipe(Options.optional);
const repository = Options.text("repo").pipe(Options.optional);
const repositoryRef = Options.text("ref").pipe(Options.optional);
const workspaceBranch = Options.text("branch").pipe(Options.optional);

interface SandboxResult {
  readonly sandboxId: string;
  readonly status: string;
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

function requireWorkspaceId(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  throw domainError.infra("Workspace creation returned no Sandbox id", {
    code: "agent_workspace_sandbox_id_missing",
  });
}

function validateRepositoryLocator(value: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 2_048 ||
    normalized.includes("\0") ||
    normalized.startsWith("-") ||
    /[\r\n]/u.test(normalized)
  ) {
    throw domainError.validation("Workspace repository locator is invalid");
  }
  let repository: URL;
  try {
    repository = new URL(normalized);
  } catch {
    throw domainError.validation("Workspace repository must use HTTPS");
  }
  if (
    repository.protocol !== "https:" ||
    !repository.hostname ||
    repository.username ||
    repository.password ||
    repository.port ||
    repository.pathname === "/" ||
    repository.search ||
    repository.hash
  ) {
    throw domainError.validation("Workspace repository must use credential-free HTTPS");
  }
  return normalized;
}

function validateGitRef(value: string | undefined, label: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (
    normalized.length > 512 ||
    normalized.startsWith("-") ||
    normalized.includes("\0") ||
    /[\s~^:?*[\\]/u.test(normalized) ||
    normalized.includes("..") ||
    normalized.endsWith(".") ||
    normalized.endsWith("/")
  ) {
    throw domainError.validation(`Workspace ${label} is invalid`);
  }
  return normalized;
}

function repositoryNetworkRules(locator: string): Array<{
  kind: "domain";
  value: string;
  ports: number[];
}> {
  const host = new URL(locator).hostname.toLowerCase();
  return [
    { kind: "domain", value: host, ports: [443] },
    ...(host === "github.com"
      ? [{ kind: "domain" as const, value: "api.github.com", ports: [443] }]
      : []),
  ];
}

function requireSuccessfulForegroundExecution(value: unknown, phase: string): void {
  if (!value || typeof value !== "object" || (value as { mode?: unknown }).mode !== "foreground") {
    throw domainError.infra(`${phase} returned no foreground result`);
  }
  const frames = (value as { frames?: unknown }).frames;
  if (!Array.isArray(frames)) throw domainError.infra(`${phase} returned invalid frames`);
  const exit = frames.find(
    (frame) => frame && typeof frame === "object" && (frame as { kind?: unknown }).kind === "exit",
  ) as { exitCode?: unknown } | undefined;
  if (exit?.exitCode !== 0) {
    const stderr = frames
      .filter(
        (frame) =>
          frame && typeof frame === "object" && (frame as { kind?: unknown }).kind === "stderr",
      )
      .map((frame) => String((frame as { data?: unknown }).data ?? ""))
      .join("")
      .slice(0, 1_024);
    throw domainError.infra(stderr || `${phase} failed`, {
      code: "agent_workspace_source_materialization_failed",
      phase,
    });
  }
}

const create = EffectCommand.make(
  "create",
  {
    harness: Options.choice("harness", ["pi", "opencode"] as const).pipe(Options.withDefault("pi")),
    sandboxTemplate: Options.text("sandbox-template"),
    harnessTemplate: Options.text("harness-template").pipe(Options.optional),
    isolation: Options.choice("isolation", [
      "container-trusted",
      "gvisor",
      "kata",
      "microvm",
    ] as const),
    cpuMillis: Options.integer("cpu-millis"),
    memoryBytes: Options.integer("memory-bytes"),
    diskBytes: Options.integer("disk-bytes"),
    maxProcesses: Options.integer("max-processes"),
    expiresAt: Options.text("expires-at").pipe(Options.optional),
    provider: Options.text("provider").pipe(Options.optional),
    idempotencyKey: Options.text("idempotency-key").pipe(Options.optional),
    repository,
    repositoryRef,
    workspaceBranch,
  },
  ({
    cpuMillis,
    diskBytes,
    expiresAt,
    harness,
    harnessTemplate,
    idempotencyKey,
    isolation,
    maxProcesses,
    memoryBytes,
    provider,
    repository,
    repositoryRef,
    sandboxTemplate,
    workspaceBranch,
  }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const selectedRepository = optionalValue(repository);
      const validatedRepository = selectedRepository
        ? validateRepositoryLocator(selectedRepository)
        : undefined;
      const sandboxCommand = yield* resultToEffect(
        CreateSandboxCommand.create({
          source: { kind: "template", templateId: sandboxTemplate },
          requestedIsolation: isolation,
          limits: { cpuMillis, memoryBytes, diskBytes, maxProcesses },
          networkPolicy: validatedRepository
            ? { mode: "allowlist", rules: repositoryNetworkRules(validatedRepository) }
            : { mode: "deny", rules: [] },
          ...(optionalValue(expiresAt) ? { expiresAt: optionalValue(expiresAt) } : {}),
          ...(optionalValue(provider) ? { providerKey: optionalValue(provider) } : {}),
        }),
      );
      const sandbox = yield* resultToEffect(
        yield* Effect.promise(() => cli.executeCommand(sandboxCommand)),
      );
      const sandboxDescriptor = sandbox as SandboxResult;
      const sandboxId = requireWorkspaceId(sandboxDescriptor.sandboxId);
      if (validatedRepository) {
        const ref = validateGitRef(optionalValue(repositoryRef), "source ref");
        const branch = validateGitRef(optionalValue(workspaceBranch), "branch");
        const cloneCommand = yield* resultToEffect(
          ExecuteSandboxCommand.create({
            sandboxId,
            argv: [
              "git",
              "clone",
              ...(ref ? ["--branch", ref] : []),
              "--",
              validatedRepository,
              ".",
            ],
          }),
        );
        const clone = yield* resultToEffect(
          yield* Effect.promise(() => cli.executeCommand(cloneCommand)),
        ).pipe(
          Effect.mapError((error) => ({
            ...error,
            message: `Agent Workspace source materialization failed after Sandbox ${sandboxId} was created`,
            details: {
              ...error.details,
              phase: "agent-workspace-source-materialization",
              workspaceId: sandboxId,
              sandboxId,
            },
          })),
        );
        requireSuccessfulForegroundExecution(clone, "agent-workspace-source-materialization");
        if (branch) {
          const branchCommand = yield* resultToEffect(
            ExecuteSandboxCommand.create({
              sandboxId,
              argv: ["git", "switch", "-c", branch],
            }),
          );
          const switched = yield* resultToEffect(
            yield* Effect.promise(() => cli.executeCommand(branchCommand)),
          );
          requireSuccessfulForegroundExecution(switched, "agent-workspace-branch-create");
        }
      }
      const selectedHarnessTemplate =
        optionalValue(harnessTemplate) ??
        (harness === "pi" ? "aht_pi_managed_v1" : "aht_opencode_managed_v1");
      const runtimeCommand = yield* resultToEffect(
        CreateSandboxAgentRuntimeCommand.create({
          sandboxId,
          harnessKey: harness,
          harnessTemplateId: selectedHarnessTemplate,
          idempotencyKey: optionalValue(idempotencyKey) ?? crypto.randomUUID(),
        }),
      );
      const runtime = yield* resultToEffect(
        yield* Effect.promise(() => cli.executeCommand(runtimeCommand)),
      ).pipe(
        Effect.mapError((error) => ({
          ...error,
          message: `Agent Workspace Runtime creation failed after Sandbox ${sandboxId} was created`,
          details: {
            ...error.details,
            phase: "agent-workspace-runtime-create",
            workspaceId: sandboxId,
            sandboxId,
            harness,
          },
        })),
      );

      yield* print({
        workspaceId: sandboxId,
        sandbox: sandboxDescriptor,
        agent: runtime,
      });
    }),
).pipe(
  EffectCommand.withDescription(
    "Create a public Agent Workspace backed by a Sandbox and Pi or OpenCode",
  ),
);

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
    const runtimeQuery = yield* resultToEffect(
      ListSandboxAgentRuntimesQuery.create({ sandboxId: workspaceId }),
    );
    const runtimes = (yield* resultToEffect(
      yield* Effect.promise(() => cli.executeQuery(runtimeQuery)),
    )) as AgentRuntimeListResult;
    const agents = yield* Effect.all(
      runtimes.items
        .filter((runtime) => runtime.status !== "terminated")
        .map((runtime) =>
          Effect.gen(function* () {
            const command = yield* resultToEffect(
              TerminateSandboxAgentRuntimeCommand.create({
                sandboxId: workspaceId,
                runtimeId: runtime.runtimeId,
              }),
            );
            return yield* resultToEffect(yield* Effect.promise(() => cli.executeCommand(command)));
          }),
        ),
      { concurrency: 4 },
    );
    const command = yield* resultToEffect(
      TerminateSandboxCommand.create({ sandboxId: workspaceId }),
    );
    const sandbox = yield* resultToEffect(yield* Effect.promise(() => cli.executeCommand(command)));
    yield* print({ workspaceId, agents, sandbox });
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
  },
  ({ expiresAt, workspaceId }) =>
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
          candidate.interaction?.transport === "native-attach" &&
          Number.isInteger(candidate.interaction.serverPort),
      );
      if (!runtime?.interaction?.serverPort) {
        throw domainError.conflict("Workspace Runtime does not support scoped native attach", {
          code: "agent_workspace_native_attach_unavailable",
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
      const access = yield* resultToEffect(
        yield* Effect.promise(() => cli.executeCommand(command)),
      );
      yield* print(access);
    }),
).pipe(
  EffectCommand.withDescription(
    "Issue short-lived private access for a native agent client when the gateway supports it",
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

export const agentWorkspaceCommand = EffectCommand.make("workspace").pipe(
  EffectCommand.withDescription("Create and operate public Agent Workspaces with Pi or OpenCode"),
  EffectCommand.withSubcommands([
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
  ]),
);
