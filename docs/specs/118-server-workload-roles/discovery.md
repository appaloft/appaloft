# Discovery: Server Workload Roles

## Business Outcome

An instance or organization operator can declare which categories of new workload a registered
server is intended to accept, while preserving existing deployments, builds, Sandboxes, Workspace
sessions, and historical references when that intent changes.

## Existing Evidence

- `DeploymentTarget` is the public aggregate that owns generalized server/runtime-host identity,
  lifecycle state, target shape, provider family, credential relationship, and edge-proxy intent.
- `DeploymentTarget.targetKind` already means placement shape (`single-server` or
  `orchestrator-cluster`), not workload purpose or provider identity.
- Inactive or deleted targets are already excluded from new deployment and scheduling admission.
- Deployment execution selects a runtime backend through target kind, provider key, and provider
  capabilities after a server and destination have been selected.
- Execution Sandbox placement already treats Runtime Topology as an upstream context and requires
  truthful provider/server isolation and capability evidence. A cheap VPS is not automatically
  Sandbox-capable.
- The public model has no controlled server-purpose vocabulary. Cloud registered-server Sandbox
  placement currently applies private owner-scope and availability policy without a public role
  constraint.
- Appaloft has build planning and local/SSH runtime execution, but no complete neutral remote
  artifact-build executor contract. A role marker alone cannot make remote builds operational.

## Owner-Confirmed Decisions

The owner requested optional, multi-valued server classification analogous to deployment/build
server purpose and explicitly authorized the next Grill/Spec phase on 2026-07-28. The following
recommended decisions from the planning review are accepted for this phase:

| Topic                       | Decision                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical concept           | `Server Workload Roles` is the user-facing concept; `DeploymentTargetWorkloadRoles` is aggregate-owned state.                                                                                                                                                                        |
| V1 roles                    | `deployment-runtime`, `artifact-builder`, and `sandbox-worker`.                                                                                                                                                                                                                      |
| Cardinality                 | A server has a set of zero or more roles; roles are not mutually exclusive.                                                                                                                                                                                                          |
| Empty set                   | `[]` means general-purpose/unrestricted by role so existing and newly unmarked servers remain eligible for every defined workload category.                                                                                                                                          |
| Target shape                | Roles remain independent from `targetKind`; a target's topology and intended workload categories answer different questions.                                                                                                                                                         |
| Intent versus evidence      | A role records operator placement intent only. Lifecycle, connectivity, credentials, runtime/provider capability, isolation evidence, capacity, tenant policy, and health remain separate admission gates.                                                                           |
| Change semantics            | Role changes affect new placement only. They do not stop, migrate, evict, cancel, or delete existing work.                                                                                                                                                                           |
| Existing binding continuity | A resource/deployment, build attempt, Sandbox, or Workspace already bound to a server may continue, recover, or redeploy according to its existing lifecycle contract; removing a role does not silently invalidate its durable binding.                                             |
| Sandbox language            | `sandbox-worker` names what the server hosts. Agent Workspace remains an entry workflow over Sandbox and does not become Server-owned state.                                                                                                                                         |
| Build truth                 | `artifact-builder` may be modeled and displayed in the role slice, but remote build execution is not claimed until a neutral build-executor seam, readiness evidence, logs, cancellation, cache ownership, and artifact provenance are implemented.                                  |
| Public/private ownership    | The role vocabulary, aggregate state, neutral eligibility behavior, commands, queries, persistence, public entrypoints, and docs belong to public Appaloft. Cloud consumes them and adds tenant, entitlement, quota, capacity, region, affinity, cost, and managed-inventory policy. |
| Mutation boundary           | Use intention-revealing `servers.configure-workload-roles`; never add `servers.update`, `servers.patch`, or `isBuildServer`.                                                                                                                                                         |
| Configuration shape         | Registration may accept optional `workloadRoles`; later changes atomically replace the whole normalized set.                                                                                                                                                                         |
| Idempotency                 | Reordering the same role set is no change and emits no duplicate domain event. Duplicate or unknown role inputs fail validation.                                                                                                                                                     |
| Readback                    | `servers.list` and `servers.show` expose normalized roles immediately after successful persistence.                                                                                                                                                                                  |
| Failure behavior            | Explicit or automatic new placement must fail closed on role mismatch and must not fall back to a mismatched server.                                                                                                                                                                 |
| Drain/evacuation            | Draining or evacuating an existing role's work requires a separate future lifecycle workflow and is not hidden in role configuration.                                                                                                                                                |

## Rejected Alternatives

- Extend `targetKind` with `build-server` or `agent-server`: rejected because target shape and
  workload admission intent are orthogonal.
- Add mutually exclusive booleans such as `isBuildServer`: rejected because they cannot express
  multiple roles, a general-purpose server, or future role additions without contradictory state.
- Use free-form labels for placement: rejected because spelling aliases and ungoverned values cannot
  safely drive admission.
- Interpret no roles as accepting no work: rejected because it would make every historical server
  ineligible after an additive migration.
- Automatically stop or migrate workloads when roles change: rejected because configuration would
  become a destructive lifecycle command with hidden cross-aggregate effects.
- Create a Cloud-only server role model: rejected because Community BYOS and Enterprise
  customer-owned servers need the same neutral vocabulary and public extension seam.

## Constraints And Safety Boundaries

- Role eligibility is necessary but never sufficient for placement.
- Tenant/organization scope must be checked before revealing or selecting candidates.
- Inactive and deleted targets remain ineligible regardless of roles.
- Provider capability and readiness must be proven at the operation that needs them; role state must
  never be presented as live health or runtime capability evidence.
- Server role configuration owns no Resource, Deployment, Sandbox, Workspace, build attempt,
  provider artifact, credential, route, log, or audit mutation.
- No repository config field selects or mutates durable server roles. Trusted entrypoints may choose
  an already authorized server but cannot bypass role admission.

## Open Questions

None for the Server Workload Roles Spec Round. Remote artifact-build execution, explicit drain and
evacuation, and richer placement/capacity policy are governed follow-ups rather than unresolved role
semantics.
