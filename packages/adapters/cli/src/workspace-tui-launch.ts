import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const loopbackHost = "127.0.0.1";
const maxProtocolLineBytes = 1_048_576;
const rendererConnectTimeoutMs = 5_000;
const rendererExitTimeoutMs = 1_000;

export interface WorkspaceControlRendererProcess {
  readonly exited: Promise<void>;
  terminate(): void;
}

export interface WorkspaceControlRendererLaunchInput {
  readonly host: typeof loopbackHost;
  readonly port: number;
  readonly token: string;
}

export interface OpenLoopbackWorkspaceControlRendererInput {
  launch(input: WorkspaceControlRendererLaunchInput): Promise<WorkspaceControlRendererProcess>;
}

class AsyncEventQueue<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private ended = false;

  push(value: T): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.values.push(value);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  iterable(): AsyncIterable<T> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          const value = this.values.shift();
          if (value !== undefined) return Promise.resolve({ done: false as const, value });
          if (this.ended) return Promise.resolve({ done: true as const, value: undefined });
          return new Promise<IteratorResult<T>>((resolveNext) => this.waiters.push(resolveNext));
        },
      }),
    };
  }
}

function rendererError(
  message: string,
  reason: string,
  details?: Record<string, string | number | boolean | null>,
) {
  return {
    code: "infra_error",
    category: "infra" as const,
    message,
    retryable: false,
    details: {
      phase: "workspace-control-renderer",
      reason,
      ...details,
    },
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    if (!server.listening) {
      resolveClose();
      return;
    }
    server.close(() => resolveClose());
  });
}

function tokenMatches(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string") return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function boundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("\0")
  );
}

type WorkspaceTuiLaunchEvent = Record<string, unknown>;

export interface WorkspaceTuiLaunchSession {
  send(message: unknown): Promise<void>;
  events(): AsyncIterable<WorkspaceTuiLaunchEvent>;
  close(): Promise<void>;
}

