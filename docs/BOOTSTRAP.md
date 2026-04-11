# Bootstrap

Yundu was bootstrapped with official CLIs instead of hand-written boilerplate.

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
bun add -d @biomejs/biome husky lint-staged
bunx @biomejs/biome init --jsonc
bunx husky init
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
- The initial `sv` template included ESLint and Prettier, but the repository was later standardized on Biome for supported file types plus Husky/lint-staged for staged-file autofix.
- Everything else added afterwards was project-specific architecture, domain model, persistence, docs, and tests.

## Current Standard

- The repository standard is `Biome`, not `ESLint` or `Prettier`.
- Staged-file auto-fix is handled by `lint-staged` through `.husky/pre-commit`.
- CI runs `bun run lint:ci`, which maps to `biome ci .`.
- `.svelte` files are still validated with `svelte-check`; Biome is not used as the Svelte semantic checker.
