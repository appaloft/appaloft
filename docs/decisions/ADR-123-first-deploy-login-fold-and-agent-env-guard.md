# ADR-123: First Deploy Login Fold And Agent-Env Guard

Status: Accepted

Date: 2026-08-21

## Context

Appaloft is a BYOS Railway alternative. Railway `up` signs the operator in
inside the same command. Appaloft already has `appaloft login` browser OAuth
and a local profile store, but Cloud `appaloft deploy` hard-failed with
`Run appaloft login`. Remote `code` / `workspace` doors already gate on login.

Coding agents (Claude Code, Cursor Agent, Aider, Codex) and non-TTY / CI
invocations must not create a project, deploy, or write skills through TUI or
inquire overlays.

Owner product lock 2026-08-21: fold login into first `deploy`; do not invent a
second credentials file; never expose Occupancy in CLI chrome; doors stay
`appaloft deploy .` and `appaloft setup agent`.

## Decision

1. When Cloud `appaloft deploy` needs a product session and none exists, start
   the existing `loginControlPlane` browser/auth-session exchange and write the
   current local profile store. Do not tell the operator to run a separate
   `appaloft login` command. Human TTY then continues the deploy.
2. When any of `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CURSOR_AGENT`,
   `AIDER_MODEL`, or `CODEX_CLI` is set, or the process is non-TTY, or `CI` is
   `1`/`true`: disable TUI and inquire overlays; print what the command would
   do; do not create a project, deploy, or write skills unless `--yes` is
   present.
3. `appaloft setup agent` uses the same `--yes` confirmation in those
   environments. Human TTY setup keeps current detected-host defaults.
4. Remote `code` / `workspace` login-required guidance is unchanged.
5. No new catalog operation. No `plan` / `destroy` / `nuke` door. Occupancy
   remains an internal name only.

## Consequences

- ADR-122 login fail-fast on `deploy` is replaced by this fold + guard.
- Spec 142 `FOLDER-ONBOARD-008` login miss on `deploy` now starts login.
- Public first-deployment and CLI login docs describe folded login and `--yes`.
- Expected public SemVer: minor CLI presentation change.
- Appaloft's own unit/e2e helpers strip inherited `CI` / coding-agent keys
  and confirm e2e `deploy` with `--yes`. User CI still requires `--yes`.

## Rejected Alternatives

- Asking the user to paste tokens into chat or export them as env vars.
- A second credentials file beside the existing profile store.
- A new `appaloft plan` command.
- Changing `code` / `workspace` fail-fast login guidance in this slice.
