# ADR-101: Nimbus Public Documentation Platform

## Status

Accepted

## Context

[ADR-030](./ADR-030-public-documentation-round-and-platform.md) selected Fumadocs on Next.js static
export as the public documentation platform and introduced **Docs Round** as the user-facing
documentation closure pass for every user-visible behavior change. Docs Round, the IA governance
model, the help-anchor registry, and the packaging contract have proven durable. The Fumadocs/Next
platform choice itself has not:

- Fumadocs/Next brings a full React Server Component build graph and a Node-first toolchain to a
  static documentation site that Appaloft otherwise builds and tests with Bun everywhere else.
- Mermaid diagrams and several other unified/remark-based authoring tools are awkward to wire
  through Fumadocs' MDX pipeline, so the current site leans on hand-drawn SVGs for architecture and
  workflow diagrams. SVGs drift from the code they describe and are expensive to keep current.
- IA v2's eleven top-level groups have accumulated orphaned pages. `agent/workspaces.md` and
  `agent/sandboxes.md` exist and ship in both locales, but the governing IA table's "Agent
  Workflows" group description only names the Appaloft skill and the deploy subprotocol. Agent
  Workspace and Sandbox documentation is real but structurally invisible to anyone reading the
  governing IA contract.
- The public repository has no source-controlled contract for **whether a code change needs a
  docs outcome at all**. Docs Round is normative prose; nothing forces a public or Cloud change to
  declare a docs classification before merge.
- Appaloft Cloud needs Cloud-only reference pages (for example, Cloud RBAC/permissions) to appear
  only in the official `docs.appaloft.com` build, while open-source builds must not silently drop a
  nav entry users might expect. Today this works only for one hand-built page
  (`docs/cloud/public-docs/permissions.mdx`) injected by a private script; there is no public-side
  contract for how open-source builds should represent the Cloud section they cannot render.

