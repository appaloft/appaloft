import {
  AgentWorkspaceOpenService,
  COMMUNITY_OCCUPANCY_OPENCODE_LIMITS,
  COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_DIGEST,
  COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_ID,
  COMMUNITY_OCCUPANCY_OPENCODE_VERSION,
  COMMUNITY_OCCUPANCY_PI_LIMITS,
  COMMUNITY_OCCUPANCY_PI_PROFILE_ID,
  COMMUNITY_OCCUPANCY_PI_TEMPLATE_DIGEST,
  COMMUNITY_OCCUPANCY_PI_TEMPLATE_ID,
  COMMUNITY_OCCUPANCY_PI_VERSION,
  COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
  type Command,
  CreateSandboxAgentRuntimeCommand,
  CreateSandboxCommand,
  createExecutionContext,
  IssueSandboxAgentAttachAccessCommand,
  ListProjectsQuery,
  ListSandboxesQuery,
  ListServersQuery,
  OpenAgentWorkspaceCommand,
  occupancyRemoteProfileId,
  type Query,
  ResumeSandboxCommand,
  type SandboxAgentAttachDescriptor,
  ShowRepositoryBindingQuery,
  shouldSkipWorkspaceSourceMaterialization,
  TerminateSandboxCommand,
  type WorkspaceOpenDependencies,
  type WorkspaceOpenEntry,
  type WorkspaceOpenInput,
  type WorkspaceOpenResult,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";

type RemoteDispatch = <T>(message: Command<T> | Query<T>) => Promise<Result<T>>;

const FOLDER_LOCAL_OPENCODE_HARNESS = {
  harnessKey: "opencode",
  harnessTemplateId: "aht_opencode_managed_v1",
  sandboxTemplateId: COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_ID,
  sandboxTemplateVersion: COMMUNITY_OCCUPANCY_OPENCODE_VERSION,
  sandboxTemplateDigest: COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_DIGEST,
  limits: COMMUNITY_OCCUPANCY_OPENCODE_LIMITS,
} as const;
const FOLDER_LOCAL_PI_HARNESS = {
  harnessKey: "pi",
  harnessTemplateId: "aht_pi_managed_v1",
  sandboxTemplateId: COMMUNITY_OCCUPANCY_PI_TEMPLATE_ID,
  sandboxTemplateVersion: COMMUNITY_OCCUPANCY_PI_VERSION,
  sandboxTemplateDigest: COMMUNITY_OCCUPANCY_PI_TEMPLATE_DIGEST,
  limits: COMMUNITY_OCCUPANCY_PI_LIMITS,
} as const;

function folderLocalHarnessForProfile(profile?: string) {
  return profile === COMMUNITY_OCCUPANCY_PI_PROFILE_ID || profile === occupancyRemoteProfileId("pi")
    ? FOLDER_LOCAL_PI_HARNESS
    : FOLDER_LOCAL_OPENCODE_HARNESS;
}

function folderLocalPinFor(profile?: string) {
  const harness = folderLocalHarnessForProfile(profile);
  return {
    profileInstallationId: "awpi_folder_local",
    profileDefinitionDigest: `sha256:${"a".repeat(64)}`,
    profileId: occupancyRemoteProfileId(harness.harnessKey),
    profileVersion: "1.0.0",
    adapterInstallationId: "aai_folder_local",
    adapterDefinitionDigest: `sha256:${"b".repeat(64)}`,
    adapterId: harness.harnessKey,
    adapterVersion: "1.0.0",
    harnessKey: harness.harnessKey,
    harnessTemplateId: harness.harnessTemplateId,
    sandboxTemplateId: harness.sandboxTemplateId,
    sandboxTemplateVersion: harness.sandboxTemplateVersion,
    sandboxTemplateDigest: harness.sandboxTemplateDigest,
    capabilities: {
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: false,
      persistentPaths: ["/workspace"],
    },
  };
}

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

function isWorkspaceOpenInput(value: unknown): value is WorkspaceOpenInput {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.repository === "string" &&
    typeof record.repositoryIdentity === "string" &&
    typeof record.ref === "string" &&
    typeof record.branch === "string" &&
    typeof record.commitSha === "string"
  );
}

function workspaceOpenInputFromMessage(message: unknown): WorkspaceOpenInput | undefined {
  if (message instanceof OpenAgentWorkspaceCommand) return message.input;
  if (!message || typeof message !== "object" || !("input" in message)) return undefined;
  const input = (message as { input: unknown }).input;
  return isWorkspaceOpenInput(input) ? input : undefined;
}

