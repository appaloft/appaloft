# ADR-091: Execution Sandbox Boundary

Status: Accepted

Date: 2026-07-20

## Context

External applications and AI agents need disposable or resumable Linux environments for untrusted
commands, source workspaces, development servers and generated artifacts. Appaloft already deploys
long-running Resources and opens operator terminal sessions, but neither model owns task-scoped
sandbox provisioning, isolation claims, workspace APIs, network policy, snapshots, TTL or provider
cleanup.

Using Deployment would distort release/rollback language. Returning a host shell would bypass the
control plane. Implementing the model only in Appaloft Cloud would prevent Community BYOS and
Enterprise customer-owned execution while creating a private replacement for public core.

## Decision

1. Introduce the public `Execution Sandbox` bounded context.
2. `Sandbox`, `SandboxTemplate` and `SandboxSnapshot` are separate aggregate roots:
   - `Sandbox` owns desired isolation, resource limits, placement intent, expiry, network policy,
     credential grant references and lifecycle transitions;
   - `SandboxTemplate` owns reusable image/runtime defaults and admitted override policy;
   - `SandboxSnapshot` owns reusable captured-state identity, capability truth, retention and delete
     lifecycle independently of the source Sandbox.
3. `SandboxProcess`, file entries and exposed ports are runtime readbacks/capabilities. They do not
   become aggregate roots merely because they have transport identifiers.
4. Creation and provider lifecycle are accepted asynchronous workflows. Commands persist the
   requested transition before provider execution; status/events expose provisioning and terminal
   outcomes. Retry creates a new attempt rather than replaying an old fact.
5. Public operations enter through the shared command/query buses and operation catalog. HTTP/oRPC,
   CLI, generated TypeScript SDK and MCP descriptors are sibling transports.
6. Providers implement neutral capability ports. Vendor, CRD, Docker, VM and SSH types are
   translated in adapters and never leak into core state or public API contracts.
7. Isolation claims are explicit published language:
   - `container-trusted`: process/container isolation for trusted single-tenant code;
   - `gvisor`: user-space-kernel isolation;
   - `kata`: VM-backed container isolation;
   - `microvm`: dedicated microVM isolation.
   A provider may satisfy a stronger requested level, never a weaker one.
8. Public callers receive `sandboxId` and safe access descriptors. They do not receive host SSH
   credentials, raw host/provider addresses, provider credentials or unmasked secret values.
9. Workspace file operations are confined below the provider-declared workspace root. Network
   policy is deny-by-default for untrusted execution; credential grants use secret references and
   destination-bound brokerage rather than plaintext result fields.
10. Pause/resume preserves one Sandbox identity. Snapshot capture creates a reusable one-to-many
    source and must state whether filesystem or memory is preserved.
11. Absolute TTL, idle expiry, explicit termination and reconciliation are required lifecycle
    controls. Terminated/expired sandboxes cannot execute or reopen ports.
12. Cloud and Enterprise behavior is injected through public ports, policies, event consumers,
    projections and composition roots. Public Appaloft contains no Cloud pricing, fleet topology,
    official domain or license rules.

## Context Relationships

- Workspace is upstream for optional Project/Environment ownership references.
- Runtime Topology is upstream for optional Appaloft Server placement.
- Execution Sandbox publishes provider-neutral commands, queries and read models as an open-host
  service.
- Provider implementations are downstream anticorruption layers.
- Cloud tenancy/authz/quota/metering and Enterprise policy consume the public boundary through
  injected guards and providers.

## Consequences

- Appaloft can deploy durable Agent applications and also supply task-scoped execution computers
  without conflating their lifecycle.
- A cheap VPS is not automatically sandbox-capable. Runtime preparation must detect and publish
  isolation/capability evidence before placement.
- Local Docker can implement `container-trusted`; secure untrusted execution requires gVisor, Kata,
  microVM or another provider with equivalent declared evidence.
- Operation, persistence, SDK, CLI, MCP, public docs and testing work is larger than a provider-only
  adapter, but every caller receives one stable contract.

## Migration Gaps

- No existing public Sandbox operations or persistence rows exist; this feature is additive.
- Existing terminal sessions may later add a `sandbox` scope, but terminal attachment is not a
  prerequisite for command/file/process APIs and must not grant host access.
- Existing Server runtime preparation needs a neutral sandbox-capability probe before a BYOS host
  can be selected for untrusted execution.
