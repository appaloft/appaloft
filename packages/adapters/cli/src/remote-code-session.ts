import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import { type DomainError } from "@appaloft/core";
import { hasCliControlPlaneLogin, workspaceRemoteLoginRequiredError } from "./cli-session-login.js";
import { activeControlPlaneProfile } from "./control-plane-service.js";
import {
  folderOccupancyCommitSha,
  folderOccupancyLocator,
  gitOccupancyLocator,
  isFolderOccupancyIdentity,
} from "./folder-project-link.js";
import { type FolderOnboardingResult } from "./folder-project-onboarding.js";
import {
  normalizeWorkspaceRepositoryRemote,
  type RemoteGitWorkspaceRef,
  type ResolveGitWorkspaceProgress,
  resolveLocalGitWorkspaceContext,
  resolveRemoteGitWorkspaceRef,
  type WorkspaceGitCommandRunner,
} from "./local-git-workspace-context.js";
import {
  occupancyChromeProjectName,
  occupancyConnectionsUrl,
  occupancyGitHubCompareUrl,
  occupancyGitHubPullRequestUrl,
} from "./occupancy-chrome.js";
import { OCCUPANCY_CODE_PROGRESS } from "./occupancy-code-progress.js";

export const WORKSPACE_GIT_DISCOVERY_TIMEOUT_MS = 3_000;

export const REMOTE_CODE_BANNER_PREFIX = "Remote ·";
export const REMOTE_CODE_DOOR_HINT =
  "Open · --open-target preview|production|pr|compare|connections · workspace p/P/o/c/g";
export const REMOTE_CODE_MODEL_HINT =
  "Connect a model in OpenCode with /connect before running a Task.";
export function formatRemoteCodeGitHubHint(baseUrl?: string): string {
  const origin = baseUrl?.trim().replace(/\/+$/, "") ?? "";
  const connections = origin === "" ? "/account/connections" : `${origin}/account/connections`;
  return `GitHub PR · connect repo at ${connections} or install the App with contents/PR write.`;
}

export const REMOTE_CODE_GITHUB_HINT = formatRemoteCodeGitHubHint();

export async function resolveRemoteCodeGitHubHint(): Promise<string> {
  const profile = await activeControlPlaneProfile();
  if (profile.isErr() || !profile.value?.baseUrl) {
    return REMOTE_CODE_GITHUB_HINT;
  }
  return formatRemoteCodeGitHubHint(profile.value.baseUrl);
}

export async function writeOccupancySessionHints(
  write: (text: string) => void = (text) => {
    process.stdout.write(text);
  },
): Promise<void> {
  write(`${REMOTE_CODE_MODEL_HINT}\n`);
  write(`${await resolveRemoteCodeGitHubHint()}\n`);
}

export async function resolveOccupancyConnectionsUrl(): Promise<string | undefined> {
  const profile = await activeControlPlaneProfile();
  if (profile.isErr() || !profile.value?.baseUrl) return undefined;
  return occupancyConnectionsUrl(profile.value.baseUrl);
}

export function nativeAttachRequiresInteractiveTerminal(
  stdin: { readonly isTTY?: boolean } = process.stdin,
  stdout: { readonly isTTY?: boolean } = process.stdout,
): boolean {
  return Boolean(stdin.isTTY && stdout.isTTY);
}

export interface RemoteCodeDoorResolution {
  readonly repository: string;
  readonly repositoryIdentity: string;
  readonly ref: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly projectId: string;
  readonly projectName?: string;
  readonly serverId: string;
  readonly serverName: string;
  readonly serverProviderKey?: string;
}
export type RemoteCodeDoorResolver = (path?: string) => Promise<RemoteCodeDoorResolution>;

export interface RemoteCodeServerSummary {
  readonly id: string;
  readonly name: string;
  readonly lifecycleStatus?: string;
  readonly providerKey?: string;
  readonly runtimeAvailability?: {
    readonly status?: string;
  };
}

