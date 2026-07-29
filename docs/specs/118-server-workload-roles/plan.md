# Server Workload Roles Implementation Plan

## Status

- Round: Post-Implementation Sync
- Implementation readiness: implemented; focused verification complete
- Governing discovery: `discovery.md`
- Governing spec: `spec.md`
- Governing decision: `../../decisions/ADR-101-server-workload-role-admission.md`
- Test Matrix: `../../testing/server-workload-role-test-matrix.md`

## Architecture Decision

Persist a normalized role set on the existing public `DeploymentTarget` aggregate. Extend its current new-work admission guard with a required workload role. Every application placement path calls that guard before effects; adapters receive an already admitted placement.

Do not create `DeploymentServer`, `BuildServer`, or `AgentServer` subclasses. Do not add role booleans. Do not encode roles into `targetKind`, provider keys, runtime capabilities, lifecycle status, or Cloud-private fleet state.

## Public Domain Changes

1. Add canonical `ServerWorkloadRole` values under Runtime Topology: `deployment-runtime`, `artifact-builder`, `sandbox-worker`.
2. Add a deterministic `DeploymentTargetWorkloadRoles` value object that:
   - accepts zero to three canonical values;
   - rejects duplicates and unknown values;
   - compares as a set;
   - serializes in canonical order;
   - treats empty as unrestricted by role.
3. Extend `DeploymentTargetState` and rehydration with the role set; legacy state defaults to empty.
4. Add `DeploymentTarget.configureWorkloadRoles(...)` as the only post-registration mutation.
5. Make reordered equivalent input a no-op with no duplicate domain event.
6. Extend the aggregate's existing `ensureCanAcceptNewWork` seam to require a role while preserving a distinct role-mismatch error from inactive lifecycle rejection.
7. Preserve existing immutable Deployment target snapshots and other workload-owner bindings; do not copy mutable role policy into historical execution snapshots.

## Public Application Changes

### Server operations

1. Extend `servers.register` input, handler, response, and generated contracts with optional `workloadRoles`.
2. Add `servers.configure-workload-roles` command, schema, handler, operation-catalog entry, HTTP/oRPC route, SDK method, and CLI command.
3. Keep configuration as full-set replacement. It performs no drain, evacuation, deployment, Sandbox, credential, runtime, or proxy mutation.
4. Extend server list/show read models with normalized `workloadRoles`.

### Deployment admission

1. Apply `deployment-runtime` admission in `deployment-context.resolver.ts` before runtime-plan input is accepted.
2. Apply the same guard in deployment planning so plan and create cannot disagree.
3. Prove explicit selection fails closed without fallback and before deployment effects.
4. Prove changing roles does not reinterpret accepted `RuntimePlanSnapshot` or running/historical Deployment state.

### Artifact build admission

1. Store and display `artifact-builder` in this slice.
2. Do not claim or fake separate remote-builder execution while builds still run as mechanics on the selected local/SSH runtime target.
3. Specify a follow-up neutral builder-placement interface with readiness, logs, cancellation, cache ownership, and artifact provenance before using the role to route builds independently.
4. When that interface exists, apply the aggregate role guard before selecting/rendering an executor; never inspect roles inside shell/Docker adapters.

### Sandbox admission

1. Store and display `sandbox-worker` in this slice.
2. Extend the neutral Sandbox placement candidate/binding contract only when it can carry an authorized registered Server identity; do not treat provider key as Server identity.
3. Apply the role guard before candidate selection and relocation effects.
4. Keep isolation, network, pause/resume, recovery, and provider-capability checks independent and mandatory.
5. Preserve existing Sandbox, Run, and Workspace placement/recovery state after a role change.

## Persistence and Read Models

1. Inspect existing Postgres collection conventions, then add one non-null role-set representation with an empty default and database-level value validation where practical.
2. Backfill all existing server rows to `[]`; never infer intent from observed workloads or providers.
3. Update deployment-target repository write/rehydration mapping.
4. Update server summary/detail projections and list/show query services.
5. Canonicalize ordering at the domain seam rather than relying on database order.
6. Verify a failed or no-op mutation does not produce partial persistence or unrelated state changes.

## Transport and User Surfaces

1. Keep one canonical vocabulary through operation catalog, oRPC, SDK, CLI, and Web.
2. Add optional repeatable/array role input to `appaloft server register` using existing CLI collection conventions.
3. Add a dedicated configure command that submits the complete desired set.
4. Add optional multi-select controls to registration and server detail configuration.
5. Add role badges to server list/detail and explicit “General purpose (all workload types)” copy for `[]`.
6. State that edits affect new placement only and that `artifact-builder` is intent, not proof of remote build readiness.
7. Update public server docs and stable help anchors only after behavior is verified.

