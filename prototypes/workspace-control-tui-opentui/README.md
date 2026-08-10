# Workspace Control TUI OpenTUI Spike

> THROWAWAY PROTOTYPE — do not merge into `main` or treat as production behavior.

Issue: [appaloft/appaloft#1024](https://github.com/appaloft/appaloft/issues/1024)

Question: can OpenTUI 0.5.1 satisfy every hardest-path gate in
`docs/specs/125-workspace-code-activation/research.md` while the Agent surface remains an
Adapter-owned native PTY/client?

## Run

```bash
bun install --frozen-lockfile
bun index.ts
bun index.ts --no-tui
bun build --compile index.ts --outfile appaloft-tui-spike
./appaloft-tui-spike --no-tui
```

## Captured Host Evidence

- Host: macOS arm64, Bun 1.3.14.
- Candidate: `@opentui/core` 0.5.1.
- `WS-TUI-SPIKE-001`: partial pass. `bun build --compile` produced and ran a 73,138,658-byte
  Mach-O arm64 executable; Linux and macOS x64 remain untested.
- `WS-TUI-SPIKE-002`: blocked. OpenTUI exports a renderer and UI renderables but no terminal
  emulator/PTY renderable capable of safely nesting an arbitrary alternate-screen Agent TUI.
- `WS-TUI-SPIKE-003`: partial pass for the outer shell. `q` restored cursor, mouse, bracketed
  paste and alternate-screen state with exit code 0. Nested PTY focus, paste and Ctrl+C ownership
  cannot pass while gate 002 is blocked.
- `WS-TUI-SPIKE-004`: host pass for CJK, emoji, combining marks and wide-character alignment.
- `WS-TUI-SPIKE-005`: blocked pending the framework-neutral Terminal transport prototype; the
  renderer alone cannot prove managed-terminal replay/reconnect.
- `WS-TUI-SPIKE-006`: blocked. Only the current Codex PTY host was exercised; the required terminal
  and OS matrix remains incomplete.
- `WS-TUI-SPIKE-007`: host pass. `--no-tui` works from source and the compiled executable.

## Verdict

OpenTUI is suitable for an Appaloft-owned control shell, but it does not pass the required nested
Agent PTY gate. Do not add it as a production dependency under the current Spec 125 selection rule.

The recommended next behavior Spec should use a control-shell plus full-screen native handoff:
Appaloft renders Workspace/Server/Profile/Preview/Task state, destroys or suspends its renderer,
hands the terminal directly to the Adapter-owned PTY/client, then restores and refreshes the
control shell when the native session returns. This keeps Agent dialogue native and avoids terminal
scraping or building a terminal emulator. A true split-pane Agent surface remains a later terminal
emulation product decision.

Primary references:

- <https://opentui.com/docs/getting-started/>
- <https://opentui.com/docs/reference/standalone-executables/>
- <https://opentui.com/docs/core-concepts/lifecycle/>
- <https://opentui.com/docs/core-concepts/keyboard/>
- <https://github.com/anomalyco/opencode/blob/dev/packages/opencode/script/build.ts>
