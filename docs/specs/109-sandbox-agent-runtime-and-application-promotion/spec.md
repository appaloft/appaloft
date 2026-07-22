# Sandbox Agent Runtime And Application Promotion

## Status

- Round: Spec Round complete; Test-First and Code Round authorized
- Artifact state: ready
- Roadmap target: post-1.0 AI Application Delivery Platform track
- Compatibility impact: additive public minor capability

## Business Outcome

An application developer can create a harness-neutral agent runtime inside an existing Sandbox,
submit and observe durable runs, approve controlled capabilities outside the Sandbox, freeze an
exact workspace result, preview that immutable candidate, and promote it into a new Resource whose
first Deployment is complete only after verified proof.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Sandbox Agent Runtime | Addressable managed harness instance subordinate to one Sandbox. | Agent execution | Managed Pi is an adapter label only. |
| Sandbox Agent Run | One durable task with explicit context lineage, lifecycle, events and usage. | Agent execution | Conversation/session are caller-owned. |
| Agent Harness | Replaceable agent-loop implementation behind a neutral port. | Adapter boundary | Pi/Codex/Claude Code are adapter names. |
| Agent Capability Approval | External, expiring authorization for one exact controlled request. | Control plane | Harness confirmation is not sufficient. |
| Source Artifact | Immutable content-addressed source manifest plus opaque store reference. | Application delivery | Sandbox Snapshot is not an alias. |
| Promotion Candidate Preview | Expiring preview materialized from one exact Source Artifact digest. | Application delivery | Development Preview is not approval evidence. |
| Sandbox Promotion | Plan/accept/workflow from Source Artifact to new Resource and Deployment proof. | Cross-context workflow | Environment Promotion is distinct. |
| Delivery Evidence Chain | Artifact, approval, deployment readback and proof evidence. | Public product claim | Not formal verification. |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AGENT-SPEC-001 | Create runtime | A ready Sandbox and admitted harness template exist | `sandboxes.agents.runtimes.create` is called | A tenant-scoped runtime is persisted under the Sandbox and returns stable runtime/harness/template identity. |
| AGENT-SPEC-002 | Submit run | A runtime has no active Run | `sandboxes.agents.runs.create` supplies fresh or valid parent lineage | One Run becomes active; duplicate idempotency returns the same Run and concurrent submission fails with current active run id. Task text is encrypted at rest and decrypted only at the harness boundary. |
| AGENT-SPEC-003 | Observe and cancel | A Run is accepted/running/waiting | bounded events are read, the event follow stream is opened, or cancellation is requested | Harness frames become observable while execution is active; events are bounded, redacted and cursor-replayable; reconnect resumes after the supplied sequence; the stream closes on terminal state or caller abort; cancel is idempotent and eventually terminal. |
| AGENT-SPEC-004 | Controlled capability | Harness requests network, credential, public port, external write or promotion | an external actor approves/rejects | Run waits durably; approval binds run/tool digest/capability/destination/expiry and the harness cannot self-approve. |
| AGENT-SPEC-005 | Credential custody | A Run needs model or tool credentials | the harness calls through its grant | The destination-bound broker injects outside Sandbox; plaintext never enters state, files, events, errors or snapshots. |
| ARTIFACT-SPEC-001 | Freeze source | No active Run exists and a safe source root is selected | `sandboxes.source-artifacts.create` executes | Files are captured into an immutable manifest/digest and safe provenance descriptor; unsafe entries and secret matches fail closed, while private storage references remain internal. |
| ARTIFACT-SPEC-002 | Candidate preview | A Source Artifact exists | `sandboxes.candidate-previews.create` executes | A clean environment materializes exactly that digest and returns an expiring, revocable controlled URL and verification state. |
| PROMOTION-SPEC-001 | Plan | A verified candidate and explicit new Resource target exist | `sandboxes.promotions.plan` executes | Plan binds artifact digest, target, warnings and expiry; an expired candidate is rejected. |
| PROMOTION-SPEC-002 | Accept | An authorized external actor supplies plan id, expected digest and idempotency key | `sandboxes.promotions.accept` executes | Accepted intent persists once and durable work creates one Resource, one source binding and first Deployment. |
| PROMOTION-SPEC-003 | Retry partial failure | Resource exists but Deployment failed or proof needs attention | retry is requested | The same Resource and artifact are reused; a new Deployment attempt is created and history retained. |
| PROMOTION-SPEC-004 | Verified completion | Deployment execution is observed | proof is queried | Only `verified` completes Promotion; pending proof remains `verifying` and is retried, while terminal failed proof marks the Promotion failed with an explicit retry action. |
| PROMOTION-SPEC-005 | Independent retention | Sandbox, plan, preview, artifact and Resource reach cleanup boundaries | maintenance runs | Cleanup follows exact ownership/reference rules and never deletes an accepted artifact or formal Resource implicitly. |

## Domain Ownership

- Bounded contexts: Sandbox Agent Runtime (new), Source Artifact (Workload Delivery shared language),
  and Sandbox Promotion (cross-context application process).
- Aggregate roots: SandboxAgentRuntime, SandboxAgentRun, SourceArtifact, SandboxPromotion.
- Upstream: Execution Sandbox, Workspace, identity/tenant context.
- Downstream: AgentHarness adapters, ArtifactStore, CandidatePreview provider, Resource commands,
  Deployment commands and DeploymentProof query.

## Public Surfaces

- API/generated SDK: complete write/read/event surface, including Run-event SSE and resource-handle
  `agent.stream({ task })` / `run.events.stream()` ergonomics over the same operations.
- CLI: complete lifecycle, diagnostic, event-follow and acceptance surface.
- Web: readback, approval, audit and recovery; no generic chat UI.
- MCP: descriptors for safe runtime/run/read operations; approval and acceptance require scopes that
  cannot be held by a Sandbox runtime identity.
- Public docs: Build with Agents, Sandboxes, Preview & Promote, Deploy & Verify.

## Non-Goals

- Owning caller conversations, generic memory, prompt management or model routing.
- A top-level Agent that outlives its Sandbox.
- Updating an existing Resource source binding in the first Promotion slice.
- Deploying a live workspace or Sandbox Snapshot.
- Claiming application correctness, formal verification or security certification.

## Open Questions

None that change ownership, lifecycle, persistence or public semantics.