function parseRendererEvent(value: unknown): WorkspaceTuiLaunchEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const operateAction = (): Record<string, unknown> | undefined => {
    const action = record.action;
    if (!action || typeof action !== "object") return undefined;
    const candidate = action as Record<string, unknown>;
    if (!boundedText(candidate.resourceId, 160) || !boundedText(candidate.kind, 40)) {
      return undefined;
    }
    if (candidate.kind === "retry" || candidate.kind === "redeploy") {
      return boundedText(candidate.deploymentId, 160)
        ? {
            kind: candidate.kind,
            resourceId: candidate.resourceId,
            deploymentId: candidate.deploymentId,
          }
        : undefined;
    }
    if (candidate.kind === "rollback") {
      return boundedText(candidate.deploymentId, 160) &&
        boundedText(candidate.candidateDeploymentId, 160)
        ? {
            kind: candidate.kind,
            resourceId: candidate.resourceId,
            deploymentId: candidate.deploymentId,
            candidateDeploymentId: candidate.candidateDeploymentId,
          }
        : undefined;
    }
    if (candidate.kind === "backup-create") {
      return boundedText(candidate.storageVolumeId, 160) && boundedText(candidate.policyId, 160)
        ? {
            kind: candidate.kind,
            resourceId: candidate.resourceId,
            storageVolumeId: candidate.storageVolumeId,
            policyId: candidate.policyId,
          }
        : undefined;
    }
    if (candidate.kind === "restore-independent") {
      return boundedText(candidate.backupId, 160) &&
        (candidate.restoredVolumeName === undefined ||
          boundedText(candidate.restoredVolumeName, 160))
        ? {
            kind: candidate.kind,
            resourceId: candidate.resourceId,
            backupId: candidate.backupId,
            ...(typeof candidate.restoredVolumeName === "string"
              ? { restoredVolumeName: candidate.restoredVolumeName }
              : {}),
          }
        : undefined;
    }
    return undefined;
  };
  switch (record.type) {
    case "operate-select":
      return boundedText(record.resourceId, 160)
        ? { type: "operate-select", resourceId: record.resourceId }
        : undefined;
    case "operate-refresh":
      return { type: "operate-refresh" };
    case "operate-preview-action": {
      const action = operateAction();
      return action ? { type: "operate-preview-action", action } : undefined;
    }
    case "operate-confirm-action": {
      const action = operateAction();
      return action && boundedText(record.token, 160)
        ? { type: "operate-confirm-action", token: record.token, action }
        : undefined;
    }
    case "operate-quit":
      return { type: "operate-quit" };
    case "development-refresh":
      return { type: "development-refresh" };
    case "development-restart":
      return { type: "development-restart" };
    case "development-stop":
      return { type: "development-stop" };
    case "development-detach":
      return { type: "development-detach" };
    case "select":
      return typeof record.workspaceId === "string"
        ? { type: "select", workspaceId: record.workspaceId }
        : undefined;
    case "open-pr":
      return typeof record.workspaceId === "string"
        ? { type: "open-pr", workspaceId: record.workspaceId }
        : undefined;
    case "open-preview":
      return typeof record.workspaceId === "string"
        ? { type: "open-preview", workspaceId: record.workspaceId }
        : undefined;
    case "open-production":
      return typeof record.workspaceId === "string"
        ? { type: "open-production", workspaceId: record.workspaceId }
        : undefined;
    case "open-compare":
      return typeof record.workspaceId === "string"
        ? { type: "open-compare", workspaceId: record.workspaceId }
        : undefined;
    case "open-connections":
      return typeof record.workspaceId === "string"
        ? { type: "open-connections", workspaceId: record.workspaceId }
        : undefined;
    case "refresh":
      return typeof record.workspaceId === "string"
        ? { type: "refresh", workspaceId: record.workspaceId }
        : { type: "refresh" };
    case "attach":
      return typeof record.workspaceId === "string" && typeof record.runtimeId === "string"
        ? { type: "attach", workspaceId: record.workspaceId, runtimeId: record.runtimeId }
        : undefined;
    case "lifecycle-action":
      return typeof record.workspaceId === "string" &&
        (record.action === "pause" || record.action === "resume" || record.action === "terminate")
        ? {
            type: "lifecycle-action",
            workspaceId: record.workspaceId,
            action: record.action,
          }
        : undefined;
    case "snapshot-create":
      return boundedText(record.workspaceId, 160) &&
        (record.capability === "filesystem" || record.capability === "filesystem-memory") &&
        (record.ttlDays === 1 || record.ttlDays === 7 || record.ttlDays === 30)
        ? {
            type: "snapshot-create",
            workspaceId: record.workspaceId,
            capability: record.capability,
            ttlDays: record.ttlDays,
          }
        : undefined;
    case "snapshot-delete":
      return boundedText(record.workspaceId, 160) && boundedText(record.snapshotId, 160)
        ? {
            type: "snapshot-delete",
            workspaceId: record.workspaceId,
            snapshotId: record.snapshotId,
          }
        : undefined;
    case "preview-expose":
      return typeof record.workspaceId === "string" &&
        typeof record.port === "number" &&
        Number.isInteger(record.port) &&
        record.port >= 1 &&
        record.port <= 65_535 &&
        (record.visibility === "private" ||
          record.visibility === "organization" ||
          record.visibility === "public") &&
        (record.ttlMinutes === 60 || record.ttlMinutes === 480 || record.ttlMinutes === 1440)
        ? {
            type: "preview-expose",
            workspaceId: record.workspaceId,
            port: record.port,
            visibility: record.visibility,
            ttlMinutes: record.ttlMinutes,
          }
        : undefined;
    case "preview-revoke":
      return boundedText(record.workspaceId, 160) && boundedText(record.exposureId, 160)
        ? { type: "preview-revoke", workspaceId: record.workspaceId, exposureId: record.exposureId }
        : undefined;
    case "task-approve":
      return boundedText(record.workspaceId, 160) && boundedText(record.taskRunId, 160)
        ? { type: "task-approve", workspaceId: record.workspaceId, taskRunId: record.taskRunId }
        : undefined;
    case "task-deliver": {
      if (
        !boundedText(record.workspaceId, 160) ||
        !boundedText(record.taskRunId, 160) ||
        !boundedText(record.branch, 512) ||
        !boundedText(record.commitMessage, 512) ||
        !boundedText(record.remote, 120)
      ) {
        return undefined;
      }
      const pullRequest = record.pullRequest;
      if (pullRequest !== undefined) {
        if (!pullRequest || typeof pullRequest !== "object") return undefined;
        const pr = pullRequest as Record<string, unknown>;
        if (
          !boundedText(pr.title, 256) ||
          (pr.body !== undefined && (typeof pr.body !== "string" || pr.body.length > 16_384)) ||
          (pr.base !== undefined && !boundedText(pr.base, 512))
        ) {
          return undefined;
        }
        return {
          type: "task-deliver",
          workspaceId: record.workspaceId,
          taskRunId: record.taskRunId,
          branch: record.branch,
          commitMessage: record.commitMessage,
          remote: record.remote,
          pullRequest: {
            title: pr.title,
            ...(typeof pr.body === "string" ? { body: pr.body } : {}),
            ...(typeof pr.base === "string" ? { base: pr.base } : {}),
          },
        };
      }
      return {
        type: "task-deliver",
        workspaceId: record.workspaceId,
        taskRunId: record.taskRunId,
        branch: record.branch,
        commitMessage: record.commitMessage,
        remote: record.remote,
      };
    }
    case "promotion-accept":
    case "promotion-retry":
      return boundedText(record.workspaceId, 160) && boundedText(record.promotionId, 160)
        ? {
            type: record.type,
            workspaceId: record.workspaceId,
            promotionId: record.promotionId,
          }
        : undefined;
    case "terminal-input":
      return typeof record.data === "string"
        ? { type: "terminal-input", data: record.data }
        : undefined;
    case "terminal-resize":
      return typeof record.cols === "number" && typeof record.rows === "number"
        ? { type: "terminal-resize", cols: record.cols, rows: record.rows }
        : undefined;
    case "terminal-reconnect":
      return { type: "terminal-reconnect" };
    case "detach":
      return { type: "detach" };
    case "quit":
      return { type: "quit" };
    default:
      return undefined;
  }
}

