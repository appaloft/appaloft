# This Nimbus docs site

Astro-based docs. The `nimbus-docs` package handles content schemas, sidebar/TOC, MDX→markdown, build hooks, and the `nimbus` CLI. Everything in `src/` is yours to edit.

## File layout

```
astro.config.ts              # imports nimbus + defineNimbusConfig
src/
├── components.ts            # MDX globals registry — every component used in .mdx must be listed
├── components/              # AgentDirective, Header, Render + ui/<slug>/
├── content/
│   ├── docs/*.mdx
│   └── partials/*.mdx       # referenced via <Render file="..." />
├── content.config.ts        # registers docsCollection() + partialsCollection()
├── layouts/                 # BaseLayout (NimbusHead), DocsLayout (sidebar/TOC/breadcrumbs)
├── lib/cn.ts                # Tailwind className merger
├── pages/
│   ├── [...slug].astro
│   ├── [...slug]/index.md.ts   # per-page markdown alternate
│   ├── llms.txt.ts
│   ├── og.png.ts                # site-level OG card
│   ├── og/
│   │   ├── _og-card-config.ts   # shared OG theme tokens (underscore = not a route)
│   │   └── [...slug].ts         # per-page OG cards
│   └── robots.txt.ts
└── styles/                  # globals.css, prose.css
```

This package does not deploy to Cloudflare Pages directly — `wrangler.jsonc` was removed. The Appaloft Cloud composition root uploads this app's `dist/` output as a static bundle instead; see "Appaloft-specific notes" below.

## Writing docs

Frontmatter validates against `docsSchema` (`nimbus-docs/schemas`). Required: `title`.

```mdx
---
title: My page
description: One-line summary.
---

Content here. The page H1 comes from `title` — don't repeat it in the body.

## Section heading
```

Rules:

- **Components must be PascalCase and registered in `src/components.ts`.** A pre-build validator catches typos with a "did you mean" hint.
- **Partials use `<Render file="..." />`.** Don't import `.mdx` directly. Shared content lives in `src/content/partials/<slug>.mdx`.
- **Icons use `astro-icon` + Phosphor.** `<Icon name="ph:<glyph>" class="w-4 h-4" />` from `astro-icon/components`. Glyphs: [phosphoricons.com](https://phosphoricons.com).
- **Don't remove `<AgentDirective />` from `BaseLayout.astro`.** It points agents at `/llms.txt`.

## Adding things

| Goal | Action |
|---|---|
| New doc page | Create `src/content/docs/<slug>.mdx` (zh-CN) and its `en/<slug>.mdx` mirror (see "Appaloft-specific notes"). Sidebar picks it up via `src/lib/sidebar-config.ts`'s `autogenerate`. |
| New partial | Create `src/content/partials/<slug>.mdx`. Use via `<Render file="<slug>" />`. |
| UI from registry | `bunx nimbus-docs add <slug>`. Register in `src/components.ts` if used in MDX. |
| Feature recipe | `bunx nimbus-docs add <feature-slug>`. Pipe the printed brief to your agent. |
| Custom page route | Add a file under `src/pages/`. |
| Custom OG style | Edit `src/pages/og/_og-card-config.ts`. |
| Check for updates | `bunx nimbus-docs outdated` — starter files behind their tag + registry components behind. |
| Upgrade a starter file | `bunx nimbus-docs diff <file>` to review, `diff --apply <file>` to pull a clean upstream change. |
| Upgrade a registry component | `bunx nimbus-docs add <slug> --overwrite`, then review with `git diff`. |

List installable items: `bunx nimbus-docs list`.

## Audit this site

When asked to audit, walk the categories below. Emit findings as:

```
- [error|warn|info] FILE:LINE — what + why + fix.
```

End with `Summary: N errors, N warnings.`

- **Config** — `astro.config.ts` calls `nimbus(defineNimbusConfig({ ... }))`; `site` is set; `editPattern` (if set) contains `{path}`; `output:` matches the deploy target.
- **Content** — `content.config.ts` registers `docsCollection()` (and `partialsCollection()` if used); every `.mdx` is inside a registered collection; frontmatter validates.
- **Sidebar** — every sidebar ref resolves to a content entry; no orphans; no slug collisions.
- **MDX** — every PascalCase component in `*.mdx` is registered; every `<Render file=...>` resolves; code-fence languages are valid.
- **Routes** — `llms.txt.ts`, `robots.txt.ts`, `[...slug]/index.md.ts`, `og.png.ts`, `og/[...slug].ts` all exist.
- **Registry hygiene** — every `src/components/ui/<slug>/` is either MDX-registered or imported in `src/`; transitive deps (`lib/cn.ts`, etc.) exist.
- **AI surface** — `<AgentDirective />` renders in `BaseLayout.astro`; doc `<head>` has `<link rel="alternate" type="text/markdown" ...>`.
- **Search** — `data-pagefind-body` is on the docs main wrapper; after `pnpm build`, `dist/pagefind/` exists with ≥1 indexed page.
- **Cloudflare** (if applicable) — `wrangler.jsonc` has `name`, `compatibility_date`, `assets.directory = "./dist"`, `not_found_handling`.

## Don't

- Hand-add components under `src/components/ui/` that exists in the nimbus-docs registry — use `nimbus-docs add` so deps resolve.
- Import `.mdx` files directly — use `<Render file="..." />`.
- Attach remark/rehype plugins via `mdx({ remarkPlugins })` directly — this app overrides Nimbus's default Sätteri processor with `unified()` (see `astro.config.ts` and "Appaloft-specific notes" below) specifically so plugins like `astro-mermaid` see the pipeline; register new plugins as Astro integrations (`astro-mermaid`'s pattern) instead of the MDX integration option.
- Remove `<AgentDirective />` unless asked.
- Edit `src/components.ts` to bypass registration — if a component is used in `.mdx`, register it.

