# Docker Swarm Runtime Target Test Matrix

## Scope

This matrix covers Docker Swarm as the first cluster runtime target backend behind existing
deployment, log, health, proxy, diagnostic, and capacity surfaces. It is target coverage for future
Code Rounds; no Swarm implementation is active yet.

## Global References

- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [Docker Swarm Runtime Target](../specs/045-docker-swarm-runtime-target/spec.md)
- [Deployment Runtime Target Abstraction](../workflows/deployment-runtime-target-abstraction.md)
- [deployments.create Test Matrix](./deployments.create-test-matrix.md)

## Coverage Rows

| ID | Layer | Scenario | Expected |
| --- | --- | --- | --- |
| SWARM-TARGET-REG-001 | Application/adapter contract | Register Swarm manager target metadata. | Target registration uses `orchestrator-cluster`, provider key `docker-swarm`, and safe provider-neutral metadata; raw Docker API payloads and secrets stay out of core/application state. Swarm manager readiness capability checks remain follow-up coverage. |
| SWARM-TARGET-ADM-001 | Command/API/CLI/Web schema | Swarm fields in deployment admission. | `deployments.create` rejects namespace, stack, service, replica, update policy, registry secret, ingress, or manifest fields with `validation_error` before deployment creation. |
| SWARM-TARGET-ADM-002 | Application admission | Swarm target lacks required backend capability. | Safe pre-acceptance detection returns `runtime_target_unsupported` in phase `runtime-target-resolution`; no deployment is accepted. |
| SWARM-TARGET-SELECT-001 | Application/runtime adapter | Select Swarm backend. | Runtime target registry chooses the `docker-swarm` backend by target kind, provider key, and required capabilities without hardcoded transport logic in use cases. |
| SWARM-TARGET-RENDER-001 | Adapter contract | Render OCI image workload. | Runtime artifact, environment snapshot, network profile, health policy, and access-route snapshot render to adapter-owned Swarm service/stack intent with sanitized display output. |
| SWARM-TARGET-RENDER-002 | Adapter contract | Render Compose artifact workload. | Compose-backed runtime intent maps to a Swarm stack only when runnable services are OCI/Docker-backed and the public target service is unambiguous. |
| SWARM-TARGET-SECRET-001 | Redaction | Registry and runtime secret references. | Image pull credentials, pull secrets, env secret values, rendered commands, and provider responses expose only masked values and safe references in logs, diagnostics, errors, and read models. |
| SWARM-TARGET-APPLY-001 | Adapter integration | Successful replacement rollout. | Candidate/update rollout preserves previous same-resource service until required apply, health, route, and public verification gates pass, then records sanitized new runtime identity. |
| SWARM-TARGET-APPLY-002 | Adapter integration | Failed replacement rollout. | Original `deployments.create` remains accepted; failure state and `deployment-failed` are persisted; cleanup touches only the failed candidate or safe Swarm rollback artifact. |
| SWARM-TARGET-OBS-001 | Query/log adapter | Read Swarm service logs. | `resources.runtime-logs` returns normalized Appaloft log events with resource/deployment context, not raw Docker service log frames. |
| SWARM-TARGET-OBS-002 | Query/health adapter | Read Swarm service health. | `resources.health` returns normalized rollout/service/route health sections and structured failure phases, not Docker API objects. |
| SWARM-TARGET-CLEAN-001 | Adapter integration | Cleanup superseded or failed Swarm runtime. | Cleanup is scoped by resource id, deployment id, target id, destination id, and adapter-owned stack/service labels; unrelated services, volumes, and Appaloft state roots are preserved. |
| SWARM-TARGET-ROUTE-001 | Runtime/proxy integration | Reverse-proxy route realization. | Provider-neutral route intent maps to Swarm service/network identity without requiring public host-port exposure for the workload. |
| SWARM-TARGET-CAP-001 | Query/adapter contract | Capacity diagnostics on Swarm target. | `servers.capacity.inspect` returns safe supported capacity signals with explicit partial/unsupported markers when cluster-wide node data is unavailable. |
| SWARM-TARGET-DOCS-001 | Public docs/help | Swarm target help exists. | Public docs/help explain manager readiness, image registry requirements, rollout, logs, health, cleanup, and unsupported-field recovery without DDD or provider payload language. |

## Current Implementation Notes And Migration Gaps

- `SWARM-TARGET-REG-001` has application/CLI/persistence coverage for safe target-kind metadata
  registration. Swarm manager readiness remains follow-up coverage.
- `SWARM-TARGET-ADM-001` has command schema, public contract schema, HTTP route, repository config
  parser, and CLI config-dispatch coverage proving Swarm-specific deployment fields are rejected
  before deployment creation.
- `SWARM-TARGET-SELECT-001` has adapter registry coverage proving an explicitly registered
  `docker-swarm` backend is selected only by `orchestrator-cluster`, provider key, and required
  capabilities.
- No Docker Swarm runtime target execution backend is active in the default registry yet.
