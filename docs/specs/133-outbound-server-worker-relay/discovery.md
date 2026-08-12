# Discovery: Outbound Server Worker Relay

## Status

- Round: Grill / Discovery complete
- Owner decision: accepted on 2026-08-12 through the explicit recommended-direction delegation.
- Proposed scope: public Worker protocol/client and Server task surface; hosted relay, tenancy,
  certificate authority and fleet persistence remain private Cloud composition.
- Code changes allowed: no, until ADR, Spec, Plan, Test Matrix and routed Tickets are accepted.

## Business Outcome

A device owner can connect a Mac or VPS to Appaloft through one outbound mTLS connection, then use
the existing Dev and Workspace/Sandbox journeys without exposing inbound SSH. Disconnect, reconnect,
revocation, certificate rotation, upgrade/drain, orphan cleanup and port forwarding are explicit,
observable and fenced.

## Existing Capabilities To Reuse

- Public `Server` remains execution-target identity and workload-role admission truth.
- `appaloft server enroll` already composes registration/readiness for local and SSH targets.
- Public `SandboxDockerCommandRunner` is the narrow runtime seam used by Cloud registered-Server
  Workspace/Snapshot/terminal/port behavior; an outbound implementation can replace SSH.
- Existing Sandbox snapshots, recovery/fork source semantics, Terminal Sessions and Preview port
  contracts remain authoritative; the relay must transport them, not replace them.
- `appaloft worker` is already the durable-work process command and remains unchanged.
- Cloud registered-Server composition currently requires a stored SSH private key and inbound SSH;
  its delegate factory can select a different command runner when a live outbound connection exists.

## Auto-Grill Decision Tree

| Frontier question | Recommended and accepted answer | Consequence |
| --- | --- | --- |
| Device command namespace | `appaloft server worker enroll/run/status/revoke/upgrade` | Avoids breaking the accepted top-level durable-work `worker` command. |
| Network posture | One device-initiated outbound TLS connection; no inbound SSH requirement | Personal Mac remains unreachable unless its owner runs the Worker. |
| Trust bootstrap | Authenticated one-time, short-lived enrollment token -> device-generated key -> mTLS certificate | Private keys never leave the device. |
| Certificate custody | Public protocol defines CSR/cert/rotation/revoke; Cloud injects CA/KMS and serial persistence | Community/Enterprise can provide another issuer without importing Cloud. |
| Server identity | Reuse public Server; hosted connection state is a separate ServerWorker attachment keyed by Server id | No Host/Machine or private Server lifecycle. |
| Relay truth | Public versioned frame/capability contract; Cloud owns hosted routing, tenant authz, admission and leases | Protocol remains portable while hosted topology stays private. |
| Execution surface | Bounded argv/stdin/stdout/PTY/file/port primitives behind public capability grants | Existing Sandbox/Dev adapters reuse their current lifecycle logic. |
| Default isolation | Docker/Colima/container execution; host-shell is disabled unless device owner enables it locally | Cloud cannot silently obtain a general host shell. |
| Lease/fencing | Monotonic connection generation, heartbeat lease and exact request id | A stale/replayed connection cannot keep executing after reconnect/revoke. |
| Reconnect | Same Worker id/cert resumes with a higher generation; inflight idempotent requests reconcile by request id | Disconnect does not create a second device identity. |
| Revocation | Server Worker revoke closes connections, denies new frames and removes grants; Server remains separately manageable | Connection revocation does not delete the public Server. |
| Rotation | Short-lived certs rotate with overlap; old serial is fenced after acknowledgement or overlap expiry | No long-lived bearer credential. |
| Upgrade | Worker reports version/capabilities; upgrade performs drain, verifies signed release metadata, restarts and rolls back on failed health | No blind self-update while jobs are running. |
| Orphans | Lease expiry cancels new admission; owned child operations receive bounded cancel/cleanup; persistent Workspace data follows existing policy | Offline does not mean silently deleted data or unlimited work. |
| Port forward | Multiplexed byte stream requires a short-lived, scoped capability for one target/port and exact close cleanup | Relay is not an unrestricted network tunnel. |
| Source transfer | R2a local source may be packed into a bounded, ignore-aware archive; paths/symlinks are validated under a Worker root | Remote dev does not require inbound SSH or an already pushed commit. |
| Checkpoint/fork | Reuse existing Sandbox snapshot and snapshot-source provisioning through the relay-backed Docker runner | No new checkpoint aggregate or private fork semantics. |
| Observability | Safe Worker status includes version, platform, capability keys, generation, lease and last error code; never host address, cert/private key or raw command | TUI/API can explain availability without leaking topology/secrets. |

## Candidate Journey

1. On the device, `server worker enroll` authenticates, creates/reuses a public Server attachment,
   generates a local key and exchanges a one-time token/CSR for a short-lived certificate.
2. `server worker run` opens the outbound mTLS connection, advertises bounded capabilities and
   starts heartbeat/rotation loops.
3. Cloud authorizes one tenant-scoped client ticket and forwards a Dev or existing Sandbox command
   through the live, fenced Worker generation.
4. The Worker executes only an admitted capability under its local isolation policy and streams
   bounded output/PTY/port bytes.
5. Reconnect, revoke or upgrade drains/cancels exact inflight work, advances fencing and preserves or
   deletes runtime data according to the existing Dev/Workspace lifecycle.

## Rejected Alternatives

- Cloud inbound SSH to personal Macs, a permanent shared SSH key or a bearer token used as the
  long-lived transport credential.
- Reusing top-level `appaloft worker`, creating a Host/Machine aggregate or storing device private
  keys in Cloud.
- A general-purpose unaudited reverse shell, arbitrary port tunnel or relay-owned Workspace state.
- Raw issue/heartbeat counts as Worker quality or readiness evidence.

## Public/Private Boundary

Public owns protocol frames, capability vocabulary, client runtime, local credential files, Server
Worker CLI task flow and neutral issuer/relay ports. Cloud owns hosted enrollment routes, tenancy,
authz, entitlement, CA/KMS, connection registry, leases, audit/metering and relay deployment. Public
imports no Cloud package. Cloud reuses public Server, Dev, Sandbox, Snapshot and Terminal lifecycle.

## Open Questions

No question remains that changes ownership or the R2b exit gate. Production CA provider, L4
deployment topology and release CDN are injected operational choices and must fail closed when absent.