export function isFolderLocalWorkspaceOpenCommand(
  message: unknown,
): message is OpenAgentWorkspaceCommand {
  const input = workspaceOpenInputFromMessage(message);
  return Boolean(input && shouldSkipWorkspaceSourceMaterialization(input));
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
      ...(input.command.input.profile ? { profile: input.command.input.profile } : {}),
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

function folderLocalCompiledPin(profile?: string) {
  const pin = folderLocalPinFor(profile);
  return {
    ...pin,
    capabilities: {
      ...pin.capabilities,
      persistentPaths: [...pin.capabilities.persistentPaths],
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
  readonly profile?: string;
  readonly providerKey?: string;
}): WorkspaceOpenDependencies {
  const pin = folderLocalCompiledPin(input.profile);
  const harness = folderLocalHarnessForProfile(input.profile);
  const activation = {
    project: { projectId: input.projectId, disposition: "reused" as const },
    repositoryBinding: { bindingId: "rbd_folder_local", disposition: "reused" as const },
    profile: {
      profileInstallationId: pin.profileInstallationId,
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
          profileInstallationId: pin.profileInstallationId,
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
                templateId: harness.sandboxTemplateId,
              },
              requestedIsolation: "container-trusted" as const,
              limits: { ...harness.limits },
              networkPolicy: COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
            },
            initialization: [],
            runtime: {
              harnessKey: harness.harnessKey,
              harnessTemplateId: harness.harnessTemplateId,
              declarativeHarness: {},
            },
            defaultPorts: [],
            suggestedChecks: [],
            credentialRequirements: [],
            pin,
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
          templateId: harness.sandboxTemplateId,
          limits: harness.limits,
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
        ok(runtimeDescriptor(value.sandboxId, value.runtimeId, input.profile)),
      createRuntime: async (_context, value) =>
        createRemoteRuntime(input.dispatch, value.sandboxId, value.projectId, input.profile),
      ensureRuntime: async () => ok(undefined),
      attach: async (_context, value) =>
        issueRemoteAttach(input.dispatch, value.sandboxId, value.runtimeId, value.expiresAt),
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
    profileInstallationId: folderLocalPinFor().profileInstallationId,
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
    readonly templateId: string;
    readonly limits: typeof COMMUNITY_OCCUPANCY_OPENCODE_LIMITS;
    readonly providerKey?: string;
    readonly name?: string;
    readonly directoryName?: string;
    readonly repositoryIdentity?: string;
    readonly commitSha?: string;
  },
): Promise<Result<{ sandboxId: string; name: string; status: string }>> {
  const command = CreateSandboxCommand.create({
    source: { kind: "template", templateId: input.templateId },
    requestedIsolation: "container-trusted",
    limits: { ...input.limits },
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
  profile?: string,
): Promise<Result<ReturnType<typeof runtimeDescriptor>>> {
  const harness = folderLocalHarnessForProfile(profile);
  const command = CreateSandboxAgentRuntimeCommand.create({
    sandboxId,
    harnessKey: harness.harnessKey,
    harnessTemplateId: harness.harnessTemplateId,
    idempotencyKey: `folder-local:${sandboxId}`,
    projectId,
  });
  if (command.isErr()) return err(command.error);
  const created = await dispatch(command.value);
  if (created.isErr()) return err(created.error);
  const record = asRecord(created.value);
  const runtimeId = readString(record.runtimeId) ?? readString(record.id) ?? `sar_${sandboxId}`;
  return ok(runtimeDescriptor(sandboxId, runtimeId, profile));
}

async function issueRemoteAttach(
  dispatch: RemoteDispatch,
  sandboxId: string,
  runtimeId: string,
  expiresAt: string,
): Promise<Result<SandboxAgentAttachDescriptor>> {
  const command = IssueSandboxAgentAttachAccessCommand.create({
    sandboxId,
    runtimeId,
    expiresAt,
  });
  if (command.isErr()) return err(command.error);
  const issued = await dispatch(command.value);
  if (issued.isErr()) return err(issued.error);
  const record = asRecord(issued.value);
  const transport = readString(record.transport);
  const sessionId = readString(record.sessionId);
  const processId = readString(record.processId);
  const access = asRecord(record.access);
  if (transport === "managed-terminal" && sessionId && processId && readString(access.path)) {
    return ok({
      workspaceId: readString(record.workspaceId) ?? sandboxId,
      runtimeId: readString(record.runtimeId) ?? runtimeId,
      transport: "managed-terminal",
      sessionId,
      processId,
      access: {
        kind: "websocket",
        path: readString(access.path) ?? "",
        expiresAt: readString(access.expiresAt) ?? expiresAt,
      },
    });
  }
  if (transport === "native-attach") {
    return ok(issued.value as SandboxAgentAttachDescriptor);
  }
  return err(
    domainError.conflict("folder.local attach did not return a usable session", {
      code: "workspace_open_folder_local_attach_unsupported",
    }),
  );
}

function runtimeDescriptor(sandboxId: string, runtimeId: string, profile?: string) {
  const pin = folderLocalCompiledPin(profile);
  const harness = folderLocalHarnessForProfile(profile);
  return {
    runtimeId,
    sandboxId,
    harnessKey: harness.harnessKey,
    harnessTemplateId: harness.harnessTemplateId,
    status: "ready",
    profilePin: pin,
    capabilities: pin.capabilities,
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

export function folderLocalRemoteOpenRejectedGit(error: DomainError): boolean {
  return error.details?.code === "workspace_open_folder_local_git_forbidden";
}
