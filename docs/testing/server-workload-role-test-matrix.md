# Server Workload Role Test Matrix

## Scope

This matrix governs:

- optional multi-valued Server Workload Roles on `DeploymentTarget`;
- registration and `servers.configure-workload-roles`;
- persistence and `servers.list` / `servers.show` readback;
- deployment plan/create role admission;
- continuity of accepted workload bindings after role changes;
- truthful non-claims for artifact builders and Sandbox capability;
- CLI, HTTP/oRPC, SDK, Web, operation-catalog, and public-doc parity.

It complements the Server Bootstrap and Deployment Target Lifecycle matrices. It does not replace
lifecycle, connectivity, runtime readiness, provider capability, Sandbox isolation, or future build
executor tests.

## Global References

- [Server Workload Roles Spec](../specs/118-server-workload-roles/spec.md)
- [Server Workload Roles Plan](../specs/118-server-workload-roles/plan.md)
- [ADR-101](../decisions/ADR-101-server-workload-role-admission.md)
- [ADR-023](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-091](../decisions/ADR-091-execution-sandbox-boundary.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Server Register Or Connect Spec](../commands/servers.register-or-connect.md)
- [servers.show Query Spec](../queries/servers.show.md)
- [Deployment Target Lifecycle Test Matrix](./deployment-target-lifecycle-test-matrix.md)
- [Server Bootstrap Test Matrix](./server-bootstrap-test-matrix.md)
- [Execution Sandbox Test Matrix](./execution-sandbox-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Coverage Rows

| ID           | Operation                               | Level                 | Scenario                                                                                           | Expected                                                                                                                                                                                               |
| ------------ | --------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SRV-ROLE-001 | `servers.register` / `DeploymentTarget` | integration           | Registration omits `workloadRoles` or supplies `[]`.                                               | Persists a normalized empty set; role admission treats the server as general-purpose for every defined category.                                                                                       |
| SRV-ROLE-002 | `servers.register` / persistence        | integration           | Registration supplies `deployment-runtime` and `artifact-builder`.                                 | Persists and reads the deterministic canonical set without changing lifecycle, provider, target kind, credential, or proxy defaults.                                                                   |
| SRV-ROLE-003 | `servers.configure-workload-roles`      | integration           | Active registered server replaces its current role set.                                            | Returns the normalized set and `changed = true`; persists only workload-role state and publishes the specified event once if the aggregate event contract requires one.                                |
| SRV-ROLE-004 | register/configure schema and aggregate | unit/integration      | Input contains an unknown value or a duplicate canonical value.                                    | Returns stable validation failure; no server or role mutation is persisted and no event is published.                                                                                                  |
| SRV-ROLE-005 | `servers.configure-workload-roles`      | unit/integration      | Existing roles are submitted in another order.                                                     | Returns idempotent success with `changed = false`; state and event history are unchanged.                                                                                                              |
| SRV-ROLE-006 | deployment plan/create                  | integration           | Selected active server has a non-empty set without `deployment-runtime`.                           | Plan exposes a structured role-admission blocker; create fails with the same semantic reason before accepting a Deployment attempt or producing runtime effects; no fallback to the mismatched server. |
| SRV-ROLE-007 | deployment plan/create                  | integration           | Selected server is general-purpose or includes `deployment-runtime`.                               | Role admission passes; existing lifecycle/readiness/provider checks still decide the final result.                                                                                                     |
| SRV-ROLE-008 | Deployment lifecycle/readback           | integration           | Accepted/running/historical Deployment target snapshots exist and `deployment-runtime` is removed. | Existing snapshots and lifecycle/recovery operations remain valid; only later new placement is rejected.                                                                                               |
| SRV-ROLE-009 | artifact-builder declaration            | contract              | Server declares `artifact-builder` before a neutral remote builder executor exists.                | List/show and user surfaces expose intent but do not claim remote build readiness, logs, cancellation, cache ownership, or successful execution.                                                       |
| SRV-ROLE-010 | Sandbox placement                       | integration-follow-up | Server declares `sandbox-worker` but lacks required isolation/provider evidence.                   | Role admission passes and the independent Sandbox capability guard rejects placement before effects. This row remains blocked until the neutral Server-aware placement contract exists.                |
| SRV-ROLE-011 | Sandbox/Workspace continuity            | integration-follow-up | Existing Sandbox, Run, or Workspace binding remains when `sandbox-worker` is removed.              | Existing lifecycle/recovery state remains authoritative; later candidate selection excludes the server. This row remains blocked until the neutral Server-aware placement contract exists.             |
| SRV-ROLE-012 | list/show/public surfaces               | contract/e2e          | Classified and general-purpose servers are read through CLI, HTTP/oRPC, SDK, and Web.              | Every surface exposes the same canonical values/order; `[]` is rendered explicitly as general-purpose/unrestricted.                                                                                    |

## Supporting Coverage

| ID                   | Layer                  | Scenario                                            | Expected                                                                                                                                 |
| -------------------- | ---------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| SRV-ROLE-DOM-001     | core unit              | Role-set construction and equality.                 | Accepts only the three canonical values, rejects duplicates/unknowns, canonicalizes order, and compares as a set.                        |
| SRV-ROLE-DOM-002     | core unit              | Lifecycle plus role admission.                      | Inactive/deleted rejection remains distinct from role mismatch; role match never bypasses lifecycle.                                     |
| SRV-ROLE-PERSIST-001 | migration/integration  | Pre-migration server row.                           | Migrates/backfills to `[]`; repository round-trip preserves empty and non-empty sets.                                                    |
| SRV-ROLE-PERSIST-002 | integration            | Failed or idempotent role mutation.                 | No partial write or unrelated aggregate-field change occurs.                                                                             |
| SRV-ROLE-ENTRY-001   | CLI                    | Register/configure/list/show roles.                 | Typed commands dispatch through Command/Query buses; parsing and output use canonical vocabulary and empty semantics.                    |
| SRV-ROLE-ENTRY-002   | HTTP/oRPC              | Register/configure/list/show roles.                 | Shared schemas dispatch through buses; request/response types match the operation catalog.                                               |
| SRV-ROLE-ENTRY-003   | SDK                    | Generated role contracts.                           | SDK exposes the same input/output vocabulary without handwritten drift.                                                                  |
| SRV-ROLE-ENTRY-004   | Web                    | Registration/edit/list/detail.                      | Accessible multi-select and badges work at desktop/mobile widths; copy says new placement only and distinguishes intent from capability. |
| SRV-ROLE-ENTRY-005   | docs/catalog           | User-facing contract.                               | `CORE_OPERATIONS.md`, operation catalog, docs registry, CLI help, and public docs share one stable anchor and vocabulary.                |
| SRV-ROLE-CLOUD-001   | Cloud composed runtime | Public neutral operation through Cloud composition. | Cloud authz/overlay exposes the operation and may add private eligibility filters without redefining or duplicating roles.               |

## Required Non-Coverage Assertions

Tests and reviews must assert this behavior does not:

- add `build-server`, `agent-server`, or workload purpose to `targetKind`;
- add `isDeploymentServer`, `isBuildServer`, or `isAgentServer` booleans;
- infer roles from Docker state, providers, current workloads, or execution history;
- present roles as connectivity, readiness, health, capacity, isolation, or provider capability;
- let role matching bypass inactive/deleted lifecycle rejection;
- let explicit placement, preview, Web, CLI, or automatic selection bypass role admission;
- stop, move, evict, cancel, delete, or rewrite existing workload bindings when roles change;
- claim remote artifact building solely because `artifact-builder` is present;
- admit a Sandbox solely because `sandbox-worker` is present;
- let runtime adapters inspect Cloud topology or mutable role policy;
- place Cloud pricing, billing, tenancy, entitlement, or managed-fleet semantics in public code.

## Intended Automated Bindings

Before Code Round, bind rows as follows:

- `SRV-ROLE-DOM-*` and `SRV-ROLE-001/004/005`: `packages/core/test/deployment-target.test.ts` plus a focused role value-object test if existing conventions require it.
- `SRV-ROLE-001` through `005`, `012`: server registration/configuration application and Postgres repository tests.
- `SRV-ROLE-006` through `008`: deployment-plan and create-deployment application/contract tests.
- `SRV-ROLE-ENTRY-001`: CLI server command tests.
- `SRV-ROLE-ENTRY-002`: oRPC server HTTP tests.
- `SRV-ROLE-ENTRY-003`: SDK contract tests.
- `SRV-ROLE-ENTRY-004`: Web component/e2e tests plus desktop/mobile browser acceptance.
- `SRV-ROLE-ENTRY-005`: operation-catalog and docs-registry coverage tests.
- `SRV-ROLE-CLOUD-001`: Cloud composed-runtime operation/authz integration test after the public commit is merged and pinned.
- `SRV-ROLE-010/011`: explicitly blocked follow-up bindings; they cannot pass on provider-only mocks before Server identity enters the neutral placement contract.

## Documentation Impact Outcome

User-facing: new CLI/API/SDK fields, a new command, Web inputs/readback, and placement failure
semantics. The owning public page is `apps/docs/src/content/docs/servers/register-connect.mdx` with a
new stable anchor `server-workload-roles`; the server overview links to it. The same change must
update `@appaloft/docs-registry`, `docs/documentation/public-docs-traceability.md`, and complete
`zh-CN` / `en-US` locale state before merge.

## Open Questions

- None for the Server Workload Roles Spec Round. Builder execution, Server-aware Sandbox placement,
  drain/evacuation, and richer scheduler policy are separately governed follow-ups.