function listen(server: Server): Promise<number> {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error: Error) => rejectListen(error);
    server.once("error", onError);
    server.listen({ host: loopbackHost, port: 0, exclusive: true }, () => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectListen(rendererError("Renderer listener has no TCP address", "listener-address"));
        return;
      }
      resolveListen(address.port);
    });
  });
}

function writeMessage(socket: Socket, message: unknown): Promise<void> {
  return new Promise((resolveWrite, rejectWrite) => {
    socket.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error) rejectWrite(error);
      else resolveWrite();
    });
  });
}

function waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, error: unknown): Promise<T> {
  return new Promise((resolveWait, rejectWait) => {
    const timer = setTimeout(() => rejectWait(error), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolveWait(value);
      },
      (reason) => {
        clearTimeout(timer);
        rejectWait(reason);
      },
    );
  });
}

export async function openLoopbackWorkspaceControlRenderer(
  input: OpenLoopbackWorkspaceControlRendererInput,
): Promise<WorkspaceTuiLaunchSession> {
  const token = randomBytes(32).toString("hex");
  const events = new AsyncEventQueue<WorkspaceTuiLaunchEvent>();
  let authenticatedSocket: Socket | undefined;
  let resolveAuthenticated!: (socket: Socket) => void;
  let rejectAuthenticated!: (error: unknown) => void;
  const authenticated = new Promise<Socket>((resolveAuth, rejectAuth) => {
    resolveAuthenticated = resolveAuth;
    rejectAuthenticated = rejectAuth;
  });
  const server = createServer();
  server.maxConnections = 1;
  server.on("connection", (socket) => {
    if (authenticatedSocket) {
      socket.destroy();
      return;
    }
    socket.setEncoding("utf8");
    socket.setNoDelay(true);
    let authenticatedClient = false;
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      if (Buffer.byteLength(buffer) > maxProtocolLineBytes) {
        rejectAuthenticated(rendererError("Renderer protocol line is too large", "line-limit"));
        socket.destroy();
        return;
      }
      while (buffer.includes("\n")) {
        const newline = buffer.indexOf("\n");
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          if (!authenticatedClient)
            rejectAuthenticated(rendererError("Renderer handshake is invalid", "handshake-json"));
          socket.destroy();
          return;
        }
        const record = parsed as Record<string, unknown>;
        if (!authenticatedClient) {
          if (record.type !== "hello" || !tokenMatches(record.token, token)) {
            rejectAuthenticated(rendererError("Renderer authentication failed", "handshake-auth"));
            socket.destroy();
            return;
          }
          authenticatedClient = true;
          authenticatedSocket = socket;
          void writeMessage(socket, { type: "hello-ok" }).then(
            () => resolveAuthenticated(socket),
            rejectAuthenticated,
          );
          void closeServer(server);
          continue;
        }
        const event = parseRendererEvent(parsed);
        if (event) events.push(event);
      }
    });
    socket.on("close", () => events.end());
    socket.on("error", (error) => {
      if (!authenticatedClient) rejectAuthenticated(error);
      events.end();
    });
  });

  let process: WorkspaceControlRendererProcess | undefined;
  try {
    const port = await listen(server);
    process = await input.launch({ host: loopbackHost, port, token });
    void process.exited.then(
      () => events.end(),
      () => events.end(),
    );
    const exitedBeforeAuthentication = process.exited.then<never>(
      () => {
        throw rendererError("Renderer exited before authentication", "process-exited");
      },
      () => {
        throw rendererError("Renderer failed before authentication", "process-failed");
      },
    );
    const socket = await waitWithTimeout(
      Promise.race([authenticated, exitedBeforeAuthentication]),
      rendererConnectTimeoutMs,
      rendererError("Renderer did not connect", "connect-timeout"),
    );
    let closed = false;
    return {
      send: (message) => writeMessage(socket, message),
      events: () => events.iterable(),
      close: async () => {
        if (closed) return;
        closed = true;
        events.end();
        try {
          if (!socket.destroyed) {
            await writeMessage(socket, { type: "shutdown" });
            socket.end();
          }
          await waitWithTimeout(
            process?.exited ?? Promise.resolve(),
            rendererExitTimeoutMs,
            rendererError("Renderer did not exit after shutdown", "exit-timeout"),
          );
        } catch {
          process?.terminate();
        } finally {
          socket.destroy();
          await closeServer(server);
        }
      },
    };
  } catch (error) {
    process?.terminate();
    authenticatedSocket?.destroy();
    await closeServer(server);
    throw error;
  }
}

