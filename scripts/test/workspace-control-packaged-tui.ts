import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const bundleDir = resolve(Bun.argv[2] ?? "dist/release/appaloft-binary-bundle");
const executableName = process.platform === "win32" ? "appaloft.exe" : "appaloft";
const appaloftPath = join(bundleDir, executableName);
const rendererPath = join(bundleDir, "appaloft-workspace-tui");
if (!existsSync(appaloftPath)) throw new Error(`Missing packaged CLI at ${appaloftPath}`);
if (!existsSync(rendererPath)) throw new Error(`Missing packaged renderer at ${rendererPath}`);

const dataRoot = await mkdtemp(join(tmpdir(), "appaloft-workspace-tui-package-"));
let output = "";
const decoder = new TextDecoder();
const terminalName = "xterm-256color";
const terminal = new Bun.Terminal({
  cols: 120,
  rows: 36,
  name: terminalName,
  data: (_terminal, data) => {
    output += decoder.decode(data, { stream: true });
  },
});
const child = Bun.spawn([appaloftPath, "workspace"], {
  terminal,
  env: {
    ...process.env,
    APPALOFT_DATA_DIR: dataRoot,
    APPALOFT_PGLITE_DATA_DIR: join(dataRoot, "pglite"),
    APPALOFT_OTEL_ENABLED: "false",
    TERM: terminalName,
  },
});

async function waitFor(needle: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!output.includes(needle)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${needle}; output=${JSON.stringify(output)}`);
    }
    await Bun.sleep(20);
  }
}

try {
  await waitFor("Workspaces");
  await waitFor("\x1b[?1049h");
  terminal.write("q");
  const exitCode = await Promise.race([
    child.exited,
    Bun.sleep(5_000).then(() => {
      throw new Error("Packaged Workspace TUI did not exit after q");
    }),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Packaged Workspace TUI exited with ${exitCode}; output=${JSON.stringify(output)}`,
    );
  }
  await waitFor("\x1b[?1049l");
  console.log(`packaged Workspace TUI smoke passed: ${bundleDir}`);
} finally {
  child.kill("SIGTERM");
  terminal.close();
  await rm(dataRoot, { recursive: true, force: true });
}
