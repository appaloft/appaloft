import { createHash, randomUUID } from "node:crypto";
import { existsSync, watch as watchFileSystem } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { createServer } from "node:net";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import {
  type DevelopmentPlan,
  type DevelopmentServicePlan,
  type DevelopmentSessionRuntime,
  type DevelopmentSessionView,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";

const manifestFileName = "manifest.json";
const planFileName = "plan.json";
const statusFileName = "status.json";
const logFileName = "session.log";
const maximumLogBytes = 2 * 1024 * 1024;

interface DevelopmentSupervisorManifest extends DevelopmentSessionView {
  schemaVersion: "development/v1";
  state: "starting" | "running" | "stopping" | "stopped" | "failed";
  sessionId: string;
  sourceRoot: string;
  supervisorPid: number;
  startedAt: string;
  stateDirectory: string;
}

interface StoredDevelopmentPlan {
  schemaVersion: "development-plan/v1";
  sessionId: string;
  createdAt: string;
  plan: DevelopmentPlan;
  https: boolean;
  trustConfirmed: boolean;
  environmentFingerprint: string;
}

export interface LocalDevelopmentSessionRuntimeOptions {
  planResolver(input: {
    sourceRoot: string;
    configFilePath?: string;
  }): Promise<Result<DevelopmentPlan>>;
  supervisorEntrypoint: readonly string[];
  stateRoot?: string;
  environment?: NodeJS.ProcessEnv;
  startupTimeoutMs?: number;
}

function developmentRuntimeError(
  code:
    | "development_plan_invalid"
    | "development_session_conflict"
    | "development_process_failed"
    | "development_health_failed"
    | "development_gateway_failed"
    | "development_cleanup_incomplete",
  message: string,
  phase: string,
  details: Record<string, string | number | boolean | null | readonly string[]> = {},
  retryable = false,
): DomainError {
  return {
    code,
    category: code.includes("cleanup") || code.includes("process") ? "infra" : "user",
    message,
    retryable,
    details: { phase, ...details },
  };
}

export function developmentSessionDirectory(stateRoot: string, sourceRoot: string): string {
  const normalizedSource = resolve(sourceRoot);
  const digest = createHash("sha256").update(normalizedSource).digest("hex").slice(0, 20);
  return join(resolve(stateRoot), digest);
}

function unquoteEnvironmentValue(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvironmentFile(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith("#")) continue;
    const separator = normalized.indexOf("=");
    const key = separator > 0 ? normalized.slice(0, separator).trim() : "";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid environment assignment: ${line}`);
    }
    parsed[key] = unquoteEnvironmentValue(normalized.slice(separator + 1));
  }
  return parsed;
}

export async function loadDevelopmentEnvironment(input: {
  sourceRoot: string;
  base: Readonly<Record<string, string>>;
  envFiles: readonly string[];
  overlay: Readonly<Record<string, string>>;
}): Promise<Record<string, string>> {
  const environment = { ...input.base };
  for (const requestedPath of input.envFiles) {
    const path = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(input.sourceRoot, requestedPath);
    Object.assign(environment, parseEnvironmentFile(await readFile(path, "utf8")));
  }
  return { ...environment, ...input.overlay };
}

export function parseDevelopmentCommandIntent(intent: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "single" | "double" | null = null;
  let escaped = false;
  let tokenStarted = false;

  for (const character of intent.trim()) {
    if (escaped) {
      current += character;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "single") {
      escaped = true;
      tokenStarted = true;
      continue;
    }
    if (character === "'" && quote !== "double") {
      quote = quote === "single" ? null : "single";
      tokenStarted = true;
      continue;
    }
    if (character === '"' && quote !== "single") {
      quote = quote === "double" ? null : "double";
      tokenStarted = true;
      continue;
    }
    if (!quote && /[|&;<>()`$]/.test(character)) {
      throw new Error("Development commands with shell operators or expansion are unsupported");
    }
    if (!quote && /\s/.test(character)) {
      if (tokenStarted) {
        args.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    current += character;
    tokenStarted = true;
  }

  if (escaped || quote) throw new Error("Development command has an unterminated escape or quote");
  if (tokenStarted) args.push(current);
  if (args.length === 0) throw new Error("Development command is empty");
  return args;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}

