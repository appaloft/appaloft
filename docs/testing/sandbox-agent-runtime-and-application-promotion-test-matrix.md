# Sandbox Agent Runtime And Application Promotion Test Matrix

## Contract

These rows prove the neutral Sandbox→Agent Run→Source Artifact→Promotion→Deployment proof chain.
Cloud tenancy, commercial policy and managed fleet behavior have dependent private rows.

| Test ID | Layer | Scenario | Expected result | Automated binding | Status |
| --- | --- | --- | --- | --- | --- |
| AGENT-CORE-001 | core unit | Runtime active Run claim | One active Run; busy rejection returns active id; terminal release is idempotent. | `packages/core/test/sandbox-agent-runtime.test.ts` | automated |
| AGENT-LINEAGE-002 | core/application | fresh/continue lineage | Continue accepts only a terminal parent from the same Runtime. | `packages/core/test/sandbox-agent-runtime.test.ts`; `packages/application/test/sandbox-agent-runtime.test.ts` | automated |
| AGENT-RUN-003 | application | submit, observe, cancel | Stable Run id, bounded redacted cursor events, one terminal state and idempotent cancel. | `packages/application/test/sandbox-agent-runtime.test.ts` | automated |
| AGENT-APPROVAL-004 | application/security | controlled capability approval | Exact run/capability/destination/expiry binding; only external identity resolves; expiry fails closed. | `packages/application/test/sandbox-agent-runtime.test.ts` | automated |
| AGENT-CREDENTIAL-005 | application/adapter | brokered model credential and task custody | Provider secret stays outside Sandbox; task plaintext is encrypted at rest and absent from persisted state. | `packages/adapters/runtime/test/pi-sandbox-agent-harness.test.ts`; `packages/persistence/pg/test/sandbox-agent-delivery-repository.test.ts`; dependent Cloud gateway tests | automated |
| AGENT-PI-006 | adapter contract | pinned Pi harness | Pi JSONL/events/errors translate to neutral contract; template digest/version and bounded tools are enforced. | `packages/adapters/runtime/test/pi-sandbox-agent-harness.test.ts` | automated |
| AGENT-PG-007 | persistence integration | tenant/runtime/run/events/approval | Tenant isolation, atomic active claim, idempotency, envelope custody and cursor events persist. | `packages/persistence/pg/test/sandbox-agent-delivery-repository.test.ts` | automated |
| AGENT-CONTRACT-008 | contract | operation parity | Catalog, HTTP/oRPC, generated SDK, CLI and catalog-derived MCP expose matching schemas/scopes. | `packages/sdk/test/generated-operations.test.ts`; `packages/sdk/test/sandbox-agent-delivery-running-server.test.ts`; `packages/adapters/cli/test/sandbox-agent-delivery-command.test.ts` | automated |
| ARTIFACT-CORE-001 | core unit | immutable manifest/digest | Ordered manifest produces stable digest and cannot be mutated. | `packages/core/test/source-artifact.test.ts` | automated |
| ARTIFACT-SAFETY-002 | application/adapter | safe source capture | Traversal, absolute path, unsafe link, socket/device and high-confidence secret match fail closed before store commit. | dependent Cloud artifact adapter tests | automated |
| ARTIFACT-STORE-003 | adapter contract | content-addressed store | Same digest is idempotent; delete respects references and exact provider ownership. | dependent Cloud artifact adapter tests | automated |
| ARTIFACT-PREVIEW-004 | application/adapter | candidate materialization | Preview materializes exact digest, reports verification/expiry and never reads live workspace. | `packages/application/test/sandbox-agent-runtime.test.ts`; dependent Cloud gateway tests | automated |
| ARTIFACT-PG-005 | persistence integration | artifact/preview/promotion isolation | Artifact, preview and accepted Promotion round-trip under tenant scope; other tenants cannot observe them. | `packages/persistence/pg/test/sandbox-agent-delivery-repository.test.ts` | automated |
| PROMOTION-PLAN-001 | core/application | immutable plan | Plan binds exact digest/target/expiry and rejects mismatched or expired candidates. | `packages/core/test/sandbox-promotion.test.ts`; `packages/application/test/sandbox-agent-runtime.test.ts` | automated |
| PROMOTION-ACCEPT-002 | application | external accept and idempotency | Runtime identity forbidden; one accept key creates one Resource and one initial Deployment. | `packages/application/test/sandbox-agent-runtime.test.ts` | automated |
| PROMOTION-RETRY-003 | application | partial failure retry | Existing Resource/artifact retained; retry creates a new Deployment attempt only. | `packages/application/test/sandbox-agent-runtime.test.ts` | automated |
| PROMOTION-PROOF-004 | application | proof completion | verified→completed; pending→verifying/retry; terminal deployment failure→failed. | `packages/application/test/sandbox-agent-runtime.test.ts` | automated |
| PROMOTION-PG-005 | persistence/application | durable workflow restart | Accepted intent/stage checkpoints persist; re-enqueue/retry does not duplicate Resource and creates a new Deployment only after failure. | PG repository test; `packages/application/test/sandbox-agent-runtime.test.ts` | automated |
| PROMOTION-E2E-006 | acceptance | complete application and running-server contract | Application proves durable fake-provider completion; external SDK proves every nested HTTP boundary. | `packages/application/test/sandbox-agent-runtime.test.ts`; `packages/sdk/test/sandbox-agent-delivery-running-server.test.ts` | automated |
| DELIVERY-CLAIM-001 | docs contract | maturity and proof language | README/docs label private-preview capabilities and define Delivery Evidence Chain without correctness claim. | docs typecheck/build and public narrative review | verified |
