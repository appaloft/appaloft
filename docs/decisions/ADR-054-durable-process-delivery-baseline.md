# ADR-054: Durable Process Delivery Baseline

Status: Accepted

Date: 2026-05-12

## Context

Appaloft has a durable process attempt journal and operator repair commands, but accepted
long-running work still lacks a standard delivery boundary. The async lifecycle contract requires
accepted work to have durable state, retry ownership, dedupe, and failure visibility before
production automation depends on it.

The current in-memory event bus is not enough for command acceptance, event consumer delivery, or
background worker retry because process crashes can lose queued work and consumer failures can hide
behind logs. At the same time, introducing a generic event-sourcing system would be too broad for
the current 0.11 operator/internal state closure.

## Decision

Appaloft adopts **durable process delivery** as the first outbox/inbox-equivalent baseline.

Durable process delivery uses the existing process attempt journal as the operator-visible state
record, then adds operation-specific delivery records and workers only for governed long-running
workflows. It is an outbox/inbox equivalent for process progression, not an event-sourcing model
and not a global message broker abstraction.

Every accepted long-running workflow that moves to durable delivery must define:

- the admission command or event that creates a durable attempt;
- the operation key and attempt kind;
- a stable `attemptId`;
- a stable `dedupeKey` and dedupe authority;
- `correlationId`, `causationId`, and `requestId` propagation when available;
- intermediate, retry-scheduled, terminal succeeded, terminal failed, canceled, and dead-lettered
  states as applicable;
- retry policy, maximum attempts, and `nextEligibleAt` rules;
- idempotency behavior for duplicate delivery records and duplicate worker claims;
- failure visibility through `operator-work.list` / `operator-work.show`;
- safe details that exclude secrets, raw provider payloads, shell output, private key paths, and
  environment values;
- retention/prune behavior through existing operator-work retention commands or a governed
  operation-specific retention command.

Process delivery workers must claim due work through an injected application port. Claiming must be
atomic at the persistence adapter boundary so two workers cannot execute the same attempt
concurrently. A worker may execute runtime/provider work only after the claim succeeds.

Retries create a new attempt or a new delivery generation as specified by the local workflow spec.
Raw replay of an old fact event remains duplicate handling, not retry. Terminal attempts remain
historical and operator-visible until retention prunes them.

## Consequences

- The existing durable process attempt journal becomes the required read/repair surface for
  long-running process delivery.
- `operator-work.retry` remains a manual retry annotation until a workflow has an operation-specific
  worker that consumes pending or retry-scheduled attempts.
- New durable workers must be introduced workflow by workflow; this ADR does not make every
  current in-memory event consumer durable automatically.
- Application code owns command/query messages, handler/use-case boundaries, and process delivery
  ports. Persistence owns atomic claim/dedupe translation. Shell composition wires concrete workers.
- CLI, HTTP/oRPC, Web, SDK, and future MCP/tool entrypoints must not call repositories or workers
  directly for delivery behavior.
- In-memory event bus publication may remain for best-effort local projections, but release-critical
  automation must not depend on it until a governed durable delivery path exists.

## Governed Specs

- [Durable Process Delivery Baseline](../specs/060-durable-process-delivery-baseline/spec.md)
- [Durable Process Delivery Test Matrix](../testing/durable-process-delivery-test-matrix.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Operator Work Ledger Spec](../specs/010-operator-work-ledger/spec.md)
- [Operator Work Ledger Test Matrix](../testing/operator-work-ledger-test-matrix.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)

## Migration Gaps

- The current Code state has a process attempt journal, due retry candidate reader, operator
  repair/prune commands, atomic worker claim/completion ports, retry generation, and selected
  durable worker bindings for scheduled-task runs, scheduled runtime prune, scheduled history
  retention, plus preview cleanup, certificate issuance, certificate import, managed certificate
  revocation, proxy bootstrap, and resource runtime control, source-event auto-deploy, dependency
  resource backup/restore, and provider-native dependency resource realization/delete
  operator-visible process-attempt projection.
- Preview cleanup records cleanup outcomes into the process attempt journal for operator-work
  visibility and repair, and its retry scheduler now generates due process-attempt retries before
  executing cleanup through atomic process-attempt claim/completion. The preview cleanup attempt
  store remains compatibility cleanup history.
- Certificate issuance records request, provider issuance, success, and retry-scheduled provider
  failure outcomes into the process attempt journal for operator-work visibility and repair, but
  its retry scheduler still uses certificate aggregate attempt state rather than process-attempt
  atomic claim/completion.
- Managed certificate revocation records running, success, and retriable provider failure outcomes
  from `certificates.revoke` into the process attempt journal for operator-work visibility and
  repair, but revocation execution still runs inline through the command use case rather than
  process-attempt atomic claim/completion. Imported certificate revocation remains Appaloft-local
  lifecycle state and does not call the provider boundary.
- Proxy bootstrap records running, success, and failure outcomes from `servers.bootstrap-proxy` into
  the process attempt journal for operator-work visibility and repair, but repair execution still
  runs inline through the command use case and post-register bootstrap remains event-driven rather
  than process-attempt atomic claim/completion.
- Resource runtime control records running, success, and failure outcomes from
  `resources.runtime.stop`, `resources.runtime.start`, and `resources.runtime.restart` into the
  process attempt journal for operator-work visibility and repair, but runtime-control execution
  still runs inline through the command use case rather than process-attempt atomic
  claim/completion.
- Source-event auto-deploy records accepted source-event ingestion and final dispatch
  success/failure outcomes from `source-events.ingest` into the process attempt journal for
  operator-work visibility and repair, but source-event deployment dispatch still runs inline
  through the existing source-event command path rather than process-attempt atomic
  claim/completion.
- Dependency resource backup/restore records running, success, and failure outcomes from
  `dependency-resources.create-backup` and `dependency-resources.restore-backup` into the process
  attempt journal for operator-work visibility and repair, but provider backup/restore execution
  still runs inline through the command use cases rather than process-attempt atomic
  claim/completion.
- Provider-native dependency resource realization/delete records running, success, and failure
  outcomes from `dependency-resources.provision`, `dependency-resources.provision`,
  and provider-managed `dependency-resources.delete` into the process attempt journal for
  operator-work visibility and repair, but provider realization/delete execution still runs inline
  through the command use cases rather than process-attempt atomic claim/completion.
- Appaloft still does not have a generic durable delivery worker. Existing deployment, proxy
  bootstrap retry execution, resource runtime-control retry execution, and remaining
  provider-resource workflow retry execution must opt into durable delivery in separate Code
  Rounds with local workflow/test updates.
- Domain event stream retention, immutable audit archives, legal holds, organization retention
  defaults, and global event export remain separate retention/audit slices.
