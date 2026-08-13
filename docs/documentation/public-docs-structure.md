# Public Documentation Structure

> GOVERNING DOCUMENT
>
> This file defines how Appaloft public user documentation is organized. It governs the `apps/docs`
> site, Web `?` help links, CLI documentation links, HTTP/API descriptions, and future MCP/tool
> documentation surfaces.
>
> This is **IA v3**. The platform, Markdown processor, and toolchain that render this IA are
> governed by [ADR-101: Nimbus Public Documentation Platform](../decisions/ADR-101-nimbus-public-documentation-platform.md).
> The Docs Round contract, help-anchor registry contract, and packaging contract remain governed by
> [ADR-030](../decisions/ADR-030-public-documentation-round-and-platform.md). IA v3 replaces IA v2's
> superseded eleven-group table; see `Current Implementation Notes And Migration Gaps` for cutover
> status.

## Normative Contract

Public documentation is a user-facing product surface. It is not a rendered copy of the internal
specification tree.

Internal specs explain how Appaloft is designed and implemented. Public docs explain what a user is
trying to do, what input means, what Appaloft will do, what output means, and how to recover when a
step fails.

Public docs must prefer task language over internal architecture language. Terms such as aggregate,
bounded context, command handler, value object, repository, port, adapter, and process manager must
not appear in primary user journeys unless the page is explicitly an advanced contributor or
operator reference.

Public docs must also share the Appaloft product design language. `apps/web` is the reference
surface for tokens; `apps/docs` and future `www` must consume `@appaloft/design` rather than
redefining product fonts, colors, radius, shadows, or Tailwind theme names locally.

Every user-visible behavior that changes input, output, status, recovery, workflow sequencing, or
entrypoint affordances must have one of these Docs Round outcomes:

- documented on a public task, concept, troubleshooting, or reference page;
- linked to an existing public anchor that already covers the behavior;
- explicitly marked not user-facing with a reason;
- recorded as a migration gap with the missing page, anchor, and entrypoint surfaces named.

## Source Relationship

Public docs are downstream of governing specs:

1. Accepted ADRs in `docs/decisions/**`.
2. Business operation relationships in `docs/BUSINESS_OPERATION_MAP.md`.
3. Public operation catalog in `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts`.
4. Global contracts in `docs/errors/**` and `docs/architecture/**`.
5. Local command, query, event, workflow, error, testing, and implementation docs.
6. Public documentation pages and help anchors.

If public docs conflict with accepted ADRs or normative local specs, update the public docs or open
a Spec Round. Do not silently change implementation to match stale public docs.

## Information Architecture

The public docs structure must have at least two levels: a user task or product-area group, then
pages that own stable help anchors. Public docs pages must live under the canonical product-area
groups; top-level pages are limited to locale landing pages such as `index.md`.

IA v3 regroups IA v2's eleven product-area groups around eleven pain-point-oriented groups. Two changes
motivated the redesign: `Deploy`, `Projects And Resources`, and `Integrations` overlapped heavily in
practice (a user configuring a source and a runtime profile was already mid-deployment), and Agent
Workspace/Sandbox content existed as real pages without a home in the governing group description.
IA v3 folds day-to-day delivery concerns into one group and makes Agent Workspace/Sandbox explicit
members of the Agent group instead of orphaned pages.

The canonical IA v3 groups are:

