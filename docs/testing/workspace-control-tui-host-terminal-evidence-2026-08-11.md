# Workspace Control TUI Host-Terminal Evidence — 2026-08-11

## Scope

This provider-free acceptance runs the production Rust/Ratatui Workspace control sidecar through
the public `smoke:workspace-tui:host-terminal` entrypoint. It records only host-terminal metadata
and boolean protocol checks; it does not record Workspace or Agent content and does not call a
model, provider or external control plane.

Every passing run proved all of the following:

- alternate screen entered and left;
- bracketed paste enabled and disabled;
- mouse capture enabled and disabled;
- the Workspace surface rendered;
- the documented `Ctrl+]` focus-release chord remained visible;
- the child exited successfully and restored the host terminal.

## Accepted runs

| Host terminal | Platform / architecture | TERM | Viewport | Captured at (UTC) | Evidence SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Codex xterm-compatible PTY | macOS / arm64 | `xterm-256color` | 120×36 | 2026-08-11 08:09:18 | `f7e9cb75f11f5757a371c62a2ccce2928edde98fd76bd13c11aa11cd9e7442fe` |
| Terminal.app 470.2 | macOS / arm64 | `xterm-256color` | 120×36 | 2026-08-11 08:13:19 | `c4cdbfaa81c1fc79c4febca2f271d00035dc57bb7d5448957450f7652bd4786a` |
| VS Code integrated terminal 1.132.0 | macOS / arm64 | `xterm-256color` | 120×36 | 2026-08-11 09:16:39 | `5c9ba6f79aff313e20433d500c5ba81addcda75079b1169d7df11a5af9720ef8` |
| Debian xterm 390 on Xvfb | Linux / x64 | `xterm-256color` | 132×40 | 2026-08-11 09:32:05 | `b45da17a7ee591dfe2373801faf51f63dd23e616ce11c83a9f8ac5a31225c435` |
| Ghostty 1.3.1 | macOS / arm64 | `xterm-ghostty` | 224×64 | 2026-08-11 09:45:42 | `3ac6d0f4330c5a5247f8c4f1b3f5a478d3debe830b140ed1e1864d9be4aaeaff` |

The VS Code run used an isolated Extension Development Host with isolated user-data and extension
directories. The Linux run compiled the production sidecar in Linux and started the smoke inside a
real xterm PTY backed by Xvfb. The signed Ghostty app ran from a temporary directory; it was not
installed and no process remained after the run.

## Open run

iTerm2 3.6.11 remains open. Its official archive SHA-256
`36e78c5049560eaa8e122224f6652eb4b229c61cd5e7332d6d25b5c36f7398e7` matches the publisher's
signed checksum and the extracted app passes strict code-signature verification. On this host its
documented `--command` entry does not create a Session while the app is outside `/Applications`.
The temporary `/Applications/iTerm.app` install-and-remove run requires explicit owner
authorization; it must not be replaced by an environment-only simulation.

## Reproduction

Run from the host terminal under test:

```bash
bun run smoke:workspace-tui:host-terminal \
  --renderer apps/workspace-control-tui/target/release/appaloft-workspace-tui \
  --evidence <temporary-json-path> \
  --expect-terminal-program <expected-TERM_PROGRAM>
```

The evidence filename is intentionally caller-owned so opt-in runs can retain or discard machine
metadata according to their environment policy.
