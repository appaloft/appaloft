import {
  createHash,
  createPublicKey,
  randomUUID,
  timingSafeEqual,
  verify,
  X509Certificate,
} from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { connect as connectTcp, type Socket } from "node:net";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  connect as connectTls,
  createServer as createTlsServer,
  type TLSSocket,
  type Server as TlsServer,
} from "node:tls";

import { type DomainError, err, ok, type Result } from "@appaloft/core";

export const serverWorkerRelaySchema = "server-worker-relay/v1" as const;
export const serverWorkerCapabilities = [
  "process.exec",
  "process.pty",
  "filesystem.read",
  "filesystem.write",
  "runtime.dev",
  "runtime.docker",
  "network.forward",
  "worker.rotate",
  "worker.drain",
] as const;
export type ServerWorkerCapability = (typeof serverWorkerCapabilities)[number];
export type ServerWorkerFrameType =
  | "hello"
  | "heartbeat"
  | "request"
  | "response"
  | "stream-open"
  | "stream-data"
  | "stream-close"
  | "cancel"
  | "rotate"
  | "drain"
  | "goodbye";

interface FrameBase {
  schema: typeof serverWorkerRelaySchema;
  type: ServerWorkerFrameType;
  workerId: string;
  generation: number;
  messageId: string;
}

export interface ServerWorkerHelloFrame extends FrameBase {
  type: "hello";
  versions: readonly string[];
  capabilities: readonly ServerWorkerCapability[];
  platform?: string;
  version?: string;
}

export interface ServerWorkerDataFrame extends FrameBase {
  type: Exclude<ServerWorkerFrameType, "hello">;
  requestId?: string;
  streamId?: string;
  sequence?: number;
  capability?: ServerWorkerCapability;
  payload?: unknown;
  data?: string;
}

export type ServerWorkerFrame = ServerWorkerHelloFrame | ServerWorkerDataFrame;

const maximumFrameBytes = 1_048_576;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const capabilitySet = new Set<string>(serverWorkerCapabilities);
const frameTypes = new Set<ServerWorkerFrameType>([
  "hello",
  "heartbeat",
  "request",
  "response",
  "stream-open",
  "stream-data",
  "stream-close",
  "cancel",
  "rotate",
  "drain",
  "goodbye",
]);

function relayError(
  code:
    | "server_worker_enrollment_invalid"
    | "server_worker_protocol_incompatible"
    | "server_worker_unavailable"
    | "server_worker_generation_fenced"
    | "server_worker_capability_denied",
  message: string,
  phase: string,
  retryable = false,
): DomainError {
  return { code, category: "user", message, retryable, details: { phase } };
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && identifierPattern.test(value);
}

