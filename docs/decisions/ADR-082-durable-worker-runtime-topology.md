# ADR-082: Durable Worker Runtime Topology

Status: Accepted

Date: 2026-06-08

## Context

Deployment creation, deployment retry, deployment rollback, quick deploy, and Blueprint-backed
installs can take longer than a request/response lifecycle. Appaloft already records
operator-visible process attempts, and selected maintenance workflows use atomic process-attempt
claim/completion. Deployment execution is still an inline workflow with process-attempt projection,
so a backend restart can leave execution progress unclear even when the Deployment aggregate and
operator ledger are visible.

Appaloft needs a neutral public worker runtime model that Community, Cloud, and Enterprise can all
use without coupling the domain model to PostgreSQL, Kafka, Temporal, or any provider-specific
runner.

## Decision

Appaloft defines a durable worker runtime topology as a public application-layer contract.

The topology has three runtime modes:

- `embedded`: the server process starts worker slots in-process. This is the default for simple
  self-hosted installs and keeps deployment easy.
- `standalone`: worker slots run in one or more separate worker processes. Cloud and larger
  installs can scale this mode horizontally.
- `disabled`: no background worker is started; callers may submit/query work, but execution must be
  driven by an explicit external caller or local Dokku-style synchronous loop.

The topology is not master/slave. The server is a coordinator because it knows configured worker
capacity and exposes status, but workers own work only after an atomic claim through the durable
work queue adapter. Multiple workers compete through claim/lease semantics; the durable state
authority prevents duplicate execution.

The default queue backend is `database`, backed by public durable work ledger tables. A durable work
item is the authoritative claim/retry/source-of-truth record; durable work events are the safe
event/log stream for progress. External backends such as Kafka, Temporal, or custom engines are
allowed only behind the same durable work adapter contract and must project safe durable work and
process-attempt state for `operator-work.*` visibility.

## Consequences

- `durable_work_items` and `durable_work_events` are the default database backend's durable state
  authority.
- `ProcessAttempt*` ports remain the operator-facing projection and compatibility query contract.
- `DurableWorkQueueAdapter` is the replaceable queue/delivery adapter boundary for database and
  external workflow engines.
- The PG adapter records safe work item/event state, lists due candidates, claims through
  status/lease conditions, refuses duplicate workers, and clears leases when work completes.
- The neutral worker drain primitive depends only on the durable work adapter and handler registry:
  it lists due items, skips unhandled work, claims leases before execution, completes successful
  handler results, and turns handler domain errors into retriable failed work.
- `workerRuntime` config records mode, queue backend, worker count, worker group, and optional
  external backend kind.
- `appaloft serve` starts the embedded backend service and worker runtime together. `appaloft
  worker` starts the worker runtime without the HTTP server for standalone deployments.
- Embedded mode may be the default, but production Cloud can run standalone worker replicas with a
  shared database/external backend.
- PGlite local/CLI mode can keep `embedded` for a long-running local server, or use `disabled`
  when the CLI command performs a bounded synchronous loop and the caller polls deployment status.
- Deployment execution still requires a governed worker binding before it is fully restart
  resumable. This ADR establishes the neutral topology and adapter boundary first.

## Guardrails

- Queue messages must not be the source of truth. They may point at a durable work item id, but
  safe input snapshots, state, retry information, leases, and safe progress belong in durable
  state.
- Worker adapters must not expose raw logs, shell commands, private key paths, secrets, provider
  payloads, or environment values through process-attempt safe details.
- CLI, HTTP/oRPC, Web, SDK, MCP, and AI skill entrypoints must dispatch commands/queries and never
  call worker adapters directly.
- Cloud-specific Blueprint install orchestration may compose this public worker runtime, but the
  durable worker model itself remains public-neutral.

## Governed Specs

- [Durable Deployment Worker Topology](../specs/094-durable-deployment-worker-topology/spec.md)
- [Durable Worker Runtime Test Matrix](../testing/durable-worker-runtime-test-matrix.md)
- [Durable Process Delivery Baseline](../specs/060-durable-process-delivery-baseline/spec.md)
- [Operator Work Ledger Spec](../specs/010-operator-work-ledger/spec.md)
