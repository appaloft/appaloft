import {
  AgentWorkspaceOpenService,
  COMMUNITY_OCCUPANCY_OPENCODE_LIMITS,
  COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_ID,
  COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
  type Command,
  CreateSandboxAgentRuntimeCommand,
  CreateSandboxCommand,
  createExecutionContext,
  ListProjectsQuery,
  ListSandboxesQuery,
  ListServersQuery,
  OpenAgentWorkspaceCommand,
  type Query,
  ResumeSandboxCommand,
  ShowRepositoryBindingQuery,
  shouldSkipWorkspaceSourceMaterialization,
  TerminateSandboxCommand,
  type WorkspaceOpenDependencies,
  type WorkspaceOpenEntry,
  type WorkspaceOpenResult,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";

type RemoteDispatch = <T>(message: Command<T> | Query<T>) => Promise<Result<T>>;

const FOLDER_LOCAL_HARNESS_KEY = "opencode";
const FOLDER_LOCAL_HARNESS_TEMPLATE_ID = "aht_opencode_managed_v1";

const folderLocalPin = {
  profileInstallationId: "awpi_folder_local",
  profileDefinitionDigest: `sha256:${"a".repeat(64)}`,
  profileId: "appaloft-remote",
  profileVersion: "1.0.0",
  adapterInstallationId: "aai_folder_local",
  adapterDefinitionDigest: `sha256:${"b".repeat(64)}`,
  adapterId: "opencode",
  adapterVersion: "1.0.0",
  harnessKey: FOLDER_LOCAL_HARNESS_KEY,
  harnessTemplateId: FOLDER_LOCAL_HARNESS_TEMPLATE_ID,
  sandboxTemplateId: COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_ID,
  sandboxTemplateVersion: "1",
  sandboxTemplateDigest: `sha256:${"c".repeat(64)}`,
  capabilities: {
    taskMode: true,
    interactive: true,
    backgroundRuns: true,
    nativeSession: false,
    persistentPaths: ["/workspace"],
  },
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isGitSourceArgv(argv: readonly string[]): boolean {
  return (
    argv[0] === "git" || argv.includes("clone") || argv.includes("fetch") || argv.includes("init")
  );
}

export function isFolderLocalWorkspaceOpenCommand(
  message: unknown,
): message is OpenAgentWorkspaceCommand {
  return (
    message instanceof OpenAgentWorkspaceCommand &&
    shouldSkipWorkspaceSourceMaterialization(message.input)
  );
}

export async function executeFolderLocalWorkspaceOpen(input: {
  readonly command: OpenAgentWorkspaceCommand;
  readonly dispatch: RemoteDispatch;
}): Promise<Result<WorkspaceOpenResult>> {
  if (!isFolderLocalWorkspaceOpenCommand(input.command)) {
    return err(
      domainError.invariant("folder.local occupy received a git-remote workspaces.open", {
        code: "workspace_open_folder_local_required",
      }),
    );
  }

  const bindingQuery = ShowRepositoryBindingQuery.create({
    repositoryIdentity: input.command.input.repositoryIdentity,
  });
  if (bindingQuery.isErr()) return err(bindingQuery.error);
  const binding = await input.dispatch(bindingQuery.value);
  const bindingRecord = binding.isOk() ? asRecord(binding.value) : {};
  const projectId = await resolveFolderLocalProjectId({
    dispatch: input.dispatch,
    command: input.command,
    bindingRecord,
  });
  const providerKey = await resolveFolderLocalProviderKey(
    input.dispatch,
    input.command.input.targetServerId,
  );

  const listed = await listRemoteSandboxes(input.dispatch);
  if (listed.isErr()) return err(listed.error);

  const service = new AgentWorkspaceOpenService(
    createFolderLocalRemoteOpenDependencies({
      dispatch: input.dispatch,
      projectId,
      entries: listed.value,
      repositoryIdentity: input.command.input.repositoryIdentity,
      branch: input.command.input.branch,
      commitSha: input.command.input.commitSha,
      ...(providerKey ? { providerKey } : {}),
    }),
  );

  return service.open(
    createExecutionContext({
      requestId: "req_folder_local_remote_open",
      entrypoint: "cli",
      actor: { kind: "system", id: "cli", label: "appaloft-cli" },
      tenant: { tenantId: "tenant_remote" },
    }),
    input.command.input,
    {
      skipSourceMaterialization: true,
      ...(providerKey ? { placementProviderKey: providerKey } : {}),
    },
  );
}

async function listRemoteSandboxes(
  dispatch: RemoteDispatch,
): Promise<Result<readonly Record<string, unknown>[]>> {
  const query = ListSandboxesQuery.create({ limit: 100, offset: 0 });
  if (query.isErr()) return err(query.error);
  const listed = await dispatch(query.value);
  if (listed.isErr()) return err(listed.error);
  const items = asRecord(listed.value).items;
  return ok(Array.isArray(items) ? items.filter((item) => item && typeof item === "object") : []);
}

async function resolveFolderLocalProjectId(input: {
  readonly dispatch: RemoteDispatch;
  readonly command: OpenAgentWorkspaceCommand;
  readonly bindingRecord: Record<string, unknown>;
}): Promise<string> {
  const listed = await listRemoteProjects(input.dispatch);
  const folderName = input.command.input.repositoryIdentity
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.toLowerCase();
  const named = folderName
    ? listed.find((project) => {
        const name = project.name?.toLowerCase();
        const slug = project.slug?.toLowerCase();
        return name === folderName || slug === folderName;
      })
    : undefined;
  if (named?.id) return named.id;

  const fromBinding =
    readString(input.bindingRecord.projectId) ??
    readString(asRecord(input.bindingRecord.project).id);
  if (fromBinding) return fromBinding;

  return "prj_folder_local";
}

async function resolveFolderLocalProviderKey(
  dispatch: RemoteDispatch,
  targetServerId?: string,
): Promise<string | undefined> {
  if (!targetServerId) return undefined;
  const query = ListServersQuery.create();
  if (query.isErr()) return undefined;
  const listed = await dispatch(query.value);
  if (listed.isErr()) return undefined;
  const items = asRecord(listed.value).items;
  if (!Array.isArray(items)) return undefined;
  const server = items
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .find((item) => readString(item.id) === targetServerId);
  return server ? readString(server.providerKey) : undefined;
}

async function listRemoteProjects(
  dispatch: RemoteDispatch,
): Promise<readonly { readonly id?: string; readonly name?: string; readonly slug?: string }[]> {
  const query = ListProjectsQuery.create({ lifecycleStatus: "active", limit: 100 });
  if (query.isErr()) return [];
  const listed = await dispatch(query.value);
  if (listed.isErr()) return [];
  const items = asRecord(listed.value).items;
  return Array.isArray(items)
    ? items.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = asRecord(item);
        const id = readString(record.id);
        const name = readString(record.name);
        const slug = readString(record.slug);
        return [
          {
            ...(id ? { id } : {}),
            ...(name ? { name } : {}),
            ...(slug ? { slug } : {}),
          },
        ];
      })
    : [];
}