export interface RemoteCodeBinding {
  readonly projectId: string;
  readonly status: string;
}

export interface RemoteCodeOccupancy {
  readonly sandboxId: string;
  readonly status: string;
  readonly occupancy?: {
    readonly repositoryIdentity: string;
    readonly commitSha: string;
    readonly branch?: string;
  };
  readonly lastActivityAt?: string;
  readonly updatedAt?: string;
}

export interface RemoteCodeDoorProbe {
  readonly env?: NodeJS.ProcessEnv;
  readonly explicitServerId?: string;
  readonly forceNew?: boolean;
  readonly readActiveProfile?: () => Promise<{ readonly auth?: unknown } | null>;
  readonly listServers?: () => Promise<readonly RemoteCodeServerSummary[]>;
  readonly showBinding?: (repositoryIdentity: string) => Promise<RemoteCodeBinding | null>;
  readonly listOccupancies?: () => Promise<readonly RemoteCodeOccupancy[]>;
  readonly resolveLocator?: () => Promise<{
    readonly repository: string;
    readonly repositoryIdentity: string;
    readonly ref: string;
    readonly branch: string;
  }>;
  readonly resolveRemoteRef?: (repository: string, ref: string) => Promise<RemoteGitWorkspaceRef>;
  readonly runGit?: WorkspaceGitCommandRunner;
  readonly onProgress?: (message: string) => void;
  readonly folderOnboarding?: FolderOnboardingResult;
  readonly ensureFolderOnboarding?: () => Promise<FolderOnboardingResult>;
  readonly folderCwd?: string;
}

export function hasRemoteCodeLogin(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.APPALOFT_TOKEN?.trim() ||
      env.APPALOFT_AUTHORIZATION?.trim() ||
      env.APPALOFT_AUTH_COOKIE?.trim(),
  );
}

export function remoteOccupyBannerProjectId(input: {
  readonly repositoryIdentity: string;
  readonly doorProjectId: string;
  readonly resultProjectId?: string;
}): string {
  const door = input.doorProjectId.trim();
  const result = input.resultProjectId?.trim();
  if (isFolderOccupancyIdentity(input.repositoryIdentity) && door && door !== "project") {
    return door;
  }
  return result || door;
}

export function formatRemoteCodeBanner(input: {
  readonly projectId?: string;
  readonly repositoryIdentity: string;
  readonly commitSha: string;
  readonly serverName: string;
  readonly workspaceId?: string;
  readonly previewUrl?: string;
  readonly productionUrl?: string;
  readonly pullRequestNumber?: number;
  readonly branch?: string;
}): string {
  const sha = input.commitSha.slice(0, 7);
  const project = input.projectId?.trim() || "project";
  const occupancy = input.workspaceId?.trim()
    ? `my sandbox · ${input.workspaceId.trim()}`
    : "my sandbox";
  const lines = [
    `Remote · ${project} · ${input.repositoryIdentity}@${sha} · ${input.serverName} · ${occupancy}`,
  ];
  const preview = input.previewUrl?.trim();
  if (preview) lines.push(`Preview · ${preview}`);
  const production = input.productionUrl?.trim();
  if (production) lines.push(`Production · ${production}`);
  if (
    typeof input.pullRequestNumber === "number" &&
    Number.isInteger(input.pullRequestNumber) &&
    input.pullRequestNumber > 0
  ) {
    const pullUrl = occupancyGitHubPullRequestUrl(
      {
        repositoryIdentity: input.repositoryIdentity,
        commitSha: input.commitSha,
      },
      input.pullRequestNumber,
    );
    lines.push(
      pullUrl ? `PR #${input.pullRequestNumber} · ${pullUrl}` : `PR #${input.pullRequestNumber}`,
    );
  } else {
    const compare = occupancyGitHubCompareUrl({
      repositoryIdentity: input.repositoryIdentity,
      commitSha: input.commitSha,
      ...(input.branch ? { branch: input.branch } : {}),
    });
    if (compare) lines.push(`Compare · ${compare}`);
  }
  return lines.join("\n");
}

