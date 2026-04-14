# AGENTS

This repository is a backend-core deployment platform, not a web-first CRUD app.

## Project Goal

- model deployment as `detect -> plan -> execute -> verify -> rollback`
- keep `CLI`, `HTTP API`, and future `MCP tools` as first-class interfaces
- keep `web` as a static console that consumes contracts over HTTP

## Dependency Direction

- `packages/core` depends on nothing in framework or infrastructure space
- `packages/application` depends only on `core`
- adapters, persistence, providers, integrations, plugins, and shell depend inward
- `apps/web` may depend on `contracts`, `@yundu/orpc/client`, `@tanstack/svelte-query`, and optional `ui`, never on `core` or `application`

## Package Boundaries

- `core`: entities, value objects, aggregate rules, domain events, runtime plan types
- `packages/core/src/workspace`, `configuration`, `runtime-topology`, `workload-delivery`, `dependency-resources`, and `release-orchestration` are the authoritative bounded-context directories
- root-level `packages/core/src/*.ts` files are compatibility re-exports only
- `application`: use cases, command/query orchestration, ports, tokens, error translation boundaries
- `orpc`: typed business transport package; owns oRPC RPC routes, OpenAPI REST routes, the typed frontend client, and TanStack Query helpers
- `persistence/pg`: Postgres-compatible Kysely repositories and read models for PostgreSQL and PGlite
- `adapters/http-elysia`: HTTP transport only
- `adapters/cli`: CLI transport only
- `adapters/runtime`: runtime plan resolution and hermetic fake execution backend
- `providers/*`: provider descriptors and provider-facing capability implementations
- `integrations/*`: VCS and external-system integration descriptors/adapters
- `plugins/*`: plugin manifest, compatibility checks, plugin host, built-ins
- `apps/shell`: composition root only

## Forbidden

- no framework dependencies in `core`
- no `tsyringe` in `core`
- no Kysely or raw Postgres driver access outside `packages/persistence/pg`
- no direct provider SDK types leaking into `core`
- no business logic hidden in Svelte components or SvelteKit endpoints
- no service-locator style `container.resolve(...)` scattered through use cases

## Domain Type Rules

- aggregate root state and entity state in `core` must not use primitive identity, temporal, status, or domain-significant text fields directly
- represent those fields with explicit value object classes branded by `unique symbol`
- prefer the pattern `const xBrand: unique symbol = Symbol("X"); class X { private [xBrand]!: void; ... }`
- IDs, timestamps, statuses, names, slugs, addresses, command texts, source locators, and similar domain-significant values should be dedicated value objects
- status transitions belong inside status/state-machine value objects, not in aggregate string branching
- repositories, application services, and adapters may serialize to plain DTOs at boundaries, but `core` aggregate/entity state stays VO-based
- entity and value object internals may still normalize primitive leaf data when the value object itself is the boundary; do not leak those primitives back into aggregate/entity state shapes
- `packages/core` must not contain `any` or `as any`; if a boundary is uncertain, use explicit value objects, union types, or `unknown` plus narrowing instead

## tsyringe Rules

- `tsyringe` container registration and `resolve(...)` are allowed only in `apps/shell` composition/bootstrap code
- register dependencies through explicit tokens from `packages/application/src/tokens.ts`
- prefer constructor injection everywhere else
- do not resolve dependencies inside methods
- command/query handlers, use cases, and query services in `packages/application` should use `@injectable()` plus explicit `@inject(tokens.xxx)` constructor parameters
- application classes may depend on `tsyringe` decorators for declarative injection metadata, but must not call container APIs themselves
- application `use case` and `query service` classes must be container-managed through token registration in the composition root; do not manually keep a parallel `const useCases = { ...new ... }` object graph in runtime code
- shell registration should prefer token-to-class registration so the container, not shell factories, constructs use cases and query services

## CQRS Rules

- business operations exposed through CLI or HTTP must dispatch from an explicit `Command` or `Query` message
- the human-facing and AI-facing source of truth for business operations is [docs/CORE_OPERATIONS.md](/Users/nichenqin/projects/yundu/docs/CORE_OPERATIONS.md)
- the human-facing and AI-facing source of truth for domain boundaries and aggregate names is [docs/DOMAIN_MODEL.md](/Users/nichenqin/projects/yundu/docs/DOMAIN_MODEL.md)
- agents must read [docs/decisions/README.md](/Users/nichenqin/projects/yundu/docs/decisions/README.md) and relevant ADRs before interpreting local command/event/workflow/testing specs
- agents must read global contracts before local specs:
  - [docs/errors/model.md](/Users/nichenqin/projects/yundu/docs/errors/model.md)
  - [docs/errors/neverthrow-conventions.md](/Users/nichenqin/projects/yundu/docs/errors/neverthrow-conventions.md)
  - [docs/architecture/async-lifecycle-and-acceptance.md](/Users/nichenqin/projects/yundu/docs/architecture/async-lifecycle-and-acceptance.md)
