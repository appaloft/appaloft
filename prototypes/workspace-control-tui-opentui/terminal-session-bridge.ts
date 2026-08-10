import { type TerminalSession } from "../../packages/application/src/ports.ts";

export interface TerminalViewport {
  write(data: string | Uint8Array): void;
  onData?: (data: Uint8Array) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function bindTerminalSession(session: TerminalSession, viewport: TerminalViewport) {
  const decoder = new TextDecoder();
  viewport.onData = (data) => void session.write(decoder.decode(data));
  viewport.onResize = (cols, rows) => void session.resize({ cols, rows });

  let readySettled = false;
  let resolveReady!: (value: { sessionId: string; workingDirectory?: string }) => void;
  let rejectReady!: (reason: unknown) => void;
  const ready = new Promise<{ sessionId: string; workingDirectory?: string }>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const completed = (async () => {
    for await (const frame of session) {
      if (frame.kind === "ready") {
        readySettled = true;
        resolveReady({
          sessionId: frame.sessionId,
          ...(frame.workingDirectory ? { workingDirectory: frame.workingDirectory } : {}),
        });
      }
      if (frame.kind === "output") viewport.write(frame.data);
      if (frame.kind === "closed") return frame;
      if (frame.kind === "error") {
        if (!readySettled) {
          readySettled = true;
          rejectReady(frame.error);
        }
        throw frame.error;
      }
    }
    return undefined;
  })();

  return {
    ready,
    completed,
    detach: () => session.detach(),
    close: () => session.close(),
  };
}
