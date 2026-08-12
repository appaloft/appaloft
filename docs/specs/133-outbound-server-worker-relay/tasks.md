# Tasks: Outbound Server Worker Relay

## Governance

- [x] Record auto-Grill decisions, security invariants and rejected alternatives.
- [x] Define ADR-111, Spec 133 and stable `SWR-*` ids.
- [x] Define public/private routing and Test-First seams.
- [x] Merge public PR #1072 and Cloud PR #877; mark public #1074 and Cloud #878 `ready-for-agent`.

## Public Test First And Implementation

- [x] RED frame schema/limit/version/capability/generation/idempotency tests.
- [x] RED Worker credential/enrollment/rotation/revoke and local-policy tests.
- [x] RED exec/file/PTY/dev/forward/drain/upgrade dispatch tests.
- [x] Implement public protocol package, device runtime and Server Worker CLI.
- [x] Run relay `SandboxDockerCommandRunner` contract against in-memory transport.

## Cloud Test First And Implementation

- [x] RED tenant/authz/token/CA/cert/persistence and safe-readback tests.
- [x] RED mTLS connection/lease/fence/ticket/reconnect/revoke/rotation tests.
- [x] RED relay Sandbox runner and R2a remote Dev composition tests.
- [x] Implement Cloud issuer, registry, relay listener, routes/overlay, persistence and adapters.

## Verification And Sync

- [x] Real local mTLS two-process journey and zero-residual evidence packet.
- [x] Public focused/full gates, docs-impact and packaging checks.
- [ ] Cloud focused/full gates and composed-runtime packaging checks.
- [ ] Merge public implementation, advance Cloud pin to final public main SHA, then run read-only
  Public/Private Boundary Review.
- [ ] Merge Cloud implementation, close Tickets and sync program/roadmap evidence.
