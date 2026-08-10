const upstreamCore = process.env.APPALOFT_OPENTUI_CORE;
if (!upstreamCore) throw new Error("APPALOFT_OPENTUI_CORE is required");

const { EmbeddedTerminalRenderable, KeyEvent } = await import(`${upstreamCore}/src/index.ts`);
const { createTestRenderer } = await import(`${upstreamCore}/src/testing.ts`);

const setup = await createTestRenderer({ width: 60, height: 10 });
const decoder = new TextDecoder();
let output = "";
let resizeCount = 0;
let pty: Bun.Terminal | undefined;

const embedded = new EmbeddedTerminalRenderable(setup.renderer, {
  width: 44,
  height: 7,
  onData: (data: Uint8Array) => pty?.write(data),
  onTerminalResize: (cols: number, rows: number) => {
    resizeCount += 1;
    pty?.resize(cols, rows);
  },
});
setup.renderer.root.add(embedded);

pty = new Bun.Terminal({
  cols: 44,
  rows: 7,
  data(_terminal, data) {
    output += decoder.decode(data, { stream: true });
    embedded.write(data);
  },
});

const child = Bun.spawn(
  [
    "/bin/zsh",
    "-c",
    [
      "printf '\\033[?1049h\\033[2J\\033[Hagent: READY\\r\\n中文: 宽字符 🚀\\r\\n\\033[?2004h'",
      "printf 'PID:%s\\r\\n' $$",
      "stty -echo",
      "IFS= read -r line",
      "line=$" + "{line#$'\\033[200~'}",
      "line=$" + "{line%$'\\033[201~'}",
      "printf '\\r\\nECHO:%s\\r\\n' \"$line\"",
      "sleep 10",
    ].join("; "),
  ],
  { terminal: pty },
);

const waitFor = async (needle: string) => {
  const deadline = Date.now() + 5_000;
  while (!output.includes(needle)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${needle}`);
    await Bun.sleep(10);
  }
};

try {
  await waitFor("agent: READY");
  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  if (!frame.includes("agent: READY") || !frame.includes("中文: 宽字符 🚀")) {
    throw new Error(`Unicode frame mismatch:\n${frame}`);
  }

  const pid = output.match(/PID:(\d+)/)?.[1];
  if (!pid) throw new Error("missing child PID");

  embedded.focus();
  embedded.blur();
  if (embedded.focused) throw new Error("focus was not released");
  embedded.focus();

  const paste = embedded.encodePaste(new TextEncoder().encode("hello-from-appaloft"));
  if (decoder.decode(paste) !== "\x1b[200~hello-from-appaloft\x1b[201~") {
    throw new Error("bracketed paste encoding mismatch");
  }
  embedded.onData?.(paste);
  embedded.onData?.(
    embedded.encodeKey(
      new KeyEvent({
        name: "enter",
        sequence: "\r",
        raw: "\r",
        ctrl: false,
        meta: false,
        shift: false,
        option: false,
        number: false,
        eventType: "press",
        source: "raw",
      }),
    ),
  );
  await waitFor("ECHO:");
  if (!output.includes("hello-from-appaloft")) throw new Error("input did not reach PTY");

  embedded.width = 56;
  embedded.height = 9;
  await setup.renderOnce();
  embedded.width = 44;
  embedded.height = 7;
  await setup.renderOnce();
  if (resizeCount < 2) throw new Error(`expected resize propagation, got ${resizeCount}`);
  if (child.pid.toString() !== pid) throw new Error(`PTY identity changed: ${pid} -> ${child.pid}`);

  console.log(
    JSON.stringify({
      pass: true,
      childPid: child.pid,
      unicode: true,
      bracketedPaste: true,
      focusRelease: true,
      sameSessionResize: true,
      resizeCount,
    }),
  );
} finally {
  child.kill();
  await child.exited;
  pty.close();
  setup.renderer.destroy();
}