function folderLocalCompiledPin() {
  return {
    ...folderLocalPin,
    capabilities: {
      ...folderLocalPin.capabilities,
      persistentPaths: [...folderLocalPin.capabilities.persistentPaths],
    },
  };
}

function createFolderLocalRemoteOpenDependencies(input: {
  readonly dispatch: RemoteDispatch;
  readonly projectId: string;
  readonly entries: readonly Record<string, unknown>[];
  readonly repositoryIdentity: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly providerKey?: string;
}): WorkspaceOpenDependencies {
  const activation = {
    project: { projectId: input.projectId, disposition: "reused" as const },
    repositoryBinding: { bindingId: "rbd_folder_local", disposition: "reused" as const },
    profile: {
      profileInstallationId: folderLocalPin.profileInstallationId,
      disposition: "reused" as const,
    },
  };
  const preferred = preferredFolderEntry(
    input.entries,
    input.repositoryIdentity,
    input.branch,
    input.commitSha,
  );
  return {
    preflight: {
      resolveContext: async () =>
        ok({
          projectId: input.projectId,
          profileInstallationId: folderLocalPin.profileInstallationId,
          activation,
        }),
      admit: async (_context, resolved) =>
        ok({
          projectId: resolved.projectId,
          profileInstallationId: resolved.profileInstallationId,
          activation: resolved.activation,
          plan: {
            sandbox: {
              source: {
                kind: "template" as const,
                templateId: COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_ID,
              },
              requestedIsolation: "container-trusted" as const,
              limits: { ...COMMUNITY_OCCUPANCY_OPENCODE_LIMITS },
              networkPolicy: COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
            },
            initialization: [],
            runtime: {
              harnessKey: FOLDER_LOCAL_HARNESS_KEY,
              harnessTemplateId: FOLDER_LOCAL_HARNESS_TEMPLATE_ID,
              declarativeHarness: {},
            },
            defaultPorts: [],
            suggestedChecks: [],
            credentialRequirements: [],
            pin: folderLocalCompiledPin(),
          },
          reservation: {
            reservationId: "wres_folder_local",
            targetSelection: {
              targetClass: "registered-server" as const,
              source: "explicit" as const,
              reason: "code_target_server",
            },
          },
        }),
    },
    entries: {
      findByWorkspaceIds: async () => new Map(),
      findByWorkspaceId: async () => undefined,
      findPreferred: async () => preferred,
      findLiveProfileInstallationIds: async () => [],
      begin: async () => ok({ created: true }),
      complete: async () => ok(undefined),
      fail: async () => ok(undefined),
      markWorkspaceTerminated: async (_context, workspaceId) => {
        const command = TerminateSandboxCommand.create({ sandboxId: workspaceId });
        if (command.isErr()) return err(command.error);
        const terminated = await input.dispatch(command.value);
        return terminated.isErr() ? err(terminated.error) : ok({ advanced: true });
      },
    },
    sandboxes: {
      create: async (_context, value) =>
        createRemoteSandbox(input.dispatch, {
          ...((value.providerKey ?? input.providerKey)
            ? { providerKey: value.providerKey ?? input.providerKey }
            : {}),
          ...(value.name ? { name: value.name } : {}),
          ...(value.directoryName ? { directoryName: value.directoryName } : {}),
          ...(value.repositoryIdentity ? { repositoryIdentity: value.repositoryIdentity } : {}),
          ...(value.commitSha ? { commitSha: value.commitSha } : {}),
        }),
      resume: async (_context, workspaceId) => resumeRemoteSandbox(input.dispatch, workspaceId),
      exec: async (_context, _workspaceId, command) => {
        if (isGitSourceArgv(command.argv)) {
          return err(
            domainError.conflict("folder.local occupy must not exec git on the remote disk", {
              code: "workspace_open_folder_local_git_forbidden",
            }),
          );
        }
        return ok({ mode: "foreground", frames: [{ kind: "exit", exitCode: 0 }] });
      },
      exposePort: async () => ok(undefined),
    },
    agents: {
      showRuntime: async (_context, value) =>
        ok(runtimeDescriptor(value.sandboxId, value.runtimeId)),
      createRuntime: async (_context, value) =>
        createRemoteRuntime(input.dispatch, value.sandboxId, value.projectId),
      ensureRuntime: async () => ok(undefined),
      attach: async () =>
        err(
          domainError.conflict("folder.local --no-attach must not attach", {
            code: "workspace_open_folder_local_attach_forbidden",
          }),
        ),
    },
    reservations: {
      consume: async () => ok(undefined),
      release: async () => ok(undefined),
    },
    now: () => new Date().toISOString(),
  };
}

