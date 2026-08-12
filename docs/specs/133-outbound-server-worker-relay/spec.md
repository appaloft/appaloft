# Outbound Server Worker Relay

## Status

- Round: Spec
- Artifact state: accepted by the owner-delegated recommended decision on 2026-08-12
- Code changes allowed: yes, after public and Cloud Tickets are `ready-for-agent`
- Compatibility: additive public minor protocol/CLI surface
- Governing decision: ADR-111

## Business Outcome

A Mac/VPS runs an outbound Appaloft Worker that safely realizes the existing Development and
Workspace/Sandbox journeys over mTLS, without inbound SSH and without moving lifecycle truth into
the relay.

## Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| SWR-ENROLL-001 | Secret-safe enrollment | an authenticated device owner selects a Server/name | enroll runs | a one-time bounded token and device-generated CSR yield one Worker id/cert; private key never leaves the device or enters argv/log/audit. |
| SWR-ENROLL-002 | Existing Server ownership | enrollment creates or attaches a target | completion is read | public Server remains identity/workload-role truth; Worker connection state is separate and cannot delete/rename the Server. |
| SWR-MTLS-003 | Mutual TLS | Worker connects outbound | handshake completes | server chain and client certificate/serial/Worker/tenant binding are verified before protocol hello. |
| SWR-PROTO-004 | Version/capability negotiation | peers support overlapping versions/capabilities | hello is exchanged | one version is selected; missing required capability fails before request admission. |
| SWR-LEASE-005 | Heartbeat and fencing | a live generation holds a lease | reconnect/timeout/revoke occurs | only the newest non-revoked generation accepts work; stale frames fail closed. |
| SWR-EXEC-006 | Bounded execution | a signed/scoped request permits argv or file operation | Worker dispatches | path/root/size/time/output/isolation limits are enforced and structured result frames return. |
| SWR-PTY-007 | Native terminal continuity | existing Sandbox terminal opens through a Worker | attach/resize/input/output/reconnect runs | PTY bytes remain opaque, the same Terminal Session identity survives bounded reconnect and stale generations cannot write. |
| SWR-DEV-008 | Remote Dev parity | R2a plan/source archive targets a live Worker | dev starts/status/logs/stops | the same Development Session contract and cleanup evidence run on the device; relay adds no Dev state model. |
| SWR-SNAPSHOT-009 | Checkpoint/fork reuse | a relay-backed Sandbox supports existing snapshot capability | create or snapshot-source provision runs | existing SandboxSnapshot/provider contracts execute through the runner with no new checkpoint/fork aggregate. |
| SWR-FORWARD-010 | Scoped port forward | an authorized short-lived ticket selects one runtime port | stream opens/closes | bytes are multiplexed only for that scope; expiry/revoke/disconnect removes exact listeners/streams. |
| SWR-RECONNECT-011 | Reconnect/idempotency | transport drops during or after a request | Worker reconnects | request ids and generation reconcile duplicate/unknown outcomes; non-idempotent work is never blindly replayed. |
| SWR-ROTATE-012 | Certificate rotation | cert approaches expiry | rotation runs | a new cert is acknowledged with bounded overlap and old serial is fenced/revoked without dropping unrelated sessions. |
| SWR-REVOKE-013 | Exact revocation | owner/admin revokes one Worker | current/future connections act | current connection closes, tickets/leases fail and local credential can be removed; public Server/data deletion remains separate. |
| SWR-UPGRADE-014 | Drain and rollback | signed release metadata is available | Worker upgrade runs | new admission stops, inflight work drains/cancels by policy, version health is verified, and failed upgrade returns to the previous executable. |
| SWR-ORPHAN-015 | Offline cleanup | heartbeat expires or process crashes | reconciler runs | new work is denied, exact ephemeral forwards/grants are removed and owned runtime cleanup follows existing Dev/Sandbox policy with evidence. |
| SWR-STATUS-016 | Safe readback | user/TUI/API reads Worker status | list/show runs | status/version/platform/capabilities/generation/lease/error code are bounded; host, raw cert, private key, command/env/output are absent. |
| SWR-ERROR-017 | Structured failures | enroll/handshake/request/stream/rotation/upgrade fails | result is returned | stable code/category/phase/retriability and request/Worker ids survive without secret/raw topology leakage. |
| SWR-LOCAL-018 | Community portability | hosted Cloud relay is absent | public protocol/runtime is composed locally or in Enterprise | direct self-hosted issuer/relay adapters can implement the same contract; SSH/local paths remain usable. |

