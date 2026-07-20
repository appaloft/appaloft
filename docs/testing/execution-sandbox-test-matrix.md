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

| Test ID | Layer | Scenario | Expected result | Planned automated binding | Status |
| --- | --- | --- | --- | --- | --- |
| SBX-DOM-001 | core unit | Sandbox identity, limits, expiry and isolation value objects | Invalid primitives fail with structured errors; comparison/predicates preserve units and meaning. | `packages/core/test/execution-sandbox.test.ts` | planned |
| SBX-DOM-002 | core unit | Lifecycle state machine | Only accepted requested/provisioning/ready/paused/failed/terminating/terminated/expired transitions succeed. | `packages/core/test/execution-sandbox.test.ts` | planned |
| SBX-DOM-003 | core unit | Template override policy | Callers cannot weaken immutable isolation, limits, workspace or network defaults. | `packages/core/test/execution-sandbox-template.test.ts` | planned |
| SBX-DOM-004 | core unit | Snapshot capability and retention | Filesystem/memory capability truth and expiry/delete transitions remain independent of source Sandbox. | `packages/core/test/execution-sandbox-snapshot.test.ts` | planned |
| SBX-CMD-001 | application integration | Create accepted | A persisted requested/provisioning descriptor and attempt id return before provider terminal outcome. | `packages/application/test/execution-sandbox-operations.test.ts` | planned |
| SBX-CMD-002 | application integration | Provider capability mismatch | Provider is not called and `sandbox_isolation_unsupported` identifies requested/available levels safely. | same | planned |
| SBX-CMD-003 | application integration | Pause/resume/terminate/expire | Valid transitions dispatch idempotent provider work; terminal states reject further runtime access. | same | planned |
| SBX-CMD-004 | application integration | Foreground exec stream | Ordered stdout/stderr and one terminal frame preserve argv/cwd/timeout and cancellation semantics. | `packages/application/test/execution-sandbox-streams.test.ts` | planned |
| SBX-CMD-005 | application integration | Background process lifecycle | Start/list/show/events/terminate use safe process ids and bounded readback. | same | planned |
| SBX-FILE-001 | application/provider contract | Binary file CRUD below workspace | Bytes round-trip without text coercion. | `packages/application/test/execution-sandbox-files.test.ts` | planned |
| SBX-FILE-002 | security contract | Traversal, absolute host path and symlink escape | Each attempt fails closed before accessing provider host state. | same | planned |
| SBX-PORT-001 | application/provider contract | Expose/list/revoke | Safe signed/authenticated descriptor returns; raw provider/host address does not. | `packages/application/test/execution-sandbox-ports.test.ts` | planned |
| SBX-NET-001 | core/application | Default deny and allowlist validation | Empty policy denies egress; CIDR/domain/port rules normalize and conflicting rules fail. | `packages/core/test/execution-sandbox-network-policy.test.ts` | planned |
| SBX-SECRET-001 | security integration | Destination-bound credential grant | Only secret refs cross application boundaries; output, errors, audit, snapshots and read models contain no plaintext. | `packages/application/test/execution-sandbox-credential-grants.test.ts` | planned |
| SBX-SNAPSHOT-001 | application/provider contract | Capture and create from snapshot | Pause/resume keeps identity; snapshot restore creates a new Sandbox and preserves declared state only. | `packages/application/test/execution-sandbox-snapshots.test.ts` | planned |
| SBX-RECONCILE-001 | application/provider contract | Restart/orphan reconciliation | Duplicate attempts are idempotent and cleanup targets only the exact Appaloft ownership handle. | `packages/application/test/execution-sandbox-reconciliation.test.ts` | planned |
| SBX-PG-001 | PGlite integration | Aggregate and attempt round trip | Desired state/provider handle/attempts round-trip with no secrets or output payloads. | `packages/persistence/pg/test/execution-sandbox-repository.test.ts` | planned |
| SBX-PG-002 | PGlite integration | Tenant isolation and bounded lists | Cross-tenant show/list returns not found/empty and omitted limits remain bounded. | same | planned |
| SBX-RUNTIME-001 | runtime contract | Hermetic provider capability suite | All lifecycle/process/file/port/snapshot contracts pass deterministically. | `packages/adapters/runtime/test/execution-sandbox-provider.test.ts` | planned |
| SBX-RUNTIME-002 | runtime adapter | Docker container-trusted rendering/cleanup | Structured argv/Ash commands, labels, limits, network and exact cleanup are rendered without shell injection. | `packages/adapters/runtime/test/docker-execution-sandbox.test.ts` | planned |
| SBX-RUNTIME-003 | runtime smoke | Docker container-trusted closed loop | Create, exec, binary file, background process, port, terminate and orphan check pass locally. | `scripts/smoke/execution-sandbox-docker.ts` | planned |
| SBX-RUNTIME-004 | runtime smoke | gVisor capability truth | `runsc` executes the closed loop when present; otherwise provider reports unsupported and never claims gVisor. | `scripts/smoke/execution-sandbox-gvisor.ts` | planned |
| SBX-API-001 | HTTP/oRPC contract | Catalog route parity | Every Sandbox operation dispatches the shared command/query schema with tenant/auth policy. | `packages/orpc/test/execution-sandboxes.http.test.ts` | planned |
| SBX-STREAM-001 | HTTP/SDK contract | Process/event streaming | SSE/WebSocket framing is bounded, cancellable and exposes one typed terminal frame. | same plus `packages/sdk/test/execution-sandbox-stream.test.ts` | planned |
| SBX-SDK-001 | running-server e2e | External TypeScript application | Generated SDK creates/shows/executes/files/exposes/snapshots/terminates without SDK-only behavior. | `packages/sdk/test/execution-sandbox-running-server.test.ts` | planned |
| SBX-CLI-001 | CLI integration | Operator lifecycle and JSON | CLI maps to the same operations and prints safe structured output. | `packages/adapters/cli/test/execution-sandbox-command.test.ts` | planned |
| SBX-MCP-001 | generated contract | MCP parity | Bounded Sandbox operations generate tools/resources from the catalog; unbounded binary/stream output is not embedded. | `packages/ai-mcp/test/execution-sandbox-tools.test.ts` | planned |
| SBX-DOCS-001 | public docs | Task/reference/security coverage | Stable help anchors cover SDK auth, isolation truth, network/credential safety, lifecycle and cleanup. | `apps/docs/src/content/docs/execution-sandboxes` plus docs registry test | planned |

## Required Runtime Evidence

- `SBX-RUNTIME-003` may run only against a local test-owned Docker host and must clean up by exact
  ownership labels/manifest.
- `SBX-RUNTIME-004` is not allowed to silently fall back to ordinary Docker. A missing `runsc`
  produces truthful unsupported evidence.
- Kata, microVM and Kubernetes Agent Sandbox providers require their own future runtime rows before
  those capability claims become active.
