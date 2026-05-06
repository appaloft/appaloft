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
- [x] `SWARM-TARGET-APPLY-001`: rollout preserves or restores previous same-resource service until
  verification succeeds.
- [x] `SWARM-TARGET-APPLY-002`: fake-runner failed candidate rollout records deployment failure and
  runs only deployment-scoped cleanup.
- [x] `SWARM-TARGET-OBS-001A`: Swarm service logs return normalized Appaloft runtime log lines.
- [x] `SWARM-TARGET-OBS-001B`: Swarm health returns normalized Appaloft health read-model shapes.
- [x] `SWARM-TARGET-CLEAN-001`: cleanup stays resource/deployment/destination scoped.
- [x] `SWARM-TARGET-ROUTE-001A`: Traefik reverse-proxy labels are promoted only after candidate
  verification and attach to the Swarm service/network identity without public workload host ports.
- [ ] `SWARM-TARGET-ROUTE-001B`: end-to-end reverse-proxy route realization is verified against a
  real Swarm edge proxy.
- [x] `SWARM-TARGET-SECRET-001A`: Swarm command failure output stored in deployment logs and
  metadata is redacted.
- [ ] `SWARM-TARGET-SECRET-001B`: registry credentials, pull secrets, env values, and all rendered
  command/provider payloads are redacted across real Swarm execution.

## Implementation

- [x] Add Swarm-capable target registration metadata support.
- [x] Keep `deployments.create` and repository config Swarm-field admission rejection covered.
- [x] Keep unsupported Swarm target runtime backend admission rejection covered.
- [x] Add Swarm manager readiness capability checks.
- [x] Add Swarm runtime target backend descriptor and registry selection coverage.
- [x] Implement adapter-owned render intent for OCI image and Compose workloads.
- [x] Add adapter-owned image apply-plan rendering for deployment-specific candidate services.
- [x] Add adapter-owned label-scoped cleanup plan rendering for Swarm services.
- [x] Add opt-in fake Docker Swarm execution backend acceptance coverage for image apply and scoped
  cleanup.
- [x] Add Swarm service log reading through the existing runtime log adapter.
- [x] Add remote-manager SSH execution for Swarm service log reading.
- [x] Add Swarm service health inspection through the existing resource health query adapter.
- [x] Add post-verification Traefik route label promotion to the Swarm image apply plan.
- [x] Redact Swarm command failure output before deployment logs/metadata capture.
- [x] Add bounded shell command runner for the opt-in Swarm execution backend.
- [x] Add disabled-by-default shell composition for the opt-in Swarm execution backend.
- [x] Add environment-gated real Swarm smoke harness for apply/route/secret/cleanup validation.
- [x] Add a first-class `bun run smoke:swarm` command for opt-in real Swarm smoke execution.
- [x] Add configurable Swarm edge network selection for opt-in execution and smoke runs.
- [x] Smoke-test real apply/verify/cleanup against a Swarm manager.
- [x] Add sanitized target identity persistence/read-model support where required.
- [x] Add CLI/API/Web/future MCP descriptions through existing operation surfaces.

## Docs Round

- [x] Add public docs/help anchor for Docker Swarm runtime targets.
- [x] Add CLI/API descriptions and Web help links for Swarm target readiness and unsupported-field
  recovery.

## Verification

- [x] Run targeted domain/application/adapter tests.
- [x] Run fake Swarm backend acceptance tests.
- [x] Run the real Swarm smoke harness in skipped/default CI mode.
- [x] Run opt-in real Swarm smoke tests when environment is available.
- [x] Run `bun run lint`.
- [x] Run `bun turbo run typecheck`.
