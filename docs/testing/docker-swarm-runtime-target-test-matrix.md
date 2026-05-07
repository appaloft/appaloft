# Docker Swarm Runtime Target Test Matrix

## Scope

This matrix covers Docker Swarm as the first cluster runtime target backend behind existing
deployment, log, health, proxy, diagnostic, and capacity surfaces. Docker Swarm execution is active
in the default shell runtime registry unless explicitly opted out.

## Global References

- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [Docker Swarm Runtime Target](../specs/045-docker-swarm-runtime-target/spec.md)
- [Deployment Runtime Target Abstraction](../workflows/deployment-runtime-target-abstraction.md)
- [deployments.create Test Matrix](./deployments.create-test-matrix.md)

## Coverage Rows

| ID | Layer | Scenario | Expected |
| --- | --- | --- | --- |
| SWARM-TARGET-REG-001 | Application/adapter contract | Register Swarm manager target metadata. | Target registration uses `orchestrator-cluster`, provider key `docker-swarm`, and safe provider-neutral metadata; raw Docker API payloads and secrets stay out of core/application state. |
| SWARM-TARGET-REG-002 | Runtime adapter readiness | Test Swarm manager readiness. | `servers.test-connectivity` checks SSH reachability, Docker daemon availability, active Swarm manager control-plane state, overlay network driver availability, and Swarm edge-proxy compatibility without creating stacks, services, or networks. |
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
  registration.
- `SWARM-TARGET-REG-002` has runtime adapter coverage proving `servers.test-connectivity` runs
  non-mutating Swarm manager readiness checks for SSH, Docker, active manager state, overlay
  network support, and edge proxy compatibility.
- `SWARM-TARGET-ADM-001` has command schema, public contract schema, HTTP route, repository config
  parser, and CLI config-dispatch coverage proving Swarm-specific deployment fields are rejected
  before deployment creation.
- `SWARM-TARGET-SELECT-001` has adapter registry coverage proving an explicitly registered
  `docker-swarm` backend is selected only by `orchestrator-cluster`, provider key, and required
  capabilities.
- `SWARM-TARGET-ADM-002` has application admission coverage proving an `orchestrator-cluster` /
  `docker-swarm` target without required runtime backend capability returns
  `runtime_target_unsupported` before any deployment row is accepted.
- `SWARM-TARGET-RENDER-001` has adapter contract coverage proving OCI image runtime artifact
  intent, runtime environment snapshot variables, health policy, and access routes render to
  adapter-owned Swarm stack/service intent.
- `SWARM-TARGET-RENDER-002` has adapter contract coverage proving Compose runtime artifact intent
  renders only when the public target service is explicit, and otherwise returns
  `runtime_target_unsupported` in phase `runtime-target-render`.
- `SWARM-TARGET-SECRET-001` has initial render-contract coverage proving runtime secret environment
  values are converted to safe references and omitted from serialized render intent. Provider
  response redaction beyond the current apply/log/diagnostic adapter contracts remains open.
  Rendered Swarm apply-plan display commands now redact non-secret runtime environment values while
  retaining the executable command internally for explicit execution.
  Rendered image apply plans also honor internal registry-auth/pull-secret metadata by adding
  `--with-registry-auth` to executable/display commands while exposing only a redacted
  registry-auth marker in the intent and omitting raw registry secret references from intent,
  command, and display payloads. Local real Swarm smoke has passed with a temporary authenticated
  registry, private image push/pull, `--with-registry-auth`, and secret-safe deployment
  logs/metadata.
- `SWARM-TARGET-APPLY-001` has initial adapter contract coverage proving OCI image apply planning
  creates a deployment-specific candidate service before verification, route promotion, and
  superseded-service cleanup. The opt-in fake backend now executes that order, records sanitized
  runtime identity after success, and skips superseded-service cleanup when candidate verification
  fails, so previous same-resource services are preserved in default failure handling. Local real
  Swarm smoke has passed for apply, verification, route-label promotion, and scoped cleanup.
- `SWARM-TARGET-ROUTE-001` has initial apply-plan coverage proving image workloads attach to the
  Swarm overlay network without public host-port publication. Local real Swarm smoke has passed
  with a temporary Traefik Swarm edge proxy, post-verification route-label promotion, and an HTTP
  `Host: api.example.com` route request to the nginx workload through the published proxy entrypoint.
- `SWARM-TARGET-CLEAN-001` has initial adapter contract coverage proving Swarm service cleanup
  selectors include Appaloft managed, resource, deployment, target, destination, and runtime-target
  labels, and do not render broad Docker prune or volume commands. It also has fake-runner backend
  acceptance coverage proving `cancel` executes only the scoped cleanup command.
- `DockerSwarmExecutionBackend` has fake-runner acceptance coverage proving image apply commands run
  in candidate-create, verify, route-promotion, cleanup order and record sanitized Swarm runtime
  metadata. Shell composition registers it by default, while explicit opt-out remains available for
  installations that are not ready to execute Swarm deployments.
