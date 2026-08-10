import { expect, test } from "bun:test";
import {
  type TerminalSession,
  type TerminalSessionFrame,
} from "../../packages/application/src/ports.ts";
import { bindTerminalSession, type TerminalViewport } from "./terminal-session-bridge.ts";

function sessionFixture(input: {
  frames: TerminalSessionFrame[];
  writes: string[];
  sizes: Array<{ cols: number; rows: number }>;
  detach: () => void;
}): TerminalSession {
  return {
    async *[Symbol.asyncIterator]() {
      yield* input.frames;
    },
    async write(data) {
      input.writes.push(data);
    },
    async resize(size) {
      input.sizes.push(size);
    },
    async detach() {
      input.detach();
    },
    async close() {},
  };
}

test("[WS-TUI-SPIKE-005][WS-TUI-SPIKE-008] rebinds one viewport to the same managed Terminal Session after transport loss", async () => {
  const rendered: Array<string | Uint8Array> = [];
  const viewport: TerminalViewport = { write: (data) => rendered.push(data) };
  const firstWrites: string[] = [];
  const secondWrites: string[] = [];
  const firstSizes: Array<{ cols: number; rows: number }> = [];
  const secondSizes: Array<{ cols: number; rows: number }> = [];
  let firstDetached = 0;
  let secondDetached = 0;

  const first = bindTerminalSession(
    sessionFixture({
      frames: [
        { kind: "ready", sessionId: "term_managed" },
        { kind: "output", stream: "stdout", data: "before-disconnect" },
        {
          kind: "error",
          error: {
            code: "remote_terminal_transport_closed",
            category: "infra",
            message: "transport lost",
            retryable: true,
          },
        },
      ],
      writes: firstWrites,
      sizes: firstSizes,
      detach: () => {
        firstDetached += 1;
      },
    }),
    viewport,
  );

  expect(await first.ready).toEqual({ sessionId: "term_managed" });
  await expect(first.completed).rejects.toMatchObject({
    code: "remote_terminal_transport_closed",
    retryable: true,
  });
  await first.detach();

  const second = bindTerminalSession(
    sessionFixture({
      frames: [
        { kind: "ready", sessionId: "term_managed" },
        {
          kind: "output",
          stream: "stdout",
          data: "\x1b[2Jbounded-replay-and-live-tail",
        },
        { kind: "closed", reason: "completed", exitCode: 0 },
      ],
      writes: secondWrites,
      sizes: secondSizes,
      detach: () => {
        secondDetached += 1;
      },
    }),
    viewport,
  );

  expect(await second.ready).toEqual({ sessionId: "term_managed" });
  viewport.onData?.(new TextEncoder().encode("continue"));
  viewport.onResize?.(100, 30);
  expect(await second.completed).toEqual({
    kind: "closed",
    reason: "completed",
    exitCode: 0,
  });

  expect(rendered).toEqual(["before-disconnect", "\x1b[2Jbounded-replay-and-live-tail"]);
  expect(firstWrites).toEqual([]);
  expect(secondWrites).toEqual(["continue"]);
  expect(firstSizes).toEqual([]);
  expect(secondSizes).toEqual([{ cols: 100, rows: 30 }]);
  expect(firstDetached).toBe(1);
  expect(secondDetached).toBe(0);
});
