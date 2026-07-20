# Execution Sandbox Platform Research

## Status

- Round: Discover Round complete
- Date: 2026-07-20
- Scope: public, provider-neutral Appaloft execution sandbox capability

## Research Question

What contract must Appaloft expose so an external application or AI agent can request an isolated
execution environment on user-owned or provider-managed compute without receiving host SSH access,
raw provider credentials, or a second set of business semantics?

## Primary-Source Competitor Matrix

| Product | Lifecycle | Execution surface | State and persistence | Network and credentials | Placement lesson for Appaloft |
| --- | --- | --- | --- | --- | --- |
| [E2B](https://e2b.dev/docs) | Create, connect, pause/resume, kill, timeout | Command execution and filesystem API | Templates plus filesystem/memory snapshots; snapshots can fork many sandboxes | Sandbox access token; public service hostnames | Separate a stable sandbox identity from access credentials and distinguish one-to-one resume from one-to-many snapshot restore. |
| [Daytona](https://www.daytona.io/docs/en/sandboxes/) | Create, start/stop, pause VM, resume, archive/delete, fork | Process, filesystem, Git, PTY, code interpreter and computer-use facades | Container filesystem preservation, VM memory snapshots, volumes | CIDR/domain allowlists and an outbound proxy that substitutes opaque secret placeholders only for allowed hosts | Provider capability truth matters: container stop is not VM pause, and brokered credentials are safer than plaintext environment variables. |
| [Modal](https://modal.com/docs/guide/sandboxes) | Created, scheduled, started, ready, finished; timeout/idle timeout/terminate | Foreground/background exec with streamed output | Filesystem, directory and memory snapshots | Sandboxes are not implicitly authorized to other workspace resources | Lifecycle observation should expose scheduling/readiness separately from terminal completion. |
| [Vercel Sandbox](https://vercel.com/docs/sandbox) | Create, extend timeout, stop; snapshot restore | Commands, files and exposed ports | Firecracker microVM plus snapshots | Runtime-updatable allow/deny policy, credential brokering and request proxying | Network policy and credential grants must be independently revocable without restarting the sandbox. |
| [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/) | Lazy create, active, idle sleep, wake, destroy | Commands, background processes, files, file watch, sessions, PTY, ports/tunnels | Active filesystem plus R2-backed backups and mounts | Per-sandbox VM boundary; explicit session scoping | A convenience SDK may group related operations, but canonical behavior should remain explicit API operations with path confinement and typed streams. |
| [Blaxel](https://docs.blaxel.ai/Sandboxes/Overview) | Active, warm standby, restore, expiration, delete | REST and built-in MCP for files, processes, ports and previews | Process plus filesystem standby snapshot and optional volumes | Proxy/firewall and egress identity | MCP is a sibling transport over sandbox capabilities, not the lifecycle owner. |
| [Northflank](https://northflank.com/docs/v1/application/sandboxes/sandboxes-on-northflank) | Start, pause, resume and destroy | Exec streams and public port exposure | Optional persistent volume | MicroVM-backed container isolation in hosted or BYOC placement | Traditional applications and sandboxes can share one control plane while retaining different lifecycle resources. |
| [Kubernetes Agent Sandbox](https://agent-sandbox.sigs.k8s.io/docs/) | Create, scheduled deletion, hibernate and resume | SDK command/file access through a router | Stable identity, PVCs and snapshots | Kubernetes RBAC/network policy; gVisor/Kata are explicit isolation choices | `SandboxTemplate`, `SandboxClaim` and `SandboxWarmPool` are useful provider concepts, but Appaloft should translate them behind its published language instead of leaking CRDs. |

## Confirmed Product Requirements

1. A `Sandbox` is not a `Deployment`, `Resource`, terminal session, or long-running Agent. It is a
   transient, addressable execution environment that may be created by any authorized application.
2. The public handle is `sandboxId`; callers do not receive the host IP, host SSH credential,
   provider token, container id, Kubernetes object name, or runtime daemon credential.
3. Creation is asynchronous and observable through status/events. `requested`, `provisioning`,
   `ready`, `paused`, `failed`, `terminating`, `terminated`, and `expired` are distinct facts.
4. A template/image, resource limits, absolute and idle expiry, filesystem policy, network policy,
   credential grants, placement intent, and isolation requirement are admitted before provider work.
5. Foreground execution streams ordered stdout/stderr and one terminal result. Background execution
   returns a process id with list/show/events/terminate readback.
6. File APIs are binary-safe and confined to the sandbox workspace. Path traversal, host paths and
   symlink escape must fail closed.
7. Port exposure returns an Appaloft access descriptor or signed preview URL. A raw private IP is
   implementation metadata and is not part of the public contract.
8. Snapshot is one-to-many reusable state; pause/resume is one-to-one lifecycle. Snapshot support
   must state whether it preserves filesystem only or filesystem plus memory.
9. Network policy defaults to deny except explicitly selected platform control endpoints. Plaintext
   secrets must not enter results, logs, snapshots or errors; brokered grants bind one secret ref to
   an allowlisted host/header transformation.
10. Provider descriptors publish truthful isolation and capability support. `container-trusted`
    must never be presented as hostile multi-tenant isolation; `gvisor`, `kata` and `microvm` are
    distinct capability values.
11. TTL, idle expiration, quota, audit and cleanup reconciliation are mandatory, not optional
    operational polish.
12. HTTP/oRPC, generated SDK, CLI and MCP descriptors must map to the same operation catalog and
    command/query schemas.

## Appaloft Boundary Decision Input

- Public Appaloft owns the neutral `Execution Sandbox` bounded context, operation catalog entries,
  provider ports, local/BYOS adapters, HTTP/oRPC/CLI/SDK/MCP parity, public docs and tests.
- Appaloft Cloud owns hosted placement, fleet/warm-pool policy, commercial quotas, metering,
  managed credential custody, hosted preview domains and abuse controls.
- Enterprise owns customer-cluster/VPC composition, required isolation policy, private templates,
  private registries and customer-managed credential/network providers.
- Vendor adapters form anticorruption layers. E2B, Daytona, Kubernetes, Vercel, Cloudflare and
  other vendor DTOs and lifecycle values must not enter the core aggregate.

## Rejected Shortcuts

- Reusing `Deployment` as the Sandbox aggregate: rejected because deployment release history and
  rollback are different from task-scoped create/exec/pause/expire semantics.
- Returning SSH credentials or a raw VPS IP: rejected because it bypasses authorization, audit,
  path confinement, credential brokering and provider portability.
- Calling an ordinary Docker container a secure multi-tenant sandbox: rejected because the public
  isolation claim must match the configured runtime boundary.
- Building a Cloud-only `cloud-sandbox-core`: rejected because sandbox identity, lifecycle,
  operation language and provider ports are neutral platform capabilities.
