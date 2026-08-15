import { type DomainError } from "@appaloft/core";
import { activeControlPlaneProfile } from "./control-plane-service.js";
import {
  normalizeWorkspaceRepositoryRemote,
  type RemoteGitWorkspaceRef,
  resolveRemoteGitWorkspaceRef,
  type WorkspaceGitCommandRunner,
} from "./local-git-workspace-context.js";

export const REMOTE_CODE_BANNER_PREFIX = "Remote ·";
export const REMOTE_CODE_MODEL_HINT =
  "Connect a model in the attached OpenCode session before running a Task.";

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

export interface RemoteCodeDoorProbe {
  readonly env?: NodeJS.ProcessEnv;
  readonly localComposition?: boolean;
  readonly readActiveProfile?: () => Promise<{ readonly auth?: unknown } | null>;
  readonly listServers?: () => Promise<readonly RemoteCodeServerSummary[]>;
  readonly showBinding?: (repositoryIdentity: string) => Promise<RemoteCodeBinding | null>;
  readonly resolveLocator?: () => Promise<{
    readonly repository: string;
    readonly repositoryIdentity: string;
    readonly ref: string;
    readonly branch: string;
  }>;
  readonly resolveRemoteRef?: (repository: string, ref: string) => Promise<RemoteGitWorkspaceRef>;
  readonly runGit?: WorkspaceGitCommandRunner;
}

export function hasRemoteCodeLogin(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.APPALOFT_TOKEN?.trim() ||
      env.APPALOFT_AUTHORIZATION?.trim() ||
      env.APPALOFT_AUTH_COOKIE?.trim(),
  );
}

export function formatRemoteCodeBanner(input: {
  readonly projectId?: string;
  readonly repositoryIdentity: string;
  readonly commitSha: string;
  readonly serverName: string;
  readonly workspaceId?: string;
}): string {
  const sha = input.commitSha.slice(0, 7);
  const project = input.projectId?.trim() || "project";
  const occupancy = input.workspaceId?.trim()
    ? `my sandbox · ${input.workspaceId.trim()}`
    : "my sandbox";
  return `Remote · ${project} · ${input.repositoryIdentity}@${sha} · ${input.serverName} · ${occupancy}`;
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

export function selectDefaultRemoteCodeServer(
  servers: readonly RemoteCodeServerSummary[] | undefined,
): RemoteCodeServerSummary | undefined {
  const active = (servers ?? []).filter(
    (server) => (server.lifecycleStatus ?? "active") === "active",
  );
  return active.find((server) => server.runtimeAvailability?.status === "available") ?? active[0];
}
export async function resolveDefaultRemoteCodeDoor(
  probe: RemoteCodeDoorProbe = {},
  path = ".",
): Promise<RemoteCodeDoorResolution> {
  const env = probe.env ?? process.env;
  const profile =
    probe.readActiveProfile === undefined
      ? (await activeControlPlaneProfile()).match(
          (value) => value,
          () => null,
        )
      : await probe.readActiveProfile();
  if (!probe.localComposition && !hasRemoteCodeLogin(env) && !profile?.auth) {
    throw remoteCodeError(
      "workspace_remote_login_required",
      "Sign in before opening a remote Agent session",
      {
        phase: "remote-code-login",
        guidance: "Run appaloft login, then retry. Use appaloft code --local for this-Mac scratch.",
      },
    );
  }

  const servers = probe.listServers ? await probe.listServers() : [];
  const server = selectDefaultRemoteCodeServer(servers);
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
  const locator = probe.resolveLocator
    ? await probe.resolveLocator()
    : await resolveRemoteCodeLocator(path, probe.runGit);
  const binding = probe.showBinding ? await probe.showBinding(locator.repositoryIdentity) : null;
  const remote =
    probe.resolveRemoteRef === undefined
      ? await resolveRemoteCodeRef(locator, probe.runGit)
      : await probe.resolveRemoteRef(locator.repository, locator.ref);

  return {
    repository: remote.credentialFreeHttpsRepository,
    repositoryIdentity: remote.repositoryIdentity,
    ref: remote.ref,
    branch: locator.branch,
    commitSha: remote.commitSha,
    projectId: binding?.status === "active" ? binding.projectId : "project",
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
        timeout: 15_000,
        encoding: "utf8",
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

export async function resolveRemoteCodeLocator(
  path = ".",
  runGit?: WorkspaceGitCommandRunner,
): Promise<{
  readonly repository: string;
  readonly repositoryIdentity: string;
  readonly ref: string;
  readonly branch: string;
}> {
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

  const selectedPath = path.trim() || ".";
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
