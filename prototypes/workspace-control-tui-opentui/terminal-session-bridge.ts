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

  const completed = (async () => {
    for await (const frame of session) {
      if (frame.type === "output") viewport.write(frame.data);
      if (frame.type === "closed") return frame;
      if (frame.type === "error") throw frame.error;
    }
    return undefined;
  })();

  return {
    completed,
    detach: () => session.detach(),
    close: () => session.close(),
  };
}
