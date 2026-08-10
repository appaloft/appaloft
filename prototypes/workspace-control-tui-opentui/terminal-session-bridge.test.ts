import { expect, test } from "bun:test";
import {
  type TerminalSession,
  type TerminalSessionFrame,
} from "../../packages/application/src/ports.ts";
import { bindTerminalSession, type TerminalViewport } from "./terminal-session-bridge.ts";

test("maps TerminalSession bytes and lifecycle without Agent semantics", async () => {
  const writes: string[] = [];
  const sizes: Array<{ cols: number; rows: number }> = [];
  const rendered: Array<string | Uint8Array> = [];
  let detached = 0;
  let closed = 0;

  const frames: TerminalSessionFrame[] = [
    { type: "ready" },
    { type: "output", stream: "stdout", data: "\x1b[?1049hagent native screen" },
    { type: "closed", exitCode: 0, reason: "fixture complete" },
  ];
  const session: TerminalSession = {
    async *[Symbol.asyncIterator]() {
      yield* frames;
    },
    async write(data) {
      writes.push(data);
    },
    async resize(size) {
      sizes.push(size);
    },
    async detach() {
      detached += 1;
    },
    async close() {
      closed += 1;
    },
  };
  const viewport: TerminalViewport = { write: (data) => rendered.push(data) };

  const binding = bindTerminalSession(session, viewport);
  viewport.onData?.(new TextEncoder().encode("native input"));
  viewport.onResize?.(120, 40);
  const result = await binding.completed;
  await binding.detach();
  await binding.close();

  expect(rendered).toEqual(["\x1b[?1049hagent native screen"]);
  expect(writes).toEqual(["native input"]);
  expect(sizes).toEqual([{ cols: 120, rows: 40 }]);
  expect(result).toEqual({ type: "closed", exitCode: 0, reason: "fixture complete" });
  expect(detached).toBe(1);
  expect(closed).toBe(1);
});
