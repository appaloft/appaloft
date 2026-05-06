# Minimum Console And Deployment Loop Test Matrix

## Normative Contract

The `0.4.0` minimum console and deployment loop is a release-gate behavior over existing
operations, not a new command.

The loop is complete when an operator can create or select project, environment, deployment target
or server, resource profile, deployment attempt, and observation surfaces through CLI, HTTP/oRPC,
and Web-backed operation contracts without relying on hidden Web-only behavior.

Quick Deploy and create-resource entrypoints must sequence explicit operations. A new first-deploy
resource must be persisted through `resources.create` before the final ids-only
`deployments.create` admission request.

## Global References

This test matrix inherits:

- [Product Roadmap To 1.0.0](../PRODUCT_ROADMAP.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)
- [Project Resource Console Test Matrix](./project-resource-console-test-matrix.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Test Layers

| Layer | Minimum-loop focus |
| --- | --- |
| Operation catalog contract | Minimum-loop operations expose CLI and HTTP/oRPC transports through `operation-catalog.ts`. |
| Shared Quick Deploy workflow | Step order, id threading, `resources.create` before ids-only `deployments.create`. |
| Web entry workflow | Web Quick Deploy and project create-resource dispatch typed operation clients, not UI-local business behavior. |
| CLI smoke | CLI can create/select project, server, environment, resource, deployment, and then observe resource/deployment read surfaces. |
| HTTP/oRPC contract | HTTP/oRPC routes dispatch the same command/query messages as the operation catalog. |
| Roadmap gap ledger | Missing show/update/delete/retry/recovery capabilities are assigned to later roadmap phases, not hidden inside `0.4.0`. |

## Matrix

| Test ID | Preferred automation | Case | Entry surface | Expected result | Expected operation sequence or surface | Automated coverage |
| --- | --- | --- | --- | --- | --- | --- |
| MIN-CONSOLE-OPS-001 | contract | Minimum-loop catalog parity | CLI and HTTP/oRPC | Every Phase 2 minimum-loop operation has catalog transports for CLI and HTTP/oRPC where the roadmap treats the surface as active. | `projects.*`, `environments.*`, `servers.*`, `resources.*`, and `deployments.*` minimum-loop entries expose shared schemas and transports. | `packages/application/test/operation-catalog-boundary.test.ts`; `packages/orpc/test/deployment-create.http.test.ts` |
| PHASE7-DAY2-MGMT-001 | contract | Phase 7 day-two management exit surface | CLI and HTTP/oRPC | A user can manage resource config/secrets, storage, dependency resources/bindings/backups, auto-deploy diagnostics, deployment history, and rollback candidates through explicit operations instead of editing server files. | Resource profile/config/secret commands, storage volume and attachment commands, dependency resource and binding commands, source event reads, deployment history reads, recovery-readiness, and rollback all expose shared schemas and transports. | `packages/application/test/operation-catalog-boundary.test.ts` |
| MIN-CONSOLE-QUICK-001 | e2e-preferred | New first-deploy resource is explicit | Web Quick Deploy, Web create-resource, CLI Quick Deploy, shared workflow | New-resource first deploy persists the resource before deployment admission. | `resources.create -> deployments.create(resourceId)`; deployment input does not contain source/runtime/network/profile fields. | `packages/contracts/test/quick-deploy-workflow.test.ts`; `apps/web/test/e2e-webview/home.webview.test.ts`; `packages/adapters/cli/test/deployment-interaction.test.ts`; `apps/shell/test/e2e/quick-deploy-static-docker.workflow.e2e.ts` |
| MIN-CONSOLE-SMOKE-001 | e2e-preferred | Minimal CLI console path is observable | CLI with local PGlite and local-shell Docker runtime | A CLI user can create project, server, environment, run Quick Deploy, then observe resource and deployment read surfaces without inspecting storage manually. | `project create -> server register -> env create -> deploy -> resource list/show -> deployments list/show/logs`. | `apps/shell/test/e2e/quick-deploy-static-docker.workflow.e2e.ts` |
| MIN-CONSOLE-GAPS-001 | contract | Post-`0.4.0` gaps are explicit | Roadmap | Phase 2 does not claim uneven CRUD/lifecycle, retry/rollback, dependency resources, or internal process state closure. | Missing show/update/delete/retry/recovery work remains assigned to Phase 4 through Phase 8 roadmap sections. | `docs/PRODUCT_ROADMAP.md` |

## Current Implementation Notes And Migration Gaps

The current minimum loop uses existing active operations instead of introducing a new workflow
command. Web Quick Deploy uses the shared workflow program and typed oRPC/HTTP clients. CLI deploy
uses the same resource-profile boundary through `deployment-interaction.ts` and dispatches
`resources.create` before `deployments.create` for new resources.

The `MIN-CONSOLE-SMOKE-001` executable smoke is intentionally local-shell Docker based. Generic SSH
and server-applied route smoke coverage remain opt-in target suites governed by the Quick Deploy,
deployment config, and edge proxy matrices.

The `0.4.0` gate does not complete broader lifecycle surfaces. Server show/deactivate/delete,
credential rotation/delete, default access policy editing, route precedence hardening,
domain/certificate mutation closure, deployment retry/rollback, dependency resources, durable
process state, and audit history remain assigned to later roadmap phases.
