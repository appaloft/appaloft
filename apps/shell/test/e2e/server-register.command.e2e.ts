import { describe, expect, test } from "bun:test";
import {
  cleanupWorkspace,
  createShellE2eWorkspace,
  parseJson,
  runShellCli,
  startShellHttpServer,
} from "./support/shell-e2e-fixture";

type ServerListResponse = {
  items: Array<{
    edgeProxy?: {
      kind: string;
      status: string;
    };
    host: string;
    id: string;
    name: string;
    port: number;
    providerKey: string;
  }>;
};

function serverSummary(input: { id: string; name: string }) {
  return expect.objectContaining({
    edgeProxy: expect.objectContaining({
      kind: "none",
      status: "disabled",
    }),
    host: "127.0.0.1",
    id: input.id,
    name: input.name,
    port: 22,
    providerKey: "local-shell",
  });
}

describe("servers.register command e2e", () => {
  test("[SERVER-BOOT-ENTRY-001] CLI server register is observable through CLI server list", () => {
    const workspace = createShellE2eWorkspace("yundu-server-register-cli-", {
      appVersion: "0.1.0-server-register-e2e",
    });

    try {
      const suffix = crypto.randomUUID().slice(0, 6);
      const serverName = `cli-server-${suffix}`;
      const server = runShellCli(
        [
          "server",
          "register",
          "--name",
          serverName,
          "--host",
          "127.0.0.1",
          "--provider",
          "local-shell",
          "--proxy-kind",
          "none",
        ],
        workspace.cliOptions,
      );
      expect(server.exitCode).toBe(0);

      const serverId = parseJson<{ id: string }>(server.stdout).id;
      const cliList = runShellCli(["server", "list"], workspace.cliOptions);
      expect(cliList.exitCode).toBe(0);
      expect(parseJson<ServerListResponse>(cliList.stdout).items).toEqual(
        expect.arrayContaining([serverSummary({ id: serverId, name: serverName })]),
      );
    } finally {
      cleanupWorkspace(workspace.workspaceDir);
    }
  });

  test("[SERVER-BOOT-ENTRY-002] HTTP server register is observable through HTTP server list", async () => {
    const workspace = createShellE2eWorkspace("yundu-server-register-http-", {
      appVersion: "0.1.0-server-register-e2e",
    });
    let httpServer: Awaited<ReturnType<typeof startShellHttpServer>> | undefined;

    try {
      const migration = runShellCli(["db", "migrate"], workspace.cliOptions);
      expect(migration.exitCode).toBe(0);

      httpServer = await startShellHttpServer(workspace.cliOptions);

      const suffix = crypto.randomUUID().slice(0, 6);
      const serverName = `http-server-${suffix}`;
      const register = await fetch(`${httpServer.baseUrl}/api/servers`, {
        body: JSON.stringify({
          host: "127.0.0.1",
          name: serverName,
          providerKey: "local-shell",
          proxyKind: "none",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(register.status).toBe(201);

      const serverId = ((await register.json()) as { id: string }).id;
      const apiList = await fetch(`${httpServer.baseUrl}/api/servers`);
      expect(apiList.ok).toBe(true);
      expect(((await apiList.json()) as ServerListResponse).items).toEqual(
        expect.arrayContaining([serverSummary({ id: serverId, name: serverName })]),
      );
    } finally {
      await httpServer?.stop();
      cleanupWorkspace(workspace.workspaceDir);
    }
  });
});
