# Durable Deployment Worker Topology

## Status

- Round: Spec -> Test Matrix -> Code
- Artifact state: active public-neutral foundation slice
- Operation keys: `deployments.create`, `deployments.retry`, `deployments.rollback`,
  `operator-work.*`; future `blueprints.install` may consume the same worker runtime through
  public-neutral commands.

## Business Outcome

Long-running Appaloft work can be accepted, monitored by id, and executed by one or many workers
without binding progress to a single HTTP request, SSH session, or in-memory queue. Community
self-hosting can keep a simple embedded worker default; Cloud can run multiple standalone workers;
future Kafka/Temporal-style backends can be adopted through an adapter without changing command,
query, or domain language.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Durable work | Accepted long-running work whose state is durably recorded before execution. | Operator/Internal State | operation run, background job |
| Durable worker runtime | Configured runtime that starts zero, one, or many worker slots. | Runtime composition | worker process |
| Worker slot | One configured worker identity that can claim due durable work. | Worker runtime | worker |
| Coordinator | Server/runtime composition that knows configured worker topology and exposes status. | Runtime composition | master, but master/slave is not canonical |
| Durable work queue adapter | Replaceable adapter that lists due candidates, claims work, records retry generation, and completes work. | Application ports | queue backend |
| Database queue backend | Adapter mode using the process-attempt journal as durable state and queue. | Persistence | pg queue |
| External queue backend | Adapter mode backed by Kafka, Temporal, or custom workflow engines while projecting safe process attempts. | Adapter | broker/workflow engine |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- |
| PROC-DELIVERY-WORKER-001 | Embedded server has explicit worker topology | default self-hosted config | topology is created | one worker slot is declared and the server remains the coordinator. |
| PROC-DELIVERY-WORKER-002 | Cloud can declare multiple standalone workers | worker mode is `standalone` and worker count is greater than one | topology is created | every worker has a stable worker id and shares the same worker group. |
| PROC-DELIVERY-WORKER-003 | Disabled worker mode is representable | local CLI/PGlite mode disables background workers | topology is created | no worker slots are declared and durable work can still be queried by id. |
| PROC-DELIVERY-WORKER-004 | Enabled runtime cannot have zero workers | embedded or standalone mode is configured with zero workers | topology validation runs | configuration is rejected before runtime startup. |
| PROC-DELIVERY-WORKER-005 | Database queue backend remains neutral | queue backend is `database` | backend descriptor is requested | process-attempt journal is the durable state authority and supports multiple workers through atomic claim. |
| PROC-DELIVERY-WORKER-006 | External backend requires explicit adapter kind | queue backend is `external` without kind | backend descriptor is requested | configuration is rejected so runtime cannot silently fall back to an unknown broker. |
| PROC-DELIVERY-WORKER-007 | Temporal/Kafka/custom backends stay replaceable | external backend kind is configured | backend descriptor is requested | the public contract still requires process-attempt projection and atomic claim semantics. |
| PROC-DELIVERY-WORKER-008 | Queue/progress adapter is one public contract | application code needs to schedule, claim, query, and complete durable work | durable work adapter is inspected | the adapter composes existing ProcessAttempt recorder/read/candidate/claim/completion ports. |
| PROC-DELIVERY-WORKER-009 | Worker topology is environment configurable | environment sets worker mode/count/group/backend | config resolves | `workerRuntime` reflects the requested standalone/embedded topology. |
| PROC-DELIVERY-WORKER-010 | External backend is selectable by config | environment selects `external` + `temporal` | config resolves | `workerRuntime` carries the external backend kind for adapter composition. |
| PROC-DELIVERY-WORKER-011 | Disabled runtime can declare zero workers | environment sets runtime mode to `disabled` and worker count to `0` | config resolves | `workerRuntime` keeps zero workers so local CLI/PGlite flows do not start background execution. |

## Domain Ownership

- Bounded context: Operator/Internal State.
- Aggregate/resource owner: process-attempt journal and durable worker topology own execution
  delivery state; Deployment, Resource, Server, Blueprint, and InstalledApplication own their own
  business invariants.
- Upstream/downstream contexts: deployment execution, quick deploy, Blueprint install acceptance,
  dependency provisioning, runtime target execution, and source-event auto-deploy may consume the
  durable worker runtime through local specs.

## Public Surfaces

- API/CLI/Web/SDK/MCP: no new user command in this foundation slice. Existing command/query
  surfaces continue to dispatch through buses.
- Config: `workerRuntime.mode`, `workerRuntime.queueBackend`, `workerRuntime.workerCount`,
  `workerRuntime.workerGroup`, and optional `workerRuntime.externalBackendKind`; environment
  aliases are `APPALOFT_WORKER_RUNTIME_MODE`, `APPALOFT_WORKER_QUEUE_BACKEND`,
  `APPALOFT_WORKER_COUNT`, `APPALOFT_WORKER_GROUP`, and
  `APPALOFT_WORKER_EXTERNAL_BACKEND_KIND`.
- Ports: `DurableWorkQueueAdapter` composes existing process-attempt delivery ports.
- Events/logs: no global event stream or log storage change in this slice.

## Non-Goals

- Implementing a full deployment worker in this foundation slice.
- Introducing Kafka, Temporal, Redis, or a new table.
- Making queue messages the source of truth.
- Converting every inline workflow to background execution.
- Cloud-specific billing, entitlement, or Blueprint catalog behavior.

## Migration Plan

1. Establish public worker topology/config and adapter contract.
2. Promote `deployments.create` from operator-visible inline projection to durable worker binding:
   accepted command records pending process attempt and returns a deployment id; worker claims and
   executes runtime/provider work.
3. Promote `deployments.retry` and `deployments.rollback` to the same worker binding.
4. Let Cloud Blueprint install acceptance compose public deployment worker attempts for each
   component while Cloud `InstalledApplication` records install-specific business state.
