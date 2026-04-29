# Operator Work Ledger Plan

## Operation Position

- Add `operator-work.list` and `operator-work.show` as active read-only queries under the
  operator/internal-state surface.
- Update `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, and
  `packages/application/src/operation-catalog.ts` together.

## Implementation

- Add application query messages, schemas, handlers, and `OperatorWorkQueryService`.
- Aggregate existing read models:
  - `DeploymentReadModel` for deployment attempt work;
  - `ServerReadModel` for proxy bootstrap state;
  - `CertificateReadModel` plus `DomainBindingReadModel` for latest certificate attempts and safe
    related ids.
- Add contracts schemas for the list/show responses.
- Add HTTP/oRPC routes:
  - `GET /api/operator-work`
  - `GET /api/operator-work/{workId}`
- Add CLI:
  - `appaloft work list`
  - `appaloft work show <workId>`
- Add public docs/help registry coverage pointing to a stable operator work ledger anchor.

## Tests

- Operation catalog boundary coverage for the two new query entries.
- Application query-service aggregation tests for deployment, proxy-bootstrap, certificate,
  filtering, show, and no secret leakage.
- CLI dispatch tests for `work list` and `work show`.
- HTTP/oRPC dispatch test for list/show.
- Public docs registry coverage.

## Non-Goals

- No retry, cancel, prune, mark-recovered, or dead-letter mutations.
- No durable outbox/inbox table in this slice.
- No change to `deployments.create` acceptance semantics.
