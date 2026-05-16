# Deployment Archive And Prune Test Matrix

## Scope

This matrix covers the pre-RC deployment attempt archive/prune closure slice. It does not replace
`deployments.logs.prune`, provider job log retention, domain event stream retention, audit
retention, runtime artifact prune, or operator-work prune.

## Governing Sources

- [deployments.archive Command Spec](../commands/deployments.archive.md)
- [deployments.prune Command Spec](../commands/deployments.prune.md)
- [Deployment Recovery Readiness Test Matrix](./deployment-recovery-readiness-test-matrix.md)
- [Pre-RC Closure And Hardening](../specs/073-pre-rc-closure/spec.md)

## Matrix

| ID | Scenario | Expected evidence | Automation | Status |
| --- | --- | --- | --- | --- |
| `DEP-ARCHIVE-001` | Terminal deployment is archived. | Command records `archivedAt`, publishes `deployment.archived`, default list hides the attempt, and `includeArchived` includes it. | `packages/application/test/deployment-archive-prune.test.ts` | Passing |
| `DEP-ARCHIVE-002` | Active deployment is archived. | Command rejects with `deployment_archive_not_allowed` and does not mutate the attempt. | `packages/application/test/deployment-archive-prune.test.ts` | Passing |
| `DEP-PRUNE-001` | Deployment prune omits `dryRun`. | Application command reports matched, guarded, and eligible ids without deleting. | `packages/application/test/deployment-archive-prune.test.ts` | Passing |
| `DEP-PRUNE-002` | Destructive prune finds archived terminal attempts. | Persistence deletes only old archived terminal attempts with no retained references and preserves guarded attempts plus provider job logs. | `packages/persistence/pg/test/deployment-attempt-retention.pglite.test.ts` | Passing |
| `DEP-ARCHIVE-ENTRY-001` | CLI archive is invoked. | CLI dispatches `ArchiveDeploymentCommand` through CommandBus with shared schema. | `packages/adapters/cli/test/deployment-cancel-command.test.ts` | Passing |
| `DEP-PRUNE-ENTRY-001` | CLI prune is invoked. | CLI dispatches `PruneDeploymentsCommand` through CommandBus with shared schema. | `packages/adapters/cli/test/deployment-cancel-command.test.ts` | Passing |
| `DEP-ARCHIVE-ENTRY-002` | HTTP/oRPC archive route is invoked. | `POST /api/deployments/{deploymentId}/archive` dispatches `ArchiveDeploymentCommand`. | `packages/orpc/test/deployment-create.http.test.ts` | Passing |
| `DEP-PRUNE-ENTRY-002` | HTTP/oRPC prune route is invoked. | `POST /api/deployments/prune` dispatches `PruneDeploymentsCommand`. | `packages/orpc/test/deployment-create.http.test.ts` | Passing |
| `DEP-ARCHIVE-ENTRY-003` | Operation metadata includes archive. | Operation catalog, docs registry, OpenAPI, SDK metadata, public docs/help, and future tool descriptors expose archive semantics. | `packages/application/test/operation-catalog-boundary.test.ts`; `packages/docs-registry/test/operation-coverage.test.ts`; `packages/openapi/test/openapi-reference.test.ts`; `packages/sdk/test/generated-operations.test.ts` | Pending current round verification |
| `DEP-PRUNE-ENTRY-003` | Operation metadata includes prune. | Operation catalog, docs registry, OpenAPI, SDK metadata, public docs/help, and future tool descriptors expose dry-run-first prune semantics. | `packages/application/test/operation-catalog-boundary.test.ts`; `packages/docs-registry/test/operation-coverage.test.ts`; `packages/openapi/test/openapi-reference.test.ts`; `packages/sdk/test/generated-operations.test.ts` | Pending current round verification |
