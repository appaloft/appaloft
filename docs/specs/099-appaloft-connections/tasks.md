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
- [x] APP-CONN-004/APP-CONN-015: add domain-binding DNS apply-plan and contextual Web flow tests.
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
- [x] APP-CONN-018: document that category names are not connector keys.
- [x] APP-CONN-019: add domain binding DNS readiness tests for no connected zone, longest authorized zone match, and active hostname/path conflict.
- [x] APP-CONN-019: add HTTP/oRPC route test for DNS readiness inspection.
- [x] APP-CONN-019: add Cloudflare real-adapter zone listing test so provider ownership checks do not depend on frontend zone guessing.
- [x] APP-CONN-020: add authorization-attempt tests for provider start, callback completion, redacted secret-ref readback, and replay denial.
- [x] APP-CONN-020: add authorization-attempt store state lookup for provider browser callbacks.
- [x] APP-CONN-020: add authorization-attempt tests for callback state lookup, expiry, replay, tenant scope, and cancel/error diagnostics.
- [ ] APP-CONN-020: deferred-gap - add manual-secret fallback lifecycle tests when a product surface accepts one-time provider token material through a credential-store port.
- [x] APP-CONN-020: add credential-store contract tests proving callback writes secret material through a port and read models only expose redacted references.
- [x] APP-CONN-021: add Web source tests for connect-from-hostname, Cloudflare-branded connect action, callback return binding id, and readiness rerun trigger.
- [ ] APP-CONN-021: deferred-gap - add end-to-end domain-binding product-flow tests for provider callback, zone discovery, hostname rematch, plan, accept, and apply in one browser/API scenario; current coverage is split across application, Cloud HTTP callback, Web source, and WebView tests.

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
- [x] Add resource domain binding DNS connector dialog that plans records from `domainBindings.dnsPlan`, accepts the plan, and applies it through `connections.capability.apply`.
- [x] Add provider-neutral DNS zone listing to connector adapters and fake providers.
- [x] Add `domain-bindings.dns-readiness.inspect` to inspect owner-scoped DNS zone authorization, route conflicts, and plan readiness before apply.
- [x] Update resource domain binding DNS connector dialog to call `domainBindings.inspectDnsReadiness` and remove client-side zone inference/manual zone input.
- [x] Add public docs page for neutral connection language and category/concrete connector naming.
- [x] Add provider-neutral authorization attempt snapshot/store contract and in-memory test store.
- [x] Add connector authorization adapter port for provider start and callback exchange.
- [x] Add connector credential store port that persists provider secret material and returns only secret refs.
- [x] Update `connections.connect.start` to create an attempt and call the authorization adapter when the connector requires provider authorization.
- [x] Update `connections.connect.callback` to validate pending attempt status, exchange provider payload through the authorization adapter, apply returned secret-ref readback, and connect the owner-scoped `Connection`.
- [x] Update `connections.connect.callback` to support adapter-written credential refs and safe provider resource readback.
- [x] Update DNS readiness/connect flow so a hostname without a matching zone can start provider authorization and then re-run readiness after callback on the resource domain-binding page.

## Verification

- [x] Run relevant unit/contract tests.
- [x] Run CLI operation tests.
- [x] Run HTTP/oRPC route tests.
- [x] Run source scan for raw provider secrets in production sources.
- [x] Run `git diff --check`.
- [x] Run authorization lifecycle unit/contract tests.
- [x] Run domain-binding connect-from-hostname UI/source tests.
- [ ] deferred-gap: run domain-binding connect-from-hostname HTTP/browser E2E tests after the composed Cloud Console E2E harness can drive provider callback and domain-binding mocks in one scenario.
