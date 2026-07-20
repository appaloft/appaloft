# Execution Sandbox Platform

## Status

- Round: Spec Round complete; Test-First Round next
- Artifact state: ready for public Code Round
- Roadmap target: post-1.0 Execution Sandbox Platform track
- Compatibility impact: additive public minor capability

## Business Outcome

An authorized external application, AI agent, CLI user or MCP client can request an isolated
execution environment, observe it becoming ready, execute foreground or background processes,
manage a confined workspace, expose controlled preview ports, pause/resume it, capture reusable
snapshots and terminate it through the same Appaloft operation catalog.

The caller receives an Appaloft Sandbox handle and safe access descriptors rather than host SSH,
provider credentials or raw host network access. The same contract works with Community BYOS,
Kubernetes, hosted providers and Enterprise customer-owned execution.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Execution Sandbox | Bounded context that owns isolated task-scoped execution environments. | Public platform | Agent sandbox in user-facing search text only. |
| Sandbox | Addressable execution environment with desired policy and lifecycle. | Execution Sandbox | Devbox is a vendor term, not an alias in code. |
| Sandbox Template | Reusable admitted starting definition for image, resources, isolation and override policy. | Execution Sandbox | Vendor snapshot/template DTOs are translated. |
| Sandbox Snapshot | Reusable captured filesystem or filesystem-plus-memory state that can create new Sandboxes. | Execution Sandbox | Backup is not an alias; backup has a different recovery contract. |
| Sandbox Process | Provider-observed foreground/background process descriptor and terminal result. | Runtime readback | Job is not used because Appaloft already has durable process jobs. |
| Workspace | Confined filesystem root visible through Sandbox file operations. | Sandbox capability | Host path is forbidden public language. |
| Isolation Requirement | Minimum admitted runtime boundary: container-trusted, gvisor, kata or microvm. | Sandbox policy | Secure is not accepted without a concrete level. |
| Network Policy | Default-deny or allowlisted egress rules associated with one Sandbox. | Sandbox policy | Firewall is a provider implementation term. |
| Credential Grant | Secret reference plus allowed destination and transformation, brokered without exposing plaintext. | Sandbox policy | Environment secret is not equivalent. |
| Port Exposure | Controlled access descriptor for one Sandbox port. | Sandbox capability | Raw IP is not a public result. |

## Domain Ownership

- Bounded context: Execution Sandbox.
- Aggregate roots: Sandbox, SandboxTemplate, SandboxSnapshot.
- Runtime readbacks: SandboxProcess, SandboxFileEntry, SandboxPortExposure.
- Upstream contexts: Workspace, Runtime Topology, identity/tenant execution context.
- Downstream contexts: runtime providers, audit, usage attribution, Cloud/Enterprise policy.
- Published language: operation catalog, command/query schemas, HTTP/oRPC/OpenAPI and generated SDK.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| SANDBOX-SPEC-001 | Create and observe | A caller has an authorized tenant context and a compatible provider/template | `sandboxes.create` is accepted | A Sandbox id is persisted in `requested/provisioning`; list/show/events expose provider progression to `ready` or a structured terminal failure. |
| SANDBOX-SPEC-002 | Truthful placement | The request requires an isolation/capability set | Placement evaluates providers/servers | A weaker or unknown provider is rejected before execution; the read model reports requested and realized isolation separately. |
| SANDBOX-SPEC-003 | Lifecycle | A ready or paused Sandbox exists | Pause, resume, terminate or TTL/idle expiry occurs | Only valid transitions succeed; termination/expiry revoke process/file/port access and reconciliation removes provider-owned runtime state. |
| SANDBOX-SPEC-004 | Foreground execution | A ready Sandbox exists | The caller executes argv with cwd, env refs, stdin and timeout | Ordered stdout/stderr frames and exactly one exit/error terminal frame are streamed; shell interpolation is never implicit. |
| SANDBOX-SPEC-005 | Background process | A ready Sandbox exists | The caller starts background execution | A safe process id is returned; list/show/events/terminate work without exposing command secrets or host process ids. |
| SANDBOX-SPEC-006 | Confined files | A ready or paused filesystem-capable Sandbox exists | The caller lists, reads, writes or removes a workspace path | Binary-safe operations remain below the workspace root; traversal, host paths and symlink escape fail closed. |
| SANDBOX-SPEC-007 | Controlled ports | A ready Sandbox has a listening service | A port is exposed or revoked | The result is an authenticated/signed access descriptor with expiry and visibility; no host IP/provider credential leaks. |
| SANDBOX-SPEC-008 | Network and credentials | A Sandbox has default-deny egress | Policy or credential grants are updated | Only allowlisted destinations are reachable; secret plaintext is absent from the Sandbox read model, output, errors, audit and snapshots. |
| SANDBOX-SPEC-009 | Pause versus snapshot | A provider declares pause and/or snapshot capabilities | The caller pauses/resumes or captures/restores | Pause keeps one Sandbox identity; snapshot produces an independent reusable Snapshot with explicit filesystem/memory capability truth. |
| SANDBOX-SPEC-010 | Template reuse | An authorized caller owns a Sandbox Template | A Sandbox is created with allowed overrides | Template defaults and override policy are deterministic; immutable/disallowed fields cannot be weakened by the caller. |
| SANDBOX-SPEC-011 | External application SDK | An application has a scoped token | It calls generated SDK methods | SDK methods map to catalog operations and typed errors/streams; it does not import application/core or create SDK-only behavior. |
| SANDBOX-SPEC-012 | Tenant, quota and audit | Multiple organizations create Sandboxes | Commands/queries/audit execute | Repository context isolates tenants, list queries are bounded, quota guards run before provider mutation, and safe lifecycle/exec/port/snapshot facts are auditable. |
| SANDBOX-SPEC-013 | Reconciliation | The control plane or provider restarts during lifecycle work | Reconciliation runs | Desired and observed state converge idempotently; orphan cleanup is scoped by Appaloft ownership labels/handles and never deletes unrelated workloads. |

## Public Surfaces

- API/SDK: full lifecycle, process, file, port, policy, template, snapshot and event operations.
- CLI: the same operations for operator automation and local/BYOS use.
- Web: list/show/lifecycle/usage/status first; interactive file/terminal IDE behavior is optional.
- MCP: generated descriptors for bounded operations; binary file and process streams may use
  resource links or HTTP stream handles rather than embedding unbounded content in tool results.
- Config: Sandbox Templates are API resources; no repository config semantics are introduced in
  this behavior.
- Public docs: task guide plus SDK/API reference and isolation/security concept page.

## Non-Goals

- Building an LLM, agent framework, prompt orchestrator, browser automation product or model gateway.
- Treating Sandbox as a Deployment or using deployment rollback for snapshot restore.
- Returning host SSH credentials, direct provider credentials or raw host addresses.
- Claiming ordinary container-trusted placement is safe for hostile multi-tenancy.
- Encoding Cloud pricing, official domains, managed fleet topology or Enterprise licensing in the
  public model.

## Open Questions

- Whether the first real BYOS secure provider should be Docker+gVisor on one Server or Kubernetes
  Agent Sandbox; both use the same accepted provider contract.
- Whether terminal attachment should extend `terminal-sessions.open` with Sandbox scope in this PR
  or follow after process streaming reaches parity.
