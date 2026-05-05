# Plan: Product-Grade Preview Deployments

## Scope

Spec-first slice for control-plane-owned preview deployments. This plan keeps `deployments.create`
ids-only, keeps Action-only previews separate, and prepares future Code Rounds for GitHub App
webhooks, preview policy, preview environment state, scoped preview configuration, feedback, and
cleanup retries.

## Governing Sources

- Domain model: [Domain Model](../../DOMAIN_MODEL.md)
- Decisions/ADRs: [ADR-016](../../decisions/ADR-016-deployment-command-surface-reset.md),
  [ADR-024](../../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md),
  [ADR-025](../../decisions/ADR-025-control-plane-modes-and-action-execution.md),
  [ADR-028](../../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md),
  [ADR-037](../../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- Local specs: [Source Binding And Auto Deploy](../042-source-binding-auto-deploy/spec.md),
  [GitHub Action PR Preview Deploy](../../workflows/github-action-pr-preview-deploy.md),
  [deployments.cleanup-preview](../../commands/deployments.cleanup-preview.md)
- Test matrix: [Product-Grade Preview Deployments Test Matrix](../../testing/product-grade-preview-deployments-test-matrix.md)

## Architecture Approach

- Domain/application placement: keep provider-neutral preview policy/environment language in
  application and domain contracts. GitHub App webhook payloads, comments, checks, installations,
  and deployment-status API details stay in integration adapters.
- Command/query placement: future `preview-policies.*` and `preview-environments.*` operations must
  be explicit command/query messages and handlers. `deployments.create` remains the only general
  deployment admission command.
- Process placement: preview create/update and cleanup are long-running control-plane workflows.
  Command success means acceptance once durable preview/source/cleanup state exists, not completion
  of deployment, feedback, or runtime cleanup.
- Repository/specification impact: future persistence should store safe preview policy,
  environment, feedback, cleanup-attempt, and source-event read models. Raw provider payloads,
  tokens, secret values, webhook bodies, and provider SDK objects must not be persisted as contract
  data.
- Entrypoint impact: Web/API/CLI/future MCP surfaces must reuse the same operation keys and schemas
  when activated. Action-only preview workflows remain documented separately.
- Public docs impact: product-grade previews require a Docs Round and a stable public help anchor
  before support is claimed.

## Code Round Sequence

1. Add failing tests for the product-grade preview matrix rows before production implementation.
2. Add preview policy command/query schemas, handlers, application services, and operation catalog
   entries behind inactive or test-first slices.
3. Add preview environment read/write models and persistence for list/show/delete and cleanup
   attempt state.
4. Extend verified source event ingestion to accept GitHub App pull request preview events, dedupe
   them, and route them to preview policy evaluation without changing `deployments.create`.
5. Implement preview environment create/update orchestration over source link/resource/environment
   selection, scoped preview variables/secrets, and ids-only deployment dispatch.
6. Add feedback writer ports/adapters for comments/checks/deployment statuses with idempotent
   update and retry state.
7. Add cleanup process manager and scheduler retry behavior over `deployments.cleanup-preview`,
   provider metadata cleanup, feedback cleanup/update, retention, and audit.
8. Add Web/API/CLI/future MCP entrypoints after operation catalog and public docs anchors are in
   place.
9. Update roadmap only after the closed loop passes tests and docs/help is complete.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` product-grade preview gate.
- Compatibility impact: `pre-1.0-policy`, new control-plane workflow and operation surfaces when
  activated.
- Backward compatibility: Action-only previews remain supported as workflow-file previews.
  Product-grade previews add Cloud/self-hosted control-plane behavior without changing existing
  `deployments.create`, `deployments.cleanup-preview`, or repository config deployment admission.

## Testing Strategy

- Matrix ids: `PG-PREVIEW-*` in the product-grade preview deployments test matrix.
- Test-first rows: policy admission, fork/secret policy, source-event dedupe, preview environment
  materialization, ids-only deployment dispatch, feedback idempotency, cleanup preservation,
  retry state, quota/expiry, and public-surface normalization.
- Unit/integration: application use cases and process managers should use fake integration/runtime
  adapters first.
- Acceptance/e2e: GitHub App webhook and feedback tests should be hermetic by default, with
  opt-in provider smoke tests only after credentials and sandbox safety exist.

## Risks And Migration Gaps

- Durable outbox/inbox work in Phase 8 may become a prerequisite for production cleanup retries and
  feedback reliability.
- GitHub App installation and permission onboarding may need its own spec before public enablement.
- Fork preview secret policy must be conservative until credential custody and audit are accepted.
- Managed domains, DNS observation, and certificate lifecycle for previews depend on control-plane
  ownership and should not be implied in pure Action/CLI mode.
