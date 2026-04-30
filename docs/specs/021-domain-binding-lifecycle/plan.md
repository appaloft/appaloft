# Plan: Domain Binding Show/Configure/Delete/Retry Lifecycle

## Governing Sources

- ADRs: ADR-002, ADR-005, ADR-006, ADR-017, ADR-019, ADR-026, ADR-030
- Global contracts: error model, neverthrow conventions, async lifecycle and acceptance
- Local specs: `domain-bindings.create`, `domain-bindings.confirm-ownership`,
  Routing Domain TLS workflow, Route Intent/Status And Access Diagnostics
- Operation sources: `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`,
  `packages/application/src/operation-catalog.ts`
- Public docs: custom domain binding, ownership, generated routes, certificates, troubleshooting

## ADR Need Decision

No new ADR is required. ADR-002 already positions future domain binding route/remove commands
outside deployment admission, ADR-006 already defines verification retry attempt rules, ADR-026
forbids generic `domain-bindings.update`, and ADR-030 governs public docs/help closure.

This slice adds local operation specs and catalog entries under those accepted decisions.

## Architecture Approach

- Core: add aggregate methods for route configuration, verification retry, and safe delete status.
- Application: add explicit command/query messages, handlers, use cases/query services, and tokens.
- Read model: reuse `DomainBindingReadModel`, `CertificateReadModel`, `ResourceReadModel`, and
  route intent/status descriptors for readback.
- Persistence: keep records for audit and mark deleted bindings inactive; update the active-route
  unique index to exclude `deleted`.
- API/CLI: expose the same command/query input schemas through oRPC/HTTP and CLI.
- Web: continue consuming the generated oRPC client; UI affordance hardening can follow without
  inventing Web-only business behavior.
- Public docs/help: map all new user-visible operations to existing custom domain/ownership
  anchors plus updated lifecycle copy.

## Testing Strategy

Hermetic default tests:

- application use-case tests for route configuration, delete-check/delete, and verification retry;
- query-service test for show/readback composed from in-memory fakes;
- operation catalog/docs registry coverage;
- oRPC/OpenAPI route shape and CLI command wiring tests where existing harnesses cover command
  descriptions.

Opt-in smoke:

- live DNS lookup/recheck;
- real TLS/certificate provider checks;
- real Traefik route repair/readback;
- real SSH route application.

## Compatibility And Roadmap

- Roadmap target: Phase 6 / `0.8.0`.
- Version impact: additive public operations under `pre-1.0-policy`.
- Release note: domain binding lifecycle adds readback, route behavior configuration, guarded
  delete, and ownership verification retry. Certificate lifecycle remains separate.
