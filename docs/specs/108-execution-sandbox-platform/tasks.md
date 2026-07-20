# Tasks: Execution Sandbox Platform

## Source Of Truth And Test-First

- [x] Complete competitor research in `research.md`.
- [x] Accept ADR-091 and establish canonical language/ownership.
- [x] Create `spec.md` and `plan.md`.
- [x] Add the accepted candidate to Domain Model, Business Operation Map and roadmap.
- [ ] Promote the implemented operation surface into Core Operations and the operation catalog in
  the same Code Round that makes transports/clients active.
- [x] Add command/query/event/workflow/error specs.
- [x] Add `SBX-*` stable rows and planned automated bindings to the test matrix.
- [ ] Write failing core/application/persistence/transport/provider tests before production code.

## Public Domain And Application

- [ ] Implement Sandbox, SandboxTemplate and SandboxSnapshot aggregates/value objects/specs.
- [ ] Implement repository/read-model/provider/credential-broker/clock/id ports.
- [ ] Implement lifecycle, policy, exec, process, file, port, snapshot and event operations.
- [ ] Implement durable provider attempts, expiry and reconciliation.

## Persistence And Providers

- [ ] Add Postgres/PGlite migrations, repositories and tenant-isolated read models.
- [ ] Add hermetic runtime provider and contract suite.
- [ ] Add Docker `container-trusted` provider with scoped cleanup.
- [ ] Add optional Docker+gVisor capability probe and provider path.

## Entrypoints And Docs

- [ ] Add HTTP/oRPC/OpenAPI routes and bounded stream framing.
- [ ] Generate TypeScript SDK methods and prove running-server use by an external application.
- [ ] Add CLI lifecycle/process/file/port/snapshot commands.
- [ ] Generate MCP descriptors/resources for bounded Sandbox operations.
- [ ] Add public task/reference/security docs and stable help anchors.
- [ ] Add Web list/show/lifecycle/status surface or record a governed follow-up if API/SDK is the
  accepted first-class owner-facing surface.

## Verification

- [ ] Run focused `SBX-*` tests.
- [ ] Run `bun run check:ash`, lint, typecheck and relevant package tests.
- [ ] Run local Docker runtime smoke and scoped cleanup.
- [ ] Run gVisor smoke when available or assert truthful unsupported evidence.
- [ ] Run operation/OpenAPI/SDK/MCP/public-doc parity checks.

## Post-Implementation Sync

- [ ] Reconcile ADR, spec, plan, tasks, operation docs, test matrix, code and public docs.
- [ ] Record public commit/PR and update Cloud submodule only after the public final SHA is merged.
