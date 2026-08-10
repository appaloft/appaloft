import { Box, Text, createCliRenderer, type KeyEvent } from "@opentui/core";

if (process.argv.includes("--no-tui")) {
  console.log(
    JSON.stringify({
      mode: "headless",
      workspace: "ws_spike",
      server: "registered-vps",
      agent: "native-pty-handoff",
    }),
  );
  process.exit(0);
}

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  exitSignals: ["SIGTERM", "SIGQUIT", "SIGHUP"],
});

let restored = false;
const destroy = () => {
  if (restored) return;
  restored = true;
  renderer.destroy();
};

renderer.root.add(
  Box(
    {
      borderStyle: "rounded",
      flexDirection: "column",
      padding: 1,
      gap: 1,
    },
    Text({ content: "Appaloft Workspace Control — THROWAWAY SPIKE", fg: "#7dd3fc" }),
    Text({ content: "Workspace  ws_spike   Server  registered-vps   Status  ready" }),
    Text({ content: "中文宽字符 · emoji 🚀 · combining e\u0301 · resize this terminal" }),
    Text({ content: "Agent surface: native PTY handoff (not parsed, not emulated)" }),
    Text({ content: "q / Ctrl+C: restore terminal and exit" }),
  ),
);

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (key.name === "q" || (key.ctrl && key.name === "c")) {
    destroy();
    process.exit(0);
  }
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