function hasWorkspaceControlTuiCrate(root: string): boolean {
  return existsSync(join(root, "apps", "workspace-control-tui", "Cargo.toml"));
}

export function workspaceControlRendererSearchRoots(
  environment: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  const addRoot = (value: string) => {
    const root = resolve(value);
    if (seen.has(root) || !hasWorkspaceControlTuiCrate(root)) return;
    seen.add(root);
    roots.push(root);
  };
  const consider = (start: string | undefined) => {
    if (!start) return;
    let current = resolve(start);
    for (let depth = 0; depth < 8; depth += 1) {
      addRoot(current);
      addRoot(join(current, "appaloft"));
      addRoot(join(dirname(current), "appaloft"));
      const communityMarker = `${sep}appaloft-cloud${sep}community${sep}appaloft`;
      const communityAt = current.lastIndexOf(communityMarker);
      if (communityAt !== -1) {
        addRoot(join(current.slice(0, communityAt), "appaloft"));
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  };
  const pinnedRoot = environment.APPALOFT_REPO_ROOT?.trim();
  if (pinnedRoot) {
    consider(pinnedRoot);
    return roots;
  }
  consider(resolve(dirname(fileURLToPath(import.meta.url)), "../../../.."));
  consider(process.cwd());
  const executed = environment.APPALOFT_EXECUTED_SCRIPT?.trim() || process.argv[1];
  if (executed) consider(dirname(resolve(executed)));
  return roots;
}

export function workspaceControlRendererCrateDir(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const root = workspaceControlRendererSearchRoots(environment)[0];
  return root ? join(root, "apps", "workspace-control-tui") : undefined;
}

export function workspaceControlRendererBinaryCandidates(
  environment: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const executable =
    process.platform === "win32" ? "appaloft-workspace-tui.exe" : "appaloft-workspace-tui";
  const configured = environment.APPALOFT_WORKSPACE_TUI_BINARY;
  const pathDirs = (environment.PATH ?? process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const crateTargets = workspaceControlRendererSearchRoots(environment).flatMap((root) => {
    const crate = join(root, "apps", "workspace-control-tui");
    return [
      join(crate, "target", "release", executable),
      join(crate, "target", "debug", executable),
    ];
  });
  return [
    ...(configured ? [isAbsolute(configured) ? configured : resolve(configured)] : []),
    join(dirname(process.execPath), executable),
    ...pathDirs.map((dir) => join(dir, executable)),
    ...crateTargets,
  ];
}

export function resolveWorkspaceControlRendererBinary(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return workspaceControlRendererBinaryCandidates(environment).find((candidate) =>
    existsSync(candidate),
  );
}

export const WORKSPACE_CONTROL_TUI_CODE_CHROME_TITLE = "Appaloft Cloud Agents";
export const WORKSPACE_CONTROL_TUI_CODE_CHROME_WAIT = "preparing the agent";
export const WORKSPACE_CONTROL_TUI_CODE_CHROME_CAPABILITY = "cloud-agents";

export function workspaceControlRendererSupportsCodeChrome(binaryPath: string): boolean {
  try {
    const contents = readFileSync(binaryPath);
    return (
      contents.includes(Buffer.from(WORKSPACE_CONTROL_TUI_CODE_CHROME_TITLE)) &&
      contents.includes(Buffer.from(WORKSPACE_CONTROL_TUI_CODE_CHROME_WAIT))
    );
  } catch {
    return false;
  }
}

export function resolveCodeWorkspaceControlRendererBinary(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return workspaceControlRendererBinaryCandidates(environment).find(
    (candidate) => existsSync(candidate) && workspaceControlRendererSupportsCodeChrome(candidate),
  );
}

export const WORKSPACE_CONTROL_TUI_BINARY_NAME = "appaloft-workspace-tui";
export const WORKSPACE_CONTROL_TUI_BUILD_COMMAND =
  "cargo build --locked --manifest-path apps/workspace-control-tui/Cargo.toml";
export const WORKSPACE_CONTROL_TUI_TOOLCHAIN_COMMAND = "rustup toolchain install stable";
export const WORKSPACE_CONTROL_TUI_DEFAULT_TOOLCHAIN_COMMAND = "rustup default stable";
export const WORKSPACE_CONTROL_TUI_MIN_RUSTC = { major: 1, minor: 88 } as const;
export const WORKSPACE_TUI_LEAVE_ALT_SCREEN = "\x1b[?25h\x1b[?1049l";
export const WORKSPACE_TUI_DISABLE_MOUSE = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l";
const RUSTUP_CARGO_CHOOSER_RE =
  /rustup could not choose a version of (?:cargo|rustc)|no default is configured|help: run 'rustup default stable'|Workspace renderer .* is unavailable/iu;
type WorkspaceTuiScrollbackWriter = (text: string) => void;
let workspaceTuiScrollbackWriter: WorkspaceTuiScrollbackWriter | undefined;
let workspaceRendererFailureReported = false;

export function parseRustcRelease(
  versionText: string,
): { readonly major: number; readonly minor: number } | undefined {
  const match = /rustc\s+(\d+)\.(\d+)/.exec(versionText);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

export function rustcTooOldForWorkspaceControlTui(versionText: string): boolean {
  const release = parseRustcRelease(versionText);
  if (!release) return false;
  return (
    release.major < WORKSPACE_CONTROL_TUI_MIN_RUSTC.major ||
    (release.major === WORKSPACE_CONTROL_TUI_MIN_RUSTC.major &&
      release.minor < WORKSPACE_CONTROL_TUI_MIN_RUSTC.minor)
  );
}

export function workspaceControlRendererUnavailableMessage(
  input: {
    readonly rustcVersion?: string;
    readonly buildFailed?: boolean;
    readonly rustupMissing?: boolean;
    readonly codeChrome?: boolean;
  } = {},
): string {
  const rustcVersion = input.rustcVersion?.trim();
  const rustcLabel = rustcVersion?.match(/rustc\s+\d+\.\d+(?:\.\d+)?/)?.[0];
  const tooOld = rustcVersion ? rustcTooOldForWorkspaceControlTui(rustcVersion) : false;
  const lines = [
    `TTY attach needs the workspace TUI binary ${WORKSPACE_CONTROL_TUI_BINARY_NAME}.`,
    "Set a default Rust toolchain, then build the crate from this checkout:",
    `  ${WORKSPACE_CONTROL_TUI_DEFAULT_TOOLCHAIN_COMMAND}`,
    `  ${WORKSPACE_CONTROL_TUI_BUILD_COMMAND}`,
  ];
  if (tooOld && rustcLabel) {
    lines.push(
      `${rustcLabel} is too old (need Rust ${WORKSPACE_CONTROL_TUI_MIN_RUSTC.major}.${WORKSPACE_CONTROL_TUI_MIN_RUSTC.minor} or newer). Then retry \`appaloftdev code\`.`,
    );
  } else if (input.rustupMissing) {
    lines.push("No default Rust toolchain is configured on this machine.");
  } else if (input.buildFailed) {
    lines.push(
      `The crate needs Rust ${WORKSPACE_CONTROL_TUI_MIN_RUSTC.major}.${WORKSPACE_CONTROL_TUI_MIN_RUSTC.minor} or newer.`,
    );
  }
  lines.push("`--no-attach` still works without this binary.");
  return sanitizeWorkspaceRendererFailureText(lines.join("\n"));
}

export function sanitizeWorkspaceRendererFailureText(text: string): string {
  const cleaned = text
    .split(/\r?\n/u)
    .filter((line) => !RUSTUP_CARGO_CHOOSER_RE.test(line))
    .join("\n")
    .trim();
  if (cleaned.length > 0 && !RUSTUP_CARGO_CHOOSER_RE.test(cleaned)) return cleaned;
  return [
    `TTY attach needs the workspace TUI binary ${WORKSPACE_CONTROL_TUI_BINARY_NAME}.`,
    "Set a default Rust toolchain, then build the crate from this checkout:",
    `  ${WORKSPACE_CONTROL_TUI_DEFAULT_TOOLCHAIN_COMMAND}`,
    `  ${WORKSPACE_CONTROL_TUI_BUILD_COMMAND}`,
    "`--no-attach` still works without this binary.",
  ].join("\n");
}

export function setWorkspaceTuiScrollbackWriter(write?: WorkspaceTuiScrollbackWriter): void {
  workspaceTuiScrollbackWriter = write;
}

export function resetWorkspaceRendererFailureReport(): void {
  workspaceRendererFailureReported = false;
}

export function claimWorkspaceRendererFailureReport(): boolean {
  if (workspaceRendererFailureReported) return false;
  workspaceRendererFailureReported = true;
  return true;
}

export function restoreWorkspaceTuiScrollback(
  write: WorkspaceTuiScrollbackWriter = workspaceTuiScrollbackWriter ??
    ((text) => {
      process.stdout.write(text);
    }),
): void {
  write(`${WORKSPACE_TUI_LEAVE_ALT_SCREEN}${WORKSPACE_TUI_DISABLE_MOUSE}\n`);
}

function failClosedWorkspaceRenderer(
  reason: string,
  input: {
    readonly rustcVersion?: string;
    readonly buildFailed?: boolean;
    readonly rustupMissing?: boolean;
    readonly codeChrome?: boolean;
    readonly crateDir?: string;
    readonly exitCode?: number;
  } = {},
): never {
  restoreWorkspaceTuiScrollback();
  throw workspaceControlRendererUnavailableError(reason, input);
}

export function isWorkspaceRendererFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    readonly message?: unknown;
    readonly details?: { readonly phase?: unknown; readonly reason?: unknown };
  };
  const phase = typeof record.details?.phase === "string" ? record.details.phase : "";
  const reason = typeof record.details?.reason === "string" ? record.details.reason : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    phase === "workspace-control-renderer" ||
    reason.startsWith("binary-") ||
    reason === "toolchain-old" ||
    reason === "rustup-missing" ||
    message.includes(WORKSPACE_CONTROL_TUI_BINARY_NAME)
  );
}

function workspaceControlRendererUnavailableError(
  reason: string,
  input: {
    readonly rustcVersion?: string;
    readonly buildFailed?: boolean;
    readonly rustupMissing?: boolean;
    readonly codeChrome?: boolean;
    readonly crateDir?: string;
    readonly exitCode?: number;
  } = {},
) {
  return rendererError(workspaceControlRendererUnavailableMessage(input), reason, {
    ...(input.crateDir ? { crateDir: input.crateDir } : {}),
    ...(input.rustcVersion ? { rustcVersion: input.rustcVersion } : {}),
    ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
  });
}

export async function readRustcVersion(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  restoreWorkspaceTuiScrollback();
  const rustc = environment.RUSTC?.trim() || "rustc";
  const child = spawn(rustc, ["--version"], {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: environment,
  });
  let stdout = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.resume();
  try {
    const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
      const timer = setTimeout(() => {
        child.kill();
        resolveExit(1);
      }, 2_000);
      child.once("error", (error) => {
        clearTimeout(timer);
        rejectExit(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        resolveExit(code ?? 1);
      });
    });
    if (exitCode !== 0) return undefined;
    const version = stdout.trim();
    return version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

export async function buildWorkspaceControlRendererBinary(
  crateDir: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  restoreWorkspaceTuiScrollback();
  const cargo = environment.CARGO?.trim() || "cargo";
  const child = spawn(cargo, ["build", "--locked"], {
    cwd: crateDir,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: environment,
  });
  child.stdout?.resume();
  child.stderr?.resume();
  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) {
    failClosedWorkspaceRenderer("binary-build-failed", {
      crateDir,
      buildFailed: true,
      exitCode,
    });
  }
}

export interface EnsureWorkspaceControlRendererBinaryOptions {
  readonly rustcVersion?: string;
  readonly readRustcVersion?: (environment: NodeJS.ProcessEnv) => Promise<string | undefined>;
}

export async function ensureWorkspaceControlRendererBinary(
  environment: NodeJS.ProcessEnv = process.env,
  build: (
    crateDir: string,
    env: NodeJS.ProcessEnv,
  ) => Promise<void> = buildWorkspaceControlRendererBinary,
  options: EnsureWorkspaceControlRendererBinaryOptions = {},
): Promise<string | undefined> {
  const existing = resolveWorkspaceControlRendererBinary(environment);
  if (existing) return existing;
  restoreWorkspaceTuiScrollback();
  const crateDir = workspaceControlRendererCrateDir(environment);
  const rustcVersion =
    options.rustcVersion ?? (await (options.readRustcVersion ?? readRustcVersion)(environment));
  if (crateDir && rustcVersion && rustcTooOldForWorkspaceControlTui(rustcVersion)) {
    failClosedWorkspaceRenderer("toolchain-old", {
      crateDir,
      rustcVersion,
    });
  }
  if (!crateDir) return undefined;
  if (!rustcVersion) {
    failClosedWorkspaceRenderer("rustup-missing", {
      crateDir,
      rustupMissing: true,
      codeChrome: true,
    });
  }
  try {
    await build(crateDir, environment);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "details" in error &&
      error.details &&
      typeof error.details === "object" &&
      "reason" in error.details &&
      (error.details.reason === "binary-build-failed" ||
        error.details.reason === "toolchain-old" ||
        error.details.reason === "rustup-missing")
    ) {
      throw error;
    }
    failClosedWorkspaceRenderer("binary-build-failed", {
      crateDir,
      ...(rustcVersion ? { rustcVersion } : {}),
      buildFailed: true,
    });
  }
  return resolveWorkspaceControlRendererBinary(environment);
}

