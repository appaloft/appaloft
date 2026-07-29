import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { domainError } from "@appaloft/core";

export interface NormalizedWorkspaceRepositoryRemote {
  readonly identity: string;
  readonly credentialFreeHttps: string;
}

export interface WorkspaceGitCommandInput {
  readonly cwd: string;
  readonly args: readonly string[];
}

export interface WorkspaceGitCommandOutput {
  readonly stdout: string;
  readonly stderr: string;
}

export type WorkspaceGitCommandRunner = (
  input: WorkspaceGitCommandInput,
) => Promise<WorkspaceGitCommandOutput>;

export interface LocalGitWorkspaceContext {
  readonly root: string;
  readonly remoteName: string;
  readonly remote: string;
  readonly repositoryIdentity: string;
  readonly credentialFreeHttpsRepository: string;
  readonly branch: string;
  readonly ref: string;
  readonly headSha: string;
}

export interface RemoteGitWorkspaceRef {
  readonly repositoryIdentity: string;
  readonly credentialFreeHttpsRepository: string;
  readonly ref: string;
  readonly commitSha: string;
}

const execFileAsync = promisify(execFile);

const defaultWorkspaceGitCommandRunner: WorkspaceGitCommandRunner = async ({ args, cwd }) => {
  try {
    const result = await execFileAsync("git", [...args], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: 1024 * 1024,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const failure = error as { stderr?: unknown; message?: unknown };
    throw domainError.validation("Unable to resolve local Git Workspace context", {
      code: "workspace_git_context_unavailable",
      gitCommand: args[0] ?? "git",
      gitError: String(failure.stderr ?? failure.message ?? "git failed").slice(0, 512),
    });
  }
};

async function gitText(
  runGit: WorkspaceGitCommandRunner,
  cwd: string,
  args: readonly string[],
  code: string,
  message: string,
): Promise<string> {
  try {
    const result = await runGit({ cwd, args });
    return result.stdout.trim();
  } catch {
    throw domainError.validation(message, { code });
  }
}

function exactGitSha(value: string, code: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(normalized)) {
    throw domainError.validation(`${label} is not an exact Git commit SHA`, { code });
  }
  return normalized;
}

function repositoryPath(value: string): string {
  const normalized = value
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "")
    .replace(/\.git$/u, "");
  if (!normalized?.includes("/") || normalized.split("/").some((part) => !part)) {
    throw domainError.validation("Git remote must identify a repository owner and name", {
      code: "workspace_repository_remote_invalid",
    });
  }
  return normalized;
}

function normalizedRemote(
  hostValue: string,
  portValue: string,
  pathValue: string,
): NormalizedWorkspaceRepositoryRemote {
  const host = hostValue.trim().toLowerCase();
  const port = portValue === "22" || portValue === "443" ? "" : portValue;
  const path = repositoryPath(pathValue);
  if (!host || host.includes("\0") || /[\s/?#@]/u.test(host)) {
    throw domainError.validation("Git remote host is invalid", {
      code: "workspace_repository_remote_invalid",
    });
  }
  const authority = `${host}${port ? `:${port}` : ""}`;
  return {
    identity: `${authority}/${path}`,
    credentialFreeHttps: `https://${authority}/${path}.git`,
  };
}

export function normalizeWorkspaceRepositoryRemote(
  remoteValue: string,
): NormalizedWorkspaceRepositoryRemote {
  const remote = remoteValue.trim();
  if (
    !remote ||
    remote.length > 2_048 ||
    remote.includes("\0") ||
    /[\r\n]/u.test(remote) ||
    remote.startsWith("-")
  ) {
    throw domainError.validation("Git remote is invalid", {
      code: "workspace_repository_remote_invalid",
    });
  }

  const scp = /^(?:([^/@:\s]+)@)?([^/:\s]+):(.+)$/u.exec(remote);
  if (scp && !remote.includes("://")) {
    return normalizedRemote(scp[2] ?? "", "", scp[3] ?? "");
  }

  let url: URL;
  try {
    url = new URL(remote);
  } catch {
    throw domainError.validation("Git remote must use SSH or HTTPS", {
      code: "workspace_repository_remote_invalid",
    });
  }

  if (
    (url.protocol !== "ssh:" && url.protocol !== "https:") ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol === "https:" && url.username)
  ) {
    throw domainError.validation("Git remote must not contain credentials, query, or fragment", {
      code: "workspace_repository_remote_invalid",
    });
  }
  return normalizedRemote(url.hostname, url.port, url.pathname);
}