Nimbus (<https://nimbus-docs.com/>, `@cloudflare/nimbus-docs`) is an Astro-based documentation
framework that scaffolds a fully owned Astro site into the repository rather than shipping a themed
black box. It ships agent-readable surfaces (Markdown twin per page, `llms.txt`/`llms-full.txt`,
JSON-LD) by default, uses ordinary Astro content collections for both locales and future versioning,
and produces a plain static `astro build` output that Appaloft already knows how to deploy through
Cloudflare Pages Direct Upload.

Nimbus's own build (Astro 7) defaults to **Sätteri**, a Rust-based Markdown/MDX processor. Sätteri
is deliberately not unified-compatible: existing remark/rehype plugins, including Mermaid renderers
such as `astro-mermaid`, silently no-op under Sätteri. Astro 7 and Nimbus both expose an explicit
escape hatch — installing `@astrojs/markdown-remark` and setting `markdown.processor` to its
`unified(...)` export — that restores the full remark/rehype plugin ecosystem at the cost of
Sätteri's performance advantage.

## Decision

Appaloft replaces the public documentation platform with Nimbus on Astro. Docs Round, as defined in
ADR-030, is unchanged: it remains the user-facing documentation closure pass required for user-
visible behavior changes, with the same required outcomes (task/concept/reference/troubleshooting
page, existing anchor, not-user-facing, or migration gap). This ADR supersedes only the **platform
choice** section of ADR-030; ADR-030's Docs Round contract, help-anchor registry contract, and
Public Documentation Structure governance remain in force except where explicitly amended below.

### Platform

1. `apps/docs` is scaffolded and owned as a Nimbus/Astro project (`@cloudflare/nimbus-docs` plus
   `astro`), replacing Fumadocs/Next/React entirely. Nimbus's "own every file" model means layouts,
   components, content collections, and design-token wiring live in `apps/docs/src/**` as ordinary
   repository files, not framework internals.
2. Content lives under Astro content collections (`apps/docs/src/content/docs/**` and locale/Cloud
   sibling collections per the Localization and Cloud-Only Content sections below), matching
   Nimbus's filesystem-is-the-site model: moving a file moves its route and sidebar entry.
3. `apps/docs` continues to consume `@appaloft/design` for typography, color, radius, shadow, and
   Tailwind theme tokens exactly as ADR-030 required for Fumadocs; Nimbus's Tailwind v4 baseline is
   compatible with the existing design package.
4. The docs build remains a plain static Astro build (`astro build` producing `dist/`). It must
   keep `output: "static"` (no Cloudflare Workers/SSR adapter) so the existing Cloudflare Pages
   Direct Upload deployment path in
   `docs/cloud/official-static-site-cloudflare-pages-runbook.md` continues to apply unchanged.
5. `APPALOFT_DOCS_BASE` remains the build-time base-path override for the embedded self-host `/docs`
   mount. Nimbus's `site`/base-path configuration in `astro.config.ts` must read this same
   environment variable so self-hosted, binary, and official builds keep one base-path contract
   instead of forking it per platform.

### Markdown Processor

6. `apps/docs` sets `markdown.processor` to Astro's `unified(...)` pipeline
   (`@astrojs/markdown-remark`) instead of Nimbus's default Sätteri processor, for both `.md` and
   `.mdx` content:

   ```ts
   import { defineConfig } from "astro/config";
   import { unified } from "@astrojs/markdown-remark";
   import mermaid from "astro-mermaid";
   import nimbus, { defineConfig as defineNimbusConfig } from "@cloudflare/nimbus-docs";

   const config = defineNimbusConfig({ /* site, title, sidebar, ... */ });

   export default defineConfig({
     markdown: { processor: unified({ remarkPlugins: [], rehypePlugins: [] }) },
     integrations: [
       nimbus(config, { markdown: { processor: unified() } }),
       mermaid(),
     ],
   });
   ```

7. This choice is made specifically so Mermaid diagrams render through the standard
   remark/rehype ecosystem (for example `astro-mermaid`) without a Sätteri-specific plugin port.
   Diagram-owning pages must prefer a fenced ` ```mermaid ` block over a checked-in SVG for any
   diagram that describes current architecture, workflow sequencing, or lifecycle state; hand-drawn
   SVGs are acceptable only for illustrations that are not derived from a described process (for
   example marketing artwork).
8. If a future ADR revision needs the Sätteri performance profile back, it must first confirm an
   equivalent Mermaid/remark-directive/math story exists under Sätteri's native plugin API
   (`mdastPlugins`/`hastPlugins`); this ADR does not authorize silently dropping Mermaid support to
   regain Sätteri.

### Toolchain

9. Bun remains the default toolchain for `apps/docs`: `bun install`, `bun run dev`, `bun run build`,
   and CI must use Bun exactly like every other public workspace. Astro's static build and dev
   server run correctly under Bun for a `static` (non-adapter) output target, which is the only
   target this ADR authorizes for `apps/docs`.
10. The **one documented Node exception** is the one-time Nimbus repository scaffold. The Nimbus
    scaffolder (`npx @cloudflare/create-nimbus-docs@latest`) states Node 22.12+ as a hard
    requirement for the scaffold step itself, independent of the runtime used afterward for
    dev/build/CI. Contributors may run that one-time scaffold command under Node (via `npx` or an
    ad hoc Node toolchain), but must not introduce an ongoing Node requirement into `apps/docs`
    `package.json` scripts, CI workflows, or the release/build pipeline. Every command that runs
    more than once (dev, typecheck, lint, build, deploy) must run under Bun.
11. If a future Nimbus/Astro/Cloudflare integration package hard-requires Node for an ongoing
    command (not just the one-time scaffold), that requirement must be re-documented as an amendment
    to this ADR with the exact command, the exact reason Bun cannot run it, and the blast radius
    (whether it affects only local dev, or also CI/release).

### Information Architecture

12. The public docs top-level IA moves from IA v2 (eleven groups, see ADR-030's now-superseded
    listing) to **IA v3**, normatively defined in
    [Public Documentation Structure](../documentation/public-docs-structure.md). IA v3 keeps every
    IA v2 concern but regroups around user pain points instead of internal product-area names, and
    it makes Agent Workspace/Sandbox content a first-class part of its owning group instead of an
    unlisted extra.
13. IA v3 adds a tenth top-level group, **Cloud**, that is visible in every build. Its contract is
    defined in the Cloud-Only Content section below.

### Cloud-Only Content

14. Open-source builds of `apps/docs` show the **Cloud** nav group at all times. Every page under
    that group that has no Cloud-injected replacement renders a placeholder page stating that the
    corresponding feature is Cloud-only and linking to `https://docs.appaloft.com/cloud/`. The
    placeholder page content and the nav-group entry are ordinary public-repo content; they are not
    injected and must not be deleted or hidden to "clean up" open-source output.
15. The official Appaloft Cloud build injects real Cloud-only pages into the same nav slots before
    running `astro build`, using the existing private-source-of-truth pattern
    (`docs/cloud/public-docs/**` in `appaloft-cloud`, copied in by
    `scripts/inject-cloud-docs.mjs`) generalized to Nimbus's content-collection paths. Cloud-only
    page source content is not long-lived in this public repository; only the placeholder page, the
    nav-group scaffold, and the injection contract (target collection paths, required frontmatter
    fields, the generated-file marker) live here.
16. Injected Cloud pages must carry a visible "Cloud" badge in the rendered page, matching the
    existing `docs/cloud/public-docs/permissions.mdx` precedent, so a reader of the official site can
    tell Cloud-only content apart from Community content without inspecting the URL.

### Localization

17. Locales remain `zh-CN` (default authoring locale) and `en-US`, both required to reach `complete`
    locale state before this migration is considered closed at the Docs Round level. Nimbus's
    documented internationalization primitive is a per-locale content collection (its own docs use
    a sibling `docs-fr/` collection as the canonical i18n shape); `apps/docs` must follow that same
    shape instead of inventing a page-level locale switch.
18. The shared `appaloft.locale` cookie contract is unchanged: `apps/docs` reads and writes the same
    `appaloft.locale` cookie name and the same `PUBLIC_APPALOFT_LOCALE_COOKIE_DOMAIN` (or equivalent
    Nimbus/Astro-idiomatic env var name carrying the same value and default) used by the Cloud
    console. The canonical marketing site at `apps/site` must adopt the same contract before
    cross-surface locale sync is complete; it does not implement that binding today. This ADR does
    not change the cookie name, shape, or domain scoping; it requires every participating surface to
    use the existing contract instead of introducing a parallel one.
19. Translated pages must keep stable help-anchor ids exactly as ADR-030 requires; Nimbus's
    filesystem-is-the-route model must not be used to let a translated page's slug or anchor drift
    from its source-locale counterpart.

### Packaging

20. The self-hosted/binary/local-first packaging contract from ADR-030 is unchanged: docs static
    assets are packaged separately from Web console assets, served under `/docs/*` by default, and
    `APPALOFT_DOCS_STATIC_DIR` remains the runtime override for embedded documentation assets. This
    ADR only changes what produces the `dist/` directory that gets embedded; it does not change how
    the shell, HTTP adapter, Docker image, or install script consume that directory.

### Cutover

21. This migration is a big-bang replacement of the platform serving `docs.appaloft.com`. There is
    no old-URL compatibility layer, redirect matrix, or dual-serve period between Fumadocs/Next and
    Nimbus/Astro. Because delete-and-rewrite content (see the Governed Specs' IA/content decisions)
    accompanies the platform swap, most page paths change intentionally as part of the IA v3
    redesign; no attempt is made to preserve IA v2 URLs.
22. `docs-registry` topic-to-URL mappings, Web/CLI/API help links, and Cloud Console help links must
    be updated in the same change that flips the official build to Nimbus output. There is no
    dual-platform transition window where both an old and a new public docs URL are expected to
    resolve.

## Docs-Impact Gate

23. Every change to public Appaloft or Cloud code must classify its docs outcome before merge, using
    the same Docs Round outcomes ADR-030 already defines (new page, existing anchor, not user-facing
    with reason, or explicit migration gap). The mechanical checklist for making that classification
    lives in
    [`skills/domain-driven-develop/references/docs-round.md`](../../skills/domain-driven-develop/references/docs-round.md),
    and the actionable, repository-specific version of that checklist lives in
    [`skills/docs-impact-gate/SKILL.md`](../../skills/docs-impact-gate/SKILL.md). This is a workflow
    requirement, not a new registry schema; it reuses `@appaloft/docs-registry` as the
    machine-readable source described in ADR-030 and
    [Public Documentation Structure](../documentation/public-docs-structure.md).

## Consequences

- `apps/docs` drops React, Next.js, and Fumadocs entirely; contributors write Astro components and
  Nimbus-owned MDX content instead.
- Diagrams that describe real architecture or workflow sequencing should be Mermaid, not SVG, going
  forward; existing SVGs describing still-accurate flows may be replaced opportunistically rather
  than all at once.
- Every public docs page moves, because both the platform and the IA change at once. Downstream
  consumers (Web `?` help, CLI help text, HTTP/API descriptions, Cloud Console help links, the docs
  registry) must be re-pointed in the same change, not incrementally.
- `apps/docs` keeps exactly one narrow, explicitly documented Node dependency (the one-time Nimbus
  scaffold command); every recurring command stays on Bun.
- Open-source builds always show a Cloud nav group; users self-hosting Appaloft see what Cloud-only
  documentation exists without it silently disappearing, and without leaking Cloud-only content into
  the public repository.
- Docs classification becomes an explicit, checkable step for both public and Cloud changes, closing
  the gap where a user-visible change could merge with no recorded docs decision at all.

## Rejected Alternatives

- **Keep Fumadocs/Next, add a Mermaid workaround.** Rejected because the underlying friction is
  Fumadocs/Next's Node-first, RSC-heavy toolchain diverging from the rest of Appaloft's Bun-first
  repository, not only the Mermaid gap; patching Mermaid alone would not fix that divergence.
  Docusaurus, ADR-030's stated fallback, was reconsidered and rejected again for the same
  multi-version-first complexity reasons ADR-030 already recorded.
- **Keep Sätteri and hand-port Mermaid to its native plugin API.** Rejected for now because Sätteri's
  plugin API is not the standard remark/rehype ecosystem; hand-porting would create an
  Appaloft-specific fork of a third-party Mermaid integration instead of using the maintained
  `astro-mermaid` package. Revisit only under the amendment path in Decision item 8.
- **Incremental URL-compatible migration (dual-serve old and new platform).** Rejected per the owner
  cutover decision: `docs.appaloft.com` has no external SLA requiring URL stability yet, and a
  delete-and-rewrite content pass makes most IA v2 URLs stale regardless of platform.
- **Hide the Cloud nav group entirely in open-source builds.** Rejected because it would make
  self-hosters unable to discover that Cloud offers additional capabilities documented elsewhere,
  contradicting Appaloft's "public docs should not silently omit product surface" posture.

## Governed Specs

- [Public Documentation Structure](../documentation/public-docs-structure.md)
- [Public Documentation Test Matrix](../testing/public-documentation-test-matrix.md)
- [Public Docs Traceability](../documentation/public-docs-traceability.md)
- [Docs Round reference](../../skills/domain-driven-develop/references/docs-round.md)
- [Docs Impact Gate skill](../../skills/docs-impact-gate/SKILL.md)
- Cloud: `docs/decisions/adr-nimbus-docs-platform-and-cloud-injection.md`
- Cloud: `docs/specs/049-nimbus-docs-platform-migration/`
- Cloud: `docs/testing/nimbus-docs-platform-test-matrix.md`

## Migration Notes

This ADR records the accepted platform/IA/toolchain/Cloud-injection decision. As of this ADR,
`apps/docs` implementation has not yet been migrated: current code still runs the Fumadocs/Next IA
v2 application described in ADR-030's Migration Notes. The Nimbus/Astro IA v3 implementation,
content delete-and-rewrite, docs-registry re-pointing, and Cloud injection generalization are Code
Round work tracked by `docs/specs/049-nimbus-docs-platform-migration/` in `appaloft-cloud` (Cloud
composition, official-build injection, Cloud Console help re-pointing) and by the corresponding
public tracking issue for the `apps/docs` rewrite itself. Until that Code Round lands:

- Web `?` links, CLI help, and API descriptions continue to target the current Fumadocs/Next-served
  paths;
- the current `@appaloft/docs-registry` entries remain valid;
- `docs/cloud/official-static-site-cloudflare-pages-runbook.md` continues to deploy the Fumadocs/Next
  build output unchanged.

Do not treat this ADR as evidence that the Nimbus site is live. Check
`apps/docs/package.json` and `apps/docs/astro.config.ts` (once created) for the actual platform in
the current worktree before assuming which platform is running.