| # | Group | Required pages | Purpose | Primary audience |
| --- | --- | --- | --- | --- |
| 1 | 开始 · Start | First deployment, product mental model, local serve path, choosing an entrypoint. | First successful path and entrypoint choice. | New users |
| 2 | 日常交付 · Deliver | Source inputs, deployment lifecycle, preview cleanup, rollback/recovery, projects, resources, source/runtime/health/network profiles, GitHub repositories, providers, plugins. | Explain how Appaloft turns input into a running, redeployable, recoverable deployment, including the resources and integrations that shape it. | Operators and developers |
| 3 | 目标机器 · Servers | Register servers, SSH credentials, connectivity tests, proxy readiness, terminal sessions. | Explain deployment targets and safe server access. | Operators |
| 4 | 配置与环境 · Configuration | Environments, variables, secrets, precedence, snapshots, diff/promote, config file reference. | Explain deploy-time configuration and safe secret handling. | Operators and developers |
| 5 | 域名与访问 · Access | Generated access URLs, default access policy, custom domains, ownership, certificates, DNS troubleshooting. | Explain how deployed resources become reachable. | Operators |
| 6 | 排障 · Troubleshoot | Status, logs, health summaries, diagnostics, common failures, safe support payloads. | Explain what happened and how to recover safely. | Operators and support |
| 7 | Agent 与 Sandbox · Agents | Full Appaloft skill, agent deploy subprotocol, Agent Workspace lifecycle, Sandbox model, Workspace Collaboration, terminal/TUI attach, and future tool/skill protocols. | Explain how AI agents and agent-hosting Workspaces use existing Appaloft entrypoints safely. | Agent authors, automation users, and Agent Workspace operators |
| 8 | 参考 · Reference | CLI, HTTP API, Web console, errors, statuses, configuration reference. | Provide exact commands, routes, fields, and status contracts. | Automation authors and integrators |
| 9 | 自托管 · Self-Hosting | Binary bundle, Docker image, static asset overrides, database status/migration, backup/restore, upgrade. | Explain operating Appaloft itself. | Self-hosters and platform operators |
| 10 | 平台迁移 · Migrate | Import from Railway and other platforms, review digest-bound plans, apply/resume, verify, and exactly clean receipt-owned state. | Explain how to leave another platform without inventing a second Appaloft lifecycle or bypassing existing safety guards. | Operators migrating existing applications |
| 11 | Cloud | Cloud-only reference pages (permissions/RBAC, managed Sandbox, billing, hosted-only operations). Placeholder pages in open-source builds; real pages injected only in the official build. | Explain Cloud-exclusive behavior without pretending it exists in self-hosted builds, and without hiding that it exists. | Cloud users; self-hosters evaluating Cloud |

Each group may keep an overview page as an orientation entry, but the overview must not be the only
page. Groups that own user input, recovery, or reference semantics must split those concerns into
nested task, concept, troubleshooting, or reference pages. Product help links must target the most
specific nested page available, not the group overview.

Group 7 (Agent 与 Sandbox) must document Agent Workspace and Sandbox as first-class task/concept
pages, not as an implicit consequence of the Appaloft skill page. At minimum it must cover: what an
Agent Workspace is and how it relates to a Sandbox; how to create, connect to, and clean up a
Workspace; how Workspace Collaboration and hibernation/recovery behave; and how agent adapters are
installed and selected. This closes the IA v2 gap where `agent/workspaces.md` and
`agent/sandboxes.md` existed as content but were absent from the governing group description.

Legacy top-level seed pages and IA v2 group/page paths are not retained after IA v3 cutover. New
public docs work must add pages under the IA v3 groups instead of adding top-level topic pages or
resurrecting IA v2 paths. Per [ADR-101](../decisions/ADR-101-nimbus-public-documentation-platform.md),
the IA v3 cutover is a big-bang replacement together with the platform swap: there is no dual-IA or
dual-URL transition period, and content should be rewritten for the new grouping rather than ported
verbatim from IA v2 pages.

## Cloud-Only Content

The Cloud group (IA v3 group 11) is visible in every build, including open-source self-hosted
builds. Its content differs by build:

- **Open-source build**: every page in the Cloud group that has no Cloud-injected replacement
  renders a placeholder stating the feature is available only on the official Cloud docs, with a
  link to `https://docs.appaloft.com/cloud/`. The placeholder page and the Cloud nav-group entry are
  ordinary public-repository content, authored and versioned like any other page.
- **Official build** (`docs.appaloft.com`): the Appaloft Cloud private repository injects real
  Cloud-only page content into the same Cloud group content-collection paths before the site is
  built, using the pattern already established by `docs/cloud/public-docs/**` in `appaloft-cloud`
  and `scripts/inject-cloud-docs.mjs`. Injected pages are not committed to this public repository;
  only the placeholder, the nav scaffold, and the injection target contract are.

The injection contract that Cloud-owned pages must satisfy:

- target a specific content-collection path under the Cloud group for each locale (for example a
  `zh-CN` and an `en-US` sibling per page, matching this repository's other locale collections);
- carry the same frontmatter shape as other reference pages (`title`, `description`, `docType`,
  `localeState`, `searchAliases`, `relatedOperations`, `sidebar`);
- render a visible "Cloud" badge at the top of the page so readers can tell Cloud-only content apart
  from Community content without inspecting the URL;
- be idempotently removable: the injection tooling must refuse to delete a target file that does not
  carry its generated-content marker, so a manual edit is never silently destroyed.

Cloud-only pages must never be required reading for a self-hosted user to complete a Community task;
if a Community task's only documentation lives behind a Cloud-only page, that is a Docs Round defect,
not an acceptable Cloud/Community boundary.

## Page Types

### Task Pages

Task pages guide a user through a goal.

Required sections:

- goal;
- when to use this task;
- prerequisites;
- inputs and defaults;
- Web steps when supported;
- CLI steps when supported;
- HTTP/API steps when supported;
- expected output and status;
- verification;
- rollback or recovery;
- troubleshooting links;
- related reference pages.

Task pages should include command snippets only when they are executable through public entrypoints.
They must not require repository inspection or database access to prove success.

### Concept Pages

Concept pages explain durable product terms.

Required sections:

- short definition;
- why the concept exists;
- where users see it in Web, CLI, and API;
- common mistakes;
- related tasks;
- advanced details when useful.

Concept pages must start with user-observable meaning before discussing internal mechanisms.

### Reference Pages

Reference pages enumerate options, fields, commands, statuses, or APIs.

Required sections depend on reference type:

- stable identifier or command name;
- input fields, defaults, and validation;
- output fields and status values;
- error codes and recovery hints;
- examples;
- related tasks.

Reference pages should not be the only page explaining a common task.

HTTP API reference pages must also expose a stable OpenAPI and Scalar reference entry. That entry
must name the runtime OpenAPI document path `/api/openapi.json`, the runtime Scalar reference path
`/api/reference`, and the docs-generated OpenAPI reference path `/docs/reference/openapi/`. The
generated OpenAPI document must tag operations by Appaloft business domain so Scalar and generated
docs do not present a flat route list. The generated OpenAPI pages are a derived reference surface
for integrators and automation authors; they must not replace task-oriented docs pages, stable
public anchors, or shared operation schema descriptions. Framework-neutral OpenAPI generation and
Scalar rendering should remain importable from `@appaloft/openapi` so Bun/Elysia composition roots
and docs builds can consume the same document without coupling docs content to the HTTP adapter.

### Troubleshooting Pages

Troubleshooting pages explain failures and recovery.

Required sections:

- symptom;
- likely causes;
- how to inspect status, logs, events, diagnostics, or access route state;
- safe recovery steps;
- when to retry;
- when to roll back;
- what support/debug payload to copy.

Troubleshooting pages must treat secret masking and safe diagnostic sharing as first-class.

### Diagrams

Any diagram that describes current architecture, workflow sequencing, deployment lifecycle, or
Agent/Sandbox state must be authored as a fenced ```` ```mermaid ```` block, not a checked-in static
image. [ADR-101](../decisions/ADR-101-nimbus-public-documentation-platform.md) sets the Markdown
processor specifically so Mermaid renders correctly; pages should use that capability instead of
drawing an SVG that will drift from the process it describes. Hand-drawn or exported images remain
acceptable only for content that is not derived from a described process, such as marketing
artwork, screenshots of real UI, or photography.

## Stable Help Anchors

Every page section targeted by product help must use an explicit stable anchor. The anchor must be
stable across translated heading text.

Anchor ids should use this shape:

```text
<surface-or-topic>-<short-purpose>
```

Examples:

- `resource-runtime-profile-start-command`;
- `server-ssh-credential-path`;
- `environment-variable-build-vs-runtime`;
- `domain-binding-ownership-check`;
- `deployment-status-verifying`;
- `diagnostic-summary-copy-support-payload`.

Generated heading ids are allowed for normal reading, but product help links must use explicit
anchors from the help registry once that registry exists.

## Entrypoint Coverage

For each user-visible operation, public docs must decide the state of each relevant surface:

| Surface | Required documentation decision |
| --- | --- |
| Web | Input control, read-only display, not applicable, or deferred gap. |
| CLI | Flag, positional argument, interactive prompt, config-file field, not applicable, or deferred gap. |
| HTTP/oRPC | Route/client call, input schema, output shape, not applicable, or deferred gap. |
| Repository config | Canonical field, validation, precedence, not applicable, or deferred gap. |
| Future MCP/tool | Tool parameter, description, result shape, not applicable, or deferred gap. |

If the same behavior is available on multiple surfaces, docs must use the same public vocabulary
for the same concept.

## Spec And Surface Traceability

Public docs are not a rendered copy of internal specs, but every product-help topic should remain
traceable to the internal behavior contract that governs it.

Traceability records should answer three questions:

- which public page and stable anchor explains the behavior for users;
- which ADR, command, workflow, error, or testing spec governs the behavior;
- which Web, CLI, HTTP/API, repository config, or future MCP surface links to that public anchor.

The canonical machine-readable source is `@appaloft/docs-registry`. Human-readable traceability
notes live in [Public Docs Traceability](./public-docs-traceability.md). These records should use
public topic ids and file paths, not internal DDD vocabulary in user-facing pages.

Every public or Cloud code change must classify its docs outcome before merge — see
[Docs Round](../../skills/domain-driven-develop/references/docs-round.md) for the general checklist
and [Docs Impact Gate](../../skills/docs-impact-gate/SKILL.md) for the actionable, repository-specific
version. A change is not ready to merge with an undeclared docs outcome, even when the eventual
outcome is "not user-facing."

## Localization

The initial public docs locales are:

- `zh-CN`;
- `en-US`.

The default authoring language may be `zh-CN` during early product shaping, but each public docs
page must declare its locale state:

- `complete`;
- `stub`;
- `needs-update`;
- `deferred`.

Locale gaps are allowed before first formal release when they are explicit. Help anchors and topic
ids must remain stable across locales. Both `zh-CN` and `en-US` must reach `complete` locale state
for a page before its owning Docs Round is considered closed; `stub`/`needs-update`/`deferred` are
allowed only as a recorded interim state, not a permanent one.

Translated pages must not localize URL anchor ids used by product help.

Public docs, `apps/www`, and the Cloud console share one locale preference through the
`appaloft.locale` cookie (set with `PUBLIC_APPALOFT_LOCALE_COOKIE_DOMAIN` scoped to the shared parent
domain). A locale choice made on any one of the three surfaces must be honored by the other two;
`apps/docs` must read and write this exact cookie name rather than introducing a docs-only locale
preference. Content collections remain the mechanism for locale separation (a `zh-CN` collection and
an `en-US` sibling collection per page), matching how versioning would also be modeled if Appaloft
ever needs multi-version public docs.

## Search And Discovery

Each public docs page should declare search metadata:

- title;
- description;
- keywords;
- related operation keys when applicable;
- aliases for common CLI terms, Web labels, and API field names;
- troubleshooting symptoms when applicable.

Search must help users find concepts even when they use competitor or generic terms such as app,
service, server, target, environment variables, domain, logs, health check, rollback, or preview.

## Agent-Readable Documentation

Public docs should expose an agent-readable map.

The target contract is:

- a curated `/llms.txt`;
- a fuller `/llms-full.txt` or equivalent generated bundle when practical;
- per-page Markdown content or Copy as Markdown affordance;
- stable operation and topic metadata in frontmatter or generated indexes.

Agent-readable docs must not expose secrets, internal-only migration notes, or implementation details
that are not already appropriate for public advanced reference.

The Nimbus platform ships a Markdown twin per page, `/llms.txt`, `/llms-full.txt`, and per-page
structured data by default, which satisfies most of this contract out of the box. Docs Round for a
new page still owns curating what appears in the curated `/llms.txt` index and confirming secrets or
Cloud-injection internals are not leaked through the generated Markdown twin.

## Packaging

Public docs are part of Appaloft's self-hosted product experience.

The target runtime contract is:

- Web console served from embedded or overridden Web static assets;
- public docs served from embedded or overridden docs static assets;
- docs available under `/docs/*`;
- product help links prefer local `/docs/*` paths when served by Appaloft;
- external hosted docs may use the same paths under a public docs domain.

Docs static assets must be packaged separately from Web console assets.

## Current Implementation Notes And Migration Gaps

**This section describes the running implementation, which has not yet caught up to IA v3.** The
normative target is Nimbus/Astro serving IA v3, per
[ADR-101](../decisions/ADR-101-nimbus-public-documentation-platform.md). As of this revision,
`apps/docs` still runs the IA v2 implementation described below, unchanged. The Nimbus/Astro
rewrite, IA v3 content, and Cloud-injection generalization are tracked by
`docs/specs/049-nimbus-docs-platform-migration/` in `appaloft-cloud` (Cloud-side composition and
official-build injection) and by the public tracking issue for the `apps/docs` rewrite. Do not infer
from the presence of this ADR that the migration has landed; check `apps/docs/package.json` for
`fumadocs-*`/`next` versus `@cloudflare/nimbus-docs`/`astro` to know which platform is live in the
current worktree.

`apps/docs` exists as a Fumadocs/Next static documentation application, IA v2 shape.

IA v2 pages exist in `zh-CN` and `en-US` under nested grouped paths such as `deploy/sources`,
`deploy/lifecycle`, `resources/profiles/*`, `servers/credentials/*`,
`environments/variables/*`, `access/domains/*`, `observe/*`, `integrations/*`,
`agent/*` (including `agent/workspaces.md` and `agent/sandboxes.md`, which are real content not yet
reflected in this file's group description prior to the IA v3 rewrite above), `reference/*`, and
`self-hosting/*`. They declare locale state in frontmatter and include stable explicit anchors for
first-pass help-link targets. Legacy top-level seed pages are intentionally removed, and product help
surfaces now target specific nested pages instead of group overviews.

`@appaloft/design` now owns product-facing design tokens and the design-language contract. Web
imports `@appaloft/design/styles/web.css` and remains the reference implementation. Docs imports
`@appaloft/design/styles/docs.css`, which maps the same tokens into Fumadocs/Tailwind variables. The future
`www` surface should import `@appaloft/design/styles/www.css`.

The shell, HTTP adapter, Docker image, install script, and binary bundle now treat docs static
assets as a separate asset surface from Web console assets. Docs are served under `/docs/*` from
embedded assets by default, or from `APPALOFT_DOCS_STATIC_DIR` when that override is configured.

`@appaloft/docs-registry` now provides the initial source-controlled help anchor registry. It
contains stable topic ids, locale docs paths, explicit anchors, owning surfaces, related operation
keys, and search aliases. Web consuming surfaces now include quick deploy, server registration,
resource create, domain binding, resource detail, deployment target, server default-access,
connectivity, runtime logs, diagnostics, and terminal help links for source, server target, SSH
credentials, connectivity testing, environments, variables, resource identity, runtime, health,
network profiles, custom domains, generated access routes, TLS certificates, proxy readiness, safe
diagnostic payloads, runtime logs, and terminal sessions. CLI and HTTP/API descriptions now consume
registry anchors for high-confusion operations such as deployment source, preview cleanup, source
relink, SSH credentials, server connectivity, resource profiles, environment variables, domains,
certificates, logs, health, diagnostics, and terminal sessions.

The same registry also records public docs coverage decisions for every current
`packages/application/src/operation-catalog.ts` key. Operation coverage may point to a documented
topic, mark the operation not applicable to public docs with a reason, or record an explicit
migration gap with the target page or topic. The current operation catalog maps to documented
public topics.

Traceability for high-confusion topics now records governing spec files and Web surfaces in
`@appaloft/docs-registry`, with a human-readable index in
`docs/documentation/public-docs-traceability.md`.

There is still no full automated public docs link, locale, search, or product-help-surface checker.
Registry anchor-source coverage, operation coverage, and packaging coverage exist for the initial
slices.

OpenAPI reference pages are generated through `fumadocs-openapi` inside the docs app. The stable
public path remains `/docs/reference/openapi/`; the Nimbus/Astro rewrite must preserve this exact
path even though the generator changes.

There is no Cloud nav group and no placeholder-page contract in the current IA v2 implementation.
The single existing Cloud-injected page, `docs/cloud/public-docs/permissions.mdx`, is injected today
into a Fumadocs `cloud/` content path with no open-source placeholder sibling; IA v3's Cloud-group
placeholder contract does not exist yet in code.

## Open Questions

- Whether the first hosted public docs domain should use a dedicated docs subdomain or be served
  from the main product domain under `/docs`.
- Whether multi-version public docs are required before the first formal release or can wait until
  after the binary/self-hosted packaging loop is stable. Nimbus's content-collection versioning
  primitive (Decision item 17's shared collection shape) makes this cheaper than it was under
  Fumadocs if the answer becomes yes.
- Whether Sätteri should be revisited once its native plugin ecosystem covers Mermaid/remark-directive
  parity (see ADR-101 Decision item 8); until then `unified(...)` stays the required processor.