## Public Protocol

- Wire envelope: newline-delimited bounded JSON control frames plus base64 bounded binary chunks,
  schema `server-worker-relay/v1`.
- Required frame families: `hello`, `heartbeat`, `request`, `response`, `stream-open`,
  `stream-data`, `stream-close`, `cancel`, `rotate`, `drain`, `goodbye`.
- Every post-handshake frame carries Worker id, connection generation, message/request id and size
  bounds. Stream ordering is per stream id; global ordering is not implied.
- Initial capability keys: `process.exec`, `process.pty`, `filesystem.read`, `filesystem.write`,
  `runtime.dev`, `runtime.docker`, `network.forward`, `worker.rotate`, `worker.drain`.
- Capability presence never bypasses tenant authz, ticket scope, device-local isolation or lifecycle
  admission.

## Public Surfaces

- CLI: `appaloft server worker enroll|run|status|revoke|upgrade`.
- Public TypeScript protocol package and neutral `ServerWorkerEnrollmentPort`, relay client/session
  and credential-store boundaries.
- Existing Dev, Sandbox, Snapshot, Terminal and Port operations remain canonical.
- Existing top-level `appaloft worker` is unchanged.

## Error Contract

| Code | Phase | Retriable |
| --- | --- | --- |
| `server_worker_enrollment_invalid` | `server-worker-enrollment` | no |
| `server_worker_certificate_rejected` | `server-worker-mtls` | no |
| `server_worker_protocol_incompatible` | `server-worker-handshake` | no |
| `server_worker_unavailable` | `server-worker-lease` | yes |
| `server_worker_generation_fenced` | `server-worker-admission` | yes after refresh |
| `server_worker_capability_denied` | `server-worker-admission` | no |
| `server_worker_request_failed` | `server-worker-execution` | conditional |
| `server_worker_forward_failed` | `server-worker-forward` | conditional |
| `server_worker_rotation_failed` | `server-worker-rotation` | yes |
| `server_worker_upgrade_failed` | `server-worker-upgrade` | conditional |

## Security Invariants

- Enrollment tokens are single-use, expire within minutes and are stored hashed when persistence is
  required.
- Device keys are generated/stored locally with owner-only permissions; Cloud stores cert serial,
  public fingerprint and opaque issuer references only.
- Default Worker mode permits Docker/container operations under owned roots. Host-shell requires a
  local owner flag that remote policy cannot enable.
- Requests have bounded argv/env keys/stdin/output/time/path/root and contain no reusable Cloud
  credential. Audit stores operation/capability/result identity, never payload bytes.
- Tickets, leases and certs are scoped to tenant + Server + Worker + generation and are revocable.

## Non-Goals

- General VPN, arbitrary reverse shell, public proxy or a replacement for every SSH administration
  task.
- New Workspace/Snapshot/Dev lifecycle or a Cloud-owned Server aggregate.
- Kubernetes Worker fleet, autoscaling or multi-region HA in the first R2b implementation.

## Compatibility And Migration

Local and SSH Servers continue unchanged. A Server may gain an outbound Worker attachment without
deleting its historical SSH metadata; selection is explicit and fails closed if the required live
connection is unavailable. Revoking the Worker does not delete the Server or persistent Workspace data.
