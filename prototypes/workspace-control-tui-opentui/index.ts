const upstreamCore = process.env.APPALOFT_OPENTUI_CORE;
if (!upstreamCore) {
  console.error(
    "APPALOFT_OPENTUI_CORE must point to the checked-out OpenTUI packages/core directory.",
  );
  process.exit(2);
}

const { BoxRenderable, EmbeddedTerminalRenderable, TextRenderable, createCliRenderer } =
  await import(`${upstreamCore}/src/index.ts`);

if (process.argv.includes("--no-tui")) {
  console.log(
    JSON.stringify({
      mode: "headless",
      workspace: "ws_spike",
      server: "registered-vps",
      agent: "embedded-terminal-session",
      opentuiCommit: "73fc2dd62643d1fd83ccdff5dd891dfc491cb5ee",
    }),
  );
  process.exit(0);
}

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  exitSignals: ["SIGTERM", "SIGQUIT", "SIGHUP"],
});

let restored = false;
let focusMode = false;
let pty: Bun.Terminal | undefined;
let child: ReturnType<typeof Bun.spawn> | undefined;

const sidePanel = new BoxRenderable(renderer, {
  borderStyle: "rounded",
  flexDirection: "column",
  padding: 1,
  width: "30%",
  height: "100%",
  gap: 1,
});
for (const [content, fg] of [
  ["Appaloft Workspace", "#7dd3fc"],
  ["Workspace  ws_spike"],
  ["Server     registered-vps"],
  ["State      ready"],
  ["Agent      native byte stream"],
  [""],
  ["Ctrl+]  release Agent focus"],
  ["Enter   focus Agent"],
  ["f       toggle Focus Mode"],
  ["q       quit from navigation"],
] as const) {
  sidePanel.add(new TextRenderable(renderer, { content, fg }));
}

const agent = new EmbeddedTerminalRenderable(renderer, {
  width: "70%",
  height: "100%",
  maxScrollback: 10_000,
  onData: (data: Uint8Array) => pty?.write(data),
  onTerminalResize: (cols: number, rows: number) => pty?.resize(cols, rows),
});

const layout = new BoxRenderable(renderer, {
  flexDirection: "row",
  width: "100%",
  height: "100%",
});
layout.add(sidePanel);
layout.add(agent);
renderer.root.add(layout);

pty = new Bun.Terminal({
  cols: Math.max(20, Math.floor(process.stdout.columns * 0.7)),
  rows: Math.max(5, process.stdout.rows),
  data(_terminal, data) {
    agent.write(data);
  },
});

const fixture = `${import.meta.dir}/agent-fixture.ts`;
const command = process.env.APPALOFT_AGENT_COMMAND;
child = Bun.spawn(command ? ["/bin/zsh", "-lc", command] : [process.execPath, fixture], {
  env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
  terminal: pty,
});

const setFocusMode = (enabled: boolean) => {
  focusMode = enabled;
  sidePanel.width = enabled ? 0 : "30%";
  sidePanel.visible = !enabled;
  agent.width = enabled ? "100%" : "70%";
  agent.focus();
};

const destroy = () => {
  if (restored) return;
  restored = true;
  child?.kill();
  pty?.close();
  renderer.destroy();
};

agent.focus();

renderer.keyInput.on(
  "keypress",
  (key: { ctrl: boolean; name: string; stopPropagation(): void }) => {
    if (key.ctrl && key.name === "]") {
      key.stopPropagation();
      agent.blur();
      return;
    }

    if (agent.focused) return;

    if (key.name === "return" || key.name === "enter") {
      key.stopPropagation();
      agent.focus();
      return;
    }

    if (key.name === "f") {
      key.stopPropagation();
      setFocusMode(!focusMode);
      return;
    }

    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      key.stopPropagation();
      destroy();
      process.exit(0);
    }
  },
);

child.exited.then(() => {
  destroy();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  destroy();
  console.error(error);
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  destroy();
  console.error(error);
  process.exit(1);
});
