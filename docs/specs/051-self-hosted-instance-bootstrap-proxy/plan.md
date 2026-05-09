# Self-Hosted Instance Bootstrap Proxy Plan

## Scope

- Installer and release asset behavior in `install.sh`.
- Deploy Action install-console wrapper defaults and installer argument mapping.
- Public self-hosting docs and console Instance guidance.
- Tests for script, wrapper, deployment config parsing, and Web type safety.

## Version Target

Pulled into the `0.9.x` self-hosted console line.

## Implementation Notes

- Default database remains PostgreSQL.
- Default direct host port becomes `3721`; Traefik public ingress remains `80/443`.
- Default proxy becomes `traefik`, with `--proxy none` available as an explicit escape hatch.
- `controlPlane.install.proxy` is a non-secret repository config setting.
