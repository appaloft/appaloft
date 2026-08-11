import { describe, expect, test } from "bun:test";
import { classifyWorkspaceHostTerminal } from "../../packages/adapters/cli/src/workspace-control-terminal";
import { verifyWorkspaceHostTerminalTranscript } from "./workspace-control-host-terminal";

describe("Workspace host-terminal smoke", () => {
  test("[WS-TUI-FALLBACK-009][WS-TUI-TERMINAL-012] rejects terminals without a usable control surface", () => {
    expect(classifyWorkspaceHostTerminal({ TERM: "dumb" })).toEqual({
      supported: false,
      reason: "terminal-unsupported",
    });
    expect(classifyWorkspaceHostTerminal({})).toEqual({
      supported: false,
      reason: "terminal-unsupported",
    });
    expect(classifyWorkspaceHostTerminal({ TERM: "unknown" })).toEqual({
      supported: false,
      reason: "terminal-unsupported",
    });
    expect(classifyWorkspaceHostTerminal({ TERM: "xterm-256color" }, "win32")).toEqual({
      supported: false,
      reason: "platform-unsupported",
    });
    expect(classifyWorkspaceHostTerminal({ TERM: "xterm-256color" }, "linux")).toEqual({
      supported: true,
    });
  });

  test("[WS-TUI-FOCUS-005][WS-TUI-TERMINAL-012] records deterministic host restoration evidence", () => {
    expect(
      verifyWorkspaceHostTerminalTranscript(
        [
          "\u001b[?1049h",
          "\u001b[?1000h\u001b[?1002h\u001b[?1003h\u001b[?1006h",
          "\u001b[?2004h",
          "Workspaces",
          "Ctrl+]",
          "\u001b[?2004l",
          "\u001b[?1006l\u001b[?1003l\u001b[?1002l\u001b[?1000l",
          "\u001b[?1049l",
        ].join(""),
      ),
    ).toEqual({
      alternateScreenEntered: true,
      alternateScreenLeft: true,
      bracketedPasteEnabled: true,
      bracketedPasteDisabled: true,
      mouseCaptureEnabled: true,
      mouseCaptureDisabled: true,
      workspaceSurfaceRendered: true,
      releaseChordRendered: true,
    });
  });
});
