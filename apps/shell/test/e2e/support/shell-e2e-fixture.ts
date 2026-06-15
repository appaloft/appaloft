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

export interface ShellHttpAdminSession {
  cookie: string;
  headers: HeadersInit;
}

export function fixturePath(name: string): string {
  return new URL(`../../fixtures/${name}`, import.meta.url).pathname;
}

export function externalServerDatabaseEnv(): Record<string, string> {
  if (!usesExternalServer() || !process.env.APPALOFT_DATABASE_URL) {
    return {};
  }

  return {
    APPALOFT_DATABASE_DRIVER: "postgres",
    APPALOFT_DATABASE_URL: process.env.APPALOFT_DATABASE_URL,
  };
}

export function usesExternalServer(): boolean {
  return process.env.APPALOFT_E2E_EXTERNAL_SERVER === "true";
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
  const httpPort = options.httpPort ?? String(3500 + Math.floor(Math.random() * 1700));
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

function shellCliEnv(options: ShellCliOptions): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    OTEL_SDK_DISABLED: "true",
    APPALOFT_APP_VERSION: options.appVersion ?? "0.1.0-e2e",
    APPALOFT_CONTROL_PLANE_MODE: "none",
    APPALOFT_DATABASE_DRIVER: "pglite",
    APPALOFT_DATA_DIR: options.dataDir,
    APPALOFT_HTTP_HOST: "127.0.0.1",
    APPALOFT_HTTP_PORT: options.httpPort ?? "0",
    APPALOFT_PGLITE_DATA_DIR: options.pgliteDataDir,
    APPALOFT_WEB_STATIC_DIR: "",
  };

  delete env.APPALOFT_CONTROL_PLANE_URL;
  delete env.APPALOFT_DATABASE_URL;

  return {
    ...env,
    ...options.env,
  };
}

function captureStream(stream: ReadableStream<Uint8Array>, append: (chunk: string) => void): void {
  void (async () => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        append(decoder.decode());
        return;
      }
      append(decoder.decode(chunk.value, { stream: true }));
    }
  })();
}

export function cleanupWorkspace(workspaceDir: string): void {
  rmSync(workspaceDir, { recursive: true, force: true });
}

export function runShellCli(args: string[], options: ShellCliOptions): CliResult {
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: shellCliEnv(options),
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

function parseJsonPayloads(raw: string): unknown[] {
  const payloads: unknown[] = [];

  for (let offset = 0; offset < raw.length; ) {
    const objectStart = raw.indexOf("{", offset);
    const arrayStart = raw.indexOf("[", offset);
    const start =
      objectStart < 0
        ? arrayStart
        : arrayStart < 0
          ? objectStart
          : Math.min(objectStart, arrayStart);

    if (start < 0) {
      return payloads;
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
          try {
            payloads.push(JSON.parse(raw.slice(start, index + 1)));
          } catch {
            // Ignore non-JSON fragments from structured application logs.
          }
          offset = index + 1;
          break;
        }
      }
    }

    if (offset <= start) {
      return payloads;
    }
  }

  return payloads;
}

export function parseJson<T>(raw: string): T {
  const [payload] = parseJsonPayloads(raw);
  if (!payload) {
    throw new SyntaxError("No JSON payload found");
  }

  return payload as T;
}

type DeploymentShowPayload = {
  deployment?: {
    status?: string;
  };
  status?: {
    current?: string;
  };
};

