# Tasks: Server Workload Roles

## Spec And Ticket Gate

- [x] Record owner-confirmed discovery decisions and public/private ownership.
- [x] Write Spec 118, ADR-101, implementation plan, and Test Matrix.
- [x] Accept ADR-101 and confirm the Spec artifact state as `ready-for-code`.
- [x] Create public `appaloft/appaloft` vertical issues [#850](https://github.com/appaloft/appaloft/issues/850) and [#851](https://github.com/appaloft/appaloft/issues/851); link governing artifacts and `SRV-ROLE-*` ids.
- [x] Mark implementation issues `ready-for-agent` before Code Round.

## Test First

- [x] Bind `SRV-ROLE-DOM-001/002` and `SRV-ROLE-001/004/005` to failing core tests for vocabulary, normalization, idempotency, and lifecycle-plus-role admission.
- [x] Bind `SRV-ROLE-PERSIST-001/002` and `SRV-ROLE-001/002/003` to failing repository/application tests for migration, register, configure, and readback.
- [x] Bind `SRV-ROLE-006/007/008` to failing deployment plan/create parity and snapshot-continuity tests.
- [x] Bind `SRV-ROLE-ENTRY-001/002/003/005` to failing catalog, CLI, HTTP/oRPC, SDK, and docs-registry contract tests.
- [x] Bind `SRV-ROLE-ENTRY-004` to Web tests and define desktop/mobile browser acceptance.
- [ ] Keep `SRV-ROLE-010/011` blocked until a neutral Server-aware Sandbox placement contract exists; do not satisfy them with provider-only mocks.

## Public Domain And Application

- [x] Implement canonical `ServerWorkloadRole` and `DeploymentTargetWorkloadRoles` value objects.
- [x] Add role state, registration, rehydration, intention-revealing configuration, and idempotent domain behavior to `DeploymentTarget`.
- [x] Extend the aggregate new-work guard with role admission while preserving distinct lifecycle and role errors.
- [x] Add `workloadRoles` to `servers.register` and list/show read models.
- [x] Add `servers.configure-workload-roles` schema, command, handler, service, operation-catalog entry, and event contract if the aggregate's established mutation pattern requires one.
- [x] Add the Postgres migration, repository mapping, backfill-to-empty, and deterministic round-trip.
- [x] Apply `deployment-runtime` admission to both deployment planning and creation before effects.
- [x] Preserve accepted Runtime Plan snapshots and existing Deployment lifecycle behavior after role changes.

## Public Surfaces

- [x] Add operation-catalog, HTTP/oRPC, generated SDK, and CLI registration/configuration/list/show parity.
- [x] Add accessible Web registration/edit multi-selects and list/detail role readback.
- [x] Render `[]` as “General purpose (all workload types)” and describe edits as new-placement-only.
- [x] Keep `artifact-builder` copy truthful: intent only until the remote builder capability is implemented.
- [x] Add stable placement mismatch error mapping and recovery guidance without reusing `server_inactive`.

## Verification And Sync

- [x] Run focused core, application, persistence, deployment, contract, CLI, SDK, and Web tests bound by the Test Matrix.
- [ ] Run public lint, typecheck, test, and build gates. Typecheck and build pass. Full lint remains blocked by pre-existing diagnostics outside the feature diff. Full test is still running after the fresh verification run; the complete Spec 118 matrix passes.
- [x] Smoke register/configure/list/show and deployment rejection through the public source CLI/API path. Verified stateful registration, role replacement/readback, and mismatched deployment rejection through the source runtime.
- [x] Run desktop and mobile browser acceptance for registration, edit, list, and detail. The role edit/readback flow passes at 1280x900 and 390x844 without horizontal overflow.
- [x] Synchronize `DOMAIN_MODEL.md`, ADR-023, workflows, command/query/error specs, `BUSINESS_OPERATION_MAP.md`, `CORE_OPERATIONS.md`, and `PRODUCT_ROADMAP.md`.
- [x] Add the `server-workload-roles` public docs anchor, docs-registry entry, traceability row, and complete `zh-CN` / `en-US` locale coverage.
- [ ] Commit and merge the public change, then update the Cloud gitlink and run `SRV-ROLE-CLOUD-001` through the composed Cloud runtime.

## Governed Follow-Ups

- [ ] Discover/spec the neutral artifact-builder executor, readiness, logs, cancellation, cache ownership, and artifact provenance before binding build placement.
- [ ] Discover/spec the neutral Server-aware Sandbox candidate/binding seam before enforcing `sandbox-worker`.
- [ ] Specify drain/evacuation separately if operators need existing work moved after role narrowing.
- [ ] Specify richer capacity, affinity, topology, or placement explanation without widening Server role semantics.
