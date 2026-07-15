import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { $ } from "bun";

type SmokeMethod =
  | "workspace-commands"
  | "dockerfile"
  | "docker-compose"
  | "prebuilt-image"
  | "static";

function parseMethod(argv: string[]): SmokeMethod {
  const methodFlag = argv.find((argument) => argument.startsWith("--method="));
  const methodValue = methodFlag?.split("=")[1] ?? "workspace-commands";

  if (
    methodValue === "workspace-commands" ||
    methodValue === "dockerfile" ||
    methodValue === "docker-compose" ||
    methodValue === "prebuilt-image" ||
    methodValue === "static"
  ) {
    return methodValue;
  }

  throw new Error(`Unsupported method: ${methodValue}`);
}

function parsePort(argv: string[]): number {
  const portFlag = argv.find((argument) => argument.startsWith("--port="));
  return Number(portFlag?.split("=")[1] ?? 4310);
}

async function reserveTcpPort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to reserve a TCP port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(port);
      });
    });
    server.on("error", reject);
  });
}

function runCli(
  args: string[],
  options: {
    controlPlanePort: number;
    dataDir: string;
    pgliteDataDir: string;
  },
): { exitCode: number; stdout: string; stderr: string } {
  const shellRoot = resolve("apps/shell");
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      OTEL_SDK_DISABLED: "true",
      APPALOFT_DATABASE_DRIVER: "pglite",
      APPALOFT_DATA_DIR: options.dataDir,
      APPALOFT_PGLITE_DATA_DIR: options.pgliteDataDir,
      APPALOFT_HTTP_HOST: "127.0.0.1",
      APPALOFT_HTTP_PORT: String(options.controlPlanePort),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function deploymentLogEntries(raw: string): readonly Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.logs)) {
      return [];
    }

    return parsed.logs.filter(isRecord);
  } catch {
    return [];
  }
}

function assertDeploymentProducedRuntime(logs: string): void {
  const entries = deploymentLogEntries(logs);
  const errorEntry = entries.findLast(
    (entry) =>
      entry.level === "error" &&
      entry.source !== "application" &&
      typeof entry.message === "string",
  );
  if (errorEntry) {
    const phase = typeof errorEntry.phase === "string" ? `${errorEntry.phase}: ` : "";
    const context = entries
      .filter(
        (entry) =>
          entry.phase === errorEntry.phase &&
          typeof entry.message === "string" &&
          entry.message !== errorEntry.message,
      )
      .slice(-5)
      .map((entry) => entry.message)
      .join("\n");
    const evidence = context
      ? `\nRecent ${errorEntry.phase ?? "deployment"} output:\n${context}`
      : "";
    throw new Error(
      `Deployment failed before runtime URL was available: ${phase}${errorEntry.message}${evidence}`,
    );
  }
}

function dockerName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

function runDockerCleanup(args: string[]): void {
  const dockerPath = Bun.which("docker");
  if (!dockerPath) {
    return;
  }
  Bun.spawnSync([dockerPath, ...args], {
    stderr: "ignore",
    stdout: "ignore",
  });
}

function expectCliSuccess(
  result: { exitCode: number; stdout: string; stderr: string },
  label: string,
): void {
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
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

async function createWorkspaceDir(tempRoot: string): Promise<string> {
  const randomParts = new Uint32Array(2);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    crypto.getRandomValues(randomParts);
    const suffix = [...randomParts].map((part) => part.toString(16).padStart(8, "0")).join("");
    const workspaceDir = join(tempRoot, `appaloft-smoke.${Date.now().toString(36)}-${suffix}`);
    const markerPath = join(workspaceDir, ".created-by-appaloft-smoke");

    if (await Bun.file(markerPath).exists()) {
      continue;
    }

    mkdirSync(workspaceDir, { recursive: true });
    await Bun.write(markerPath, "");
    return workspaceDir;
  }

  throw new Error("Failed to create a unique smoke test workspace directory");
}

