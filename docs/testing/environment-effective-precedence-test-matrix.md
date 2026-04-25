# Environment Effective Precedence Test Matrix

## Normative Contract

`environments.effective-precedence` must prove that Appaloft exposes a safe, read-only environment
configuration precedence view through the shared operation schema.

## Global References

- [Environment Effective Precedence Query Spec](../queries/environments.effective-precedence.md)
- [Environment Effective Precedence Feature Spec](../specs/002-environment-effective-precedence/spec.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Coverage Rows

| ID | Preferred automation | Case | Given | Query input | Expected Result | Expected errors |
| --- | --- | --- | --- | --- | --- | --- |
| ENV-PRECEDENCE-QRY-001 | integration | Precedence resolution | Environment has duplicate `key + exposure` entries across lower and higher scopes. | `{ environmentId }` | `ok` with one effective entry using the highest-precedence scope and all owned entries visible. | None |
| ENV-PRECEDENCE-QRY-002 | integration | Secret masking | Environment has a secret runtime value. | `{ environmentId }` | Owned and effective entries return masked value only; no plaintext secret appears. | None |
| ENV-PRECEDENCE-QRY-003 | integration | Missing environment | Repository has no matching environment. | `{ environmentId }` | No state mutation. | `not_found`, `phase = environment-read` |
| ENV-PRECEDENCE-ENTRY-001 | contract | Operation catalog and docs coverage | Operation becomes active. | n/a | `CORE_OPERATIONS.md`, `operation-catalog.ts`, and docs registry expose the same key. | None |
| ENV-PRECEDENCE-ENTRY-002 | contract | HTTP/oRPC dispatch | HTTP/oRPC route receives environment id. | `{ environmentId }` | Route dispatches `EnvironmentEffectivePrecedenceQuery` through `QueryBus`. | Transport maps query errors through shared oRPC handling. |
| ENV-PRECEDENCE-ENTRY-003 | contract | CLI dispatch | CLI command receives environment id. | `appaloft env effective-precedence <environmentId>` | CLI dispatches `EnvironmentEffectivePrecedenceQuery` through `QueryBus`. | CLI maps query errors through shared command runtime. |

## Required Non-Coverage Assertions

Tests must assert that the query does not:

- create deployments;
- change environment variables;
- promote, clone, lock, archive, or delete environments;
- mutate resource variables or deployment snapshots;
- return plaintext secret values.

## Current Implementation Notes And Migration Gaps

Automated coverage exists for:

- `ENV-PRECEDENCE-QRY-001` through `ENV-PRECEDENCE-QRY-003` in
  `packages/application/test/environment-effective-precedence.test.ts`;
- `ENV-PRECEDENCE-ENTRY-001` in
  `packages/application/test/operation-catalog-boundary.test.ts` and
  `packages/docs-registry/test/operation-coverage.test.ts`;
- `ENV-PRECEDENCE-ENTRY-002` in
  `packages/orpc/test/environment-effective-precedence.http.test.ts`;
- `ENV-PRECEDENCE-ENTRY-003` in
  `packages/adapters/cli/test/environment-command.test.ts`.

No migration gaps remain for this behavior.
