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
- The Ratatui fallback renders the same transport-neutral Session without owning another PTY. Its
  real-PTY host control and release-sidecar smoke pass on Darwin arm64/x64 and Linux arm64/x64 for
  glibc and musl in [CI run 31405008059](https://github.com/appaloft/appaloft/actions/runs/31405008059).
- Musl is compiled and executed natively in a digest-pinned official Rust Alpine image. This
  replaced a `musl-gcc` cross-link path whose x64 output reproducibly crashed at startup.
- The OpenTUI public embedded API remains unmerged and unreleased. The repeatable 30-minute soak
  completed 82,273 renders and 155,056,054 output bytes with final-frame integrity, 3.75% average
  CPU, p95 0.18 ms / p99 0.30 ms render latency and 89,456,640 bytes of peak RSS growth. An earlier
  uninstrumented run did not terminate or emit a final report after 36 minutes; the repeatable
  harness must call `process.exit` after renderer teardown because the unreleased native renderer
  retains background handles.

## Gate Verdict

| Gate | Verdict | Evidence / remaining gap |
| --- | --- | --- |
| `WS-TUI-SPIKE-001` | pass | Ratatui release-sidecar build and smoke pass on Darwin arm64/x64 and Linux arm64/x64 glibc/musl; OpenTUI remains ineligible because its API is unreleased. |
| `WS-TUI-SPIKE-002` | host pass | A representative alternate-screen child rendered from an unmodified PTY byte stream inside `EmbeddedTerminalRenderable`. |
| `WS-TUI-SPIKE-003` | partial | Resize, bracketed paste, focus release and deterministic restoration passed; real mouse protocols, signals and Agent-specific keymaps still need the terminal matrix. |
| `WS-TUI-SPIKE-004` | host pass | CJK, emoji, combining text and wide glyphs rendered in upstream and Appaloft smoke coverage. |
| `WS-TUI-SPIKE-005` | contract pass | Transport loss and rebind preserve the exact managed Session id and bounded replay at the existing TerminalSession seam; a real SSH transport remains in product acceptance. |
| `WS-TUI-SPIKE-006` | partial | Automated Darwin/Linux architecture and libc coverage passes; Terminal.app/iTerm2/Ghostty/VS Code and real Agent keymaps remain product acceptance. |
| `WS-TUI-SPIKE-007` | pass | Source `--no-tui` is renderer-free, Ratatui sidecars are buildable on all six accepted targets, and the unreleased OpenTUI native core is excluded from production packaging. |
| `WS-TUI-SPIKE-008` | host pass | Pane/Focus Mode resizing retained the exact Bun PTY and child PID; remote Session identity still needs integration coverage. |
| `WS-TUI-SPIKE-009` | OpenTUI reject | The instrumented 30-minute run preserved screen integrity across 82,273 renders / 155 MB output with p99 0.30 ms latency, but peak RSS grew 89 MB and natural teardown retained handles; the harness requires explicit process exit. |

## Inference

The underlying product concept is viable: Appaloft can own Workspace navigation while
Pi/OpenCode/Claude Code/Codex keep ownership of their native terminal UI. The bridge is byte-stream
transport plus terminal emulation, not semantic proxying of messages, tools or reasoning.

This is a **Go for Ratatui behind renderer-neutral production foundations**, not a Go for an
OpenTUI production dependency. OpenTUI can be reconsidered only after the embedded API is released
and passes the same gates; replacing the renderer must not change the CLI presentation contract.

## Recommendation

1. Keep `TerminalViewport` framework-neutral and adapt the existing `TerminalSession`; use
   `Bun.Terminal` only for local native clients.
2. Ship Ratatui/Crossterm terminal emulation as a replaceable sidecar on the six accepted
   macOS/Linux targets. The Bun parent owns existing local PTY and managed Session lifecycle.
3. Keep OpenTUI experimental until its embedded API is merged and released; do not vendor or fork
   its Ghostty runtime into Appaloft.
4. In the product slice, bind the renderer to the existing remote `TerminalSession`, package the
   six sidecars, retain Windows headless safety and run the real terminal/Agent matrix.

Primary sources:

- <https://github.com/anomalyco/opentui/pull/1338>
- <https://github.com/anomalyco/opentui/pull/1340>
- <https://bun.com/docs/runtime/terminal>
- <https://docs.railway.com/cli/code>
