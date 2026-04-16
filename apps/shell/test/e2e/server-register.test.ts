import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shellRoot = new URL("../..", import.meta.url).pathname;

type ServerListResponse = {
  items: Array<{
    id: string;
    name: string;
    host: string;
    port: number;
    providerKey: string;
    edgeProxy?: {
      kind: string;
      status: string;
    };
  }>;
};

function runCli(
  args: string[],
  options: {
    dataDir: string;
    pgliteDataDir: string;
    httpPort: string;
  },
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      YUNDU_DATABASE_DRIVER: "pglite",
      YUNDU_DATA_DIR: options.dataDir,
      YUNDU_PGLITE_DATA_DIR: options.pgliteDataDir,
      YUNDU_HTTP_HOST: "127.0.0.1",
      YUNDU_HTTP_PORT: options.httpPort,
      YUNDU_APP_VERSION: "0.1.0-server-register-test",
      YUNDU_WEB_STATIC_DIR: "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }

    await Bun.sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function createWorkspace(name: string) {
  const workspaceDir = mkdtempSync(join(tmpdir(), name));
  const dataDir = join(workspaceDir, ".yundu", "data");
  const pgliteDataDir = join(dataDir, "pglite");
  const httpPort = String(3500 + Math.floor(Math.random() * 500));

  return {
    cliOptions: {
      dataDir,
      pgliteDataDir,
      httpPort,
    },
    httpPort,
    workspaceDir,
  };
}

function serverSummary(input: { id: string; name: string }) {
  return expect.objectContaining({
    id: input.id,
    name: input.name,
    host: "127.0.0.1",
    port: 22,
    providerKey: "local-shell",
    edgeProxy: expect.objectContaining({
      kind: "none",
      status: "disabled",
    }),
  });
}

describe("server register e2e", () => {
  test("[SERVER-BOOT-ENTRY-001] CLI server register is observable through CLI server list", () => {
    const { cliOptions, workspaceDir } = createWorkspace("yundu-server-register-cli-");

    try {
      const suffix = crypto.randomUUID().slice(0, 6);
      const serverName = `cli-server-${suffix}`;
      const server = runCli(
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
        cliOptions,
      );
      expect(server.exitCode).toBe(0);

      const serverId = parseJson<{ id: string }>(server.stdout).id;
      const cliList = runCli(["server", "list"], cliOptions);
      expect(cliList.exitCode).toBe(0);
      expect(parseJson<ServerListResponse>(cliList.stdout).items).toEqual(
        expect.arrayContaining([serverSummary({ id: serverId, name: serverName })]),
      );
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  test("[SERVER-BOOT-ENTRY-002] HTTP server register is observable through HTTP server list", async () => {
    const { cliOptions, httpPort, workspaceDir } = createWorkspace("yundu-server-register-http-");
    const baseUrl = `http://127.0.0.1:${httpPort}`;
    let serverProcess: Bun.Subprocess | null = null;

    try {
      const migration = runCli(["db", "migrate"], cliOptions);
      expect(migration.exitCode).toBe(0);

      serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
        cwd: shellRoot,
        env: {
          ...process.env,
          YUNDU_DATABASE_DRIVER: "pglite",
          YUNDU_DATA_DIR: cliOptions.dataDir,
          YUNDU_PGLITE_DATA_DIR: cliOptions.pgliteDataDir,
          YUNDU_HTTP_HOST: "127.0.0.1",
          YUNDU_HTTP_PORT: httpPort,
          YUNDU_APP_VERSION: "0.1.0-server-register-test",
          YUNDU_WEB_STATIC_DIR: "",
        },
        stdout: "ignore",
        stderr: "ignore",
      });

      await waitForHealth(`${baseUrl}/api/health`);

      const suffix = crypto.randomUUID().slice(0, 6);
      const serverName = `http-server-${suffix}`;
      const register = await fetch(`${baseUrl}/api/servers`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: serverName,
          host: "127.0.0.1",
          providerKey: "local-shell",
          proxyKind: "none",
        }),
      });
      expect(register.status).toBe(201);

      const serverId = ((await register.json()) as { id: string }).id;
      const apiList = await fetch(`${baseUrl}/api/servers`);
      expect(apiList.ok).toBe(true);
      expect(((await apiList.json()) as ServerListResponse).items).toEqual(
        expect.arrayContaining([serverSummary({ id: serverId, name: serverName })]),
      );
    } finally {
      serverProcess?.kill();
      await serverProcess?.exited;
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
