# Tasks: Appaloft Connections

## Source Of Truth

- [x] APP-CONN-001: add public neutral spec.
- [x] APP-CONN-001: add public neutral plan.
- [x] APP-CONN-001: add public neutral task matrix.
- [ ] Update external edge/DNS spec to reference future connection ids after operation design is accepted.
- [ ] Update SSH onboarding provider spec to reference future infrastructure connections after operation design is accepted.

## Test-First

- [x] APP-CONN-001: add neutral catalog vocabulary test.
- [x] APP-CONN-002: add category support-state test.
- [ ] APP-CONN-003: add fake Domain Connect temporary flow test.
- [x] APP-CONN-004: add persistent DNS accepted-record plan test.
- [x] APP-CONN-005: add DNS conflict fail-closed plan test.
- [x] APP-CONN-006: add identity/source separation test.
- [x] APP-CONN-007: add GitHub App installation to source connection test.
- [ ] APP-CONN-008: add provider app token expiry/redaction test.
- [x] APP-CONN-009: add infrastructure target proposal test.
- [x] APP-CONN-010: add high-cost proposal explicit-acceptance test.
- [ ] APP-CONN-010: add durable accepted-plan mutation test.
- [x] APP-CONN-011: add notification adapter redaction test.
- [x] APP-CONN-012: add no billing ledger mutation test.
- [x] APP-CONN-013: add tool/operation no-secret exposure test.
- [x] APP-CONN-014: add CLI/HTTP operation parity tests.
- [ ] APP-CONN-015: add Web flow test after UI scope is accepted.
- [x] APP-CONN-016: add fake DNS provider adapter contract tests.

## Implementation

- [x] Add neutral connection model and value objects.
- [x] Add connector catalog and connection query/read model.
- [x] Add connection instance start/list/show/callback/revoke/status lifecycle operations.
- [x] Add operation catalog entries.
- [x] Add application ports for provider adapters.
- [x] Add fake DNS provider adapter before real providers.
- [x] Add fake infrastructure provider adapter before real providers.
- [x] Add fake notification provider adapter before real providers.
- [x] Add GitHub App source connection projection/compatibility.
- [x] Add persistent DNS provider plan contract.
- [x] Add persistent DNS apply/verify/cleanup provider contracts.
- [ ] Add DNS temporary setup provider contract.
- [x] Add CLI and HTTP surfaces for catalog, connection lifecycle, DNS planning, DNS apply/verify/cleanup, and infrastructure proposal planning.
- [ ] Add Web central/contextual surfaces.

## Verification

- [x] Run relevant unit/contract tests.
- [x] Run CLI operation tests.
- [x] Run HTTP/oRPC route tests.
- [x] Run source scan for raw provider secrets in production sources.
- [x] Run `git diff --check`.
