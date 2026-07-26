import { describe, expect, test } from "bun:test";
import {
  createRemoteTerminalSessionAttachmentGateway,
  type RemoteTerminalWebSocketFactory,
} from "../src";

type ListenerMap = {
  open: Array<() => void>;
  message: Array<(event: { data: unknown }) => void>;
  error: Array<() => void>;
  close: Array<(event: { code: number; reason: string }) => void>;
};

class FakeRemoteTerminalWebSocket {
  readyState = 0;
  readonly sent: string[] = [];
  readonly closes: Array<{ code?: number; reason?: string }> = [];
  private readonly listeners: ListenerMap = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(
    type: keyof ListenerMap,
    listener:
      | (() => void)
      | ((event: { data: unknown }) => void)
      | ((event: { code: number; reason: string }) => void),
  ): void {
    (this.listeners[type] as Array<typeof listener>).push(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closes.push({
      ...(code === undefined ? {} : { code }),
      ...(reason === undefined ? {} : { reason }),
    });
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    for (const listener of this.listeners.open) listener();
  }

  message(frame: unknown): void {
    for (const listener of this.listeners.message) {
      listener({ data: JSON.stringify(frame) });
    }
  }

  socketClose(code = 1000, reason = ""): void {
    this.readyState = 3;
    for (const listener of this.listeners.close) listener({ code, reason });
  }
}

describe("remote terminal session attachment gateway", () => {
  test("[CONTROL-PLANE-CLI-022][TERM-SESSION-ENTRY-011] bridges terminal frames over the remote WebSocket without local composition", async () => {
    let socketUrl = "";
    const socket = new FakeRemoteTerminalWebSocket();
    const gateway = createRemoteTerminalSessionAttachmentGateway({
      baseUrl: "https://app.example.com/control-plane",
      webSocketFactory: ((url: string) => {
        socketUrl = url;
        return socket;
      }) as RemoteTerminalWebSocketFactory,
    });

    const attached = gateway.attach("term_remote", "cap_writer");
    expect(attached.isOk()).toBe(true);
    const session = attached._unsafeUnwrap();
    const frames = session[Symbol.asyncIterator]();

    await session.resize({ rows: 40, cols: 120 });
    socket.open();
    await session.write("pwd\n");
    socket.message({ kind: "ready", sessionId: "term_remote", workingDirectory: "/srv/app" });
    socket.message({ kind: "output", stream: "stdout", data: "/srv/app\n" });
    socket.message({ kind: "closed", reason: "source-ended", exitCode: 0 });

    expect(socketUrl).toBe(
      "wss://app.example.com/api/terminal-sessions/term_remote/attach?access_token=cap_writer",
    );
    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      { kind: "resize", rows: 40, cols: 120 },
      { kind: "input", data: "pwd\n" },
    ]);
    expect(await frames.next()).toEqual({
      value: {
        kind: "ready",
        sessionId: "term_remote",
        workingDirectory: "/srv/app",
      },
      done: false,
    });
    expect(await frames.next()).toEqual({
      value: { kind: "output", stream: "stdout", data: "/srv/app\n" },
      done: false,
    });
    expect(await frames.next()).toEqual({
      value: { kind: "closed", reason: "source-ended", exitCode: 0 },
      done: false,
    });
    expect(await frames.next()).toEqual({ value: undefined, done: true });
  });

  test("[CONTROL-PLANE-CLI-022] reports an unexpected WebSocket close as a structured terminal frame", async () => {
    const socket = new FakeRemoteTerminalWebSocket();
    const gateway = createRemoteTerminalSessionAttachmentGateway({
      baseUrl: "http://127.0.0.1:4310",
      webSocketFactory: (() => socket) as RemoteTerminalWebSocketFactory,
    });
    const session = gateway.attach("term_remote")._unsafeUnwrap();
    const frames = session[Symbol.asyncIterator]();

    socket.socketClose(1011, "upstream unavailable");

    expect(await frames.next()).toMatchObject({
      value: {
        kind: "error",
        error: {
          code: "remote_terminal_transport_closed",
          category: "infra",
          details: {
            closeCode: 1011,
            closeReason: "upstream unavailable",
          },
        },
      },
      done: false,
    });
    expect(await frames.next()).toEqual({ value: undefined, done: true });
  });
});
