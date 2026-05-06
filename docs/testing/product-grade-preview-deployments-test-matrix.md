# Product-Grade Preview Deployments Test Matrix

## Purpose

Product-grade preview deployment tests must prove that Appaloft Cloud or a self-hosted control
plane owns preview policy, preview environment state, source-event ingestion, feedback, cleanup
retry, and audit without changing deployment admission semantics.

The matrix is intentionally separate from Action-only PR preview tests. Action-only previews are a
user-authored workflow over the CLI/action wrapper; product-grade previews are a control-plane
workflow over GitHub App/webhook events, explicit preview operations, ids-only deployment
admission, and durable cleanup retry state.

## Source Of Truth

- [Product-Grade Preview Deployments](../specs/046-product-grade-preview-deployments/spec.md)
- [GitHub Action PR Preview Deploy](../workflows/github-action-pr-preview-deploy.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [deployments.cleanup-preview](../commands/deployments.cleanup-preview.md)
- [deployments.cleanup-preview Test Matrix](./deployments.cleanup-preview-test-matrix.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [ADR-037: Source Event Auto Deploy Ownership](../decisions/ADR-037-source-event-auto-deploy-ownership.md)

## Coverage Layers

| Layer | Required coverage |
| --- | --- |
| Policy/application | Preview policy show/configure admission, fork policy, secret policy, quota/expiry, and blocked/ignored reasons. |
| Source event integration | GitHub App webhook verification, provider-neutral pull request event normalization, dedupe, and safe redaction. |
| Preview environment state | Create/update/list/show/delete state, source-link identity, deployment references, feedback status, cleanup status, and audit. |
| Deployment dispatch | Product-grade previews call `deployments.create` with ids only and coordinate runtime mutation by the existing resource-runtime scope. |
| Feedback | Comments, checks, deployment statuses, and diagnostics are idempotent, safe, and retriable. |
| Cleanup/process | Close-event, explicit delete, expiry, runtime cleanup, provider metadata cleanup, feedback update, retry attempts, and retention. |
| Entrypoints | API/oRPC, CLI, Web, public docs/help, and future MCP/tool descriptors use shared command/query schemas and normalized output. |

## Test Matrix

| ID | Layer | Scenario | Given | Expected result | Error/phase |
| --- | --- | --- | --- | --- | --- |
| PG-PREVIEW-POLICY-001 | application | Same-repository PR allowed | GitHub App pull request event is verified; effective policy allows same-repository preview deploys | Preview lifecycle creates or updates a preview environment and dispatches one ids-only deployment attempt | None |
| PG-PREVIEW-POLICY-002 | application | Fork PR secret policy blocks deploy | Pull request source repository is a fork and policy does not allow secret-backed fork previews | No deployment is created; read model records blocked/ignored status with safe fork-policy details and no secret lookup | `permission` or `application`, phase `preview-policy-evaluation` |
| PG-PREVIEW-POLICY-003 | application | Quota and expiry policy | Active preview count, age, or resource quota exceeds policy | New preview is blocked or existing preview cleanup is scheduled according to policy; read models expose reason and next action | `conflict` or `application`, phase `preview-policy-evaluation` |
| PG-PREVIEW-EVENT-001 | integration | GitHub App event verification and normalization | GitHub App webhook includes valid signature, installation, repository, PR number, head SHA, base ref, and actor facts | Transport dispatches provider-neutral source facts; raw body, signature, token, and provider payload are not persisted | `validation_error` or `permission`, phase `preview-webhook-verification` for invalid input |
| PG-PREVIEW-EVENT-002 | integration | Duplicate provider event idempotency | GitHub redelivers the same PR synchronize event | Existing event/preview result is returned or projected; no duplicate environment, deployment, feedback, or cleanup attempt is created | None |
| PG-PREVIEW-ENV-001 | integration | Preview environment create/update | Policy allows the PR and no current preview environment exists for the preview scope | A durable preview environment is created with project/environment/resource/server context, source fingerprint, PR identity, expiry, and audit metadata | None |
| PG-PREVIEW-CONFIG-001 | integration | Scoped preview configuration | Policy defines preview-only variables, secret refs, and route/domain rules | Preview materialization uses only preview-scoped values and safe references; production secrets/routes are not copied by default | `validation_error` or `permission`, phase `preview-config-resolution` |
| PG-PREVIEW-DEPLOY-001 | application | Deployment dispatch remains ids-only | Preview environment context is resolved | `deployments.create` receives only project/environment/resource/server/destination ids; PR, branch, source, route, and preview details remain read-model/process context | None |
| PG-PREVIEW-FEEDBACK-001 | integration | Feedback idempotency and retry | Existing PR comment/check/status exists or provider update fails transiently | Feedback is updated in place when possible; retryable provider failures record feedback retry state without rewriting accepted deployment result | `provider_error`, phase `preview-feedback`, retriable by provider classification |
| PG-PREVIEW-CLEANUP-001 | process | Close/delete cleanup preserves history | PR is closed or `preview-environments.delete` is accepted for an active preview | Runtime, route desired state, source link, provider metadata, and feedback are cleaned or marked already clean; deployment history/audit remain readable | None |
| PG-PREVIEW-CLEANUP-002 | process | Cleanup retry state | Runtime cleanup, provider metadata deletion, or feedback update fails transiently | Cleanup attempt records safe phase, attempt id, retry owner, next retry time, and sanitized detail; retry creates a new attempt id | `infra_error` or `provider_error`, phase `preview-cleanup-retry` |
| PG-PREVIEW-SURFACE-001 | contract | Normalized surfaces and docs/help | Preview operations are exposed through API/oRPC, CLI, Web, or future MCP/tools | Surfaces use command/query schemas, i18n keys, stable help anchors, masked details, and Appaloft preview terminology rather than provider-native payloads | `validation_error`, phase `command-validation` for malformed input |

## Current Implementation Notes And Migration Gaps

`PG-PREVIEW-POLICY-001` and `PG-PREVIEW-POLICY-002` have initial application-service coverage in
`packages/application/test/product-grade-preview-policy.test.ts`. The coverage proves normalized
GitHub pull request policy evaluation for verified same-repository events, unverified events,
default fork blocking, secret-backed fork blocking, and opt-in fork previews without secrets.
`PG-PREVIEW-POLICY-001` now also has initial application process coverage in the same test file
for policy-eligible pull-request events creating/updating a preview environment and dispatching one
ids-only deployment request without copying pull-request source facts into deployment admission.
`PG-PREVIEW-SURFACE-001` has initial inactive-operation coverage in
`packages/application/test/preview-policy-operations.test.ts` for shared
`preview-policies.configure` / `preview-policies.show` schemas, handlers, read model output, and
operation catalog entries with no active transports.
`PG-PREVIEW-SURFACE-001` now also has Postgres/PGlite persistence coverage in
`packages/persistence/pg/test/preview-policy.pglite.test.ts` for project/resource-scoped policy
storage, configured/default safe summaries, idempotency-key retention on the write side, and
read-model omission of idempotency keys or secret-shaped material.

`PG-PREVIEW-ENV-001` and `PG-PREVIEW-CLEANUP-001` have initial core-domain coverage in
`packages/core/test/preview-environment.test.ts`. The coverage proves scoped preview environment
identity creation, safe source context update, expiry checks, cleanup-request transition, and
blocking source updates after cleanup is requested.

`PG-PREVIEW-ENV-001` now also has Postgres/PGlite persistence coverage in
`packages/persistence/pg/test/preview-environment.pglite.test.ts`. The coverage proves scoped
preview environment upsert, lookup by id/source scope, safe list/show read models, cleanup-request
status readback, scoped delete, and owner Resource retention after delete.

Deployment dispatch, blocked-event read models, GitHub App webhook normalization, feedback, cleanup
retry, and active operation entrypoints remain open. Existing non-product-grade coverage belongs to
Action-only PR previews and
`deployments.cleanup-preview`.

Future Code Rounds should bind the matrix rows to application/process-manager tests first, then add
persistence, adapter, transport, Web, CLI, and public-docs coverage as each surface is activated.
