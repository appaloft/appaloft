# Plan: Scheduled History Retention Automation

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-048, ADR-049, ADR-052, ADR-053, ADR-054, ADR-056, ADR-057, ADR-058,
  ADR-059, ADR-060, ADR-061
- Global contracts:
  - `docs/architecture/async-lifecycle-and-acceptance.md`
  - `docs/architecture/adapter-command-query-boundary.md`
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
- Local specs:
  - `docs/specs/056-audit-event-retention-policy/spec.md`
  - `docs/specs/057-provider-job-log-retention/spec.md`
  - `docs/specs/095-deployment-timeline-journal/spec.md`
  - `docs/specs/059-resource-runtime-log-archive-retention/spec.md`
  - `docs/specs/060-durable-process-delivery-baseline/spec.md`
  - `docs/specs/065-domain-event-stream-retention/spec.md`
  - `docs/specs/066-organization-retention-defaults/spec.md`
- Test matrix: `docs/testing/scheduled-history-retention-test-matrix.md`

## Architecture Approach

- Application placement: scheduled history retention has an application service that reads
  retention defaults through the existing repository/read model, computes cutoffs, records durable
  process attempts, and dispatches existing prune commands through `CommandBus`.
- Shell placement: shell hosts a disabled-by-default scheduler loop and injects the application
  service, execution context factory, and logger. Shell must not call repositories, retention
  stores, or prune use cases directly.
- Persistence impact: this Code Round reuses `retention_defaults` and `process_attempts`. Add
  persistence only if future test-first work proves extra scheduler state is required.
- CQRS impact: no new public command/query is required initially. Public visibility flows through
  existing `retention-defaults.*`, manual prune commands, and `operator-work.*`.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator/internal state closure for `0.11.0`.
- Version target: pre-1.0 policy.
- Compatibility impact: additive internal worker behavior. Manual prune command semantics must not
  change.

## Testing Strategy

- Matrix ids: `SCHED-HISTORY-RETENTION-001` through `SCHED-HISTORY-RETENTION-006`.
- Test-first rows: application service tests for dry-run/destructive dispatch, category guard
  preservation, unsupported category skips, durable process attempt recording, and command-bus-only
  execution.
- Persistence tests: reuse process attempt journal and retention default repository tests unless
  new scheduler state is added.
- Shell tests: disabled-by-default runner configuration and injected policy discovery handoff.
- Entrypoint tests: not applicable unless a new public entrypoint enters scope.

## Current Implementation Notes And Governed Follow-Ups

- Scheduled runtime target prune already has a separate worker under ADR-055 and should be used as
  a pattern, not merged with this worker.
- ADR-054 durable process delivery is the current outbox/inbox-equivalent baseline. Process-attempt
  retention through `operator-work.prune` covers accepted background work for this release target;
  a separate outbox/inbox retention command is not applicable unless a future ADR introduces a
  separate outbox/inbox store.
