# Server Workload Roles

## Metadata

- Status: Accepted
- Round: Post-Implementation Sync
- Artifact state: implemented; focused verification complete, release gates pending final baseline lint cleanup and manual smoke
- Owner: Runtime Topology (`DeploymentTarget` / Server)
- Compatibility impact: additive public minor capability
- Governing discovery: `discovery.md`
- Governing decision: `../../decisions/ADR-101-server-workload-role-admission.md`
- Test Matrix: `../../testing/server-workload-role-test-matrix.md`

## Business Outcome

An instance or organization operator can declare which categories of new workload a registered server is intended to accept, while preserving existing Deployments, build attempts, Sandboxes, Workspace sessions, and historical references when that intent changes.

The declaration is optional and multi-valued. A server with no declared roles is general-purpose and remains eligible for every defined workload category so existing installations retain current behavior.

## Ubiquitous Language

| Term                      | Meaning                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server Workload Role      | An operator-declared category of new workload a registered `DeploymentTarget` is intended to accept. It is placement intent, not observed capability, health, provider kind, or an exclusive machine type. |
| `deployment-runtime`      | The server may accept new application runtime placement.                                                                                                                                                   |
| `artifact-builder`        | The server may accept new artifact build execution when a governed builder-placement seam exists.                                                                                                          |
| `sandbox-worker`          | The server may accept new `ExecutionSandbox` placement, including agent and Workspace workloads.                                                                                                           |
| General-purpose Server    | A server whose workload-role set is empty. It is unrestricted by role for all defined workload categories.                                                                                                 |
| New-work Admission        | Explicit placement validation or candidate selection before a new workload binding is accepted.                                                                                                            |
| Existing Workload Binding | A persisted Deployment target snapshot, build attempt placement, Sandbox/Workspace placement, or historical reference already bound to a server.                                                           |
| Effective Eligibility     | Lifecycle admission plus workload-role admission plus the operation's independent readiness, capability, health, capacity, tenant, and provider policies.                                                  |

Canonical stored and transported role values are exactly `deployment-runtime`, `artifact-builder`, and `sandbox-worker`. Public entrypoints use the same vocabulary; they do not introduce aliases that can drift from the domain language.

## Domain Ownership and Boundaries

- `DeploymentTarget` owns the normalized `DeploymentTargetWorkloadRoles` state because Runtime Topology already owns server identity, lifecycle, target shape, provider family, credential relationship, and placement-facing metadata.
- The role set accepts known canonical values only, contains no duplicates, has deterministic ordering, and contains zero to three members.
- `Deployment`, build execution, and `ExecutionSandbox` remain separate aggregate roots. They keep their own lifecycle, resources, provider capabilities, placement snapshots, and recovery behavior.
- `sandbox-worker` does not turn a server into a Sandbox and does not prove isolation, networking, pause/resume, recovery, or provider capability.
- `artifact-builder` records intent only. It does not claim that a neutral remote build executor, logs, cancellation, cache ownership, or artifact provenance already exists.
- `targetKind`, provider key, runtime readiness, edge-proxy readiness, capacity, health, and workload roles remain orthogonal facts.
- Cloud/Enterprise may add tenant, fleet, entitlement, quota, approval, region, affinity, capacity, and cost policy through public ports without redefining this vocabulary.

## Invariants

1. A server has a set of zero or more canonical workload roles; roles are not mutually exclusive.
2. An empty set means general-purpose/unrestricted by role and admits all defined workload categories.
3. A non-empty set admits a new workload category only when the corresponding role is present.
4. Duplicate or unknown role inputs fail validation; they are never silently ignored or normalized away.
5. Reordering the same valid role set is idempotent: it is no state change and emits no duplicate domain event.
6. Workload-role admission is necessary but never sufficient for placement.
7. Inactive or deleted servers remain ineligible regardless of roles.
8. Explicit selection and automatic placement fail closed on a role mismatch and must not fall back to a mismatched server.
9. Role mutation is prospective. It must not stop, move, evict, cancel, delete, orphan, or invalidate existing workload bindings.
10. Existing work may continue, recover, or redeploy according to its own durable lifecycle contract after a role is removed.
11. Role mutation must not activate/deactivate a server, prepare its runtime, change edge-proxy or credential state, or mutate workload-owner records.
12. Read models expose the normalized role set. An empty set is rendered explicitly as general-purpose/unrestricted rather than as missing capability.

