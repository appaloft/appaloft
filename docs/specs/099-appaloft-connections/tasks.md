# Tasks: Appaloft Connections

## Source Of Truth

- [x] APP-CONN-001: add public neutral spec.
- [x] APP-CONN-001: add public neutral plan.
- [x] APP-CONN-001: add public neutral task matrix.
- [x] Update external edge/DNS spec to reuse Connections lifecycle/capability operations after
  operation design is accepted.
- [x] Update SSH onboarding provider spec to reference infrastructure connections after operation
  design is accepted.

## Test-First

- [x] APP-CONN-001: add neutral catalog vocabulary test.
- [x] APP-CONN-002: add category support-state test.
- [x] APP-CONN-003: add fake Domain Connect temporary flow test.
- [x] APP-CONN-004: add persistent DNS accepted-record plan test.
- [x] APP-CONN-005: add DNS conflict fail-closed plan test.
- [x] APP-CONN-006: add identity/source separation test.
- [x] APP-CONN-007: add GitHub App installation to source connection test.
- [x] APP-CONN-008: add provider app token expiry/redaction test.
- [x] APP-CONN-009: add infrastructure target proposal test.
- [x] APP-CONN-010: add high-cost proposal explicit-acceptance test.
- [x] APP-CONN-010: add durable accepted-plan mutation test.
- [x] APP-CONN-011: add notification adapter redaction test.
- [x] APP-CONN-012: add no billing ledger mutation test.
- [x] APP-CONN-013: add tool/operation no-secret exposure test.
- [x] APP-CONN-014: add CLI/HTTP operation parity tests.
- [x] APP-CONN-015: add Web extension metadata test after UI scope is accepted.
- [x] APP-CONN-016: add fake DNS provider adapter contract tests.
- [x] APP-CONN-017: add connection lifecycle tenant scope test.

## Implementation

- [x] Add neutral connection model and value objects.
- [x] Add connector catalog and connection query/read model.
- [x] Add connection instance start/list/show/callback/revoke/status lifecycle operations.
- [x] Add tenant-scoped connection lifecycle guard for multi-tenant execution contexts.
- [x] Add operation catalog entries.
- [x] Add application ports for provider adapters.
- [x] Add fake DNS provider adapter before real providers.
- [x] Add real Cloudflare DNS provider adapter with mocked HTTP contract tests.
- [x] Add fake source provider adapter for provider-app token lease redaction/expiry.
- [x] Add fake infrastructure provider adapter before real providers.
- [x] Add real Vultr infrastructure proposal adapter with mocked HTTP contract tests.
- [x] Add fake notification provider adapter before real providers.
- [x] Add real Slack notification webhook adapter with mocked HTTP contract tests.
- [x] Add GitHub App source connection projection/compatibility.
- [x] Add persistent DNS provider plan contract.
- [x] Add persistent DNS apply/verify/cleanup provider contracts.
- [x] Add DNS temporary setup provider contract.
- [x] Add CLI and HTTP surfaces for catalog, connection lifecycle, accepted capability plans, DNS planning, DNS apply/verify/cleanup, and infrastructure proposal planning.
- [x] Add Web central/contextual extension metadata for Connections console pages.

## Verification

- [x] Run relevant unit/contract tests.
- [x] Run CLI operation tests.
- [x] Run HTTP/oRPC route tests.
- [x] Run source scan for raw provider secrets in production sources.
- [x] Run `git diff --check`.
