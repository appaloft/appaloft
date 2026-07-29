# ADR-101: Server Workload Role Admission

Status: Accepted

Date: 2026-07-28

## Context

A registered Appaloft Server currently carries generalized runtime-host identity, lifecycle state,
target shape, provider family, credentials, and edge-proxy intent. Operators cannot declare whether
a server is intended for application runtime placement, artifact building, Sandbox/agent execution,
or a combination. Encoding purpose into `targetKind`, provider keys, technical capabilities, or
Cloud-private fleet state would conflate independent concerns and would not work for Community BYOS
or Enterprise customer-owned servers.

Any additive model must preserve existing behavior. Historical servers have no role declaration,
and accepted Deployment snapshots, build placements, Sandboxes, Workspaces, and Runs retain durable
placement facts that must not be reinterpreted by later configuration.

## Decision

1. Runtime Topology's public `DeploymentTarget` owns a normalized set of Server Workload Roles.
2. The canonical values are `deployment-runtime`, `artifact-builder`, and `sandbox-worker`.
3. The set is optional and multi-valued. An empty set means general-purpose/unrestricted by role so
   existing and newly unmarked servers remain eligible for every defined workload category.
4. Roles express operator placement intent only. Lifecycle, connectivity, credentials, readiness,
   provider capability, isolation evidence, health, capacity, tenant policy, and cost remain
   independent admission gates.
5. Registration may declare roles. Later changes use the dedicated
   `servers.configure-workload-roles` command and atomically replace the complete set.
6. Duplicate and unknown inputs fail validation. Reordering an equivalent set is idempotent and
   produces no state change or duplicate domain event.
7. The aggregate's new-work admission seam checks active lifecycle and the required role. Explicit
   and automatic placement paths call the same guard before effects and fail closed on mismatch.
8. Deployment planning and creation require `deployment-runtime`. Artifact build placement requires
   `artifact-builder` only after a neutral builder-executor seam exists. Registered-Server Sandbox
   provisioning/relocation requires `sandbox-worker` only after the neutral placement
   candidate/binding carries Server identity.
9. Passing a role gate never proves technical capability. Sandbox isolation/readiness evidence and
   future builder readiness remain independently mandatory.
10. Role changes affect new placement only. They do not stop, migrate, evict, cancel, delete, or
    invalidate existing work. Accepted snapshots and workload-owner bindings remain authoritative.
11. Adapters consume an admitted placement and do not inspect roles. Cloud/Enterprise may add
    tenant, entitlement, quota, region, affinity, capacity, cost, and fleet policy through public
    ports, but may not redefine or duplicate the role meanings.
12. Drain, evacuation, remote builder execution, and general scheduling are separate governed
    capabilities, not hidden effects of role configuration.

## Consequences

- Community BYOS, Cloud, and Enterprise use one neutral role vocabulary and aggregate invariant.
- Existing server rows migrate to `[]` without changing placement behavior.
- A server can intentionally accept multiple workload categories.
- Server list/show and public transports expose intent separately from runtime availability and
  provider capability.
- Deployment plan/create gain one orthogonal admission filter before runtime backend resolution;
  accepted Runtime Plan snapshots remain stable after later role changes.
- `artifact-builder` can be configured and displayed before remote building exists, but products
  must not present the role as execution readiness.
- `sandbox-worker` does not weaken Execution Sandbox isolation, recovery, or provider capability
  contracts.
- Future drain/evacuation and richer placement policies require their own specs and lifecycle
  operations.

## Verification

Governed by
[Server Workload Role Test Matrix](../testing/server-workload-role-test-matrix.md).