function remoteCodeError(
  code: string,
  message: string,
  details: DomainError["details"],
): DomainError {
  return {
    code,
    category: "user",
    message,
    retryable: false,
    ...(details ? { details } : {}),
  };
}

export interface WorkspaceOpenSource {
  readonly repositoryIdentity: string;
  readonly credentialFreeHttpsRepository: string;
  readonly ref: string;
  readonly branch: string;
  readonly headSha: string;
}

export interface ResolveWorkspaceOpenSourceOptions extends ResolveGitWorkspaceProgress {}

export function folderHasGitWorktree(
  selectedPath: string,
  _homeDir = process.env.HOME?.trim() || homedir(),
): boolean {
  const current = resolve(selectedPath.trim() || ".");
  return existsSync(join(current, ".git"));
}

export function workspaceGitDiscoveryCeiling(
  selectedPath: string,
  homeDir = process.env.HOME?.trim() || homedir(),
): string | undefined {
  const home = homeDir.trim();
  if (!home) return undefined;
  const resolvedHome = resolve(home);
  const resolvedPath = resolve(selectedPath.trim() || ".");
  if (resolvedPath === resolvedHome) return undefined;
  const prefix = resolvedHome.endsWith(sep) ? resolvedHome : `${resolvedHome}${sep}`;
  if (!resolvedPath.startsWith(prefix)) return undefined;
  return resolvedHome;
}

function remoteCodeGitEnv(ceiling?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    ...(ceiling ? { GIT_CEILING_DIRECTORIES: ceiling } : {}),
  };
}

export function isWorkspaceGitRootUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { details?: { code?: unknown }; message?: unknown };
  return (
    record.details?.code === "workspace_git_root_unavailable" ||
    record.message === "Workspace path is not inside a Git worktree"
  );
}

function workspaceLocatorMissingError(
  message: string,
  phase: string,
  guidance: string,
): DomainError {
  return remoteCodeError("workspace_remote_repository_missing", message, {
    phase,
    guidance,
  });
}

function throwWorkspaceLocatorMissing(
  error: unknown,
  phase: "workspace-open-locator" | "remote-code-locator",
): never {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "workspace_remote_repository_missing" && !isWorkspaceGitRootUnavailable(error)) {
      throw error;
    }
  }
  if (phase === "workspace-open-locator") {
    throw workspaceLocatorMissingError(
      "Workspace open needs a git remote for this directory",
      phase,
      "Pass a git remote such as https://github.com/org/repo.git, or run from this folder's Git worktree. Do not reuse another folder's sandbox.",
    );
  }
  throw workspaceLocatorMissingError(
    "Remote code needs a Git repository with an origin or a git remote locator",
    phase,
    "Run appaloft code <git-remote> for this folder, or run from this folder's Git worktree. Do not reuse another folder's sandbox.",
  );
}

export async function resolveWorkspaceOpenSource(
  path = ".",
  runGit?: WorkspaceGitCommandRunner,
  options: ResolveWorkspaceOpenSourceOptions = {},
): Promise<WorkspaceOpenSource> {
  if (isRemoteCodeGitRemoteLocator(path)) {
    const locator = await resolveRemoteCodeGitRemoteLocator(path, runGit);
    const remote = await resolveRemoteGitWorkspaceRef(
      locator.repository,
      locator.ref,
      runGit,
      options,
    );
    return {
      repositoryIdentity: remote.repositoryIdentity,
      credentialFreeHttpsRepository: remote.credentialFreeHttpsRepository,
      ref: remote.ref,
      branch: locator.branch,
      headSha: remote.commitSha,
    };
  }

  try {
    const local = await resolveLocalGitWorkspaceContext(path, runGit, options);
    return {
      repositoryIdentity: local.repositoryIdentity,
      credentialFreeHttpsRepository: local.credentialFreeHttpsRepository,
      ref: local.ref,
      branch: local.branch,
      headSha: local.headSha,
    };
  } catch (error) {
    if (!isWorkspaceGitRootUnavailable(error)) throw error;
    throwWorkspaceLocatorMissing(error, "workspace-open-locator");
  }
}