## Delivery Slices

### Slice A — persist, configure, and read roles

- Domain vocabulary/value object/aggregate mutation.
- Migration and repository mapping.
- Register/configure/list/show contracts.
- API, SDK, CLI, Web read/write surfaces.
- No role-based admission is claimed yet.

### Slice B — enforce current deployment admission

- Plan/create parity through the shared aggregate guard.
- General-purpose compatibility.
- Mismatch failure before effects.
- Existing Deployment snapshot continuity.

Slice A must not expose configuration as enforcement-complete unless Slice B ships with it or the surface is feature-gated. Current deployment paths cannot have inconsistent admission.

### Follow-up Slice C — neutral artifact-builder placement

Blocked until a governed build-executor seam exists. It is not implementation scope hidden inside the role model.

### Follow-up Slice D — registered-Server Sandbox placement

Blocked until the neutral Sandbox placement candidate/binding carries Server identity. Cloud-private owner-scope policy must not become the public contract.

## Test Strategy

Use `server-workload-role-test-matrix.md` as the stable traceability source.

1. Value object: empty wildcard, canonical values/order, duplicate and unknown rejection, set equality.
2. Aggregate: register, configure, reorder no-op, lifecycle-plus-role guard, unrelated state preservation.
3. Persistence: legacy backfill, round-trip, failed/no-op mutation behavior.
4. Application integration: configure command, deployment plan/create parity, mismatch before effects, no fallback, existing snapshot continuity.
5. Contract: operation catalog, oRPC, SDK, CLI schema and readback parity.
6. Web acceptance: desktop/mobile registration, edit, list/detail, empty-state copy, accessibility.
7. Sandbox/build follow-up matrices remain blocked rather than passing on mocked capability.
8. Cloud composed-runtime regression after the public commit is merged and pinned: authz and overlay injection expose the neutral operation without private policy leakage.

## Source-of-Truth Synchronization

After implementation succeeds:

- update `DOMAIN_MODEL.md` with Runtime Topology ownership and vocabulary;
- amend `ADR-023` with the orthogonal pre-backend admission filter;
- synchronize `BUSINESS_OPERATION_MAP.md`, `CORE_OPERATIONS.md`, and `PRODUCT_ROADMAP.md`;
- update server lifecycle/register/show specs and deployment plan/create workflow specs;
- update Sandbox specs only when the Server-aware placement contract exists;
- update public server docs, docs registry, and traceability;
- run the public docs-impact gate and record the registry outcome;
- merge the public commit to public `main`, then update the Cloud gitlink and run composed-runtime integration checks.

## Ticket Decomposition

Create public `appaloft/appaloft` issues only after this Spec and ADR are confirmed:

1. **Persist and expose server workload roles** — registration, aggregate, persistence, configure command, list/show, and public surfaces; `SRV-ROLE-001` through `005`, `012`.
2. **Enforce deployment-runtime admission** — plan/create parity and existing snapshot continuity; `SRV-ROLE-006` through `008`.
3. **Design neutral artifact-builder execution placement** — separate feature discovery/spec; `SRV-ROLE-009` is truthful non-claim evidence, not fake execution coverage.
4. **Bind Sandbox placement to registered Server roles** — after the public placement candidate/binding seam exists; `SRV-ROLE-010` and `011`.

File-level implementation steps stay in `tasks.md`; tickets remain actor-visible vertical slices.

## Risks and Mitigations

| Risk                                  | Mitigation                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Roles become capability claims        | Keep technical readiness/capability gates independent and explicit.                          |
| Existing installs lose placement      | Empty default/backfill is unrestricted by role.                                              |
| Plan/create or UI/backend diverge     | Enforce at the aggregate/application seam and bind parity tests.                             |
| Existing work is stranded             | Prospective semantics; immutable snapshots and workload-owner bindings remain authoritative. |
| Build role overpromises functionality | Display intent only; defer execution routing until the neutral builder seam exists.          |
| Sandbox role weakens isolation        | Require role plus existing capability evidence.                                              |
| Cloud policy leaks into Community     | Public neutral state/guard; private composition may only add filters.                        |

## Implementation Gate

Code Round starts only after:

- ADR-101 is accepted;
- every active Test Matrix row has an intended automated binding;
- public vertical issues are created and marked `ready-for-agent`;
- the public submodule is on a named branch based on current public `main`;
- current placement entrypoints are enumerated so enforcement cannot ship partially;
- no private Cloud behavior is included in the public issue scope.