export interface RatatuiWorkspaceControlPresentationInput {
  readonly binaryPath?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

let warmedWorkspaceControlRenderer: Promise<WorkspaceTuiLaunchSession> | undefined;

export function resetWorkspaceControlRendererWarmup(): void {
  warmedWorkspaceControlRenderer = undefined;
  workspaceTuiScrollbackWriter = undefined;
  workspaceRendererFailureReported = false;
}

export function consumeWarmedWorkspaceControlRenderer():
  | Promise<WorkspaceTuiLaunchSession>
  | undefined {
  const session = warmedWorkspaceControlRenderer;
  warmedWorkspaceControlRenderer = undefined;
  return session;
}

export async function warmupWorkspaceControlRenderer(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<WorkspaceTuiLaunchSession> {
  if (!warmedWorkspaceControlRenderer) {
    const chrome = resolveCodeWorkspaceControlRendererBinary(environment);
    if (!chrome) {
      const stale = resolveWorkspaceControlRendererBinary(environment);
      failClosedWorkspaceRenderer(stale ? "binary-stale-chrome" : "binary-missing", {
        codeChrome: true,
      });
    }
    warmedWorkspaceControlRenderer = openWorkspaceControlRenderer({
      environment,
      binaryPath: chrome,
    });
  }
  return warmedWorkspaceControlRenderer;
}

export async function openWorkspaceControlRenderer(
  input: RatatuiWorkspaceControlPresentationInput = {},
): Promise<WorkspaceTuiLaunchSession> {
  const environment = input.environment ?? process.env;
  const binaryPath = input.binaryPath ?? resolveCodeWorkspaceControlRendererBinary(environment);
  if (!binaryPath || !workspaceControlRendererSupportsCodeChrome(binaryPath)) {
    const stale = resolveWorkspaceControlRendererBinary(environment);
    failClosedWorkspaceRenderer(stale ? "binary-stale-chrome" : "binary-missing", {
      codeChrome: true,
    });
  }
  return openLoopbackWorkspaceControlRenderer({
    launch: async ({ port, token }) => {
      const child = spawn(binaryPath, [], {
        shell: false,
        stdio: "inherit",
        env: {
          ...environment,
          APPALOFT_WORKSPACE_TUI_PORT: String(port),
          APPALOFT_WORKSPACE_TUI_TOKEN: token,
        },
      });
      const exited = new Promise<void>((resolveExit, rejectExit) => {
        child.once("error", rejectExit);
        child.once("exit", () => resolveExit());
      });
      return {
        exited,
        terminate() {
          child.kill();
        },
      };
    },
  });
}