- formal source-of-truth semantics for business operations live in `docs/decisions/**`, global contracts under `docs/errors/**` and `docs/architecture/**`, and local specs under `docs/commands/**`, `docs/events/**`, `docs/workflows/**`, and `docs/testing/**`
- docs/ai/** contains background analysis and migration context only; it must not override ADRs, global contracts, or normative local specs
- new business endpoints and CLI commands must map to an existing catalog entry or add one in the same change
- new business capabilities must update both `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts` in the same change
- transport input parameters must reuse the matching command/query input schema, not redefine parallel transport-only input shapes
- adapters dispatch through `CommandBus` or `QueryBus`, not by calling application services directly
- handlers are registered with `@CommandHandler(...)` or `@QueryHandler(...)`
- handlers may call a use case or application service, but must not embed persistence or transport logic
- read models stay query-shaped; aggregate repositories stay write-side oriented
- when an operation creates complex aggregates, snapshots, runtime-plan inputs, or rollback plans, move that construction into dedicated operation-local factories/builders/services instead of assembling everything inline inside the use case

## Specification And Decision Sync Rules

- `AGENTS.md` defines durable repository-level working rules; task-specific session goals belong in the current prompt or a plan document, not in the permanent repository charter
- accepted ADRs govern local specs; local specs govern implementation intent; migration notes document temporary gaps without replacing the contract
- docs/ai/** contains background analysis and migration context only; it must not override ADRs, global contracts, or normative local specs
- when changing command semantics, workflow branches, event semantics, async lifecycle behavior, error contracts, or test expectations, update the governing spec documents in the same change
- command/workflow/testing changes must stay synchronized: if code or tests change behavior, update the corresponding spec and test-matrix docs; if specs change intended behavior, update code/tests in the same change when implementation work is in scope
- if implementation temporarily diverges from the normative spec, record that only under `Current Implementation Notes And Migration Gaps`; do not weaken the normative contract in the main body to match temporary code reality
- if a change alters command boundaries, ownership scope, lifecycle stages, readiness rules, retry semantics, durable state shape, or other cross-cutting behavior, update an existing ADR or add a new ADR in the same change before expanding local specs
- agents should treat `docs/testing/*-test-matrix.md` and equivalent testing specs as the authoritative behavioral coverage map for command/event/workflow testing
- if a capability also changes a normative local spec, update the corresponding command/event/workflow/testing docs in the same change

## PostgreSQL And Kysely Rules

- PostgreSQL is the primary backend for hosted, CI, and standard production self-hosting
- embedded `PGlite` is allowed for local-first and portable single-instance installs
- Kysely is the only database access entry point
- raw SQL is allowed only in migrations or tightly scoped persistence modules
- repositories persist aggregates; read models serve query-side shapes
- one repository port and one repository adapter implementation may target exactly one aggregate root
- entities and value objects never receive standalone repositories; they are persisted through their owning aggregate root
- selection and mutation specs belong to the domain/application boundary, while visitor translation belongs in persistence adapters
- for aggregate repositories, prefer `findOne(spec)` and `upsert/update(aggregate, mutateSpec)` over ad-hoc filter bags
- do not leak `postgres.js` or `PGlite` client types outside `packages/persistence/pg`

## Environment Rules

- precedence is `defaults < system < organization < project < environment < deployment snapshot`
- each deployment must persist an immutable environment snapshot
- secret values must be masked in read models and logs
- build-time variables must use `PUBLIC_` or `VITE_`
- build-time variables cannot be marked secret
- runtime aggregate and resource IDs must be generated through the injected `IdGenerator` port
- the default shell/runtime implementation uses `nanoid` with a stable `<prefix>_<suffix>` shape; do not hand-roll `randomUUID()` IDs in production code

## Adding A Provider

1. Create a package under `packages/providers/<name>`.
2. Export a provider descriptor with explicit capability flags.
3. Keep provider SDK specifics inside that package.
4. Register it in the composition root or provider registry factory.
5. Add contract tests and docs in `docs/PROVIDERS.md`.

## Adding An Integration

1. Create a package under `packages/integrations/<name>`.
2. Export a descriptor and adapter boundary.
3. Keep vendor-specific transport details out of `core`.
4. Register it through the integration registry.
5. Add capability tests and docs.

## Adding A Plugin

1. Define a `PluginManifest`.
2. Validate compatibility with `@yundu/plugin-sdk`.
3. Load it via `@yundu/plugin-host`.
4. Expose capabilities explicitly.
5. Document sandbox and compatibility assumptions in `docs/PLUGINS.md`.

## Coding Style

- Biome is the repository formatter and linter
- run `bun run lint` for checks and `bun run lint:fix` for auto-fixes
- Biome branding exceptions are intentional: `noConfusingVoidType` and `noUnusedPrivateClassMembers` stay disabled because nominal `unique symbol` branding uses `private [brand]!: void`
- `apps/web` still relies on `svelte-check` for `.svelte` semantic validation because Biome is not the full Svelte lint/type layer
- prefer Bun native APIs such as `Bun.file`, `Bun.write`, `Bun.spawn`, `Bun.spawnSync`, and `Bun.$` in scripts, smoke tests, packaging code, and runtime helpers
- only use `node:*` APIs when Bun has no credible equivalent for the specific job; if a `node:*` API remains, that choice should be intentional
- acceptable `node:*` exceptions include `node:path`, synchronous config/bootstrap paths where Bun has no synchronous file API, and low-level process or socket primitives that Bun does not expose with equivalent control
- when a module still needs `node:*`, prefer the narrowest API possible and keep that dependency local to the adapter or script that truly needs it
- TypeScript strict only
- stable error codes and categories
- user-facing text in `apps/web` must use `packages/i18n` keys and locale resources; do not add hardcoded UI copy in Svelte components
- no `any` unless absolutely unavoidable
- prefer explicit domain types over loose string bags
- write tests where behavior or boundaries matter