export function isRemoteCodeGitRemoteLocator(value: string): boolean {
  const locator = value.trim();
  if (!locator || locator.includes("\0") || /[\r\n]/u.test(locator)) return false;
  if (locator.startsWith("https://") || locator.startsWith("ssh://")) return true;
  if (/^git@[^/\s]+:.+$/u.test(locator)) return true;
  return isGitHubOwnerRepoLocator(locator);
}

function isGitHubOwnerRepoLocator(value: string): boolean {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/u.test(value)) return false;
  try {
    return !(existsSync(value) && statSync(value).isDirectory());
  } catch {
    return true;
  }
}

function expandRemoteCodeGitRemoteLocator(value: string): string {
  const locator = value.trim();
  if (isGitHubOwnerRepoLocator(locator)) {
    const slug = locator.replace(/\.git$/u, "");
    return `https://github.com/${slug}.git`;
  }
  return locator;
}

export function selectDefaultRemoteCodeServer(
  servers: readonly RemoteCodeServerSummary[] | undefined,
): RemoteCodeServerSummary | undefined {
  const active = (servers ?? []).filter(
    (server) => (server.lifecycleStatus ?? "active") === "active",
  );
  return active.find((server) => server.runtimeAvailability?.status === "available") ?? active[0];
}

export function selectWorkspaceOpenTargetServerId(input: {
  readonly explicit?: string;
  readonly servers?: readonly RemoteCodeServerSummary[];
}): string | undefined {
  const explicit = input.explicit?.trim();
  if (explicit) return explicit;
  return selectDefaultRemoteCodeServer(input.servers)?.id;
}

export function resolveRemoteCodeDoorServer(
  servers: readonly RemoteCodeServerSummary[] | undefined,
  explicitServerId?: string,
): RemoteCodeServerSummary | undefined {
  const selectedId = selectWorkspaceOpenTargetServerId({
    ...(servers ? { servers } : {}),
    ...(explicitServerId?.trim() ? { explicit: explicitServerId } : {}),
  });
  if (!selectedId) return undefined;
  const named = (servers ?? []).find((server) => server.id === selectedId);
  return named ?? { id: selectedId, name: selectedId };
}

export function pinRemoteCodeDoorServer(
  door: RemoteCodeDoorResolution,
  explicitServerId?: string,
  servers: readonly RemoteCodeServerSummary[] = [],
): RemoteCodeDoorResolution {
  const pinned = resolveRemoteCodeDoorServer(servers, explicitServerId);
  if (!pinned || !explicitServerId?.trim()) return door;
  return {
    ...door,
    serverId: pinned.id,
    serverName: pinned.name,
  };
}

export function selectResumeOccupancy(
  occupancies: readonly RemoteCodeOccupancy[] | undefined,
): RemoteCodeOccupancy | undefined {
  return [...(occupancies ?? [])]
    .filter(
      (item) =>
        item.status !== "terminated" &&
        item.status !== "failed" &&
        Boolean(item.occupancy?.repositoryIdentity) &&
        Boolean(item.occupancy?.commitSha),
    )
    .sort((left, right) => {
      const leftAt = left.lastActivityAt ?? left.updatedAt ?? "";
      const rightAt = right.lastActivityAt ?? right.updatedAt ?? "";
      return rightAt.localeCompare(leftAt);
    })[0];
}

export function scratchRemoteRejectedError(): DomainError {
  return remoteCodeError("workspace_scratch_remote_rejected", "Scratch cannot open a git remote", {
    phase: "scratch-path",
    guidance:
      "Use appaloft code <git-remote> without --local, or appaloft code --local in a local directory.",
  });
}

