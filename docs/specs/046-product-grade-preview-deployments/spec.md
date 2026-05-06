# Product-Grade Preview Deployments

## Status

Spec Round complete; Code Round started for Phase 7 / `0.9.0`.

This artifact positions product-grade preview deployments and records incremental Code Round
progress. It does not activate new operation catalog entries, HTTP routes, CLI commands, Web
controls, GitHub App routes, workers, or scheduler behavior.

## Problem

Action-only PR previews are useful when a repository owner adds a GitHub Actions workflow that runs
the Appaloft CLI or `appaloft/deploy-action`. That path deliberately keeps state ownership in the
Action/CLI entry workflow and relies on a user-authored close-event workflow for cleanup.

Product-grade previews are a different product line. They require Appaloft Cloud or a self-hosted
control plane to own policy, source-event ingestion, preview environment identity, scoped
configuration, comments/checks, cleanup retries, audit, quotas, and managed route/domain follow-up.
They must reuse explicit Appaloft operations and must not add pull request, branch, route, source,
or preview fields to `deployments.create`.

## Source Of Truth

- [ADR-016: Deployment Command Surface Reset](../../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-025: Control-Plane Modes And Action Execution](../../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [ADR-037: Source Event Auto Deploy Ownership](../../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../../errors/model.md)
- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Source Binding And Auto Deploy](../042-source-binding-auto-deploy/spec.md)
- [GitHub Action PR Preview Deploy](../../workflows/github-action-pr-preview-deploy.md)
- [deployments.cleanup-preview](../../commands/deployments.cleanup-preview.md)
- [Product-Grade Preview Deployments Test Matrix](../../testing/product-grade-preview-deployments-test-matrix.md)

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Product-grade preview deployment | A control-plane-owned preview lifecycle for a source change, usually a pull request, with policy, scoped identity, deployment, feedback, cleanup, and audit. | Source integration / release orchestration | GitHub App preview, managed preview |
| Preview policy | Control-plane policy deciding which repositories, branches, fork states, event kinds, quotas, domains, and secret scopes may create previews. | Integration policy | Preview environment policy |
| Preview environment | Durable control-plane identity for one preview scope, such as a pull request, linked to project/environment/resource/server context, source fingerprint, route state, deployment attempts, feedback, cleanup, and audit. | Workspace / release orchestration | Preview app, PR environment |
| Preview source event | Provider-normalized source event that may request preview create, update, or cleanup after verification. | Source event application service | PR event |
| Preview feedback | Idempotent GitHub App comment, check run, deployment status, or equivalent integration status pointing users to preview state and diagnostics. | Integration adapter | Comment/check/status |
| Preview cleanup attempt | Durable cleanup work for preview runtime, route state, source link, feedback, and provider metadata, with retry and audit ownership. | Release orchestration / operator work | Cleanup retry |

## Target Operation Position

Product-grade previews are a control-plane workflow over explicit operations and future accepted
candidate operations:

| Surface | State | Rule |
| --- | --- | --- |
| `source-events.ingest` | Active command / integration boundary | May be extended by a future Code Round to normalize GitHub pull request events after GitHub App verification. It must still persist safe source event state and dedupe before preview policy evaluation. |
| `preview-policies.show` | Active CLI, HTTP/oRPC, and Web query | Reads effective preview policy, fork/secret/domain/quota rules, and selected execution owner for a project or resource scope. |
| `preview-policies.configure` | Active CLI, HTTP/oRPC, and Web command | Changes preview policy explicitly. It must not mutate Resource source/runtime/network profile or deployment history as a side effect. |
| `preview-environments.list` | Active CLI, HTTP/oRPC, and Web query | Lists durable preview environments with source event, deployment, route, feedback, cleanup, expiry, and audit summaries. |
| `preview-environments.show` | Active CLI, HTTP/oRPC, and Web query | Reads one preview environment and its safe latest deployment, route, feedback, policy, cleanup, and diagnostic state. |
| `preview-environments.delete` | Active CLI, HTTP/oRPC, and Web command | Requests explicit preview cleanup/deletion. It dispatches preview-lifecycle cleanup and preserves deployment history/audit. |
| `deployments.create` | Active command, unchanged input | Creates the actual deployment attempt after preview policy selects or creates the preview Resource/environment context. No preview fields are added. |
| `deployments.cleanup-preview` | Active command | Remains the narrow runtime/route/source-link cleanup primitive. Product-grade cleanup may call it as part of a broader control-plane cleanup process, but must not expand the command into provider metadata, comments/checks, or generic delete behavior. |

