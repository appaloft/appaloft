# Tasks: Outbound Server Worker Relay

## Governance

- [x] Record auto-Grill decisions, security invariants and rejected alternatives.
- [x] Define ADR-111, Spec 133 and stable `SWR-*` ids.
- [x] Define public/private routing and Test-First seams.
- [ ] Merge governance and create public/Cloud vertical-slice Tickets.

## Public Test First And Implementation

- [ ] RED frame schema/limit/version/capability/generation/idempotency tests.
- [ ] RED Worker credential/enrollment/rotation/revoke and local-policy tests.
- [ ] RED exec/file/PTY/dev/forward/drain/upgrade dispatch tests.
- [ ] Implement public protocol package, device runtime and Server Worker CLI.
- [ ] Run relay `SandboxDockerCommandRunner` contract against in-memory transport.

## Cloud Test First And Implementation

- [ ] RED tenant/authz/token/CA/cert/persistence and safe-readback tests.
- [ ] RED mTLS connection/lease/fence/ticket/reconnect/revoke/rotation tests.
- [ ] RED relay Sandbox runner and R2a remote Dev composition tests.
- [ ] Implement Cloud issuer, registry, relay listener, routes/overlay, persistence and adapters.

## Verification And Sync

- [ ] Real local mTLS two-process full journey and zero-residual evidence.
- [ ] Public/Cloud focused and full gates, docs-impact and packaging checks.
- [ ] Merge public implementation, advance Cloud pin to final public main SHA, then run read-only
  Public/Private Boundary Review.
- [ ] Merge Cloud implementation, close Tickets and sync program/roadmap evidence.
