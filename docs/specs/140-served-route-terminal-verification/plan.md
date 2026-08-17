# Served Route Terminal Verification Plan

## Governing Sources

- [Spec](./spec.md)
- [Test Matrix](../../testing/served-route-terminal-verification-test-matrix.md)
- [Docker Swarm Runtime Target Test Matrix](../../testing/docker-swarm-runtime-target-test-matrix.md)

## Implementation Shape

1. Replace the one-route selector with a pure deterministic verifier-plan builder that filters by
   served/target-service semantics, expands all domains, joins health paths and dedupes URLs.
2. Bind Local and Generic SSH Docker/Compose execution to the full verifier plan without changing
   health-disabled behavior or candidate cleanup ownership.
3. Extend Swarm apply planning with complete public-route verification after route promotion and
   before superseded cleanup.
4. Snapshot enough previous route-label intent to render an exact rollback command. On public
   failure, restore prior labels, verify prior ownership, then remove only the failed candidate.
5. Keep logs and metadata bounded to safe URLs/failure kinds; never include environment values,
   registry credentials or raw Docker inspect output.

## Test Strategy

- Pure helper tests for service filtering, redirects, domain expansion, path joining and dedupe.
- Local/SSH Docker and Compose adapter tests for second-route failure and cleanup order.
- Swarm apply-plan and fake-runner tests for promotion, all-route proof, rollback and cleanup order.
- Environment-gated real Swarm smoke for more than one host/path route and rollback where the
  harness can safely create and remove temporary services.

## Risks

- Swarm route rollback must not reconstruct labels from mutable live state after promotion.
- Multiple URLs increase bounded verification time; existing per-route retry limits remain, and
  ordering must be deterministic for reproducible diagnostics.
- A target-service filter must retain legacy route snapshots without silently accepting a route
  explicitly owned by a different service.
