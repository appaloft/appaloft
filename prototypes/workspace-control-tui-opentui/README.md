# Workspace Control TUI OpenTUI Spike

> THROWAWAY PROTOTYPE — do not merge into `main` or treat as production behavior.

Issue: [appaloft/appaloft#1024](https://github.com/appaloft/appaloft/issues/1024)

Question: can OpenTUI's proposed embedded-terminal API preserve an Agent-owned native byte stream
inside an Appaloft Workspace control shell without inventing a conversation model or starting a
second Agent when the user changes presentation mode?

## Pinned Upstream

- OpenTUI PR [#1340](https://github.com/anomalyco/opentui/pull/1340)
- Commit: `73fc2dd62643d1fd83ccdff5dd891dfc491cb5ee`
- Status during this Spike: API proposed and CI green, but not merged or released to npm.
- Local build tool: Zig 0.16.0; every fetched Zig dependency was verified against the upstream
  `build.zig.zon` hash.

The published `@opentui/core` 0.5.1 package does not contain `EmbeddedTerminalRenderable`, so this
prototype deliberately loads an exact upstream checkout rather than pretending the feature is
already a stable dependency.

## Reproduce

```bash
git clone https://github.com/anomalyco/opentui.git /private/tmp/opentui-embedded
git -C /private/tmp/opentui-embedded checkout 73fc2dd62643d1fd83ccdff5dd891dfc491cb5ee
bun install --cwd /private/tmp/opentui-embedded --frozen-lockfile
bun run --cwd /private/tmp/opentui-embedded/packages/core build

export APPALOFT_OPENTUI_CORE=/private/tmp/opentui-embedded/packages/core
bun smoke.ts
bun index.ts --no-tui
bun index.ts
```

The interactive prototype starts a deterministic Agent fixture by default. To exercise a locally
installed native client instead:

```bash
APPALOFT_AGENT_COMMAND='pi' bun index.ts
APPALOFT_AGENT_COMMAND='opencode' bun index.ts
```

Within the prototype, `Ctrl+]` releases Agent focus, `Enter` returns focus, `f` toggles Focus Mode,
and `q` exits while navigation owns input. Focus Mode resizes the same local PTY; it does not spawn
a replacement child.

## Facts

- Host: macOS arm64, Bun 1.3.14, OpenTUI commit `73fc2dd6`, Zig 0.16.0.
- The exact upstream native core and library built successfully.
- The upstream embedded-terminal suite passed 11/11 tests.
- `smoke.ts` passed real `Bun.Terminal` output, CJK/emoji, bracketed-paste encoding and delivery,
  focus release/re-entry, resize propagation and same-child PID checks.
- `terminal-session-bridge.test.ts` passed the existing framework-neutral `TerminalSession` output,
  input, resize, detach and close mapping without introducing Agent semantics.
- `terminal-viewport-reconnect.test.ts` passed transport loss, detach and rebind of the same
  viewport to the exact managed Terminal Session identity with bounded replay and no second Agent.
- A real interactive PTY run rendered the split Workspace/Agent layout and restored host terminal
  state after `Ctrl+]`, `q`.
- Appaloft's existing `TerminalSession` already exposes the required transport-neutral output,
  `write`, `resize`, `detach` and `close` boundary. This Spike did not change that contract.
- The OpenTUI public embedded API is not released. Multi-terminal coverage and supported release
  artifacts remain incomplete. The repeatable 30-minute soak records CPU, RSS, render latency and
  final-frame integrity through `bun soak.ts`.

## Gate Verdict

| Gate | Verdict | Evidence / remaining gap |
| --- | --- | --- |
| `WS-TUI-SPIKE-001` | partial | Exact macOS arm64 native build passed; Appaloft release artifacts and supported Linux builds were not produced locally. |
| `WS-TUI-SPIKE-002` | host pass | A representative alternate-screen child rendered from an unmodified PTY byte stream inside `EmbeddedTerminalRenderable`. |
| `WS-TUI-SPIKE-003` | partial | Resize, bracketed paste, focus release and deterministic restoration passed; real mouse protocols, signals and Agent-specific keymaps still need the terminal matrix. |
| `WS-TUI-SPIKE-004` | host pass | CJK, emoji, combining text and wide glyphs rendered in upstream and Appaloft smoke coverage. |
| `WS-TUI-SPIKE-005` | contract pass | Transport loss and rebind preserve the exact managed Session id and bounded replay at the existing TerminalSession seam; a real SSH transport remains in product acceptance. |
| `WS-TUI-SPIKE-006` | pending | Only the current macOS host PTY was exercised; Terminal.app/iTerm2/Ghostty/VS Code/Linux remain. |
| `WS-TUI-SPIKE-007` | partial | Source `--no-tui` passed without creating a renderer; packaging with the unreleased native core remains. |
| `WS-TUI-SPIKE-008` | host pass | Pane/Focus Mode resizing retained the exact Bun PTY and child PID; remote Session identity still needs integration coverage. |
| `WS-TUI-SPIKE-009` | running | The 30-minute burst-output soak is running against the exact upstream core; record its final measurements before closing the gate. |

## Inference

OpenTUI is now the best-fit presentation candidate, and the underlying product concept is viable:
Appaloft can own Workspace navigation while Pi/OpenCode/Claude Code/Codex keep ownership of their
native terminal UI. The bridge is byte-stream transport plus terminal emulation, not semantic
proxying of messages, tools or reasoning.

This is a **Go for renderer-neutral production foundations**, not a Go for an OpenTUI production
dependency. The remaining OpenTUI risks are release maturity, packaging and terminal correctness,
not the core split-pane architecture. The Ratatui fallback Spike is the independent delivery
benchmark.

## Recommendation

1. Keep `TerminalViewport` framework-neutral and adapt the existing `TerminalSession`; use
   `Bun.Terminal` only for local native clients.
2. Wait for OpenTUI's embedded API to merge and release, or pin a reviewed upstream commit only in
   an explicitly experimental build. Do not vendor or fork its Ghostty runtime into Appaloft.
3. Next implement the remote `TerminalSession` bridge plus disconnect/reconnect harness, then run
   release packaging, real terminal/Agent matrix and soak gates before starting the production
   vertical slice.

Primary sources:

- <https://github.com/anomalyco/opentui/pull/1338>
- <https://github.com/anomalyco/opentui/pull/1340>
- <https://bun.com/docs/runtime/terminal>
- <https://docs.railway.com/cli/code>