## Admission Truth Table

| Declared role set        | New deployment runtime       | New artifact build           | New Sandbox placement        | Existing bindings |
| ------------------------ | ---------------------------- | ---------------------------- | ---------------------------- | ----------------- |
| `[]`                     | admit by role                | admit by role                | admit by role                | unchanged         |
| `deployment-runtime`     | admit by role                | reject                       | reject                       | unchanged         |
| `artifact-builder`       | reject                       | admit by role                | reject                       | unchanged         |
| `sandbox-worker`         | reject                       | reject                       | admit by role                | unchanged         |
| any valid multi-role set | admit only listed categories | admit only listed categories | admit only listed categories | unchanged         |

“Admit by role” means continue to later lifecycle, readiness, capability, health, capacity, tenant, and provider gates. It never means the placement is guaranteed.

## Scenarios

| ID           | Scenario                                       | Given                                                                    | When                                                                    | Then                                                                                                     | Automation       |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| SRV-ROLE-001 | Register a general-purpose server              | No workload roles are supplied                                           | The operator registers a server                                         | The persisted role set is empty and every defined category passes role admission                         | integration      |
| SRV-ROLE-002 | Register a multi-role server                   | `deployment-runtime` and `artifact-builder` are supplied                 | The operator registers a server                                         | The normalized deterministic role set is persisted and read back                                         | integration      |
| SRV-ROLE-003 | Replace declared roles                         | A registered server exists                                               | The operator configures a complete replacement set                      | Only role state changes; lifecycle, runtime, proxy, credential, and workload bindings remain unchanged   | integration      |
| SRV-ROLE-004 | Reject invalid role input                      | An unknown or duplicate role is supplied                                 | Registration or configuration is attempted                              | Validation fails, persists nothing, and exposes a stable role-validation error                           | unit/integration |
| SRV-ROLE-005 | Treat reordered roles as no change             | A server already has two roles                                           | The same roles are submitted in another order                           | Aggregate state and domain-event history do not change                                                   | unit/integration |
| SRV-ROLE-006 | Reject a new deployment on a mismatched server | A server has a non-empty set without `deployment-runtime`                | Deployment plan/create explicitly selects it or a selector evaluates it | The operation fails before deployment effects and does not fall back to that server                      | integration      |
| SRV-ROLE-007 | Keep plan and create admission aligned         | A selected server does not admit deployment runtime                      | The operator previews and then attempts creation                        | Both paths expose the same role mismatch; preview cannot promise a placement that create rejects         | integration      |
| SRV-ROLE-008 | Preserve deployment history after role removal | A server owns accepted/running/historical Deployment target snapshots    | `deployment-runtime` is removed                                         | Existing snapshots and lifecycle operations remain valid; only later new placement is rejected           | integration      |
| SRV-ROLE-009 | Keep builder intent truthful                   | A server declares `artifact-builder`                                     | No neutral remote builder execution seam exists                         | The role is stored and displayed, but no remote-build capability or successful execution is claimed      | contract         |
| SRV-ROLE-010 | Keep Sandbox capability independent            | A server declares `sandbox-worker` but lacks required isolation evidence | Sandbox placement evaluates it                                          | Role admission passes, then independent capability admission rejects it                                  | integration      |
| SRV-ROLE-011 | Preserve Sandbox and Workspace bindings        | Existing Sandboxes, Runs, or Workspace sessions are bound to a server    | `sandbox-worker` is removed                                             | Existing bindings continue under their lifecycle/recovery contracts; later placement excludes the server | integration      |
| SRV-ROLE-012 | Read role intent consistently                  | Classified and general-purpose servers exist                             | List/show, CLI, API, SDK, and Web read them                             | Every surface exposes the same canonical set and explicit empty-set meaning                              | contract/e2e     |

## Command and Query Contracts

### Registration

`servers.register` gains optional `workloadRoles`. Missing or `[]` creates a general-purpose server. A non-empty input must be a valid, duplicate-free set of canonical values. Registration response and server read models return the persisted normalized set.

### Post-registration mutation

Add the intention-revealing command `servers.configure-workload-roles`; do not extend generic `servers.update` or overload runtime/proxy commands.

Input:

- `serverId`
- complete replacement `workloadRoles` set

Result:

- normalized persisted `workloadRoles`
- whether the operation changed aggregate state

