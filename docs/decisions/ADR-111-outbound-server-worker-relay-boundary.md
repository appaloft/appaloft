# ADR-111: Outbound Server Worker Relay Boundary

Status: Accepted

Date: 2026-08-12

## Context

Appaloft can operate registered Servers and Workspace Sandboxes through SSH, but a personal Mac or
NAT/firewall-constrained VPS should not require inbound SSH. Appaloft also already uses the word
Worker for its durable background execution process, so the device surface must remain unambiguous.

## Decision

1. Public Appaloft owns the versioned Server Worker protocol, device client/runtime, capability
   vocabulary, neutral issuer/relay ports and `appaloft server worker ...` commands.
2. Top-level `appaloft worker` remains the durable-work runtime command.
3. A Server Worker is an attachment to the existing public Server identity. It owns connection,
   certificate, lease and capability state, not Server or Workspace lifecycle.
4. The Worker always initiates outbound mTLS. Enrollment uses a short-lived one-time token and a
   device-generated key/CSR; the private key never leaves the device.
5. Hosted Cloud owns CA/KMS, tenant authorization, entitlement, connection routing, leases, tickets,
   audit/metering and persistence. Public code imports none of it.
6. Runtime requests are capability-scoped, bounded and generation-fenced. Docker/container mode is
   default; host-shell requires local owner enablement.
7. Existing Dev, Sandbox, Snapshot, Terminal and Port lifecycles execute through relay-backed ports.
   The relay adds no parallel lifecycle model.

## Consequences

- Macs/VPS can be managed without inbound SSH or shared long-lived credentials.
- Community/Enterprise can compose the same protocol with another relay/issuer.
- Existing Workspace checkpoint/fork and native Agent TUI semantics remain reusable.
- Cloud relay failure is visible and revocable instead of becoming hidden target truth.

## Rejected Alternatives

- Inbound Cloud SSH, permanent bearer tokens, general reverse shell/VPN, a Cloud Server aggregate,
  relay-owned Workspace state or overloading top-level `worker`.

## Verification

See [Outbound Server Worker Relay](../specs/133-outbound-server-worker-relay/spec.md) and the
[Outbound Server Worker Relay Test Matrix](../testing/outbound-server-worker-relay-test-matrix.md).