export function parseServerWorkerFrame(line: string): Result<ServerWorkerFrame> {
  if (Buffer.byteLength(line) > maximumFrameBytes) {
    return err(
      relayError(
        "server_worker_protocol_incompatible",
        "Server Worker frame exceeds the bounded line size",
        "server-worker-handshake",
      ),
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return err(
      relayError(
        "server_worker_protocol_incompatible",
        "Server Worker frame is not valid JSON",
        "server-worker-handshake",
      ),
    );
  }
  if (!value || typeof value !== "object") {
    return err(
      relayError(
        "server_worker_protocol_incompatible",
        "Frame must be an object",
        "server-worker-handshake",
      ),
    );
  }
  const frame = value as Record<string, unknown>;
  if (
    frame.schema !== serverWorkerRelaySchema ||
    !frameTypes.has(frame.type as ServerWorkerFrameType) ||
    !validIdentifier(frame.workerId) ||
    !Number.isInteger(frame.generation) ||
    Number(frame.generation) < 1 ||
    !validIdentifier(frame.messageId)
  ) {
    return err(
      relayError(
        "server_worker_protocol_incompatible",
        "Frame envelope is invalid",
        "server-worker-handshake",
      ),
    );
  }
  if (frame.type === "hello") {
    if (
      !Array.isArray(frame.versions) ||
      frame.versions.length < 1 ||
      frame.versions.length > 8 ||
      !frame.versions.every((version) => typeof version === "string" && version.length <= 80) ||
      !Array.isArray(frame.capabilities) ||
      frame.capabilities.length > serverWorkerCapabilities.length ||
      !frame.capabilities.every((capability) => capabilitySet.has(String(capability))) ||
      (frame.platform !== undefined &&
        (typeof frame.platform !== "string" || frame.platform.length > 80)) ||
      (frame.version !== undefined &&
        (typeof frame.version !== "string" || frame.version.length > 80))
    ) {
      return err(
        relayError(
          "server_worker_protocol_incompatible",
          "Worker hello is invalid",
          "server-worker-handshake",
        ),
      );
    }
    return ok({
      schema: serverWorkerRelaySchema,
      type: "hello",
      workerId: frame.workerId,
      generation: Number(frame.generation),
      messageId: frame.messageId,
      versions: frame.versions as string[],
      capabilities: frame.capabilities as ServerWorkerCapability[],
      ...(typeof frame.platform === "string" ? { platform: frame.platform } : {}),
      ...(typeof frame.version === "string" ? { version: frame.version } : {}),
    });
  }
  if (frame.data !== undefined) {
    if (typeof frame.data !== "string" || frame.data.length > 349_528) {
      return err(
        relayError(
          "server_worker_protocol_incompatible",
          "Binary chunk is invalid",
          "server-worker-admission",
        ),
      );
    }
    try {
      Buffer.from(frame.data, "base64");
    } catch {
      return err(
        relayError(
          "server_worker_protocol_incompatible",
          "Binary chunk is not base64",
          "server-worker-admission",
        ),
      );
    }
  }
  return ok(frame as unknown as ServerWorkerDataFrame);
}

export function negotiateServerWorkerHello(
  hello: ServerWorkerHelloFrame,
  input: { versions: readonly string[]; requiredCapabilities: readonly ServerWorkerCapability[] },
): { version: string; capabilities: ServerWorkerCapability[] } {
  const version = input.versions.find((candidate) => hello.versions.includes(candidate));
  if (!version)
    throw relayError(
      "server_worker_protocol_incompatible",
      "No relay protocol version overlaps",
      "server-worker-handshake",
    );
  const capabilities = input.requiredCapabilities.filter((capability) =>
    hello.capabilities.includes(capability),
  );
  if (capabilities.length !== input.requiredCapabilities.length) {
    throw relayError(
      "server_worker_capability_denied",
      "Worker lacks a required capability",
      "server-worker-admission",
    );
  }
  return { version, capabilities };
}

interface Lease {
  generation: number;
  expiresAt: number;
  revoked: boolean;
}

export class InMemoryServerWorkerLeaseRegistry {
  readonly #leases = new Map<string, Lease>();
  constructor(private readonly options: { leaseMs: number }) {}

  connect(workerId: string, generation: number, now: number): Result<Lease> {
    const current = this.#leases.get(workerId);
    if (current?.revoked)
      return err(
        relayError("server_worker_unavailable", "Worker is revoked", "server-worker-lease"),
      );
    if (current && generation <= current.generation) {
      return err(
        relayError(
          "server_worker_generation_fenced",
          "Worker generation is stale",
          "server-worker-admission",
          true,
        ),
      );
    }
    const lease = { generation, expiresAt: now + this.options.leaseMs, revoked: false };
    this.#leases.set(workerId, lease);
    return ok(lease);
  }

  heartbeat(workerId: string, generation: number, now: number): Result<Lease> {
    const admitted = this.admit(workerId, generation, now);
    if (admitted.isErr()) return admitted;
    admitted.value.expiresAt = now + this.options.leaseMs;
    return admitted;
  }

  admit(workerId: string, generation: number, now: number): Result<Lease> {
    const lease = this.#leases.get(workerId);
    if (!lease || lease.revoked || lease.expiresAt <= now) {
      return err(
        relayError(
          "server_worker_unavailable",
          "Worker lease is unavailable",
          "server-worker-lease",
          true,
        ),
      );
    }
    return lease.generation === generation
      ? ok(lease)
      : err(
          relayError(
            "server_worker_generation_fenced",
            "Worker generation is stale",
            "server-worker-admission",
            true,
          ),
        );
  }

  disconnect(workerId: string, generation: number): void {
    const lease = this.#leases.get(workerId);
    if (lease?.generation === generation && !lease.revoked) this.#leases.delete(workerId);
  }

  revoke(workerId: string): void {
    const lease = this.#leases.get(workerId);
    if (lease) lease.revoked = true;
    else this.#leases.set(workerId, { generation: 0, expiresAt: 0, revoked: true });
  }
}

interface EnrollmentRecord {
  workerId: string;
  expiresAt: number;
  consumed: boolean;
  tokenHash: Buffer;
}

export class OneTimeEnrollmentTokenRegistry {
  readonly #records = new Map<string, EnrollmentRecord>();

  issue(
    input: { workerId: string; expiresAt: number },
    token: string,
  ): { workerId: string; expiresAt: number; tokenId: string } {
    const tokenHash = createHash("sha256").update(token).digest();
    const tokenId = tokenHash.toString("hex").slice(0, 24);
    this.#records.set(tokenId, { ...input, consumed: false, tokenHash });
    return { ...input, tokenId };
  }

  consume(token: string, now: number): Result<{ workerId: string }> {
    const tokenHash = createHash("sha256").update(token).digest();
    const tokenId = tokenHash.toString("hex").slice(0, 24);
    const record = this.#records.get(tokenId);
    if (
      !record ||
      record.consumed ||
      record.expiresAt <= now ||
      record.tokenHash.length !== tokenHash.length ||
      !timingSafeEqual(record.tokenHash, tokenHash)
    ) {
      return err(
        relayError(
          "server_worker_enrollment_invalid",
          "Enrollment token is invalid or expired",
          "server-worker-enrollment",
        ),
      );
    }
    record.consumed = true;
    return ok({ workerId: record.workerId });
  }
}

export interface ServerWorkerDispatchRequest {
  requestId: string;
  capability: ServerWorkerCapability;
  payload: unknown;
}

export interface ServerWorkerDispatchResult {
  requestId: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  data?: string;
  bytes?: number;
}

function requestError(message: string): DomainError {
  return {
    code: "server_worker_request_failed",
    category: "user",
    message,
    retryable: false,
    details: { phase: "server-worker-execution" },
  };
}

function recordPayload(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

export class ServerWorkerDispatcher {
  readonly #roots: string[];
  readonly #journal = new Map<string, Result<ServerWorkerDispatchResult>>();

  constructor(
    private readonly options: {
      roots: readonly string[];
      allowHostShell: boolean;
      maximumOutputBytes?: number;
      maximumFileBytes?: number;
      timeoutMs?: number;
      handlers?: Partial<
        Record<
          ServerWorkerCapability,
          (request: ServerWorkerDispatchRequest) => Promise<Result<ServerWorkerDispatchResult>>
        >
      >;
    },
  ) {
    this.#roots = options.roots.map((root) => resolve(root));
  }

  #ownedPath(path: unknown): Result<string> {
    if (typeof path !== "string" || !isAbsolute(path)) {
      return err(requestError("Worker filesystem paths must be absolute"));
    }
    const normalized = resolve(path);
    const owned = this.#roots.some((root) => {
      const child = relative(root, normalized);
      return child === "" || (!child.startsWith("..") && !isAbsolute(child));
    });
    return owned ? ok(normalized) : err(requestError("Worker filesystem path escapes owned roots"));
  }

  async dispatch(
    request: ServerWorkerDispatchRequest,
  ): Promise<Result<ServerWorkerDispatchResult>> {
    if (!validIdentifier(request.requestId))
      return err(requestError("Worker request id is invalid"));
    const previous = this.#journal.get(request.requestId);
    if (previous) return previous;
    const payload = recordPayload(request.payload);
    if (!payload) return err(requestError("Worker request payload must be an object"));

    let result: Result<ServerWorkerDispatchResult>;
    const customHandler = this.options.handlers?.[request.capability];
    if (customHandler) {
      result = await customHandler(request);
    } else if (request.capability === "filesystem.read") {
      const path = this.#ownedPath(payload.path);
      if (path.isErr()) return err(path.error);
      try {
        const data = await readFile(path.value);
        if (data.byteLength > (this.options.maximumFileBytes ?? 1_048_576)) {
          result = err(requestError("Worker file exceeds the read limit"));
        } else {
          result = ok({
            requestId: request.requestId,
            data: data.toString("base64"),
            bytes: data.byteLength,
          });
        }
      } catch (error) {
        result = err(
          requestError(
            `Worker file read failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    } else if (request.capability === "filesystem.write") {
      const path = this.#ownedPath(payload.path);
      if (path.isErr()) return err(path.error);
      if (typeof payload.data !== "string" || payload.data.length > 1_500_000) {
        return err(requestError("Worker file payload exceeds the write limit"));
      }
      const data = Buffer.from(payload.data, "base64");
      if (data.byteLength > (this.options.maximumFileBytes ?? 1_048_576)) {
        return err(requestError("Worker file exceeds the write limit"));
      }
      try {
        await writeFile(path.value, data, { mode: 0o600 });
        result = ok({ requestId: request.requestId, bytes: data.byteLength });
      } catch (error) {
        result = err(
          requestError(
            `Worker file write failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    } else if (request.capability === "process.exec") {
      if (!this.options.allowHostShell)
        return err(requestError("Host process execution is disabled by local policy"));
      if (
        !Array.isArray(payload.argv) ||
        payload.argv.length < 1 ||
        payload.argv.length > 128 ||
        !payload.argv.every((argument) => typeof argument === "string" && argument.length <= 4_096)
      ) {
        return err(requestError("Worker argv is invalid"));
      }
      if (
        payload.argv[0] === "sh" ||
        payload.argv[0] === "bash" ||
        payload.argv.includes("-c") ||
        payload.argv.includes("-lc")
      ) {
        return err(requestError("Worker shell interpreter execution is denied"));
      }
      const cwd = this.#ownedPath(payload.cwd);
      if (cwd.isErr()) return err(cwd.error);
      const timeoutMs = Math.min(
        Number.isInteger(payload.timeoutMs)
          ? Number(payload.timeoutMs)
          : (this.options.timeoutMs ?? 30_000),
        120_000,
      );
      const child = Bun.spawn(payload.argv as string[], {
        cwd: cwd.value,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<"timeout">((resolveTimeout) => {
        timeout = setTimeout(() => {
          child.kill("SIGKILL");
          resolveTimeout("timeout");
        }, timeoutMs);
      });
      const completed = child.exited.then(() => "completed" as const);
      const outcome = await Promise.race([completed, timedOut]);
      if (timeout) clearTimeout(timeout);
      const stdout = await new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      const maximum = this.options.maximumOutputBytes ?? 1_048_576;
      result =
        outcome === "timeout"
          ? err(requestError("Worker process timed out"))
          : ok({
              requestId: request.requestId,
              exitCode: child.exitCode ?? 1,
              stdout: stdout.slice(0, maximum),
              stderr: stderr.slice(0, maximum),
            });
    } else {
      result = err(requestError(`Worker capability ${request.capability} is not implemented`));
    }

    this.#journal.set(request.requestId, result);
    return result;
  }
}

interface RelayPendingRequest {
  resolve(value: Result<ServerWorkerDispatchResult>): void;
  timer: ReturnType<typeof setTimeout>;
}

interface RelayConnection {
  socket: TLSSocket;
  workerId: string;
  generation: number;
  capabilities: readonly ServerWorkerCapability[];
  buffer: string;
}

export interface ServerWorkerStreamSession {
  write(data: Uint8Array): Promise<void> | void;
  control?(payload: unknown): Promise<void> | void;
  close(): Promise<void> | void;
}

export interface ServerWorkerStreamHandlerInput {
  streamId: string;
  workerId: string;
  generation: number;
  payload: unknown;
  send(data: Uint8Array): Promise<void>;
  control(payload: unknown): Promise<void>;
  close(): Promise<void>;
}

export type ServerWorkerStreamHandler = (
  input: ServerWorkerStreamHandlerInput,
) => Promise<Result<ServerWorkerStreamSession>>;

export interface ServerWorkerRelayStream {
  streamId: string;
  write(data: Uint8Array): Promise<Result<void>>;
  control(payload: unknown): Promise<Result<void>>;
  close(): Promise<Result<void>>;
}

interface RelayServerStream {
  workerId: string;
  generation: number;
  sequence: number;
  receivedSequence: number;
  onData(data: Uint8Array): void | Promise<void>;
  onControl?(payload: unknown): void | Promise<void>;
  onClose?(): void | Promise<void>;
}

function writeFrame(socket: TLSSocket, frame: ServerWorkerFrame): Promise<void> {
  return new Promise((resolveWrite, rejectWrite) => {
    socket.write(`${JSON.stringify(frame)}\n`, (error) =>
      error ? rejectWrite(error) : resolveWrite(),
    );
  });
}

function certificateError(message: string): DomainError {
  return {
    code: "server_worker_certificate_rejected",
    category: "user",
    message,
    retryable: false,
    details: { phase: "server-worker-mtls" },
  };
}

function requestFailure(message: string, retryable = true): DomainError {
  return {
    code: "server_worker_request_failed",
    category: "infra",
    message,
    retryable,
    details: { phase: "server-worker-execution" },
  };
}

export interface ServerWorkerRelayServerOptions {
  tls: { key: string | Buffer; cert: string | Buffer; ca: string | Buffer | (string | Buffer)[] };
  leaseRegistry: InMemoryServerWorkerLeaseRegistry;
  requiredCapabilities?: readonly ServerWorkerCapability[];
  authorizePeer?: (input: {
    workerId: string;
    generation: number;
    fingerprint256: string;
    publicKeyFingerprint: string;
    serialNumber: string;
    subject: Record<string, string>;
    capabilities: readonly ServerWorkerCapability[];
    platform: string;
    version: string;
  }) => Result<void> | Promise<Result<void>>;
  onConnect?: (input: {
    workerId: string;
    generation: number;
    fingerprint256: string;
    publicKeyFingerprint: string;
    serialNumber: string;
    subject: Record<string, string>;
    capabilities: readonly ServerWorkerCapability[];
    platform: string;
    version: string;
  }) => Result<void> | Promise<Result<void>>;
  onHeartbeat?: (input: { workerId: string; generation: number }) => Promise<void> | void;
  onDisconnect?: (input: { workerId: string; generation: number }) => Promise<void> | void;
  requestTimeoutMs?: number;
}

export class ServerWorkerRelayServer {
  readonly #connections = new Map<string, RelayConnection>();
  readonly #pending = new Map<string, RelayPendingRequest>();
  readonly #streams = new Map<string, RelayServerStream>();
  #server: TlsServer | null = null;
  #port: number | null = null;

  constructor(private readonly options: ServerWorkerRelayServerOptions) {}

  get port(): number {
    if (this.#port === null) throw new Error("Server Worker relay is not listening");
    return this.#port;
  }

  async listen(port = 0): Promise<number> {
    if (this.#server) return this.port;
    const server = createTlsServer(
      {
        ...this.options.tls,
        requestCert: true,
        rejectUnauthorized: true,
        minVersion: "TLSv1.3",
      },
      (socket) => this.#accept(socket),
    );
    server.on("tlsClientError", () => undefined);
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(port, "127.0.0.1", () => resolveListen());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Server Worker relay has no TCP address");
    }
    this.#server = server;
    this.#port = address.port;
    return this.#port;
  }

  #accept(socket: TLSSocket): void {
    const connection: RelayConnection = {
      socket,
      workerId: "",
      generation: 0,
      capabilities: [],
      buffer: "",
    };
    socket.setEncoding("utf8");
    socket.setNoDelay(true);
    socket.on("error", () => undefined);
    socket.on("data", (chunk) => {
      connection.buffer += String(chunk);
      if (Buffer.byteLength(connection.buffer) > maximumFrameBytes) {
        socket.destroy(new Error("Server Worker protocol line is too large"));
        return;
      }
      while (connection.buffer.includes("\n")) {
        const newline = connection.buffer.indexOf("\n");
        const line = connection.buffer.slice(0, newline);
        connection.buffer = connection.buffer.slice(newline + 1);
        if (line) void this.#handle(connection, line);
      }
    });
    socket.on("close", () => {
      for (const [workerId, active] of this.#connections) {
        if (active.socket === socket) {
          this.#connections.delete(workerId);
          void this.options.onDisconnect?.({ workerId, generation: active.generation });
        }
      }
    });
  }

  async #handle(connection: RelayConnection, line: string): Promise<void> {
    const parsed = parseServerWorkerFrame(line);
    if (parsed.isErr()) {
      connection.socket.destroy(new Error(parsed.error.message));
      return;
    }
    const frame = parsed.value;
    if (connection.generation === 0) {
      if (frame.type !== "hello") {
        connection.socket.destroy(new Error("Server Worker hello is required"));
        return;
      }
      let negotiated: { version: string; capabilities: ServerWorkerCapability[] };
      try {
        negotiated = negotiateServerWorkerHello(frame, {
          versions: [serverWorkerRelaySchema],
          requiredCapabilities: this.options.requiredCapabilities ?? [],
        });
      } catch (error) {
        connection.socket.destroy(new Error((error as DomainError).message));
        return;
      }
      const certificate = connection.socket.getPeerCertificate();
      if (
        !connection.socket.authorized ||
        !certificate.fingerprint256 ||
        !certificate.serialNumber
      ) {
        connection.socket.destroy(
          new Error(certificateError("Worker certificate is not authorized").message),
        );
        return;
      }
      const peer = {
        workerId: frame.workerId,
        generation: frame.generation,
        fingerprint256: certificate.fingerprint256,
        publicKeyFingerprint: createHash("sha256")
          .update(
            new X509Certificate(certificate.raw).publicKey.export({
              type: "spki",
              format: "der",
            }),
          )
          .digest("hex"),
        serialNumber: certificate.serialNumber,
        subject: certificate.subject as Record<string, string>,
        capabilities: frame.capabilities,
        platform: frame.platform ?? "unknown",
        version: frame.version ?? "unknown",
      };
      const authorized = await this.options.authorizePeer?.(peer);
      if (authorized?.isErr()) {
        connection.socket.destroy(new Error(authorized.error.message));
        return;
      }
      const leased = this.options.leaseRegistry.connect(
        frame.workerId,
        frame.generation,
        Date.now(),
      );
      if (leased.isErr()) {
        connection.socket.destroy(new Error(leased.error.message));
        return;
      }
      const previous = this.#connections.get(frame.workerId);
      previous?.socket.destroy(new Error("Worker generation was replaced"));
      connection.generation = frame.generation;
      connection.workerId = frame.workerId;
      connection.capabilities = frame.capabilities;
      this.#connections.set(frame.workerId, connection);
      const connected = await this.options.onConnect?.(peer);
      if (connected?.isErr()) {
        this.#connections.delete(frame.workerId);
        this.options.leaseRegistry.disconnect(frame.workerId, frame.generation);
        connection.socket.destroy(new Error(connected.error.message));
        return;
      }
      await writeFrame(connection.socket, {
        schema: serverWorkerRelaySchema,
        type: "response",
        workerId: frame.workerId,
        generation: frame.generation,
        messageId: `hello-${frame.messageId}`,
        payload: { version: negotiated.version, capabilities: negotiated.capabilities },
      });
      return;
    }

    if (frame.workerId !== connection.workerId || frame.generation !== connection.generation) {
      connection.socket.destroy(
        new Error("Worker frame binding does not match its authenticated connection"),
      );
      return;
    }
    const lease = this.options.leaseRegistry.admit(frame.workerId, frame.generation, Date.now());
    if (lease.isErr()) {
      connection.socket.destroy(new Error(lease.error.message));
      return;
    }
    if (frame.type === "heartbeat") {
      this.options.leaseRegistry.heartbeat(frame.workerId, frame.generation, Date.now());
      await this.options.onHeartbeat?.({ workerId: frame.workerId, generation: frame.generation });
      return;
    }
    if (frame.type === "response" && frame.requestId) {
      const pending = this.#pending.get(frame.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(frame.requestId);
      const payload = recordPayload(frame.payload);
      if (payload?.ok === true) {
        pending.resolve(ok(payload.value as ServerWorkerDispatchResult));
      } else {
        pending.resolve(
          err(requestFailure(String(payload?.message ?? "Worker request failed"), false)),
        );
      }
      return;
    }
    if (
      (frame.type === "stream-data" || frame.type === "stream-close" || frame.type === "cancel") &&
      frame.streamId
    ) {
      const stream = this.#streams.get(frame.streamId);
      if (!stream || stream.workerId !== frame.workerId || stream.generation !== frame.generation)
        return;
      if (frame.type === "stream-data") {
        const sequence = Number(frame.sequence);
        if (!Number.isInteger(sequence) || sequence !== stream.receivedSequence + 1) {
          connection.socket.destroy(new Error("Worker stream sequence is invalid"));
          return;
        }
        stream.receivedSequence = sequence;
        if (frame.data !== undefined) await stream.onData(Buffer.from(frame.data, "base64"));
        else await stream.onControl?.(frame.payload);
        return;
      }
      this.#streams.delete(frame.streamId);
      await stream.onClose?.();
    }
  }

  async openStream(input: {
    workerId: string;
    generation: number;
    streamId: string;
    capability: Extract<ServerWorkerCapability, "process.pty" | "network.forward">;
    payload: unknown;
    onData(data: Uint8Array): void | Promise<void>;
    onControl?(payload: unknown): void | Promise<void>;
    onClose?(): void | Promise<void>;
  }): Promise<Result<ServerWorkerRelayStream>> {
    if (!validIdentifier(input.streamId) || this.#streams.has(input.streamId)) {
      return err(requestFailure("Worker stream id is invalid or already active", false));
    }
    const connection = this.#connections.get(input.workerId);
    if (!connection || connection.generation !== input.generation) {
      return err(
        relayError(
          "server_worker_unavailable",
          "Worker connection is unavailable",
          "server-worker-lease",
          true,
        ),
      );
    }
    if (!connection.capabilities.includes(input.capability)) {
      return err(
        relayError(
          "server_worker_capability_denied",
          "Worker stream capability is unavailable",
          "server-worker-admission",
        ),
      );
    }
    const stream: RelayServerStream = {
      workerId: input.workerId,
      generation: input.generation,
      sequence: 0,
      receivedSequence: 0,
      onData: input.onData,
      ...(input.onControl ? { onControl: input.onControl } : {}),
      ...(input.onClose ? { onClose: input.onClose } : {}),
    };
    this.#streams.set(input.streamId, stream);
    try {
      await writeFrame(connection.socket, {
        schema: serverWorkerRelaySchema,
        type: "stream-open",
        workerId: input.workerId,
        generation: input.generation,
        messageId: `open-${input.streamId}`,
        streamId: input.streamId,
        capability: input.capability,
        payload: input.payload,
      });
    } catch (error) {
      this.#streams.delete(input.streamId);
      return err(requestFailure(error instanceof Error ? error.message : String(error)));
    }
    const sendFrame = async (
      data?: Uint8Array,
      payload?: unknown,
      type: "stream-data" | "stream-close" = "stream-data",
    ): Promise<Result<void>> => {
      const active = this.#streams.get(input.streamId);
      if (!active) return err(requestFailure("Worker stream is closed", false));
      active.sequence += 1;
      try {
        await writeFrame(connection.socket, {
          schema: serverWorkerRelaySchema,
          type,
          workerId: input.workerId,
          generation: input.generation,
          messageId: `${type}-${input.streamId}-${active.sequence}`,
          streamId: input.streamId,
          sequence: active.sequence,
          ...(data ? { data: Buffer.from(data).toString("base64") } : {}),
          ...(payload === undefined ? {} : { payload }),
        });
        if (type === "stream-close") {
          this.#streams.delete(input.streamId);
          await active.onClose?.();
        }
        return ok(undefined);
      } catch (error) {
        this.#streams.delete(input.streamId);
        return err(requestFailure(error instanceof Error ? error.message : String(error)));
      }
    };
    return ok({
      streamId: input.streamId,
      write: (data) => sendFrame(data),
      control: (payload) => sendFrame(undefined, payload),
      close: () => sendFrame(undefined, undefined, "stream-close"),
    });
  }

  async request(input: {
    workerId: string;
    generation: number;
    requestId: string;
    capability: ServerWorkerCapability;
    payload: unknown;
  }): Promise<Result<ServerWorkerDispatchResult>> {
    const connection = this.#connections.get(input.workerId);
    if (!connection || connection.generation !== input.generation) {
      return err(
        relayError(
          "server_worker_unavailable",
          "Worker connection is unavailable",
          "server-worker-lease",
          true,
        ),
      );
    }
    if (!connection.capabilities.includes(input.capability)) {
      return err(
        relayError(
          "server_worker_capability_denied",
          "Worker capability is unavailable",
          "server-worker-admission",
        ),
      );
    }
    if (this.#pending.has(input.requestId))
      return err(requestFailure("Worker request id is already pending", false));
    const response = new Promise<Result<ServerWorkerDispatchResult>>((resolveResponse) => {
      const timer = setTimeout(() => {
        this.#pending.delete(input.requestId);
        resolveResponse(err(requestFailure("Worker request timed out")));
      }, this.options.requestTimeoutMs ?? 30_000);
      this.#pending.set(input.requestId, { resolve: resolveResponse, timer });
    });
    try {
      await writeFrame(connection.socket, {
        schema: serverWorkerRelaySchema,
        type: "request",
        workerId: input.workerId,
        generation: input.generation,
        messageId: `request-${input.requestId}`,
        requestId: input.requestId,
        capability: input.capability,
        payload: input.payload,
      });
    } catch (error) {
      const pending = this.#pending.get(input.requestId);
      if (pending) clearTimeout(pending.timer);
      this.#pending.delete(input.requestId);
      return err(requestFailure(error instanceof Error ? error.message : String(error)));
    }
    return response;
  }

  revoke(workerId: string): void {
    this.options.leaseRegistry.revoke(workerId);
    this.disconnect(workerId, "Worker was revoked");
  }

  disconnect(workerId: string, reason = "Worker reconnect requested"): void {
    this.#connections.get(workerId)?.socket.destroy(new Error(reason));
    this.#connections.delete(workerId);
    for (const [streamId, stream] of this.#streams) {
      if (stream.workerId !== workerId) continue;
      this.#streams.delete(streamId);
      void stream.onClose?.();
    }
  }

  status(workerId: string): {
    workerId: string;
    connected: boolean;
    generation: number | null;
    capabilities: readonly ServerWorkerCapability[];
  } {
    const connection = this.#connections.get(workerId);
    return {
      workerId,
      connected: Boolean(connection),
      generation: connection?.generation ?? null,
      capabilities: connection?.capabilities ?? [],
    };
  }

  async close(): Promise<void> {
    for (const connection of this.#connections.values()) connection.socket.destroy();
    this.#connections.clear();
    for (const stream of this.#streams.values()) await stream.onClose?.();
    this.#streams.clear();
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(err(requestFailure("Worker relay closed")));
    }
    this.#pending.clear();
    if (!this.#server) return;
    await new Promise<void>((resolveClose) => this.#server?.close(() => resolveClose()));
    this.#server = null;
    this.#port = null;
  }
}

export interface ServerWorkerRelayClientOptions {
  relay: { host: string; port: number; serverName: string };
  tls: { key: string | Buffer; cert: string | Buffer; ca: string | Buffer | (string | Buffer)[] };
  workerId: string;
  generation: number;
  capabilities: readonly ServerWorkerCapability[];
  dispatcher: ServerWorkerDispatcher;
  streamHandlers?: Partial<
    Record<
      Extract<ServerWorkerCapability, "process.pty" | "network.forward">,
      ServerWorkerStreamHandler
    >
  >;
  heartbeatMs?: number;
  platform?: string;
  version?: string;
}

export class ServerWorkerRelayClient {
  #socket: TLSSocket | null = null;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #buffer = "";
  #helloResult: ((result: Result<void>) => void) | null = null;
  #resolveClosed: (() => void) | null = null;
  #closed: Promise<void> = Promise.resolve();
  readonly #streams = new Map<
    string,
    {
      session: ServerWorkerStreamSession;
      receivedSequence: number;
      sequence: number;
      ready: boolean;
      queued: Array<{ data?: Uint8Array; payload?: unknown }>;
    }
  >();
  constructor(private readonly options: ServerWorkerRelayClientOptions) {}

  async connect(): Promise<Result<void>> {
    this.#closed = new Promise<void>((resolveClosed) => {
      this.#resolveClosed = resolveClosed;
    });
    try {
      return await this.#connectInternal();
    } catch (error) {
      this.#socket?.destroy();
      this.#socket = null;
      return err(certificateError(error instanceof Error ? error.message : String(error)));
    }
  }

  async #connectInternal(): Promise<Result<void>> {
    if (this.#socket && !this.#socket.destroyed) return ok(undefined);
    const socket = connectTls({
      host: this.options.relay.host,
      port: this.options.relay.port,
      servername: this.options.relay.serverName,
      ...this.options.tls,
      rejectUnauthorized: true,
      minVersion: "TLSv1.3",
    });
    const connected = await new Promise<Result<void>>((resolveConnect) => {
      const onError = (error: Error) => resolveConnect(err(certificateError(error.message)));
      socket.once("error", onError);
      socket.once("secureConnect", () => {
        resolveConnect(
          socket.authorized
            ? ok(undefined)
            : err(
                certificateError(socket.authorizationError?.message ?? "TLS authorization failed"),
              ),
        );
      });
    });
    if (connected.isErr()) {
      socket.destroy();
      return connected;
    }
    this.#socket = socket;
    socket.setEncoding("utf8");
    socket.setNoDelay(true);
    const hello = new Promise<Result<void>>((resolveHello) => {
      this.#helloResult = resolveHello;
    });
    socket.on("error", (error: Error) => {
      this.#helloResult?.(err(certificateError(error.message)));
      this.#helloResult = null;
    });
    socket.on("close", () => {
      this.#helloResult?.(
        err(certificateError("Worker relay closed before hello acknowledgement")),
      );
      this.#helloResult = null;
      this.#resolveClosed?.();
      this.#resolveClosed = null;
    });
    socket.on("data", (chunk: Buffer | string) => {
      this.#buffer += String(chunk);
      if (Buffer.byteLength(this.#buffer) > maximumFrameBytes) {
        socket.destroy(new Error("Server Worker protocol line is too large"));
        return;
      }
      while (this.#buffer.includes("\n")) {
        const newline = this.#buffer.indexOf("\n");
        const line = this.#buffer.slice(0, newline);
        this.#buffer = this.#buffer.slice(newline + 1);
        if (line) void this.#handle(line);
      }
    });
    try {
      await writeFrame(socket, {
        schema: serverWorkerRelaySchema,
        type: "hello",
        workerId: this.options.workerId,
        generation: this.options.generation,
        messageId: `hello-${Date.now()}`,
        versions: [serverWorkerRelaySchema],
        capabilities: this.options.capabilities,
        platform: this.options.platform ?? `${process.platform}-${process.arch}`,
        version: this.options.version ?? "0.0.0",
      });
    } catch (error) {
      socket.destroy();
      this.#socket = null;
      return err(certificateError(error instanceof Error ? error.message : String(error)));
    }
    const helloAcknowledged = await Promise.race([
      hello,
      new Promise<Result<void>>((resolveTimeout) =>
        setTimeout(
          () => resolveTimeout(err(requestFailure("Worker hello acknowledgement timed out"))),
          5_000,
        ),
      ),
    ]);
    if (helloAcknowledged.isErr()) {
      socket.destroy();
      this.#socket = null;
      return helloAcknowledged;
    }
    this.#heartbeat = setInterval(() => {
      if (!this.#socket || this.#socket.destroyed) return;
      void writeFrame(this.#socket, {
        schema: serverWorkerRelaySchema,
        type: "heartbeat",
        workerId: this.options.workerId,
        generation: this.options.generation,
        messageId: `heartbeat-${Date.now()}`,
      });
    }, this.options.heartbeatMs ?? 5_000);
    return ok(undefined);
  }

  waitUntilClosed(): Promise<void> {
    return this.#closed;
  }

  async #handle(line: string): Promise<void> {
    const parsed = parseServerWorkerFrame(line);
    if (parsed.isErr()) return;
    if (
      parsed.value.type === "response" &&
      parsed.value.messageId.startsWith("hello-") &&
      !parsed.value.requestId
    ) {
      this.#helloResult?.(ok(undefined));
      this.#helloResult = null;
      return;
    }
    if (parsed.value.type === "stream-open" && parsed.value.streamId && parsed.value.capability) {
      const socket = this.#socket;
      if (!socket || socket.destroyed) return;
      const capability = parsed.value.capability;
      if (capability !== "process.pty" && capability !== "network.forward") return;
      const handler = this.options.streamHandlers?.[capability];
      if (!handler || this.#streams.has(parsed.value.streamId)) return;
      const streamId = parsed.value.streamId;
      const send = async (
        data?: Uint8Array,
        payload?: unknown,
        type: "stream-data" | "stream-close" = "stream-data",
      ) => {
        const active = this.#streams.get(streamId);
        if (!active || !this.#socket || this.#socket.destroyed) return;
        active.sequence += 1;
        await writeFrame(this.#socket, {
          schema: serverWorkerRelaySchema,
          type,
          workerId: this.options.workerId,
          generation: this.options.generation,
          messageId: `${type}-${streamId}-${active.sequence}`,
          streamId,
          sequence: active.sequence,
          ...(data ? { data: Buffer.from(data).toString("base64") } : {}),
          ...(payload === undefined ? {} : { payload }),
        });
        if (type === "stream-close") this.#streams.delete(streamId);
      };
      const pendingStream: {
        session: ServerWorkerStreamSession;
        receivedSequence: number;
        sequence: number;
        ready: boolean;
        queued: Array<{ data?: Uint8Array; payload?: unknown }>;
      } = {
        session: { write: (_data) => undefined, close: () => undefined },
        receivedSequence: 0,
        sequence: 0,
        ready: false,
        queued: [],
      };
      this.#streams.set(streamId, pendingStream);
      const opened = await handler({
        streamId,
        workerId: this.options.workerId,
        generation: this.options.generation,
        payload: parsed.value.payload,
        send: (data) => send(data),
        control: (payload) => send(undefined, payload),
        close: () => send(undefined, undefined, "stream-close"),
      });
      if (opened.isErr()) {
        this.#streams.delete(streamId);
        await writeFrame(socket, {
          schema: serverWorkerRelaySchema,
          type: "stream-close",
          workerId: this.options.workerId,
          generation: this.options.generation,
          messageId: `reject-${streamId}`,
          streamId,
          payload: { code: opened.error.code, message: opened.error.message },
        });
        return;
      }
      pendingStream.session = opened.value;
      pendingStream.ready = true;
      for (const queued of pendingStream.queued.splice(0)) {
        if (queued.data) await pendingStream.session.write(queued.data);
        else await pendingStream.session.control?.(queued.payload);
      }
      return;
    }
    if (
      (parsed.value.type === "stream-data" ||
        parsed.value.type === "stream-close" ||
        parsed.value.type === "cancel") &&
      parsed.value.streamId
    ) {
      const stream = this.#streams.get(parsed.value.streamId);
      if (!stream) return;
      if (parsed.value.type === "stream-data") {
        const sequence = Number(parsed.value.sequence);
        if (!Number.isInteger(sequence) || sequence !== stream.receivedSequence + 1) {
          this.#socket?.destroy(new Error("Server Worker stream sequence is invalid"));
          return;
        }
        stream.receivedSequence = sequence;
        const item =
          parsed.value.data !== undefined
            ? { data: Buffer.from(parsed.value.data, "base64") }
            : { payload: parsed.value.payload };
        if (!stream.ready) stream.queued.push(item);
        else if (item.data) await stream.session.write(item.data);
        else await stream.session.control?.(item.payload);
        return;
      }
      this.#streams.delete(parsed.value.streamId);
      await stream.session.close();
      return;
    }
    if (parsed.value.type !== "request" || !parsed.value.requestId || !parsed.value.capability)
      return;
    const request: ServerWorkerDispatchRequest = {
      requestId: parsed.value.requestId,
      capability: parsed.value.capability,
      payload: parsed.value.payload,
    };
    const result = await this.options.dispatcher.dispatch(request);
    if (!this.#socket || this.#socket.destroyed) return;
    await writeFrame(this.#socket, {
      schema: serverWorkerRelaySchema,
      type: "response",
      workerId: this.options.workerId,
      generation: this.options.generation,
      messageId: `response-${request.requestId}`,
      requestId: request.requestId,
      payload: result.match(
        (value) => ({ ok: true, value }),
        (error) => ({
          ok: false,
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        }),
      ),
    });
  }

  close(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    this.#socket?.end();
    this.#socket?.destroy();
    this.#socket = null;
    this.#resolveClosed?.();
    this.#resolveClosed = null;
    for (const stream of this.#streams.values()) void stream.session.close();
    this.#streams.clear();
  }
}

export function createServerWorkerRotationHandler(input: {
  credentialStore: ServerWorkerCredentialStore;
  identityDirectory: string;
}) {
  const pending = new Map<string, { directory: string; privateKeyPem: string }>();
  return async (
    request: ServerWorkerDispatchRequest,
  ): Promise<Result<ServerWorkerDispatchResult>> => {
    const payload = recordPayload(request.payload);
    if (!payload) return err(requestError("Worker rotation payload must be an object"));
    if (payload.operation === "prepare") {
      const rotationId = `rotation-${randomUUID()}`;
      const directory = join(input.identityDirectory, rotationId);
      const identity = await generateDeviceIdentity(directory);
      if (identity.isErr()) return err(identity.error);
      pending.set(rotationId, { directory, privateKeyPem: identity.value.privateKeyPem });
      return ok({
        requestId: request.requestId,
        data: Buffer.from(
          JSON.stringify({
            rotationId,
            certificateSigningRequestPem: identity.value.certificateSigningRequestPem,
            publicKeyFingerprint: identity.value.publicKeyFingerprint,
          }),
        ).toString("base64"),
      });
    }
    if (payload.operation === "install") {
      const rotationId = typeof payload.rotationId === "string" ? payload.rotationId : "";
      const prepared = pending.get(rotationId);
      const current = await input.credentialStore.read();
      if (!prepared || current.isErr() || !current.value) {
        return err(requestError("Worker rotation state is unavailable"));
      }
      const certificatePem =
        typeof payload.certificatePem === "string" ? payload.certificatePem : "";
      const caPem = typeof payload.caPem === "string" ? payload.caPem : "";
      const serialNumber = typeof payload.serialNumber === "string" ? payload.serialNumber : "";
      const expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : "";
      if (
        !certificatePem.includes("CERTIFICATE") ||
        !caPem.includes("CERTIFICATE") ||
        !serialNumber ||
        !expiresAt
      ) {
        return err(requestError("Worker rotated certificate payload is invalid"));
      }
      const stored = await input.credentialStore.write({
        ...current.value,
        privateKeyPem: prepared.privateKeyPem,
        certificatePem,
        caPem,
        serialNumber,
        expiresAt,
      });
      if (stored.isErr()) return err(stored.error);
      pending.delete(rotationId);
      await rm(prepared.directory, { recursive: true, force: true });
      return ok({
        requestId: request.requestId,
        data: Buffer.from(JSON.stringify({ installed: true })).toString("base64"),
      });
    }
    return err(requestError("Worker rotation operation is invalid"));
  };
}

export interface ServerWorkerCredential {
  schemaVersion: "server-worker-credential/v1";
  workerId: string;
  serverId: string;
  name: string;
  generation: number;
  relay: { host: string; port: number; serverName: string };
  capabilities: ServerWorkerCapability[];
  certificatePem: string;
  privateKeyPem: string;
  caPem: string;
  serialNumber: string;
  expiresAt: string;
}

export interface ServerWorkerCredentialStore {
  read(): Promise<Result<ServerWorkerCredential | null>>;
  write(credential: ServerWorkerCredential): Promise<Result<void>>;
  remove(): Promise<Result<void>>;
}

export class FileSystemServerWorkerCredentialStore implements ServerWorkerCredentialStore {
  constructor(readonly path: string) {}

  async read(): Promise<Result<ServerWorkerCredential | null>> {
    try {
      const credential = JSON.parse(await readFile(this.path, "utf8")) as ServerWorkerCredential;
      if (
        credential.schemaVersion !== "server-worker-credential/v1" ||
        !validIdentifier(credential.workerId) ||
        !validIdentifier(credential.serverId) ||
        !Number.isInteger(credential.generation) ||
        credential.generation < 0 ||
        !credential.privateKeyPem.includes("PRIVATE KEY") ||
        !credential.certificatePem.includes("CERTIFICATE") ||
        !credential.caPem.includes("CERTIFICATE")
      ) {
        return err(
          relayError(
            "server_worker_enrollment_invalid",
            "Stored Worker credential is invalid",
            "server-worker-enrollment",
          ),
        );
      }
      const metadata = await stat(this.path);
      if ((metadata.mode & 0o077) !== 0) {
        return err(
          relayError(
            "server_worker_enrollment_invalid",
            "Stored Worker credential permissions are not owner-only",
            "server-worker-enrollment",
          ),
        );
      }
      return ok(credential);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return ok(null);
      return err(
        relayError(
          "server_worker_enrollment_invalid",
          "Stored Worker credential could not be read",
          "server-worker-enrollment",
        ),
      );
    }
  }

  async write(credential: ServerWorkerCredential): Promise<Result<void>> {
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(credential, null, 2)}\n`, { mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, this.path);
      return ok(undefined);
    } catch {
      return err(
        relayError(
          "server_worker_enrollment_invalid",
          "Worker credential could not be stored",
          "server-worker-enrollment",
        ),
      );
    }
  }

  async remove(): Promise<Result<void>> {
    try {
      await rm(this.path, { force: true });
      return ok(undefined);
    } catch {
      return err(
        relayError(
          "server_worker_enrollment_invalid",
          "Worker credential could not be removed",
          "server-worker-enrollment",
        ),
      );
    }
  }
}

export interface ServerWorkerEnrollmentExchangeInput {
  serverId: string;
  name: string;
  token: string;
  certificateSigningRequestPem: string;
  publicKeyFingerprint: string;
}

export interface ServerWorkerEnrollmentExchangeResult {
  workerId: string;
  serverId: string;
  generation: number;
  relay: { host: string; port: number; serverName: string };
  capabilities: ServerWorkerCapability[];
  certificatePem: string;
  caPem: string;
  serialNumber: string;
  expiresAt: string;
}

export interface ServerWorkerEnrollmentIssueInput {
  serverId: string;
  name: string;
}

export interface ServerWorkerEnrollmentIssueResult {
  token: string;
  expiresAt: string;
}

export interface ServerWorkerSafeStatus {
  schemaVersion: "server-worker-status/v1";
  workerId: string;
  serverId: string;
  name: string;
  generation: number;
  connected: boolean;
  version: string;
  capabilities: ServerWorkerCapability[];
  serialNumber: string;
  expiresAt: string;
  platform: string;
}

export interface ServerWorkerEnrollmentPort {
  issue?(
    input: ServerWorkerEnrollmentIssueInput,
  ): Promise<Result<ServerWorkerEnrollmentIssueResult>>;
  exchange(
    input: ServerWorkerEnrollmentExchangeInput,
  ): Promise<Result<ServerWorkerEnrollmentExchangeResult>>;
  revoke?(input: { workerId: string; generation: number }): Promise<Result<void>>;
}

export class HttpServerWorkerEnrollmentPort implements ServerWorkerEnrollmentPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly managementAuthorization?: () => Promise<
      Result<{
        baseUrl?: string;
        headers: Readonly<Record<string, string>>;
      }>
    >,
  ) {}

  async issue(
    input: ServerWorkerEnrollmentIssueInput,
  ): Promise<Result<ServerWorkerEnrollmentIssueResult>> {
    try {
      const authorization = await this.managementAuthorization?.();
      if (!authorization || authorization.isErr()) {
        return authorization?.isErr()
          ? err(authorization.error)
          : err(
              relayError(
                "server_worker_enrollment_invalid",
                "Worker management requires an authenticated control-plane profile",
                "server-worker-enrollment",
              ),
            );
      }
      const response = await this.fetcher(
        new URL("/cloud/server-workers/enrollments", authorization.value.baseUrl ?? this.baseUrl),
        {
          method: "POST",
          headers: { ...authorization.value.headers, "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!response.ok) {
        return err(
          relayError(
            "server_worker_enrollment_invalid",
            `Worker enrollment issuance was rejected (${response.status})`,
            "server-worker-enrollment",
          ),
        );
      }
      const value = (await response.json()) as Partial<ServerWorkerEnrollmentIssueResult>;
      if (
        typeof value.token !== "string" ||
        value.token.length < 16 ||
        typeof value.expiresAt !== "string"
      ) {
        return err(
          relayError(
            "server_worker_enrollment_invalid",
            "Worker enrollment issuance response is invalid",
            "server-worker-enrollment",
          ),
        );
      }
      return ok({ token: value.token, expiresAt: value.expiresAt });
    } catch {
      return err(
        relayError(
          "server_worker_enrollment_invalid",
          "Worker enrollment issuance endpoint is unavailable",
          "server-worker-enrollment",
        ),
      );
    }
  }

  async exchange(
    input: ServerWorkerEnrollmentExchangeInput,
  ): Promise<Result<ServerWorkerEnrollmentExchangeResult>> {
    try {
      const response = await this.fetcher(new URL("/server-workers/enroll", this.baseUrl), {
        method: "POST",
        headers: {
          authorization: `Enrollment ${input.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          serverId: input.serverId,
          name: input.name,
          certificateSigningRequestPem: input.certificateSigningRequestPem,
          publicKeyFingerprint: input.publicKeyFingerprint,
        }),
      });
      if (!response.ok) {
        return err(
          relayError(
            "server_worker_enrollment_invalid",
            `Enrollment was rejected (${response.status})`,
            "server-worker-enrollment",
          ),
        );
      }
      return ok((await response.json()) as ServerWorkerEnrollmentExchangeResult);
    } catch {
      return err(
        relayError(
          "server_worker_enrollment_invalid",
          "Enrollment endpoint is unavailable",
          "server-worker-enrollment",
        ),
      );
    }
  }

  async revoke(input: { workerId: string; generation: number }): Promise<Result<void>> {
    try {
      const authorization = await this.managementAuthorization?.();
      if (!authorization || authorization.isErr()) {
        return authorization?.isErr()
          ? err(authorization.error)
          : err(
              relayError(
                "server_worker_enrollment_invalid",
                "Worker management requires an authenticated control-plane profile",
                "server-worker-revoke",
              ),
            );
      }
      const response = await this.fetcher(
        new URL(
          `/cloud/server-workers/${encodeURIComponent(input.workerId)}/revoke`,
          authorization.value.baseUrl ?? this.baseUrl,
        ),
        {
          method: "POST",
          headers: { ...authorization.value.headers, "content-type": "application/json" },
          body: JSON.stringify({ generation: input.generation }),
        },
      );
      return response.ok
        ? ok(undefined)
        : err(
            relayError(
              "server_worker_enrollment_invalid",
              `Worker revocation was rejected (${response.status})`,
              "server-worker-enrollment",
            ),
          );
    } catch {
      return err(
        relayError(
          "server_worker_enrollment_invalid",
          "Worker revocation endpoint is unavailable",
          "server-worker-enrollment",
        ),
      );
    }
  }
}