export function occupancyCloudCompatError(
  error: DomainError,
  server: { readonly id: string; readonly name: string },
): DomainError {
  if (error.details?.code === "workspace_open_repository_not_bound") return error;
  if (error.code === "workspace_open_repository_not_bound") return error;
  const unstructured =
    error.message === "Input validation failed" &&
    (error.code === "bad_request" || error.code === "validation_error") &&
    (error.details?.phase === "orpc-error-normalization" ||
      error.details?.orpcCode === "BAD_REQUEST");
  if (!unstructured) return error;
  return remoteCodeError(
    "workspace_open_target_server_unsupported",
    `This Cloud does not accept Server targeting for ${server.name} (${server.id})`,
    {
      phase: "remote-code-cloud-compat",
      serverId: server.id,
      serverName: server.name,
      guidance:
        "Deploy a Cloud that accepts workspaces.open targetServerId, then retry. Do not retry without the enrolled Server.",
    },
  );
}

export async function resolveDefaultRemoteCodeDoor(
  probe: RemoteCodeDoorProbe = {},
  path = ".",
): Promise<RemoteCodeDoorResolution> {
  const env = probe.env ?? process.env;
  probe.onProgress?.(OCCUPANCY_CODE_PROGRESS.checkingLogin);
  if (!(await hasCliControlPlaneLogin(env, probe.readActiveProfile))) {
    throw workspaceRemoteLoginRequiredError();
  }

  probe.onProgress?.(OCCUPANCY_CODE_PROGRESS.lookingUpServers);
  const servers = probe.listServers ? await probe.listServers() : [];
  const server = resolveRemoteCodeDoorServer(servers, probe.explicitServerId);
  if (!server) {
    throw remoteCodeError(
      "workspace_remote_server_missing",
      "No enrolled Server is available for a remote Agent session",
      {
        phase: "remote-code-server",
        guidance: "Enroll this Mac or a VPS with appaloft server enroll, then retry.",
      },
    );
  }
  probe.onProgress?.(OCCUPANCY_CODE_PROGRESS.choosingOccupancy);
  const occupancies = probe.listOccupancies ? await probe.listOccupancies() : [];
  const explicitRemote = isRemoteCodeGitRemoteLocator(path)
    ? await resolveRemoteCodeGitRemoteLocator(path, probe.runGit)
    : undefined;
  const homeDir = probe.env?.HOME ?? process.env.HOME;
  const folderCwd = probe.folderCwd ?? (explicitRemote ? process.cwd() : path);
  const thisFolderGit = folderHasGitWorktree(path, homeDir);
  if (probe.forceNew && !explicitRemote && !thisFolderGit) {
    throwWorkspaceLocatorMissing(undefined, "remote-code-locator");
  }
  const probeThisFolderGit = Boolean(explicitRemote) || thisFolderGit;
  let folderOnboarding = explicitRemote ? undefined : probe.folderOnboarding;
  const loadFolderOnboarding = async () => {
    if (folderOnboarding || explicitRemote) return folderOnboarding;
    folderOnboarding = await probe.ensureFolderOnboarding?.();
    return folderOnboarding;
  };
  let localLocator:
    | {
        readonly repository: string;
        readonly repositoryIdentity: string;
        readonly ref: string;
        readonly branch: string;
      }
    | undefined;
  let localLocatorError: unknown;
  let announcedRepository = false;
  if (!explicitRemote && probeThisFolderGit) {
    probe.onProgress?.(OCCUPANCY_CODE_PROGRESS.resolvingRepository);
    announcedRepository = true;
    try {
      localLocator = probe.resolveLocator
        ? await probe.resolveLocator()
        : await resolveRemoteCodeLocator(
            path,
            probe.runGit,
            homeDir === undefined ? {} : { homeDir },
          );
    } catch (error) {
      localLocatorError = error;
      const onboarded = await loadFolderOnboarding();
      if (onboarded && !isFolderOccupancyIdentity(onboarded.identity)) {
        localLocator = gitOccupancyLocator(onboarded.identity);
        localLocatorError = undefined;
      }
    }
  }
  const requestedLocator = explicitRemote ?? localLocator;
  const matchingOccupancyFor = (identity: string | undefined) =>
    identity
      ? selectResumeOccupancy(
          occupancies.filter((item) => item.occupancy?.repositoryIdentity === identity),
        )
      : undefined;
  let locator: {
    readonly repository: string;
    readonly repositoryIdentity: string;
    readonly ref: string;
    readonly branch: string;
  };
  let occupancyResume: RemoteCodeOccupancy["occupancy"];
  if (requestedLocator) {
    locator = requestedLocator;
    const matchingOccupancy = matchingOccupancyFor(requestedLocator.repositoryIdentity);
    if (!probe.forceNew && matchingOccupancy?.occupancy) {
      occupancyResume = matchingOccupancy.occupancy;
    }
  } else {
    const onboarded = await loadFolderOnboarding();
    if (onboarded) {
      locator = isFolderOccupancyIdentity(onboarded.identity)
        ? {
            ...folderOccupancyLocator(
              onboarded.identity.split("/").filter(Boolean).at(-1) ?? "app",
            ),
            repositoryIdentity: onboarded.identity,
            repository: `https://${onboarded.identity}.git`,
          }
        : gitOccupancyLocator(onboarded.identity);
      const matchingOccupancy = matchingOccupancyFor(locator.repositoryIdentity);
      if (!probe.forceNew && matchingOccupancy?.occupancy) {
        occupancyResume = matchingOccupancy.occupancy;
      }
    } else {
      throwWorkspaceLocatorMissing(localLocatorError, "remote-code-locator");
    }
  }

  if (!occupancyResume && !announcedRepository) {
    probe.onProgress?.(OCCUPANCY_CODE_PROGRESS.resolvingRepository);
  }

  const binding = probe.showBinding ? await probe.showBinding(locator.repositoryIdentity) : null;
  let remote: RemoteGitWorkspaceRef;
  if (isFolderOccupancyIdentity(locator.repositoryIdentity)) {
    remote = {
      repositoryIdentity: locator.repositoryIdentity,
      credentialFreeHttpsRepository: locator.repository,
      ref: locator.ref,
      commitSha: folderOccupancyCommitSha(folderCwd),
    };
  } else if (occupancyResume) {
    remote = {
      repositoryIdentity: locator.repositoryIdentity,
      credentialFreeHttpsRepository: locator.repository,
      ref: locator.ref,
      commitSha: occupancyResume.commitSha,
    };
  } else {
    remote =
      probe.resolveRemoteRef === undefined
        ? await resolveRemoteCodeRef(locator, probe.runGit)
        : await probe.resolveRemoteRef(locator.repository, locator.ref);
  }

  const projectId =
    folderOnboarding?.projectId && folderOnboarding.identity === locator.repositoryIdentity
      ? folderOnboarding.projectId
      : binding?.status === "active"
        ? binding.projectId
        : "project";
  const projectName = occupancyChromeProjectName({
    ...(folderOnboarding?.projectName ? { projectName: folderOnboarding.projectName } : {}),
    projectId,
    repositoryIdentity: locator.repositoryIdentity,
  });
  return {
    repository: remote.credentialFreeHttpsRepository,
    repositoryIdentity: remote.repositoryIdentity,
    ref: remote.ref,
    branch: locator.branch,
    commitSha: remote.commitSha,
    projectId,
    ...(projectName ? { projectName } : {}),
    serverId: server.id,
    serverName: server.name,
    ...(server.providerKey ? { serverProviderKey: server.providerKey } : {}),
  };
}