The first Code Round must decide whether `source-events.ingest` directly evaluates preview policy or
emits durable source event state consumed by a preview lifecycle process manager. Either shape must
preserve acceptance-first semantics, idempotency, and read-model visibility.

## Lifecycle Semantics

The product-grade create/update flow is:

```text
GitHub App pull_request or push webhook
  -> transport verifies signature, installation, repository, and event trust
  -> source-events.ingest normalizes and dedupes safe event facts
  -> preview policy evaluates event kind, ref, fork trust, secret eligibility, quotas, and expiry
  -> preview environment is created or updated with scoped source link and selected Resource context
  -> preview-scoped config and secret references are resolved without leaking production secrets
  -> deployments.create is dispatched with ids only
  -> feedback writer publishes or updates comments, checks, deployment statuses, and diagnostics
```

The product-grade cleanup flow is:

```text
GitHub App pull_request closed, policy expiry, or preview-environments.delete
  -> preview environment cleanup is admitted at preview-lifecycle scope
  -> deployments.cleanup-preview removes runtime, route desired state, and preview source link
  -> feedback/provider metadata cleanup runs through integration adapters
  -> cleanup attempt records terminal, retryable, or already-clean state
  -> scheduler retries retriable cleanup until policy retention ends or an operator intervenes
```

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| PG-PREVIEW-SPEC-001 | Pull request event is policy-eligible | A GitHub App webhook for a same-repository pull request is verified and the effective preview policy allows the event | Preview policy evaluates the normalized source event | A preview environment is created or updated, linked to scoped source identity, and a deployment attempt is dispatched through ids-only `deployments.create`. |
| PG-PREVIEW-SPEC-002 | Fork event is not trusted for secrets | A pull request comes from a fork and policy does not allow secret-backed fork previews | Preview policy evaluates the event | No deployment is created; the preview event read model records ignored/blocked status with safe fork-policy detail and no secret resolution. |
| PG-PREVIEW-SPEC-003 | Scoped preview configuration is isolated | A preview policy provides preview-only variables, secret references, or route policy | The preview environment is materialized | Preview config is scoped to the preview Resource/environment identity; production environment secrets and durable production routes are not copied unless policy explicitly references safe preview-scoped material. |
| PG-PREVIEW-SPEC-004 | Duplicate source event is idempotent | GitHub redelivers the same pull request synchronization event | The event is ingested again | The existing source/preview event result is returned or projected; no duplicate preview environment, deployment, feedback, or cleanup attempt is created. |
| PG-PREVIEW-SPEC-005 | Feedback is idempotent and retriable | A deployment status, check run, or PR comment already exists for the preview | Feedback writing runs after deployment acceptance or terminal update | Existing provider feedback is updated in place when possible; retriable provider failures are recorded without changing the accepted deployment result to `err`. |
| PG-PREVIEW-SPEC-006 | Cleanup preserves history | A pull request is closed or a user deletes the preview environment | Cleanup is accepted | Preview runtime, route state, source link, provider metadata, and feedback are cleaned or marked already clean; deployment history and audit remain readable. |
| PG-PREVIEW-SPEC-007 | Cleanup retry is durable | Runtime cleanup, provider metadata deletion, or feedback update fails with a retriable error | Cleanup processing records the failure | Retry state records owner, attempt id, next retry timing, safe phase, and sanitized provider detail; a later retry creates a new attempt id. |
| PG-PREVIEW-SPEC-008 | Quota and expiry are enforced | A repository or project exceeds preview count, age, or resource quota | Preview policy evaluates a create/update event or scheduler scans previews | New previews are blocked or old previews are scheduled for cleanup according to policy, with read-model visibility and safe user guidance. |
| PG-PREVIEW-SPEC-009 | Public surfaces stay normalized | Web, CLI, HTTP/oRPC, or future MCP surfaces inspect product-grade previews | Users list, show, configure, deploy, or delete previews | Output uses Appaloft preview policy/environment language with stable operation keys and help anchors, not provider-native webhook payloads or GitHub API objects. |

## Error And Async Semantics

Canonical product-grade preview phases:

