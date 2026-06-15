# ADR-084: Deployment Timeline Journal Boundary

## Status

Accepted

## Decision

Deployment observation is consolidated into a single Deployment Timeline Journal boundary.

The public deployment observation surface is:

```text
deployments.show
  + deployments.timeline
  + deployments.timeline.stream
```

`deployments.timeline` is the source of truth for one deployment attempt's ordered operator-facing
history. `deployments.timeline.stream` follows the same journal entries in live mode. Log views,
watch dialogs, deployment-detail timelines, CLI watch output, and recovery handoffs must render
filtered or formatted views of the same journal entries instead of reading a separate deployment-log
store or a deployment-event stream projection.

This supersedes the old split where:

- `deployments.stream-events` owned a structured event timeline;
- `deployments.logs` owned raw attempt logs;
- embedded Deployment-row log entries and retained domain-event stream rows could both feed
  deployment observation.

Domain events remain domain events. Resource runtime logs remain resource-owned runtime
observation. The Deployment Timeline Journal may include observations derived from those sources,
but the journal entry is the deployment-observation fact exposed to Web, CLI, API, SDK, and future
tooling.

## Context

The previous boundary worked while Appaloft needed a reconnectable lifecycle stream without
turning reconnect into a command. It became confusing once product surfaces needed to show both
high-level progress and SSH/Docker/application output during and after deployment:

- Web had to choose between an event timeline and a logs tab.
- Create-time progress, historical deployment logs, and retained event rows used different shapes.
- Docker/SSH/application output was useful in the same operator narrative but could not be shown in
  the event stream without weakening the meaning of domain events.
- The post-deployment logs page and the in-progress modal could drift even when both described the
  same deployment attempt.

The product contract is now simpler: one deployment attempt has one timeline journal. UI surfaces
may emphasize different slices, but they do not own separate facts.

## Chosen Rule

A Deployment Timeline Journal entry must carry:

- stable deployment id;
- stable cursor or sequence;
- occurrence time;
- source such as `appaloft`, `ssh`, `docker`, `application`, `provider`, `health`, or
  `domain-event`;
- kind such as `lifecycle`, `step`, `command`, `output`, `container-log`, `health-check`,
  `status`, `diagnostic`, or `gap`;
- deployment phase when known;
- level;
- operator-facing message;
- optional status, stream name, step progress, and safe metadata.

The journal may record:

- canonical deployment lifecycle facts after durable state changes;
- progress observations emitted by execution adapters;
- SSH/Docker command output that explains the deployment attempt;
- application/container output captured during deployment execution;
- health and access verification observations;
- explicit gap/error/closed entries for observation lifecycle.

It must not:

- make Appaloft event-sourced;
- expose provider-native handles as public cursors;
- treat runtime log storage as the deployment source of truth;
- require the original `deployments.create` transport to remain open;
- publish retry, cancel, redeploy, cleanup, or rollback actions inside journal entries.

## Operation Rules

- `deployments.timeline` is a bounded query for historical journal entries.
- `deployments.timeline.stream` is a read-only follow/reconnect query over the same journal.
- The old `deployments.logs` query and `deployments.stream-events` query are removed from the
  public operation catalog.
- The old `deployments.logs.prune` command is removed with embedded deployment logs. Retention for
  the new journal is governed by the timeline journal store, not the old Deployment-row log JSON
  value.
- `deployments.show` may include summary/count/tail fields derived from the journal, but it does
  not become the journal query.

## Consequences

- The deployment detail page has one timeline source. Its Logs tab, if present, filters timeline
  entries to output/log-like kinds.
- The in-progress modal and post-deployment detail read the same entry shape and can share
  grouping, cursor, copy, and rendering logic.
- `domain_event_stream_records` may continue to exist for domain-event retention, but it no longer
  feeds deployment observation. Deployment observation reads the timeline journal store.
- Execution adapters write timeline entries instead of returning or appending legacy deployment
  log entries.
- Migration can drop old embedded deployment logs and old deployment event-stream observation rows;
  historical compatibility is not required for this boundary reset.

## Governed Specs

- [Deployment Timeline Journal](../specs/095-deployment-timeline-journal/spec.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Supersedes

- [ADR-029: Deployment Event Stream And Recovery Boundary](./ADR-029-deployment-event-stream-and-recovery-boundary.md)
- Deployment-observation use of [ADR-059: Domain Event Stream Retention Boundary](./ADR-059-domain-event-stream-retention-boundary.md)
- Embedded deployment-log retention for Deployment rows.

## Open Questions

- None for the boundary reset. Exact storage-retention knobs for the new journal can be added as a
  later retention slice after the unified source is implemented.
