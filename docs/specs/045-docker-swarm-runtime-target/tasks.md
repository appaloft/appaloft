# Tasks: Docker Swarm Runtime Target

## Spec Round

- [x] Confirm ADR-021 and ADR-023 govern the Swarm boundary without a new ADR.
- [x] Position Docker Swarm as an internal runtime target capability in the business operation map.
- [x] Create local spec, plan, and task artifacts.
- [x] Create the Docker Swarm runtime target test matrix.
- [x] Update runtime target workflow, implementation plan, and roadmap notes without marking Code
  Round complete.

## Test-First

- [x] `SWARM-TARGET-REG-001`: Swarm manager target registration accepts safe provider-neutral
  target kind metadata.
- [x] `SWARM-TARGET-REG-002`: Swarm manager readiness checks cover SSH reachability, Docker
  daemon availability, active manager state, overlay network support, and edge proxy compatibility
  without mutating stacks, services, or networks.
- [x] `SWARM-TARGET-ADM-001`: `deployments.create` remains ids-only and rejects Swarm deployment
  fields.
- [x] `SWARM-TARGET-ADM-002`: `deployments.create` rejects a Swarm target before acceptance when
  the runtime backend lacks required capabilities.
- [x] `SWARM-TARGET-SELECT-001`: backend registry selects `docker-swarm` by target kind, provider
  key, and capabilities.
- [x] `SWARM-TARGET-RENDER-001`: OCI image and Compose artifact intent render to adapter-owned
  Swarm stack/service intent.
- [ ] `SWARM-TARGET-APPLY-001`: rollout preserves or restores previous same-resource service until
  verification succeeds.
- [ ] `SWARM-TARGET-OBS-001`: logs and health return normalized Appaloft read-model shapes.
- [ ] `SWARM-TARGET-CLEAN-001`: cleanup stays resource/deployment/destination scoped.
- [ ] `SWARM-TARGET-ROUTE-001`: reverse-proxy access routes attach through Swarm service/network
  identity without public workload host ports.
- [ ] `SWARM-TARGET-SECRET-001`: registry credentials, pull secrets, env values, and rendered
  command/provider payloads are redacted.

## Implementation

- [x] Add Swarm-capable target registration metadata support.
- [x] Keep `deployments.create` and repository config Swarm-field admission rejection covered.
- [x] Keep unsupported Swarm target runtime backend admission rejection covered.
- [x] Add Swarm manager readiness capability checks.
- [x] Add Swarm runtime target backend descriptor and registry selection coverage.
- [x] Implement adapter-owned render intent for OCI image and Compose workloads.
- [x] Add adapter-owned image apply-plan rendering for deployment-specific candidate services.
- [x] Add adapter-owned label-scoped cleanup plan rendering for Swarm services.
- [ ] Implement apply/verify/log/health/cleanup behind runtime adapters.
- [ ] Add sanitized target identity persistence/read-model support where required.
- [x] Add CLI/API/Web/future MCP descriptions through existing operation surfaces.

## Docs Round

- [x] Add public docs/help anchor for Docker Swarm runtime targets.
- [x] Add CLI/API descriptions and Web help links for Swarm target readiness and unsupported-field
  recovery.

## Verification

- [ ] Run targeted domain/application/adapter tests.
- [ ] Run fake Swarm backend acceptance tests.
- [ ] Run opt-in real Swarm smoke tests when environment is available.
- [ ] Run `bun run lint`.
- [ ] Run `bun turbo run typecheck`.
