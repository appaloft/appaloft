# Repository Config Service Graph Plan

## Implementation Plan

1. Extend `@appaloft/deployment-config` with a strict `services.<key>` schema that reuses existing
   source/runtime/network/health/env/secret validation and admits service-local `replicas`.
2. Keep top-level `replicas` and target sizing fields rejected.
3. Map parsed service graph names/kinds into CLI config deploy seeds.
4. During first-run config bootstrap, pass declared services into `resources.create`; when multiple
   services are declared, create the Resource as `compose-stack` to satisfy current Resource
   service-cardinality invariants.
5. During existing Resource config deploy, block service graph drift with `resource_profile_drift`
   until a service reconciliation command/spec exists.
6. Update source-of-truth docs and test matrix rows.
7. Run targeted parser and CLI config workflow tests.

## Deferred Work

- Service-specific runtime planning and deployment snapshot materialization.
- A dedicated service graph reconciliation command for existing Resources.
- Web editing/readback designed for service-level runtime/network/replica details.
- Cross-Resource multi-application release orchestration.
