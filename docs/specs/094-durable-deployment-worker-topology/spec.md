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
| Durable work item | Authoritative record for one accepted long-running work item, including status, lease, retry, and safe input. | Operator/Internal State | job item |
| Durable work event | Safe event/log entry for a durable work item. | Operator/Internal State | progress log |
| Database queue backend | Adapter mode using durable work ledger tables as durable state and queue. | Persistence | pg queue |
| External queue backend | Adapter mode backed by Kafka, Temporal, or custom workflow engines while projecting safe process attempts. | Adapter | broker/workflow engine |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- |
| PROC-DELIVERY-WORKER-001 | Embedded server has explicit worker topology | default self-hosted config | topology is created | one worker slot is declared and the server remains the coordinator. |
| PROC-DELIVERY-WORKER-002 | Cloud can declare multiple standalone workers | worker mode is `standalone` and worker count is greater than one | topology is created | every worker has a stable worker id and shares the same worker group. |
| PROC-DELIVERY-WORKER-003 | Disabled worker mode is representable | local CLI/PGlite mode disables background workers | topology is created | no worker slots are declared and durable work can still be queried by id. |
| PROC-DELIVERY-WORKER-004 | Enabled runtime cannot have zero workers | embedded or standalone mode is configured with zero workers | topology validation runs | configuration is rejected before runtime startup. |
| PROC-DELIVERY-WORKER-005 | Database queue backend remains neutral | queue backend is `database` | backend descriptor is requested | durable work ledger is the durable state authority and supports multiple workers through atomic claim. |
| PROC-DELIVERY-WORKER-006 | External backend requires explicit adapter kind | queue backend is `external` without kind | backend descriptor is requested | configuration is rejected so runtime cannot silently fall back to an unknown broker. |
| PROC-DELIVERY-WORKER-007 | Temporal/Kafka/custom backends stay replaceable | external backend kind is configured | backend descriptor is requested | the public contract still requires process-attempt projection and atomic claim semantics. |
| PROC-DELIVERY-WORKER-008 | Queue/progress adapter is one public contract | application code needs to schedule, claim, query, and complete durable work | durable work adapter is inspected | the adapter exposes durable work item/event ledger, due candidate, claim, and completion methods independently of operator projection ports. |
| PROC-DELIVERY-WORKER-009 | Worker topology is environment configurable | environment sets worker mode/count/group/backend | config resolves | `workerRuntime` reflects the requested standalone/embedded topology. |
| PROC-DELIVERY-WORKER-010 | External backend is selectable by config | environment selects `external` + `temporal` | config resolves | `workerRuntime` carries the external backend kind for adapter composition. |
| PROC-DELIVERY-WORKER-011 | Disabled runtime can declare zero workers | environment sets runtime mode to `disabled` and worker count to `0` | config resolves | `workerRuntime` keeps zero workers so local CLI/PGlite flows do not start background execution. |
| PROC-DELIVERY-WORKER-012 | Runtime topology is visible to operators | durable worker runtime is configured | doctor status is read | status includes mode, queue backend, worker group, worker ids, and coordinator role. |
| PROC-DELIVERY-WORKER-013 | Dedicated worker entrypoint exists | CLI composition provides worker runtime startup | `appaloft worker` runs | worker runtime starts without starting the HTTP server. |
| PROC-DELIVERY-WORKER-014 | Database backend has dedicated durable work tables | PGlite/Postgres migrations run | durable work item and event records are written | `durable_work_items` stores claim/retry state and `durable_work_events` stores ordered safe progress logs. |
| PROC-DELIVERY-WORKER-015 | Durable work ledger is a public application boundary | application code needs durable work facts | ledger port is inspected | public item/event record types and ledger methods exist independently of process-attempt projection ports. |
| PROC-DELIVERY-WORKER-016 | Database queue adapter claims and completes durable work | PGlite/Postgres migrations have created durable work ledger tables | due work is recorded, claimed by one worker, completed, and queried by deployment/status | the PG adapter preserves sanitized item/event records, increments attempt count, leases claimed work, refuses duplicate claims, clears leases on completion, and keeps progress queryable by id. |
| PROC-DELIVERY-WORKER-017 | Worker drain executes due work through the queue adapter | a due durable work item has a registered handler | the worker drains once | the runtime lists due work, claims it with a lease, invokes the handler, and completes the item. |
| PROC-DELIVERY-WORKER-018 | Worker drain does not claim unhandled work | a due durable work item has no registered handler | the worker drains once | the runtime skips the item without acquiring a lease so a future handler can own it. |
| PROC-DELIVERY-WORKER-019 | Worker drain completes handler failures | a claimed durable work handler returns a domain error | the worker drains once | the runtime completes the claimed item as failed with retriable error metadata instead of leaving it running forever. |

## Domain Ownership

- Bounded context: Operator/Internal State.
- Aggregate/resource owner: durable work ledger and durable worker topology own execution delivery
  state; process-attempt journal owns operator-facing projection state; Deployment, Resource,
  Server, Blueprint, and InstalledApplication own their own business invariants.
- Upstream/downstream contexts: deployment execution, quick deploy, Blueprint install acceptance,
  dependency provisioning, runtime target execution, and source-event auto-deploy may consume the
  durable worker runtime through local specs.

## Public Surfaces

- API/Web/SDK/MCP: existing command/query surfaces continue to dispatch through buses.
- CLI: `appaloft worker` starts the worker runtime without listening for HTTP; `appaloft serve`
  keeps the embedded default by starting the backend service and worker runtime together.
- Config: `workerRuntime.mode`, `workerRuntime.queueBackend`, `workerRuntime.workerCount`,
  `workerRuntime.workerGroup`, and optional `workerRuntime.externalBackendKind`; environment
  aliases are `APPALOFT_WORKER_RUNTIME_MODE`, `APPALOFT_WORKER_QUEUE_BACKEND`,
  `APPALOFT_WORKER_COUNT`, `APPALOFT_WORKER_GROUP`, and
  `APPALOFT_WORKER_EXTERNAL_BACKEND_KIND`.
- Ports: `DurableWorkLedger` owns authoritative durable item/event facts; `DurableWorkQueueAdapter`
  remains the replaceable queue/delivery adapter boundary.
- Events/logs: `durable_work_events` stores ordered safe progress events for worker execution. It
  does not replace domain events, audit logs, deployment logs, or provider job logs.

## Non-Goals

- Implementing a full deployment worker in this foundation slice.
- Introducing Kafka, Temporal, or Redis adapters.
- Making queue messages the source of truth.
- Converting every inline workflow to background execution.
- Cloud-specific billing, entitlement, or Blueprint catalog behavior.

## Migration Plan

1. Establish public worker topology/config, durable work ledger tables, and adapter contract.
2. Promote `deployments.create` from operator-visible inline projection to durable worker binding:
   accepted command records pending process attempt and returns a deployment id; worker claims and
   executes runtime/provider work.
3. Promote `deployments.retry` and `deployments.rollback` to the same worker binding.
4. Let Cloud Blueprint install acceptance compose public deployment worker attempts for each
   component while Cloud `InstalledApplication` records install-specific business state.
