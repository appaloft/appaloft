# Workspace Control TUI Ratatui Fallback Spike

> THROWAWAY PROTOTYPE — do not merge into `main` or treat as production behavior.

This is the production-cutoff benchmark for
[appaloft/appaloft#1024](https://github.com/appaloft/appaloft/issues/1024). It answers whether a
small Rust frontend can reproduce Railway's proven `portable-pty + vt100 + Ratatui` terminal
pipeline when OpenTUI's embedded-terminal API is unavailable or fails an R1 gate.

The production boundary keeps local `Bun.Terminal` and managed `TerminalSession` transport in
the Bun parent. The Rust sidecar receives the same framework-neutral byte stream and owns only
terminal emulation, input encoding and rendering. A real `portable-pty` fixture remains a
non-musl reference test; it is not the selected production PTY owner. Linux x64 musl exposed a
SIGSEGV first while `portable-pty 0.8` was linked and again in a `musl-gcc` cross-linked
transport-neutral binary. The final matrix therefore excludes duplicate PTY ownership and builds
and executes musl natively in a digest-pinned official Rust Alpine image.

The Spike:

- starts one real Agent fixture under a native PTY;
- keeps an explicit `vt100::Parser` as terminal state;
- renders Workspace chrome and the Agent screen with Ratatui;
- writes user input back to the same PTY;
- resizes the parser and PTY together;
- proves the Agent child PID is unchanged; and
- emits machine-readable smoke evidence.

The `--viewport-only` smoke proves the actual sidecar boundary without allocating a second PTY and
runs on every macOS/Linux release target.

It does not implement Appaloft business operations, persist terminal output, interpret Agent
semantics or define the final renderer protocol.

## Reproduce

```bash
cargo fmt --check --manifest-path prototypes/workspace-control-tui-ratatui/Cargo.toml
cargo test --manifest-path prototypes/workspace-control-tui-ratatui/Cargo.toml
cargo build --release --manifest-path prototypes/workspace-control-tui-ratatui/Cargo.toml
prototypes/workspace-control-tui-ratatui/target/release/appaloft-workspace-control-tui-ratatui-spike
```

The branch-only `Workspace Control TUI Spike` workflow repeats the test, release build and
executable smoke for all six existing macOS/Linux release targets: Darwin arm64/x64 and Linux
arm64/x64 on glibc/musl. [CI run 31405008059](https://github.com/appaloft/appaloft/actions/runs/31405008059)
passes every target plus the macOS/Linux `TerminalSession` bridge jobs. Production archive/npm
integration, signing and the real terminal/Agent matrix remain separate gates.
