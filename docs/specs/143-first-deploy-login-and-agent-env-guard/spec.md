# First Deploy Login Fold And Agent-Env Guard

## Status

Spec confirmed from owner product lock 2026-08-21.

## Governing Sources

- [Discovery](./discovery.md)
- [ADR-123](../../decisions/ADR-123-first-deploy-login-fold-and-agent-env-guard.md)
- [ADR-122](../../decisions/ADR-122-railway-like-folder-onboarding.md)
- [Spec 142](../142-railway-like-folder-onboarding/spec.md)
- [Test Matrix](../../testing/first-deploy-login-and-agent-env-test-matrix.md)

## Policy

1. Unauthenticated Cloud `appaloft deploy` starts the existing browser login and
   writes the current local profile. It does not tell the user to run a separate
   `appaloft login` command.
2. Human TTY `appaloft deploy` continues after folded login.
3. When `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CURSOR_AGENT`, `AIDER_MODEL`,
   or `CODEX_CLI` is set, or the process is non-TTY, or `CI` is `1`/`true`:
   print a plan; do not create a project, deploy, or write skills unless `--yes`.
4. `appaloft setup agent` uses the same `--yes` confirmation in those
   environments.
5. Remote `code` / `workspace` login-required guidance is unchanged.
6. Occupancy never appears in CLI chrome, help, errors, or public docs body.

## Acceptance Criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| `DEPLOY-DOOR-LOGIN-001` | Unauthenticated Cloud deploy | Starts existing login; does not print `Run appaloft login` as the dead-end. |
| `DEPLOY-DOOR-LOGIN-002` | Agent-env / CI / non-TTY without `--yes` | Prints the plan; does not login-write, create a project, deploy, or write skills. |

## Public Surfaces

- `appaloft deploy [path] [--yes]`
- `appaloft setup agent [-y|--yes]`
- Public docs: first deployment CLI and CLI login/profile.

## Non-Goals

- New `plan` / `destroy` / `nuke` commands
- A second credentials file
- Changing `code` / `workspace` fail-fast login
- Token paste into chat or env-var export as the human path

## Current Implementation Notes And Migration Gaps

- CLI unit-test preload strips inherited `CI` and coding-agent keys so GitHub
  Actions / agent hosts do not trip the product guard. Tests that want the
  guard pass a dedicated env object. User CI without `--yes` still blocks.
- Shell e2e `runShellCli` confirms `deploy` with `--yes` because those helpers
  are non-TTY operators that intend to mutate.
