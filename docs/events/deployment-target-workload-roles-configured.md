# deployment_target.workload_roles_configured Event Spec

## Metadata

- Event name: `deployment_target.workload_roles_configured`
- Event category: domain
- Publisher: `servers.configure-workload-roles`
- Aggregate owner: Runtime Topology `DeploymentTarget`
- Current status: implemented aggregate event
- Source classification: current aggregate source

## Meaning

`deployment_target.workload_roles_configured` records that a deployment target's normalized Server
Workload Role set changed. The event carries the complete replacement set, not an incremental
add/remove patch.

The canonical role values are `deployment-runtime`, `artifact-builder`, and `sandbox-worker`. An
empty set means general-purpose/unrestricted by role for every defined workload category.

The event changes prospective placement intent only. It does not activate or deactivate the server,
prove readiness or capability, alter target kind or provider state, drain existing work, rewrite
accepted Deployment snapshots, or move Sandbox, Workspace, build, or runtime bindings.
`artifact-builder` remains intent only until a neutral remote builder executor exists, and
`sandbox-worker` does not bypass independent Sandbox isolation or provider-capability admission.

## Trigger Source And Timing

- Triggering command: `servers.configure-workload-roles`
- Triggering aggregate method: `DeploymentTarget.configureWorkloadRoles`
- Publication timing: after the changed aggregate is persisted by the use case
- Transactional boundary: the current application flow persists first and then publishes through
  the configured event bus; a durable outbox/inbox is not implied by this event contract

## Payload

```ts
type DeploymentTargetWorkloadRolesConfiguredEvent = {
  type: "deployment_target.workload_roles_configured";
  aggregateId: string;
  occurredAt: string;
  payload: {
    workloadRoles: Array<
      "deployment-runtime" | "artifact-builder" | "sandbox-worker"
    >;
  };
};
```

| Field | Required | Meaning | Stability |
| --- | --- | --- | --- |
| `aggregateId` | Yes | Deployment target/server id. | Stable |
| `occurredAt` | Yes | Configuration time supplied to the aggregate. | Stable |
| `payload.workloadRoles` | Yes | Complete normalized replacement set after the mutation. | Stable |

The payload must not include credentials, private keys, provider output, tenant/private policy,
capacity data, current workload details, environment values, or secrets.

## Publication And Idempotency

The event is recorded only when the normalized set changes. Submitting the same valid set in another
order is an idempotent command success with `changed = false`; it performs no persistence write and
publishes no event. Unknown or duplicate role input fails validation before mutation and publishes
no event.

Consumers must treat duplicate delivery idempotently by aggregate id and the complete normalized
set. They must not interpret duplicate delivery as another role transition or trigger placement,
runtime, build, Sandbox, drain, or evacuation effects.

## Consumers

Server list/detail projections, audit views, and non-authoritative placement caches may consume the
event to refresh the current role declaration. A consumer replaces its projected role set with
`payload.workloadRoles`; it must not merge the payload as an incremental patch.

Consumers must not:

- reinterpret or invalidate existing workload bindings;
- start or cancel a Deployment, artifact build, Sandbox, Workspace, or runtime task;
- activate, deactivate, prepare, bootstrap, or probe the server;
- infer connectivity, readiness, health, capacity, isolation, provider capability, or private
  eligibility policy from the role set;
- treat `artifact-builder` as proof of remote build readiness or `sandbox-worker` as sufficient
  Sandbox admission.

## Error Handling

Validation failure uses `validation_error` at `command-validation` and emits no event. Persistence or
publication failures follow the server lifecycle error contract. Consumer failures use
`phase = event-consumption` and must not reinterpret the role mutation, roll back unrelated server
state, or mutate existing workload owners.

Consumers that can retry must use their event-delivery identity or aggregate-version policy and
remain safe under duplicate delivery. This event does not define a retry command, dead-letter store,
or compensating mutation.

## Recovery And Observability

Consumers should log the event type, aggregate id, occurrence time, correlation/causation metadata
when supplied by the delivery envelope, and handler outcome. User-facing recovery from projection
lag is a read refresh; it is not a reason to resubmit the role mutation blindly.

## Test Contract

Tests bind this event to `SRV-ROLE-003`, `SRV-ROLE-004`, `SRV-ROLE-005`, and
`SRV-ROLE-PERSIST-002`:

- changed complete-set replacement emits once after persistence;
- invalid input persists nothing and emits nothing;
- reordered equivalent input returns `changed = false`, writes nothing, and emits nothing;
- payload contains the complete normalized replacement set.

## Open Questions

- None for aggregate event identity, replacement semantics, or producer idempotency.
