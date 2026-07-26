import {
  type TerminalSession,
  type TerminalSessionAttachmentGateway,
  type TerminalSessionFrame,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";

interface RemoteTerminalWebSocket {
  readonly readyState: number;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RemoteTerminalWebSocketFactory = (url: string) => RemoteTerminalWebSocket;

interface RemoteTerminalSessionGatewayInput {
  readonly baseUrl: string;
  readonly webSocketFactory?: RemoteTerminalWebSocketFactory;
}

const connectingState = 0;
const openState = 1;

function remoteTerminalError(
  code: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category: "infra",
    message,
    retryable: true,
    details: {
      phase: "remote-terminal-attach",
      ...(details ?? {}),
    },
  };
}

function terminalSocketUrl(baseUrl: string, sessionId: string, accessToken?: string): string {
  const url = new URL(`/api/terminal-sessions/${encodeURIComponent(sessionId)}/attach`, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (accessToken) {
    url.searchParams.set("access_token", accessToken);
  }
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseDomainErrorDetails(value: unknown): DomainError["details"] {
  const record = asRecord(value);
  if (!record) return undefined;
  const details: NonNullable<DomainError["details"]> = {};
  for (const [key, detail] of Object.entries(record)) {
    if (
      typeof detail === "string" ||
      typeof detail === "number" ||
      typeof detail === "boolean" ||
      detail === null ||
      (Array.isArray(detail) && detail.every((item) => typeof item === "string"))
    ) {
      details[key] = detail;
    }
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

function parseDomainError(value: unknown): DomainError | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.code !== "string" ||
    typeof record.category !== "string" ||
    typeof record.message !== "string" ||
    typeof record.retryable !== "boolean"
  ) {
    return null;
  }

  if (
    record.category !== "user" &&
    record.category !== "infra" &&
    record.category !== "provider" &&
    record.category !== "retryable" &&
    record.category !== "timeout"
  ) {
    return null;
  }

  const details = parseDomainErrorDetails(record.details);
  return {
    code: record.code,
    category: record.category,
    message: record.message,
    retryable: record.retryable,
    ...(details ? { details } : {}),
  };
}

function parseTerminalFrame(value: unknown): TerminalSessionFrame | null {
  const record = asRecord(value);
  if (!record || typeof record.kind !== "string") {
    return null;
  }

  if (record.kind === "ready" && typeof record.sessionId === "string") {
    return {
      kind: "ready",
      sessionId: record.sessionId,
      ...(typeof record.workingDirectory === "string"
        ? { workingDirectory: record.workingDirectory }
        : {}),
    };
  }

  if (
    record.kind === "output" &&
    (record.stream === "stdout" || record.stream === "stderr") &&
    typeof record.data === "string"
  ) {
    return {
      kind: "output",
      stream: record.stream,
      data: record.data,
    };
  }

  if (
    record.kind === "closed" &&
    (record.reason === "completed" ||
      record.reason === "cancelled" ||
      record.reason === "source-ended")
  ) {
    return {
      kind: "closed",
      reason: record.reason,
      ...(typeof record.exitCode === "number" ? { exitCode: record.exitCode } : {}),
    };
  }

  if (record.kind === "error") {
    const error = parseDomainError(record.error);
    return error ? { kind: "error", error } : null;
  }

  return null;
}

async function messageText(data: unknown): Promise<string | null> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data.text();
  }
  return null;
}

class RemoteTerminalFrameQueue implements AsyncIterable<TerminalSessionFrame> {
  private readonly frames: TerminalSessionFrame[] = [];
  private readonly waiters: Array<(result: IteratorResult<TerminalSessionFrame>) => void> = [];
  private ended = false;

  push(frame: TerminalSessionFrame): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: frame, done: false });
    } else {
      this.frames.push(frame);
    }
  }

  close(): void {
    if (this.ended) return;
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
    return {
      next: () => {
        const frame = this.frames.shift();
        if (frame) {
          return Promise.resolve({ value: frame, done: false });
        }
        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise<IteratorResult<TerminalSessionFrame>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}

class RemoteWebSocketTerminalSession implements TerminalSession {
  private readonly frames = new RemoteTerminalFrameQueue();
  private readonly pendingMessages: string[] = [];
  private terminalFrameReceived = false;
  private detached = false;

  constructor(private readonly socket: RemoteTerminalWebSocket) {
    socket.addEventListener("open", () => {
      for (const message of this.pendingMessages.splice(0)) {
        socket.send(message);
      }
    });
    socket.addEventListener("message", (event) => {
      void this.receive(event.data);
    });
    socket.addEventListener("error", () => {
      if (this.terminalFrameReceived || this.detached) return;
      this.finishWithError(
        remoteTerminalError("remote_terminal_transport_failed", "Remote terminal WebSocket failed"),
      );
    });
    socket.addEventListener("close", (event) => {
      if (!this.terminalFrameReceived && !this.detached) {
        this.finishWithError(
          remoteTerminalError(
            "remote_terminal_transport_closed",
            "Remote terminal WebSocket closed before a terminal result",
            {
              closeCode: event.code,
              ...(event.reason ? { closeReason: event.reason } : {}),
            },
          ),
        );
        return;
      }
      this.frames.close();
    });
  }

  async write(data: string): Promise<void> {
    this.send({ kind: "input", data });
  }

  async resize(input: { rows: number; cols: number }): Promise<void> {
    this.send({ kind: "resize", rows: input.rows, cols: input.cols });
  }

  async detach(): Promise<void> {
    if (this.detached) return;
    this.detached = true;
    this.socket.close(1000, "detach");
    this.frames.close();
  }

  async close(): Promise<void> {
    this.send({ kind: "close" });
  }

  [Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
    return this.frames[Symbol.asyncIterator]();
  }

  private send(message: Record<string, unknown>): void {
    const encoded = JSON.stringify(message);
    if (this.socket.readyState === openState) {
      this.socket.send(encoded);
      return;
    }
    if (this.socket.readyState === connectingState) {
      this.pendingMessages.push(encoded);
      return;
    }
    throw new Error("Remote terminal WebSocket is not open");
  }

  private async receive(data: unknown): Promise<void> {
    const text = await messageText(data);
    let parsed: unknown;
    try {
      parsed = text === null ? null : JSON.parse(text);
    } catch {
      parsed = null;
    }
    const frame = parseTerminalFrame(parsed);
    if (!frame) {
      this.finishWithError(
        remoteTerminalError(
          "remote_terminal_protocol_invalid",
          "Remote terminal returned an invalid frame",
        ),
      );
      return;
    }

    this.frames.push(frame);
    if (frame.kind === "closed" || frame.kind === "error") {
      this.terminalFrameReceived = true;
      this.frames.close();
    }
  }

  private finishWithError(error: DomainError): void {
    if (this.terminalFrameReceived) return;
    this.terminalFrameReceived = true;
    this.frames.push({ kind: "error", error });
    this.frames.close();
  }
}

export function createRemoteTerminalSessionAttachmentGateway(
  input: RemoteTerminalSessionGatewayInput,
): TerminalSessionAttachmentGateway {
  const webSocketFactory =
    input.webSocketFactory ??
    ((url: string) => new WebSocket(url) as unknown as RemoteTerminalWebSocket);

  return {
    attach(sessionId, accessToken): Result<TerminalSession> {
      try {
        return ok(
          new RemoteWebSocketTerminalSession(
            webSocketFactory(terminalSocketUrl(input.baseUrl, sessionId, accessToken)),
          ),
        );
      } catch (error) {
        return err(
          remoteTerminalError(
            "remote_terminal_transport_unavailable",
            "Remote terminal WebSocket could not be created",
            {
              message: error instanceof Error ? error.message : String(error),
            },
          ),
        );
      }
    },
  };
}
