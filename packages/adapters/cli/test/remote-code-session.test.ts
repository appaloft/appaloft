import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { folderOccupancyIdentity } from "../src/folder-project-link.js";
import { OCCUPANCY_CODE_PROGRESS } from "../src/occupancy-code-progress.js";
import {
  folderHasGitWorktree,
  formatRemoteCodeBanner,
  formatRemoteCodeGitHubHint,
  isRemoteCodeGitRemoteLocator,
  nativeAttachRequiresInteractiveTerminal,
  occupancyCloudCompatError,
  pinRemoteCodeDoorServer,
  REMOTE_CODE_DOOR_HINT,
  REMOTE_CODE_GITHUB_HINT,
  REMOTE_CODE_MODEL_HINT,
  remoteOccupyBannerProjectId,
  resolveDefaultRemoteCodeDoor,
  selectDefaultRemoteCodeServer,
  selectResumeOccupancy,
  selectWorkspaceOpenTargetServerId,
  workspaceGitDiscoveryCeiling,
} from "../src/remote-code-session.js";

async function withThisFolderGitWorktree<T>(run: (gitDir: string) => Promise<T>): Promise<T> {
  const gitDir = await mkdtemp(join(tmpdir(), "appaloft-remote-code-git-"));
  await mkdir(join(gitDir, ".git"));
  try {
    return await run(gitDir);
  } finally {
    await rm(gitDir, { recursive: true, force: true });
  }
}