- `preview-webhook-verification`
- `preview-event-ingestion`
- `preview-policy-evaluation`
- `preview-environment-resolution`
- `preview-config-resolution`
- `preview-deployment-dispatch`
- `preview-feedback`
- `preview-cleanup`
- `preview-cleanup-retry`

Expected errors must use the shared error model. Secret values, tokens, raw webhook bodies, raw
provider API payloads, database URLs, SSH keys, and application secret values must not appear in
errors, logs, read models, comments/checks, or events.

Pre-acceptance failures return structured `err(...)` from the command or transport boundary that
owns admission. Post-acceptance failures keep the original accepted command result and become
durable preview/source/cleanup/feedback state with terminal or retryable visibility.

## Domain Ownership

- Bounded contexts: Source integration, workspace/resource configuration, release orchestration,
  runtime topology, and operator work.
- Aggregate/resource owner: `Resource` owns reusable source/runtime/network profile; preview
  lifecycle owns preview environment identity and policy-specific scoped configuration; `Deployment`
  owns accepted attempts and immutable runtime plan snapshots.
- Adapter owner: GitHub App transport and feedback adapters verify and map webhook/status details;
  runtime adapters own runtime cleanup mechanics; persistence adapters own durable preview/source/
  cleanup read models.
- Upstream/downstream contexts: Control-plane mode selection must resolve state owner and execution
  owner before mutation. Route/domain/certificate follow-up remains managed route/domain workflow
  state when the control plane owns those integrations.

## Public Surfaces

- API/HTTP/oRPC: no active routes in this Spec Round. Future routes must reuse command/query
  schemas and must not redefine transport-only shapes.
- CLI: no active commands in this Spec Round. Future CLI preview policy/environment commands must
  dispatch through `CommandBus`/`QueryBus`.
- Web/UI: no active controls in this Spec Round. Future controls must consume read models and i18n
  copy from `packages/i18n`.
- Config: committed repository config may carry preview-safe profile defaults only after a future
  config spec accepts them. It must not select project/resource/server/destination/credential,
  organization, tenant, GitHub installation, or secret identity.
- Events: Code Round must define any new preview lifecycle events or process-state records before
  adding workers. Existing deployment events remain the source for deployment attempt progression.
- Public docs/help: Docs Round is required before product-grade previews are marked supported. The
  stable public anchor target is expected under `/docs/deploy/previews/`, while Action-only preview
  docs must keep distinguishing workflow-file previews from GitHub App/control-plane previews.
- Future MCP/tools: descriptors must come from the same operation catalog entries once operations
  are activated.

## Non-Goals

- Adding preview fields to `deployments.create`.
- Replacing Action-only PR preview workflows.
- Implementing GitHub App installation onboarding in this Spec Round.
- Provider-native branch protection policy or required-check enforcement beyond Appaloft feedback.
- Copying production secrets into fork previews by default.
- Deleting deployment history, audit, volumes, backups, or retained rollback candidates during
  preview cleanup.

## Current Implementation Notes And Migration Gaps

- Action-only preview deploy/update and explicit close-event cleanup exist in the CLI/config
  workflow and reference wrapper, but the public `appaloft/deploy-action` wrapper repository and
  Marketplace documentation are still open roadmap work.
- The application layer now has an initial product-grade preview policy evaluator with a normalized
  GitHub pull-request input schema. It allows verified same-repository pull request events, blocks
  unverified events, blocks secret-backed fork previews by default, and permits fork previews
  without secrets only when policy opts in.
- The core domain now has a foundational `PreviewEnvironment` aggregate for product-grade preview
  identity. It stores scoped project/environment/resource/target placement, safe source fingerprint
  and pull-request context, active/cleanup-requested status, expiry, and cleanup-request state
  without adding preview fields to `deployments.create`.
- Postgres/PGlite persistence now stores preview environment lifecycle state with safe list/show
  read models and scoped delete by preview environment id plus Resource id. The read model exposes
  provider-neutral project/environment/resource/server/destination placement, pull-request source
  context, status, expiry, and timestamps without provider payloads or secret material.
- The application layer now has an initial `PreviewLifecycleService` for a verified,
  policy-eligible pull-request event. It creates or updates the scoped `PreviewEnvironment`, then
  dispatches exactly one ids-only deployment request through the existing deployment dispatcher.
  Pull-request source facts stay in preview lifecycle state rather than `deployments.create`.
