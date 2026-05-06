# Dependency Runtime Secret Value Resolution Plan

## Scope

Implement protected storage and execution-time resolution for dependency connection values used by
dependency runtime injection, without adding dependency fields to `deployments.create` or exposing
raw values in read surfaces.

## Source Of Truth

- [ADR-041](../../decisions/ADR-041-dependency-runtime-secret-value-resolution.md)
- [Dependency Runtime Secret Value Resolution Spec](./spec.md)
- [ADR-040](../../decisions/ADR-040-dependency-binding-runtime-injection-boundary.md)
- [Dependency Binding Runtime Injection](../047-dependency-binding-runtime-injection/spec.md)
- [Dependency Resource Lifecycle](../../workflows/dependency-resource-lifecycle.md)
- [Dependency Resource Test Matrix](../../testing/dependency-resource-test-matrix.md)
- [deployments.create Test Matrix](../../testing/deployments.create-test-matrix.md)
- [ADR-023](../../decisions/ADR-023-runtime-orchestration-target-boundary.md)

## Code Shape

1. Add application ports for dependency secret-value storage, reference validation, and
   execution-time resolution.
2. Store imported Postgres and Redis connection URLs through the port before persisting dependency
   resources when no external `secretRef` is supplied.
3. Require provider-managed Postgres realization to return either an externally resolvable provider
   reference or a value stored through the Appaloft dependency secret-value store.
4. Extend the dependency runtime-injection materializer to verify captured Appaloft-owned references
   are resolvable before create admission.
5. Pass resolved execution-only dependency secrets to runtime target adapters without adding raw
   values to deployment snapshots or runtime plan read models.
6. Make single-server execution inject resolved values into the workload environment while keeping
   command display redacted.
7. Make Swarm execution create/update Docker secrets from resolved values and reference only safe
   Docker secret handles in rendered service intent.

## Package Impact

| Package | Planned impact |
| --- | --- |
| `packages/core` | Add value objects only if new safe reference kinds or stable blocked reasons need core validation. No raw values in aggregate state. |
| `packages/application` | New dependency secret store/resolver ports, import/provision integration, runtime injection resolvability checks, create/plan tests. |
| `packages/contracts` | Existing readiness schemas should be reused; add reason-code coverage if blocked reasons expand. |
| `packages/persistence/pg` | Add protected dependency secret-value storage/resolution tables or generalize the existing binding-secret table through a migration. |
| `packages/adapters/runtime` | Execution-only resolved secret input, local/SSH env injection, Swarm Docker secret create/update rendering, redaction tests. |
| `packages/adapters/cli`, `packages/orpc`, `apps/web` | Reuse existing command/query schemas and readiness output; no new transport-only shapes. |
| `apps/shell` | Register store/resolver implementations and wire runtime target execution dependencies through explicit tokens. |
| `apps/docs` | No new page required unless Code Round changes the user setup flow beyond existing dependency runtime injection docs. |

## Test Strategy

- Application tests for storing imported Postgres and Redis connection values without leaking raw
  URLs in command results, read models, logs, or events.
- Application plan/create tests for unresolved Appaloft-owned secret refs blocking deployment
  admission.
- Runtime adapter tests for local/SSH env injection of resolved values with redacted command
  display and diagnostics.
- Swarm runtime tests for Docker secret create/update intent and raw-value redaction.
- PGlite persistence tests for secret storage, lookup, rotation ref retention, and missing-ref
  failures.
- Contract tests only if public readiness reason unions change.

## Release Impact

- Roadmap target: Phase 7 / `0.9.0` beta.
- Compatibility impact: `pre-1.0-policy`; strengthens import/provision storage semantics and
  deployment admission for unresolved internal secret refs.
- Release note: mention that Appaloft-owned dependency secret references are now resolved into
  runtime values during deployment while remaining masked in read surfaces.

## Deferred

- Provider-native Redis realization.
- External vault/KMS integrations beyond the first Appaloft-owned store and provider-owned refs.
- Build-time dependency injection.
- File/reference injection modes.
- User-facing plaintext secret reveal or browse operations.
