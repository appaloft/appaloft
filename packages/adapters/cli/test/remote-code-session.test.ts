import { describe, expect, test } from "bun:test";

import {
  formatRemoteCodeBanner,
  nativeAttachRequiresInteractiveTerminal,
  resolveDefaultRemoteCodeDoor,
  selectDefaultRemoteCodeServer,
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
      "Remote · prj_billing · github.com/acme/api@aaaaaaa · mac-mini · my sandbox · sbx_1",
    );
    expect(selectDefaultRemoteCodeServer([{ id: "srv_1", name: "mac-mini" }])?.name).toBe(
      "mac-mini",
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

  test("[R8-OCC-ATTACH-010] native attach requires an interactive terminal", () => {
    expect(nativeAttachRequiresInteractiveTerminal({ isTTY: true }, { isTTY: true })).toBe(true);
    expect(nativeAttachRequiresInteractiveTerminal({ isTTY: false }, { isTTY: true })).toBe(false);
    expect(nativeAttachRequiresInteractiveTerminal({ isTTY: true }, { isTTY: false })).toBe(false);
  });
});