async function generateDeviceIdentity(directory: string): Promise<
  Result<{
    privateKeyPem: string;
    certificateSigningRequestPem: string;
    publicKeyFingerprint: string;
  }>
> {
  const privateKeyPath = resolve(directory, "worker.key");
  const requestPath = resolve(directory, "worker.csr");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const generated = Bun.spawn(
    [
      "openssl",
      "req",
      "-newkey",
      "rsa:3072",
      "-nodes",
      "-keyout",
      privateKeyPath,
      "-out",
      requestPath,
      "-subj",
      "/CN=Appaloft Server Worker",
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "pipe" },
  );
  const stderr = await new Response(generated.stderr).text();
  if ((await generated.exited) !== 0) {
    return err(
      relayError(
        "server_worker_enrollment_invalid",
        `Device key generation failed: ${stderr.slice(0, 512)}`,
        "server-worker-enrollment",
      ),
    );
  }
  await chmod(privateKeyPath, 0o600);
  const privateKeyPem = await readFile(privateKeyPath, "utf8");
  const certificateSigningRequestPem = await readFile(requestPath, "utf8");
  const publicKey = Bun.spawn(["openssl", "req", "-in", requestPath, "-pubkey", "-noout"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const publicKeyPem = await new Response(publicKey.stdout).text();
  if ((await publicKey.exited) !== 0) {
    return err(
      relayError(
        "server_worker_enrollment_invalid",
        "Device public key could not be derived",
        "server-worker-enrollment",
      ),
    );
  }
  return ok({
    privateKeyPem,
    certificateSigningRequestPem,
    publicKeyFingerprint: createHash("sha256")
      .update(createPublicKey(publicKeyPem).export({ type: "spki", format: "der" }))
      .digest("hex"),
  });
}

export class ServerWorkerDeviceRuntime {
  constructor(
    private readonly options: {
      credentialStore: ServerWorkerCredentialStore;
      enrollment: ServerWorkerEnrollmentPort;
      identityDirectory: string;
      version?: string;
      dispatcherFactory?: (credential: ServerWorkerCredential) => ServerWorkerDispatcher;
      streamHandlersFactory?: (
        credential: ServerWorkerCredential,
      ) => ServerWorkerRelayClientOptions["streamHandlers"];
    },
  ) {}

  async enroll(input: {
    serverId: string;
    name: string;
    token?: string;
  }): Promise<Result<ServerWorkerSafeStatus>> {
    if (
      !validIdentifier(input.serverId) ||
      !input.name.trim() ||
      input.name.length > 160 ||
      (input.token !== undefined && input.token.length < 16)
    ) {
      return err(
        relayError(
          "server_worker_enrollment_invalid",
          "Worker enrollment input is invalid",
          "server-worker-enrollment",
        ),
      );
    }
    let token = input.token;
    if (!token) {
      if (!this.options.enrollment.issue) {
        return err(
          relayError(
            "server_worker_enrollment_invalid",
            "Worker enrollment requires an authenticated profile or a one-time token from stdin",
            "server-worker-enrollment",
          ),
        );
      }
      const issued = await this.options.enrollment.issue({
        serverId: input.serverId,
        name: input.name.trim(),
      });
      if (issued.isErr()) return err(issued.error);
      token = issued.value.token;
    }
    const identity = await generateDeviceIdentity(this.options.identityDirectory);
    if (identity.isErr()) return err(identity.error);
    const exchanged = await this.options.enrollment.exchange({
      serverId: input.serverId,
      name: input.name.trim(),
      token,
      certificateSigningRequestPem: identity.value.certificateSigningRequestPem,
      publicKeyFingerprint: identity.value.publicKeyFingerprint,
    });
    if (exchanged.isErr()) return err(exchanged.error);
    const credential: ServerWorkerCredential = {
      schemaVersion: "server-worker-credential/v1",
      workerId: exchanged.value.workerId,
      serverId: exchanged.value.serverId,
      name: input.name.trim(),
      generation: exchanged.value.generation,
      relay: exchanged.value.relay,
      capabilities: exchanged.value.capabilities,
      certificatePem: exchanged.value.certificatePem,
      privateKeyPem: identity.value.privateKeyPem,
      caPem: exchanged.value.caPem,
      serialNumber: exchanged.value.serialNumber,
      expiresAt: exchanged.value.expiresAt,
    };
    const stored = await this.options.credentialStore.write(credential);
    if (stored.isErr()) return err(stored.error);
    await rm(this.options.identityDirectory, { recursive: true, force: true });
    return ok(this.safeStatus(credential, false));
  }

  safeStatus(credential: ServerWorkerCredential, connected: boolean): ServerWorkerSafeStatus {
    return {
      schemaVersion: "server-worker-status/v1" as const,
      workerId: credential.workerId,
      serverId: credential.serverId,
      name: credential.name,
      generation: credential.generation,
      connected,
      version: this.options.version ?? "0.0.0",
      capabilities: credential.capabilities,
      serialNumber: credential.serialNumber,
      expiresAt: credential.expiresAt,
      platform: `${process.platform}-${process.arch}`,
    };
  }

  async status(): Promise<Result<ServerWorkerSafeStatus | { state: "not-enrolled" }>> {
    const credential = await this.options.credentialStore.read();
    if (credential.isErr()) return err(credential.error);
    return ok(
      credential.value ? this.safeStatus(credential.value, false) : { state: "not-enrolled" },
    );
  }

  async run(input: { signal?: AbortSignal } = {}): Promise<Result<ServerWorkerSafeStatus>> {
    let lastCredential: ServerWorkerCredential | null = null;
    while (!input.signal?.aborted) {
      const credential = await this.options.credentialStore.read();
      if (credential.isErr()) return err(credential.error);
      if (!credential.value)
        return err(
          relayError(
            "server_worker_enrollment_invalid",
            "Worker is not enrolled",
            "server-worker-enrollment",
          ),
        );
      const connectedCredential: ServerWorkerCredential = {
        ...credential.value,
        generation: credential.value.generation + 1,
      };
      const persistedGeneration = await this.options.credentialStore.write(connectedCredential);
      if (persistedGeneration.isErr()) return err(persistedGeneration.error);
      lastCredential = connectedCredential;
      const streamHandlers = this.options.streamHandlersFactory?.(connectedCredential);
      const client = new ServerWorkerRelayClient({
        relay: connectedCredential.relay,
        tls: {
          key: connectedCredential.privateKeyPem,
          cert: connectedCredential.certificatePem,
          ca: connectedCredential.caPem,
        },
        workerId: connectedCredential.workerId,
        generation: connectedCredential.generation,
        capabilities: connectedCredential.capabilities,
        platform: `${process.platform}-${process.arch}`,
        version: this.options.version ?? "0.0.0",
        dispatcher:
          this.options.dispatcherFactory?.(connectedCredential) ??
          new ServerWorkerDispatcher({ roots: [process.cwd()], allowHostShell: false }),
        ...(streamHandlers ? { streamHandlers } : {}),
      });
      const connected = await client.connect();
      if (connected.isErr()) return err(connected.error);
      let abortListener: (() => void) | undefined;
      const aborted = new Promise<void>((resolveAbort) => {
        if (!input.signal) return;
        abortListener = () => resolveAbort();
        input.signal.addEventListener("abort", abortListener, { once: true });
      });
      await Promise.race([client.waitUntilClosed(), aborted]);
      if (abortListener) input.signal?.removeEventListener("abort", abortListener);
      client.close();
      if (!input.signal?.aborted) await Bun.sleep(250);
    }
    if (!lastCredential) {
      const credential = await this.options.credentialStore.read();
      if (credential.isErr()) return err(credential.error);
      if (!credential.value)
        return err(
          relayError(
            "server_worker_enrollment_invalid",
            "Worker is not enrolled",
            "server-worker-enrollment",
          ),
        );
      lastCredential = credential.value;
    }
    return ok(this.safeStatus(lastCredential, false));
  }

  async revoke(): Promise<Result<{ revoked: boolean; workerId?: string }>> {
    const credential = await this.options.credentialStore.read();
    if (credential.isErr()) return err(credential.error);
    if (!credential.value) return ok({ revoked: false });
    const revoked = await this.options.enrollment.revoke?.({
      workerId: credential.value.workerId,
      generation: credential.value.generation,
    });
    if (revoked?.isErr()) return err(revoked.error);
    const removed = await this.options.credentialStore.remove();
    if (removed.isErr()) return err(removed.error);
    return ok({ revoked: true, workerId: credential.value.workerId });
  }
}

export class ServerWorkerAtomicUpgrade {
  async apply(input: {
    currentExecutable: string;
    candidateExecutable: string;
    verifySignature(path: string): Promise<boolean>;
    health(path: string): Promise<boolean>;
  }): Promise<Result<{ upgraded: boolean; rolledBack: boolean }>> {
    const backup = `${input.currentExecutable}.previous`;
    if (!(await input.verifySignature(input.candidateExecutable))) {
      return err({
        code: "server_worker_upgrade_failed",
        category: "user",
        message: "Worker upgrade signature was rejected",
        retryable: false,
        details: { phase: "server-worker-upgrade" },
      });
    }
    try {
      await rename(input.currentExecutable, backup);
      await rename(input.candidateExecutable, input.currentExecutable);
      if (await input.health(input.currentExecutable)) {
        await rm(backup, { force: true });
        return ok({ upgraded: true, rolledBack: false });
      }
      await rm(input.currentExecutable, { force: true });
      await rename(backup, input.currentExecutable);
      return ok({ upgraded: false, rolledBack: true });
    } catch {
      try {
        await rm(input.currentExecutable, { force: true });
        await rename(backup, input.currentExecutable);
      } catch {
        // The structured error remains fail closed when rollback itself cannot complete.
      }
      return err({
        code: "server_worker_upgrade_failed",
        category: "infra",
        message: "Worker upgrade failed",
        retryable: true,
        details: { phase: "server-worker-upgrade" },
      });
    }
  }
}

export async function verifyServerWorkerReleaseSignature(input: {
  candidateExecutable: string;
  signatureFile: string;
  publicKeyPem: string;
}): Promise<boolean> {
  try {
    const [candidate, signature] = await Promise.all([
      readFile(input.candidateExecutable),
      readFile(input.signatureFile),
    ]);
    return verify(null, candidate, input.publicKeyPem, signature);
  } catch {
    return false;
  }
}

export interface BoundedServerWorkerSourceArchive {
  schemaVersion: "server-worker-source/v1";
  sourceName: string;
  digest: string;
  totalBytes: number;
  files: Array<{ path: string; data: string; digest: string; executable: boolean }>;
}

function ignorePattern(pattern: string): RegExp {
  const normalized = pattern.replace(/^\//u, "").replace(/\/$/u, "");
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
    .replaceAll("**", "__DOUBLE_STAR__")
    .replaceAll("*", "[^/]*")
    .replaceAll("__DOUBLE_STAR__", ".*");
  return pattern.endsWith("/")
    ? new RegExp(`(?:^|/)${escaped}(?:/|$)`, "u")
    : normalized.includes("/")
      ? new RegExp(`^${escaped}$`, "u")
      : new RegExp(`(?:^|/)${escaped}$`, "u");
}

export async function createBoundedServerWorkerSourceArchive(
  sourceRoot: string,
  options: { maximumFiles?: number; maximumBytes?: number; maximumFileBytes?: number } = {},
): Promise<Result<BoundedServerWorkerSourceArchive>> {
  const root = resolve(sourceRoot);
  const maximumFiles = options.maximumFiles ?? 4_096;
  const maximumBytes = options.maximumBytes ?? 16 * 1024 * 1024;
  const maximumFileBytes = options.maximumFileBytes ?? 4 * 1024 * 1024;
  let gitignore = "";
  try {
    gitignore = await readFile(resolve(root, ".gitignore"), "utf8");
  } catch {
    // A repository does not need a .gitignore.
  }
  const ignored = [
    /(?:^|\/)\.git(?:\/|$)/u,
    /(?:^|\/)node_modules(?:\/|$)/u,
    /(?:^|\/)\.appaloft(?:\/|$)/u,
    ...gitignore
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
      .map(ignorePattern),
  ];
  const files: BoundedServerWorkerSourceArchive["files"] = [];
  let totalBytes = 0;
  const visit = async (directory: string): Promise<Result<void>> => {
    const entries = (await readdir(directory)).sort();
    for (const name of entries) {
      const absolute = resolve(directory, name);
      const relativePath = relative(root, absolute).replaceAll("\\", "/");
      if (
        !relativePath ||
        relativePath.startsWith("../") ||
        ignored.some((pattern) => pattern.test(relativePath))
      )
        continue;
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) continue;
      if (metadata.isDirectory()) {
        const nested = await visit(absolute);
        if (nested.isErr()) return nested;
        continue;
      }
      if (!metadata.isFile()) continue;
      if (
        metadata.size > maximumFileBytes ||
        files.length >= maximumFiles ||
        totalBytes + metadata.size > maximumBytes
      ) {
        return err(requestError("Worker source archive exceeds its bounded file or byte limit"));
      }
      const data = await readFile(absolute);
      totalBytes += data.byteLength;
      files.push({
        path: relativePath,
        data: data.toString("base64"),
        digest: createHash("sha256").update(data).digest("hex"),
        executable: (metadata.mode & 0o100) !== 0,
      });
    }
    return ok(undefined);
  };
  try {
    const visited = await visit(root);
    if (visited.isErr()) return err(visited.error);
    const digest = createHash("sha256")
      .update(files.map((file) => `${file.path}\0${file.digest}`).join("\n"))
      .digest("hex");
    return ok({
      schemaVersion: "server-worker-source/v1",
      sourceName: root.split(/[\\/]/u).at(-1) ?? "source",
      digest,
      totalBytes,
      files,
    });
  } catch {
    return err(requestError("Worker source archive could not be created"));
  }
}

export async function materializeBoundedServerWorkerSourceArchive(
  archive: BoundedServerWorkerSourceArchive,
  targetRoot: string,
): Promise<Result<{ root: string; digest: string; files: number; totalBytes: number }>> {
  if (
    archive.schemaVersion !== "server-worker-source/v1" ||
    archive.files.length > 4_096 ||
    archive.totalBytes > 16 * 1024 * 1024
  ) {
    return err(requestError("Worker source archive envelope is invalid"));
  }
  const root = resolve(targetRoot);
  let totalBytes = 0;
  const identities: string[] = [];
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    for (const file of archive.files) {
      if (!file.path || isAbsolute(file.path))
        return err(requestError("Worker source archive path is invalid"));
      const path = resolve(root, file.path);
      const child = relative(root, path);
      if (child.startsWith("..") || isAbsolute(child))
        return err(requestError("Worker source archive path escapes its root"));
      const data = Buffer.from(file.data, "base64");
      const digest = createHash("sha256").update(data).digest("hex");
      if (digest !== file.digest || data.byteLength > 4 * 1024 * 1024)
        return err(requestError("Worker source archive file digest is invalid"));
      totalBytes += data.byteLength;
      if (totalBytes > 16 * 1024 * 1024)
        return err(requestError("Worker source archive exceeds its byte limit"));
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, data, { mode: file.executable ? 0o700 : 0o600 });
      identities.push(`${file.path}\0${digest}`);
    }
    const digest = createHash("sha256").update(identities.join("\n")).digest("hex");
    if (digest !== archive.digest || totalBytes !== archive.totalBytes)
      return err(requestError("Worker source archive aggregate digest is invalid"));
    return ok({ root, digest, files: archive.files.length, totalBytes });
  } catch {
    return err(requestError("Worker source archive could not be materialized"));
  }
}