- `SWARM-TARGET-APPLY-001` and `SWARM-TARGET-CLEAN-001` have initial command-runner coverage
  proving the opt-in shell runner executes bounded rendered commands, preserves stdout/stderr and
  nonzero exit codes, and reports timeout failures for backend handling. The default runtime target
  registry now composes the Docker Swarm backend by default, with
  `APPALOFT_DOCKER_SWARM_EXECUTION_ENABLED=false` available as an explicit opt-out. Local real
  Docker Swarm smoke coverage is environment-gated and has passed outside default CI.
- `SWARM-TARGET-APPLY-001`, `SWARM-TARGET-OBS-001`, and `SWARM-TARGET-OBS-002` have PGlite
  persistence/read-model coverage proving sanitized Swarm stack name, service name, and apply-plan
  schema version metadata round-trip through deployment execution metadata without raw command,
  provider payload, or registry-secret fields.
- `SWARM-TARGET-APPLY-002` has fake-runner backend coverage proving a failed candidate verification
  records deployment failure metadata and runs only the deployment-scoped cleanup command for the
  failed candidate. Real Swarm rollback command behavior remains open.
- `SWARM-TARGET-OBS-001` has initial runtime-log adapter coverage proving Swarm-backed OCI image
  deployments read `docker service logs` through sanitized `swarm.serviceName` metadata and return
  normalized Appaloft runtime log lines with configured redaction applied. Coverage now proves the
  reader executes Swarm service logs through the resolved Swarm manager over SSH when target
  metadata/repository context is available, while retaining the local Docker fallback for local
  smoke execution.
- `SWARM-TARGET-OBS-002` has initial application/adapter coverage proving `resources.health` can
  request an opt-in Swarm runtime probe from sanitized `swarm.serviceName` metadata and normalize
  `docker service ps` task state into Appaloft runtime health/check fields without exposing raw
  Docker task payloads. Coverage now proves the probe receives the deployment target server id from
  the application query path and executes `docker service ps` through the resolved Swarm manager
  over SSH when repository context is available, while retaining the local Docker fallback for local
  smoke execution.
- `SWARM-TARGET-ROUTE-001` has initial apply-plan coverage proving Traefik route labels are absent
  from candidate service creation and added only in the post-verification `promote-route-target`
  step against the Swarm edge network. Adapter coverage now proves the execution backend can
  use `APPALOFT_DOCKER_SWARM_EDGE_NETWORK` to target a configured overlay network for both service
  attachment and route labels. End-to-end route realization is covered by the opt-in real Swarm
  smoke, which starts a temporary Traefik Swarm service on the overlay network and verifies the
  promoted service route over HTTP without publishing the workload service port.
- `SWARM-TARGET-SECRET-001` has initial fake-backend coverage proving Swarm command failure output
  is redacted before deployment logs and execution metadata capture common auth headers, cookies,
  key/value secrets, URL credentials, private-key blocks, or exact deployment snapshot secret
  values. The real Swarm smoke now provisions a temporary authenticated registry, logs in without
  echoing credentials, pushes a smoke image, deploys that private image through the same
  `DockerSwarmExecutionBackend` path with `--with-registry-auth`, and asserts registry secret
  material, secret references, and runtime env secret values stay out of deployment logs/metadata.
- `packages/adapters/runtime/test/docker-swarm-execution-backend.test.ts` now includes an
  environment-gated real Docker Swarm smoke harness for
  `SWARM-TARGET-ROUTE-001B`/`SWARM-TARGET-SECRET-001B`. It runs only when
  `APPALOFT_DOCKER_SWARM_SMOKE=1`, requires an active local manager and an overlay network named by
  `APPALOFT_DOCKER_SWARM_EDGE_NETWORK` or `appaloft-edge`, deploys through
  `DockerSwarmExecutionBackend` with `DockerSwarmShellCommandRunner`, and cleans the scoped service
  afterward. `bun run smoke:swarm` is the first-class opt-in command for that harness. Default CI
  keeps this smoke skipped until a real Swarm environment is explicitly available. On 2026-05-06,
  the harness passed against a temporary local Swarm manager with `appaloft-smoke-edge`, including
  smoke-specific Docker secret setup, real Traefik route realization, authenticated-registry image
  pull, secret-safe deployment metadata, and scoped cleanup.
- `SWARM-TARGET-DOCS-001` has a registered public docs/help topic and bilingual server docs anchor
  explaining Swarm target registration, manager readiness expectations, image registry access,
  rollout/log/health/cleanup expectations, and unsupported-field recovery. CLI `server register`,
  HTTP `POST /servers`, and Web server registration provider help link to that anchor. Future MCP
  descriptors continue to expose `servers.register` from the operation catalog without adding a
  Swarm-specific tool.
- Docker Swarm runtime target execution is enabled by default in shell configuration and can be
  disabled with `APPALOFT_DOCKER_SWARM_EXECUTION_ENABLED=false` when an installation is not ready
  to execute Swarm deployments.
