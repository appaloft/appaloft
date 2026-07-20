# Shell Command Construction For AI Contributors

Executable shell text is a typed runtime artifact in Appaloft. Build it with
`@appaloft/ash`; do not assemble it with template strings, arrays joined by newlines, local
`shellQuote` helpers, or an untyped `string` command interface.

## Required pattern

1. A renderer returns `AshScript`.
2. Dynamic values use `ash.arg(...)`, `ash.env(...)`, or `ash.list(...)`.
3. `ash.raw(...)` is limited to reviewed, static shell syntax. Never pass user, provider,
   repository, environment, secret, path, host, image, or resource data to `ash.raw(...)`.
4. Nested `sh -lc` scripts are themselves built with `ash` and passed as
   `ash.arg(ash.render(nestedScript))`.
5. Only the local-process or SSH execution adapter renders `AshScript` to text.
6. Secrets should travel through stdin, a protected file, or an already-owned runtime secret
   boundary. Quoting a secret does not make it safe to include in a process argument or log.

Run `bun run check:ash` before committing. The guard covers both Cloud service registration and
the standalone CLI managed-dependency providers, because those are separate composition roots.
When a new command-owning module is added, add it to the guarded paths in
`scripts/check-ash-command-construction.ts`.

If `ash` cannot express a required portable command safely, extend and test `@appaloft/ash`
instead of adding a one-off quoting helper or bypassing the typed command seam.