function preferredFolderEntry(
  items: readonly Record<string, unknown>[],
  repositoryIdentity: string,
  branch: string,
  commitSha: string,
): WorkspaceOpenEntry | undefined {
  const match = items.find((item) => {
    const occupancy = asRecord(item.occupancy);
    const identity =
      readString(occupancy.repositoryIdentity) ??
      readString(item.repositoryIdentity) ??
      identityFromRepository(readString(occupancy.repository) ?? readString(item.repository));
    const occupancyBranch = readString(occupancy.branch) ?? readString(item.branch);
    return (
      identity === repositoryIdentity &&
      (occupancyBranch === branch || occupancyBranch === undefined) &&
      readString(item.status) !== "terminated" &&
      readString(item.status) !== "failed"
    );
  });
  if (!match) return undefined;
  const workspaceId = readString(match.sandboxId) ?? readString(match.id);
  const occupancySha = readString(asRecord(match.occupancy).commitSha) ?? commitSha;
  if (!workspaceId) return undefined;
  const status = readString(match.status);
  const runtimeId = readString(match.runtimeId);
  return {
    workspaceId,
    ...(runtimeId ? { runtimeId } : {}),
    commitSha: occupancySha,
    profileInstallationId: folderLocalPin.profileInstallationId,
    status: status === "ready" || status === "terminal" ? status : "partial",
    phase: "workspace-open-source-materialization",
    repositoryIdentity,
    branch,
    targetSelection: {
      targetClass: "registered-server",
      source: "explicit",
      reason: "code_target_server",
    },
  };
}