async function processMatches(pid: number, stateDirectory: string): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }

  try {
    const processResult = Bun.spawn(["ps", "-o", "command=", "-p", String(pid)], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const commandLine = await new Response(processResult.stdout).text();
    await processResult.exited;
    return commandLine.includes("__supervise") && commandLine.includes(stateDirectory);
  } catch {
    return false;
  }
}

function supervisorCommand(entrypoint: readonly string[], stateDirectory: string): string[] {
  return [...entrypoint, "dev", "__supervise", "--state-dir", stateDirectory];
}

function defaultStateRoot(environment: NodeJS.ProcessEnv): string {
  const appaloftRoot = environment.APPALOFT_HOME?.trim();
  return resolve(appaloftRoot || join(homedir(), ".appaloft"), "development");
}

function environmentFingerprint(environment: Readonly<Record<string, string>>): string {
  return createHash("sha256")
    .update(JSON.stringify(Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))))
    .digest("hex");
}

async function tailLines(path: string, count: number): Promise<string[]> {
  try {
    const text = await readFile(path, "utf8");
    return text.split(/\r?\n/).filter(Boolean).slice(-count);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function redactText(text: string, sensitiveValues: readonly string[]): string {
  return sensitiveValues
    .filter((value) => value.length >= 4)
    .reduce((output, value) => output.replaceAll(value, "[REDACTED]"), text);
}

async function appendBoundedLog(
  path: string,
  text: string,
  sensitiveValues: readonly string[],
): Promise<void> {
  try {
    const current = await stat(path);
    if (current.size > maximumLogBytes) {
      await rename(path, `${path}.1`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const timestamp = new Date().toISOString();
  await appendFile(
    path,
    redactText(
      text
        .split(/(?<=\n)/)
        .map((line) => (line ? `[${timestamp}] ${line}` : ""))
        .join(""),
      sensitiveValues,
    ),
    { mode: 0o600 },
  );
}

async function pumpLog(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  path: string,
  prefix: string,
  sensitiveValues: readonly string[],
): Promise<void> {
  if (!stream || typeof stream === "number") return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const text = decoder.decode(chunk.value, { stream: true });
    await appendBoundedLog(
      path,
      text
        .split(/(?<=\n)/)
        .map((line) => (line ? `[${prefix}] ${line}` : ""))
        .join(""),
      sensitiveValues,
    );
  }
}

async function probeReadiness(service: DevelopmentServicePlan): Promise<"ready" | "running-unverified" | "failed"> {
  if (!service.healthPath || !service.port) return "running-unverified";
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${service.port}${service.healthPath}`);
      if (response.ok) return "ready";
    } catch {
      // The service may still be starting.
    }
    await Bun.sleep(200);
  }
  return "failed";
}

async function availableLoopbackPort(): Promise<number> {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a loopback gateway port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolvePort(address.port)));
    });
  });
}

export class LocalDevelopmentSessionRuntime implements DevelopmentSessionRuntime {
  readonly #environment: NodeJS.ProcessEnv;
  readonly #stateRoot: string;
  readonly #startupTimeoutMs: number;

  constructor(private readonly options: LocalDevelopmentSessionRuntimeOptions) {
    this.#environment = options.environment ?? process.env;
    this.#stateRoot = resolve(options.stateRoot ?? defaultStateRoot(this.#environment));
    this.#startupTimeoutMs = options.startupTimeoutMs ?? 60_000;
  }

  plan(input: { sourceRoot: string; configFilePath?: string }): Promise<Result<DevelopmentPlan>> {
    return this.options.planResolver(input);
  }

  async start(input: {
    plan: DevelopmentPlan;
    detach: boolean;
    envFiles: readonly string[];
    environmentOverlay: Readonly<Record<string, string>>;
    https?: boolean;
    trust?: boolean;
  }): Promise<Result<DevelopmentSessionView>> {
    const stateDirectory = developmentSessionDirectory(this.#stateRoot, input.plan.sourceRoot);
    const current = await readJson<DevelopmentSupervisorManifest>(join(stateDirectory, manifestFileName));
    if (input.trust && !input.https) {
      return err(
        developmentRuntimeError(
          "development_plan_invalid",
          "--trust requires --https",
          "development-plan",
        ),
      );
    }
    if (input.https && !Bun.which("openssl")) {
      return err(
        developmentRuntimeError(
          "development_gateway_failed",
          "HTTPS requires the local openssl executable",
          "development-plan",
        ),
      );
    }

    let explicitEnvironment: Record<string, string>;
    try {
      explicitEnvironment = await loadDevelopmentEnvironment({
        sourceRoot: input.plan.sourceRoot,
        base: {},
        envFiles: input.envFiles,
        overlay: input.environmentOverlay,
      });
    } catch (error) {
      return err(
        developmentRuntimeError(
          "development_plan_invalid",
          "Development environment could not be loaded",
          "development-plan",
          { reason: error instanceof Error ? error.message : String(error) },
        ),
      );
    }
    const explicitEnvironmentFingerprint = environmentFingerprint(explicitEnvironment);

    if (current && (await processMatches(current.supervisorPid, stateDirectory))) {
      const existingPlan = await readJson<StoredDevelopmentPlan>(join(stateDirectory, planFileName));
      if (
        existingPlan &&
        JSON.stringify(existingPlan.plan) === JSON.stringify(input.plan) &&
        existingPlan.https === Boolean(input.https) &&
        existingPlan.trustConfirmed === Boolean(input.trust) &&
        existingPlan.environmentFingerprint === explicitEnvironmentFingerprint
      ) {
        return ok({ ...current, resumed: true });
      }
      return err(
        developmentRuntimeError(
          "development_session_conflict",
          "A Development Session is already running for this source",
          "development-admission",
          { sourceRoot: input.plan.sourceRoot, sessionId: current.sessionId },
        ),
      );
    }

    const sessionId = `dev-${randomUUID()}`;
    const stored: StoredDevelopmentPlan = {
      schemaVersion: "development-plan/v1",
      sessionId,
      createdAt: new Date().toISOString(),
      plan: input.plan,
      https: Boolean(input.https),
      trustConfirmed: Boolean(input.trust),
      environmentFingerprint: explicitEnvironmentFingerprint,
    };

    try {
      await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
      await writeJson(join(stateDirectory, planFileName), stored);
      await unlink(join(stateDirectory, manifestFileName)).catch(() => undefined);
      const child = Bun.spawn(supervisorCommand(this.options.supervisorEntrypoint, stateDirectory), {
        detached: true,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        env: {
          ...this.#environment,
          APPALOFT_DEV_EXPLICIT_ENV: JSON.stringify(explicitEnvironment),
        },
      });
      child.unref();

      const deadline = Date.now() + this.#startupTimeoutMs;
      let manifest: DevelopmentSupervisorManifest | null = null;
      while (Date.now() < deadline) {
        manifest = await readJson<DevelopmentSupervisorManifest>(
          join(stateDirectory, manifestFileName),
        );
        if (manifest) break;
        if (child.exitCode !== null) break;
        await Bun.sleep(50);
      }
      if (!manifest) {
        return err(
          developmentRuntimeError(
            "development_process_failed",
            "Development supervisor did not become ready",
            "development-start",
            { sourceRoot: input.plan.sourceRoot, sessionId },
            true,
          ),
        );
      }

      if (input.detach) return ok(manifest);

      const forwardSignal = () => {
        try {
          process.kill(manifest?.supervisorPid ?? child.pid, "SIGTERM");
        } catch {
          // Supervisor may already be stopped.
        }
      };
      process.once("SIGINT", forwardSignal);
      process.once("SIGTERM", forwardSignal);
      await child.exited;
      process.off("SIGINT", forwardSignal);
      process.off("SIGTERM", forwardSignal);
      return ok(
        (await readJson<DevelopmentSessionView>(join(stateDirectory, statusFileName))) ?? manifest,
      );
    } catch (error) {
      return err(
        developmentRuntimeError(
          "development_process_failed",
          "Development Session could not be started",
          "development-start",
          { reason: error instanceof Error ? error.message : String(error) },
          true,
        ),
      );
    }
  }

  async status(input: { sourceRoot: string }): Promise<Result<unknown>> {
    const stateDirectory = developmentSessionDirectory(this.#stateRoot, input.sourceRoot);
    try {
      const manifest = await readJson<DevelopmentSupervisorManifest>(
        join(stateDirectory, manifestFileName),
      );
      if (manifest && (await processMatches(manifest.supervisorPid, stateDirectory))) {
        return ok(manifest);
      }
      if (manifest) {
        const reconciled = {
          ...manifest,
          state: "stopped",
          reason: "stale-supervisor",
          services: manifest.services?.map((service) => ({ ...service, state: "stopped" })),
        };
        await writeJson(join(stateDirectory, statusFileName), reconciled);
        await unlink(join(stateDirectory, manifestFileName)).catch(() => undefined);
        return ok(reconciled);
      }
      const last = await readJson<DevelopmentSessionView>(join(stateDirectory, statusFileName));
      return ok(last ?? { state: "not-started", sourceRoot: resolve(input.sourceRoot) });
    } catch (error) {
      return err(
        developmentRuntimeError(
          "development_process_failed",
          "Development Session status could not be read",
          "development-status",
          { reason: error instanceof Error ? error.message : String(error) },
        ),
      );
    }
  }

  async logs(input: {
    sourceRoot: string;
    follow: boolean;
    tail: number;
  }): Promise<Result<unknown>> {
    const stateDirectory = developmentSessionDirectory(this.#stateRoot, input.sourceRoot);
    try {
      return ok({
        sourceRoot: resolve(input.sourceRoot),
        follow: input.follow,
        lines: await tailLines(join(stateDirectory, logFileName), input.tail),
      });
    } catch (error) {
      return err(
        developmentRuntimeError(
          "development_process_failed",
          "Development Session logs could not be read",
          "development-logs",
          { reason: error instanceof Error ? error.message : String(error) },
        ),
      );
    }
  }

  async stop(input: { sourceRoot: string }): Promise<Result<unknown>> {
    const stateDirectory = developmentSessionDirectory(this.#stateRoot, input.sourceRoot);
    try {
      const manifest = await readJson<DevelopmentSupervisorManifest>(
        join(stateDirectory, manifestFileName),
      );
      if (!manifest || !(await processMatches(manifest.supervisorPid, stateDirectory))) {
        return ok({ state: "stopped", sourceRoot: resolve(input.sourceRoot), alreadyStopped: true });
      }
      process.kill(manifest.supervisorPid, "SIGTERM");
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (!(await processMatches(manifest.supervisorPid, stateDirectory))) {
          return ok(
            (await readJson<DevelopmentSessionView>(join(stateDirectory, statusFileName))) ?? {
              state: "stopped",
              sourceRoot: resolve(input.sourceRoot),
            },
          );
        }
        await Bun.sleep(100);
      }
      return err(
        developmentRuntimeError(
          "development_cleanup_incomplete",
          "Development supervisor did not stop within the cleanup deadline",
          "development-cleanup",
          { sessionId: manifest.sessionId, supervisorPid: manifest.supervisorPid },
          true,
        ),
      );
    } catch (error) {
      return err(
        developmentRuntimeError(
          "development_cleanup_incomplete",
          "Development Session could not be stopped",
          "development-cleanup",
          { reason: error instanceof Error ? error.message : String(error) },
          true,
        ),
      );
    }
  }

  async reset(input: { sourceRoot: string }): Promise<Result<unknown>> {
    const stopped = await this.stop(input);
    if (stopped.isErr()) return stopped;
    const stateDirectory = developmentSessionDirectory(this.#stateRoot, input.sourceRoot);
    try {
      await rm(stateDirectory, { recursive: true, force: true });
      return ok({ state: "reset", sourceRoot: resolve(input.sourceRoot), stateDirectory });
    } catch (error) {
      return err(
        developmentRuntimeError(
          "development_cleanup_incomplete",
          "Development Session state could not be reset",
          "development-cleanup",
          { reason: error instanceof Error ? error.message : String(error) },
          true,
        ),
      );
    }
  }

  async supervise(input: { stateDirectory: string }): Promise<Result<unknown>> {
    const stateDirectory = resolve(input.stateDirectory);
    const stored = await readJson<StoredDevelopmentPlan>(join(stateDirectory, planFileName));
    if (!stored || stored.schemaVersion !== "development-plan/v1") {
      return err(
        developmentRuntimeError(
          "development_plan_invalid",
          "Development supervisor plan is missing or invalid",
          "development-start",
        ),
      );
    }
    const expectedDirectory = developmentSessionDirectory(this.#stateRoot, stored.plan.sourceRoot);
    if (stateDirectory !== expectedDirectory) {
      return err(
        developmentRuntimeError(
          "development_plan_invalid",
          "Development supervisor state ownership does not match the source",
          "development-start",
        ),
      );
    }

    let explicitEnvironment: Record<string, string> = {};
    try {
      explicitEnvironment = JSON.parse(this.#environment.APPALOFT_DEV_EXPLICIT_ENV ?? "{}") as Record<
        string,
        string
      >;
    } catch {
      return err(
        developmentRuntimeError(
          "development_plan_invalid",
          "Development supervisor environment is invalid",
          "development-start",
        ),
      );
    }

    const logPath = join(stateDirectory, logFileName);
    const children = new Map<string, ReturnType<typeof Bun.spawn>>();
    const pumps: Promise<void>[] = [];
    const watchers: Array<{ close(): void }> = [];
    const sensitiveValues = Object.values(explicitEnvironment);
    let gateway: ReturnType<typeof Bun.serve> | null = null;
    let certificatePath: string | undefined;
    let stopping = false;
    const expectedStops = new WeakSet<ReturnType<typeof Bun.spawn>>();
    let reportUnexpectedExit: (value: { service: string; exitCode: number }) => void = () =>
      undefined;
    const unexpectedExit = new Promise<{ service: string; exitCode: number }>((resolveExit) => {
      reportUnexpectedExit = resolveExit;
    });

    const spawnService = async (service: DevelopmentServicePlan) => {
      let args: string[];
      try {
        args = service.commandArgs
          ? [...service.commandArgs]
          : parseDevelopmentCommandIntent(service.commandIntent);
      } catch (error) {
        throw developmentRuntimeError(
          "development_plan_invalid",
          error instanceof Error ? error.message : String(error),
          "development-plan",
          { service: service.key },
        );
      }
      const child = Bun.spawn(args, {
        cwd: service.workingDirectory,
        env: { ...this.#environment, ...service.environment, ...explicitEnvironment },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      children.set(service.key, child);
      void child.exited.then((exitCode) => {
        if (
          !stopping &&
          !expectedStops.has(child) &&
          children.get(service.key) === child
        ) {
          reportUnexpectedExit({ service: service.key, exitCode });
        }
      });
      pumps.push(pumpLog(child.stdout, logPath, `${service.key}:stdout`, sensitiveValues));
      pumps.push(pumpLog(child.stderr, logPath, `${service.key}:stderr`, sensitiveValues));
      await appendBoundedLog(
        logPath,
        `[appaloft] started ${service.key} pid=${child.pid}\n`,
        sensitiveValues,
      );
      return child;
    };

    const restartService = async (service: DevelopmentServicePlan) => {
      const current = children.get(service.key);
      if (current && current.exitCode === null) {
        expectedStops.add(current);
        current.kill("SIGTERM");
        await current.exited;
      }
      if (!stopping) {
        const restarted = await spawnService(service);
        const readiness = await probeReadiness(service);
        const currentManifest = await readJson<DevelopmentSupervisorManifest>(
          join(stateDirectory, manifestFileName),
        );
        if (currentManifest) {
          const services = (currentManifest.services ?? []).map((entry) =>
            entry.key === service.key
              ? {
                  ...entry,
                  pid: restarted.pid,
                  state: readiness === "failed" ? "failed" : "running",
                  readiness,
                }
              : entry,
          );
          const updated = {
            ...currentManifest,
            state: readiness === "failed" ? ("degraded" as const) : currentManifest.state,
            services,
          };
          await writeJson(join(stateDirectory, manifestFileName), updated);
          await writeJson(join(stateDirectory, statusFileName), updated);
        }
      }
    };

    try {
      for (const service of stored.plan.services) await spawnService(service);

      let gatewayTls: { cert: string; key: string } | undefined;
      if (stored.https) {
        const certificateDirectory = join(stateDirectory, "certificate");
        const keyPath = join(certificateDirectory, "localhost.key");
        const certPath = join(certificateDirectory, "localhost.crt");
        await mkdir(certificateDirectory, { recursive: true, mode: 0o700 });
        const subjectAlternativeNames = [
          "DNS:localhost",
          ...stored.plan.services.map((service) => `DNS:${service.key}.localhost`),
        ].join(",");
        const certificate = Bun.spawn(
          [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-sha256",
            "-days",
            "7",
            "-nodes",
            "-keyout",
            keyPath,
            "-out",
            certPath,
            "-subj",
            "/CN=*.localhost",
            "-addext",
            `subjectAltName=${subjectAlternativeNames}`,
          ],
          { stdin: "ignore", stdout: "ignore", stderr: "pipe" },
        );
        const certificateError = await new Response(certificate.stderr).text();
        if ((await certificate.exited) !== 0) {
          throw developmentRuntimeError(
            "development_gateway_failed",
            "Local HTTPS certificate generation failed",
            "development-gateway",
            { reason: certificateError.slice(0, 1_024) },
          );
        }
        gatewayTls = {
          cert: await readFile(certPath, "utf8"),
          key: await readFile(keyPath, "utf8"),
        };
        certificatePath = certPath;
      }

      const serviceByHost = new Map(
        stored.plan.services
          .filter((service) => service.port)
          .map((service) => [`${service.key}.localhost`, service]),
      );
      if (serviceByHost.size > 0) {
        const gatewayPort = await availableLoopbackPort();
        gateway = Bun.serve({
          hostname: "127.0.0.1",
          port: gatewayPort,
          ...(gatewayTls ? { tls: gatewayTls } : {}),
          fetch: async (request) => {
            const sourceUrl = new URL(request.url);
            const service = serviceByHost.get(request.headers.get("host")?.split(":")[0] ?? "");
            if (!service?.port) return new Response("Development service not found", { status: 404 });
            const target = new URL(sourceUrl.pathname + sourceUrl.search, `http://127.0.0.1:${service.port}`);
            try {
              return await fetch(target, {
                method: request.method,
                headers: request.headers,
                body: request.body,
                redirect: "manual",
              });
            } catch {
              return new Response("Development service unavailable", { status: 502 });
            }
          },
        });
      }

      const serviceViews = await Promise.all(
        stored.plan.services.map(async (service) => {
          const readiness = await probeReadiness(service);
          const pid = children.get(service.key)?.pid;
          return {
            key: service.key,
            state: readiness === "failed" ? "failed" : "running",
            ...(pid ? { pid } : {}),
            readiness,
            watch: service.watch,
            ...(service.port && gateway
              ? {
                  url: `${stored.https ? "https" : "http"}://${service.key}.localhost:${gateway.port}`,
                }
              : {}),
          };
        }),
      );
      if (serviceViews.some((service) => service.readiness === "failed")) {
        throw developmentRuntimeError(
          "development_health_failed",
          "A declared Development Session health check did not become ready",
          "development-health",
          { services: serviceViews.filter((service) => service.readiness === "failed").map((service) => service.key) },
          true,
        );
      }

      const manifest: DevelopmentSupervisorManifest = {
        schemaVersion: "development/v1",
        state: "running",
        sessionId: stored.sessionId,
        sourceRoot: stored.plan.sourceRoot,
        supervisorPid: process.pid,
        startedAt: new Date().toISOString(),
        stateDirectory,
        ...(gateway
          ? { gatewayUrl: `${stored.https ? "https" : "http"}://127.0.0.1:${gateway.port}` }
          : {}),
        ...(certificatePath
          ? {
              certificatePath,
              trust: stored.trustConfirmed ? "explicitly-confirmed" : "not-modified",
            }
          : {}),
        services: serviceViews,
      };
      await writeJson(join(stateDirectory, manifestFileName), manifest);
      await writeJson(join(stateDirectory, statusFileName), manifest);

      for (const service of stored.plan.services.filter((entry) => entry.watch === "restart")) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const watcher = watchFileSystem(
            service.workingDirectory,
            { recursive: true },
            (_event, fileName) => {
              const path = String(fileName ?? "");
              if (/(^|[\\/])(\.git|\.appaloft|node_modules)([\\/]|$)/.test(path)) return;
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => void restartService(service), 150);
            },
          );
          watchers.push(watcher);
        } catch (error) {
          await appendBoundedLog(
            logPath,
            `[appaloft] restart watcher unavailable for ${service.key}: ${String(error)}\n`,
            sensitiveValues,
          );
        }
      }

      let stopRequested = false;
      let stop: () => void = () => undefined;
      const stopSignal = new Promise<"signal">((resolveSignal) => {
        stop = () => {
          stopRequested = true;
          resolveSignal("signal");
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
      const termination = await Promise.race([
        stopSignal,
        unexpectedExit.then((value) => ({ unexpected: value }) as const),
      ]);
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      if (!stopRequested && typeof termination === "object") {
        throw developmentRuntimeError(
          "development_process_failed",
          `Development service ${termination.unexpected.service} exited unexpectedly`,
          "development-supervision",
          termination.unexpected,
          true,
        );
      }
      stopping = true;
      for (const watcher of watchers) watcher.close();
      gateway?.stop(true);
      for (const child of children.values()) {
        if (child.exitCode === null) child.kill("SIGTERM");
      }
      await Promise.all([...children.values()].map((child) => child.exited));
      for (const service of stored.plan.services) {
        if (!service.cleanupArgs) continue;
        const cleanup = Bun.spawn([...service.cleanupArgs], {
          cwd: service.workingDirectory,
          env: { ...this.#environment, ...service.environment, ...explicitEnvironment },
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        });
        pumps.push(pumpLog(cleanup.stdout, logPath, `${service.key}:cleanup`, sensitiveValues));
        pumps.push(pumpLog(cleanup.stderr, logPath, `${service.key}:cleanup`, sensitiveValues));
        await cleanup.exited;
      }
      await Promise.allSettled(pumps);
      const finalManifest =
        (await readJson<DevelopmentSupervisorManifest>(join(stateDirectory, manifestFileName))) ??
        manifest;
      const stopped: DevelopmentSupervisorManifest = {
        ...finalManifest,
        state: "stopped",
        services: (finalManifest.services ?? serviceViews).map((service) => ({
          ...service,
          state: "stopped",
        })),
      };
      await writeJson(join(stateDirectory, statusFileName), stopped);
      await unlink(join(stateDirectory, manifestFileName)).catch(() => undefined);
      return ok(stopped);
    } catch (error) {
      stopping = true;
      for (const watcher of watchers) watcher.close();
      gateway?.stop(true);
      for (const child of children.values()) {
        if (child.exitCode === null) child.kill("SIGTERM");
      }
      await Promise.allSettled([...children.values()].map((child) => child.exited));
      const domain =
        error && typeof error === "object" && "code" in error
          ? (error as DomainError)
          : developmentRuntimeError(
              "development_process_failed",
              "Development supervisor failed",
              "development-start",
              { reason: error instanceof Error ? error.message : String(error) },
              true,
            );
      await writeJson(join(stateDirectory, statusFileName), {
        state: "failed",
        sourceRoot: stored.plan.sourceRoot,
        sessionId: stored.sessionId,
        errorCode: domain.code,
      });
      await unlink(join(stateDirectory, manifestFileName)).catch(() => undefined);
      return err(domain);
    }
  }
}
