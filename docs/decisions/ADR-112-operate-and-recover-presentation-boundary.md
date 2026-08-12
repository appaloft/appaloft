# ADR-112: Operate And Recover Presentation Boundary

Status: Accepted

Date: 2026-08-12

## Context

Appaloft already owns provider-neutral Resource observation, Deployment recovery, backup/restore,
monitoring, proof and whole-instance portability operations. R3 needs a Railway-like daily operating
experience without creating a second lifecycle, copying provider consoles or forcing users to learn
several command families.

## Decision

1. Public Appaloft owns `appaloft operate`, its bounded Operate snapshot coordinator and the
   `operate/v1` presentation protocol.
2. Operate Session is ephemeral presentation coordination, not an aggregate, business operation,
   event stream, table or durable read model.
3. Every fact comes from existing public queries. Each optional section may be explicitly
   unavailable, while target lookup and write admission fail closed.
4. Every mutation dispatches an existing public command. Retry/redeploy/rollback re-read Deployment
   Recovery Readiness immediately before an exact two-step confirmation.
5. Backup and restore keep their existing owners. Restore defaults to an independent target;
   application rollback never implies data rollback.
6. Whole-instance portability remains owner-scoped and instance-scoped. Operate exposes readiness
   and an exact handoff, not a Resource-owned replace import.
7. Interactive presentation extends the existing Rust/Ratatui sidecar. Bun owns query/command/IO
   lifecycle; the renderer owns no business policy or state.
8. Cloud and Enterprise may inject authentication, authorization, entitlement, credential custody,
   offsite providers and notification delivery, but may not define a private Operate lifecycle.

## Consequences

- Operators gain one task flow while expert CLI/API/Web/MCP surfaces remain canonical.
- Local, self-hosted and Cloud compositions can share presentation semantics.
- No migration, aggregate, operation-catalog or provider-specific domain change is required.
- R3 completion depends on real rollback and independent-restore evidence, not renderer screenshots.

## Rejected Alternatives

- New Operate/Incident aggregate, generic dashboard query, Cloud-only console, automatic rollback,
  destructive live restore, provider-native DTOs in the view model, or an OpenTUI rewrite.

## Verification

See [Spec 134](../specs/134-operate-and-recover-presentation/spec.md), the
[Operate And Recover Workflow](../workflows/operate-and-recover.md), and the
[Operate And Recover Test Matrix](../testing/operate-and-recover-test-matrix.md).
