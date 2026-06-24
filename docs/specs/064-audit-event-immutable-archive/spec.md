# Audit Event Immutable Archive

## Status

- Round: Code Round plus Post-Implementation Sync
- Artifact state: implemented

## Business Outcome

Operators can create a retained, redacted, integrity-checkable snapshot of selected audit rows
before destructive retention work, support handoff, or incident review, without treating ad hoc
exports or legal holds as immutable archive records.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Audit archive | An immutable retained snapshot derived from selected redacted audit rows. | Operator audit history | immutable audit archive |
| Archive source selection | The aggregate or global time-window filters used to choose source audit rows. | Operator audit history | archive filters |
| Archive content digest | Deterministic digest over the archived redacted rows and metadata used to verify readback integrity. | Operator audit history | archive checksum |
| Source-row reference retention | Optional archive metadata that keeps the source audit rows from prune while the archive remains retained. | Operator audit history | archive retention guard |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AUDIT-EVENT-ARCHIVE-001 | Create aggregate archive | retained audit rows exist for one aggregate | `audit-events.archives.create` runs with aggregate id and reason | Appaloft records an immutable redacted archive snapshot with source filters, item count, generated time, and digest metadata. |
| AUDIT-EVENT-ARCHIVE-002 | Create bounded global archive | retained audit rows exist across aggregates | create runs with `from`, `to`, and reason | Appaloft records only rows inside the required window and rejects missing or invalid time bounds. |
| AUDIT-EVENT-ARCHIVE-003 | Archive readback is immutable and safe | an archive exists | list/show is queried | Appaloft returns safe metadata and redacted archived rows without raw payloads, secrets, or mutation affordances. |
| AUDIT-EVENT-ARCHIVE-004 | Archive prune is dry-run-first | retained archives are older than `before` | `audit-events.archives.prune` omits `dryRun` | Appaloft returns archive counts without deleting archive records. |
| AUDIT-EVENT-ARCHIVE-005 | Archive-aware audit prune | old source audit rows are referenced by retained archives with source-row reference retention | `audit-events.prune` runs | matching source rows are counted as archive-retained/skipped and are not deleted while the archive remains retained. |
| AUDIT-EVENT-ARCHIVE-006 | Entrypoints dispatch through buses | CLI or HTTP/oRPC manages archives | inputs are parsed | adapters dispatch archive commands/queries through `CommandBus` or `QueryBus` using shared schemas. |

## Domain Ownership

- Bounded context: Operator audit history.
- Aggregate/resource owner: none. Archives are retained audit-history records and do not own
  write-side aggregate behavior.
- Upstream/downstream contexts: `audit-events.prune` observes retained archive source-row
  references before deleting audit rows; server delete safety continues to observe retained audit
  rows as blockers, while project and resource delete safety do not.

## Public Surfaces

- API:
  - `POST /api/audit-events/archives`
  - `GET /api/audit-events/archives`
  - `GET /api/audit-events/archives/{archiveId}`
  - `POST /api/audit-events/archives/prune`
- CLI:
  - `appaloft audit-event archive create`
  - `appaloft audit-event archive list`
  - `appaloft audit-event archive show <archiveId>`
  - `appaloft audit-event archive prune`
- Web/UI: future operator maintenance panel may expose the same surfaces after showing archive
  scope, row count, digest, and retention impact.
- Config: none in the first slice.
- Events: none in the first slice.
- Public docs/help: target existing operator audit events anchor until a broader retention page is
  introduced.

## Non-Goals

- Legal hold creation or release.
- Legal discovery workflow, approval workflow, or external compliance-system integration.
- Raw, unredacted audit payload preservation.
- Domain event stream retention or replay.
- Outbox/inbox retention.
- Organization retention defaults.
- Scheduled retention automation.
- Runtime logs, provider job logs, deployment logs, process-attempt journal, remote-state backups,
  runtime artifacts, source workspaces, build cache, route state, resource/server/deployment state,
  dependencies, or storage volume retention.

## Current Implementation Notes And Migration Gaps

- Application commands/queries, persistence/pg archive storage, archive-aware audit prune, CLI and
  HTTP/oRPC entrypoints, operation catalog entries, public docs/help coverage, OpenAPI/SDK metadata
  coverage, and automated tests are implemented.
- Archive source-row reference retention is active through the archive create input and
  archive-aware `audit-events.prune` skip reporting.
- Bounded archive source selection and row caps are enforced by the archive command/store boundary.
- Domain event stream retention, organization defaults, and scheduled history retention automation
  are separate implemented Phase 9 slices. ADR-054 defines durable process attempts as the current
  outbox/inbox-equivalent baseline, so accepted background-work retention is covered by
  `operator-work.prune`; a separate outbox/inbox retention command remains not applicable unless a
  future ADR introduces a separate store. Legal/compliance workflows and Web maintenance affordances
  remain future governed slices.
