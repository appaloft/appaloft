# Tasks: Resource Profile Drift Visibility

## Spec Round

- [x] Position behavior as `resources.show` diagnostics extension plus config deploy admission guard.
- [x] Record no-ADR-needed rationale against ADR-010, ADR-012, ADR-014, ADR-024, and ADR-026.
- [x] Define current Resource profile, entry workflow normalized profile, and latest deployment
  snapshot profile comparison semantics.
- [x] Define user-visible section, field, admission-blocking, and suggested-command output.
- [x] Update durable query/workflow/error/testing/implementation-plan docs.

## Test-First

- [x] `RES-PROFILE-DRIFT-001`: add application query-service test for current Resource profile vs
  latest deployment snapshot informational drift.
- [x] `RES-PROFILE-DRIFT-002`: add application/query or CLI test for entry profile vs current
  Resource profile blocking drift with suggested commands.
- [ ] `RES-PROFILE-DRIFT-003`: add secret/configuration redaction test. Deferred until the
  configuration section compares effective Resource config against entry profile config.
- [x] `RES-PROFILE-DRIFT-004`: add HTTP/oRPC contract test for the `resources.show` diagnostic
  shape.
- [x] `RES-PROFILE-DRIFT-005`: add Web resource detail drift display test. Covered by static Web
  help/rendering assertions plus Svelte semantic checks; e2e/webview assertion remains a deferred
  hardening row.
- [x] `CONFIG-FILE-PROFILE-006`: update CLI config workflow test for fail-before-deployment
  existing-resource drift.
- [x] `CONFIG-FILE-PROFILE-007`: decide whether this row remains planned auto-apply behavior or is
  narrowed to an explicit apply-profile mode before writing tests. It remains deferred explicit
  apply-profile behavior; the default workflow is fail-first.

## Implementation

- [x] Implement shared resource profile drift comparator in the application/read-model boundary.
- [x] Extend `resources.show` diagnostics with sectioned drift items when profile diagnostics are
  requested.
- [x] Extend config deploy workflow preflight to reject unapplied existing-resource drift before
  `deployments.create`.
- [x] Add structured `resource_profile_drift` details.
- [x] Update CLI, HTTP/oRPC, Web, and future MCP/tool metadata surfaces to reuse the same operation
  keys and diagnostic shape.

## Entrypoints And Docs

- [x] Update public docs/help with a stable profile-drift troubleshooting anchor.
- [x] Update CLI help/examples for `appaloft resource show --json` diagnostics and config deploy
  drift remediation.
- [x] Update Web resource detail help copy/i18n keys for sectioned drift badges and future-only
  profile guidance.

## Verification

- [x] Run targeted application tests for `resources.show` and config deploy workflow.
- [x] Run targeted CLI tests for config deploy error rendering and resource command remedies.
- [x] Run targeted oRPC/HTTP resource-show contract tests.
- [x] Run targeted Web resource detail test for drift display through static help assertions and
  `svelte-check`; e2e/webview remains deferred.
- [x] Run `bun run lint` before final Code Round report.

## Post-Implementation Sync

- [x] Reconcile `docs/specs/011-resource-profile-drift-visibility/`, source-of-truth specs,
  operation catalog state, public docs/help anchors, test matrix ids, and implementation.
- [x] Mark remaining auto-apply or public-docs gaps as explicit deferred gaps if they are not closed
  in the first Code Round.
