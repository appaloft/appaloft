# Public Documentation Structure

> GOVERNING DOCUMENT
>
> This file defines how Appaloft public user documentation is organized. It governs the future
> `apps/docs` site, Web `?` help links, CLI documentation links, HTTP/API descriptions, and future
> MCP/tool documentation surfaces.

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
groups once IA v2 exists; top-level pages are limited to locale landing pages such as `index.md`.

The canonical IA v2 groups are:

| Group | Required pages | Purpose | Primary audience |
| --- | --- | --- | --- |
| Start Here | First deployment, product mental model, local serve path. | First successful path and entrypoint choice. | New users |
| Deploy | Source inputs, lifecycle, preview cleanup, rollback and recovery. | Explain how Appaloft turns input into a deployment. | Operators and developers |
| Projects And Resources | Projects, resources, source/runtime/health/network profiles, lifecycle. | Explain what users configure before or during deployment. | Operators |
| Servers And Credentials | Register servers, SSH credentials, connectivity tests, proxy readiness, terminal sessions. | Explain deployment targets and safe server access. | Operators |
| Environments And Configuration | Environments, variables, secrets, precedence, snapshots, diff/promote, config file reference. | Explain deploy-time configuration and safe secret handling. | Operators and developers |
| Access, Domains And TLS | Generated access URLs, default access policy, custom domains, ownership, certificates, DNS troubleshooting. | Explain how deployed resources become reachable. | Operators |
| Observe And Troubleshoot | Status, logs, health summaries, diagnostics, common failures, safe support payloads. | Explain what happened and how to recover safely. | Operators and support |
| Integrations | GitHub repositories, providers, plugins. | Explain external systems and extension points. | Integrators and advanced operators |
| Reference | CLI, HTTP API, Web console, errors, statuses, configuration reference. | Provide exact commands, routes, fields, and status contracts. | Automation authors and integrators |
| Self-Hosting And Operations | Binary bundle, Docker image, static asset overrides, database status/migration, backup/restore, upgrade. | Explain operating Appaloft itself. | Self-hosters and platform operators |

Each group may keep an overview page as an orientation entry, but the overview must not be the only
page after IA v2 cutover. Groups that own user input, recovery, or reference semantics must split
those concerns into nested task, concept, troubleshooting, or reference pages. Product help links
must target the most specific nested page available, not the group overview.

Legacy top-level seed pages are not retained after IA v2 cutover. New public docs work must add
pages under the canonical groups instead of adding top-level topic pages.

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
ids must remain stable across locales.

Translated pages must not localize URL anchor ids used by product help.

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

`apps/docs` exists as a Starlight/Astro static documentation application.

IA v2 pages now exist in `zh-CN` and `en-US` under nested grouped paths such as `deploy/sources`,
`deploy/lifecycle`, `resources/profiles/*`, `servers/credentials/*`,
`environments/variables/*`, `access/domains/*`, `observe/*`, `integrations/*`,
`reference/*`, and `self-hosting/*`. They declare locale state in frontmatter and include stable
explicit anchors for first-pass help-link targets. Legacy top-level seed pages are intentionally
removed, and product help surfaces now target specific nested pages instead of group overviews.

The shell, HTTP adapter, Docker image, install script, and binary bundle now treat docs static
assets as a separate asset surface from Web console assets. Docs are served under `/docs/*` from
embedded assets by default, or from `APPALOFT_DOCS_STATIC_DIR` when that override is configured.

`@appaloft/docs-registry` now provides the initial source-controlled help anchor registry. It
contains stable topic ids, locale docs paths, explicit anchors, owning surfaces, related operation
keys, and search aliases. Web consuming surfaces now include quick deploy, server registration, and
resource create help links for source, server target, SSH credentials, connectivity testing,
environments, variables, resource identity, runtime, health, and network profiles. CLI and HTTP/API
descriptions now consume registry anchors for high-confusion operations such as deployment source,
preview cleanup, source relink, SSH credentials, server connectivity, resource profiles,
environment variables, domains, certificates, logs, health, diagnostics, and terminal sessions.

The same registry also records public docs coverage decisions for every current
`packages/application/src/operation-catalog.ts` key. Operation coverage may point to a documented
topic, mark the operation not applicable to public docs with a reason, or record an explicit
migration gap with the target page or topic. The current operation catalog maps to documented
public topics.

There is still no full automated public docs link, locale, search, or product-help-surface checker.
Registry anchor-source coverage, operation coverage, and packaging coverage exist for the initial
slices.

Tailwind Vite plugin integration is deferred; the initial docs app uses Appaloft CSS variables and
local fonts for theme customization.

## Open Questions

- Whether the first hosted public docs domain should use a dedicated docs subdomain or be served
  from the main product domain under `/docs`.
- Whether multi-version public docs are required before the first formal release or can wait until
  after the binary/self-hosted packaging loop is stable.