export async function resolveLocalGitWorkspaceContext(
  path = ".",
  runGit: WorkspaceGitCommandRunner = defaultWorkspaceGitCommandRunner,
): Promise<LocalGitWorkspaceContext> {
  const selectedPath = path.trim();
  if (!selectedPath || selectedPath.includes("\0") || /[\r\n]/u.test(selectedPath)) {
    throw domainError.validation("Workspace path is invalid", {
      code: "workspace_git_path_invalid",
    });
  }

  const root = await gitText(
    runGit,
    selectedPath,
    ["rev-parse", "--show-toplevel"],
    "workspace_git_root_unavailable",
    "Workspace path is not inside a Git worktree",
  );
  const headSha = exactGitSha(
    await gitText(
      runGit,
      root,
      ["rev-parse", "HEAD"],
      "workspace_git_head_unavailable",
      "Git HEAD cannot be resolved",
    ),
    "workspace_git_head_unavailable",
    "Git HEAD",
  );
  const dirty = await gitText(
    runGit,
    root,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    "workspace_git_status_unavailable",
    "Git worktree status cannot be resolved",
  );
  if (dirty) {
    const lines = dirty.split("\n").filter(Boolean);
    throw domainError.conflict("Git worktree has uncommitted changes; nothing was uploaded", {
      code: "workspace_git_dirty",
      headSha,
      changedPathCount: lines.length,
      status: lines.slice(0, 20),
      guidance: "Commit, stash, or clean the worktree, push the branch, then retry.",
    });
  }

  const branch = await gitText(
    runGit,
    root,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    "workspace_git_detached",
    "Git HEAD is detached; check out a pushed branch before opening a Workspace",
  );
  const remoteName = await gitText(
    runGit,
    root,
    ["config", "--get", `branch.${branch}.remote`],
    "workspace_git_upstream_missing",
    "Current Git branch has no upstream remote",
  );
  const ref = await gitText(
    runGit,
    root,
    ["config", "--get", `branch.${branch}.merge`],
    "workspace_git_upstream_missing",
    "Current Git branch has no upstream ref",
  );
  if (!remoteName || remoteName === "." || !ref.startsWith("refs/heads/")) {
    throw domainError.conflict("Current Git branch must track a remote branch", {
      code: "workspace_git_upstream_missing",
      headSha,
      branch,
      guidance: `Push with an upstream, for example: git push -u origin ${branch}`,
    });
  }
  const remote = await gitText(
    runGit,
    root,
    ["config", "--get", `remote.${remoteName}.url`],
    "workspace_git_remote_missing",
    "Current Git upstream remote has no repository URL",
  );
  const normalizedRemoteValue = normalizeWorkspaceRepositoryRemote(remote);
  const remoteTip = await gitText(
    runGit,
    root,
    ["ls-remote", "--exit-code", remoteName, ref],
    "workspace_git_remote_ref_unavailable",
    "Remote Git branch cannot be resolved without prompting",
  );
  const remoteSha = exactGitSha(
    remoteTip.split(/\s+/u)[0] ?? "",
    "workspace_git_remote_ref_unavailable",
    "Remote Git branch tip",
  );
  if (remoteSha !== headSha) {
    throw domainError.conflict("Local Git HEAD does not match the pushed remote branch tip", {
      code: "workspace_git_unpushed_or_mismatched",
      branch,
      ref,
      headSha,
      remoteSha,
      guidance: "Push the exact commit or update the local branch, then retry.",
    });
  }

  return {
    root,
    remoteName,
    remote,
    repositoryIdentity: normalizedRemoteValue.identity,
    credentialFreeHttpsRepository: normalizedRemoteValue.credentialFreeHttps,
    branch,
    ref,
    headSha,
  };
}

export async function resolveRemoteGitWorkspaceRef(
  repository: string,
  ref: string,
  runGit: WorkspaceGitCommandRunner = defaultWorkspaceGitCommandRunner,
): Promise<RemoteGitWorkspaceRef> {
  const normalized = normalizeWorkspaceRepositoryRemote(repository);
  if (normalized.credentialFreeHttps !== repository.trim()) {
    throw domainError.validation("Workspace repository must use normalized credential-free HTTPS", {
      code: "workspace_repository_https_required",
      repository: normalized.credentialFreeHttps,
    });
  }
  const selectedRef = ref.trim();
  if (
    !selectedRef ||
    selectedRef.length > 1_024 ||
    selectedRef.startsWith("-") ||
    selectedRef.includes("\0") ||
    /[\r\n]/u.test(selectedRef)
  ) {
    throw domainError.validation("Workspace Git ref is invalid", {
      code: "workspace_git_ref_invalid",
    });
  }
  const remoteTip = await gitText(
    runGit,
    process.cwd(),
    ["ls-remote", "--exit-code", normalized.credentialFreeHttps, selectedRef],
    "workspace_git_remote_ref_unavailable",
    "Remote Git ref cannot be resolved without prompting",
  );
  const lines = remoteTip.split("\n").filter(Boolean);
  if (lines.length !== 1) {
    throw domainError.conflict("Workspace Git ref must resolve to exactly one remote object", {
      code: "workspace_git_ref_ambiguous",
      ref: selectedRef,
    });
  }
  return {
    repositoryIdentity: normalized.identity,
    credentialFreeHttpsRepository: normalized.credentialFreeHttps,
    ref: selectedRef,
    commitSha: exactGitSha(
      lines[0]?.split(/\s+/u)[0] ?? "",
      "workspace_git_remote_ref_unavailable",
      "Remote Git ref",
    ),
  };
}
