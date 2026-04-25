---
name: appaloft-develop
description: Appaloft project-specific Domain Driven Develop profile. Use with the installed domain-driven-develop skill when Codex works on Appaloft business behavior, roadmap/version-based next behavior selection, ADR/decision alignment, source-of-truth specs, public docs, tests, Web/API/CLI entrypoints, operation catalog alignment, release-sensitive compatibility impact, or Code Round implementation. This profile only binds Appaloft business facts and repository paths; use domain-driven-develop for the generic Init/Discover/Spec/Docs/Test-First/Code/Sync/Next-Behavior/Post-Implementation workflow and DDD tactical rules.
---

# Appaloft Develop

## Purpose

Use this local profile for Appaloft-specific facts. Use the installed `domain-driven-develop` skill for the generic method, spec-driven-develop rounds, domain modeling guardrails, repository/specification/visitor rules, dependency injection, and verification dimensions.

If `domain-driven-develop` is not visible in the current session, read the installed project copy at `skills/domain-driven-develop/SKILL.md` and its relevant references.

Do not duplicate Appaloft domain facts here. `docs/DOMAIN_MODEL.md`, accepted ADRs, global contracts, local specs, test matrices, and operation catalog entries remain authoritative.

## Source Of Truth

Read Appaloft governing sources in this order before non-trivial behavior work:

1. `AGENTS.md`
2. `docs/decisions/README.md`
3. Relevant accepted ADRs under `docs/decisions/**`
4. `docs/PRODUCT_ROADMAP.md`
5. Release and version sources when release-sensitive:
   - `.codex/skills/release/SKILL.md`
   - `.github/release-please-config.json`
   - `.github/.release-please-manifest.json`
   - `.github/workflows/release.yml`
   - `CHANGELOG.md`
   - `package.json`
   - `scripts/release/**`
6. `docs/BUSINESS_OPERATION_MAP.md`
7. `docs/CORE_OPERATIONS.md`
8. `docs/DOMAIN_MODEL.md`
9. Global contracts:
   - `docs/errors/model.md`
   - `docs/errors/neverthrow-conventions.md`
   - `docs/architecture/async-lifecycle-and-acceptance.md`
10. Relevant local specs:
   - `docs/commands/**`
   - `docs/queries/**`
   - `docs/events/**`
   - `docs/workflows/**`
   - `docs/errors/**`
   - `docs/testing/**`
11. Public docs governance when user-visible:
   - `docs/decisions/ADR-030-public-documentation-round-and-platform.md`
   - `docs/documentation/public-docs-structure.md`
   - `docs/testing/public-documentation-test-matrix.md`
12. Implementation plans under `docs/implementation/**`
13. `packages/application/src/operation-catalog.ts`

Use `docs/ai/**` only as background analysis. It must not override accepted ADRs, the business operation map, global contracts, local specs, public documentation specs, or implementation plans.

## Appaloft Product Target

Appaloft is a backend-core deployment platform, not a web-first CRUD app.

The v1 minimum loop is:

- zero-to-SSH-server setup;
- application deployment;
- basic access path;
- basic domain/TLS capability;
- visible status, errors, events, and monitoring signals.

When asked what to do next, use `domain-driven-develop` Next Behavior Selection, then apply Appaloft ranking:

1. prioritize the v1 minimum loop;
2. inspect `docs/PRODUCT_ROADMAP.md`, `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, operation catalog, ADRs, local specs, and implementation plans;
3. recommend exactly one next behavior;
4. state the next round type, usually Spec Round when governance is missing and Code Round only when specs/tests/docs/readiness are sufficient;
5. do not start the next behavior unless explicitly asked.

## Appaloft Roadmap And Version Gate

Use the installed `domain-driven-develop` `references/roadmap-and-versioning.md` for generic roadmap, version, and SemVer rules.

For Appaloft:

- `docs/PRODUCT_ROADMAP.md` is the release gate for all versions before `1.0.0`.
- Current package and release-line facts live in `package.json`, `.github/.release-please-manifest.json`, `CHANGELOG.md`, and the release-alignment block in `docs/PRODUCT_ROADMAP.md`; do not copy a current version number into this profile.
- Before `1.0.0`, classify public-surface compatibility as `pre-1.0-policy` plus the concrete public impact. Do not use pre-`1.0.0` flexibility to skip roadmap, docs, test, or migration-gap updates.
- Release-sensitive behavior must state roadmap target, intended version target when known, compatibility impact, affected public surfaces, and release-note/changelog/migration requirement.
- Public surfaces include CLI commands and help, HTTP/oRPC schemas, Web-visible behavior, repository config fields, public docs anchors, event schemas, plugin/tool schemas, release artifacts, installation scripts, and generated release manifests.
- If a behavior belongs to a later roadmap phase, do not implement it as current work unless the user explicitly asks to pull it forward; update the roadmap or implementation plan if it is pulled forward.
- If implementation, operation catalog, specs, tests, or public docs disagree with `docs/PRODUCT_ROADMAP.md`, treat that as Sync Round before Code Round.
- When preparing, triggering, publishing, retrying, or explaining an actual release, use the local `release` skill in addition to this profile and follow its explicit confirmation rules.

## Appaloft Ubiquitous Language

Canonical domain language lives in `docs/DOMAIN_MODEL.md`.

Code, docs, tests, events, errors, entrypoints, and public help must use the same bounded-context language. Compatibility aliases are allowed only when the governing docs explicitly name them.

Important current model anchors:

- Project -> Environment -> Resource -> Deployment
- Resource owns new deployment actions and deployment history.
- Deployment is the attempt record.
- DeploymentTarget is the core domain term; CLI/HTTP may still expose `server` as compatibility language only where documented.
- Quick Deploy is an entry workflow, not a domain aggregate.

If a change introduces or renames domain language, update `docs/DOMAIN_MODEL.md` or the governing ADR/spec before Code Round.

## Decision Gate

Use the installed `domain-driven-develop` `references/decisions-and-adrs.md` gate with Appaloft's ADR rules.

Create or update an Appaloft ADR before local specs or code when a behavior changes command/query boundaries, aggregate ownership, lifecycle stages, readiness rules, retry or rollback semantics, durable state shape, public contracts, or canonical domain language.

If the behavior fits existing accepted ADRs and `docs/DOMAIN_MODEL.md`, record the no-ADR-needed rationale in the behavior dossier and continue with the appropriate round.

## Round And Reporting Gate

Use the installed `domain-driven-develop` `references/round-checklists.md` before non-trivial edits and `references/reporting.md` for Discovery, formal round summaries, artifact-state reports, coverage reports, and ready/not-ready output.

For Appaloft formal work, include operation-map position/state, operation catalog and `docs/CORE_OPERATIONS.md` sync state, Web/API/CLI/repository-config/future MCP coverage, public docs/help outcome, test matrix ids, and remaining migration gaps.

When formal work is roadmap or release-sensitive, also include roadmap target, version target when known, compatibility impact, affected public surfaces, and release-note/changelog/migration outcome.

## Business Operation Rules

Before adding or changing a behavior:

- locate it in `docs/BUSINESS_OPERATION_MAP.md`;
- if absent, use Spec Round to add or position it before code;
- if marked rebuild-required, update or create the governing ADR, local specs, test matrix, and implementation plan before implementation;
- for new business capabilities, update both `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts` in the same change.

New business endpoints and CLI commands must map to an operation catalog entry or add one in the same change.

## CQRS Gate

Use the installed `domain-driven-develop` `references/cqrs-with-ddd.md` with Appaloft's CQRS rules in `AGENTS.md`.

For Appaloft:

- business operations exposed through CLI or HTTP dispatch from explicit `Command` or `Query` messages;
- adapters dispatch through `CommandBus` or `QueryBus`, not by calling use cases or repositories directly;
- command/query handlers use `@CommandHandler(...)` or `@QueryHandler(...)` and delegate to use cases/query services;
- command handlers coordinate write-side decisions; aggregates, value objects, domain services, and application services hold business policy;
- query handlers and read models serve read-optimized shapes and must not mutate business state;
- aggregate repositories stay write-side oriented, while read models stay query-shaped;
- transport inputs reuse matching command/query schemas instead of defining parallel transport-only business shapes;
- read/write consistency, async acceptance, projection timing, and user-visible stale-read behavior must be governed by ADR/specs before Code Round.

## Event Gate

Use the installed `domain-driven-develop` `references/domain-events.md` with Appaloft's event specs and async lifecycle rules.

Before changing event behavior:

- read `docs/events/**`, relevant workflow specs, `docs/architecture/async-lifecycle-and-acceptance.md`, `docs/errors/model.md`, and the governing ADRs;
- classify each event as domain event, integration event, application/process event, or projection input;
- document producer, owning bounded context, triggering command/workflow transition, payload fields, canonical terms, and consumers;
- define publication boundary, outbox or dispatch policy, retry, idempotency, ordering, replay/backfill, and failure recovery when applicable;
- keep event handlers and projections from owning write-side aggregate policy;
- update read model/projection specs when event consumption changes observable state;
- add or update testing matrix ids for emitted event, consumed event, payload, projection, retry/idempotency, and replay/backfill behavior when relevant.

If event behavior changes lifecycle ownership, async acceptance, durable state shape, public contract, or cross-boundary language, update an ADR before local specs or code.

## Testing Gate

Use the installed `domain-driven-develop` `references/testing-traceability.md` with Appaloft's `docs/testing/**` matrices.

Before Code Round:

- every changed scenario should have a stable matrix id and automation level;
- automated test names or metadata should include the matrix ids they prove;
- every new or changed command should have a CLI or HTTP/oRPC e2e/acceptance row, or an explicit matrix exception;
- read/query/status observability should be defined for write-side behavior;
- lower-level integration/unit rows should cover event payloads, persistence details, workflow branches, adapter behavior, and pure domain rules when relevant.

During Code Round, do not widen behavior beyond the governed specs and matrix ids. If implementation reveals a new scenario, update the matrix instead of silently folding it into code.

## Entrypoints

Treat these as separate Appaloft surfaces over the same operation:

- CLI
- HTTP API/oRPC
- Web console
- repository config files
- public documentation/help
- future MCP/tool entrypoints

Adapters dispatch through `CommandBus` or `QueryBus`. Transport input parameters reuse matching command/query input schemas and do not redefine parallel transport-only business shapes.

## Code Round

Use `domain-driven-develop` Code Round and relevant references before implementation.

For Appaloft-specific code:

- respect AGENTS package boundaries;
- keep `packages/core` free of framework, tsyringe, Kysely, provider SDK, and adapter concerns;
- keep `packages/application` dependent only on core plus allowed application-layer libraries;
- keep persistence in `packages/persistence/pg`;
- keep Web as a static console over contracts and i18n keys;
- command/query handlers dispatch from explicit messages and delegate to use cases/query services;
- use constructor injection and application tokens; do not call container APIs outside shell composition;
- when Code Round touches `packages/core` domain concepts, aggregate/entity/value-object state, domain events, repository/specification contracts, or behavior placement, apply the installed `domain-driven-develop` DDD references.

Every new or changed command should have a CLI or HTTP/oRPC e2e/acceptance test unless the governing test matrix documents an exception.

Do not treat a write-side command as complete if the only confirmation path is manual persistence inspection. Appaloft behavior should close through an entrypoint plus public read/query/status observability unless explicitly scoped out by the governing spec.

## Public Docs

When user-visible behavior changes input, output, status, recovery, workflow sequencing, or entrypoint affordances, use `domain-driven-develop` Docs Round plus Appaloft public docs governance.

Primary public docs must be task-oriented and should not expose DDD/CQRS/aggregate/repository terminology unless the page is explicitly advanced or contributor-facing.

Docs Round should record stable anchors, Web `?` help, CLI docs/help text, HTTP/API descriptions, repository config docs, future MCP/tool descriptions, `zh-CN` and `en-US` locale state, search aliases, and agent-readable docs impact when relevant.

## Final Output

For formal work, summarize:

- round type;
- target behavior;
- governing Appaloft docs;
- roadmap target, version target, and compatibility impact when relevant;
- operation-map position/state;
- domain owner and canonical terms;
- artifact state and relevant coverage surfaces;
- changed docs/code/tests/entrypoints;
- test matrix ids and automated test bindings;
- operation catalog and `docs/CORE_OPERATIONS.md` sync state;
- public docs/help outcome;
- verification result;
- remaining migration gaps or open questions;
- recommended next behavior when relevant.
