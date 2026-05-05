# Source Binding And Auto Deploy Test Matrix

## Status

Test-First / Code Round preparation for Phase 7 / `0.9.0`.

Resource-owned auto-deploy policy domain behavior, application command handling, Resource
repository persistence, source-event command/query handling, generic signed source-event
verification, durable source-event dedupe/read models, and ignored policy-match outcomes have
automation. Source event deployment dispatch through existing deployment admission has application
automation. Ingestion routes, entrypoints, and background workers are not active yet.

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
| `SRC-AUTO-POLICY-001` | Resource has compatible Git source binding and user enables push auto-deploy for one branch. | Policy is persisted without mutating source binding or deployment history. | `packages/core/test/resource.test.ts`; `packages/application/test/configure-resource-auto-deploy.test.ts`; `packages/persistence/pg/test/resource-auto-deploy-policy.pglite.test.ts` | Passing |
| `SRC-AUTO-POLICY-002` | Resource has no compatible source binding. | Configure command rejects with stable source binding blocker. | `packages/core/test/resource.test.ts`; `packages/application/test/configure-resource-auto-deploy.test.ts` | Passing |
| `SRC-AUTO-POLICY-003` | Source binding changes after policy creation. | Policy becomes blocked pending explicit acknowledgement and cannot create deployments. | `packages/core/test/resource.test.ts`; `packages/persistence/pg/test/resource-auto-deploy-policy.pglite.test.ts` | Passing |
| `SRC-AUTO-POLICY-004` | Generic signed webhook policy is configured with a secret reference. | Configure accepts only the first Resource-scoped `resource-secret:<KEY>` family and rejects arbitrary, environment, dependency, certificate, or provider secret references before persistence/events. | `packages/core/test/resource.test.ts`; `packages/application/test/configure-resource-auto-deploy.test.ts` | Passing |

## Event Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `SRC-AUTO-EVENT-001` | Verified push event matches one enabled policy. | One deployment is accepted through existing deployment admission. | `packages/application/test/source-events.test.ts` | Passing |
| `SRC-AUTO-EVENT-002` | Provider redelivers same event. | Durable source-event dedupe prevents duplicate source-event records and duplicate deployment dispatch while read models report deduped status. | `packages/application/test/source-events.test.ts`; `packages/persistence/pg/test/source-events.pglite.test.ts` | Passing |
| `SRC-AUTO-EVENT-003` | Event ref does not match policy. | No deployment is created and read model reports ignored ref. | `packages/application/test/source-events.test.ts`; `packages/persistence/pg/test/source-events.pglite.test.ts` | Passing |
| `SRC-AUTO-EVENT-004` | Generic signed webhook has invalid signature. | Event rejects before policy matching; no deployment is created. | `packages/application/test/source-events.test.ts`; `packages/orpc/test/source-event-generic-signed.http.test.ts` | Passing |
| `SRC-AUTO-EVENT-005` | Multiple Resources match one event. | Each matching Resource creates at most one coordinated deployment attempt. | `packages/application/test/source-events.test.ts` | Passing |
| `SRC-AUTO-EVENT-006` | Resource-scoped generic signed webhook targets a source also used by another Resource. | Secret resolution and matching are limited to the route Resource; no other Resource deployment is dispatched. | `packages/application/test/source-events.test.ts` | Passing |

## Query Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `SRC-AUTO-QUERY-001` | Operator lists source events by Resource. | Query returns only safe scoped records with status, dedupe, ignored reasons, and created deployment ids. | `packages/application/test/source-events.test.ts`; `packages/persistence/pg/test/source-events.pglite.test.ts`; `packages/application/test/operation-catalog-boundary.test.ts`; package typechecks | Passing |
| `SRC-AUTO-QUERY-002` | Operator shows one source event. | Query returns safe verification, policy result, ignored/blocked/failed reason, and created deployment details without raw payload or secrets. | `packages/application/test/source-events.test.ts`; `packages/persistence/pg/test/source-events.pglite.test.ts`; `packages/application/test/operation-catalog-boundary.test.ts`; package typechecks | Passing |

## Entrypoint Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `SRC-AUTO-ENTRY-001` | CLI, HTTP/oRPC, Web, and future MCP/tool configure auto-deploy. | Entrypoints reuse the same command/query schemas and operation keys. | `packages/application/test/operation-catalog-boundary.test.ts`; package typechecks | Partial |
| `SRC-AUTO-ENTRY-002` | HTTP generic signed webhook receives source event. | Transport resolves `resource-secret:<KEY>`, verifies signature, dispatches provider-neutral source event command with `scopeResourceId`, and never persists raw payload/signature/secret. | `packages/orpc/test/source-event-generic-signed.http.test.ts`; `packages/application/test/source-events.test.ts`; package typechecks | Passing |
| `SRC-AUTO-ENTRY-003` | Web Resource detail shows event-created deployment. | Deployment links back to safe source event facts and ignored/deduped events remain visible. | planned | Deferred gap |
| `SRC-AUTO-SURFACE-003` | Public help links. | Setup, signatures, dedupe, ignored events, and recovery link to stable docs anchors in both locales. | `packages/orpc/test/docs-help.test.ts`; `packages/adapters/cli/test/docs-help.test.ts`; `apps/web/src/lib/console/docs-help.test.ts`; `packages/docs-registry/src/index.ts` | Passing |

## Current Implementation Notes And Migration Gaps

Resource source binding, source fingerprint link state, manual deployment admission,
Resource-owned auto-deploy policy state behavior, active configure command entrypoints, and
Resource repository persistence exist. Source-event command/query handling, generic signed
source-event verification, durable source-event dedupe/read-model persistence, policy matching for
ignored ref outcomes, and active CLI/HTTP/oRPC source event read surfaces also exist. Matching
source events can dispatch through the existing deployment admission use case at the application
boundary. The Resource-scoped generic signed HTTP route now resolves `resource-secret:<KEY>`,
verifies `X-Appaloft-Signature`, dispatches `source-events.ingest` with `scopeResourceId`, and keeps
dedupe scoped to the route Resource. Event dispatch, dedupe, and public help-link coverage are now
bound to automation; provider-specific Git webhook ingestion and Web diagnostics remain deferred.
Code Round must not mark auto-deploy complete until these rows have stable automation or explicit
deferred exceptions.
