# Served Route Terminal Verification Test Matrix

## Governing Sources

- [Served Route Terminal Verification](../specs/140-served-route-terminal-verification/spec.md)
- [Routing, Domain And TLS Test Matrix](./routing-domain-and-tls-test-matrix.md)
- [Docker Swarm Runtime Target Test Matrix](./docker-swarm-runtime-target-test-matrix.md)

## Coverage

| ID | Layer | Scenario | Expected | Automation | Status |
| --- | --- | --- | --- | --- | --- |
| `ROUTE-TERM-PLAN-001` | Adapter unit | Multiple served routes/domains for one target service plus redirects/unrelated services. | Deterministic distinct URL plan contains every applicable served route/domain and excludes redirects/unrelated services. | `packages/adapters/runtime/test/public-route-health.test.ts` | Passing |
| `ROUTE-TERM-LOCAL-001` | Local runtime adapter | Later Local Docker/Compose route fails. | Every planned route is probed before success; failure removes the candidate before superseded cleanup and records only safe URL evidence. | Shared route-plan unit tests, Local adapter typecheck and runtime suite | Passing |
| `ROUTE-TERM-SSH-001` | SSH runtime adapter | Later Generic SSH Docker/Compose route fails. | Every planned route is probed before success; failure removes the remote candidate before superseded cleanup and records only safe URL evidence. | Shared route-plan unit tests, SSH adapter typecheck and runtime suite | Passing |
| `ROUTE-TERM-SWARM-001` | Swarm intent/backend | All promoted served routes pass. | Superseded cleanup occurs only after every route proof. | `packages/adapters/runtime/test/docker-swarm-runtime-intent.test.ts`; `packages/adapters/runtime/test/docker-swarm-execution-backend.test.ts` | Passing |
| `ROUTE-TERM-SWARM-002` | Swarm intent/backend | Later promoted route fails. | Previous route labels are restored and verified before candidate cleanup; no success is recorded. | `packages/adapters/runtime/test/docker-swarm-runtime-intent.test.ts`; `packages/adapters/runtime/test/docker-swarm-execution-backend.test.ts` | Passing |
| `ROUTE-TERM-OPT-001` | Runtime adapters | Health check disabled with multiple routes. | No public route probe is added and existing opt-out remains terminally valid. | Swarm intent regression plus Local/SSH guarded execution branches | Passing |
