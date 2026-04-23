# ADR-029: Public Documentation Round And Platform

## Status

Accepted

## Context

Appaloft exposes one deployment product through multiple first-class entrypoints:

- CLI;
- HTTP/oRPC API;
- Web console;
- future MCP/tool interfaces.

The existing spec system governs command boundaries, workflow semantics, errors, events, test
matrices, and implementation plans. That is necessary for correct implementation, but it is not
sufficient for users. Public users need task-oriented documentation that explains how to deploy,
configure, observe, troubleshoot, and recover without reading Appaloft's internal DDD, CQRS, or
bounded-context specifications.

Several Appaloft concepts are intentionally precise but easy to confuse at the point of use:
resource profiles, deployment targets, credentials, environment variables, generated access routes,
domain bindings, certificate readiness, runtime logs, diagnostic summaries, and control-plane
modes. Web help affordances such as `?` links, CLI interactive prompts, CLI `--help`, API
descriptions, and future MCP tool descriptions need a stable public documentation target.

If public documentation lives outside the monorepo or is updated separately from specs and code,
the product will drift:

- UI help can link to stale or missing pages;
- CLI prompts can explain behavior differently from Web/API;
- released binaries can be unable to explain themselves offline;
- implementation may be considered complete while the user-facing explanation is missing.

## Decision

Appaloft adds a first-class **Docs Round** to the spec-driven workflow.

Docs Round is the user-facing documentation closure pass for a user-visible behavior. A behavior is
not complete when it changes user-controlled input, output, status, recovery, workflow sequencing,
or entrypoint affordances unless the corresponding public documentation anchors and help mappings
are created or intentionally marked not applicable by the governing docs.

Public documentation is source-controlled in this monorepo. The deployable documentation app should
live under `apps/docs`, and the public documentation source should live with that app unless a
future ADR extracts a shared `packages/docs-content` package for generated indexes or reusable
content processing.

Public documentation must use the same product design language as the Web console. The canonical
design package is `@appaloft/design`; Web remains the reference surface for product tokens, and
Docs/www consume those tokens instead of redefining font, color, radius, shadow, or Tailwind theme
variables locally.

The public documentation site technology is **Astro Starlight** unless a later ADR supersedes this
decision. Starlight is selected because it fits Appaloft's current requirements:

- static documentation output;
- fast page delivery and low runtime JavaScript by default;
- built-in Pagefind search for static sites;
- internationalization support;
- Tailwind-compatible customization path;
- Bun-compatible development and build flow through Astro;
- component and override mechanisms for Appaloft-specific help widgets;
- a credible path to `llms.txt` and Markdown-friendly agent consumption.

Docusaurus remains the fallback choice if Appaloft later needs first-class multi-version
documentation that Starlight cannot support without excessive custom work. VitePress is not selected
because its versioning story is weaker for Appaloft's expected release documentation needs and its
current major line is less stable than the alternatives.

## Docs Round Contract

Docs Round must operate from the public user point of view. It must not mirror internal spec
folders one-to-one.

For a changed user-visible behavior, Docs Round must decide and document:

- which public task page or reference page owns the explanation;
- which stable heading anchors Web `?` links, CLI help, API descriptions, and future MCP/tool
  descriptions may target;
- whether the behavior needs a concept page, an operation page, a troubleshooting entry, or a
  reference entry;
- which entrypoints are documented: Web, CLI, HTTP/oRPC, repository config file, and future MCP/tool
  surfaces when relevant;
- what user input means, including defaults, validation, masking, secret handling, and precedence;
- what observable output, status, events, logs, access routes, and recovery actions mean;
- whether localized content is available, intentionally deferred, or not applicable;
- which search keywords and aliases should lead users to the page;
- whether `llms.txt`, per-page Markdown export, or agent-oriented summaries need updates.

Docs Round must not expose internal DDD terms, aggregate names, value-object names, repository
names, command-handler classes, or provider SDK details as the primary user-facing explanation.
Those terms may appear only in advanced reference pages when they are directly useful to operators
or integrators.

## Public Documentation Structure

The normative structure rules for public docs live in
[Public Documentation Structure](../documentation/public-docs-structure.md).

The public docs top-level information architecture is task-oriented:

- Start here;
- Concepts;
- Deploy an app;
- Configure resources;
- Servers and credentials;
- Environments and variables;
- Domains and access;
- Observe and troubleshoot;
- CLI reference;
- HTTP API reference;
- Web console guide;
- Advanced reference.

Internal governing specs remain under `docs/decisions/**`, `docs/commands/**`, `docs/queries/**`,
`docs/events/**`, `docs/workflows/**`, `docs/errors/**`, `docs/testing/**`, and
`docs/implementation/**`. Public docs may link to internal specs only from contributor or advanced
reference pages, never as the main user journey.

## Help Anchor Registry

Every public documentation page that supports product help links must use stable explicit anchors.

Future implementation should provide a generated or source-controlled help anchor registry that can
be consumed by:

- Web console `?` affordances;
- CLI prompt/help rendering;
- HTTP/OpenAPI/oRPC descriptions;
- future MCP/tool descriptions;
- link and coverage checks.

The registry must identify:

- stable topic id;
- public URL path;
- explicit anchor;
- locale coverage;
- related operation key when applicable;
- owning public docs page;
- relevant Web/CLI/API surfaces;
- search aliases.

Generated anchors derived only from translated heading text are not stable enough for product links.

