# Plan: Deployment Proof

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md` Release Orchestration / Deployment.
- Decisions: ADR-012, ADR-020, ADR-021, ADR-023, ADR-034, ADR-084, ADR-087.
- Queries/workflows/errors: `docs/queries/deployments.proof.md`,
  `docs/workflows/deployment-proof.md`, `docs/errors/deployments.proof.md`.
- Test matrix: `docs/testing/deployment-proof-test-matrix.md`.

## Architecture Approach

- Add a mutation-free application query and one `deployments.proof/v1` published DTO.
- Add a provider-neutral runtime evidence port. Runtime adapters translate Docker/Compose/Swarm/SSH
  readback to safe artifact/workload/configuration facts or explicit unavailable reasons.
- Managed edge-proxy providers stamp served responses with the deployment identity. Runtime proof
  readback runs one canonical health-path probe per planned origin plus one identity probe for every
  current ready managed route absent from the immutable plan, then compares every response identity
  with the Deployment. It does not derive route ownership from the container label. The route probe
  uses direct TCP/TLS so an ambient control-plane HTTP proxy cannot intercept a local or private
  deployment check.
- Derive planned fingerprints/effects from the immutable Deployment snapshot. Compare on read in the
  application service; adapters never decide the verdict.
- Reuse deployment timeline, `resources.health`, access/route readback, and
  `deployments.recovery-readiness` through their application/read-model boundaries.
- Register the query once in the operation catalog so API, generated SDK, MCP descriptor, CLI help,
  and docs metadata share the operation identity.
- Render the same response in Deployment Detail. Cloud composes authorization/tenant policy around
  the public query and does not redefine the DTO.

## Persistence And Migration

- No new authoritative proof table or aggregate state.
- Existing sanitized execution metadata remains compatible. Adapters may add safe resolved identity
  metadata for future diagnostics, but proof must work from current readback and explicit gaps.
- Public compatibility impact is additive (`minor` under SemVer).

## Testing Strategy

- Stable IDs: `DEP-PROOF-*` in the dedicated matrix.
- Unit/application: verdict lattice, effect derivation, mismatch/action mapping, fingerprints,
  redaction, not-found/context scope.
- Adapter: local Docker, Compose, generic SSH, Docker Swarm, static artifact, unavailable readback,
  stale identity, managed-route identity match/mismatch, and missing route identity.
- Provider: Caddy and Traefik serving routes render the shared deployment identity response header;
  redirect-only routes remain outside workload route proof.
- Contract: contracts, operation catalog, HTTP/oRPC, CLI JSON, generated SDK, MCP descriptor.
- Web: detail rendering for verified/partial/failed/stale and unavailable evidence.
- Real smoke: v1 -> changed config/profile -> v2 verified, command-success/health-200 with stale
  workload identity that cannot become verified, and a real Traefik 200 response carrying an older
  deployment identity.

## Risks And Deferred Gaps

- Signed proof, durable retention, and Enterprise enforcement are deferred to a private Cloud spec.
- An adapter that cannot expose a stable current identity returns unavailable evidence; it does not
  fabricate a digest or generation.
- Full Change Effect planning remains separate; this slice derives only the minimum safe effect set
  required to detect an expected workload replacement that did not occur.
- Direct-port routes cannot carry a provider-stamped identity and continue to rely on workload and
  configured health evidence; the managed-route identity gate applies to Caddy/Traefik serve routes.