async function createStaticSourceDir(workspaceDir: string): Promise<string> {
  const sourceDir = join(workspaceDir, "static-site");
  const distDir = join(sourceDir, "dist");
  mkdirSync(distDir, { recursive: true });
  await Bun.write(
    join(distDir, "index.html"),
    [
      "<!doctype html>",
      '<html lang="en">',
      '<head><meta charset="utf-8"><title>Appaloft Static Smoke</title></head>',
      "<body>",
      '<main data-smoke-marker="static-site">appaloft static smoke</main>',
      "</body>",
      "</html>",
    ].join("\n"),
  );

  return sourceDir;
}

function buildSmokeImage(input: { sourceDir: string; tag: string }): void {
  const result = Bun.spawnSync(["docker", "build", "-t", input.tag, input.sourceDir], {
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Docker smoke image build failed\nstdout:\n${result.stdout.toString()}\nstderr:\n${result.stderr.toString()}`,
    );
  }
}

async function createComposeSourceDir(input: {
  image: string;
  workspaceDir: string;
}): Promise<{ composeFile: string; sourceDir: string }> {
  const sourceDir = join(input.workspaceDir, "compose-app");
  const composeFile = join(sourceDir, "docker-compose.yml");
  mkdirSync(sourceDir, { recursive: true });
  await Bun.write(
    composeFile,
    [
      "services:",
      "  web:",
      `    image: ${input.image}`,
      "    pull_policy: never",
      "    ports:",
      '      - "127.0.0.1::3000"',
    ].join("\n"),
  );

  return { composeFile, sourceDir };
}

function parseRuntimeUrl(logs: string): string {
  assertDeploymentProducedRuntime(logs);

  const runtimeUrl = /Container is reachable at (http:\/\/127\.0\.0\.1:\d+(?:\/[^"\\\s]*)?)/u.exec(
    logs,
  )?.[1];
  if (!runtimeUrl) {
    throw new Error(`Could not find runtime URL in deployment logs:\n${logs}`);
  }

  return runtimeUrl;
}

async function main(): Promise<void> {
  const method = parseMethod(process.argv.slice(2));
  const port = parsePort(process.argv.slice(2));
  const controlPlanePort = await reserveTcpPort();
  const tempRoot = process.env.TMPDIR ?? "/tmp";
  const workspaceDir = await createWorkspaceDir(tempRoot);
  const dataDir = join(workspaceDir, ".appaloft", "data");
  const pgliteDataDir = join(dataDir, "pglite");
  const suffix = crypto.randomUUID().slice(0, 8);
  const defaultSourceDir = resolve("examples/express-hello");
  const smokeImage = dockerName(`appaloft-smoke-${method}-${suffix}`);
  let composeFile: string | undefined;
  let sourceDir: string;
  if (method === "static") {
    sourceDir = await createStaticSourceDir(workspaceDir);
  } else if (method === "prebuilt-image") {
    buildSmokeImage({ sourceDir: defaultSourceDir, tag: smokeImage });
    sourceDir = `docker://${smokeImage}`;
  } else if (method === "docker-compose") {
    buildSmokeImage({ sourceDir: defaultSourceDir, tag: smokeImage });
    const composeSource = await createComposeSourceDir({ image: smokeImage, workspaceDir });
    composeFile = composeSource.composeFile;
    sourceDir = composeSource.composeFile;
  } else {
    sourceDir = defaultSourceDir;
  }
  let serverProcess: Bun.Subprocess | null = null;
  let deploymentId: string | undefined;
  let preserveWorkspace = false;

  try {
    serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
      cwd: resolve("apps/shell"),
      env: {
        ...process.env,
        OTEL_SDK_DISABLED: "true",
        APPALOFT_DATABASE_DRIVER: "pglite",
        APPALOFT_DATA_DIR: dataDir,
        APPALOFT_PGLITE_DATA_DIR: pgliteDataDir,
        APPALOFT_HTTP_HOST: "127.0.0.1",
        APPALOFT_HTTP_PORT: String(controlPlanePort),
        APPALOFT_APP_VERSION: "0.1.0-smoke",
        APPALOFT_WEB_STATIC_DIR: "",
      },
      stdout: "ignore",
      stderr: "ignore",
    });

    await waitForHealth(`http://127.0.0.1:${controlPlanePort}/api/health`);

    const project = runCli(["project", "create", "--name", `Smoke ${method} ${suffix}`], {
      controlPlanePort,
      dataDir,
      pgliteDataDir,
    });
    expectCliSuccess(project, "create project");
    const projectId = parseJson<{ id: string }>(project.stdout).id;

    const server = runCli(
      [
        "server",
        "register",
        "--name",
        `smoke-local-${suffix}`,
        "--host",
        "127.0.0.1",
        "--provider",
        "local-shell",
        "--proxy-kind",
        "none",
      ],
      { controlPlanePort, dataDir, pgliteDataDir },
    );
    expectCliSuccess(server, "register local server");
    const serverId = parseJson<{ id: string }>(server.stdout).id;

    const environment = runCli(
      ["env", "create", "--project", projectId, "--name", "local", "--kind", "local"],
      { controlPlanePort, dataDir, pgliteDataDir },
    );
    expectCliSuccess(environment, "create environment");
    const environmentId = parseJson<{ id: string }>(environment.stdout).id;

    const deployArgs = [
      "deploy",
      sourceDir,
      "--project",
      projectId,
      "--server",
      serverId,
      "--environment",
      environmentId,
      "--method",
      method,
    ];

    if (method === "workspace-commands") {
      deployArgs.push(
        "--port",
        String(port),
        "--health-path",
        "/health",
        "--build",
        "node build.mjs",
        "--start",
        "node dist/server.js",
      );
    } else if (method === "dockerfile") {
      deployArgs.push("--port", String(port), "--health-path", "/health");
    } else if (method === "prebuilt-image") {
      deployArgs.push("--port", String(port), "--health-path", "/health");
    } else if (method === "docker-compose") {
      deployArgs.push("--port", String(port));
    } else {
      deployArgs.push("--publish-dir", "/dist", "--health-path", "/");
    }

    const deployment = runCli(deployArgs, { controlPlanePort, dataDir, pgliteDataDir });
    expectCliSuccess(deployment, "deploy");

    deploymentId = parseJson<{ id: string }>(deployment.stdout).id;
    const logs = runCli(["logs", deploymentId], { controlPlanePort, dataDir, pgliteDataDir });
    expectCliSuccess(logs, "logs");

    const appUrl = method === "docker-compose" ? null : parseRuntimeUrl(logs.stdout);
    if (appUrl) {
      await waitForHealth(appUrl);
    }

    const response = appUrl ? await fetch(appUrl) : null;
    let payload: unknown;
    if (method === "docker-compose") {
      if (!logs.stdout.includes("Compose stack passed deployment verification")) {
        throw new Error(`Compose smoke did not report a successful stack start:\n${logs.stdout}`);
      }
      payload = { composeStarted: true };
    } else if (method === "static") {
      if (!response) {
        throw new Error("Static smoke response is missing");
      }
      const html = await response.text();
      if (!html.includes("appaloft static smoke")) {
        throw new Error("Static smoke response did not include marker text");
      }
      payload = { htmlIncludesMarker: true };
    } else {
      if (!response) {
        throw new Error("Application smoke response is missing");
      }
      payload = await response.json();
    }
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
          controlPlaneUrl: `http://127.0.0.1:${controlPlanePort}`,
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
      if (deploymentId) {
        if (composeFile) {
          runDockerCleanup([
            "compose",
            "-p",
            dockerName(`appaloft-${deploymentId}`),
            "-f",
            composeFile,
            "down",
            "--remove-orphans",
          ]);
        }
        runDockerCleanup(["rm", "-f", dockerName(`appaloft-${deploymentId}`)]);
        runDockerCleanup(["image", "rm", "-f", dockerName(`appaloft-image-${deploymentId}`)]);
      }
      runDockerCleanup(["image", "rm", "-f", smokeImage]);
      await $`rm -rf ${workspaceDir}`;
    }
  }
}

await main();
