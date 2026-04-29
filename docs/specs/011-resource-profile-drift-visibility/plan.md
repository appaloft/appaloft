# Plan: Resource Profile Drift Visibility

## Governing Sources

- Domain model: [Domain Model](../../DOMAIN_MODEL.md)
- Decisions/ADRs:
  - [ADR-010: Quick Deploy Workflow Boundary](../../decisions/ADR-010-quick-deploy-workflow-boundary.md)
  - [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
  - [ADR-014: Deployment Admission Uses Resource Profile](../../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
  - [ADR-024: Pure CLI SSH State And Server-Applied Domains](../../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
  - [ADR-026: Aggregate Mutation Command Boundary](../../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- Local specs:
  - [resources.show Query Spec](../../queries/resources.show.md)
  - [Repository Deployment Config File Bootstrap](../../workflows/deployment-config-file-bootstrap.md)
  - [Resource Profile Lifecycle](../../workflows/resource-profile-lifecycle.md)
  - [Quick Deploy](../../workflows/quick-deploy.md)
  - [deployments.create Command Spec](../../commands/deployments.create.md)
  - [Resource Lifecycle Error Spec](../../errors/resources.lifecycle.md)
- Test matrix:
  - [Resource Profile Lifecycle Test Matrix](../../testing/resource-profile-lifecycle-test-matrix.md)
  - [Deployment Config File Test Matrix](../../testing/deployment-config-file-test-matrix.md)
- Implementation plans:
  - [Resource Profile Lifecycle Implementation Plan](../../implementation/resource-profile-lifecycle-plan.md)
  - [Deployment Config File Implementation Plan](../../implementation/deployment-config-file-plan.md)

## Architecture Approach

- Domain/application placement: keep drift comparison in application/read-model and entry-workflow
  services. The `Resource` aggregate owns profile mutation but does not persist or compute read-only
  drift reports.
- Repository/specification/visitor impact: no new aggregate repository. Existing resource read models
  and deployment snapshot readers provide safe DTOs for comparison. Entry workflows may pass a
  transient normalized profile DTO into the shared comparator.
- Event/CQRS/read-model impact: query-side behavior only for `resources.show`; entry-workflow
  preflight may use the same comparator before command dispatch. No events or projections are added
  in this slice.
- Entrypoint impact: Web, CLI, HTTP/oRPC, and future MCP use the `resources.show` diagnostic shape.
  CLI config deploy maps blocking entry-profile drift to `resource_profile_drift`.
- Persistence/migration impact: none expected for the drift report itself. Code Round may need read
  access to latest deployment snapshot fields already persisted by deployment attempts.

## Roadmap And Compatibility

- Roadmap target: Phase 7, "Add existing-resource profile-drift handling" and Resource ledger
  "profile drift visibility".
- Version target: post-`0.6.0`, before `1.0.0`; exact target depends on current release gate.
- Compatibility impact: `pre-1.0-policy`; backward-compatible public read/error extension, with
  possible stricter CLI config deploy rejection before deployment admission.
- Affected public surfaces: CLI config deploy, `resources.show` HTTP/oRPC output, Web resource
  detail, CLI resource show JSON, public docs/help, future MCP/tool descriptions.
- Release notes/docs: record as a user-visible diagnostics/admission clarity improvement when Code
  Round lands.

## Testing Strategy

- Matrix ids:
  - `RES-PROFILE-DRIFT-001` through `RES-PROFILE-DRIFT-005` in the resource profile lifecycle
    matrix.
  - `CONFIG-FILE-PROFILE-006` and `CONFIG-FILE-PROFILE-007` in the deployment config matrix.
- Test-first rows:
  - Add application query-service tests for `resources.show` drift diagnostics.
  - Add CLI/config workflow tests for `resource_profile_drift` before `deployments.create`.
  - Add redaction tests for secret/configuration drift.
- Acceptance/e2e:
  - Web resource detail should show sectioned drift status and future-only guidance.
  - CLI config deploy should produce stable structured error output with section/field/remedy.
- Contract/integration/unit:
  - HTTP/oRPC contract for `resources.show` diagnostic fields.
  - Pure comparator unit tests for normalized profile, snapshot, and entry-profile comparisons.

## Code Round Task Split

1. Add a shared application-level `ResourceProfileDriftComparator` that accepts safe current
   resource profile DTOs, optional normalized entry profile DTOs, and optional latest deployment
   snapshot DTOs.
2. Extend `ShowResourceQueryService` output diagnostics when `includeProfileDiagnostics` is true.
3. Extend config deploy workflow preflight to call the comparator for existing linked resources and
   return `resource_profile_drift` before `deployments.create` for unapplied entry-profile drift.
4. Add typed error details and error-knowledge remedies for blocking drift.
5. Update CLI resource show/config deploy rendering and structured JSON output.
6. Update HTTP/oRPC contracts and generated client types for the diagnostic shape.
7. Update Web resource detail to display sectioned drift callouts and dispatch existing named
   remediation actions where the form already exists.
8. Add tests bound to the matrix ids, then run targeted application, CLI, oRPC, and Web checks.

## Risks And Migration Gaps

- Existing deployment snapshots may not expose every field needed for full field-level comparison.
  Missing snapshot fields should produce partial informational diagnostics, not false equality.
- Config-deploy auto-apply remains an open product question. This plan specifies fail-first
  visibility unless the entry workflow explicitly dispatches a named resource command step.
- Public docs/help anchors are required before Code Round completion because this behavior changes
  user-visible recovery guidance.