function identityFromRepository(repository?: string): string | undefined {
  if (!repository) return undefined;
  try {
    const url = new URL(repository);
    return url.hostname === "folder.local" || url.hostname.endsWith(".folder.local")
      ? `${url.hostname}${url.pathname}`.replace(/\.git$/u, "")
      : undefined;
  } catch {
    return undefined;
  }
}

function sandboxDisplayNameFromRecord(record: Record<string, unknown>, fallback: string): string {
  const named = readString(record.name);
  if (named && !named.toLowerCase().startsWith("sbx_")) return named;
  return fallback;
}

async function createRemoteSandbox(
  dispatch: RemoteDispatch,
  input: {
    readonly providerKey?: string;
    readonly name?: string;
    readonly directoryName?: string;
    readonly repositoryIdentity?: string;
    readonly commitSha?: string;
  },
): Promise<Result<{ sandboxId: string; name: string; status: string }>> {
  const command = CreateSandboxCommand.create({
    source: { kind: "template", templateId: COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_ID },
    requestedIsolation: "container-trusted",
    limits: { ...COMMUNITY_OCCUPANCY_OPENCODE_LIMITS },
    networkPolicy: COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
    ...(input.providerKey ? { providerKey: input.providerKey } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.directoryName ? { directoryName: input.directoryName } : {}),
    ...(input.repositoryIdentity ? { repositoryIdentity: input.repositoryIdentity } : {}),
    ...(input.commitSha ? { commitSha: input.commitSha } : {}),
  });
  if (command.isErr()) return err(command.error);
  const created = await dispatch(command.value);
  if (created.isErr()) return err(created.error);
  const record = asRecord(created.value);
  const sandboxId = readString(record.sandboxId) ?? readString(record.id);
  if (!sandboxId) {
    return err(
      domainError.invariant("Sandbox create did not return a sandboxId", {
        code: "workspace_open_folder_local_sandbox_missing",
      }),
    );
  }
  return ok({
    sandboxId,
    name: sandboxDisplayNameFromRecord(record, input.directoryName ?? input.name ?? "workspace"),
    status: readString(record.status) ?? "ready",
  });
}

async function resumeRemoteSandbox(
  dispatch: RemoteDispatch,
  workspaceId: string,
): Promise<Result<{ sandboxId: string; name: string; status: string }>> {
  const command = ResumeSandboxCommand.create({ sandboxId: workspaceId });
  if (command.isErr()) return err(command.error);
  const resumed = await dispatch(command.value);
  if (resumed.isErr()) return err(resumed.error);
  const record = asRecord(resumed.value);
  return ok({
    sandboxId: readString(record.sandboxId) ?? workspaceId,
    name: sandboxDisplayNameFromRecord(record, "workspace"),
    status: readString(record.status) ?? "ready",
  });
}

async function createRemoteRuntime(
  dispatch: RemoteDispatch,
  sandboxId: string,
  projectId: string,
): Promise<Result<ReturnType<typeof runtimeDescriptor>>> {
  const command = CreateSandboxAgentRuntimeCommand.create({
    sandboxId,
    harnessKey: FOLDER_LOCAL_HARNESS_KEY,
    harnessTemplateId: FOLDER_LOCAL_HARNESS_TEMPLATE_ID,
    idempotencyKey: `folder-local:${sandboxId}`,
    projectId,
  });
  if (command.isErr()) return err(command.error);
  const created = await dispatch(command.value);
  if (created.isErr()) return err(created.error);
  const record = asRecord(created.value);
  const runtimeId = readString(record.runtimeId) ?? readString(record.id) ?? `sar_${sandboxId}`;
  return ok(runtimeDescriptor(sandboxId, runtimeId));
}

function runtimeDescriptor(sandboxId: string, runtimeId: string) {
  const pin = folderLocalCompiledPin();
  return {
    runtimeId,
    sandboxId,
    harnessKey: FOLDER_LOCAL_HARNESS_KEY,
    harnessTemplateId: FOLDER_LOCAL_HARNESS_TEMPLATE_ID,
    status: "ready",
    profilePin: pin,
    capabilities: pin.capabilities,
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

export function folderLocalRemoteOpenRejectedGit(error: DomainError): boolean {
  return error.details?.code === "workspace_open_folder_local_git_forbidden";
}
