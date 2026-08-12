# Plan: Outbound Server Worker Relay

## Architecture

1. Add a public protocol package with strict schemas, frame limits, capability negotiation,
   request/stream correlation, generation fencing and redaction helpers.
2. Add the device Worker runtime and local credential store; implement process/Docker/file/PTY/dev
   and scoped port-forward dispatch behind device-local policy.
3. Add public Server Worker CLI task commands over neutral enrollment/relay ports. Keep top-level
   durable-work `worker` unchanged.
4. In Cloud, implement the private enrollment issuer, CA/KMS adapter, Postgres attachment/token/cert
   records, TLS relay/connection registry, tickets, leases, rotation/revocation and audit.
5. Inject a relay-backed `SandboxDockerCommandRunner` and Dev transport; reuse existing
   Sandbox/Snapshot/Terminal/Port and R2a Development Session lifecycle.

## Test-First Seams

- Pure protocol schemas/state machine with deterministic fake clock/ids.
- In-memory duplex transport for request/stream/fence/reconnect tests.
- Real loopback TLS server with generated test CA/certs for mutual-auth acceptance.
- Fake issuer/credential store and Cloud persistence contract.
- Existing `SandboxDockerCommandRunner` contract suite executed against relay runner.
- Real local two-process Worker/relay acceptance; external VPS is an explicit opt-in follow-up gate.

## Delivery Sequence

1. Merge public and Cloud governance; create public protocol/client and Cloud hosted-relay Tickets.
2. RED protocol/credential/Worker tests, then implement public package and CLI.
3. RED Cloud enrollment/CA/persistence/relay tests, then implement private overlay.
4. RED relay runner contracts and R2a/Workspace acceptance, then compose adapters.
5. Verify enroll -> connect -> dev -> port forward -> Workspace terminal -> snapshot/fork -> revoke ->
   zero-residual in a local real-process environment.
6. Run docs impact, full public/Cloud gates and independent boundary review after public merge/pin.

## Rollback

Drain and revoke exact Workers/tickets, stop the private relay listener, return registered-Server
selection to SSH/local adapters and preserve public Server/Workspace/Snapshot data. Reverting the
additive protocol/CLI does not change top-level durable-work worker behavior.
