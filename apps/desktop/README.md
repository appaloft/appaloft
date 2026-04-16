# @yundu/desktop

Tauri shell for the Yundu local desktop app.

The desktop app does not own deployment business logic. It starts the packaged `yundu` backend
binary as a Tauri sidecar, opens the embedded web console over loopback HTTP, and exposes the small
`window.yunduDesktop` bridge used by the web console for native directory selection and clipboard
copy.

## Commands

From the repository root:

```bash
bun run package:binary-bundle
bun run --cwd apps/desktop dev
```

To build a macOS `.app` bundle:

```bash
bun run package:binary-bundle
bun run --cwd apps/desktop package:app
```

`prepare:sidecar` copies `dist/release/yundu-binary-bundle/yundu` to the Tauri sidecar path
expected by the current host target. Override target detection with `YUNDU_TAURI_TARGET_TRIPLE`
when preparing a sidecar for a different target.

This package is intentionally not wired into the root `build` or `typecheck` tasks yet. Tauri
packaging requires a Rust toolchain, while the current CI only installs Bun.