## Packaging And Binary Contract

Public documentation must be available in self-hosted and local-first installs.

The release/binary packaging target is:

- Web console static assets remain embedded as console assets;
- public documentation static assets are embedded separately as documentation assets;
- the HTTP adapter serves documentation under `/docs/*` by default;
- a runtime override such as `APPALOFT_DOCS_STATIC_DIR` can replace embedded documentation assets;
- Web console `?` links and CLI docs/help links resolve to the served documentation path when the
  local server is running;
- binary bundles document both Web and Docs static asset override environment variables.

Docs assets must not be merged into Web console assets in a way that prevents independent override,
cache policy, or route ownership.

## Quality And Coverage Contract

Public documentation quality is governed by
[Public Documentation Test Matrix](../testing/public-documentation-test-matrix.md).

At minimum, future automated checks should cover:

- broken internal and public links;
- missing explicit anchors for help topics;
- stale help registry entries;
- missing operation-to-doc coverage for user-visible catalog entries;
- invalid locale routing or untranslated required shell UI strings;
- search index inclusion for public task and troubleshooting pages;
- `llms.txt` generation or curated agent index validity;
- binary/static packaging route smoke coverage.

Docs Round can record temporary gaps, but gaps must be explicit and must not weaken the normative
public documentation contract.

## Consequences

- Public documentation becomes a required delivery surface for user-visible behavior, not a
  marketing-site afterthought.
- `apps/docs` is the expected documentation app location in the monorepo.
- `apps/docs` may use Astro, Starlight, Tailwind, and documentation-only tooling, but must not
  depend on `packages/core` or `packages/application`.
- `apps/docs` and future `www` must consume `@appaloft/design` so product surfaces share the same
  typography, color semantics, radius, shadows, and Tailwind theme vocabulary.
- Public documentation structure diverges intentionally from internal spec structure.
- Web, CLI, API, and future MCP/tool help should converge on stable documentation anchors.
- Binary and release packaging must plan for documentation assets separately from Web console
  assets.

## Governed Specs

- [Public Documentation Structure](../documentation/public-docs-structure.md)
- [Public Documentation Test Matrix](../testing/public-documentation-test-matrix.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)

## Migration Notes

Current implementation has an `apps/docs` Starlight/Astro application with:

- static output configured for the `/docs` base path;
- `zh-CN` root locale and `en-US` locale content;
- IA v2 nested documentation paths for start, deploy, resources, servers, environments, access,
  observe, integrations, reference, and self-hosting content;
- legacy top-level seed pages intentionally removed after IA v2 cutover;
- Pagefind search index generation through Starlight;
- stable explicit anchors in specific nested pages rather than group-only overview pages;
- a curated `llms.txt` file.

Current implementation has a shared `@appaloft/design` package with:

- Web-derived CSS tokens for color, radius, shadows, and typography;
- Tailwind v4 `@theme inline` mappings for product color and radius utilities;
- Web, Docs, and future www CSS entrypoints;
- a canonical `packages/design/DESIGN.md` design-language contract.

`apps/web` imports `@appaloft/design/styles/web.css`. `apps/docs` imports
`@appaloft/design/styles/docs.css`, which maps the same tokens into Starlight variables so docs
feel like the product manual for the console rather than a separate visual system.

Current implementation also has documentation packaging support:

- binary bundles embed public documentation assets separately from Web console assets;
- the HTTP adapter serves embedded or overridden docs assets under `/docs/*`;
- `APPALOFT_DOCS_STATIC_DIR` can override docs assets without replacing Web console assets;
- Docker and local install paths carry the docs static directory alongside Web static assets;
- packaging smoke coverage exists for `PUB-DOCS-013` and `PUB-DOCS-014`.

Current implementation has an initial `@appaloft/docs-registry` package that records stable help
topic ids, locale-aware docs paths, explicit anchors, owning surfaces, related operation keys, and
search aliases. Web consuming surfaces now include quick deploy, server registration, resource
create, domain binding, resource detail, deployment target, server default-access, connectivity,
runtime logs, diagnostics, and terminal help links for source, server target, SSH credentials,
connectivity testing, environments, variables, resource identity, runtime, health, network
profiles, custom domains, generated access routes, TLS certificates, proxy readiness, safe
diagnostic payloads, runtime logs, and terminal sessions. CLI and HTTP/API descriptions consume
registry anchors for high-confusion operations such as deployment source, preview cleanup, source
relink, SSH credentials, server connectivity, resource profiles, environment variables, domains,
certificates, logs, health, diagnostics, and terminal sessions.

The registry also records a public docs coverage decision for every current operation catalog key.
The `PUB-DOCS-002` contract test checks that operation coverage stays complete as
`packages/application/src/operation-catalog.ts` changes. The current operation catalog maps to
documented public topics.

Current implementation still has no full automated public documentation coverage checker for all
links, locale drift, search freshness, or full Web/CLI/API/MCP surface adoption.

Tailwind Vite plugin integration for Docs is deferred because the current Tailwind v4 Vite plugin
path fails against the repository's current Vite 8/Rolldown dependency set during static docs
builds. The docs app still consumes `@appaloft/design` tokens and fonts; it does not yet consume the
Tailwind entrypoint directly.

Until those are implemented, user-visible Code Rounds must still identify the intended public docs
page and anchor in specs or migration gaps when the behavior changes user-facing input, output,
status, recovery, or entrypoint affordances.