async function resolveRemoteCodeRef(
  locator: {
    readonly repository: string;
    readonly repositoryIdentity: string;
    readonly ref: string;
    readonly branch: string;
  },
  runGit?: WorkspaceGitCommandRunner,
): Promise<RemoteGitWorkspaceRef> {
  try {
    return await resolveRemoteGitWorkspaceRef(locator.repository, locator.ref, runGit);
  } catch (error) {
    const tracked = await resolveTrackedRemoteCodeSha(locator, runGit);
    if (tracked) return tracked;
    throw error;
  }
}

async function resolveTrackedRemoteCodeSha(
  locator: {
    readonly repository: string;
    readonly repositoryIdentity: string;
    readonly ref: string;
    readonly branch: string;
  },
  runGit?: WorkspaceGitCommandRunner,
): Promise<RemoteGitWorkspaceRef | undefined> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const git =
    runGit ??
    (async ({ args, cwd }: { args: readonly string[]; cwd: string }) => {
      const result = await execFileAsync("git", [...args], {
        cwd,
        timeout: WORKSPACE_GIT_DISCOVERY_TIMEOUT_MS,
        encoding: "utf8",
        env: remoteCodeGitEnv(),
      });
      return { stdout: result.stdout, stderr: result.stderr };
    });
  try {
    const tracked = await git({
      args: ["rev-parse", `refs/remotes/origin/${locator.branch}`],
      cwd: ".",
    });
    const commitSha = tracked.stdout.trim().toLowerCase();
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(commitSha)) return undefined;
    return {
      repositoryIdentity: locator.repositoryIdentity,
      credentialFreeHttpsRepository: locator.repository,
      ref: locator.ref,
      commitSha,
    };
  } catch {
    return undefined;
  }
}

