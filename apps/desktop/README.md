# @appaloft/desktop

Tauri shell for the Appaloft local desktop app.

The desktop app does not own deployment business logic. It starts the packaged `appaloft` backend
binary as a Tauri sidecar, opens the embedded web console over loopback HTTP, and exposes the small
`window.appaloftDesktop` bridge used by the web console for native directory selection and clipboard
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

`prepare:sidecar` copies the matching release binary into the Tauri sidecar path expected by the
target. The default is the current host target and the legacy local bundle path
`dist/release/appaloft-binary-bundle`.

For release builds, pass `APPALOFT_BINARY_TARGET` after building the matching bundle:

```bash
bun run package:binary-bundle -- --target darwin-arm64 --version 0.1.0
APPALOFT_APP_VERSION=0.1.0 APPALOFT_BINARY_TARGET=darwin-arm64 bun run --cwd apps/desktop package
```

`APPALOFT_TAURI_TARGET_TRIPLE` can still override the sidecar triple when a Tauri build needs an
explicit Rust target.

This package is intentionally not wired into the root `build` or `typecheck` tasks. Tauri packaging
requires Rust and native platform dependencies, so release desktop builds run in the dedicated
GitHub Actions matrix.
