# Plan: Certificate Route Activation Reconciliation

## Governing Sources

- ADR-002, ADR-007, ADR-009, ADR-019, ADR-026, and ADR-104.
- `docs/workflows/routing-domain-and-tls.md`.
- `docs/events/certificate-issued.md` and `docs/events/certificate-imported.md`.
- `docs/testing/routing-domain-and-tls-test-matrix.md`.
- `docs/testing/edge-proxy-provider-and-route-configuration-test-matrix.md`.

## Architecture Approach

1. Add the intention-revealing `domain-bindings.configure-certificate-policy` command and aggregate
   transition. The transition records selected policy and a non-ready reconciliation requirement;
   it does not import, issue, reload, or mark ready as a hidden side effect.
2. Extend provider-neutral route intent with an explicit certificate source/identity selection for
   durable domain routes. A durable TLS route without a selected certificate is explicitly pending
   and cannot fall back to provider-local automation. Keep provider-local TLS an explicit, separate
   route policy for server-applied routes.
3. Add a request-scoped certificate materialization port that resolves opaque active certificate
   references only inside the runtime/provider activation adapter.
4. Add certificate route activation and TLS observation ports. The application reconciliation
   handler first resolves the authoritative current binding plus latest serving
   deployment/service/port and prior activation identity, then coordinates candidate apply,
   provider reload, and direct hostname/SNI proof.
5. Publish `domain-ready` only after proof matches the selected certificate fingerprint and validity
   requirements. Record safe failure state without certificate material.
6. Implement Traefik and Caddy binding-scoped, stable-path dynamic certificate configuration. Do not emit Traefik
   `certresolver` or Caddy provider-local automation for durable Appaloft-managed/imported routes.
7. Use candidate-first/atomic material replacement so a failed apply, reload, or proof leaves the
   previous serving configuration available. Certificate activation must not inspect, reconstruct,
   replace, stop, or rename the serving workload container.
8. Serialize reconciliation per domain binding and re-read authoritative binding/certificate state
   inside the coordination boundary before any runtime mutation.

## CQRS, Events, And Observation

- The configure operation is a command; status remains visible through existing domain binding,
  resource access, proxy configuration, certificate, diagnostics, and operator-work read surfaces.
- `certificate-issued` and `certificate-imported` remain stored-material facts. Their consumer
  requests reconciliation instead of directly deciding readiness.
- Duplicate event delivery is idempotent by binding plus certificate fingerprint/attempt identity;
  delayed events are rejected when policy, source, or active certificate lifecycle no longer match.
- If a new durable reconciliation event is added, specify producer, retry, dedupe, and read-model
  effects before implementation.

## Persistence And Secrets

- Persist only safe selected/proven fingerprint, activation status, attempt identity, timestamps,
  and failure codes needed for readback.
- Raw PEM/private key/passphrase remain in certificate secret storage and short-lived runtime
  materialization. They never enter aggregate event payloads, durable process details, logs, or argv.
- Add migrations only if existing aggregate/process state cannot represent the reconciliation
  status; any migration must be PostgreSQL/PGlite covered.

## Roadmap And Compatibility

- Roadmap target: post-1.0 routing/domain/TLS correctness hardening.
- Version target: next minor because a new public operation is added.
- Compatibility: additive command/API/SDK/MCP/Web capability plus stricter readiness truth.

## Testing Strategy

- Command/event workflow: `ROUTE-TLS-CMD-032..034`, `ROUTE-TLS-EVT-017..020`.
- Proxy activation: `EDGE-PROXY-RELOAD-004A..004D`.
- Provider contracts: existing Traefik/Caddy packages plus no-provider-local-automation assertions.
- Integration: fake materializer/activator/observer with event ordering and fail-safe retention.
- Opt-in e2e: real Docker Traefik and Caddy, hostname/SNI, independent expected fingerprint.
- Entry parity: CLI, HTTP/oRPC, operation catalog, generated SDK/MCP, and Web affordance.

## Docs Outcome

Existing anchor: `/docs/access/certificates/#certificate-readiness` and its English locale. Update
the docs registry/traceability and all reachable help surfaces in the Code/Docs Round.

## Risks And Migration Gaps

- Existing ready bindings may have no durable served-certificate proof. Migration must represent
  them as unknown/pending reconciliation rather than fabricate proof.
- Real remote SSH activation needs exact target selection and secret-safe stdin/file transfer.
- Swarm certificate distribution/rotation requires its runtime-target implementation before that
  target can advertise the certificate-activation capability.
