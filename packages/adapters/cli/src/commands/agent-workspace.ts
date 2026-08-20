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
  ListPreviewEnvironmentsQuery,
  ListResourcesQuery,
  ListSandboxAgentHarnessesQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  ListServersQuery,
  ListWorkspaceCollaborationsQuery,
  OfferWorkspaceCollaborationHandoffCommand,
  OpenAgentWorkspaceCommand,
  OpenTerminalSessionCommand,
  occupancyRemoteProfileId,
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
import { type DomainError, domainError, err, type Result } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";
import {
  CLI_LOGIN_GUIDANCE,
  hasCliControlPlaneLogin,
  loginRequiredWorkspaceOccupancyTree,
} from "../cli-session-login.js";
import { resolveRemoteGitWorkspaceRef } from "../local-git-workspace-context.js";
import {
  launchScratchAgent,
  resolveDefaultScratchHarness,
  resolveNativeOpenCodeAttachEnv,
  resolveScratchSession,
  SCRATCH_BANNER,
} from "../local-scratch-session.js";
import {
  type OccupancyCodeOpenTarget,
  occupancyAvailableDoorHint,
  occupancyBrowserLaunchAllowed,
  occupancyChromeForProject,
  occupancyCodeOpenUrl,
  occupancyGitHubCompareUrl,
  occupancyLastDeploymentFromResource,
  occupancyPreviewFromResource,
  occupancyPullRequestFromPreviewEnvironments,
} from "../occupancy-chrome.js";
import {
  DEFAULT_OCCUPANCY_BANNER_CHROME_TIMEOUT_MS,
  DEFAULT_OCCUPANCY_SKILL_COMMAND_TIMEOUT_MS,
  DEFAULT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS,
  OCCUPANCY_CODE_PROGRESS,
  occupancyCodeUsesLineProgress,
  occupancyOpeningProgress,
  occupancyTimeoutMs,
  reportOccupancyCodeProgress,
  settleWithTimeout,
} from "../occupancy-code-progress.js";
import {
  occupancyHomeSkillDestinationExists,
  offerOccupancyAppaloftSkill,
  offerOccupancyHomeSkills,
} from "../occupancy-skill-offer.js";
import {
  formatRemoteCodeBanner,
  isRemoteCodeGitRemoteLocator,
  isWorkspaceGitRootUnavailable,
  nativeAttachRequiresInteractiveTerminal,
  occupancyCloudCompatError,
  type RemoteCodeServerSummary,
  resolveDefaultRemoteCodeDoor,
  resolveOccupancyConnectionsUrl,
  resolveWorkspaceOpenSource,
  scratchRemoteRejectedError,
  selectWorkspaceOpenTargetServerId,
  writeOccupancySessionHints,
} from "../remote-code-session.js";
import {
  attachIssuedTerminalSession,
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
const pathOrGitRemoteArg = Args.text({ name: "path|git-remote" }).pipe(
  Args.withDefault("."),
  Args.withDescription("Local path (Git optional) or git remote"),
);
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
  readonly activation?: {
    readonly project?: {
      readonly projectId?: string;
    };
  };
}

interface ResourceListResult {
  readonly items: readonly {
    readonly projectId?: string;
    readonly slug?: string;
    readonly lastDeploymentId?: string;
    readonly lastDeploymentStatus?: string;
    readonly accessSummary?: {
      readonly latestGeneratedAccessRoute?: {
        readonly url?: string;
        readonly deploymentStatus?: string;
      };
    };
  }[];
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

interface ServerListResult {
  readonly items: readonly {
    readonly id: string;
    readonly name?: string;
    readonly lifecycleStatus?: string;
    readonly providerKey?: string;
  }[];
}
function occupancyPreviewUrlForProject(
  resources: ResourceListResult["items"],
  projectId: string | undefined,
): string | undefined {
  return occupancyChromeForProject(resources, projectId).preview?.url;
}

function occupancyProductionUrlForProject(
  resources: ResourceListResult["items"],
  projectId: string | undefined,
): string | undefined {
  return occupancyChromeForProject(resources, projectId).production?.url;
}

function isProductAuthMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "product_auth_missing"
  );
}

function isSandboxPortPublishingUnsupported(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "details" in error &&
    typeof (error as { readonly details?: { readonly code?: unknown } }).details === "object" &&
    (error as { readonly details?: { readonly code?: unknown } }).details?.code ===
      "sandbox_port_publishing_unsupported"
  );
}

