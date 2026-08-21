# First Deploy Login Fold And Agent-Env Guard — Grill / Discovery

## Status

- Round: Grill complete from owner product lock 2026-08-21.
- Code changes allowed: this slice.

## Actor And Observable Outcome

A human runs `appaloft deploy` for the first time. If they are not signed in,
the same command starts browser OAuth and stores the existing local profile,
then continues. A coding-agent or CI/non-TTY run of `deploy` or
`setup agent` prints what it would do and does not mutate unless `--yes`.

## Evidence And Facts

- Remote `code` / `workspace` already gate on `workspace_remote_login_required`.
- Cloud `deploy` hard-failed with `product_auth_missing` / `Run appaloft login`
  in `apps/shell/src/run.ts` and `commands/deployment.ts`.
- `loginControlPlane` already writes the local profile store.
- No coding-agent env detection existed.

## Owner Decisions

1. Fold existing login into first Cloud deploy. Do not invent a second store.
2. Agent-env / non-TTY / CI require `--yes` before project create, deploy, or
   skill writes.
3. Doors stay `appaloft deploy .` and `appaloft setup agent`.
4. Occupancy stays internal-only.
