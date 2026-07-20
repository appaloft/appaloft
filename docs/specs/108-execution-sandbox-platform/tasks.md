# Tasks: Execution Sandbox Platform

## Source Of Truth And Test-First

- [x] Complete competitor research in `research.md`.
- [x] Accept ADR-091 and establish canonical language/ownership.
- [x] Create `spec.md` and `plan.md`.
- [x] Add the accepted candidate to Domain Model, Business Operation Map and roadmap.
- [x] Promote the implemented operation surface into Core Operations and the operation catalog in
  the same Code Round that makes transports/clients active.
- [x] Add command/query/event/workflow/error specs.
- [x] Add `SBX-*` stable rows and planned automated bindings to the test matrix.
- [x] Write core/application/persistence/transport/provider contract tests alongside production code.

## Public Domain And Application

- [x] Implement Sandbox, SandboxTemplate and SandboxSnapshot aggregates/value objects/specs.
- [x] Implement repository/read-model/provider/clock/id ports and a destination-bound credential
  grant value object. Providers without a credential broker advertise `credentialBroker: false`.
- [x] Implement lifecycle, policy, bounded exec, process, file, port and snapshot operations.
- [ ] Add live process/event attach and credential-broker operations as compatible follow-ups; the
  current bounded frame/readback surface does not claim streaming or secret injection.
- [x] Implement durable provider attempts, expiry and reconciliation.
- [x] `SBX-RECONCILE-001`: add provider-owned runtime inventory, persisted-handle comparison and
  exact orphan removal tests/implementation.
- [ ] `SBX-STREAM-001`: persist Sandbox lifecycle/process events and expose bounded replay/live SSE.
- [ ] `SBX-SECRET-001`: add grant/revoke/list plus destination-bound broker request operations;
  prove plaintext absence across state, output, errors, audit and snapshot.

## Persistence And Providers

- [x] Add Postgres/PGlite migrations, repositories and tenant-isolated read models.
- [x] Add hermetic runtime provider and contract suite.
- [x] Add Docker `container-trusted` provider with scoped cleanup.
- [x] Add optional Docker+gVisor capability probe and provider path.

## Entrypoints And Docs

- [x] Add HTTP/oRPC routes and bounded process framing through the shared operation catalog.
- [x] Generate TypeScript SDK methods and prove running-server use by an external application.
- [x] Add CLI lifecycle/process/file/port/snapshot/template/network commands.
- [x] Generate MCP descriptors/resources for bounded Sandbox operations.
- [x] Add public task/reference/security docs.
- [x] Record Web list/show/lifecycle/status as a governed follow-up because API/SDK is the
  accepted first-class owner-facing surface.

## Verification

- [x] Run focused `SBX-*` tests.
- [x] Run formatter/lint, typecheck and relevant package tests.
- [x] Run local Docker runtime smoke and scoped cleanup.
- [x] Run gVisor smoke when available or assert truthful unsupported evidence.
- [x] Run operation/SDK/MCP parity checks.

## Post-Implementation Sync

- [x] Reconcile ADR, spec, plan, tasks, operation docs, test matrix, code and public docs.
- [ ] Record public commit/PR and update Cloud submodule only after the public final SHA is merged.