export async function waitForDeploymentSucceeded(
  deploymentId: string,
  options: ShellCliOptions,
  waitOptions: {
    attempts?: number;
    intervalMs?: number;
  } = {},
): Promise<void> {
  let lastShow: CliResult | undefined;
  const attempts = waitOptions.attempts ?? 120;
  const intervalMs = waitOptions.intervalMs ?? 500;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const show = runShellCli(["deployments", "show", deploymentId], options);
    lastShow = show;
    expectCliSuccess(show, `wait for deployment ${deploymentId} snapshot`);

    const payload = parseJson<DeploymentShowPayload>(show.stdout);
    const status = payload.deployment?.status ?? payload.status?.current;
    if (status === "succeeded") {
      return;
    }

    if (status === "failed" || status === "canceled") {
      throw new Error(
        `Deployment ${deploymentId} finished with ${status} while waiting for success:\nstdout:\n${show.stdout}\nstderr:\n${show.stderr}`,
      );
    }

    await Bun.sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for deployment ${deploymentId} to succeed:\nstdout:\n${lastShow?.stdout ?? ""}\nstderr:\n${lastShow?.stderr ?? ""}`,
  );
}

export async function waitForDeploymentTimeline(
  deploymentId: string,
  options: ShellCliOptions,
  expectedMessages: string | string[],
  config: {
    intervalMs?: number;
    label?: string;
    timeoutMs?: number;
  } = {},
): Promise<CliResult> {
  const timeoutMs = config.timeoutMs ?? 90_000;
  const intervalMs = config.intervalMs ?? 1_000;
  const expected = Array.isArray(expectedMessages) ? expectedMessages : [expectedMessages];
  const startedAt = Date.now();
  let lastResult: CliResult | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    const result = runShellCli(["deployments", "timeline", deploymentId], options);
    lastResult = result;

    if (result.exitCode === 0 && expected.every((message) => result.stdout.includes(message))) {
      return result;
    }

    await Bun.sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for ${config.label ?? deploymentId} timeline to contain ${expected.map((message) => JSON.stringify(message)).join(", ")}\nstdout:\n${lastResult?.stdout ?? ""}\nstderr:\n${lastResult?.stderr ?? ""}`,
  );
}

async function expectHttpStatus(response: Response, status: number): Promise<void> {
  if (response.status === status) {
    return;
  }

  const body = await response.text();
  expect(response.status, body).toBe(status);
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
  stdout: () => string;
  stderr: () => string;
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
      APPALOFT_CONTROL_PLANE_MODE: "none",
      ...options.env,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  let stdout = "";
  let stderr = "";
  captureStream(serverProcess.stdout, (chunk) => {
    stdout += chunk;
  });
  captureStream(serverProcess.stderr, (chunk) => {
    stderr += chunk;
  });
  const baseUrl = `http://127.0.0.1:${options.httpPort}`;

  await waitForHttpHealth(`${baseUrl}/api/health`);

  return {
    baseUrl,
    stdout: () => stdout,
    stderr: () => stderr,
    async stop() {
      serverProcess.kill();
      await serverProcess.exited;
    },
  };
}

export async function createShellHttpAdminSession(baseUrl: string): Promise<ShellHttpAdminSession> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `admin-${suffix}@example.test`;
  const password = `admin-password-${suffix}`;
  const organizationSlug = `e2e-${suffix}`;

  const bootstrapped = await fetch(`${baseUrl}/api/bootstrap/auth/first-admin`, {
    body: JSON.stringify({
      displayName: "E2E Admin",
      email,
      organizationName: "E2E Organization",
      organizationSlug,
      password,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  await expectHttpStatus(bootstrapped, 201);
  const bootstrapResult = (await bootstrapped.json()) as { organizationId: string };

  const signedIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    body: JSON.stringify({
      callbackURL: "/",
      email,
      password,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  await expectHttpStatus(signedIn, 200);

  const setCookie = signedIn.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.match(/better-auth\.session_token=[^;,]+/)?.[0];
  expect(sessionCookie, setCookie).toBeTruthy();

  const headers = {
    cookie: sessionCookie ?? "",
  };

  const switched = await fetch(`${baseUrl}/api/organizations/current-context/switch`, {
    body: JSON.stringify({ organizationId: bootstrapResult.organizationId }),
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    method: "POST",
  });
  await expectHttpStatus(switched, 200);

  return {
    cookie: sessionCookie ?? "",
    headers,
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

export function cleanupLocalDockerComposeDeployment(
  deploymentId: string | undefined,
  composeFile: string,
): void {
  if (!deploymentId) {
    return;
  }

  runDocker([
    "compose",
    "-p",
    dockerName(`appaloft-${deploymentId}`),
    "-f",
    composeFile,
    "down",
    "--remove-orphans",
  ]);
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
