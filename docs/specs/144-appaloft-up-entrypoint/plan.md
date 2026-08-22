# Plan — Appaloft Up Entrypoint

## Governing Sources

- [discovery.md](./discovery.md)
- [spec.md](./spec.md)
- [Test Matrix](../../testing/appaloft-up-entrypoint-test-matrix.md)
- [Spec 142](../142-railway-like-folder-onboarding/spec.md)
- [Spec 143](../143-first-deploy-login-and-agent-env-guard/spec.md)

## Architecture

This is a CLI presentation change. Register `up` and `deploy` as two names for
one in-process deploy execution path. Argument normalization happens before that
shared path so login, folder onboarding, environment guards, mutation,
progress, terminal verification, JSON formatting, and error handling cannot
diverge by command name.

Do not implement `up` by spawning the CLI recursively or by copying the deploy
handler. Keep `up` canonical in help and documentation while retaining
`deploy` as the 1.x compatibility spelling.

## CQRS, Events, And Persistence

No new command, query, handler, operation-catalog entry, event, table, store, or
read model. The existing deployment workflow and its business operations remain
the sole mutation and lifecycle authority. The business operation map only
needs entrypoint wording synchronization; it must not gain a duplicate `up`
operation.

## Entrypoints And Documentation

- Add top-level `appaloft up` parsing and help without weakening unknown-command
  or unknown-option validation.
- Route `up` and `deploy` through the same typed options and execution function.
- Lead first-deployment public docs, examples, and AI-facing skill guidance with
  `up`; state that `deploy` remains supported in 1.x.
- Keep stable public help anchors and localized pages synchronized through the
  docs registry.

## Test Strategy

1. Add shell-level red tests proving `up` is currently unknown, then proving
   `up` and `deploy` reach the same execution seam with equivalent arguments.
2. Prove folder onboarding and folded login are reached through `up` instead of
   re-testing their internal policies separately.
3. Prove coding-agent / CI / non-TTY `up` without `--yes` has zero mutation and
   that `up --yes` reaches the guarded deploy seam.
4. Compare `up --json` and `deploy --json` at the CLI boundary, including
   parseable stdout and matching non-zero failures.
5. Prove accepted deployment is not reported as success before terminal state,
   terminal failure is non-zero, and a URL is printed only after verified
   success.
6. Add help-contract coverage for root help, `up --help`, and the 1.x alias
   statement; run docs-registry coverage for the owning public page/anchor.

## Risks And Mitigations

- **Alias drift:** separate parsers or handlers could diverge. Use one option
  schema and one execution path, plus parity tests.
- **Guard bypass:** routing `up` below the login/onboarding/agent guard would
  permit unintended mutation. Test at the shell boundary with mutation spies.
- **JSON corruption:** new status copy could leak to stdout. Parse stdout in
  tests and preserve existing stderr routing.
- **Premature success:** returning after deployment acceptance would violate the
  existing terminal-proof contract. Reuse the whole workflow and test both
  later success and later failure.
- **Documentation split:** examples could teach two workflows. Treat `up` as
  canonical and `deploy` only as compatibility wording.

## Verification

- Focused shell and CLI-adapter tests for every `UP-ENTRY-*` row.
- Existing folder-onboarding, deploy-door-guard, login, and deployment terminal
  tests.
- Docs-registry tests for CLI help and the first-deployment anchor.
- `bun run lint:ci`, `bun run typecheck`, and the affected public test suite.
- Source CLI smoke for `appaloftdev up --help`, guarded non-TTY behavior, JSON,
  and a real authorized deployment target when live smoke is in scope.