async function resolveRemoteCodeGitRemoteLocator(
  remoteValue: string,
  runGit?: WorkspaceGitCommandRunner,
): Promise<{
  readonly repository: string;
  readonly repositoryIdentity: string;
  readonly ref: string;
  readonly branch: string;
}> {
  const normalized = normalizeWorkspaceRepositoryRemote(
    expandRemoteCodeGitRemoteLocator(remoteValue),
  );
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const git =
    runGit ??
    (async ({ args, cwd }: { args: readonly string[]; cwd: string }) => {
      const result = await execFileAsync("git", [...args], {
        cwd,
        timeout: 15_000,
        encoding: "utf8",
      });
      return { stdout: result.stdout, stderr: result.stderr };
    });
  let head: string;
  try {
    head = (
      await git({
        args: ["ls-remote", "--symref", "--exit-code", normalized.credentialFreeHttps, "HEAD"],
        cwd: ".",
      })
    ).stdout;
  } catch {
    throw remoteCodeError(
      "workspace_remote_default_ref_unavailable",
      "Remote default branch cannot be resolved",
      {
        phase: "remote-code-locator",
        guidance: "Check the git remote is reachable, then retry appaloft code <git-remote>.",
      },
    );
  }
  const symbolic = /^ref:\s+refs\/heads\/([^\s]+)\s+HEAD$/mu.exec(head);
  if (symbolic?.[1]) {
    return {
      repository: normalized.credentialFreeHttps,
      repositoryIdentity: normalized.identity,
      ref: `refs/heads/${symbolic[1]}`,
      branch: symbolic[1],
    };
  }
  const sha = head
    .split("\n")
    .map((line) => line.split(/\s+/u)[0] ?? "")
    .find((value) => /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(value));
  if (!sha) {
    throw remoteCodeError(
      "workspace_remote_default_ref_unavailable",
      "Remote default branch cannot be resolved",
      {
        phase: "remote-code-locator",
        guidance: "Check the git remote is reachable, then retry appaloft code <git-remote>.",
      },
    );
  }
  let heads: string;
  try {
    heads = (
      await git({
        args: ["ls-remote", "--heads", "--exit-code", normalized.credentialFreeHttps],
        cwd: ".",
      })
    ).stdout;
  } catch {
    throw remoteCodeError(
      "workspace_remote_default_ref_unavailable",
      "Remote default branch cannot be resolved",
      {
        phase: "remote-code-locator",
        guidance: "Check the git remote is reachable, then retry appaloft code <git-remote>.",
      },
    );
  }
  const matches = heads
    .split("\n")
    .map((line) => {
      const [object, ref] = line.split(/\s+/u);
      return object === sha && ref?.startsWith("refs/heads/")
        ? ref.slice("refs/heads/".length)
        : undefined;
    })
    .filter((branch): branch is string => Boolean(branch));
  if (matches.length === 0) {
    throw remoteCodeError(
      "workspace_remote_default_ref_unavailable",
      "Remote default branch cannot be resolved",
      {
        phase: "remote-code-locator",
        guidance: "Check the git remote is reachable, then retry appaloft code <git-remote>.",
      },
    );
  }
  if (matches.length > 1) {
    throw remoteCodeError(
      "workspace_git_ref_ambiguous",
      "Remote HEAD must resolve to exactly one branch",
      {
        phase: "remote-code-locator",
        guidance: "Pass a repository whose default branch is unique, then retry.",
      },
    );
  }
  const branch = matches[0];
  if (!branch) {
    throw remoteCodeError(
      "workspace_remote_default_ref_unavailable",
      "Remote default branch cannot be resolved",
      {
        phase: "remote-code-locator",
        guidance: "Check the git remote is reachable, then retry appaloft code <git-remote>.",
      },
    );
  }
  return {
    repository: normalized.credentialFreeHttps,
    repositoryIdentity: normalized.identity,
    ref: `refs/heads/${branch}`,
    branch,
  };
}

