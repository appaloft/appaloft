# Plan: Imported Dependency Connection Rotation

## Architecture

- Add one explicit aggregate transition and domain event; do not add a generic dependency update.
- Add one command schema, use case, handler, operation-catalog entry and DI registration.
- Reuse `DependencyResourceSecretStore.storeConnection`, whose deterministic Appaloft reference
  replaces the protected value in place.
- Reuse connection masking/validation from import so read models remain safe and current.
- Add CLI stdin capture, HTTP/oRPC and generated SDK parity.
- Extend public docs and Cloud operation authorization/admission in the dependent repository.

## Verification

- Core/application lifecycle tests for success and eligibility denial.
- CLI tests for stdin and mutual exclusion; shell remote test for typed body and redaction.
- HTTP route, operation catalog, docs registry, generator snapshot and typecheck coverage.
- `bun run check:ash` because executable shell construction remains governed even though this
  operation introduces no shell command.
- Production proof is `dependency query ... --statement 'SELECT 1'` after rotation.

## Failure And Recovery

- Secret-store failure leaves resource metadata unchanged.
- If safe metadata persistence fails after the idempotent secret overwrite, retrying the same
  command converges the resource on the same stable secret reference.
- Rotation never triggers a provider mutation, runtime restart, deployment, or binding rewrite.
