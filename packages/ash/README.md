# @appaloft/ash

`@appaloft/ash` is a small Appaloft shell-script construction package. It keeps generated shell scripts readable while making every interpolation declare its shell semantics.

```ts
import { ash } from "@appaloft/ash";

const script = ash`
  set -eu
  ${ash.env("APPALOFT_VOLUME_ID", "vol_'quoted")}
  printf '%s\n' ${ash.arg("hello world")}
`;
```

`ash` returns an `AshScript`, not a plain string. Render it explicitly with `ash.render(script)` when passing it to a lower-level adapter, or run it with `ash.execute(script)` when local execution is the intended boundary.

## Helpers

- `ash.arg(value)` renders one single-quoted shell word.
- `ash.env(name, value)` renders a portable `NAME='value'` assignment.
- `ash.raw(textOrScript)` inserts trusted static shell text.
- `ash.list(values)` renders shell words separated by spaces by default.
- `ash.execute(script)` runs the typed script with `sh -lc`.

Plain string interpolation is rejected at runtime. Use `ash.raw(...)` only for trusted static script text; use `ash.arg(...)`, `ash.env(...)`, and `ash.list(...)` for dynamic values.

## Migration Plan: `renderStorageRuntimeCleanupScript`

Target: `packages/adapters/runtime/src/storage-runtime-cleanup.ts`.

1. Add `@appaloft/ash` as a workspace dependency of `@appaloft/adapter-runtime`.
2. Replace the local `shellQuote` in `storage-runtime-cleanup.ts` with `ash.arg(...)` and `ash.env(...)`.
3. Change `renderStorageRuntimeCleanupScript(...)` to return `AshScript`.
4. Keep the parser and command-runner behavior unchanged by calling `ash.render(script)` at the existing `runLocalStorageCleanupScript` and SSH boundaries.
5. Move the existing render assertions into a snapshot-style test that snapshots `ash.render(script)`.
6. Add one local execution test through `ash.execute(script)` for a no-Docker or dry-run path before migrating broader runtime scripts.

Do this migration one render function at a time. The current string-returning public behavior can be preserved temporarily by adding a compatibility wrapper such as `renderStorageRuntimeCleanupScriptText(...)` if downstream callers need a staged rollout.
