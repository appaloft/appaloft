# Tasks: Product-Grade Preview Deployments

## Spec Round

- [x] Confirm ADR-016, ADR-024, ADR-025, ADR-028, and ADR-037 govern the initial preview boundary
  without adding a new ADR in this slice.
- [x] Position product-grade preview deployments in the business operation map as a control-plane
  workflow separate from Action-only previews.
- [x] Create local spec, plan, and task artifacts.
- [x] Create the product-grade preview deployments test matrix.
- [x] Update Action preview, source auto-deploy, and roadmap notes without marking Code Round
  complete.

## Test-First

- [x] `PG-PREVIEW-POLICY-001A`: policy evaluator allows a verified same-repository pull request
  event.
- [x] `PG-PREVIEW-POLICY-001B`: eligible policy result creates or updates a preview environment
  and dispatches one ids-only deployment attempt.
- [x] `PG-PREVIEW-POLICY-002A`: policy evaluator blocks secret-backed fork preview deployment by
  default.
- [x] `PG-PREVIEW-POLICY-002B`: blocked fork policy result is projected with safe ignored/blocked
  read-model detail and no secret lookup.
- [x] `PG-PREVIEW-POLICY-003`: quotas and expiry block or schedule previews with readable reasons.
- [x] `PG-PREVIEW-EVENT-001`: GitHub App pull request event verification/normalization is safe.
- [x] `PG-PREVIEW-EVENT-002`: duplicate provider events are idempotent across environment,
  deployment, feedback, and cleanup state.
- [x] `PG-PREVIEW-ENV-001A`: core preview environment create/update stores scoped identity and
  safe source-link context.
- [x] `PG-PREVIEW-ENV-001B`: preview environment persistence/read models list/show/delete scoped
  identity and latest lifecycle state.
- [x] `PG-PREVIEW-CONFIG-001`: scoped preview variables/secrets do not copy production secrets or
  routes by default.
- [x] `PG-PREVIEW-DEPLOY-001`: preview deployment dispatch uses ids-only `deployments.create`.
- [x] `PG-PREVIEW-FEEDBACK-001`: comments/checks/status updates are idempotent and retryable.
- [ ] `PG-PREVIEW-CLEANUP-001`: cleanup preserves deployment history and audit while removing
  preview runtime, route, source-link, and provider metadata.
- [ ] `PG-PREVIEW-CLEANUP-002`: cleanup retry creates new attempt ids and exposes safe retry state.
- [ ] `PG-PREVIEW-SURFACE-001`: Web/API/CLI/future MCP surfaces use normalized preview language and
  stable help anchors.

## Implementation

- [x] Add initial preview policy evaluator schema/application service for same-repository and
  default fork-secret decisions.
- [x] Add preview policy command/query schemas, handlers, read models, and operation catalog
  entries.
- [x] Add preview policy persistence/read model adapter.
- [x] Add core preview environment aggregate state.
- [x] Add preview environment read models and persistence.
- [x] Extend source event ingestion for GitHub App pull request preview events.
- [ ] Add preview lifecycle process manager over policy, environment, deployment, and feedback
  state.
- [x] Add scoped preview config/secret resolution.
- [x] Dispatch preview deployments through existing ids-only deployment admission.
- [ ] Add feedback writer ports/adapters and idempotent provider update state.
- [ ] Add cleanup process manager and scheduler retry behavior.
- [ ] Add Web/API/CLI/future MCP entrypoints.

## Docs Round

- [ ] Add public docs under `/docs/deploy/previews/` for Action-only previews versus product-grade
  control-plane previews.
- [ ] Add stable help anchors for preview policy, preview environments, cleanup, fork safety,
  secrets, comments/checks, quotas, and recovery.
- [ ] Wire CLI/API/Web descriptions and future MCP descriptors to the stable anchors.

## Verification

- [ ] Run targeted application/integration/persistence tests.
- [ ] Run hermetic GitHub App webhook and feedback adapter tests.
- [ ] Run preview cleanup retry/process-manager tests.
- [ ] Run `bun run lint`.
- [ ] Run `bun turbo run typecheck`.
