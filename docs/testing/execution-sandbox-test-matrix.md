# Execution Sandbox Test Matrix

## Normative Contract

The `SBX-*` suite proves that external applications can safely create and operate provider-neutral
Execution Sandboxes through Appaloft without host access, secret leakage, tenant crossover or false
isolation claims.

## Global References

- [ADR-091](../decisions/ADR-091-execution-sandbox-boundary.md)
- [Execution Sandbox Platform](../specs/108-execution-sandbox-platform/spec.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)

## Matrix

| Test ID | Layer | Scenario | Expected result | Automated binding | Status |
| --- | --- | --- | --- | --- | --- |
| SBX-DOM-001 | core unit | Identity, limits, expiry and isolation | Invalid primitives fail with structured errors. | `packages/core/test/execution-sandbox.test.ts` | passed |
| SBX-DOM-002 | core unit | Lifecycle state machine | Only valid transitions succeed and safe events are recorded. | same | passed |
| SBX-DOM-003 | core unit | Template override policy | Callers cannot weaken template isolation, limits or network defaults. | `packages/core/test/execution-sandbox-template.test.ts` | passed |
| SBX-DOM-004 | core unit | Snapshot capability and retention | Snapshot lifecycle remains independent of the source Sandbox. | `packages/core/test/execution-sandbox-snapshot.test.ts` | passed |
| SBX-CMD-001 | application integration | Accepted create | Intent persists before provider mutation; external create closes first reconciliation; providers receive the opaque tenant owner scope and the authorized organization id when one exists. | `packages/application/test/execution-sandbox-operations.test.ts` | passed |
| SBX-CMD-002 | application integration | Provider mismatch | Provider is not called when isolation or capability cannot be met. | same | passed |
| SBX-CMD-003 | application integration | Pause/resume/terminate/expire | Valid transitions dispatch idempotent provider work and terminal access is denied. | same | passed |
| SBX-CMD-004 | application/provider | Bounded foreground exec | Ordered stdout/stderr and one terminal/error frame preserve argv/cwd/stdin/timeout/output limits. | `packages/adapters/runtime/test/docker-sandbox-provider.test.ts` | passed |
| SBX-CMD-005 | application/provider | Background process lifecycle | Start/list/show/terminate use safe ids; live attach/events are not claimed. | application + hermetic provider tests | passed |
| SBX-FILE-001 | application/provider | Binary file CRUD | Bytes round-trip without text coercion. | application, provider and SDK tests | passed |
| SBX-FILE-002 | security contract | Traversal and symlink escape | Each attempt fails closed before accessing host state. | runtime provider tests | passed |
| SBX-PORT-001 | application/provider | Expose/list/revoke | Safe descriptor returns and raw host address remains private. | application/provider plus Cloud gateway tests | passed |
| SBX-NET-001 | core/application | Default deny and policy validation | Policy normalizes; unsupported allowlist fails before mutation. | core/application/provider tests | passed |
| SBX-SECRET-001 | security integration + running-server e2e | Destination-bound credential grant | Grant/list/revoke and brokered request accept only secret refs; plaintext never enters Sandbox state/output/error/audit/snapshot and destination mismatch fails before outbound I/O. | `packages/application/test/execution-sandbox-credential-grants.test.ts`; PG repository and SDK running-server suites; Cloud broker adversarial test | passed |
| SBX-SNAPSHOT-001 | application/provider | Capture and restore | Restore creates a new Sandbox and preserves declared workspace state only. | application/provider/SDK tests + Docker smoke | passed |
| SBX-RECONCILE-001 | application/provider + persistence | Restart/orphan reconciliation | Tenant-scoped provider inventory receives the opaque tenant owner scope plus the authorized organization id, is compared with persisted handles, and removes only an unmatched runtime with matching `ownerScope`, Sandbox id and provider handle. | `packages/application/test/execution-sandbox-reconciliation.test.ts`; Docker provider and PG repository tests | passed |
| SBX-MAINTENANCE-001 | application/server + persistence | Automatic fleet maintenance | The worker starts a system-only bounded tenant scan, expires/reconciles persisted Sandboxes and removes only exact provider-owned orphans. | application reconciliation, PG tenant enumeration and server runner tests | passed |
| SBX-PG-001 | PGlite integration | Aggregate/attempt round trip | Desired state/provider handle/attempts round-trip without output payloads. | `packages/persistence/pg/test/execution-sandbox-repository.test.ts` | passed |
| SBX-PG-002 | PGlite integration | Tenant isolation | Cross-tenant show/list returns not found/empty and lists remain bounded. | same | passed |
| SBX-RUNTIME-001 | runtime contract | Hermetic provider | Lifecycle/process/file/port/snapshot contracts pass deterministically. | `packages/adapters/runtime/test/execution-sandbox-provider.test.ts` | passed |
| SBX-RUNTIME-002 | runtime adapter | Docker rendering/cleanup | Structured argv, labels, limits, network and exact cleanup avoid shell interpolation. | `packages/adapters/runtime/test/docker-sandbox-provider.test.ts` | passed |
| SBX-RUNTIME-003 | runtime smoke | Docker closed loop | Create/exec/files/process/snapshot/restore/terminate and exact cleanup pass. | `scripts/smoke/execution-sandbox-docker.ts` | passed locally |
| SBX-RUNTIME-004 | runtime smoke | gVisor truth | Missing `runsc` reports unsupported and never falls back. | same | passed (unsupported evidence locally) |
| SBX-API-001 | HTTP/oRPC contract | Catalog route parity | Sandbox routes dispatch shared schemas with tenant/auth policy. | `packages/orpc/test/execution-sandbox.http.test.ts` | passed |
| SBX-STREAM-001 | persistence/HTTP/SDK contract | Lifecycle and process event stream | Bounded cursor replay followed by cancellable SSE live follow preserves ordering, reports cursor gaps and emits one process terminal frame. | `packages/persistence/pg/test/execution-sandbox-event-store.test.ts`; `packages/orpc/test/execution-sandbox-stream.http.test.ts`; SDK running-server stream suite | passed |
| SBX-SDK-001 | running-server e2e | External TypeScript application | SDK completes template/create/exec/files/snapshot/restore/terminate/delete. | `packages/sdk/test/execution-sandbox-running-server.test.ts` | passed |
| SBX-CLI-001 | CLI integration | Operator commands | CLI maps lifecycle/exec/file and `sandbox terminal` to shared operation messages and prints safe output. | `packages/adapters/cli/test/execution-sandbox-command.test.ts` | passed |
| TERM-SESSION-SANDBOX-001 | application/runtime/provider integration | Interactive Sandbox terminal | A ready tenant-scoped Sandbox provider exposes `openTerminal`. | Command, gateway and provider open a confined PTY with resize and no host credential disclosure. | passed |
| SBX-MCP-001 | generated contract | MCP parity | All 31 Sandbox operations generate from the catalog, including event-stream and credential-broker descriptors. | `packages/ai/mcp/test/execution-sandbox-tools.test.ts` | passed |
| SBX-DOCS-001 | public docs | Reference/security coverage | Docs cover SDK auth, isolation truth, network safety, lifecycle and cleanup. | docs and spec review | passed |

## Required Runtime Evidence

- `SBX-RUNTIME-003` may run only against a local test-owned Docker host and must clean up exact
  handles and test-owned images.
- `SBX-RUNTIME-004` never silently falls back to ordinary Docker. A missing `runsc` produces
  truthful unsupported evidence.
- Kata, microVM and Kubernetes Agent Sandbox providers require their own future runtime rows before
  those capability claims become active.
- Interactive bidirectional terminal attach is an optional provider extension. Current Docker
  Sandbox providers expose a confined Bun PTY through the shared terminal-session transport;
  providers without `openTerminal` fail closed without weakening command/file/process APIs.
