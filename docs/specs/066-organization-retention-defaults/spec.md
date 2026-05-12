# Organization Retention Defaults

## Status

- Round: Code Round
- Artifact state: application, persistence, CLI, and HTTP/oRPC slices implemented

## Business Outcome

Operators can define safe organization-level retention defaults for Appaloft history categories so
scheduled history retention automation can compute cutoffs without hardcoding policy into each
prune command.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Retention defaults | Default policy values for how long retained Appaloft history categories should be kept. | Operator/Internal State | retention policy defaults |
| Retention category | A governed history category such as audit rows, provider job logs, deployment logs, runtime log archives, domain event streams, or process attempts. | Retention policy | retention target |
| Destructive scheduling permission | Explicit policy flag that allows a scheduled retention worker to request destructive pruning for one category. | Retention automation | destructive automation |
| Dry-run scheduling permission | Policy flag that allows a scheduled retention worker to dispatch dry-run retention work for visibility. | Retention automation | preview automation |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ORG-RETENTION-DEFAULTS-001 | Configure safe defaults | an operator supplies category windows and scheduling flags | `retention-defaults.configure` runs | Appaloft persists the policy and returns safe metadata without executing prune work. |
| ORG-RETENTION-DEFAULTS-002 | Read configured defaults | retention defaults exist | `retention-defaults.list/show` runs | Appaloft returns category, retention days, scheduling flags, scope, and updated metadata without secrets or retained history payloads. |
| ORG-RETENTION-DEFAULTS-003 | Manual prune remains explicit | retention defaults exist | a manual prune command runs without explicit cutoff | the command still rejects missing cutoff or uses its own schema default; it does not infer destructive behavior from defaults. |
| ORG-RETENTION-DEFAULTS-004 | Safety guards win | defaults allow destructive scheduling | legal holds, immutable archives, replay guards, active attempts, recovery evidence, or category-specific skip rules apply | later scheduled retention workers must skip guarded rows and report skipped counts. |
| ORG-RETENTION-DEFAULTS-005 | Entrypoints stay CQRS-thin | CLI or HTTP/oRPC configures or reads defaults | adapters parse inputs | adapters dispatch command/query messages through buses using shared schemas. |

## Domain Ownership

- Bounded context: Operator/Internal State / Retention policy.
- Aggregate/resource owner: none in core. Retention defaults are application policy records, not
  aggregate state.
- Upstream/downstream contexts: audit rows, domain event streams, provider job logs, deployment
  logs, resource runtime log archives, and process attempts consume defaults only through governed
  scheduled retention automation.

## Public Surfaces

- API: active `POST /api/retention-defaults`, `GET /api/retention-defaults`, and
  `GET /api/retention-defaults/{category}`.
- CLI: active `appaloft retention-default configure/list/show`.
- Web/UI: future operator maintenance panel may expose the same policy readback and configuration.
- Config: no repository config field in the first slice.
- Events: none in the first slice.
- Public docs/help: target an operator retention policy anchor during Code Round.

## Non-Goals

- Executing prune work.
- Executing prune work directly from retention defaults.
- Replacing manual prune command input.
- Legal hold, immutable archive, domain event stream, outbox/inbox, process attempt, log, snapshot,
  runtime artifact, source workspace, build cache, route, resource, server, deployment,
  dependency, or storage volume retention behavior.
- Organization-wide secret retention or environment-variable retention.

## Current Implementation Notes And Migration Gaps

- Application command/query messages, handlers, use case/query services, operation catalog entries,
  shell DI, PostgreSQL/PGlite persistence, CLI commands, and HTTP/oRPC routes exist for
  `retention-defaults.configure/list/show`.
- Existing manual prune commands remain explicit and dry-run-first.
- Scheduled runtime artifact/workspace prune has its own runtime-prune policy boundary governed by
  ADR-055 and is not replaced by organization retention defaults.
- Scheduled history retention automation consumes enabled defaults through the separate ADR-061
  worker slice.

## Open Questions

- Edition-specific UI affordances for organization-scope defaults remain future Web maintenance
  design work.