The command atomically replaces the complete set. It does not expose incremental add/remove operations and it owns no drain, evacuation, placement, or workload lifecycle effects.

### Reads

`servers.list` and `servers.show` expose `workloadRoles: ServerWorkloadRole[]`. Public UI and CLI render `[]` as “General purpose (all workload types)” instead of leaving an empty gap or calling it incapable.

## Placement Enforcement

The aggregate exposes one neutral role-aware new-work guard beside its existing lifecycle guard. Application placement flows call it before effects:

- deployment plan/create requires `deployment-runtime`;
- artifact build placement requires `artifact-builder` only when a canonical build-executor placement seam exists;
- Sandbox provisioning or relocation to a registered Server requires `sandbox-worker` once the neutral placement candidate/binding contract carries Server identity.

The guard answers lifecycle and role admission only. It does not inspect repositories, rank candidates, probe providers, infer capability, or perform placement. Adapters receive an already admitted placement and never interpret workload roles.

Accepted Deployment target snapshots, build placements, and Sandbox/Workspace bindings retain their recorded placement facts. Mutable role state is not copied into those snapshots and later changes do not reinterpret them.

## Migration and Compatibility

- Persistence adds a non-null normalized role-set representation with an empty default; existing rows backfill to `[]`.
- Existing clients that omit `workloadRoles` retain current registration behavior.
- Existing servers become general-purpose; no migration infers intent from current workloads, Docker state, providers, or execution history.
- Existing bindings remain grandfathered when roles are narrowed.
- Registration input, list/show output, SDK types, and operation-catalog additions are additive.
- Role enforcement must not ship on one current placement path while another current path bypasses it.

## UX Requirements

- Registration offers an optional multi-select: Deployment runtime, Artifact builder, Sandbox worker.
- Empty selection explains “General purpose (all workload types).”
- Server list and detail show zero, one, or multiple role badges; the empty state is explicit text.
- Editing roles states that the change affects new placement only and does not drain or move current workloads.
- UI copy uses “workload role” or “intended workload,” never “server type” or “capability.”
- `artifact-builder` copy must not suggest remote build readiness until that execution capability exists.

## Public/Private Ownership

Public Community owns:

- canonical role vocabulary and aggregate state;
- registration and configuration contracts;
- persistence and list/show read models;
- neutral lifecycle-plus-role admission behavior;
- operation catalog, API, SDK, CLI, Web, public docs, and tests.

Private Cloud/Enterprise may own:

- managed fleet defaults and inventory;
- tenant, entitlement, quota, approval, region, affinity, capacity, and cost filters;
- build-pool or Sandbox-pool provisioning;
- drain, evacuation, rebalance, and managed-capacity automation.

Private policy may only narrow effective eligibility. It must consume the public role state and guard rather than duplicate or redefine them.

## Non-Goals

- Automatic role inference.
- Exclusive immutable server types or role booleans.
- Resource requests, reservations, quotas, bin-packing, topology spread, or a general scheduler.
- Drain, evacuation, migration, rebalance, or automatic workload termination.
- A remote build executor, build lifecycle, cache, logs, cancellation, or artifact provenance implementation.
- A Sandbox provider or capability bypass.
- Role-specific credentials, proxy ownership, or runtime preparation.
- Cloud fleet pricing, billing, tenancy, entitlement, or managed inventory behavior.

## Acceptance Criteria

1. Canonical docs define roles as optional multi-valued placement intent owned by `DeploymentTarget`.
2. The only canonical values are `deployment-runtime`, `artifact-builder`, and `sandbox-worker`.
3. Registration, configuration, persistence, list/show readback, and public transports use the same values and empty-set meaning.
4. Existing server rows become general-purpose without behavior change.
5. Duplicate/unknown input fails; reordered equivalent input is idempotent.
6. Every active explicit and automatic new-placement path for a workload enforces the same aggregate guard before effects.
7. Existing workload bindings survive role narrowing and retain their own lifecycle/recovery semantics.
8. Sandbox capability evidence remains independently mandatory; artifact-builder does not overclaim absent execution capability.
9. Test Matrix rows bind every `SRV-ROLE-*` scenario before Code Round.

## Governed Follow-ups

- Neutral remote artifact-build executor and placement contracts.
- Destination-bound Sandbox candidate/binding support where Server role admission can be applied.
- Drain and evacuation workflows.
- Richer capacity, affinity, topology, and placement-explanation policy.
