import { expect, test } from "bun:test";
import { openBunNativeWorkspaceTerminal } from "../src/workspace-control-native-terminal";

test("[WS-TUI-EMBED-004][WS-TUI-TERMINAL-012] Bun parent owns the only native client PTY and forwards exact bytes", async () => {
  const opened = await openBunNativeWorkspaceTerminal({
    workspaceId: "sbx_native",
    runtimeId: "sar_native",
    argv: [
      process.execPath,
      "-e",
      "process.stdout.write('\\x1b[?1049hREADY 中文 🚀'); process.stdin.once('data', (data) => { process.stdout.write('ECHO:' + data.toString()); process.exit(0); });",
    ],
  });
  const frames = opened.session[Symbol.asyncIterator]();
  expect(await frames.next()).toEqual({
    done: false,
    value: { kind: "ready", sessionId: "native:sbx_native:sar_native" },
  });

  let output = "";
  while (!output.includes("READY")) {
    const frame = await frames.next();
    expect(frame.done).toBe(false);
    if (frame.value?.kind === "output") output += frame.value.data;
  }
  expect(output).toContain("\x1b[?1049hREADY 中文 🚀");

  await opened.session.resize({ cols: 100, rows: 30 });
  await opened.session.write("hello-from-tui\r");
  while (!output.includes("ECHO:hello-from-tui")) {
    const frame = await frames.next();
    if (frame.done) break;
    if (frame.value.kind === "output") output += frame.value.data;
  }
  expect(output).toContain("ECHO:hello-from-tui");
  await opened.session.detach();
  await opened.session.detach();
}, 10_000);
