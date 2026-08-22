# Appaloft Up Entrypoint — Grill / Discovery

## Status

- Round: Grill complete.
- Date: 2026-08-22.
- Owner decision: confirmed from the product-direction review comparing Railway
  and Appaloft.
- Code changes allowed: after the governing Spec artifacts and a
  `ready-for-agent` public issue exist.

## Actor And Observable Outcome

An operator in an application folder runs `appaloft up`. Appaloft follows the
same proven deployment path as today's `appaloft deploy`: it signs in when
needed, resolves or creates the folder's Project, applies the agent/non-TTY
confirmation guard, starts the deployment, and waits for terminal proof. The
operator does not need to learn a second deployment workflow.

## Evidence And Facts

- Railway uses `railway up` as its canonical folder-to-deployment happy path.
- Appaloft already owns the deployment workflow behind `appaloft deploy`; that
  workflow includes folder onboarding, folded first-deploy login, non-TTY and
  coding-agent `--yes` protection, JSON output, and terminal deployment
  verification.
- Appaloft 1.x users and automation already call `appaloft deploy`, so removing
  it would create an unnecessary compatibility break.
- `up` changes the public CLI entrypoint vocabulary, not the deployment domain,
  admission policy, lifecycle, persistence, or transport operation.

## Owner Decisions

1. `appaloft up` is the canonical Railway-like deployment happy path.
2. `up` reuses the existing deploy workflow directly. It does not introduce a
   new business operation or a parallel implementation.
3. `appaloft deploy` remains available throughout 1.x as a compatibility alias
   with the same inputs, output, exit status, and side effects.
4. `up` inherits folded login, folder-project onboarding, the coding-agent / CI /
   non-TTY `--yes` guard, `--json`, and terminal deployment proof.
5. Public help and task-oriented documentation lead with `up` while documenting
   `deploy` as the 1.x compatibility spelling.

## Alternatives

- Keep `deploy` as the only top-level verb. Rejected: it does not match the
  confirmed Railway-like product direction.
- Implement `up` as a second deployment operation. Rejected: it would duplicate
  lifecycle semantics and allow the two doors to drift.
- Remove `deploy` immediately. Rejected for 1.x because existing scripts need a
  migration window.
- Implement `up` by spawning a nested `appaloft deploy` process. Rejected:
  parsing, signals, JSON output, and exit codes must share one in-process path.

## Constraints

- No new command/query, operation-catalog entry, event, table, or domain type.
- The alias must not bypass authentication, onboarding, confirmation, admission,
  progress, verification, or error formatting.
- JSON stdout must remain machine-readable; human progress remains on the same
  channel used by `deploy`.

## Open Questions

None for this slice. Removal timing for the `deploy` compatibility alias is a
future major-version decision.
