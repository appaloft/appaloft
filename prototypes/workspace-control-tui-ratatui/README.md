# Workspace Control TUI Ratatui Fallback Spike

> THROWAWAY PROTOTYPE — do not merge into `main` or treat as production behavior.

This is the production-cutoff benchmark for
[appaloft/appaloft#1024](https://github.com/appaloft/appaloft/issues/1024). It answers whether a
small Rust frontend can reproduce Railway's proven `portable-pty + vt100 + Ratatui` terminal
pipeline when OpenTUI's embedded-terminal API is unavailable or fails an R1 gate.

The Spike:

- starts one real Agent fixture under a native PTY;
- keeps an explicit `vt100::Parser` as terminal state;
- renders Workspace chrome and the Agent screen with Ratatui;
- writes user input back to the same PTY;
- resizes the parser and PTY together;
- proves the Agent child PID is unchanged; and
- emits machine-readable smoke evidence.

It does not implement Appaloft business operations, persist terminal output, interpret Agent
semantics or define the final renderer protocol.

## Reproduce

```bash
cargo fmt --check --manifest-path prototypes/workspace-control-tui-ratatui/Cargo.toml
cargo test --manifest-path prototypes/workspace-control-tui-ratatui/Cargo.toml
cargo build --release --manifest-path prototypes/workspace-control-tui-ratatui/Cargo.toml
prototypes/workspace-control-tui-ratatui/target/release/appaloft-workspace-control-tui-ratatui-spike
```

The branch-only `Workspace Control TUI Spike` workflow repeats the test and release build on
macOS arm64 and Linux x64. Production packaging, signing and the real terminal/Agent matrix remain
separate gates.