## Project home

[nimbus-docs.com](https://nimbus-docs.com)

## Appaloft-specific notes

This package replaces the former Fumadocs/Next `@appaloft/docs` app (see
[ADR-101](../../docs/decisions/ADR-101-nimbus-public-documentation-platform.md) and
[IA v3](../../docs/documentation/public-docs-structure.md)). A few deviations from a
stock Nimbus scaffold, and known follow-ups:

- **Base path / site URL** come from `APPALOFT_DOCS_BASE` (default `/docs`) and
  `APPALOFT_DOCS_SITE` (default `https://docs.appaloft.com`) via `src/lib/config.ts`,
  not hardcoded in `astro.config.ts`. Run `bun run build` with either
  `APPALOFT_DOCS_BASE=/` (official `docs.appaloft.com` build) or the default `/docs`
  (embedded self-hosted build) — both must succeed.
- **Locales**: zh-CN content lives at the collection root (`src/content/docs/<group>/*.mdx`);
  en-US mirrors it one level down under `en/` (`src/content/docs/en/<group>/*.mdx`).
  `src/lib/locale.ts` filters Nimbus's single global sidebar tree
  (`src/lib/sidebar-config.ts`) per page locale. `src/lib/locale-preference.ts` and
  `src/lib/locale-sync.client.ts` port the old Fumadocs app's cookie logic
  (`appaloft.locale`, shared with `apps/web` and the Cloud console) — don't
  reintroduce a docs-only locale preference.
- **Content stubs**: every IA v3 page currently in this collection was generated as a
  minimal stub (real `title`/`description`, a one-paragraph intro, and a "待补全章节 /
  Sections to complete" TODO checklist derived from the page's `docType`). Fleshing
  these out into full task/concept/reference/troubleshooting pages per
  `docs/documentation/public-docs-structure.md` "Page Types" is a separate, tracked
  follow-up — do not treat the presence of a stub page as "content done."
- **Cloud group** (`cloud/*.mdx`, `en/cloud/*.mdx`) ships open-source placeholders only.
  Each one renders `<CloudBadge locale="..." />` and links to
  `https://docs.appaloft.com/cloud/`. The Appaloft Cloud private repository is expected
  to inject real content into these same collection paths for the official build later
  (not implemented by this migration) — see ADR-101 "Cloud-Only Content".
- **Mermaid** renders via `astro-mermaid` on top of Nimbus's `unified()` markdown
  processor override (`astro.config.ts`) instead of the default Sätteri processor.
  `start/first-deployment.mdx` and `deliver/lifecycle.mdx` (and their `en/` mirrors)
  intentionally carry a mermaid diagram each to prove this pipeline end to end — treat
  a Mermaid regression on either page as a build-blocking regression, not a content nit.
- **OpenAPI**: `scripts/generate-openapi.mjs` (run from `scripts/dev.mjs` /
  `scripts/build.mjs` before `astro dev`/`astro build`) calls `@appaloft/openapi` and
  writes `public/openapi.json`, which Astro copies to `dist/openapi.json` unchanged.
  `reference/openapi.mdx` embeds it via `<OpenApiReference />`
  (`src/components/OpenApiReference.astro`) as a link + iframe. This is a v1 shim — a
  richer embedded Scalar/Swagger viewer (matching the old `fumadocs-openapi` UX) is a
  follow-up, not a blocker for the Astro cutover. `public/openapi.json` is
  build-generated and gitignored; don't hand-edit or commit it.
- **`@appaloft/design`**: `src/styles/globals.css` imports
  `@appaloft/design/styles/tokens.css` and remaps Nimbus's `--nb-*` variables (colors,
  fonts, radii) onto the shared design tokens instead of Nimbus's defaults, and
  `BaseLayout.astro`'s theme script sets both `data-mode` (Nimbus) and `data-theme`
  (`@appaloft/design`) so dark mode stays in sync across both systems. Prefer
  `@appaloft/design` tokens over new hardcoded colors/fonts/radii when touching styles.
- **Removed from the old Fumadocs app**: `next.config.mjs`, `source.config.ts`,
  `src/app/**`, `src/mdx-components.tsx`, all `fumadocs-*`/`next`/`react` dependencies,
  and `wrangler.jsonc` (this app does not deploy to Cloudflare Pages directly — the
  Appaloft Cloud composition root packages `dist/` as a static bundle instead).
- **Known gaps / TODOs**: no automated locale/link/search checker yet (tracked at the
  IA v3 doc level, not specific to this app); the Cloud-injection contract described
  above is unimplemented; per-page content depth still needs a dedicated Docs Round.
- **`satteri`/`@astrojs/markdown-satteri` are direct dependencies** even though this
  app overrides Nimbus's HTML `markdown.processor` with `unified()`. Nimbus's markdown
  ↔ MDX twin generator (`/llms.txt`, `[...slug]/index.md.ts`) unconditionally imports
  Sätteri's `mdxToMdast`, and Sätteri ships a native `.node` binding. `astro build`'s
  "prerender" Vite environment bundles page code into `dist/.prerender/chunks/*.mjs`;
  without `keepSatteriNativeBindingExternal()` in `astro.config.ts` (a `configEnvironment`
  Vite plugin hook — a plain `vite.ssr.external` is *not* enough, Astro's own
  `vitefu`-based dependency crawl ignores it for the `prerender`/`ssr`/`client`
  environments) both packages get inlined, and the bundled binding `require()` then runs
  from the wrong directory and throws "Cannot find native binding" even though it's
  installed. Don't remove either dependency or that plugin without re-verifying
  `bun run build` for both `APPALOFT_DOCS_BASE=/` and the default `/docs`.
- **`APPALOFT_DOCS_BASE` must resolve to a trailing-slash base** (`src/lib/config.ts`'s
  `normalizeDocsBase` enforces this, e.g. `/docs/`, not `/docs`, except the bare `/`
  case). Astro sets `import.meta.env.BASE_URL` to the exact `base` config string with
  no normalization, and Nimbus's `NimbusHead.astro` builds the favicon/Shiki CSS URLs
  via straight concatenation (`` `${import.meta.env.BASE_URL}favicon.ico` ``) — a
  base without a trailing slash silently produces a broken `/docsfavicon.ico` link
  instead of a build error, so don't "simplify" this back to a bare `/docs`.
- **Entry ids for nested `index.mdx` files drop the `/index` segment.** Astro's `glob()`
  loader (which `docsCollection()` wraps) folds a nested `index.mdx` into its parent
  directory's id — `src/content/docs/en/index.mdx` has entry id `"en"`, not
  `"en/index"` — while a *root-level* `index.mdx` keeps id `"index"` (no parent to fold
  into). `src/pages/en/index.astro` and the `[...slug].astro` exclusion filter both
  depend on this; get it wrong and the `/en` build either 404s or throws
  "entry ... was not found" only during `astro build` (not `astro dev`, which resolves
  content lazily and can mask this).
