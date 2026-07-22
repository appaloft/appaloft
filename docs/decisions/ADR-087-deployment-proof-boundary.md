# ADR-087: Deployment Proof Boundary

Status: Accepted

Date: 2026-07-12

## Context

Deployment command acceptance, durable desired state, execution exit code, internal health, public
access, and current workload identity answer different questions. In particular an older workload
can remain healthy while a new image or configuration never became current. Existing
`deployments.show`, timeline, Resource health/access, and recovery readiness surfaces preserve the
facts but do not produce one machine-readable planned-versus-observed result.

## Decision

Release Orchestration publishes a read-only `deployments.proof` query with the versioned
`deployments.proof/v1` schema. The application service derives one verdict from:

- immutable planned Deployment snapshot facts and minimum planned effects;
- sanitized current runtime/artifact readback supplied through a provider-neutral adapter port;
- bounded timeline, health, access/route, and recovery-readiness evidence.

The verdict vocabulary is `verified`, `partially-verified`, `unverified`, `stale`, and `failed`.
Unavailable evidence is explicit and can never satisfy a required verification gate. Health or
access success alone can never produce `verified`.

Proof is computed on read. It is not a new aggregate, deployment mutation, domain event, billing
event, or second persistent source of truth. Runtime adapters translate Docker/Compose/Swarm/SSH or
future provider readback into sanitized evidence; they do not decide proof verdicts. Provider-native
payloads and raw environment values do not cross the port.

The public query schema is the published language for API, CLI JSON, generated SDK, generated MCP
tools, Web, and private Cloud consumers. Cloud may apply tenant/authz policy or produce summaries,
but must not redefine the proof model.

For an Appaloft-managed Caddy or Traefik serve route, the edge proxy stamps the response with the
deployment identity that owns the route. Deployment Proof probes the public route and compares that
provider-stamped identity with the planned Deployment. The observed container's label remains
workload evidence only: it cannot prove that the proxy actually served that container. For a current
redirect route, Deployment Proof instead performs a no-follow request and requires the exact governed
redirect status and normalized `Location`; following the redirect and proving the destination
workload cannot prove the source redirect route. Direct-port access does not claim managed-route
identity or redirect evidence.

## Consequences

- Runtime adapters need an observation capability or an explicit unavailable result.
- Managed edge-proxy providers must render the shared deployment identity response marker, and a
  missing or mismatched marker cannot produce `verified`.
- Current managed redirect routes must expose exact status and destination observations; a missing or
  mismatched `Location` cannot produce `verified`.
- Stable artifact/workload/configuration identity is now part of the adapter evidence contract but
  remains outside Deployment command input and aggregate invariants.
- Deployment Detail gains a multi-dimensional Proof section rather than a success badge.
- GitHub feedback and AI tools may call a deployment successful only when shared proof policy allows
  it; they may not infer success from logs or HTTP 200.
- The additive query/DTO is a backward-compatible public minor capability.

## Deferred

- Cryptographic signing, durable proof retention, audit attestations, and Enterprise policy.
- Stateful data rollback proof.
- Provider-specific evidence not supported by a stable neutral identity translation.

## Governed Sources

- `docs/specs/103-deployment-proof/`
- `docs/queries/deployments.proof.md`
- `docs/workflows/deployment-proof.md`
- `docs/errors/deployments.proof.md`
- `docs/testing/deployment-proof-test-matrix.md`
- ADR-021, ADR-023, ADR-034, and ADR-084.
