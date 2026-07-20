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

Run `bun run check:ash` before committing. The guard discovers every production TypeScript module
under `apps/*/src` and `packages/*/src`; contributors must not maintain a hand-written list of new
command-owning files. A frozen, counted budget names pre-existing remote-state debt, so even a
legacy file cannot add one more violation. Do not raise a budget for new or modified executable
shell code: migrate that seam to `AshScript` instead.

`bun run lint:ci` includes this guard. A change is not CI-complete when Biome passes but the ash
architecture check has been skipped.

If `ash` cannot express a required portable command safely, extend and test `@appaloft/ash`
instead of adding a one-off quoting helper or bypassing the typed command seam.
