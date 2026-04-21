import { expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const shellRoot = new URL("../../..", import.meta.url).pathname;

export interface ShellCliOptions {
  appVersion?: string;
  dataDir: string;
  env?: Record<string, string | undefined>;
  httpPort?: string;
  pgliteDataDir: string;
}

export interface ShellE2eWorkspace {
  cliOptions: ShellCliOptions;
  dataDir: string;
  httpPort: string;
  pgliteDataDir: string;
  workspaceDir: string;
}

export interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export function fixturePath(name: string): string {
  return new URL(`../../fixtures/${name}`, import.meta.url).pathname;
}

export function createShellE2eWorkspace(
  prefix: string,
  options: {
    appVersion?: string;
    env?: Record<string, string | undefined>;
    httpPort?: string;
  } = {},
): ShellE2eWorkspace {
  const workspaceDir = mkdtempSync(join(tmpdir(), prefix));
  const dataDir = join(workspaceDir, ".appaloft", "data");
  const pgliteDataDir = join(dataDir, "pglite");
  const httpPort = options.httpPort ?? String(3500 + Math.floor(Math.random() * 2000));
  const cliOptions: ShellCliOptions = {
    dataDir,
    httpPort,
    pgliteDataDir,
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    ...(options.env ? { env: options.env } : {}),
  };

  return {
    cliOptions,
    dataDir,
    httpPort,
    pgliteDataDir,
    workspaceDir,
  };
}

export function cleanupWorkspace(workspaceDir: string): void {
  rmSync(workspaceDir, { recursive: true, force: true });
}

export function runShellCli(args: string[], options: ShellCliOptions): CliResult {
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      OTEL_SDK_DISABLED: "true",
      APPALOFT_APP_VERSION: options.appVersion ?? "0.1.0-e2e",
      APPALOFT_DATABASE_DRIVER: "pglite",
      APPALOFT_DATA_DIR: options.dataDir,
      APPALOFT_HTTP_HOST: "127.0.0.1",
      APPALOFT_HTTP_PORT: options.httpPort ?? "0",
      APPALOFT_PGLITE_DATA_DIR: options.pgliteDataDir,
      APPALOFT_WEB_STATIC_DIR: "",
      ...options.env,
    },
    stderr: "pipe",
    stdout: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stderr: (result.stderr ?? new Uint8Array()).toString(),
    stdout: (result.stdout ?? new Uint8Array()).toString(),
  };
}

export function expectCliSuccess(result: CliResult, label: string): void {
  expect(result.exitCode, `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
}

export function parseJson<T>(raw: string): T {
  const objectStart = raw.indexOf("{");
  const arrayStart = raw.indexOf("[");
  const start =
    objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);

  if (start < 0) {
    throw new SyntaxError("No JSON payload found");
  }

  const opening = raw[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === opening) {
      depth += 1;
      continue;
    }

    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(raw.slice(start, index + 1)) as T;
      }
    }
  }

  throw new SyntaxError("Unterminated JSON payload");
}

export async function waitForHttpHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // HTTP process is still starting.
    }

    await Bun.sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export async function startShellHttpServer(options: ShellCliOptions): Promise<{
  baseUrl: string;
  stop: () => Promise<void>;
}> {
  if (!options.httpPort) {
    throw new Error("startShellHttpServer requires options.httpPort");
  }

  const serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
    cwd: shellRoot,
    env: {
      ...process.env,
      OTEL_SDK_DISABLED: "true",
      APPALOFT_APP_VERSION: options.appVersion ?? "0.1.0-e2e",
      APPALOFT_DATABASE_DRIVER: "pglite",
      APPALOFT_DATA_DIR: options.dataDir,
      APPALOFT_HTTP_HOST: "127.0.0.1",
      APPALOFT_HTTP_PORT: options.httpPort,
      APPALOFT_PGLITE_DATA_DIR: options.pgliteDataDir,
      APPALOFT_WEB_STATIC_DIR: "",
      ...options.env,
    },
    stderr: "ignore",
    stdout: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${options.httpPort}`;

  await waitForHttpHealth(`${baseUrl}/api/health`);

  return {
    baseUrl,
    async stop() {
      serverProcess.kill();
      await serverProcess.exited;
    },
  };
}

export function runDocker(args: string[]): CliResult {
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync(["docker", ...args], {
      stderr: "pipe",
      stdout: "pipe",
    });
  } catch (error) {
    return {
      exitCode: 127,
      stderr: error instanceof Error ? error.message : String(error),
      stdout: "",
    };
  }

  const stderr = result.stderr ?? new Uint8Array();
  const stdout = result.stdout ?? new Uint8Array();

  return {
    exitCode: result.exitCode,
    stderr: stderr.toString(),
    stdout: stdout.toString(),
  };
}

export function dockerName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

export function cleanupLocalDockerDeployment(deploymentId: string | undefined): void {
  if (!deploymentId) {
    return;
  }

  runDocker(["rm", "-f", dockerName(`appaloft-${deploymentId}`)]);
  runDocker(["image", "rm", "-f", dockerName(`appaloft-image-${deploymentId}`)]);
}

export async function reservePort(): Promise<number> {
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
