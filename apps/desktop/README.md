# @yundu/desktop

Electron shell for the Yundu local desktop app.

The desktop app does not own deployment business logic. It starts the packaged `yundu` backend binary, opens the embedded web console over loopback HTTP, and exposes a small native bridge for desktop-only capabilities such as selecting a local source directory path.

## Commands

```bash
bun run build
bun run dev
bun run package
```

`bun run dev` expects `dist/release/yundu-binary-bundle/yundu` to exist. From the repository root, run:

```bash
bun run package:binary-bundle
bun run --cwd apps/desktop dev
```

The Electron main and preload builds use `electron-vite`; the renderer remains the static Yundu web console served by the local backend.

To build a distributable desktop app from the repository root:

```bash
bun run package:binary-bundle
bun run --cwd apps/desktop package
```