- Preview lifecycle now has an application process manager over policy evaluation, preview
  environment state, ids-only deployment dispatch, and PR-comment feedback. Accepted preview
  deployments publish idempotent `github-pr-comment` feedback keyed by source event id, while
  retryable feedback failures are recorded as safe feedback state without turning the accepted
  deployment process into `err`.
- Preview policy now has inactive application operation contracts for `preview-policies.configure`
  and `preview-policies.show`, including shared command/query schemas, handlers, repository/read
  model ports, and operation catalog entries without CLI/oRPC/Web transports.
- Postgres/PGlite persistence now stores configured preview policy records for project and Resource
  scopes. The safe read model returns configured or default policy summaries without idempotency
  keys, secret references, provider payloads, or active transport exposure.
- Preview lifecycle now records safe preview policy decision projections by source event id. Blocked
  fork events persist status, reason code, normalized pull-request facts, fork/secret-backed
  booleans, and requested secret scope count without resolving or storing secret names.
- Preview policy now supports active preview quota and preview TTL settings. Over-quota create/
  update events are blocked with `preview_quota_exceeded` and safe quota details, while allowed
  preview lifecycle events derive preview environment expiry from `previewTtlHours` when no
  explicit expiry is provided. Policy records and decision projections persist quota and expiry
  readback without provider payloads or secret material.
- The GitHub integration now has an initial preview pull-request webhook verifier/normalizer. It
  verifies `X-Hub-Signature-256`-compatible HMAC input, treats verified `ping` as no-op, rejects
  unsupported pull request actions, and emits only safe preview facts needed by policy/lifecycle
  evaluation: repository identities, pull request number, head SHA, base ref, delivery id, and
  received timestamp.
- Preview lifecycle now dedupes by source event id using the safe policy decision projection before
  policy evaluation, preview environment mutation, or deployment dispatch. Duplicate deliveries
  return the existing blocked/dispatched/dispatch-failed outcome without creating another preview
  environment update or ids-only deployment request. PR-comment feedback is keyed by source event id
  and updated in place through provider feedback state; cleanup idempotency remains tied to its
  future process-state implementation.
- Preview scoped config now has an initial application resolver over the safe
  `resources.effective-config` read model. It materializes no variables, secret references, or
  durable routes by default; explicit preview selections may include non-secret variable values and
  safe secret-reference metadata only. Raw production secret values and durable domain routes are
  not copied into preview resolution output. Wiring that resolution into a full preview lifecycle
  process manager remains future work.
- Preview deployment dispatch uses the existing deployment admission path through
  `CreateDeploymentSourceEventDispatcher`. The dispatcher forwards only project, environment,
  Resource, server, and optional destination ids into `deployments.create`; preview source event,
  pull request, branch, route, and source details stay in preview/source read-model state.
- Preview pull-request event ingestion now has an application service that accepts safe normalized
  GitHub preview facts plus selected control-plane context, routes create/update actions into the
  preview lifecycle service, and routes closed pull-request events through source-scope preview
  environment lookup into the preview cleanup service. Closed events with no durable preview
  environment return an idempotent ignored result instead of creating cleanup state.
- Preview feedback now has initial application ports and service coverage for idempotent provider
  feedback updates. Existing provider feedback ids are reused for update-in-place, and retryable
  provider failures are recorded as safe feedback state while publish returns `ok`.
- Preview feedback now has durable Postgres/PGlite persistence for feedback keys, provider feedback
  ids, channel/status, safe error codes, retryable state, and update timestamps. Feedback body text,
  provider payloads, tokens, and secret-shaped values are not persisted in the feedback state.
  The GitHub integration now has a hermetic PR comment feedback writer that creates or updates
  issue comments by provider feedback id and returns safe retryable provider errors without response
  bodies or tokens. The GitHub integration also has a hermetic check-run feedback writer that
  resolves the pull-request head SHA, creates check runs, updates existing check runs by provider
  feedback id, and returns safe retryable provider errors. Deployment-status feedback is supported
  for supplied provider deployment ids and for automatic product-grade preview feedback; when no
  deployment id is present, the GitHub writer resolves the pull-request head SHA, creates a
  transient GitHub preview deployment, records that deployment id as the provider feedback id, and
  appends deployment statuses to that deployment timeline. Shell wiring resolves the GitHub access
  token per request through the existing integration auth port before delegating to the composite
  GitHub feedback writer.
