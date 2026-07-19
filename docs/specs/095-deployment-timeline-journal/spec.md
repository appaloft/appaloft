# Deployment Timeline Journal

## Status

- Round: Spec Round
- Artifact state: boundary reset selected; Code Round required

## Business Outcome

Operators see one coherent deployment history before, during, and after execution. The deployment
modal, deployment detail timeline, logs tab, CLI watch command, and API/SDK reads use the same
journal entries, so SSH/Docker/application output can sit beside Appaloft lifecycle progress
without creating two competing timelines.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Deployment Timeline Journal | Ordered deployment-attempt observation store used by product surfaces. | Release orchestration / deployment observation | deployment timeline, journal |
| Timeline entry | One ordered operator-facing observation in the journal. | Deployment observation | log line, event envelope |
| Timeline source | Origin of an entry, such as Appaloft, SSH, Docker, application, provider, health, or domain event. | Deployment observation | log source |
| Timeline kind | Reader-facing category such as lifecycle, step, command, output, container log, health check, status, diagnostic, or gap. | Deployment observation | event type |
| Log view | Filtered presentation of timeline entries whose kinds are output/log-like. | Web/CLI/API presentation | deployment logs |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-TIMELINE-001 | Single source of truth | a deployment has lifecycle progress plus SSH/Docker output | Web or CLI reads deployment observation | both high-level progress and output lines come from `deployments.timeline` entries ordered by cursor/sequence. |
| DEP-TIMELINE-002 | Modal/detail share entries | a deployment is still running and later completes | the create modal streams and the detail page replays | both surfaces render the same entry shape and do not call `deployments.logs` or `deployments.stream-events`. |
| DEP-TIMELINE-003 | Log view is a filter | a deployment has lifecycle, command, stdout, stderr, and health entries | the Logs tab or log command opens | the view filters journal entries by output/log-like kinds instead of reading a separate log store. |
| DEP-TIMELINE-004 | Durable reconnect | a client disconnects after receiving a cursor | it follows `deployments.timeline.stream` with that cursor | replay resumes strictly after the cursor or returns a governed gap entry. |
| DEP-TIMELINE-005 | Domain events are not the UI timeline | deployment domain events are recorded for retention | deployment detail opens | domain events may produce journal entries, but the UI reads the timeline journal, not `domain_event_stream_records`. |
| DEP-TIMELINE-006 | Legacy surfaces removed | code or generated SDK scans active operations | operation catalog is built | `deployments.logs`, `deployments.logs.prune`, and `deployments.stream-events` are absent; timeline operations are present. |
| DEP-TIMELINE-007 | Failed Compose startup keeps bounded candidate logs | `docker compose up` fails after one or more candidate services start or exit | the SSH execution adapter records failure and cleans up the candidate | Appaloft captures at most 200 non-following Compose log lines through the redacted deployment timeline before removing candidate containers, so init-job and service failures remain diagnosable after cleanup. |

## Domain Ownership

- Bounded context: Release orchestration / deployment observation.
- Aggregate/resource owner: Deployment attempt owns the journal scope; execution adapters and
  lifecycle services append observations through application ports.
- Upstream/downstream contexts: resource runtime logs, health checks, provider job logs, domain
  events, recovery readiness, and operator work may provide evidence or links, but they do not own
  the deployment observation fact exposed by this journal.

## Public Surfaces

- API: `GET /api/deployments/{deploymentId}/timeline`.
- API stream: `GET /api/deployments/{deploymentId}/timeline/stream`.
- CLI: `appaloft deployments timeline <deploymentId>` and watch mode over the same query.
- Web: deployment progress modal, deployment detail timeline, and deployment log view.
- SDK: `appaloft.deployments.timeline` and `appaloft.deployments.timeline.stream`.

Removed public surfaces:

- `deployments.logs`.
- `deployments.logs.prune`.
- `deployments.stream-events`.

## Entry Shape

```ts
type DeploymentTimelineEntry = {
  deploymentId: string;
  sequence: number;
  cursor: string;
  occurredAt: string;
  source: "appaloft" | "ssh" | "docker" | "application" | "provider" | "health" | "domain-event";
  kind:
    | "lifecycle"
    | "step"
    | "command"
    | "output"
    | "container-log"
    | "health-check"
    | "status"
    | "diagnostic"
    | "gap";
  phase?: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
  level: "debug" | "info" | "warn" | "error";
  message: string;
  status?: "running" | "succeeded" | "failed" | "canceled" | "rolled-back";
  stream?: "stdout" | "stderr";
  step?: {
    current: number;
    total: number;
    label: string;
  };
  metadata?: Record<string, string | number | boolean | null>;
};
```

The stream envelope uses the same entry shape:

```ts
type DeploymentTimelineEnvelope =
  | { schemaVersion: "deployments.timeline/v1"; kind: "entry"; entry: DeploymentTimelineEntry }
  | { schemaVersion: "deployments.timeline/v1"; kind: "heartbeat"; at: string; cursor?: string }
  | { schemaVersion: "deployments.timeline/v1"; kind: "gap"; entry: DeploymentTimelineEntry }
  | {
      schemaVersion: "deployments.timeline/v1";
      kind: "closed";
      reason: "completed" | "cancelled" | "source-ended" | "idle-timeout";
      cursor?: string;
    }
  | { schemaVersion: "deployments.timeline/v1"; kind: "error"; error: DomainError };
```

## Non-Goals

- Event sourcing.
- Backfilling historical deployments from old embedded logs or event-stream records.
- Making resource runtime log archives deployment-owned.
- Exposing provider-native log cursors, container ids, worker ids, leases, or internal attempts as
  public timeline identifiers.
- Adding new deployment mutation commands.

## Code Round Requirements

- Replace legacy `DeploymentLogEntry`, `DeploymentLogSummary`, and `DeploymentObservedEvent`
  observation paths with timeline journal entry/envelope types.
- Replace `DeploymentLogProgressRecorder` with a timeline journal recorder.
- Remove `deployments.logs`, `deployments.logs.prune`, and `deployments.stream-events` from the
  public operation catalog, CLI/API/oRPC routing, SDK fixtures, docs registry, and Web clients.
- Ensure execution adapters append timeline entries for Appaloft progress plus SSH/Docker/output
  observations.
- Ensure deployment detail, progress modal, and logs view use shared timeline grouping/filtering
  code.
- Add persistence for the journal or rename the existing deployment-log persistence boundary so it
  no longer exposes embedded Deployment-row logs as the product contract.
- Drop or ignore legacy deployment-log data and deployment event-stream observation rows; no
  compatibility migration is required.

## Current Implementation Notes And Migration Gaps

This spec intentionally describes the target state. Current code still contains legacy deployment
logs, deployment event stream observation, and UI split points until the Code Round removes them.
