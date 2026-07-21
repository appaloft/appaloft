# ADR-092: Sandbox Agent Runtime And Application Promotion Boundary

Status: Accepted

Date: 2026-07-20

## Context

ADR-091 gives callers an addressable Execution Sandbox, but it intentionally does not own an agent
loop, immutable application source delivery, or the transition from a live workspace to a durable
Resource and Deployment. Applications that embed coding agents otherwise have to invent runtime
identity, run history, approval recovery, artifact capture and deployment correlation around the
Sandbox API.

Pi, Codex, Claude Code and other harnesses have vendor-specific session, event and approval models.
Those models must not replace Appaloft's public language. A live Sandbox workspace and a Sandbox
Snapshot are also not durable application source: they can change, expire, or capture runtime state
that must never become deployment input.

## Decision

1. Add `Sandbox Agent Runtime` as a public, harness-neutral aggregate root. It is addressable by
   `runtimeId` but references and is lifecycle-subordinate to exactly one Sandbox. Sandbox
   termination terminates its runtimes; a runtime never outlives or migrates away from its Sandbox.
2. Add `Sandbox Agent Run` as a separate aggregate root containing one submitted task's lifecycle,
   context lineage, bounded redacted events, usage and terminal outcome. A Runtime atomically owns
   the active Run claim and admits at most one active Run at a time.
3. The calling application owns end-user conversation, prompt history and long-term session state.
   Appaloft stores no hidden model reasoning. A Run explicitly uses `fresh` or
   `continue(parentRunId)` context.
4. Agent harnesses implement `AgentHarnessPort`. Vendor types, sessions, errors and event payloads
   are translated in adapters. Pi is the first adapter, not a public aggregate or endpoint family.
5. Managed harness execution uses immutable `AgentHarnessTemplate` identity and admitted Skill
   Bundle digests. Arbitrary harness bootstrap or approval-bypassing extensions are not part of the
   managed contract.
6. Confined file/process/install/test/build/development-server work may execute within the existing
   Sandbox policy. Network expansion, credential grants, public port exposure, external-write tools
   and promotion require durable control-plane approval. A harness cannot approve itself.
7. Real secrets never enter the Sandbox, harness environment, files, events or snapshots. Model and
   tool credentials use the destination-bound broker from ADR-091; unavailable brokerage fails
   closed.
8. Add immutable, content-addressed `Source Artifact` as an aggregate root. It owns digest,
   manifest, source root, size, provenance, retention and an opaque `ArtifactStore` reference.
   Capturing rejects secrets, device/socket entries, unsafe links and paths outside the source root.
9. A `Promotion Candidate Preview` is materialized from the exact Source Artifact digest. A live
   development preview is never approval evidence.
10. Add `Sandbox Promotion` as an aggregate root and durable application workflow. `plan` freezes a
    Source Artifact and target intent; `accept` requires an unexpired plan, expected digest and an
    external actor with publish authority. The harness and runtime cannot accept.
11. The first Promotion target creates one new Resource with a `zip-artifact` source binding and
    creates its first Deployment attempt. Updating an existing Resource source is a separate future
    behavior.
12. Acceptance is idempotent and asynchronous. Partial results are retained. Retry creates a new
    Deployment attempt from the same artifact rather than creating another Resource.
13. Promotion is complete only when the associated `deployments.proof` verdict is `verified`.
    Weaker evidence yields `needs-attention`; provider or deployment failure yields `failed`.
14. Public HTTP/oRPC, generated TypeScript SDK and CLI expose the complete contract. Web is
    readback/diagnostics first. MCP reuses the operation catalog but cannot grant capabilities or
    accept Promotion from a Sandbox-scoped identity.

## Context Relationships

- Execution Sandbox is upstream and owns Sandbox availability and confined execution.
- Sandbox Agent Runtime is a customer of Execution Sandbox and protects its language with a
  harness anticorruption layer.
- Workload Delivery owns Resource and source binding; Release Orchestration owns Deployment and
  proof. Sandbox Promotion is an application process crossing those contexts through their public
  commands and queries.
- Source Artifact publishes an opaque ArtifactStore contract. Stores and preview gateways are
  downstream adapters.

## Consequences

- `sandboxes.create` remains the parent creation operation; callers use
  `sandbox.agentRuntimes.create(...)` in SDK ergonomics without creating a top-level independent
  Agent identity.
- Runtime, Run, artifact and Promotion persistence must be tenant-scoped and durable.
- A provider can support Sandbox execution without supporting a managed agent harness, artifact
  capture or candidate preview. Capabilities remain truthful and independently admitted.
- Application delivery is observable from artifact provenance through approval, Deployment and
  proof, without turning Domain Events into billing events.

## Rejected Alternatives

- Top-level long-lived `Agent` independent of Sandbox: conflicts with calling-application session
  ownership and deletion semantics.
- Pi-specific public API: leaks a replaceable harness model.
- Deploy the live workspace or Sandbox Snapshot: cannot bind approval to immutable source.
- Let the in-Sandbox agent call Promotion acceptance: collapses the approval trust boundary.
- Treat Resource creation or provider success as completed Promotion: lacks production proof.

## Migration Gaps

- Existing Sandbox operations remain compatible; all new operations are additive.
- Existing `zip-artifact` deployment materialization is reused, but Source Artifact capture and
  ArtifactStore retrieval require a neutral adapter contract and persistence.
- Existing Web console has no generic chat surface; this ADR does not add one.
