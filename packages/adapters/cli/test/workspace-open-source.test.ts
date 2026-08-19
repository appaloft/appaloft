import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type WorkspaceGitCommandRunner } from "../src/local-git-workspace-context.js";
import { resolveWorkspaceOpenSource } from "../src/remote-code-session.js";

describe("workspace open locators", () => {
  test("[WS-OPEN-LOCATOR-022] local git worktree still resolves a clean pushed branch", async () => {
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
      const stdout = outputs.get(args.join(" "));
      if (stdout === undefined) throw new Error(`Unexpected git command: ${args.join(" ")}`);
      return { stdout, stderr: "" };
    };

    await expect(resolveWorkspaceOpenSource(".", runGit)).resolves.toEqual({
      repositoryIdentity: "github.com/Acme/Web",
      credentialFreeHttpsRepository: "https://github.com/Acme/Web.git",
      branch: "feature/open",
      ref: "refs/heads/feature/open",
      headSha: sha,
    });
  });

  test("[WS-OPEN-LOCATOR-023] git-remote occupies without a local worktree", async () => {
    const sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      if (args[0] === "ls-remote" && args.includes("HEAD")) {
        expect(args).toContain("https://github.com/org/repo.git");
        return {
          stdout: `ref: refs/heads/main\tHEAD\n${sha}\tHEAD\n`,
          stderr: "",
        };
      }
      if (args[0] === "ls-remote" && args.includes("refs/heads/main")) {
        return { stdout: `${sha}\trefs/heads/main\n`, stderr: "" };
      }
      throw new Error(args.join(" "));
    };

    await expect(
      resolveWorkspaceOpenSource("https://github.com/org/repo.git", runGit),
    ).resolves.toEqual({
      repositoryIdentity: "github.com/org/repo",
      credentialFreeHttpsRepository: "https://github.com/org/repo.git",
      branch: "main",
      ref: "refs/heads/main",
      headSha: sha,
    });
  });

  test("[WS-OPEN-LOCATOR-024] non-git directory occupies from existing occupancy", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-workspace-open-nongit-"));
    const sha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      if (args[0] === "rev-parse" && args.includes("--show-toplevel")) {
        throw new Error("fatal: not a git repository");
      }
      if (args[0] === "ls-remote" && args.includes("https://github.com/acme/api.git")) {
        return { stdout: `${sha}\trefs/heads/main\n`, stderr: "" };
      }
      throw new Error(args.join(" "));
    };

    await expect(
      resolveWorkspaceOpenSource(emptyDir, runGit, {
        listOccupancies: async () => [
          {
            sandboxId: "sbx_live",
            status: "ready",
            occupancy: {
              repositoryIdentity: "github.com/acme/api",
              commitSha: sha,
              branch: "main",
            },
            lastActivityAt: "2026-08-19T12:00:00.000Z",
          },
        ],
      }),
    ).resolves.toEqual({
      repositoryIdentity: "github.com/acme/api",
      credentialFreeHttpsRepository: "https://github.com/acme/api.git",
      branch: "main",
      ref: "refs/heads/main",
      headSha: sha,
    });
  });

  test("[WS-OPEN-LOCATOR-025] non-git directory is not rejected as a Git worktree", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-workspace-open-nongit-fail-"));
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      if (args[0] === "rev-parse" && args.includes("--show-toplevel")) {
        throw new Error("fatal: not a git repository");
      }
      throw new Error(args.join(" "));
    };

    await expect(resolveWorkspaceOpenSource(emptyDir, runGit)).rejects.toMatchObject({
      code: "workspace_remote_repository_missing",
    });
    await expect(resolveWorkspaceOpenSource(emptyDir, runGit)).rejects.not.toMatchObject({
      message: "Workspace path is not inside a Git worktree",
    });
  });

  test("[WS-OPEN-GIT-003] dirty local worktree still fail-closes", async () => {
    const runGit: WorkspaceGitCommandRunner = async ({ args }) => {
      const key = args.join(" ");
      if (key === "rev-parse --show-toplevel") {
        return { stdout: "/work/repository\n", stderr: "" };
      }
      if (key === "rev-parse HEAD") {
        return { stdout: "0123456789abcdef0123456789abcdef01234567\n", stderr: "" };
      }
      if (key === "status --porcelain=v1 --untracked-files=all") {
        return { stdout: " M src/app.ts\n", stderr: "" };
      }
      throw new Error(key);
    };

    await expect(resolveWorkspaceOpenSource(".", runGit)).rejects.toMatchObject({
      details: { code: "workspace_git_dirty" },
    });
  });
});