function streamPayload(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

export function createServerWorkerNetworkForwardHandler(options: {
  authorizeTarget(input: { host: string; port: number }): boolean | Promise<boolean>;
  maximumBufferedBytes?: number;
}): ServerWorkerStreamHandler {
  return async (input) => {
    const payload = streamPayload(input.payload);
    const host = typeof payload?.host === "string" ? payload.host : "";
    const port = Number(payload?.port);
    if (!host || host.length > 253 || !Number.isInteger(port) || port < 1 || port > 65_535) {
      return err(requestError("Worker forward target is invalid"));
    }
    if (!(await options.authorizeTarget({ host, port }))) {
      return err(requestError("Worker forward target is outside the local policy"));
    }
    const socket: Socket = connectTcp({ host, port });
    socket.on("data", (data) => {
      if (socket.readableLength > (options.maximumBufferedBytes ?? 1_048_576)) {
        socket.destroy(new Error("Worker forward buffer exceeded its limit"));
        return;
      }
      void input.send(data);
    });
    socket.on("close", () => void input.close());
    const connected = await new Promise<Result<void>>((resolveConnected) => {
      socket.once("connect", () => resolveConnected(ok(undefined)));
      socket.once("error", (error) =>
        resolveConnected(err(requestError(`Worker forward failed: ${error.message}`))),
      );
    });
    if (connected.isErr()) {
      socket.destroy();
      return err(connected.error);
    }
    return ok({
      write(data) {
        socket.write(data);
      },
      close() {
        socket.end();
        socket.destroy();
      },
    });
  };
}

export function createServerWorkerPtyHandler(options: {
  roots: readonly string[];
  allowHostShell: boolean;
}): ServerWorkerStreamHandler {
  const roots = options.roots.map((root) => resolve(root));
  return async (input) => {
    const payload = streamPayload(input.payload);
    const argv = payload?.argv;
    const cwd = typeof payload?.cwd === "string" ? resolve(payload.cwd) : "";
    const rows = Number(payload?.rows);
    const cols = Number(payload?.cols);
    const owned = roots.some((root) => {
      const child = relative(root, cwd);
      return child === "" || (!child.startsWith("..") && !isAbsolute(child));
    });
    if (
      !Array.isArray(argv) ||
      argv.length < 1 ||
      argv.length > 128 ||
      !argv.every(
        (value) => typeof value === "string" && value.length > 0 && value.length <= 8_192,
      ) ||
      !owned ||
      !Number.isInteger(rows) ||
      rows < 1 ||
      rows > 1_000 ||
      !Number.isInteger(cols) ||
      cols < 1 ||
      cols > 1_000 ||
      (!options.allowHostShell && argv[0] !== "docker")
    ) {
      return err(requestError("Worker PTY request is outside the local policy"));
    }
    let closed = false;
    const child = Bun.spawn(argv as string[], {
      cwd,
      env: { ...Bun.env, TERM: "xterm-256color" },
      terminal: {
        rows,
        cols,
        data(_terminal, data) {
          if (!closed) void input.send(new Uint8Array(data));
        },
        exit() {
          if (!closed) {
            closed = true;
            void input.close();
          }
        },
      },
    });
    if (!child.terminal) {
      child.kill();
      return err(requestError("Worker PTY could not be created"));
    }
    const terminal = child.terminal;
    return ok({
      write(data) {
        terminal.write(data);
      },
      control(control) {
        const value = streamPayload(control);
        const nextRows = Number(value?.rows);
        const nextCols = Number(value?.cols);
        if (
          value?.kind === "resize" &&
          Number.isInteger(nextRows) &&
          Number.isInteger(nextCols) &&
          nextRows > 0 &&
          nextRows <= 1_000 &&
          nextCols > 0 &&
          nextCols <= 1_000
        ) {
          terminal.resize(nextCols, nextRows);
        }
      },
      close() {
        if (closed) return;
        closed = true;
        terminal.close();
        child.kill();
      },
    });
  };
}
