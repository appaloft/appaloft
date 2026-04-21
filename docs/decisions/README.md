# Decision Records

## Normative Contract

This directory contains source-of-truth decision records for business-operation specs, workflow boundaries, and implementation-facing architecture choices that block command/event/error/testing alignment.

These records are binding for future implementation work, agent planning, spec updates, and tests. When a local command, workflow, error, or testing spec still lists an Open Question that is answered here, the decision record wins.

This directory complements the historical technical ADRs in `docs/adr/`. Use `docs/decisions/` for domain, CQRS, command, workflow, async lifecycle, and operation-boundary decisions.

Before adding or rebuilding a business behavior, locate the behavior in
[Business Operation Map](../BUSINESS_OPERATION_MAP.md). If the behavior is absent or marked
rebuild-required there, update the operation map and required ADR before local specs or code.

## Status Values

| Status | Meaning |
| --- | --- |
| `Accepted` | The decision is active and must be followed. |
| `Proposed` | A default rule is proposed for review; implementation may use it only after human approval or explicit adoption. |
| `Superseded` | A newer decision record replaces this one. |
| `Deferred` | The decision needs human approval before implementation can rely on it. |

## Index

| ADR | Status | Scope |
| --- | --- | --- |
| [ADR-001: deployments.create HTTP API Required Fields](./ADR-001-deploy-api-required-fields.md) | Accepted | Required deployment command context for strict API and local bootstrap profiles. |
| [ADR-002: Routing, Domain, And TLS Boundary](./ADR-002-routing-domain-tls-boundary.md) | Accepted | Whether deployment routing hints belong in `deployments.create` or separate domain/certificate commands. |
| [ADR-003: Server Connect Public Versus Internal](./ADR-003-server-connect-public-vs-internal.md) | Accepted | Whether `servers.connect` is public, internal, or both. |
| [ADR-004: Server Readiness State Storage](./ADR-004-server-readiness-state-storage.md) | Accepted | Where connectivity, proxy, readiness, and attempt state belong. |
| [ADR-005: Domain Binding Owner Scope](./ADR-005-domain-binding-owner-scope.md) | Accepted | First durable domain binding ownership scope. |
| [ADR-006: Domain Verification Strategy](./ADR-006-domain-verification-strategy.md) | Accepted | Default domain ownership verification strategy. |
| [ADR-007: Certificate Provider And Challenge Default](./ADR-007-certificate-provider-and-challenge-default.md) | Accepted | Initial certificate provider and challenge type. |
| [ADR-008: Renewal Trigger Model](./ADR-008-renewal-trigger-model.md) | Accepted | Certificate renewal trigger ownership and scheduling model. |
| [ADR-009: Certificates Import Command](./ADR-009-certificates-import-command.md) | Accepted | Manual certificate import is a separate command. |
| [ADR-010: Quick Deploy Workflow Boundary](./ADR-010-quick-deploy-workflow-boundary.md) | Accepted | Whether Quick Deploy is a standalone command or an entry workflow over explicit operations. |
| [ADR-011: Resource Create Minimum Lifecycle](./ADR-011-resource-create-minimum-lifecycle.md) | Accepted | Minimum explicit `resources.create` command boundary and lifecycle. |
| [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md) | Accepted | Where reusable source/runtime/health/access configuration belongs versus deployment attempt snapshots. |
| [ADR-013: Project Resource Navigation And Deployment Ownership](./ADR-013-project-resource-navigation-and-deployment-ownership.md) | Accepted | Project pages and navigation are resource-centered; deployment actions and history are resource-owned. |
| [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md) | Accepted | `deployments.create` consumes resource-owned source/runtime/network profile and no longer accepts source/runtime/network/route configuration fields. |
| [ADR-015: Resource Network Profile](./ADR-015-resource-network-profile.md) | Accepted | Resource-owned network endpoint and port semantics for deployment planning, reverse proxy targets, and snapshots. |
| [ADR-016: Deployment Command Surface Reset](./ADR-016-deployment-command-surface-reset.md) | Accepted | v1 keeps `deployments.create` as the only general deployment admission command and permits narrow `deployments.cleanup-preview` cleanup until cancel, health check, redeploy, reattach, and rollback are rebuilt from specs. |
| [ADR-017: Default Access Domain And Proxy Routing](./ADR-017-default-access-domain-and-proxy-routing.md) | Accepted | Provider-neutral generated access domains, proxy routing, and per-deployment route realization. |
| [ADR-018: Resource Runtime Log Observation](./ADR-018-resource-runtime-log-observation.md) | Accepted | Application runtime logs are resource-owned observation through an injected runtime log reader port, not a Docker-specific deployment-log concern. |
| [ADR-019: Edge Proxy Provider And Observable Configuration](./ADR-019-edge-proxy-provider-and-observable-configuration.md) | Accepted | Provider-neutral edge proxy provider boundary and read-only proxy configuration visibility. |
| [ADR-020: Resource Health Observation](./ADR-020-resource-health-observation.md) | Accepted | Current resource health is a resource-owned observation from runtime, health policy, proxy, and access signals, not latest deployment status. |
| [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md) | Accepted | v1 deployment execution uses Docker/OCI images and containers behind provider-neutral resource/deployment contracts. |
| [ADR-022: Operator Terminal Session Boundary](./ADR-022-operator-terminal-session-boundary.md) | Accepted | Ephemeral server/resource terminal sessions use an explicit command and runtime port, with resource scope resolving deployment workspaces by deployment metadata. |
| [ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md) | Accepted | Deployment runtime target backends consume the Docker/OCI workload substrate behind provider-neutral deployment/resource contracts, enabling future Swarm or Kubernetes support without changing deployment admission. |
| [ADR-024: Pure CLI SSH State And Server-Applied Domains](./ADR-024-pure-cli-ssh-state-and-server-applied-domains.md) | Accepted | Pure CLI/GitHub Actions SSH deployments default to SSH-server PGlite state and may apply config domains as server-local proxy routes before hosted control-plane migration. |
| [ADR-025: Control-Plane Modes And Action Execution](./ADR-025-control-plane-modes-and-action-execution.md) | Accepted | Deployment execution owner and control-plane/state owner are separate dimensions; pure Action/CLI, Cloud-assisted Action, self-hosted API mode, and future control-plane runners share one mode-selection contract. |
| [ADR-026: Aggregate Mutation Command Boundary](./ADR-026-aggregate-mutation-command-boundary.md) | Accepted | Forbids generic aggregate-root update operations and requires intention-revealing domain commands for every aggregate mutation. |
| [ADR-027: Deployment Supersede And Execution Fencing](./ADR-027-deployment-supersede-and-execution-fencing.md) | Accepted | Later deployment requests may supersede one previous same-resource active attempt through internal cancellation plus durable write fencing without reintroducing a public cancel command. |

## Authoring Rules

Decision records must:

- state a final decision in the `Decision` section;
- avoid restating full command/event/error specs;
- link to the specs they govern;
- describe implementation requirements that follow from the decision;
- avoid leaving unresolved options in the main body.

If a decision cannot be made, write the ADR with `Status: Proposed` or `Status: Deferred`, list the candidate options, name the recommended default, and identify the exact human choice required before implementation proceeds.
