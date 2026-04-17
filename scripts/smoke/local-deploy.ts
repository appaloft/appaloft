import { join, resolve } from "node:path";
import { $ } from "bun";

type SmokeMethod = "workspace-commands" | "dockerfile";

function parseMethod(argv: string[]): SmokeMethod {
  const methodFlag = argv.find((argument) => argument.startsWith("--method="));
  const methodValue = methodFlag?.split("=")[1] ?? "workspace-commands";

  if (methodValue === "workspace-commands" || methodValue === "dockerfile") {
    return methodValue;
  }

  throw new Error(`Unsupported method: ${methodValue}`);
}

function parsePort(argv: string[]): number {
  const portFlag = argv.find((argument) => argument.startsWith("--port="));
  return Number(portFlag?.split("=")[1] ?? 4310);
}

function runCli(
  args: string[],
  options: {
    dataDir: string;
    pgliteDataDir: string;
  },
): { exitCode: number; stdout: string; stderr: string } {
  const shellRoot = resolve("apps/shell");
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      APPALOFT_DATABASE_DRIVER: "pglite",
      APPALOFT_DATA_DIR: options.dataDir,
      APPALOFT_PGLITE_DATA_DIR: options.pgliteDataDir,
      APPALOFT_HTTP_HOST: "127.0.0.1",
      APPALOFT_HTTP_PORT: "3001",
      APPALOFT_APP_VERSION: "0.1.0-smoke",
      APPALOFT_WEB_STATIC_DIR: "",
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

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // backend or app is not ready yet
    }

    await Bun.sleep(300);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function main(): Promise<void> {
  const method = parseMethod(process.argv.slice(2));
  const port = parsePort(process.argv.slice(2));
  const tempRoot = process.env.TMPDIR ?? "/tmp";
  const workspaceDir = (
    await $`mktemp -d ${join(tempRoot, "appaloft-smoke.XXXXXX")}`.text()
  ).trim();
  const dataDir = join(workspaceDir, ".appaloft", "data");
  const pgliteDataDir = join(dataDir, "pglite");
  const sourceDir = resolve("examples/express-hello");
  let serverProcess: Bun.Subprocess | null = null;
  let preserveWorkspace = false;

  try {
    serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
      cwd: resolve("apps/shell"),
      env: {
        ...process.env,
        APPALOFT_DATABASE_DRIVER: "pglite",
        APPALOFT_DATA_DIR: dataDir,
        APPALOFT_PGLITE_DATA_DIR: pgliteDataDir,
        APPALOFT_HTTP_HOST: "127.0.0.1",
        APPALOFT_HTTP_PORT: "3001",
        APPALOFT_APP_VERSION: "0.1.0-smoke",
        APPALOFT_WEB_STATIC_DIR: "",
      },
      stdout: "ignore",
      stderr: "ignore",
    });

    await waitForHealth("http://127.0.0.1:3001/api/health");

    const deployArgs = [
      "deploy",
      sourceDir,
      "--method",
      method,
      "--port",
      String(port),
      "--health-path",
      "/health",
    ];

    if (method === "workspace-commands") {
      deployArgs.push("--build", "bun build.mjs", "--start", "node dist/server.js");
    }

    const deployment = runCli(deployArgs, { dataDir, pgliteDataDir });
    if (deployment.exitCode !== 0) {
      throw new Error(deployment.stderr || deployment.stdout);
    }

    const deploymentId = parseJson<{ id: string }>(deployment.stdout).id;
    const appUrl = `http://127.0.0.1:${port}/health`;
    await waitForHealth(appUrl);

    const response = await fetch(appUrl);
    const payload = await response.json();
    preserveWorkspace = true;
    const rollbackCommand = [
      `APPALOFT_DATABASE_DRIVER=pglite`,
      `APPALOFT_DATA_DIR=${JSON.stringify(dataDir)}`,
      `APPALOFT_PGLITE_DATA_DIR=${JSON.stringify(pgliteDataDir)}`,
      `bun run --cwd apps/shell src/index.ts rollback ${deploymentId}`,
    ].join(" ");

    console.log(
      JSON.stringify(
        {
          method,
          deploymentId,
          appUrl,
          payload,
          dataDir,
          pgliteDataDir,
          rollback: rollbackCommand,
          logs: `bun run --cwd apps/shell src/index.ts logs ${deploymentId}`,
        },
        null,
        2,
      ),
    );
  } finally {
    serverProcess?.kill();
    await serverProcess?.exited;
    if (!preserveWorkspace) {
      await $`rm -rf ${workspaceDir}`;
    }
  }
}

await main();
