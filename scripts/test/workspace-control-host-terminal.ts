import { dirname, resolve } from "node:path";
import { classifyWorkspaceHostTerminal } from "../../packages/adapters/cli/src/workspace-control-terminal";

export interface WorkspaceHostTerminalTranscriptEvidence {
  readonly alternateScreenEntered: boolean;
  readonly alternateScreenLeft: boolean;
  readonly bracketedPasteEnabled: boolean;
  readonly bracketedPasteDisabled: boolean;
  readonly mouseCaptureEnabled: boolean;
  readonly mouseCaptureDisabled: boolean;
  readonly workspaceSurfaceRendered: boolean;
  readonly releaseChordRendered: boolean;
}

export function verifyWorkspaceHostTerminalTranscript(
  transcript: string,
): WorkspaceHostTerminalTranscriptEvidence {
  return {
    alternateScreenEntered: transcript.includes("\u001b[?1049h"),
    alternateScreenLeft: transcript.includes("\u001b[?1049l"),
    bracketedPasteEnabled: transcript.includes("\u001b[?2004h"),
    bracketedPasteDisabled: transcript.includes("\u001b[?2004l"),
    mouseCaptureEnabled:
      transcript.includes("\u001b[?1000h") && transcript.includes("\u001b[?1006h"),
    mouseCaptureDisabled:
      transcript.includes("\u001b[?1000l") && transcript.includes("\u001b[?1006l"),
    workspaceSurfaceRendered: transcript.includes("Workspaces"),
    releaseChordRendered: transcript.includes("Ctrl+]"),
  };
}

function argumentValue(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

async function waitForTranscript(read: () => string, needle: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!read().includes(needle)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${JSON.stringify(needle)}`);
    }
    await Bun.sleep(20);
  }
}

async function main(): Promise<void> {
  if (Bun.argv.includes("--help")) {
    console.log(
      "Usage: bun run scripts/test/workspace-control-host-terminal.ts --renderer <path> --evidence <path> [--expect-terminal-program <name>]",
    );
    return;
  }

  const environment = process.env;
  const classification = classifyWorkspaceHostTerminal(environment);
  if (!classification.supported) {
    throw new Error(`Workspace TUI host terminal is unsupported: ${classification.reason}`);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Workspace TUI host-terminal smoke requires interactive stdin and stdout");
  }

  const root = resolve(dirname(import.meta.dir), "..");
  const rendererPath = resolve(
    argumentValue("--renderer") ??
      resolve(root, "apps/workspace-control-tui/target/release/appaloft-workspace-tui"),
  );
  if (!(await Bun.file(rendererPath).exists())) {
    throw new Error(`Workspace TUI renderer is missing: ${rendererPath}`);
  }
  const evidencePath = argumentValue("--evidence");
  if (!evidencePath) throw new Error("--evidence is required");

  const expectedTerminalProgram = argumentValue("--expect-terminal-program");
  const terminalProgram = environment.TERM_PROGRAM?.trim() || "unreported";
  if (expectedTerminalProgram && terminalProgram !== expectedTerminalProgram) {
    throw new Error(
      `Expected TERM_PROGRAM=${expectedTerminalProgram}, received ${terminalProgram}`,
    );
  }

  const initialCols = Math.max(120, process.stdout.columns ?? 120);
  const initialRows = Math.max(36, process.stdout.rows ?? 36);
  let transcript = "";
  const decoder = new TextDecoder();
  const terminal = new Bun.Terminal({
    cols: initialCols,
    rows: initialRows,
    name: environment.TERM,
    data: (_terminal, data) => {
      transcript += decoder.decode(data, { stream: true });
      process.stdout.write(data);
    },
  });
  terminal.setRawMode(true);
  const fixture = resolve(
    root,
    "packages/adapters/cli/test/fixtures/workspace-control-real-renderer.ts",
  );
  const child = Bun.spawn([process.execPath, fixture], {
    terminal,
    env: {
      ...environment,
      APPALOFT_WORKSPACE_TUI_BINARY: rendererPath,
    },
  });

  try {
    await waitForTranscript(() => transcript, "Workspaces");
    await waitForTranscript(() => transcript, "\u001b[?1049h");
    terminal.resize(Math.max(72, initialCols - 8), Math.max(20, initialRows - 4));
    await Bun.sleep(100);

    let exitCode: number | undefined;
    for (let attempt = 0; attempt < 50 && exitCode === undefined; attempt += 1) {
      terminal.write("\u001d");
      await Bun.sleep(20);
      terminal.write("q");
      const result = await Promise.race([
        child.exited.then((code) => ({ exited: true as const, code })),
        Bun.sleep(100).then(() => ({ exited: false as const })),
      ]);
      if (result.exited) exitCode = result.code;
    }
    if (exitCode !== 0) throw new Error(`Workspace TUI exited with code ${String(exitCode)}`);
    await waitForTranscript(() => transcript, "\u001b[?1049l");

    const checks = verifyWorkspaceHostTerminalTranscript(transcript);
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    if (failedChecks.length > 0) {
      throw new Error(`Workspace TUI host-terminal checks failed: ${failedChecks.join(", ")}`);
    }

    await Bun.write(
      resolve(evidencePath),
      `${JSON.stringify(
        {
          schemaVersion: "appaloft.workspace-tui-host-terminal-evidence/v1",
          capturedAt: new Date().toISOString(),
          platform: process.platform,
          architecture: process.arch,
          terminal: {
            term: environment.TERM,
            termProgram: terminalProgram,
            termProgramVersion: environment.TERM_PROGRAM_VERSION,
            colorTerm: environment.COLORTERM,
            initialCols,
            initialRows,
          },
          rendererPath,
          checks,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Workspace TUI host-terminal smoke passed: ${resolve(evidencePath)}`);
  } finally {
    child.kill("SIGTERM");
    terminal.close();
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const evidencePath = argumentValue("--evidence");
    if (evidencePath) {
      const environment = process.env;
      await Bun.write(
        resolve(evidencePath),
        `${JSON.stringify(
          {
            schemaVersion: "appaloft.workspace-tui-host-terminal-evidence/v1",
            capturedAt: new Date().toISOString(),
            status: "failed",
            platform: process.platform,
            architecture: process.arch,
            terminal: {
              term: environment.TERM,
              termProgram: environment.TERM_PROGRAM,
              termProgramVersion: environment.TERM_PROGRAM_VERSION,
              colorTerm: environment.COLORTERM,
            },
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        )}\n`,
      );
    }
    throw error;
  }
}