- Preview environment cleanup now has an initial application service that loads the durable preview
  environment, marks cleanup requested without deleting preview history, and delegates runtime,
  route, source-link, provider metadata, and feedback cleanup to a port with safe source-scope
  input only. The shell registers a concrete cleaner that delegates runtime, server-applied route,
  and source-link cleanup through the existing `deployments.cleanup-preview` primitive.
- Preview cleanup retry now has initial application attempt state. Each cleanup run receives a new
  `pcln_*` attempt id, retryable cleaner failures are recorded as `retry-scheduled` with safe
  owner, phase, error code, and next retry time, and retry responses avoid provider error text.
  Durable Postgres/PGlite persistence now stores those attempt records without provider error text,
  tokens, or secret-shaped values. An application retry scheduler now reads due durable retry
  attempts, skips stale attempts after a newer cleanup attempt exists for the same preview target,
  and dispatches retries through the cleanup service so every retry creates a new attempt id.
  The shell composition has a disabled-by-default `previewCleanupRetryScheduler` runner that can be
  explicitly enabled with the shell cleaner registered. The runner has an in-process non-overlap
  guard so interval ticks do not run concurrently in one shell process, and enabled shell
  composition wraps retry ticks in the existing durable mutation coordinator under the
  `preview-lifecycle` coordination scope so multiple shell processes do not run the retry scan at
  the same time.
- Preview cleanup now updates existing PR-comment feedback and terminal provider metadata through
  the preview feedback service. The feedback recorder can look up the latest feedback record by
  preview environment and channel, the shell cleaner publishes a cleanup completion body through the
  existing idempotent GitHub writer path, GitHub deployment-status feedback is marked `inactive`
  when a provider deployment record exists, and retryable cleanup-feedback failures are returned to
  cleanup retry handling with safe phase/error metadata.
- Preview policy and preview environment operations now have active CLI and HTTP/oRPC routes for
  `preview-policies.configure`, `preview-policies.show`, `preview-environments.list`,
  `preview-environments.show`, and `preview-environments.delete`. Policy routes reuse the shared
  command/query schemas and safe policy contract output. Environment list/show read from the safe
  preview environment read model, delete dispatches through the preview cleanup service, and
  future MCP tool contracts are generated from the operation catalog. Web now exposes
  `/preview-policies` controls for policy readback/configuration and a `/preview-environments`
  console surface backed by preview environment list/show/delete operations.
- The GitHub source-event HTTP route now accepts signed `pull_request` deliveries for the first
  product-grade preview route slice. It verifies the raw GitHub payload, resolves preview context
  from trusted `X-Appaloft-*` headers when supplied, or maps signed GitHub repository facts through
  the source-event policy reader using repository full name/provider repository id and base ref when
  no trusted headers are present. The selected project/environment/Resource/server/destination/
  source-fingerprint context is dispatched in `IngestPreviewPullRequestEventCommand` through
  `CommandBus`. Raw signatures, secrets, and provider payloads stay out of the command; GitHub
  installation id is retained only as safe verification/mapping detail.
- Accepted preview deployment processing now publishes both idempotent PR-comment feedback and
  idempotent `github-deployment-status` feedback after ids-only deployment dispatch. Retryable
  deployment-status feedback failures are recorded as safe feedback state without changing the
  accepted deployment result to `err`.
- Active GitHub App preview worker transports are still not implemented.
- Preview policy and preview environment operations currently expose CLI, HTTP/oRPC, and generated
  future MCP tool descriptors. Web exposes preview policy readback/configuration and the read-only
  preview environment list/detail/delete surface.
- Product-grade preview public docs/help now map preview policy and preview environment operations
  to the stable `/docs/deploy/previews/` product-grade preview anchor.

## Open Questions

- Should preview policy be project-scoped first, resource-scoped first, or integration/repository
  scoped with project/resource overrides?
- Should the first product-grade execution owner be GitHub Actions reporting to the control plane,
  or a control-plane runner/agent?
- Which provider feedback surfaces are required for the first supported slice: comments, checks,
  GitHub deployments, commit statuses, or a smaller subset?
- What retention policy should apply to preview environments after successful cleanup?