function occupancyTreeFromLists(
  reason: string,
  servers: ServerListResult["items"],
  sandboxes: readonly SandboxResult[],
  resources: ResourceListResult["items"] = [],
  status: "ready" | "login-required" = "ready",
) {
  const previewByProjectId = new Map<string, { readonly url: string }>();
  const deploymentByProjectId = new Map<
    string,
    { readonly id: string; readonly status?: string }
  >();
  for (const resource of resources) {
    if (typeof resource.projectId !== "string") continue;
    const preview = occupancyPreviewFromResource(resource);
    if (preview) previewByProjectId.set(resource.projectId, preview);
    const deployment = occupancyLastDeploymentFromResource(resource);
    if (deployment) deploymentByProjectId.set(resource.projectId, deployment);
  }
  return {
    schemaVersion: "appaloft.workspace-occupancy/v1",
    status,
    reason,
    nextAction:
      status === "login-required"
        ? CLI_LOGIN_GUIDANCE
        : "Use workspace show/pause/resume or appaloft code to attach.",
    servers: servers.map((server) => ({
      id: server.id,
      ...(typeof server.name === "string" ? { name: server.name } : {}),
      ...(typeof server.lifecycleStatus === "string"
        ? { lifecycleStatus: server.lifecycleStatus }
        : {}),
      ...(typeof server.providerKey === "string" ? { providerKey: server.providerKey } : {}),
    })),
    occupancies: sandboxes
      .filter((sandbox) => sandbox.status !== "terminated" && sandbox.status !== "failed")
      .map((sandbox) => {
        const projectId =
          typeof sandbox.activation?.project?.projectId === "string"
            ? sandbox.activation.project.projectId
            : undefined;
        const preview = projectId ? previewByProjectId.get(projectId) : undefined;
        const deployment = projectId ? deploymentByProjectId.get(projectId) : undefined;
        return {
          workspaceId: sandbox.sandboxId,
          status: sandbox.status,
          ...(sandbox.occupancy ? { occupancy: sandbox.occupancy } : {}),
          ...(projectId ? { projectId } : {}),
          ...(preview ? { preview } : {}),
          ...(deployment ? { deployment } : {}),
        };
      }),
  };
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

function issuedManagedTerminalDescriptor(
  attach: Extract<SandboxAgentAttachDescriptor, { transport: "managed-terminal" }>,
): import("@appaloft/application").TerminalSessionDescriptor {
  return {
    sessionId: attach.sessionId,
    scope: "sandbox",
    sandboxId: attach.workspaceId,
    transport: {
      kind: "websocket",
      path: attach.access.path,
    },
    providerKey: "managed-agent",
    createdAt: new Date().toISOString(),
  };
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
    return attachIssuedTerminalSession(issuedManagedTerminalDescriptor(result.attach), {
      initialRows: 24,
      initialCols: 80,
    });
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

const workspaceOpenServer = Options.text("server").pipe(
  Options.optional,
  Options.withDescription(
    "Registered BYOS Server id. Defaults to the enrolled Server when one exists.",
  ),
);

const create = EffectCommand.make(
  "create",
  {
    profile: Options.text("profile"),
    repository: Options.text("repo"),
    ref: Options.text("ref"),
    branch: Options.text("branch"),
    attach: Options.boolean("attach").pipe(Options.withDefault(false)),
    server: workspaceOpenServer,
  },
  ({ attach, branch, profile, ref, repository, server }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const source = yield* Effect.tryPromise({
        try: () =>
          (cli.resolveRemoteWorkspaceGitRef ?? resolveCreateWorkspaceGitRef)(repository, ref),
        catch: (error) => workspaceCliError(error, "workspace-create-git-ref"),
      });
      const targetServerId = yield* Effect.promise(() =>
        resolveWorkspaceOpenTargetServerId(
          () => listWorkspaceOpenServers(cli),
          optionalValue(server),
        ),
      );
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
          ...(targetServerId ? { targetServerId } : {}),
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
  return resolveWorkspaceOpenSource(path, undefined, {
    onProgress: reportWorkspaceGitProgress,
  });
}

function resolveCreateWorkspaceGitRef(repository: string, ref: string) {
  return resolveRemoteGitWorkspaceRef(repository, ref, undefined, {
    onProgress: reportWorkspaceGitProgress,
  });
}

async function resolveWorkspaceOpenTargetServerId(
  listServers: () => Promise<readonly RemoteCodeServerSummary[] | undefined>,
  explicit?: string,
): Promise<string | undefined> {
  if (explicit?.trim()) {
    return selectWorkspaceOpenTargetServerId({ explicit });
  }
  return selectWorkspaceOpenTargetServerId({
    servers: (await listServers()) ?? [],
  });
}

async function listWorkspaceOpenServers(cli: {
  readonly executeQuery: (
    message: ListServersQuery,
  ) => Promise<Result<{ items?: readonly RemoteCodeServerSummary[] }>>;
}): Promise<readonly RemoteCodeServerSummary[] | undefined> {
  const query = ListServersQuery.create();
  if (query.isErr()) return undefined;
  const listed = await cli.executeQuery(query.value);
  if (listed.isErr()) return undefined;
  return Array.isArray(listed.value.items) ? listed.value.items : undefined;
}

function makeWorkspaceOpenCommand() {
  return EffectCommand.make(
    "open",
    {
      path: pathOrGitRemoteArg,
      profile: Options.text("profile").pipe(Options.optional),
      forceNew: Options.boolean("new").pipe(Options.withDefault(false)),
      noAttach: Options.boolean("no-attach").pipe(Options.withDefault(false)),
      server: workspaceOpenServer,
    },
    ({ forceNew, noAttach, path, profile, server }) =>
      Effect.gen(function* () {
        const cli = yield* CliRuntime;
        const source = yield* Effect.tryPromise({
          try: () => {
            if (cli.resolveWorkspaceOpenSource) {
              return cli.resolveWorkspaceOpenSource(path);
            }
            if (cli.resolveLocalWorkspaceGitContext && !isRemoteCodeGitRemoteLocator(path)) {
              return cli.resolveLocalWorkspaceGitContext(path).catch((error) => {
                if (!isWorkspaceGitRootUnavailable(error)) throw error;
                return resolveOpenWorkspaceGitContext(path);
              });
            }
            return resolveOpenWorkspaceGitContext(path);
          },
          catch: (error) => workspaceCliError(error, "workspace-open-git-context"),
        });
        const attach = !noAttach;
        const targetServerId = yield* Effect.promise(() =>
          resolveWorkspaceOpenTargetServerId(
            () => listWorkspaceOpenServers(cli),
            optionalValue(server),
          ),
        );
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
            ...(targetServerId ? { targetServerId } : {}),
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

function occupancyCodeProfile(
  harness: "opencode" | "pi" | "omp",
  profile?: string,
): string | undefined {
  if (profile) return profile;
  if (harness !== "opencode") return occupancyRemoteProfileId(harness);
  // Default OpenCode omits profile so findPreferred can resume the live occupancy
  // and Cloud reuse (`existingInstallationId && !input.profile`) is not skipped.
  return undefined;
}

export const workspaceCodeCommand = EffectCommand.make(
  "code",
  {
    path: pathOrGitRemoteArg,
    noAttach: Options.boolean("no-attach").pipe(Options.withDefault(false)),
    local: Options.boolean("local").pipe(Options.withDefault(false)),
    forceNew: Options.boolean("new").pipe(Options.withDefault(false)),
    open: Options.boolean("open").pipe(Options.withDefault(false)),
    profile: Options.text("profile").pipe(
      Options.optional,
      Options.withDescription("Agent Workspace Profile name or installation id"),
    ),
    harness: Options.choice("harness", ["opencode", "pi", "omp"] as const).pipe(
      Options.withDefault("opencode" as const),
    ),
    openTarget: Options.choice("open-target", [
      "preview",
      "production",
      "pr",
      "compare",
      "connections",
    ] as const).pipe(Options.optional),
  },
  ({ forceNew, harness, local, noAttach, open, openTarget, path, profile }) =>
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

      const attach = !noAttach;
      const interactive = Boolean(cli.terminalIO.stdin.isTTY && cli.terminalIO.stdout.isTTY);
      const lineProgress = occupancyCodeUsesLineProgress({
        noAttach,
        ...(cli.terminalIO.stdin.isTTY === undefined
          ? {}
          : { stdinIsTty: cli.terminalIO.stdin.isTTY }),
        ...(cli.terminalIO.stdout.isTTY === undefined
          ? {}
          : { stdoutIsTty: cli.terminalIO.stdout.isTTY }),
      });
      const terminalFallbackReason = interactive
        ? classifyWorkspaceHostTerminal(cli.environment ?? process.env).reason
        : undefined;
      const useOccupancyTui =
        !noAttach &&
        interactive &&
        !terminalFallbackReason &&
        Boolean(cli.workspaceControlPresentation);
      const reportProgress = (message: string) => {
        if (lineProgress) reportOccupancyCodeProgress(message);
      };
      const occupyRemote = async (
        onProgress: (message: string) => void,
        options?: { readonly announcePin?: boolean },
      ) => {
        const injectedDoor = cli.resolveRemoteCodeDoor;
        const door = injectedDoor
          ? await (async () => {
              onProgress(OCCUPANCY_CODE_PROGRESS.checkingLogin);
              return injectedDoor(path);
            })()
          : await resolveDefaultRemoteCodeDoor(
              {
                ...(cli.environment ? { env: cli.environment } : {}),
                forceNew,
                onProgress,
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
              path,
            );
        const selectedProfile = occupancyCodeProfile(harness, optionalValue(profile));
        const openInput = {
          repository: door.repository,
          repositoryIdentity: door.repositoryIdentity,
          ref: door.ref,
          branch: door.branch,
          commitSha: door.commitSha,
          targetServerId: door.serverId,
          attach,
          forceNew,
          ...(selectedProfile ? { profile: selectedProfile } : {}),
        };
        const command = OpenAgentWorkspaceCommand.create(openInput);
        if (command.isErr()) throw command.error;
        onProgress(occupancyOpeningProgress(door.serverName));
        const opened = await cli.executeCommand(command.value);
        if (opened.isOk()) {
          return { door, result: opened.value, bannerCommitSha: door.commitSha };
        }
        const details = opened.error.details;
        const pinnedSha =
          !forceNew &&
          details?.code === "workspace_open_source_pin_mismatch" &&
          typeof details.workspaceCommitSha === "string"
            ? details.workspaceCommitSha
            : undefined;
        if (!pinnedSha) {
          throw occupancyCloudCompatError(opened.error, {
            id: door.serverId,
            name: door.serverName,
          });
        }
        const retry = OpenAgentWorkspaceCommand.create({
          ...openInput,
          commitSha: pinnedSha,
          forceNew: false,
        });
        if (retry.isErr()) throw retry.error;
        const retried = await cli.executeCommand(retry.value);
        if (retried.isErr()) throw retried.error;
        const workspaceId =
          typeof details?.workspaceId === "string"
            ? details.workspaceId
            : retried.value.workspaceId;
        if (options?.announcePin !== false) {
          process.stdout.write(
            `Pinned · ${workspaceId} @ ${pinnedSha.slice(0, 7)} · requested ${door.commitSha.slice(0, 7)} · use --new for an isolated Workspace\n`,
          );
        }
        return { door, result: retried.value, bannerCommitSha: pinnedSha };
      };
      const occupancyTui = cli.workspaceControlPresentation;
      if (useOccupancyTui && occupancyTui) {
        yield* Effect.tryPromise({
          try: () =>
            occupancyTui.start({
              executeCommand: (command) => cli.executeCommand(command),
              executeQuery: (query) => cli.executeQuery(query),
              ...(cli.terminalSessionGateway
                ? { terminalSessionGateway: cli.terminalSessionGateway }
                : {}),
              ...(cli.openNativeWorkspaceTerminal
                ? { openNativeWorkspaceTerminal: cli.openNativeWorkspaceTerminal }
                : {}),
              occupyBootstrap: async ({ reportProgress: tuiProgress }) => {
                const occupied = await occupyRemote(
                  (message) => {
                    void tuiProgress(message);
                  },
                  { announcePin: false },
                );
                void settleWithTimeout(
                  (async () => {
                    await tuiProgress(OCCUPANCY_CODE_PROGRESS.copyingSkills);
                    try {
                      await offerOccupancyAppaloftSkill({
                        workspaceId: occupied.result.workspaceId,
                        executeCommand: (skillCommand) => cli.executeCommand(skillCommand),
                      });
                      await offerOccupancyHomeSkills({
                        workspaceId: occupied.result.workspaceId,
                        executeCommand: (skillCommand) => cli.executeCommand(skillCommand),
                        destinationExists: occupancyHomeSkillDestinationExists({
                          workspaceId: occupied.result.workspaceId,
                          executeQuery: (query) => cli.executeQuery(query),
                        }),
                      });
                    } catch {
                      // occupy still succeeds when skill offer cannot write
                    }
                  })(),
                  occupancyTimeoutMs(
                    "APPALOFT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS",
                    DEFAULT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS,
                  ),
                );
                return {
                  workspaceId: occupied.result.workspaceId,
                  ...(occupied.result.attach ? { attach: occupied.result.attach } : {}),
                };
              },
            }),
          catch: (error) => workspaceCliError(error, "workspace-control-presentation"),
        });
        return;
      }
      const occupied = yield* Effect.tryPromise({
        try: () => occupyRemote(reportProgress),
        catch: (error) => workspaceCliError(error, "remote-code-door"),
      });
      const door = occupied.door;
      const result = occupied.result;
      const bannerCommitSha = occupied.bannerCommitSha;
      const skillOfferTimeoutMs = occupancyTimeoutMs(
        "APPALOFT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS",
        DEFAULT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS,
      );
      const skillCommandTimeoutMs = occupancyTimeoutMs(
        "APPALOFT_OCCUPANCY_SKILL_COMMAND_TIMEOUT_MS",
        DEFAULT_OCCUPANCY_SKILL_COMMAND_TIMEOUT_MS,
      );
      const bannerChromeTimeoutMs = occupancyTimeoutMs(
        "APPALOFT_OCCUPANCY_BANNER_CHROME_TIMEOUT_MS",
        DEFAULT_OCCUPANCY_BANNER_CHROME_TIMEOUT_MS,
      );
      const timedSkillResult = async <T>(work: Promise<Result<T>>): Promise<Result<T>> => {
        const settled = await settleWithTimeout(work, skillCommandTimeoutMs);
        if (settled.status === "timed-out") {
          return err(
            domainError.infra("occupancy skill offer timed out", {
              phase: "occupancy-skill-offer",
            }),
          );
        }
        return settled.value;
      };
      const offerSkills = async () => {
        reportProgress(OCCUPANCY_CODE_PROGRESS.copyingSkills);
        try {
          await offerOccupancyAppaloftSkill({
            workspaceId: result.workspaceId,
            executeCommand: (skillCommand) => timedSkillResult(cli.executeCommand(skillCommand)),
          });
          await offerOccupancyHomeSkills({
            workspaceId: result.workspaceId,
            executeCommand: (skillCommand) => timedSkillResult(cli.executeCommand(skillCommand)),
            destinationExists: occupancyHomeSkillDestinationExists({
              workspaceId: result.workspaceId,
              executeQuery: (query) => timedSkillResult(cli.executeQuery(query)),
            }),
          });
        } catch {
          // occupy still succeeds when skill offer cannot write
        }
      };
      const offerSkillsBounded = async () => {
        await settleWithTimeout(offerSkills(), skillOfferTimeoutMs);
      };
      const loadBannerChrome = async () => {
        const bannerProjectId = result.projectId || door.projectId;
        let previewUrl: string | undefined;
        let productionUrl: string | undefined;
        let pullRequestNumber: number | undefined;
        const resourcesQuery = ListResourcesQuery.create({ limit: 100 });
        if (resourcesQuery.isOk()) {
          const listed = await cli.executeQuery(resourcesQuery.value);
          if (listed.isOk()) {
            previewUrl = occupancyPreviewUrlForProject(listed.value.items ?? [], bannerProjectId);
            productionUrl = occupancyProductionUrlForProject(
              listed.value.items ?? [],
              bannerProjectId,
            );
          }
        }
        const previewEnvironmentsQuery = ListPreviewEnvironmentsQuery.create({
          ...(bannerProjectId ? { projectId: bannerProjectId } : {}),
          limit: 100,
        });
        if (previewEnvironmentsQuery.isOk()) {
          const listed = await cli.executeQuery(previewEnvironmentsQuery.value);
          if (listed.isOk()) {
            pullRequestNumber = occupancyPullRequestFromPreviewEnvironments(
              listed.value.items ?? [],
              {
                repositoryIdentity: door.repositoryIdentity,
                commitSha: bannerCommitSha,
              },
            )?.number;
          }
        }
        return {
          bannerProjectId,
          ...(previewUrl ? { previewUrl } : {}),
          ...(productionUrl ? { productionUrl } : {}),
          ...(pullRequestNumber ? { pullRequestNumber } : {}),
        };
      };
      const writeBannerFollowup = async (chrome: {
        readonly bannerProjectId: string;
        readonly previewUrl?: string;
        readonly productionUrl?: string;
        readonly pullRequestNumber?: number;
      }) => {
        const connectionsUrl = await resolveOccupancyConnectionsUrl();
        if (open || optionalValue(openTarget)) {
          const url = occupancyCodeOpenUrl({
            repositoryIdentity: door.repositoryIdentity,
            commitSha: bannerCommitSha,
            ...(chrome.previewUrl ? { previewUrl: chrome.previewUrl } : {}),
            ...(chrome.productionUrl ? { productionUrl: chrome.productionUrl } : {}),
            ...(connectionsUrl ? { connectionsUrl } : {}),
            ...(chrome.pullRequestNumber ? { pullRequestNumber: chrome.pullRequestNumber } : {}),
            ...(door.branch ? { branch: door.branch } : {}),
            ...(optionalValue(openTarget)
              ? { target: optionalValue(openTarget) as OccupancyCodeOpenTarget }
              : {}),
          });
          if (url) {
            process.stdout.write(`Open · ${url}\n`);
            if (occupancyBrowserLaunchAllowed()) {
              const openCommand =
                process.platform === "darwin"
                  ? ["open", url]
                  : process.platform === "win32"
                    ? ["cmd", "/c", "start", "", url]
                    : ["xdg-open", url];
              const child = spawn(openCommand[0]!, openCommand.slice(1), {
                shell: false,
                stdio: "ignore",
              });
              child.unref();
            }
          }
        }
        const doorHint = occupancyAvailableDoorHint({
          repositoryIdentity: door.repositoryIdentity,
          commitSha: bannerCommitSha,
          ...(chrome.previewUrl ? { previewUrl: chrome.previewUrl } : {}),
          ...(chrome.productionUrl ? { productionUrl: chrome.productionUrl } : {}),
          ...(connectionsUrl ? { connectionsUrl } : {}),
          ...(chrome.pullRequestNumber ? { pullRequestNumber: chrome.pullRequestNumber } : {}),
          ...(door.branch ? { branch: door.branch } : {}),
        });
        if (doorHint) process.stdout.write(`${doorHint}\n`);
      };
      type OccupancyBannerChrome = {
        readonly bannerProjectId: string;
        readonly previewUrl?: string;
        readonly productionUrl?: string;
        readonly pullRequestNumber?: number;
      };
      const leanChrome: OccupancyBannerChrome = {
        bannerProjectId: result.projectId || door.projectId,
      };
      process.stdout.write(
        `${formatRemoteCodeBanner({
          projectId: leanChrome.bannerProjectId,
          repositoryIdentity: door.repositoryIdentity,
          commitSha: bannerCommitSha,
          serverName: door.serverName,
          workspaceId: result.workspaceId,
        })}\n`,
      );
      const wantsChrome = !attach || open || Boolean(optionalValue(openTarget));
      const chrome = yield* Effect.promise(async (): Promise<OccupancyBannerChrome> => {
        if (!wantsChrome) return leanChrome;
        const settled = await settleWithTimeout(loadBannerChrome(), bannerChromeTimeoutMs);
        return settled.status === "completed" ? settled.value : leanChrome;
      });
      const extras = formatRemoteCodeBanner({
        projectId: chrome.bannerProjectId,
        repositoryIdentity: door.repositoryIdentity,
        commitSha: bannerCommitSha,
        serverName: door.serverName,
        workspaceId: result.workspaceId,
        ...(chrome.previewUrl ? { previewUrl: chrome.previewUrl } : {}),
        ...(chrome.productionUrl ? { productionUrl: chrome.productionUrl } : {}),
        ...(chrome.pullRequestNumber ? { pullRequestNumber: chrome.pullRequestNumber } : {}),
        ...(door.branch ? { branch: door.branch } : {}),
      })
        .split("\n")
        .slice(1);
      for (const line of extras) process.stdout.write(`${line}\n`);
      yield* Effect.promise(() => writeBannerFollowup(chrome));
      yield* Effect.promise(() => writeOccupancySessionHints());
      if (attach) {
        reportProgress(OCCUPANCY_CODE_PROGRESS.attaching);
        const skills = offerSkillsBounded();
        yield* completeWorkspaceOpen(result, true, cli.launchNativeWorkspaceClient);
        yield* Effect.promise(() => skills);
        return;
      }
      yield* Effect.promise(() => offerSkillsBounded());
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
      if (access.transport === "managed-terminal") {
        yield* attachIssuedTerminalSession(issuedManagedTerminalDescriptor(access), {
          initialRows: 24,
          initialCols: 80,
        });
        yield* Effect.promise(() => writeOccupancySessionHints());
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
      yield* Effect.promise(() => writeOccupancySessionHints());
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
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const command = yield* resultToEffect(
        ExposeSandboxPortCommand.create({
          sandboxId: workspaceId,
          port,
          visibility,
          ...(optionalValue(expiresAt) ? { expiresAt: optionalValue(expiresAt) } : {}),
        }),
      );
      const exposed = yield* Effect.promise(() => cli.executeCommand(command));
      if (exposed.isOk()) {
        yield* print(exposed.value);
        return;
      }
      if (!isSandboxPortPublishingUnsupported(exposed.error)) {
        return yield* resultToEffect(exposed);
      }
      const sandboxQuery = yield* resultToEffect(
        ShowSandboxQuery.create({ sandboxId: workspaceId }),
      );
      const sandbox = (yield* resultToEffect(
        yield* Effect.promise(() => cli.executeQuery(sandboxQuery)),
      )) as SandboxResult;
      const resourcesQuery = yield* resultToEffect(ListResourcesQuery.create({ limit: 100 }));
      const listed = (yield* resultToEffect(
        yield* Effect.promise(() => cli.executeQuery(resourcesQuery)),
      )) as ResourceListResult;
      const previewUrl = occupancyPreviewUrlForProject(
        listed.items ?? [],
        sandbox.activation?.project?.projectId,
      );
      if (!previewUrl) {
        return yield* Effect.fail(
          domainError.conflict(
            "Occupancy preview is unavailable. Deploy the occupancy resource first, then retry workspace preview.",
            { code: "occupancy_preview_unavailable" },
          ),
        );
      }
      const occupancy = sandbox.occupancy;
      const compareUrl = occupancyGitHubCompareUrl(occupancy);
      yield* print({
        kind: "occupancy-preview",
        url: previewUrl,
        ...(compareUrl ? { compareUrl } : {}),
        guidance: "sandbox port publishing unsupported; using occupancy resource route",
      });
    }),
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
  Options.withDescription("Print the headless occupancy tree as JSON."),
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
        const reason = !interactive
          ? "non-interactive-terminal"
          : noTui
            ? "no-tui"
            : json
              ? "structured-output"
              : terminalFallbackReason
                ? terminalFallbackReason
                : "presentation-not-composed";
        const loggedIn = yield* Effect.promise(() =>
          hasCliControlPlaneLogin(cli.environment ?? process.env),
        );
        if (!loggedIn && (!interactive || json || noTui)) {
          return yield* print(loginRequiredWorkspaceOccupancyTree(reason));
        }
        const serversQuery = yield* resultToEffect(ListServersQuery.create());
        const serversResult = yield* Effect.promise(() => cli.executeQuery(serversQuery));
        if (serversResult.isErr() && isProductAuthMissing(serversResult.error)) {
          return yield* print(occupancyTreeFromLists(reason, [], [], [], "login-required"));
        }
        const servers = (yield* resultToEffect(serversResult)) as ServerListResult;
        const sandboxesQuery = yield* resultToEffect(
          ListSandboxesQuery.create({ limit: 100, offset: 0 }),
        );
        const sandboxesResult = yield* Effect.promise(() => cli.executeQuery(sandboxesQuery));
        if (sandboxesResult.isErr() && isProductAuthMissing(sandboxesResult.error)) {
          return yield* print(
            occupancyTreeFromLists(reason, servers.items ?? [], [], [], "login-required"),
          );
        }
        const sandboxes = (yield* resultToEffect(sandboxesResult)) as SandboxListResult;
        let resources: ResourceListResult["items"] = [];
        const resourcesQuery = ListResourcesQuery.create({ limit: 100 });
        if (resourcesQuery.isOk()) {
          const listed = yield* Effect.promise(() => cli.executeQuery(resourcesQuery.value));
          if (listed.isOk()) resources = listed.value.items ?? [];
        }
        return yield* print(
          occupancyTreeFromLists(reason, servers.items ?? [], sandboxes.items ?? [], resources),
        );
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
