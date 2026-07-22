# Plan: Sandbox Agent Runtime And Application Promotion

## Governing Sources

- [ADR-091](../../decisions/ADR-091-execution-sandbox-boundary.md)
- [ADR-092](../../decisions/ADR-092-sandbox-agent-runtime-and-application-promotion-boundary.md)
- [Domain Model](../../DOMAIN_MODEL.md)
- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Execution Sandbox workflow](../../workflows/execution-sandbox.md)
- [Sandbox Agent Runtime And Promotion test matrix](../../testing/sandbox-agent-runtime-and-application-promotion-test-matrix.md)

## Architecture Approach

- Add class-based Runtime, Run, SourceArtifact and SandboxPromotion aggregates/value objects under
  public core. Cross-aggregate references use ids.
- Runtime owns the one-active-Run claim; Run owns task lifecycle and redacted event sequence.
- Add application command/query messages and a single orchestration service with explicit ports:
  AgentHarnessRegistry, AgentCapabilityApprovalStore, SourceArtifactStore,
  PromotionCandidatePreviewProvider and PromotionTargetGateway.
- Pi adapter executes one pinned Pi RPC process through existing Sandbox process/file APIs. Pi
  session/vendor events are translated and appended incrementally to neutral Run events while the
  process remains active.
- Use tenant-scoped Postgres/PGlite tables for Runtime, Run/events/approvals, SourceArtifact and
  Promotion. Persist opaque handles and safe metadata only.
- Source Artifact capture reads the confined workspace through SandboxProvider, validates paths and
  entry types, writes a deterministic archive/manifest through ArtifactStore, and records SHA-256.
- PromotionTargetGateway composes existing `resources.create`, `deployments.create` and
  `deployments.proof` semantics; it does not mutate repositories directly.
- HTTP/oRPC, generated SDK, CLI and MCP metadata derive from the operation catalog. The generated
  stream operation is the transport source of truth; SDK resource handles may compose Run creation
  and follow without introducing another business operation.

## CQRS, Events And Consistency

- Commands change Runtime/Run/approval/artifact/Promotion state. Queries return bounded read models.
- Runtime/Run state is read-your-own-write. Harness execution and Promotion are durable async work.
- Run events are data-plane events with cursor and retention; bounded replay and cancellable live
  follow read the same persisted sequence. Operation audit remains control-plane governance and
  does not copy raw output.
- Domain facts publish only after persistence. Provider/harness progress is application/process
  event input and is redacted before storage.
- Idempotency identities: runtime create key; run submit key per runtime; approval request digest;
  Promotion accept key per plan.

## Persistence And Migration

- Add additive migrations after Execution Sandbox migrations.
- Every row includes tenant identity and indexed parent ids.
- Source Artifact manifest and Run event payloads are bounded JSON; archive bytes remain in the
  ArtifactStore.
- Accepted artifacts are reference-protected. Unaccepted artifacts and previews expire by exact id.

## Roadmap And Compatibility

- Roadmap: post-1.0 AI Application Delivery Platform.
- Version: additive minor public capability.
- Existing Sandbox, Resource and Deployment operations remain compatible.
- README/docs/SDK/OpenAPI/CLI/MCP snapshots update in the same public delivery.

## Testing Strategy

- Stable ids: `AGENT-*`, `ARTIFACT-*`, `PROMOTION-*`, `DELIVERY-CLAIM-*`.
- Core: lifecycle/value-object/invariant tests.
- Application: concurrency, idempotency, approvals, redaction, artifact safety and Promotion workflow.
- Persistence: tenant isolation, round-trip, event cursor and reference protection.
- Adapter: deterministic fake harness/artifact/preview plus Pi contract tests.
- Contract: catalog, HTTP/oRPC SSE cancellation/terminal close, SDK low-level stream and resource
  handles, CLI follow and MCP parity.
- Acceptance: Sandbox→Runtime→Run→Artifact→Candidate→Promotion→verified proof with fake providers;
  real Pi/Docker is opt-in and reports truthful capability.

## Risks And Migration Gaps

- Real managed Pi credentials require a broker that keeps plaintext outside Sandbox. Runtime create
  must fail closed when the selected model cannot use that boundary.
- Candidate preview and artifact storage providers may be unavailable in Community; capabilities
  must report unsupported instead of falling back to live workspace deployment.
- Public Website changes live in the dependent Cloud repository, while public README/docs remain in
  this repository.