export async function resolveRemoteCodeLocator(
  path = ".",
  runGit?: WorkspaceGitCommandRunner,
  options: { readonly homeDir?: string } = {},
): Promise<{
  readonly repository: string;
  readonly repositoryIdentity: string;
  readonly ref: string;
  readonly branch: string;
}> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const selectedPath = path.trim() || ".";
  const ceiling = workspaceGitDiscoveryCeiling(selectedPath, options.homeDir);
  const git =
    runGit ??
    (async ({ args, cwd }: { args: readonly string[]; cwd: string }) => {
      const result = await execFileAsync("git", [...args], {
        cwd,
        timeout: WORKSPACE_GIT_DISCOVERY_TIMEOUT_MS,
        encoding: "utf8",
        env: remoteCodeGitEnv(ceiling),
      });
      return { stdout: result.stdout, stderr: result.stderr };
    });

  let root: string;
  try {
    const toplevel = await git({ args: ["rev-parse", "--show-toplevel"], cwd: selectedPath });
    root = toplevel.stdout.trim();
  } catch {
    throw remoteCodeError(
      "workspace_remote_repository_missing",
      "Remote code needs a Git repository with an origin",
      {
        phase: "remote-code-locator",
        guidance: "Run appaloft code from a Git repository, or use appaloft code --local.",
      },
    );
  }

  const remoteUrl = (
    await git({ args: ["config", "--get", "remote.origin.url"], cwd: root }).catch(() => ({
      stdout: "",
      stderr: "",
    }))
  ).stdout.trim();
  if (!remoteUrl) {
    throw remoteCodeError(
      "workspace_remote_repository_missing",
      "Remote code needs a Git repository with an origin",
      {
        phase: "remote-code-locator",
        guidance: "Add a Git remote, then retry appaloft code.",
      },
    );
  }

  const normalized = normalizeWorkspaceRepositoryRemote(remoteUrl);
  const branch = (
    await git({
      args: ["symbolic-ref", "--quiet", "--short", "HEAD"],
      cwd: root,
    }).catch(async () =>
      git({ args: ["rev-parse", "--abbrev-ref", "origin/HEAD"], cwd: root }).catch(() => ({
        stdout: "main",
        stderr: "",
      })),
    )
  ).stdout
    .trim()
    .replace(/^origin\//u, "");
  const resolvedBranch = branch && branch !== "HEAD" ? branch : "main";
  return {
    repository: normalized.credentialFreeHttps,
    repositoryIdentity: normalized.identity,
    ref: `refs/heads/${resolvedBranch}`,
    branch: resolvedBranch,
  };
}
