# Source Binding And Auto Deploy Test Matrix

## Status

Spec Round placeholder for Phase 7 / `0.9.0`.

No source auto-deploy command, source event ingestion route, or background worker is active yet.

## Governing Sources

- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [ADR-037: Source Event Auto Deploy Ownership](../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [resources.configure-auto-deploy](../commands/resources.configure-auto-deploy.md)
- [source-events.ingest](../commands/source-events.ingest.md)
- [source-events.list](../queries/source-events.list.md)
- [source-events.show](../queries/source-events.show.md)
- [Source Event Auto Deploy Error Spec](../errors/source-events.md)
- [deployments.create](../commands/deployments.create.md)
- [Resource Profile Lifecycle](../workflows/resource-profile-lifecycle.md)
- [Deployment Config File Test Matrix](./deployment-config-file-test-matrix.md)
- [Source Link State Test Matrix](./source-link-state-test-matrix.md)

## Policy Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `SRC-AUTO-POLICY-001` | Resource has compatible Git source binding and user enables push auto-deploy for one branch. | Policy is persisted without mutating source binding or deployment history. | planned | Deferred gap |
| `SRC-AUTO-POLICY-002` | Resource has no compatible source binding. | Configure command rejects with stable source binding blocker. | planned | Deferred gap |
| `SRC-AUTO-POLICY-003` | Source binding changes after policy creation. | Policy becomes blocked pending explicit acknowledgement and cannot create deployments. | planned | Deferred gap |

## Event Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `SRC-AUTO-EVENT-001` | Verified push event matches one enabled policy. | One deployment is accepted through existing deployment admission. | planned | Deferred gap |
| `SRC-AUTO-EVENT-002` | Provider redelivers same event. | Durable source-event dedupe prevents duplicate deployment and read model reports deduped. | planned | Deferred gap |
| `SRC-AUTO-EVENT-003` | Event ref does not match policy. | No deployment is created and read model reports ignored ref. | planned | Deferred gap |
| `SRC-AUTO-EVENT-004` | Generic signed webhook has invalid signature. | Event rejects before policy matching; no deployment is created. | planned | Deferred gap |
| `SRC-AUTO-EVENT-005` | Multiple Resources match one event. | Each matching Resource creates at most one coordinated deployment attempt. | planned | Deferred gap |

## Query Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `SRC-AUTO-QUERY-001` | Operator lists source events by Resource. | Query returns only safe scoped records with status, dedupe, ignored reasons, and created deployment ids. | planned | Deferred gap |
| `SRC-AUTO-QUERY-002` | Operator shows one source event. | Query returns safe verification, policy result, ignored/blocked/failed reason, and created deployment details without raw payload or secrets. | planned | Deferred gap |

## Entrypoint Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `SRC-AUTO-ENTRY-001` | CLI, HTTP/oRPC, Web, and future MCP/tool configure auto-deploy. | Entrypoints reuse the same command/query schemas and operation keys. | planned | Deferred gap |
| `SRC-AUTO-ENTRY-002` | HTTP generic signed webhook receives source event. | Transport verifies signature and dispatches provider-neutral source event command. | planned | Deferred gap |
| `SRC-AUTO-ENTRY-003` | Web Resource detail shows event-created deployment. | Deployment links back to safe source event facts and ignored/deduped events remain visible. | planned | Deferred gap |
| `SRC-AUTO-SURFACE-003` | Public help links. | Setup, signatures, dedupe, ignored events, and recovery link to stable docs anchors in both locales. | planned | Deferred gap |

## Current Implementation Notes And Migration Gaps

Resource source binding, source fingerprint link state, and manual deployment admission already
exist. This matrix tracks the missing auto-deploy policy, source event ingestion, dedupe, read
models, and entrypoint surfaces. Code Round must not mark auto-deploy complete until these rows have
stable automation or explicit deferred exceptions.
