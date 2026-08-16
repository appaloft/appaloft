import { describe, expect, test } from "bun:test";

import {
  formatRemoteCodeBanner,
  isRemoteCodeGitRemoteLocator,
  nativeAttachRequiresInteractiveTerminal,
  resolveDefaultRemoteCodeDoor,
  selectDefaultRemoteCodeServer,
  selectResumeOccupancy,
} from "../src/remote-code-session.js";

describe("remote code door", () => {
  test("[WS-REMOTE-LOGIN-001] fails closed without login or profile", async () => {
    await expect(
      resolveDefaultRemoteCodeDoor({
        env: {},
        readActiveProfile: async () => null,
        listServers: async () => [],
      }),
    ).rejects.toMatchObject({ code: "workspace_remote_login_required" });
  });

  test("[WS-REMOTE-SERVER-002] fails closed when no enrolled Server exists", async () => {
    await expect(
      resolveDefaultRemoteCodeDoor({
        env: { APPALOFT_TOKEN: "token" },
        listServers: async () => [],
      }),
    ).rejects.toMatchObject({ code: "workspace_remote_server_missing" });
  });

  test("[WS-REMOTE-BINDING-007] missing Binding still resolves remote SHA for workspaces.open", async () => {
    const door = await resolveDefaultRemoteCodeDoor({
      env: { APPALOFT_TOKEN: "token" },
      listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
      resolveLocator: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
      }),
      showBinding: async () => null,
      resolveRemoteRef: async () => ({
        repositoryIdentity: "github.com/acme/api",
        credentialFreeHttpsRepository: "https://github.com/acme/api.git",
        ref: "refs/heads/main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    });
    expect(door.projectId).toBe("project");
    expect(door.serverId).toBe("srv_1");
    expect(door.commitSha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  test("[WS-REMOTE-OPEN-003][WS-REMOTE-BANNER-014] resolves Binding remote SHA and identity banner", async () => {
    const door = await resolveDefaultRemoteCodeDoor({
      env: { APPALOFT_TOKEN: "token" },
      listServers: async () => [
        {
          id: "srv_1",
          name: "mac-mini",
          lifecycleStatus: "active",
          runtimeAvailability: { status: "available" },
        },
      ],
      resolveLocator: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
      }),
      showBinding: async () => ({ projectId: "prj_billing", status: "active" }),
      resolveRemoteRef: async () => ({
        repositoryIdentity: "github.com/acme/api",
        credentialFreeHttpsRepository: "https://github.com/acme/api.git",
        ref: "refs/heads/main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    });

    expect(door.commitSha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(door.serverId).toBe("srv_1");
    expect(formatRemoteCodeBanner({ ...door, workspaceId: "sbx_1" })).toBe(
      "Remote · prj_billing · github.com/acme/api@aaaaaaa · mac-mini · my sandbox · sbx_1\nCompare · https://github.com/acme/api/compare/main?expand=1",
    );
    expect(selectDefaultRemoteCodeServer([{ id: "srv_1", name: "mac-mini" }])?.name).toBe(
      "mac-mini",
    );
  });

  test("[WS-REMOTE-BANNER-061] occupancy banner includes generated access URL", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        workspaceId: "sbx_rn32pzyp8yxr",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · sbx_rn32pzyp8yxr\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io",
    );
  });

  test("[WS-REMOTE-BANNER-062] missing generated access keeps existing banner", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        workspaceId: "sbx_rn32pzyp8yxr",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · sbx_rn32pzyp8yxr",
    );
  });

  test("[WS-REMOTE-BANNER-081] occupancy banner includes matching PR", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        workspaceId: "sbx_rn32pzyp8yxr",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        pullRequestNumber: 928,
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · sbx_rn32pzyp8yxr\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io\nPR #928 · https://github.com/traefik/whoami/pull/928",
    );
  });

  test("[WS-REMOTE-BANNER-082][WS-REMOTE-BANNER-083] missing or invalid banner PR stays omitted", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        workspaceId: "sbx_rn32pzyp8yxr",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        pullRequestNumber: 0,
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · sbx_rn32pzyp8yxr\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io",
    );
  });

  test("[WS-REMOTE-BANNER-101][WS-REMOTE-BANNER-104][WS-REMOTE-BANNER-117] occupancy banner copies GitHub compare when no PR exists", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        workspaceId: "sbx_rn32pzyp8yxr",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        branch: "feat/occupancy",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · sbx_rn32pzyp8yxr\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io\nCompare · https://github.com/traefik/whoami/compare/feat/occupancy?expand=1",
    );
  });

  test("[WS-REMOTE-BANNER-102][WS-REMOTE-BANNER-105][WS-REMOTE-BANNER-118] existing PR banner stays PR-only", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        workspaceId: "sbx_rn32pzyp8yxr",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        pullRequestNumber: 928,
        branch: "feat/occupancy",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · sbx_rn32pzyp8yxr\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io\nPR #928 · https://github.com/traefik/whoami/pull/928",
    );
  });

  test("[WS-REMOTE-BANNER-103][WS-REMOTE-BANNER-106] missing compare stays omitted", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "gitlab.com/acme/api",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        workspaceId: "sbx_rn32pzyp8yxr",
        branch: "feat/occupancy",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · gitlab.com/acme/api@1ce75d0 · occupancy-mac · my sandbox · sbx_rn32pzyp8yxr",
    );
  });

  test("[WS-REMOTE-BANNER-113][WS-REMOTE-BANNER-116] occupancy banner copies Production", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        workspaceId: "sbx_rn32pzyp8yxr",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        productionUrl: "https://whoami.example/",
        pullRequestNumber: 928,
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · sbx_rn32pzyp8yxr\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io\nProduction · https://whoami.example/\nPR #928 · https://github.com/traefik/whoami/pull/928",
    );
  });

  test("[WS-REMOTE-LOGIN-001] local composition skips Cloud login", async () => {
    const door = await resolveDefaultRemoteCodeDoor({
      env: {},
      localComposition: true,
      readActiveProfile: async () => null,
      listServers: async () => [
        {
          id: "srv_1",
          name: "this-mac",
          providerKey: "local-shell",
          lifecycleStatus: "active",
        },
      ],
      resolveLocator: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
      }),
      showBinding: async () => null,
      resolveRemoteRef: async () => ({
        repositoryIdentity: "github.com/acme/api",
        credentialFreeHttpsRepository: "https://github.com/acme/api.git",
        ref: "refs/heads/main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    });

    expect(door.serverProviderKey).toBe("local-shell");
    expect(door.serverName).toBe("this-mac");
  });

  test("[WS-REMOTE-NO-UPLOAD-006] uses origin tracking SHA when ls-remote cannot prompt", async () => {
    const door = await resolveDefaultRemoteCodeDoor({
      env: { APPALOFT_TOKEN: "token" },
      listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
      resolveLocator: async () => ({
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
      }),
      showBinding: async () => null,
      runGit: async ({ args }) => {
        if (args[0] === "ls-remote") {
          throw new Error("ls-remote cannot prompt");
        }
        if (args[0] === "rev-parse" && args[1] === "refs/remotes/origin/main") {
          return { stdout: `${"b".repeat(40)}\n`, stderr: "" };
        }
        throw new Error(args.join(" "));
      },
    });
    expect(door.commitSha).toBe("b".repeat(40));
    expect(door.serverId).toBe("srv_1");
  });

  test("[WS-REMOTE-NO-UPLOAD-006] resumes last occupancy when the local path has no origin", async () => {
    const door = await resolveDefaultRemoteCodeDoor({
      env: { APPALOFT_TOKEN: "token" },
      listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
      listOccupancies: async () => [
        {
          sandboxId: "sbx_old",
          status: "terminated",
          occupancy: {
            repositoryIdentity: "github.com/acme/old",
            commitSha: "c".repeat(40),
            branch: "main",
          },
          lastActivityAt: "2026-08-15T12:00:00.000Z",
        },
        {
          sandboxId: "sbx_live",
          status: "ready",
          occupancy: {
            repositoryIdentity: "github.com/acme/api",
            commitSha: "d".repeat(40),
            branch: "main",
          },
          lastActivityAt: "2026-08-15T12:30:00.000Z",
        },
      ],
      resolveLocator: async () => {
        throw Object.assign(new Error("missing origin"), {
          code: "workspace_remote_repository_missing",
        });
      },
      resolveRemoteRef: async () => ({
        repositoryIdentity: "github.com/acme/api",
        credentialFreeHttpsRepository: "https://github.com/acme/api.git",
        ref: "refs/heads/main",
        commitSha: "e".repeat(40),
      }),
    });
    expect(door.repositoryIdentity).toBe("github.com/acme/api");
    expect(door.repository).toBe("https://github.com/acme/api.git");
    expect(door.commitSha).toBe("e".repeat(40));
    expect(selectResumeOccupancy([])).toBeUndefined();
  });

  test("[WS-REMOTE-RESUME-004] resumes last occupancy when cwd origin differs", async () => {
    const door = await resolveDefaultRemoteCodeDoor({
      env: { APPALOFT_TOKEN: "token" },
      listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
      listOccupancies: async () => [
        {
          sandboxId: "sbx_live",
          status: "ready",
          occupancy: {
            repositoryIdentity: "github.com/acme/api",
            commitSha: "d".repeat(40),
            branch: "main",
          },
          lastActivityAt: "2026-08-15T12:30:00.000Z",
        },
      ],
      resolveLocator: async () => ({
        repository: "https://github.com/appaloft/appaloft-cloud.git",
        repositoryIdentity: "github.com/appaloft/appaloft-cloud",
        ref: "refs/heads/main",
        branch: "main",
      }),
      resolveRemoteRef: async (repository) => ({
        repositoryIdentity: repository.includes("appaloft-cloud")
          ? "github.com/appaloft/appaloft-cloud"
          : "github.com/acme/api",
        credentialFreeHttpsRepository: repository,
        ref: "refs/heads/main",
        commitSha: repository.includes("appaloft-cloud") ? "f".repeat(40) : "e".repeat(40),
      }),
    });
    expect(door.repositoryIdentity).toBe("github.com/acme/api");
    expect(door.commitSha).toBe("e".repeat(40));
  });

  test("[WS-REMOTE-OPEN-003] --new occupies the cwd origin instead of last occupancy", async () => {
    const door = await resolveDefaultRemoteCodeDoor({
      env: { APPALOFT_TOKEN: "token" },
      forceNew: true,
      listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
      listOccupancies: async () => [
        {
          sandboxId: "sbx_live",
          status: "ready",
          occupancy: {
            repositoryIdentity: "github.com/acme/api",
            commitSha: "d".repeat(40),
            branch: "main",
          },
        },
      ],
      resolveLocator: async () => ({
        repository: "https://github.com/appaloft/appaloft-cloud.git",
        repositoryIdentity: "github.com/appaloft/appaloft-cloud",
        ref: "refs/heads/main",
        branch: "main",
      }),
      resolveRemoteRef: async () => ({
        repositoryIdentity: "github.com/appaloft/appaloft-cloud",
        credentialFreeHttpsRepository: "https://github.com/appaloft/appaloft-cloud.git",
        ref: "refs/heads/main",
        commitSha: "f".repeat(40),
      }),
    });
    expect(door.repositoryIdentity).toBe("github.com/appaloft/appaloft-cloud");
    expect(door.commitSha).toBe("f".repeat(40));
  });

  test("[R8-OCC-ATTACH-010] native attach requires an interactive terminal", () => {
    expect(nativeAttachRequiresInteractiveTerminal({ isTTY: true }, { isTTY: true })).toBe(true);
    expect(nativeAttachRequiresInteractiveTerminal({ isTTY: false }, { isTTY: true })).toBe(false);
    expect(nativeAttachRequiresInteractiveTerminal({ isTTY: true }, { isTTY: false })).toBe(false);
  });

  test("[WS-REMOTE-URL-024][WS-REMOTE-URL-SHORTHAND-028] classifies git remotes and GitHub owner/repo", () => {
    expect(isRemoteCodeGitRemoteLocator("https://github.com/org/repo.git")).toBe(true);
    expect(isRemoteCodeGitRemoteLocator("ssh://git@github.com/org/repo.git")).toBe(true);
    expect(isRemoteCodeGitRemoteLocator("git@github.com:org/repo.git")).toBe(true);
    expect(isRemoteCodeGitRemoteLocator("org/repo")).toBe(true);
    expect(isRemoteCodeGitRemoteLocator(".")).toBe(false);
    expect(isRemoteCodeGitRemoteLocator("/tmp/project")).toBe(false);
  });

  test("[WS-REMOTE-URL-024] positional HTTPS occupies without reading cwd origin", async () => {
    let locatorCalled = false;
    const door = await resolveDefaultRemoteCodeDoor(
      {
        env: { APPALOFT_TOKEN: "token" },
        listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
        resolveLocator: async () => {
          locatorCalled = true;
          throw new Error("explicit git remote must not read cwd origin");
        },
        resolveRemoteRef: async (repository, ref) => ({
          repositoryIdentity: "github.com/org/repo",
          credentialFreeHttpsRepository: repository,
          ref,
          commitSha: "a".repeat(40),
        }),
        runGit: async ({ args }) => {
          if (args[0] === "ls-remote" && args.includes("HEAD")) {
            return {
              stdout: `ref: refs/heads/main\tHEAD\n${"a".repeat(40)}\tHEAD\n`,
              stderr: "",
            };
          }
          throw new Error(args.join(" "));
        },
      },
      "https://github.com/org/repo.git",
    );
    expect(locatorCalled).toBe(false);
    expect(door.repositoryIdentity).toBe("github.com/org/repo");
    expect(door.repository).toBe("https://github.com/org/repo.git");
    expect(door.branch).toBe("main");
    expect(door.ref).toBe("refs/heads/main");
    expect(door.commitSha).toBe("a".repeat(40));
  });

  test("[WS-REMOTE-URL-WINS-026] URL of B does not resume occupancy of A", async () => {
    const door = await resolveDefaultRemoteCodeDoor(
      {
        env: { APPALOFT_TOKEN: "token" },
        listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
        listOccupancies: async () => [
          {
            sandboxId: "sbx_a",
            status: "ready",
            occupancy: {
              repositoryIdentity: "github.com/acme/api",
              commitSha: "d".repeat(40),
              branch: "main",
            },
            lastActivityAt: "2026-08-15T12:30:00.000Z",
          },
        ],
        resolveLocator: async () => {
          throw new Error("explicit git remote must not read cwd origin");
        },
        resolveRemoteRef: async (repository, ref) => ({
          repositoryIdentity: "github.com/org/repo-b",
          credentialFreeHttpsRepository: repository,
          ref,
          commitSha: "b".repeat(40),
        }),
        runGit: async ({ args }) => {
          if (args[0] === "ls-remote" && args.includes("HEAD")) {
            return {
              stdout: `ref: refs/heads/trunk\tHEAD\n${"b".repeat(40)}\tHEAD\n`,
              stderr: "",
            };
          }
          throw new Error(args.join(" "));
        },
      },
      "https://github.com/org/repo-b.git",
    );
    expect(door.repositoryIdentity).toBe("github.com/org/repo-b");
    expect(door.branch).toBe("trunk");
    expect(door.commitSha).toBe("b".repeat(40));
  });

  test("[WS-REMOTE-URL-HEAD-025] fails closed when remote HEAD has no branch", async () => {
    await expect(
      resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
          runGit: async () => ({ stdout: `${"c".repeat(40)}\tHEAD\n`, stderr: "" }),
        },
        "https://github.com/org/repo.git",
      ),
    ).rejects.toMatchObject({ code: "workspace_remote_default_ref_unavailable" });
  });

  test("[WS-REMOTE-URL-HEAD-025] fails closed when remote HEAD matches many heads", async () => {
    await expect(
      resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
          runGit: async ({ args }) => {
            if (args.includes("--symref")) {
              return { stdout: `${"c".repeat(40)}\tHEAD\n`, stderr: "" };
            }
            if (args.includes("--heads")) {
              return {
                stdout: `${"c".repeat(40)}\trefs/heads/main\n${"c".repeat(40)}\trefs/heads/trunk\n`,
                stderr: "",
              };
            }
            throw new Error(args.join(" "));
          },
        },
        "https://github.com/org/repo.git",
      ),
    ).rejects.toMatchObject({ code: "workspace_git_ref_ambiguous" });
  });

  test("[WS-REMOTE-URL-SHORTHAND-028] owner/repo occupies GitHub HTTPS", async () => {
    let locatorCalled = false;
    const door = await resolveDefaultRemoteCodeDoor(
      {
        env: { APPALOFT_TOKEN: "token" },
        listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
        listOccupancies: async () => [
          {
            sandboxId: "sbx_examples",
            status: "ready",
            occupancy: {
              repositoryIdentity: "github.com/appaloft/examples",
              commitSha: "d".repeat(40),
              branch: "main",
            },
            lastActivityAt: "2026-08-16T12:30:00.000Z",
          },
        ],
        resolveLocator: async () => {
          locatorCalled = true;
          throw new Error("owner/repo must not read cwd origin");
        },
        resolveRemoteRef: async (repository, ref) => ({
          repositoryIdentity: "github.com/traefik/whoami",
          credentialFreeHttpsRepository: repository,
          ref,
          commitSha: "e".repeat(40),
        }),
        runGit: async ({ args }) => {
          if (args[0] === "ls-remote" && args.includes("HEAD")) {
            expect(args).toContain("https://github.com/traefik/whoami.git");
            return {
              stdout: `ref: refs/heads/master\tHEAD\n${"e".repeat(40)}\tHEAD\n`,
              stderr: "",
            };
          }
          throw new Error(args.join(" "));
        },
      },
      "traefik/whoami",
    );
    expect(locatorCalled).toBe(false);
    expect(door.repositoryIdentity).toBe("github.com/traefik/whoami");
    expect(door.repository).toBe("https://github.com/traefik/whoami.git");
    expect(door.branch).toBe("master");
  });

  test("[WS-REMOTE-URL-SHORTHAND-056] existing local owner/repo directory stays a path", async () => {
    const { mkdir, mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "appaloft-owner-repo-"));
    const local = join(root, "org", "repo");
    await mkdir(local, { recursive: true });
    const previous = process.cwd();
    let locatorCalled = false;
    try {
      process.chdir(root);
      await expect(
        resolveDefaultRemoteCodeDoor(
          {
            env: { APPALOFT_TOKEN: "token" },
            listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
            resolveLocator: async () => {
              locatorCalled = true;
              throw Object.assign(new Error("missing origin"), {
                code: "workspace_remote_repository_missing",
              });
            },
          },
          "org/repo",
        ),
      ).rejects.toMatchObject({ code: "workspace_remote_repository_missing" });
    } finally {
      process.chdir(previous);
      await rm(root, { recursive: true, force: true });
    }
    expect(locatorCalled).toBe(true);
  });
});