describe("remote code door", () => {
  test("[WS-REMOTE-HINT-119] occupancy door hint names existing doors", () => {
    expect(REMOTE_CODE_DOOR_HINT).toContain("--open-target");
    expect(REMOTE_CODE_DOOR_HINT).toContain("workspace p/P/o/c");
    expect(REMOTE_CODE_MODEL_HINT).toContain("OpenCode");
    expect(REMOTE_CODE_GITHUB_HINT).toContain("/account/connections");
    expect(REMOTE_CODE_GITHUB_HINT).toContain("contents/PR write");
    expect(formatRemoteCodeGitHubHint("https://app.appaloft.com")).toContain(
      "https://app.appaloft.com/account/connections",
    );
    expect(formatRemoteCodeGitHubHint("https://app.appaloft.com/")).toContain(
      "https://app.appaloft.com/account/connections",
    );
  });
  test("[WS-REMOTE-COMPAT-128][WS-REMOTE-COMPAT-129][WS-REMOTE-COMPAT-130] unstructured occupancy validation names the enrolled Server", () => {
    const server = { id: "srv_4lifk0yrcecy", name: "hostinger" };
    expect(
      occupancyCloudCompatError(
        {
          code: "bad_request",
          category: "user",
          message: "Input validation failed",
          retryable: false,
          details: { phase: "orpc-error-normalization", orpcCode: "BAD_REQUEST" },
        },
        server,
      ),
    ).toMatchObject({
      code: "workspace_open_target_server_unsupported",
      message: "This Cloud does not accept Server targeting for hostinger (srv_4lifk0yrcecy)",
      details: { serverId: "srv_4lifk0yrcecy" },
    });
    const bound = {
      code: "not_found",
      category: "user" as const,
      message: "RepositoryBinding github.com/traefik/whoami was not found",
      retryable: false,
      details: { code: "workspace_open_repository_not_bound" },
    };
    expect(occupancyCloudCompatError(bound, server)).toEqual(bound);
  });
  test("[WS-REMOTE-OPEN-BYOS-181] workspace open prefers an explicit Server, then the enrolled BYOS", () => {
    const hostinger = {
      id: "srv_4lifk0yrcecy",
      name: "hostinger",
      lifecycleStatus: "active",
      runtimeAvailability: { status: "available" as const },
    };
    const leftover = {
      id: "srv_yundu",
      name: "yundu",
      lifecycleStatus: "active",
    };
    expect(
      selectWorkspaceOpenTargetServerId({
        explicit: "srv_4lifk0yrcecy",
        servers: [leftover, hostinger],
      }),
    ).toBe("srv_4lifk0yrcecy");
    expect(selectWorkspaceOpenTargetServerId({ servers: [hostinger] })).toBe("srv_4lifk0yrcecy");
    expect(selectWorkspaceOpenTargetServerId({ servers: [] })).toBeUndefined();
  });

  test("[WS-REMOTE-OPEN-BYOS-181] code --server pins hostinger when another Server is enrolled", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-server-pin-"));
    try {
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          explicitServerId: "srv_4lifk0yrcecy",
          folderCwd: emptyDir,
          folderOnboarding: {
            projectId: "prj_notes",
            projectName: "notes",
            identity: "folder.local/cwd/notes",
            created: true,
            reused: false,
          },
          listServers: async () => [
            { id: "srv_yundu", name: "yundu", lifecycleStatus: "active" },
            {
              id: "srv_4lifk0yrcecy",
              name: "hostinger",
              lifecycleStatus: "active",
              runtimeAvailability: { status: "available" as const },
            },
          ],
          listOccupancies: async () => [],
          resolveLocator: async () => {
            throw new Error("no-git --server pin must occupy folder.local");
          },
          resolveRemoteRef: async () => {
            throw new Error("folder.local --server pin must not wait on ls-remote");
          },
        },
        emptyDir,
      );
      expect(door.serverId).toBe("srv_4lifk0yrcecy");
      expect(door.serverName).toBe("hostinger");
      expect(door.repositoryIdentity).toBe("folder.local/cwd/notes");
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  test("[WS-REMOTE-OPEN-BYOS-181] --server pins hostinger over an already resolved yundu door", () => {
    const pinned = pinRemoteCodeDoorServer(
      {
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        ref: "refs/heads/main",
        branch: "main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        projectId: "prj_billing",
        serverId: "srv_yundu",
        serverName: "yundu",
      },
      "srv_4lifk0yrcecy",
    );
    expect(pinned.serverId).toBe("srv_4lifk0yrcecy");
  });

  test("[WS-REMOTE-PROGRESS-187][WS-REMOTE-PROGRESS-190] reports status before slow login, server, occupancy, and repository steps", async () => {
    await withThisFolderGitWorktree(async (gitDir) => {
      const progress: string[] = [];
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: {},
          folderCwd: gitDir,
          onProgress: (message) => progress.push(message),
          readActiveProfile: async () => {
            expect(progress).toEqual([OCCUPANCY_CODE_PROGRESS.checkingLogin]);
            await Bun.sleep(15);
            return { auth: { token: "token" } };
          },
          listServers: async () => {
            expect(progress).toContain(OCCUPANCY_CODE_PROGRESS.lookingUpServers);
            expect(progress.indexOf(OCCUPANCY_CODE_PROGRESS.lookingUpServers)).toBeGreaterThan(
              progress.indexOf(OCCUPANCY_CODE_PROGRESS.checkingLogin),
            );
            await Bun.sleep(15);
            return [{ id: "srv_1", name: "hostinger", lifecycleStatus: "active" }];
          },
          listOccupancies: async () => {
            expect(progress).toContain(OCCUPANCY_CODE_PROGRESS.choosingOccupancy);
            await Bun.sleep(15);
            return [];
          },
          resolveLocator: async () => {
            expect(progress).toContain(OCCUPANCY_CODE_PROGRESS.resolvingRepository);
            await Bun.sleep(15);
            return {
              repository: "https://github.com/acme/api.git",
              repositoryIdentity: "github.com/acme/api",
              ref: "refs/heads/main",
              branch: "main",
            };
          },
          showBinding: async () => null,
          resolveRemoteRef: async () => ({
            repositoryIdentity: "github.com/acme/api",
            credentialFreeHttpsRepository: "https://github.com/acme/api.git",
            ref: "refs/heads/main",
            commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          }),
        },
        gitDir,
      );
      expect(door.serverName).toBe("hostinger");
      expect(progress).toEqual([
        OCCUPANCY_CODE_PROGRESS.checkingLogin,
        OCCUPANCY_CODE_PROGRESS.lookingUpServers,
        OCCUPANCY_CODE_PROGRESS.choosingOccupancy,
        OCCUPANCY_CODE_PROGRESS.resolvingRepository,
      ]);
    });
  });

  test("[WS-REMOTE-PROGRESS-190] announces login before fail-closed logout", async () => {
    const progress: string[] = [];
    await expect(
      resolveDefaultRemoteCodeDoor({
        env: {},
        onProgress: (message) => progress.push(message),
        readActiveProfile: async () => {
          expect(progress).toEqual([OCCUPANCY_CODE_PROGRESS.checkingLogin]);
          return null;
        },
        listServers: async () => {
          throw new Error("logout must not look up servers");
        },
      }),
    ).rejects.toMatchObject({
      code: "workspace_remote_login_required",
      details: { guidance: expect.stringContaining("Run appaloft login") },
    });
    expect(progress).toEqual([OCCUPANCY_CODE_PROGRESS.checkingLogin]);
  });

  test("[WS-REMOTE-LOGIN-001] fails closed without login or profile", async () => {
    await expect(
      resolveDefaultRemoteCodeDoor({
        env: {},
        readActiveProfile: async () => null,
        listServers: async () => [],
      }),
    ).rejects.toMatchObject({
      code: "workspace_remote_login_required",
      details: { guidance: expect.stringContaining("Run appaloft login") },
    });
  });

  test("[WS-REMOTE-LOGIN-001] isolated APPALOFT_HOME does not use ~/.appaloft", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-remote-code-login-"));
    await expect(
      resolveDefaultRemoteCodeDoor({
        env: { APPALOFT_HOME: appaloftHome },
        listServers: async () => [
          {
            id: "srv_1",
            name: "this-mac",
            providerKey: "local-shell",
            lifecycleStatus: "active",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "workspace_remote_login_required",
      details: { guidance: expect.stringContaining("Run appaloft login") },
    });
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
    await withThisFolderGitWorktree(async (gitDir) => {
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          folderCwd: gitDir,
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
        },
        gitDir,
      );
      expect(door.projectId).toBe("project");
      expect(door.serverId).toBe("srv_1");
      expect(door.commitSha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    });
  });

  test("[WS-REMOTE-OPEN-003][WS-REMOTE-BANNER-014] resolves Binding remote SHA and identity banner", async () => {
    await withThisFolderGitWorktree(async (gitDir) => {
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          folderCwd: gitDir,
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
        },
        gitDir,
      );

      expect(door.commitSha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(door.serverId).toBe("srv_1");
      expect(formatRemoteCodeBanner({ ...door, name: "api@aaaaaaa" })).toBe(
        "Remote · prj_billing · github.com/acme/api@aaaaaaa · mac-mini · my sandbox · api@aaaaaaa\nCompare · https://github.com/acme/api/compare/main?expand=1",
      );
      expect(selectDefaultRemoteCodeServer([{ id: "srv_1", name: "mac-mini" }])?.name).toBe(
        "mac-mini",
      );
    });
  });

  test("[FOLDER-ONBOARD-007] folder.local banner prefers the current-folder door project", () => {
    expect(
      remoteOccupyBannerProjectId({
        repositoryIdentity: folderOccupancyIdentity("nux-code-silence-cwd"),
        doorProjectId: "prj_7fky4yjn1l1c",
        resultProjectId: "prj_vlhs6pf8v4yp",
      }),
    ).toBe("prj_7fky4yjn1l1c");
    expect(
      remoteOccupyBannerProjectId({
        repositoryIdentity: "github.com/acme/api",
        doorProjectId: "prj_web",
        resultProjectId: "prj_billing",
      }),
    ).toBe("prj_billing");
  });

  test("[SBX-DOM-005] banner never paints an sbx_ workspaceId as the sandbox name", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_billing",
        repositoryIdentity: "github.com/acme/api",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        serverName: "mac-mini",
        workspaceId: "sbx_hidden",
      }),
    ).toBe(
      "Remote · prj_billing · github.com/acme/api@aaaaaaa · mac-mini · my sandbox\nCompare · https://github.com/acme/api/compare/main?expand=1",
    );
  });

  test("[WS-REMOTE-BANNER-061] occupancy banner includes generated access URL", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        name: "whoami@1ce75d0",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · whoami@1ce75d0\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io",
    );
  });

  test("[WS-REMOTE-BANNER-062] missing generated access keeps existing banner", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        name: "whoami@1ce75d0",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · whoami@1ce75d0",
    );
  });

  test("[WS-REMOTE-BANNER-081] occupancy banner includes matching PR", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        name: "whoami@1ce75d0",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        pullRequestNumber: 928,
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · whoami@1ce75d0\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io\nPR #928 · https://github.com/traefik/whoami/pull/928",
    );
  });

  test("[WS-REMOTE-BANNER-082][WS-REMOTE-BANNER-083] missing or invalid banner PR stays omitted", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        name: "whoami@1ce75d0",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        pullRequestNumber: 0,
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · whoami@1ce75d0\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io",
    );
  });

  test("[WS-REMOTE-BANNER-101][WS-REMOTE-BANNER-104][WS-REMOTE-BANNER-117] occupancy banner copies GitHub compare when no PR exists", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        name: "whoami@1ce75d0",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        branch: "feat/occupancy",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · whoami@1ce75d0\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io\nCompare · https://github.com/traefik/whoami/compare/feat/occupancy?expand=1",
    );
  });

  test("[WS-REMOTE-BANNER-102][WS-REMOTE-BANNER-105][WS-REMOTE-BANNER-118] existing PR banner stays PR-only", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        name: "whoami@1ce75d0",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        pullRequestNumber: 928,
        branch: "feat/occupancy",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · whoami@1ce75d0\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io\nPR #928 · https://github.com/traefik/whoami/pull/928",
    );
  });

  test("[WS-REMOTE-BANNER-103][WS-REMOTE-BANNER-106] missing compare stays omitted", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "gitlab.com/acme/api",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        name: "whoami@1ce75d0",
        branch: "feat/occupancy",
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · gitlab.com/acme/api@1ce75d0 · occupancy-mac · my sandbox · whoami@1ce75d0",
    );
  });

  test("[WS-REMOTE-BANNER-113][WS-REMOTE-BANNER-116] occupancy banner copies Production", () => {
    expect(
      formatRemoteCodeBanner({
        projectId: "prj_tk5lovqu2vj8",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        serverName: "occupancy-mac",
        name: "whoami@1ce75d0",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io",
        productionUrl: "https://whoami.example/",
        pullRequestNumber: 928,
      }),
    ).toBe(
      "Remote · prj_tk5lovqu2vj8 · github.com/traefik/whoami@1ce75d0 · occupancy-mac · my sandbox · whoami@1ce75d0\nPreview · http://app-sc156jw98k.127.0.0.1.sslip.io\nProduction · https://whoami.example/\nPR #928 · https://github.com/traefik/whoami/pull/928",
    );
  });

  test("[WS-REMOTE-LOGIN-001] local composition still requires login", async () => {
    await expect(
      resolveDefaultRemoteCodeDoor({
        env: {},
        readActiveProfile: async () => null,
        listServers: async () => [
          {
            id: "srv_1",
            name: "this-mac",
            providerKey: "local-shell",
            lifecycleStatus: "active",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "workspace_remote_login_required",
      details: { guidance: expect.stringContaining("Run appaloft login") },
    });
  });

  test("[WS-REMOTE-NO-UPLOAD-006] uses origin tracking SHA when ls-remote cannot prompt", async () => {
    await withThisFolderGitWorktree(async (gitDir) => {
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          folderCwd: gitDir,
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
        },
        gitDir,
      );
      expect(door.commitSha).toBe("b".repeat(40));
      expect(door.serverId).toBe("srv_1");
    });
  });

  test("[WS-REMOTE-NO-UPLOAD-006][WS-REMOTE-PROGRESS-201] no-git current folder does not resume examples", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-nongit-door-"));
    let contactedRemote = false;
    try {
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          folderCwd: emptyDir,
          folderOnboarding: {
            projectId: "prj_notes",
            projectName: "notes",
            identity: "folder.local/cwd/notes",
            created: true,
            reused: false,
          },
          listServers: async () => [{ id: "srv_1", name: "hostinger", lifecycleStatus: "active" }],
          listOccupancies: async () => [
            {
              sandboxId: "sbx_examples",
              status: "ready",
              occupancy: {
                repositoryIdentity: "github.com/appaloft/examples",
                commitSha: "d".repeat(40),
                branch: "main",
              },
              lastActivityAt: "2026-08-15T12:30:00.000Z",
            },
            {
              sandboxId: "sbx_truefile",
              status: "ready",
              occupancy: {
                repositoryIdentity: "github.com/acme/truefile",
                commitSha: "e".repeat(40),
                branch: "main",
              },
              lastActivityAt: "2026-08-16T12:30:00.000Z",
            },
          ],
          resolveLocator: async () => {
            throw new Error("no-git occupancy must not wait on a folder locator");
          },
          resolveRemoteRef: async () => {
            contactedRemote = true;
            throw new Error("this-folder occupancy must not wait on ls-remote");
          },
        },
        emptyDir,
      );
      expect(door.repositoryIdentity).toBe("folder.local/cwd/notes");
      expect(door.projectName).toBe("notes");
      expect(door.repositoryIdentity).not.toBe("github.com/appaloft/examples");
      expect(door.repositoryIdentity).not.toBe("github.com/acme/truefile");
      expect(door.serverName).toBe("hostinger");
      expect(contactedRemote).toBe(false);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
    expect(selectResumeOccupancy([])).toBeUndefined();
  });

  test("[WS-REMOTE-NO-UPLOAD-006][FOLDER-ONBOARD-007] occupies this folder when the local path has no origin and no occupancy", async () => {
    const door = await resolveDefaultRemoteCodeDoor({
      env: { APPALOFT_TOKEN: "token" },
      listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
      folderCwd: "/tmp/hello-static",
      folderOnboarding: {
        projectId: "prj_hello",
        projectName: "hello-static",
        identity: "folder.local/cwd/hello-static",
        created: true,
        reused: false,
      },
      listOccupancies: async () => [],
      resolveLocator: async () => {
        throw Object.assign(new Error("missing origin"), {
          code: "workspace_remote_repository_missing",
        });
      },
    });
    expect(door.repositoryIdentity).toBe("folder.local/cwd/hello-static");
    expect(door.projectId).toBe("prj_hello");
    expect(door.branch).toBe("local");
    expect(door.commitSha).toHaveLength(40);
    expect(selectResumeOccupancy([])).toBeUndefined();
  });

  test("[WS-REMOTE-RESUME-004] occupies the cwd origin when it differs from last occupancy", async () => {
    const door = await resolveDefaultRemoteCodeDoor({
      env: { APPALOFT_TOKEN: "token" },
      listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
      folderOnboarding: {
        projectId: "prj_cloud",
        identity: "github.com/appaloft/appaloft-cloud",
        created: false,
        reused: false,
      },
      listOccupancies: async () => [
        {
          sandboxId: "sbx_examples",
          status: "ready",
          occupancy: {
            repositoryIdentity: "github.com/appaloft/examples",
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
          : "github.com/appaloft/examples",
        credentialFreeHttpsRepository: repository,
        ref: "refs/heads/main",
        commitSha: repository.includes("appaloft-cloud") ? "f".repeat(40) : "e".repeat(40),
      }),
    });
    expect(door.repositoryIdentity).toBe("github.com/appaloft/appaloft-cloud");
    expect(door.commitSha).toBe("f".repeat(40));
    expect(door.projectId).toBe("prj_cloud");
  });

  test("[WS-REMOTE-NO-UPLOAD-006] --new from a non-git path does not occupy the last occupancy repo", async () => {
    await expect(
      resolveDefaultRemoteCodeDoor({
        env: { APPALOFT_TOKEN: "token" },
        forceNew: true,
        listServers: async () => [{ id: "srv_1", name: "hostinger", lifecycleStatus: "active" }],
        listOccupancies: async () => [
          {
            sandboxId: "sbx_examples",
            status: "ready",
            occupancy: {
              repositoryIdentity: "github.com/appaloft/examples",
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
        resolveRemoteRef: async () => {
          throw new Error("unrelated occupancy must not become this folder's locator");
        },
      }),
    ).rejects.toMatchObject({
      code: "workspace_remote_repository_missing",
    });
  });

  test("[WS-REMOTE-OPEN-003] --new occupies the cwd origin instead of last occupancy", async () => {
    await withThisFolderGitWorktree(async (gitDir) => {
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          folderCwd: gitDir,
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
        },
        gitDir,
      );
      expect(door.repositoryIdentity).toBe("github.com/appaloft/appaloft-cloud");
      expect(door.commitSha).toBe("f".repeat(40));
    });
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

  test("[WS-REMOTE-PROGRESS-201] non-git folder under HOME git does not wait on the ancestor remote", async () => {
    const home = await mkdtemp(join(tmpdir(), "appaloft-home-git-"));
    const silence = join(home, "nux-code-silence-cwd");
    await mkdir(silence);
    const git = async (args: readonly string[]) => {
      const result = await Bun.spawn(["git", ...args], {
        cwd: home,
        stdout: "pipe",
        stderr: "pipe",
      }).exited;
      if (result !== 0) throw new Error(`git ${args.join(" ")} failed`);
    };
    try {
      await git(["init"]);
      await git(["remote", "add", "origin", "https://github.com/acme/never-resolves.git"]);
      expect(workspaceGitDiscoveryCeiling(silence, home)).toBe(home);
      const started = Date.now();
      let contactedRemote = false;
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token", HOME: home },
          listServers: async () => [{ id: "srv_1", name: "hostinger", lifecycleStatus: "active" }],
          folderOnboarding: {
            projectId: "prj_silence",
            projectName: "nux-code-silence-cwd",
            identity: "folder.local/cwd/nux-code-silence-cwd",
            created: true,
            reused: false,
          },
          listOccupancies: async () => [
            {
              sandboxId: "sbx_examples",
              status: "ready",
              occupancy: {
                repositoryIdentity: "github.com/appaloft/examples",
                commitSha: "d".repeat(40),
                branch: "main",
              },
              lastActivityAt: "2026-08-15T12:30:00.000Z",
            },
          ],
          resolveRemoteRef: async () => {
            contactedRemote = true;
            await Bun.sleep(45_000);
            throw new Error("ancestor remote must not be contacted");
          },
        },
        silence,
      );
      expect(door.repositoryIdentity).toBe("folder.local/cwd/nux-code-silence-cwd");
      expect(door.repositoryIdentity).not.toBe("github.com/appaloft/examples");
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(contactedRemote).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("[WS-REMOTE-PROGRESS-201] no-git cwd under an examples git ancestor does not resume examples", async () => {
    const ancestor = await mkdtemp(join(tmpdir(), "appaloft-examples-ancestor-"));
    const scratch = join(ancestor, "scratch");
    await mkdir(scratch);
    const git = async (args: readonly string[]) => {
      const result = await Bun.spawn(["git", ...args], {
        cwd: ancestor,
        stdout: "pipe",
        stderr: "pipe",
      }).exited;
      if (result !== 0) throw new Error(`git ${args.join(" ")} failed`);
    };
    let contactedRemote = false;
    let resolvedLocator = false;
    try {
      await git(["init"]);
      await git(["remote", "add", "origin", "https://github.com/appaloft/examples.git"]);
      expect(folderHasGitWorktree(scratch)).toBe(false);
      expect(folderHasGitWorktree(ancestor)).toBe(true);
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          folderCwd: scratch,
          ensureFolderOnboarding: async () => ({
            projectId: "prj_scratch",
            projectName: "scratch",
            identity: folderOccupancyIdentity("scratch"),
            created: true,
            reused: false,
          }),
          listServers: async () => [{ id: "srv_1", name: "hostinger", lifecycleStatus: "active" }],
          listOccupancies: async () => [
            {
              sandboxId: "sbx_c343gwqfn7yd",
              status: "ready",
              occupancy: {
                repositoryIdentity: "github.com/appaloft/examples",
                commitSha: "1a23b77000000000000000000000000000000000",
                branch: "main",
              },
              lastActivityAt: "2026-08-20T12:30:00.000Z",
            },
          ],
          resolveLocator: async () => {
            resolvedLocator = true;
            throw new Error("no-git cwd must not use the ancestor examples locator");
          },
          resolveRemoteRef: async () => {
            contactedRemote = true;
            throw new Error("no-git cwd must not ls-remote examples");
          },
        },
        scratch,
      );
      expect(door.repositoryIdentity).toBe(folderOccupancyIdentity("scratch"));
      expect(door.repositoryIdentity).not.toBe("github.com/appaloft/examples");
      expect(door.commitSha).not.toBe("1a23b77000000000000000000000000000000000");
      expect(resolvedLocator).toBe(false);
      expect(contactedRemote).toBe(false);
    } finally {
      await rm(ancestor, { recursive: true, force: true });
    }
  });

  test("[WS-REMOTE-NO-UPLOAD-006] --new from a no-git cwd stays fail-closed and does not resume examples", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "appaloft-code-new-nongit-"));
    try {
      await expect(
        resolveDefaultRemoteCodeDoor(
          {
            env: { APPALOFT_TOKEN: "token" },
            forceNew: true,
            folderOnboarding: {
              projectId: "prj_scratch",
              identity: folderOccupancyIdentity("scratch"),
              created: true,
              reused: false,
            },
            listServers: async () => [
              { id: "srv_1", name: "hostinger", lifecycleStatus: "active" },
            ],
            listOccupancies: async () => [
              {
                sandboxId: "sbx_c343gwqfn7yd",
                status: "ready",
                occupancy: {
                  repositoryIdentity: "github.com/appaloft/examples",
                  commitSha: "1a23b77000000000000000000000000000000000",
                  branch: "main",
                },
              },
            ],
          },
          emptyDir,
        ),
      ).rejects.toMatchObject({
        code: "workspace_remote_repository_missing",
      });
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  test("[WS-REMOTE-PROGRESS-201] matching occupancy uses the stored SHA and does not wait on ls-remote", async () => {
    await withThisFolderGitWorktree(async (gitDir) => {
      const started = Date.now();
      let contactedRemote = false;
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          folderCwd: gitDir,
          listServers: async () => [{ id: "srv_1", name: "hostinger", lifecycleStatus: "active" }],
          listOccupancies: async () => [
            {
              sandboxId: "sbx_api",
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
            repository: "https://github.com/acme/api.git",
            repositoryIdentity: "github.com/acme/api",
            ref: "refs/heads/main",
            branch: "main",
          }),
          resolveRemoteRef: async () => {
            contactedRemote = true;
            await Bun.sleep(45_000);
            throw new Error("matching occupancy must not wait on ls-remote");
          },
        },
        gitDir,
      );
      expect(door.commitSha).toBe("d".repeat(40));
      expect(door.repositoryIdentity).toBe("github.com/acme/api");
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(contactedRemote).toBe(false);
    });
  });

  test("[WS-REMOTE-URL-SHORTHAND-056] existing local owner/repo directory stays a path", async () => {
    const { mkdir, mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "appaloft-owner-repo-"));
    const local = join(root, "org", "repo");
    await mkdir(local, { recursive: true });
    const previous = process.cwd();
    let contactedGithub = false;
    try {
      process.chdir(root);
      const door = await resolveDefaultRemoteCodeDoor(
        {
          env: { APPALOFT_TOKEN: "token" },
          folderCwd: local,
          folderOnboarding: {
            projectId: "prj_repo",
            projectName: "repo",
            identity: "folder.local/cwd/repo",
            created: true,
            reused: false,
          },
          listServers: async () => [{ id: "srv_1", name: "mac-mini", lifecycleStatus: "active" }],
          resolveLocator: async () => {
            throw new Error("existing owner/repo directory must not use a git locator");
          },
          resolveRemoteRef: async () => {
            contactedGithub = true;
            throw new Error("existing owner/repo directory must not become a GitHub remote");
          },
        },
        "org/repo",
      );
      expect(door.repositoryIdentity).toBe("folder.local/cwd/repo");
      expect(door.repositoryIdentity).not.toBe("github.com/org/repo");
      expect(contactedGithub).toBe(false);
    } finally {
      process.chdir(previous);
      await rm(root, { recursive: true, force: true });
    }
  });
});
