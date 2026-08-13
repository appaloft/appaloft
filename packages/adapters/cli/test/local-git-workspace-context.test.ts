import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";

import {
  normalizeWorkspaceRepositoryRemote,
  resolveLocalGitWorkspaceContext,
  resolveRemoteGitWorkspaceRef,
  type WorkspaceGitCommandRunner,
} from "../src";

describe("local Git Workspace context", () => {
  test("[WS-OPEN-GIT-002] normalizes equivalent SSH and HTTPS repository remotes", () => {
    const expected = {
      identity: "github.com/Acme/Web",
      credentialFreeHttps: "https://github.com/Acme/Web.git",
    };

    expect(normalizeWorkspaceRepositoryRemote("git@GitHub.com:Acme/Web.git")).toEqual(expected);
    expect(normalizeWorkspaceRepositoryRemote("ssh://git@github.com:22/Acme/Web/")).toEqual(
      expected,
    );
    expect(normalizeWorkspaceRepositoryRemote("https://github.com/Acme/Web.git")).toEqual(expected);
  });

  test("[WS-OPEN-GIT-001][WS-OPEN-GIT-004] resolves a clean branch pinned to its remote SHA", async () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const outputs = new Map<string, string>([
      ["rev-parse --show-toplevel", "/work/repository\n"],
      ["rev-parse HEAD", `${sha}\n`],
      ["status --porcelain=v1 --untracked-files=all", ""],
      ["symbolic-ref --quiet --short HEAD", "feature/open\n"],
      ["config --get branch.feature/open.remote", "origin\n"],
      ["config --get branch.feature/open.merge", "refs/heads/feature/open\n"],
      ["config --get remote.origin.url", "git@github.com:Acme/Web.git\n"],
      [`ls-remote --exit-code origin refs/heads/feature/open`, `${sha}\trefs/heads/feature/open\n`],
    ]);
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      const key = args.join(" ");
      const stdout = outputs.get(key);
      if (stdout === undefined) throw new Error(`Unexpected git command: ${key}`);
      return { stdout, stderr: "" };
    };

    await expect(resolveLocalGitWorkspaceContext(".", runGit)).resolves.toEqual({
      root: "/work/repository",
      remoteName: "origin",
      remote: "git@github.com:Acme/Web.git",
      repositoryIdentity: "github.com/Acme/Web",
      credentialFreeHttpsRepository: "https://github.com/Acme/Web.git",
      branch: "feature/open",
      ref: "refs/heads/feature/open",
      headSha: sha,
    });
  });

  test("[WS-OPEN-GIT-003] fails dirty before inspecting any remote ref", async () => {
    const commands: string[] = [];
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      const key = args.join(" ");
      commands.push(key);
      if (key === "rev-parse --show-toplevel") {
        return { stdout: "/work/repository\n", stderr: "" };
      }
      if (key === "rev-parse HEAD") {
        return {
          stdout: "0123456789abcdef0123456789abcdef01234567\n",
          stderr: "",
        };
      }
      if (key === "status --porcelain=v1 --untracked-files=all") {
        return { stdout: " M src/app.ts\n?? local.txt\n", stderr: "" };
      }
      throw new Error(`Unexpected git command: ${key}`);
    };

    await expect(resolveLocalGitWorkspaceContext(".", runGit)).rejects.toMatchObject({
      details: {
        code: "workspace_git_dirty",
        headSha: "0123456789abcdef0123456789abcdef01234567",
        changedPathCount: 2,
      },
    });
    expect(commands.some((command) => command.startsWith("ls-remote"))).toBe(false);
  });

  test("[WS-OPEN-GIT-004] rejects a detached HEAD before inspecting remotes", async () => {
    const commands: string[] = [];
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      const key = args.join(" ");
      commands.push(key);
      if (key === "rev-parse --show-toplevel") {
        return { stdout: "/work/repository\n", stderr: "" };
      }
      if (key === "rev-parse HEAD") {
        return {
          stdout: "0123456789abcdef0123456789abcdef01234567\n",
          stderr: "",
        };
      }
      if (key === "status --porcelain=v1 --untracked-files=all") {
        return { stdout: "", stderr: "" };
      }
      if (key === "symbolic-ref --quiet --short HEAD") {
        throw new Error("fatal: ref HEAD is not a symbolic ref");
      }
      throw new Error(`Unexpected git command: ${key}`);
    };

    await expect(resolveLocalGitWorkspaceContext(".", runGit)).rejects.toMatchObject({
      code: "validation_error",
      message: "Git HEAD is detached; check out a pushed branch before opening a Workspace",
      details: {
        code: "workspace_git_detached",
        guidance: "Check out a pushed branch, then retry workspace open.",
      },
    });
    expect(commands.some((command) => command.startsWith("ls-remote"))).toBe(false);
    expect(commands.some((command) => command.startsWith("config --get remote."))).toBe(false);
  });

  test("[WS-OPEN-GIT-004] reports progress before inspecting the remote branch", async () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const progress: string[] = [];
    const outputs = new Map<string, string>([
      ["rev-parse --show-toplevel", "/work/repository\n"],
      ["rev-parse HEAD", `${sha}\n`],
      ["status --porcelain=v1 --untracked-files=all", ""],
      ["symbolic-ref --quiet --short HEAD", "feature/open\n"],
      ["config --get branch.feature/open.remote", "origin\n"],
      ["config --get branch.feature/open.merge", "refs/heads/feature/open\n"],
      ["config --get remote.origin.url", "git@github.com:Acme/Web.git\n"],
      [`ls-remote --exit-code origin refs/heads/feature/open`, `${sha}\trefs/heads/feature/open\n`],
    ]);
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      const key = args.join(" ");
      if (key.startsWith("ls-remote")) {
        expect(progress).toEqual(["Checking the remote Git branch…"]);
      }
      const stdout = outputs.get(key);
      if (stdout === undefined) throw new Error(`Unexpected git command: ${key}`);
      return { stdout, stderr: "" };
    };

    await resolveLocalGitWorkspaceContext(".", runGit, {
      onProgress: (message) => progress.push(message),
    });
    expect(progress).toEqual(["Checking the remote Git branch…"]);
  });

  test("[WS-OPEN-GIT-004] does not inspect remotes or report remote progress when dirty", async () => {
    const progress: string[] = [];
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      const key = args.join(" ");
      if (key === "rev-parse --show-toplevel") {
        return { stdout: "/work/repository\n", stderr: "" };
      }
      if (key === "rev-parse HEAD") {
        return {
          stdout: "0123456789abcdef0123456789abcdef01234567\n",
          stderr: "",
        };
      }
      if (key === "status --porcelain=v1 --untracked-files=all") {
        return { stdout: " M src/app.ts\n", stderr: "" };
      }
      throw new Error(`Unexpected git command: ${key}`);
    };

    await expect(
      resolveLocalGitWorkspaceContext(".", runGit, {
        onProgress: (message) => progress.push(message),
      }),
    ).rejects.toMatchObject({
      details: { code: "workspace_git_dirty" },
    });
    expect(progress).toEqual([]);
  });

  test("[WS-OPEN-GIT-004] fails closed when remote Git inspection times out", async () => {
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      const key = args.join(" ");
      if (key === "rev-parse --show-toplevel") {
        return { stdout: "/work/repository\n", stderr: "" };
      }
      if (key === "rev-parse HEAD") {
        return {
          stdout: "0123456789abcdef0123456789abcdef01234567\n",
          stderr: "",
        };
      }
      if (key === "status --porcelain=v1 --untracked-files=all") {
        return { stdout: "", stderr: "" };
      }
      if (key === "symbolic-ref --quiet --short HEAD") {
        return { stdout: "feature/open\n", stderr: "" };
      }
      if (key === "config --get branch.feature/open.remote") {
        return { stdout: "origin\n", stderr: "" };
      }
      if (key === "config --get branch.feature/open.merge") {
        return { stdout: "refs/heads/feature/open\n", stderr: "" };
      }
      if (key === "config --get remote.origin.url") {
        return { stdout: "git@github.com:Acme/Web.git\n", stderr: "" };
      }
      if (key.startsWith("ls-remote")) {
        throw Object.assign(new Error("git timeout"), { killed: true, code: "ETIMEDOUT" });
      }
      throw new Error(`Unexpected git command: ${key}`);
    };

    await expect(resolveLocalGitWorkspaceContext(".", runGit)).rejects.toMatchObject({
      code: "infra_error",
      message: "Timed out contacting the remote Git repository",
      details: {
        code: "workspace_git_remote_timeout",
        guidance: "Check network, VPN, or Git hosting access, then retry.",
      },
    });
  });

  test("[WS-OPEN-GIT-004] rejects a local HEAD that differs from the upstream tip", async () => {
    const localSha = "0123456789abcdef0123456789abcdef01234567";
    const remoteSha = "1123456789abcdef0123456789abcdef01234567";
    const outputs = new Map<string, string>([
      ["rev-parse --show-toplevel", "/work/repository\n"],
      ["rev-parse HEAD", `${localSha}\n`],
      ["status --porcelain=v1 --untracked-files=all", ""],
      ["symbolic-ref --quiet --short HEAD", "main\n"],
      ["config --get branch.main.remote", "origin\n"],
      ["config --get branch.main.merge", "refs/heads/main\n"],
      ["config --get remote.origin.url", "https://github.com/Acme/Web.git\n"],
      ["ls-remote --exit-code origin refs/heads/main", `${remoteSha}\trefs/heads/main\n`],
    ]);
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => ({
      stdout: outputs.get(args.join(" ")) ?? "",
      stderr: "",
    });

    await expect(resolveLocalGitWorkspaceContext(".", runGit)).rejects.toMatchObject({
      details: {
        code: "workspace_git_unpushed_or_mismatched",
        headSha: localSha,
        remoteSha,
      },
    });
  });

  test("[WS-OPEN-CREATE-009] resolves explicit create refs to immutable remote SHAs", async () => {
    const sha = "2123456789abcdef0123456789abcdef01234567";
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      expect(args).toEqual([
        "ls-remote",
        "--exit-code",
        "https://github.com/Acme/Web.git",
        "refs/heads/main",
      ]);
      return { stdout: `${sha}\trefs/heads/main\n`, stderr: "" };
    };

    await expect(
      resolveRemoteGitWorkspaceRef("https://github.com/Acme/Web.git", "refs/heads/main", runGit),
    ).resolves.toEqual({
      repositoryIdentity: "github.com/Acme/Web",
      credentialFreeHttpsRepository: "https://github.com/Acme/Web.git",
      ref: "refs/heads/main",
      commitSha: sha,
    });
  });
});
