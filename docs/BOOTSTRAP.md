# Bootstrap

Appaloft was bootstrapped with official CLIs instead of hand-written boilerplate.

## Commands Used

Monorepo:

```bash
bunx create-turbo@latest . --package-manager bun --skip-install
```

Frontend app:

```bash
bunx sv@latest create apps/web --template minimal --types ts --add eslint prettier vitest='usages:unit' playwright tailwindcss='plugins:none' sveltekit-adapter='adapter:static' --install bun --no-download-check --no-dir-check
```

Repository lint/format toolchain migration:

```bash
bun add -d oxlint oxfmt lefthook
```

shadcn-svelte help was consulted before initialization:

```bash
bunx shadcn-svelte@latest init --help
bunx shadcn-svelte@latest add --help
```

shadcn-svelte initialization:

```bash
bunx shadcn-svelte@latest init --cwd apps/web --preset batquO
```

The preset above came from the CLI-generated preset flow and maps to the current dashboard styling committed in `apps/web/components.json`.

Components added with the official CLI:

```bash
bunx shadcn-svelte@latest add button card badge separator table --cwd apps/web --yes --skip-preflight
bun x shadcn-svelte@latest add sidebar input textarea select dropdown-menu collapsible sheet skeleton avatar -y --overwrite
```

## Notes

- `sv` was used to scaffold SvelteKit, Tailwind, Vitest, and Playwright in one official flow.
- `create-turbo` established the monorepo baseline.
- `shadcn-svelte` was used for design-system primitives instead of hand-copying components.
- The initial `sv` template included ESLint and Prettier. The repository later used Biome plus Husky/lint-staged, then moved to Oxlint, Oxfmt, and Lefthook.
- Everything else added afterwards was project-specific architecture, domain model, persistence, docs, and tests.

## Current Standard

- The repository standard is Oxlint plus Oxfmt, not Biome, ESLint, or Prettier.
- Lefthook owns Git hooks. Staged JS/TS files are linted with Oxlint and formatted with Oxfmt.
- `bun install` skips Lefthook when git is unavailable, so Docker and other git-less installs do not fail.
- rustfmt stays the Workspace TUI formatter and is not invoked from Lefthook.
- CI runs `bun run lint:ci`, which fail-closes Oxlint/Oxfmt on changed files, then runs the architecture guards.
- `.svelte` files are still validated with `svelte-check`; Oxlint is not used as the Svelte semantic checker.
